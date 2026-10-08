import test from 'node:test'
import assert from 'node:assert/strict'
import { clampTrim, formatEditorTime } from './timelineUtils.js'

test('trim handles stay inside the file and do not cross', () => {
  assert.equal(clampTrim(-2, 0, [1, 3], 4), 0)
  assert.equal(clampTrim(4, 0, [1, 3], 4), 2.95)
  assert.equal(clampTrim(0, 1, [1, 3], 4), 1.05)
  assert.equal(clampTrim(5, 1, [1, 3], 4), 4)
  assert.equal(clampTrim(1.234, 0, [1, 3], 4), 1.23)
})

test('time labels round across minute boundaries', () => {
  assert.equal(formatEditorTime(59.999), '1:00.00')
  assert.equal(formatEditorTime(0.125), '0:00.13')
  assert.equal(formatEditorTime(3600), '60:00.00')
})
