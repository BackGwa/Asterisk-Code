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
  agentModelVariants: Record<string, string>
}

type ModelOption = {
  title: string
  value: string
  description: string
  supportsReasoning: boolean
  reasoningVariants: ReasoningVariantOption[]
}

type ModelVariantConfig = {
  [key: string]: unknown
}

type ReasoningVariantOption = {
  title: string
  value: string
  description: string
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
  agentModelVariants: {},
}

const REASONING_VARIANT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
}

const REASONING_VARIANT_DESCRIPTIONS: Record<string, string> = {
  none: "No reasoning",
  minimal: "Minimal reasoning effort",
  low: "Low reasoning effort",
  medium: "Medium reasoning effort",
  high: "High reasoning effort",
  xhigh: "Extra high reasoning effort",
  max: "Maximum reasoning budget",
}

const KNOWN_REASONING_VARIANTS = new Set(Object.keys(REASONING_VARIANT_LABELS))

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
      agentModelVariants: {
        ...DEFAULT_SETTINGS.agentModelVariants,
        ...parsed.agentModelVariants,
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

function hasReasoningConfiguration(variantName: string, variantConfig: ModelVariantConfig) {
  if (KNOWN_REASONING_VARIANTS.has(variantName)) return true
  if ("reasoningEffort" in variantConfig) return true
  if ("reasoningSummary" in variantConfig) return true
  if ("thinking" in variantConfig) return true
  if ("thinkingConfig" in variantConfig) return true
  if ("thinkingBudget" in variantConfig) return true
  return false
}

function reasoningVariantTitle(variantName: string) {
  return REASONING_VARIANT_LABELS[variantName] ?? variantName
}

function reasoningVariantDescription(variantName: string, variantConfig: ModelVariantConfig) {
  const reasoningEffort = variantConfig.reasoningEffort
  if (typeof reasoningEffort === "string") {
    return `Uses ${reasoningEffort} reasoning effort`
  }

  return REASONING_VARIANT_DESCRIPTIONS[variantName] ?? "Model-provided reasoning variant"
}

function reasoningVariantOptions(variants: Record<string, ModelVariantConfig> | undefined): ReasoningVariantOption[] {
  if (!variants) return []

  return Object.entries(variants)
    .filter(([variantName, variantConfig]) => {
      return variantConfig.disabled !== true && hasReasoningConfiguration(variantName, variantConfig)
    })
    .map(([variantName, variantConfig]) => ({
      title: reasoningVariantTitle(variantName),
      value: variantName,
      description: reasoningVariantDescription(variantName, variantConfig),
    }))
}

function modelOptions(api: Parameters<TuiPlugin>[0]): ModelOption[] {
  return api.state.provider.flatMap((provider) => {
    return Object.values(provider.models).map((model) => {
      const value = `${provider.id}/${model.id}`
      const reasoningVariants = reasoningVariantOptions(model.variants)
      return {
        title: `${provider.name} ${model.name}`,
        value,
        description: value,
        supportsReasoning: model.capabilities.reasoning,
        reasoningVariants,
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
  const modelVariant = settings.agentModelVariants[agent]

  if (!model) return "Default model"
  if (!modelVariant) return model
  return `${model}, variant ${modelVariant}`
}

function reasoningEffortDescription(settings: AsteriskSettings, agent: string, model: ModelOption | undefined) {
  const modelVariant = settings.agentModelVariants[agent]

  if (!settings.agentModels[agent]) return "Select a reasoning-capable model first"
  if (!model?.supportsReasoning) return "Selected model does not support reasoning"
  if (model.reasoningVariants.length === 0) return "Selected model does not expose reasoning options"
  if (!modelVariant) return "Default reasoning option"

  const selectedVariant = model.reasoningVariants.find((variant) => variant.value === modelVariant)
  return selectedVariant?.title ?? `Unsupported reasoning option: ${modelVariant}`
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
  const canSetReasoningEffort = Boolean(selectedModel?.supportsReasoning && selectedModel.reasoningVariants.length > 0)

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
          delete settings.agentModelVariants[agent]
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} model reset. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentModelSettings(api, stack, agent)
        },
      },
      ...models.map((model) => ({
        ...model,
        onSelect: async () => {
          settings.agentModels[agent] = model.value
          if (!model.reasoningVariants.some((variant) => variant.value === settings.agentModelVariants[agent])) {
            delete settings.agentModelVariants[agent]
          }
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} model saved. Restart opencode to apply agent model changes.`, variant: "success" })
          if (model.supportsReasoning && model.reasoningVariants.length > 0) {
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

  if (!selectedModel?.supportsReasoning || selectedModel.reasoningVariants.length === 0) {
    await openAgentModelSettings(api, stack, agent)
    return
  }

  stack.replace(() => api.ui.DialogSelect({
    title: `Reasoning Effort for ${agent}`,
    current: settings.agentModelVariants[agent] ?? "",
    options: [
      {
        title: "Use default reasoning effort",
        value: "",
        description: "Remove the Asterisk reasoning effort override for this agent",
        onSelect: async () => {
          delete settings.agentModelVariants[agent]
          await writeSettings(settings)
          api.ui.toast({ message: `${agent} reasoning effort reset. Restart opencode to apply agent model changes.`, variant: "success" })
          await openAgentModelSettings(api, stack, agent)
        },
      },
      ...selectedModel.reasoningVariants.map((reasoningVariant) => ({
        ...reasoningVariant,
        onSelect: async () => {
          settings.agentModelVariants[agent] = reasoningVariant.value
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
  id: "Asterisk-Code",
  tui,
}

export default plugin
