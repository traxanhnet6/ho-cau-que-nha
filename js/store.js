/* ============================================================
   HỒ CÂU QUÊ NHÀ — Lớp dữ liệu (Mốc 1)
   Kiến trúc tách lớp theo tài liệu 02 mục 4: engine chỉ nói chuyện
   qua giao diện này. Mốc 1 có hai bản cài đặt cùng giao diện:
   - LocalStore : lưu bền bằng localStorage của trình duyệt
   - MemoryStore: lưu trong RAM (dùng cho kiểm thử node + dự phòng
     khi localStorage không dùng được)
   Mốc sau thay bằng máy chủ chỉ cần viết thêm một bản cài đặt.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.HCStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_CATCHES = 500;
  var MAX_GIFTS = 500;

  function emptyData() {
    return { players: {}, catches: [], giftLedger: [], sessions: [] };
  }

  function blankPlayer(userId, displayName) {
    return {
      userId: userId,
      displayName: displayName || userId,
      points: 0,        // tổng điểm tích lũy mọi thời gian (căn cứ cấp bậc)
      balance: 0,       // điểm tiêu được (mồi, ghế đẹp...)
      fish: 0,          // tổng số cá mọi thời gian
      kg: 0,            // tổng cân nặng mọi thời gian
      monsterWins: 0,   // số lần thắng thủy quái mọi thời gian
      sessionsAttended: 0,
      titles: [],       // danh hiệu đã đạt (lưu bền)
      lastSeen: 0
    };
  }

  function StoreBase(persistFn) {
    this._data = emptyData();
    this._persistFn = persistFn || null;
  }
  StoreBase.prototype._persist = function () {
    if (this._persistFn) { try { this._persistFn(this._data); } catch (e) { /* bỏ qua lỗi lưu */ } }
  };
  StoreBase.prototype.load = function (data) {
    if (data && typeof data === 'object') {
      this._data = {
        players: data.players || {},
        catches: data.catches || [],
        giftLedger: data.giftLedger || [],
        sessions: data.sessions || []
      };
    }
    return this;
  };
  StoreBase.prototype.getPlayer = function (userId) {
    return this._data.players[userId] || null;
  };
  StoreBase.prototype.ensurePlayer = function (userId, displayName, now) {
    var p = this._data.players[userId];
    if (!p) { p = blankPlayer(userId, displayName); this._data.players[userId] = p; }
    if (displayName) p.displayName = displayName;
    if (now) p.lastSeen = now;
    return p;
  };
  StoreBase.prototype.savePlayer = function (player) {
    this._data.players[player.userId] = player;
    this._persist();
  };
  StoreBase.prototype.recordCatch = function (c) {
    this._data.catches.push(c);
    if (this._data.catches.length > MAX_CATCHES) this._data.catches.splice(0, this._data.catches.length - MAX_CATCHES);
    this._persist();
  };
  StoreBase.prototype.recordGift = function (g) {
    this._data.giftLedger.push(g);
    if (this._data.giftLedger.length > MAX_GIFTS) this._data.giftLedger.splice(0, this._data.giftLedger.length - MAX_GIFTS);
    this._persist();
  };
  StoreBase.prototype.recordSession = function (s) {
    this._data.sessions.push(s);
    this._persist();
  };
  StoreBase.prototype.getAllPlayers = function () {
    var out = [];
    for (var k in this._data.players) if (Object.prototype.hasOwnProperty.call(this._data.players, k)) out.push(this._data.players[k]);
    return out;
  };
  StoreBase.prototype.getCatches = function () { return this._data.catches.slice(); };
  StoreBase.prototype.getGiftLedger = function () { return this._data.giftLedger.slice(); };
  StoreBase.prototype.getSessions = function () { return this._data.sessions.slice(); };

  function MemoryStore() { StoreBase.call(this, null); }
  MemoryStore.prototype = Object.create(StoreBase.prototype);
  MemoryStore.prototype.constructor = MemoryStore;

  function LocalStore(storageKey, ls) {
    var storage = ls || (typeof localStorage !== 'undefined' ? localStorage : null);
    var self = this;
    StoreBase.call(this, function (data) {
      if (storage) storage.setItem(storageKey, JSON.stringify(data));
    });
    if (storage) {
      try {
        var raw = storage.getItem(storageKey);
        if (raw) this.load(JSON.parse(raw));
      } catch (e) { /* dữ liệu hỏng -> bắt đầu trắng */ }
    }
  }
  LocalStore.prototype = Object.create(StoreBase.prototype);
  LocalStore.prototype.constructor = LocalStore;

  function createBestStore(storageKey) {
    try {
      var probe = '__hc_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return new LocalStore(storageKey);
    } catch (e) {
      return new MemoryStore();
    }
  }

  return {
    MemoryStore: MemoryStore,
    LocalStore: LocalStore,
    createBestStore: createBestStore,
    blankPlayer: blankPlayer
  };
});
