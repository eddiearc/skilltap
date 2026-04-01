import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import type { TapSource, InstalledSkill } from './types.js'
import { downloadSkillDir, downloadFile, getSkillMd, parseFrontmatter } from './github.js'

const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.claude', 'skills')

/** Ensure install directory exists */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/** Download and install a skill from a source */
export async function installSkill(
  source: TapSource,
  skillName: string,
  installDir = DEFAULT_INSTALL_DIR,
  token?: string,
): Promise<InstalledSkill> {
  const targetDir = path.join(installDir, skillName)
  await ensureDir(targetDir)

  const files = await downloadSkillDir(source, skillName, token)

  for (const file of files) {
    if (file.type === 'file' && file.download_url) {
      const content = await downloadFile(file.download_url, token)
      const filePath = path.join(targetDir, file.name)
      await fs.writeFile(filePath, content, 'utf-8')
    } else if (file.type === 'dir') {
      // Recursively download subdirectories
      const subDir = path.join(targetDir, file.name)
      await ensureDir(subDir)
      const subFiles = await downloadSkillDir(source, `${skillName}/${file.name}`, token)
      for (const subFile of subFiles) {
        if (subFile.type === 'file' && subFile.download_url) {
          const content = await downloadFile(subFile.download_url, token)
          await fs.writeFile(path.join(subDir, subFile.name), content, 'utf-8')
        }
      }
    }
  }

  const skillMd = await fs.readFile(path.join(targetDir, 'SKILL.md'), 'utf-8').catch(() => null)
  const meta = skillMd ? parseFrontmatter(skillMd) : null

  return {
    name: skillName,
    meta: meta ?? { name: skillName, description: '' },
    path: targetDir,
    source,
  }
}

/** Uninstall a skill by removing its directory */
export async function uninstallSkill(
  skillName: string,
  installDir = DEFAULT_INSTALL_DIR,
): Promise<void> {
  const targetDir = path.join(installDir, skillName)
  await fs.rm(targetDir, { recursive: true, force: true })
}

/** List locally installed skills */
export async function listInstalled(installDir = DEFAULT_INSTALL_DIR): Promise<InstalledSkill[]> {
  const skills: InstalledSkill[] = []

  try {
    const entries = await fs.readdir(installDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue

      const skillDir = path.join(installDir, entry.name)
      const skillMdPath = path.join(skillDir, 'SKILL.md')
      const content = await fs.readFile(skillMdPath, 'utf-8').catch(() => null)
      if (!content) continue

      const meta = parseFrontmatter(content)
      if (meta) {
        skills.push({ name: entry.name, meta, path: skillDir })
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return skills
}
