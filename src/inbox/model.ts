export type Status = "working" | "approval" | "input" | "failed" | "woke" | "done" | "idle"
export type SectionKey = "pinned" | "active" | "working" | "snoozed" | "settled"
export type ShelfKey = Extract<SectionKey, "working" | "snoozed" | "settled">
export type Collapsed = Record<ShelfKey, boolean>

export type Signals = {
  readonly running: boolean
  readonly approval: boolean
  readonly input: boolean
  readonly failed: boolean
  readonly unread: boolean
}

export type Mark = {
  readonly pinned?: boolean
  readonly snoozedAt?: number
  readonly snoozedUntil?: number
  readonly settledAt?: number
}

export type Entry = {
  readonly id: string
  readonly title: string
  readonly project: string
  readonly model?: string
  readonly updated: number
  readonly finished?: number
  readonly signals: Signals
  readonly mark: Mark
}

export type Sections = Record<SectionKey, Entry[]>

const MINUTE = 60_000

const isAsking = ({ signals }: Entry) => signals.approval || signals.input

const finishedAfter = (entry: Entry, time = 0) => (entry.finished ?? 0) > time

const failedSince = (entry: Entry, time?: number) => entry.signals.failed && finishedAfter(entry, time)

const isSnoozed = (entry: Entry, now: number) =>
  entry.mark.snoozedUntil !== undefined &&
  entry.mark.snoozedUntil > now &&
  !isAsking(entry) &&
  !failedSince(entry, entry.mark.snoozedAt)

const isSettled = (entry: Entry) =>
  entry.mark.settledAt !== undefined &&
  !finishedAfter(entry, entry.mark.settledAt) &&
  !isAsking(entry) &&
  !entry.signals.running

export function statusOf(entry: Entry, now: number): Status {
  const { signals, mark } = entry
  if (signals.approval) return "approval"
  if (signals.input) return "input"
  if (signals.running) return "working"
  if (signals.failed) return "failed"
  if (mark.snoozedUntil !== undefined && mark.snoozedUntil <= now) return "woke"
  if (signals.unread) return "done"
  return "idle"
}

export function sectionOf(entry: Entry, now: number): SectionKey {
  if (isSettled(entry)) return "settled"
  if (isSnoozed(entry, now)) return "snoozed"
  if (entry.signals.running && !isAsking(entry)) return "working"
  if (entry.mark.pinned) return "pinned"
  return "active"
}

export function groupSections(entries: readonly Entry[], now: number): Sections {
  const sections: Sections = { pinned: [], active: [], working: [], snoozed: [], settled: [] }
  for (const entry of entries) sections[sectionOf(entry, now)].push(entry)
  for (const list of Object.values(sections)) list.sort((a, b) => b.updated - a.updated)
  return sections
}

export const SHELVES: readonly ShelfKey[] = ["working", "snoozed", "settled"]

export const isCompact = (key: SectionKey) => key === "settled"

const sectionRows = (sections: Sections, key: SectionKey) => sections[key].length * (isCompact(key) ? 1 : 2)

export function listRows(sections: Sections, collapsed: Collapsed) {
  const pinned = sections.pinned.length ? 1 + sectionRows(sections, "pinned") + 1 : 0
  const active = 1 + Math.max(1, sectionRows(sections, "active"))
  const shelves = SHELVES.filter((key) => sections[key].length).reduce(
    (rows, key) => rows + 1 + (collapsed[key] ? 0 : sectionRows(sections, key)),
    0,
  )
  return pinned + active + shelves
}

const BUILT_IN_MIN_ROWS = 6
const BUILT_IN_SHARE = 0.2

export function inboxRows(sharedRows: number) {
  const builtIn = Math.max(BUILT_IN_MIN_ROWS, Math.round(sharedRows * BUILT_IN_SHARE))
  return Math.max(0, sharedRows - builtIn)
}

export function relativeTime(time: number, now: number) {
  const minutes = Math.floor((now - time) / MINUTE)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`
  return `${Math.round(minutes / 1440)}d`
}

export function untilLabel(time: number, now: number) {
  const until = new Date(time)
  if (until.toDateString() === new Date(now).toDateString())
    return until.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
  return until.toLocaleDateString(undefined, { weekday: "short" })
}
