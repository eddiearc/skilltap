# Changelog

## [1.0.0] — 2026-04-08 (breaking)

### Breaking Changes

- **Token auth removed from git-clone path** (`SkilltapConfig.token`, `SourceConfig.token`, `installSkill(..., token)`)
  - These fields/parameters are **deprecated and silently ignored**.
  - Private repos now authenticate via SSH keys or git credential helpers (e.g. macOS Keychain, `git-credential-store`, `gh auth login`).
  - Config files with a `token` field will continue to load without error, but the token will not be used.
  - **Migration:** configure HTTPS credentials or an SSH key for `github.com` (or your git host) instead of passing a PAT.

### New Features

- `skilltap marketplace update [skill]` — update all installed skills (or a specific skill) to latest version from their marketplace. This is the semantic equivalent of the legacy `skilltap update` command.
- Error propagation: `discoverSkillsFromMarketplace()` now throws on clone/auth failure instead of returning an empty list. SDK callers (e.g. `Skilltap.install()`) will surface meaningful errors when a source is unreachable or authentication fails.

### Deprecated

- `skilltap add <repo>` → use `skilltap marketplace add <name> <repo>`
- `skilltap remove <repo>` → use `skilltap marketplace remove <name>`
- `skilltap sources` → use `skilltap marketplace list`
- `skilltap update` → use `skilltap marketplace update`

Deprecated commands still function but print a warning. They will be removed in a future major version.

### Removed

- `src/core/github.ts` deleted — GitHub REST API path removed entirely
- `tests/core/github.test.ts` and `tests/e2e/live-github.test.ts` deleted (tested the removed API path)
- `listRepoDirs`, `getSkillMd`, `downloadSkillDir`, `downloadFile`, `findSkills` are no longer exported

### Internal

- `src/core/client.ts`: migrated from `github.ts` (GitHub REST API) to `marketplace/manager.ts` (git-clone-based discovery)
- `src/core/installer.ts`: migrated from GitHub API file download to `cloneOrUpdate` + recursive `copyDir`
- `src/core/source-utils.ts`: extracted shared source-parsing utilities
- `src/core/skill-md.ts`: unified `parseFrontmatter` implementation (fixes `argument-hint` → `argumentHint` mapping)
