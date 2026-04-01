import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import type { SkilltapConfigFile } from '../core/types.js'

const CONFIG_DIR = path.join(os.homedir(), '.skilltap')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: SkilltapConfigFile = {
  sources: [],
  installDir: path.join(os.homedir(), '.claude', 'skills'),
}

export async function loadConfig(): Promise<SkilltapConfigFile> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(config: SkilltapConfigFile): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}
