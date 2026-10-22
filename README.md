# github-plugin-finder · 插件发现（GitHub）

为 [DeepSeek Harness](https://www.deepseek.com) / Cordis 插件体系提供一个**插件发现面板**：在插件页新增「发现」标签，一键搜索 GitHub（含 npm 镜像源）上的插件，**英文简介自动翻译成中文**，按使用类型分类展示，并且每次都包含**最新上传**的插件；选中后复制安装指令，粘贴回对话即可让助手下载安装。

> A DeepSeek Harness / Cordis plugin-discovery panel: searches GitHub and the npm registry for plugins, translates English descriptions to Chinese, categorizes results by usage type, always includes the newest uploads, and copies an install request you can paste into the chat.

完整中英文介绍见 [INTRO.md](./INTRO.md) · Full introduction in [INTRO.md](./INTRO.md)

## 功能

- **多源搜索**：GitHub Search API（10 条覆盖式查询 + 分页，有令牌最多 3 页）+ npm registry 通道（独立配额，GitHub 限流时仍可用），按 `full_name` 去重
- **最新上传通道**：`created:>=近45天` 按创建时间排序，排在查询队列首位；14 天内创建的插件带「新 / NEW」徽章
- **中文翻译**：Google 翻译主源 + MyMemory 兜底，结果缓存在浏览器本地（`ghpf.tr.*`）；可一键切换「中文简介 / 原文」；网络不可达时自动降级为英文原文
- **按用途分类**：界面与主题 / MCP 集成 / 自动化与提醒 / 开发与调试 / AI 与智能体 / 实用工具 / 其他（中英文关键词双语识别）
- **限额可视化**：显示 GitHub 搜索配额剩余（`x-ratelimit-*`），接近耗尽自动停止
- **一键安装指令**：复制「请帮我从 GitHub 安装 DeepSeek Harness 插件：owner/repo」粘贴给助手即可；GitHub 来源的 npm 包会自动切换为 npm 安装语句；剪贴板不可用时提供手动复制文本框

## 安装

### 方式一：让助手安装（推荐）

把本仓库地址发给 DeepSeek Harness 里的助手：

```
请帮我安装这个 DSH 插件：<你的用户名>/github-plugin-finder
```

助手会从 GitHub 下载并完成安装。

### 方式二：本地安装

```bash
git clone https://github.com/<你的用户名>/github-plugin-finder.git
```

然后让助手执行：

```
请帮我安装本地 DSH 插件包，目录是：clone 下来的绝对路径
```

安装完成后**刷新一次插件页**即可看到「发现」标签。

## 使用

插件页 → **发现** → （可选填关键词）点击「搜索 GitHub」→ 按分类浏览 → 「复制安装指令」→ 粘贴回对话，助手负责审计、下载、安装。

### GitHub 令牌（可选）

无令牌搜索限额约 **10 次/分钟**；填入令牌后提升到约 **30 次/分钟**，并解锁基于 `dsh-plugin.json` / `cordis.patch.yml` 文件名的代码搜索，覆盖更全。

- 令牌仅保存在浏览器 `localStorage`（键 `ghpf.token`），不上传任何服务器
- 只需要**默认只读 public 权限**的 Token 即可（Fine-grained token 可不勾选任何 repository 权限）

## 降级与容错

| 场景 | 行为 |
| --- | --- |
| GitHub 搜索限流（403/429） | 自动停止并提示稍后重试或添加令牌；npm 通道继续工作 |
| 翻译端点被网络拦截 / CORS 失败 | 静默保留英文原文，不影响其他功能 |
| 浏览器剪贴板不可用 | 卡片内展示可手动复制的安装指令文本框 |

## 目录结构

```
github-plugin-finder/
├── package.json        # 包清单（dsh.bundle.patch + dsh.client 声明）
├── cordis.patch.yml    # Loader 补丁：把本插件插入插件页
├── index.js            # Host 入口（空 apply 桩）
├── client.js           # 客户端面板（搜索 / 翻译 / 分类 / 安装指令）
├── locale/en.json      # 英文文案（含插件页 meta 标题与描述）
├── locale/zh.json      # 中文文案
├── icon.svg            # 64×64 插件图标
└── README.md
```

修改代码后重新安装包并刷新插件页即可生效。

## License

[MIT](./LICENSE)
