import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { groupSections, inboxRows, listRows, relativeTime, sectionOf, statusOf, type Entry } from "./model.ts"

const NOW = Date.UTC(2026, 9, 26, 12, 0)
const MIN = 60_000

const entry = (patch: Partial<Entry> = {}): Entry => ({
  id: "s1",
  title: "Session",
  project: "alfastar",
  updated: NOW - 5 * MIN,
  signals: { running: false, waiting: false, approval: false, input: false, failed: false, unread: false },
  mark: {},
  ...patch,
})
const signals = (patch: Partial<Entry["signals"]>) => ({ ...entry().signals, ...patch })

describe("statusOf", () => {
  it("prefers what needs the user over a running session", () => {
    // Arrange
    const session = entry({ signals: signals({ running: true, approval: true }) })

    // Act
    const status = statusOf(session, NOW)

    // Assert
    assert.equal(status, "approval")
  })

  it("reports a session left waiting on a background shell as waiting", () => {
    // Arrange
    const session = entry({ signals: signals({ waiting: true }) })

    // Act
    const status = statusOf(session, NOW)

    // Assert
    assert.equal(status, "waiting")
  })

  it("reports an unread reply over a background shell it left running", () => {
    // Arrange
    const session = entry({ signals: signals({ waiting: true, unread: true }) })

    // Act
    const status = statusOf(session, NOW)

    // Assert
    assert.equal(status, "done")
  })

  it("reports a failed run over a background shell it left running", () => {
    // Arrange
    const session = entry({ signals: signals({ waiting: true, failed: true }) })

    // Act
    const status = statusOf(session, NOW)

    // Assert
    assert.equal(status, "failed")
  })

  it("reports a snooze that has run out as woke", () => {
    // Arrange
    const session = entry({ mark: { snoozedUntil: NOW - MIN } })

    // Act
    const status = statusOf(session, NOW)

    // Assert
    assert.equal(status, "woke")
  })

  it("reports unread output as done", () => {
    // Arrange
    const session = entry({ signals: signals({ unread: true }) })

    // Act
    const status = statusOf(session, NOW)

    // Assert
    assert.equal(status, "done")
  })
})

describe("sectionOf", () => {
  it("keeps a settled session settled while nothing new happens", () => {
    // Arrange
    const session = entry({ mark: { settledAt: NOW - MIN } })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "settled")
  })

  it("brings a settled session back when a new run finishes", () => {
    // Arrange
    const session = entry({ finished: NOW, mark: { settledAt: NOW - MIN } })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "active")
  })

  it("keeps a settled session settled when it is only renamed", () => {
    // Arrange
    const session = entry({ updated: NOW, finished: NOW - 2 * MIN, mark: { settledAt: NOW - MIN } })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "settled")
  })

  it("wakes a snoozed session early when it asks for input", () => {
    // Arrange
    const session = entry({ mark: { snoozedUntil: NOW + 60 * MIN }, signals: signals({ input: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "active")
  })

  it("lets a failed session be settled", () => {
    // Arrange
    const session = entry({ mark: { settledAt: NOW }, signals: signals({ failed: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "settled")
  })

  it("keeps a failed session snoozed when it failed before the snooze", () => {
    // Arrange
    const session = entry({ mark: { snoozedAt: NOW - MIN, snoozedUntil: NOW + 60 * MIN }, signals: signals({ failed: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "snoozed")
  })

  it("wakes a snoozed session that fails after the snooze", () => {
    // Arrange
    const session = entry({
      finished: NOW,
      mark: { snoozedAt: NOW - MIN, snoozedUntil: NOW + 60 * MIN },
      signals: signals({ failed: true }),
    })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "active")
  })

  it("moves a running session to the working shelf even when pinned", () => {
    // Arrange
    const session = entry({ mark: { pinned: true }, signals: signals({ running: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "working")
  })

  it("moves a session waiting on a background shell to the working shelf", () => {
    // Arrange
    const session = entry({ signals: signals({ waiting: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "working")
  })

  it("keeps a failed session in active while its background shell runs", () => {
    // Arrange
    const session = entry({ signals: signals({ waiting: true, failed: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "active")
  })

  it("keeps a settled session settled while its background shell runs", () => {
    // Arrange
    const session = entry({ mark: { settledAt: NOW }, signals: signals({ waiting: true }) })

    // Act
    const section = sectionOf(session, NOW)

    // Assert
    assert.equal(section, "settled")
  })
})

describe("groupSections", () => {
  it("orders each section by most recent activity", () => {
    // Arrange
    const older = entry({ id: "old", updated: NOW - 60 * MIN })
    const newer = entry({ id: "new", updated: NOW - MIN })

    // Act
    const sections = groupSections([older, newer], NOW)

    // Assert
    assert.deepEqual(sections.active.map((s) => s.id), ["new", "old"])
  })
})

describe("inboxRows", () => {
  it("gives the inbox 80% of the rows it shares with the built-in sections", () => {
    assert.equal(inboxRows(50), 40)
  })

  it("keeps six rows for the built-in sections on short terminals", () => {
    assert.equal(inboxRows(17), 11)
  })
})

describe("listRows", () => {
  it("counts headers, two-line entries and only the expanded shelves", () => {
    // Arrange
    const sections = groupSections(
      [
        entry({ id: "pinned", mark: { pinned: true } }),
        entry({ id: "active" }),
        entry({ id: "working", signals: signals({ running: true }) }),
        entry({ id: "settled", mark: { settledAt: NOW } }),
      ],
      NOW,
    )

    // Act
    const rows = listRows(sections, { working: false, snoozed: true, settled: true })

    // Assert
    assert.equal(rows, 4 + 3 + 3 + 1)
  })

  it("counts settled entries as one line", () => {
    // Arrange
    const sections = groupSections(
      [entry({ id: "a", mark: { settledAt: NOW } }), entry({ id: "b", mark: { settledAt: NOW } })],
      NOW,
    )

    // Act
    const rows = listRows(sections, { working: false, snoozed: true, settled: false })

    // Assert
    assert.equal(rows, 2 + 1 + 2)
  })
})

describe("relativeTime", () => {
  it("formats minutes, hours and days", () => {
    assert.deepEqual(
      [0, 3 * MIN, 130 * MIN, 3 * 1440 * MIN].map((ago) => relativeTime(NOW - ago, NOW)),
      ["now", "3m", "2h", "3d"],
    )
  })
})
