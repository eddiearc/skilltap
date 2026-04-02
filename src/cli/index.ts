import { Command } from 'commander'
import { Skilltap } from '../core/client.js'
import { AGENTS, detectInstalledAgents, resolveAgentDirs } from '../core/agents.js'
import { loadConfig, saveConfig } from './config.js'
import { getCliVersion } from './version.js'
import { SkillConflictError } from '../core/types.js'
import type { SkilltapConfigFile, SourceEntry } from '../core/types.js'
import { sourceEntryRepo } from '../core/github.js'
import {
  createMarketplaceCommands,
  createBrowseCommand,
  createSearchCommand,
  createInstallCommand,
  createUninstallCommand,
  createListCommand,
} from './marketplace.js'

const program = new Command()

program
  .name('skilltap')
  .description('Install AI agent skills from GitHub repos')
  .version(await getCliVersion())

/** Resolve agent options into config.agents and config.dirs */
async function resolveAgentOpts(
  config: SkilltapConfigFile,
  opts: { global?: boolean; agent?: string[]; dir?: string[] },
): Promise<void> {
  if (opts.global) {
    const detected = await detectInstalledAgents()
    config.agents = detected.map((a) => a.id)
  } else if (opts.agent?.length) {
    config.agents = opts.agent
  }
  if (opts.dir?.length) {
    config.dirs = opts.dir
  }
}

program
  .command('add <repo>')
  .description('Add a skill source (e.g. anthropics/skills)')
  .option('-t, --token <token>', 'GitHub PAT for this source (private repos)')
  .action(async (repo: string, opts: { token?: string }) => {
    const config = await loadConfig()
    if (config.sources.some((s) => sourceEntryRepo(s) === repo)) {
      console.log(`Source "${repo}" already added`)
      return
    }
    const entry: SourceEntry = opts.token ? { repo, token: opts.token } : repo
    config.sources.push(entry)
    await saveConfig(config)
    console.log(`Added source: ${repo}${opts.token ? ' (with token)' : ''}`)
  })

program
  .command('remove <repo>')
  .description('Remove a skill source')
  .action(async (repo: string) => {
    const config = await loadConfig()
    config.sources = config.sources.filter((s) => sourceEntryRepo(s) !== repo)
    await saveConfig(config)
    console.log(`Removed source: ${repo}`)
  })

program
  .command('update')
  .description('Update all installed skills')
  .option('-g, --global', 'Also update symlinks for all detected agents')
  .option('-a, --agent <ids...>', 'Also update symlinks for specific agent(s)')
  .option('-d, --dir <paths...>', 'Also update symlinks for custom directory(s)')
  .action(async (opts: { global?: boolean; agent?: string[]; dir?: string[] }) => {
    const config = await loadConfig()
    await resolveAgentOpts(config, opts)

    const st = new Skilltap(config)
    const updated = await st.update()
    console.log(`Updated ${updated.length} skill(s)`)
  })

program
  .command('sources')
  .description('List configured sources')
  .action(async () => {
    const config = await loadConfig()
    if (config.sources.length === 0) {
      console.log('No sources configured. Run: skilltap add <owner/repo>')
      return
    }
    for (const source of config.sources) {
      const repo = sourceEntryRepo(source)
      const hasToken = typeof source !== 'string' && !!source.token
      console.log(`  ${repo}${hasToken ? ' (token configured)' : ''}`)
    }
  })

program
  .command('agents')
  .description('List supported agents and detect which are installed')
  .action(async () => {
    const detected = await detectInstalledAgents()
    const detectedIds = new Set(detected.map((a) => a.id))

    for (const agent of AGENTS) {
      const status = detectedIds.has(agent.id) ? '✓' : '·'
      console.log(`  ${status} ${agent.name} (${agent.id}) → ${agent.globalDir}`)
    }

    console.log(`\n  ${detected.length} agent(s) detected`)
  })

// Marketplace commands
createMarketplaceCommands(program)
createBrowseCommand(program)
createSearchCommand(program)
createInstallCommand(program)
createUninstallCommand(program)
createListCommand(program)

program.parse()
