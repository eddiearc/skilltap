# skilltap

一个仓库就是一个技能市场。

从 GitHub 仓库安装 AI Agent 技能。

[English](./README.md) | 中文文档

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

## CLI 用法

```bash
# 添加技能源
skilltap add anthropics/skills

# 搜索技能
skilltap search pdf

# 安装技能 -> ~/.claude/skills/pdf/
skilltap install pdf

# 查看已安装的技能
skilltap list

# 更新所有已安装的技能
skilltap update

# 卸载
skilltap uninstall pdf
```

## SDK 用法

```typescript
import { Skilltap } from 'skilltap'

const st = new Skilltap({
  sources: ['anthropics/skills', 'your-company/skills'],
  installDir: '~/.claude/skills',
  token: 'ghp_xxx', // 可选，用于私有仓库
})

const results = await st.search('pdf')
await st.install('pdf')
await st.update()
```

## 配置

配置文件位于 `~/.skilltap/config.json`：

```json
{
  "sources": ["anthropics/skills"],
  "installDir": "~/.claude/skills"
}
```

## License

MIT
