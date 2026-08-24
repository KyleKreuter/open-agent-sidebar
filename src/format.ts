/**
 * Pure formatting helpers for the open-agent-sidebar plugin.
 * Side-effect free so they can be unit-tested and reused by sidebar + detail.
 */

import type { SubagentStatus } from "./types"

/** Title shape: "<description> (@<agent> subagent)". */
const TITLE_PATTERN = /^(.+?)\s+\(@([^)]+)\s+subagent\)$/
const FALLBACK_AGENT = "agent"
const PLACEHOLDER = "—"

/** Token counts reported by the host for a session. */
export interface TokenCounts {
  input?: number
  output?: number
  reasoning?: number
  cache?: number
}

/** Parse a session title into description + agent; falls back gracefully, never throws. */
export function parseTitle(title: string): { description: string; agent: string } {
  const match = TITLE_PATTERN.exec(title)
  if (match === null) {
    return { description: title, agent: FALLBACK_AGENT }
  }
  const description = match[1]?.trim() ?? title
  const agent = match[2]?.trim() ?? FALLBACK_AGENT
  return { description, agent }
}

/** Return a distinct glyph for each subagent lifecycle status. */
export function statusIcon(status: SubagentStatus): string {
  switch (status) {
    case "running":
      return "●"
    case "retry":
      return "↻"
    case "done":
      return "✓"
    case "error":
      return "✕"
    default:
      return "?"
  }
}

/** Render a USD cost, or a placeholder when the cost is unknown. */
export function formatCost(cost?: number): string {
  if (cost === undefined || !Number.isFinite(cost)) {
    return PLACEHOLDER
  }
  return `$${cost.toFixed(4)}`
}

/** Render a token count compactly, e.g. 1500 -> "1.5k". */
function compact(value: number): string {
  if (!Number.isFinite(value)) {
    return PLACEHOLDER
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  return String(value)
}

/** Render token counts compactly, or a placeholder when none are present. */
export function formatTokens(tokens?: TokenCounts): string {
  if (tokens === undefined) {
    return PLACEHOLDER
  }
  const parts: string[] = []
  if (tokens.input !== undefined) {
    parts.push(`in ${compact(tokens.input)}`)
  }
  if (tokens.output !== undefined) {
    parts.push(`out ${compact(tokens.output)}`)
  }
  if (tokens.reasoning !== undefined) {
    parts.push(`re ${compact(tokens.reasoning)}`)
  }
  if (tokens.cache !== undefined) {
    parts.push(`cache ${compact(tokens.cache)}`)
  }
  if (parts.length === 0) {
    return PLACEHOLDER
  }
  return parts.join(" · ")
}