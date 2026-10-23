/* Progress uses the original storage key. Resume stores only a validated chapter ID. */
(function () {
  "use strict";
  var KEY = "sd-learn:learner-state:v1";
  var RESUME_KEY = "sd-learn:last-chapter:v1";
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.version === 1 && Array.isArray(o.completedChapters)) return o;
    } catch (e) { /* Invalid data becomes empty progress. */ }
    return { version: 1, updatedAt: "", completedChapters: [] };
  }
  function save(o) {
    o.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* Private mode. */ }
  }
  function has(o, id) { return o.completedChapters.indexOf(id) !== -1; }
  document.addEventListener("DOMContentLoaded", function () {
    var art = document.querySelector("article.chapter");
    var btn = document.querySelector(".read-toggle");
    if (art && /^ch(?:0[1-9]|[1-3][0-9]|4[0-5])$/.test(art.dataset.ch)) {
      try { localStorage.setItem(RESUME_KEY, art.dataset.ch); } catch (e) { /* Private mode. */ }
    }
    if (art && art.dataset.ch && btn) {
      var id = art.dataset.ch;
      var paint = function () {
        var on = has(load(), id);
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
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
      window.addEventListener("pageshow", paint);
      window.addEventListener("storage", paint);
    }
    var cards = Array.prototype.slice.call(document.querySelectorAll(".card[data-ch]"));
    if (!cards.length) return;
    function paintHome() {
      var o = load(), done = 0, last;
      cards.forEach(function (c) {
        var on = has(o, c.getAttribute("data-ch"));
        c.classList.toggle("is-read", on);
        if (on) done++;
      });
      var total = cards.length;
      var fill = document.querySelector(".progress-fill");
      var track = document.querySelector(".progress-track");
      if (fill) fill.style.width = Math.round(done / total * 100) + "%";
      if (track) {
        track.setAttribute("aria-valuenow", done);
        track.setAttribute("aria-valuemax", total);
        track.setAttribute("aria-label", document.documentElement.getAttribute("data-locale") === "en" ? "Learning progress" : "学习进度");
      }
      document.querySelector(".progress-text .lang-zh").textContent = "已学 " + done + " / " + total;
      document.querySelector(".progress-text .lang-en").textContent = done + " / " + total + " completed";
      try { last = localStorage.getItem(RESUME_KEY); } catch (e) { /* Private mode. */ }
      var recent = cards.find(function (c) { return c.getAttribute("data-ch") === last; });
      var next = cards.find(function (c) { return !has(o, c.getAttribute("data-ch")); });
      var target = recent && !has(o, last) ? recent : (next || recent || cards[0]);
      var link = document.querySelector(".continue-link");
      var title = document.querySelector(".continue-title");
      if (link && target) {
        link.href = target.getAttribute("href");
        link.querySelector(".lang-zh").textContent = done === total ? "回顾章节" : (recent || done ? "继续学习" : "开始学习");
        link.querySelector(".lang-en").textContent = done === total ? "Review a chapter" : (recent || done ? "Continue learning" : "Start learning");
        if (title) {
          ["zh", "en"].forEach(function (locale) {
            var source = target.querySelector(".ch-title .lang-" + locale);
            var destination = title.querySelector(".lang-" + locale);
            if (destination && source) destination.textContent = target.dataset.ch.replace("ch", "Ch") + " · " + source.textContent;
          });
        }
      }
    }
    paintHome();
    window.addEventListener("pageshow", paintHome);
    window.addEventListener("storage", paintHome);
    document.addEventListener("sd-locale", paintHome);
  });
})();
