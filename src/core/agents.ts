import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

const home = os.homedir()

export interface AgentTarget {
  /** Agent identifier */
  id: string
  /** Display name */
  name: string
  /** Project-level skill directory (relative to project root) */
  projectDir: string
  /** Global skill directory (absolute path) */
  globalDir: string
}

/** All supported agents and their skill directory conventions */
export const AGENTS: AgentTarget[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    projectDir: '.claude/skills',
    globalDir: path.join(home, '.claude', 'skills'),
  },
  {
    id: 'codex',
    name: 'Codex',
    projectDir: '.codex/skills',
    globalDir: path.join(home, '.codex', 'skills'),
  },
  {
    id: 'kimi',
    name: 'Kimi Code',
    projectDir: '.kimi-code/skills',
    globalDir: path.join(home, '.kimi-code', 'skills'),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    projectDir: '.cursor/skills',
    globalDir: path.join(home, '.cursor', 'skills'),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    projectDir: '.windsurf/skills',
    globalDir: path.join(home, '.windsurf', 'skills'),
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    projectDir: '.github/skills',
    globalDir: path.join(home, '.github', 'skills'),
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    projectDir: '.gemini/skills',
    globalDir: path.join(home, '.gemini', 'skills'),
  },
  {
    id: 'cline',
    name: 'Cline',
    projectDir: '.cline/skills',
    globalDir: path.join(home, '.cline', 'skills'),
  },
  {
    id: 'roo',
    name: 'Roo Code',
    projectDir: '.roo/skills',
    globalDir: path.join(home, '.roo', 'skills'),
  },
  {
    id: 'amp',
    name: 'Amp',
    projectDir: '.amp/skills',
    globalDir: path.join(home, '.amp', 'skills'),
  },
  {
    id: 'augment',
    name: 'Augment',
    projectDir: '.augment/skills',
    globalDir: path.join(home, '.augment', 'skills'),
  },
]

/** Get agent by id */
export function getAgent(id: string): AgentTarget | undefined {
  return AGENTS.find((a) => a.id === id)
}

/** Get all agent ids */
export function getAgentIds(): string[] {
  return AGENTS.map((a) => a.id)
}

/** Detect which agents are installed on this machine (have a global config dir) */
export async function detectInstalledAgents(): Promise<AgentTarget[]> {
  const installed: AgentTarget[] = []
  for (const agent of AGENTS) {
    const configDir = path.dirname(agent.globalDir)
    const exists = await fs.access(configDir).then(() => true).catch(() => false)
    if (exists) installed.push(agent)
  }
  return installed
}

/** Resolve install directories for given agent ids (global scope) */
export function resolveAgentDirs(agentIds: string[]): string[] {
  return agentIds
    .map((id) => getAgent(id))
    .filter((a): a is AgentTarget => a !== undefined)
    .map((a) => a.globalDir)
}
