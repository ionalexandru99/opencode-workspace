import type { Plugin } from "@opencode/plugin/tui"
import { showActions } from "./actions.ts"
import { projectName, toEntries } from "./entries.ts"
import { createMarks } from "./marks.ts"
import { statusOf, type Collapsed, type Entry, type ShelfKey } from "./model.ts"
import { createSessionSource } from "./source.ts"

export type Inbox = ReturnType<typeof createInbox>

export function createInbox(ctx: Plugin.Context) {
  const source = createSessionSource(ctx)
  const marks = createMarks(ctx.storage)
  const [collapsed, updateCollapsed] = ctx.storage.store<Collapsed>("collapsed", {
    initial: { working: false, snoozed: true, settled: true },
  })

  return {
    theme: ctx.theme,
    renderer: ctx.renderer,
    collapsed,
    toggle: (key: ShelfKey) =>
      updateCollapsed((draft) => {
        draft[key] = !draft[key]
      }),
    entries: (currentID: string) =>
      toEntries(source.snapshot, {
        currentID,
        markOf: marks.of,
        projectOf: (session) => projectName(ctx.data.project.get(session.projectID), session.location.directory),
      }),
    open(entry: Entry, now: number) {
      if (statusOf(entry, now) === "woke") void marks.snooze(entry.id, undefined)
      ctx.ui.router.navigate({ type: "session", sessionID: entry.id })
    },
    actions: (entry: Entry, now: number) => showActions(ctx.ui, marks, entry, now),
    stop: source.stop,
  }
}
