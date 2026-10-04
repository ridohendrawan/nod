import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { base64url, randomToken, sha256Hex } from '../shared/encoding.ts'

describe('base64url', () => {
  it("matches Node's encoder for every length from 0 to 64 bytes", () => {
    for (let len = 0; len <= 64; len++) {
      const bytes = new Uint8Array(len)
      crypto.getRandomValues(bytes)
      expect(base64url(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
    }
  })

  it('uses the URL-safe alphabet and no padding', () => {
    expect(base64url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_')
    expect(base64url(new Uint8Array([1]))).toBe('AQ')
  })
})

describe('randomToken', () => {
  it('gives 22 characters for an owner token (16 bytes) and 43 for a device secret (32 bytes)', () => {
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomToken(16)))
    expect(seen.size).toBe(200)
  })
})

describe('sha256Hex', () => {
  it('matches the FIPS 180-2 test vector', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it("hashes UTF-8, matching Node's crypto (true minus, en dash, curly quote)", async () => {
    for (const text of ['−$400', 'Sarah’s kitchen', '55320–55329']) {
      expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    }
  })
})
