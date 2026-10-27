import assert from 'node:assert/strict'
import { categoryOf, summarizeErrors } from '../hooks/errors.js'

const report = summarizeErrors({
  spans: [
    { kind: 'api', name: 'sonnet', label: 'private prompt', status: 'error', start: 0, end: 500 },
    { kind: 'mcp', name: 'github·search', label: 'secret query', status: 'error', start: 0, end: 2000 },
    { kind: 'tool', name: 'Bash', label: 'token=secret', status: 'denied', start: 0, end: 20 },
    { kind: 'tool', name: 'Read', label: '/secret/path', status: 'ok', start: 0, end: 20 },
  ],
  hooks: [{ event: 'Stop', label: 'secret reason', status: 'blocked', start: 0, end: 70 }],
})
assert.equal(report.total, 4)
assert.deepEqual(report.byCategory, { model: 1, mcp: 1, permission: 2 })
assert.equal(categoryOf({ kind: 'web', status: 'error' }), 'web')
const encoded = JSON.stringify(report)
for (const raw of ['private prompt', 'secret query', 'token=secret', '/secret/path', 'secret reason']) assert.ok(!encoded.includes(raw))
console.log('errors: all checks passed')
