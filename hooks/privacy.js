// Copyright 2026 Neural Seam
// SPDX-License-Identifier: Apache-2.0

const hidden = '[REDACTED]'

const freshReport = () => ({ schemaVersion: 1, replacements: 0, byClass: {} })
const count = (report, kind) => {
  report.replacements++
  report.byClass[kind] = (report.byClass[kind] ?? 0) + 1
}

const secretValue = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;"']+)`
const replaceValue = (prefix, value) => {
  const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : ''
  return `${prefix}${quote}${hidden}${quote}`
}

const rules = [
  {
    kind: 'authorization',
    re: new RegExp(`(\\bauthorization\\s*[:=]\\s*(?:bearer|basic)\\s+)(${secretValue})`, 'gi'),
    replace: (m, prefix, value) => replaceValue(prefix, value),
  },
  {
    kind: 'cli_flag',
    re: new RegExp(`(\\B--(?:access-token|api-key|auth-token|password|passwd|secret|token)(?:=|\\s+))(${secretValue})`, 'gi'),
    replace: (m, prefix, value) => replaceValue(prefix, value),
  },
  {
    kind: 'url_query',
    re: /([?&](?:access_token|api_key|auth|key|password|secret|token)=)([^&#\s]+)/gi,
    replace: (m, prefix) => `${prefix}${hidden}`,
  },
  {
    kind: 'assignment',
    re: new RegExp(`(["']?)([A-Za-z0-9_.-]*(?:ACCESS_TOKEN|API_KEY|AUTH_KEY|CLIENT_SECRET|PASSWORD|PASSWD|PRIVATE_KEY|SECRET|TOKEN)[A-Za-z0-9_.-]*)\\1(\\s*[:=]\\s*)(${secretValue})`, 'gi'),
    replace: (m, keyQuote, key, sep, value) => `${keyQuote}${key}${keyQuote}${replaceValue(sep, value)}`,
  },
  {
    kind: 'credential_phrase',
    re: new RegExp(`(\\b(?:api[ _-]?key|password|passwd|secret|token)\\s+(?:is\\s+)?)(${secretValue})`, 'gi'),
    replace: (m, prefix, value) => replaceValue(prefix, value),
  },
  {
    kind: 'known_token',
    re: /\b(?:github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g,
    replace: () => hidden,
  },
]

export function redactText(input, report = freshReport()) {
  let text = String(input ?? '')
  for (const rule of rules) {
    text = text.replace(rule.re, (...args) => {
      count(report, rule.kind)
      return rule.replace(...args)
    })
  }
  return { text, report }
}

function sanitize(value, report, seen) {
  if (typeof value === 'string') return redactText(value, report).text
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  const out = Array.isArray(value)
    ? value.map((item) => sanitize(item, report, seen))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [redactText(key, report).text, sanitize(item, report, seen)]))
  seen.delete(value)
  return out
}

export function sanitizePersistent(value) {
  const report = freshReport()
  return { value: sanitize(value, report, new WeakSet()), report }
}
