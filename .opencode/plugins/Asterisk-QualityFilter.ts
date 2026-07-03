import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode-ai/plugin"
import type { Part } from "@opencode-ai/sdk"

type Finding = {
  label: string
  detail: string
}

type QualityFilterSettings = {
  enabled?: boolean
  emoji?: boolean
  repeatedOutput?: boolean
  sensitiveInformation?: boolean
}

type AsteriskSettings = {
  qualityFilter?: QualityFilterSettings
}

const REPEATED_OUTPUT = /(?:([\p{L}\p{N}_-]{2,}|\S)(?:\s+\1){7,}|(\S)\2{7,})/u
const EMOJI = /[\p{Extended_Pictographic}]/u
const SECRET_HINT = /(api[_-]?key|access[_-]?token|secret|password|passwd|private[_-]?key|bearer\s+[a-z0-9._-]+)/i

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

function resolveOptions(settings: AsteriskSettings) {
  const qualityFilter = settings.qualityFilter ?? {}

  return {
    enabled: qualityFilter.enabled ?? true,
    emoji: qualityFilter.emoji ?? true,
    repeatedOutput: qualityFilter.repeatedOutput ?? true,
    sensitiveInformation: qualityFilter.sensitiveInformation ?? true,
  }
}

function collectFindings(text: string, options: ReturnType<typeof resolveOptions>) {
  const findings: Finding[] = []

  if (!options.enabled) return findings

  if (options.emoji && EMOJI.test(text)) {
    findings.push({
      label: "Emoji detected in output",
      detail: "This environment discourages emoji output.",
    })
  }

  if (options.repeatedOutput && REPEATED_OUTPUT.test(text)) {
    findings.push({
      label: "Repeated output detected",
      detail: "Repeated content was detected in the output. In this environment, such elements can reduce clarity or be treated as an output error.",
    })
  }

  if (options.sensitiveInformation && SECRET_HINT.test(text)) {
    findings.push({
      label: "Sensitive information detected",
      detail: "Content that appears to be sensitive information was detected. Review it to prevent sensitive information from being exposed externally, and check for security issues.",
    })
  }

  return findings
}

function buildWarning(findings: Finding[]) {
  const lines = findings.map((finding) => `- ${finding.label}: ${finding.detail}`)
  return [
    "Asterisk-QualityFilter warning",
    "Review these issues before continuing.",
    ...lines,
  ].join("\n")
}

function createTextPart(base: Part | undefined, text: string): Part {
  return {
    id: `prt_asterisk_quality_filter_${Date.now()}`,
    sessionID: base?.sessionID ?? "",
    messageID: base?.messageID ?? "",
    type: "text",
    text,
    synthetic: true,
  }
}

function partText(part: Part) {
  if (part.type === "text" || part.type === "reasoning") return part.text
  if (part.type === "subtask") return `${part.description}\n${part.prompt}`
  if (part.type === "file") return part.url
  if (part.type === "tool") return JSON.stringify(part, null, 2)
  return ""
}

export default (async () => {
  return {
    "chat.message": async (_input, output) => {
      const resolvedOptions = resolveOptions(await readSettings())
      const text = output.parts.map(partText).join("\n")
      const findings = collectFindings(text, resolvedOptions)
      if (findings.length === 0) return

      output.parts.push(createTextPart(output.parts[0], buildWarning(findings)))
    },

    "tool.execute.after": async (_input, output) => {
      const resolvedOptions = resolveOptions(await readSettings())
      const text = [output.title, output.output, JSON.stringify(output.metadata ?? {})].join("\n")
      const findings = collectFindings(text, resolvedOptions)
      if (findings.length === 0) return

      output.output = `${buildWarning(findings)}\n\n${output.output}`
    },
  }
}) satisfies Plugin
