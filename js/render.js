/* ============================================================
   HỒ CÂU QUÊ NHÀ — Lớp vẽ màn hình game
   Canvas 1080x1920 (9:16), toàn bộ hình vẽ MỚI bằng mã canvas 2D
   theo phong cách hồ quê Việt Nam của ảnh mẫu — không dùng bất kỳ
   hình vẽ nào của phòng mẫu.

   VÒNG NÂNG CẤP HÌNH ẢNH (2026-11-07, lệnh của Bui: "Tạo hình ảnh
   đẹp hơn"): chỉ nâng lớp trình bày trong tệp này — không đổi
   một con số hay luật chơi nào; engine/events/store/simulator/
   config nguyên vẹn.

   Kỹ thuật chính của vòng nâng cấp:
   - Nền tĩnh (phong cảnh + bờ + mặt nước nền + trang trí cố định)
     được vẽ MỘT LẦN vào 3 canvas đệm cho 3 trạng thái mặt nước
     (thường / giờ vàng / thủy quái) rồi dán lại mỗi khung — hình
     giàu chi tiết mà khung hình vẫn nhẹ.
   - Lớp động mỏng chạy trên nền đệm: phản chiếu lấp lánh, gợn
     sóng trôi, bóng cá lướt, cá nhảy, vệt sáng cần.
   - Cần thủ chibi chi tiết: đầu + tóc/mũ theo từng người, mặt,
     áo có cổ và túi, quần, giày, ghế xếp có tựa, sọt cá bên cạnh;
     hình lấy theo hạt giống = mã người dùng nên mỗi người một vẻ
     ổn định giữa các khung.
   Bố cục giữ nguyên theo tài liệu 01 mục 1; vùng an toàn: ~8%
   trên cùng và ~15% dưới cùng chỉ có trang trí, thông tin quan
   trọng nằm ở giữa.
   ============================================================ */
(function (root) {
  'use strict';

  var W = 1080, H = 1920;
  var SAFE_TOP = 154;        // 8% chiều cao
  var SAFE_BOTTOM = H - 288; // 15% dưới cùng để trống cho giao diện TikTok

  /* Vùng hồ dùng chung cho mọi lớp vẽ */
  var LAKE = { x: 150, y: 430, w: 780, h: 1210 }; // mặt nước: 150..930 × 430..1640
  LAKE.r = LAKE.x + LAKE.w; LAKE.b = LAKE.y + LAKE.h;

  var SHIRT_COLORS = ['#3f9db8', '#4d7dd1', '#59a96a', '#d18f4d', '#b84d6e', '#7a5fb0', '#3fb0a0', '#c2a13a'];
  var PANTS_COLORS = ['#3c4a5a', '#5a4632', '#2f4f4a', '#54455e', '#6b3a2e', '#33415e'];
  var HAIR_COLORS = ['#241a12', '#3a2415', '#17171c', '#4a3220', '#2c2118'];
  var HAT_COLORS = ['#e8cf8e', '#d9b96a', '#7fae56', '#c96f4a', '#5d84b8'];
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  /* RNG xác định theo hạt giống — chi tiết trang trí cố định không nhấp nháy giữa các khung */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || '700') + ' ' + size + 'px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  function fitText(ctx, str, maxW, size, weight) {
    var s = size;
    ctx.font = (weight || '700') + ' ' + s + 'px "Segoe UI", Arial, sans-serif';
    while (ctx.measureText(str).width > maxW && s > 16) { s -= 2; ctx.font = (weight || '700') + ' ' + s + 'px "Segoe UI", Arial, sans-serif'; }
    return s;
  }
  /* chữ có bóng đổ mềm để đọc rõ trên nền live */
  function textShadow(ctx, str, x, y, size, color, align, weight, shadow) {
    ctx.save();
    ctx.shadowColor = shadow || 'rgba(8,24,16,0.65)';
    ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
    text(ctx, str, x, y, size, color, align, weight);
    ctx.restore();
  }
  /* Bảng gỗ xanh đậm viền vàng có đổ bóng — khuôn chung cho mọi bảng thông tin */
  function panel(ctx, x, y, w, h, r, fill, gold) {
    ctx.save();
    ctx.shadowColor = 'rgba(6,20,12,0.55)';
    ctx.shadowBlur = 16; ctx.shadowOffsetY = 7;
    ctx.fillStyle = fill || 'rgba(11,38,25,0.95)';
    rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = gold || 'rgba(255,214,110,0.75)';
    ctx.lineWidth = 2.5;
    rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(4, r - 2)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,170,0.20)';
    ctx.lineWidth = 1;
    rr(ctx, x + 5.5, y + 5.5, w - 11, h - 11, Math.max(3, r - 5)); ctx.stroke();
  }
  /* Hoa hồng vẽ bằng mã (thay ký tự cảm xúc, nét vẽ đồng nhất với tranh) */
  function drawRose(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = '#3e7d46'; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 1 * s); ctx.quadraticCurveTo(1.5 * s, 7 * s, 0.5 * s, 12 * s); ctx.stroke();
    ctx.fillStyle = '#4d9959';
    ctx.beginPath(); ctx.ellipse(-3.4 * s, 7.5 * s, 3.6 * s, 1.7 * s, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.6 * s, 9.5 * s, 3.2 * s, 1.5 * s, 0.6, 0, Math.PI * 2); ctx.fill();
    var petal = ctx.createRadialGradient(-1.5 * s, -5 * s, 1 * s, 0, -2.5 * s, 8 * s);
    petal.addColorStop(0, '#ff7d8a'); petal.addColorStop(0.55, '#ec4257'); petal.addColorStop(1, '#c02537');
    ctx.fillStyle = petal;
    ctx.beginPath(); ctx.arc(0, -2.5 * s, 6.6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,10,25,0.55)'; ctx.lineWidth = 1.1 * s;
    ctx.beginPath(); ctx.arc(0, -2.5 * s, 4.1 * s, 0.5, 4.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -2.5 * s, 2.1 * s, 2.4, 6.6); ctx.stroke();
    ctx.restore();
  }
  /* Vương miện nhỏ cho Vua Câu Cá (vẽ bằng mã) */
  function drawCrown(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    var g = ctx.createLinearGradient(0, -9, 0, 8);
    g.addColorStop(0, '#ffe98a'); g.addColorStop(0.6, '#ffc93c'); g.addColorStop(1, '#e09a12');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-13, 7); ctx.lineTo(-13, -6); ctx.lineTo(-6.5, 1); ctx.lineTo(0, -9);
    ctx.lineTo(6.5, 1); ctx.lineTo(13, -6); ctx.lineTo(13, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(122,78,0,0.7)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#e33f31';
    ctx.beginPath(); ctx.arc(0, 2.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* Vị trí ghế: bờ trái x~86, bờ phải x~994; 12 ghế dọc theo hồ */
  function seatPos(seat, seatsPerBank) {
    var bank = seat < seatsPerBank ? 'L' : 'R';
    var slot = seat % seatsPerBank;
    var y = 559 + slot * 92; // hàng đầu bắt đầu dưới dải thông báo (kết thúc ở y=442)
    return { x: bank === 'L' ? 88 : 992, y: y, bank: bank, slot: slot };
  }
  var KING_SPOT = { x: 972, y: 1165 };

  /* ==========================================================
     NỀN TĨNH — vẽ một lần vào canvas đệm (3 trạng thái nước)
     ========================================================== */
  function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    return new OffscreenCanvas(w, h);
  }

  /* --- cây dừa chi tiết: thân cong có đốt, tàu lá rủ có lá chét --- */
  function drawPalmTree(c, x, yBase, hgt, lean, seed, tone) {
    var R = rng(seed);
    var topX = x + lean, topY = yBase - hgt;
    // bóng gốc
    c.fillStyle = 'rgba(40,60,25,0.30)';
    c.beginPath(); c.ellipse(x, yBase + 4, hgt * 0.22, hgt * 0.05, 0, 0, Math.PI * 2); c.fill();
    // thân cong
    c.lineCap = 'round';
    var w0 = Math.max(6, hgt * 0.075);
    for (var seg = 0; seg < 7; seg++) {
      var t0 = seg / 7, t1 = (seg + 0.92) / 7;
      var sx0 = x + lean * t0 * t0, sy0 = yBase - hgt * t0;
      var sx1 = x + lean * t1 * t1, sy1 = yBase - hgt * t1;
      c.strokeStyle = seg % 2 ? '#8a6a44' : '#77582f';
      c.lineWidth = w0 * (1 - t0 * 0.45);
      c.beginPath(); c.moveTo(sx0, sy0); c.lineTo(sx1, sy1); c.stroke();
    }
    // chùm dừa
    c.fillStyle = '#7d9b3a';
    for (var n = 0; n < 4; n++) {
      c.beginPath(); c.arc(topX + (R() - 0.5) * 15, topY + 6 + R() * 6, hgt * 0.045 + 2, 0, Math.PI * 2); c.fill();
    }
    // tàu lá: mỗi tàu là sống lá cong + lá chét hai bên
    var fronds = 8;
    for (var f = 0; f < fronds; f++) {
      var ang = -Math.PI * (0.06 + 0.88 * (f / (fronds - 1))) + (R() - 0.5) * 0.14;
      var len = hgt * (0.52 + R() * 0.22);
      var droop = hgt * (0.30 + R() * 0.18);
      var ex = topX + Math.cos(ang) * len;
      var ey = topY + Math.abs(Math.sin(ang)) * droop * 0.4 + droop * 0.42;
      var cxp = topX + Math.cos(ang) * len * 0.5;
      var cyp = topY - len * 0.16;
      var leafCol = tone === 'far' ? 'rgba(52,102,52,0.75)' : (f % 2 ? '#2f7a34' : '#3c8a3c');
      c.strokeStyle = leafCol; c.lineWidth = 1.6; c.lineCap = 'round';
      var steps = 7;
      for (var st = 1; st < steps; st++) {
        var tt = st / steps;
        var px = (1 - tt) * (1 - tt) * topX + 2 * (1 - tt) * tt * cxp + tt * tt * ex;
        var py = (1 - tt) * (1 - tt) * topY + 2 * (1 - tt) * tt * cyp + tt * tt * ey;
        var txv = 2 * (1 - tt) * (cxp - topX) + 2 * tt * (ex - cxp);
        var tyv = 2 * (1 - tt) * (cyp - topY) + 2 * tt * (ey - cyp);
        var tl = Math.sqrt(txv * txv + tyv * tyv) || 1;
        var nx = -tyv / tl, ny = txv / tl;
        var ll = hgt * 0.085 * (1 - tt * 0.45);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + nx * ll + txv / tl * 3, py + ny * ll + tyv / tl * 3); c.stroke();
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - nx * ll + txv / tl * 3, py - ny * ll + tyv / tl * 3); c.stroke();
      }
      c.strokeStyle = tone === 'far' ? 'rgba(46,90,44,0.8)' : '#2c6e2e';
      c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(topX, topY); c.quadraticCurveTo(cxp, cyp, ex, ey); c.stroke();
    }
  }

  /* --- khóm chuối: lá lớn cong rủ từ một gốc --- */
  function drawBanana(c, x, y, s, seed) {
    var R = rng(seed);
    c.strokeStyle = '#6d8a44'; c.lineWidth = 5 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 3 * s, y - 26 * s, x + 1 * s, y - 44 * s); c.stroke();
    for (var i = 0; i < 6; i++) {
      var ang = -0.35 - i * 0.42 + (R() - 0.5) * 0.2;
      var len = (52 + R() * 22) * s;
      var ex = x + Math.sin(ang) * len, ey = y - 42 * s - Math.cos(ang) * len * 0.35 + len * 0.30;
      var g = c.createLinearGradient(x, y - 44 * s, ex, ey);
      g.addColorStop(0, '#4c9a45'); g.addColorStop(1, '#69b257');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x + 1 * s, y - 44 * s);
      c.quadraticCurveTo(x + Math.sin(ang) * len * 0.5 - 9 * s, y - 44 * s - len * 0.32, ex, ey);
      c.quadraticCurveTo(x + Math.sin(ang) * len * 0.5 + 9 * s, y - 44 * s - len * 0.18, x + 1 * s, y - 44 * s);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(30,80,30,0.5)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x + 1 * s, y - 44 * s); c.quadraticCurveTo(x + Math.sin(ang) * len * 0.55, y - 44 * s - len * 0.26, ex, ey); c.stroke();
    }
  }

  /* --- bụi tre: thân đốt vươn cao, lá mảnh --- */
  function drawBamboo(c, x, y, s, seed) {
    var R = rng(seed);
    for (var i = 0; i < 5; i++) {
      var bx = x + (i - 2) * 9 * s + (R() - 0.5) * 5;
      var hgt = (95 + R() * 55) * s;
      var lean = (R() - 0.5) * 16 * s;
      c.strokeStyle = i % 2 ? '#5d8f43' : '#4c7d38'; c.lineWidth = 4.4 * s; c.lineCap = 'round';
      c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + lean * 0.3, y - hgt * 0.6, bx + lean, y - hgt); c.stroke();
      c.strokeStyle = 'rgba(230,240,200,0.35)'; c.lineWidth = 1.1 * s;
      for (var d = 1; d <= 3; d++) {
        var dy = y - hgt * d / 3.4;
        c.beginPath(); c.moveTo(bx + lean * 0.3 * d / 3 - 3 * s, dy); c.lineTo(bx + lean * 0.3 * d / 3 + 3 * s, dy); c.stroke();
      }
      c.strokeStyle = 'rgba(58,110,48,0.85)'; c.lineWidth = 1.5 * s;
      for (var l = 0; l < 6; l++) {
        var ly = y - hgt * (0.55 + R() * 0.45);
        var lx = bx + lean * (1 - ly / y || 0);
        var dirl = R() > 0.5 ? 1 : -1;
        c.beginPath(); c.moveTo(bx + lean * 0.6, ly);
        c.quadraticCurveTo(bx + lean * 0.6 + dirl * 13 * s, ly - 4 * s, bx + lean * 0.6 + dirl * 22 * s, ly + 3 * s); c.stroke();
      }
    }
  }

  /* --- bụi cỏ: nhiều lá mảnh cong từ một gốc --- */
  function drawGrassTuft(c, x, y, s, R, dark) {
    c.strokeStyle = dark ? 'rgba(38,78,32,0.9)' : 'rgba(52,102,40,0.9)';
    c.lineWidth = 2.4 * s; c.lineCap = 'round';
    var n = 5 + Math.floor(R() * 3);
    for (var i = 0; i < n; i++) {
      var dx = (R() - 0.5) * 16 * s;
      var hh = (16 + R() * 16) * s;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + dx * 0.4, y - hh * 0.7, x + dx, y - hh); c.stroke();
    }
  }

  /* --- bông súng + lá súng trên mặt nước --- */
  function drawLilyPad(c, x, y, s, R, flower) {
    c.fillStyle = 'rgba(30,80,35,0.35)';
    c.beginPath(); c.ellipse(x + 3, y + 4, 17 * s, 6 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3f8f46';
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, 15 * s, 0.35, Math.PI * 2 - 0.35);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(20,70,25,0.45)'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(x, y, 15 * s, 0.35, Math.PI * 2 - 0.35); c.closePath(); c.stroke();
    c.strokeStyle = 'rgba(220,245,200,0.4)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 11 * s, y - 5 * s); c.stroke();
    if (flower) {
      for (var p = 0; p < 6; p++) {
        var a = p / 6 * Math.PI * 2;
        c.fillStyle = p % 2 ? '#f6c6dc' : '#efa8c8';
        c.beginPath(); c.ellipse(x + Math.cos(a) * 5 * s, y - 3 * s + Math.sin(a) * 2.4 * s, 4.6 * s, 2.6 * s, a, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#ffd94d';
      c.beginPath(); c.arc(x, y - 3 * s, 2.8 * s, 0, Math.PI * 2); c.fill();
    }
  }

  /* --- chòi lá chi tiết: cột, vách, mái tranh có vân, bóng đổ --- */
  function drawHutDetailed(c, x, y) {
    c.fillStyle = 'rgba(40,45,20,0.35)';
    c.beginPath(); c.ellipse(x + 72, y + 66, 92, 12, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#77572f';
    c.fillRect(x + 8, y + 6, 9, 58); c.fillRect(x + 127, y + 6, 9, 58);
    var wall = c.createLinearGradient(x, y, x, y + 56);
    wall.addColorStop(0, '#a87f4c'); wall.addColorStop(1, '#8a6538');
    c.fillStyle = wall; c.fillRect(x + 10, y, 124, 56);
    c.strokeStyle = 'rgba(90,60,25,0.5)'; c.lineWidth = 1.4;
    for (var vx = x + 30; vx < x + 130; vx += 20) { c.beginPath(); c.moveTo(vx, y + 2); c.lineTo(vx, y + 54); c.stroke(); }
    c.fillStyle = '#4c341e'; c.fillRect(x + 56, y + 16, 34, 40);
    c.fillStyle = '#2e2012'; c.fillRect(x + 60, y + 20, 26, 18);
    // mái tranh hai lớp có vân rủ
    c.fillStyle = '#c9a45c';
    c.beginPath(); c.moveTo(x - 18, y + 6); c.lineTo(x + 72, y - 40); c.lineTo(x + 162, y + 6); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(140,105,45,0.65)'; c.lineWidth = 1.6;
    for (var mx = -6; mx <= 14; mx++) {
      var t = mx / 14;
      var bx2 = x - 12 + t * 168, by2 = y + 3 - Math.sin(t * Math.PI) * 0; // mép mái dưới
      var tx2 = x + 72 + (bx2 - (x + 72)) * 0.24, ty2 = y - 36 + Math.abs(t - 0.5) * 4;
      c.beginPath(); c.moveTo(tx2, ty2); c.lineTo(bx2, by2 + 3); c.stroke();
    }
    c.fillStyle = '#b28c46';
    c.beginPath(); c.moveTo(x - 18, y + 6); c.lineTo(x + 162, y + 6); c.lineTo(x + 154, y + 13); c.lineTo(x - 10, y + 13); c.closePath(); c.fill();
  }

  /* --- bờ đất chi tiết --- */
  function drawBankStatic(c, x0, side, seed) {
    var R = rng(seed);
    var innerX = side === 'L' ? x0 + 108 : x0;      // lối đi sát nước: 42px
    var outerX = side === 'L' ? x0 : x0 + 118;      // dải cỏ ngoài: 32px
    // nền đất có chuyển sắc ngang (sáng phía lối đi, thẫm mép ngoài)
    var g = c.createLinearGradient(x0, 0, x0 + 150, 0);
    if (side === 'L') { g.addColorStop(0, '#9a7443'); g.addColorStop(0.72, '#bb9057'); g.addColorStop(1, '#cfa668'); }
    else { g.addColorStop(0, '#cfa668'); g.addColorStop(0.28, '#bb9057'); g.addColorStop(1, '#9a7443'); }
    c.fillStyle = g; c.fillRect(x0, LAKE.y, 150, LAKE.h);
    // vân đất: vệt nâu loang xác định
    for (var i = 0; i < 46; i++) {
      var px = x0 + R() * 140, py = LAKE.y + R() * LAKE.h;
      c.fillStyle = R() > 0.5 ? 'rgba(120,84,40,0.16)' : 'rgba(226,188,128,0.15)';
      c.beginPath(); c.ellipse(px, py, 8 + R() * 22, 4 + R() * 8, R() * 0.6 - 0.3, 0, Math.PI * 2); c.fill();
    }
    // lối đi sát nước: nâu sáng + hai mép viền + bước chân mòn
    c.fillStyle = '#d8b078';
    c.fillRect(innerX, LAKE.y, 42, LAKE.h);
    c.fillStyle = 'rgba(146,108,58,0.55)';
    c.fillRect(side === 'L' ? innerX : innerX + 39, LAKE.y, 3, LAKE.h);
    c.fillStyle = 'rgba(255,236,190,0.30)';
    c.fillRect(side === 'L' ? innerX + 37 : innerX + 2, LAKE.y, 3, LAKE.h);
    for (var s2 = 0; s2 < 26; s2++) {
      var sy2 = LAKE.y + 24 + s2 * 47 + R() * 12;
      c.fillStyle = 'rgba(130,95,50,0.20)';
      c.beginPath(); c.ellipse(innerX + 12 + R() * 18, sy2, 7, 3.4, 0.3, 0, Math.PI * 2); c.fill();
    }
    // dải cỏ mép ngoài + bụi cỏ dày thưa
    var gg = c.createLinearGradient(outerX, 0, outerX + 32, 0);
    if (side === 'L') { gg.addColorStop(0, '#557c39'); gg.addColorStop(1, '#729a4b'); }
    else { gg.addColorStop(0, '#729a4b'); gg.addColorStop(1, '#557c39'); }
    c.fillStyle = gg; c.fillRect(outerX, LAKE.y, 32, LAKE.h);
    for (var t2 = 0; t2 < 30; t2++) {
      drawGrassTuft(c, outerX + 4 + R() * 26, LAKE.y + 26 + R() * (LAKE.h - 40), 0.8 + R() * 0.5, R, t2 % 3 === 0);
    }
    // cỏ lấn mép nước + ven lối đi
    for (var t3 = 0; t3 < 22; t3++) {
      var ex2 = side === 'L' ? innerX + 34 + R() * 8 : innerX - 2 + R() * 6;
      drawGrassTuft(c, ex2, LAKE.y + 20 + R() * (LAKE.h - 30), 0.55 + R() * 0.4, R, false);
    }
    // sỏi đá rải rác
    for (var st2 = 0; st2 < 12; st2++) {
      var qx = x0 + 36 + R() * 100, qy = LAKE.y + R() * LAKE.h;
      var qs = 4 + R() * 7;
      c.fillStyle = 'rgba(90,80,70,0.5)';
      c.beginPath(); c.ellipse(qx, qy + 2, qs, qs * 0.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#a9a294';
      c.beginPath(); c.ellipse(qx, qy, qs, qs * 0.55, -0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.ellipse(qx - qs * 0.3, qy - qs * 0.2, qs * 0.4, qs * 0.2, -0.2, 0, Math.PI * 2); c.fill();
    }
    // cây lớn sau bờ: dừa + chuối + tre xen nhau (chân cây neo dưới mép trên của hồ)
    if (side === 'L') {
      drawPalmTree(c, 66, 500, 128, -20, 1234, 'near');
      drawBanana(c, 128, 800, 1.05, 555);
      drawBamboo(c, 30, 1180, 1.0, 777);
      drawPalmTree(c, 44, 1560, 112, -14, 4321, 'near');
      drawBanana(c, 132, 1330, 0.9, 888);
    } else {
      drawPalmTree(c, 1014, 512, 122, 18, 9876, 'near');
      drawBanana(c, 956, 830, 1.0, 444);
      drawBamboo(c, 1050, 1210, 1.0, 999);
      drawPalmTree(c, 1036, 1580, 108, 13, 6543, 'near');
      drawBanana(c, 950, 1360, 0.9, 333);
    }
  }

  /* --- mặt nước nền cho một trạng thái --- */
  function paintWaterBase(c, mode) {
    // chuyển sắc theo chiều sâu: bờ sáng, giữa hồ thẫm
    var lg = c.createLinearGradient(LAKE.x, 0, LAKE.r, 0);
    var vg = c.createLinearGradient(0, LAKE.y, 0, LAKE.b);
    if (mode === 'monster') {
      lg.addColorStop(0, '#54755c'); lg.addColorStop(0.5, '#3c5a44'); lg.addColorStop(1, '#54755c');
      vg.addColorStop(0, '#4a6a50'); vg.addColorStop(1, '#2f4a36');
    } else if (mode === 'golden') {
      lg.addColorStop(0, '#93b874'); lg.addColorStop(0.5, '#73975c'); lg.addColorStop(1, '#93b874');
      vg.addColorStop(0, '#8fae6d'); vg.addColorStop(1, '#5d844e');
    } else {
      lg.addColorStop(0, '#7fae74'); lg.addColorStop(0.5, '#63955f'); lg.addColorStop(1, '#7fae74');
      vg.addColorStop(0, '#7cab6f'); vg.addColorStop(1, '#4f7d4c');
    }
    c.fillStyle = lg; c.fillRect(LAKE.x, LAKE.y, LAKE.w, LAKE.h);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = vg; c.fillRect(LAKE.x, LAKE.y, LAKE.w, LAKE.h);
    c.globalCompositeOperation = 'source-over';
    // vệt nước thẫm sâu giữa hồ
    var deep = c.createRadialGradient(540, 1030, 60, 540, 1030, 520);
    deep.addColorStop(0, mode === 'monster' ? 'rgba(16,34,22,0.34)' : 'rgba(24,54,30,0.20)');
    deep.addColorStop(1, 'rgba(24,54,30,0)');
    c.fillStyle = deep; c.fillRect(LAKE.x, LAKE.y, LAKE.w, LAKE.h);
    // bóng bờ + bóng cây phản chiếu hai mép nước (dải dọc mờ, lượn sóng)
    var R = rng(mode === 'monster' ? 31337 : 20240);
    for (var sideI = 0; sideI < 2; sideI++) {
      var baseX = sideI === 0 ? LAKE.x : LAKE.r;
      var dirI = sideI === 0 ? 1 : -1;
      for (var b2 = 0; b2 < 30; b2++) {
        var by3 = LAKE.y + 18 + R() * (LAKE.h - 36);
        var bw = 26 + R() * 74, bh = 9 + R() * 15;
        var off = (R() * 14) * dirI;
        c.fillStyle = R() > 0.42 ? 'rgba(38,66,34,0.13)' : 'rgba(226,240,190,0.10)';
        c.beginPath();
        c.ellipse(baseX + off + dirI * bw * 0.4, by3, bw * 0.5, bh * 0.5, 0, 0, Math.PI * 2);
        c.fill();
      }
      // phản chiếu tàu dừa: vệt xanh dài lượn từ mép vào
      for (var p3 = 0; p3 < 7; p3++) {
        var py3 = LAKE.y + 60 + p3 * 168 + R() * 40;
        c.strokeStyle = 'rgba(34,76,36,0.16)'; c.lineWidth = 5 + R() * 4; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(baseX + dirI * 4, py3);
        c.quadraticCurveTo(baseX + dirI * (44 + R() * 30), py3 + 8 + R() * 10, baseX + dirI * (86 + R() * 44), py3 + 3);
        c.stroke();
      }
    }
    // sen/súng + bèo tấm điểm xuyết (né vùng giữa hồ và hộp thủy quái)
    var lilies = [[212, 520], [868, 560], [238, 1330], [300, 700], [792, 760], [206, 980], [880, 1010], [330, 1470], [262, 1560]];
    for (var li = 0; li < lilies.length; li++) {
      drawLilyPad(c, lilies[li][0], lilies[li][1], 0.9 + R() * 0.5, R, li % 4 === 0);
      if (li % 3 === 0) drawLilyPad(c, lilies[li][0] + 30, lilies[li][1] + 14, 0.6 + R() * 0.3, R, false);
    }
    for (var dw = 0; dw < 26; dw++) {
      var dx3 = LAKE.x + 26 + R() * (LAKE.w - 52), dy3 = LAKE.y + 30 + R() * (LAKE.h - 60);
      if (Math.abs(dx3 - 540) < 190 && Math.abs(dy3 - 1030) < 190) continue;
      c.fillStyle = 'rgba(120,190,90,0.35)';
      c.beginPath(); c.ellipse(dx3, dy3, 3.4 + R() * 3, 1.8 + R() * 1.4, R(), 0, Math.PI * 2); c.fill();
    }
    // vệt sóng tĩnh mảnh rải khắp mặt nước (lớp động sẽ phủ thêm sóng trôi)
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 2.4; c.lineCap = 'round';
    for (var wv = 0; wv < 60; wv++) {
      var wx3 = LAKE.x + 22 + R() * (LAKE.w - 90);
      var wy3 = LAKE.y + 20 + R() * (LAKE.h - 40);
      var wl = 26 + R() * 44;
      c.beginPath(); c.moveTo(wx3, wy3);
      c.quadraticCurveTo(wx3 + wl * 0.5, wy3 - 4 - R() * 3, wx3 + wl, wy3); c.stroke();
    }
    // viền nước sát bờ: dải sáng ôm mép + dải thẫm ngay dưới bờ
    c.fillStyle = 'rgba(20,50,24,0.20)'; c.fillRect(LAKE.x, LAKE.y, LAKE.w, 9);
    c.fillStyle = 'rgba(235,250,210,0.20)'; c.fillRect(LAKE.x, LAKE.y + 9, LAKE.w, 4);
    c.fillStyle = 'rgba(20,50,24,0.16)'; c.fillRect(LAKE.x, LAKE.b - 10, LAKE.w, 10);
  }

  /* --- toàn bộ nền tĩnh --- */
  function paintBackground(mode) {
    var cv = makeCanvas(W, H);
    var c = cv.getContext('2d');
    var R = rng(987654);
    // TRỜI: bình minh ấm dần xuống chân trời
    var sky = c.createLinearGradient(0, 0, 0, 470);
    sky.addColorStop(0, '#93bcd4'); sky.addColorStop(0.45, '#bcd8cf'); sky.addColorStop(0.8, '#dcebd2'); sky.addColorStop(1, '#eef2d8');
    c.fillStyle = sky; c.fillRect(0, 0, W, 470);
    // mặt trời + quầng sáng góc trái trên
    var sun = c.createRadialGradient(150, 108, 8, 150, 108, 190);
    sun.addColorStop(0, 'rgba(255,244,190,0.95)'); sun.addColorStop(0.25, 'rgba(255,238,170,0.45)'); sun.addColorStop(1, 'rgba(255,238,170,0)');
    c.fillStyle = sun; c.fillRect(0, 0, 420, 320);
    c.fillStyle = '#fff3c0';
    c.beginPath(); c.arc(150, 108, 34, 0, Math.PI * 2); c.fill();
    // mây mềm vài cụm
    c.fillStyle = 'rgba(255,255,255,0.75)';
    var clouds = [[300, 92, 1], [700, 66, 0.8], [950, 120, 0.65], [520, 140, 0.55], [120, 190, 0.5]];
    for (var ci = 0; ci < clouds.length; ci++) {
      var cx3 = clouds[ci][0], cy3 = clouds[ci][1], cs = clouds[ci][2];
      c.beginPath();
      c.ellipse(cx3, cy3, 74 * cs, 17 * cs, 0, 0, Math.PI * 2);
      c.ellipse(cx3 - 40 * cs, cy3 + 5 * cs, 46 * cs, 13 * cs, 0, 0, Math.PI * 2);
      c.ellipse(cx3 + 44 * cs, cy3 + 4 * cs, 50 * cs, 14 * cs, 0, 0, Math.PI * 2);
      c.ellipse(cx3 + 4 * cs, cy3 - 10 * cs, 44 * cs, 14 * cs, 0, 0, Math.PI * 2);
      c.fill();
    }
    // DÃY NÚI hai lớp mờ dần
    c.fillStyle = 'rgba(96,128,116,0.42)';
    c.beginPath();
    c.moveTo(0, 252);
    c.quadraticCurveTo(180, 150, 380, 214);
    c.quadraticCurveTo(560, 268, 760, 196);
    c.quadraticCurveTo(920, 146, 1080, 208);
    c.lineTo(1080, 470); c.lineTo(0, 470); c.closePath(); c.fill();
    var mg = c.createLinearGradient(0, 190, 0, 470);
    mg.addColorStop(0, 'rgba(88,124,84,0.72)'); mg.addColorStop(1, 'rgba(104,140,92,0.9)');
    c.fillStyle = mg;
    c.beginPath();
    c.moveTo(0, 300);
    c.quadraticCurveTo(240, 208, 470, 268);
    c.quadraticCurveTo(700, 322, 900, 252);
    c.quadraticCurveTo(1000, 218, 1080, 258);
    c.lineTo(1080, 470); c.lineTo(0, 470); c.closePath(); c.fill();
    // ĐỒNG LÚA bậc thang chân núi: dải xanh vàng xen nhau + vệt nước ruộng
    var fieldY = 356;
    var rowsF = ['#9dbb62', '#b3c96e', '#8fae57', '#c2d17a', '#9dbb62'];
    for (var fi = 0; fi < rowsF.length; fi++) {
      c.fillStyle = rowsF[fi];
      c.beginPath();
      c.moveTo(0, fieldY + fi * 23);
      c.quadraticCurveTo(540, fieldY + fi * 23 - 12, 1080, fieldY + fi * 23 + 4);
      c.lineTo(1080, fieldY + (fi + 1) * 23 + 4); c.lineTo(0, fieldY + (fi + 1) * 23);
      c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(250,250,230,0.35)'; c.lineWidth = 1.6;
    for (var fl = 0; fl < 5; fl++) {
      c.beginPath(); c.moveTo(0, fieldY + fl * 23 + 3);
      c.quadraticCurveTo(540, fieldY + fl * 23 - 9, 1080, fieldY + fl * 23 + 7); c.stroke();
    }
    // hàng cây xa hai bên (dừa nhỏ tông mờ) + bụi rậm chân trời
    drawPalmTree(c, 66, 452, 120, -16, 2141, 'far');
    drawPalmTree(c, 176, 442, 92, -10, 2142, 'far');
    drawPalmTree(c, 1022, 452, 116, 15, 2143, 'far');
    drawPalmTree(c, 918, 440, 88, 9, 2144, 'far');
    c.fillStyle = 'rgba(58,104,52,0.85)';
    for (var bs = 0; bs < 16; bs++) {
      var bx3 = bs * 72 + R() * 22;
      c.beginPath(); c.ellipse(bx3, 452 + R() * 8, 34 + R() * 18, 15 + R() * 8, 0, Math.PI, Math.PI * 2); c.fill();
    }
    // CHÒI LÁ bờ xa: neo ở y=352 để toàn bộ mái tranh + thân chòi nằm trên
    // bờ xa (mép nước trên ở y=430), không bị mặt nước phủ mất phần thân
    drawHutDetailed(c, 470, 352);
    // MẶT NƯỚC nền theo trạng thái
    paintWaterBase(c, mode);
    // HAI BỜ
    drawBankStatic(c, 0, 'L', 1357);
    drawBankStatic(c, 930, 'R', 9753);
    // mép nước phía dưới hồ (dải đất nối xuống cổng chào)
    c.fillStyle = '#b98d55'; c.fillRect(150, LAKE.b, 780, 26);
    c.fillStyle = 'rgba(226,188,128,0.5)'; c.fillRect(150, LAKE.b, 780, 6);
    // VÙNG AN TOÀN DƯỚI: đồng cỏ + hàng rào tre + bụi hoa — trang trí thuần túy
    var gy = SAFE_BOTTOM;
    var gg2 = c.createLinearGradient(0, gy, 0, H);
    gg2.addColorStop(0, '#7fa457'); gg2.addColorStop(1, '#5d8141');
    c.fillStyle = gg2; c.fillRect(0, gy, W, H - gy);
    c.fillStyle = '#8a6b45'; c.fillRect(0, gy, W, 16);
    c.fillStyle = 'rgba(255,240,200,0.35)'; c.fillRect(0, gy + 16, W, 4);
    // hàng rào tre: cọc dọc + hai thanh ngang
    c.fillStyle = '#a3804f';
    for (var fp = 30; fp < W; fp += 64) c.fillRect(fp, gy + 66, 11, 74);
    c.fillStyle = '#b8935c'; c.fillRect(0, gy + 84, W, 10); c.fillRect(0, gy + 118, W, 10);
    c.fillStyle = 'rgba(70,50,22,0.4)';
    for (var fp2 = 30; fp2 < W; fp2 += 64) c.fillRect(fp2 + 8, gy + 66, 3, 74);
    // thảm cỏ có vệt sáng/tối + bụi cỏ + hoa dại
    for (var gz = 0; gz < 60; gz++) {
      var gx4 = R() * W, gy4 = gy + 26 + R() * (H - gy - 40);
      c.fillStyle = R() > 0.5 ? 'rgba(46,84,30,0.20)' : 'rgba(190,220,140,0.16)';
      c.beginPath(); c.ellipse(gx4, gy4, 16 + R() * 26, 5 + R() * 6, 0, 0, Math.PI * 2); c.fill();
    }
    for (var gt = 0; gt < 56; gt++) {
      drawGrassTuft(c, R() * W, gy + 40 + R() * (H - gy - 46), 0.9 + R() * 0.6, R, gt % 4 === 0);
    }
    var flowerCols = ['#f2f2f2', '#f6d34d', '#f09ec0', '#ffffff'];
    for (var fw = 0; fw < 26; fw++) {
      var fx4 = R() * W, fy4 = gy + 150 + R() * 110;
      c.fillStyle = flowerCols[fw % 4];
      for (var pt = 0; pt < 4; pt++) {
        var pa = pt * Math.PI / 2 + 0.4;
        c.beginPath(); c.ellipse(fx4 + Math.cos(pa) * 3.4, fy4 + Math.sin(pa) * 3.4, 3, 2, pa, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#ffb52e';
      c.beginPath(); c.arc(fx4, fy4, 1.8, 0, Math.PI * 2); c.fill();
    }
    return cv;
  }

  /* ==========================================================
     VẼ KHUNG HÌNH
     ========================================================== */
  function createRenderer(canvas, CFG) {
    var CONFIG = CFG.CONFIG, RODS = CFG.RODS;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var anims = []; // hiệu ứng ngắn hạn {kind, seat, userId, species, weight, khung, wallAt}
    var bgCache = {}; // nền tĩnh theo trạng thái nước: normal | golden | monster

    function bgFor(mode) {
      if (!bgCache[mode]) bgCache[mode] = paintBackground(mode);
      return bgCache[mode];
    }
    function addFx(fx, wallNow) {
      fx.wallAt = wallNow;
      anims.push(fx);
      if (anims.length > 60) anims.splice(0, anims.length - 60);
    }

    /* ---------- lớp nước động mỏng phủ trên nền đệm ---------- */
    function drawWaterLife(snap, t) {
      var monsterOpen = snap.monster.windowOpen;
      ctx.save();
      ctx.beginPath(); ctx.rect(LAKE.x, LAKE.y, LAKE.w, LAKE.h); ctx.clip();
      // gợn sóng trôi chậm theo thời gian
      ctx.strokeStyle = monsterOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      for (var i = 0; i < 22; i++) {
        var drift = (t / (46 + (i % 5) * 9) + i * 137) % 900;
        var wx = LAKE.x + 16 + drift - 60;
        var wy = LAKE.y + 34 + (i * 53) % (LAKE.h - 68) + Math.sin(t / 800 + i * 1.7) * 3;
        var wl2 = 34 + (i % 4) * 13;
        ctx.beginPath(); ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + wl2 * 0.5, wy - 5, wx + wl2, wy); ctx.stroke();
      }
      // điểm sáng lấp lánh (thưa hơn khi thủy quái mở cửa sổ)
      var tw = monsterOpen ? 10 : 18;
      ctx.fillStyle = 'rgba(255,255,235,0.5)';
      for (var s3 = 0; s3 < tw; s3++) {
        var sx3 = LAKE.x + 40 + ((s3 * 211 + 90) % (LAKE.w - 80));
        var sy3 = LAKE.y + 50 + ((s3 * 331 + 140) % (LAKE.h - 100));
        var ph = (Math.sin(t / 620 + s3 * 2.4) + 1) / 2;
        if (ph < 0.45) continue;
        var r3 = 1.6 + ph * 2.6;
        ctx.globalAlpha = (ph - 0.4) * 1.1;
        ctx.beginPath(); ctx.arc(sx3, sy3, r3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sx3, sy3, r3 * 2.6, r3 * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // bóng cá lướt dưới nước (trang trí chuyển động, giữ nguyên bản Mốc 1)
      for (var f = 0; f < 4; f++) {
        var fx = 240 + ((t / (26 + f * 7) + f * 260) % 620);
        var fy = 620 + f * 240 + Math.sin(t / 700 + f * 2) * 14;
        drawFishShape(fx, fy, 46, monsterOpen ? 'rgba(20,36,26,0.34)' : 'rgba(30,50,35,0.28)', 1);
      }
      // bóng thủy quái + vây lưng khi cửa sổ mở (luật Mốc 1 giữ nguyên)
      if (monsterOpen) {
        var mx = 540 + Math.sin(t / 1100) * 190;
        var my = 1010 + Math.cos(t / 1300) * 90;
        ctx.fillStyle = 'rgba(12,22,16,0.48)';
        ctx.beginPath(); ctx.ellipse(mx, my, 155, 44, 0, 0, Math.PI * 2); ctx.fill();
        drawFishShape(mx + 60, my - 6, 126, 'rgba(12,22,16,0.55)', 1);
        ctx.fillStyle = 'rgba(10,18,12,0.6)';
        ctx.beginPath();
        ctx.moveTo(mx - 30, my - 26);
        ctx.quadraticCurveTo(mx - 8, my - 58, mx + 16, my - 28);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2.4;
        var mr = ((t / 9) % 46);
        ctx.beginPath(); ctx.ellipse(mx, my, 40 + mr * 2.2, 12 + mr * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    function drawFishShape(x, y, len, color, dir) {
      ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(-len * 0.1, -len * 0.30, len * 0.32, -len * 0.10);
      ctx.quadraticCurveTo(len * 0.48, -len * 0.04, len * 0.5, 0);
      ctx.quadraticCurveTo(len * 0.48, len * 0.04, len * 0.32, len * 0.10);
      ctx.quadraticCurveTo(-len * 0.1, len * 0.30, -len / 2, 0);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0); ctx.lineTo(-len * 0.68, -len * 0.22); ctx.lineTo(-len * 0.68, len * 0.22); ctx.closePath(); ctx.fill();
      // vây lưng + vạch thân mờ cho bóng cá có hồn hơn
      ctx.beginPath();
      ctx.moveTo(-len * 0.05, -len * 0.20); ctx.lineTo(len * 0.14, -len * 0.30); ctx.lineTo(len * 0.22, -len * 0.10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* ---------- cần thủ chibi chi tiết ---------- */
    function drawAngler(a, snap, t) {
      var isKing = a.isKing;
      var pos = isKing ? KING_SPOT : seatPos(a.seat, CONFIG.seatsPerBank || 12);
      var x = pos.x, y = pos.y;
      var dir = pos.bank === 'L' || isKing ? 1 : -1;
      if (isKing) dir = -1;
      var scale = isKing ? 1.45 : 1;
      var hseed = hashStr(a.userId);
      var color = SHIRT_COLORS[hseed % SHIRT_COLORS.length];
      var pants = PANTS_COLORS[(hseed >> 3) % PANTS_COLORS.length];
      var hair = HAIR_COLORS[(hseed >> 5) % HAIR_COLORS.length];
      var headwear = hseed % 3; // 0 nón lá · 1 tóc · 2 mũ lưỡi trai
      var hatCol = HAT_COLORS[(hseed >> 7) % HAT_COLORS.length];
      var rod = RODS[a.rodIdx];
      var bob = Math.sin(t / 480 + a.seat * 1.7) * 2.5;
      var fighting = a.phase === 'casting';

      // Ghế danh dự của Vua: thảm cỏ trang trí + nền bờ phủ sạch lớp sau
      // (như ảnh mẫu, lớp đè trông chủ động — giữ luật Mốc 1).
      if (isKing) {
        ctx.fillStyle = 'rgba(70,50,20,0.20)';
        ctx.beginPath(); ctx.ellipse(x, y - 8, 124, 186, 0, 0, Math.PI * 2); ctx.fill();
        var kg = ctx.createRadialGradient(x, y - 12, 30, x, y - 12, 180);
        kg.addColorStop(0, '#d3a964'); kg.addColorStop(0.8, '#c49a5e'); kg.addColorStop(1, 'rgba(196,154,94,0.55)');
        ctx.fillStyle = kg;
        ctx.beginPath(); ctx.ellipse(x, y - 12, 118, 180, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(146,108,30,0.5)'; ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.ellipse(x, y - 12, 108, 168, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);

      // ô che nắng cho Vua: cột + tán ô có gọng và tua viền
      if (isKing) {
        ctx.strokeStyle = '#7d5f28'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(30, 8); ctx.lineTo(30, -118); ctx.stroke();
        var ug = ctx.createLinearGradient(0, -172, 0, -100);
        ug.addColorStop(0, '#ffe082'); ug.addColorStop(0.7, '#f2c94c'); ug.addColorStop(1, '#dfa92e');
        ctx.fillStyle = ug;
        ctx.beginPath();
        ctx.moveTo(-96, -110);
        ctx.quadraticCurveTo(30, -178, 156, -110);
        ctx.quadraticCurveTo(104, -92, 66, -106);
        ctx.quadraticCurveTo(30, -90, -6, -105);
        ctx.quadraticCurveTo(-48, -92, -96, -110);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(160,110,20,0.55)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(30, -168); ctx.lineTo(-96, -110); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(30, -168); ctx.lineTo(30, -96); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(30, -168); ctx.lineTo(156, -110); ctx.stroke();
        ctx.fillStyle = '#c9932b';
        ctx.beginPath(); ctx.arc(30, -168, 4.5, 0, Math.PI * 2); ctx.fill();
      }

      // bóng tiếp đất mềm hai lớp
      ctx.fillStyle = 'rgba(50,38,16,0.16)';
      ctx.beginPath(); ctx.ellipse(0, 36, 46, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(50,38,16,0.26)';
      ctx.beginPath(); ctx.ellipse(0, 34, 34, 8, 0, 0, Math.PI * 2); ctx.fill();

      // GHẾ XẾP: tựa lưng vải + khung X + mặt ngồi
      ctx.strokeStyle = '#4c3a26'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-23 * dir, -26); ctx.lineTo(-13 * dir, 30);
      ctx.moveTo(13 * dir, -4); ctx.lineTo(21 * dir, 30);
      ctx.moveTo(-15 * dir, 2); ctx.lineTo(15 * dir, 2);
      ctx.stroke();
      ctx.fillStyle = '#3d6184';
      ctx.beginPath();
      if (dir > 0) { ctx.rect(-26, -36, 9, 34); } else { ctx.rect(17, -36, 9, 34); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      if (dir > 0) { ctx.rect(-26, -36, 9, 6); } else { ctx.rect(17, -36, 9, 6); }
      ctx.fill();
      ctx.fillStyle = '#2c4a66';
      ctx.beginPath(); ctx.rect(-17, -3, 34, 7); ctx.fill();

      // CHÂN + GIÀY (ngồi: đùi ngang, cẳng thả xuống)
      ctx.strokeStyle = pants; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(10 * dir, 8); ctx.lineTo(11 * dir, 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(2 * dir, 10); ctx.lineTo(3 * dir, 27); ctx.stroke();
      ctx.fillStyle = '#33302c';
      ctx.beginPath(); ctx.ellipse(12 * dir, 29, 7.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4 * dir, 30, 7, 3.8, 0, 0, Math.PI * 2); ctx.fill();

      // THÂN ÁO: có cổ, hàng cúc, túi ngực; tay áo ngắn + cánh tay
      var shirtGrad = ctx.createLinearGradient(0, -38, 0, 8);
      shirtGrad.addColorStop(0, color); shirtGrad.addColorStop(1, shade(color, -26));
      ctx.fillStyle = shirtGrad;
      rr(ctx, -17, -36, 34, 44, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.2;
      rr(ctx, -17, -36, 34, 44, 10); ctx.stroke();
      ctx.fillStyle = shade(color, -34);
      ctx.beginPath(); ctx.moveTo(-6, -36); ctx.lineTo(0, -28); ctx.lineTo(6, -36); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(0, -20, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -10, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = 1.1;
      ctx.strokeRect(dir > 0 ? 6.5 : -13.5, -24, 7, 6);
      // tay: tay áo + cánh tay da hướng tới chuôi cần
      ctx.strokeStyle = color; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(10 * dir, -28); ctx.lineTo(17 * dir, -21); ctx.stroke();
      ctx.strokeStyle = '#f2c79b'; ctx.lineWidth = 6.5;
      ctx.beginPath(); ctx.moveTo(17 * dir, -21); ctx.lineTo(25 * dir, -15); ctx.stroke();

      // ĐẦU: mặt có mắt/miệng + tai; tóc hoặc mũ theo từng người
      ctx.fillStyle = '#f2c79b';
      ctx.beginPath(); ctx.arc(-14, -47, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -47, 3.4, 0, Math.PI * 2); ctx.fill();
      var faceGrad = ctx.createRadialGradient(-4, -54, 3, 0, -48, 17);
      faceGrad.addColorStop(0, '#f8d7ae'); faceGrad.addColorStop(1, '#edb984');
      ctx.fillStyle = faceGrad;
      ctx.beginPath(); ctx.arc(0, -48, 15.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2019';
      ctx.beginPath(); ctx.arc(-5.2, -49, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5.2, -49, 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,30,0.65)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -42.5, 4.4, 0.25, Math.PI - 0.25); ctx.stroke();
      ctx.fillStyle = 'rgba(240,130,110,0.35)';
      ctx.beginPath(); ctx.ellipse(-9.5, -43.5, 3.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9.5, -43.5, 3.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      if (headwear === 0) {
        // nón lá có vân nan + quai
        var hg = ctx.createLinearGradient(0, -74, 0, -56);
        hg.addColorStop(0, '#f0d48c'); hg.addColorStop(1, '#dcbd66');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.moveTo(-23, -55); ctx.lineTo(0, -73); ctx.lineTo(23, -55); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(150,115,45,0.6)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(-14, -55); ctx.lineTo(-4, -66); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -55); ctx.lineTo(0, -71); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, -55); ctx.lineTo(4, -66); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,60,40,0.7)';
        ctx.beginPath(); ctx.moveTo(-13, -56); ctx.quadraticCurveTo(0, -48, 13, -56); ctx.stroke();
      } else if (headwear === 1) {
        // tóc: mái phủ trán + búi nhỏ sau đầu theo phía bờ
        ctx.fillStyle = hair;
        ctx.beginPath(); ctx.arc(0, -52, 15.5, Math.PI * 0.98, Math.PI * 2.02); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-15.5, -52); ctx.quadraticCurveTo(-8, -60, 0, -55);
        ctx.quadraticCurveTo(8, -60, 15.5, -52); ctx.lineTo(15.5, -47);
        ctx.quadraticCurveTo(0, -56, -15.5, -47); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(-13 * dir, -58, 5.4, 0, Math.PI * 2); ctx.fill();
      } else {
        // mũ lưỡi trai màu theo người + lưỡi mũ hướng ra hồ
        ctx.fillStyle = hatCol;
        ctx.beginPath(); ctx.arc(0, -53, 15, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-15, -54, 30, 4);
        ctx.beginPath(); ctx.ellipse(14 * dir, -51, 11, 3.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(0, -66, 2.6, 0, Math.PI * 2); ctx.fill();
      }

      // SỌT CÁ + xô nhỏ cạnh ghế (chi tiết đời thường)
      ctx.fillStyle = '#9c6b3f';
      ctx.beginPath(); ctx.moveTo(-34 * dir, 18); ctx.lineTo(-22 * dir, 18); ctx.lineTo(-24 * dir, 32); ctx.lineTo(-32 * dir, 32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(70,45,20,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-33 * dir, 23); ctx.lineTo(-23 * dir, 23); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-32.4 * dir, 27.5); ctx.lineTo(-23.6 * dir, 27.5); ctx.stroke();
      if ((hseed >> 4) % 2 === 0) drawFishShape(-28 * dir, 14, 13, '#b9c4c9', dir);

      // CẦN CÂU: thân cần có đốt + máy quay; cong theo trạng thái
      var tipX = 118 * dir, tipY = -66 + bob * 0.6;
      var bend = a.phase === 'waiting' ? 10 : 5;
      var midX = 70 * dir, midY = -52 - bend;
      if (rod.glow) {
        // vệt sáng quanh cần (luật hiển thị bậc cần — giữ nguyên)
        ctx.save();
        ctx.strokeStyle = rod.glow; ctx.globalAlpha = 0.30; ctx.lineWidth = 11; ctx.lineCap = 'round';
        ctx.shadowColor = rod.glow; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(22 * dir, -16);
        ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = '#5d4630'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(18 * dir, -13); ctx.lineTo(27 * dir, -17); ctx.stroke(); // chuôi
      ctx.strokeStyle = rod.glow || '#7a5636'; ctx.lineWidth = a.rodIdx >= 2 ? 5 : 4;
      ctx.beginPath(); ctx.moveTo(22 * dir, -16);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(24 * dir, -17.5);
      ctx.quadraticCurveTo(midX, midY - 1.5, tipX - 3 * dir, tipY); ctx.stroke();
      // máy quay nhỏ dưới chuôi
      ctx.fillStyle = '#3a3f45';
      ctx.beginPath(); ctx.arc(30 * dir, -9, 4.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8ccd2';
      ctx.beginPath(); ctx.arc(30 * dir, -9, 2, 0, Math.PI * 2); ctx.fill();

      // DÂY + PHAO (chỉ khi đang câu) — giữ luật hiển thị Mốc 1
      if (a.phase !== 'idle') {
        var bx = tipX + 26 * dir, by = 16 + bob;
        ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo(tipX + 16 * dir, -20, bx, by); ctx.stroke();
        // bóng phao trên mặt nước
        ctx.fillStyle = 'rgba(25,55,28,0.30)';
        ctx.beginPath(); ctx.ellipse(bx, by + 5, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        // gợn quanh phao
        ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 2;
        var rp = ((t / 14 + a.seat * 23) % 26);
        ctx.beginPath(); ctx.ellipse(bx, by + 3, 6 + rp, 2.5 + rp * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
        // phao đỏ trắng có bóng sáng
        ctx.fillStyle = '#e33f31'; ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, by - 2.5, 5.5, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(bx - 1.8, by - 1.8, 1.6, 0, Math.PI * 2); ctx.fill();
        // vệt sóng nhỏ sau phao khi đang chờ cắn
        if (a.phase === 'waiting') {
          ctx.strokeStyle = 'rgba(255,255,255,0.30)';
          ctx.beginPath(); ctx.ellipse(bx - 4 * dir, by + 6, 14, 3.6, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();

      // nhãn tên trên đầu (giữ trong khung hình kể cả ghế sát mép)
      var labelY = y - (isKing ? 152 : 96);
      var lx = Math.max(118, Math.min(962, x));
      var name = a.name;
      ctx.font = '700 25px "Segoe UI", Arial, sans-serif';
      var nw = Math.min(230, ctx.measureText(name).width + 26);
      if (isKing) {
        // biển danh hiệu vàng + vương miện (vẽ trước, nằm trên nhãn tên)
        ctx.save();
        ctx.shadowColor = 'rgba(30,20,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        var kgd = ctx.createLinearGradient(0, labelY - 56, 0, labelY - 24);
        kgd.addColorStop(0, '#ffe082'); kgd.addColorStop(0.6, '#ffc93c'); kgd.addColorStop(1, '#eda711');
        ctx.fillStyle = kgd;
        rr(ctx, lx - nw / 2, labelY - 56, nw, 32, 10); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(122,78,0,0.75)'; ctx.lineWidth = 2;
        rr(ctx, lx - nw / 2 + 1, labelY - 55, nw - 2, 30, 9); ctx.stroke();
        text(ctx, 'VUA CÂU CÁ', lx + 10, labelY - 40, 21, '#5d4300', 'center', '800');
        drawCrown(ctx, lx - nw / 2 + 22, labelY - 40, 0.95);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(6,18,10,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      var ng = ctx.createLinearGradient(0, labelY - 19, 0, labelY + 19);
      ng.addColorStop(0, 'rgba(24,46,36,0.94)'); ng.addColorStop(1, 'rgba(12,28,20,0.94)');
      ctx.fillStyle = ng;
      rr(ctx, lx - nw / 2, labelY - 19, nw, 38, 10); ctx.fill();
      ctx.restore();
      if (isKing) { ctx.strokeStyle = 'rgba(255,201,60,0.8)'; ctx.lineWidth = 1.8; rr(ctx, lx - nw / 2 + 1, labelY - 18, nw - 2, 36, 9); ctx.stroke(); }
      var ns = fitText(ctx, name, nw - 16, 25);
      textShadow(ctx, name, lx, labelY + 1, ns, '#ffffff', 'center', '700', 'rgba(0,0,0,0.6)');
      // nhãn bậc cần nhỏ dưới tên (phát sáng theo bậc — giữ luật Mốc 1)
      ctx.font = '600 17px "Segoe UI", Arial, sans-serif';
      var rw = ctx.measureText(rod.name).width + 16;
      ctx.fillStyle = rod.glow ? 'rgba(16,36,18,0.88)' : 'rgba(14,28,20,0.66)';
      rr(ctx, lx - rw / 2, labelY + 22, rw, 24, 8); ctx.fill();
      if (rod.glow) { ctx.strokeStyle = rod.glow; ctx.lineWidth = 1.4; rr(ctx, lx - rw / 2 + 0.7, labelY + 22.7, rw - 1.4, 22.6, 7); ctx.stroke(); }
      text(ctx, rod.name, lx, labelY + 34, 17, rod.glow || '#dfe8dc', 'center', '600');
    }
    /* tối/sáng một màu hex theo lượng (cho chuyển sắc áo) */
    function shade(hex, amt) {
      var n = parseInt(hex.slice(1), 16);
      var r = Math.max(0, Math.min(255, (n >> 16) + amt));
      var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
      var b = Math.max(0, Math.min(255, (n & 255) + amt));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    /* ---------- các lớp phủ thông tin ---------- */
    function drawHeader(snap) {
      // Tên game: chữ kem có viền nâu + bóng đổ như bảng hiệu (theo mẫu)
      ctx.save();
      ctx.font = '900 64px "Segoe UI", Arial, sans-serif';
      var gs = fitText(ctx, CONFIG.gameName, 560, 64, '900');
      ctx.lineWidth = 9; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(74,52,18,0.85)';
      ctx.shadowColor = 'rgba(20,40,20,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 5;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.strokeText(CONFIG.gameName, 28, SAFE_TOP + 52);
      ctx.shadowColor = 'transparent';
      var tg = ctx.createLinearGradient(0, SAFE_TOP + 24, 0, SAFE_TOP + 82);
      tg.addColorStop(0, '#fffbe9'); tg.addColorStop(0.6, '#fdf3cd'); tg.addColorStop(1, '#f3df9e');
      ctx.fillStyle = tg;
      ctx.fillText(CONFIG.gameName, 28, SAFE_TOP + 52);
      ctx.restore();
      // Tổng cá đã câu (dưới tên game, góc trái — theo mẫu)
      ctx.font = '700 27px "Segoe UI", Arial, sans-serif';
      var cstr = '◉ ' + snap.roomFish + ' cá đã câu';
      var cw2 = ctx.measureText(cstr).width + 24;
      panel(ctx, 18, SAFE_TOP + 84, cw2, 38, 10, 'rgba(10,30,20,0.55)', 'rgba(255,220,120,0.35)');
      textShadow(ctx, cstr, 30, SAFE_TOP + 104, 27, '#ffffff', 'left', '700');
      // Dải hướng dẫn xanh đậm viền vàng (theo mẫu)
      panel(ctx, 24, SAFE_TOP + 128, 1032, 52, 12, '#14452f');
      var hs = fitText(ctx, CONFIG.guideText, 990, 27);
      text(ctx, CONFIG.guideText, 540, SAFE_TOP + 155, hs, '#eaf5e6', 'center', '700');
      if (snap.golden.active) {
        ctx.save();
        ctx.shadowColor = 'rgba(90,60,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        var ggd = ctx.createLinearGradient(0, SAFE_TOP + 88, 0, SAFE_TOP + 122);
        ggd.addColorStop(0, '#ffd968'); ggd.addColorStop(1, '#f0ad1e');
        ctx.fillStyle = ggd;
        rr(ctx, 700, SAFE_TOP + 88, 356, 34, 9); ctx.fill();
        ctx.restore();
        text(ctx, 'GIỜ VÀNG ×2 ĐIỂM', 878, SAFE_TOP + 106, 23, '#5d4300', 'center', '800');
      }
    }

    function drawGiftTable() {
      /* Bảng phải kết thúc trước dải thông báo (y = SAFE_TOP + 232) để hai lớp
         không đè nhau — luật giữ từ Mốc 1. */
      var x = 752, y = SAFE_TOP + 6, w = 304, h = 200;
      panel(ctx, x, y, w, h, 14);
      text(ctx, 'TẶNG HOA HỒNG NÂNG CẦN', x + w / 2, y + 24, 20, '#ffe9a8', 'center', '800');
      var rows = [
        { n: '1', label: '= Cần trung cấp', glow: '#57e389' },
        { n: '10', label: '= Cần cao cấp', glow: '#4db2ff' },
        { n: '50', label: '= Cần thượng cổ', glow: '#ffc93c' }
      ];
      for (var i = 0; i < rows.length; i++) {
        var ry = y + 58 + i * 48;
        if (i > 0) {
          ctx.strokeStyle = 'rgba(255,230,160,0.14)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 14, ry - 23); ctx.lineTo(x + w - 14, ry - 23); ctx.stroke();
        }
        text(ctx, rows[i].n, x + 16, ry + 2, 27, '#ffffff', 'left', '800');
        drawRose(ctx, x + 44 + (rows[i].n.length > 1 ? 24 : 12), ry - 2, 0.95);
        // cây cần minh họa: thân cần cong + máy quay, phát sáng tăng dần theo bậc
        ctx.save();
        ctx.strokeStyle = rows[i].glow; ctx.lineWidth = 4.6;
        ctx.shadowColor = rows[i].glow; ctx.shadowBlur = 9 + i * 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + 116, ry + 12);
        ctx.quadraticCurveTo(x + 168, ry - 13 - i * 3, x + 224, ry + 1); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#454b52';
        ctx.beginPath(); ctx.arc(x + 128, ry + 15, 4.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cfd6da';
        ctx.beginPath(); ctx.arc(x + 128, ry + 15, 1.9, 0, Math.PI * 2); ctx.fill();
        var ls = fitText(ctx, rows[i].label, 172, 19, '600');
        text(ctx, rows[i].label, x + 116, ry + 26, ls, '#dfe8dc', 'left', '600');
      }
    }

    function drawNotice(snap) {
      var y = SAFE_TOP + 232;
      panel(ctx, 90, y, 900, 56, 14, 'rgba(13,42,29,0.96)');
      var n = snap.notice;
      if (!n) {
        text(ctx, 'Chào mừng đến với hồ câu! Chat "câu cá" để thả cần', 540, y + 29, 24, 'rgba(230,242,225,0.78)', 'center', '600');
        return;
      }
      var color = n.kind === 'monster' || n.kind === 'khung' ? '#ffd94d' : '#f2f7ee';
      if (n.kind === 'king' || n.kind === 'monster' || n.kind === 'khung') drawCrown(ctx, 138, y + 28, 0.9);
      // Văn bản thông báo do engine soạn có ký tự trang trí ở đầu (👑/🐟/🏆);
      // lớp vẽ đã thay bằng vương miện vẽ tay nên lược bỏ để không trùng lặp,
      // riêng thông báo nâng cần thì thay bằng hoa hồng vẽ tay ở cùng vị trí.
      var ntext = n.text.replace(/^[👑🐟🏆🌹]\s*/u, '');
      if (n.kind === 'upgrade') drawRose(ctx, 140, y + 22, 1.05);
      var s = fitText(ctx, ntext, 830, 27);
      textShadow(ctx, ntext, 540, y + 29, s, color, 'center', '700');
    }

    function drawMonsterBox(snap) {
      var x = 356, y = 918, w = 368, h = 138;
      var M = snap.monster;
      panel(ctx, x, y, w, h, 16,
        M.windowOpen ? 'rgba(122,32,20,0.95)' : 'rgba(13,42,29,0.95)',
        M.windowOpen ? '#ffab6b' : 'rgba(255,214,110,0.75)');
      if (M.windowOpen) {
        textShadow(ctx, CFGfmt(M.msWindowLeft), x + w / 2, y + 48, 56, '#ffd94d', 'center', '900');
        text(ctx, 'THỦY QUÁI ĐANG Ở TRONG HỒ!', x + w / 2, y + 104, 23, '#ffe9d0', 'center', '800');
      } else {
        textShadow(ctx, CFGfmt(M.msToNext), x + w / 2, y + 48, 56, '#fdf6d8', 'center', '900');
        text(ctx, 'Thủy quái xuất hiện sau', x + w / 2, y + 104, 24, '#dfe8dc', 'center', '600');
      }
      // Kết quả đợt trước (vinh danh 8 giây do engine giữ)
      if (M.lastResult && snap.now < M.lastResult.until) {
        var r = M.lastResult;
        panel(ctx, 190, y + h + 14, 700, 52, 12, 'rgba(96,66,0,0.95)');
        drawCrown(ctx, 226, y + h + 40, 1);
        var s = fitText(ctx, r.winnerName + ' vừa kéo được ' + r.species.name + ' · ' + r.weight.toFixed(2) + ' kg', 630, 24);
        text(ctx, r.winnerName + ' vừa kéo được ' + r.species.name + ' · ' + r.weight.toFixed(2) + ' kg', 556, y + h + 41, s, '#ffe9a8', 'center', '700');
      }
    }
    function CFGfmt(ms) {
      var s = Math.max(0, Math.ceil(ms / 1000));
      var m = Math.floor(s / 60), ss = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
    }

    function drawGate() {
      // Cổng chào dưới giữa hồ (theo mẫu): hai trụ gạch + biển gỗ vân + chữ khắc
      var y = 1568;
      // trụ gạch: thân gạch có hàng gạch so le + nắp đá
      for (var p = 0; p < 2; p++) {
        var px = p === 0 ? 306 : 732;
        ctx.fillStyle = 'rgba(60,30,15,0.35)';
        ctx.fillRect(px + 4, y + 92, 34, 6);
        var bg2 = ctx.createLinearGradient(px, 0, px + 34, 0);
        bg2.addColorStop(0, '#a8512f'); bg2.addColorStop(0.5, '#bc6242'); bg2.addColorStop(1, '#96452a');
        ctx.fillStyle = bg2; ctx.fillRect(px, y + 22, 34, 72);
        ctx.strokeStyle = 'rgba(240,215,190,0.4)'; ctx.lineWidth = 1.2;
        for (var br = 0; br < 4; br++) {
          var byy = y + 40 + br * 14;
          ctx.beginPath(); ctx.moveTo(px + 1, byy); ctx.lineTo(px + 33, byy); ctx.stroke();
          var off = br % 2 ? 8 : 20;
          ctx.beginPath(); ctx.moveTo(px + off, byy - 13); ctx.lineTo(px + off, byy); ctx.stroke();
        }
        ctx.fillStyle = '#8d8578'; ctx.fillRect(px - 4, y + 14, 42, 10);
        ctx.fillStyle = '#a39a8a'; ctx.fillRect(px - 4, y + 14, 42, 4);
      }
      // biển gỗ: hai tấm ghép + vân gỗ + đinh
      ctx.save();
      ctx.shadowColor = 'rgba(40,25,8,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      var wg = ctx.createLinearGradient(0, y, 0, y + 46);
      wg.addColorStop(0, '#bd9057'); wg.addColorStop(0.5, '#a87c4f'); wg.addColorStop(1, '#8f683d');
      ctx.fillStyle = wg;
      rr(ctx, 330, y, 420, 46, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#6e4f2a'; ctx.lineWidth = 3; rr(ctx, 330, y, 420, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(110,79,42,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(334, y + 23); ctx.lineTo(746, y + 23); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(360, y + 11); ctx.quadraticCurveTo(500, y + 7, 660, y + 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(380, y + 35); ctx.quadraticCurveTo(540, y + 39, 700, y + 34); ctx.stroke();
      ctx.fillStyle = '#5d4630';
      var nails = [[342, 9], [738, 9], [342, 37], [738, 37]];
      for (var ni = 0; ni < 4; ni++) { ctx.beginPath(); ctx.arc(nails[ni][0], y + nails[ni][1], 2.6, 0, Math.PI * 2); ctx.fill(); }
      var s = fitText(ctx, CONFIG.gateSign, 396, 27, '800');
      ctx.save();
      ctx.fillStyle = 'rgba(80,55,20,0.55)';
      ctx.font = '800 ' + s + 'px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(CONFIG.gateSign, 540, y + 25);
      ctx.restore();
      text(ctx, CONFIG.gateSign, 540, y + 24, s, '#fff3d0', 'center', '800');
    }

    function drawTop5(snap) {
      var x = 668, y = 1252, w = 388, h = 316;
      if (y + h > SAFE_BOTTOM) y = SAFE_BOTTOM - h; // không lấn vùng an toàn dưới
      panel(ctx, x, y, w, h, 14);
      drawCrown(ctx, x + 56, y + 31, 0.95);
      text(ctx, 'TOP 5 CẦN THỦ', x + w / 2 + 12, y + 32, 27, '#ffe9a8', 'center', '800');
      var top = snap.top5;
      if (top.length === 0) {
        text(ctx, 'Chưa có ai ghi điểm', x + w / 2, y + 84, 23, '#cfe0c8', 'center', '600');
      }
      for (var i = 0; i < top.length; i++) {
        var ry = y + 78 + i * 47;
        if (i === 0) {
          var hg2 = ctx.createLinearGradient(x, ry - 20, x, ry + 20);
          hg2.addColorStop(0, 'rgba(255,217,77,0.30)'); hg2.addColorStop(1, 'rgba(255,180,30,0.16)');
          ctx.fillStyle = hg2; rr(ctx, x + 10, ry - 20, w - 20, 40, 8); ctx.fill();
          ctx.strokeStyle = 'rgba(255,201,60,0.5)'; ctx.lineWidth = 1.2; rr(ctx, x + 10, ry - 20, w - 20, 40, 8); ctx.stroke();
        } else if (i % 2 === 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.045)'; rr(ctx, x + 10, ry - 20, w - 20, 40, 8); ctx.fill();
        }
        if (i > 0) {
          ctx.strokeStyle = 'rgba(255,230,160,0.10)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 16, ry - 23); ctx.lineTo(x + w - 16, ry - 23); ctx.stroke();
        }
        text(ctx, '0' + (i + 1), x + 22, ry, 25, i === 0 ? '#ffc93c' : i === 1 ? '#e8edf2' : i === 2 ? '#eda76a' : '#cfe0c8', 'left', '800');
        var ns = fitText(ctx, top[i].name, 240, 24);
        text(ctx, top[i].name, x + 66, ry, ns, '#ffffff', 'left', '700');
        text(ctx, String(top[i].points), x + w - 16, ry, 24, '#ffe9a8', 'right', '800');
      }
      // Hàng chờ ghế
      if (snap.queueNames.length) {
        panel(ctx, 24, y + 6, 620, 40, 10, 'rgba(10,35,24,0.88)');
        var qs = fitText(ctx, 'Đang chờ ghế: ' + snap.queueNames.join(', '), 596, 22, '600');
        text(ctx, 'Đang chờ ghế: ' + snap.queueNames.join(', '), 36, y + 27, qs, '#eaf5e6', 'left', '600');
      }
    }

    /* ---------- hiệu ứng từ engine ---------- */
    /* Hình cá chi tiết cho khung nhảy: thân có chuyển sắc, vây, mang, mắt.
       (drawFishShape ở trên vẫn dùng cho bóng cá dưới nước.) */
    function drawCatchFish(x, y, len, colorHex, dir, withFin) {
      ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
      var bodyGrad = ctx.createLinearGradient(0, -len * 0.3, 0, len * 0.3);
      bodyGrad.addColorStop(0, shade(colorHex, 42));
      bodyGrad.addColorStop(0.45, colorHex);
      bodyGrad.addColorStop(1, shade(colorHex, -38));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(-len * 0.1, -len * 0.32, len * 0.32, -len * 0.11);
      ctx.quadraticCurveTo(len * 0.48, -len * 0.05, len * 0.5, 0);
      ctx.quadraticCurveTo(len * 0.48, len * 0.05, len * 0.32, len * 0.11);
      ctx.quadraticCurveTo(-len * 0.1, len * 0.32, -len / 2, 0);
      ctx.closePath(); ctx.fill();
      // vảy: vài hàng cung mờ ở nửa trước thân
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1.3;
      for (var sc = 0; sc < 3; sc++) {
        for (var sc2 = 0; sc2 < 3; sc2++) {
          ctx.beginPath();
          ctx.arc(-len * 0.12 + sc * len * 0.11, -len * 0.10 + sc2 * len * 0.10, len * 0.055, 0.4, 2.4);
          ctx.stroke();
        }
      }
      // đuôi + vây
      ctx.fillStyle = shade(colorHex, -18);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0); ctx.lineTo(-len * 0.70, -len * 0.24); ctx.lineTo(-len * 0.64, 0); ctx.lineTo(-len * 0.70, len * 0.24); ctx.closePath(); ctx.fill();
      if (withFin) {
        ctx.beginPath();
        ctx.moveTo(-len * 0.02, -len * 0.24); ctx.lineTo(len * 0.16, -len * 0.36); ctx.lineTo(len * 0.24, -len * 0.12); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(len * 0.05, len * 0.18); ctx.lineTo(len * 0.20, len * 0.30); ctx.lineTo(len * 0.24, len * 0.08); ctx.closePath(); ctx.fill();
      }
      // vạch mang + miệng
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(len * 0.26, 0, len * 0.13, -1.1, 1.1); ctx.stroke();
      ctx.restore();
    }
    /* Vị trí hiệu ứng của một cần thủ: Vua Câu Cá ngồi ở ghế danh dự nên hiệu ứng
       phải bám ghế danh dự, không bám ghế thường trong sổ ghế của engine. */
    function fxPos(fx, snap) {
      if (fx.userId && snap && fx.userId === snap.kingUserId) return { x: KING_SPOT.x, y: KING_SPOT.y, bank: 'R' };
      return seatPos(fx.seat != null && fx.seat >= 0 ? fx.seat : 0, 12);
    }
    function drawAnims(snap, wallNow) {
      for (var i = anims.length - 1; i >= 0; i--) {
        var fx = anims[i];
        var age = wallNow - fx.wallAt;
        var life = fx.kind === 'monsterCaught' ? 2600 : fx.kind === 'upgrade' ? 1500 : 1300;
        if (age > life) { anims.splice(i, 1); continue; }
        var k = age / life;
        if (fx.kind === 'catch' || fx.kind === 'monsterCaught') {
          var big = fx.kind === 'monsterCaught';
          var pos = big ? { x: 540, y: 1080 } : fxPos(fx, snap);
          var dir = big ? 1 : (pos.bank === 'L' ? 1 : -1);
          var sx = big ? 540 : pos.x + 140 * dir;
          var sy = big ? 1150 : pos.y + 16;
          var arcY = sy - Math.sin(k * Math.PI) * (big ? 260 : 120);
          var arcX = sx + dir * k * (big ? 0 : 60);
          var len = big ? 190 : (fx.khung ? 96 : 58);
          ctx.save();
          ctx.translate(arcX, arcY); ctx.rotate(Math.sin(k * Math.PI * 2) * 0.2);
          drawCatchFish(0, 0, len, fx.species && fx.species.color ? fx.species.color : '#c9973f', dir, true);
          // mắt cá
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(len * 0.34, -len * 0.06, len * 0.045 + 1.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#22303a'; ctx.beginPath(); ctx.arc(len * 0.35, -len * 0.06, len * 0.026 + 0.8, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (fx.khung || big) {
            var tx = big ? 540 : Math.max(210, Math.min(870, arcX));
            var tstr = (big ? fx.species.name.toUpperCase() + ' ' : 'CÁ KHỦNG ') + (fx.weight ? fx.weight.toFixed(2) + ' kg' : '');
            ctx.save();
            ctx.font = '900 ' + (big ? 44 : 30) + 'px "Segoe UI", Arial, sans-serif';
            var tw3 = ctx.measureText(tstr).width + 34;
            var ty3 = big ? 760 : arcY - 90;
            ctx.shadowColor = 'rgba(40,25,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
            var tgd = ctx.createLinearGradient(0, ty3 - 24, 0, ty3 + 24);
            tgd.addColorStop(0, 'rgba(120,84,10,0.95)'); tgd.addColorStop(1, 'rgba(84,56,4,0.95)');
            ctx.fillStyle = tgd;
            rr(ctx, tx - tw3 / 2, ty3 - 25, tw3, 50, 12); ctx.fill();
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,214,110,0.85)'; ctx.lineWidth = 2;
            rr(ctx, tx - tw3 / 2 + 1, ty3 - 24, tw3 - 2, 48, 11); ctx.stroke();
            textShadow(ctx, tstr, tx, ty3 + 1, big ? 44 : 30, '#ffd94d', 'center', '900');
          }
          // tia nước ở điểm cá rời mặt nước
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - k)).toFixed(2) + ')'; ctx.lineWidth = 3;
          for (var d = -2; d <= 2; d++) {
            ctx.beginPath(); ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(sx + d * 12, sy - 26 - k * 20, sx + d * 20, sy - 8 - k * 34); ctx.stroke();
          }
          ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * (1 - k)).toFixed(2) + ')';
          for (var dr = 0; dr < 5; dr++) {
            var da = -0.5 + dr * 0.25, dd = 12 + k * 30 + (dr % 2) * 7;
            ctx.beginPath(); ctx.arc(sx + Math.sin(da) * dd, sy - Math.cos(da) * dd * 0.9 - 4, 2.2, 0, Math.PI * 2); ctx.fill();
          }
        } else if (fx.kind === 'escape') {
          var p2 = fxPos(fx, snap);
          var d2 = p2.bank === 'L' ? 1 : -1;
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)).toFixed(2) + ')'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(p2.x + 140 * d2, p2.y + 18, 12 + k * 30, 5 + k * 10, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (fx.kind === 'upgrade') {
          var p3 = fxPos(fx, snap);
          ctx.save();
          ctx.strokeStyle = 'rgba(255,217,77,' + (1 - k).toFixed(2) + ')'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.ellipse(p3.x, p3.y - 20, 26 + k * 46, 40 + k * 60, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
    }

    function draw(snap, wallNow) {
      var t = wallNow;
      ctx.clearRect(0, 0, W, H);
      var mode = snap.monster.windowOpen ? 'monster' : (snap.golden.active ? 'golden' : 'normal');
      ctx.drawImage(bgFor(mode), 0, 0);
      drawWaterLife(snap, t);
      // cần thủ: vẽ từ xa tới gần (theo hàng ghế tăng dần)
      var sorted = snap.anglers.slice().sort(function (a, b) { return a.seat - b.seat; });
      var king = null;
      for (var i = 0; i < sorted.length; i++) {
        if (sorted[i].isKing) { king = sorted[i]; continue; }
        drawAngler(sorted[i], snap, t);
      }
      if (king) drawAngler(king, snap, t); // Vua vẽ sau cùng, nổi bật nhất bờ phải
      drawAnims(snap, wallNow);
      drawGate();
      drawHeader(snap);
      drawGiftTable();
      drawNotice(snap);
      drawMonsterBox(snap);
      drawTop5(snap);
    }

    return { draw: draw, addFx: addFx, seatPos: seatPos, W: W, H: H };
  }

  root.HCRender = { createRenderer: createRenderer, seatPos: seatPos };
})(typeof self !== 'undefined' ? self : this);
