// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

// What the radar keeps in the session through $.state, so a reload of the mod carries on from it:
// everything it recorded (the same fields as the export), held by Claude Code until the session ends.
export type SessionRadarSaved = {
  v: 1
  savedAt: number
  seq: number
  S: {
    id: string
    startedAt: number
    maxCtxPct: number
    spans: Record<string, unknown>[]
    agents: Record<string, unknown>[]
    turns: Record<string, unknown>[]
    turnSeq: number
    ttlSeen: boolean
    totals: Record<string, number>
  }
}

declare module 'claude-code' {
  interface PluginState {
    'session-radar': { session: SessionRadarSaved }
  }
}
