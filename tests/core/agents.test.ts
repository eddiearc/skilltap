import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:os', () => ({
  default: { homedir: () => '/mock-home' },
}))

vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}))

import fs from 'node:fs/promises'
import {
  detectInstalledAgents,
  getAgent,
  getAgentIds,
  resolveAgentDirs,
} from '../../src/core/agents.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Kimi Code agent target', () => {
  it('uses the documented user and project skill directories', () => {
    expect(getAgent('kimi')).toEqual({
      id: 'kimi',
      name: 'Kimi Code',
      projectDir: '.kimi-code/skills',
      globalDir: '/mock-home/.kimi-code/skills',
    })
    expect(getAgentIds()).toContain('kimi')
    expect(resolveAgentDirs(['kimi'])).toEqual(['/mock-home/.kimi-code/skills'])
  })

  it('detects Kimi Code when its configuration directory exists', async () => {
    vi.mocked(fs.access).mockImplementation(async (target) => {
      if (target === '/mock-home/.kimi-code') return
      throw new Error('ENOENT')
    })

    await expect(detectInstalledAgents()).resolves.toEqual([getAgent('kimi')])
  })
})
