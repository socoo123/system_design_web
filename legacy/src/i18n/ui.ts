export type UiCopy = {
  siteName: string;
  siteShort: string;
  map: string;
  footer: string;
  progress: (done: number, total: number) => string;
  progressTitle: (done: number, total: number) => string;
  themeGroup: string;
  themeParchment: string;
  themeDracula: string;
  langGroup: string;
  langZh: string;
  langBoth: string;
  langEn: string;
  homeKicker: string;
  homeTitle: string;
  homeTitleAccent: string;
  homeLead: string;
  statModules: string;
  statLearned: string;
  statDiagrams: string;
  statDiagramsValue: string;
  totalProgress: string;
  progressHint: string;
  firstPathTitle: string;
  firstPathLead: string;
  howTitle: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  pending: string;
  done: string;
  ready: string;
  chapters: (n: number) => string;
  enter: string;
  moduleMissing: string;
  backHome: string;
  moduleProgress: string;
  markDone: string;
  unmarkDone: string;
  contentPending: string;
  learned: string;
  chapterMissing: string;
  loadingChapter: string;
  chapterNotGenerated: string;
  chapterLoadFail: string;
  backModule: string;
  lesson: (num: string) => string;
  toc: string;
  flashcards: string;
  flashcardsHint: string;
  completeTitle: string;
  completeTitleDone: string;
  completeHint: string;
  completeHintDone: string;
  completeLocal: string;
  related: string;
  relatedM6: string;
  enPendingBanner: string;
  bilingualZh: string;
  bilingualEn: string;
  kind: {
    foundation: string;
    method: string;
    brick: string;
    case: string;
    ai: string;
  };
};

export const UI: Record<"zh" | "en", UiCopy> = {
  zh: {
    siteName: "系统设计面试",
    siteShort: "SD",
    map: "课程地图",
    footer: "系统设计面试 · 由浅入深 · 图用 D2",
    progress: (done, total) => `进度 ${done}/${total}`,
    progressTitle: (done, total) => `已学 ${done} / ${total} 章`,
    themeGroup: "主题切换",
    themeParchment: "护眼",
    themeDracula: "德古拉",
    langGroup: "语言",
    langZh: "中文",
    langBoth: "对照",
    langEn: "EN",
    homeKicker: "系统设计面试 · 由浅入深",
    homeTitle: "从没面过系统设计",
    homeTitleAccent: " · 到能讲完 45 分钟",
    homeLead:
      "45 章 / 6 大模块。主线是面试方法 + 后端设计题 + 大模型 / Agent 基建（M1–M5）。基础深读在最后的 M6（含超大规模数据、微服务、DDD），面试冲刺可以后置。架构图用 D2，2026 的答案写在正文，原书过时的放折叠里。",
    statModules: "模块",
    statLearned: "已学章节",
    statDiagrams: "图",
    statDiagramsValue: "D2 架构图",
    totalProgress: "总进度",
    progressHint: "进度存在本机浏览器；学完一章后在章末勾选「已学完」。",
    firstPathTitle: "第一次学，按这条路",
    firstPathLead:
      "Ch01 地图 + 4 步法 → Ch02 扩展 → Ch03 估算 → M2 构件 → M3–M4 设计题 → M5 大模型与 Agent。M6 基础深读放最后，卡住再点引用芯片，不必先啃完。",
    howTitle: "怎么学",
    step1Title: "先走 M1",
    step1Desc: "地图 + 4 步法、扩展叙事、估算，是所有题共用的骨架。",
    step2Title: "用设计题练",
    step2Desc: "M2 构件，M3–M4 后端真题，M5 做 LLM / Agent。重点在讲清 trade-off。",
    step3Title: "M6 后置深读",
    step3Desc: "缓存、协议、事务、微服务、DDD 在最后。芯片能跳进去；想打透再专心学。",
    pending: "待生成",
    done: "已学完",
    ready: "可学习",
    chapters: (n) => `${n} 章`,
    enter: "进入 →",
    moduleMissing: "模块不存在。",
    backHome: "返回首页",
    moduleProgress: "本模块进度",
    markDone: "标为已学完",
    unmarkDone: "取消已学完",
    contentPending: "内容待生成",
    learned: "已学完",
    chapterMissing: "章节不存在。",
    loadingChapter: "加载章节内容…",
    chapterNotGenerated: "本章内容尚未生成。",
    chapterLoadFail: "章节内容加载失败。",
    backModule: "返回模块",
    lesson: (num) => `第 ${num} 课`,
    toc: "本章目录",
    flashcards: "记忆闪卡",
    flashcardsHint: "点开复习",
    completeTitle: "我已学完本章",
    completeTitleDone: "已学完本章",
    completeHint: "读完正文和闪卡后勾选，外面的进度条会跟着更新。",
    completeHintDone: "进度已勾选，可在首页和模块列表里看到。",
    completeLocal: "进度存在本机浏览器（localStorage），刷新不会丢。",
    related: "相关",
    relatedM6: "可后读 · M6",
    enPendingBanner: "英文尚未翻译，先显示中文。切到「对照」或等本批译完后再看 EN。",
    bilingualZh: "中文",
    bilingualEn: "English",
    kind: {
      foundation: "基础深读",
      method: "面试方法",
      brick: "构件",
      case: "设计题",
      ai: "LLM / Agent",
    },
  },
  en: {
    siteName: "System Design Interview",
    siteShort: "SD",
    map: "Course map",
    footer: "System design interview · D2 diagrams",
    progress: (done, total) => `Progress ${done}/${total}`,
    progressTitle: (done, total) => `${done} / ${total} chapters done`,
    themeGroup: "Theme",
    themeParchment: "Paper",
    themeDracula: "Dracula",
    langGroup: "Language",
    langZh: "中文",
    langBoth: "Both",
    langEn: "EN",
    homeKicker: "System design interview · first principles",
    homeTitle: "Never interviewed system design",
    homeTitleAccent: " · to a 45-minute talk track",
    homeLead:
      "45 chapters / 6 modules. The spine is interview method + backend design problems + LLM / Agent infra (M1–M5). Foundations sit last in M6 (hyperscale data, microservices, DDD)—skip them on a crunch. Diagrams are D2. 2026 answers live in the body; outdated book notes go in a fold.",
    statModules: "Modules",
    statLearned: "Chapters done",
    statDiagrams: "Diagrams",
    statDiagramsValue: "D2 architecture",
    totalProgress: "Overall",
    progressHint: "Progress lives in this browser. Check “Done” at the end of a chapter.",
    firstPathTitle: "First pass, this order",
    firstPathLead:
      "Ch01 map + 4 steps → Ch02 scale-out → Ch03 estimates → M2 building blocks → M3–M4 design problems → M5 LLM & Agent. M6 is last; tap a chip when you get stuck.",
    howTitle: "How to study",
    step1Title: "Start with M1",
    step1Desc: "Map + 4-step method, the scale-out story, and estimates. Every later problem reuses this skeleton.",
    step2Title: "Drill on problems",
    step2Desc: "M2 bricks, M3–M4 backend problems, M5 LLM / Agent. The score is in the trade-off, not the final box.",
    step3Title: "M6 later",
    step3Desc: "Cache, protocols, transactions, microservices, DDD last. Chips jump in; go deep when you want depth.",
    pending: "Coming",
    done: "Done",
    ready: "Ready",
    chapters: (n) => `${n} chapters`,
    enter: "Open →",
    moduleMissing: "Module not found.",
    backHome: "Back home",
    moduleProgress: "This module",
    markDone: "Mark done",
    unmarkDone: "Unmark done",
    contentPending: "Content not generated yet",
    learned: "Done",
    chapterMissing: "Chapter not found.",
    loadingChapter: "Loading chapter…",
    chapterNotGenerated: "This chapter is not generated yet.",
    chapterLoadFail: "Failed to load chapter.",
    backModule: "Back to module",
    lesson: (num) => `Lesson ${num}`,
    toc: "On this page",
    flashcards: "Flashcards",
    flashcardsHint: "Open to review",
    completeTitle: "I finished this chapter",
    completeTitleDone: "Chapter marked done",
    completeHint: "Check this after the body and flashcards. The progress bar updates with it.",
    completeHintDone: "Checked. You’ll see it on the home and module lists.",
    completeLocal: "Stored in this browser (localStorage). Refresh keeps it.",
    related: "Related",
    relatedM6: "Read later · M6",
    enPendingBanner: "English is not ready for this chapter yet. Showing Chinese. Use 中文, or wait for the next translation batch.",
    bilingualZh: "中文",
    bilingualEn: "English",
    kind: {
      foundation: "Foundation",
      method: "Method",
      brick: "Building block",
      case: "Design problem",
      ai: "LLM / Agent",
    },
  },
};
