export { Skilltap } from './core/client.js'
export { SkillConflictError } from './core/types.js'
export { AGENTS, getAgent, getAgentIds, detectInstalledAgents, resolveAgentDirs } from './core/agents.js'
export { cloneOrUpdate, isGitInstalled, getGitCacheDir, getCachePathForUrl, normalizeGitUrl } from './core/git.js'
export type {
  SkilltapConfig,
  SourceConfig,
  SourceEntry,
  TapSource,
  SkillMeta,
  DiscoveredSkill,
  RemoteSkill,
  InstalledSkill,
} from './core/types.js'
export type { AgentTarget } from './core/agents.js'
export type { SkillEntry, Marketplace, MarketplaceManifest, InstallResult, UninstallResult } from './core/marketplace/types.js'
