/* Shared reading UI. Chapter text and slide controllers remain independent. */
(function () {
  "use strict";
  var toc, tocLinks = [], headings = [], desktop;
  function english() { return document.documentElement.getAttribute("data-locale") === "en"; }
  function bilingual(zh, en) { return '<span class="lang-zh">' + zh + '</span><span class="lang-en">' + en + '</span>'; }
  function applyTheme(theme) {
    if (theme !== "dracula") theme = "parchment";
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("sd-theme", theme); } catch (e) { /* Private mode. */ }
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-set") === theme ? "true" : "false");
    });
  }
  function headingText(h) {
    var node = h.querySelector(english() ? ".lang-en" : ".lang-zh");
    return (node ? node.textContent : h.textContent).replace(/\s+/g, " ").trim();
  }
  function updateLabels() {
    tocLinks.forEach(function (a, i) { a.textContent = headingText(headings[i]); });
    if (toc) toc.querySelector("nav").setAttribute("aria-label", english() ? "On this page" : "本章目录");
    document.querySelectorAll(".table-scroll").forEach(function (node) { node.setAttribute("aria-label", english() ? "Table; scroll horizontally if needed" : "表格，可左右滚动"); });
    document.querySelectorAll(".code-block pre").forEach(function (node) { node.setAttribute("aria-label", english() ? "Code example; scroll horizontally if needed" : "代码示例，可左右滚动"); });
  }
  function buildToc(art) {
    headings = Array.prototype.slice.call(art.querySelectorAll("h2"));
    if (!headings.length) return;
    toc = document.createElement("details");
    toc.className = "toc";
    var summary = document.createElement("summary");
    summary.innerHTML = bilingual("本章目录", "ON THIS PAGE");
    toc.appendChild(summary);
    var links = document.createElement("nav");
    links.className = "toc-links";
    headings.forEach(function (h, i) {
      if (!h.id) h.id = art.id + "-s" + (i + 1);
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.addEventListener("click", function () {
        if (!desktop.matches) toc.open = false;
      });
      links.appendChild(a);
      tocLinks.push(a);
    });
    toc.appendChild(links);
    art.querySelector("header").insertAdjacentElement("afterend", toc);
    desktop = window.matchMedia("(min-width: 1220px)");
    function syncLayout() { toc.open = desktop.matches; }
    if (desktop.addEventListener) desktop.addEventListener("change", syncLayout);
    else desktop.addListener(syncLayout);
    syncLayout();
    // A desktop contents rail stays open. On narrow screens the native disclosure is keyboard accessible.
    summary.addEventListener("click", function (event) { if (desktop.matches) event.preventDefault(); });
    var scheduled = false;
    function highlight() {
      scheduled = false;
      var threshold = (document.querySelector(".topbar").offsetHeight || 65) + 80;
      var active = 0;
      headings.forEach(function (h, i) { if (h.getBoundingClientRect().top <= threshold) active = i; });
      tocLinks.forEach(function (a, i) {
        if (i === active) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }
    window.addEventListener("scroll", function () {
      if (!scheduled) { scheduled = true; window.requestAnimationFrame(highlight); }
    }, { passive: true });
    highlight();
  }
  function makeScrollableTables(art) {
    var observe = window.ResizeObserver ? new ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var overflow = el.scrollWidth > el.clientWidth + 1;
        el.parentElement.classList.toggle("has-overflow", overflow);
        if (overflow) el.tabIndex = 0;
        else el.removeAttribute("tabindex");
      });
    }) : null;
    art.querySelectorAll("table").forEach(function (table) {
      var wrap = document.createElement("div");
      wrap.className = "table-wrap";
      // A few chapters may assign language directly to a table, so preserve that visibility on its wrapper.
      ["lang-zh", "lang-en"].forEach(function (name) { if (table.classList.contains(name)) wrap.classList.add(name); });
      var scroll = document.createElement("div");
      scroll.className = "table-scroll";
      scroll.setAttribute("role", "region");
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(scroll);
      scroll.appendChild(table);
      var hint = document.createElement("p");
      hint.className = "scroll-hint";
      hint.innerHTML = bilingual("↔ 左右滑动查看完整表格", "↔ Scroll to see the full table");
      wrap.appendChild(hint);
      if (observe) observe.observe(scroll);
      else { wrap.classList.add("has-overflow"); scroll.tabIndex = 0; }
    });
  }
  function makeCodeBlocks(art) {
    art.querySelectorAll("pre").forEach(function (pre) {
      var wrap = document.createElement("div");
      wrap.className = "code-block";
      ["lang-zh", "lang-en"].forEach(function (name) { if (pre.classList.contains(name)) wrap.classList.add(name); });
      pre.parentNode.insertBefore(wrap, pre);
      var bar = document.createElement("div");
      bar.className = "code-bar";
      var label = document.createElement("span");
      var code = pre.querySelector("code");
      var language = pre.getAttribute("data-language") || (code && code.getAttribute("data-language"));
      var match = ((code && code.className) || pre.className || "").match(/(?:^|\s)language-([\w+-]+)/);
      if (!language && match) language = match[1];
      if (language) label.textContent = language;
      else label.innerHTML = bilingual("代码示例", "Code example");
      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "code-copy";
      copy.innerHTML = bilingual("复制", "Copy");
      var status = document.createElement("p");
      status.className = "copy-status";
      status.setAttribute("role", "status");
      var resetTimer;
      copy.addEventListener("click", async function () {
        window.clearTimeout(resetTimer);
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(pre.textContent);
          status.innerHTML = bilingual("已复制", "Copied");
          resetTimer = window.setTimeout(function () { status.textContent = ""; }, 2500);
        } catch (e) {
          var range = document.createRange();
          range.selectNodeContents(pre);
          var selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          pre.focus({ preventScroll: true });
          status.innerHTML = bilingual("代码已选中，请按 ⌘C / Ctrl+C 复制，或长按复制。", "Code selected. Press ⌘C / Ctrl+C, or touch and hold to copy.");
        }
      });
      bar.appendChild(label);
      bar.appendChild(copy);
      wrap.appendChild(bar);
      wrap.appendChild(pre);
      var hint = document.createElement("p");
      hint.className = "scroll-hint";
      hint.innerHTML = bilingual("↔ 左右滑动查看完整代码", "↔ Scroll to see the full example");
      wrap.appendChild(hint);
      wrap.appendChild(status);
      function checkOverflow() { wrap.classList.toggle("has-overflow", pre.scrollWidth > pre.clientWidth + 1); }
      if (window.ResizeObserver) new ResizeObserver(checkOverflow).observe(pre);
      else checkOverflow();
      pre.tabIndex = 0;
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(document.documentElement.getAttribute("data-theme") || "parchment");
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      btn.addEventListener("click", function () { applyTheme(btn.getAttribute("data-theme-set")); });
    });
    var bar = document.querySelector(".topbar");
    function sizeBar() { if (bar) document.documentElement.style.setProperty("--topbar-height", bar.offsetHeight + "px"); }
    sizeBar();
    if (window.ResizeObserver && bar) new ResizeObserver(sizeBar).observe(bar);
    else window.addEventListener("resize", sizeBar);
    var art = document.querySelector("article.chapter");
    if (art) {
      buildToc(art);
      makeScrollableTables(art);
      makeCodeBlocks(art);
      art.querySelectorAll(".deck").forEach(function (deck) {
        var label = document.createElement("div");
        label.className = "deck-heading";
        label.innerHTML = '<span class="deck-label">' + bilingual("动态图解", "STEP-BY-STEP DIAGRAM") + '</span><span>' + bilingual("← → 切换步骤 · 图内可横向滚动", "← → Step through · scroll inside the diagram") + '</span>';
        deck.insertBefore(label, deck.firstChild);
      });
    }
    document.querySelectorAll(".flip").forEach(function (card) {
      card.setAttribute("aria-expanded", "false");
      card.addEventListener("click", function () {
        card.classList.toggle("is-flipped");
        card.setAttribute("aria-expanded", card.classList.contains("is-flipped") ? "true" : "false");
      });
    });
    updateLabels();
  });
  document.addEventListener("sd-locale", updateLabels);
})();
