# skilltap

One repo = one skill market, even when skills live in nested folders.

Install AI agent skills from any git repository — with multi-agent support.

[中文文档](./README.zh-CN.md) | English

## Install

```bash
# As a CLI (global)
npm install -g @eddiearc/skilltap

# As an SDK
npm install @eddiearc/skilltap
```

## Concept

A **tap** is a repository containing AI agent skills (directories with `SKILL.md`). `skilltap` recursively discovers skill folders, so it works with both flat repos and nested layouts such as `skills/pdf/SKILL.md`.

Taps can live anywhere — GitHub, GitLab, Bitbucket, Gitea, or any self-hosted git server. Private repos authenticate automatically via your existing SSH keys or credential helper, with no extra token configuration needed.

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

### Marketplace (Recommended)

Marketplaces are git repositories or local directories that act as skill sources. Unlike the legacy source system, they work with any git hosting platform, authenticate via your existing SSH keys, and avoid GitHub REST API rate limits.

#### Add a marketplace

```bash
# GitHub (HTTPS)
skilltap marketplace add anthropics https://github.com/anthropics/skills

# GitHub (SSH) — uses your SSH key automatically for private repos
skilltap marketplace add my-private git@github.com:myorg/private-skills.git

# GitLab (self-hosted)
skilltap marketplace add corp https://gitlab.mycompany.com/team/skills

# Bitbucket
skilltap marketplace add bb https://bitbucket.org/owner/skills-repo

# Local directory
skilltap marketplace add local /path/to/my/skills

# Specific branch
skilltap marketplace add staging https://github.com/anthropics/skills --branch dev

# Skills live in a subdirectory of the repo
skilltap marketplace add mono https://github.com/owner/monorepo --scan-path .agents/skills
```

#### Manage marketplaces

```bash
# List configured marketplaces
skilltap marketplace list

# Remove a marketplace
skilltap marketplace remove anthropics

# Refresh the skill cache for a marketplace
skilltap marketplace refresh
skilltap marketplace refresh anthropics   # specific marketplace only
```

#### Browse, search, and install

```bash
# Browse all marketplaces
skilltap browse

# Browse a specific marketplace
skilltap browse anthropics

# Search across all marketplaces
skilltap search pdf

# Search within a specific marketplace
skilltap search pdf --marketplace anthropics

# Install from any marketplace
skilltap install pdf

# Install from a specific marketplace
skilltap install pdf --marketplace anthropics
skilltap install pdf@anthropics              # equivalent shorthand

# List installed skills
skilltap list
skilltap list --verbose   # includes marketplace info

# Uninstall
skilltap uninstall pdf@anthropics   # preferred: unambiguous when skill is from multiple marketplaces
skilltap uninstall pdf              # removes the first record when only one marketplace has it
```

### Source Management (Legacy — Deprecated)

> **Deprecated (v1.0.0):** These commands are kept for backwards compatibility but print a deprecation warning. The underlying GitHub REST API implementation has been removed. Use the `marketplace` subcommands instead.

```bash
# Add a skill source (deprecated — use: skilltap marketplace add <name> <repo>)
skilltap add anthropics/skills

# Add a private source (--token is ignored; use SSH key or credential helper)
skilltap add company/private-skills

# Remove a source
skilltap remove anthropics/skills

# List configured sources
skilltap sources

# Update all skills from legacy sources
skilltap update
skilltap update -g   # also refresh symlinks for all detected agents
```

### Agent symlinks (SDK)

CLI marketplace install currently writes to `~/.agents/skills/` only. To symlink skills into agent directories, use the SDK:

```typescript
const st = new Skilltap({
  sources: ['anthropics/skills'],
  agents: ['claude-code', 'cursor'],       // symlink to detected agent dirs
  dirs: ['~/my-project/.claude/skills'],   // or custom dirs
})
await st.install('pdf')
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

**Marketplace system:** When multiple marketplaces have a skill with the same name, specify the marketplace:

```bash
$ skilltap install pdf
# Multiple skills found: pdf@anthropics, pdf@corp
# Specify which marketplace to use:
#   skilltap install pdf --marketplace <name>

$ skilltap install pdf@corp
# ✓ Successfully installed skill "pdf" from marketplace "corp"
```

**Legacy source system:** Use `--from` in the SDK or specify the source in the `Skilltap` constructor:

```typescript
await st.install('pdf', { from: 'my-company/skills' })
```

## SDK Usage

```typescript
import { Skilltap } from '@eddiearc/skilltap'

const st = new Skilltap({
  sources: [
    'anthropics/skills',              // public source (string)
    { repo: 'company/private-skills' }, // private source — auth via SSH key / credential helper
  ],
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

### Marketplace (git-based)

Marketplaces authenticate through git itself. No token configuration is required:

- **Public repos**: no auth needed
- **Private repos via SSH**: use an SSH URL (`git@host:owner/repo.git`) — your existing SSH key and agent handle authentication transparently
- **Private repos via HTTPS**: git uses your configured credential helper (e.g. macOS Keychain, `git-credential-store`)

### Legacy Source System (GitHub API)

> **Breaking change (v1.0.0):** `SkilltapConfig.token`, `SourceConfig.token`, and the `token` parameter of `installSkill()` are deprecated and **ignored** in the git-clone-based path. Private repos authenticate via SSH keys or git credential helpers, not API tokens.
>
> **Migration:** if you previously passed a token, configure SSH key or HTTPS credentials for `github.com` instead (e.g. `gh auth login`, macOS Keychain, or `git-credential-store`).

The legacy `add`/`remove`/`sources`/`update` commands still work but print a deprecation warning and will be removed in a future major version. Use the `marketplace` subcommands instead.

## Config

Config is stored at `~/.skilltap/config.json`:

```json
{
  "sources": [
    "anthropics/skills",
    { "repo": "company/private-skills" }
  ],
  "installDir": "~/.agents/skills"
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
