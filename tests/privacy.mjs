import assert from 'node:assert/strict'
import { redactText, sanitizePersistent } from '../hooks/privacy.js'

const canaries = [
  'Authorization: Bearer abc.def.ghi',
  'curl --token github_pat_1234567890abcdef',
  'https://example.test/x?access_token=topsecret&ok=1',
  'API_KEY=sk-1234567890abcdefghijkl',
  '{"client_secret":"dont-store-me"}',
  '{"password":"correct horse battery staple"}',
  "CLIENT_SECRET='quoted assignment with spaces'",
  'curl --password "cli value with spaces"',
  'Authorization: Bearer "quoted bearer value"',
  'deploy with password hunter2',
]
const { value, report } = sanitizePersistent({ prompt: canaries.join('\n'), path: 'src/auth/tokenizer.ts' })
for (const secret of ['abc.def.ghi', 'github_pat_', 'topsecret', 'sk-123', 'dont-store-me', 'correct horse', 'quoted assignment', 'cli value', 'quoted bearer', 'hunter2']) {
  assert.ok(!JSON.stringify(value).includes(secret), `${secret} was not redacted`)
}
assert.equal(value.path, 'src/auth/tokenizer.ts', 'benign paths survive')
assert.ok(report.replacements >= canaries.length)
assert.ok(!JSON.stringify(sanitizePersistent({ 'API_KEY=key-secret-value': 'ok' }).value).includes('key-secret-value'), 'object keys are redacted')
assert.equal(redactText('npm test').text, 'npm test')
console.log('privacy: all checks passed')
