import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Config, Plugin } from "@opencode-ai/plugin"

type AsteriskSettings = {
  qualityFilter?: {
    enabled?: boolean
    emoji?: boolean
    repeatedOutput?: boolean
    sensitiveInformation?: boolean
  }
  agentModels?: Record<string, string>
  agentModelVariants?: Record<string, string>
}

function settingsPath() {
  return join(homedir(), ".config", "opencode", "asterisk", "settings.json")
}

async function readSettings() {
  try {
    const text = await readFile(settingsPath(), "utf8")
    return JSON.parse(text) as AsteriskSettings
  } catch {
    return {}
  }
}

function applyAgentModels(config: Config, settings: AsteriskSettings) {
  const agentNames = new Set([
    ...Object.keys(settings.agentModels ?? {}),
    ...Object.keys(settings.agentModelVariants ?? {}),
  ])

  if (agentNames.size === 0) return

  config.agent ??= {}

  for (const agentName of agentNames) {
    const model = settings.agentModels?.[agentName]
    const modelVariant = settings.agentModelVariants?.[agentName]
    config.agent[agentName] ??= {}

    if (model) {
      config.agent[agentName].model = model
    }

    if (modelVariant) {
      config.agent[agentName].variant = modelVariant
    }
  }
}

export default (async () => {
  const settings = await readSettings()

  return {
    config: async (config) => {
      applyAgentModels(config, settings)
    },
  }
}) satisfies Plugin
