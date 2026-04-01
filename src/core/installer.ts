import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import type { TapSource, InstalledSkill } from './types.js'
import { downloadSkillDir, downloadFile, parseFrontmatter } from './github.js'

const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.agents', 'skills')

/** Ensure install directory exists */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/** Create a symlink, removing existing target first if needed */
async function forceSymlink(target: string, linkPath: string): Promise<void> {
  await fs.rm(linkPath, { recursive: true, force: true })
  await ensureDir(path.dirname(linkPath))
  await fs.symlink(target, linkPath)
}

/** Download and install a skill from a source */
export async function installSkill(
  source: TapSource,
  skillName: string,
  installDir = DEFAULT_INSTALL_DIR,
  token?: string,
  symlinkDirs?: string[],
  remotePath = skillName,
): Promise<InstalledSkill> {
  const targetDir = path.join(installDir, skillName)
  await ensureDir(targetDir)

  const files = await downloadSkillDir(source, remotePath, token)

  for (const file of files) {
    if (file.type === 'file' && file.download_url) {
      const content = await downloadFile(file.download_url, token)
      const filePath = path.join(targetDir, file.name)
      await fs.writeFile(filePath, content, 'utf-8')
    } else if (file.type === 'dir') {
      // Recursively download subdirectories
      const subDir = path.join(targetDir, file.name)
      await ensureDir(subDir)
      const subPath = file.path.includes('/') ? file.path : `${remotePath}/${file.name}`
      const subFiles = await downloadSkillDir(source, subPath, token)
      for (const subFile of subFiles) {
        if (subFile.type === 'file' && subFile.download_url) {
          const content = await downloadFile(subFile.download_url, token)
          await fs.writeFile(path.join(subDir, subFile.name), content, 'utf-8')
        }
      }
    }
  }

  // Create symlinks in other agent directories
  if (symlinkDirs?.length) {
    for (const dir of symlinkDirs) {
      if (dir === installDir) continue // skip primary dir
      const linkPath = path.join(dir, skillName)
      await forceSymlink(targetDir, linkPath)
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

/** Uninstall a skill by removing its directory and any symlinks */
export async function uninstallSkill(
  skillName: string,
  installDir = DEFAULT_INSTALL_DIR,
  symlinkDirs?: string[],
): Promise<void> {
  // Remove symlinks first
  if (symlinkDirs?.length) {
    for (const dir of symlinkDirs) {
      if (dir === installDir) continue
      const linkPath = path.join(dir, skillName)
      await fs.rm(linkPath, { recursive: true, force: true })
    }
  }

  // Remove primary directory
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
