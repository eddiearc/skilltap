/**
 * Marketplace types for skilltap
 * 
 * Defines the structure for marketplace-based skill browsing and installation,
 * inspired by claude-code's plugin marketplace system.
 */

/** Skill metadata from marketplace entry */
export interface SkillEntry {
  name: string
  description: string
  author?: string
  version?: string
  license?: string
  argumentHint?: string
  /** Path to the skill directory in the marketplace */
  path: string
  /** Source repository info */
  source: {
    owner: string
    repo: string
    branch?: string
  }
}

/** A configured marketplace source */
export interface Marketplace {
  /** Unique marketplace name */
  name: string
  /** Source type */
  type: 'github' | 'url' | 'local'
  /** GitHub repo for 'github' type */
  repo?: string
  /** URL for 'url' type */
  url?: string
  /** Local path for 'local' type */
  path?: string
  /** Optional branch for GitHub */
  branch?: string
  /** Auto-update enabled */
  autoUpdate?: boolean
  /** When this marketplace was added */
  addedAt: string
}

/** Marketplace manifest containing all available skills */
export interface MarketplaceManifest {
  /** Marketplace name */
  name: string
  /** Marketplace version for caching */
  version: string
  /** Skills in this marketplace */
  skills: SkillEntry[]
  /** Last updated timestamp */
  updatedAt: string
}

/** Skill installation result */
export interface InstallResult {
  success: boolean
  message: string
  skillName?: string
  path?: string
  marketplace?: string
}

/** Skill uninstallation result */
export interface UninstallResult {
  success: boolean
  message: string
}

/** Marketplace configuration */
export interface MarketplaceConfig {
  version: string
  marketplaces: Record<string, MarketplaceConfigEntry>
}

/** Marketplace config entry */
export interface MarketplaceConfigEntry {
  type: 'github' | 'url' | 'local'
  repo?: string
  url?: string
  path?: string
  branch?: string
  autoUpdate?: boolean
  addedAt: string
}

/** Parse plugin identifier like "skill@marketplace" */
export function parseSkillIdentifier(identifier: string): {
  name: string
  marketplace: string | null
} {
  const parts = identifier.split('@')
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { name: parts[0], marketplace: parts[1] }
  }
  return { name: identifier, marketplace: null }
}
