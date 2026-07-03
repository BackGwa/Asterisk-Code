import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type Plugin, tool } from "@opencode-ai/plugin"

const RESEARCH_DIRECTORY = ".asterisk/research"
const RESEARCH_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/u

function normalizeResearchFileName(fileName: string) {
  const normalizedFileName = fileName.trim()

  if (!RESEARCH_FILE_NAME.test(normalizedFileName) || normalizedFileName.includes("..")) {
    throw new Error(
      `Research filename must be a markdown filename inside ${RESEARCH_DIRECTORY}, for example opencode-plugin-hooks.md.`,
    )
  }

  return normalizedFileName
}

function normalizeResearchContent(content: string) {
  return `${content.trimEnd()}\n`
}

function researchDirectoryPath(directory: string) {
  return join(directory, RESEARCH_DIRECTORY)
}

function researchFilePath(directory: string, fileName: string) {
  return join(researchDirectoryPath(directory), fileName)
}

function fileSystemErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return `File system error ${error.code}.`
  }

  return "File system error."
}

async function saveResearchFile(directory: string, fileName: string, content: string) {
  const normalizedFileName = normalizeResearchFileName(fileName)
  const relativePath = `${RESEARCH_DIRECTORY}/${normalizedFileName}`

  try {
    await mkdir(researchDirectoryPath(directory), { recursive: true })
    await writeFile(researchFilePath(directory, normalizedFileName), normalizeResearchContent(content), "utf8")
  } catch (error) {
    throw new Error(`Failed to save ${relativePath}. ${fileSystemErrorMessage(error)}`)
  }

  return relativePath
}

export default (async () => {
  return {
    tool: {
      asterisk_research_file: tool({
        description: `Create or replace a research record inside ${RESEARCH_DIRECTORY}.`,
        args: {
          filename: tool.schema.string().min(1).describe("Markdown filename only, for example opencode-plugin-hooks.md. Path separators are not allowed."),
          content: tool.schema.string().min(1).describe("The full research record content to save."),
        },
        async execute(args, context) {
          const researchPath = await saveResearchFile(context.directory, args.filename, args.content)

          return {
            title: "Asterisk research saved",
            output: `Saved the research record to ${researchPath}.`,
            metadata: {
              researchPath,
            },
          }
        },
      }),
    },
  }
}) satisfies Plugin
