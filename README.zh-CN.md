# skilltap

一个仓库就是一个技能市场。

从 GitHub 仓库安装 AI Agent 技能，支持多 Agent 分发。

[English](./README.md) | 中文文档

## 安装

```bash
# 作为 CLI（全局安装）
npm install -g @eddiearc/skilltap

# 作为 SDK
npm install @eddiearc/skilltap
```

## 概念

一个 **tap** 就是一个包含 AI Agent 技能的 GitHub 仓库（每个目录含 `SKILL.md`）。添加一个 tap，就能浏览和安装里面的技能。

```
github.com/anthropics/skills/       <- 这就是一个 tap
├── pdf/
│   └── SKILL.md
├── frontend-design/
│   └── SKILL.md
└── canvas-design/
    └── SKILL.md
```

技能默认安装到 `~/.agents/skills/`（通用目录），并可通过软链接分发到各个 Agent 的目录。

## CLI 用法

### 源管理

```bash
# 添加技能源
skilltap add anthropics/skills

# 移除源
skilltap remove anthropics/skills

# 查看已配置的源
skilltap sources
```

### 浏览和搜索

```bash
# 搜索技能
skilltap search pdf
```

### 安装和卸载

```bash
# 只安装到 ~/.agents/skills/
skilltap install pdf

# 安装 + 软链接到所有检测到的 Agent
skilltap install pdf -g

# 安装 + 软链接到指定 Agent
skilltap install pdf -a claude-code cursor codex

# 安装 + 软链接到自定义目录
skilltap install pdf -d ~/my-project/.claude/skills

# 从指定源安装（当多个源有同名技能时）
skilltap install pdf --from anthropics/skills

# 卸载
skilltap uninstall pdf
skilltap uninstall pdf -g    # 同时移除所有 Agent 的软链接
```

### 更新

```bash
# 更新所有已安装的技能
skilltap update

# 更新 + 刷新所有 Agent 的软链接
skilltap update -g
```

### 多 Agent 支持

```bash
# 查看支持的 Agent 及本机检测结果
skilltap agents
#   ✓ Claude Code (claude-code) → ~/.claude/skills
#   ✓ Cursor (cursor) → ~/.cursor/skills
#   ✓ Codex (codex) → ~/.codex/skills
#   · Windsurf (windsurf) → ~/.windsurf/skills
#   3 agent(s) detected
```

技能以实体文件存储在 `~/.agents/skills/`，通过软链接分发到各 Agent 目录：

```
~/.agents/skills/pdf/          <- 实体文件
~/.claude/skills/pdf           <- 软链接
~/.cursor/skills/pdf           <- 软链接
~/.codex/skills/pdf            <- 软链接
```

支持的 Agent：Claude Code、Codex、Cursor、Windsurf、GitHub Copilot、Gemini CLI、Cline、Roo Code、Amp、Augment。

### 冲突处理

当多个源有同名技能时：

```bash
$ skilltap install pdf
# Multiple skills found for "pdf":
#   - anthropics/skills
#   - my-company/skills
# Use --from to specify: skilltap install pdf --from <owner/repo>

$ skilltap install pdf --from my-company/skills
# Installed: pdf → ~/.agents/skills/pdf
```

## SDK 用法

```typescript
import { Skilltap } from '@eddiearc/skilltap'

const st = new Skilltap({
  sources: ['anthropics/skills', 'your-company/skills'],
  token: 'ghp_xxx',              // 可选，用于私有仓库
  agents: ['claude-code', 'cursor'], // 可选，软链接目标
})

// 浏览和搜索
const all = await st.available()
const results = await st.search('pdf')

// 安装和管理
await st.install('pdf')
await st.install('pdf', { from: 'anthropic/skills' })
await st.uninstall('pdf')
await st.update()

// 查看已安装
const installed = await st.list()
```

### 检测已安装的 Agent

```typescript
import { detectInstalledAgents } from '@eddiearc/skilltap'

const agents = await detectInstalledAgents()
// [{ id: 'claude-code', name: 'Claude Code', globalDir: '~/.claude/skills' }, ...]
```

## 鉴权

skilltap 按以下顺序自动检测 GitHub 凭证：

1. `gh` CLI 配置（`~/.config/gh/hosts.yml`）
2. `GITHUB_TOKEN` 环境变量
3. `~/.skilltap/config.json` 中的 token 字段

公开仓库无需鉴权。

## 配置

配置文件位于 `~/.skilltap/config.json`：

```json
{
  "sources": ["anthropics/skills"],
  "installDir": "~/.agents/skills"
}
```

## License

MIT
