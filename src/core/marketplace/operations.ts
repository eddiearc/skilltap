/**
 * Marketplace operations for skilltap
 * 
 * Handles skill installation, uninstallation, and updates using marketplace sources.
 * Inspired by claude-code's plugin operations system.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { installSkill, uninstallSkill, listInstalled } from '../installer.js'
import { parseSkillIdentifier } from './types.js'
import type { 
  Marketplace, 
  SkillEntry, 
  InstallResult, 
  UninstallResult,
  MarketplaceManifest 
} from './types.js'
import { 
  listMarketplaces, 
  getMarketplace, 
  getMarketplaceManifest,
  searchSkill as searchMarketplaceSkill 
} from './manager.js'

const INSTALLED_FILE = 'installed_skills.json'

/** Install a skill from a local marketplace path */
async function installFromLocalPath(
  skill: SkillEntry,
  marketplaceName: string,
  marketplacePath: string,
  installDir?: string
): Promise<InstallResult> {
  const targetDir = installDir ?? path.join(os.homedir(), '.agents', 'skills')
  const sourcePath = path.join(marketplacePath, skill.path)
  const destPath = path.join(targetDir, skill.name)
  
  try {
    // Check source exists
    await fs.access(path.join(sourcePath, 'SKILL.md'))
  } catch {
    return {
      success: false,
      message: `Skill "${skill.name}" not found at path: ${sourcePath}`,
    }
  }
  
  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true })
  
  // Copy skill directory
  await copyDir(sourcePath, destPath)
  
  // Record installation
  const installed_data = await loadInstalledSkills()
  const records = installed_data[skill.name] ?? []
  records.push({
    name: skill.name,
    marketplace: marketplaceName,
    version: skill.version,
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    installPath: destPath,
  })
  installed_data[skill.name] = records
  await saveInstalledSkills(installed_data)
  
  return {
    success: true,
    message: `Successfully installed skill "${skill.name}"`,
    skillName: skill.name,
    path: destPath,
  }
}

/** Recursively copy a directory */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

/** Get the installed skills file path */
function getInstalledPath(): string {
  return path.join(os.homedir(), '.skilltap', INSTALLED_FILE)
}

/** Installed skill record */
interface InstalledSkillRecord {
  name: string
  marketplace: string
  version?: string
  installedAt: string
  lastUpdated: string
  installPath: string
}

/** Load installed skills records */
async function loadInstalledSkills(): Promise<Record<string, InstalledSkillRecord[]>> {
  try {
    const content = await fs.readFile(getInstalledPath(), 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/** Save installed skills records */
async function saveInstalledSkills(data: Record<string, InstalledSkillRecord[]>): Promise<void> {
  await fs.mkdir(path.dirname(getInstalledPath()), { recursive: true })
  await fs.writeFile(getInstalledPath(), JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Install a skill from marketplace
 */
export async function installFromMarketplace(
  skillIdentifier: string,
  installDir?: string,
  scope: 'user' | 'project' = 'user'
): Promise<InstallResult> {
  const { name: skillName, marketplace: marketplaceName } = parseSkillIdentifier(skillIdentifier)
  
  if (!marketplaceName) {
    // Search all marketplaces for the skill
    const results = await searchMarketplaceSkill(skillName)
    
    if (results.length === 0) {
      return {
        success: false,
        message: `Skill "${skillName}" not found in any marketplace`,
      }
    }
    
    if (results.length > 1) {
      const marketplaceList = results.map(r => `${r.skill.name}@${r.marketplace}`).join(', ')
      return {
        success: false,
        message: `Multiple skills found: ${marketplaceList}. Use "skill@marketplace" format to specify.`,
      }
    }
    
    const { skill, marketplace: mktName } = results[0]
    const mkt = await getMarketplace(mktName)
    if (!mkt) {
      return { success: false, message: `Marketplace "${mktName}" not found` }
    }
    return installSkillFromEntry(skill, mkt, installDir, scope)
  }
  
  // Specific marketplace
  const marketplace = await getMarketplace(marketplaceName)
  if (!marketplace) {
    return {
      success: false,
      message: `Marketplace "${marketplaceName}" not found`,
    }
  }
  
  const manifest = await getMarketplaceManifest(marketplaceName)
  if (!manifest) {
    return {
      success: false,
      message: `Failed to load marketplace "${marketplaceName}"`,
    }
  }
  
  const skill = manifest.skills.find(s => s.name === skillName)
  if (!skill) {
    return {
      success: false,
      message: `Skill "${skillName}" not found in marketplace "${marketplaceName}"`,
    }
  }
  
  return installSkillFromEntry(skill, marketplace!, installDir, scope)
}

/**
 * Install a skill from a marketplace entry
 */
async function installSkillFromEntry(
  skill: SkillEntry,
  marketplace: Marketplace,
  installDir?: string,
  scope: 'user' | 'project' = 'user'
): Promise<InstallResult> {
  try {
    // Handle local marketplace
    if (marketplace.type === 'local' && marketplace.path) {
      return installFromLocalPath(skill, marketplace.name, marketplace.path, installDir)
    }
    
    // Handle GitHub marketplace
    const { owner, repo, branch } = skill.source
    
    if (!owner || !repo) {
      return {
        success: false,
        message: `Skill "${skill.name}" does not have valid source information`,
      }
    }
    
    const installed = await installSkill(
      { owner, repo, branch },
      skill.name,
      installDir
    )
    
    // Record installation
    const installed_data = await loadInstalledSkills()
    const records = installed_data[skill.name] ?? []
    
    // Remove existing record for same scope if exists
    const filteredRecords = records.filter(r => r.marketplace !== marketplaceName)
    
    filteredRecords.push({
      name: skill.name,
      marketplace: marketplaceName,
      version: skill.version,
      installedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      installPath: installed.path,
    })
    
    installed_data[skill.name] = filteredRecords
    await saveInstalledSkills(installed_data)
    
    return {
      success: true,
      message: `Successfully installed skill "${skill.name}" from marketplace "${marketplaceName}"`,
      skillName: skill.name,
      path: installed.path,
      marketplace: marketplaceName,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to install "${skill.name}": ${message}`,
    }
  }
}

/**
 * Uninstall a skill
 */
export async function uninstallFromMarketplace(
  skillName: string,
  marketplaceName?: string
): Promise<UninstallResult> {
  try {
    const installed_data = await loadInstalledSkills()
    const records = installed_data[skillName] ?? []
    
    if (records.length === 0) {
      return {
        success: false,
        message: `Skill "${skillName}" is not installed`,
      }
    }
    
    // Find record to uninstall
    let recordToRemove: InstalledSkillRecord | undefined
    let remainingRecords: InstalledSkillRecord[] = []
    
    if (marketplaceName) {
      recordToRemove = records.find(r => r.marketplace === marketplaceName)
      remainingRecords = records.filter(r => r.marketplace !== marketplaceName)
    } else {
      // Remove first record if no marketplace specified
      recordToRemove = records[0]
      remainingRecords = records.slice(1)
    }
    
    if (!recordToRemove) {
      return {
        success: false,
        message: `Skill "${skillName}" is not installed from marketplace "${marketplaceName}"`,
      }
    }
    
    // Uninstall from filesystem
    await uninstallSkill(skillName, recordToRemove.installPath)
    
    // Update records
    if (remainingRecords.length > 0) {
      installed_data[skillName] = remainingRecords
    } else {
      delete installed_data[skillName]
    }
    await saveInstalledSkills(installed_data)
    
    return {
      success: true,
      message: `Successfully uninstalled skill "${skillName}"`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to uninstall "${skillName}": ${message}`,
    }
  }
}

/**
 * List installed skills with marketplace info
 */
export async function listInstalledWithMarketplace(): Promise<InstalledSkillRecord[]> {
  const installed_data = await loadInstalledSkills()
  const records: InstalledSkillRecord[] = []
  
  for (const skillRecords of Object.values(installed_data)) {
    records.push(...skillRecords)
  }
  
  return records
}

/**
 * Search for a skill across marketplaces
 */
export async function search(
  keyword: string,
  marketplaceName?: string
): Promise<{ skill: SkillEntry; marketplace: string }[]> {
  return searchMarketplaceSkill(keyword, marketplaceName)
}

/**
 * Update a skill to latest version
 */
export async function updateSkill(
  skillName: string,
  marketplaceName?: string
): Promise<InstallResult> {
  const installed_data = await loadInstalledSkills()
  const records = installed_data[skillName] ?? []
  
  const targetMarketplace = marketplaceName ?? records[0]?.marketplace
  if (!targetMarketplace) {
    return {
      success: false,
      message: `Skill "${skillName}" is not installed`,
    }
  }
  
  const record = records.find(r => r.marketplace === targetMarketplace)
  if (!record) {
    return {
      success: false,
      message: `Skill "${skillName}" is not installed from marketplace "${targetMarketplace}"`,
    }
  }
  
  // Re-install to update
  return installFromMarketplace(`${skillName}@${targetMarketplace}`, record.installPath)
}

/**
 * Update all installed skills
 */
export async function updateAll(): Promise<InstallResult[]> {
  const results: InstallResult[] = []
  const installed_data = await loadInstalledSkills()
  
  for (const [skillName, records] of Object.entries(installed_data)) {
    for (const record of records) {
      const result = await updateSkill(skillName, record.marketplace)
      results.push(result)
    }
  }
  
  return results
}
