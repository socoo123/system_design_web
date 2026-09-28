/* 顶栏主题、章节侧栏目录、闪卡翻转。 */
(function () {
  "use strict";

  function applyTheme(theme) {
    if (theme !== "dracula") theme = "parchment";
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("sd-theme", theme); } catch (e) { /* 隐私模式 */ }
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-theme-set") === theme ? "true" : "false");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(document.documentElement.getAttribute("data-theme") || "parchment");
    document.querySelectorAll("[data-theme-set]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyTheme(btn.getAttribute("data-theme-set"));
      });
    });

    buildToc();

    document.querySelectorAll(".flip").forEach(function (card) {
      card.addEventListener("click", function () {
        card.classList.toggle("is-flipped");
      });
    });
  });

  function headingText(h) {
    var en = document.documentElement.getAttribute("data-locale") === "en";
    var node = h.querySelector(en ? ".lang-en" : ".lang-zh");
    return (node ? node.textContent : h.textContent).replace(/\s+/g, " ").trim();
  }

  function buildToc() {
    var art = document.querySelector("article.chapter");
    var old = document.querySelector("nav.toc");
    if (old) old.remove();
    if (!art) return;
    var heads = art.querySelectorAll("h2");
    if (!heads.length) return;
    var toc = document.createElement("nav");
    toc.className = "toc";
    var title = document.createElement("div");
    title.className = "toc-title";
    title.innerHTML = '<span class="lang-zh">本章目录</span><span class="lang-en">On this page</span>';
    toc.appendChild(title);
    heads.forEach(function (h, i) {
      if (!h.id) h.id = art.id + "-s" + (i + 1);
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = headingText(h);
      toc.appendChild(a);
    });
    document.body.appendChild(toc);
  }

  document.addEventListener("sd-locale", buildToc);
})();
