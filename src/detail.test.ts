import { describe, expect, test } from "bun:test"
import { pickerNodes } from "./detail"
import type { Tracker } from "./tracker"
import type { SubagentNode } from "./types"

function node(partial: Pick<SubagentNode, "sessionID" | "parentID" | "status">): SubagentNode {
  return {
    sessionID: partial.sessionID,
    parentID: partial.parentID,
    agent: "coder",
    description: partial.sessionID,
    title: `${partial.sessionID} (@coder subagent)`,
    status: partial.status,
    createdAt: 1,
  }
}

function tracker(nodes: SubagentNode[], root?: string): Tracker {
  const record = Object.fromEntries(nodes.map((item) => [item.sessionID, item]))
  return {
    nodes: record,
    observe: () => {},
    currentRoot: () => root,
  }
}

describe("pickerNodes", () => {
  test("includes finished subagents of the observed root", () => {
    const result = pickerNodes(
      tracker(
        [
          node({ sessionID: "active", parentID: "root", status: "running" }),
          node({ sessionID: "finished", parentID: "root", status: "done" }),
          node({ sessionID: "other", parentID: "other-root", status: "running" }),
        ],
        "root",
      ),
    )

    expect(result.map((item) => item.sessionID)).toEqual(["active", "finished"])
  })

  test("returns all nodes when no root is observed", () => {
    const result = pickerNodes(
      tracker([
        node({ sessionID: "a", parentID: "root", status: "done" }),
        node({ sessionID: "b", parentID: "other", status: "running" }),
      ]),
    )

    expect(result.map((item) => item.sessionID).toSorted()).toEqual(["a", "b"])
  })
})
