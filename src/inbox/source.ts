import type { Plugin } from "@opencode/plugin/tui"
import type { SessionInfo } from "@opencode/client"
import { createStore, reconcile } from "solid-js/store"

export type Snapshot = {
  readonly sessions: SessionInfo[]
  readonly models: Record<string, string>
  readonly running: string[]
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
] as const

type PendingKind = "approval" | "input"
type Pending = { readonly sessionID: string }

const MODEL_CHANGED_ON = ["session.execution.started", "session.model.selected"] as const

const DEBOUNCE_MS = 250
const SESSION_LIMIT = 100

export type SessionSource = ReturnType<typeof createSessionSource>

export function createSessionSource(ctx: Plugin.Context) {
  const [snapshot, setSnapshot] = createStore<Snapshot>({ sessions: [], models: {}, running: [], approval: [], input: [] })
  const models = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  async function lastReplyModel(sessionID: string) {
    const replies = await ctx.client.message.list({ sessionID, type: "assistant", limit: 1, order: "desc" }).catch(() => undefined)
    const reply = replies?.data[0]
    return reply?.type === "assistant" ? reply.model.id : undefined
  }

  const pendingLookups: Record<PendingKind, (directory: string) => Promise<{ readonly data: readonly Pending[] }>> = {
    approval: (directory) => ctx.client.permission.request.list({ location: { directory } }),
    input: (directory) => ctx.client.form.list({ location: { directory } }),
  }

  function previousPending(kind: PendingKind, directory: string) {
    const inDirectory = new Set(
      snapshot.sessions.filter((session) => session.location.directory === directory).map((session) => session.id),
    )
    return snapshot[kind].filter((sessionID) => inDirectory.has(sessionID))
  }

  async function pendingSessionIDs(kind: PendingKind, directories: string[]) {
    const perDirectory = await Promise.all(
      directories.map(async (directory) => {
        try {
          return (await pendingLookups[kind](directory)).data.map((pending) => pending.sessionID)
        } catch (error) {
          console.error(`inbox: failed to load ${kind} requests for ${directory}`, error)
          return previousPending(kind, directory)
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
    const [approval, input, found] = await Promise.all([
      pendingSessionIDs("approval", directories),
      pendingSessionIDs("input", directories),
      lookupModels(sessions),
    ])
    if (current !== generation) return
    for (const [sessionID, model] of found) if (model) models.set(sessionID, model)
    setSnapshot(
      reconcile({
        sessions,
        models: Object.fromEntries(models),
        running: Object.keys(active),
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
