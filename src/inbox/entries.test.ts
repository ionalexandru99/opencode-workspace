import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { SessionInfo } from "@opencode/client"
import { projectName, toEntries } from "./entries.ts"
import type { Snapshot } from "./source.ts"

const session = (patch: Omit<Partial<SessionInfo>, "time"> & { time?: Partial<SessionInfo["time"]> } = {}) =>
  ({
    id: "s1",
    projectID: "p1",
    title: "Admin sign-in",
    cost: 0,
    location: { directory: "/home/aion/code/Alfastar" },
    model: { id: "claude-opus-5-5", providerID: "anthropic" },
    ...patch,
    time: { created: 1, updated: 10, ...patch.time },
  }) as SessionInfo

const snapshot = (patch: Partial<Snapshot> = {}): Snapshot => ({
  sessions: [session()],
  models: {},
  running: [],
  approval: [],
  input: [],
  ...patch,
})

const options = { currentID: "other", markOf: () => ({}), projectOf: () => "Alfastar" }

describe("toEntries", () => {
  it("treats output finished after the last view as unread", () => {
    // Arrange
    const data = snapshot({ sessions: [session({ time: { idle: 20, viewed: 15 } })] })

    // Act
    const [entry] = toEntries(data, options)

    // Assert
    assert.equal(entry.signals.unread, true)
  })

  it("never marks the open session as unread", () => {
    // Arrange
    const data = snapshot({ sessions: [session({ time: { idle: 20 } })] })

    // Act
    const [entry] = toEntries(data, { ...options, currentID: "s1" })

    // Assert
    assert.equal(entry.signals.unread, false)
  })

  it("maps pending permissions, forms and running sessions to signals", () => {
    // Arrange
    const data = snapshot({ running: ["s1"], approval: ["s1"], input: ["s1"] })

    // Act
    const [entry] = toEntries(data, options)

    // Assert
    assert.deepEqual(
      [entry.signals.running, entry.signals.approval, entry.signals.input],
      [true, true, true],
    )
  })

  it("reports a failed last run", () => {
    // Arrange
    const data = snapshot({ sessions: [session({ outcome: "failed" })] })

    // Act
    const [entry] = toEntries(data, options)

    // Assert
    assert.equal(entry.signals.failed, true)
  })

  it("falls back to the model of the last reply", () => {
    // Arrange
    const data = snapshot({ sessions: [session({ model: undefined })], models: { s1: "flint-40b-free" } })

    // Act
    const [entry] = toEntries(data, options)

    // Assert
    assert.equal(entry.model, "flint-40b-free")
  })
})

describe("projectName", () => {
  it("falls back to the folder name when the project has no name", () => {
    assert.equal(projectName(undefined, "/home/aion/code/Alfastar"), "Alfastar")
  })
})
