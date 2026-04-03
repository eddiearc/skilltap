import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import crypto from 'node:crypto'
import { existsSync } from 'node:fs'

const execFileAsync = promisify(execFile)

const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }

export function normalizeGitUrl(gitUrl: string): string {
  // Convert SSH URLs to HTTPS URLs for reliability
  // git@github.com:owner/repo.git -> https://github.com/owner/repo.git
  const sshMatch = gitUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/i)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }
  return gitUrl
}

function hashUrl(gitUrl: string): string {
  return crypto.createHash('sha256').update(gitUrl).digest('hex').slice(0, 16)
}

export function getGitCacheDir(): string {
  return path.join(os.homedir(), '.skilltap', 'git-cache')
}

export function getCachePathForUrl(gitUrl: string): string {
  return path.join(getGitCacheDir(), hashUrl(gitUrl))
}

export async function cloneOrUpdate(
  gitUrl: string,
  opts: { branch?: string; shallow?: boolean } = {}
): Promise<string> {
  const normalizedUrl = normalizeGitUrl(gitUrl)
  const cachePath = getCachePathForUrl(normalizedUrl)
  const shallow = opts.shallow !== false // default true

  // Ensure cache dir exists
  await fs.mkdir(getGitCacheDir(), { recursive: true })

  if (existsSync(cachePath)) {
    // Already cloned - try git pull
    try {
      const branchArgs = opts.branch ? [opts.branch] : []
      await execFileAsync('git', ['-C', cachePath, 'pull', '--ff-only', ...branchArgs], {
        timeout: 30000,
        env: gitEnv,
      })
      return cachePath
    } catch {
      // Pull failed - re-clone
      await fs.rm(cachePath, { recursive: true, force: true })
    }
  }

  // Fresh clone
  const args = ['clone']
  if (shallow) args.push('--depth', '1')
  if (opts.branch) {
    args.push('--branch', opts.branch)
    args.push('--single-branch')
  }
  args.push(normalizedUrl, cachePath)

  try {
    await execFileAsync('git', args, { timeout: 120000, env: gitEnv })
    return cachePath
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`git clone failed: ${msg}`)
  }
}

export async function isGitInstalled(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { timeout: 5000, env: gitEnv })
    return true
  } catch {
    return false
  }
}
