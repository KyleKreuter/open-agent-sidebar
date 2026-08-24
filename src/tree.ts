/**
 * Tree construction for subagent nodes.
 *
 * Transforms the flat `SubagentNode` collection maintained by the tracker
 * into a nested tree by following `parentID` chains. Every node appears
 * exactly once: direct children of the current session and nodes with an
 * unknown/missing parent end up at root level; everything else is nested
 * under its parent. Input is never mutated.
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

/** True when the node is a root: parented by the root session or orphaned. */
function isRootCandidate(
  node: SubagentNode,
  knownIDs: Set<string>,
  rootSessionID: string,
): boolean {
  return node.parentID === rootSessionID || !knownIDs.has(node.parentID)
}

/**
 * Mount one node and recursively mount its children.
 *
 * `visited` tracks every mounted sessionID so malformed parent chains
 * (self-parenting, cycles) terminate instead of recursing forever.
 */
function mountNode(
  node: SubagentNode,
  nodes: SubagentNode[],
  knownIDs: Set<string>,
  visited: Set<string>,
): TreeNode {
  visited.add(node.sessionID)
  return { node, children: mountChildren(node.sessionID, nodes, knownIDs, visited) }
}

/** Collect and mount the nodes parented by `parentID`, sorted oldest first. */
function mountChildren(
  parentID: string,
  nodes: SubagentNode[],
  knownIDs: Set<string>,
  visited: Set<string>,
): TreeNode[] {
  const children: TreeNode[] = []
  for (const node of nodes) {
    if (node.parentID !== parentID || visited.has(node.sessionID)) continue
    children.push(mountNode(node, nodes, knownIDs, visited))
  }
  return children.sort(byCreatedAt)
}

/**
 * Build a nested tree from flat subagent nodes.
 *
 * Roots are direct children of the root session plus orphans (unknown or
 * missing parent). Nodes trapped in a parent cycle are unreachable from the
 * roots, so a final pass attaches them at root level — no data loss, never
 * an infinite loop.
 */
export function buildTree(nodes: SubagentNode[], rootSessionID: string): TreeNode[] {
  const knownIDs = new Set(nodes.map((node) => node.sessionID))
  const visited = new Set<string>()
  const roots: TreeNode[] = []

  for (const node of nodes) {
    if (!isRootCandidate(node, knownIDs, rootSessionID)) continue
    roots.push(mountNode(node, nodes, knownIDs, visited))
  }

  for (const node of nodes) {
    if (visited.has(node.sessionID)) continue
    roots.push(mountNode(node, nodes, knownIDs, visited))
  }

  return roots.sort(byCreatedAt)
}