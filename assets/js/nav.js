/* Shared reading UI. Chapter text and slide controllers remain independent. */
(function () {
  "use strict";
  var codeHighlightSrc = new URL("code-highlight.js", document.currentScript.src).href;
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
  var copyIcons =
    '<svg class="icon-copy" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="2"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"/></svg>' +
    '<svg class="icon-done" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  // Display family only drives the label color; syntax coloring still follows code-highlight.js.
  function codeFamily(language) {
    var named = (language || "").match(/^(java|python|sql|lua|http)/i);
    return named ? named[1].toLowerCase() : "pseudo";
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
      label.className = "code-lang";
      var code = pre.querySelector("code");
      var language = pre.getAttribute("data-language") || (code && code.getAttribute("data-language"));
      var match = ((code && code.className) || pre.className || "").match(/(?:^|\s)language-([\w+-]+)/);
      if (!language && match) language = match[1];
      wrap.setAttribute("data-family", codeFamily(language));
      if (language) {
        var split = language.indexOf(" · ");
        var name = document.createElement("span");
        name.className = "code-lang-name";
        name.textContent = split < 0 ? language : language.slice(0, split);
        label.appendChild(name);
        if (split >= 0) {
          var note = document.createElement("span");
          note.className = "code-lang-note";
          note.textContent = language.slice(split + 3);
          label.appendChild(note);
        }
        label.title = language;
      } else {
        label.innerHTML = '<span class="code-lang-name">' + bilingual("代码示例", "Code example") + "</span>";
      }
      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "code-copy";
      var copyLabel = copyIcons + bilingual("复制", "Copy");
      copy.innerHTML = copyLabel;
      var status = document.createElement("p");
      status.className = "copy-status";
      status.setAttribute("role", "status");
      var resetTimer;
      copy.addEventListener("click", async function () {
        window.clearTimeout(resetTimer);
        copy.classList.remove("is-copied");
        copy.innerHTML = copyLabel;
        status.classList.remove("is-quiet");
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(pre.textContent);
          copy.classList.add("is-copied");
          copy.innerHTML = copyIcons + bilingual("已复制", "Copied");
          status.classList.add("is-quiet");
          status.innerHTML = bilingual("已复制", "Copied");
          resetTimer = window.setTimeout(function () {
            status.textContent = "";
            copy.classList.remove("is-copied");
            copy.innerHTML = copyLabel;
          }, 2500);
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
      // Line numbers live outside <pre>, so copying and selection keep the original text.
      var body = document.createElement("div");
      body.className = "code-body";
      var lines = document.createElement("div");
      lines.className = "code-lines";
      lines.setAttribute("aria-hidden", "true");
      var count = pre.textContent.replace(/\n$/, "").split("\n").length;
      var numbers = [];
      for (var n = 1; n <= count; n++) numbers.push(n);
      lines.textContent = numbers.join("\n");
      body.appendChild(lines);
      body.appendChild(pre);
      wrap.appendChild(body);
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
    // Progressive enhancement: navigation, copying and scrolling do not wait for coloring.
    if (art.querySelector("pre code")) {
      var syntax = document.createElement("script");
      syntax.src = codeHighlightSrc;
      document.head.appendChild(syntax);
    }
  }
  function trackReading(bar) {
    var track = document.createElement("div");
    track.className = "read-progress";
    track.setAttribute("aria-hidden", "true");
    var fill = document.createElement("span");
    track.appendChild(fill);
    // Prepend: the mobile top bar places its two toggles with :last-child selectors.
    bar.insertBefore(track, bar.firstChild);
    var scheduled = false;
    function paint() {
      scheduled = false;
      var room = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 0;
      fill.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
    }
    function schedule() {
      if (!scheduled) { scheduled = true; window.requestAnimationFrame(paint); }
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    paint();
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
        label.innerHTML = '<span class="deck-label">' + bilingual("动态图解", "STEP-BY-STEP DIAGRAM") + '</span><span class="deck-hint">' + bilingual("← → 切换步骤 · 图内可横向滚动", "← → Step through · scroll inside the diagram") + '</span>';
        deck.insertBefore(label, deck.firstChild);
      });
      if (bar) trackReading(bar);
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
