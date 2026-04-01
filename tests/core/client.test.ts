import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/core/github.js', () => ({
  parseSource: vi.fn((s: string) => {
    const [owner, repo] = s.split('/')
    if (!owner || !repo) throw new Error(`Invalid source: "${s}"`)
    return { owner, repo }
  }),
  parseSourceEntry: vi.fn((entry: string | { repo: string; branch?: string }) => {
    const s = typeof entry === 'string' ? entry : entry.repo
    const [owner, repo] = s.split('/')
    if (!owner || !repo) throw new Error(`Invalid source: "${s}"`)
    const result: { owner: string; repo: string; branch?: string } = { owner, repo }
    if (typeof entry !== 'string' && entry.branch) result.branch = entry.branch
    return result
  }),
  sourceEntryRepo: vi.fn((entry: string | { repo: string }) => typeof entry === 'string' ? entry : entry.repo),
  resolveToken: vi.fn((entry: string | { token?: string }, globalToken?: string) => {
    if (typeof entry !== 'string' && entry.token) return entry.token
    return globalToken
  }),
  listRepoDirs: vi.fn().mockResolvedValue([]),
  getSkillMd: vi.fn().mockResolvedValue(null),
  parseFrontmatter: vi.fn().mockReturnValue(null),
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
import { listRepoDirs, getSkillMd, parseFrontmatter } from '../../src/core/github.js'
import { installSkill, uninstallSkill, listInstalled } from '../../src/core/installer.js'
import { resolveAgentDirs } from '../../src/core/agents.js'

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
    vi.mocked(listRepoDirs).mockResolvedValue(['pdf', 'xlsx'])
    vi.mocked(getSkillMd).mockResolvedValue('---\nname: pdf\ndescription: test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'test' })

    const st = new Skilltap({ sources: ['org1/skills', 'org2/skills'] })
    const skills = await st.available()

    // 2 sources × 2 dirs each = 4 skills
    expect(skills).toHaveLength(4)
  })

  it('skips directories without SKILL.md', async () => {
    vi.mocked(listRepoDirs).mockResolvedValue(['pdf', 'no-skill'])
    vi.mocked(getSkillMd)
      .mockResolvedValueOnce('---\nname: pdf\ndescription: PDF\n---')
      .mockResolvedValueOnce(null)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF' })

    const st = new Skilltap({ sources: ['test/skills'] })
    const skills = await st.available()

    expect(skills).toHaveLength(1)
  })

  it('skips directories with invalid frontmatter', async () => {
    vi.mocked(listRepoDirs).mockResolvedValue(['bad'])
    vi.mocked(getSkillMd).mockResolvedValue('no frontmatter')
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const st = new Skilltap({ sources: ['test/skills'] })
    const skills = await st.available()

    expect(skills).toHaveLength(0)
  })

  it('returns empty for no sources', async () => {
    const st = new Skilltap({ sources: [] })
    const skills = await st.available()

    expect(skills).toEqual([])
  })
})

// --- search ---

describe('search', () => {
  const setupAvailable = () => {
    vi.mocked(listRepoDirs).mockResolvedValue(['pdf', 'xlsx', 'browser'])
    vi.mocked(getSkillMd).mockResolvedValue('content')
    vi.mocked(parseFrontmatter)
      .mockReturnValueOnce({ name: 'pdf', description: 'Read PDF files' })
      .mockReturnValueOnce({ name: 'xlsx', description: 'Read Excel spreadsheets' })
      .mockReturnValueOnce({ name: 'browser', description: 'Browser automation' })
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
  it('installs from the first source that has the skill', async () => {
    vi.mocked(getSkillMd)
      .mockResolvedValueOnce(null)            // source 1 doesn't have it
      .mockResolvedValueOnce('skill content')  // source 2 has it
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
      { owner: 'org2', repo: 'skills' }, 'pdf', undefined, undefined, undefined,
    )
  })

  it('throws when skill not found in any source', async () => {
    vi.mocked(getSkillMd).mockResolvedValue(null)

    const st = new Skilltap({ sources: ['test/skills'] })

    await expect(st.install('nonexistent')).rejects.toThrow('not found in any source')
  })

  it('throws SkillConflictError when multiple sources have the same skill', async () => {
    vi.mocked(getSkillMd).mockResolvedValue('skill content') // both sources have it

    const st = new Skilltap({ sources: ['org1/skills', 'org2/skills'] })

    await expect(st.install('pdf')).rejects.toThrow('Multiple skills found for "pdf"')
    await expect(st.install('pdf')).rejects.toThrow('org1/skills')
    await expect(st.install('pdf')).rejects.toThrow('org2/skills')
  })

  it('installs from specified source with { from } option', async () => {
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
      { owner: 'org2', repo: 'skills' }, 'pdf', undefined, undefined, undefined,
    )
    // getSkillMd should NOT be called — skips conflict detection
    expect(getSkillMd).not.toHaveBeenCalled()
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
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({ sources: ['test/skills'] })
    const updated = await st.update()

    expect(updated).toHaveLength(2)
  })

  it('silently skips skills that fail to update', async () => {
    vi.mocked(listInstalled).mockResolvedValue([
      { name: 'pdf', meta: { name: 'pdf', description: '' }, path: '/skills/pdf' },
      { name: 'broken', meta: { name: 'broken', description: '' }, path: '/skills/broken' },
    ])
    vi.mocked(getSkillMd).mockResolvedValue(null)  // all sources return null → install throws

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
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({ sources: ['test/skills'], agents: ['claude-code', 'cursor'] })
    await st.install('pdf')

    expect(resolveAgentDirs).toHaveBeenCalledWith(['claude-code', 'cursor'])
    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined,
      ['/mock-home/.claude-code/skills', '/mock-home/.cursor/skills'],
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
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({ sources: ['test/skills'] })
    await st.install('pdf')

    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined, undefined,
    )
  })
})

describe('dirs config', () => {
  it('passes custom dirs as symlinkDirs', async () => {
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({ sources: ['test/skills'], dirs: ['/custom/skills'] })
    await st.install('pdf')

    expect(installSkill).toHaveBeenCalledWith(
      expect.anything(), 'pdf', undefined, undefined, ['/custom/skills'],
    )
  })

  it('merges agents and dirs, deduplicates', async () => {
    vi.mocked(getSkillMd).mockResolvedValue('content')

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
    )
  })
})

// --- per-source token ---

describe('per-source token', () => {
  it('uses per-source token when source has its own token', async () => {
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({
      sources: [{ repo: 'company/private', token: 'ghp_source' }],
      token: 'ghp_global',
    })
    await st.install('pdf')

    // Per-source token should be passed (not global)
    expect(installSkill).toHaveBeenCalledWith(
      { owner: 'company', repo: 'private' }, 'pdf', undefined, 'ghp_source', undefined,
    )
  })

  it('falls back to global token when source has no token', async () => {
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({
      sources: ['company/public'],
      token: 'ghp_global',
    })
    await st.install('pdf')

    expect(installSkill).toHaveBeenCalledWith(
      { owner: 'company', repo: 'public' }, 'pdf', undefined, 'ghp_global', undefined,
    )
  })

  it('passes undefined token when neither source nor global token set', async () => {
    vi.mocked(getSkillMd).mockResolvedValue('content')

    const st = new Skilltap({ sources: ['public/repo'] })
    await st.install('pdf')

    expect(installSkill).toHaveBeenCalledWith(
      { owner: 'public', repo: 'repo' }, 'pdf', undefined, undefined, undefined,
    )
  })

  it('uses per-source token for available() API calls', async () => {
    vi.mocked(listRepoDirs).mockResolvedValue(['pdf'])
    vi.mocked(getSkillMd).mockResolvedValue('---\nname: pdf\ndescription: test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'test' })

    const st = new Skilltap({
      sources: [{ repo: 'company/private', token: 'ghp_source' }],
      token: 'ghp_global',
    })
    await st.available()

    // Per-source token should be passed to listRepoDirs and getSkillMd
    expect(listRepoDirs).toHaveBeenCalledWith({ owner: 'company', repo: 'private' }, 'ghp_source')
    expect(getSkillMd).toHaveBeenCalledWith({ owner: 'company', repo: 'private' }, 'pdf', 'ghp_source')
  })

  it('handles mixed string and SourceConfig sources', async () => {
    vi.mocked(listRepoDirs).mockResolvedValue(['pdf'])
    vi.mocked(getSkillMd).mockResolvedValue('---\nname: pdf\ndescription: test\n---')
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'test' })

    const st = new Skilltap({
      sources: ['public/repo', { repo: 'company/private', token: 'ghp_private' }],
      token: 'ghp_global',
    })
    await st.available()

    // First source (string) uses global token
    expect(listRepoDirs).toHaveBeenCalledWith({ owner: 'public', repo: 'repo' }, 'ghp_global')
    // Second source (SourceConfig) uses per-source token
    expect(listRepoDirs).toHaveBeenCalledWith({ owner: 'company', repo: 'private' }, 'ghp_private')
  })

  it('accepts SourceConfig in constructor without error', () => {
    expect(() => new Skilltap({
      sources: [
        'anthropics/skills',
        { repo: 'company/private', token: 'ghp_xxx' },
        { repo: 'other/repo', branch: 'dev' },
      ],
    })).not.toThrow()
  })

  it('resolves per-source token for install with --from matching a SourceConfig', async () => {
    vi.mocked(installSkill).mockResolvedValue({
      name: 'pdf',
      meta: { name: 'pdf', description: 'PDF skill' },
      path: '/skills/pdf',
      source: { owner: 'company', repo: 'private' },
    })

    const st = new Skilltap({
      sources: ['public/repo', { repo: 'company/private', token: 'ghp_private' }],
      token: 'ghp_global',
    })
    await st.install('pdf', { from: 'company/private' })

    expect(installSkill).toHaveBeenCalledWith(
      { owner: 'company', repo: 'private' }, 'pdf', undefined, 'ghp_private', undefined,
    )
  })
})
