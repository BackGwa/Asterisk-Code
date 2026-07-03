export type AutoTaskSource = "slash-command" | "tool" | "builder-handoff"

export type AutoTaskState = {
  active: true
  sessionID: string
  source: AutoTaskSource
  scope: string
  parentSessionID?: string
  activatedAt: number
}

type ActivateAutoTaskInput = {
  sessionID: string
  source: AutoTaskSource
  scope?: string
  parentSessionID?: string
}

const autoTaskSessions = new Map<string, AutoTaskState>()
const autoTaskSessionParents = new Map<string, string>()

export function activateAutoTask(input: ActivateAutoTaskInput) {
  const state: AutoTaskState = {
    active: true,
    sessionID: input.sessionID,
    source: input.source,
    scope: input.scope?.trim() ?? "",
    parentSessionID: input.parentSessionID,
    activatedAt: Date.now(),
  }

  autoTaskSessions.set(input.sessionID, state)
  if (input.parentSessionID) {
    autoTaskSessionParents.set(input.sessionID, input.parentSessionID)
  }
  return state
}

export function deactivateAutoTask(sessionID: string) {
  return autoTaskSessions.delete(sessionID)
}

export function getAutoTaskState(sessionID?: string) {
  if (!sessionID) return undefined

  let currentSessionID: string | undefined = sessionID
  const visitedSessionIDs = new Set<string>()

  while (currentSessionID && !visitedSessionIDs.has(currentSessionID)) {
    visitedSessionIDs.add(currentSessionID)

    const state = autoTaskSessions.get(currentSessionID)
    if (state) return state

    currentSessionID = autoTaskSessionParents.get(currentSessionID)
  }

  return undefined
}

export function rememberAutoTaskSessionParent(sessionID: string, parentSessionID?: string) {
  if (!parentSessionID) return
  autoTaskSessionParents.set(sessionID, parentSessionID)
}

export function autoTaskSystemInstruction(state: AutoTaskState) {
  return [
    "Auto Task Mode is active for this session.",
    "Do not infer this state from conversation text alone; this instruction is attached because Auto Task activation was confirmed.",
    "Continue the requested work without waiting for direct user questions or approvals.",
    "Use role-appropriate Subagents when code context, technical grounds, implementation review, or validation is needed.",
    "Do not use Auto Task permission to perform dangerous commands, expose sensitive information, make destructive changes, or work outside the requested scope.",
    state.scope ? `Auto Task scope: ${state.scope}` : undefined,
  ].filter(Boolean).join("\n")
}

export function autoTaskHandoffInstruction(state: AutoTaskState) {
  return [
    "Auto Task Mode is active for this Builder handoff.",
    "The Builder session receives Auto Task permission from the current session.",
    "Builder must continue implementation without waiting for direct user questions or approvals, while staying inside the requested scope and safety rules.",
    state.scope ? `Auto Task scope: ${state.scope}` : undefined,
  ].filter(Boolean).join("\n")
}
