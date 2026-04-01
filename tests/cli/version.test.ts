import { describe, it, expect } from 'vitest'

import { getCliVersion } from '../../src/cli/version.js'

describe('getCliVersion', () => {
  it('reads the CLI version from package.json', async () => {
    await expect(getCliVersion()).resolves.toBe('0.5.0')
  })
})
