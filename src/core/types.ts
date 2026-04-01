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

/** Skilltap client configuration */
export interface SkilltapConfig {
  /** GitHub repos to use as skill sources, e.g. ['anthropics/skills'] */
  sources: string[]
  /** Local directory to install skills into (default: ~/.claude/skills) */
  installDir?: string
  /** GitHub personal access token for private repos */
  token?: string
}

/** Skilltap config file stored at ~/.skilltap/config.json */
export interface SkilltapConfigFile {
  sources: string[]
  installDir: string
  token?: string
}
