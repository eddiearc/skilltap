import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseSource, parseSourceEntry, sourceEntryRepo, resolveToken, listRepoDirs, getSkillMd, downloadSkillDir, downloadFile, parseFrontmatter, findSkills } from '../../src/core/github.js'
import {
  VALID_SKILL_MD,
  MINIMAL_SKILL_MD,
  MISSING_NAME_SKILL_MD,
  NO_FRONTMATTER,
  EMPTY_FRONTMATTER,
  QUOTED_VALUES_SKILL_MD,
  COLON_IN_VALUE_SKILL_MD,
} from '../__fixtures__/skill-md-samples.js'
import { makeRepoContents, makeSkillDir, mockFetchResponses } from '../__fixtures__/github-responses.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

// --- parseSource ---

describe('parseSource', () => {
  it('parses "owner/repo" correctly', () => {
    expect(parseSource('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('throws on missing repo', () => {
    expect(() => parseSource('owner')).toThrow('Invalid source')
  })

  it('throws on empty string', () => {
    expect(() => parseSource('')).toThrow('Invalid source')
  })

  it('throws when owner is empty', () => {
    expect(() => parseSource('/repo')).toThrow('Invalid source')
  })
})

// --- parseFrontmatter ---

describe('parseFrontmatter', () => {
  it('extracts all fields from valid frontmatter', () => {
    const meta = parseFrontmatter(VALID_SKILL_MD)
    expect(meta).toEqual({
      name: 'test-skill',
      description: 'A test skill for unit testing',
      author: 'testauthor',
      version: '1.0.0',
      license: 'MIT',
      argumentHint: '<query>',
    })
  })

  it('extracts minimal frontmatter', () => {
    const meta = parseFrontmatter(MINIMAL_SKILL_MD)
    expect(meta).toEqual({ name: 'minimal', description: 'Minimal skill' })
  })

  it('returns null when name is missing', () => {
    expect(parseFrontmatter(MISSING_NAME_SKILL_MD)).toBeNull()
  })

  it('returns null when no frontmatter', () => {
    expect(parseFrontmatter(NO_FRONTMATTER)).toBeNull()
  })

  it('returns null for empty frontmatter', () => {
    expect(parseFrontmatter(EMPTY_FRONTMATTER)).toBeNull()
  })

  it('strips double quotes from values', () => {
    const meta = parseFrontmatter(QUOTED_VALUES_SKILL_MD)
    expect(meta!.name).toBe('quoted-skill')
    expect(meta!.description).toBe('single quoted description')
  })

  it('handles colons in values', () => {
    const meta = parseFrontmatter(COLON_IN_VALUE_SKILL_MD)
    expect(meta!.description).toBe('Note: this has a colon in the value')
  })
})

// --- parseSourceEntry ---

describe('parseSourceEntry', () => {
  it('parses string entry like parseSource', () => {
    expect(parseSourceEntry('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses SourceConfig object', () => {
    expect(parseSourceEntry({ repo: 'owner/repo' })).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('preserves branch from SourceConfig', () => {
    expect(parseSourceEntry({ repo: 'owner/repo', branch: 'dev' })).toEqual({ owner: 'owner', repo: 'repo', branch: 'dev' })
  })

  it('ignores token (token is not part of TapSource)', () => {
    const result = parseSourceEntry({ repo: 'owner/repo', token: 'ghp_xxx' })
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    expect((result as any).token).toBeUndefined()
  })

  it('throws on invalid SourceConfig repo', () => {
    expect(() => parseSourceEntry({ repo: 'invalid' })).toThrow('Invalid source')
  })
})

// --- sourceEntryRepo ---

describe('sourceEntryRepo', () => {
  it('returns string as-is', () => {
    expect(sourceEntryRepo('owner/repo')).toBe('owner/repo')
  })

  it('returns repo from SourceConfig', () => {
    expect(sourceEntryRepo({ repo: 'owner/repo', token: 'ghp_xxx' })).toBe('owner/repo')
  })
})

// --- resolveToken ---

describe('resolveToken', () => {
  it('returns per-source token when present', () => {
    expect(resolveToken({ repo: 'o/r', token: 'ghp_source' }, 'ghp_global')).toBe('ghp_source')
  })

  it('falls back to global token for SourceConfig without token', () => {
    expect(resolveToken({ repo: 'o/r' }, 'ghp_global')).toBe('ghp_global')
  })

  it('falls back to global token for string entry', () => {
    expect(resolveToken('o/r', 'ghp_global')).toBe('ghp_global')
  })

  it('returns undefined when no tokens available', () => {
    expect(resolveToken('o/r')).toBeUndefined()
  })

  it('returns undefined when SourceConfig has no token and no global', () => {
    expect(resolveToken({ repo: 'o/r' })).toBeUndefined()
  })
})

// --- listRepoDirs ---

describe('listRepoDirs', () => {
  const source = { owner: 'test', repo: 'skills' }

  it('returns only directory names, filtering files and dotfiles', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'api.github.com': {
        status: 200,
        body: makeRepoContents(['pdf', 'xlsx', '.github'], ['README.md']),
      },
    }))

    const dirs = await listRepoDirs(source)
    expect(dirs).toEqual(['pdf', 'xlsx'])
  })

  it('returns empty array for empty repo', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'api.github.com': { status: 200, body: [] },
    }))

    expect(await listRepoDirs(source)).toEqual([])
  })

  it('throws on 401', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'api.github.com': { status: 401, body: 'Unauthorized' },
    }))

    await expect(listRepoDirs(source)).rejects.toThrow('401')
  })

  it('throws on 403', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'api.github.com': { status: 403, body: 'Forbidden' },
    }))

    await expect(listRepoDirs(source)).rejects.toThrow('403')
  })

  it('passes token as Bearer header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await listRepoDirs(source, 'my-token')

    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders['Authorization']).toBe('Bearer my-token')
  })

  it('does not include Authorization header without token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await listRepoDirs(source)

    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders['Authorization']).toBeUndefined()
  })
})

// --- getSkillMd ---

describe('getSkillMd', () => {
  const source = { owner: 'test', repo: 'skills' }

  it('returns raw text on 200', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'SKILL.md': { status: 200, body: VALID_SKILL_MD },
    }))

    const content = await getSkillMd(source, 'pdf')
    expect(content).toContain('test-skill')
  })

  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'SKILL.md': { status: 404, body: 'Not Found' },
    }))

    expect(await getSkillMd(source, 'nonexistent')).toBeNull()
  })

  it('throws on 500', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'SKILL.md': { status: 500, body: 'Server Error' },
    }))

    await expect(getSkillMd(source, 'pdf')).rejects.toThrow('500')
  })
})

// --- downloadSkillDir ---

describe('downloadSkillDir', () => {
  const source = { owner: 'test', repo: 'skills' }

  it('returns GitHubContent array on 200', async () => {
    const files = makeSkillDir('pdf')
    vi.stubGlobal('fetch', mockFetchResponses({
      'contents/pdf': { status: 200, body: files },
    }))

    const result = await downloadSkillDir(source, 'pdf')
    expect(result).toEqual(files)
  })

  it('throws on non-200', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'contents/pdf': { status: 404, body: 'Not Found' },
    }))

    await expect(downloadSkillDir(source, 'pdf')).rejects.toThrow('404')
  })
})

// --- findSkills ---

describe('findSkills', () => {
  const source = { owner: 'test', repo: 'skills' }

  it('finds skills recursively from nested directories', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'contents/template/SKILL.md': {
        status: 200,
        body: `---\nname: template\ndescription: Template skill\n---`,
      },
      'contents/skills/SKILL.md': { status: 404, body: 'Not Found' },
      'contents/skills/pdf/SKILL.md': {
        status: 200,
        body: `---\nname: pdf\ndescription: Read PDF files\n---`,
      },
      'contents/skills/docx/SKILL.md': {
        status: 200,
        body: `---\nname: docx\ndescription: Read Word files\n---`,
      },
      'contents/skills': {
        status: 200,
        body: makeRepoContents(['pdf', 'docx']),
      },
      'contents/docs/SKILL.md': { status: 404, body: 'Not Found' },
      'contents/docs': {
        status: 200,
        body: [],
      },
      'contents/': {
        status: 200,
        body: makeRepoContents(['template', 'skills', 'docs'], ['README.md']),
      },
    }))

    const skills = await findSkills(source)

    expect(skills).toEqual([
      {
        name: 'template',
        path: 'template',
        meta: { name: 'template', description: 'Template skill' },
      },
      {
        name: 'pdf',
        path: 'skills/pdf',
        meta: { name: 'pdf', description: 'Read PDF files' },
      },
      {
        name: 'docx',
        path: 'skills/docx',
        meta: { name: 'docx', description: 'Read Word files' },
      },
    ])
  })

  it('stops descending once a directory is identified as a skill', async () => {
    const mockFetch = vi.fn(mockFetchResponses({
      'contents/bundle/SKILL.md': {
        status: 200,
        body: `---\nname: bundle\ndescription: Parent skill\n---`,
      },
      'contents/': {
        status: 200,
        body: makeRepoContents(['bundle']),
      },
    }))
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch)

    const skills = await findSkills(source)

    expect(skills).toEqual([
      {
        name: 'bundle',
        path: 'bundle',
        meta: { name: 'bundle', description: 'Parent skill' },
      },
    ])
    expect(
      mockFetch.mock.calls.some(([url]) => String(url).includes('contents/bundle/scripts')),
    ).toBe(false)
  })
})

// --- downloadFile ---

describe('downloadFile', () => {
  it('returns text content on 200', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'raw.githubusercontent.com': { status: 200, body: 'file content here' },
    }))

    const content = await downloadFile('https://raw.githubusercontent.com/test/file.md')
    expect(content).toBe('file content here')
  })

  it('throws on non-200', async () => {
    vi.stubGlobal('fetch', mockFetchResponses({
      'raw.githubusercontent.com': { status: 403, body: 'Forbidden' },
    }))

    await expect(downloadFile('https://raw.githubusercontent.com/test/file.md')).rejects.toThrow('403')
  })
})
