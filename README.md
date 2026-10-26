# github-plugin-finder · 插件发现（GitHub）

为 [DeepSeek Harness](https://www.deepseek.com) / Cordis 插件体系提供一个**插件发现面板**：在插件页新增「发现」标签，搜索 GitHub、npm 与社区目录中的插件，**能识别精确插件名**，**联网翻译英文简介**，按使用类型分类展示；选中后复制安装指令，粘贴回对话即可让助手下载安装。

> A DeepSeek Harness / Cordis plugin-discovery panel: searches GitHub, npm and a community catalog, resolves exact plugin names, translates descriptions through a cached multi-provider pipeline, groups results by usage, and copies an install request you can paste into the chat.

完整中英文介绍见 [INTRO.md](./INTRO.md) · Full introduction in [INTRO.md](./INTRO.md)

## 两代之间做了什么（v2.1）

| 问题 | v1.1 | v2.0 |
| --- | --- | --- |
| 搜不全 | 12 条固定查询一口气打完，无令牌时 10 次/分钟的配额在中途耗尽，后面的渠道静默 403 | **预算化遍历 + 自动补轮**：令牌桶 + 限流头驱动的暂停 + 跨请求共享的查询缓存；一轮跑不完就自动再来一轮，缓存过的页面不重复计费，跑不完的渠道明确标为「顺延」 |
| 二代反而更少 | 只查 topic，没打 topic 的仓库全丢；结果上限 240、首屏 60 | **topic + 关键词双路**：`dsh plugin`、`"deepseek harness" plugin`、`cordis plugin` 等词面通道补齐；结果上限 1200、首屏 150 并可继续展开；补轮时自动翻到第 2 页（有令牌到第 3 页） |
| 越搜越穷 | 每次搜索都从零开始 | **本地索引**：见过的仓库落到 `$DSH_HOME/github-plugin-finder/index.json`，下次参与排序；「全部浏览」随使用越来越全 |
| 精确名称也被当成关键词 | `dsh-lean` 会被拼进所有查询，返回一堆「关键词包含」的仓库 | **意图识别**：`owner/repo`、GitHub URL、`@scope/pkg`、`dsh-*`、`exact:名称` 走精确解析，命中的放「精确命中」，没命中的明确说「不存在」，相近结果单独标出 |
| 翻译缺斤少两 | 先打 Google 免费端点，被墙时每条都等超时；最多翻 80 条 | **模型直译**：优先用 DSH 宿主的模型服务把整批简介译成 JSON（和聊天同一条通道，墙不墙都通），失败自动对半重试；再退到 DSH 原生 `translator` 服务、Bing、MyMemory、Google；全部结果落盘缓存 |
| 想按热度看 | 只能按相关度 | **星标排行**：相关度 / 星标从多到少 / 最近更新，一键切换并记住选择；星标模式下按单一有序列表渲染，不打散到分类里 |
| 浏览器够不着 | 面板在浏览器里直接打第三方 API，受 CORS 与 localStorage 限制 | **本地引擎**：DSH 宿主内的 `/github-plugin-finder/*` 路由负责网络与缓存；路由不可用时面板自动退回浏览器直连 |

## v2.2 新增（本周热门 / 隐私标签 / 拦截代理兼容）

| 能力 | 做法 |
| --- | --- |
| **本周热门** | 索引每次记录星标快照（`store.mjs` 的 `sh` 字段），`/hot` 路由按「7 天内星标增长 ≥ 50」排序；索引还没有满 7 天的快照时，卡片会标「窗口不足」而不是假装精确。首个星期只能看到「新建 ≤ 7 天」仓库的全量星标 |
| **隐私/权限标签** | `security.mjs` 扫描仓库简介、README 与 `package.json`，命中识屏、剪贴板、Cookie/浏览器数据、密码/私钥、安装脚本、混淆/eval、遥测、外传数据等能力时，在简介下打「需留意权限 / 隐私风险」标，并列出命中项与证据片段。**是启发式提示，不是安全审计**：没打标不等于安全，打标也不等于恶意 |
| **拦截代理兼容** | 当本机有 MITM 代理（Steam++、公司网关等）导致 `fetch` 报证书错误时，`request()` 先用本地 PEM（`NODE_EXTRA_CA_CERTS`、`<data>/extra-ca.pem`、radar 导出的 SteamTools 根）重试，仍失败则首次信任抓取服务器实际证书链再试；错误信息保留原始原因（不再只有一句 `fetch failed`）。证书链抓取会缓存 12 小时，代理换根后自动重学 |
| **扫描缓存** | 每个仓库的结论缓存 7 天在索引里（`sec` 字段），浏览时不会反复下载 README；一次扫描最多 12 个仓库、并发 4，README 与 `package.json` 各 1 次核心 API 请求 |

## 功能

- **三种搜索模式**：自动（按输入判断）/ 精确名称 / 关键词 / 全部浏览
- **精确解析**：`owner/repo`、`https://github.com/o/n`、`@scope/pkg`、`dsh-whale-widget`、`exact:名字`
- **范围查询**：`topic:dsh-plugin`、`user:MeteorNOX`、`lang:typescript`、`stars:>10`、`pushed:2026-01-01`
- **中文也能搜**：中文关键词会自动补一次对应的英文词（界面→ui/theme、提醒→reminder/schedule 等），不必先翻成英文
- **多渠道遍历**：8 个生态 topic、`dsh- in:name`、`dsh plugin` / `"deepseek harness" plugin` / `cordis plugin` 等词面查询、最新上传（`created:>=`）、manifest 代码搜索（需令牌）、npm registry
- **自动补轮**：一轮预算（8/14/20 次查询，按深度）用完后自动再走一轮，缓存页面不重复计费；补轮会把深度 +1，也就是去翻第 2 页（有令牌可到第 3 页），直到渠道跑完或额度用尽
- **额度管理**：无令牌 10 次/分钟、令牌 30 次/分钟；显示剩余额度与「顺延渠道」，可点「深度搜索」继续
- **稳定翻译**：优先模型直译（DSH 宿主的 `llm` 服务，批量 JSON，失败对半重试）→ DSH 原生 `translator` 服务 → Bing → MyMemory → Google；磁盘缓存 + 熔断，表格里标出来源，失败条目带「未翻译」与「重试翻译」
- **星标排行**：相关度 / 星标从多到少 / 最近更新；选择会记住，星标模式下按排名单列表展示
- **分类浏览**：界面与主题 / MCP 集成 / 自动化与提醒 / 开发与调试 / AI 与智能体 / 实用工具 / 其他
- **本周热门**：按钮一键查看 7 天内星标增长 ≥ 50 的插件，按增长量排序；星标增长来自索引快照，窗口不足会标注
- **隐私/权限标签**：简介下方自动提示「需留意权限 / 隐私风险」，命中识屏、剪贴板、Cookie、密码、安装脚本、混淆代码、遥测、外传数据等能力时列出证据
- **一键安装指令**：复制安装请求；npm 包自动切换为 npm 安装语句；剪贴板不可用时有手动复制文本框

## 安装

### 方式一：让助手安装（推荐）

把本仓库地址发给 DeepSeek Harness 里的助手：

```
请帮我安装这个 DSH 插件：<你的用户名>/github-plugin-finder
```

### 方式二：本地安装

```bash
git clone https://github.com/<你的用户名>/github-plugin-finder.git
```

然后让助手执行：

```
请帮我安装本地 DSH 插件包，目录是：clone 下来的绝对路径
```

安装完成后**重启一次 DSH**（Host 侧要注册本地路由），再刷新插件页，「发现」标签即可用。

> 只刷新页面也能用：面板探测不到本地引擎时会自动切换到「浏览器直连」模式，功能少一些但不白屏。

## 使用

插件页 → **发现** → 输入名称或关键词（或点「全部浏览」）→ 按分类浏览 → 「复制安装指令」→ 粘贴回对话。

- **本周热门**：点「本周热门」按钮，查看 7 天内星标增长 ≥ 50 的插件（卡片上的「本周 +N」即增长量）
- **隐私/权限标签**：结果卡片加载后会自动扫描，命中敏感能力时简介下方出现标签与命中项，悬停可看证据；扫描只在本地引擎模式可用

### 精确查找

| 输入 | 行为 |
| --- | --- |
| `dsh-whale-widget` | 先按同名仓库/npm 包解析，命中即为「精确命中」；没命中会直说，不拿相似结果冒充 |
| `Nothingness111/github-plugin-finder` | 直接查该仓库 |
| `exact:某个名字` | 强制按名称解析（名称里带空格时用这个） |
| `topic:dsh-plugin 主题` | 在该 topic 内按关键词过滤 |

### GitHub 令牌（可选）

- 无令牌：搜索 10 次/分钟、核心接口 60 次/小时
- 有令牌：搜索 30 次/分钟、核心接口 5000 次/小时，并解锁 `dsh-plugin.json` / `cordis.patch.yml` 代码搜索
- 令牌只保存在浏览器 `localStorage`（键 `ghpf.token`），每次搜索随请求发给本机路由，不写入磁盘、不打印日志

### 翻译

- 主通道 Bing（可一次翻 10 条），失败自动切 MyMemory（可填联系邮箱提高配额）、再切 Google
- 成功译文缓存在 `$DSH_HOME/github-plugin-finder/translate-cache.json`，第二次打开同一批插件零请求
- 两次连续失败的通道会被停用 30 分钟，避免每条都等超时

## 降级与容错

| 场景 | 行为 |
| --- | --- |
| Host 路由不存在（未重启 / 旧安装） | 面板切到「浏览器直连」，仍可搜索与翻译（受浏览器配额与 CORS 限制）；本周热门与隐私标签只在本地引擎可用 |
| GitHub 限流（403/429） | 停止消费额度，标出「顺延 N 个渠道」与重置时间；本地索引与 npm 通道继续工作 |
| 翻译全部失败 | 显示英文原文 + 「未翻译」标记 + 「重试翻译」按钮 |
| 社区目录不可达 | 使用上次缓存（24 小时）；无缓存则跳过该通道并记录警告 |
| 本机 MITM 代理导致证书错误 | 依次用本地 PEM、首次信任抓链重试；仍失败时错误信息带真实原因（如 `self-signed certificate`），不再只有 `fetch failed` |
| 浏览器剪贴板不可用 | 卡片内展示可手动复制的安装指令 |

## 目录结构

```
github-plugin-finder/
├── package.json          # 包清单（dsh.bundle.patch + dsh.client）
├── cordis.patch.yml      # Loader 补丁：插入本插件
├── index.js              # Host 入口：注册 /github-plugin-finder/* 路由
├── lib/
│   ├── intent.mjs        # 搜索意图（精确 / 关键词 / topic / owner / 浏览）
│   ├── plan.mjs          # 预算化渠道计划
│   ├── github.mjs        # GitHub/npm 客户端 + 令牌桶 + 限流跟踪 + 查询缓存
│   ├── rank.mjs          # 去重、打分、分类
│   ├── search.mjs        # 编排：精确解析 → 渠道 → 合并 → 建索引
│   ├── translate.mjs     # 三通道翻译 + 熔断 + 磁盘缓存 + 术语校正
│   ├── store.mjs         # 本地索引、星标快照、本周增长与扫描结论缓存
│   ├── security.mjs      # 隐私/权限启发式扫描（README + package.json + 简介）
│   ├── routes.mjs        # HTTP 处理器（search / translate / hot / scan / refresh / health）
│   └── util.mjs          # 路径、JSON、HTTP 超时等
├── client.js             # 客户端面板
├── locale/{en,zh}.json   # 插件页文案
├── test/run.mjs          # 离线单测（意图/计划/排序/翻译/索引/路由）
├── test/client.mjs       # 面板冒烟测试（VM + 迷你 hook 运行时）
└── icon.svg
```

修改 Host 代码需要重启 DSH；只改 `client.js` 时刷新页面即可。

## 测试

```bash
node test/run.mjs      # 60 项离线断言
node test/client.mjs   # 面板渲染 / 搜索 / 翻译 / 筛选 / 精确未命中
```

## 致谢

- 社区目录种子来自 [Blue-Whale-Harness](https://github.com/leenkcool/Blue-Whale-Harness)（Apache-2.0）：只取其中的仓库名单用于补齐关键词搜索覆盖不到的仓库，遍历逻辑、排序与翻译均为本项目自研。

## License

[MIT](./LICENSE)
