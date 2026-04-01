import { Command } from 'commander'
import { Skilltap } from '../core/client.js'
import { AGENTS, detectInstalledAgents, resolveAgentDirs } from '../core/agents.js'
import { loadConfig, saveConfig } from './config.js'
import { SkillConflictError } from '../core/types.js'
import type { SkilltapConfigFile, SourceEntry } from '../core/types.js'
import { sourceEntryRepo } from '../core/github.js'

const program = new Command()

program
  .name('skilltap')
  .description('Install AI agent skills from GitHub repos')
  .version('0.1.0')

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
  .command('search <keyword>')
  .description('Search for skills across all sources')
  .action(async (keyword: string) => {
    const config = await loadConfig()
    const st = new Skilltap(config)
    const results = await st.search(keyword)

    if (results.length === 0) {
      console.log('No skills found')
      return
    }

    for (const skill of results) {
      const source = `${skill.source.owner}/${skill.source.repo}`
      console.log(`  ${skill.name} — ${skill.meta.description} (${source})`)
    }
  })

program
  .command('install <name>')
  .description('Install a skill')
  .option('-g, --global', 'Symlink to all detected agents')
  .option('-a, --agent <ids...>', 'Symlink to specific agent(s) (e.g. claude-code cursor)')
  .option('-d, --dir <paths...>', 'Symlink to custom directory(s)')
  .option('--from <source>', 'Install from a specific source (e.g. anthropics/skills)')
  .action(async (name: string, opts: { global?: boolean; agent?: string[]; dir?: string[]; from?: string }) => {
    const config = await loadConfig()
    await resolveAgentOpts(config, opts)

    const st = new Skilltap(config)

    try {
      const skill = await st.install(name, { from: opts.from })
      console.log(`Installed: ${skill.name} → ${skill.path}`)

      // Show symlink results
      const allDirs: string[] = []
      if (config.agents?.length) allDirs.push(...resolveAgentDirs(config.agents))
      if (config.dirs?.length) allDirs.push(...config.dirs)
      const linked = allDirs.filter((d) => d !== config.installDir)

      if (linked.length > 0) {
        console.log(`Symlinked to ${linked.length} target(s):`)
        for (const dir of linked) {
          console.log(`  → ${dir}/${name}`)
        }
      } else {
        console.log('')
        console.log('Tip: use -g to symlink to all agents, or -a to pick specific ones:')
        console.log('  skilltap install <name> -g')
        console.log('  skilltap install <name> -a claude-code cursor')
      }
    } catch (err) {
      if (err instanceof SkillConflictError) {
        console.error(`Multiple skills found for "${name}":`)
        for (const source of err.sources) {
          console.error(`  - ${source}`)
        }
        console.error(`\nUse --from to specify: skilltap install ${name} --from <owner/repo>`)
        process.exit(1)
      }
      throw err
    }
  })

program
  .command('uninstall <name>')
  .description('Uninstall a skill')
  .option('-g, --global', 'Remove symlinks from all detected agents')
  .option('-a, --agent <ids...>', 'Remove symlinks from specific agent(s)')
  .option('-d, --dir <paths...>', 'Remove symlinks from custom directory(s)')
  .action(async (name: string, opts: { global?: boolean; agent?: string[]; dir?: string[] }) => {
    const config = await loadConfig()
    await resolveAgentOpts(config, opts)

    const st = new Skilltap(config)
    await st.uninstall(name)
    console.log(`Uninstalled: ${name}`)
  })

program
  .command('list')
  .description('List installed skills')
  .action(async () => {
    const config = await loadConfig()
    const st = new Skilltap(config)
    const skills = await st.list()

    if (skills.length === 0) {
      console.log('No skills installed')
      return
    }

    for (const skill of skills) {
      console.log(`  ${skill.name} — ${skill.meta.description}`)
    }
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

program.parse()
