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
  agentReasoningEfforts?: Record<string, string>
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
  if (!settings.agentModels) return

  config.agent ??= {}

  for (const [agentName, model] of Object.entries(settings.agentModels)) {
    if (!model) continue
    config.agent[agentName] ??= {}
    config.agent[agentName].model = model

    const reasoningEffort = settings.agentReasoningEfforts?.[agentName]
    if (reasoningEffort) {
      config.agent[agentName].reasoningEffort = reasoningEffort
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
