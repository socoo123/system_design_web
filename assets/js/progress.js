/* 已学进度。沿用旧站 localStorage，刷新不丢。 */
(function () {
  "use strict";
  var KEY = "sd-learn:learner-state:v1";

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.version === 1 && Array.isArray(o.completedChapters)) return o;
    } catch (e) { /* 坏数据当空 */ }
    return { version: 1, updatedAt: "", completedChapters: [] };
  }

  function save(o) {
    o.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 隐私模式 */ }
  }

  function has(o, id) {
    return o.completedChapters.indexOf(id) !== -1;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var art = document.querySelector("article.chapter");
    var btn = document.querySelector(".read-toggle");
    if (art && art.dataset.ch && btn) {
      var id = art.dataset.ch;
      var paint = function () {
        btn.classList.toggle("is-on", has(load(), id));
      };
      paint();
      btn.addEventListener("click", function () {
        var o = load();
        var at = o.completedChapters.indexOf(id);
        if (at === -1) o.completedChapters.push(id);
        else o.completedChapters.splice(at, 1);
        save(o);
        paint();
      });
    }

    var cards = document.querySelectorAll(".card[data-ch]");
    var zh = document.querySelector(".progress-text .lang-zh");
    var en = document.querySelector(".progress-text .lang-en");
    var fill = document.querySelector(".progress-fill");
    if (!cards.length) return;
    var o = load();
    var done = 0;
    cards.forEach(function (c) {
      var on = has(o, c.getAttribute("data-ch"));
      c.classList.toggle("is-read", on);
      if (on) done++;
    });
    var total = cards.length;
    if (fill) fill.style.width = Math.round(done / total * 100) + "%";
    if (zh) zh.textContent = "已学 " + done + " / " + total;
    if (en) en.textContent = done + " / " + total + " done";
  });
})();
