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

const MODEL_CHANGED_ON = ["session.execution.started", "session.model.selected"] as const

const DEBOUNCE_MS = 250
const SESSION_LIMIT = 100

export type SessionSource = ReturnType<typeof createSessionSource>

export function createSessionSource(ctx: Plugin.Context) {
  const [snapshot, setSnapshot] = createStore<Snapshot>({ sessions: [], models: {}, running: [], approval: [], input: [] })
  const models = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function lastReplyModel(sessionID: string) {
    const replies = await ctx.client.message.list({ sessionID, type: "assistant", limit: 1, order: "desc" })
    const reply = replies.data[0]
    return reply?.type === "assistant" ? reply.model.id : undefined
  }

  async function loadModels(sessions: SessionInfo[]) {
    const missing = sessions.filter((session) => !session.model && !models.has(session.id))
    const found = await Promise.all(missing.map(async (session) => [session.id, await lastReplyModel(session.id)] as const))
    for (const [sessionID, model] of found) if (model) models.set(sessionID, model)
    return Object.fromEntries(models)
  }

  async function load() {
    const [list, active] = await Promise.all([
      ctx.client.session.list({ limit: SESSION_LIMIT, order: "desc", parentID: null }),
      ctx.client.session.active(),
    ])
    const sessions = list.data.filter((session) => !session.parentID && !session.time.archived)
    const directories = [...new Set(sessions.map((session) => session.location.directory))]
    const [pending, knownModels] = await Promise.all([
      Promise.all(
        directories.map((directory) =>
          Promise.all([
            ctx.client.permission.request.list({ location: { directory } }),
            ctx.client.form.list({ location: { directory } }),
          ]),
        ),
      ),
      loadModels(sessions),
    ])
    setSnapshot(
      reconcile({
        sessions,
        models: knownModels,
        running: Object.keys(active),
        approval: pending.flatMap(([permissions]) => permissions.data.map((request) => request.sessionID)),
        input: pending.flatMap(([, forms]) => forms.data.map((form) => form.sessionID)),
      }),
    )
  }

  const refresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => load().catch((error) => console.error("inbox: failed to load sessions", error)), DEBOUNCE_MS)
  }

  const unsubscribe = [
    ...MODEL_CHANGED_ON.map((type) => ctx.data.on(type, (event) => models.delete(event.data.sessionID))),
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
