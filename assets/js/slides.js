/* 幻灯片：进入视口自动落笔；用户操作后交回手动控制。 */
(function () {
  "use strict";

  var activeDeck = null;
  var controllers = [];
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var speedSteps = [0.5, 1, 1.5, 2];
  var speedIndex = speedSteps.indexOf(Number(readSetting("sd-deck-speed", "1")));
  var loopEnabled = readSetting("sd-deck-loop", "on") !== "off";
  if (speedIndex < 0) speedIndex = 1;

  function readSetting(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function saveSetting(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* file:// may deny storage */ }
  }

  function refreshAll() {
    controllers.forEach(function (controller) { controller.applyPrefs(); });
  }

  function words() {
    var en = document.documentElement.getAttribute("data-locale") === "en";
    return en ? {
      prev: "Prev", next: "Next", play: "Play", pause: "Pause", replay: "Replay",
      speed: "Speed", speedTitle: "Speed: click to change", loopOn: "Loop on",
      loopOff: "Loop off", loopTitle: "Toggle automatic repeat", step: "Go to stroke "
    } : {
      prev: "上一步", next: "下一步", play: "播放", pause: "暂停", replay: "重播",
      speed: "速度", speedTitle: "速度：点击切换", loopOn: "循环开",
      loopOff: "循环关", loopTitle: "切换自动重复播放", step: "跳到第 "
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
    var interval = Math.max(900, Number(fig.getAttribute("data-interval")) || 1800);
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
    var speed = document.createElement("button");
    speed.type = "button";
    speed.className = "deck-speed";
    var loop = document.createElement("button");
    loop.type = "button";
    loop.className = "deck-loop";
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
    bar.appendChild(toggle);
    bar.appendChild(prev);
    bar.appendChild(next);
    bar.appendChild(speed);
    bar.appendChild(loop);
    bar.appendChild(count);
    bar.appendChild(dots);
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
      speed.textContent = word.speed + " " + speedSteps[speedIndex] + "×";
      speed.title = word.speedTitle;
      speed.setAttribute("aria-label", speed.textContent);
      speed.hidden = Boolean(reduced && reduced.matches);
      loop.textContent = loopEnabled ? word.loopOn : word.loopOff;
      loop.title = word.loopTitle;
      loop.setAttribute("aria-label", loop.textContent);
      loop.setAttribute("aria-pressed", loopEnabled ? "true" : "false");
      loop.hidden = Boolean(reduced && reduced.matches);
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
          if (loopEnabled) {
            show(0);
            schedule();
          } else {
            stop(true);
          }
          return;
        }
        show(i + 1);
        schedule();
      }, interval / speedSteps[speedIndex]);
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
    speed.addEventListener("click", function () {
      speedIndex = (speedIndex + 1) % speedSteps.length;
      saveSetting("sd-deck-speed", String(speedSteps[speedIndex]));
      refreshAll();
    });
    loop.addEventListener("click", function () {
      loopEnabled = !loopEnabled;
      saveSetting("sd-deck-loop", loopEnabled ? "on" : "off");
      refreshAll();
    });
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
      if (event.key === "s" || event.key === "S") { speed.click(); event.preventDefault(); }
      if (event.key === "l" || event.key === "L") { loop.click(); event.preventDefault(); }
    });
    fig.addEventListener("focusin", function (event) {
      if (event.target === fig) takeOver();
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
      },
      applyPrefs: function () {
        updateControls();
        if (running) schedule();
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
      if (api) {
        controllers.push(api);
        entries.push({ fig: fig, api: api });
      }
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
