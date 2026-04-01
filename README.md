# skilltap

Install AI agent skills from GitHub repos. One repo = one skill tap.

## Concept

A **tap** is a GitHub repository containing AI agent skills (directories with `SKILL.md`). Add a tap, then browse and install skills from it.

```
github.com/anthropics/skills/       ← this is a tap
├── pdf/
│   └── SKILL.md
├── frontend-design/
│   └── SKILL.md
└── canvas-design/
    └── SKILL.md
```

## CLI Usage

```bash
# Add a skill source
skilltap add anthropics/skills

# Search for skills
skilltap search pdf

# Install a skill → ~/.claude/skills/pdf/
skilltap install pdf

# List installed skills
skilltap list

# Update all installed skills
skilltap update

# Uninstall
skilltap uninstall pdf
```

## SDK Usage

```typescript
import { Skilltap } from 'skilltap'

const st = new Skilltap({
  sources: ['anthropics/skills', 'your-company/skills'],
  installDir: '~/.claude/skills',
  token: 'ghp_xxx', // optional, for private repos
})

const results = await st.search('pdf')
await st.install('pdf')
await st.update()
```

## Config

Config is stored at `~/.skilltap/config.json`:

```json
{
  "sources": ["anthropics/skills"],
  "installDir": "~/.claude/skills"
}
```

## License

MIT
