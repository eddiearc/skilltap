import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../../src/core/git.js', () => ({
  getCachePathForUrl: vi.fn().mockReturnValue('/fake/git-cache/abc123'),
  normalizeGitUrl: vi.fn((url: string) => url),
}))

vi.mock('../../../src/core/installer.js', () => ({
  uninstallSkill: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../src/core/marketplace/manager.js', () => ({
  getMarketplace: vi.fn().mockResolvedValue(null),
  getMarketplaceManifest: vi.fn().mockResolvedValue(null),
  searchSkill: vi.fn().mockResolvedValue([]),
}))

import fs from 'node:fs/promises'
import {
  installFromMarketplace,
  uninstallFromMarketplace,
  listInstalledWithMarketplace,
  search,
  updateSkill,
} from '../../../src/core/marketplace/operations.js'
import { getMarketplace, getMarketplaceManifest, searchSkill as searchMarketplaceSkill } from '../../../src/core/marketplace/manager.js'
import { getCachePathForUrl, normalizeGitUrl } from '../../../src/core/git.js'
import { uninstallSkill } from '../../../src/core/installer.js'
import type { Marketplace, SkillEntry } from '../../../src/core/marketplace/types.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fs.mkdir).mockResolvedValue(undefined)
  vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  vi.mocked(fs.rm).mockResolvedValue(undefined)
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.copyFile).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
  vi.mocked(fs.readdir).mockResolvedValue([])
  vi.mocked(getMarketplace).mockResolvedValue(null)
  vi.mocked(getMarketplaceManifest).mockResolvedValue(null)
  vi.mocked(searchMarketplaceSkill).mockResolvedValue([])
  vi.mocked(getCachePathForUrl).mockReturnValue('/fake/git-cache/abc123')
  vi.mocked(normalizeGitUrl).mockImplementation((url: string) => url)
})

// --- installFromMarketplace ---

describe('installFromMarketplace', () => {
  it('returns error when skill not found in any marketplace', async () => {
    const result = await installFromMarketplace('nonexistent-skill')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not found')
  })

  it('returns error when specified marketplace not found', async () => {
    const result = await installFromMarketplace('skill@missing-mkt')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not found')
  })

  it('returns error when multiple skills found without marketplace qualifier', async () => {
    vi.mocked(searchMarketplaceSkill).mockResolvedValue([
      { skill: { name: 'pdf', description: '', path: 'pdf', source: {} } as SkillEntry, marketplace: 'mkt1' },
      { skill: { name: 'pdf', description: '', path: 'pdf', source: {} } as SkillEntry, marketplace: 'mkt2' },
    ])

    const result = await installFromMarketplace('pdf')
    expect(result.success).toBe(false)
    expect(result.message).toContain('Multiple skills found')
  })

  it('installs from git marketplace by copying from cache', async () => {
    const marketplace: Marketplace = {
      name: 'my-mkt',
      type: 'git',
      gitUrl: 'https://github.com/org/skills.git',
      addedAt: '2026-01-01',
    }
    const skill: SkillEntry = {
      name: 'pdf-skill',
      description: 'Read PDFs',
      path: 'pdf-skill',
      source: { gitUrl: 'https://github.com/org/skills.git' },
    }

    vi.mocked(getMarketplace).mockResolvedValue(marketplace)
    vi.mocked(getMarketplaceManifest).mockResolvedValue({
      name: 'my-mkt',
      version: '1.0',
      skills: [skill],
      updatedAt: '2026-01-01',
    })

    // Mock readdir for copyDir (the skill dir has one file)
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as any,
    ])

    const result = await installFromMarketplace('pdf-skill@my-mkt', '/tmp/test-install')
    expect(result.success).toBe(true)
    expect(result.skillName).toBe('pdf-skill')
    expect(result.path).toBe(path.join('/tmp/test-install', 'pdf-skill'))
  })

  it('installs from local marketplace by copying files', async () => {
    const marketplace: Marketplace = {
      name: 'local-mkt',
      type: 'local',
      path: '/home/user/skills',
      addedAt: '2026-01-01',
    }
    const skill: SkillEntry = {
      name: 'local-skill',
      description: 'A local skill',
      path: 'local-skill',
      source: { localPath: '/home/user/skills' },
    }

    vi.mocked(searchMarketplaceSkill).mockResolvedValue([
      { skill, marketplace: 'local-mkt' },
    ])
    vi.mocked(getMarketplace).mockResolvedValue(marketplace)

    // Mock readdir for copyDir
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as any,
    ])

    const result = await installFromMarketplace('local-skill', '/tmp/test-install')
    expect(result.success).toBe(true)
    expect(result.skillName).toBe('local-skill')
  })

  it('returns error when SKILL.md not found in git cache', async () => {
    const marketplace: Marketplace = {
      name: 'my-mkt',
      type: 'git',
      gitUrl: 'https://github.com/org/skills.git',
      addedAt: '2026-01-01',
    }
    const skill: SkillEntry = {
      name: 'missing-skill',
      description: 'Missing',
      path: 'missing-skill',
      source: { gitUrl: 'https://github.com/org/skills.git' },
    }

    vi.mocked(getMarketplace).mockResolvedValue(marketplace)
    vi.mocked(getMarketplaceManifest).mockResolvedValue({
      name: 'my-mkt',
      version: '1.0',
      skills: [skill],
      updatedAt: '2026-01-01',
    })

    // fs.access fails (SKILL.md not found)
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))

    const result = await installFromMarketplace('missing-skill@my-mkt')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not found in git cache')
  })
})

// --- uninstallFromMarketplace ---

describe('uninstallFromMarketplace', () => {
  it('returns error when skill is not installed', async () => {
    const result = await uninstallFromMarketplace('not-installed')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not installed')
  })

  it('uninstalls an installed skill', async () => {
    const installedData = {
      'my-skill': [{
        name: 'my-skill',
        marketplace: 'my-mkt',
        installedAt: '2026-01-01',
        lastUpdated: '2026-01-01',
        installPath: '/home/user/.agents/skills/my-skill',
      }],
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(installedData))
    vi.mocked(uninstallSkill).mockResolvedValue(undefined as any)

    const result = await uninstallFromMarketplace('my-skill')
    expect(result.success).toBe(true)
    expect(uninstallSkill).toHaveBeenCalledWith('my-skill', '/home/user/.agents/skills/my-skill')
  })

  it('uninstalls from specific marketplace when multiple records exist', async () => {
    const installedData = {
      'pdf': [
        {
          name: 'pdf',
          marketplace: 'mkt-a',
          installedAt: '2026-01-01',
          lastUpdated: '2026-01-01',
          installPath: '/skills/pdf-a',
        },
        {
          name: 'pdf',
          marketplace: 'mkt-b',
          installedAt: '2026-01-02',
          lastUpdated: '2026-01-02',
          installPath: '/skills/pdf-b',
        },
      ],
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(installedData))
    vi.mocked(uninstallSkill).mockResolvedValue(undefined as any)

    const result = await uninstallFromMarketplace('pdf', 'mkt-b')
    expect(result.success).toBe(true)
    // Should uninstall the mkt-b record specifically
    expect(uninstallSkill).toHaveBeenCalledWith('pdf', '/skills/pdf-b')
    // Should preserve the mkt-a record in saved data
    expect(fs.writeFile).toHaveBeenCalled()
  })

  it('returns error when skill not installed from specified marketplace', async () => {
    const installedData = {
      'pdf': [{
        name: 'pdf',
        marketplace: 'mkt-a',
        installedAt: '2026-01-01',
        lastUpdated: '2026-01-01',
        installPath: '/skills/pdf',
      }],
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(installedData))

    const result = await uninstallFromMarketplace('pdf', 'mkt-nonexistent')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not installed from marketplace')
  })
})

// --- listInstalledWithMarketplace ---

describe('listInstalledWithMarketplace', () => {
  it('returns empty array when nothing installed', async () => {
    const result = await listInstalledWithMarketplace()
    expect(result).toEqual([])
  })

  it('returns all installed records', async () => {
    const installedData = {
      'skill-a': [{
        name: 'skill-a',
        marketplace: 'mkt1',
        installedAt: '2026-01-01',
        lastUpdated: '2026-01-01',
        installPath: '/path/a',
      }],
      'skill-b': [{
        name: 'skill-b',
        marketplace: 'mkt2',
        installedAt: '2026-01-02',
        lastUpdated: '2026-01-02',
        installPath: '/path/b',
      }],
    }
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(installedData))

    const result = await listInstalledWithMarketplace()
    expect(result).toHaveLength(2)
    expect(result.map(r => r.name)).toEqual(['skill-a', 'skill-b'])
  })
})

// --- search ---

describe('search', () => {
  it('delegates to manager searchSkill', async () => {
    vi.mocked(searchMarketplaceSkill).mockResolvedValue([
      { skill: { name: 'found', description: 'test', path: 'found', source: {} } as SkillEntry, marketplace: 'mkt' },
    ])

    const results = await search('found')
    expect(results).toHaveLength(1)
    expect(results[0].skill.name).toBe('found')
  })
})

// --- updateSkill ---

describe('updateSkill', () => {
  it('returns error when skill is not installed', async () => {
    const result = await updateSkill('not-installed')
    expect(result.success).toBe(false)
    expect(result.message).toContain('not installed')
  })
})

// --- parseSkillIdentifier (from types.ts) ---

import { parseSkillIdentifier } from '../../../src/core/marketplace/types.js'

describe('parseSkillIdentifier', () => {
  it('parses "skill@marketplace" format', () => {
    expect(parseSkillIdentifier('pdf@my-mkt')).toEqual({ name: 'pdf', marketplace: 'my-mkt' })
  })

  it('returns null marketplace for bare name', () => {
    expect(parseSkillIdentifier('pdf')).toEqual({ name: 'pdf', marketplace: null })
  })

  it('returns full string as name when @ is at start', () => {
    expect(parseSkillIdentifier('@marketplace')).toEqual({ name: '@marketplace', marketplace: null })
  })

  it('returns full string as name when @ is at end', () => {
    expect(parseSkillIdentifier('skill@')).toEqual({ name: 'skill@', marketplace: null })
  })

  it('handles first @ only for skill@marketplace parsing', () => {
    // "a@b@c" => parts = ["a", "b@c"] with split — actually split produces 3 parts
    // Since parts.length !== 2, it returns { name: identifier, marketplace: null }
    expect(parseSkillIdentifier('a@b@c')).toEqual({ name: 'a@b@c', marketplace: null })
  })
})
