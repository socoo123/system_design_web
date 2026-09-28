/* 幻灯片：figure.deck 里按白板落笔顺序翻页。方向键在焦点落在这组图上时生效。 */
(function () {
  "use strict";

  function labels() {
    var en = document.documentElement.getAttribute("data-locale") === "en";
    return en ? { prev: "Prev", next: "Next" } : { prev: "上一笔", next: "下一笔" };
  }

  function boot(fig) {
    var slides = Array.prototype.filter.call(fig.children, function (el) {
      return el.classList && el.classList.contains("slide");
    });
    if (!slides.length) return;
    var i = 0;
    fig.tabIndex = 0;

    var bar = document.createElement("div");
    bar.className = "deck-bar";
    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "deck-prev";
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
      dot.addEventListener("click", function () { show(n); });
      dots.appendChild(dot);
    });
    bar.appendChild(prev);
    bar.appendChild(count);
    bar.appendChild(dots);
    bar.appendChild(next);
    fig.appendChild(bar);

    function show(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      slides.forEach(function (s, k) { s.classList.toggle("is-on", k === i); });
      var word = labels();
      prev.textContent = word.prev;
      next.textContent = word.next;
      count.textContent = (i + 1) + " / " + slides.length;
      Array.prototype.forEach.call(dots.children, function (d, k) {
        d.classList.toggle("is-on", k === i);
        d.setAttribute("aria-label", String(k + 1));
      });
      prev.disabled = i === 0;
      next.disabled = i === slides.length - 1;
    }

    prev.addEventListener("click", function () { show(i - 1); });
    next.addEventListener("click", function () { show(i + 1); });
    fig.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { show(i + 1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { show(i - 1); e.preventDefault(); }
    });
    document.addEventListener("sd-locale", function () { show(i); });
    show(0);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("figure.deck").forEach(boot);
  });
})();
