import type {
  SkilltapConfig,
  TapSource,
  RemoteSkill,
  InstalledSkill,
} from './types.js'
import { parseSource, listRepoDirs, getSkillMd, parseFrontmatter } from './github.js'
import { installSkill, uninstallSkill, listInstalled } from './installer.js'

export class Skilltap {
  private sources: TapSource[]
  private installDir?: string
  private token?: string

  constructor(config: SkilltapConfig) {
    this.sources = config.sources.map(parseSource)
    this.installDir = config.installDir
    this.token = config.token
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

  /** Install a skill by name (from the first source that has it) */
  async install(skillName: string): Promise<InstalledSkill> {
    for (const source of this.sources) {
      const content = await getSkillMd(source, skillName, this.token)
      if (content) {
        return installSkill(source, skillName, this.installDir, this.token)
      }
    }
    throw new Error(`Skill "${skillName}" not found in any source`)
  }

  /** Uninstall a skill */
  async uninstall(skillName: string): Promise<void> {
    return uninstallSkill(skillName, this.installDir)
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
