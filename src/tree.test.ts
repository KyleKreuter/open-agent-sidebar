import { describe, expect, test } from "bun:test"
import { buildTree } from "./tree"
import type { SubagentNode, SubagentStatus } from "./types"

function node(partial: {
  sessionID: string
  parentID: string
  status?: SubagentStatus
  createdAt?: number
  agent?: string
}): SubagentNode {
  return {
    sessionID: partial.sessionID,
    parentID: partial.parentID,
    agent: partial.agent ?? "coder",
    description: partial.sessionID,
    title: `${partial.sessionID} (@coder subagent)`,
    status: partial.status ?? "running",
    createdAt: partial.createdAt ?? 1,
  }
}

describe("buildTree", () => {
  test("omits finished nodes from the visible tree", () => {
    const tree = buildTree(
      [
        node({ sessionID: "child-a", parentID: "root", status: "running", createdAt: 1 }),
        node({ sessionID: "child-b", parentID: "root", status: "done", createdAt: 2 }),
      ],
      "root",
    )

    expect(tree.map((item) => item.node.sessionID)).toEqual(["child-a"])
  })

  test("hoists running children of a finished parent", () => {
    const tree = buildTree(
      [
        node({ sessionID: "parent", parentID: "root", status: "done", createdAt: 1 }),
        node({ sessionID: "nested", parentID: "parent", status: "running", createdAt: 2 }),
      ],
      "root",
    )

    expect(tree.map((item) => item.node.sessionID)).toEqual(["nested"])
    expect(tree[0]?.children).toEqual([])
  })

  test("keeps error and retry nodes visible", () => {
    const tree = buildTree(
      [
        node({ sessionID: "retrying", parentID: "root", status: "retry", createdAt: 1 }),
        node({ sessionID: "failed", parentID: "root", status: "error", createdAt: 2 }),
      ],
      "root",
    )

    expect(tree.map((item) => item.node.sessionID)).toEqual(["retrying", "failed"])
  })

  test("excludes nodes that belong to another root session", () => {
    const tree = buildTree(
      [node({ sessionID: "other-child", parentID: "other-root", status: "running" })],
      "root",
    )

    expect(tree).toEqual([])
  })

  test("includeDone keeps finished nodes in the tree", () => {
    const tree = buildTree(
      [
        node({ sessionID: "child-a", parentID: "root", status: "running", createdAt: 1 }),
        node({ sessionID: "child-b", parentID: "root", status: "done", createdAt: 2 }),
      ],
      "root",
      { includeDone: true },
    )

    expect(tree.map((item) => item.node.sessionID)).toEqual(["child-a", "child-b"])
  })
})
