import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, hexToBytes } from './crypto'
import {
  PACK_VERSION,
  decodePackFile,
  encodePackFile,
  packFingerprint,
  signPack,
  verifyPack,
  verifyPackSignature,
  type Pack,
  type UnsignedPack,
} from './pack'

const SECRET = hexToBytes(
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
)
const OTHER_SECRET = hexToBytes(
  '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb'
)

function unsigned(overrides: Partial<UnsignedPack> = {}): UnsignedPack {
  return {
    v: PACK_VERSION,
    id: 'cpk_test_1',
    kind: 'invite',
    sender: { id: 'owner_1', name: 'Ratandeep', publicKey: '' },
    recipientId: null,
    createdAt: '2026-11-24T10:00:00.000Z',
    payload: { note: 'hello' },
    ...overrides,
  }
}

async function buildPack(overrides: Partial<UnsignedPack> = {}): Promise<Pack> {
  const { publicKeyFromSecret, bytesToHex } = await import('./crypto')
  const pub = bytesToHex(publicKeyFromSecret(SECRET))
  return signPack(unsigned({ sender: { id: 'owner_1', name: 'Ratandeep', publicKey: pub }, ...overrides }), SECRET)
}

test('canonicalize is key-order independent and drops undefined', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }))
  assert.equal(canonicalize({ a: 1, b: undefined }), canonicalize({ a: 1 }))
  assert.equal(canonicalize({ a: [1, { z: 1, y: 2 }] }), '{"a":[1,{"y":2,"z":1}]}')
})

test('a signed pack verifies against the sender public key', async () => {
  const pack = await buildPack()
  assert.equal(verifyPackSignature(pack), true)
  assert.equal(verifyPack(pack, [pack.sender.publicKey]), true)
})

test('tampering with the payload invalidates the signature', async () => {
  const pack = await buildPack()
  const tampered: Pack = { ...pack, payload: { note: 'pay me more' } }
  assert.equal(verifyPackSignature(tampered), false)
})

test('a valid signature from an untrusted key is still rejected', async () => {
  const pack = await buildPack()
  const stranger = 'f'.repeat(64)
  assert.equal(verifyPack(pack, [stranger]), false)
})

test('a pack signed by a different key fails verification', async () => {
  const { publicKeyFromSecret, bytesToHex } = await import('./crypto')
  const pub = bytesToHex(publicKeyFromSecret(SECRET))
  const pack = signPack(
    unsigned({ sender: { id: 'owner_1', name: 'Ratandeep', publicKey: pub } }),
    OTHER_SECRET
  )
  assert.equal(verifyPackSignature(pack), false)
})

test('signature covers the recipient so a pack cannot be re-addressed', async () => {
  const pack = await buildPack({ recipientId: 'client_1' })
  const readdressed: Pack = { ...pack, recipientId: 'client_2' }
  assert.equal(verifyPackSignature(readdressed), false)
})

test('file round-trips through encode/decode', async () => {
  const pack = await buildPack()
  const decoded = decodePackFile(encodePackFile(pack))
  assert.deepEqual(decoded, pack)
  assert.equal(verifyPackSignature(decoded), true)
})

test('decode rejects foreign files and edited JSON', async () => {
  assert.throws(() => decodePackFile('{"hello":1}'), /not a SiteBooks share file/)
  assert.throws(() => decodePackFile('not json'), /not a SiteBooks share file/)
  const pack = await buildPack()
  const edited = JSON.parse(encodePackFile(pack))
  edited.pack.sig = 'zz'
  assert.throws(() => decodePackFile(JSON.stringify(edited)), /malformed or was edited/)
})

test('fingerprint is stable and content-addressed', async () => {
  const a = await buildPack()
  const b = structuredClone(a)
  assert.equal(packFingerprint(a), packFingerprint(b))
  const c: Pack = { ...a, payload: { note: 'different' } }
  assert.notEqual(packFingerprint(a), packFingerprint(c))
})
