/* ============================================================
   HỒ CÂU QUÊ NHÀ — Bộ mô phỏng chat (Mốc 1)
   Sinh người xem ảo: vào phòng, chat "câu cá", chat phụ giữ nhịp,
   tặng Hoa hồng (kể cả chuỗi combo nhiều sự kiện nối tiếp).
   MỌI sự kiện đều phát qua bus HCEvents đúng khuôn của js/events.js
   — máy game không phân biệt được mô phỏng với cầu nối TikTok thật.
   Chạy được cả trên trình duyệt (vòng lặp chính gọi update) và
   trong node (kiểm chứng buổi mô phỏng tăng tốc).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./events.js'));
  else root.HCSim = factory(root.HCEvents);
})(typeof self !== 'undefined' ? self : this, function (Events) {
  'use strict';

  var NAMES = [
    'Nam & Oanh', 'Minh Hiếu', 'Ngọc Miu', 'Duy Anh', 'Thanh Tùng',
    'Bé Rồng', 'Phùng Đô', 'Hàn Fishing', 'Nhật Lệ', 'Trọng LA',
    'Vương Vui Vẻ', 'Chú Bé Đần', 'Dưa Lưới Tây', 'Hoàng Thanh', 'Tuấn Bắc Ninh',
    'Lê Thảo', 'Phạm Hùng', 'Vũ Linh', 'Đặng Sơn', 'Bùi Tiến',
    'Đỗ Hải', 'Ngô Quyền', 'Trịnh Mai', 'Lý Thường', 'Tạ Phong',
    'Chu Văn', 'Đinh Bộ', 'Lương Sơn', 'Hồ Quỳnh', 'Mai Phương',
    'Thu Hằng', 'Khánh Ly', 'Đức Anh', 'Tuấn Kiệt', 'Hải Yến',
    'Phương Thảo', 'Văn Đức', 'Tiến Đạt', 'Xuân Trường', 'Cẩm Tú'
  ];

  var FILLER = [
    'hồ hôm nay đẹp quá', 'cá cắn chưa mọi người', 'chào cả nhà',
    'hóng thủy quái quá', 'ai câu được cá khủng chưa', 'cố lên nào',
    'phòng này vui ghê', 'chờ cá cắn thôi', 'hôm nay quyết lên top',
    'cần này câu sướng tay thật', 'sắp tới giờ thủy quái rồi đó'
  ];

  function createSimulator(bus, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;

    var S = {
      bus: bus,
      rng: rng,
      viewers: [],        // {userId, name, fishing, nextActAt, nextGiftAt, leaveAt}
      chains: [],         // chuỗi combo đang chạy {chainId, v, total, sent, nextAt}
      namePool: NAMES.slice(),
      seq: 0,
      nextSpawnAt: 0,
      settings: {
        enabled: opts.enabled !== false,
        density: opts.density || 14,        // số người xem ảo mục tiêu trong phòng
        giftRate: opts.giftRate != null ? opts.giftRate : 0.5, // 0..1 — nhịp tặng quà
        chatter: opts.chatter != null ? opts.chatter : 0.6     // 0..1 — nhịp chat phụ
      },
      stats: { joined: 0, chatsSent: 0, giftsSent: 0, rosesSent: 0, combos: 0 }
    };

    function pickName() {
      if (S.namePool.length === 0) S.namePool = NAMES.slice();
      var i = Math.floor(rng() * S.namePool.length);
      return S.namePool.splice(i, 1)[0];
    }

    function emitChat(v, text) {
      S.stats.chatsSent++;
      bus.emit({ type: 'chat', userId: v.userId, displayName: v.name, text: text });
    }
    function emitGiftStep(chain, finished) {
      bus.emit({
        type: 'gift', userId: chain.v.userId, displayName: chain.v.name,
        giftId: 'rose', giftName: 'Hoa hồng',
        chainId: chain.chainId, repeatCount: chain.sent,
        state: finished ? 'finished' : 'ongoing'
      });
    }

    function spawnViewer(now) {
      S.seq++;
      var v = {
        userId: 'sim-' + S.seq,
        name: pickName(),
        fishing: false,
        nextActAt: now + 800 + rng() * 2500,   // vào phòng một lát rồi mới chat "câu cá"
        nextGiftAt: now + 20000 + rng() * 90000,
        leaveAt: now + (240000 + rng() * 480000) // ở lại 4–12 phút rồi có thể rời
      };
      S.viewers.push(v);
      S.stats.joined++;
      bus.emit({ type: 'join', userId: v.userId, displayName: v.name });
      return v;
    }
    S.addViewer = function (now) { return spawnViewer(now || 0); };

    function giftAmount() {
      var r = rng();
      if (r < 0.55) return 1;
      if (r < 0.75) return 2 + Math.floor(rng() * 7);   // 2–8
      if (r < 0.90) return 10;
      if (r < 0.95) return 11 + Math.floor(rng() * 38); // 11–48
      return 50;
    }

    function startGift(v, now) {
      var total = giftAmount();
      S.stats.giftsSent++;
      S.stats.rosesSent += total;
      var chain = { chainId: Events.nextChainId('sim'), v: v, total: total, sent: 0, nextAt: now };
      if (total > 1 && rng() < 0.55) {
        // Chuỗi combo: nhiều sự kiện ongoing nối tiếp, chốt ở sự kiện finished cuối
        S.stats.combos++;
        S.chains.push(chain);
      } else {
        chain.sent = total;
        emitGiftStep(chain, true);
      }
      // Người vừa tặng quà ít khi rời phòng ngay
      v.leaveAt = Math.max(v.leaveAt, now + 60000);
    }

    function stepChain(chain, now) {
      var step = 1 + Math.floor(rng() * 3);
      chain.sent = Math.min(chain.total, chain.sent + step);
      var done = chain.sent >= chain.total;
      emitGiftStep(chain, done);
      chain.nextAt = now + 350 + rng() * 500;
      return done;
    }

    S.update = function (now, dtMs) {
      var st = S.settings;
      if (!st.enabled) return;

      // Bổ sung người xem tới mật độ mục tiêu
      if (S.viewers.length < st.density && now >= S.nextSpawnAt) {
        spawnViewer(now);
        S.nextSpawnAt = now + 1200 + rng() * 3500;
      }

      // Chuỗi combo đang chạy
      for (var c = S.chains.length - 1; c >= 0; c--) {
        if (now >= S.chains[c].nextAt) {
          if (stepChain(S.chains[c], now)) S.chains.splice(c, 1);
        }
      }

      for (var i = S.viewers.length - 1; i >= 0; i--) {
        var v = S.viewers[i];

        // Rời phòng: nghỉ câu rồi biến mất
        if (now >= v.leaveAt) {
          if (v.fishing) emitChat(v, 'nghỉ');
          S.namePool.push(v.name);
          S.viewers.splice(i, 1);
          continue;
        }

        // Tặng quà theo nhịp
        if (now >= v.nextGiftAt) {
          if (rng() < st.giftRate + 0.25) startGift(v, now);
          var base = 45000 / Math.max(0.05, st.giftRate + 0.15);
          v.nextGiftAt = now + base * (0.5 + rng());
        }

        // Hành động chat
        if (now >= v.nextActAt) {
          if (!v.fishing) {
            emitChat(v, 'câu cá');
            v.fishing = true;
            v.nextActAt = now + 20000 + rng() * 40000;
          } else {
            var r = rng();
            if (r < 0.30 * st.chatter + 0.04) emitChat(v, FILLER[Math.floor(rng() * FILLER.length)]);
            else if (r < 0.42 * st.chatter + 0.06) emitChat(v, 'báo cá');
            else if (r < 0.48 * st.chatter + 0.07) emitChat(v, 'top');
            else if (r < 0.52 * st.chatter + 0.08) emitChat(v, 'cần');
            v.nextActAt = now + 18000 + rng() * 45000;
          }
        }
      }
    };

    return S;
  }

  return { createSimulator: createSimulator, NAMES: NAMES };
});
