import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"
import {
  activateAutoTask,
  autoTaskHandoffInstruction,
  getAutoTaskState,
} from "../lib/Asterisk-AutoTaskState"

const BUILDER_AGENT = "Asterisk-Builder"
const PLAN_DIRECTORY = ".asterisk"
const PLAN_FILE = "PLANS.md"
const PLAN_REFERENCE = `${PLAN_DIRECTORY}/${PLAN_FILE}`
const SESSION_SELECT_EVENT = "tui.session.select"
const DEFAULT_BUILDER_SESSION_TITLE = BUILDER_AGENT

type SessionInfo = {
  id?: string
}

type SdkResponse<T> = T | {
  data?: T
  error?: unknown
}

type OpenCodeClient = Parameters<Plugin>[0]["client"]

type TuiSelectionResult = {
  selected: boolean
  fallbackOpened: boolean
  error?: string
}

function planPath(directory: string) {
  return join(directory, PLAN_DIRECTORY, PLAN_FILE)
}

function normalizePlanContent(content: string) {
  return `${content.trimEnd()}\n`
}

async function savePlan(directory: string, content: string) {
  try {
    await mkdir(join(directory, PLAN_DIRECTORY), { recursive: true })
    await writeFile(planPath(directory), normalizePlanContent(content), "utf8")
  } catch (error) {
    throw new Error(`Failed to save ${PLAN_REFERENCE}. ${fileSystemErrorMessage(error)}`)
  }
}

async function readPlan(directory: string) {
  let content: string

  try {
    content = await readFile(planPath(directory), "utf8")
  } catch (error) {
    throw new Error(`Failed to read ${PLAN_REFERENCE}. ${fileSystemErrorMessage(error)}`)
  }

  if (!content.trim()) {
    throw new Error(`${PLAN_REFERENCE} is empty. Save the approved plan before handing off to Builder.`)
  }
  return content
}

function fileSystemErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return `File system error ${error.code}.`
  }

  return "File system error."
}

function sdkErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  if (error && typeof error === "object") {
    const namedError = error as { name?: unknown, data?: { message?: unknown } }
    const name = typeof namedError.name === "string" ? namedError.name : "OpenCode SDK error"
    const message = typeof namedError.data?.message === "string" ? namedError.data.message : undefined
    return message ? `${name}: ${message}` : name
  }

  return "OpenCode SDK returned an error."
}

function unwrapSdkData<T>(response: SdkResponse<T>, action: string) {
  if (response && typeof response === "object") {
    if ("error" in response && response.error) {
      throw new Error(`${action} failed. ${sdkErrorMessage(response.error)}`)
    }

    if ("data" in response) {
      if (response.data === undefined || response.data === null) {
        throw new Error(`${action} did not return data.`)
      }
      return response.data
    }
  }

  return response as T
}

function assertNoSdkError(response: unknown, action: string) {
  if (response && typeof response === "object" && "error" in response && response.error) {
    throw new Error(`${action} failed. ${sdkErrorMessage(response.error)}`)
  }
}

function validateBuilderStartPrompt(prompt: string) {
  if (!prompt.toLowerCase().includes(PLAN_FILE.toLowerCase())) {
    throw new Error(`Builder start prompt must mention ${PLAN_REFERENCE}.`)
  }
}

function builderPromptWithAutoTask(prompt: string, autoTaskInstruction?: string) {
  if (!autoTaskInstruction) return prompt
  return `${autoTaskInstruction}\n\n${prompt}`
}

async function selectBuilderSession(client: OpenCodeClient, directory: string, sessionID: string): Promise<TuiSelectionResult> {
  try {
    const response = await client.tui.publish({
      query: {
        directory,
      },
      body: {
        type: SESSION_SELECT_EVENT,
        properties: {
          sessionID,
        },
      } as never,
    })
    assertNoSdkError(response, "Selecting Builder session")
    return {
      selected: true,
      fallbackOpened: false,
    }
  } catch (error) {
    const selectionError = error instanceof Error ? error.message : "Failed to select the Builder session."

    try {
      const response = await client.tui.openSessions({
        query: {
          directory,
        },
      })
      assertNoSdkError(response, "Opening session list")
      return {
        selected: false,
        fallbackOpened: true,
        error: selectionError,
      }
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Failed to open the session list."
      return {
        selected: false,
        fallbackOpened: false,
        error: `${selectionError} ${fallbackMessage}`,
      }
    }
  }
}

function handoffOutput(sessionID: string, selection: TuiSelectionResult) {
  if (selection.selected) {
    return `Started ${BUILDER_AGENT} session ${sessionID} and switched the TUI to it.`
  }

  if (selection.fallbackOpened) {
    return `Started ${BUILDER_AGENT} session ${sessionID}, but automatic TUI switching failed. Opened the session list instead. ${selection.error}`
  }

  return `Started ${BUILDER_AGENT} session ${sessionID}, but automatic TUI switching failed. ${selection.error}`
}

export default (async ({ client }) => {
  return {
    tool: {
      asterisk_plan_file: tool({
        description: `Create or replace ${PLAN_REFERENCE} with the current Asterisk-Planner plan draft.`,
        args: {
          content: tool.schema.string().min(1).describe("The full current plan content to save."),
        },
        async execute(args, context) {
          await savePlan(context.directory, args.content)

          return {
            title: "Asterisk plan saved",
            output: `Saved the current plan to ${PLAN_REFERENCE}.`,
            metadata: {
              planPath: PLAN_REFERENCE,
            },
          }
        },
      }),
      asterisk_session_bridge: tool({
        description: `Request approval, create a new ${BUILDER_AGENT} session, and pass Planner's Builder start prompt.`,
        args: {
          prompt: tool.schema.string().min(1).describe(`Planner-written Builder start prompt. It should summarize the project or task and tell Builder to read ${PLAN_REFERENCE}.`),
          title: tool.schema.string().min(1).max(80).optional().describe(`Optional human-readable ${BUILDER_AGENT} session title.`),
          autoTask: tool.schema.boolean().optional().describe("Pass active Auto Task Mode to the new Builder session. Use only when the current session has active Auto Task permission."),
        },
        async execute(args, context) {
          const plan = await readPlan(context.directory)
          validateBuilderStartPrompt(args.prompt)
          const autoTaskState = args.autoTask ? getAutoTaskState(context.sessionID) : undefined
          if (args.autoTask && !autoTaskState) {
            throw new Error("Cannot pass Auto Task Mode to Builder because Auto Task is not active for the current session.")
          }
          const builderPrompt = builderPromptWithAutoTask(
            args.prompt,
            autoTaskState ? autoTaskHandoffInstruction(autoTaskState) : undefined,
          )

          context.metadata({
            title: "Asterisk Builder handoff",
            metadata: {
              targetAgent: BUILDER_AGENT,
              planPath: PLAN_REFERENCE,
              autoTask: Boolean(autoTaskState),
            },
          })

          await context.ask({
            permission: "asterisk_session_bridge",
            patterns: [BUILDER_AGENT],
            always: [],
            metadata: {
              targetAgent: BUILDER_AGENT,
              planPath: PLAN_REFERENCE,
              autoTask: Boolean(autoTaskState),
            },
          })

          const sessionResponse = await client.session.create({
            body: {
              title: args.title ?? DEFAULT_BUILDER_SESSION_TITLE,
            },
            query: {
              directory: context.directory,
            },
          })
          const session = unwrapSdkData<SessionInfo>(sessionResponse, "Creating Builder session")
          if (!session.id) {
            throw new Error("Builder session was created, but OpenCode did not return a session ID.")
          }

          if (autoTaskState) {
            activateAutoTask({
              sessionID: session.id,
              source: "builder-handoff",
              scope: autoTaskState.scope,
              parentSessionID: context.sessionID,
            })
          }

          const promptResponse = await client.session.promptAsync({
            path: {
              id: session.id,
            },
            query: {
              directory: context.directory,
            },
            body: {
              agent: BUILDER_AGENT,
              parts: [
                {
                  type: "text",
                  text: builderPrompt,
                },
              ],
            },
          })
          assertNoSdkError(promptResponse, "Starting Builder prompt")
          const selection = await selectBuilderSession(client, context.directory, session.id)

          return {
            title: `${BUILDER_AGENT} started`,
            output: handoffOutput(session.id, selection),
            metadata: {
              targetAgent: BUILDER_AGENT,
              builderSessionID: session.id,
              planPath: PLAN_REFERENCE,
              planCharacters: plan.length,
              promptCharacters: builderPrompt.length,
              autoTask: Boolean(autoTaskState),
              tuiSessionSelected: selection.selected,
              tuiSessionListOpened: selection.fallbackOpened,
            },
          }
        },
      }),
    },
  }
}) satisfies Plugin
