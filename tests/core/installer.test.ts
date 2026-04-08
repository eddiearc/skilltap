import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VALID_SKILL_MD } from '../__fixtures__/skill-md-samples.js'

// Mock fs and os before importing the module under test
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(VALID_SKILL_MD),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
    symlink: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('node:os', () => ({
  default: { homedir: () => '/mock-home' },
}))

// Mock cloneOrUpdate to return a deterministic cache path
vi.mock('../../src/core/git.js', () => ({
  cloneOrUpdate: vi.fn().mockResolvedValue('/git-cache/test-skills'),
  normalizeGitUrl: vi.fn((url: string) => url),
  getCachePathForUrl: vi.fn(() => '/git-cache/test-skills'),
  isGitInstalled: vi.fn().mockResolvedValue(true),
  getGitCacheDir: vi.fn(() => '/git-cache'),
}))

vi.mock('../../src/core/skill-md.js', () => ({
  parseFrontmatter: vi.fn(),
}))

import fs from 'node:fs/promises'
import { installSkill, uninstallSkill, listInstalled } from '../../src/core/installer.js'
import { cloneOrUpdate } from '../../src/core/git.js'
import { parseFrontmatter } from '../../src/core/skill-md.js'

const source = { owner: 'test', repo: 'skills' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cloneOrUpdate).mockResolvedValue('/git-cache/test-skills')
})

// --- installSkill ---

describe('installSkill', () => {
  it('clones the source repo and copies the skill directory', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'SKILL.md', isDirectory: () => false },
    ] as any)
    vi.mocked(fs.readFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF skill' })

    const result = await installSkill(source, 'pdf', '/install-dir')

    expect(cloneOrUpdate).toHaveBeenCalledWith(
      'https://github.com/test/skills.git',
      { branch: undefined, shallow: true },
    )
    expect(fs.mkdir).toHaveBeenCalledWith('/install-dir/pdf', { recursive: true })
    expect(result.name).toBe('pdf')
    expect(result.path).toBe('/install-dir/pdf')
    expect(result.meta.name).toBe('pdf')
  })

  it('copies from nested remote skill path', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'SKILL.md', isDirectory: () => false },
    ] as any)
    vi.mocked(fs.readFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF skill' })

    const result = await installSkill(source, 'pdf', '/install-dir', undefined, undefined, 'skills/pdf')

    // Should copy from cache path + remote path
    expect(fs.mkdir).toHaveBeenCalledWith('/install-dir/pdf', { recursive: true })
    expect(result.path).toBe('/install-dir/pdf')
  })

  it('passes branch to cloneOrUpdate when source has a branch', async () => {
    const branchedSource = { owner: 'test', repo: 'skills', branch: 'dev' }
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    await installSkill(branchedSource, 'pdf', '/install-dir')

    expect(cloneOrUpdate).toHaveBeenCalledWith(
      'https://github.com/test/skills.git',
      { branch: 'dev', shallow: true },
    )
  })

  it('returns fallback meta when SKILL.md is missing', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const result = await installSkill(source, 'unknown-skill', '/install-dir')

    expect(result.meta).toEqual({ name: 'unknown-skill', description: '' })
  })

  it('uses default installDir (~/.agents/skills)', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const result = await installSkill(source, 'pdf')

    expect(fs.mkdir).toHaveBeenCalledWith('/mock-home/.agents/skills/pdf', { recursive: true })
    expect(result.path).toBe('/mock-home/.agents/skills/pdf')
  })

  it('ignores token parameter — cloneOrUpdate called with plain HTTPS URL', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    await installSkill(source, 'pdf', '/install-dir', 'ghp_secret_token')

    // Token must NOT appear in the git URL
    expect(cloneOrUpdate).toHaveBeenCalledWith(
      'https://github.com/test/skills.git',
      expect.anything(),
    )
    const [url] = vi.mocked(cloneOrUpdate).mock.calls[0]!
    expect(url).not.toContain('ghp_secret_token')
  })

  it('creates symlinks in other agent directories', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    await installSkill(source, 'pdf', '/install-dir', undefined, ['/cursor/skills', '/codex/skills'])

    expect(fs.rm).toHaveBeenCalledWith('/cursor/skills/pdf', { recursive: true, force: true })
    expect(fs.symlink).toHaveBeenCalledWith('/install-dir/pdf', '/cursor/skills/pdf')
    expect(fs.rm).toHaveBeenCalledWith('/codex/skills/pdf', { recursive: true, force: true })
    expect(fs.symlink).toHaveBeenCalledWith('/install-dir/pdf', '/codex/skills/pdf')
  })

  it('skips symlink for primary installDir', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    await installSkill(source, 'pdf', '/install-dir', undefined, ['/install-dir', '/cursor/skills'])

    // symlink only called for cursor, not for install-dir itself
    expect(fs.symlink).toHaveBeenCalledTimes(1)
    expect(fs.symlink).toHaveBeenCalledWith('/install-dir/pdf', '/cursor/skills/pdf')
  })
})

// --- uninstallSkill ---

describe('uninstallSkill', () => {
  it('calls fs.rm with recursive and force', async () => {
    await uninstallSkill('pdf', '/install-dir')

    expect(fs.rm).toHaveBeenCalledWith('/install-dir/pdf', { recursive: true, force: true })
  })

  it('uses default installDir', async () => {
    await uninstallSkill('pdf')

    expect(fs.rm).toHaveBeenCalledWith('/mock-home/.agents/skills/pdf', { recursive: true, force: true })
  })

  it('removes symlinks from other agent directories', async () => {
    await uninstallSkill('pdf', '/install-dir', ['/cursor/skills', '/codex/skills'])

    expect(fs.rm).toHaveBeenCalledWith('/cursor/skills/pdf', { recursive: true, force: true })
    expect(fs.rm).toHaveBeenCalledWith('/codex/skills/pdf', { recursive: true, force: true })
    expect(fs.rm).toHaveBeenCalledWith('/install-dir/pdf', { recursive: true, force: true })
  })
})

// --- listInstalled ---

describe('listInstalled', () => {
  it('returns skills with valid SKILL.md', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'pdf', isDirectory: () => true },
      { name: 'xlsx', isDirectory: () => true },
    ] as any)
    vi.mocked(fs.readFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF skill' })

    const skills = await listInstalled('/install-dir')

    expect(skills).toHaveLength(2)
    expect(skills[0].name).toBe('pdf')
  })

  it('skips dotfile directories', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: '.hidden', isDirectory: () => true },
      { name: 'pdf', isDirectory: () => true },
    ] as any)
    vi.mocked(fs.readFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF skill' })

    const skills = await listInstalled('/install-dir')

    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('pdf')
  })

  it('skips directories without SKILL.md', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'no-skill', isDirectory: () => true },
    ] as any)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))

    const skills = await listInstalled('/install-dir')

    expect(skills).toHaveLength(0)
  })

  it('skips directories with invalid frontmatter', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'bad', isDirectory: () => true },
    ] as any)
    vi.mocked(fs.readFile).mockResolvedValue('no frontmatter')
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const skills = await listInstalled('/install-dir')

    expect(skills).toHaveLength(0)
  })

  it('returns empty array when directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'))

    const skills = await listInstalled('/nonexistent')

    expect(skills).toEqual([])
  })
})
