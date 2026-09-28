/* 首屏前套上主题和语言，避免闪一下旧色。 */
(function () {
  try {
    var t = localStorage.getItem("sd-theme");
    document.documentElement.setAttribute("data-theme", t === "dracula" ? "dracula" : "parchment");
    var l = localStorage.getItem("sd-locale");
    if (l !== "en" && l !== "both" && l !== "zh") l = "zh";
    document.documentElement.setAttribute("data-locale", l);
    document.documentElement.lang = l === "en" ? "en" : "zh-CN";
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "parchment");
    document.documentElement.setAttribute("data-locale", "zh");
  }
})();
