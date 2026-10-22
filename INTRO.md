# 中英文介绍 · Introduction

---

## 中文介绍

**github-plugin-finder（插件发现）** 是一个开源的 DeepSeek Harness 插件，它在插件页新增一个「发现」标签，帮你在**海量 GitHub 仓库里快速找到适合自己的 Harness / Cordis 插件**——不用懂英文也能找。

- **自动翻译**：英文插件简介一键翻译成中文（带缓存、可随时切回原文），看不懂英文也能挑插件。
- **分类浏览**：按使用类型分成「界面与主题 / MCP 集成 / 自动化与提醒 / 开发与调试 / AI 与智能体 / 实用工具 / 其他」，中英文关键词双语识别。
- **找得全**：多组搜索查询 + 分页翻页 + npm 镜像源通道，多源去重，覆盖远超手动搜索。
- **永远包含新插件**：「最新上传」通道排在最前，45 天内新建的仓库优先进入结果，14 天内的插件带「新」徽章。
- **限额看得见**：实时显示 GitHub 搜索配额剩余，接近耗尽自动刹车；填入令牌（仅存本地浏览器）即可提高限额、解锁代码搜索。
- **安装只需一步**：选中插件 → 复制安装指令 → 粘贴回对话，助手自动完成审计、下载、安装。

> 内置限流保护、网络降级（翻译失败保留英文原文）、剪贴板兜底，任何网络环境下都能正常浏览。

**三步上手**：插件页 → 发现 → 搜索 GitHub → 复制安装指令，粘贴给助手即可安装。

---

## English Introduction

**github-plugin-finder (Plugin Discover)** is an open-source DeepSeek Harness plugin that adds a **Discover** tab to the Plugins page, helping you find the right Harness / Cordis plugin among thousands of GitHub repositories — fast and in your own language.

- **Auto translation**: English plugin descriptions are translated into Chinese with local caching and a one-click toggle back to the original text.
- **Categorized browsing**: results are grouped by usage type — UI & Theme / MCP / Automation / Developer / AI & Agents / Tools / Other — using bilingual keyword matching.
- **Wider coverage**: multiple search queries, pagination, and an extra npm-registry channel, all deduplicated, so it finds far more than manual searching.
- **Always includes the newest uploads**: a created-within-45-days channel runs first; repositories younger than 14 days get a **NEW** badge.
- **Visible rate limit**: live `x-ratelimit` countdown, automatic politeness stop, and an optional browser-only token that raises the quota and unlocks code search.
- **One-step install**: pick a plugin → copy the install request → paste it into the chat; the assistant audits, downloads, and installs it for you.

> Built-in rate-limit protection, graceful network degradation (translation failures fall back to the original English), and a clipboard fallback keep browsing reliable on any network.

**Quick start**: Plugins page → Discover → Search GitHub → copy the install request and paste it into the chat.

---

### 仓库信息 · Repository info

| | |
| --- | --- |
| 语言 / Language | 客户端 JavaScript（纯浏览器运行，无构建步骤） |
| 许可证 / License | MIT |
| 适用 / Requires | DeepSeek Harness（带插件页与 Client 插件系统） |
| 安装指令 / Install | `请帮我安装这个 DSH 插件：<owner>/github-plugin-finder` |
