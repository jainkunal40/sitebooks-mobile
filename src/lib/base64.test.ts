import assert from 'node:assert/strict'
import test from 'node:test'
import { fromUtf8, utf8 } from './crypto'
import { base64ToBytes, bytesToBase64, decodeBase64Text, encodeBase64Text } from './base64'

test('utf8 round-trips ascii, accents, rupee and emoji', () => {
  for (const sample of ['hello', 'Jain Pariwar', '₹1,23,456', 'café', '🚧🏠', 'कुणाल']) {
    assert.equal(fromUtf8(utf8(sample)), sample)
  }
})

test('base64 matches known vectors', () => {
  assert.equal(bytesToBase64(utf8('')), '')
  assert.equal(bytesToBase64(utf8('f')), 'Zg==')
  assert.equal(bytesToBase64(utf8('fo')), 'Zm8=')
  assert.equal(bytesToBase64(utf8('foo')), 'Zm9v')
  assert.equal(bytesToBase64(utf8('foobar')), 'Zm9vYmFy')
})

test('base64 decodes back to the same bytes', () => {
  const source = utf8('sitebooks://pair?d=₹')
  assert.equal(fromUtf8(base64ToBytes(bytesToBase64(source))), fromUtf8(source))
})

test('text helpers round-trip unicode', () => {
  const value = '{"amount":45000,"note":"कुणाल 🏠"}'
  assert.equal(decodeBase64Text(encodeBase64Text(value)), value)
})
