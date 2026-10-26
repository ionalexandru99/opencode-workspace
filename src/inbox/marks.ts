import type { Plugin } from "@opencode/plugin/tui"
import type { Mark } from "./model.ts"

export type Marks = ReturnType<typeof createMarks>

export function createMarks(storage: Plugin.Context["storage"]) {
  const [marks, update] = storage.store<Record<string, Mark>>("marks", { initial: {} })
  const patch = (sessionID: string, change: Mark) =>
    update((draft) => {
      draft[sessionID] = { ...draft[sessionID], ...change }
    })

  return {
    of: (sessionID: string): Mark => marks[sessionID] ?? {},
    pin: (sessionID: string, pinned: boolean) => patch(sessionID, { pinned }),
    snooze: (sessionID: string, snoozedUntil: number | undefined, now: number) =>
      patch(sessionID, { snoozedAt: snoozedUntil === undefined ? undefined : now, snoozedUntil, settledAt: undefined }),
    settle: (sessionID: string, settledAt: number | undefined) =>
      patch(sessionID, { settledAt, snoozedUntil: undefined, pinned: false }),
  }
}
