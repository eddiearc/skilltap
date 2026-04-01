import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { parseSource, listRepoDirs, getSkillMd, findSkills } from '../../src/core/github.js'
import { installSkill, listInstalled, uninstallSkill } from '../../src/core/installer.js'
import { Skilltap } from '../../src/core/client.js'

// Only run when explicitly enabled with a token to avoid GitHub API rate limits.
const SKIP = !process.env.SKILLTAP_E2E || !process.env.GITHUB_TOKEN

let tmpDir: string

beforeAll(async () => {
  if (SKIP) return
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skilltap-e2e-'))
})

afterAll(async () => {
  if (SKIP || !tmpDir) return
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// Use anthropics/skills as the test repo (large, stable, public)
const TEST_REPO = 'anthropics/skills'
const source = parseSource(TEST_REPO)
const token = process.env.GITHUB_TOKEN

describe.skipIf(SKIP)('E2E: real GitHub API', () => {
  it('listRepoDirs returns top-level directories from the tap root', async () => {
    const dirs = await listRepoDirs(source, token)

    expect(dirs.length).toBeGreaterThan(0)
    expect(dirs).toContain('skills')
  })

  it('findSkills discovers nested skills recursively', async () => {
    const skills = await findSkills(source, token)

    expect(skills.length).toBeGreaterThan(0)
    expect(skills.find((skill) => skill.name === 'pdf')?.path).toBe('skills/pdf')
  }, 15_000)

  it('getSkillMd returns content for existing skill', async () => {
    const content = await getSkillMd(source, 'skills/pdf', token)

    expect(content).not.toBeNull()
    expect(content).toContain('name:')
  })

  it('getSkillMd returns null for nonexistent skill', async () => {
    const content = await getSkillMd(source, 'this-skill-does-not-exist-xyz', token)

    expect(content).toBeNull()
  })

  it('installs a skill to temp directory', async () => {
    const result = await installSkill(source, 'pdf', tmpDir, token, undefined, 'skills/pdf')

    expect(result.name).toBe('pdf')
    expect(result.path).toBe(path.join(tmpDir, 'pdf'))

    // Verify file exists on disk
    const skillMd = await fs.readFile(path.join(tmpDir, 'pdf', 'SKILL.md'), 'utf-8')
    expect(skillMd).toContain('name:')
  })

  it('listInstalled finds the installed skill', async () => {
    const skills = await listInstalled(tmpDir)

    expect(skills.length).toBeGreaterThanOrEqual(1)
    expect(skills.find((s) => s.name === 'pdf')).toBeDefined()
  })

  it('uninstalls the skill', async () => {
    await uninstallSkill('pdf', tmpDir)

    const exists = await fs.access(path.join(tmpDir, 'pdf')).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })
})

describe.skipIf(SKIP)('E2E: full Skilltap client flow', () => {
  it('available → install → list → uninstall → list empty', async () => {
    const st = new Skilltap({
      sources: [TEST_REPO],
      installDir: tmpDir,
      token,
    })

    // available
    const available = await st.available()
    expect(available.length).toBeGreaterThan(0)
    expect(available.find((skill) => skill.name === 'pdf')?.path).toBe('skills/pdf')

    // install
    const installed = await st.install('pdf')
    expect(installed.name).toBe('pdf')

    // list
    const list = await st.list()
    expect(list.find((s) => s.name === 'pdf')).toBeDefined()

    // uninstall
    await st.uninstall('pdf')

    // list again
    const listAfter = await st.list()
    expect(listAfter.find((s) => s.name === 'pdf')).toBeUndefined()
  })
})
