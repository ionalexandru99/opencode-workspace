import type { Project, SessionInfo } from "@opencode/client"
import type { Entry, Mark } from "./model.ts"
import type { Snapshot } from "./source.ts"

type EntryOptions = {
  readonly currentID: string
  readonly markOf: (sessionID: string) => Mark
  readonly projectOf: (session: SessionInfo) => string
}

const isUnread = ({ time }: SessionInfo) => time.idle !== undefined && time.idle > (time.viewed ?? 0)

export function toEntries(snapshot: Snapshot, options: EntryOptions): Entry[] {
  const running = new Set(snapshot.running)
  const waiting = new Set(snapshot.waiting)
  const approval = new Set(snapshot.approval)
  const input = new Set(snapshot.input)

  return snapshot.sessions.map((session) => ({
    id: session.id,
    title: session.title ?? "Untitled session",
    project: options.projectOf(session),
    model: session.model?.id ?? snapshot.models[session.id],
    updated: session.time.updated,
    finished: session.time.idle,
    signals: {
      running: running.has(session.id),
      waiting: waiting.has(session.id),
      approval: approval.has(session.id),
      input: input.has(session.id),
      failed: session.outcome === "failed",
      unread: session.id !== options.currentID && isUnread(session),
    },
    mark: options.markOf(session.id),
  }))
}

export function projectName(project: Project | undefined, directory: string) {
  return project?.name ?? (project?.canonical ?? directory).split("/").filter(Boolean).at(-1) ?? directory
}
