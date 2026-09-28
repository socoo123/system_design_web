/* 中文 / 对照 / EN。键与旧站相同：sd-locale = zh | both | en */
(function () {
  "use strict";

  function apply(locale) {
    if (locale !== "en" && locale !== "both") locale = "zh";
    document.documentElement.setAttribute("data-locale", locale);
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    try { localStorage.setItem("sd-locale", locale); } catch (e) { /* 隐私模式 */ }
    document.querySelectorAll("[data-locale-set]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-locale-set") === locale ? "true" : "false");
    });
    document.dispatchEvent(new CustomEvent("sd-locale"));
  }

  document.addEventListener("DOMContentLoaded", function () {
    apply(document.documentElement.getAttribute("data-locale") || "zh");
    document.querySelectorAll("[data-locale-set]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-locale-set"));
      });
    });
  });
})();
