/* 幻灯片：进入视口自动落笔；用户操作后交回手动控制。 */
(function () {
  "use strict";

  var activeDeck = null;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function words() {
    var en = document.documentElement.getAttribute("data-locale") === "en";
    return en ? {
      prev: "Prev stroke", next: "Next stroke", play: "Play", pause: "Pause",
      replay: "Replay", step: "Go to stroke "
    } : {
      prev: "上一笔", next: "下一笔", play: "播放", pause: "暂停",
      replay: "重播", step: "跳到第 "
    };
  }

  function boot(fig) {
    var slides = Array.prototype.filter.call(fig.children, function (el) {
      return el.classList && el.classList.contains("slide");
    });
    if (!slides.length) return null;

    var i = 0;
    var timer = 0;
    var running = false;
    var finished = false;
    var takenOver = false;
    var visible = false;
    var interval = Math.max(1800, Number(fig.getAttribute("data-interval")) || 3500);
    var autoplay = fig.getAttribute("data-autoplay") !== "off";

    fig.tabIndex = 0;
    fig.setAttribute("role", "group");

    var bar = document.createElement("div");
    bar.className = "deck-bar";
    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "deck-prev";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "deck-toggle";
    toggle.setAttribute("aria-pressed", "false");
    var count = document.createElement("span");
    count.className = "deck-count";
    var dots = document.createElement("div");
    dots.className = "deck-dots";
    var next = document.createElement("button");
    next.type = "button";
    next.className = "deck-next";

    slides.forEach(function (_, n) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "dot";
      dot.addEventListener("click", function () {
        takeOver();
        show(n);
      });
      dots.appendChild(dot);
    });
    bar.appendChild(prev);
    bar.appendChild(toggle);
    bar.appendChild(count);
    bar.appendChild(dots);
    bar.appendChild(next);
    fig.appendChild(bar);

    function clearTimer() {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    }

    function updateControls() {
      var word = words();
      prev.textContent = word.prev;
      next.textContent = word.next;
      toggle.textContent = finished ? word.replay : (running ? word.pause : word.play);
      toggle.hidden = Boolean(reduced && reduced.matches);
      toggle.setAttribute("aria-label", toggle.textContent);
      toggle.setAttribute("aria-pressed", running ? "true" : "false");
      count.textContent = (i + 1) + " / " + slides.length;
      Array.prototype.forEach.call(dots.children, function (dot, n) {
        dot.classList.toggle("is-on", n === i);
        dot.setAttribute("aria-label", word.step + (n + 1));
        dot.setAttribute("aria-current", n === i ? "step" : "false");
      });
      prev.disabled = i === 0;
      next.disabled = i === slides.length - 1;
    }

    function show(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach(function (slide, n2) {
        var on = n2 === i;
        slide.classList.toggle("is-on", on);
        slide.setAttribute("aria-hidden", on ? "false" : "true");
      });
      updateControls();
    }

    function stop(markFinished) {
      clearTimer();
      running = false;
      if (markFinished) finished = true;
      if (activeDeck === api) activeDeck = null;
      updateControls();
    }

    function schedule() {
      clearTimer();
      if (!running) return;
      timer = window.setTimeout(function () {
        if (i >= slides.length - 1) {
          stop(true);
          return;
        }
        show(i + 1);
        schedule();
      }, interval);
    }

    function play(fromUser) {
      if (!fromUser && (!visible || takenOver || finished || !autoplay)) return;
      if (reduced && reduced.matches) return;
      if (activeDeck && activeDeck !== api) activeDeck.pause(false);
      activeDeck = api;
      running = true;
      finished = false;
      updateControls();
      schedule();
    }

    function takeOver() {
      takenOver = true;
      stop(false);
    }

    prev.addEventListener("click", function () { takeOver(); show(i - 1); });
    next.addEventListener("click", function () { takeOver(); show(i + 1); });
    toggle.addEventListener("click", function () {
      if (running) { takeOver(); return; }
      if (finished || i === slides.length - 1) show(0);
      takenOver = false;
      play(true);
    });
    fig.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight") { takeOver(); show(i + 1); event.preventDefault(); }
      if (event.key === "ArrowLeft") { takeOver(); show(i - 1); event.preventDefault(); }
      if (event.key === " ") { toggle.click(); event.preventDefault(); }
    });
    fig.addEventListener("focusin", function (event) {
      if (event.target !== toggle) takeOver();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && running) stop(false);
      else if (!document.hidden) play(false);
    });
    document.addEventListener("sd-locale", updateControls);

    var api = {
      play: play,
      pause: function (markFinished) { stop(Boolean(markFinished)); },
      setVisible: function (value) {
        visible = value;
        if (visible) play(false);
        else if (running) stop(false);
      }
    };

    if (reduced && reduced.addEventListener) {
      reduced.addEventListener("change", function () {
        if (reduced.matches && running) stop(false);
        updateControls();
      });
    }

    show(0);
    return api;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var entries = [];
    document.querySelectorAll("figure.deck").forEach(function (fig) {
      var api = boot(fig);
      if (api) entries.push({ fig: fig, api: api });
    });

    if (!("IntersectionObserver" in window)) {
      if (entries[0]) entries[0].api.setVisible(true);
      return;
    }

    var observer = new IntersectionObserver(function (observed) {
      observed.forEach(function (entry) {
        var match = entries.find(function (item) { return item.fig === entry.target; });
        if (match) match.api.setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.6);
      });
    }, { threshold: [0, 0.6, 1] });
    entries.forEach(function (entry) { observer.observe(entry.fig); });
  });
})();
