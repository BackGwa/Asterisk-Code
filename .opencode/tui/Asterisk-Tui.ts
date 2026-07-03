import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { TuiDialogStack, TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"

type QualityFilterSettings = {
  enabled: boolean
  emoji: boolean
  repeatedOutput: boolean
  sensitiveInformation: boolean
}

type AsteriskSettings = {
  qualityFilter: QualityFilterSettings
  agentModels: Record<string, string>
}

const AGENTS = [
  "Asterisk-Planner",
  "Asterisk-Builder",
  "Asterisk-Explorer",
  "Asterisk-Research",
  "Asterisk-Validator",
  "Asterisk-Thread",
]

const DEFAULT_SETTINGS: AsteriskSettings = {
  qualityFilter: {
    enabled: true,
    emoji: true,
    repeatedOutput: true,
    sensitiveInformation: true,
  },
  agentModels: {},
}

function settingsPath() {
  return join(homedir(), ".config", "opencode", "asterisk", "settings.json")
}

async function readSettings() {
  try {
    const text = await readFile(settingsPath(), "utf8")
    const parsed = JSON.parse(text) as Partial<AsteriskSettings>

    return {
      qualityFilter: {
        ...DEFAULT_SETTINGS.qualityFilter,
        ...parsed.qualityFilter,
      },
      agentModels: {
        ...DEFAULT_SETTINGS.agentModels,
        ...parsed.agentModels,
      },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

async function writeSettings(settings: AsteriskSettings) {
  await mkdir(join(homedir(), ".config", "opencode", "asterisk"), { recursive: true })
  await writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`)
}

function modelOptions(api: Parameters<TuiPlugin>[0]) {
  return api.state.provider.flatMap((provider) => {
    return Object.values(provider.models).map((model) => {
      const value = `${provider.id}/${model.id}`
      return {
        title: `${provider.name} ${model.name}`,
        value,
        description: value,
      }
    })
  })
}

function openAsteriskSettings(api: Parameters<TuiPlugin>[0], dialog?: TuiDialogStack) {
  const stack = dialog ?? api.ui.dialog
  const refreshMain = async () => {
    const settings = await readSettings()

    stack.replace(() => api.ui.DialogSelect({
      title: "Asterisk Settings",
      options: [
        {
          title: "QualityFilter",
          value: "quality-filter",
          description: settings.qualityFilter.enabled ? "Enabled" : "Disabled",
          onSelect: () => void openQualityFilter(api, stack),
        },
        {
          title: "Agent Models",
          value: "agent-models",
          description: "Select models for Asterisk agents",
          onSelect: () => void openAgentList(api, stack),
        },
      ],
      onSelect: (option) => option.onSelect?.(),
    }))
  }

  void refreshMain()
}

async function openQualityFilter(api: Parameters<TuiPlugin>[0], stack: TuiDialogStack) {
  const settings = await readSettings()

  const toggle = async (key: keyof QualityFilterSettings) => {
    settings.qualityFilter[key] = !settings.qualityFilter[key]
    await writeSettings(settings)
    api.ui.toast({ message: "Asterisk QualityFilter setting saved", variant: "success" })
    await openQualityFilter(api, stack)
  }

  stack.replace(() => api.ui.DialogSelect({
    title: "Asterisk QualityFilter",
    options: [
      {
        title: `QualityFilter ${settings.qualityFilter.enabled ? "On" : "Off"}`,
        value: "enabled",
        description: "Toggle all QualityFilter checks",
        onSelect: () => void toggle("enabled"),
      },
      {
        title: `Emoji ${settings.qualityFilter.emoji ? "On" : "Off"}`,
        value: "emoji",
        description: "Detect emoji output",
        onSelect: () => void toggle("emoji"),
      },
      {
        title: `Repeated Output ${settings.qualityFilter.repeatedOutput ? "On" : "Off"}`,
        value: "repeatedOutput",
        description: "Detect repeated words or symbols",
        onSelect: () => void toggle("repeatedOutput"),
      },
      {
        title: `Sensitive Information ${settings.qualityFilter.sensitiveInformation ? "On" : "Off"}`,
        value: "sensitiveInformation",
        description: "Detect content that may expose sensitive information",
        onSelect: () => void toggle("sensitiveInformation"),
      },
    ],
    onSelect: (option) => option.onSelect?.(),
  }))
}

async function openAgentList(api: Parameters<TuiPlugin>[0], stack: TuiDialogStack) {
  const settings = await readSettings()

  stack.replace(() => api.ui.DialogSelect({
    title: "Asterisk Agent Models",
    options: AGENTS.map((agent) => ({
      title: agent,
      value: agent,
      description: settings.agentModels[agent] ?? "Default model",
      onSelect: () => void openModelList(api, stack, agent),
    })),
    onSelect: (option) => option.onSelect?.(),
  }))
}

async function openModelList(api: Parameters<TuiPlugin>[0], stack: TuiDialogStack, agent: string) {
  const settings = await readSettings()
  const models = modelOptions(api)

  stack.replace(() => api.ui.DialogSelect({
    title: `Model for ${agent}`,
    current: settings.agentModels[agent],
    options: [
      {
        title: "Use default model",
        value: "",
        description: "Remove the Asterisk model override for this agent",
        onSelect: async () => {
          delete settings.agentModels[agent]
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} model reset. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentList(api, stack)
        },
      },
      ...models.map((model) => ({
        ...model,
        onSelect: async () => {
          settings.agentModels[agent] = model.value
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} model saved. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentList(api, stack)
        },
      })),
    ],
    onSelect: (option) => void option.onSelect?.(),
  }))
}

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "asterisk.settings",
        title: "Asterisk Settings",
        category: "Asterisk",
        namespace: "palette",
        slashName: "asterisk",
        description: "Configure Asterisk agent models and QualityFilter",
        run() {
          openAsteriskSettings(api)
        },
      },
    ],
  })
}

const plugin: TuiPluginModule = {
  id: "Asterisk-Tui",
  tui,
}

export default plugin
