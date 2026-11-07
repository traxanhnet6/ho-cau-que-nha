/* ============================================================
   HỒ CÂU QUÊ NHÀ — Nối trang với máy game + bộ mô phỏng (Mốc 1)
   Luồng: bus HCEvents -> engine (quyền uy) -> snapshot -> render.
   Tham số địa chỉ:
     ?clean=1     ẩn bảng điều khiển (khung hình thuần để phát live/chụp hình)
     ?demo=1      bật bộ mô phỏng ngay khi mở trang
     ?speed=N     tăng tốc thời gian ảo của engine (mặc định 1)
     ?ff=<ms>     tua nhanh xác định tới mốc thời gian ảo cho trước (kiểm chứng/chụp hình)
     ?showcase=khung|monster  đóng băng khung hình khi bắt được khoảnh khắc
                  (chỉ phục vụ chụp hình kiểm chứng — khai trong báo cáo mốc 1)
   ============================================================ */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var speed = Math.max(1, Math.min(120, parseFloat(params.get('speed') || '1') || 1));
  var showcase = params.get('showcase') || '';

  var bus = HCEvents.createBus();
  var store = HCStore.createBestStore(HCConfig.CONFIG.storageKey);
  var engine = HCEngine.createEngine({ store: store });
  engine.attach(bus);

  var sim = HCSim.createSimulator(bus, { enabled: params.get('demo') === '1' });
  if (params.get('demo') === '1') {
    sim.settings.density = parseInt(params.get('density') || '16', 10) || 16;
  }
  if (params.get('monster') === '1') {
    // Kích thủy quái sớm để chụp hình/kiểm chứng: sau 6 giây ảo đầu tiên
    var monsterArmed = true;
  }

  var canvas = document.getElementById('game');
  var renderer = HCRender.createRenderer(canvas, HCConfig);

  /* ---------- nhật ký sự kiện cho bảng điều khiển ---------- */
  var logEl = document.getElementById('eventlog');
  var logLines = [];
  function logEvent(ev) {
    if (!logEl) return;
    var line = null;
    if (ev.type === 'chat') line = '💬 ' + ev.displayName + ': ' + ev.text;
    else if (ev.type === 'gift') line = '🌹 ' + ev.displayName + ' tặng Hoa hồng x' + ev.repeatCount + (ev.state === 'finished' ? ' (chốt chuỗi)' : ' (combo…)');
    else if (ev.type === 'join') line = '👋 ' + ev.displayName + ' vào phòng';
    if (!line) return;
    logLines.push(line);
    if (logLines.length > 40) logLines.shift();
    logEl.textContent = logLines.slice(-14).join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }
  bus.subscribe(logEvent);

  /* ---------- vòng lặp chính ---------- */
  var lastWall = performance.now();
  var frozen = false;
  var startWall = lastWall;

  var showcaseFx = null, showcaseStamp = 0;

  function frame(wallNow) {
    var realDt = Math.min(250, wallNow - lastWall);
    lastWall = wallNow;
    // Khung đóng băng showcase: phát lặp hiệu ứng khoảnh khắc để chụp hình
    if (frozen && showcaseFx && wallNow - showcaseStamp > 1400) {
      renderer.addFx(showcaseFx, wallNow);
      showcaseStamp = wallNow;
    }
    if (!frozen) {
      var dt = realDt * speed;
      // Bộ mô phỏng chạy theo đồng hồ ảo của engine
      sim.update(engine.now, dt);
      engine.update(dt);
      if (monsterArmed && engine.now > 6000) { monsterArmed = false; engine.triggerMonsterNow(); }
      var fxList = engine.drainFx();
      for (var i = 0; i < fxList.length; i++) {
        renderer.addFx(fxList[i], wallNow);
        /* Đóng băng NGAY trong khung hình bắt được khoảnh khắc: thông báo của
           chính khung này đã được engine nâng lên dải thông báo trong cùng nhịp
           cập nhật, đóng băng muộn hơn sẽ để nó trôi qua mất. */
        if (showcase === 'khung' && fxList[i].kind === 'catch' && fxList[i].khung) frozen = true;
        if (showcase === 'monster' && fxList[i].kind === 'monsterCaught') frozen = true;
      }
      if (showcase === 'monsteropen' && engine.getSnapshot().monster.windowOpen) {
        // Gắn một hiệu ứng cá nhảy tổng hợp để vòng lặp phát lại ở chế độ đóng
        // băng giữ mặt hồ sống động trong khung hình chụp; trạng thái hồ và
        // hiệu ứng chỉ phục vụ khung hình kiểm chứng này, không đổi luật chơi.
        showcaseFx = { kind: 'catch', khung: false, weight: 1.24,
          species: { name: 'Cá chép', color: '#c9973f' }, seat: 4, userId: null };
        showcaseStamp = wallNow;
        frozen = true;
      }
    }
    renderer.draw(engine.getSnapshot(), wallNow);
    updateStatsPanel();
    requestAnimationFrame(frame);
  }

  /* ---------- bảng điều khiển mô phỏng ---------- */
  function $(id) { return document.getElementById(id); }
  var statsEl = $('simstats');
  var lastStatsAt = 0;
  function updateStatsPanel() {
    if (!statsEl) return;
    var now = performance.now();
    if (now - lastStatsAt < 500) return;
    lastStatsAt = now;
    var snap = engine.getSnapshot();
    statsEl.textContent =
      'Đang câu: ' + snap.fishingCount + ' · Ghế: ' + snap.anglers.length + '/24' +
      ' · Cá toàn phòng: ' + snap.roomFish +
      ' · Hoa hồng đã chốt: ' + snap.stats.rosesSettled +
      ' · Sẩy cá: ' + snap.stats.escapes +
      ' · Thủy quái đã mở: ' + snap.stats.monsterEvents +
      ' · Vua hiện tại: ' + (snap.kingName || '—');
  }

  function bindPanel() {
    if (!$('panel')) return;
    var simToggle = $('sim-enabled');
    simToggle.checked = sim.settings.enabled;
    simToggle.addEventListener('change', function () { sim.settings.enabled = simToggle.checked; });

    var density = $('sim-density'), densityVal = $('sim-density-val');
    density.value = sim.settings.density;
    densityVal.textContent = sim.settings.density;
    density.addEventListener('input', function () {
      sim.settings.density = parseInt(density.value, 10);
      densityVal.textContent = density.value;
    });

    var gift = $('sim-gift'), giftVal = $('sim-gift-val');
    gift.value = Math.round(sim.settings.giftRate * 100);
    giftVal.textContent = gift.value + '%';
    gift.addEventListener('input', function () {
      sim.settings.giftRate = parseInt(gift.value, 10) / 100;
      giftVal.textContent = gift.value + '%';
    });

    $('btn-add-viewer').addEventListener('click', function () { sim.addViewer(engine.now); });
    $('btn-monster').addEventListener('click', function () { engine.triggerMonsterNow(); });
    $('btn-golden').addEventListener('click', function () { engine.triggerGoldenHourNow(); });
    $('btn-end-session').addEventListener('click', function () {
      if (confirm('Kết thúc buổi hiện tại? Cần câu đặt lại về cơ bản; điểm và cá tích lũy vẫn giữ nguyên.')) engine.endSession();
    });

    /* Ô nhập tay: gõ lệnh như người xem thật */
    var nameInput = $('manual-name'), textInput = $('manual-text');
    function manualUser() {
      var name = (nameInput.value || '').trim() || 'Khách Ghé Hồ';
      return { userId: 'manual-' + name.toLowerCase().replace(/\s+/g, '-'), displayName: name };
    }
    $('btn-manual-chat').addEventListener('click', function () {
      var u = manualUser();
      var text = (textInput.value || '').trim();
      if (!text) return;
      bus.emit({ type: 'chat', userId: u.userId, displayName: u.displayName, text: text });
      textInput.value = '';
    });
    textInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-manual-chat').click(); });

    /* Tặng hoa hồng bằng tay cho một tên bất kỳ — phát đúng khuôn chuỗi combo:
       vài sự kiện ongoing tăng dần rồi chốt bằng sự kiện finished. */
    $('btn-manual-gift').addEventListener('click', function () {
      var u = manualUser();
      var total = Math.max(1, parseInt($('manual-roses').value, 10) || 1);
      var chainId = HCEvents.nextChainId('manual');
      var steps = total === 1 ? [1] : [Math.max(1, Math.floor(total / 3)), Math.max(2, Math.floor(total * 2 / 3)), total];
      steps.forEach(function (rc, i) {
        setTimeout(function () {
          bus.emit({
            type: 'gift', userId: u.userId, displayName: u.displayName,
            giftId: 'rose', giftName: 'Hoa hồng', chainId: chainId,
            repeatCount: rc, state: i === steps.length - 1 ? 'finished' : 'ongoing'
          });
        }, i * 450);
      });
    });

    /* Nút lệnh nhanh cho người nhập tay */
    var quick = $('quick-cmds');
    ['câu cá', 'báo cá', 'cần', 'top', 'điểm', 'mồi', 'thủy quái', 'nghỉ'].forEach(function (cmd) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = cmd; b.className = 'quick';
      b.addEventListener('click', function () { textInput.value = cmd; $('btn-manual-chat').click(); });
      quick.appendChild(b);
    });
  }

  if (params.get('clean') === '1') document.body.classList.add('clean');
  bindPanel();

  /* Tua nhanh xác định (?ff=<ms>): chạy theo bước 250ms trước vòng lặp thật.
     Chỉ phục vụ kiểm chứng và chụp hình — ngân sách thời gian ảo của trình
     duyệt headless không tương thích với vòng lặp khung hình của trang.
     Đặt ở cuối quá trình khởi tạo để nhật ký sự kiện kịp ghi lại mọi sự kiện. */
  var ffMs = parseInt(params.get('ff') || '0', 10) || 0;
  if (ffMs > 0) {
    while (engine.now < ffMs) {
      var step = Math.min(250, ffMs - engine.now);
      sim.update(engine.now, step);
      engine.update(step);
      if (typeof monsterArmed !== 'undefined' && monsterArmed && engine.now > 6000) { monsterArmed = false; engine.triggerMonsterNow(); }
    }
    engine.drainFx(); // bỏ hiệu ứng cũ tích lũy trong lúc tua, chỉ giữ trạng thái
  }

  /* Diễn trước showcase (?showcase=khung|monster): ngay khi nạp trang, chạy
     tăng tốc theo bước 250ms cho tới đúng khoảnh khắc cần chụp rồi đóng băng.
     Chỉ phục vụ chụp hình kiểm chứng — trạng thái đóng băng là trạng thái
     engine thật tại khoảnh khắc đó, không dựng giả. */
  if (showcase === 'khung' || showcase === 'monster') {
    var guardMs = 0;
    while (!showcaseFx && guardMs < 900000) {
      sim.update(engine.now, 250);
      engine.update(250);
      guardMs += 250;
      var fxs = engine.drainFx();
      for (var j = 0; j < fxs.length; j++) {
        if ((showcase === 'khung' && fxs[j].kind === 'catch' && fxs[j].khung) ||
            (showcase === 'monster' && fxs[j].kind === 'monsterCaught')) { showcaseFx = fxs[j]; break; }
      }
    }
    if (showcaseFx) frozen = true;
  }

  requestAnimationFrame(frame);

  /* Lộ tay cầm cho kiểm chứng tự động trên trình duyệt */
  window.__hocau = { bus: bus, engine: engine, sim: sim, store: store };
})();
