# 中英文介绍 · Introduction

---

## 中文介绍

**github-plugin-finder（插件发现）** 是 DeepSeek Harness 的插件发现面板：在插件页新增「发现」标签，从 GitHub、npm 和社区目录里找 Harness / Cordis 插件，**能听懂你要的是哪一个**。

- **精确名称就是精确结果**：`dsh-whale-widget`、`owner/repo`、`https://github.com/owner/repo`、`@scope/pkg`、`exact:名称` 都会走精确解析。命中就单独放在「精确命中」里；没命中会直接说「没有同名仓库」，再把相近结果**另行标注**，不拿关键词包含项冒充答案。
- **找得全，而且越搜越全**：8 个生态 topic + 名称模式 + `dsh plugin` / `"deepseek harness" plugin` / `cordis plugin` 等词面查询 + 每个关键词的召回查询 + 最新上传通道 + manifest 代码搜索（需令牌）+ npm 通道。一轮预算跑不完会自动再补一轮（缓存页面不重复计费），所有见过的仓库写入本地索引，下一次搜索继续参与排序——「全部浏览」会随着使用变得完整，而不是每次从零开始。
- **额度说真话**：GitHub 无令牌 10 次/分钟，令牌 30 次/分钟。面板用令牌桶按配额排队，读 `x-ratelimit-*` 在耗尽前停下，并明确标出「顺延 N 个渠道」，点「深度搜索」再继续。
- **翻译用模型直译，稳定看到中文**：优先走 DSH 宿主自己的模型服务（和聊天同一条通道，不受第三方翻译站被墙影响），一次把一批简介译成 JSON，失败自动对半重试；这条不通再依次退到 DSH 原生 `translator` 服务、Bing、MyMemory、Google。译文写磁盘缓存，第二次打开不再请求；卡片上标出来源，失败条目标「未翻译」并可重试。
- **星标排行**：相关度 / 星标从多到少 / 最近更新三种排序，选择会记住；星标模式按单一有序列表展示，不打散到分类里。
- **分类浏览**：界面与主题 / MCP 集成 / 自动化与提醒 / 开发与调试 / AI 与智能体 / 实用工具 / 其他。
- **一键安装**：复制安装请求粘贴回对话，助手先审计再安装；npm 包自动切换成 npm 安装语句。

**架构**：面板是纯客户端；真正的搜索、索引、翻译跑在 DSH 宿主的 `/github-plugin-finder/*` 路由里，因此不受浏览器 CORS 限制，也能用磁盘缓存。宿主路由不可用时（旧安装 / 未重启），面板自动退回浏览器直连模式。

**三步上手**：插件页 → 发现 → 输入名称 / 关键词 / 点「全部浏览」→ 复制安装指令。

---

## English Introduction

**github-plugin-finder (Plugin Discover)** adds a **Discover** tab to the Plugins page and searches GitHub, npm and a community catalog for DeepSeek Harness / Cordis plugins — and it understands *which* plugin you mean.

- **Exact names stay exact**: `dsh-whale-widget`, `owner/repo`, a GitHub URL, `@scope/pkg` or `exact:<name>` is resolved as a name. A hit is shown on its own; a miss says so and lists similar repositories **separately**, never as the answer.
- **Coverage that accumulates**: eight ecosystem topics, name patterns, word channels (`dsh plugin`, `"deepseek harness" plugin`, `cordis plugin`), per-term recall queries, a fresh-upload channel, manifest code search (token) and npm. A round that cannot pay for every channel is followed by another round (cached pages cost nothing), and every repository seen is merged into a local index, so "Browse all" gets more complete the more you use it.
- **Honest quotas**: GitHub allows 10 searches/minute anonymously and 30 with a token. A token bucket paces the plan, `x-ratelimit-*` headers stop it before exhaustion, and deferred channels are reported instead of silently dropped.
- **Stable Chinese, translated by the model**: the Host's own model service is tried first (the same channel the chat uses, so a filtered third-party translate endpoint cannot break it); one call translates a batch of descriptions as JSON, with an automatic half-batch retry. If that route is unavailable it falls back to the native `translator` service, Bing, MyMemory and Google in that order. Results are cached on disk, the card shows which route produced the Chinese, and failures get a "not translated" badge plus retry.
- **Star ranking**: relevance / most stars first / recently updated, remembered across sessions; the star view is one ordered list rather than category buckets.
- **Categorized browsing** and one-click install requests, with a manual-copy fallback when the clipboard is unavailable.

**Architecture**: the panel is client-only; search, the index and translation run behind `/github-plugin-finder/*` routes in the DSH host, so there is no CORS limit and the cache survives reloads. If those routes are absent (older install, host not restarted), the panel falls back to direct browser calls.

---

| 项目 / Item | 说明 / Detail |
| --- | --- |
| 许可证 / License | MIT |
| 适用 / Requires | DeepSeek Harness（带插件页与 Web 服务器插件） |
| 安装指令 / Install | `请帮我安装这个 DSH 插件：<owner>/github-plugin-finder` |
| 生效 / Activate | 重启 DSH；仅改面板时刷新页面即可 |
