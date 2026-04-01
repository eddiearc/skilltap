import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('node:os', () => ({
  default: { homedir: () => '/mock-home' },
}))

import fs from 'node:fs/promises'
import { loadConfig, saveConfig } from '../../src/cli/config.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadConfig', () => {
  it('returns parsed config when file exists', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ sources: ['org/skills'], installDir: '/custom/path' }),
    )

    const config = await loadConfig()

    expect(config.sources).toEqual(['org/skills'])
    expect(config.installDir).toBe('/custom/path')
  })

  it('merges with defaults when fields are missing', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ sources: ['org/skills'] }),
    )

    const config = await loadConfig()

    expect(config.sources).toEqual(['org/skills'])
    expect(config.installDir).toBe('/mock-home/.agents/skills')
  })

  it('returns default config when file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))

    const config = await loadConfig()

    expect(config.sources).toEqual([])
    expect(config.installDir).toBe('/mock-home/.agents/skills')
  })

  it('returns default config when file has invalid JSON', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('not json{{{')

    const config = await loadConfig()

    expect(config.sources).toEqual([])
  })
})

describe('saveConfig', () => {
  it('creates config directory and writes JSON', async () => {
    const config = { sources: ['org/skills'], installDir: '/mock-home/.agents/skills' }

    await saveConfig(config)

    expect(fs.mkdir).toHaveBeenCalledWith('/mock-home/.skilltap', { recursive: true })
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/mock-home/.skilltap/config.json',
      JSON.stringify(config, null, 2),
      'utf-8',
    )
  })
})
