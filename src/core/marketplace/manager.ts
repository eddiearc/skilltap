/**
 * Marketplace manager for skilltap
 * 
 * Manages marketplace sources, caching, and skill discovery.
 * Inspired by claude-code's marketplace system but simplified for skills.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { findSkills } from '../github.js'
import type { 
  Marketplace, 
  MarketplaceConfig, 
  MarketplaceManifest, 
  SkillEntry,
  MarketplaceConfigSchema 
} from './types.js'
import { parseSkillIdentifier } from './types.js'

const CONFIG_FILE = 'marketplaces.json'
const CACHE_DIR = 'marketplaces'

/** Get the skilltap config directory */
function getConfigDir(): string {
  return path.join(os.homedir(), '.skilltap')
}

/** Get the config file path */
function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE)
}

/** Get the cache directory path */
function getCacheDir(): string {
  return path.join(getConfigDir(), CACHE_DIR)
}

/** Ensure config directory exists */
async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(getConfigDir(), { recursive: true })
  await fs.mkdir(getCacheDir(), { recursive: true })
}

/** Load marketplace config */
export async function loadMarketplaceConfig(): Promise<MarketplaceConfig> {
  await ensureConfigDir()
  const configPath = getConfigPath()
  try {
    const content = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return { version: '1.0', marketplaces: {} }
  }
}

/** Save marketplace config */
async function saveMarketplaceConfig(config: MarketplaceConfig): Promise<void> {
  await ensureConfigDir()
  const configPath = getConfigPath()
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/** Add a marketplace */
export async function addMarketplace(
  name: string,
  type: 'github' | 'url' | 'local',
  options: { repo?: string; url?: string; path?: string; branch?: string } = {}
): Promise<Marketplace> {
  const config = await loadMarketplaceConfig()
  
  if (config.marketplaces[name]) {
    throw new Error(`Marketplace "${name}" already exists`)
  }

  const marketplace: Marketplace = {
    name,
    type,
    addedAt: new Date().toISOString(),
    ...options,
  }

  config.marketplaces[name] = marketplace
  await saveMarketplaceConfig(config)
  
  return marketplace
}

/** Remove a marketplace */
export async function removeMarketplace(name: string): Promise<void> {
  const config = await loadMarketplaceConfig()
  
  if (!config.marketplaces[name]) {
    throw new Error(`Marketplace "${name}" not found`)
  }

  delete config.marketplaces[name]
  await saveMarketplaceConfig(config)
  
  // Remove cache
  const cachePath = path.join(getCacheDir(), `${name}.json`)
  await fs.rm(cachePath, { force: true })
}

/** List all marketplaces */
export async function listMarketplaces(): Promise<Marketplace[]> {
  const config = await loadMarketplaceConfig()
  return Object.values(config.marketplaces)
}

/** Get a specific marketplace */
export async function getMarketplace(name: string): Promise<Marketplace | null> {
  const config = await loadMarketplaceConfig()
  return config.marketplaces[name] ?? null
}

/** Discover skills from a marketplace by fetching its manifest or scanning repos */
export async function discoverSkillsFromMarketplace(
  marketplace: Marketplace
): Promise<SkillEntry[]> {
  const skills: SkillEntry[] = []
  
  if (marketplace.type === 'github' && marketplace.repo) {
    const [owner, repo] = marketplace.repo.split('/')
    if (!owner || !repo) {
      throw new Error(`Invalid marketplace repo: ${marketplace.repo}`)
    }
    
    try {
      const discovered = await findSkills(
        { owner, repo, branch: marketplace.branch },
        undefined, // token - could add token support later
        '' // repo root
      )
      
      for (const skill of discovered) {
        skills.push({
          name: skill.meta.name || skill.name,
          description: skill.meta.description || '',
          author: skill.meta.author,
          version: skill.meta.version,
          license: skill.meta.license,
          argumentHint: skill.meta.argumentHint,
          path: skill.path,
          source: { owner, repo, branch: marketplace.branch },
        })
      }
    } catch (error) {
      console.error(`Failed to discover skills from ${marketplace.name}:`, error)
    }
  } else if (marketplace.type === 'local' && marketplace.path) {
    // Local marketplace - scan directory for SKILL.md files
    await scanLocalSkills(marketplace.path, skills)
  }
  
  return skills
}

/** Recursively scan a local directory for skills */
async function scanLocalSkills(dirPath: string, skills: SkillEntry[], basePath = ''): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      
      const fullPath = path.join(dirPath, entry.name)
      const skillMdPath = path.join(fullPath, 'SKILL.md')
      
      try {
        const content = await fs.readFile(skillMdPath, 'utf-8')
        const meta = parseFrontmatter(content)
        if (meta) {
          skills.push({
            name: meta.name || entry.name,
            description: meta.description || '',
            author: meta.author,
            version: meta.version,
            license: meta.license,
            argumentHint: meta.argumentHint,
            path: basePath ? `${basePath}/${entry.name}` : entry.name,
            source: { owner: '', repo: '' }, // Local skills don't have source
          })
        }
      } catch {
        // No SKILL.md, recurse into subdirectory
        await scanLocalSkills(fullPath, skills, basePath ? `${basePath}/${entry.name}` : entry.name)
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
}

/** Parse frontmatter from SKILL.md content */
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    meta[key] = val
  }
  return meta.name ? meta : null
}

/** Get or cache marketplace manifest */
export async function getMarketplaceManifest(
  marketplaceName: string,
  forceRefresh = false
): Promise<MarketplaceManifest | null> {
  const marketplace = await getMarketplace(marketplaceName)
  if (!marketplace) return null

  const cachePath = path.join(getCacheDir(), `${marketplaceName}.json`)
  
  // Check cache first unless force refresh
  if (!forceRefresh) {
    try {
      const cached = await fs.readFile(cachePath, 'utf-8')
      const manifest = JSON.parse(cached) as MarketplaceManifest
      // Cache valid for 1 hour
      const cacheAge = Date.now() - new Date(manifest.updatedAt).getTime()
      if (cacheAge < 60 * 60 * 1000) {
        return manifest
      }
    } catch {
      // Cache miss or invalid, will refresh
    }
  }

  // Discover skills from marketplace
  const skills = await discoverSkillsFromMarketplace(marketplace)
  
  const manifest: MarketplaceManifest = {
    name: marketplaceName,
    version: '1.0',
    skills,
    updatedAt: new Date().toISOString(),
  }

  // Save to cache
  await fs.writeFile(cachePath, JSON.stringify(manifest, null, 2), 'utf-8')
  
  return manifest
}

/** Search for a skill across all marketplaces */
export async function searchSkill(
  skillName: string,
  marketplaceName?: string
): Promise<{ skill: SkillEntry; marketplace: string }[]> {
  const results: { skill: SkillEntry; marketplace: string }[] = []
  
  if (marketplaceName) {
    const manifest = await getMarketplaceManifest(marketplaceName)
    if (manifest) {
      const skill = manifest.skills.find(
        s => s.name.toLowerCase().includes(skillName.toLowerCase()) ||
             s.description.toLowerCase().includes(skillName.toLowerCase())
      )
      if (skill) {
        results.push({ skill, marketplace: marketplaceName })
      }
    }
  } else {
    // Search all marketplaces
    const marketplaces = await listMarketplaces()
    for (const mkt of marketplaces) {
      const manifest = await getMarketplaceManifest(mkt.name)
      if (manifest) {
        for (const skill of manifest.skills) {
          if (
            skill.name.toLowerCase().includes(skillName.toLowerCase()) ||
            skill.description.toLowerCase().includes(skillName.toLowerCase())
          ) {
            results.push({ skill, marketplace: mkt.name })
          }
        }
      }
    }
  }
  
  return results
}

/** Get a skill from a marketplace by name */
export async function getSkillByName(
  skillName: string,
  marketplaceName: string
): Promise<SkillEntry | null> {
  const manifest = await getMarketplaceManifest(marketplaceName)
  if (!manifest) return null
  
  return manifest.skills.find(s => s.name === skillName) ?? null
}
