import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"

const BUILDER_AGENT = "Asterisk-Builder"
const PLAN_DIRECTORY = ".asterisk"
const PLAN_FILE = "PLANS.md"
const PLAN_REFERENCE = `${PLAN_DIRECTORY}/${PLAN_FILE}`

type SessionInfo = {
  id?: string
}

type SdkResponse<T> = T | {
  data?: T
  error?: unknown
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

function builderPrompt() {
  return [
    "Asterisk-Planner approved the implementation plan.",
    `Read \`${PLAN_REFERENCE}\` first and use that file as the source of truth for the build.`,
    "Do not rely on a copied plan in this prompt.",
    "If the plan file is missing, empty, unclear, or conflicts with the user's latest instruction, stop and ask the user a specific question before implementing.",
  ].join("\n")
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
        description: `Request approval, create a new ${BUILDER_AGENT} session, and tell it to read ${PLAN_REFERENCE}.`,
        args: {},
        async execute(_args, context) {
          const plan = await readPlan(context.directory)

          context.metadata({
            title: "Asterisk Builder handoff",
            metadata: {
              targetAgent: BUILDER_AGENT,
              planPath: PLAN_REFERENCE,
            },
          })

          await context.ask({
            permission: "asterisk_session_bridge",
            patterns: [BUILDER_AGENT],
            always: [],
            metadata: {
              targetAgent: BUILDER_AGENT,
              planPath: PLAN_REFERENCE,
            },
          })

          const sessionResponse = await client.session.create({
            body: {
              title: "Asterisk Builder Handoff",
            },
            query: {
              directory: context.directory,
            },
          })
          const session = unwrapSdkData<SessionInfo>(sessionResponse, "Creating Builder session")
          if (!session.id) {
            throw new Error("Builder session was created, but OpenCode did not return a session ID.")
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
                  text: builderPrompt(),
                },
              ],
            },
          })
          assertNoSdkError(promptResponse, "Starting Builder prompt")

          return {
            title: "Asterisk Builder session started",
            output: `Created Builder session ${session.id} and asked ${BUILDER_AGENT} to read ${PLAN_REFERENCE}.`,
            metadata: {
              targetAgent: BUILDER_AGENT,
              builderSessionID: session.id,
              planPath: PLAN_REFERENCE,
              planCharacters: plan.length,
            },
          }
        },
      }),
    },
  }
}) satisfies Plugin
