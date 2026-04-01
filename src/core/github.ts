import type { TapSource, SkillMeta, SourceEntry, DiscoveredSkill } from './types.js'

const GITHUB_API = 'https://api.github.com'

interface GitHubContent {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url: string | null
}

function normalizeRepoPath(repoPath: string): string {
  return repoPath.replace(/^\/+|\/+$/g, '')
}

function joinRepoPath(parent: string, child: string): string {
  return normalizeRepoPath([parent, child].filter(Boolean).join('/'))
}

function resolveContentPath(parent: string, item: Pick<GitHubContent, 'name' | 'path'>): string {
  if (!parent) return normalizeRepoPath(item.path || item.name)
  if (item.path && item.path.includes('/')) return normalizeRepoPath(item.path)
  return joinRepoPath(parent, item.name)
}

async function listRepoContents(
  source: TapSource,
  token?: string,
  repoPath = '',
): Promise<GitHubContent[]> {
  const normalizedPath = normalizeRepoPath(repoPath)
  const url = `${GITHUB_API}/repos/${source.owner}/${source.repo}/contents/${normalizedPath}`
  const res = await fetch(url, { headers: headers(token) })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  return res.json()
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

/** Parse a SourceEntry (string or SourceConfig) into TapSource */
export function parseSourceEntry(entry: SourceEntry): TapSource {
  if (typeof entry === 'string') return parseSource(entry)
  const source = parseSource(entry.repo)
  if (entry.branch) source.branch = entry.branch
  return source
}

/** Get the repo string from a SourceEntry */
export function sourceEntryRepo(entry: SourceEntry): string {
  return typeof entry === 'string' ? entry : entry.repo
}

/**
 * Resolve the token for a source entry.
 * Priority: per-source token > global token > undefined (auto-detect)
 */
export function resolveToken(entry: SourceEntry, globalToken?: string): string | undefined {
  if (typeof entry !== 'string' && entry.token) return entry.token
  return globalToken
}

/** List top-level directories in a repo (each dir = potential skill) */
export async function listRepoDirs(source: TapSource, token?: string): Promise<string[]> {
  const items = await listRepoContents(source, token)
  return items
    .filter((item) => item.type === 'dir' && !item.name.startsWith('.'))
    .map((item) => item.name)
}

/** Check if a directory contains SKILL.md */
export async function getSkillMd(
  source: TapSource,
  skillPath: string,
  token?: string,
): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${source.owner}/${source.repo}/contents/${normalizeRepoPath(skillPath)}/SKILL.md`
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
  skillPath: string,
  token?: string,
): Promise<GitHubContent[]> {
  return listRepoContents(source, token, skillPath)
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

/** Recursively discover skill directories by locating SKILL.md files */
export async function findSkills(
  source: TapSource,
  token?: string,
  repoPath = '',
): Promise<DiscoveredSkill[]> {
  const items = await listRepoContents(source, token, repoPath)
  const dirs = items.filter((item) => item.type === 'dir' && !item.name.startsWith('.'))
  const skills: DiscoveredSkill[] = []

  for (const dir of dirs) {
    const dirPath = resolveContentPath(repoPath, dir)
    const skillMd = await getSkillMd(source, dirPath, token)

    if (skillMd) {
      const meta = parseFrontmatter(skillMd)
      if (meta) {
        skills.push({ name: meta.name, meta, path: dirPath })
      }
      continue
    }

    skills.push(...await findSkills(source, token, dirPath))
  }

  return skills
}
