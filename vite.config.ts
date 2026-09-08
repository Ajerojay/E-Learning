import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const cp1252Bytes: Record<number, number> = {
  0x81: 0x81, 0x8d: 0x8d, 0x8f: 0x8f, 0x90: 0x90, 0x9d: 0x9d,
  0x152: 0x8c, 0x153: 0x9c, 0x160: 0x8a, 0x161: 0x9a, 0x178: 0x9f,
  0x192: 0x83, 0x17d: 0x8e, 0x17e: 0x9e, 0x2013: 0x96, 0x2014: 0x97,
  0x2018: 0x91, 0x2019: 0x92, 0x201a: 0x82, 0x201c: 0x93, 0x201d: 0x94,
  0x2020: 0x86, 0x2021: 0x87, 0x2022: 0x95, 0x2026: 0x85, 0x2030: 0x89,
  0x2039: 0x8b, 0x203a: 0x9b, 0x20ac: 0x80, 0x2122: 0x99,
}

const mojibakeReplacements: Record<string, string> = {
  "ðŸ±": "\u{1F431}", "ðŸ¶": "\u{1F436}", "ðŸ®": "\u{1F42E}",
  "ðŸ¦": "\u{1F981}", "ðŸ”": "\u{1F414}", "ðŸŽ": "\u{1F34E}",
  "ðŸ’": "\u{1F352}", "ðŸ’Ž": "\u{1F48E}", "ðŸŒ": "\u{1F34C}",
  "ðŸ”´": "\u{1F534}", "ðŸ”µ": "\u{1F535}", "ðŸŸ¡": "\u{1F7E1}",
  "ðŸŸ¢": "\u{1F7E2}", "ðŸŸ ": "\u{1F7E0}", "ðŸŸ£": "\u{1F7E3}",
  "ðŸŸ¤": "\u{1F7E4}", "ðŸ©·": "\u{1F9F7}", "ðŸ¥•": "\u{1F955}",
  "ðŸ«": "\u{1FAD0}", "ðŸƒ": "\u{1F343}", "ðŸ‡": "\u{1F347}",
  "ðŸŒ¸": "\u{1F338}", "ðŸŒ°": "\u{1F330}", "ðŸŽ¨": "\u{1F3A8}",
  "ðŸ”º": "\u{1F532}", "ðŸ”¤": "\u{1F524}", "ðŸ”¢": "\u{1F522}",
  "ðŸ—£ï¸": "\u{1F5E3}\uFE0F", "ðŸ§©": "\u{1F9E9}", "ðŸ’§": "\u{1F4A7}",
  "ðŸŽµ": "\u{1F3B5}", "ðŸ”‡": "\u{1F507}", "ðŸ”Š": "\u{1F50A}",
  "ðŸ“±": "\u{1F4F1}", "ðŸ§¸": "\u{1F9F8}", "ðŸŽ‰": "\u{1F389}",
  "ðŸŒŸ": "\u{1F31F}", "ðŸ˜Š": "\u{1F60A}", "ðŸŒˆ": "\u{1F308}",
  "ðŸ ": "\u{1F3E0}", "ðŸ‘‹": "\u{1F44B}", "ðŸ†": "\u{1F3C6}",
  "â˜€ï¸": "\u2600\uFE0F", "â˜ï¸": "\u2601\uFE0F", "â“": "\u2753",
  "â†": "\u2190", "â†»": "\u21BB", "â†’": "\u2192", "âœ…": "\u2705",
  "âœ¨": "\u2728", "â­": "\u2B50", "âš«": "\u26AB", "âšª": "\u26AA",
  "â—»ï¸": "\u25FB\uFE0F", "â±": "\u23F1", "â°": "\u23F0",
  "âŒ«": "\u232B", "âœ”": "\u2714", "âœ–": "\u2716", "âœ“": "\u2713",
  "â€”": "\u2014", "â€“": "\u2013", "â€¦": "\u2026", "â€¢": "\u2022",
}

function repairMojibake(code: string) {
  if (!/[ðâÂÃ]/.test(code)) return code

  for (const [broken, fixed] of Object.entries(mojibakeReplacements)) {
    code = code.replaceAll(broken, fixed)
  }

  const decodeToken = (token: string) => {
    const bytes: number[] = []
    for (const character of token) {
      const codePoint = character.codePointAt(0) ?? 0
      const byte = codePoint <= 0xff ? codePoint : cp1252Bytes[codePoint]
      if (byte === undefined) return token
      bytes.push(byte)
    }
    return new TextDecoder().decode(new Uint8Array(bytes))
  }

  return code.replace(/(?:ð|â|Â|Ã)[^\s"'`,;:!?()[\]{}<>]+/g, decodeToken)
}

function repairQuotedStrings(code: string) {
  return code.replace(/(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g, (match, quote, value) => {
    const repaired = repairMojibake(value)
    return repaired === value ? match : `${quote}${repaired}${quote}`
  })
}

const repairMobileEncoding = {
  name: 'repair-mobile-encoding',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    const normalizedId = id.replaceAll('\\', '/')
    if (!normalizedId.includes('/src/MobileApp/') || !/\.(tsx|ts)$/.test(normalizedId)) return null
    const repaired = repairQuotedStrings(code)
    return repaired === code ? null : { code: repaired, map: null }
  },
  generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk' && output.code) {
        output.code = repairMojibake(output.code)
      }
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs so images/fonts/JS load inside the Capacitor Android WebView.
  base: './',
  plugins: [
    repairMobileEncoding,
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
})
