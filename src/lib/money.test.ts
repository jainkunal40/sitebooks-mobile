import assert from 'node:assert/strict'
import test from 'node:test'
import { formatINR, formatINRCompact, parseAmount } from './money'

test('groups digits the Indian way', () => {
  assert.equal(formatINR(0), '₹0')
  assert.equal(formatINR(999), '₹999')
  assert.equal(formatINR(1234), '₹1,234')
  assert.equal(formatINR(45000), '₹45,000')
  assert.equal(formatINR(123456), '₹1,23,456')
  assert.equal(formatINR(12345678), '₹1,23,45,678')
})

test('keeps the rupee sign and sign separate', () => {
  assert.equal(formatINR(-2500), '−₹2,500')
  assert.equal(formatINR(-123456), '−₹1,23,456')
})

test('supports optional decimals', () => {
  assert.equal(formatINR(1234.5, { decimals: true }), '₹1,234.50')
})

test('compact form uses lakh and crore', () => {
  assert.equal(formatINRCompact(45000), '₹45,000')
  assert.equal(formatINRCompact(150000), '₹1.50L')
  assert.equal(formatINRCompact(25000000), '₹2.50Cr')
})

test('parses messy user input', () => {
  assert.equal(parseAmount('₹1,23,456'), 123456)
  assert.equal(parseAmount(' 45000 '), 45000)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('abc'), null)
})
