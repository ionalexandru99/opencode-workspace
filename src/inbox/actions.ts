import type { Plugin } from "@opencode/plugin/tui"
import type { Marks } from "./marks.ts"
import { sectionOf, type Entry } from "./model.ts"

const HOUR = 3_600_000

const tomorrowMorning = (now: number) => {
  const date = new Date(now)
  date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.getTime()
}

export async function showActions(ui: Plugin.Context["ui"], marks: Marks, entry: Entry) {
  const now = Date.now()
  const section = sectionOf(entry, now)
  const snooze =
    section === "snoozed"
      ? [{ title: "Wake now", value: (at: number) => marks.snooze(entry.id, undefined, at) }]
      : [
          { title: "Snooze 1 hour", value: (at: number) => marks.snooze(entry.id, at + HOUR, at) },
          { title: "Snooze 4 hours", value: (at: number) => marks.snooze(entry.id, at + 4 * HOUR, at) },
          { title: "Snooze until tomorrow 09:00", value: (at: number) => marks.snooze(entry.id, tomorrowMorning(at), at) },
        ]
  const options = [
    entry.mark.pinned
      ? { title: "Unpin", value: () => marks.pin(entry.id, false) }
      : { title: "Pin", value: () => marks.pin(entry.id, true) },
    ...snooze,
    section === "settled"
      ? { title: "Unsettle", value: () => marks.settle(entry.id, undefined) }
      : { title: "Settle", value: (at: number) => marks.settle(entry.id, at) },
  ]

  const action = await ui.dialog.select({ title: entry.title, options })
  await action?.(Date.now())
}
