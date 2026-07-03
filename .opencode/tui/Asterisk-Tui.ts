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

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

type AsteriskSettings = {
  qualityFilter: QualityFilterSettings
  agentModels: Record<string, string>
  agentReasoningEfforts: Record<string, ReasoningEffort>
}

type ModelOption = {
  title: string
  value: string
  description: string
  supportsReasoning: boolean
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
  agentReasoningEfforts: {},
}

const REASONING_EFFORT_OPTIONS: Array<{
  title: string
  value: ReasoningEffort
  description: string
}> = [
  {
    title: "None",
    value: "none",
    description: "No reasoning effort when supported",
  },
  {
    title: "Minimal",
    value: "minimal",
    description: "Minimal reasoning effort",
  },
  {
    title: "Low",
    value: "low",
    description: "Low reasoning effort",
  },
  {
    title: "Medium",
    value: "medium",
    description: "Medium reasoning effort",
  },
  {
    title: "High",
    value: "high",
    description: "High reasoning effort",
  },
  {
    title: "Extra High",
    value: "xhigh",
    description: "Extra high reasoning effort",
  },
  {
    title: "Max",
    value: "max",
    description: "Maximum reasoning budget when supported",
  },
]

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
      agentReasoningEfforts: {
        ...DEFAULT_SETTINGS.agentReasoningEfforts,
        ...parsed.agentReasoningEfforts,
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

function modelOptions(api: Parameters<TuiPlugin>[0]): ModelOption[] {
  return api.state.provider.flatMap((provider) => {
    return Object.values(provider.models).map((model) => {
      const value = `${provider.id}/${model.id}`
      return {
        title: `${provider.name} ${model.name}`,
        value,
        description: value,
        supportsReasoning: model.capabilities.reasoning,
      }
    })
  })
}

function findModelOption(api: Parameters<TuiPlugin>[0], modelValue: string | undefined) {
  if (!modelValue) return undefined
  return modelOptions(api).find((model) => model.value === modelValue)
}

function agentModelDescription(settings: AsteriskSettings, agent: string) {
  const model = settings.agentModels[agent]
  const reasoningEffort = settings.agentReasoningEfforts[agent]

  if (!model) return "Default model"
  if (!reasoningEffort) return model
  return `${model}, reasoning ${reasoningEffort}`
}

function reasoningEffortDescription(settings: AsteriskSettings, agent: string, model: ModelOption | undefined) {
  if (!settings.agentModels[agent]) return "Select a reasoning-capable model first"
  if (!model?.supportsReasoning) return "Selected model does not support reasoning effort"
  return settings.agentReasoningEfforts[agent] ?? "Default reasoning effort"
}

function openAsteriskSettings(api: Parameters<TuiPlugin>[0], dialog?: TuiDialogStack) {
  const stack = dialog ?? api.ui.dialog
  const refreshMain = async () => {
    const settings = await readSettings()

    stack.replace(() => api.ui.DialogSelect({
      title: "Asterisk Settings",
      options: [
        {
          title: "Agent Models",
          value: "agent-models",
          description: "Select models for Asterisk agents",
          onSelect: () => void openAgentList(api, stack),
        },
        {
          title: "Quality Filter",
          value: "quality-filter",
          description: settings.qualityFilter.enabled ? "Enabled" : "Disabled",
          onSelect: () => void openQualityFilter(api, stack),
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
    api.ui.toast({ message: "Asterisk Quality Filter setting saved", variant: "success" })
    await openQualityFilter(api, stack)
  }

  stack.replace(() => api.ui.DialogSelect({
    title: "Asterisk Quality Filter",
    options: [
      {
        title: `Quality Filter ${settings.qualityFilter.enabled ? "On" : "Off"}`,
        value: "enabled",
        description: "Toggle all Quality Filter checks",
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
      description: agentModelDescription(settings, agent),
      onSelect: () => void openAgentModelSettings(api, stack, agent),
    })),
    onSelect: (option) => option.onSelect?.(),
  }))
}

async function openAgentModelSettings(api: Parameters<TuiPlugin>[0], stack: TuiDialogStack, agent: string) {
  const settings = await readSettings()
  const selectedModel = findModelOption(api, settings.agentModels[agent])
  const canSetReasoningEffort = Boolean(selectedModel?.supportsReasoning)

  stack.replace(() => api.ui.DialogSelect({
    title: `Agent Model for ${agent}`,
    options: [
      {
        title: "Model",
        value: "model",
        description: agentModelDescription(settings, agent),
        onSelect: () => void openModelList(api, stack, agent),
      },
      {
        title: "Reasoning Effort",
        value: "reasoning-effort",
        description: reasoningEffortDescription(settings, agent, selectedModel),
        disabled: !canSetReasoningEffort,
        onSelect: canSetReasoningEffort ? () => void openReasoningEffortList(api, stack, agent) : undefined,
      },
    ],
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
          delete settings.agentReasoningEfforts[agent]
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} model reset. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentModelSettings(api, stack, agent)
        },
      },
      ...models.map((model) => ({
        ...model,
        onSelect: async () => {
          settings.agentModels[agent] = model.value
          if (!model.supportsReasoning) delete settings.agentReasoningEfforts[agent]
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} model saved. Restart opencode to apply agent model changes.`, variant: "success" })
          if (model.supportsReasoning) {
            await openReasoningEffortList(api, stack, agent)
          } else {
            await openAgentModelSettings(api, stack, agent)
          }
        },
      })),
    ],
    onSelect: (option) => void option.onSelect?.(),
  }))
}

async function openReasoningEffortList(api: Parameters<TuiPlugin>[0], stack: TuiDialogStack, agent: string) {
  const settings = await readSettings()
  const selectedModel = findModelOption(api, settings.agentModels[agent])

  if (!selectedModel?.supportsReasoning) {
    await openAgentModelSettings(api, stack, agent)
    return
  }

  stack.replace(() => api.ui.DialogSelect({
    title: `Reasoning Effort for ${agent}`,
    current: settings.agentReasoningEfforts[agent] ?? "",
    options: [
      {
        title: "Use default reasoning effort",
        value: "",
        description: "Remove the Asterisk reasoning effort override for this agent",
        onSelect: async () => {
          delete settings.agentReasoningEfforts[agent]
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} reasoning effort reset. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentModelSettings(api, stack, agent)
        },
      },
      ...REASONING_EFFORT_OPTIONS.map((reasoningEffort) => ({
        ...reasoningEffort,
        onSelect: async () => {
          settings.agentReasoningEfforts[agent] = reasoningEffort.value
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} reasoning effort saved. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentModelSettings(api, stack, agent)
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
        description: "Configure Asterisk agent models and Quality Filter",
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
