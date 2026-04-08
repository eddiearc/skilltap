# Git Marketplace — Configuration & Validation Guide

This document describes how to configure a git-based marketplace and verify that it works end-to-end.

## Prerequisites

- `git` installed and available on `$PATH`
- Network access to the target git host (or local path available)
- For private repos: SSH key configured, or HTTPS credentials in your credential helper

## Configuration

### 1. Add a marketplace

```bash
# Public GitHub repo
skilltap marketplace add myskills https://github.com/owner/skills-repo

# SSH URL (for private repos — uses your SSH key automatically)
skilltap marketplace add private git@github.com:myorg/private-skills.git

# Self-hosted GitLab
skilltap marketplace add corp https://gitlab.mycompany.com/team/skills

# Monorepo: skills live under .agents/skills/ inside the repo
skilltap marketplace add mono https://github.com/owner/monorepo --scan-path .agents/skills

# Specific branch
skilltap marketplace add beta https://github.com/owner/skills-repo --branch dev

# Local directory (useful for development/testing)
skilltap marketplace add local /path/to/local/skills
```

The configuration is saved to `~/.skilltap/marketplaces.json`.

### 2. Verify the marketplace was added

```bash
skilltap marketplace list
# Expected output:
#   Configured marketplaces (1):
#
#     myskills
#       Type: git
#       Source: https://github.com/owner/skills-repo
#       Added: ...
```

## Optional: Validate --branch and --scan-path

These are key feature surfaces from issue #6 — verify at least one before sign-off.

**Branch override:**
```bash
skilltap marketplace add beta https://github.com/owner/skills-repo --branch dev
skilltap marketplace refresh beta
# Expected: Found N skills in "beta" (from the dev branch)
skilltap marketplace remove beta
```

**Subdirectory scan (monorepo):**
```bash
skilltap marketplace add mono https://github.com/owner/monorepo --scan-path .agents/skills
skilltap marketplace refresh mono
# Expected: Found N skills in "mono"
# Skills should be discovered from <repo-root>/.agents/skills/, not the entire repo
skilltap browse mono
skilltap marketplace remove mono
```

---

## Skill Discovery Validation

### 3. Refresh and inspect

Force a cache refresh to trigger a git clone/pull and skill scan:

```bash
skilltap marketplace refresh myskills
# Expected: Found N skills in "myskills"
```

If this fails with a git error, check:
- Network connectivity to the host
- SSH key loaded (`ssh-add -l`) for SSH URLs
- Correct URL format

### 4. Browse available skills

```bash
skilltap browse myskills
# Expected: lists all discovered skills with name + description
```

### 5. Search for a specific skill

```bash
skilltap search pdf --marketplace myskills
# Expected: shows matching skills from this marketplace
```

## Installation Validation

### 6. Install a skill

```bash
skilltap install pdf@myskills
# Expected:
#   ✓ Successfully installed skill "pdf" from marketplace "myskills"
#     Installed to: ~/.agents/skills/pdf
```

Verify the file was installed:

```bash
ls ~/.agents/skills/pdf/
# Should contain SKILL.md and other skill files
```

### 7. List installed skills

```bash
skilltap list --verbose
# Expected: shows "pdf@myskills" with install path and date
```

### 8. Uninstall

```bash
skilltap uninstall pdf@myskills
# Expected: ✓ Successfully uninstalled skill "pdf"
```

Verify removal:

```bash
ls ~/.agents/skills/pdf/
# Expected: No such file or directory
```

## Cache Inspection

The git clone cache lives at `~/.skilltap/git-cache/<hash>/`.
The marketplace manifest cache lives at `~/.skilltap/marketplaces/<name>.json`.

```bash
# Inspect git cache
ls ~/.skilltap/git-cache/

# Inspect manifest cache (JSON)
cat ~/.skilltap/marketplaces/myskills.json
```

The manifest cache is valid for 1 hour. After that, `skilltap marketplace refresh` triggers a `git pull` on the cached clone.

## Private Repo Validation (SSH)

```bash
# Test SSH connectivity first
ssh -T git@github.com
# Expected: Hi <username>! You've successfully authenticated...

# Add private marketplace via SSH URL
skilltap marketplace add private git@github.com:myorg/private-skills.git

# Refresh to trigger clone
skilltap marketplace refresh private
# Expected: Found N skills in "private"
```

If the clone fails, confirm your SSH agent has the key loaded:

```bash
ssh-add -l
# Should list your key; if empty: ssh-add ~/.ssh/id_ed25519
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `git clone failed` | Network / auth issue | Check URL format, SSH key, credentials |
| `Found 0 skills` | Wrong `--scan-path` | Verify the path contains `SKILL.md` files |
| `Skill not found in git cache` | Cache stale / clone incomplete | Run `marketplace refresh` |
| `git is not installed` | Missing dependency | Install git from <https://git-scm.com> |
