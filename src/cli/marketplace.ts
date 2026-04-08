/**
 * Marketplace CLI commands for skilltap
 * 
 * Provides commands for managing marketplaces and browsing skills.
 */

import { Command } from 'commander'
import { listMarketplaces, addMarketplace, removeMarketplace, getMarketplaceManifest } from '../core/marketplace/manager.js'
import { search, installFromMarketplace, uninstallFromMarketplace, listInstalledWithMarketplace, updateSkill, updateAll } from '../core/marketplace/operations.js'
import { parseSkillIdentifier } from '../core/marketplace/types.js'

/** Create marketplace commands */
export function createMarketplaceCommands(program: Command): void {
  const marketplace = program
    .command('marketplace')
    .description('Manage skill marketplaces')

  marketplace
    .command('list')
    .description('List configured marketplaces')
    .action(async () => {
      const marketplaces = await listMarketplaces()
      
      if (marketplaces.length === 0) {
        console.log('No marketplaces configured.')
        console.log('Run: skilltap marketplace add <name> <source>')
        return
      }
      
      console.log(`Configured marketplaces (${marketplaces.length}):\n`)
      for (const mkt of marketplaces) {
        console.log(`  ${mkt.name}`)
        console.log(`    Type: ${mkt.type}`)
        console.log(`    Source: ${mkt.gitUrl ?? mkt.path ?? 'unknown'}`)
        console.log(`    Added: ${new Date(mkt.addedAt).toLocaleDateString()}`)
        console.log('')
      }
    })

  marketplace
    .command('add <name> <source>')
    .description('Add a marketplace source (git URL or local path)')
    .option('-b, --branch <branch>', 'Branch to use')
    .option('-s, --scan-path <path>', 'Custom path within repo to scan for skills (e.g. .agents/skills)')
    .action(async (name: string, source: string, opts: { branch?: string; scanPath?: string }) => {
      try {
        if (source.startsWith('/') || source.startsWith('.') || source.match(/^[A-Za-z]:/)) {
          // Local path
          await addMarketplace(name, 'local', { path: source })
          console.log(`Added marketplace "${name}" from local path: ${source}`)
        } else if (
          source.startsWith('http://') || source.startsWith('https://') ||
          source.startsWith('git@') || source.startsWith('ssh://') ||
          source.startsWith('git://') || source.endsWith('.git')
        ) {
          // Git URL (HTTPS, SSH, git protocol)
          await addMarketplace(name, 'git', { gitUrl: source, branch: opts.branch, scanPath: opts.scanPath })
          console.log(`Added marketplace "${name}" from git: ${source}`)
        } else if (source.includes('/') && source.split('/').length === 2 && !source.includes(' ')) {
          // Shorthand: owner/repo -> https://github.com/owner/repo.git
          const gitUrl = `https://github.com/${source}.git`
          console.log(`Cloning ${source}...`)
          await addMarketplace(name, 'git', { gitUrl, branch: opts.branch, scanPath: opts.scanPath })
          console.log(`Added marketplace "${name}" from GitHub: ${source}`)
        } else {
          console.error(`Invalid source format: ${source}`)
          console.error('Supported formats:')
          console.error('  owner/repo                     - GitHub shorthand')
          console.error('  https://github.com/owner/repo  - HTTPS git URL')
          console.error('  https://gitlab.com/owner/repo  - Any git hosting platform')
          console.error('  git@host:owner/repo.git        - SSH git URL')
          console.error('  /path/to/dir                   - Local directory')
          process.exit(1)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`Failed to add marketplace: ${msg}`)
        process.exit(1)
      }
    })

  marketplace
    .command('remove <name>')
    .description('Remove a marketplace')
    .action(async (name: string) => {
      try {
        await removeMarketplace(name)
        console.log(`Removed marketplace "${name}"`)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`Failed to remove marketplace: ${msg}`)
        process.exit(1)
      }
    })

  marketplace
    .command('update [skill]')
    .description('Update installed skills to latest version (all or specific skill)')
    .option('-m, --marketplace <name>', 'Update from specific marketplace')
    .action(async (skill?: string, opts?: { marketplace?: string }) => {
      try {
        if (skill) {
          const result = await updateSkill(skill, opts?.marketplace)
          if (!result.success) {
            console.error(`Failed to update: ${result.message}`)
            process.exit(1)
          }
          console.log(`✓ ${result.message}`)
        } else {
          console.log('Updating all installed skills...')
          const results = await updateAll()
          const succeeded = results.filter((r) => r.success)
          const failed = results.filter((r) => !r.success)
          console.log(`Updated ${succeeded.length} skill(s)`)
          for (const r of failed) {
            console.warn(`  ⚠ ${r.message}`)
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`Failed to update: ${msg}`)
        process.exit(1)
      }
    })

  marketplace
    .command('refresh [name]')
    .description('Refresh marketplace cache (all or specific marketplace)')
    .action(async (name?: string) => {
      try {
        if (name) {
          console.log(`Refreshing marketplace "${name}"...`)
          const manifest = await getMarketplaceManifest(name, true)
          if (manifest) {
            console.log(`Found ${manifest.skills.length} skills in "${name}"`)
          } else {
            console.log(`Marketplace "${name}" not found`)
          }
        } else {
          console.log('Refreshing all marketplaces...')
          const marketplaces = await listMarketplaces()
          for (const mkt of marketplaces) {
            const manifest = await getMarketplaceManifest(mkt.name, true)
            console.log(`  ${mkt.name}: ${manifest?.skills.length ?? 0} skills`)
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`Failed to refresh marketplace: ${msg}`)
        process.exit(1)
      }
    })
}

/** Create browse command for interactive marketplace browsing */
export function createBrowseCommand(program: Command): void {
  program
    .command('browse [marketplace]')
    .description('Browse skills in marketplace (interactive selection)')
    .option('-m, --marketplace <name>', 'Specific marketplace to browse')
    .action(async (marketplace?: string, opts?: { marketplace?: string }) => {
      const targetMarketplace = marketplace ?? opts?.marketplace
      
      if (targetMarketplace) {
        await browseMarketplace(targetMarketplace)
      } else {
        await browseAllMarketplaces()
      }
    })
}

/** Browse a specific marketplace */
async function browseMarketplace(name: string): Promise<void> {
  const manifest = await getMarketplaceManifest(name)
  
  if (!manifest) {
    console.error(`Marketplace "${name}" not found`)
    process.exit(1)
  }
  
  console.log(`\n=== Marketplace: ${name} ===`)
  console.log(`Skills found: ${manifest.skills.length}\n`)
  
  if (manifest.skills.length === 0) {
    console.log('No skills found. Try refreshing the marketplace:')
    console.log(`  skilltap marketplace refresh ${name}`)
    return
  }
  
  // List skills
  for (const skill of manifest.skills) {
    console.log(`  ${skill.name}`)
    console.log(`    ${skill.description || 'No description'}`)
    if (skill.author) console.log(`    Author: ${skill.author}`)
    if (skill.version) console.log(`    Version: ${skill.version}`)
    console.log('')
  }
  
  console.log('Install a skill:')
  console.log(`  skilltap install <skill-name> --marketplace ${name}`)
}

/** Browse all marketplaces */
async function browseAllMarketplaces(): Promise<void> {
  const marketplaces = await listMarketplaces()
  
  if (marketplaces.length === 0) {
    console.log('No marketplaces configured.')
    console.log('\nAdd a marketplace first:')
    console.log('  skilltap marketplace add myskills https://github.com/owner/skills-repo')
    console.log('  skilltap marketplace add local /path/to/skills')
    return
  }
  
  console.log(`\n=== Available Marketplaces (${marketplaces.length}) ===\n`)
  
  for (const mkt of marketplaces) {
    const manifest = await getMarketplaceManifest(mkt.name)
    const skillCount = manifest?.skills.length ?? 0
    console.log(`  ${mkt.name} (${skillCount} skills)`)
    console.log(`    Source: ${mkt.gitUrl ?? mkt.path ?? 'unknown'}`)
    console.log('')
  }
  
  console.log('Browse a specific marketplace:')
  console.log('  skilltap browse <marketplace-name>')
  console.log('\nOr install a skill directly:')
  console.log('  skilltap install <skill-name>')
}

/** Create search command that uses marketplace */
export function createSearchCommand(program: Command): void {
  program
    .command('search <keyword>')
    .description('Search for skills across all marketplaces')
    .option('-m, --marketplace <name>', 'Search in specific marketplace')
    .action(async (keyword: string, opts: { marketplace?: string }) => {
      const results = await search(keyword, opts.marketplace)
      
      if (results.length === 0) {
        console.log(`No skills found matching "${keyword}"`)
        if (!opts.marketplace) {
          console.log('\nTip: Add a marketplace first:')
          console.log('  skilltap marketplace add myskills https://github.com/owner/skills-repo')
        }
        return
      }
      
      // Group by marketplace
      const byMarketplace = new Map<string, typeof results>()
      for (const result of results) {
        const existing = byMarketplace.get(result.marketplace) ?? []
        existing.push(result)
        byMarketplace.set(result.marketplace, existing)
      }
      
      console.log(`\nFound ${results.length} skill(s) matching "${keyword}":\n`)
      
      for (const [mktName, skills] of byMarketplace) {
        console.log(`--- ${mktName} ---`)
        for (const { skill } of skills) {
          console.log(`  ${skill.name}`)
          console.log(`    ${skill.description || 'No description'}`)
          console.log('')
        }
      }
      
      console.log('Install a skill:')
      console.log('  skilltap install <skill-name>')
    })
}

/** Create install command that uses marketplace */
export function createInstallCommand(program: Command): void {
  program
    .command('install <name>')
    .description('Install a skill')
    .option('-m, --marketplace <name>', 'Install from specific marketplace')
    .option('-g, --global', 'Symlink to all detected agents')
    .option('-a, --agent <ids...>', 'Symlink to specific agent(s)')
    .option('-d, --dir <paths...>', 'Symlink to custom directory(s)')
    .action(async (name: string, opts: { marketplace?: string; global?: boolean; agent?: string[]; dir?: string[] }) => {
      // Check if this is a marketplace reference (name@marketplace)
      const { name: skillName, marketplace: mktFromName } = parseSkillIdentifier(name)
      const targetMarketplace = opts.marketplace ?? mktFromName
      
      if (targetMarketplace) {
        // Install from marketplace
        const result = await installFromMarketplace(
          targetMarketplace ? `${skillName}@${targetMarketplace}` : skillName
        )
        
        if (!result.success) {
          console.error(`Failed to install: ${result.message}`)
          process.exit(1)
        }
        
        console.log(`✓ ${result.message}`)
        if (result.path) {
          console.log(`  Installed to: ${result.path}`)
        }
      } else {
        // Try marketplace search first
        console.log(`Searching for "${skillName}" in marketplaces...`)
        const results = await search(skillName)
        
        if (results.length === 0) {
          console.error(`Skill "${skillName}" not found in any marketplace`)
          console.error('\nTip: Add a marketplace first:')
          console.error('  skilltap marketplace add myskills https://github.com/owner/skills-repo')
          process.exit(1)
        }
        
        if (results.length > 1) {
          console.error(`Multiple skills found for "${skillName}":`)
          for (const { skill, marketplace } of results) {
            console.error(`  - ${skill.name}@${marketplace}`)
          }
          console.error(`\nSpecify which marketplace to use:`)
          console.error(`  skilltap install ${skillName} --marketplace <name>`)
          process.exit(1)
        }
        
        const { skill, marketplace } = results[0]
        const result = await installFromMarketplace(`${skill.name}@${marketplace}`)
        
        if (!result.success) {
          console.error(`Failed to install: ${result.message}`)
          process.exit(1)
        }
        
        console.log(`✓ ${result.message}`)
        if (result.path) {
          console.log(`  Installed to: ${result.path}`)
        }
      }
    })
}

/** Create uninstall command that uses marketplace */
export function createUninstallCommand(program: Command): void {
  program
    .command('uninstall <name>')
    .description('Uninstall a skill')
    .option('-m, --marketplace <name>', 'Uninstall from specific marketplace')
    .action(async (name: string, opts: { marketplace?: string }) => {
      const { name: skillName, marketplace: mktFromName } = parseSkillIdentifier(name)
      const targetMarketplace = opts.marketplace ?? mktFromName
      
      const result = await uninstallFromMarketplace(skillName, targetMarketplace ?? undefined)
      
      if (!result.success) {
        console.error(`Failed to uninstall: ${result.message}`)
        process.exit(1)
      }
      
      console.log(`✓ ${result.message}`)
    })
}

/** Create list command that shows marketplace info */
export function createListCommand(program: Command): void {
  program
    .command('list')
    .description('List installed skills')
    .option('-v, --verbose', 'Show verbose output with marketplace info')
    .action(async (opts: { verbose?: boolean }) => {
      const installed = await listInstalledWithMarketplace()
      
      if (installed.length === 0) {
        console.log('No skills installed')
        console.log('\nBrowse available skills:')
        console.log('  skilltap browse')
        return
      }
      
      console.log(`\nInstalled skills (${installed.length}):\n`)
      
      if (opts.verbose) {
        for (const skill of installed) {
          console.log(`  ${skill.name}@${skill.marketplace}`)
          console.log(`    Installed: ${new Date(skill.installedAt).toLocaleDateString()}`)
          if (skill.version) console.log(`    Version: ${skill.version}`)
          console.log(`    Path: ${skill.installPath}`)
          console.log('')
        }
      } else {
        for (const skill of installed) {
          console.log(`  ${skill.name}@${skill.marketplace}`)
        }
      }
    })
}
