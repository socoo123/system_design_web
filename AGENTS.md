# 系统设计面试学习站

权威大纲：**[`PLAN.md`](./PLAN.md)**。  
跨会话进度：**[`PROGRESS.md`](./PROGRESS.md)**（Clear 之后也先读它）。

## 每次开局（含 Clear）

1. 读 `PROGRESS.md`：翻译开关、自己的车道、下一章、有没有锁
2. 有「进行中」→ 只续做那一章（中文优化或译英，看锁）
3. 无锁且用户要**译英** → 译本车道「下一章」
4. 译英读 `PLAN.md` §4.3；中文重写才读 §4 + [`D2_RULES.md`](./D2_RULES.md)

聊天记录不是记忆。

## 用户一说这些，就按对应 SOP 执行

**译英（现行主线）**

- 「翻译 chNN」/「翻译第一批」/「翻译下一波」/「分 4 个 agent 译」
- 按 `PROGRESS.md` 父代理派活，**同时开 A/B/C/D**，每车道默认 1 章。SOP 见 `PLAN.md` §4.3
- 产出：同一份 `src/content/chapters/chXX.json` 上的 `titleEn` / `headingEn` / `bodyEn` / `reviewMdEn`
- 用 `scripts/write-chapter-en.mjs`；**禁止改中文、禁止改 D2**
- 英文是外企面试口播，不是逐句硬译
- 写完：`PLAN.md` §9 英文列 + `PROGRESS.md` 自己那一行

**中文（仅点名时）**

- 「生成 chNN」/「重新优化 chNN」才改中文
- 「开写」/「下一波」在中文 45/45 之后 **不再派中文**；若用户说「下一波」且翻译开关可开，按译英下一波处理

## 四条译英车道（以 `PROGRESS.md` 为准）

| Agent | 现范围 | 禁止 |
|---|---|---|
| A | Ch01–Ch12 | 译 Ch13+ |
| B | Ch13–Ch24 | 译 Ch01–12 / Ch25+ |
| C | Ch25–Ch36 | 译 Ch01–24 / Ch37+ |
| D | Ch37–Ch45 | 译 Ch01–36 |

某车道译完且仍有英文 ⬜：父代理把最长车道的下一章切给空闲路，保持四路。

## 硬限制

- 现行只有 **M1–M6 / Ch01–Ch45**
- **不做推荐系统**
- **选修整段暂停**
- 译英不重画 D2、不用 mermaid
- 无 Monaco、无作业函数、无 AWS 服务清单
- 不主动 git commit
