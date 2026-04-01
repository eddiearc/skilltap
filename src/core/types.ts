/** A skill source — a GitHub repo containing skills */
export interface TapSource {
  owner: string
  repo: string
  branch?: string
}

/** Skill metadata parsed from SKILL.md frontmatter */
export interface SkillMeta {
  name: string
  description: string
  author?: string
  version?: string
  license?: string
  argumentHint?: string
}

/** A skill entry from a remote source */
export interface RemoteSkill {
  name: string
  meta: SkillMeta
  source: TapSource
  path: string
}

/** A locally installed skill */
export interface InstalledSkill {
  name: string
  meta: SkillMeta
  path: string
  source?: TapSource
}

/** Per-source configuration with optional token */
export interface SourceConfig {
  /** GitHub repo in "owner/repo" format */
  repo: string
  /** Optional per-source PAT for private repos */
  token?: string
  /** Optional branch override */
  branch?: string
}

/** A source entry — either a string "owner/repo" or a SourceConfig object */
export type SourceEntry = string | SourceConfig

/** Skilltap client configuration */
export interface SkilltapConfig {
  /** GitHub repos to use as skill sources — strings or SourceConfig objects */
  sources: SourceEntry[]
  /** Primary directory to install skills into (default: ~/.claude/skills) */
  installDir?: string
  /** GitHub personal access token for private repos (global fallback) */
  token?: string
  /** Target agent ids to symlink skills to, e.g. ['cursor', 'codex'] */
  agents?: string[]
  /** Additional custom directories to symlink skills to */
  dirs?: string[]
}

/** Error thrown when multiple sources have the same skill name */
export class SkillConflictError extends Error {
  constructor(
    public skillName: string,
    public sources: string[],
  ) {
    const list = sources.map((s) => `  - ${s}`).join('\n')
    super(`Multiple skills found for "${skillName}":\n${list}\nUse --from <owner/repo> to specify.`)
    this.name = 'SkillConflictError'
  }
}

/** Skilltap config file stored at ~/.skilltap/config.json */
export interface SkilltapConfigFile {
  sources: SourceEntry[]
  installDir: string
  token?: string
  agents?: string[]
  dirs?: string[]
}
