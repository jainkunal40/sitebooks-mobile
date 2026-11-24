import assert from 'node:assert/strict'
import test from 'node:test'
import { daysBetween, normalizeDateInput, todayIsoDate } from './dates'

test('accepts ISO and day-first dates', () => {
  assert.equal(normalizeDateInput('2026-11-24'), '2026-11-24')
  assert.equal(normalizeDateInput('24/11/2026'), '2026-11-24')
  assert.equal(normalizeDateInput('24-11-2026'), '2026-11-24')
  assert.equal(normalizeDateInput(' 2026-01-05 '), '2026-01-05')
})

test('rejects impossible or malformed dates', () => {
  assert.equal(normalizeDateInput('2026-02-30'), null)
  assert.equal(normalizeDateInput('2026-13-01'), null)
  assert.equal(normalizeDateInput('31/02/2026'), null)
  assert.equal(normalizeDateInput('not a date'), null)
  assert.equal(normalizeDateInput(''), null)
})

test('today is a valid ISO date', () => {
  assert.equal(normalizeDateInput(todayIsoDate()), todayIsoDate())
})

test('daysBetween is inclusive and rejects reversed ranges', () => {
  assert.equal(daysBetween('2026-11-01', '2026-11-01'), 1)
  assert.equal(daysBetween('2026-11-01', '2026-11-30'), 30)
  assert.equal(daysBetween('2026-09-15', '2026-09-21'), 7)
  assert.equal(daysBetween('2026-11-30', '2026-11-01'), null)
  assert.equal(daysBetween(null, '2026-11-01'), null)
})
