import assert from 'node:assert/strict'
import test from 'node:test'
import { bytesToBase64Url, base64UrlToBytes } from './base64'
import { PACK_VERSION, signPack } from './pack'
import { PAIR_LINK_PREFIX, packToPairLink, pairLinkToPack, pairPayloadToPack } from './qr'
import { bytesToHex, hexToBytes, publicKeyFromSecret } from './crypto'

const SECRET = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
const PUBLIC = bytesToHex(publicKeyFromSecret(SECRET))

function makePack() {
  return signPack(
    {
      v: PACK_VERSION,
      id: 'pck_qr_test',
      kind: 'invite',
      sender: { id: 'usr_1', name: 'Ratandeep', publicKey: PUBLIC },
      recipientId: 'cli_1',
      createdAt: '2026-11-24T10:00:00.000Z',
      payload: {
        clientId: 'cli_1',
        clientName: 'Kunal',
        ownerPublicKey: PUBLIC,
        ownerName: 'Ratandeep',
        pairingCode: 'SB-AAAA-BBBB',
      },
    },
    SECRET
  )
}

test('url-safe base64 avoids characters that break query strings', () => {
  const bytes = new Uint8Array([251, 255, 254, 190, 63])
  const encoded = bytesToBase64Url(bytes)
  assert.doesNotMatch(encoded, /[+/=]/)
  assert.deepEqual([...base64UrlToBytes(encoded)], [...bytes])
})

test('invite round-trips through a link', () => {
  const pack = makePack()
  const link = packToPairLink(pack)
  assert.ok(link.startsWith(PAIR_LINK_PREFIX))
  assert.deepEqual(pairLinkToPack(link), pack)
})

test('payload can be decoded directly (deep-link param)', () => {
  const pack = makePack()
  const link = packToPairLink(pack)
  const payload = link.slice(PAIR_LINK_PREFIX.length)
  assert.deepEqual(pairPayloadToPack(payload), pack)
})

test('rejects unrelated links and damaged payloads', () => {
  assert.throws(() => pairLinkToPack('https://example.com'), /not a SiteBooks pairing link/)
  assert.throws(() => pairPayloadToPack('!!!not-base64!!!'), /damaged|malformed/)
})
