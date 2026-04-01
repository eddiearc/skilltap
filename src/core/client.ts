import type {
  SkilltapConfig,
  SourceEntry,
  TapSource,
  RemoteSkill,
  InstalledSkill,
  DiscoveredSkill,
} from './types.js'
import { SkillConflictError } from './types.js'
import { parseSource, parseSourceEntry, resolveToken, findSkills } from './github.js'
import { installSkill, uninstallSkill, listInstalled } from './installer.js'
import { resolveAgentDirs } from './agents.js'

export class Skilltap {
  private entries: SourceEntry[]
  private sources: TapSource[]
  private installDir?: string
  private globalToken?: string
  private symlinkDirs?: string[]

  constructor(config: SkilltapConfig) {
    this.entries = config.sources
    this.sources = config.sources.map(parseSourceEntry)
    this.installDir = config.installDir
    this.globalToken = config.token

    // Collect symlink targets: agent dirs + custom dirs
    const dirs: string[] = []
    if (config.agents?.length) {
      dirs.push(...resolveAgentDirs(config.agents))
    }
    if (config.dirs?.length) {
      dirs.push(...config.dirs)
    }
    if (dirs.length > 0) {
      this.symlinkDirs = [...new Set(dirs)] // deduplicate
    }
  }

  /** Resolve the effective token for a source entry */
  private tokenFor(entry: SourceEntry): string | undefined {
    return resolveToken(entry, this.globalToken)
  }

  private async discoverSourceSkills(
    source: TapSource,
    entry: SourceEntry | undefined,
  ): Promise<DiscoveredSkill[]> {
    return findSkills(source, entry ? this.tokenFor(entry) : this.globalToken)
  }

  /** List all available skills from all sources */
  async available(): Promise<RemoteSkill[]> {
    const skills: RemoteSkill[] = []

    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i]
      const discovered = await this.discoverSourceSkills(source, this.entries[i])

      for (const skill of discovered) {
        skills.push({ ...skill, source })
      }
    }

    return skills
  }

  /** Search skills by keyword across all sources */
  async search(keyword: string): Promise<RemoteSkill[]> {
    const all = await this.available()
    const kw = keyword.toLowerCase()
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) ||
        s.meta.description.toLowerCase().includes(kw),
    )
  }

  /** Install a skill by name, detecting conflicts across sources */
  async install(skillName: string, opts?: { from?: string }): Promise<InstalledSkill> {
    // Explicit source specified — skip conflict detection
    if (opts?.from) {
      const source = parseSource(opts.from)
      // Find matching entry for token resolution
      const matchEntry = this.entries.find(
        (e) => {
          const repo = typeof e === 'string' ? e : e.repo
          return repo === opts.from
        },
      )
      const token = matchEntry ? this.tokenFor(matchEntry) : this.globalToken
      const discovered = await this.discoverSourceSkills(source, matchEntry)
      const match = discovered.find((skill) => skill.name === skillName)
      if (!match) {
        throw new Error(`Skill "${skillName}" not found in source "${opts.from}"`)
      }
      return installSkill(source, skillName, this.installDir, token, this.symlinkDirs, match.path)
    }

    // Find all sources that have this skill
    const matches: { source: TapSource; entry: SourceEntry; skill: DiscoveredSkill }[] = []
    for (let i = 0; i < this.sources.length; i++) {
      const discovered = await this.discoverSourceSkills(this.sources[i], this.entries[i])
      const match = discovered.find((skill) => skill.name === skillName)
      if (match) matches.push({ source: this.sources[i], entry: this.entries[i], skill: match })
    }

    if (matches.length === 0) {
      throw new Error(`Skill "${skillName}" not found in any source`)
    }

    if (matches.length > 1) {
      throw new SkillConflictError(
        skillName,
        matches.map((m) => `${m.source.owner}/${m.source.repo}`),
      )
    }

    const token = this.tokenFor(matches[0].entry)
    return installSkill(matches[0].source, skillName, this.installDir, token, this.symlinkDirs, matches[0].skill.path)
  }

  /** Uninstall a skill */
  async uninstall(skillName: string): Promise<void> {
    return uninstallSkill(skillName, this.installDir, this.symlinkDirs)
  }

  /** List locally installed skills */
  async list(): Promise<InstalledSkill[]> {
    return listInstalled(this.installDir)
  }

  /** Update all installed skills from their sources */
  async update(): Promise<InstalledSkill[]> {
    const installed = await this.list()
    const updated: InstalledSkill[] = []

    for (const skill of installed) {
      try {
        const result = await this.install(skill.name)
        updated.push(result)
      } catch {
        // Skip skills that can't be updated (source removed, etc.)
      }
    }

    return updated
  }
}
