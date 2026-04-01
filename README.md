# skilltap

One repo = one skill market, even when skills live in nested folders.

Install AI agent skills from GitHub repos — with multi-agent support.

[中文文档](./README.zh-CN.md) | English

## Install

```bash
# As a CLI (global)
npm install -g @eddiearc/skilltap

# As an SDK
npm install @eddiearc/skilltap
```

## Concept

A **tap** is a GitHub repository containing AI agent skills (directories with `SKILL.md`). `skilltap` recursively discovers skill folders, so it works with both flat repos and nested layouts such as `skills/pdf/SKILL.md`.

```
github.com/anthropics/skills/       <- this is a tap
├── skills/
│   ├── pdf/
│   │   └── SKILL.md
│   ├── frontend-design/
│   │   └── SKILL.md
│   └── canvas-design/
│       └── SKILL.md
└── template/
    └── SKILL.md
```

Skills are installed to `~/.agents/skills/` (universal directory) by default, and can be symlinked to any agent's directory.

## CLI Usage

### Source Management

```bash
# Add a skill source
skilltap add anthropics/skills

# Add a private source with a per-source token
skilltap add company/private-skills --token ghp_xxx

# Remove a source
skilltap remove anthropics/skills

# List configured sources
skilltap sources
```

### Browse & Search

```bash
# Search for skills
skilltap search pdf
```

### Install & Uninstall

```bash
# Install to ~/.agents/skills/ only
skilltap install pdf

# Install + symlink to all detected agents
skilltap install pdf -g

# Install + symlink to specific agents
skilltap install pdf -a claude-code cursor codex

# Install + symlink to custom directories
skilltap install pdf -d ~/my-project/.claude/skills

# Install from a specific source (when multiple sources have the same skill)
skilltap install pdf --from anthropics/skills

# Uninstall
skilltap uninstall pdf
skilltap uninstall pdf -g    # also remove symlinks from all agents
```

### Update

```bash
# Update all installed skills
skilltap update

# Update + refresh symlinks for all agents
skilltap update -g
```

### Multi-Agent Support

```bash
# List supported agents and detect which are installed
skilltap agents
#   ✓ Claude Code (claude-code) → ~/.claude/skills
#   ✓ Cursor (cursor) → ~/.cursor/skills
#   ✓ Codex (codex) → ~/.codex/skills
#   · Windsurf (windsurf) → ~/.windsurf/skills
#   3 agent(s) detected
```

Skills are stored as real files in `~/.agents/skills/` and symlinked to each agent's directory:

```
~/.agents/skills/pdf/          <- real files
~/.claude/skills/pdf           <- symlink
~/.cursor/skills/pdf           <- symlink
~/.codex/skills/pdf            <- symlink
```

Supported agents: Claude Code, Codex, Cursor, Windsurf, GitHub Copilot, Gemini CLI, Cline, Roo Code, Amp, Augment.

## Skill Discovery

The skill format is based on the Agent Skills convention: a skill is a directory containing a `SKILL.md` file with YAML frontmatter and markdown instructions.

`skilltap` treats a source repo as a directory tree and discovers skills with this rule:

1. Start at the repo root.
2. For each subdirectory, check whether it directly contains `SKILL.md`.
3. If yes, register that directory as a skill and stop descending into it.
4. If not, continue recursively through its child directories.

This matches the current `anthropics/skills` layout, where most skills live under `skills/`, while still supporting flat repositories.

### Conflict Resolution

When multiple sources have a skill with the same name:

```bash
$ skilltap install pdf
# Multiple skills found for "pdf":
#   - anthropics/skills
#   - my-company/skills
# Use --from to specify: skilltap install pdf --from <owner/repo>

$ skilltap install pdf --from my-company/skills
# Installed: pdf → ~/.agents/skills/pdf
```

## SDK Usage

```typescript
import { Skilltap } from '@eddiearc/skilltap'

const st = new Skilltap({
  sources: [
    'anthropics/skills',                                    // public source (string)
    { repo: 'company/private-skills', token: 'ghp_xxx' },  // private source with per-source token
  ],
  token: 'ghp_fallback',            // optional, global fallback token
  agents: ['claude-code', 'cursor'], // optional, symlink targets
})

// Browse & search
const all = await st.available()
const results = await st.search('pdf')

// Install & manage
await st.install('pdf')
await st.install('pdf', { from: 'anthropics/skills' })
await st.uninstall('pdf')
await st.update()

// List installed
const installed = await st.list()
```

### Detect Installed Agents

```typescript
import { detectInstalledAgents } from '@eddiearc/skilltap'

const agents = await detectInstalledAgents()
// [{ id: 'claude-code', name: 'Claude Code', globalDir: '~/.claude/skills' }, ...]
```

## Authentication

For each source, tokens are resolved in this order:

1. **Per-source token** (from `SourceConfig.token`)
2. **Global token** (from `SkilltapConfig.token` or `~/.skilltap/config.json`)
3. **Auto-detected credentials** (`gh` CLI config or `GITHUB_TOKEN` env var)

For public repos, no auth is needed.

## Config

Config is stored at `~/.skilltap/config.json`:

```json
{
  "sources": [
    "anthropics/skills",
    { "repo": "company/private-skills", "token": "ghp_xxx" }
  ],
  "installDir": "~/.agents/skills",
  "token": "ghp_global_fallback"
}
```

## Versioning And Release

The CLI version is read from `package.json`, so `skilltap --version` stays aligned with the published package version.

The release workflow also uses `package.json` as the source of truth:

1. Read `package.json.version`
2. Publish that package version to npm
3. Create and push the matching Git tag (`v<version>`)

## License

MIT
