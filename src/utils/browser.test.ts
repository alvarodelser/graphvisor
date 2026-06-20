import { describe, it, expect } from 'vitest'
import { isSafariUA } from './browser'

const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0'
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'

describe('isSafariUA', () => {
  it('is true for desktop and iOS Safari', () => {
    expect(isSafariUA(SAFARI_MAC)).toBe(true)
    expect(isSafariUA(SAFARI_IOS)).toBe(true)
  })

  it('is false for Chromium browsers that also carry "Safari" in the UA', () => {
    expect(isSafariUA(CHROME_MAC)).toBe(false)
    expect(isSafariUA(EDGE)).toBe(false)
  })

  it('is false for Firefox', () => {
    expect(isSafariUA(FIREFOX)).toBe(false)
  })
})
