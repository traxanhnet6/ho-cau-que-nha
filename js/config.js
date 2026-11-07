/* ============================================================
   HỒ CÂU QUÊ NHÀ — Cấu hình trung tâm (Mốc 1)
   Mọi con số gameplay lấy từ bộ tài liệu thiết kế đã duyệt
   (~/workspace/fishing-live-design/01-thiet-ke-game.md).
   Tên game nằm DUY NHẤT ở đây (CONFIG.gameName) — đổi một dòng là xong.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.HCConfig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = {
    gameName: 'HỒ CÂU QUÊ NHÀ',        // <-- TÊN GAME: chỉ sửa ở đây
    gateSign: 'Ở ĐÂY CÓ CÁ LỚN',        // biển cổng chào (theo mẫu)
    guideText: 'Chat "câu cá" để thả cần · Xem số cá câu được? Chat "báo cá"',
    maxSeats: 24,                       // 12 ghế mỗi bờ (mục 1)
    seatsPerBank: 12,
    idleLeaveMs: 10 * 60 * 1000,        // vắng mặt 10 phút -> tự rời ghế (mục 2)
    recastMs: 2500,                     // nghỉ giữa hai lần thả cần (mục 2: 2-3 giây)
    castAnimMs: 800,
    firstInLakeBonus: 50,               // điểm danh dự người đầu tiên vào hồ (mục 8)
    monsterCycleMs: 5 * 60 * 1000,      // chu kỳ thủy quái 5 phút (mục 6)
    monsterWindowMs: 90 * 1000,         // cửa sổ săn 90 giây (mục 6)
    monsterSupportRate: 0.02,           // điểm hỗ trợ = 2% điểm thủy quái (mục 6)
    goldenHourStartMs: 40 * 60 * 1000,  // giờ vàng: phút 40-50 của buổi (mục 10)
    goldenHourEndMs: 50 * 60 * 1000,
    goldenHourManualMs: 10 * 60 * 1000, // chủ phòng kích tay: kéo dài 10 phút
    baitCost: 200,                      // Mồi Ngon: 200 điểm (mục 8)
    baitDurationMs: 10 * 60 * 1000,     // 10 phút (mục 8)
    baitWaitFactor: 0.7,                // chờ cắn nhanh hơn 30% (mục 8)
    baitRareFactor: 1.5,                // tỉ lệ cá hiếm x1,5 (mục 8)
    bigFishQuantile: 0.85,              // vượt 85% dải cân nặng = CÁ KHỦNG (mục 3)
    bigFishBaseChance: 0.12,            // xác suất nền rơi vào vùng cân nặng cao
    storageKey: 'hocauquena_store_v1'
  };

  /* Bảng loài cá — tài liệu 01, mục 3.
     rate: tỉ lệ cắn (%) với cần cơ bản; ppk: điểm mỗi kg. */
  var SPECIES = [
    // Hạng thường (tổng 72%)
    { id: 'ro_dong',    name: 'Cá rô đồng',    tier: 'common', minKg: 0.05, maxKg: 0.5, ppk: 30, rate: 18, color: '#8a6d3b' },
    { id: 'diec',       name: 'Cá diếc',       tier: 'common', minKg: 0.05, maxKg: 0.4, ppk: 30, rate: 14, color: '#b8b0a0' },
    { id: 'ro_phi',     name: 'Cá rô phi',     tier: 'common', minKg: 0.2,  maxKg: 1.5, ppk: 25, rate: 12, color: '#7d8a99' },
    { id: 'chep',       name: 'Cá chép',       tier: 'common', minKg: 0.3,  maxKg: 2.5, ppk: 25, rate: 12, color: '#c9973f' },
    { id: 'tram_co',    name: 'Cá trắm cỏ',    tier: 'common', minKg: 0.5,  maxKg: 4,   ppk: 22, rate: 9,  color: '#6f9e5f' },
    { id: 'loc',        name: 'Cá lóc',        tier: 'common', minKg: 0.3,  maxKg: 2,   ppk: 28, rate: 7,  color: '#5d6e46' },
    // Hạng hiếm (tổng 25%)
    { id: 'tre',        name: 'Cá trê',        tier: 'rare',   minKg: 0.5,  maxKg: 5,   ppk: 40, rate: 7,  color: '#4c4a55' },
    { id: 'chim_trang', name: 'Cá chim trắng', tier: 'rare',   minKg: 0.5,  maxKg: 3,   ppk: 45, rate: 6,  color: '#cfd6da' },
    { id: 'lang',       name: 'Cá lăng',       tier: 'rare',   minKg: 1,    maxKg: 8,   ppk: 55, rate: 5,  color: '#93765a' },
    { id: 'chep_vang',  name: 'Cá chép vàng',  tier: 'rare',   minKg: 0.5,  maxKg: 3,   ppk: 60, rate: 4,  color: '#e8b91f' },
    { id: 'ho',         name: 'Cá hô',         tier: 'rare',   minKg: 2,    maxKg: 15,  ppk: 50, rate: 3,  color: '#a8583a' },
    // Hạng cực hiếm (tổng 3%)
    { id: 'rong',       name: 'Cá rồng',       tier: 'ultra',  minKg: 1,    maxKg: 6,   ppk: 150, rate: 2, color: '#d8d8e2' },
    { id: 'ba_ba',      name: 'Ba ba sông',    tier: 'ultra',  minKg: 1,    maxKg: 7,   ppk: 120, rate: 1, color: '#5f7050' }
  ];

  /* Thủy quái — tài liệu 01, mục 3 + mục 6. Hai loài luân phiên nhau. */
  var MONSTERS = [
    { id: 'tram_den', name: 'Ông Trắm Đen', minKg: 30, maxKg: 80,  ppk: 100, color: '#22303a' },
    { id: 'ca_ho_me', name: 'Mẹ Cá Hô',     minKg: 40, maxKg: 100, ppk: 100, color: '#5a2e22' }
  ];

  /* Hệ cần câu — tài liệu 01, mục 4.
     roses: tổng Hoa hồng trong buổi để đạt bậc; weight: trọng số vé thủy quái (mục 6). */
  var RODS = [
    { id: 'basic',   name: 'Cần cơ bản',  roses: 0,  waitMin: 25, waitMax: 45, escape: 0.15, rareMult: 1,   bigMult: 1,   bonus: 0,    weight: 1, glow: null },
    { id: 'mid',     name: 'Cần trung cấp', roses: 1,  waitMin: 18, waitMax: 32, escape: 0.10, rareMult: 1.6, bigMult: 1.3, bonus: 0,    weight: 2, glow: '#57e389' },
    { id: 'high',    name: 'Cần cao cấp',   roses: 10, waitMin: 12, waitMax: 24, escape: 0.07, rareMult: 2.2, bigMult: 1.8, bonus: 0.10, weight: 3, glow: '#4db2ff' },
    { id: 'ancient', name: 'Cần thượng cổ', roses: 50, waitMin: 8,  waitMax: 16, escape: 0.04, rareMult: 3,   bigMult: 2.5, bonus: 0.25, weight: 5, glow: '#ffc93c' }
  ];

  /* Cấp bậc cần thủ dài hạn — tài liệu 01, mục 7.
     [KHAI BÁO MỐC 1] Tài liệu chỉ cho tên 5 cấp, không cho mốc điểm;
     các mốc dưới đây là lựa chọn đơn giản nhất hợp tinh thần tài liệu. */
  var RANKS = [
    { name: 'Tân Thủ',        minPoints: 0 },
    { name: 'Cần Thủ',        minPoints: 1000 },
    { name: 'Tay Câu Cừ',     minPoints: 5000 },
    { name: 'Bậc Thầy Câu',   minPoints: 20000 },
    { name: 'Huyền Thoại Hồ', minPoints: 100000 }
  ];

  /* Hồi chiêu lệnh chat (ms) — tài liệu 01, mục 11.
     [KHAI BÁO MỐC 1] Tài liệu chỉ định rõ câu cá/nghỉ 5 giây và
     báo cá/top/điểm 30 giây; các lệnh còn lại áp 10 giây cho đồng nhất. */
  var COMMAND_COOLDOWNS = {
    cauca: 5000, nghi: 5000,
    baoca: 30000, top: 30000, diem: 30000,
    can: 10000, moi: 10000, thuyquai: 10000
  };

  return { CONFIG: CONFIG, SPECIES: SPECIES, MONSTERS: MONSTERS, RODS: RODS, RANKS: RANKS, COMMAND_COOLDOWNS: COMMAND_COOLDOWNS };
});
