// True for Safari/WebKit (desktop + iOS) but not Chromium-based browsers, which
// also carry "Safari" in their UA. Used to disable the chevron animation Safari
// cannot GPU-composite.
export function isSafariUA(ua: string): boolean {
  return /Safari/.test(ua) && !/Chrome|Chromium|Android|Edg\//.test(ua)
}

export const isSafari = (): boolean =>
  typeof navigator !== 'undefined' && isSafariUA(navigator.userAgent)
