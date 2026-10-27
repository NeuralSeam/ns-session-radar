// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

const failed = (item) => ['error', 'denied', 'blocked', 'interrupted'].includes(item.status)
const durationBucket = (ms) => (ms < 1000 ? '<1s' : ms < 10_000 ? '1-10s' : ms < 60_000 ? '10-60s' : '>=60s')
const safeOperation = (item) => String(item.tool ?? item.name ?? item.event ?? 'unknown').replace(/[^A-Za-z0-9_.·:-]/g, '').slice(0, 80) || 'unknown'

export function categoryOf(item) {
  if (item.event) return item.status === 'blocked' ? 'permission' : 'hook'
  if (item.status === 'denied') return 'permission'
  if (item.kind === 'api') return 'model'
  if (item.kind === 'mcp') return 'mcp'
  if (item.kind === 'web') return 'web'
  if (item.kind === 'agent') return 'agent'
  if (item.kind === 'tool') return 'tool'
  return 'unknown'
}

export function summarizeErrors({ spans = [], hooks = [] } = {}) {
  const items = [...spans, ...hooks].filter((item) => item.end && failed(item))
  const out = { schemaVersion: 1, total: items.length, byCategory: {}, byOperation: {}, byStatus: {}, byDuration: {} }
  for (const item of items) {
    const category = categoryOf(item)
    const operation = `${category}:${safeOperation(item)}`
    const status = item.status
    const bucket = durationBucket(Math.max(0, item.end - item.start))
    out.byCategory[category] = (out.byCategory[category] ?? 0) + 1
    out.byOperation[operation] = (out.byOperation[operation] ?? 0) + 1
    out.byStatus[status] = (out.byStatus[status] ?? 0) + 1
    out.byDuration[bucket] = (out.byDuration[bucket] ?? 0) + 1
  }
  return out
}
