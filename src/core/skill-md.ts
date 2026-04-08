import type { SkillMeta } from './types.js'

/** Parse SKILL.md frontmatter into typed SkillMeta */
export function parseFrontmatter(content: string): SkillMeta | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const meta: SkillMeta = { name: '', description: '' }
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    switch (key) {
      case 'name': meta.name = val; break
      case 'description': meta.description = val; break
      case 'author': meta.author = val; break
      case 'version': meta.version = val; break
      case 'license': meta.license = val; break
      case 'argument-hint': meta.argumentHint = val; break
    }
  }
  return meta.name ? meta : null
}
