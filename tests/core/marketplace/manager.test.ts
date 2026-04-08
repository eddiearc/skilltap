import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'

// Mock fs/promises before importing modules
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../../src/core/git.js', () => ({
  cloneOrUpdate: vi.fn().mockResolvedValue('/fake/cache/path'),
  getCachePathForUrl: vi.fn().mockReturnValue('/fake/cache/path'),
  isGitInstalled: vi.fn().mockResolvedValue(true),
}))

import fs from 'node:fs/promises'
import {
  loadMarketplaceConfig,
  addMarketplace,
  removeMarketplace,
  listMarketplaces,
  getMarketplace,
  discoverSkillsFromMarketplace,
  getMarketplaceManifest,
  getManifestForMarketplace,
  searchSkill,
} from '../../../src/core/marketplace/manager.js'
import { cloneOrUpdate, getCachePathForUrl, isGitInstalled } from '../../../src/core/git.js'
import type { Marketplace } from '../../../src/core/marketplace/types.js'

beforeEach(() => {
  vi.clearAllMocks()
  // Re-set default implementations after clearing
  vi.mocked(fs.mkdir).mockResolvedValue(undefined)
  vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  vi.mocked(fs.rm).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
  vi.mocked(fs.readdir).mockResolvedValue([])
  vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache/path')
  vi.mocked(getCachePathForUrl).mockReturnValue('/fake/cache/path')
  vi.mocked(isGitInstalled).mockResolvedValue(true)
})

// --- loadMarketplaceConfig ---

describe('loadMarketplaceConfig', () => {
  it('returns empty config when no config file exists', async () => {
    const config = await loadMarketplaceConfig()
    expect(config).toEqual({ version: '1.0', marketplaces: {} })
  })

  it('loads existing config from file', async () => {
    const existingConfig = {
      version: '1.0',
      marketplaces: {
        'my-mkt': { type: 'git', gitUrl: 'https://github.com/org/skills.git', addedAt: '2026-01-01' },
      },
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingConfig))

    const config = await loadMarketplaceConfig()
    expect(config.marketplaces['my-mkt']).toBeDefined()
    expect(config.marketplaces['my-mkt'].gitUrl).toBe('https://github.com/org/skills.git')
  })

  it('migrates legacy github-type entries to git', async () => {
    const legacyConfig = {
      version: '1.0',
      marketplaces: {
        'old-mkt': { type: 'github', repo: 'owner/repo', token: 'ghp_xxx', addedAt: '2025-01-01' },
      },
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(legacyConfig))

    const config = await loadMarketplaceConfig()
    const entry = config.marketplaces['old-mkt']
    expect(entry.type).toBe('git')
    expect(entry.gitUrl).toBe('https://github.com/owner/repo.git')
    expect(entry.repo).toBeUndefined()
    expect(entry.token).toBeUndefined()

    // Should have saved the migrated config
    expect(fs.writeFile).toHaveBeenCalled()
  })
})

// --- addMarketplace ---

describe('addMarketplace', () => {
  it('adds a git marketplace', async () => {
    const result = await addMarketplace('test-mkt', 'git', {
      gitUrl: 'https://github.com/org/skills.git',
    })

    expect(result.name).toBe('test-mkt')
    expect(result.type).toBe('git')
    expect(fs.writeFile).toHaveBeenCalled()
  })

  it('adds a local marketplace', async () => {
    const result = await addMarketplace('local-mkt', 'local', {
      path: '/home/user/my-skills',
    })

    expect(result.name).toBe('local-mkt')
    expect(result.type).toBe('local')
  })

  it('throws when marketplace already exists', async () => {
    const existingConfig = {
      version: '1.0',
      marketplaces: {
        'existing': { type: 'git', gitUrl: 'https://github.com/org/skills.git', addedAt: '2026-01-01' },
      },
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingConfig))

    await expect(addMarketplace('existing', 'git')).rejects.toThrow('already exists')
  })
})

// --- removeMarketplace ---

describe('removeMarketplace', () => {
  it('removes marketplace and cleans up caches', async () => {
    const existingConfig = {
      version: '1.0',
      marketplaces: {
        'to-remove': { type: 'git', gitUrl: 'https://github.com/org/skills.git', addedAt: '2026-01-01' },
      },
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingConfig))
    vi.mocked(getCachePathForUrl).mockReturnValue('/fake/git-cache/abc123')

    await removeMarketplace('to-remove')

    // Config should be saved without the marketplace
    expect(fs.writeFile).toHaveBeenCalled()
    // Manifest cache should be removed
    expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('to-remove.json'), { force: true })
    // Git cache should be removed
    expect(fs.rm).toHaveBeenCalledWith('/fake/git-cache/abc123', { recursive: true, force: true })
  })

  it('throws when marketplace not found', async () => {
    await expect(removeMarketplace('nonexistent')).rejects.toThrow('not found')
  })
})

// --- listMarketplaces ---

describe('listMarketplaces', () => {
  it('returns empty array when no marketplaces configured', async () => {
    const result = await listMarketplaces()
    expect(result).toEqual([])
  })

  it('returns all configured marketplaces', async () => {
    const config = {
      version: '1.0',
      marketplaces: {
        'mkt1': { type: 'git', gitUrl: 'https://github.com/org/a.git', addedAt: '2026-01-01' },
        'mkt2': { type: 'local', path: '/path/to/skills', addedAt: '2026-01-02' },
      },
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config))

    const result = await listMarketplaces()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('mkt1')
    expect(result[1].name).toBe('mkt2')
  })
})

// --- discoverSkillsFromMarketplace ---

describe('discoverSkillsFromMarketplace', () => {
  it('discovers skills from git marketplace', async () => {
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')

    // Simulate a directory with one skill
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'my-skill', isDirectory: () => true, isFile: () => false } as any,
    ])

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('SKILL.md')) {
        return `---\nname: my-skill\ndescription: A cool skill\nauthor: tester\n---\nBody`
      }
      throw new Error('ENOENT')
    })

    const marketplace: Marketplace = {
      name: 'test-mkt',
      type: 'git',
      gitUrl: 'https://github.com/org/skills.git',
      addedAt: '2026-01-01',
    }

    const skills = await discoverSkillsFromMarketplace(marketplace)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('my-skill')
    expect(skills[0].description).toBe('A cool skill')
    expect(skills[0].source.gitUrl).toBe('https://github.com/org/skills.git')
  })

  it('maps argument-hint frontmatter key to argumentHint field', async () => {
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'hint-skill', isDirectory: () => true, isFile: () => false } as any,
    ])

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('SKILL.md')) {
        return `---\nname: hint-skill\ndescription: Has argument hint\nargument-hint: "<query>"\n---\n`
      }
      throw new Error('ENOENT')
    })

    const marketplace: Marketplace = {
      name: 'test-mkt',
      type: 'git',
      gitUrl: 'https://github.com/org/skills.git',
      addedAt: '2026-01-01',
    }

    const skills = await discoverSkillsFromMarketplace(marketplace)
    expect(skills).toHaveLength(1)
    expect(skills[0].argumentHint).toBe('<query>')
  })

  it('discovers skills from local marketplace', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'local-skill', isDirectory: () => true, isFile: () => false } as any,
    ])

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('SKILL.md')) {
        return `---\nname: local-skill\ndescription: Local skill\n---\n`
      }
      throw new Error('ENOENT')
    })

    const marketplace: Marketplace = {
      name: 'local-mkt',
      type: 'local',
      path: '/home/user/skills',
      addedAt: '2026-01-01',
    }

    const skills = await discoverSkillsFromMarketplace(marketplace)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('local-skill')
    expect(skills[0].source.localPath).toBe('/home/user/skills')
    expect(skills[0].source.gitUrl).toBeUndefined()
  })

  it('throws when git is not installed for git marketplace', async () => {
    // Override the git module mock for this test
    const { isGitInstalled } = await import('../../../src/core/git.js')
    vi.mocked(isGitInstalled).mockResolvedValueOnce(false)

    const marketplace: Marketplace = {
      name: 'test-mkt',
      type: 'git',
      gitUrl: 'https://github.com/org/skills.git',
      addedAt: '2026-01-01',
    }

    await expect(discoverSkillsFromMarketplace(marketplace)).rejects.toThrow('git is not installed')
  })

  it('uses scanPath when provided', async () => {
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')

    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'nested-skill', isDirectory: () => true, isFile: () => false } as any,
    ])

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('SKILL.md')) {
        return `---\nname: nested-skill\ndescription: Nested\n---\n`
      }
      throw new Error('ENOENT')
    })

    const marketplace: Marketplace = {
      name: 'test-mkt',
      type: 'git',
      gitUrl: 'https://github.com/org/repo.git',
      scanPath: '.agents/skills',
      addedAt: '2026-01-01',
    }

    const skills = await discoverSkillsFromMarketplace(marketplace)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('nested-skill')
  })

  it('recurses into subdirectories without SKILL.md', async () => {
    // Root has one dir "category" with no SKILL.md, which contains "inner-skill" with SKILL.md
    let readdirCallCount = 0
    vi.mocked(fs.readdir).mockImplementation(async () => {
      readdirCallCount++
      if (readdirCallCount === 1) {
        return [{ name: 'category', isDirectory: () => true, isFile: () => false }] as any
      }
      if (readdirCallCount === 2) {
        return [{ name: 'inner-skill', isDirectory: () => true, isFile: () => false }] as any
      }
      return []
    })

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      const fp = String(filePath)
      if (fp.includes('inner-skill') && fp.endsWith('SKILL.md')) {
        return `---\nname: inner-skill\ndescription: Found nested\n---\n`
      }
      throw new Error('ENOENT')
    })

    const marketplace: Marketplace = {
      name: 'local-mkt',
      type: 'local',
      path: '/skills',
      addedAt: '2026-01-01',
    }

    const skills = await discoverSkillsFromMarketplace(marketplace)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('inner-skill')
    expect(skills[0].path).toBe('category/inner-skill')
  })
})

// --- parseFrontmatter (tested indirectly via discoverSkillsFromMarketplace) ---
// The parseFrontmatter function is not exported, but we test it through skill discovery.
// Additional frontmatter edge cases are covered in github.test.ts since it shares the same logic.

// --- getManifestForMarketplace (cache-aware, no config lookup) ---

describe('getManifestForMarketplace', () => {
  const marketplace: Marketplace = {
    name: 'org/skills',
    type: 'git',
    gitUrl: 'https://github.com/org/skills.git',
    addedAt: '2026-01-01',
  }

  it('returns cached manifest when within TTL (default refresh=undefined)', async () => {
    const cachedManifest = {
      name: 'org/skills',
      version: '1.0',
      skills: [{ name: 'pdf', description: 'PDF', path: 'pdf', source: {} }],
      updatedAt: new Date().toISOString(), // fresh
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cachedManifest))

    const result = await getManifestForMarketplace(marketplace)

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].name).toBe('pdf')
    // Should NOT have called cloneOrUpdate since cache is fresh
    expect(cloneOrUpdate).not.toHaveBeenCalled()
  })

  it('refreshes when cache is expired (default refresh=undefined)', async () => {
    const staleManifest = {
      name: 'org/skills',
      version: '1.0',
      skills: [{ name: 'old', description: 'Old', path: 'old', source: {} }],
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(staleManifest))
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')
    vi.mocked(fs.readdir).mockResolvedValue([])

    const result = await getManifestForMarketplace(marketplace)

    // Should have called cloneOrUpdate to refresh
    expect(cloneOrUpdate).toHaveBeenCalled()
    expect(result.skills).toHaveLength(0) // no skills found in empty dir
  })

  it('refresh: false returns cached manifest even if expired', async () => {
    const staleManifest = {
      name: 'org/skills',
      version: '1.0',
      skills: [{ name: 'stale', description: 'Stale', path: 'stale', source: {} }],
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(staleManifest))

    const result = await getManifestForMarketplace(marketplace, { refresh: false })

    expect(result.skills[0].name).toBe('stale')
    expect(cloneOrUpdate).not.toHaveBeenCalled()
  })

  it('refresh: true bypasses cache and calls cloneOrUpdate', async () => {
    const freshManifest = {
      name: 'org/skills',
      version: '1.0',
      skills: [{ name: 'cached', description: 'Cached', path: 'cached', source: {} }],
      updatedAt: new Date().toISOString(), // fresh cache
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(freshManifest))
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')
    vi.mocked(fs.readdir).mockResolvedValue([])

    const result = await getManifestForMarketplace(marketplace, { refresh: true })

    // Should have called cloneOrUpdate even though cache was fresh
    expect(cloneOrUpdate).toHaveBeenCalled()
  })

  it('refresh: false falls through to discovery when no cache exists', async () => {
    // fs.readFile throws ENOENT (default mock behavior)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')
    vi.mocked(fs.readdir).mockResolvedValue([])

    const result = await getManifestForMarketplace(marketplace, { refresh: false })

    // Must still discover since there's no cache file to return
    expect(cloneOrUpdate).toHaveBeenCalled()
  })

  it('uses filesystem-safe cache key (slashes replaced)', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(cloneOrUpdate).mockResolvedValue('/fake/cache')
    vi.mocked(fs.readdir).mockResolvedValue([])

    await getManifestForMarketplace(marketplace)

    // writeFile should have been called with a path containing org-skills.json, not org/skills.json
    const writeCall = vi.mocked(fs.writeFile).mock.calls.find(
      (call) => String(call[0]).includes('org-skills.json')
    )
    expect(writeCall).toBeDefined()
  })
})

// --- searchSkill ---

describe('searchSkill', () => {
  it('returns empty when no marketplaces configured', async () => {
    const results = await searchSkill('anything')
    expect(results).toEqual([])
  })
})
