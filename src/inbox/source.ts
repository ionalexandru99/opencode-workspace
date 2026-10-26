import type { Plugin } from "@opencode/plugin/tui"
import type { SessionInfo } from "@opencode/client"
import { createStore, reconcile } from "solid-js/store"

export type Snapshot = {
  readonly sessions: SessionInfo[]
  readonly models: Record<string, string>
  readonly running: string[]
  readonly waiting: string[]
  readonly approval: string[]
  readonly input: string[]
}

const REFRESH_ON = [
  "session.created",
  "session.deleted",
  "session.renamed",
  "session.moved",
  "session.model.selected",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.idle",
  "session.viewed",
  "permission.asked",
  "permission.replied",
  "form.created",
  "form.replied",
  "form.cancelled",
  "session.shell.started",
  "session.shell.ended",
  "shell.created",
  "shell.exited",
  "shell.deleted",
] as const

type LookupKind = "waiting" | "approval" | "input"

const MODEL_CHANGED_ON = ["session.execution.started", "session.model.selected"] as const

const DEBOUNCE_MS = 250
const SESSION_LIMIT = 100

export type SessionSource = ReturnType<typeof createSessionSource>

export function createSessionSource(ctx: Plugin.Context) {
  const [snapshot, setSnapshot] = createStore<Snapshot>({ sessions: [], models: {}, running: [], waiting: [], approval: [], input: [] })
  const models = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  async function lastReplyModel(sessionID: string) {
    const replies = await ctx.client.message.list({ sessionID, type: "assistant", limit: 1, order: "desc" }).catch(() => undefined)
    const reply = replies?.data[0]
    return reply?.type === "assistant" ? reply.model.id : undefined
  }

  const lookups: Record<LookupKind, (directory: string) => Promise<string[]>> = {
    waiting: async (directory) =>
      (await ctx.client.shell.list({ location: { directory } })).data
        .filter((shell) => shell.status === "running")
        .map((shell) => shell.metadata.sessionID)
        .filter((sessionID): sessionID is string => typeof sessionID === "string"),
    approval: async (directory) =>
      (await ctx.client.permission.request.list({ location: { directory } })).data.map((pending) => pending.sessionID),
    input: async (directory) =>
      (await ctx.client.form.list({ location: { directory } })).data.map((pending) => pending.sessionID),
  }

  function previousSessionIDs(kind: LookupKind, directory: string) {
    const inDirectory = new Set(
      snapshot.sessions.filter((session) => session.location.directory === directory).map((session) => session.id),
    )
    return snapshot[kind].filter((sessionID) => inDirectory.has(sessionID))
  }

  async function sessionIDs(kind: LookupKind, directories: string[]) {
    const perDirectory = await Promise.all(
      directories.map(async (directory) => {
        try {
          return await lookups[kind](directory)
        } catch (error) {
          console.error(`inbox: failed to load ${kind} sessions for ${directory}`, error)
          return previousSessionIDs(kind, directory)
        }
      }),
    )
    return perDirectory.flat()
  }

  async function lookupModels(sessions: SessionInfo[]) {
    const missing = sessions.filter((session) => !session.model && !models.has(session.id))
    return Promise.all(missing.map(async (session) => [session.id, await lastReplyModel(session.id)] as const))
  }

  async function load() {
    const current = ++generation
    const [list, active] = await Promise.all([
      ctx.client.session.list({ limit: SESSION_LIMIT, order: "desc", parentID: null }),
      ctx.client.session.active(),
    ])
    const sessions = list.data.filter((session) => !session.parentID && !session.time.archived)
    const directories = [...new Set(sessions.map((session) => session.location.directory))]
    const [waiting, approval, input, found] = await Promise.all([
      sessionIDs("waiting", directories),
      sessionIDs("approval", directories),
      sessionIDs("input", directories),
      lookupModels(sessions),
    ])
    if (current !== generation) return
    for (const [sessionID, model] of found) if (model) models.set(sessionID, model)
    setSnapshot(
      reconcile({
        sessions,
        models: Object.fromEntries(models),
        running: Object.keys(active),
        waiting,
        approval,
        input,
      }),
    )
  }

  const refresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => load().catch((error) => console.error("inbox: failed to load sessions", error)), DEBOUNCE_MS)
  }

  const unsubscribe = [
    ...MODEL_CHANGED_ON.map((type) =>
      ctx.data.on(type, (event) => {
        generation++
        models.delete(event.data.sessionID)
      }),
    ),
    ...REFRESH_ON.map((type) => ctx.data.on(type, refresh)),
  ]
  refresh()

  return {
    snapshot,
    stop() {
      clearTimeout(timer)
      unsubscribe.forEach((off) => off())
    },
  }
}
