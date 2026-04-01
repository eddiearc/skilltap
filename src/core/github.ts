import type { TapSource, SkillMeta } from './types.js'

const GITHUB_API = 'https://api.github.com'

interface GitHubContent {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'skilltap',
  }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

/** Parse "owner/repo" string into TapSource */
export function parseSource(source: string): TapSource {
  const [owner, repo] = source.split('/')
  if (!owner || !repo) throw new Error(`Invalid source: "${source}", expected "owner/repo"`)
  return { owner, repo }
}

/** List top-level directories in a repo (each dir = potential skill) */
export async function listRepoDirs(source: TapSource, token?: string): Promise<string[]> {
  const url = `${GITHUB_API}/repos/${source.owner}/${source.repo}/contents/`
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)

  const items: GitHubContent[] = await res.json()
  return items
    .filter((item) => item.type === 'dir' && !item.name.startsWith('.'))
    .map((item) => item.name)
}

/** Check if a directory contains SKILL.md */
export async function getSkillMd(
  source: TapSource,
  skillName: string,
  token?: string,
): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${source.owner}/${source.repo}/contents/${skillName}/SKILL.md`
  const res = await fetch(url, {
    headers: { ...headers(token), Accept: 'application/vnd.github.v3.raw' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  return res.text()
}

/** Download a skill directory as tarball and return file entries */
export async function downloadSkillDir(
  source: TapSource,
  skillName: string,
  token?: string,
): Promise<GitHubContent[]> {
  const url = `${GITHUB_API}/repos/${source.owner}/${source.repo}/contents/${skillName}`
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  return res.json()
}

/** Download a single file's raw content */
export async function downloadFile(url: string, token?: string): Promise<string> {
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.text()
}

/** Parse SKILL.md frontmatter */
export function parseFrontmatter(content: string): SkillMeta | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const meta: SkillMeta = { name: '', description: '' }
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    switch (key) {
      case 'name': meta.name = val; break
      case 'description': meta.description = val; break
      case 'author': meta.author = val; break
      case 'version': meta.version = val; break
      case 'license': meta.license = val; break
      case 'argument-hint': meta.argumentHint = val; break
    }
  }
  return meta.name ? meta : null
}
