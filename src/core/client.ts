import type {
  SkilltapConfig,
  TapSource,
  RemoteSkill,
  InstalledSkill,
} from './types.js'
import { SkillConflictError } from './types.js'
import { parseSource, listRepoDirs, getSkillMd, parseFrontmatter } from './github.js'
import { installSkill, uninstallSkill, listInstalled } from './installer.js'
import { resolveAgentDirs } from './agents.js'

export class Skilltap {
  private sources: TapSource[]
  private installDir?: string
  private token?: string
  private symlinkDirs?: string[]

  constructor(config: SkilltapConfig) {
    this.sources = config.sources.map(parseSource)
    this.installDir = config.installDir
    this.token = config.token

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

  /** List all available skills from all sources */
  async available(): Promise<RemoteSkill[]> {
    const skills: RemoteSkill[] = []

    for (const source of this.sources) {
      const dirs = await listRepoDirs(source, this.token)

      for (const dir of dirs) {
        const content = await getSkillMd(source, dir, this.token)
        if (!content) continue

        const meta = parseFrontmatter(content)
        if (!meta) continue

        skills.push({ name: dir, meta, source, path: dir })
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
      return installSkill(source, skillName, this.installDir, this.token, this.symlinkDirs)
    }

    // Find all sources that have this skill
    const matches: TapSource[] = []
    for (const source of this.sources) {
      const content = await getSkillMd(source, skillName, this.token)
      if (content) matches.push(source)
    }

    if (matches.length === 0) {
      throw new Error(`Skill "${skillName}" not found in any source`)
    }

    if (matches.length > 1) {
      throw new SkillConflictError(
        skillName,
        matches.map((s) => `${s.owner}/${s.repo}`),
      )
    }

    return installSkill(matches[0], skillName, this.installDir, this.token, this.symlinkDirs)
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
