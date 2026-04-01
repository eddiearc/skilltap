import { Command } from 'commander'
import { Skilltap } from '../core/client.js'
import { loadConfig, saveConfig } from './config.js'

const program = new Command()

program
  .name('skilltap')
  .description('Install AI agent skills from GitHub repos')
  .version('0.1.0')

program
  .command('add <repo>')
  .description('Add a skill source (e.g. anthropics/skills)')
  .action(async (repo: string) => {
    const config = await loadConfig()
    if (config.sources.includes(repo)) {
      console.log(`Source "${repo}" already added`)
      return
    }
    config.sources.push(repo)
    await saveConfig(config)
    console.log(`Added source: ${repo}`)
  })

program
  .command('remove <repo>')
  .description('Remove a skill source')
  .action(async (repo: string) => {
    const config = await loadConfig()
    config.sources = config.sources.filter((s) => s !== repo)
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
  .action(async (name: string) => {
    const config = await loadConfig()
    const st = new Skilltap(config)
    const skill = await st.install(name)
    console.log(`Installed: ${skill.name} → ${skill.path}`)
  })

program
  .command('uninstall <name>')
  .description('Uninstall a skill')
  .action(async (name: string) => {
    const config = await loadConfig()
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
  .action(async () => {
    const config = await loadConfig()
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
      console.log(`  ${source}`)
    }
  })

program.parse()
