import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VALID_SKILL_MD } from '../__fixtures__/skill-md-samples.js'
import { makeGitHubFile, makeGitHubDir } from '../__fixtures__/github-responses.js'

// Mock fs and os before importing the module under test
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(VALID_SKILL_MD),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn().mockResolvedValue(undefined),
    symlink: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('node:os', () => ({
  default: { homedir: () => '/mock-home' },
}))

vi.mock('../../src/core/github.js', () => ({
  downloadSkillDir: vi.fn().mockResolvedValue([]),
  downloadFile: vi.fn().mockResolvedValue('file content'),
  getSkillMd: vi.fn(),
  parseFrontmatter: vi.fn(),
}))

import fs from 'node:fs/promises'
import { installSkill, uninstallSkill, listInstalled } from '../../src/core/installer.js'
import { downloadSkillDir, downloadFile } from '../../src/core/github.js'
import { parseFrontmatter } from '../../src/core/github.js'

const source = { owner: 'test', repo: 'skills' }

beforeEach(() => {
  vi.clearAllMocks()
})

// --- installSkill ---

describe('installSkill', () => {
  it('creates directory, downloads files, writes them, and returns InstalledSkill', async () => {
    const files = [makeGitHubFile('SKILL.md', 'https://example.com/SKILL.md')]
    vi.mocked(downloadSkillDir).mockResolvedValue(files)
    vi.mocked(downloadFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(fs.readFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF skill' })

    const result = await installSkill(source, 'pdf', '/install-dir')

    expect(fs.mkdir).toHaveBeenCalledWith('/install-dir/pdf', { recursive: true })
    expect(downloadFile).toHaveBeenCalledWith('https://example.com/SKILL.md', undefined)
    expect(fs.writeFile).toHaveBeenCalledWith('/install-dir/pdf/SKILL.md', VALID_SKILL_MD, 'utf-8')
    expect(result.name).toBe('pdf')
    expect(result.path).toBe('/install-dir/pdf')
    expect(result.meta.name).toBe('pdf')
  })

  it('handles subdirectories by recursively downloading', async () => {
    const topFiles = [
      makeGitHubFile('SKILL.md', 'https://example.com/SKILL.md'),
      makeGitHubDir('scripts'),
    ]
    const subFiles = [makeGitHubFile('run.sh', 'https://example.com/run.sh')]

    vi.mocked(downloadSkillDir)
      .mockResolvedValueOnce(topFiles)
      .mockResolvedValueOnce(subFiles)
    vi.mocked(downloadFile).mockResolvedValue('content')
    vi.mocked(fs.readFile).mockResolvedValue(VALID_SKILL_MD)
    vi.mocked(parseFrontmatter).mockReturnValue({ name: 'pdf', description: 'PDF skill' })

    await installSkill(source, 'pdf', '/install-dir')

    expect(fs.mkdir).toHaveBeenCalledWith('/install-dir/pdf/scripts', { recursive: true })
    expect(downloadSkillDir).toHaveBeenCalledTimes(2)
  })

  it('skips files with null download_url', async () => {
    const files = [{ name: 'ghost.md', path: 'ghost.md', type: 'file' as const, download_url: null }]
    vi.mocked(downloadSkillDir).mockResolvedValue(files)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const result = await installSkill(source, 'pdf', '/install-dir')

    expect(downloadFile).not.toHaveBeenCalled()
    expect(result.meta).toEqual({ name: 'pdf', description: '' })
  })

  it('returns fallback meta when SKILL.md is missing', async () => {
    vi.mocked(downloadSkillDir).mockResolvedValue([])
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const result = await installSkill(source, 'unknown-skill', '/install-dir')

    expect(result.meta).toEqual({ name: 'unknown-skill', description: '' })
  })

  it('uses default installDir (~/.claude/skills)', async () => {
    vi.mocked(downloadSkillDir).mockResolvedValue([])
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    const result = await installSkill(source, 'pdf')

    expect(fs.mkdir).toHaveBeenCalledWith('/mock-home/.agents/skills/pdf', { recursive: true })
    expect(result.path).toBe('/mock-home/.agents/skills/pdf')
  })

  it('creates symlinks in other agent directories', async () => {
    vi.mocked(downloadSkillDir).mockResolvedValue([])
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
    vi.mocked(parseFrontmatter).mockReturnValue(null)

    await installSkill(source, 'pdf', '/install-dir', undefined, ['/cursor/skills', '/codex/skills'])

    expect(fs.rm).toHaveBeenCalledWith('/cursor/skills/pdf', { recursive: true, force: true })
    expect(fs.symlink).toHaveBeenCalledWith('/install-dir/pdf', '/cursor/skills/pdf')
    expect(fs.rm).toHaveBeenCalledWith('/codex/skills/pdf', { recursive: true, force: true })
    expect(fs.symlink).toHaveBeenCalledWith('/install-dir/pdf', '/codex/skills/pdf')
  })

  it('skips symlink for primary installDir', async () => {
    vi.mocked(downloadSkillDir).mockResolvedValue([])
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
