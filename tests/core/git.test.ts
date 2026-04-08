import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

// We need to mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}))

import { normalizeGitUrl, getCachePathForUrl, getGitCacheDir, cloneOrUpdate, isGitInstalled } from '../../src/core/git.js'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(existsSync).mockReturnValue(false)
  vi.mocked(fs.mkdir).mockResolvedValue(undefined)
  vi.mocked(fs.rm).mockResolvedValue(undefined)
})

// --- normalizeGitUrl ---

describe('normalizeGitUrl', () => {
  it('converts SSH URL to HTTPS', () => {
    expect(normalizeGitUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo')
  })

  it('converts SSH URL without .git suffix', () => {
    expect(normalizeGitUrl('git@github.com:owner/repo')).toBe('https://github.com/owner/repo')
  })

  it('converts SSH URL for non-GitHub hosts', () => {
    expect(normalizeGitUrl('git@gitlab.com:org/project.git')).toBe('https://gitlab.com/org/project')
  })

  it('leaves HTTPS URL unchanged', () => {
    expect(normalizeGitUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git')
  })

  it('leaves HTTP URL unchanged', () => {
    expect(normalizeGitUrl('http://example.com/repo.git')).toBe('http://example.com/repo.git')
  })

  it('handles nested paths in SSH URL', () => {
    expect(normalizeGitUrl('git@github.com:org/sub/repo.git')).toBe('https://github.com/org/sub/repo')
  })
})

// --- getGitCacheDir ---

describe('getGitCacheDir', () => {
  it('returns path under ~/.skilltap/git-cache', () => {
    expect(getGitCacheDir()).toBe(path.join(os.homedir(), '.skilltap', 'git-cache'))
  })
})

// --- getCachePathForUrl ---

describe('getCachePathForUrl', () => {
  it('returns deterministic path based on URL hash', () => {
    const url = 'https://github.com/owner/repo'
    const expected = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)
    expect(getCachePathForUrl(url)).toBe(path.join(getGitCacheDir(), expected))
  })

  it('returns different paths for different URLs', () => {
    const path1 = getCachePathForUrl('https://github.com/owner/repo1')
    const path2 = getCachePathForUrl('https://github.com/owner/repo2')
    expect(path1).not.toBe(path2)
  })

  it('returns same path for same URL', () => {
    const url = 'https://github.com/owner/repo'
    expect(getCachePathForUrl(url)).toBe(getCachePathForUrl(url))
  })
})

// --- cloneOrUpdate ---

describe('cloneOrUpdate', () => {
  // Helper to make execFile mock resolve
  function mockExecFile(impl?: (...args: any[]) => void) {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (impl) impl(_cmd, _args, _opts)
      if (typeof _opts === 'function') {
        _opts(null, '', '')
      } else if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as any
    })
  }

  function mockExecFileFail(error: Error) {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof _opts === 'function') {
        _opts(error, '', '')
      } else if (typeof callback === 'function') {
        callback(error, '', '')
      }
      return {} as any
    })
  }

  it('clones fresh when cache does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    mockExecFile()

    const result = await cloneOrUpdate('https://github.com/owner/repo')

    const expectedPath = getCachePathForUrl('https://github.com/owner/repo')
    expect(result).toBe(expectedPath)

    // Verify git clone was called with --depth 1 (shallow by default)
    const cloneCall = vi.mocked(execFile).mock.calls[0]
    expect(cloneCall[0]).toBe('git')
    expect(cloneCall[1]).toContain('clone')
    expect(cloneCall[1]).toContain('--depth')
    expect(cloneCall[1]).toContain('1')
  })

  it('normalizes SSH URL before cloning', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    mockExecFile()

    await cloneOrUpdate('git@github.com:owner/repo.git')

    const cloneCall = vi.mocked(execFile).mock.calls[0]
    expect(cloneCall[1]).toContain('https://github.com/owner/repo')
  })

  it('pulls when cache already exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    mockExecFile()

    const result = await cloneOrUpdate('https://github.com/owner/repo')

    const cloneCall = vi.mocked(execFile).mock.calls[0]
    expect(cloneCall[1]).toContain('pull')
    expect(cloneCall[1]).toContain('--ff-only')
    expect(result).toBe(getCachePathForUrl('https://github.com/owner/repo'))
  })

  it('re-clones when pull fails', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    let callCount = 0
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      callCount++
      if (callCount === 1) {
        // First call (pull) fails
        const cb = typeof _opts === 'function' ? _opts : callback
        cb!(new Error('pull failed'), '', '')
      } else {
        // Second call (clone) succeeds
        const cb = typeof _opts === 'function' ? _opts : callback
        cb!(null, '', '')
      }
      return {} as any
    })

    await cloneOrUpdate('https://github.com/owner/repo')

    // Should have removed the old cache dir
    expect(fs.rm).toHaveBeenCalled()
    // Second call should be a clone
    const secondCall = vi.mocked(execFile).mock.calls[1]
    expect(secondCall[1]).toContain('clone')
  })

  it('passes branch args for clone', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    mockExecFile()

    await cloneOrUpdate('https://github.com/owner/repo', { branch: 'dev' })

    const cloneCall = vi.mocked(execFile).mock.calls[0]
    expect(cloneCall[1]).toContain('--branch')
    expect(cloneCall[1]).toContain('dev')
    expect(cloneCall[1]).toContain('--single-branch')
  })

  it('respects shallow: false option', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    mockExecFile()

    await cloneOrUpdate('https://github.com/owner/repo', { shallow: false })

    const cloneCall = vi.mocked(execFile).mock.calls[0]
    expect(cloneCall[1]).not.toContain('--depth')
  })

  it('throws descriptive error on clone failure', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    mockExecFileFail(new Error('repository not found'))

    await expect(cloneOrUpdate('https://github.com/owner/repo')).rejects.toThrow('git clone failed')
    await expect(cloneOrUpdate('https://github.com/owner/repo')).rejects.toThrow('repository not found')
  })
})

// --- isGitInstalled ---

describe('isGitInstalled', () => {
  it('returns true when git --version succeeds', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = typeof _opts === 'function' ? _opts : callback
      cb!(null, 'git version 2.39.0', '')
      return {} as any
    })

    expect(await isGitInstalled()).toBe(true)
  })

  it('returns false when git is not found', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = typeof _opts === 'function' ? _opts : callback
      cb!(new Error('ENOENT'), '', '')
      return {} as any
    })

    expect(await isGitInstalled()).toBe(false)
  })
})
