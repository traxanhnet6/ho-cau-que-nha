/* ============================================================
   HỒ CÂU QUÊ NHÀ — Máy game (Mốc 1)
   Toàn bộ luật chơi theo tài liệu 01 đã duyệt. Engine là "máy chủ
   quyền uy" thu nhỏ: chỉ nhận sự kiện qua giao diện HCEvents, chạy
   bằng đồng hồ ảo (update(dtMs)) nên kiểm thử node tăng tốc được,
   và không biết gì về TikTok hay bộ mô phỏng.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./config.js'), require('./store.js'));
  } else {
    root.HCEngine = factory(root.HCConfig, root.HCStore);
  }
})(typeof self !== 'undefined' ? self : this, function (CFG, Store) {
  'use strict';

  var CONFIG = CFG.CONFIG, SPECIES = CFG.SPECIES, MONSTERS = CFG.MONSTERS,
      RODS = CFG.RODS, RANKS = CFG.RANKS, COOLDOWNS = CFG.COMMAND_COOLDOWNS;

  var NOTICE_MAX_QUEUE = 8;
  var NOTICE_DUR = { monster: 5200, king: 4600, khung: 4600, upgrade: 3800, catch: 3200, system: 3400, personal: 4200 };
  var NOTICE_PRIO = { monster: 100, king: 90, upgrade: 80, khung: 70, catch: 50, system: 40, personal: 10 };
  var PERSONAL_GAP_MS = 4000; // tối đa 1 thông báo cá nhân mỗi 4 giây (tài liệu 01 mục 11)

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }
  function fmtKg(w) { return (Math.round(w * 100) / 100).toFixed(2); }
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60), ss = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function rankForPoints(points) {
    var name = RANKS[0].name;
    for (var i = 0; i < RANKS.length; i++) if (points >= RANKS[i].minPoints) name = RANKS[i].name;
    return name;
  }
  function rodForRoses(roses) {
    var idx = 0;
    for (var i = 0; i < RODS.length; i++) if (roses >= RODS[i].roses) idx = i;
    return idx;
  }

  /* Công thức điểm — tài liệu 01 mục 5:
     làm tròn(kg x điểm/kg) x hệ số cộng điểm của cần; cá khủng x2; giờ vàng x2. */
  function scoreCatch(species, weightKg, rod, opts) {
    opts = opts || {};
    var pts = Math.round(weightKg * species.ppk);
    pts = Math.round(pts * (1 + (rod ? rod.bonus : 0)));
    if (opts.khung) pts *= 2;
    if (opts.golden) pts *= 2;
    return pts;
  }

  function createEngine(opts) {
    opts = opts || {};
    var store = opts.store || new Store.MemoryStore();
    var rng = opts.rng || Math.random;

    var E = {
      store: store,
      rng: rng,
      now: 0,
      sessionId: opts.sessionId || ('buoi-' + Date.now().toString(36)),
      sessionStart: 0,
      players: {},          // userId -> runtime player
      seats: [],            // 24 ô: userId | null (0-11 bờ trái, 12-23 bờ phải)
      waitQueue: [],        // userId đang câu nhưng chưa có ghế hiển thị
      chains: {},           // chainId -> {userId, settled, closed, lastAt}
      notices: [],
      currentNotice: null,
      lastPersonalAt: -1e15,
      fx: [],
      roomFish: 0,
      roomLikes: 0,
      firstInLakeGiven: false,
      kingUserId: null,
      goldenManualFrom: -1,
      goldenManualUntil: -1,
      stats: { catches: 0, escapes: 0, khung: 0, monsterEvents: 0, monsterCaught: 0, rosesSettled: 0, commands: 0, giftsIgnored: 0 },
      monster: null
    };
    for (var i = 0; i < CONFIG.maxSeats; i++) E.seats.push(null);

    /* Thứ tự lấp ghế: xen kẽ hai bờ cho cân hình; ghế danh dự 23 lấp cuối. */
    var seatFillOrder = [];
    for (var s = 0; s < CONFIG.seatsPerBank; s++) { seatFillOrder.push(s); seatFillOrder.push(s + CONFIG.seatsPerBank); }
    var HONOR_SEAT = CONFIG.maxSeats - 1;

    function newMonsterState(fromNow) {
      return {
        nextAt: fromNow + CONFIG.monsterCycleMs,
        windowOpen: false,
        windowEnd: 0,
        catchAt: 0,
        speciesIdx: E.monster ? (E.monster.speciesIdx + 1) % MONSTERS.length : 0,
        tickets: {},          // userId -> tổng trọng số vé
        participants: {},     // userId -> true
        lastResult: E.monster ? E.monster.lastResult : null
      };
    }
    E.monster = newMonsterState(0);
    E.monster.nextAt = CONFIG.monsterCycleMs;

    /* ---------------- người chơi ---------------- */
    function ensurePlayer(ev) {
      var p = E.players[ev.userId];
      if (!p) {
        var rec = store.ensurePlayer(ev.userId, ev.displayName, Date.now());
        p = E.players[ev.userId] = {
          userId: ev.userId,
          displayName: ev.displayName || ev.userId,
          rec: rec,
          session: freshSession(),
          seat: -1,
          phase: 'idle',        // idle | casting | waiting | recast
          biteAt: 0, phaseEndAt: 0,
          lastInteractAt: E.now, lastGiftAt: -1e15,
          cmdAt: {}, lastText: '', repeatText: 0,
          baitUntil: 0,
          attendedMarked: false
        };
      }
      if (ev.displayName) { p.displayName = ev.displayName; p.rec.displayName = ev.displayName; }
      return p;
    }
    function freshSession() {
      return { points: 0, fish: 0, kg: 0, roses: 0, rodIdx: 0, monsterWins: 0, biggestKhungKg: 0, enteredAt: 0 };
    }

    function addPoints(p, pts) {
      p.session.points += pts;
      p.rec.points += pts;
      p.rec.balance += pts;
      store.savePlayer(p.rec);
      checkKing(p);
    }

    function checkKing(changed) {
      var best = null;
      for (var id in E.players) {
        var pl = E.players[id];
        if (pl.session.points > 0 && (!best || pl.session.points > best.session.points)) best = pl;
      }
      var newKingId = best ? best.userId : null;
      if (newKingId !== E.kingUserId) {
        var oldKing = E.kingUserId ? E.players[E.kingUserId] : null;
        E.kingUserId = newKingId;
        if (best) {
          pushFx({ kind: 'kingChange', userId: best.userId });
          pushNotice('king', '👑 ' + best.displayName + ' soán ngôi VUA CÂU CÁ với ' + best.session.points + ' điểm!');
          seatKing(best, oldKing);
        }
      }
    }

    /* Vua Câu Cá luôn ngồi ghế danh dự (ghế 23, bờ phải dưới). */
    function seatKing(king, oldKing) {
      if (king.seat === HONOR_SEAT) return;
      var occupantId = E.seats[HONOR_SEAT];
      var kingOldSeat = king.seat;
      if (king.seat >= 0) E.seats[king.seat] = null;
      removeFromQueue(king.userId);
      king.seat = HONOR_SEAT;
      E.seats[HONOR_SEAT] = king.userId;
      if (occupantId && occupantId !== king.userId) {
        var occ = E.players[occupantId];
        if (occ) {
          if (kingOldSeat >= 0) { occ.seat = kingOldSeat; E.seats[kingOldSeat] = occupantId; }
          else { occ.seat = -1; E.waitQueue.unshift(occupantId); }
        }
      }
    }

    function removeFromQueue(userId) {
      var i = E.waitQueue.indexOf(userId);
      if (i >= 0) E.waitQueue.splice(i, 1);
    }

    function assignSeat(p) {
      if (p.seat >= 0) return;
      for (var i = 0; i < seatFillOrder.length; i++) {
        var idx = seatFillOrder[i];
        if (p.userId === E.kingUserId && idx !== HONOR_SEAT) continue;
        if (E.seats[idx] === null) {
          E.seats[idx] = p.userId;
          p.seat = idx;
          removeFromQueue(p.userId);
          return;
        }
      }
      if (E.waitQueue.indexOf(p.userId) < 0) E.waitQueue.push(p.userId);
    }

    /* Khi có ghế trống: ưu tiên Vua, rồi người mới tặng quà (<2 phút),
       rồi cần thượng cổ, rồi theo thứ tự chờ (tài liệu 01 mục 1). */
    function promoteQueue() {
      for (var idx = 0; idx < E.seats.length; idx++) {
        if (E.seats[idx] !== null) continue;
        if (E.waitQueue.length === 0) return;
        var bestPos = 0, bestScore = -1;
        for (var q = 0; q < E.waitQueue.length; q++) {
          var cand = E.players[E.waitQueue[q]];
          if (!cand) continue;
          var score = 1000 - q; // thứ tự chờ là nền
          if (cand.userId === E.kingUserId) score += 100000;
          if (E.now - cand.lastGiftAt < 120000) score += 10000;
          if (cand.session.rodIdx === RODS.length - 1) score += 5000;
          if (score > bestScore) { bestScore = score; bestPos = q; }
        }
        var uid = E.waitQueue.splice(bestPos, 1)[0];
        var pl = E.players[uid];
        if (pl) { pl.seat = idx; E.seats[idx] = uid; }
      }
    }

    function freeSeat(p) {
      if (p.seat >= 0) { E.seats[p.seat] = null; p.seat = -1; }
      removeFromQueue(p.userId);
      promoteQueue();
    }

    /* ---------------- thông báo + hiệu ứng ---------------- */
    function pushNotice(kind, text) {
      var n = { kind: kind, text: text, prio: NOTICE_PRIO[kind] || 10, ts: E.now };
      E.notices.push(n);
      if (E.notices.length > NOTICE_MAX_QUEUE) {
        // Hàng đợi đầy: loại thông báo ưu tiên thấp nhất, cũ nhất (không loại cái vừa vào nếu nó cao nhất)
        var worst = 0;
        for (var i = 1; i < E.notices.length; i++) {
          if (E.notices[i].prio < E.notices[worst].prio ||
             (E.notices[i].prio === E.notices[worst].prio && E.notices[i].ts < E.notices[worst].ts)) worst = i;
        }
        E.notices.splice(worst, 1);
      }
    }
    function pushFx(fx) {
      fx.at = E.now;
      E.fx.push(fx);
      if (E.fx.length > 300) E.fx.splice(0, E.fx.length - 300);
    }
    function tickNotices() {
      if (E.currentNotice && E.now < E.currentNotice.until) return;
      E.currentNotice = null;
      if (E.notices.length === 0) return;
      E.notices.sort(function (a, b) { return (b.prio - a.prio) || (a.ts - b.ts); });
      var pick = -1;
      for (var i = 0; i < E.notices.length; i++) {
        if (E.notices[i].kind === 'personal' && E.now - E.lastPersonalAt < PERSONAL_GAP_MS) continue;
        pick = i; break;
      }
      if (pick < 0) return; // chỉ còn thông báo cá nhân đang trong 4 giây chờ
      var n = E.notices.splice(pick, 1)[0];
      if (n.kind === 'personal') E.lastPersonalAt = E.now;
      E.currentNotice = { kind: n.kind, text: n.text, until: E.now + (NOTICE_DUR[n.kind] || 3200) };
    }

    /* ---------------- vòng câu ---------------- */
    function scheduleBite(p) {
      var rod = RODS[p.session.rodIdx];
      var wait = rod.waitMin + rng() * (rod.waitMax - rod.waitMin);
      if (E.now < p.baitUntil) wait *= CONFIG.baitWaitFactor;
      p.biteAt = E.now + wait * 1000;
      p.phase = 'waiting';
    }
    function startFishing(p) {
      p.session.enteredAt = E.now;
      if (!p.attendedMarked) {
        p.attendedMarked = true;
        p.rec.sessionsAttended += 1;
        if (p.rec.sessionsAttended >= 7 && p.rec.titles.indexOf('Cần Thủ Kiên Trì') < 0) p.rec.titles.push('Cần Thủ Kiên Trì');
        store.savePlayer(p.rec);
      }
      if (!E.firstInLakeGiven) {
        E.firstInLakeGiven = true;
        addPoints(p, CONFIG.firstInLakeBonus);
        pushNotice('system', p.displayName + ' là cần thủ đầu tiên vào hồ, nhận ' + CONFIG.firstInLakeBonus + ' điểm danh dự!');
      } else {
        pushNotice('system', p.displayName + ' đã vào hồ');
      }
      assignSeat(p);
      p.phase = 'casting';
      p.phaseEndAt = E.now + CONFIG.castAnimMs;
      pushFx({ kind: 'cast', userId: p.userId, seat: p.seat });
    }
    function stopFishing(p) {
      p.phase = 'idle';
      freeSeat(p);
      pushFx({ kind: 'leave', userId: p.userId });
    }

    function pickSpecies(rod, baitActive) {
      var rareMult = rod.rareMult * (baitActive ? CONFIG.baitRareFactor : 1);
      var total = 0, i, w = [];
      for (i = 0; i < SPECIES.length; i++) {
        var m = SPECIES[i].tier === 'common' ? 1 : rareMult;
        w.push(SPECIES[i].rate * m);
        total += w[i];
      }
      var roll = rng() * total;
      for (i = 0; i < SPECIES.length; i++) { roll -= w[i]; if (roll <= 0) return SPECIES[i]; }
      return SPECIES[SPECIES.length - 1];
    }

    /* Cân nặng: phân phối lệch trái (đa số cá ở nửa nhẹ);
       với xác suất nền x hệ số cá khủng, rơi vào vùng trên 85% dải = CÁ KHỦNG. */
    function rollWeight(sp, bigMult) {
      var q;
      if (rng() < CONFIG.bigFishBaseChance * bigMult) q = CONFIG.bigFishQuantile + rng() * (1 - CONFIG.bigFishQuantile);
      else q = Math.pow(rng(), 1.6);
      var w = sp.minKg + (sp.maxKg - sp.minKg) * q;
      return { weight: Math.round(w * 100) / 100, quantile: q };
    }

    function resolveHook(p) {
      var rod = RODS[p.session.rodIdx];
      // Vé thủy quái: mỗi lần giật trong cửa sổ là một vé trọng số (tài liệu 01 mục 6)
      if (E.monster.windowOpen) {
        var tw = rod.weight * (0.8 + rng() * 0.4);
        E.monster.tickets[p.userId] = (E.monster.tickets[p.userId] || 0) + tw;
        E.monster.participants[p.userId] = true;
      }
      if (rng() < rod.escape) {
        E.stats.escapes++;
        p.phase = 'recast'; p.phaseEndAt = E.now + CONFIG.recastMs;
        pushFx({ kind: 'escape', userId: p.userId, seat: p.seat });
        return;
      }
      var baitActive = E.now < p.baitUntil;
      var sp = pickSpecies(rod, baitActive);
      var roll = rollWeight(sp, rod.bigMult);
      var khung = roll.quantile >= CONFIG.bigFishQuantile;
      var pts = scoreCatch(sp, roll.weight, rod, { khung: khung, golden: goldenActive() });
      p.session.fish++; p.session.kg += roll.weight;
      if (khung && roll.weight > p.session.biggestKhungKg) p.session.biggestKhungKg = roll.weight;
      p.rec.fish++; p.rec.kg += roll.weight;
      E.roomFish++; E.stats.catches++;
      if (khung) E.stats.khung++;
      store.recordCatch({ userId: p.userId, sessionId: E.sessionId, species: sp.id, kg: roll.weight, points: pts, rodIdx: p.session.rodIdx, khung: khung, ts: Date.now() });
      addPoints(p, pts);
      pushFx({ kind: 'catch', userId: p.userId, seat: p.seat, species: sp, weight: roll.weight, khung: khung, points: pts });
      if (khung) pushNotice('khung', '🐟 CÁ KHỦNG! ' + p.displayName + ' câu được ' + sp.name + ' · ' + fmtKg(roll.weight) + ' kg (+' + pts + ' điểm)');
      else pushNotice('catch', p.displayName + ' câu được ' + sp.name + ' · ' + fmtKg(roll.weight) + ' kg');
      p.phase = 'recast'; p.phaseEndAt = E.now + CONFIG.recastMs;
    }

    /* ---------------- thủy quái ---------------- */
    function openMonsterWindow() {
      var M = E.monster;
      M.windowOpen = true;
      M.windowEnd = E.now + CONFIG.monsterWindowMs;
      M.catchAt = E.now + CONFIG.monsterWindowMs * (0.25 + rng() * 0.6);
      M.tickets = {}; M.participants = {};
      E.stats.monsterEvents++;
      var sp = MONSTERS[M.speciesIdx];
      pushNotice('monster', '🌊 THỦY QUÁI XUẤT HIỆN! ' + sp.name + ' đang ở trong hồ — mọi cần thủ cùng săn trong 90 giây!');
      pushFx({ kind: 'monsterAppear', species: sp });
    }
    function closeMonsterWindow() {
      var M = E.monster;
      M.windowOpen = false;
      var next = newMonsterState(E.now);
      next.lastResult = M.lastResult;
      next.speciesIdx = (M.speciesIdx + 1) % MONSTERS.length;
      next.nextAt = E.now + CONFIG.monsterCycleMs;
      E.monster = next;
    }
    function resolveMonster() {
      var M = E.monster;
      var sp = MONSTERS[M.speciesIdx];
      var total = 0, id;
      for (id in M.tickets) total += M.tickets[id];
      if (total <= 0) { closeMonsterWindow(); return; }
      var roll = rng() * total, winnerId = null;
      for (id in M.tickets) { roll -= M.tickets[id]; if (roll <= 0) { winnerId = id; break; } }
      if (!winnerId) winnerId = id;
      var winner = E.players[winnerId];
      var wRoll = rollWeight(sp, 1);
      var pts = Math.round(wRoll.weight * sp.ppk);
      var support = Math.round(pts * CONFIG.monsterSupportRate);
      for (id in M.participants) {
        if (id === winnerId) continue;
        var pl = E.players[id];
        if (pl) addPoints(pl, support);
      }
      if (winner) {
        winner.session.monsterWins++;
        winner.rec.monsterWins++;
        winner.rec.fish++; winner.session.fish++;
        winner.rec.kg += wRoll.weight; winner.session.kg += wRoll.weight;
        if (winner.session.monsterWins >= 3 && winner.rec.titles.indexOf('Sát Thủy Quái') < 0) winner.rec.titles.push('Sát Thủy Quái');
        store.recordCatch({ userId: winnerId, sessionId: E.sessionId, species: sp.id, kg: wRoll.weight, points: pts, rodIdx: winner.session.rodIdx, monster: true, ts: Date.now() });
        addPoints(winner, pts);
      }
      E.roomFish++; E.stats.monsterCaught++;
      M.lastResult = { winnerName: winner ? winner.displayName : winnerId, species: sp, weight: wRoll.weight, points: pts, until: E.now + 8000 };
      pushNotice('monster', '🏆 ' + (winner ? winner.displayName : winnerId) + ' ĐÃ KÉO ĐƯỢC ' + sp.name.toUpperCase() + ' · ' + fmtKg(wRoll.weight) + ' kg (+' + pts + ' điểm)! Cả hồ nhận điểm hỗ trợ +' + support);
      pushFx({ kind: 'monsterCaught', userId: winnerId, species: sp, weight: wRoll.weight, points: pts });
      closeMonsterWindow();
    }
    function tickMonster() {
      var M = E.monster;
      if (!M.windowOpen && E.now >= M.nextAt) openMonsterWindow();
      if (M.windowOpen) {
        if (E.now >= M.catchAt) {
          var total = 0; for (var id in M.tickets) total += M.tickets[id];
          if (total > 0) resolveMonster();
          else if (E.now >= M.windowEnd) { pushNotice('system', 'Thủy quái lướt qua hồ, không ai kịp kéo lên...'); closeMonsterWindow(); }
        } else if (E.now >= M.windowEnd) {
          var t2 = 0; for (var id2 in M.tickets) t2 += M.tickets[id2];
          if (t2 > 0) resolveMonster();
          else { pushNotice('system', 'Thủy quái lướt qua hồ, không ai kịp kéo lên...'); closeMonsterWindow(); }
        }
      }
    }
    E.triggerMonsterNow = function () {
      if (!E.monster.windowOpen) { E.monster.nextAt = E.now; }
    };

    /* ---------------- giờ vàng ---------------- */
    function goldenActive() {
      var t = E.now - E.sessionStart;
      if (t >= CONFIG.goldenHourStartMs && t < CONFIG.goldenHourEndMs) return true;
      return E.now >= E.goldenManualFrom && E.now < E.goldenManualUntil;
    }
    E.goldenActive = goldenActive;
    E.triggerGoldenHourNow = function () {
      E.goldenManualFrom = E.now;
      E.goldenManualUntil = E.now + CONFIG.goldenHourManualMs;
      pushNotice('system', '⭐ GIỜ VÀNG bắt đầu: nhân đôi điểm mọi con cá trong 10 phút!');
    };

    /* ---------------- lệnh chat ---------------- */
    var COMMANDS = [
      ['cau ca', 'cauca'], ['bao ca', 'baoca'], ['thuy quai', 'thuyquai'],
      ['nghi', 'nghi'], ['can', 'can'], ['top', 'top'], ['diem', 'diem'], ['moi', 'moi']
    ];
    function parseCommand(text) {
      var norm = stripAccents(String(text || '').toLowerCase()).trim().replace(/\s+/g, ' ');
      for (var i = 0; i < COMMANDS.length; i++) {
        var c = COMMANDS[i][0];
        if (norm === c || norm.indexOf(c + ' ') === 0) return COMMANDS[i][1];
      }
      return null;
    }

    function sessionRankOf(p) {
      var arr = [];
      for (var id in E.players) if (E.players[id].session.points > 0 || E.players[id].session.fish > 0) arr.push(E.players[id]);
      arr.sort(function (a, b) { return b.session.points - a.session.points; });
      for (var i = 0; i < arr.length; i++) if (arr[i].userId === p.userId) return i + 1;
      return arr.length + 1;
    }
    function sessionTop(n) {
      var arr = [];
      for (var id in E.players) if (E.players[id].session.points > 0 || E.players[id].session.fish > 0) arr.push(E.players[id]);
      arr.sort(function (a, b) { return (b.session.points - a.session.points) || (a.session.enteredAt - b.session.enteredAt); });
      return arr.slice(0, n).map(function (pl) { return { userId: pl.userId, name: pl.displayName, points: pl.session.points, fish: pl.session.fish }; });
    }

    function handleCommand(p, cmd) {
      E.stats.commands++;
      var rod = RODS[p.session.rodIdx];
      if (cmd === 'cauca') {
        if (p.phase !== 'idle') return; // đang câu rồi: bỏ qua lặng lẽ (mục 11)
        startFishing(p);
      } else if (cmd === 'nghi') {
        if (p.phase !== 'idle') { stopFishing(p); pushNotice('personal', p.displayName + ' đã nghỉ câu'); }
      } else if (cmd === 'baoca') {
        pushNotice('personal', p.displayName + ': ' + p.session.fish + ' cá · ' + fmtKg(p.session.kg) + ' kg · ' + p.session.points + ' điểm buổi · hạng ' + sessionRankOf(p) + ' · ' + rod.name + ' · cấp ' + rankForPoints(p.rec.points));
      } else if (cmd === 'can') {
        var next = RODS[p.session.rodIdx + 1];
        var msg = p.displayName + ' đang dùng ' + rod.name + ' (đã tặng ' + p.session.roses + ' hoa hồng buổi này)';
        if (next) msg += ' — còn thiếu ' + (next.roses - p.session.roses) + ' hoa hồng nữa lên ' + next.name;
        else msg += ' — đã là cần cao nhất!';
        pushNotice('personal', msg);
      } else if (cmd === 'top') {
        var top = sessionTop(10);
        if (top.length === 0) pushNotice('personal', 'Chưa có ai ghi điểm trong buổi này');
        else pushNotice('personal', 'TOP 10 buổi: ' + top.map(function (t, i) { return (i + 1) + '. ' + t.name + ' ' + t.points + 'đ'; }).join(' · '));
      } else if (cmd === 'diem') {
        var rankName = rankForPoints(p.rec.points), nextRank = null;
        for (var i = 0; i < RANKS.length; i++) if (p.rec.points < RANKS[i].minPoints) { nextRank = RANKS[i]; break; }
        var m2 = p.displayName + ': ' + p.rec.points + ' điểm tích lũy · cấp ' + rankName + ' · ' + p.rec.fish + ' cá · ' + fmtKg(p.rec.kg) + ' kg';
        if (nextRank) m2 += ' · còn ' + (nextRank.minPoints - p.rec.points) + ' điểm lên ' + nextRank.name;
        pushNotice('personal', m2);
      } else if (cmd === 'moi') {
        if (E.now < p.baitUntil) pushNotice('personal', p.displayName + ': Mồi Ngon còn hiệu lực ' + fmtClock(p.baitUntil - E.now));
        else if (p.rec.balance >= CONFIG.baitCost) {
          p.rec.balance -= CONFIG.baitCost;
          store.savePlayer(p.rec);
          p.baitUntil = E.now + CONFIG.baitDurationMs;
          pushNotice('personal', p.displayName + ' đã dùng Mồi Ngon: cá cắn nhanh hơn 30%, cá hiếm x1,5 trong 10 phút');
        } else pushNotice('personal', p.displayName + ': chưa đủ điểm mua Mồi Ngon (cần ' + CONFIG.baitCost + ', đang có ' + p.rec.balance + ')');
      } else if (cmd === 'thuyquai') {
        if (E.monster.windowOpen) pushNotice('personal', 'Thủy quái ĐANG ở trong hồ! Còn ' + fmtClock(E.monster.windowEnd - E.now) + ' để săn');
        else pushNotice('personal', 'Thủy quái xuất hiện sau ' + fmtClock(E.monster.nextAt - E.now));
      }
    }

    function handleChat(ev) {
      var p = ensurePlayer(ev);
      p.lastInteractAt = E.now;
      var text = String(ev.text || '');
      // Lọc bình luận rác: chứa liên kết -> không tính là lệnh (mục 11)
      if (/https?:\/\/|www\./i.test(text)) return;
      // Lặp giống hệt quá 3 lần liên tiếp -> bỏ qua (mục 11)
      if (text === p.lastText) p.repeatText++; else { p.lastText = text; p.repeatText = 0; }
      if (p.repeatText >= 3) return;
      var cmd = parseCommand(text);
      if (!cmd) return; // chat thường, game bỏ qua
      var cd = COOLDOWNS[cmd] || 5000;
      /* [SỬA LỖI — Mốc 1] Không tra cứu bằng (cmdAt[cmd] || -1e15): mốc 0 là
         falsy nên lệnh phát ở nhịp đầu (now=0) bị coi là "chưa từng dùng"
         và xuyên thủng hồi chiêu. Phải kiểm tra undefined tường minh. */
      var prevCmdAt = p.cmdAt[cmd];
      if (prevCmdAt !== undefined && E.now - prevCmdAt < cd) return; // hồi chiêu lệnh
      p.cmdAt[cmd] = E.now;
      handleCommand(p, cmd);
    }

    /* ---------------- quà tặng + chống trùng combo ---------------- */
    function applyRoses(p, delta, ev) {
      var oldIdx = p.session.rodIdx;
      p.session.roses += delta;
      E.stats.rosesSettled += delta;
      store.recordGift({ chainId: ev.chainId, userId: p.userId, giftId: ev.giftId || 'rose', count: delta, sessionId: E.sessionId, ts: Date.now() });
      var newIdx = rodForRoses(p.session.roses);
      if (newIdx > oldIdx) {
        p.session.rodIdx = newIdx;
        pushNotice('upgrade', '🌹 ' + p.displayName + ' đã nâng ' + RODS[newIdx].name + '!');
        pushFx({ kind: 'upgrade', userId: p.userId, seat: p.seat, rodIdx: newIdx });
        if (p.phase !== 'idle' && p.seat < 0) promoteQueue();
      }
    }

    function handleGift(ev) {
      var p = ensurePlayer(ev);
      p.lastInteractAt = E.now;
      p.lastGiftAt = E.now;
      if ((ev.giftId || 'rose') !== 'rose') return; // Mốc 1-3: chỉ tính Hoa hồng (điểm chốt 3)
      var chain = E.chains[ev.chainId];
      if (!chain) chain = E.chains[ev.chainId] = { userId: ev.userId, settled: 0, closed: false, lastAt: E.now };
      if (chain.closed) { E.stats.giftsIgnored++; return; } // chống trùng: chuỗi đã chốt, sự kiện phát lại bị bỏ qua
      chain.lastAt = E.now;
      var target = Math.max(0, Math.floor(ev.repeatCount || 0));
      var delta = target - chain.settled;
      if (delta > 0) {
        chain.settled = target;
        applyRoses(p, delta, ev);
      }
      if (ev.state === 'finished') chain.closed = true;
    }

    E.handleEvent = function (ev) {
      if (!ev || !ev.userId) return;
      if (ev.type === 'chat') handleChat(ev);
      else if (ev.type === 'gift') handleGift(ev);
      else if (ev.type === 'like') { E.roomLikes += (ev.count || 1); var p = ensurePlayer(ev); p.lastInteractAt = E.now; }
      else if (ev.type === 'join') { var p2 = ensurePlayer(ev); p2.lastInteractAt = E.now; }
    };
    E.attach = function (bus) { return bus.subscribe(function (ev) { E.handleEvent(ev); }); };

    /* ---------------- vòng đời ---------------- */
    E.update = function (dtMs) {
      E.now += dtMs;
      for (var id in E.players) {
        var p = E.players[id];
        if (p.phase === 'casting' && E.now >= p.phaseEndAt) scheduleBite(p);
        else if (p.phase === 'waiting' && E.now >= p.biteAt) resolveHook(p);
        else if (p.phase === 'recast' && E.now >= p.phaseEndAt) { p.phase = 'casting'; p.phaseEndAt = E.now + CONFIG.castAnimMs; pushFx({ kind: 'cast', userId: p.userId, seat: p.seat }); }
        if (p.phase !== 'idle' && E.now - p.lastInteractAt > CONFIG.idleLeaveMs) stopFishing(p);
      }
      tickMonster();
      tickNotices();
      // dọn sổ chuỗi quà đã đóng quá lâu
      var keys = Object.keys(E.chains);
      if (keys.length > 1000) {
        for (var k = 0; k < keys.length; k++) if (E.chains[keys[k]].closed && E.now - E.chains[keys[k]].lastAt > 600000) delete E.chains[keys[k]];
      }
    };

    E.endSession = function () {
      var top = sessionTop(1);
      store.recordSession({ sessionId: E.sessionId, kingUserId: E.kingUserId, kingName: top.length ? top[0].name : null, totalFish: E.roomFish, endedAt: Date.now() });
      E.sessionId = 'buoi-' + Date.now().toString(36) + '-' + Math.floor(rng() * 1e6);
      E.sessionStart = E.now;
      E.roomFish = 0; E.roomLikes = 0;
      E.firstInLakeGiven = false;
      E.kingUserId = null;
      E.goldenManualFrom = -1; E.goldenManualUntil = -1;
      E.monster = newMonsterState(E.now);
      for (var id in E.players) {
        var p = E.players[id];
        p.session = freshSession();
        p.phase = 'idle'; p.baitUntil = 0; p.attendedMarked = false;
        p.seat = -1;
      }
      for (var i = 0; i < E.seats.length; i++) E.seats[i] = null;
      E.waitQueue = [];
      E.notices = []; E.currentNotice = null;
      E.stats = { catches: 0, escapes: 0, khung: 0, monsterEvents: 0, monsterCaught: 0, rosesSettled: 0, commands: 0, giftsIgnored: 0 };
    };

    /* ---------------- ảnh chụp trạng thái cho lớp hiển thị ---------------- */
    E.getSnapshot = function () {
      var anglers = [];
      for (var i = 0; i < E.seats.length; i++) {
        var uid = E.seats[i];
        if (!uid) continue;
        var p = E.players[uid];
        if (!p) continue;
        anglers.push({
          userId: uid, name: p.displayName, seat: i,
          bank: i < CONFIG.seatsPerBank ? 'L' : 'R', slot: i % CONFIG.seatsPerBank,
          rodIdx: p.session.rodIdx, rodName: RODS[p.session.rodIdx].name,
          phase: p.phase, isKing: uid === E.kingUserId,
          bait: E.now < p.baitUntil, sessionPoints: p.session.points,
          roses: p.session.roses
        });
      }
      var queueNames = E.waitQueue.map(function (qid) { var qp = E.players[qid]; return qp ? qp.displayName : qid; });
      var M = E.monster;
      return {
        now: E.now,
        sessionElapsedMs: E.now - E.sessionStart,
        roomFish: E.roomFish,
        roomLikes: E.roomLikes,
        anglers: anglers,
        fishingCount: Object.keys(E.players).filter(function (k) { return E.players[k].phase !== 'idle'; }).length,
        queueNames: queueNames,
        top5: sessionTop(5),
        kingUserId: E.kingUserId,
        kingName: E.kingUserId && E.players[E.kingUserId] ? E.players[E.kingUserId].displayName : null,
        monster: {
          windowOpen: M.windowOpen,
          msToNext: M.windowOpen ? 0 : Math.max(0, M.nextAt - E.now),
          msWindowLeft: M.windowOpen ? Math.max(0, M.windowEnd - E.now) : 0,
          species: MONSTERS[M.speciesIdx],
          lastResult: M.lastResult
        },
        golden: { active: goldenActive() },
        notice: E.currentNotice ? { kind: E.currentNotice.kind, text: E.currentNotice.text } : null,
        stats: E.stats
      };
    };
    E.drainFx = function () { var f = E.fx; E.fx = []; return f; };
    E.getPlayer = function (userId) { return E.players[userId] || null; };
    E.sessionTop = sessionTop;
    E.sessionRankOf = sessionRankOf;

    return E;
  }

  return {
    createEngine: createEngine,
    scoreCatch: scoreCatch,
    rodForRoses: rodForRoses,
    rankForPoints: rankForPoints,
    fmtKg: fmtKg,
    fmtClock: fmtClock,
    mulberry32: mulberry32,
    stripAccents: stripAccents
  };
});
