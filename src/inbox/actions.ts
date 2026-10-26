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

export async function showActions(ui: Plugin.Context["ui"], marks: Marks, entry: Entry, now: number) {
  const section = sectionOf(entry, now)
  const snooze =
    section === "snoozed"
      ? [{ title: "Wake now", value: () => marks.snooze(entry.id, undefined) }]
      : [
          { title: "Snooze 1 hour", value: () => marks.snooze(entry.id, now + HOUR) },
          { title: "Snooze 4 hours", value: () => marks.snooze(entry.id, now + 4 * HOUR) },
          { title: "Snooze until tomorrow 09:00", value: () => marks.snooze(entry.id, tomorrowMorning(now)) },
        ]
  const options = [
    entry.mark.pinned
      ? { title: "Unpin", value: () => marks.pin(entry.id, false) }
      : { title: "Pin", value: () => marks.pin(entry.id, true) },
    ...snooze,
    section === "settled"
      ? { title: "Unsettle", value: () => marks.settle(entry.id, undefined) }
      : { title: "Settle", value: () => marks.settle(entry.id, now) },
  ]

  const action = await ui.dialog.select({ title: entry.title, options })
  await action?.()
}
