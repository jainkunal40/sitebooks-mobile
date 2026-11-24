/**
 * Pairing links and QR codes.
 *
 * An invite is small enough to travel inside a QR code or a deep link, which
 * avoids emailing a file just to pair a phone. The payload is the signed pack
 * itself, so scanning or tapping a link is equivalent to opening the file:
 * same signature, same one-time code.
 *
 * URL-safe base64 is used because query strings turn `+` into a space.
 */
import { decodeBase64UrlText, encodeBase64UrlText } from './base64'
import { parsePack, type Pack } from './pack'

export const PAIR_LINK_PREFIX = 'sitebooks://pair?d='

export function packToPairLink(pack: Pack): string {
  return PAIR_LINK_PREFIX + encodeBase64UrlText(JSON.stringify(pack))
}

/** Decodes the `d` query parameter of a `sitebooks://pair?d=…` link. */
export function pairPayloadToPack(payload: string): Pack {
  const value = payload.trim()
  if (!value) throw new Error('This pairing link is empty.')

  let json: string
  try {
    json = decodeBase64UrlText(value)
  } catch {
    throw new Error('This pairing link is damaged.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('This pairing link is damaged.')
  }
  return parsePack(parsed)
}

export function pairLinkToPack(link: string): Pack {
  const trimmed = link.trim()
  if (!trimmed.startsWith(PAIR_LINK_PREFIX)) {
    throw new Error('This link is not a SiteBooks pairing link.')
  }
  return pairPayloadToPack(trimmed.slice(PAIR_LINK_PREFIX.length))
}
