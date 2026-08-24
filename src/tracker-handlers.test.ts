import { describe, expect, test } from "bun:test"
import type {
  EventSessionCreated,
  EventSessionIdle,
  EventSessionStatus,
  EventSessionUpdated,
  Session,
} from "@opencode-ai/sdk/v2"
import {
  createSessionCreatedHandler,
  createSessionIdleHandler,
  createSessionStatusHandler,
  createSessionUpdatedHandler,
  type TrackerStore,
} from "./tracker-handlers"
import type { SubagentNode } from "./types"

function session(partial: Partial<Session> & Pick<Session, "id" | "title">): Session {
  return {
    slug: partial.id,
    projectID: "project",
    directory: "/tmp",
    version: "1",
    time: { created: 1, updated: 1 },
    ...partial,
  }
}

function createMemoryStore(): TrackerStore & { nodes: Record<string, SubagentNode> } {
  const nodes: Record<string, SubagentNode> = {}
  return {
    nodes,
    has: (sessionID) => sessionID in nodes,
    get: (sessionID) => nodes[sessionID],
    upsert: (sessionID, node) => {
      nodes[sessionID] = node
    },
    patch: (sessionID, patch) => {
      const current = nodes[sessionID]
      if (current === undefined) return
      nodes[sessionID] = { ...current, ...patch }
    },
    removeSubtree: (sessionID) => {
      delete nodes[sessionID]
    },
  }
}

describe("createSessionCreatedHandler", () => {
  test("inserts a child session as running", () => {
    const store = createMemoryStore()
    const handle = createSessionCreatedHandler(store)

    handle({
      id: "evt",
      type: "session.created",
      properties: {
        sessionID: "child",
        info: session({
          id: "child",
          parentID: "root",
          title: "Fix sidebar (@coder subagent)",
          agent: "coder",
        }),
      },
    } satisfies EventSessionCreated)

    expect(store.nodes.child?.status).toBe("running")
    expect(store.nodes.child?.parentID).toBe("root")
    expect(store.nodes.child?.description).toBe("Fix sidebar")
  })

  test("ignores root sessions without a parent", () => {
    const store = createMemoryStore()
    const handle = createSessionCreatedHandler(store)

    handle({
      id: "evt",
      type: "session.created",
      properties: {
        sessionID: "root",
        info: session({ id: "root", title: "Root" }),
      },
    } satisfies EventSessionCreated)

    expect(store.nodes).toEqual({})
  })
})

describe("createSessionUpdatedHandler", () => {
  test("inserts a missing child session", () => {
    const store = createMemoryStore()
    const handle = createSessionUpdatedHandler(store)

    handle({
      id: "evt",
      type: "session.updated",
      properties: {
        sessionID: "child",
        info: session({
          id: "child",
          parentID: "root",
          title: "Missed create (@explore subagent)",
          agent: "explore",
        }),
      },
    } satisfies EventSessionUpdated)

    expect(store.nodes.child?.status).toBe("running")
    expect(store.nodes.child?.agent).toBe("explore")
  })

  test("patches title fields of an existing node", () => {
    const store = createMemoryStore()
    store.upsert("child", {
      sessionID: "child",
      parentID: "root",
      agent: "coder",
      description: "Old",
      title: "Old (@coder subagent)",
      status: "running",
      createdAt: 1,
    })
    const handle = createSessionUpdatedHandler(store)

    handle({
      id: "evt",
      type: "session.updated",
      properties: {
        sessionID: "child",
        info: session({
          id: "child",
          parentID: "root",
          title: "New task (@coder subagent)",
          cost: 0.12,
        }),
      },
    } satisfies EventSessionUpdated)

    expect(store.nodes.child?.description).toBe("New task")
    expect(store.nodes.child?.cost).toBe(0.12)
    expect(store.nodes.child?.status).toBe("running")
  })
})

describe("createSessionStatusHandler", () => {
  test("marks a tracked session done when the host reports idle", () => {
    const store = createMemoryStore()
    store.upsert("child", {
      sessionID: "child",
      parentID: "root",
      agent: "coder",
      description: "Task",
      title: "Task (@coder subagent)",
      status: "running",
      createdAt: 1,
      activity: "bash",
      activityCallID: "call-1",
    })
    const handle = createSessionStatusHandler(store)

    handle({
      id: "evt",
      type: "session.status",
      properties: {
        sessionID: "child",
        status: { type: "idle" },
      },
    } satisfies EventSessionStatus)

    expect(store.nodes.child?.status).toBe("done")
    expect(store.nodes.child?.activity).toBeUndefined()
  })
})

describe("createSessionIdleHandler", () => {
  test("marks a tracked session done on session.idle", () => {
    const store = createMemoryStore()
    store.upsert("child", {
      sessionID: "child",
      parentID: "root",
      agent: "coder",
      description: "Task",
      title: "Task (@coder subagent)",
      status: "running",
      createdAt: 1,
    })
    const handle = createSessionIdleHandler(store)

    handle({
      id: "evt",
      type: "session.idle",
      properties: { sessionID: "child" },
    } satisfies EventSessionIdle)

    expect(store.nodes.child?.status).toBe("done")
  })
})
