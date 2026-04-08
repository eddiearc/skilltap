/**
 * Pure utility functions for parsing GitHub source identifiers.
 * These have no GitHub API calls and are safe to use without network access.
 */

import type { TapSource, SourceEntry } from './types.js'

/**
 * Normalize any GitHub repo identifier to "owner/repo".
 *
 * Accepted formats:
 *   owner/repo
 *   https://github.com/owner/repo[.git][/tree/branch/...]
 *   git@github.com:owner/repo[.git]
 *   git://github.com/owner/repo[.git]
 *   ssh://git@github.com/owner/repo[.git]
 */
export function normalizeGitHubSource(raw: string): string {
  let input = raw.trim()

  // SSH shorthand: git@github.com:owner/repo.git
  const sshShort = input.match(/^git@[^:]+:(.+)$/)
  if (sshShort) input = sshShort[1]

  // URL protocols: https://, git://, ssh://
  if (/^[a-z+]+:\/\//i.test(input)) {
    try {
      const url = new URL(input)
      input = url.pathname
    } catch {
      // not a valid URL, treat as path
    }
  }

  // Strip leading slash, trailing slash, .git suffix, query, hash
  input = input.replace(/^\/+/, '').replace(/\.git\/?$/, '').replace(/[?#].*$/, '').replace(/\/+$/, '')

  // Strip /tree/... /blob/... /commit/... suffixes (GitHub sub-paths)
  input = input.replace(/\/(tree|blob|commit|releases|issues|pull|actions|settings)(\/.*)?$/, '')

  const parts = input.split('/')
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid source: "${raw}", expected "owner/repo" or a GitHub URL`)
  }
  return `${parts[0]}/${parts[1]}`
}

/** Parse any GitHub repo identifier into TapSource */
export function parseSource(source: string): TapSource {
  const normalized = normalizeGitHubSource(source)
  const [owner, repo] = normalized.split('/')
  return { owner: owner!, repo: repo! }
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

/** Convert a TapSource (GitHub owner/repo) to a GitHub HTTPS git URL */
export function tapSourceToGitUrl(source: TapSource): string {
  return `https://github.com/${source.owner}/${source.repo}.git`
}
