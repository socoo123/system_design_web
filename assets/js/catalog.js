/* Homepage module selection, chapter index and course-map interactions. */
(function () {
  "use strict";

  const PROGRESS_KEY = "sd-learn:learner-state:v1";
  const board = document.querySelector(".console");
  const query = document.querySelector("#chapter-query");
  const clear = document.querySelector("#clear-query");
  const emptyReset = document.querySelector("#empty-reset");
  const empty = document.querySelector("#no-chapters");
  const searchStatus = document.querySelector("#search-status");
  const searchBox = query && query.closest("[role=search]");
  const nav = document.querySelector(".module-nav");
  const contents = document.querySelector(".book-contents");
  const rotor = document.querySelector(".ring-rotor");
  const chapterBand = document.querySelector(".ring-chapter-band");
  const ringCode = document.querySelector(".ring-code");
  const ringNameZh = document.querySelector(".ring-name .lang-zh");
  const ringNameEn = document.querySelector(".ring-name .lang-en");
  const ringStat = document.querySelector(".ring-stat");
  const ringStatZh = document.querySelector(".ring-stat .lang-zh");
  const ringStatEn = document.querySelector(".ring-stat .lang-en");
  const ringBriefSubZh = document.querySelector(".ring-brief-sub .lang-zh");
  const ringBriefSubEn = document.querySelector(".ring-brief-sub .lang-en");
  const ringBriefPct = document.querySelector(".ring-brief-pct");
  const ringBriefFill = document.querySelector(".ring-brief-fill");
  const meterDone = document.querySelector(".meter-done");
  if (!board || !query || !nav || !contents) return;

  const isEn = () => document.documentElement.getAttribute("data-locale") === "en";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Build module inventory and compute exact ring angles (45 ticks = 360deg).
  const buttons = Array.from(nav.querySelectorAll("button"));
  const totalChapters = document.querySelectorAll(".card[data-ch]").length || 45;
  const degPerChapter = 360 / totalChapters;
  let slotOffset = 0;

  const groups = buttons.map((button, index) => {
    const id = button.getAttribute("aria-controls");
    const section = document.getElementById(id);
    const cards = Array.from(section.querySelectorAll(".card"), card => ({
      card,
      ch: card.dataset.ch,
      text: (card.dataset.ch + " " + card.textContent).toLowerCase()
    }));
    const centerDeg = (slotOffset + cards.length / 2) * degPerChapter;
    slotOffset += cards.length;
    const h2 = section.querySelector("h2");
    const sub = section.querySelector(".module-sub");
    return {
      id,
      code: "M0" + (index + 1),
      button,
      section,
      cards,
      centerDeg,
      titleZh: h2?.querySelector(".lang-zh")?.textContent.trim() || "",
      titleEn: h2?.querySelector(".lang-en")?.textContent.trim() || "",
      subZh: sub?.querySelector(".lang-zh")?.textContent.trim() || "",
      subEn: sub?.querySelector(".lang-en")?.textContent.trim() || "",
      countEl: button.querySelector("[data-mod-count]"),
      statEl: section.querySelector("[data-mod-stat]")
    };
  });

  const sectors = Array.from(document.querySelectorAll(".ring-rotor .sector"));
  const ticks = Array.from(document.querySelectorAll(".ring-rotor .tick"));
  const chapters = new Map(ticks.map(tick => {
    const id = tick.dataset.ch;
    const title = contents.querySelector(`.card[data-ch="${id}"] .ch-title`);
    return [id, {
      tick,
      code: "Ch" + id.slice(2),
      titleZh: title.querySelector(".lang-zh").textContent,
      titleEn: title.querySelector(".lang-en").textContent
    }];
  }));
  let displayedChapter, pinnedChapter;
  const pips = Array.from(document.querySelectorAll(".key-dots i[data-ch]"));

  const linkedGroup = () => groups.find(g => "#" + g.section.id === location.hash);
  let active = linkedGroup() || groups[0];
  let currentRot = -active.centerDeg;

  function loadCompleted() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (parsed && parsed.version === 1 && Array.isArray(parsed.completedChapters)) {
        return new Set(parsed.completedChapters);
      }
    } catch (e) { /* Ignore private mode / malformed JSON. */ }
    return new Set();
  }

  function updateRing(group, animate) {
    if (!rotor) return;
    const target = -group.centerDeg;
    if (animate && !reduced.matches) {
      let delta = ((target - currentRot) % 360 + 540) % 360 - 180;
      currentRot += delta;
    } else {
      currentRot = target;
    }
    rotor.style.setProperty("--ring-rot", currentRot.toFixed(2) + "deg");

    for (const s of sectors) s.classList.toggle("is-active", s.dataset.mod === group.id);
    for (const t of ticks) t.classList.toggle("is-mod-active", t.dataset.mod === group.id);

    const doneSet = loadCompleted();
    let modDone = 0;
    for (const { ch } of group.cards) if (doneSet.has(ch)) modDone++;

    renderRingLabel();
    if (ringStatZh) ringStatZh.textContent = group.cards.length + " 章 · 已学 " + modDone;
    if (ringStatEn) ringStatEn.textContent = group.cards.length + " chapters · " + modDone + " done";
    const pct = group.cards.length ? Math.round((modDone / group.cards.length) * 100) : 0;
    if (ringBriefSubZh) ringBriefSubZh.textContent = group.subZh;
    if (ringBriefSubEn) ringBriefSubEn.textContent = group.subEn;
    if (ringBriefPct) ringBriefPct.textContent = pct + "%";
    if (ringBriefFill) ringBriefFill.style.width = pct + "%";
  }

  function syncProgress() {
    const doneSet = loadCompleted();
    let totalDone = 0;
    for (const group of groups) {
      const total = group.cards.length;
      let done = 0;
      for (const { ch } of group.cards) if (doneSet.has(ch)) done++;
      totalDone += done;
      if (group.countEl) group.countEl.textContent = done > 0 ? done + "/" + total : String(total);
      if (group.statEl) {
        const zh = group.statEl.querySelector(".lang-zh");
        const en = group.statEl.querySelector(".lang-en");
        if (zh) zh.textContent = done > 0 ? "已学 " + done + " / " + total + " 章" : "共 " + total + " 章";
        if (en) en.textContent = done > 0 ? done + " / " + total + " done" : total + " chapters";
      }
    }
    if (meterDone) meterDone.textContent = String(totalDone).padStart(2, "0");
    for (const t of ticks) t.classList.toggle("is-read", doneSet.has(t.dataset.ch));
    for (const p of pips) p.classList.toggle("is-read", doneSet.has(p.dataset.ch));
    updateRing(active, false);
  }

  function renderRingLabel() {
    const label = displayedChapter ?? active;
    ringCode.textContent = label.code;
    ringNameZh.textContent = label.titleZh;
    ringNameEn.textContent = label.titleEn;
    ringStat.hidden = Boolean(displayedChapter);
  }

  function previewChapter(id) {
    const chapter = chapters.get(id) ?? pinnedChapter;
    if (chapter === displayedChapter) return;
    displayedChapter?.tick.classList.remove("is-preview");
    chapter?.tick.classList.add("is-preview");
    displayedChapter = chapter;
    renderRingLabel();
  }

  contents.addEventListener("pointerover", event => {
    if (event.pointerType !== "touch") {
      const card = event.target.closest(".card") || contents.querySelector(".card:focus-visible");
      previewChapter(card?.dataset.ch);
    }
  });
  const restoreFocusedChapter = () => previewChapter(contents.querySelector(".card:focus-visible")?.dataset.ch);
  contents.addEventListener("pointerleave", restoreFocusedChapter);
  contents.addEventListener("focusin", event => previewChapter(event.target.closest(".card:focus-visible")?.dataset.ch));
  contents.addEventListener("focusout", () => previewChapter());

  function syncPlaceholder() {
    const ph = query.getAttribute(isEn() ? "data-ph-en" : "data-ph-zh");
    if (ph) query.placeholder = ph;
  }

  function updateSearchStatus(term, total) {
    if (!searchStatus) return;
    if (!term || total === 0) {
      searchStatus.hidden = true;
      searchStatus.textContent = "";
      return;
    }
    searchStatus.hidden = false;
    searchStatus.textContent = isEn()
      ? total + (total === 1 ? " matching chapter" : " matching chapters") + " across all modules"
      : "在全部模块中找到 " + total + " 篇匹配章节";
  }

  function filter() {
    const raw = query.value;
    const term = raw.trim().toLowerCase();
    const searching = Boolean(term);
    let total = 0;

    board.dataset.active = active.id;
    previewChapter();
    contents.classList.toggle("is-searching", searching);

    for (const group of groups) {
      const { section, cards, button } = group;
      const selected = !searching && group === active;
      button.setAttribute("aria-pressed", String(selected));
      let count = 0;
      for (const { card, text } of cards) {
        card.hidden = !text.includes(term);
        if (!card.hidden) count++;
      }
      section.hidden = searching ? count === 0 : !selected;
      total += count;
    }
    if (searchBox) searchBox.classList.toggle("has-value", Boolean(raw));
    if (clear) clear.hidden = !raw;
    if (empty) empty.hidden = total !== 0;
    updateSearchStatus(term, total);
  }

  function reset() {
    pinnedChapter = undefined;
    query.value = "";
    filter();
    contents.scrollTop = 0;
  }

  function selectGroup(group, animate = true) {
    active = group;
    reset();
    updateRing(group, animate);
    try {
      history.replaceState(history.state, "", "#" + group.section.id);
    } catch (e) { /* Ignore restricted file:// history errors. */ }
  }

  /* Tactile pedal press visual for pointer, touch, and keyboard without delaying navigation. */
  const pedals = document.querySelectorAll(".module-nav button, .continue-link");
  for (const el of pedals) {
    const release = () => el.classList.remove("is-pressed");
    el.addEventListener("pointerdown", event => {
      if (event.button && event.button !== 0) return;
      el.classList.add("is-pressed");
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("blur", release);
    el.addEventListener("keydown", event => {
      if (event.key === "Enter" || (event.key === " " && el.tagName === "BUTTON")) {
        el.classList.add("is-pressed");
      }
    });
    el.addEventListener("keyup", release);
  }

  // Resolve the whole outer band in rotor coordinates, including the gaps between thin ticks.
  function tickAt(event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(rotor.getScreenCTM().inverse());
    const turns = Math.atan2(point.x - chapterBand.cx.baseVal.value, chapterBand.cy.baseVal.value - point.y) / (2 * Math.PI);
    return ticks[Math.floor(((turns + 1) % 1) * ticks.length)];
  }

  chapterBand.addEventListener("pointermove", event => {
    if (event.pointerType !== "touch") previewChapter(tickAt(event).dataset.ch);
  });
  chapterBand.addEventListener("pointerleave", restoreFocusedChapter);
  chapterBand.addEventListener("click", event => {
    const { ch, mod } = tickAt(event).dataset;
    selectGroup(groups.find(group => group.id === mod));
    pinnedChapter = chapters.get(ch);
    previewChapter(ch);
  });

  // The inner colored arcs still select volumes rather than chapters.
  if (rotor) {
    rotor.addEventListener("click", event => {
      const target = event.target.closest("[data-mod]");
      if (!target) return;
      const group = groups.find(g => g.id === target.dataset.mod);
      if (group) selectGroup(group, true);
    });
  }

  query.addEventListener("input", () => {
    pinnedChapter = undefined;
    filter();
    contents.scrollTop = 0;
  });
  query.addEventListener("keydown", event => {
    if (event.key === "Escape" && query.value) {
      event.preventDefault();
      reset();
    }
  });
  if (clear) clear.addEventListener("click", () => { reset(); query.focus(); });
  if (emptyReset) emptyReset.addEventListener("click", () => { reset(); query.focus(); });

  groups.forEach((group, idx) => {
    group.button.addEventListener("click", () => selectGroup(group, true));
    group.button.addEventListener("keydown", event => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = groups[(idx + 1) % groups.length];
        next.button.focus();
        selectGroup(next, true);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const prev = groups[(idx - 1 + groups.length) % groups.length];
        prev.button.focus();
        selectGroup(prev, true);
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    event.preventDefault();
    query.focus();
  });

  window.addEventListener("hashchange", () => {
    const target = linkedGroup();
    if (target) selectGroup(target, true);
  });
  window.addEventListener("pageshow", () => {
    syncProgress();
    filter();
  });
  window.addEventListener("storage", syncProgress);
  document.addEventListener("sd-locale", () => {
    syncPlaceholder();
    syncProgress();
    filter();
  });

  syncPlaceholder();
  syncProgress();
  filter();
  nav.hidden = false;
  if (searchBox) searchBox.hidden = false;
})();
