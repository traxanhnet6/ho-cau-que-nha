/* ============================================================
   HỒ CÂU QUÊ NHÀ — Giao diện sự kiện dùng chung (Mốc 1)
   Đây là HỢP ĐỒNG sự kiện duy nhất của hệ thống (tài liệu 02, mục 3):
   mọi nguồn sự kiện — bộ mô phỏng chat (Mốc 1), cầu nối TikTok thật
   (Mốc 2), ô gõ tay của chủ phòng — đều phát sự kiện theo đúng khuôn
   này vào bus; máy game chỉ nghe bus, không biết nguồn là ai.

   Khuôn sự kiện:
   { type:'chat', userId, displayName, text }
   { type:'gift', userId, displayName,
       giftId:'rose', giftName:'Hoa hồng',
       chainId,            // mã chuỗi combo — mỗi chuỗi tặng liên tiếp một mã
       repeatCount,        // tổng số quà của chuỗi tính đến sự kiện này
       state:'ongoing'|'finished' }  // chuỗi còn tiếp diễn hay đã kết thúc
   { type:'like', userId, displayName, count }
   { type:'join', userId, displayName }
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.HCEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createBus() {
    var listeners = [];
    return {
      subscribe: function (fn) {
        listeners.push(fn);
        return function unsubscribe() {
          var i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      emit: function (ev) {
        if (!ev || !ev.type) return;
        for (var i = 0; i < listeners.length; i++) listeners[i](ev);
      }
    };
  }

  var seq = 0;
  function nextChainId(prefix) {
    seq += 1;
    return (prefix || 'chain') + '-' + Date.now().toString(36) + '-' + seq;
  }

  return { createBus: createBus, nextChainId: nextChainId };
});
