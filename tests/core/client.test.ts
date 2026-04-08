import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/core/source-utils.js', () => ({
  parseSource: vi.fn((s: string) => {
    const [owner, repo] = s.split('/')
    if (!owner || !repo) throw new Error(`Invalid source: "${s}", expected "owner/repo" or a GitHub URL`)
    return { owner, repo }
  }),
  parseSourceEntry: vi.fn((entry: string | { repo: string; branch?: string }) => {
    const s = typeof entry === 'string' ? entry : entry.repo
    const [owner, repo] = s.split('/')
    if (!owner || !repo) throw new Error(`Invalid source: "${s}", expected "owner/repo" or a GitHub URL`)
    const result: { owner: string; repo: string; branch?: string } = { owner, repo }
    if (typeof entry !== 'string' && entry.branch) result.branch = entry.branch
    return result
  }),
  sourceEntryRepo: vi.fn((entry: string | { repo: string }) => typeof entry === 'string' ? entry : entry.repo),
  resolveToken: vi.fn((entry: string | { token?: string }, globalToken?: string) => {
    if (typeof entry !== 'string' && entry.token) return entry.token
    return globalToken
  }),
  tapSourceToGitUrl: vi.fn((source: { owner: string; repo: string }) =>
    `https://github.com/${source.owner}/${source.repo}.git`
  ),
}))

vi.mock('../../src/core/marketplace/manager.js', () => ({
  discoverSkillsFromMarketplace: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../src/core/agents.js', () => ({
  resolveAgentDirs: vi.fn((ids: string[]) => ids.map((id) => `/mock-home/.${id}/skills`)),
}))

vi.mock('../../src/core/installer.js', () => ({
  installSkill: vi.fn().mockResolvedValue({
    name: 'pdf',
    meta: { name: 'pdf', description: 'PDF skill' },
    path: '/skills/pdf',
    source: { owner: 'test', repo: 'skills' },
  }),
  uninstallSkill: vi.fn().mockResolvedValue(undefined),
  listInstalled: vi.fn().mockResolvedValue([]),
}))

import { Skilltap } from '../../src/core/client.js'
import { discoverSkillsFromMarketplace } from '../../src/core/marketplace/manager.js'
import { installSkill, uninstallSkill, listInstalled } from '../../src/core/installer.js'
import { resolveAgentDirs } from '../../src/core/agents.js'

type SkillEntry = { name: string; description: string; path: string; source: object; author?: string; version?: string; license?: string; argumentHint?: string }

const makeSkillEntry = (name: string, description: string, path: string): SkillEntry => ({
  name, description, path, source: {},
})

beforeEach(() => {
  vi.clearAllMocks()
})

// --- constructor ---

describe('constructor', () => {
  it('parses sources correctly', () => {
    expect(() => new Skilltap({ sources: ['owner/repo'] })).not.toThrow()
  })

  it('throws on invalid source', () => {
    expect(() => new Skilltap({ sources: ['invalid'] })).toThrow('Invalid source')
  })
})

// --- available ---

describe('available', () => {
  it('aggregates skills from multiple sources', async () => {
    vi.mocked(discoverSkillsFromMarketplace)
      .mockResolvedValueOnce([
        makeSkillEntry('pdf', 'PDF', 'skills/pdf'),
        makeSkillEntry('xlsx', 'Excel', 'skills/xlsx'),
      ])
      .mockResolvedValueOnce([
        makeSkillEntry('browser', 'Browser', 'browser'),
      ])

    const st = new Skilltap({ sources: ['org1/skills', 'org2/skills'] })
    const skills = await st.available()

    expect(skills).toHaveLength(3)
    expect(skills[0].path).toBe('skills/pdf')
  })

  it('returns empty when a source has no discovered skills', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([])

    const st = new Skilltap({ sources: ['test/skills'] })
    const skills = await st.available()

    expect(skills).toHaveLength(0)
  })

  it('returns empty for no sources', async () => {
    const st = new Skilltap({ sources: [] })
    const skills = await st.available()

    expect(skills).toEqual([])
  })

  it('propagates clone/auth errors from discoverSkillsFromMarketplace', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockRejectedValue(
      new Error('Authentication failed: could not clone git@github.com:org/private.git'),
    )

    const st = new Skilltap({ sources: ['org/private'] })

    await expect(st.available()).rejects.toThrow('Authentication failed')
    await expect(st.install('pdf')).rejects.toThrow('Authentication failed')
  })
})

// --- search ---

describe('search', () => {
  const setupAvailable = () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'Read PDF files', 'skills/pdf'),
      makeSkillEntry('xlsx', 'Read Excel spreadsheets', 'skills/xlsx'),
      makeSkillEntry('browser', 'Browser automation', 'browser'),
    ])
  }

  it('matches by name (case-insensitive)', async () => {
    setupAvailable()
    const st = new Skilltap({ sources: ['test/skills'] })
    const results = await st.search('PDF')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('pdf')
  })

  it('matches by description', async () => {
    setupAvailable()
    const st = new Skilltap({ sources: ['test/skills'] })
    const results = await st.search('spreadsheet')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('xlsx')
  })

  it('returns empty when no match', async () => {
    setupAvailable()
    const st = new Skilltap({ sources: ['test/skills'] })
    const results = await st.search('nonexistent')

    expect(results).toHaveLength(0)
  })

  it('returns all when keyword is empty', async () => {
    setupAvailable()
    const st = new Skilltap({ sources: ['test/skills'] })
    const results = await st.search('')

    expect(results).toHaveLength(3)
  })
})

// --- install ---

describe('install', () => {
  it('installs from the first source that has the skill and passes the nested path through', async () => {
    vi.mocked(discoverSkillsFromMarketplace)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
      ])
    vi.mocked(installSkill).mockResolvedValue({
      name: 'pdf',
      meta: { name: 'pdf', description: 'PDF skill' },
      path: '/skills/pdf',
      source: { owner: 'org2', repo: 'skills' },
    })

    const st = new Skilltap({ sources: ['org1/skills', 'org2/skills'] })
    const result = await st.install('pdf')

    expect(result.name).toBe('pdf')
    expect(installSkill).toHaveBeenCalledWith(
      { owner: 'org2', repo: 'skills' }, 'pdf', undefined, undefined, undefined, 'skills/pdf',
    )
  })

  it('throws when skill not found in any source', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([])

    const st = new Skilltap({ sources: ['test/skills'] })

    await expect(st.install('nonexistent')).rejects.toThrow('not found in any source')
  })

  it('throws SkillConflictError when multiple sources have the same skill', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])

    const st = new Skilltap({ sources: ['org1/skills', 'org2/skills'] })

    await expect(st.install('pdf')).rejects.toThrow('Multiple skills found for "pdf"')
    await expect(st.install('pdf')).rejects.toThrow('org1/skills')
    await expect(st.install('pdf')).rejects.toThrow('org2/skills')
  })

  it('installs from specified source with { from } option', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])
    vi.mocked(installSkill).mockResolvedValue({
      name: 'pdf',
      meta: { name: 'pdf', description: 'PDF skill' },
      path: '/skills/pdf',
      source: { owner: 'org2', repo: 'skills' },
    })

    const st = new Skilltap({ sources: ['org1/skills', 'org2/skills'] })
    const result = await st.install('pdf', { from: 'org2/skills' })

    expect(result.name).toBe('pdf')
    expect(installSkill).toHaveBeenCalledWith(
      { owner: 'org2', repo: 'skills' }, 'pdf', undefined, undefined, undefined, 'skills/pdf',
    )
  })
})

// --- uninstall ---

describe('uninstall', () => {
  it('delegates to uninstallSkill', async () => {
    const st = new Skilltap({ sources: ['test/skills'] })
    await st.uninstall('pdf')

    expect(uninstallSkill).toHaveBeenCalledWith('pdf', undefined, undefined)
  })
})

// --- list ---

describe('list', () => {
  it('delegates to listInstalled', async () => {
    const st = new Skilltap({ sources: ['test/skills'] })
    await st.list()

    expect(listInstalled).toHaveBeenCalledWith(undefined)
  })
})

// --- update ---

describe('update', () => {
  it('re-installs all installed skills', async () => {
    vi.mocked(listInstalled).mockResolvedValue([
      { name: 'pdf', meta: { name: 'pdf', description: '' }, path: '/skills/pdf' },
      { name: 'xlsx', meta: { name: 'xlsx', description: '' }, path: '/skills/xlsx' },
    ])
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', '', 'skills/pdf'),
      makeSkillEntry('xlsx', '', 'skills/xlsx'),
    ])

    const st = new Skilltap({ sources: ['test/skills'] })
    const updated = await st.update()

    expect(updated).toHaveLength(2)
  })

  it('silently skips skills that fail to update', async () => {
    vi.mocked(listInstalled).mockResolvedValue([
      { name: 'pdf', meta: { name: 'pdf', description: '' }, path: '/skills/pdf' },
      { name: 'broken', meta: { name: 'broken', description: '' }, path: '/skills/broken' },
    ])
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([])

    const st = new Skilltap({ sources: ['test/skills'] })
    const updated = await st.update()

    expect(updated).toHaveLength(0)
  })

  it('returns empty when nothing is installed', async () => {
    vi.mocked(listInstalled).mockResolvedValue([])

    const st = new Skilltap({ sources: ['test/skills'] })
    const updated = await st.update()

    expect(updated).toEqual([])
  })
})

// --- agents & dirs ---

describe('agents config', () => {
  it('passes resolved agent dirs as symlinkDirs to installSkill', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])

    const st = new Skilltap({ sources: ['test/skills'], agents: ['claude-code', 'cursor'] })
    await st.install('pdf')

    expect(resolveAgentDirs).toHaveBeenCalledWith(['claude-code', 'cursor'])
    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined,
      ['/mock-home/.claude-code/skills', '/mock-home/.cursor/skills'],
      'skills/pdf',
    )
  })

  it('passes resolved agent dirs to uninstallSkill', async () => {
    const st = new Skilltap({ sources: ['test/skills'], agents: ['claude-code'] })
    await st.uninstall('pdf')

    expect(uninstallSkill).toHaveBeenCalledWith(
      'pdf', undefined, ['/mock-home/.claude-code/skills'],
    )
  })

  it('does not pass symlinkDirs when no agents configured', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])

    const st = new Skilltap({ sources: ['test/skills'] })
    await st.install('pdf')

    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined, undefined, 'skills/pdf',
    )
  })
})

describe('dirs config', () => {
  it('passes custom dirs as symlinkDirs', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])

    const st = new Skilltap({ sources: ['test/skills'], dirs: ['/custom/skills'] })
    await st.install('pdf')

    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined, ['/custom/skills'], 'skills/pdf',
    )
  })

  it('merges agents and dirs, deduplicates', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])

    const st = new Skilltap({
      sources: ['test/skills'],
      agents: ['cursor'],
      dirs: ['/mock-home/.cursor/skills', '/extra/skills'],
    })
    await st.install('pdf')

    // /mock-home/.cursor/skills appears in both agents and dirs, should be deduplicated
    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined,
      ['/mock-home/.cursor/skills', '/extra/skills'],
      'skills/pdf',
    )
  })
})

// --- source config ---

describe('source config', () => {
  it('accepts SourceConfig in constructor without error', () => {
    expect(() => new Skilltap({
      sources: [
        'anthropics/skills',
        { repo: 'company/private', token: 'ghp_xxx' },
        { repo: 'other/repo', branch: 'dev' },
      ],
    })).not.toThrow()
  })

  it('ignores deprecated token — installSkill called with undefined token', async () => {
    vi.mocked(discoverSkillsFromMarketplace).mockResolvedValue([
      makeSkillEntry('pdf', 'PDF skill', 'skills/pdf'),
    ])

    // token at both global and per-source level
    const st = new Skilltap({
      sources: [{ repo: 'org/skills', token: 'ghp_per_source' }],
      token: 'ghp_global',
    })
    await st.install('pdf')

    // token param (_token) must be undefined — tokens are ignored in git-clone path
    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined, undefined, 'skills/pdf',
    )
  })
})
