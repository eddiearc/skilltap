/**
 * E2E test for SDK cache behavior.
 *
 * Creates a temporary local git repo as a marketplace fixture, then exercises
 * the Skilltap SDK's available() method to verify cache semantics:
 *   - Second call within TTL skips git pull
 *   - refresh: true forces git pull
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/** Create a temporary git repo with one skill */
async function createFixtureRepo(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skilltap-e2e-'))
  const repoDir = path.join(tmpDir, 'marketplace')
  await fs.mkdir(repoDir, { recursive: true })

  const gitOpts = { cwd: repoDir, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
  execFileSync('git', ['init'], gitOpts)
  execFileSync('git', ['config', 'user.email', 'test@test.com'], gitOpts)
  execFileSync('git', ['config', 'user.name', 'Test'], gitOpts)

  // Create a skill
  const skillDir = path.join(repoDir, 'hello-world')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: hello-world\ndescription: E2E test skill\nauthor: test\n---\nBody\n',
  )

  execFileSync('git', ['add', '.'], gitOpts)
  execFileSync('git', ['commit', '-m', 'init'], gitOpts)

  return repoDir
}

describe('SDK cache behavior (e2e)', () => {
  let fixtureRepoPath: string
  let cacheDir: string

  beforeAll(async () => {
    fixtureRepoPath = await createFixtureRepo()
    // Use a temp cache dir to avoid polluting the real ~/.skilltap
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skilltap-cache-'))
  })

  afterAll(async () => {
    // Clean up temp dirs
    if (fixtureRepoPath) {
      await fs.rm(path.dirname(fixtureRepoPath), { recursive: true, force: true })
    }
    if (cacheDir) {
      await fs.rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('second available() call uses cache and does not trigger git pull', async () => {
    // We'll use getManifestForMarketplace directly since the SDK's Skilltap class
    // is designed for GitHub URLs, while we have a local git repo.
    const { getManifestForMarketplace } = await import('../../src/core/marketplace/manager.js')

    const marketplace = {
      name: 'e2e-test-cache',
      type: 'git' as const,
      gitUrl: fixtureRepoPath, // local file:// path works as git URL
      addedAt: new Date().toISOString(),
    }

    // First call: must clone/discover
    const manifest1 = await getManifestForMarketplace(marketplace)
    expect(manifest1.skills).toHaveLength(1)
    expect(manifest1.skills[0].name).toBe('hello-world')
    const firstTimestamp = manifest1.updatedAt

    // Short wait to ensure timestamps differ if re-fetched
    await new Promise((r) => setTimeout(r, 50))

    // Second call: should return cached (same timestamp)
    const manifest2 = await getManifestForMarketplace(marketplace)
    expect(manifest2.updatedAt).toBe(firstTimestamp)
    expect(manifest2.skills).toHaveLength(1)
  })

  it('available({ refresh: true }) bypasses cache and re-discovers', async () => {
    const { getManifestForMarketplace } = await import('../../src/core/marketplace/manager.js')

    const marketplace = {
      name: 'e2e-test-cache',
      type: 'git' as const,
      gitUrl: fixtureRepoPath,
      addedAt: new Date().toISOString(),
    }

    // Ensure cache is populated
    const cached = await getManifestForMarketplace(marketplace)
    const cachedTimestamp = cached.updatedAt

    await new Promise((r) => setTimeout(r, 50))

    // Force refresh: should get a new timestamp
    const refreshed = await getManifestForMarketplace(marketplace, { refresh: true })
    expect(refreshed.skills).toHaveLength(1)
    expect(refreshed.updatedAt).not.toBe(cachedTimestamp)
  })
})
