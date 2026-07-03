import { type Part } from "@opencode-ai/sdk"
import { type Plugin, tool } from "@opencode-ai/plugin"
import {
  activateAutoTask,
  autoTaskSystemInstruction,
  deactivateAutoTask,
  getAutoTaskState,
} from "../lib/Asterisk-AutoTaskState"

const AUTO_TASK_COMMAND = "autotask"
const AUTO_TASK_ACTIVATION_PERMISSION = "asterisk_auto_task_activate"

type CommandOutput = {
  parts?: Part[]
}

type SystemOutput = {
  system?: string[]
}

function normalizeCommandName(command: unknown) {
  if (typeof command !== "string") return ""
  return command.startsWith("/") ? command.slice(1) : command
}

function normalizeCommandArguments(args: unknown) {
  return typeof args === "string" ? args.trim() : ""
}

function mutableParts(output: CommandOutput) {
  if (!Array.isArray(output.parts)) {
    output.parts = []
  }
  return output.parts
}

function mutableSystem(output: SystemOutput) {
  if (!Array.isArray(output.system)) {
    output.system = []
  }
  return output.system
}

function createTextPart(sessionID: string, text: string): Part {
  return {
    id: `asterisk-auto-task-${Date.now()}`,
    sessionID,
    messageID: "",
    type: "text",
    text,
    synthetic: true,
  }
}

function prependTextPart(output: CommandOutput, sessionID: string, text: string) {
  mutableParts(output).unshift(createTextPart(sessionID, text))
}

function commandActivationText(requirements: string) {
  return [
    "Auto Task Mode was activated by `/autotask`.",
    "Proceed according to the active agent's Auto Task Mode standards.",
    "Requirements:",
    requirements,
  ].join("\n")
}

function activationOutput(scope: string) {
  return [
    "Auto Task Mode is active for this session.",
    "Continue the requested work without waiting for direct user questions or approvals.",
    scope ? `Scope: ${scope}` : undefined,
  ].filter(Boolean).join("\n")
}

export default (async () => {
  return {
    tool: {
      asterisk_auto_task: tool({
        description: "Activate, inspect, or stop Auto Task Mode for the current session.",
        args: {
          action: tool.schema.enum(["activate", "status", "deactivate"]).describe("Auto Task action to perform."),
          scope: tool.schema.string().optional().describe("User requirements or scope for Auto Task Mode when activating."),
        },
        async execute(args, context) {
          if (args.action === "status") {
            const state = getAutoTaskState(context.sessionID)
            return {
              title: state ? "Auto Task active" : "Auto Task inactive",
              output: state ? activationOutput(state.scope) : "Auto Task Mode is not active for this session.",
              metadata: {
                autoTask: state ?? { active: false },
              },
            }
          }

          if (args.action === "deactivate") {
            const removed = deactivateAutoTask(context.sessionID)
            return {
              title: removed ? "Auto Task stopped" : "Auto Task already inactive",
              output: removed ? "Auto Task Mode has been stopped for this session." : "Auto Task Mode was not active for this session.",
              metadata: {
                autoTask: {
                  active: false,
                },
              },
            }
          }

          context.metadata({
            title: "Auto Task activation",
            metadata: {
              requestedMode: "Auto Task",
              scope: args.scope ?? "",
            },
          })

          await context.ask({
            permission: AUTO_TASK_ACTIVATION_PERMISSION,
            patterns: ["Auto Task Mode"],
            always: [],
            metadata: {
              requestedMode: "Auto Task",
              scope: args.scope ?? "",
            },
          })

          const state = activateAutoTask({
            sessionID: context.sessionID,
            source: "tool",
            scope: args.scope,
          })

          return {
            title: "Auto Task activated",
            output: activationOutput(state.scope),
            metadata: {
              autoTask: state,
            },
          }
        },
      }),
    },

    "command.execute.before": async (input, output) => {
      if (normalizeCommandName(input.command) !== AUTO_TASK_COMMAND) return

      const requirements = normalizeCommandArguments(input.arguments)
      if (!requirements) {
        prependTextPart(output, input.sessionID, "Use `/autotask <requirements>` to start Auto Task Mode.")
        return
      }

      activateAutoTask({
        sessionID: input.sessionID,
        source: "slash-command",
        scope: requirements,
      })

      prependTextPart(output, input.sessionID, commandActivationText(requirements))
    },

    "permission.ask": async (input, output) => {
      if (output.status !== "ask") return
      if (!getAutoTaskState(input.sessionID)) return
      output.status = "allow"
    },

    "experimental.chat.system.transform": async (input, output) => {
      const state = getAutoTaskState(input.sessionID)
      if (!state) return
      mutableSystem(output).push(autoTaskSystemInstruction(state))
    },
  }
}) satisfies Plugin
