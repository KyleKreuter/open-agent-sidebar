/**
 * Tree construction for subagent nodes.
 *
 * Transforms the flat `SubagentNode` collection maintained by the tracker
 * into a nested tree by following `parentID` chains. Only nodes whose
 * ancestor chain reaches the root session are included; nodes belonging to
 * other root sessions are excluded entirely. Finished (`done`) nodes are
 * omitted by default and their active descendants are hoisted. Pass
 * `{ includeDone: true }` to keep finished nodes (used by the session picker).
 * Input is never mutated.
 */

import type { SubagentNode } from "./types"

/**
 * Tree node wrapping a subagent together with its nested descendants.
 */
export interface TreeNode {
  /** The subagent this tree node represents. */
  node: SubagentNode
  /** Subagents spawned by this node, oldest first. */
  children: TreeNode[]
}

/** Deterministic sibling order: oldest subagent first. */
function byCreatedAt(a: TreeNode, b: TreeNode): number {
  return a.node.createdAt - b.node.createdAt
}

/**
 * Build a nested tree from flat subagent nodes.
 *
 * Nodes are grouped once by `parentID` into an index, then mounted
 * recursively starting from the root session. `visited` tracks every mounted
 * sessionID so malformed parent chains (self-parenting, cycles) terminate
 * instead of recursing forever. Nodes not reachable from the root session
 * belong to other root sessions and are excluded. Finished (`done`) nodes are
 * omitted unless `includeDone` is set; their still-active descendants are
 * hoisted to the nearest visible ancestor so nested work stays visible after
 * a parent completes.
 */
export interface BuildTreeOptions {
  /** When true, finished nodes stay in the tree instead of being hoisted away. */
  includeDone?: boolean
}

export function buildTree(nodes: SubagentNode[], rootSessionID: string, options: BuildTreeOptions = {}): TreeNode[] {
  const byParent = new Map<string, SubagentNode[]>()
  for (const node of nodes) {
    const siblings = byParent.get(node.parentID)
    if (siblings === undefined) {
      byParent.set(node.parentID, [node])
    } else {
      siblings.push(node)
    }
  }

  const visited = new Set<string>()

  function mount(parentID: string): TreeNode[] {
    const children: TreeNode[] = []
    for (const node of byParent.get(parentID) ?? []) {
      if (visited.has(node.sessionID)) continue
      visited.add(node.sessionID)
      const nested = mount(node.sessionID)
      if (node.status === "done" && options.includeDone !== true) {
        children.push(...nested)
        continue
      }
      children.push({ node, children: nested })
    }
    return children.sort(byCreatedAt)
  }

  return mount(rootSessionID)
}