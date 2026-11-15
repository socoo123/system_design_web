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
    siteName: "系统设计蓝图",
    siteShort: "SD",
    map: "课程地图",
    footer: "系统设计蓝图 · 系统学习与技术交流",
    progress: (done, total) => `进度 ${done}/${total}`,
    progressTitle: (done, total) => `已学 ${done} / ${total} 章`,
    themeGroup: "主题切换",
    themeParchment: "护眼",
    themeDracula: "德古拉",
    langGroup: "语言",
    langZh: "中文",
    langBoth: "对照",
    langEn: "EN",
    homeKicker: "系统设计 · 从理解到表达",
    homeTitle: "把复杂系统，",
    homeTitleAccent: "一步一步讲清楚。",
    homeLead:
      "从设计方法与容量估算，到分布式系统、大模型与 Agent 基础设施。沿着请求理解系统，通过案例分析取舍，在学习、技术交流与方案评审中讲清设计依据。",
    statModules: "模块",
    statLearned: "已学章节",
    statDiagrams: "图",
    statDiagramsValue: "D2 架构图",
    totalProgress: "总进度",
    progressHint: "进度存在本机浏览器；学完一章后在章末勾选「已学完」。",
    firstPathTitle: "第一次学，按这条路",
    firstPathLead:
      "Ch01 系统设计入门与四步分析法 → Ch02 扩展 → Ch03 容量与性能估算 → M2 构件 → M3–M4 设计案例 → M5 大模型与 Agent。M6 基础深读可按需查阅，也可在主线后系统学习。",
    howTitle: "怎么学",
    step1Title: "先走 M1",
    step1Desc: "四步分析法、扩展思路、容量与性能估算，构成分析系统的基本框架。",
    step2Title: "通过案例理解取舍",
    step2Desc: "M2 理解构件，M3–M4 分析系统案例，M5 学习大模型与 Agent 基建。结合需求与约束讲清设计依据。",
    step3Title: "按需深读 M6",
    step3Desc: "缓存、协议、事务、微服务、DDD 可按引用跳转，补充理解后再回到案例，也可在主线后系统学习。",
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
      method: "设计思路与方法",
      brick: "构件",
      case: "设计案例",
      ai: "LLM / Agent",
    },
  },
  en: {
    siteName: "System Blueprint",
    siteShort: "SD",
    map: "Course map",
    footer: "System Blueprint · System learning and technical discussion",
    progress: (done, total) => `Progress ${done}/${total}`,
    progressTitle: (done, total) => `${done} / ${total} chapters done`,
    themeGroup: "Theme",
    themeParchment: "Paper",
    themeDracula: "Dracula",
    langGroup: "Language",
    langZh: "中文",
    langBoth: "Both",
    langEn: "EN",
    homeKicker: "System design · Learn. Connect. Explain.",
    homeTitle: "Make complex systems",
    homeTitleAccent: " clear, one step at a time.",
    homeLead:
      "From design methods and capacity estimation to distributed systems, LLMs, and Agent infrastructure. Follow requests through a system, analyze trade-offs through case studies, and explain the reasoning behind designs as you learn, exchange technical ideas, and review proposals.",
    statModules: "Modules",
    statLearned: "Chapters done",
    statDiagrams: "Diagrams",
    statDiagramsValue: "D2 architecture",
    totalProgress: "Overall",
    progressHint: "Progress lives in this browser. Check “Done” at the end of a chapter.",
    firstPathTitle: "First pass, this order",
    firstPathLead:
      "Ch01 Introduction to system design and the four-step method → Ch02 scale-out → Ch03 Capacity and performance estimation → M2 building blocks → M3–M4 design cases → M5 LLM & Agent. Read M6 foundations as needed or study them in depth after the main path.",
    howTitle: "How to study",
    step1Title: "Start with M1",
    step1Desc: "The four-step method, scale-out reasoning, and capacity and performance estimation form a reusable framework for analyzing systems.",
    step2Title: "Explore trade-offs through cases",
    step2Desc: "Understand building blocks in M2, analyze system cases in M3–M4, and study LLM / Agent infrastructure in M5. Explain design decisions in terms of requirements and constraints.",
    step3Title: "Go deeper with M6",
    step3Desc: "Follow references into caching, protocols, transactions, microservices, and DDD, then return to the case study or explore the foundations in depth after the main path.",
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
      method: "Design thinking and methods",
      brick: "Building block",
      case: "Design case",
      ai: "LLM / Agent",
    },
  },
};
