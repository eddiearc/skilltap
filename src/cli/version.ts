import fs from 'node:fs/promises'

let cachedVersion: string | null = null

export async function getCliVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion

  const raw = await fs.readFile(new URL('../../package.json', import.meta.url), 'utf-8')
  const pkg = JSON.parse(raw) as { version?: string }

  if (!pkg.version) {
    throw new Error('package.json is missing a version field')
  }

  cachedVersion = pkg.version
  return cachedVersion
}
