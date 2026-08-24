/**
 * Core data model for the open-agent-sidebar plugin.
 *
 * A subagent is a child session spawned by the `task` tool. The tracker
 * stores one SubagentNode per child session, keyed by sessionID, and the
 * sidebar renders these nodes as a nested tree via parentID chains.
 */

/**
 * Lifecycle status of a subagent.
 *
 * - "running": the subagent is actively executing (busy).
 * - "retry":   the subagent is waiting for a retry (SessionStatus "retry").
 * - "done":    the subagent finished and remains visible for the session.
 * - "error":   the subagent failed (SessionStatus "error").
 */
export type SubagentStatus = "running" | "retry" | "done" | "error"

/**
 * A single subagent in the current session.
 *
 * `agent` and `description` are parsed from the session title, which follows
 * the format "<description> (@<agent> subagent)". `parentID` links a node to
 * its spawning session, enabling nested tree construction.
 */
export interface SubagentNode {
  /** Unique identifier of the child session. */
  sessionID: string
  /** Identifier of the session that spawned this subagent. */
  parentID: string
  /** Agent type parsed from the title, e.g. "coder". */
  agent: string
  /** Human-readable task description parsed from the title. */
  description: string
  /** Full session title as reported by the host. */
  title: string
  /** Current lifecycle status of the subagent. */
  status: SubagentStatus
  /** Unix timestamp (ms) when the subagent was created. */
  createdAt: number
  /** Currently running tool, derived from message.part.updated events. */
  activity?: string
  /** callID of the tool owning the displayed activity. */
  activityCallID?: string
  /** Todo progress derived from todo.updated events. */
  todos?: { done: number; total: number }
  /** Accumulated cost of the subagent in USD. */
  cost?: number
}