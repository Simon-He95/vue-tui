import { Buffer as Buffer$1 } from 'node:buffer'
import { EventEmitter } from 'node:events'
const ANSI_BACKGROUND_OFFSET = 10
const wrapAnsi16 =
  (offset = 0) =>
  (code) =>
    `\x1B[${code + offset}m`
const wrapAnsi256 =
  (offset = 0) =>
  (code) =>
    `\x1B[${38 + offset};5;${code}m`
const wrapAnsi16m =
  (offset = 0) =>
  (red, green, blue) =>
    `\x1B[${38 + offset};2;${red};${green};${blue}m`
const styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39],
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49],
  },
}
Object.keys(styles.modifier)
const foregroundColorNames = Object.keys(styles.color)
const backgroundColorNames = Object.keys(styles.bgColor)
;[...foregroundColorNames, ...backgroundColorNames]
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map()
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`,
      }
      group[styleName] = styles[styleName]
      codes.set(style[0], style[1])
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false,
    })
  }
  Object.defineProperty(styles, 'codes', {
    value: codes,
    enumerable: false,
  })
  styles.color.close = '\x1B[39m'
  styles.bgColor.close = '\x1B[49m'
  styles.color.ansi = wrapAnsi16()
  styles.color.ansi256 = wrapAnsi256()
  styles.color.ansi16m = wrapAnsi16m()
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET)
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET)
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET)
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16
          }
          if (red > 248) {
            return 231
          }
          return Math.round(((red - 8) / 247) * 24) + 232
        }
        return (
          16 +
          36 * Math.round((red / 255) * 5) +
          6 * Math.round((green / 255) * 5) +
          Math.round((blue / 255) * 5)
        )
      },
      enumerable: false,
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16))
        if (!matches) {
          return [0, 0, 0]
        }
        let [colorString] = matches
        if (colorString.length === 3) {
          colorString = [...colorString]
            .map((character) => character + character)
            .join('')
        }
        const integer = Number.parseInt(colorString, 16)
        return [
          /* eslint-disable no-bitwise */
          (integer >> 16) & 255,
          (integer >> 8) & 255,
          integer & 255,
          /* eslint-enable no-bitwise */
        ]
      },
      enumerable: false,
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false,
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code
        }
        if (code < 16) {
          return 90 + (code - 8)
        }
        let red
        let green
        let blue
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255
          green = red
          blue = red
        } else {
          code -= 16
          const remainder = code % 36
          red = Math.floor(code / 36) / 5
          green = Math.floor(remainder / 6) / 5
          blue = (remainder % 6) / 5
        }
        const value = Math.max(red, green, blue) * 2
        if (value === 0) {
          return 30
        }
        let result =
          30 +
          ((Math.round(blue) << 2) | (Math.round(green) << 1) | Math.round(red))
        if (value === 2) {
          result += 60
        }
        return result
      },
      enumerable: false,
    },
    rgbToAnsi: {
      value: (red, green, blue) =>
        styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false,
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false,
    },
  })
  return styles
}
const ansiStyles = assembleStyles()
function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
function keyEvent(key, code = '', mods, repeat) {
  const base = { type: 'keydown', key, code, ...mods }
  return repeat ? { ...base, repeat: true } : base
}
function modsFromXtermModifier(mod) {
  if (!mod || !Number.isFinite(mod)) return null
  const m = Math.floor(mod)
  const out2 = {}
  if (
    m === 2 ||
    m === 4 ||
    m === 6 ||
    m === 8 ||
    m === 10 ||
    m === 12 ||
    m === 14 ||
    m === 16
  )
    out2.shiftKey = true
  if (
    m === 3 ||
    m === 4 ||
    m === 7 ||
    m === 8 ||
    m === 11 ||
    m === 12 ||
    m === 15 ||
    m === 16
  )
    out2.altKey = true
  if (
    m === 5 ||
    m === 6 ||
    m === 7 ||
    m === 8 ||
    m === 13 ||
    m === 14 ||
    m === 15 ||
    m === 16
  )
    out2.ctrlKey = true
  if (m >= 9)
    out2.metaKey =
      m === 9 ||
      m === 10 ||
      m === 11 ||
      m === 12 ||
      m === 13 ||
      m === 14 ||
      m === 15 ||
      m === 16
  return Object.keys(out2).length ? out2 : null
}
function modsFromKittyMask(mask) {
  if (!Number.isFinite(mask) || mask <= 0) return null
  const m = Math.floor(mask)
  const out2 = {}
  if (m & 1) out2.shiftKey = true
  if (m & 2) out2.altKey = true
  if (m & 4) out2.ctrlKey = true
  if (m & 8) out2.metaKey = true
  if (m & 32) out2.metaKey = true
  return Object.keys(out2).length ? out2 : null
}
function modsFromKittyModifier(mod) {
  if (!mod || !Number.isFinite(mod)) return null
  const mask = Math.floor(mod) - 1
  return modsFromKittyMask(mask)
}
const KITTY_FUNCTIONAL_KEYS = {
  57344: { key: 'Escape', code: 'Escape' },
  57345: { key: 'Enter', code: 'Enter' },
  57346: { key: 'Tab', code: 'Tab' },
  57347: { key: 'Backspace', code: 'Backspace' },
  57348: { key: 'Insert', code: 'Insert' },
  57349: { key: 'Delete', code: 'Delete' },
  57350: { key: 'ArrowLeft', code: 'ArrowLeft' },
  57351: { key: 'ArrowRight', code: 'ArrowRight' },
  57352: { key: 'ArrowUp', code: 'ArrowUp' },
  57353: { key: 'ArrowDown', code: 'ArrowDown' },
  57354: { key: 'PageUp', code: 'PageUp' },
  57355: { key: 'PageDown', code: 'PageDown' },
  57356: { key: 'Home', code: 'Home' },
  57357: { key: 'End', code: 'End' },
  57358: { key: 'CapsLock', code: 'CapsLock' },
  57359: { key: 'ScrollLock', code: 'ScrollLock' },
  57360: { key: 'NumLock', code: 'NumLock' },
  57361: { key: 'PrintScreen', code: 'PrintScreen' },
  57362: { key: 'Pause', code: 'Pause' },
  57363: { key: 'ContextMenu', code: 'ContextMenu' },
  57364: { key: 'F1', code: 'F1' },
  57365: { key: 'F2', code: 'F2' },
  57366: { key: 'F3', code: 'F3' },
  57367: { key: 'F4', code: 'F4' },
  57368: { key: 'F5', code: 'F5' },
  57369: { key: 'F6', code: 'F6' },
  57370: { key: 'F7', code: 'F7' },
  57371: { key: 'F8', code: 'F8' },
  57372: { key: 'F9', code: 'F9' },
  57373: { key: 'F10', code: 'F10' },
  57374: { key: 'F11', code: 'F11' },
  57375: { key: 'F12', code: 'F12' },
  57376: { key: 'F13', code: 'F13' },
  57377: { key: 'F14', code: 'F14' },
  57378: { key: 'F15', code: 'F15' },
  57379: { key: 'F16', code: 'F16' },
  57380: { key: 'F17', code: 'F17' },
  57381: { key: 'F18', code: 'F18' },
  57382: { key: 'F19', code: 'F19' },
  57383: { key: 'F20', code: 'F20' },
  57384: { key: 'F21', code: 'F21' },
  57385: { key: 'F22', code: 'F22' },
  57386: { key: 'F23', code: 'F23' },
  57387: { key: 'F24', code: 'F24' },
  57388: { key: 'F25', code: 'F25' },
  57389: { key: 'F26', code: 'F26' },
  57390: { key: 'F27', code: 'F27' },
  57391: { key: 'F28', code: 'F28' },
  57392: { key: 'F29', code: 'F29' },
  57393: { key: 'F30', code: 'F30' },
  57394: { key: 'F31', code: 'F31' },
  57395: { key: 'F32', code: 'F32' },
  57396: { key: 'F33', code: 'F33' },
  57397: { key: 'F34', code: 'F34' },
  57398: { key: 'F35', code: 'F35' },
  57399: { key: '0', code: 'Numpad0' },
  57400: { key: '1', code: 'Numpad1' },
  57401: { key: '2', code: 'Numpad2' },
  57402: { key: '3', code: 'Numpad3' },
  57403: { key: '4', code: 'Numpad4' },
  57404: { key: '5', code: 'Numpad5' },
  57405: { key: '6', code: 'Numpad6' },
  57406: { key: '7', code: 'Numpad7' },
  57407: { key: '8', code: 'Numpad8' },
  57408: { key: '9', code: 'Numpad9' },
  57409: { key: '.', code: 'NumpadDecimal' },
  57410: { key: '/', code: 'NumpadDivide' },
  57411: { key: '*', code: 'NumpadMultiply' },
  57412: { key: '-', code: 'NumpadSubtract' },
  57413: { key: '+', code: 'NumpadAdd' },
  57414: { key: 'Enter', code: 'NumpadEnter' },
  57415: { key: '=', code: 'NumpadEqual' },
  57416: { key: ',', code: 'NumpadComma' },
  57417: { key: 'ArrowLeft', code: 'NumpadArrowLeft' },
  57418: { key: 'ArrowRight', code: 'NumpadArrowRight' },
  57419: { key: 'ArrowUp', code: 'NumpadArrowUp' },
  57420: { key: 'ArrowDown', code: 'NumpadArrowDown' },
  57421: { key: 'PageUp', code: 'NumpadPageUp' },
  57422: { key: 'PageDown', code: 'NumpadPageDown' },
  57423: { key: 'Home', code: 'NumpadHome' },
}
const KITTY_SPECIAL_KEY_RE = /^\x1b\[(\d+);(\d+):(\d+)([A-Z~])$/
const KITTY_FUNCTIONAL_KEY_TERMINATORS = {
  A: { key: 'ArrowUp', code: 'ArrowUp' },
  B: { key: 'ArrowDown', code: 'ArrowDown' },
  C: { key: 'ArrowRight', code: 'ArrowRight' },
  D: { key: 'ArrowLeft', code: 'ArrowLeft' },
  H: { key: 'Home', code: 'Home' },
  F: { key: 'End', code: 'End' },
  P: { key: 'F1', code: 'F1' },
  Q: { key: 'F2', code: 'F2' },
  R: { key: 'F3', code: 'F3' },
  S: { key: 'F4', code: 'F4' },
}
const KITTY_TILDE_KEYS = {
  1: { key: 'Home', code: 'Home' },
  2: { key: 'Insert', code: 'Insert' },
  3: { key: 'Delete', code: 'Delete' },
  4: { key: 'End', code: 'End' },
  5: { key: 'PageUp', code: 'PageUp' },
  6: { key: 'PageDown', code: 'PageDown' },
  7: { key: 'Home', code: 'Home' },
  8: { key: 'End', code: 'End' },
  11: { key: 'F1', code: 'F1' },
  12: { key: 'F2', code: 'F2' },
  13: { key: 'F3', code: 'F3' },
  14: { key: 'F4', code: 'F4' },
  15: { key: 'F5', code: 'F5' },
  17: { key: 'F6', code: 'F6' },
  18: { key: 'F7', code: 'F7' },
  19: { key: 'F8', code: 'F8' },
  20: { key: 'F9', code: 'F9' },
  21: { key: 'F10', code: 'F10' },
  23: { key: 'F11', code: 'F11' },
  24: { key: 'F12', code: 'F12' },
}
function parseEventType(eventType) {
  if (eventType === '2') return { repeat: true, release: false }
  if (eventType === '3') return { repeat: false, release: true }
  return { repeat: false, release: false }
}
function parseKittySpecialKey(sequence) {
  const match = KITTY_SPECIAL_KEY_RE.exec(sequence)
  if (!match) return { handled: false, event: null }
  const keyNumOrOne = match[1]
  const modifierStr = match[2]
  const eventTypeStr = match[3]
  const terminator = match[4]
  let mapping
  if (terminator === '~') {
    mapping = KITTY_TILDE_KEYS[keyNumOrOne]
  } else if (keyNumOrOne === '1') {
    mapping = KITTY_FUNCTIONAL_KEY_TERMINATORS[terminator]
  }
  const eventType = parseEventType(eventTypeStr)
  if (!mapping) return { handled: true, event: null }
  if (eventType.release) return { handled: true, event: null }
  const mods = modsFromKittyModifier(Number.parseInt(modifierStr, 10)) ?? void 0
  return {
    handled: true,
    event: keyEvent(mapping.key, mapping.code, mods, eventType.repeat),
  }
}
function looksLikeKittyCsiU(cp, modifier, hasColons, fieldCount) {
  if (hasColons || fieldCount > 2) return true
  if (cp >= 57344) return true
  if (modifier != null && modifier > 16) return true
  return false
}
function parseKittyCsiU(sequence) {
  const match = /^\x1b\[([^\x1b]+)u$/.exec(sequence)
  if (!match) return { handled: false, event: null }
  const params = match[1]
  const fields = params.split(';')
  const field1 = fields[0] ?? ''
  const field1Parts = field1.split(':')
  const codepointStr = field1Parts[0] ?? ''
  const cp = Number.parseInt(codepointStr, 10)
  const field2 = fields[1] ?? ''
  const field2Parts = field2.split(':')
  const modifier = field2Parts[0] ? Number.parseInt(field2Parts[0], 10) : null
  const eventTypeStr = field2Parts[1]
  const hasColons = field1Parts.length > 1 || field2Parts.length > 1
  if (!Number.isFinite(cp)) return { handled: true, event: null }
  if (!looksLikeKittyCsiU(cp, modifier, hasColons, fields.length))
    return { handled: false, event: null }
  const eventType = parseEventType(eventTypeStr)
  if (eventType.release) return { handled: true, event: null }
  const mods = modsFromKittyModifier(modifier) ?? void 0
  const functionalKey = KITTY_FUNCTIONAL_KEYS[cp]
  if (functionalKey)
    return {
      handled: true,
      event: keyEvent(
        functionalKey.key,
        functionalKey.code,
        mods,
        eventType.repeat,
      ),
    }
  if (cp === 13)
    return {
      handled: true,
      event: keyEvent('Enter', 'Enter', mods, eventType.repeat),
    }
  if (cp === 9)
    return {
      handled: true,
      event: keyEvent('Tab', 'Tab', mods, eventType.repeat),
    }
  if (cp === 27)
    return {
      handled: true,
      event: keyEvent('Escape', 'Escape', mods, eventType.repeat),
    }
  if (cp === 127)
    return {
      handled: true,
      event: keyEvent('Backspace', 'Backspace', mods, eventType.repeat),
    }
  if (cp >= 32) {
    try {
      return {
        handled: true,
        event: keyEvent(String.fromCodePoint(cp), '', mods, eventType.repeat),
      }
    } catch {
      return { handled: true, event: null }
    }
  }
  return { handled: true, event: null }
}
function parseKittySequence(sequence) {
  const special = parseKittySpecialKey(sequence)
  if (special.handled) return special
  return parseKittyCsiU(sequence)
}
function parseCsiU(parts, params) {
  if (params.includes(':')) return { handled: false, event: null }
  const cp = parts[0] ? Number.parseInt(parts[0], 10) : Number.NaN
  if (!Number.isFinite(cp)) return { handled: true, event: null }
  if (cp >= 57344) return { handled: false, event: null }
  const mod = parts[1] ? Number.parseInt(parts[1], 10) : null
  const mods = modsFromXtermModifier(mod) ?? void 0
  if (cp === 13)
    return { handled: true, event: keyEvent('Enter', 'Enter', mods) }
  if (cp === 9) return { handled: true, event: keyEvent('Tab', 'Tab', mods) }
  if (cp === 27)
    return { handled: true, event: keyEvent('Escape', 'Escape', mods) }
  if (cp === 127)
    return { handled: true, event: keyEvent('Backspace', 'Backspace', mods) }
  if (cp >= 32) {
    try {
      return {
        handled: true,
        event: keyEvent(String.fromCodePoint(cp), '', mods),
      }
    } catch {
      return { handled: true, event: null }
    }
  }
  return { handled: true, event: null }
}
function parseCsi(sequence) {
  if (!sequence.startsWith('\x1B[')) return { handled: false, event: null }
  if (sequence.length < 3) return { handled: true, event: null }
  const final = sequence[sequence.length - 1]
  const params = sequence.slice(2, -1)
  const parts = params ? params.split(';') : ['']
  if (final === 'u') return parseCsiU(parts, params)
  if (final === 'Z')
    return { handled: true, event: keyEvent('Tab', 'Tab', { shiftKey: true }) }
  const mod =
    parts.length >= 2 ? Number.parseInt(parts[parts.length - 1], 10) : null
  const mods = modsFromXtermModifier(mod) ?? void 0
  if (final === 'A')
    return { handled: true, event: keyEvent('ArrowUp', 'ArrowUp', mods) }
  if (final === 'B')
    return { handled: true, event: keyEvent('ArrowDown', 'ArrowDown', mods) }
  if (final === 'C')
    return { handled: true, event: keyEvent('ArrowRight', 'ArrowRight', mods) }
  if (final === 'D')
    return { handled: true, event: keyEvent('ArrowLeft', 'ArrowLeft', mods) }
  if (final === 'H')
    return { handled: true, event: keyEvent('Home', 'Home', mods) }
  if (final === 'F')
    return { handled: true, event: keyEvent('End', 'End', mods) }
  if (final === '~') {
    if (parts[0] === '27' && parts.length >= 3) {
      const mod2 = Number.parseInt(parts[1], 10)
      const cp = Number.parseInt(parts[2], 10)
      const mods2 = modsFromXtermModifier(mod2) ?? void 0
      if (cp === 13)
        return { handled: true, event: keyEvent('Enter', 'Enter', mods2) }
      if (cp === 9)
        return { handled: true, event: keyEvent('Tab', 'Tab', mods2) }
      if (cp === 27)
        return { handled: true, event: keyEvent('Escape', 'Escape', mods2) }
      if (cp >= 32) {
        try {
          return {
            handled: true,
            event: keyEvent(String.fromCodePoint(cp), '', mods2),
          }
        } catch {
          return { handled: true, event: null }
        }
      }
      return { handled: true, event: null }
    }
    const keyCode = parts[0] ? Number.parseInt(parts[0], 10) : Number.NaN
    if (keyCode === 1 || keyCode === 7)
      return { handled: true, event: keyEvent('Home', 'Home', mods) }
    if (keyCode === 4 || keyCode === 8)
      return { handled: true, event: keyEvent('End', 'End', mods) }
    if (keyCode === 2)
      return { handled: true, event: keyEvent('Insert', 'Insert', mods) }
    if (keyCode === 3)
      return { handled: true, event: keyEvent('Delete', 'Delete', mods) }
    if (keyCode === 5)
      return { handled: true, event: keyEvent('PageUp', 'PageUp', mods) }
    if (keyCode === 6)
      return { handled: true, event: keyEvent('PageDown', 'PageDown', mods) }
    if (keyCode === 11)
      return { handled: true, event: keyEvent('F1', 'F1', mods) }
    if (keyCode === 12)
      return { handled: true, event: keyEvent('F2', 'F2', mods) }
    if (keyCode === 13)
      return { handled: true, event: keyEvent('F3', 'F3', mods) }
    if (keyCode === 14)
      return { handled: true, event: keyEvent('F4', 'F4', mods) }
    if (keyCode === 15)
      return { handled: true, event: keyEvent('F5', 'F5', mods) }
    if (keyCode === 17)
      return { handled: true, event: keyEvent('F6', 'F6', mods) }
    if (keyCode === 18)
      return { handled: true, event: keyEvent('F7', 'F7', mods) }
    if (keyCode === 19)
      return { handled: true, event: keyEvent('F8', 'F8', mods) }
    if (keyCode === 20)
      return { handled: true, event: keyEvent('F9', 'F9', mods) }
    if (keyCode === 21)
      return { handled: true, event: keyEvent('F10', 'F10', mods) }
    if (keyCode === 23)
      return { handled: true, event: keyEvent('F11', 'F11', mods) }
    if (keyCode === 24)
      return { handled: true, event: keyEvent('F12', 'F12', mods) }
    return { handled: true, event: null }
  }
  return { handled: true, event: null }
}
function parseSs3(sequence) {
  if (!sequence.startsWith('\x1BO')) return { handled: false, event: null }
  if (sequence.length < 3) return { handled: true, event: null }
  const final = sequence[2]
  switch (final) {
    case 'A':
      return { handled: true, event: keyEvent('ArrowUp', 'ArrowUp') }
    case 'B':
      return { handled: true, event: keyEvent('ArrowDown', 'ArrowDown') }
    case 'C':
      return { handled: true, event: keyEvent('ArrowRight', 'ArrowRight') }
    case 'D':
      return { handled: true, event: keyEvent('ArrowLeft', 'ArrowLeft') }
    case 'H':
      return { handled: true, event: keyEvent('Home', 'Home') }
    case 'F':
      return { handled: true, event: keyEvent('End', 'End') }
    case 'P':
      return { handled: true, event: keyEvent('F1', 'F1') }
    case 'Q':
      return { handled: true, event: keyEvent('F2', 'F2') }
    case 'R':
      return { handled: true, event: keyEvent('F3', 'F3') }
    case 'S':
      return { handled: true, event: keyEvent('F4', 'F4') }
    default:
      return { handled: true, event: null }
  }
}
function parseLegacySequence(sequence) {
  if (!sequence.startsWith('\x1B')) return { handled: false, event: null }
  const csi = parseCsi(sequence)
  if (csi.handled) return csi
  const ss3 = parseSs3(sequence)
  if (ss3.handled) return ss3
  return { handled: false, event: null }
}
function parseMouseSgr(sequence) {
  if (!sequence.startsWith('\x1B[<')) return { handled: false, event: null }
  let i = 3
  const readInt = () => {
    const start = i
    while (i < sequence.length) {
      const c = sequence.charCodeAt(i)
      if (c < 48 || c > 57) break
      i++
    }
    if (i === start) return null
    return Number.parseInt(sequence.slice(start, i), 10)
  }
  const b = readInt()
  if (b == null || sequence[i] !== ';') return { handled: true, event: null }
  i++
  const x = readInt()
  if (x == null || sequence[i] !== ';') return { handled: true, event: null }
  i++
  const y = readInt()
  if (y == null) return { handled: true, event: null }
  const kind = sequence[i]
  if (kind !== 'm' && kind !== 'M') return { handled: true, event: null }
  i++
  const up = kind === 'm'
  const cellX = Math.max(0, x - 1)
  const cellY = Math.max(0, y - 1)
  const shiftKey = Boolean(b & 4)
  const altKey = Boolean(b & 8)
  const ctrlKey = Boolean(b & 16)
  if ((b & 64) === 64) {
    const deltaY = b & 1 ? 1 : -1
    return {
      handled: true,
      event: { type: 'wheel', cellX, cellY, deltaY, shiftKey, altKey, ctrlKey },
    }
  }
  const button = b & 3
  if (up) {
    return {
      handled: true,
      event: {
        type: 'pointerup',
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey,
      },
    }
  }
  if (b & 32) {
    return {
      handled: true,
      event: {
        type: 'pointermove',
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey,
      },
    }
  }
  return {
    handled: true,
    event: {
      type: 'pointerdown',
      cellX,
      cellY,
      button,
      shiftKey,
      altKey,
      ctrlKey,
    },
  }
}
function parseMouseSequence(sequence) {
  return parseMouseSgr(sequence)
}
const ESC$1 = '\x1B'
const BRACKETED_PASTE_START = '\x1B[200~'
const BRACKETED_PASTE_END = '\x1B[201~'
function isCompleteSequence(data) {
  if (!data.startsWith(ESC$1)) return 'not-escape'
  if (data.length === 1) return 'incomplete'
  const afterEsc = data.slice(1)
  if (afterEsc.startsWith('[')) {
    if (afterEsc.startsWith('[M'))
      return data.length >= 6 ? 'complete' : 'incomplete'
    return isCompleteCsiSequence(data)
  }
  if (afterEsc.startsWith(']')) return isCompleteOscSequence(data)
  if (afterEsc.startsWith('P')) return isCompleteDcsSequence(data)
  if (afterEsc.startsWith('_')) return isCompleteApcSequence(data)
  if (afterEsc.startsWith('O'))
    return afterEsc.length >= 2 ? 'complete' : 'incomplete'
  if (afterEsc.length === 1) return 'complete'
  return 'complete'
}
function isCompleteCsiSequence(data) {
  if (!data.startsWith(`${ESC$1}[`)) return 'complete'
  if (data.length < 3) return 'incomplete'
  const payload = data.slice(2)
  const lastChar = payload[payload.length - 1]
  const lastCharCode = lastChar.charCodeAt(0)
  if (lastCharCode >= 64 && lastCharCode <= 126) {
    if (payload.startsWith('<')) {
      if (/^<\d+;\d+;\d+M$/i.test(payload)) return 'complete'
      if (lastChar === 'M' || lastChar === 'm') {
        const parts = payload.slice(1, -1).split(';')
        if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p)))
          return 'complete'
      }
      return 'incomplete'
    }
    return 'complete'
  }
  return 'incomplete'
}
function isCompleteOscSequence(data) {
  if (!data.startsWith(`${ESC$1}]`)) return 'complete'
  if (data.endsWith(`${ESC$1}\\`) || data.endsWith('\x07')) return 'complete'
  return 'incomplete'
}
function isCompleteDcsSequence(data) {
  if (!data.startsWith(`${ESC$1}P`)) return 'complete'
  if (data.endsWith(`${ESC$1}\\`)) return 'complete'
  return 'incomplete'
}
function isCompleteApcSequence(data) {
  if (!data.startsWith(`${ESC$1}_`)) return 'complete'
  if (data.endsWith(`${ESC$1}\\`)) return 'complete'
  return 'incomplete'
}
function extractCompleteSequences(buffer2) {
  const sequences = []
  let pos = 0
  while (pos < buffer2.length) {
    const remaining = buffer2.slice(pos)
    if (remaining.startsWith(ESC$1)) {
      let seqEnd = 1
      while (seqEnd <= remaining.length) {
        const candidate = remaining.slice(0, seqEnd)
        const status = isCompleteSequence(candidate)
        if (status === 'complete') {
          sequences.push(candidate)
          pos += seqEnd
          break
        }
        if (status === 'incomplete') {
          seqEnd++
          continue
        }
        sequences.push(candidate)
        pos += seqEnd
        break
      }
      if (seqEnd > remaining.length) return { sequences, remainder: remaining }
    } else {
      sequences.push(remaining[0])
      pos++
    }
  }
  return { sequences, remainder: '' }
}
class StdinBuffer extends EventEmitter {
  constructor(options = {}) {
    super()
    this.buffer = ''
    this.timeout = null
    this.pasteMode = false
    this.pasteBuffer = ''
    this.timeoutMs = options.timeout ?? 10
  }
  process(data) {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    let str
    if (Buffer$1.isBuffer(data)) {
      if (data.length === 1 && data[0] > 127) {
        const byte = data[0] - 128
        str = `\x1B${String.fromCharCode(byte)}`
      } else {
        str = data.toString()
      }
    } else {
      str = data
    }
    if (str.length === 0 && this.buffer.length === 0) {
      this.emit('data', '')
      return
    }
    this.buffer += str
    if (this.pasteMode) {
      this.pasteBuffer += this.buffer
      this.buffer = ''
      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END)
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex)
        const remaining = this.pasteBuffer.slice(
          endIndex + BRACKETED_PASTE_END.length,
        )
        this.pasteMode = false
        this.pasteBuffer = ''
        this.emit('paste', pastedContent)
        if (remaining.length > 0) this.process(remaining)
      }
      return
    }
    const startIndex = this.buffer.indexOf(BRACKETED_PASTE_START)
    if (startIndex !== -1) {
      if (startIndex > 0) {
        const beforePaste = this.buffer.slice(0, startIndex)
        const result2 = extractCompleteSequences(beforePaste)
        for (const sequence of result2.sequences) this.emit('data', sequence)
      }
      this.buffer = this.buffer.slice(startIndex + BRACKETED_PASTE_START.length)
      this.pasteMode = true
      this.pasteBuffer = this.buffer
      this.buffer = ''
      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END)
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex)
        const remaining = this.pasteBuffer.slice(
          endIndex + BRACKETED_PASTE_END.length,
        )
        this.pasteMode = false
        this.pasteBuffer = ''
        this.emit('paste', pastedContent)
        if (remaining.length > 0) this.process(remaining)
      }
      return
    }
    const result = extractCompleteSequences(this.buffer)
    this.buffer = result.remainder
    for (const sequence of result.sequences) this.emit('data', sequence)
    if (this.buffer.length > 0) {
      this.timeout = setTimeout(() => {
        const flushed = this.flush()
        for (const sequence of flushed) this.emit('data', sequence)
      }, this.timeoutMs)
    }
  }
  flush() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    if (this.buffer.length === 0) return []
    const sequences = [this.buffer]
    this.buffer = ''
    return sequences
  }
  clear() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    this.buffer = ''
    this.pasteMode = false
    this.pasteBuffer = ''
  }
  getBuffer() {
    return this.buffer
  }
  destroy() {
    this.clear()
  }
}
function isPrintable(ch) {
  if (ch.length === 0) return false
  if (ch.length === 1) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code === 127) return false
    return true
  }
  if (ch.length === 2) {
    const code = ch.charCodeAt(0)
    return code >= 55296 && code <= 56319
  }
  return false
}
function ctrlKeyFromChar(ch) {
  if (!ch || ch.length !== 1) return null
  const code = ch.charCodeAt(0)
  if (code >= 1 && code <= 26) return String.fromCharCode(code + 96)
  return null
}
function createStdinDriver(options) {
  const proc = globalThis.process
  const stdin = options.stdin ?? proc?.stdin
  const stdout = options.stdout ?? proc?.stdout
  if (!stdin || !stdout)
    throw new Error('createStdinDriver requires Node process.stdin/stdout')
  const enableMouse = options.enableMouse ?? true
  let disposed = false
  let swallowNextLF = false
  let lastMouseDown = null
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true })
  const stdinBuffer = new StdinBuffer({ timeout: 10 })
  const handlePlainChar = (ch) => {
    if (swallowNextLF) {
      swallowNextLF = false
      if (ch === '\n') return
    }
    if (ch === '') {
      options.onExit?.()
      return
    }
    if (ch === '\r') {
      swallowNextLF = true
      options.dispatch(keyEvent('Enter', 'Enter'))
      return
    }
    if (ch === '\n') {
      options.dispatch({
        type: 'input',
        data: '\n',
        inputType: 'insertLineBreak',
        text: '\n',
      })
      return
    }
    const ctrlKey = ctrlKeyFromChar(ch)
    if (ctrlKey) {
      if (ctrlKey === 'i') {
        options.dispatch(keyEvent('Tab', 'Tab'))
        return
      }
      if (ctrlKey === 'h') {
        options.dispatch(keyEvent('Backspace', 'Backspace'))
        return
      }
      options.dispatch(keyEvent(ctrlKey, '', { ctrlKey: true }))
      return
    }
    if (ch === '') {
      options.dispatch(keyEvent('Backspace', 'Backspace'))
      return
    }
    if (ch === '	') {
      options.dispatch(keyEvent('Tab', 'Tab'))
      return
    }
    if (isPrintable(ch)) options.dispatch(keyEvent(ch))
  }
  const handleMouseEvent = (event) => {
    options.dispatch(event)
    const ev = event
    if (ev.type === 'pointerdown') {
      lastMouseDown = {
        cellX: ev.cellX,
        cellY: ev.cellY,
        button: ev.button ?? 0,
        shiftKey: Boolean(ev.shiftKey),
        altKey: Boolean(ev.altKey),
        ctrlKey: Boolean(ev.ctrlKey),
      }
    } else if (ev.type === 'pointerup') {
      const down = lastMouseDown
      lastMouseDown = null
      const sameCell =
        down && down.cellX === ev.cellX && down.cellY === ev.cellY
      if (
        sameCell &&
        down.button === 0 &&
        (ev.button === 0 || ev.button === 3)
      ) {
        options.dispatch({
          type: 'click',
          cellX: ev.cellX,
          cellY: ev.cellY,
          shiftKey: Boolean(ev.shiftKey ?? down?.shiftKey),
          altKey: Boolean(ev.altKey ?? down?.altKey),
          ctrlKey: Boolean(ev.ctrlKey ?? down?.ctrlKey),
        })
      }
    }
  }
  const handleSequence = (sequence) => {
    if (disposed) return
    if (!sequence) return
    const mouse = parseMouseSequence(sequence)
    if (mouse.handled) {
      if (mouse.event) handleMouseEvent(mouse.event)
      return
    }
    const kitty = parseKittySequence(sequence)
    if (kitty.handled) {
      if (kitty.event) options.dispatch(kitty.event)
      return
    }
    const legacy = parseLegacySequence(sequence)
    if (legacy.handled) {
      if (legacy.event) options.dispatch(legacy.event)
      return
    }
    if (sequence.startsWith('\x1B')) {
      if (sequence.length === 2 && isPrintable(sequence[1])) {
        options.dispatch(keyEvent(sequence[1], '', { altKey: true }))
        return
      }
      if (sequence === '\x1B') {
        options.dispatch(keyEvent('Escape', 'Escape'))
        return
      }
      return
    }
    for (const ch of sequence) handlePlainChar(ch)
  }
  stdinBuffer.on('data', handleSequence)
  stdinBuffer.on('paste', (data) => {
    const pastedText = normalizeNewlines(data)
    if (pastedText) options.dispatch({ type: 'paste', text: pastedText })
  })
  const decodeBytes = (bytes) => {
    if (bytes.length === 1 && bytes[0] > 127) {
      const adjusted = bytes[0] - 128
      stdinBuffer.process(`\x1B${String.fromCharCode(adjusted)}`)
      return
    }
    const decoded = decoder.decode(bytes, { stream: true })
    if (decoded) stdinBuffer.process(decoded)
  }
  const onData = (chunk) => {
    if (disposed) return
    if (typeof chunk === 'string') {
      stdinBuffer.process(chunk)
      return
    }
    if (chunk instanceof ArrayBuffer) {
      decodeBytes(new Uint8Array(chunk))
      return
    }
    if (ArrayBuffer.isView(chunk)) {
      const view = chunk
      decodeBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
      return
    }
    if (chunk != null) {
      try {
        const decoded = decoder.decode(chunk, { stream: true })
        if (decoded) stdinBuffer.process(decoded)
      } catch {}
    }
  }
  const wasRaw = stdin.isRaw
  if (stdin.isTTY) stdin.setRawMode(true)
  stdin.resume()
  stdin.on('data', onData)
  if (stdout.isTTY) {
    stdout.write('\x1B[?2004h')
    if (enableMouse) {
      stdout.write('\x1B[?1007h')
      stdout.write('\x1B[?1000h\x1B[?1002h\x1B[?1003h\x1B[?1006h')
    }
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    stdin.off('data', onData)
    stdinBuffer.destroy()
    if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw))
    if (stdout.isTTY) {
      stdout.write('\x1B[?2004l')
      if (enableMouse) {
        stdout.write('\x1B[?1007l')
        stdout.write('\x1B[?1000l\x1B[?1002l\x1B[?1003l\x1B[?1006l')
      }
    }
  }
  return { dispose }
}
const ESC = '\x1B'
function ansi16ToColorName(code) {
  switch (code) {
    case 30:
      return 'black'
    case 31:
      return 'red'
    case 32:
      return 'green'
    case 33:
      return 'yellow'
    case 34:
      return 'blue'
    case 35:
      return 'magenta'
    case 36:
      return 'cyan'
    case 37:
      return 'white'
    case 90:
      return 'blackBright'
    case 91:
      return 'redBright'
    case 92:
      return 'greenBright'
    case 93:
      return 'yellowBright'
    case 94:
      return 'blueBright'
    case 95:
      return 'magentaBright'
    case 96:
      return 'cyanBright'
    case 97:
      return 'whiteBright'
    default:
      return void 0
  }
}
function ansi16BgToColorName(code) {
  const fgCode =
    code >= 40 && code <= 47
      ? code - 10
      : code >= 100 && code <= 107
        ? code - 10
        : null
  if (fgCode == null) return void 0
  return ansi16ToColorName(fgCode)
}
const ANSI16_RGB = {
  black: { r: 0, g: 0, b: 0 },
  red: { r: 201, g: 27, b: 0 },
  green: { r: 0, g: 194, b: 0 },
  yellow: { r: 199, g: 196, b: 0 },
  blue: { r: 2, g: 37, b: 199 },
  magenta: { r: 201, g: 48, b: 199 },
  cyan: { r: 0, g: 197, b: 199 },
  white: { r: 199, g: 199, b: 199 },
  blackBright: { r: 104, g: 104, b: 104 },
  redBright: { r: 255, g: 110, b: 103 },
  greenBright: { r: 95, g: 250, b: 104 },
  yellowBright: { r: 255, g: 252, b: 103 },
  blueBright: { r: 104, g: 113, b: 255 },
  magentaBright: { r: 255, g: 118, b: 255 },
  cyanBright: { r: 95, g: 253, b: 255 },
  whiteBright: { r: 255, g: 255, b: 255 },
}
function nearestAnsi16(r, g, b) {
  let best = 'white'
  let bestDist = Number.POSITIVE_INFINITY
  for (const [name, rgb] of Object.entries(ANSI16_RGB)) {
    const dr = r - rgb.r
    const dg = g - rgb.g
    const db = b - rgb.b
    const d = dr * dr + dg * dg + db * db
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}
function ansi256ToRgb(index) {
  const n = Math.max(0, Math.min(255, Math.trunc(index)))
  if (n < 16) {
    const map2 = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'blackBright',
      'redBright',
      'greenBright',
      'yellowBright',
      'blueBright',
      'magentaBright',
      'cyanBright',
      'whiteBright',
    ]
    const name = map2[n] ?? 'white'
    return ANSI16_RGB[name]
  }
  if (n >= 232) {
    const c = 8 + (n - 232) * 10
    return { r: c, g: c, b: c }
  }
  const i = n - 16
  const rr = Math.floor(i / 36)
  const gg = Math.floor((i % 36) / 6)
  const bb = i % 6
  const toComponent = (v) => (v === 0 ? 0 : 55 + v * 40)
  return { r: toComponent(rr), g: toComponent(gg), b: toComponent(bb) }
}
function applySgr(current, codes) {
  let next = { ...current }
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    if (code === 0) {
      next = {}
      continue
    }
    if (code === 1) {
      next = { ...next, bold: true }
    } else if (code === 2) {
      next = { ...next, dim: true }
    } else if (code === 3) {
      next = { ...next, italic: true }
    } else if (code === 4) {
      next = { ...next, underline: true }
    } else if (code === 7) {
      next = { ...next, inverse: true }
    } else if (code === 22) {
      next = { ...next, bold: false, dim: false }
    } else if (code === 23) {
      next = { ...next, italic: false }
    } else if (code === 24) {
      next = { ...next, underline: false }
    } else if (code === 27) {
      next = { ...next, inverse: false }
    } else if (code === 39) {
      next = { ...next, fg: void 0 }
    } else if (code === 49) {
      next = { ...next, bg: void 0 }
    } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      const fg = ansi16ToColorName(code)
      next = { ...next, fg: fg ?? next.fg }
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      const bg = ansi16BgToColorName(code)
      next = { ...next, bg: bg ?? next.bg }
    } else if (code === 38 || code === 48) {
      const mode = codes[i + 1]
      if (mode === 5) {
        const idx = codes[i + 2]
        if (idx != null) {
          const { r, g, b } = ansi256ToRgb(idx)
          const name = nearestAnsi16(r, g, b)
          next = code === 38 ? { ...next, fg: name } : { ...next, bg: name }
        }
        i += 2
      } else if (mode === 2) {
        const r = codes[i + 2]
        const g = codes[i + 3]
        const b = codes[i + 4]
        if (r != null && g != null && b != null) {
          const name = nearestAnsi16(r, g, b)
          next = code === 38 ? { ...next, fg: name } : { ...next, bg: name }
        }
        i += 4
      }
    }
  }
  return next
}
function parseAnsiSgr(input, baseStyle = {}) {
  const segments = []
  let style = { ...baseStyle }
  let lastIndex = 0
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== ESC || input[i + 1] !== '[') continue
    let j = i + 2
    while (j < input.length) {
      const c = input.charCodeAt(j)
      if ((c >= 48 && c <= 57) || c === 59) {
        j++
        continue
      }
      break
    }
    if (j >= input.length || input[j] !== 'm') continue
    if (i > lastIndex) segments.push({ text: input.slice(lastIndex, i), style })
    const body = input.slice(i + 2, j)
    const codes = body
      .split(';')
      .filter(Boolean)
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isFinite(n))
    style = applySgr(style, codes.length ? codes : [0])
    lastIndex = j + 1
    i = j
  }
  if (lastIndex < input.length)
    segments.push({ text: input.slice(lastIndex), style })
  return segments
}
const fullWidthRanges = [
  [4352, 4447],
  [9001, 9002],
  [11904, 42191],
  [44032, 55203],
  [63744, 64255],
  [65040, 65049],
  [65072, 65135],
  [65280, 65376],
  [65504, 65510],
]
function isFullWidthCodePoint(codePoint) {
  for (const [start, end] of fullWidthRanges) {
    if (codePoint >= start && codePoint <= end) return true
  }
  return false
}
function isEmojiLike(codePoint) {
  return (
    (codePoint >= 127744 && codePoint <= 129791) ||
    (codePoint >= 127462 && codePoint <= 127487)
  )
}
let extendedPictographicRe = null
try {
  extendedPictographicRe = new RegExp('\\p{Extended_Pictographic}', 'u')
} catch {
  extendedPictographicRe = null
}
function charCellWidth(text) {
  if (!text) return 1
  if (extendedPictographicRe?.test(text)) return 2
  const codePoint = text.codePointAt(0)
  if (codePoint == null) return 1
  return isFullWidthCodePoint(codePoint) || isEmojiLike(codePoint) ? 2 : 1
}
const DEFAULT_STYLE = Object.freeze({})
function normalizeStyle$1(style) {
  if (!style) return DEFAULT_STYLE
  return Object.freeze({ ...style })
}
function createBlankCell(style) {
  return Object.freeze({
    ch: ' ',
    width: 1,
    style: normalizeStyle$1(style),
  })
}
function createContinuationCell(style) {
  return Object.freeze({
    ch: '',
    width: 1,
    continuation: true,
    style: normalizeStyle$1(style),
  })
}
function createGridBuffer(cols2, rows2) {
  const safeCols = Math.max(0, Math.floor(cols2))
  const safeRows = Math.max(0, Math.floor(rows2))
  const blank = createBlankCell()
  const grid = Array.from({ length: safeRows }, () =>
    Array.from({ length: safeCols }, () => blank),
  )
  const dirtyRows = Array.from({ length: safeRows }, () => true)
  return {
    cols: safeCols,
    rows: safeRows,
    grid,
    dirtyRows,
    cursorX: 0,
    cursorY: 0,
    cursorVisible: true,
    cursorStyle: DEFAULT_STYLE,
    scrollback: [],
    scrollbackLimit: 1e3,
  }
}
function clamp$1(n, min, max) {
  return Math.max(min, Math.min(max, n))
}
function markDirty(buffer2, y) {
  if (y >= 0 && y < buffer2.rows) buffer2.dirtyRows[y] = true
}
function clearCellRange(row, startX, endXExclusive) {
  const blank = createBlankCell()
  for (let x = startX; x < endXExclusive; x++) row[x] = blank
}
function clearDanglingContinuation(row, x) {
  const cell = row[x]
  if (!cell?.continuation) return
  row[x] = createBlankCell()
}
function clearWideIfOverwriting(row, x) {
  const cell = row[x]
  if (!cell) return
  if (cell.continuation) {
    if (x - 1 >= 0) row[x - 1] = createBlankCell()
    row[x] = createBlankCell()
    return
  }
  if (cell.width === 2) {
    row[x] = createBlankCell()
    if (x + 1 < row.length) row[x + 1] = createBlankCell()
  }
}
function putCell(buffer2, x, y, ch, style) {
  if (y < 0 || y >= buffer2.rows) return
  if (x < 0 || x >= buffer2.cols) return
  const row = buffer2.grid[y]
  clearWideIfOverwriting(row, x)
  const normalizedStyle = normalizeStyle$1(style)
  const width = charCellWidth(ch)
  if (width === 2 && x + 1 >= buffer2.cols) {
    row[x] = createBlankCell()
    markDirty(buffer2, y)
    return
  }
  row[x] = Object.freeze({ ch, width, style: normalizedStyle })
  if (width === 2 && x + 1 < buffer2.cols)
    row[x + 1] = createContinuationCell(normalizedStyle)
  markDirty(buffer2, y)
}
function fillRect(buffer2, x, y, w, h2, ch = ' ', style) {
  if (w <= 0 || h2 <= 0 || buffer2.cols === 0 || buffer2.rows === 0) return
  const x0 = clamp$1(Math.floor(x), 0, buffer2.cols)
  const y0 = clamp$1(Math.floor(y), 0, buffer2.rows)
  const x1 = clamp$1(Math.floor(x + w), 0, buffer2.cols)
  const y1 = clamp$1(Math.floor(y + h2), 0, buffer2.rows)
  if (x1 <= x0 || y1 <= y0) return
  const normalizedStyle = normalizeStyle$1(style)
  const width = charCellWidth(ch)
  for (let yy = y0; yy < y1; yy++) {
    const row = buffer2.grid[yy]
    for (let xx = x0; xx < x1; xx++) {
      clearWideIfOverwriting(row, xx)
      if (width === 2 && xx + 1 >= buffer2.cols) {
        row[xx] = createBlankCell()
      } else {
        row[xx] = Object.freeze({ ch, width, style: normalizedStyle })
        if (width === 2 && xx + 1 < buffer2.cols)
          row[xx + 1] = createContinuationCell(normalizedStyle)
      }
    }
    markDirty(buffer2, yy)
  }
}
function clearRect(buffer2, x, y, w, h2) {
  if (buffer2.cols === 0 || buffer2.rows === 0) return
  if (x == null || y == null || w == null || h2 == null) {
    const blank = createBlankCell()
    for (let yy = 0; yy < buffer2.rows; yy++) {
      buffer2.grid[yy] = Array.from({ length: buffer2.cols }, () => blank)
      buffer2.dirtyRows[yy] = true
    }
    buffer2.cursorX = 0
    buffer2.cursorY = 0
    return
  }
  if (w <= 0 || h2 <= 0) return
  const x0 = clamp$1(Math.floor(x), 0, buffer2.cols)
  const y0 = clamp$1(Math.floor(y), 0, buffer2.rows)
  const x1 = clamp$1(Math.floor(x + w), 0, buffer2.cols)
  const y1 = clamp$1(Math.floor(y + h2), 0, buffer2.rows)
  if (x1 <= x0 || y1 <= y0) return
  for (let yy = y0; yy < y1; yy++) {
    const row = buffer2.grid[yy]
    clearCellRange(row, x0, x1)
    if (x0 - 1 >= 0) clearDanglingContinuation(row, x0)
    if (x1 < buffer2.cols) clearDanglingContinuation(row, x1)
    markDirty(buffer2, yy)
  }
}
function scrollBuffer(buffer2, lines) {
  const n = Math.trunc(lines)
  if (n === 0 || buffer2.rows === 0) return
  const blankRow = () =>
    Array.from({ length: buffer2.cols }, () => createBlankCell())
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const removed = buffer2.grid.shift()
      if (removed) {
        buffer2.scrollback.push(removed)
        if (buffer2.scrollback.length > buffer2.scrollbackLimit)
          buffer2.scrollback.splice(
            0,
            buffer2.scrollback.length - buffer2.scrollbackLimit,
          )
      }
      buffer2.grid.push(blankRow())
    }
  } else {
    for (let i = 0; i < -n; i++) {
      buffer2.grid.pop()
      buffer2.grid.unshift(blankRow())
    }
  }
  buffer2.dirtyRows = Array.from({ length: buffer2.rows }, () => true)
  buffer2.cursorY = clamp$1(
    buffer2.cursorY - n,
    0,
    Math.max(0, buffer2.rows - 1),
  )
}
function resizeBuffer(buffer2, cols2, rows2) {
  const nextCols = Math.max(0, Math.floor(cols2))
  const nextRows = Math.max(0, Math.floor(rows2))
  if (nextCols === buffer2.cols && nextRows === buffer2.rows) return
  if (nextRows < buffer2.rows) {
    buffer2.grid = buffer2.grid.slice(0, nextRows)
  } else if (nextRows > buffer2.rows) {
    for (let i = buffer2.rows; i < nextRows; i++)
      buffer2.grid.push(
        Array.from({ length: buffer2.cols }, () => createBlankCell()),
      )
  }
  if (nextCols !== buffer2.cols) {
    for (let y = 0; y < buffer2.grid.length; y++) {
      const row = buffer2.grid[y]
      if (nextCols < buffer2.cols) buffer2.grid[y] = row.slice(0, nextCols)
      else
        buffer2.grid[y] = row.concat(
          Array.from({ length: nextCols - buffer2.cols }, () =>
            createBlankCell(),
          ),
        )
      const resizedRow = buffer2.grid[y]
      if (nextCols > 0 && resizedRow[nextCols - 1]?.continuation)
        resizedRow[nextCols - 1] = createBlankCell()
    }
  }
  buffer2.cols = nextCols
  buffer2.rows = nextRows
  buffer2.dirtyRows = Array.from({ length: nextRows }, () => true)
  buffer2.cursorX = clamp$1(buffer2.cursorX, 0, Math.max(0, nextCols))
  buffer2.cursorY = clamp$1(buffer2.cursorY, 0, Math.max(0, nextRows - 1))
}
function snapshotText(buffer2) {
  return buffer2.grid.map((row) =>
    row.map((cell) => (cell.continuation ? ' ' : cell.ch || ' ')).join(''),
  )
}
class Emitter {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map()
  }
  on(event, cb) {
    let set = this.listeners.get(event)
    if (!set) {
      set = /* @__PURE__ */ new Set()
      this.listeners.set(event, set)
    }
    set.add(cb)
    return () => {
      set.delete(cb)
      if (set.size === 0) this.listeners.delete(event)
    }
  }
  emit(event, payload) {
    const set = this.listeners.get(event)
    if (!set) return
    for (const cb of set) cb(payload)
  }
  clear() {
    this.listeners.clear()
  }
}
function isControlChar(ch) {
  return ch === '\n' || ch === '\r' || ch === '	'
}
function createTerminal(opts) {
  const emitter = new Emitter()
  const buffer2 = createGridBuffer(opts.cols, opts.rows)
  let disposed = false
  let batchingDepth = 0
  let pendingCommit = false
  function assertNotDisposed() {
    if (disposed) throw new Error('Terminal is disposed')
  }
  function setCursor(x, y, visible = buffer2.cursorVisible) {
    buffer2.cursorX = Math.max(0, Math.min(buffer2.cols, Math.floor(x)))
    buffer2.cursorY = Math.max(
      0,
      Math.min(buffer2.rows ? buffer2.rows - 1 : 0, Math.floor(y)),
    )
    buffer2.cursorVisible = visible
    markDirty(buffer2, buffer2.cursorY)
  }
  function writeAt(text, x, y, style) {
    let cx = x
    let cy = y
    for (const ch of text) {
      if (isControlChar(ch)) {
        if (ch === '\n') {
          cx = 0
          cy += 1
          if (cy >= buffer2.rows) {
            scrollBuffer(buffer2, 1)
            cy = buffer2.rows - 1
          }
        } else if (ch === '\r') {
          cx = 0
        } else if (ch === '	') {
          const tabSize = 4
          const next = Math.min(buffer2.cols, cx + (tabSize - (cx % tabSize)))
          for (; cx < next; cx++) putCell(buffer2, cx, cy, ' ', style)
        }
        continue
      }
      if (buffer2.cols === 0 || buffer2.rows === 0) break
      if (cy < 0 || cy >= buffer2.rows) break
      if (cx >= buffer2.cols) {
        cx = 0
        cy += 1
      }
      if (cy >= buffer2.rows) {
        scrollBuffer(buffer2, 1)
        cy = buffer2.rows - 1
      }
      putCell(buffer2, cx, cy, ch, style)
      const cell = buffer2.grid[cy][cx]
      cx += cell.width
    }
    return { x: cx, y: cy }
  }
  function dirtyRowIndexes() {
    const indexes = []
    for (let y = 0; y < buffer2.dirtyRows.length; y++) {
      if (buffer2.dirtyRows[y]) indexes.push(y)
    }
    return indexes
  }
  const api = {
    resize(cols2, rows2) {
      assertNotDisposed()
      const prevCols = buffer2.cols
      const prevRows = buffer2.rows
      resizeBuffer(buffer2, cols2, rows2)
      if (buffer2.cols !== prevCols || buffer2.rows !== prevRows)
        emitter.emit('resize', { cols: buffer2.cols, rows: buffer2.rows })
    },
    clear(x, y, w, h2) {
      assertNotDisposed()
      clearRect(buffer2, x, y, w, h2)
    },
    write(text, opts2) {
      assertNotDisposed()
      const x = opts2?.x
      const y = opts2?.y
      const style = opts2?.style
      if (x == null || y == null) {
        const next = writeAt(
          text,
          buffer2.cursorX,
          buffer2.cursorY,
          style ?? buffer2.cursorStyle,
        )
        buffer2.cursorX = next.x
        buffer2.cursorY = next.y
      } else {
        writeAt(text, x, y, style)
      }
    },
    writeAnsi(text, opts2) {
      assertNotDisposed()
      const x = opts2?.x
      const y = opts2?.y
      const positionedWrite = x != null && y != null
      let cx = positionedWrite ? x : buffer2.cursorX
      let cy = positionedWrite ? y : buffer2.cursorY
      let style = positionedWrite ? {} : buffer2.cursorStyle
      for (const seg of parseAnsiSgr(text, style)) {
        const next = writeAt(seg.text, cx, cy, seg.style)
        cx = next.x
        cy = next.y
        style = seg.style
      }
      if (!positionedWrite) {
        buffer2.cursorX = cx
        buffer2.cursorY = cy
        buffer2.cursorStyle = style
      }
    },
    put(x, y, ch, style) {
      assertNotDisposed()
      putCell(buffer2, x, y, ch, style)
    },
    fill(x, y, w, h2, ch, style) {
      assertNotDisposed()
      fillRect(buffer2, x, y, w, h2, ch ?? ' ', style)
    },
    scroll(lines) {
      assertNotDisposed()
      scrollBuffer(buffer2, lines)
    },
    setCursor,
    batch(fn) {
      assertNotDisposed()
      batchingDepth++
      try {
        return fn()
      } finally {
        batchingDepth--
        if (batchingDepth === 0 && pendingCommit) {
          pendingCommit = false
          api.commit()
        }
      }
    },
    commit() {
      assertNotDisposed()
      if (batchingDepth > 0) {
        pendingCommit = true
        return dirtyRowIndexes()
      }
      const dirtyRows = dirtyRowIndexes()
      if (dirtyRows.length === 0) return dirtyRows
      for (const y of dirtyRows) buffer2.dirtyRows[y] = false
      emitter.emit('commit', { dirtyRows })
      return dirtyRows
    },
    on(event, cb) {
      assertNotDisposed()
      return emitter.on(event, cb)
    },
    dispose() {
      disposed = true
      emitter.clear()
    },
    snapshot() {
      assertNotDisposed()
      return {
        cols: buffer2.cols,
        rows: buffer2.rows,
        lines: snapshotText(buffer2),
      }
    },
    getCell(x, y) {
      assertNotDisposed()
      if (y < 0 || y >= buffer2.rows || x < 0 || x >= buffer2.cols)
        throw new RangeError('Cell out of bounds')
      return buffer2.grid[y][x]
    },
    getRow(y) {
      assertNotDisposed()
      if (y < 0 || y >= buffer2.rows) throw new RangeError('Row out of bounds')
      return buffer2.grid[y]
    },
    setScrollbackLimit(limit) {
      assertNotDisposed()
      buffer2.scrollbackLimit = Math.max(0, Math.floor(limit))
      if (buffer2.scrollback.length > buffer2.scrollbackLimit)
        buffer2.scrollback.splice(
          0,
          buffer2.scrollback.length - buffer2.scrollbackLimit,
        )
    },
    getScrollbackLines(count) {
      assertNotDisposed()
      const all = buffer2.scrollback.map((row) =>
        row.map((cell) => (cell.continuation ? ' ' : cell.ch || ' ')).join(''),
      )
      if (count == null) return all
      return all.slice(Math.max(0, all.length - Math.max(0, Math.floor(count))))
    },
  }
  return api
}
/**
 * @vue/shared v3.5.26
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map2 = /* @__PURE__ */ Object.create(null)
  for (const key of str.split(',')) map2[key] = 1
  return (val) => val in map2
}
const EMPTY_OBJ = !!(process.env.NODE_ENV !== 'production')
  ? Object.freeze({})
  : {}
const EMPTY_ARR = !!(process.env.NODE_ENV !== 'production')
  ? Object.freeze([])
  : []
const NOOP = () => {}
const NO = () => false
const isOn = (key) =>
  key.charCodeAt(0) === 111 &&
  key.charCodeAt(1) === 110 && // uppercase letter
  (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97)
const isModelListener = (key) => key.startsWith('onUpdate:')
const extend = Object.assign
const remove$1 = (arr, el) => {
  const i = arr.indexOf(el)
  if (i > -1) {
    arr.splice(i, 1)
  }
}
const hasOwnProperty$1 = Object.prototype.hasOwnProperty
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key)
const isArray = Array.isArray
const isMap = (val) => toTypeString(val) === '[object Map]'
const isSet = (val) => toTypeString(val) === '[object Set]'
const isFunction = (val) => typeof val === 'function'
const isString = (val) => typeof val === 'string'
const isSymbol = (val) => typeof val === 'symbol'
const isObject = (val) => val !== null && typeof val === 'object'
const isPromise = (val) => {
  return (
    (isObject(val) || isFunction(val)) &&
    isFunction(val.then) &&
    isFunction(val.catch)
  )
}
const objectToString = Object.prototype.toString
const toTypeString = (value) => objectToString.call(value)
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1)
}
const isPlainObject$1 = (val) => toTypeString(val) === '[object Object]'
const isIntegerKey = (key) =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ',key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted',
)
const isBuiltInDirective = /* @__PURE__ */ makeMap(
  'bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo',
)
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null)
  return (str) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }
}
const camelizeRE = /-\w/g
const camelize = cacheStringFunction((str) => {
  return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase())
})
const hyphenateRE = /\B([A-Z])/g
const hyphenate = cacheStringFunction((str) =>
  str.replace(hyphenateRE, '-$1').toLowerCase(),
)
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})
const toHandlerKey = cacheStringFunction((str) => {
  const s = str ? `on${capitalize(str)}` : ``
  return s
})
const hasChanged = (value, oldValue) => !Object.is(value, oldValue)
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg)
  }
}
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value,
  })
}
const looseToNumber = (val) => {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}
let _globalThis
const getGlobalThis = () => {
  return (
    _globalThis ||
    (_globalThis =
      typeof globalThis !== 'undefined'
        ? globalThis
        : typeof self !== 'undefined'
          ? self
          : typeof window !== 'undefined'
            ? window
            : typeof global !== 'undefined'
              ? global
              : {})
  )
}
function normalizeStyle(value) {
  if (isArray(value)) {
    const res = {}
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      const normalized = isString(item)
        ? parseStringStyle(item)
        : normalizeStyle(item)
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key]
        }
      }
    }
    return res
  } else if (isString(value) || isObject(value)) {
    return value
  }
}
const listDelimiterRE = /;(?![^(]*\))/g
const propertyDelimiterRE = /:([^]+)/
const styleCommentRE = /\/\*[^]*?\*\//g
function parseStringStyle(cssText) {
  const ret = {}
  cssText
    .replace(styleCommentRE, '')
    .split(listDelimiterRE)
    .forEach((item) => {
      if (item) {
        const tmp = item.split(propertyDelimiterRE)
        tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim())
      }
    })
  return ret
}
function normalizeClass(value) {
  let res = ''
  if (isString(value)) {
    res = value
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}
/**
 * @vue/reactivity v3.5.26
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/
function warn$2(msg, ...args) {
  console.warn(`[Vue warn] ${msg}`, ...args)
}
let activeEffectScope
class EffectScope {
  constructor(detached = false) {
    this.detached = detached
    this._active = true
    this._on = 0
    this.effects = []
    this.cleanups = []
    this._isPaused = false
    this.parent = activeEffectScope
    if (!detached && activeEffectScope) {
      this.index =
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }
  get active() {
    return this._active
  }
  pause() {
    if (this._active) {
      this._isPaused = true
      let i, l
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause()
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause()
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false
        let i, l
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume()
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume()
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        activeEffectScope = this
        return fn()
      } finally {
        activeEffectScope = currentEffectScope
      }
    } else if (!!(process.env.NODE_ENV !== 'production')) {
      warn$2(`cannot run an inactive effect scope.`)
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope
      activeEffectScope = this
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope
      this.prevScope = void 0
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false
      let i, l
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      this.effects.length = 0
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      this.cleanups.length = 0
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
        this.scopes.length = 0
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop()
        if (last && last !== this) {
          this.parent.scopes[this.index] = last
          last.index = this.index
        }
      }
      this.parent = void 0
    }
  }
}
function getCurrentScope() {
  return activeEffectScope
}
let activeSub
const pausedQueueEffects = /* @__PURE__ */ new WeakSet()
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn
    this.deps = void 0
    this.depsTail = void 0
    this.flags = 1 | 4
    this.next = void 0
    this.cleanup = void 0
    this.scheduler = void 0
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this)
    }
  }
  pause() {
    this.flags |= 64
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this)
        this.trigger()
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return
    }
    if (!(this.flags & 8)) {
      batch(this)
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn()
    }
    this.flags |= 2
    cleanupEffect(this)
    prepareDeps(this)
    const prevEffect = activeSub
    const prevShouldTrack = shouldTrack
    activeSub = this
    shouldTrack = true
    try {
      return this.fn()
    } finally {
      if (!!(process.env.NODE_ENV !== 'production') && activeSub !== this) {
        warn$2(
          'Active effect was not restored correctly - this is likely a Vue internal bug.',
        )
      }
      cleanupDeps(this)
      activeSub = prevEffect
      shouldTrack = prevShouldTrack
      this.flags &= -3
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link)
      }
      this.deps = this.depsTail = void 0
      cleanupEffect(this)
      this.onStop && this.onStop()
      this.flags &= -2
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this)
    } else if (this.scheduler) {
      this.scheduler()
    } else {
      this.runIfDirty()
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run()
    }
  }
  get dirty() {
    return isDirty(this)
  }
}
let batchDepth = 0
let batchedSub
let batchedComputed
function batch(sub, isComputed = false) {
  sub.flags |= 8
  if (isComputed) {
    sub.next = batchedComputed
    batchedComputed = sub
    return
  }
  sub.next = batchedSub
  batchedSub = sub
}
function startBatch() {
  batchDepth++
}
function endBatch() {
  if (--batchDepth > 0) {
    return
  }
  if (batchedComputed) {
    let e = batchedComputed
    batchedComputed = void 0
    while (e) {
      const next = e.next
      e.next = void 0
      e.flags &= -9
      e = next
    }
  }
  let error
  while (batchedSub) {
    let e = batchedSub
    batchedSub = void 0
    while (e) {
      const next = e.next
      e.next = void 0
      e.flags &= -9
      if (e.flags & 1) {
        try {
          e.trigger()
        } catch (err) {
          if (!error) error = err
        }
      }
      e = next
    }
  }
  if (error) throw error
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1
    link.prevActiveLink = link.dep.activeLink
    link.dep.activeLink = link
  }
}
function cleanupDeps(sub) {
  let head
  let tail = sub.depsTail
  let link = tail
  while (link) {
    const prev = link.prevDep
    if (link.version === -1) {
      if (link === tail) tail = prev
      removeSub(link)
      removeDep(link)
    } else {
      head = link
    }
    link.dep.activeLink = link.prevActiveLink
    link.prevActiveLink = void 0
    link = prev
  }
  sub.deps = head
  sub.depsTail = tail
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (
      link.dep.version !== link.version ||
      (link.dep.computed &&
        (refreshComputed(link.dep.computed) ||
          link.dep.version !== link.version))
    ) {
      return true
    }
  }
  if (sub._dirty) {
    return true
  }
  return false
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return
  }
  computed2.flags &= -17
  if (computed2.globalVersion === globalVersion) {
    return
  }
  computed2.globalVersion = globalVersion
  if (
    !computed2.isSSR &&
    computed2.flags & 128 &&
    ((!computed2.deps && !computed2._dirty) || !isDirty(computed2))
  ) {
    return
  }
  computed2.flags |= 2
  const dep = computed2.dep
  const prevSub = activeSub
  const prevShouldTrack = shouldTrack
  activeSub = computed2
  shouldTrack = true
  try {
    prepareDeps(computed2)
    const value = computed2.fn(computed2._value)
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128
      computed2._value = value
      dep.version++
    }
  } catch (err) {
    dep.version++
    throw err
  } finally {
    activeSub = prevSub
    shouldTrack = prevShouldTrack
    cleanupDeps(computed2)
    computed2.flags &= -3
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link
  if (prevSub) {
    prevSub.nextSub = nextSub
    link.prevSub = void 0
  }
  if (nextSub) {
    nextSub.prevSub = prevSub
    link.nextSub = void 0
  }
  if (!!(process.env.NODE_ENV !== 'production') && dep.subsHead === link) {
    dep.subsHead = nextSub
  }
  if (dep.subs === link) {
    dep.subs = prevSub
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true)
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key)
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link
  if (prevDep) {
    prevDep.nextDep = nextDep
    link.prevDep = void 0
  }
  if (nextDep) {
    nextDep.prevDep = prevDep
    link.nextDep = void 0
  }
}
let shouldTrack = true
const trackStack = []
function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}
function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === void 0 ? true : last
}
function cleanupEffect(e) {
  const { cleanup } = e
  e.cleanup = void 0
  if (cleanup) {
    const prevSub = activeSub
    activeSub = void 0
    try {
      cleanup()
    } finally {
      activeSub = prevSub
    }
  }
}
let globalVersion = 0
class Link {
  constructor(sub, dep) {
    this.sub = sub
    this.dep = dep
    this.version = dep.version
    this.nextDep =
      this.prevDep =
      this.nextSub =
      this.prevSub =
      this.prevActiveLink =
        void 0
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2
    this.version = 0
    this.activeLink = void 0
    this.subs = void 0
    this.map = void 0
    this.key = void 0
    this.sc = 0
    this.__v_skip = true
    if (!!(process.env.NODE_ENV !== 'production')) {
      this.subsHead = void 0
    }
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return
    }
    let link = this.activeLink
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this)
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link
      } else {
        link.prevDep = activeSub.depsTail
        activeSub.depsTail.nextDep = link
        activeSub.depsTail = link
      }
      addSub(link)
    } else if (link.version === -1) {
      link.version = this.version
      if (link.nextDep) {
        const next = link.nextDep
        next.prevDep = link.prevDep
        if (link.prevDep) {
          link.prevDep.nextDep = next
        }
        link.prevDep = activeSub.depsTail
        link.nextDep = void 0
        activeSub.depsTail.nextDep = link
        activeSub.depsTail = link
        if (activeSub.deps === link) {
          activeSub.deps = next
        }
      }
    }
    if (!!(process.env.NODE_ENV !== 'production') && activeSub.onTrack) {
      activeSub.onTrack(
        extend(
          {
            effect: activeSub,
          },
          debugInfo,
        ),
      )
    }
    return link
  }
  trigger(debugInfo) {
    this.version++
    globalVersion++
    this.notify(debugInfo)
  }
  notify(debugInfo) {
    startBatch()
    try {
      if (!!(process.env.NODE_ENV !== 'production')) {
        for (let head = this.subsHead; head; head = head.nextSub) {
          if (head.sub.onTrigger && !(head.sub.flags & 8)) {
            head.sub.onTrigger(
              extend(
                {
                  effect: head.sub,
                },
                debugInfo,
              ),
            )
          }
        }
      }
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          link.sub.dep.notify()
        }
      }
    } finally {
      endBatch()
    }
  }
}
function addSub(link) {
  link.dep.sc++
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l)
      }
    }
    const currentTail = link.dep.subs
    if (currentTail !== link) {
      link.prevSub = currentTail
      if (currentTail) currentTail.nextSub = link
    }
    if (
      !!(process.env.NODE_ENV !== 'production') &&
      link.dep.subsHead === void 0
    ) {
      link.dep.subsHead = link
    }
    link.dep.subs = link
  }
}
const targetMap = /* @__PURE__ */ new WeakMap()
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  !!(process.env.NODE_ENV !== 'production') ? 'Object iterate' : '',
)
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  !!(process.env.NODE_ENV !== 'production') ? 'Map keys iterate' : '',
)
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  !!(process.env.NODE_ENV !== 'production') ? 'Array iterate' : '',
)
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = /* @__PURE__ */ new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = new Dep()))
      dep.map = depsMap
      dep.key = key
    }
    if (!!(process.env.NODE_ENV !== 'production')) {
      dep.track({
        target,
        type,
        key,
      })
    } else {
      dep.track()
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    globalVersion++
    return
  }
  const run = (dep) => {
    if (dep) {
      if (!!(process.env.NODE_ENV !== 'production')) {
        dep.trigger({
          target,
          type,
          key,
          newValue,
          oldValue,
          oldTarget,
        })
      } else {
        dep.trigger()
      }
    }
  }
  startBatch()
  if (type === 'clear') {
    depsMap.forEach(run)
  } else {
    const targetIsArray = isArray(target)
    const isArrayIndex = targetIsArray && isIntegerKey(key)
    if (targetIsArray && key === 'length') {
      const newLength = Number(newValue)
      depsMap.forEach((dep, key2) => {
        if (
          key2 === 'length' ||
          key2 === ARRAY_ITERATE_KEY ||
          (!isSymbol(key2) && key2 >= newLength)
        ) {
          run(dep)
        }
      })
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key))
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY))
      }
      switch (type) {
        case 'add':
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          } else if (isArrayIndex) {
            run(depsMap.get('length'))
          }
          break
        case 'delete':
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY))
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY))
            }
          }
          break
        case 'set':
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY))
          }
          break
      }
    }
  }
  endBatch()
}
function reactiveReadArray(array) {
  const raw = toRaw(array)
  if (raw === array) return raw
  track(raw, 'iterate', ARRAY_ITERATE_KEY)
  return isShallow(array) ? raw : raw.map(toReactive)
}
function shallowReadArray(arr) {
  track((arr = toRaw(arr)), 'iterate', ARRAY_ITERATE_KEY)
  return arr
}
function toWrapped(target, item) {
  if (isReadonly(target)) {
    return isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item)
  }
  return toReactive(item)
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item))
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => (isArray(x) ? reactiveReadArray(x) : x)),
    )
  },
  entries() {
    return iterator(this, 'entries', (value) => {
      value[1] = toWrapped(this, value[1])
      return value
    })
  },
  every(fn, thisArg) {
    return apply(this, 'every', fn, thisArg, void 0, arguments)
  },
  filter(fn, thisArg) {
    return apply(
      this,
      'filter',
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments,
    )
  },
  find(fn, thisArg) {
    return apply(
      this,
      'find',
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments,
    )
  },
  findIndex(fn, thisArg) {
    return apply(this, 'findIndex', fn, thisArg, void 0, arguments)
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      'findLast',
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments,
    )
  },
  findLastIndex(fn, thisArg) {
    return apply(this, 'findLastIndex', fn, thisArg, void 0, arguments)
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, 'forEach', fn, thisArg, void 0, arguments)
  },
  includes(...args) {
    return searchProxy(this, 'includes', args)
  },
  indexOf(...args) {
    return searchProxy(this, 'indexOf', args)
  },
  join(separator) {
    return reactiveReadArray(this).join(separator)
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, 'lastIndexOf', args)
  },
  map(fn, thisArg) {
    return apply(this, 'map', fn, thisArg, void 0, arguments)
  },
  pop() {
    return noTracking(this, 'pop')
  },
  push(...args) {
    return noTracking(this, 'push', args)
  },
  reduce(fn, ...args) {
    return reduce(this, 'reduce', fn, args)
  },
  reduceRight(fn, ...args) {
    return reduce(this, 'reduceRight', fn, args)
  },
  shift() {
    return noTracking(this, 'shift')
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, 'some', fn, thisArg, void 0, arguments)
  },
  splice(...args) {
    return noTracking(this, 'splice', args)
  },
  toReversed() {
    return reactiveReadArray(this).toReversed()
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer)
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args)
  },
  unshift(...args) {
    return noTracking(this, 'unshift', args)
  },
  values() {
    return iterator(this, 'values', (item) => toWrapped(this, item))
  },
}
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2)
  const iter = arr[method]()
  if (arr !== self2 && !isShallow(self2)) {
    iter._next = iter.next
    iter.next = () => {
      const result = iter._next()
      if (!result.done) {
        result.value = wrapValue(result.value)
      }
      return result
    }
  }
  return iter
}
const arrayProto = Array.prototype
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2)
  const needsWrap = arr !== self2 && !isShallow(self2)
  const methodFn = arr[method]
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args)
    return needsWrap ? toReactive(result2) : result2
  }
  let wrappedFn = fn
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function (item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2)
      }
    } else if (fn.length > 2) {
      wrappedFn = function (item, index) {
        return fn.call(this, item, index, self2)
      }
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg)
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2)
  let wrappedFn = fn
  if (arr !== self2) {
    if (!isShallow(self2)) {
      wrappedFn = function (acc, item, index) {
        return fn.call(this, acc, toWrapped(self2, item), index, self2)
      }
    } else if (fn.length > 3) {
      wrappedFn = function (acc, item, index) {
        return fn.call(this, acc, item, index, self2)
      }
    }
  }
  return arr[method](wrappedFn, ...args)
}
function searchProxy(self2, method, args) {
  const arr = toRaw(self2)
  track(arr, 'iterate', ARRAY_ITERATE_KEY)
  const res = arr[method](...args)
  if ((res === -1 || res === false) && isProxy(args[0])) {
    args[0] = toRaw(args[0])
    return arr[method](...args)
  }
  return res
}
function noTracking(self2, method, args = []) {
  pauseTracking()
  startBatch()
  const res = toRaw(self2)[method].apply(self2, args)
  endBatch()
  resetTracking()
  return res
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(
  `__proto__,__v_isRef,__isVue`,
)
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol)
    .filter((key) => key !== 'arguments' && key !== 'caller')
    .map((key) => Symbol[key])
    .filter(isSymbol),
)
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key)
  const obj = toRaw(this)
  track(obj, 'has', key)
  return obj.hasOwnProperty(key)
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly
    this._isShallow = _isShallow
  }
  get(target, key, receiver) {
    if (key === '__v_skip') return target['__v_skip']
    const isReadonly2 = this._isReadonly,
      isShallow2 = this._isShallow
    if (key === '__v_isReactive') {
      return !isReadonly2
    } else if (key === '__v_isReadonly') {
      return isReadonly2
    } else if (key === '__v_isShallow') {
      return isShallow2
    } else if (key === '__v_raw') {
      if (
        receiver ===
          (isReadonly2
            ? isShallow2
              ? shallowReadonlyMap
              : readonlyMap
            : isShallow2
              ? shallowReactiveMap
              : reactiveMap
          ).get(target) || // receiver is not the reactive proxy, but has the same prototype
        // this means the receiver is a user proxy of the reactive proxy
        Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)
      ) {
        return target
      }
      return
    }
    const targetIsArray = isArray(target)
    if (!isReadonly2) {
      let fn
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn
      }
      if (key === 'hasOwnProperty') {
        return hasOwnProperty
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      isRef(target) ? target : receiver,
    )
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }
    if (!isReadonly2) {
      track(target, 'get', key)
    }
    if (isShallow2) {
      return res
    }
    if (isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value
      return isReadonly2 && isObject(value) ? readonly(value) : value
    }
    if (isObject(res)) {
      return isReadonly2 ? readonly(res) : reactive(res)
    }
    return res
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2)
  }
  set(target, key, value, receiver) {
    let oldValue = target[key]
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key)
    if (!this._isShallow) {
      const isOldValueReadonly = isReadonly(oldValue)
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }
      if (!isArrayWithIntegerKey && isRef(oldValue) && !isRef(value)) {
        if (isOldValueReadonly) {
          if (!!(process.env.NODE_ENV !== 'production')) {
            warn$2(
              `Set operation on key "${String(key)}" failed: target is readonly.`,
              target[key],
            )
          }
          return true
        } else {
          oldValue.value = value
          return true
        }
      }
    }
    const hadKey = isArrayWithIntegerKey
      ? Number(key) < target.length
      : hasOwn(target, key)
    const result = Reflect.set(
      target,
      key,
      value,
      isRef(target) ? target : receiver,
    )
    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, 'add', key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, 'set', key, value, oldValue)
      }
    }
    return result
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key)
    const oldValue = target[key]
    const result = Reflect.deleteProperty(target, key)
    if (result && hadKey) {
      trigger(target, 'delete', key, void 0, oldValue)
    }
    return result
  }
  has(target, key) {
    const result = Reflect.has(target, key)
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, 'has', key)
    }
    return result
  }
  ownKeys(target) {
    track(target, 'iterate', isArray(target) ? 'length' : ITERATE_KEY)
    return Reflect.ownKeys(target)
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2)
  }
  set(target, key) {
    if (!!(process.env.NODE_ENV !== 'production')) {
      warn$2(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
  deleteProperty(target, key) {
    if (!!(process.env.NODE_ENV !== 'production')) {
      warn$2(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target,
      )
    }
    return true
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler()
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler()
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true)
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(
  true,
)
const toShallow = (value) => value
const getProto = (v) => Reflect.getPrototypeOf(v)
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function (...args) {
    const target = this['__v_raw']
    const rawTarget = toRaw(target)
    const targetIsMap = isMap(rawTarget)
    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)
    const isKeyOnly = method === 'keys' && targetIsMap
    const innerIterator = target[method](...args)
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive
    !isReadonly2 &&
      track(rawTarget, 'iterate', isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY)
    return {
      // iterator protocol
      next() {
        const { value, done } = innerIterator.next()
        return done
          ? { value, done }
          : {
              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
              done,
            }
      },
      // iterable protocol
      [Symbol.iterator]() {
        return this
      },
    }
  }
}
function createReadonlyMethod(type) {
  return function (...args) {
    if (!!(process.env.NODE_ENV !== 'production')) {
      const key = args[0] ? `on key "${args[0]}" ` : ``
      warn$2(
        `${capitalize(type)} operation ${key}failed: target is readonly.`,
        toRaw(this),
      )
    }
    return type === 'delete' ? false : type === 'clear' ? void 0 : this
  }
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this['__v_raw']
      const rawTarget = toRaw(target)
      const rawKey = toRaw(key)
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, 'get', key)
        }
        track(rawTarget, 'get', rawKey)
      }
      const { has } = getProto(rawTarget)
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key))
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey))
      } else if (target !== rawTarget) {
        target.get(key)
      }
    },
    get size() {
      const target = this['__v_raw']
      !readonly2 && track(toRaw(target), 'iterate', ITERATE_KEY)
      return target.size
    },
    has(key) {
      const target = this['__v_raw']
      const rawTarget = toRaw(target)
      const rawKey = toRaw(key)
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, 'has', key)
        }
        track(rawTarget, 'has', rawKey)
      }
      return key === rawKey
        ? target.has(key)
        : target.has(key) || target.has(rawKey)
    },
    forEach(callback, thisArg) {
      const observed = this
      const target = observed['__v_raw']
      const rawTarget = toRaw(target)
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive
      !readonly2 && track(rawTarget, 'iterate', ITERATE_KEY)
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed)
      })
    },
  }
  extend(
    instrumentations,
    readonly2
      ? {
          add: createReadonlyMethod('add'),
          set: createReadonlyMethod('set'),
          delete: createReadonlyMethod('delete'),
          clear: createReadonlyMethod('clear'),
        }
      : {
          add(value) {
            if (!shallow && !isShallow(value) && !isReadonly(value)) {
              value = toRaw(value)
            }
            const target = toRaw(this)
            const proto = getProto(target)
            const hadKey = proto.has.call(target, value)
            if (!hadKey) {
              target.add(value)
              trigger(target, 'add', value, value)
            }
            return this
          },
          set(key, value) {
            if (!shallow && !isShallow(value) && !isReadonly(value)) {
              value = toRaw(value)
            }
            const target = toRaw(this)
            const { has, get } = getProto(target)
            let hadKey = has.call(target, key)
            if (!hadKey) {
              key = toRaw(key)
              hadKey = has.call(target, key)
            } else if (!!(process.env.NODE_ENV !== 'production')) {
              checkIdentityKeys(target, has, key)
            }
            const oldValue = get.call(target, key)
            target.set(key, value)
            if (!hadKey) {
              trigger(target, 'add', key, value)
            } else if (hasChanged(value, oldValue)) {
              trigger(target, 'set', key, value, oldValue)
            }
            return this
          },
          delete(key) {
            const target = toRaw(this)
            const { has, get } = getProto(target)
            let hadKey = has.call(target, key)
            if (!hadKey) {
              key = toRaw(key)
              hadKey = has.call(target, key)
            } else if (!!(process.env.NODE_ENV !== 'production')) {
              checkIdentityKeys(target, has, key)
            }
            const oldValue = get ? get.call(target, key) : void 0
            const result = target.delete(key)
            if (hadKey) {
              trigger(target, 'delete', key, void 0, oldValue)
            }
            return result
          },
          clear() {
            const target = toRaw(this)
            const hadItems = target.size !== 0
            const oldTarget = !!(process.env.NODE_ENV !== 'production')
              ? isMap(target)
                ? new Map(target)
                : new Set(target)
              : void 0
            const result = target.clear()
            if (hadItems) {
              trigger(target, 'clear', void 0, void 0, oldTarget)
            }
            return result
          },
        },
  )
  const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow)
  })
  return instrumentations
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow)
  return (target, key, receiver) => {
    if (key === '__v_isReactive') {
      return !isReadonly2
    } else if (key === '__v_isReadonly') {
      return isReadonly2
    } else if (key === '__v_raw') {
      return target
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target
        ? instrumentations
        : target,
      key,
      receiver,
    )
  }
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false),
}
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true),
}
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false),
}
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true),
}
function checkIdentityKeys(target, has, key) {
  const rawKey = toRaw(key)
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target)
    warn$2(
      `Reactive ${type} contains both the raw and reactive versions of the same object${type === `Map` ? ` as keys` : ``}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`,
    )
  }
}
const reactiveMap = /* @__PURE__ */ new WeakMap()
const shallowReactiveMap = /* @__PURE__ */ new WeakMap()
const readonlyMap = /* @__PURE__ */ new WeakMap()
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap()
function targetTypeMap(rawType) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return 1
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return 2
    default:
      return 0
  }
}
function getTargetType(value) {
  return value['__v_skip'] || !Object.isExtensible(value)
    ? 0
    : targetTypeMap(toRawType(value))
}
function reactive(target) {
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  )
}
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap,
  )
}
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap,
  )
}
function createReactiveObject(
  target,
  isReadonly2,
  baseHandlers,
  collectionHandlers,
  proxyMap,
) {
  if (!isObject(target)) {
    if (!!(process.env.NODE_ENV !== 'production')) {
      warn$2(
        `value cannot be made ${isReadonly2 ? 'readonly' : 'reactive'}: ${String(
          target,
        )}`,
      )
    }
    return target
  }
  if (target['__v_raw'] && !(isReadonly2 && target['__v_isReactive'])) {
    return target
  }
  const targetType = getTargetType(target)
  if (targetType === 0) {
    return target
  }
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers,
  )
  proxyMap.set(target, proxy)
  return proxy
}
function isReactive(value) {
  if (isReadonly(value)) {
    return isReactive(value['__v_raw'])
  }
  return !!(value && value['__v_isReactive'])
}
function isReadonly(value) {
  return !!(value && value['__v_isReadonly'])
}
function isShallow(value) {
  return !!(value && value['__v_isShallow'])
}
function isProxy(value) {
  return value ? !!value['__v_raw'] : false
}
function toRaw(observed) {
  const raw = observed && observed['__v_raw']
  return raw ? toRaw(raw) : observed
}
function markRaw(value) {
  if (!hasOwn(value, '__v_skip') && Object.isExtensible(value)) {
    def(value, '__v_skip', true)
  }
  return value
}
const toReactive = (value) => (isObject(value) ? reactive(value) : value)
const toReadonly = (value) => (isObject(value) ? readonly(value) : value)
function isRef(r) {
  return r ? r['__v_isRef'] === true : false
}
function ref(value) {
  return createRef(value, false)
}
function shallowRef(value) {
  return createRef(value, true)
}
function createRef(rawValue, shallow) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep()
    this['__v_isRef'] = true
    this['__v_isShallow'] = false
    this._rawValue = isShallow2 ? value : toRaw(value)
    this._value = isShallow2 ? value : toReactive(value)
    this['__v_isShallow'] = isShallow2
  }
  get value() {
    if (!!(process.env.NODE_ENV !== 'production')) {
      this.dep.track({
        target: this,
        type: 'get',
        key: 'value',
      })
    } else {
      this.dep.track()
    }
    return this._value
  }
  set value(newValue) {
    const oldValue = this._rawValue
    const useDirectValue =
      this['__v_isShallow'] || isShallow(newValue) || isReadonly(newValue)
    newValue = useDirectValue ? newValue : toRaw(newValue)
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue
      this._value = useDirectValue ? newValue : toReactive(newValue)
      if (!!(process.env.NODE_ENV !== 'production')) {
        this.dep.trigger({
          target: this,
          type: 'set',
          key: 'value',
          newValue,
          oldValue,
        })
      } else {
        this.dep.trigger()
      }
    }
  }
}
function unref(ref2) {
  return isRef(ref2) ? ref2.value : ref2
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) =>
    key === '__v_raw' ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}
function proxyRefs(objectWithRefs) {
  return isReactive(objectWithRefs)
    ? objectWithRefs
    : new Proxy(objectWithRefs, shallowUnwrapHandlers)
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn
    this.setter = setter
    this._value = void 0
    this.dep = new Dep(this)
    this.__v_isRef = true
    this.deps = void 0
    this.depsTail = void 0
    this.flags = 16
    this.globalVersion = globalVersion - 1
    this.next = void 0
    this.effect = this
    this['__v_isReadonly'] = !setter
    this.isSSR = isSSR
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16
    if (
      !(this.flags & 8) && // avoid infinite self recursion
      activeSub !== this
    ) {
      batch(this, true)
      return true
    } else if (!!(process.env.NODE_ENV !== 'production'));
  }
  get value() {
    const link = !!(process.env.NODE_ENV !== 'production')
      ? this.dep.track({
          target: this,
          type: 'get',
          key: 'value',
        })
      : this.dep.track()
    refreshComputed(this)
    if (link) {
      link.version = this.dep.version
    }
    return this._value
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    } else if (!!(process.env.NODE_ENV !== 'production')) {
      warn$2('Write operation failed: computed value is readonly')
    }
  }
}
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter
  let setter
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR)
  if (!!(process.env.NODE_ENV !== 'production') && debugOptions);
  return cRef
}
const INITIAL_WATCHER_VALUE = {}
const cleanupMap = /* @__PURE__ */ new WeakMap()
let activeWatcher = void 0
function onWatcherCleanup(
  cleanupFn,
  failSilently = false,
  owner = activeWatcher,
) {
  if (owner) {
    let cleanups = cleanupMap.get(owner)
    if (!cleanups) cleanupMap.set(owner, (cleanups = []))
    cleanups.push(cleanupFn)
  } else if (!!(process.env.NODE_ENV !== 'production') && !failSilently) {
    warn$2(
      `onWatcherCleanup() was called when there was no active watcher to associate with.`,
    )
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options
  const warnInvalidSource = (s) => {
    ;(options.onWarn || warn$2)(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, a reactive object, or an array of these types.`,
    )
  }
  const reactiveGetter = (source2) => {
    if (deep) return source2
    if (isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1)
    return traverse(source2)
  }
  let effect
  let getter
  let cleanup
  let boundCleanup
  let forceTrigger = false
  let isMultiSource = false
  if (isRef(source)) {
    getter = () => source.value
    forceTrigger = isShallow(source)
  } else if (isReactive(source)) {
    getter = () => reactiveGetter(source)
    forceTrigger = true
  } else if (isArray(source)) {
    isMultiSource = true
    forceTrigger = source.some((s) => isReactive(s) || isShallow(s))
    getter = () =>
      source.map((s) => {
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          return reactiveGetter(s)
        } else if (isFunction(s)) {
          return call ? call(s, 2) : s()
        } else {
          !!(process.env.NODE_ENV !== 'production') && warnInvalidSource(s)
        }
      })
  } else if (isFunction(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking()
          try {
            cleanup()
          } finally {
            resetTracking()
          }
        }
        const currentEffect = activeWatcher
        activeWatcher = effect
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup)
        } finally {
          activeWatcher = currentEffect
        }
      }
    }
  } else {
    getter = NOOP
    !!(process.env.NODE_ENV !== 'production') && warnInvalidSource(source)
  }
  if (cb && deep) {
    const baseGetter = getter
    const depth = deep === true ? Infinity : deep
    getter = () => traverse(baseGetter(), depth)
  }
  const scope = getCurrentScope()
  const watchHandle = () => {
    effect.stop()
    if (scope && scope.active) {
      remove$1(scope.effects, effect)
    }
  }
  if (once && cb) {
    const _cb = cb
    cb = (...args) => {
      _cb(...args)
      watchHandle()
    }
  }
  let oldValue = isMultiSource
    ? new Array(source.length).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE
  const job = (immediateFirstRun) => {
    if (!(effect.flags & 1) || (!effect.dirty && !immediateFirstRun)) {
      return
    }
    if (cb) {
      const newValue = effect.run()
      if (
        deep ||
        forceTrigger ||
        (isMultiSource
          ? newValue.some((v, i) => hasChanged(v, oldValue[i]))
          : hasChanged(newValue, oldValue))
      ) {
        if (cleanup) {
          cleanup()
        }
        const currentWatcher = activeWatcher
        activeWatcher = effect
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE
              ? void 0
              : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
                ? []
                : oldValue,
            boundCleanup,
          ]
          oldValue = newValue
          call
            ? call(cb, 3, args)
            : // @ts-expect-error
              cb(...args)
        } finally {
          activeWatcher = currentWatcher
        }
      }
    } else {
      effect.run()
    }
  }
  if (augmentJob) {
    augmentJob(job)
  }
  effect = new ReactiveEffect(getter)
  effect.scheduler = scheduler ? () => scheduler(job, false) : job
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect)
  cleanup = effect.onStop = () => {
    const cleanups = cleanupMap.get(effect)
    if (cleanups) {
      if (call) {
        call(cleanups, 4)
      } else {
        for (const cleanup2 of cleanups) cleanup2()
      }
      cleanupMap.delete(effect)
    }
  }
  if (!!(process.env.NODE_ENV !== 'production')) {
    effect.onTrack = options.onTrack
    effect.onTrigger = options.onTrigger
  }
  if (cb) {
    if (immediate) {
      job(true)
    } else {
      oldValue = effect.run()
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true)
  } else {
    effect.run()
  }
  watchHandle.pause = effect.pause.bind(effect)
  watchHandle.resume = effect.resume.bind(effect)
  watchHandle.stop = watchHandle
  return watchHandle
}
function traverse(value, depth = Infinity, seen) {
  if (depth <= 0 || !isObject(value) || value['__v_skip']) {
    return value
  }
  seen = seen || /* @__PURE__ */ new Map()
  if ((seen.get(value) || 0) >= depth) {
    return value
  }
  seen.set(value, depth)
  depth--
  if (isRef(value)) {
    traverse(value.value, depth, seen)
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen)
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen)
    })
  } else if (isPlainObject$1(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen)
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen)
      }
    }
  }
  return value
}
/**
 * @vue/runtime-core v3.5.26
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/
const stack = []
function pushWarningContext(vnode) {
  stack.push(vnode)
}
function popWarningContext() {
  stack.pop()
}
let isWarning = false
function warn$1(msg, ...args) {
  if (isWarning) return
  isWarning = true
  pauseTracking()
  const instance = stack.length ? stack[stack.length - 1].component : null
  const appWarnHandler = instance && instance.appContext.config.warnHandler
  const trace = getComponentTrace()
  if (appWarnHandler) {
    callWithErrorHandling(appWarnHandler, instance, 11, [
      // eslint-disable-next-line no-restricted-syntax
      msg +
        args
          .map((a) => {
            var _a, _b
            return (_b = (_a = a.toString) == null ? void 0 : _a.call(a)) !=
              null
              ? _b
              : JSON.stringify(a)
          })
          .join(''),
      instance && instance.proxy,
      trace
        .map(({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`)
        .join('\n'),
      trace,
    ])
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args]
    if (
      trace.length && // avoid spamming console during tests
      true
    ) {
      warnArgs.push(
        `
`,
        ...formatTrace(trace),
      )
    }
    console.warn(...warnArgs)
  }
  resetTracking()
  isWarning = false
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1]
  if (!currentVNode) {
    return []
  }
  const normalizedStack = []
  while (currentVNode) {
    const last = normalizedStack[0]
    if (last && last.vnode === currentVNode) {
      last.recurseCount++
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0,
      })
    }
    const parentInstance =
      currentVNode.component && currentVNode.component.parent
    currentVNode = parentInstance && parentInstance.vnode
  }
  return normalizedStack
}
function formatTrace(trace) {
  const logs = []
  trace.forEach((entry, i) => {
    logs.push(
      ...(i === 0
        ? []
        : [
            `
`,
          ]),
      ...formatTraceEntry(entry),
    )
  })
  return logs
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix =
    recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``
  const isRoot = vnode.component ? vnode.component.parent == null : false
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot,
  )}`
  const close = `>` + postfix
  return vnode.props
    ? [open, ...formatProps(vnode.props), close]
    : [open + close]
}
function formatProps(props) {
  const res = []
  const keys = Object.keys(props)
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]))
  })
  if (keys.length > 3) {
    res.push(` ...`)
  }
  return res
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value)
    return raw ? value : [`${key}=${value}`]
  } else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value == null
  ) {
    return raw ? value : [`${key}=${value}`]
  } else if (isRef(value)) {
    value = formatProp(key, toRaw(value.value), true)
    return raw ? value : [`${key}=Ref<`, value, `>`]
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`]
  } else {
    value = toRaw(value)
    return raw ? value : [`${key}=`, value]
  }
}
const ErrorTypeStrings$1 = {
  ['sp']: 'serverPrefetch hook',
  ['bc']: 'beforeCreate hook',
  ['c']: 'created hook',
  ['bm']: 'beforeMount hook',
  ['m']: 'mounted hook',
  ['bu']: 'beforeUpdate hook',
  ['u']: 'updated',
  ['bum']: 'beforeUnmount hook',
  ['um']: 'unmounted hook',
  ['a']: 'activated hook',
  ['da']: 'deactivated hook',
  ['ec']: 'errorCaptured hook',
  ['rtc']: 'renderTracked hook',
  ['rtg']: 'renderTriggered hook',
  [0]: 'setup function',
  [1]: 'render function',
  [2]: 'watcher getter',
  [3]: 'watcher callback',
  [4]: 'watcher cleanup function',
  [5]: 'native event handler',
  [6]: 'component event handler',
  [7]: 'vnode hook',
  [8]: 'directive hook',
  [9]: 'transition hook',
  [10]: 'app errorHandler',
  [11]: 'app warnHandler',
  [12]: 'ref function',
  [13]: 'async component loader',
  [14]: 'scheduler flush',
  [15]: 'component update',
  [16]: 'app unmount cleanup function',
}
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn()
  } catch (err) {
    handleError(err, instance, type)
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args)
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type)
      })
    }
    return res
  }
  if (isArray(fn)) {
    const values = []
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args))
    }
    return values
  } else if (!!(process.env.NODE_ENV !== 'production')) {
    warn$1(
      `Invalid value type passed to callWithAsyncErrorHandling(): ${typeof fn}`,
    )
  }
}
function handleError(err, instance, type, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null
  const { errorHandler, throwUnhandledErrorInProduction } =
    (instance && instance.appContext.config) || EMPTY_OBJ
  if (instance) {
    let cur = instance.parent
    const exposedInstance = instance.proxy
    const errorInfo = !!(process.env.NODE_ENV !== 'production')
      ? ErrorTypeStrings$1[type]
      : `https://vuejs.org/error-reference/#runtime-${type}`
    while (cur) {
      const errorCapturedHooks = cur.ec
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (
            errorCapturedHooks[i](err, exposedInstance, errorInfo) === false
          ) {
            return
          }
        }
      }
      cur = cur.parent
    }
    if (errorHandler) {
      pauseTracking()
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo,
      ])
      resetTracking()
      return
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction)
}
function logError(
  err,
  type,
  contextVNode,
  throwInDev = true,
  throwInProd = false,
) {
  if (!!(process.env.NODE_ENV !== 'production')) {
    const info = ErrorTypeStrings$1[type]
    if (contextVNode) {
      pushWarningContext(contextVNode)
    }
    warn$1(`Unhandled error${info ? ` during execution of ${info}` : ``}`)
    if (contextVNode) {
      popWarningContext()
    }
    if (throwInDev) {
      throw err
    } else {
      console.error(err)
    }
  } else if (throwInProd) {
    throw err
  } else {
    console.error(err)
  }
}
const queue = []
let flushIndex = -1
const pendingPostFlushCbs = []
let activePostFlushCbs = null
let postFlushIndex = 0
const resolvedPromise = /* @__PURE__ */ Promise.resolve()
let currentFlushPromise = null
const RECURSION_LIMIT = 100
function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}
function findInsertionIndex(id) {
  let start = flushIndex + 1
  let end = queue.length
  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJob = queue[middle]
    const middleJobId = getId(middleJob)
    if (middleJobId < id || (middleJobId === id && middleJob.flags & 2)) {
      start = middle + 1
    } else {
      end = middle
    }
  }
  return start
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job)
    const lastJob = queue[queue.length - 1]
    if (
      !lastJob || // fast path when the job id is larger than the tail
      (!(job.flags & 2) && jobId >= getId(lastJob))
    ) {
      queue.push(job)
    } else {
      queue.splice(findInsertionIndex(jobId), 0, job)
    }
    job.flags |= 1
    queueFlush()
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}
function queuePostFlushCb(cb) {
  if (!isArray(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb)
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb)
      cb.flags |= 1
    }
  } else {
    pendingPostFlushCbs.push(...cb)
  }
  queueFlush()
}
function flushPreFlushCbs(instance, seen, i = flushIndex + 1) {
  if (!!(process.env.NODE_ENV !== 'production')) {
    seen = seen || /* @__PURE__ */ new Map()
  }
  for (; i < queue.length; i++) {
    const cb = queue[i]
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue
      }
      if (
        !!(process.env.NODE_ENV !== 'production') &&
        checkRecursiveUpdates(seen, cb)
      ) {
        continue
      }
      queue.splice(i, 1)
      i--
      if (cb.flags & 4) {
        cb.flags &= -2
      }
      cb()
      if (!(cb.flags & 4)) {
        cb.flags &= -2
      }
    }
  }
}
function flushPostFlushCbs(seen) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b),
    )
    pendingPostFlushCbs.length = 0
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped)
      return
    }
    activePostFlushCbs = deduped
    if (!!(process.env.NODE_ENV !== 'production')) {
      seen = seen || /* @__PURE__ */ new Map()
    }
    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      const cb = activePostFlushCbs[postFlushIndex]
      if (
        !!(process.env.NODE_ENV !== 'production') &&
        checkRecursiveUpdates(seen, cb)
      ) {
        continue
      }
      if (cb.flags & 4) {
        cb.flags &= -2
      }
      if (!(cb.flags & 8)) cb()
      cb.flags &= -2
    }
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}
const getId = (job) =>
  job.id == null ? (job.flags & 2 ? -1 : Infinity) : job.id
function flushJobs(seen) {
  if (!!(process.env.NODE_ENV !== 'production')) {
    seen = seen || /* @__PURE__ */ new Map()
  }
  const check = !!(process.env.NODE_ENV !== 'production')
    ? (job) => checkRecursiveUpdates(seen, job)
    : NOOP
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job && !(job.flags & 8)) {
        if (!!(process.env.NODE_ENV !== 'production') && check(job)) {
          continue
        }
        if (job.flags & 4) {
          job.flags &= ~1
        }
        callWithErrorHandling(job, job.i, job.i ? 15 : 14)
        if (!(job.flags & 4)) {
          job.flags &= ~1
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        job.flags &= -2
      }
    }
    flushIndex = -1
    queue.length = 0
    flushPostFlushCbs(seen)
    currentFlushPromise = null
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}
function checkRecursiveUpdates(seen, fn) {
  const count = seen.get(fn) || 0
  if (count > RECURSION_LIMIT) {
    const instance = fn.i
    const componentName = instance && getComponentName(instance.type)
    handleError(
      `Maximum recursive updates exceeded${componentName ? ` in component <${componentName}>` : ``}. This means you have a reactive effect that is mutating its own dependencies and thus recursively triggering itself. Possible sources include component template, render function, updated hook or watcher source function.`,
      null,
      10,
    )
    return true
  }
  seen.set(fn, count + 1)
  return false
}
let isHmrUpdating = false
const hmrDirtyComponents = /* @__PURE__ */ new Map()
if (!!(process.env.NODE_ENV !== 'production')) {
  getGlobalThis().__VUE_HMR_RUNTIME__ = {
    createRecord: tryWrap(createRecord),
    rerender: tryWrap(rerender),
    reload: tryWrap(reload),
  }
}
const map = /* @__PURE__ */ new Map()
function registerHMR(instance) {
  const id = instance.type.__hmrId
  let record = map.get(id)
  if (!record) {
    createRecord(id, instance.type)
    record = map.get(id)
  }
  record.instances.add(instance)
}
function unregisterHMR(instance) {
  map.get(instance.type.__hmrId).instances.delete(instance)
}
function createRecord(id, initialDef) {
  if (map.has(id)) {
    return false
  }
  map.set(id, {
    initialDef: normalizeClassComponent(initialDef),
    instances: /* @__PURE__ */ new Set(),
  })
  return true
}
function normalizeClassComponent(component) {
  return isClassComponent(component) ? component.__vccOpts : component
}
function rerender(id, newRender) {
  const record = map.get(id)
  if (!record) {
    return
  }
  record.initialDef.render = newRender
  ;[...record.instances].forEach((instance) => {
    if (newRender) {
      instance.render = newRender
      normalizeClassComponent(instance.type).render = newRender
    }
    instance.renderCache = []
    isHmrUpdating = true
    if (!(instance.job.flags & 8)) {
      instance.update()
    }
    isHmrUpdating = false
  })
}
function reload(id, newComp) {
  const record = map.get(id)
  if (!record) return
  newComp = normalizeClassComponent(newComp)
  updateComponentDef(record.initialDef, newComp)
  const instances = [...record.instances]
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]
    const oldComp = normalizeClassComponent(instance.type)
    let dirtyInstances = hmrDirtyComponents.get(oldComp)
    if (!dirtyInstances) {
      if (oldComp !== record.initialDef) {
        updateComponentDef(oldComp, newComp)
      }
      hmrDirtyComponents.set(
        oldComp,
        (dirtyInstances = /* @__PURE__ */ new Set()),
      )
    }
    dirtyInstances.add(instance)
    instance.appContext.propsCache.delete(instance.type)
    instance.appContext.emitsCache.delete(instance.type)
    instance.appContext.optionsCache.delete(instance.type)
    if (instance.ceReload) {
      dirtyInstances.add(instance)
      instance.ceReload(newComp.styles)
      dirtyInstances.delete(instance)
    } else if (instance.parent) {
      queueJob(() => {
        if (!(instance.job.flags & 8)) {
          isHmrUpdating = true
          instance.parent.update()
          isHmrUpdating = false
          dirtyInstances.delete(instance)
        }
      })
    } else if (instance.appContext.reload) {
      instance.appContext.reload()
    } else if (typeof window !== 'undefined') {
      window.location.reload()
    } else {
      console.warn(
        '[HMR] Root or manually mounted instance modified. Full reload required.',
      )
    }
    if (instance.root.ce && instance !== instance.root) {
      instance.root.ce._removeChildStyle(oldComp)
    }
  }
  queuePostFlushCb(() => {
    hmrDirtyComponents.clear()
  })
}
function updateComponentDef(oldComp, newComp) {
  extend(oldComp, newComp)
  for (const key in oldComp) {
    if (key !== '__file' && !(key in newComp)) {
      delete oldComp[key]
    }
  }
}
function tryWrap(fn) {
  return (id, arg) => {
    try {
      return fn(id, arg)
    } catch (e) {
      console.error(e)
      console.warn(
        `[HMR] Something went wrong during Vue component hot-reload. Full reload required.`,
      )
    }
  }
}
let devtools$1
let buffer = []
let devtoolsNotInstalled = false
function emit$1(event, ...args) {
  if (devtools$1) {
    devtools$1.emit(event, ...args)
  } else if (!devtoolsNotInstalled) {
    buffer.push({ event, args })
  }
}
function setDevtoolsHook$1(hook, target) {
  var _a, _b
  devtools$1 = hook
  if (devtools$1) {
    devtools$1.enabled = true
    buffer.forEach(({ event, args }) => devtools$1.emit(event, ...args))
    buffer = []
  } else if (
    // handle late devtools injection - only do this if we are in an actual
    // browser environment to avoid the timer handle stalling test runner exit
    // (#4815)
    typeof window !== 'undefined' && // some envs mock window but not fully
    window.HTMLElement && // also exclude jsdom
    // eslint-disable-next-line no-restricted-syntax
    !((_b = (_a = window.navigator) == null ? void 0 : _a.userAgent) == null
      ? void 0
      : _b.includes('jsdom'))
  ) {
    const replay = (target.__VUE_DEVTOOLS_HOOK_REPLAY__ =
      target.__VUE_DEVTOOLS_HOOK_REPLAY__ || [])
    replay.push((newHook) => {
      setDevtoolsHook$1(newHook, target)
    })
    setTimeout(() => {
      if (!devtools$1) {
        target.__VUE_DEVTOOLS_HOOK_REPLAY__ = null
        devtoolsNotInstalled = true
        buffer = []
      }
    }, 3e3)
  } else {
    devtoolsNotInstalled = true
    buffer = []
  }
}
function devtoolsInitApp(app2, version2) {
  emit$1('app:init', app2, version2, {
    Fragment,
    Text,
    Comment,
    Static,
  })
}
function devtoolsUnmountApp(app2) {
  emit$1('app:unmount', app2)
}
const devtoolsComponentAdded = /* @__PURE__ */ createDevtoolsComponentHook(
  'component:added',
  /* COMPONENT_ADDED */
)
const devtoolsComponentUpdated = /* @__PURE__ */ createDevtoolsComponentHook(
  'component:updated',
  /* COMPONENT_UPDATED */
)
const _devtoolsComponentRemoved = /* @__PURE__ */ createDevtoolsComponentHook(
  'component:removed',
  /* COMPONENT_REMOVED */
)
const devtoolsComponentRemoved = (component) => {
  if (
    devtools$1 &&
    typeof devtools$1.cleanupBuffer === 'function' && // remove the component if it wasn't buffered
    !devtools$1.cleanupBuffer(component)
  ) {
    _devtoolsComponentRemoved(component)
  }
}
// @__NO_SIDE_EFFECTS__
function createDevtoolsComponentHook(hook) {
  return (component) => {
    emit$1(
      hook,
      component.appContext.app,
      component.uid,
      component.parent ? component.parent.uid : void 0,
      component,
    )
  }
}
const devtoolsPerfStart = /* @__PURE__ */ createDevtoolsPerformanceHook(
  'perf:start',
  /* PERFORMANCE_START */
)
const devtoolsPerfEnd = /* @__PURE__ */ createDevtoolsPerformanceHook(
  'perf:end',
  /* PERFORMANCE_END */
)
function createDevtoolsPerformanceHook(hook) {
  return (component, type, time) => {
    emit$1(hook, component.appContext.app, component.uid, component, type, time)
  }
}
function devtoolsComponentEmit(component, event, params) {
  emit$1('component:emit', component.appContext.app, component, event, params)
}
let currentRenderingInstance = null
let currentScopeId = null
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance
  currentRenderingInstance = instance
  currentScopeId = (instance && instance.type.__scopeId) || null
  return prev
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn
  if (fn._n) {
    return fn
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1)
    }
    const prevInstance = setCurrentRenderingInstance(ctx)
    let res
    try {
      res = fn(...args)
    } finally {
      setCurrentRenderingInstance(prevInstance)
      if (renderFnWithContext._d) {
        setBlockTracking(1)
      }
    }
    if (!!(process.env.NODE_ENV !== 'production') || false) {
      devtoolsComponentUpdated(ctx)
    }
    return res
  }
  renderFnWithContext._n = true
  renderFnWithContext._c = true
  renderFnWithContext._d = true
  return renderFnWithContext
}
function validateDirectiveName(name) {
  if (isBuiltInDirective(name)) {
    warn$1('Do not use built-in directive ids as custom directive id: ' + name)
  }
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs
  const oldBindings = prevVNode && prevVNode.dirs
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i]
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value
    }
    let hook = binding.dir[name]
    if (hook) {
      pauseTracking()
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode,
      ])
      resetTracking()
    }
  }
}
function provide(key, value) {
  if (!!(process.env.NODE_ENV !== 'production')) {
    if (!currentInstance || currentInstance.isMounted) {
      warn$1(`provide() can only be used inside setup().`)
    }
  }
  if (currentInstance) {
    let provides = currentInstance.provides
    const parentProvides =
      currentInstance.parent && currentInstance.parent.provides
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    provides[key] = value
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance()
  if (instance || currentApp) {
    let provides = currentApp
      ? currentApp._context.provides
      : instance
        ? instance.parent == null || instance.ce
          ? instance.vnode.appContext && instance.vnode.appContext.provides
          : instance.parent.provides
        : void 0
    if (provides && key in provides) {
      return provides[key]
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue)
        ? defaultValue.call(instance && instance.proxy)
        : defaultValue
    } else if (!!(process.env.NODE_ENV !== 'production')) {
      warn$1(`injection "${String(key)}" not found.`)
    }
  } else if (!!(process.env.NODE_ENV !== 'production')) {
    warn$1(`inject() can only be used inside setup() or functional components.`)
  }
}
const ssrContextKey = /* @__PURE__ */ Symbol.for('v-scx')
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey)
    if (!ctx) {
      !!(process.env.NODE_ENV !== 'production') &&
        warn$1(
          `Server rendering context not provided. Make sure to only call useSSRContext() conditionally in the server build.`,
        )
    }
    return ctx
  }
}
function watchEffect(effect2, options) {
  return doWatch(effect2, null, options)
}
function watch(source, cb, options) {
  if (!!(process.env.NODE_ENV !== 'production') && !isFunction(cb)) {
    warn$1(
      `\`watch(fn, options?)\` signature has been moved to a separate API. Use \`watchEffect(fn, options?)\` instead. \`watch\` now only supports \`watch(source, cb, options?) signature.`,
    )
  }
  return doWatch(source, cb, options)
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options
  if (!!(process.env.NODE_ENV !== 'production') && !cb) {
    if (immediate !== void 0) {
      warn$1(
        `watch() "immediate" option is only respected when using the watch(source, callback, options?) signature.`,
      )
    }
    if (deep !== void 0) {
      warn$1(
        `watch() "deep" option is only respected when using the watch(source, callback, options?) signature.`,
      )
    }
    if (once !== void 0) {
      warn$1(
        `watch() "once" option is only respected when using the watch(source, callback, options?) signature.`,
      )
    }
  }
  const baseWatchOptions = extend({}, options)
  if (!!(process.env.NODE_ENV !== 'production'))
    baseWatchOptions.onWarn = warn$1
  const runsImmediately = (cb && immediate) || (!cb && flush !== 'post')
  let ssrCleanup
  if (isInSSRComponentSetup) {
    if (flush === 'sync') {
      const ctx = useSSRContext()
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = [])
    } else if (!runsImmediately) {
      const watchStopHandle = () => {}
      watchStopHandle.stop = NOOP
      watchStopHandle.resume = NOOP
      watchStopHandle.pause = NOOP
      return watchStopHandle
    }
  }
  const instance = currentInstance
  baseWatchOptions.call = (fn, type, args) =>
    callWithAsyncErrorHandling(fn, instance, type, args)
  let isPre = false
  if (flush === 'post') {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense)
    }
  } else if (flush !== 'sync') {
    isPre = true
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job()
      } else {
        queueJob(job)
      }
    }
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4
    }
    if (isPre) {
      job.flags |= 2
      if (instance) {
        job.id = instance.uid
        job.i = instance
      }
    }
  }
  const watchHandle = watch$1(source, cb, baseWatchOptions)
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle)
    } else if (runsImmediately) {
      watchHandle()
    }
  }
  return watchHandle
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy
  const getter = isString(source)
    ? source.includes('.')
      ? createPathGetter(publicThis, source)
      : () => publicThis[source]
    : source.bind(publicThis, publicThis)
  let cb
  if (isFunction(value)) {
    cb = value
  } else {
    cb = value.handler
    options = value
  }
  const reset = setCurrentInstance(this)
  const res = doWatch(getter, cb.bind(publicThis), options)
  reset()
  return res
}
function createPathGetter(ctx, path) {
  const segments = path.split('.')
  return () => {
    let cur = ctx
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]]
    }
    return cur
  }
}
const TeleportEndKey = /* @__PURE__ */ Symbol('_vte')
const isTeleport = (type) => type.__isTeleport
const leaveCbKey = /* @__PURE__ */ Symbol('_leaveCb')
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks
    setTransitionHooks(vnode.component.subTree, hooks)
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent)
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback)
  } else {
    vnode.transition = hooks
  }
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options)
    ? // #8236: extend call and options.name access are considered side-effects
      // by Rollup, so we have to wrap it in a pure-annotated IIFE.
      /* @__PURE__ */ (() =>
        extend({ name: options.name }, extraOptions, { setup: options }))()
    : options
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + '-', 0, 0]
}
const knownTemplateRefs = /* @__PURE__ */ new WeakSet()
const pendingSetRefMap = /* @__PURE__ */ new WeakMap()
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray(rawRef)) {
    rawRef.forEach((r, i) =>
      setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount,
      ),
    )
    return
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (
      vnode.shapeFlag & 512 &&
      vnode.type.__asyncResolved &&
      vnode.component.subTree.component
    ) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree)
    }
    return
  }
  const refValue =
    vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el
  const value = isUnmount ? null : refValue
  const { i: owner, r: ref3 } = rawRef
  if (!!(process.env.NODE_ENV !== 'production') && !owner) {
    warn$1(
      `Missing ref owner context. ref cannot be used on hoisted vnodes. A vnode with ref must be created inside the render function.`,
    )
    return
  }
  const oldRef = oldRawRef && oldRawRef.r
  const refs = owner.refs === EMPTY_OBJ ? (owner.refs = {}) : owner.refs
  const setupState = owner.setupState
  const rawSetupState = toRaw(setupState)
  const canSetSetupRef =
    setupState === EMPTY_OBJ
      ? NO
      : (key) => {
          if (!!(process.env.NODE_ENV !== 'production')) {
            if (hasOwn(rawSetupState, key) && !isRef(rawSetupState[key])) {
              warn$1(
                `Template ref "${key}" used on a non-ref value. It will not work in the production build.`,
              )
            }
            if (knownTemplateRefs.has(rawSetupState[key])) {
              return false
            }
          }
          return hasOwn(rawSetupState, key)
        }
  const canSetRef = (ref22) => {
    return (
      !!!(process.env.NODE_ENV !== 'production') ||
      !knownTemplateRefs.has(ref22)
    )
  }
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef)
    if (isString(oldRef)) {
      refs[oldRef] = null
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null
      }
    } else if (isRef(oldRef)) {
      if (canSetRef(oldRef)) {
        oldRef.value = null
      }
      const oldRawRefAtom = oldRawRef
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null
    }
  }
  if (isFunction(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs])
  } else {
    const _isString = isString(ref3)
    const _isRef = isRef(ref3)
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString
            ? canSetSetupRef(ref3)
              ? setupState[ref3]
              : refs[ref3]
            : canSetRef(ref3) || !rawRef.k
              ? ref3.value
              : refs[rawRef.k]
          if (isUnmount) {
            isArray(existing) && remove$1(existing, refValue)
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref3] = [refValue]
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3]
                }
              } else {
                const newVal = [refValue]
                if (canSetRef(ref3)) {
                  ref3.value = newVal
                }
                if (rawRef.k) refs[rawRef.k] = newVal
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue)
            }
          }
        } else if (_isString) {
          refs[ref3] = value
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value
          }
        } else if (_isRef) {
          if (canSetRef(ref3)) {
            ref3.value = value
          }
          if (rawRef.k) refs[rawRef.k] = value
        } else if (!!(process.env.NODE_ENV !== 'production')) {
          warn$1('Invalid template ref type:', ref3, `(${typeof ref3})`)
        }
      }
      if (value) {
        const job = () => {
          doSet()
          pendingSetRefMap.delete(rawRef)
        }
        job.id = -1
        pendingSetRefMap.set(rawRef, job)
        queuePostRenderEffect(job, parentSuspense)
      } else {
        invalidatePendingSetRef(rawRef)
        doSet()
      }
    } else if (!!(process.env.NODE_ENV !== 'production')) {
      warn$1('Invalid template ref type:', ref3, `(${typeof ref3})`)
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef)
  if (pendingSetRef) {
    pendingSetRef.flags |= 8
    pendingSetRefMap.delete(rawRef)
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1))
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id))
const isAsyncWrapper = (i) => !!i.type.__asyncLoader
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive
function onActivated(hook, target) {
  registerKeepAliveHook(hook, 'a', target)
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, 'da', target)
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook =
    hook.__wdc ||
    (hook.__wdc = () => {
      let current = target
      while (current) {
        if (current.isDeactivated) {
          return
        }
        current = current.parent
      }
      return hook()
    })
  injectHook(type, wrappedHook, target)
  if (target) {
    let current = target.parent
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current)
      }
      current = current.parent
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true,
    /* prepend */
  )
  onUnmounted(() => {
    remove$1(keepAliveRoot[type], injected)
  }, target)
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = [])
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args) => {
        pauseTracking()
        const reset = setCurrentInstance(target)
        const res = callWithAsyncErrorHandling(hook, target, type, args)
        reset()
        resetTracking()
        return res
      })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  } else if (!!(process.env.NODE_ENV !== 'production')) {
    const apiName = toHandlerKey(ErrorTypeStrings$1[type].replace(/ hook$/, ''))
    warn$1(
      `${apiName} is called when there is no active component instance to be associated with. Lifecycle injection APIs can only be used during execution of setup(). If you are using async setup(), make sure to register lifecycle hooks before the first await statement.`,
    )
  }
}
const createHook =
  (lifecycle) =>
  (hook, target = currentInstance) => {
    if (!isInSSRComponentSetup || lifecycle === 'sp') {
      injectHook(lifecycle, (...args) => hook(...args), target)
    }
  }
const onBeforeMount = createHook('bm')
const onMounted = createHook('m')
const onBeforeUpdate = createHook('bu')
const onUpdated = createHook('u')
const onBeforeUnmount = createHook('bum')
const onUnmounted = createHook('um')
const onServerPrefetch = createHook('sp')
const onRenderTriggered = createHook('rtg')
const onRenderTracked = createHook('rtc')
function onErrorCaptured(hook, target = currentInstance) {
  injectHook('ec', hook, target)
}
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for('v-ndc')
const getPublicInstance = (i) => {
  if (!i) return null
  if (isStatefulComponent(i)) return getComponentPublicInstance(i)
  return getPublicInstance(i.parent)
}
const publicPropertiesMap =
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) =>
      !!(process.env.NODE_ENV !== 'production')
        ? shallowReadonly(i.props)
        : i.props,
    $attrs: (i) =>
      !!(process.env.NODE_ENV !== 'production')
        ? shallowReadonly(i.attrs)
        : i.attrs,
    $slots: (i) =>
      !!(process.env.NODE_ENV !== 'production')
        ? shallowReadonly(i.slots)
        : i.slots,
    $refs: (i) =>
      !!(process.env.NODE_ENV !== 'production')
        ? shallowReadonly(i.refs)
        : i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i),
    $forceUpdate: (i) =>
      i.f ||
      (i.f = () => {
        queueJob(i.update)
      }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i),
  })
const isReservedPrefix = (key) => key === '_' || key === '$'
const hasSetupBinding = (state, key) =>
  state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key)
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === '__v_skip') {
      return true
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } =
      instance
    if (!!(process.env.NODE_ENV !== 'production') && key === '__isVue') {
      return true
    }
    if (key[0] !== '$') {
      const n = accessCache[key]
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key]
          case 2:
            return data[key]
          case 4:
            return ctx[key]
          case 3:
            return props[key]
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1
        return setupState[key]
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2
        return data[key]
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3
        return props[key]
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4
        return ctx[key]
      } else if (shouldCacheAccess) {
        accessCache[key] = 0
      }
    }
    const publicGetter = publicPropertiesMap[key]
    let cssModule, globalProperties
    if (publicGetter) {
      if (key === '$attrs') {
        track(instance.attrs, 'get', '')
        !!(process.env.NODE_ENV !== 'production') && markAttrsAccessed()
      } else if (
        !!(process.env.NODE_ENV !== 'production') &&
        key === '$slots'
      ) {
        track(instance, 'get', key)
      }
      return publicGetter(instance)
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) &&
      (cssModule = cssModule[key])
    ) {
      return cssModule
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4
      return ctx[key]
    } else if (
      // global properties
      ((globalProperties = appContext.config.globalProperties),
      hasOwn(globalProperties, key))
    ) {
      {
        return globalProperties[key]
      }
    } else if (
      !!(process.env.NODE_ENV !== 'production') &&
      currentRenderingInstance &&
      (!isString(key) || // #1091 avoid internal isRef/isVNode checks on component instance leading
        // to infinite warning loop
        key.indexOf('__v') !== 0)
    ) {
      if (data !== EMPTY_OBJ && isReservedPrefix(key[0]) && hasOwn(data, key)) {
        warn$1(
          `Property ${JSON.stringify(
            key,
          )} must be accessed via $data because it starts with a reserved character ("$" or "_") and is not proxied on the render context.`,
        )
      } else if (instance === currentRenderingInstance) {
        warn$1(
          `Property ${JSON.stringify(key)} was accessed during render but is not defined on instance.`,
        )
      }
    }
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value
      return true
    } else if (
      !!(process.env.NODE_ENV !== 'production') &&
      setupState.__isScriptSetup &&
      hasOwn(setupState, key)
    ) {
      warn$1(`Cannot mutate <script setup> binding "${key}" from Options API.`)
      return false
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value
      return true
    } else if (hasOwn(instance.props, key)) {
      !!(process.env.NODE_ENV !== 'production') &&
        warn$1(`Attempting to mutate prop "${key}". Props are readonly.`)
      return false
    }
    if (key[0] === '$' && key.slice(1) in instance) {
      !!(process.env.NODE_ENV !== 'production') &&
        warn$1(
          `Attempting to mutate public property "${key}". Properties starting with $ are reserved and readonly.`,
        )
      return false
    } else {
      if (
        !!(process.env.NODE_ENV !== 'production') &&
        key in instance.appContext.config.globalProperties
      ) {
        Object.defineProperty(ctx, key, {
          enumerable: true,
          configurable: true,
          value,
        })
      } else {
        ctx[key] = value
      }
    }
    return true
  },
  has(
    { _: { data, setupState, accessCache, ctx, appContext, props, type } },
    key,
  ) {
    let cssModules
    return !!(
      accessCache[key] ||
      (data !== EMPTY_OBJ && key[0] !== '$' && hasOwn(data, key)) ||
      hasSetupBinding(setupState, key) ||
      hasOwn(props, key) ||
      hasOwn(ctx, key) ||
      hasOwn(publicPropertiesMap, key) ||
      hasOwn(appContext.config.globalProperties, key) ||
      ((cssModules = type.__cssModules) && cssModules[key])
    )
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0
    } else if (hasOwn(descriptor, 'value')) {
      this.set(target, key, descriptor.value, null)
    }
    return Reflect.defineProperty(target, key, descriptor)
  },
}
if (!!(process.env.NODE_ENV !== 'production') && true) {
  PublicInstanceProxyHandlers.ownKeys = (target) => {
    warn$1(
      `Avoid app logic that relies on enumerating keys on a component instance. The keys will be empty in production mode to avoid performance overhead.`,
    )
    return Reflect.ownKeys(target)
  }
}
function createDevRenderContext(instance) {
  const target = {}
  Object.defineProperty(target, `_`, {
    configurable: true,
    enumerable: false,
    get: () => instance,
  })
  Object.keys(publicPropertiesMap).forEach((key) => {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      get: () => publicPropertiesMap[key](instance),
      // intercepted by the proxy so no need for implementation,
      // but needed to prevent set errors
      set: NOOP,
    })
  })
  return target
}
function exposePropsOnRenderContext(instance) {
  const {
    ctx,
    propsOptions: [propsOptions],
  } = instance
  if (propsOptions) {
    Object.keys(propsOptions).forEach((key) => {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => instance.props[key],
        set: NOOP,
      })
    })
  }
}
function exposeSetupStateOnRenderContext(instance) {
  const { ctx, setupState } = instance
  Object.keys(toRaw(setupState)).forEach((key) => {
    if (!setupState.__isScriptSetup) {
      if (isReservedPrefix(key[0])) {
        warn$1(
          `setup() return property ${JSON.stringify(
            key,
          )} should not start with "$" or "_" which are reserved prefixes for Vue internals.`,
        )
        return
      }
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => setupState[key],
        set: NOOP,
      })
    }
  })
}
function normalizePropsOrEmits(props) {
  return isArray(props)
    ? props.reduce((normalized, p) => ((normalized[p] = null), normalized), {})
    : props
}
function createDuplicateChecker() {
  const cache = /* @__PURE__ */ Object.create(null)
  return (type, key) => {
    if (cache[key]) {
      warn$1(`${type} property "${key}" is already defined in ${cache[key]}.`)
    } else {
      cache[key] = type
    }
  }
}
let shouldCacheAccess = true
function applyOptions(instance) {
  const options = resolveMergedOptions(instance)
  const publicThis = instance.proxy
  const ctx = instance.ctx
  shouldCacheAccess = false
  if (options.beforeCreate) {
    callHook(options.beforeCreate, instance, 'bc')
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters,
  } = options
  const checkDuplicateProperties = !!(process.env.NODE_ENV !== 'production')
    ? createDuplicateChecker()
    : null
  if (!!(process.env.NODE_ENV !== 'production')) {
    const [propsOptions] = instance.propsOptions
    if (propsOptions) {
      for (const key in propsOptions) {
        checkDuplicateProperties('Props', key)
      }
    }
  }
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties)
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key]
      if (isFunction(methodHandler)) {
        if (!!(process.env.NODE_ENV !== 'production')) {
          Object.defineProperty(ctx, key, {
            value: methodHandler.bind(publicThis),
            configurable: true,
            enumerable: true,
            writable: true,
          })
        } else {
          ctx[key] = methodHandler.bind(publicThis)
        }
        if (!!(process.env.NODE_ENV !== 'production')) {
          checkDuplicateProperties('Methods', key)
        }
      } else if (!!(process.env.NODE_ENV !== 'production')) {
        warn$1(
          `Method "${key}" has type "${typeof methodHandler}" in the component definition. Did you reference the function correctly?`,
        )
      }
    }
  }
  if (dataOptions) {
    if (!!(process.env.NODE_ENV !== 'production') && !isFunction(dataOptions)) {
      warn$1(
        `The data option must be a function. Plain object usage is no longer supported.`,
      )
    }
    const data = dataOptions.call(publicThis, publicThis)
    if (!!(process.env.NODE_ENV !== 'production') && isPromise(data)) {
      warn$1(
        `data() returned a Promise - note data() cannot be async; If you intend to perform data fetching before component renders, use async setup() + <Suspense>.`,
      )
    }
    if (!isObject(data)) {
      !!(process.env.NODE_ENV !== 'production') &&
        warn$1(`data() should return an object.`)
    } else {
      instance.data = reactive(data)
      if (!!(process.env.NODE_ENV !== 'production')) {
        for (const key in data) {
          checkDuplicateProperties('Data', key)
          if (!isReservedPrefix(key[0])) {
            Object.defineProperty(ctx, key, {
              configurable: true,
              enumerable: true,
              get: () => data[key],
              set: NOOP,
            })
          }
        }
      }
    }
  }
  shouldCacheAccess = true
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key]
      const get = isFunction(opt)
        ? opt.bind(publicThis, publicThis)
        : isFunction(opt.get)
          ? opt.get.bind(publicThis, publicThis)
          : NOOP
      if (!!(process.env.NODE_ENV !== 'production') && get === NOOP) {
        warn$1(`Computed property "${key}" has no getter.`)
      }
      const set =
        !isFunction(opt) && isFunction(opt.set)
          ? opt.set.bind(publicThis)
          : !!(process.env.NODE_ENV !== 'production')
            ? () => {
                warn$1(
                  `Write operation failed: computed property "${key}" is readonly.`,
                )
              }
            : NOOP
      const c = computed({
        get,
        set,
      })
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => (c.value = v),
      })
      if (!!(process.env.NODE_ENV !== 'production')) {
        checkDuplicateProperties('Computed', key)
      }
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key)
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions)
      ? provideOptions.call(publicThis)
      : provideOptions
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key])
    })
  }
  if (created) {
    callHook(created, instance, 'c')
  }
  function registerLifecycleHook(register, hook) {
    if (isArray(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)))
    } else if (hook) {
      register(hook.bind(publicThis))
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount)
  registerLifecycleHook(onMounted, mounted)
  registerLifecycleHook(onBeforeUpdate, beforeUpdate)
  registerLifecycleHook(onUpdated, updated)
  registerLifecycleHook(onActivated, activated)
  registerLifecycleHook(onDeactivated, deactivated)
  registerLifecycleHook(onErrorCaptured, errorCaptured)
  registerLifecycleHook(onRenderTracked, renderTracked)
  registerLifecycleHook(onRenderTriggered, renderTriggered)
  registerLifecycleHook(onBeforeUnmount, beforeUnmount)
  registerLifecycleHook(onUnmounted, unmounted)
  registerLifecycleHook(onServerPrefetch, serverPrefetch)
  if (isArray(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {})
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => (publicThis[key] = val),
          enumerable: true,
        })
      })
    } else if (!instance.exposed) {
      instance.exposed = {}
    }
  }
  if (render && instance.render === NOOP) {
    instance.render = render
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs
  }
  if (components) instance.components = components
  if (directives) instance.directives = directives
  if (serverPrefetch) {
    markAsyncBoundary(instance)
  }
}
function resolveInjections(
  injectOptions,
  ctx,
  checkDuplicateProperties = NOOP,
) {
  if (isArray(injectOptions)) {
    injectOptions = normalizeInject(injectOptions)
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key]
    let injected
    if (isObject(opt)) {
      if ('default' in opt) {
        injected = inject(opt.from || key, opt.default, true)
      } else {
        injected = inject(opt.from || key)
      }
    } else {
      injected = inject(opt)
    }
    if (isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => (injected.value = v),
      })
    } else {
      ctx[key] = injected
    }
    if (!!(process.env.NODE_ENV !== 'production')) {
      checkDuplicateProperties('Inject', key)
    }
  }
}
function callHook(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray(hook)
      ? hook.map((h2) => h2.bind(instance.proxy))
      : hook.bind(instance.proxy),
    instance,
    type,
  )
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes('.')
    ? createPathGetter(publicThis, key)
    : () => publicThis[key]
  if (isString(raw)) {
    const handler = ctx[raw]
    if (isFunction(handler)) {
      {
        watch(getter, handler)
      }
    } else if (!!(process.env.NODE_ENV !== 'production')) {
      warn$1(`Invalid watch handler specified by key "${raw}"`, handler)
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis))
    }
  } else if (isObject(raw)) {
    if (isArray(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key))
    } else {
      const handler = isFunction(raw.handler)
        ? raw.handler.bind(publicThis)
        : ctx[raw.handler]
      if (isFunction(handler)) {
        watch(getter, handler, raw)
      } else if (!!(process.env.NODE_ENV !== 'production')) {
        warn$1(
          `Invalid watch handler specified by key "${raw.handler}"`,
          handler,
        )
      }
    }
  } else if (!!(process.env.NODE_ENV !== 'production')) {
    warn$1(`Invalid watch option: "${key}"`, raw)
  }
}
function resolveMergedOptions(instance) {
  const base = instance.type
  const { mixins, extends: extendsOptions } = base
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies },
  } = instance.appContext
  const cached = cache.get(base)
  let resolved
  if (cached) {
    resolved = cached
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base
    }
  } else {
    resolved = {}
    if (globalMixins.length) {
      globalMixins.forEach((m) =>
        mergeOptions(resolved, m, optionMergeStrategies, true),
      )
    }
    mergeOptions(resolved, base, optionMergeStrategies)
  }
  if (isObject(base)) {
    cache.set(base, resolved)
  }
  return resolved
}
function mergeOptions(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from
  if (extendsOptions) {
    mergeOptions(to, extendsOptions, strats, true)
  }
  if (mixins) {
    mixins.forEach((m) => mergeOptions(to, m, strats, true))
  }
  for (const key in from) {
    if (asMixin && key === 'expose') {
      !!(process.env.NODE_ENV !== 'production') &&
        warn$1(
          `"expose" option is ignored when declared in mixins or extends. It should only be declared in the base component itself.`,
        )
    } else {
      const strat = internalOptionMergeStrats[key] || (strats && strats[key])
      to[key] = strat ? strat(to[key], from[key]) : from[key]
    }
  }
  return to
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject,
}
function mergeDataFn(to, from) {
  if (!from) {
    return to
  }
  if (!to) {
    return from
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from,
    )
  }
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from))
}
function normalizeInject(raw) {
  if (isArray(raw)) {
    const res = {}
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i]
    }
    return res
  }
  return raw
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray(to) && isArray(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])]
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {}),
    )
  } else {
    return from
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from
  if (!from) return to
  const merged = extend(/* @__PURE__ */ Object.create(null), to)
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key])
  }
  return merged
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {},
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap(),
  }
}
let uid$1 = 0
function createAppAPI(render, hydrate) {
  return function createApp(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent)
    }
    if (rootProps != null && !isObject(rootProps)) {
      !!(process.env.NODE_ENV !== 'production') &&
        warn$1(`root props passed to app.mount() must be an object.`)
      rootProps = null
    }
    const context = createAppContext()
    const installedPlugins = /* @__PURE__ */ new WeakSet()
    const pluginCleanupFns = []
    let isMounted = false
    const app2 = (context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config
      },
      set config(v) {
        if (!!(process.env.NODE_ENV !== 'production')) {
          warn$1(
            `app.config cannot be replaced. Modify individual options instead.`,
          )
        }
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) {
          !!(process.env.NODE_ENV !== 'production') &&
            warn$1(`Plugin has already been applied to target app.`)
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin)
          plugin.install(app2, ...options)
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin)
          plugin(app2, ...options)
        } else if (!!(process.env.NODE_ENV !== 'production')) {
          warn$1(
            `A plugin must either be a function or an object with an "install" function.`,
          )
        }
        return app2
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin)
          } else if (!!(process.env.NODE_ENV !== 'production')) {
            warn$1(
              'Mixin has already been applied to target app' +
                (mixin.name ? `: ${mixin.name}` : ''),
            )
          }
        }
        return app2
      },
      component(name, component) {
        if (!!(process.env.NODE_ENV !== 'production')) {
          validateComponentName(name, context.config)
        }
        if (!component) {
          return context.components[name]
        }
        if (
          !!(process.env.NODE_ENV !== 'production') &&
          context.components[name]
        ) {
          warn$1(
            `Component "${name}" has already been registered in target app.`,
          )
        }
        context.components[name] = component
        return app2
      },
      directive(name, directive) {
        if (!!(process.env.NODE_ENV !== 'production')) {
          validateDirectiveName(name)
        }
        if (!directive) {
          return context.directives[name]
        }
        if (
          !!(process.env.NODE_ENV !== 'production') &&
          context.directives[name]
        ) {
          warn$1(
            `Directive "${name}" has already been registered in target app.`,
          )
        }
        context.directives[name] = directive
        return app2
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          if (
            !!(process.env.NODE_ENV !== 'production') &&
            rootContainer.__vue_app__
          ) {
            warn$1(
              `There is already an app instance mounted on the host container.
 If you want to mount another app on the same host container, you need to unmount the previous app by calling \`app.unmount()\` first.`,
            )
          }
          const vnode = app2._ceVNode || createVNode(rootComponent, rootProps)
          vnode.appContext = context
          if (namespace === true) {
            namespace = 'svg'
          } else if (namespace === false) {
            namespace = void 0
          }
          if (!!(process.env.NODE_ENV !== 'production')) {
            context.reload = () => {
              const cloned = cloneVNode(vnode)
              cloned.el = null
              render(cloned, rootContainer, namespace)
            }
          }
          {
            render(vnode, rootContainer, namespace)
          }
          isMounted = true
          app2._container = rootContainer
          rootContainer.__vue_app__ = app2
          if (!!(process.env.NODE_ENV !== 'production') || false) {
            app2._instance = vnode.component
            devtoolsInitApp(app2, version)
          }
          return getComponentPublicInstance(vnode.component)
        } else if (!!(process.env.NODE_ENV !== 'production')) {
          warn$1(
            `App has already been mounted.
If you want to remount the same app, move your app creation logic into a factory function and create fresh app instances for each mount - e.g. \`const createMyApp = () => createApp(App)\``,
          )
        }
      },
      onUnmount(cleanupFn) {
        if (
          !!(process.env.NODE_ENV !== 'production') &&
          typeof cleanupFn !== 'function'
        ) {
          warn$1(
            `Expected function as first argument to app.onUnmount(), but got ${typeof cleanupFn}`,
          )
        }
        pluginCleanupFns.push(cleanupFn)
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(pluginCleanupFns, app2._instance, 16)
          render(null, app2._container)
          if (!!(process.env.NODE_ENV !== 'production') || false) {
            app2._instance = null
            devtoolsUnmountApp(app2)
          }
          delete app2._container.__vue_app__
        } else if (!!(process.env.NODE_ENV !== 'production')) {
          warn$1(`Cannot unmount an app that is not mounted.`)
        }
      },
      provide(key, value) {
        if (
          !!(process.env.NODE_ENV !== 'production') &&
          key in context.provides
        ) {
          if (hasOwn(context.provides, key)) {
            warn$1(
              `App already provides property with key "${String(key)}". It will be overwritten with the new value.`,
            )
          } else {
            warn$1(
              `App already provides property with key "${String(key)}" inherited from its parent element. It will be overwritten with the new value.`,
            )
          }
        }
        context.provides[key] = value
        return app2
      },
      runWithContext(fn) {
        const lastApp = currentApp
        currentApp = app2
        try {
          return fn()
        } finally {
          currentApp = lastApp
        }
      },
    })
    return app2
  }
}
let currentApp = null
const getModelModifiers = (props, modelName) => {
  return modelName === 'modelValue' || modelName === 'model-value'
    ? props.modelModifiers
    : props[`${modelName}Modifiers`] ||
        props[`${camelize(modelName)}Modifiers`] ||
        props[`${hyphenate(modelName)}Modifiers`]
}
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return
  const props = instance.vnode.props || EMPTY_OBJ
  if (!!(process.env.NODE_ENV !== 'production')) {
    const {
      emitsOptions,
      propsOptions: [propsOptions],
    } = instance
    if (emitsOptions) {
      if (!(event in emitsOptions) && true) {
        if (!propsOptions || !(toHandlerKey(camelize(event)) in propsOptions)) {
          warn$1(
            `Component emitted event "${event}" but it is neither declared in the emits option nor as an "${toHandlerKey(camelize(event))}" prop.`,
          )
        }
      } else {
        const validator = emitsOptions[event]
        if (isFunction(validator)) {
          const isValid = validator(...rawArgs)
          if (!isValid) {
            warn$1(
              `Invalid event arguments: event validation failed for event "${event}".`,
            )
          }
        }
      }
    }
  }
  let args = rawArgs
  const isModelListener2 = event.startsWith('update:')
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7))
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => (isString(a) ? a.trim() : a))
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber)
    }
  }
  if (!!(process.env.NODE_ENV !== 'production') || false) {
    devtoolsComponentEmit(instance, event, args)
  }
  if (!!(process.env.NODE_ENV !== 'production')) {
    const lowerCaseEvent = event.toLowerCase()
    if (lowerCaseEvent !== event && props[toHandlerKey(lowerCaseEvent)]) {
      warn$1(
        `Event "${lowerCaseEvent}" is emitted in component ${formatComponentName(
          instance,
          instance.type,
        )} but the handler is registered for "${event}". Note that HTML attributes are case-insensitive and you cannot use v-on to listen to camelCase events when using in-DOM templates. You should probably use "${hyphenate(
          event,
        )}" instead of "${event}".`,
      )
    }
  }
  let handlerName
  let handler =
    props[(handlerName = toHandlerKey(event))] || // also try camelCase event handler (#2249)
    props[(handlerName = toHandlerKey(camelize(event)))]
  if (!handler && isModelListener2) {
    handler = props[(handlerName = toHandlerKey(hyphenate(event)))]
  }
  if (handler) {
    callWithAsyncErrorHandling(handler, instance, 6, args)
  }
  const onceHandler = props[handlerName + `Once`]
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {}
    } else if (instance.emitted[handlerName]) {
      return
    }
    instance.emitted[handlerName] = true
    callWithAsyncErrorHandling(onceHandler, instance, 6, args)
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap()
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache
  const cached = cache.get(comp)
  if (cached !== void 0) {
    return cached
  }
  const raw = comp.emits
  let normalized = {}
  let hasExtends = false
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true)
      if (normalizedFromExtend) {
        hasExtends = true
        extend(normalized, normalizedFromExtend)
      }
    }
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits)
    }
    if (comp.extends) {
      extendEmits(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits)
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null)
    }
    return null
  }
  if (isArray(raw)) {
    raw.forEach((key) => (normalized[key] = null))
  } else {
    extend(normalized, raw)
  }
  if (isObject(comp)) {
    cache.set(comp, normalized)
  }
  return normalized
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false
  }
  key = key.slice(2).replace(/Once$/, '')
  return (
    hasOwn(options, key[0].toLowerCase() + key.slice(1)) ||
    hasOwn(options, hyphenate(key)) ||
    hasOwn(options, key)
  )
}
let accessedAttrs = false
function markAttrsAccessed() {
  accessedAttrs = true
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs,
  } = instance
  const prev = setCurrentRenderingInstance(instance)
  let result
  let fallthroughAttrs
  if (!!(process.env.NODE_ENV !== 'production')) {
    accessedAttrs = false
  }
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy
      const thisProxy =
        !!(process.env.NODE_ENV !== 'production') && setupState.__isScriptSetup
          ? new Proxy(proxyToUse, {
              get(target, key, receiver) {
                warn$1(
                  `Property '${String(
                    key,
                  )}' was accessed via 'this'. Avoid using 'this' in templates.`,
                )
                return Reflect.get(target, key, receiver)
              },
            })
          : proxyToUse
      result = normalizeVNode(
        render.call(
          thisProxy,
          proxyToUse,
          renderCache,
          !!(process.env.NODE_ENV !== 'production')
            ? shallowReadonly(props)
            : props,
          setupState,
          data,
          ctx,
        ),
      )
      fallthroughAttrs = attrs
    } else {
      const render2 = Component
      if (!!(process.env.NODE_ENV !== 'production') && attrs === props) {
        markAttrsAccessed()
      }
      result = normalizeVNode(
        render2.length > 1
          ? render2(
              !!(process.env.NODE_ENV !== 'production')
                ? shallowReadonly(props)
                : props,
              !!(process.env.NODE_ENV !== 'production')
                ? {
                    get attrs() {
                      markAttrsAccessed()
                      return shallowReadonly(attrs)
                    },
                    slots,
                    emit: emit2,
                  }
                : { attrs, slots, emit: emit2 },
            )
          : render2(
              !!(process.env.NODE_ENV !== 'production')
                ? shallowReadonly(props)
                : props,
              null,
            ),
      )
      fallthroughAttrs = Component.props
        ? attrs
        : getFunctionalFallthrough(attrs)
    }
  } catch (err) {
    blockStack.length = 0
    handleError(err, instance, 1)
    result = createVNode(Comment)
  }
  let root = result
  let setRoot = void 0
  if (
    !!(process.env.NODE_ENV !== 'production') &&
    result.patchFlag > 0 &&
    result.patchFlag & 2048
  ) {
    ;[root, setRoot] = getChildRoot(result)
  }
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs)
    const { shapeFlag } = root
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions,
          )
        }
        root = cloneVNode(root, fallthroughAttrs, false, true)
      } else if (
        !!(process.env.NODE_ENV !== 'production') &&
        !accessedAttrs &&
        root.type !== Comment
      ) {
        const allAttrs = Object.keys(attrs)
        const eventAttrs = []
        const extraAttrs = []
        for (let i = 0, l = allAttrs.length; i < l; i++) {
          const key = allAttrs[i]
          if (isOn(key)) {
            if (!isModelListener(key)) {
              eventAttrs.push(key[2].toLowerCase() + key.slice(3))
            }
          } else {
            extraAttrs.push(key)
          }
        }
        if (extraAttrs.length) {
          warn$1(
            `Extraneous non-props attributes (${extraAttrs.join(', ')}) were passed to component but could not be automatically inherited because component renders fragment or text or teleport root nodes.`,
          )
        }
        if (eventAttrs.length) {
          warn$1(
            `Extraneous non-emits event listeners (${eventAttrs.join(', ')}) were passed to component but could not be automatically inherited because component renders fragment or text root nodes. If the listener is intended to be a component custom event listener only, declare it using the "emits" option.`,
          )
        }
      }
    }
  }
  if (vnode.dirs) {
    if (!!(process.env.NODE_ENV !== 'production') && !isElementRoot(root)) {
      warn$1(
        `Runtime directive used on component with non-element root node. The directives will not function as intended.`,
      )
    }
    root = cloneVNode(root, null, false, true)
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs
  }
  if (vnode.transition) {
    if (!!(process.env.NODE_ENV !== 'production') && !isElementRoot(root)) {
      warn$1(
        `Component inside <Transition> renders non-element root node that cannot be animated.`,
      )
    }
    setTransitionHooks(root, vnode.transition)
  }
  if (!!(process.env.NODE_ENV !== 'production') && setRoot) {
    setRoot(root)
  } else {
    result = root
  }
  setCurrentRenderingInstance(prev)
  return result
}
const getChildRoot = (vnode) => {
  const rawChildren = vnode.children
  const dynamicChildren = vnode.dynamicChildren
  const childRoot = filterSingleRoot(rawChildren, false)
  if (!childRoot) {
    return [vnode, void 0]
  } else if (
    !!(process.env.NODE_ENV !== 'production') &&
    childRoot.patchFlag > 0 &&
    childRoot.patchFlag & 2048
  ) {
    return getChildRoot(childRoot)
  }
  const index = rawChildren.indexOf(childRoot)
  const dynamicIndex = dynamicChildren ? dynamicChildren.indexOf(childRoot) : -1
  const setRoot = (updatedRoot) => {
    rawChildren[index] = updatedRoot
    if (dynamicChildren) {
      if (dynamicIndex > -1) {
        dynamicChildren[dynamicIndex] = updatedRoot
      } else if (updatedRoot.patchFlag > 0) {
        vnode.dynamicChildren = [...dynamicChildren, updatedRoot]
      }
    }
  }
  return [normalizeVNode(childRoot), setRoot]
}
function filterSingleRoot(children, recurse = true) {
  let singleRoot
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (isVNode(child)) {
      if (child.type !== Comment || child.children === 'v-if') {
        if (singleRoot) {
          return
        } else {
          singleRoot = child
          if (
            !!(process.env.NODE_ENV !== 'production') &&
            recurse &&
            singleRoot.patchFlag > 0 &&
            singleRoot.patchFlag & 2048
          ) {
            return filterSingleRoot(singleRoot.children)
          }
        }
      }
    } else {
      return
    }
  }
  return singleRoot
}
const getFunctionalFallthrough = (attrs) => {
  let res
  for (const key in attrs) {
    if (key === 'class' || key === 'style' || isOn(key)) {
      ;(res || (res = {}))[key] = attrs[key]
    }
  }
  return res
}
const filterModelListeners = (attrs, props) => {
  const res = {}
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key]
    }
  }
  return res
}
const isElementRoot = (vnode) => {
  return vnode.shapeFlag & (6 | 1) || vnode.type === Comment
}
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode
  const emits = component.emitsOptions
  if (
    !!(process.env.NODE_ENV !== 'production') &&
    (prevChildren || nextChildren) &&
    isHmrUpdating
  ) {
    return true
  }
  if (nextVNode.dirs || nextVNode.transition) {
    return true
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps
      }
      return hasPropsChanged(prevProps, nextProps, emits)
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i]
        if (nextProps[key] !== prevProps[key] && !isEmitListener(emits, key)) {
          return true
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true
      }
    }
    if (prevProps === nextProps) {
      return false
    }
    if (!prevProps) {
      return !!nextProps
    }
    if (!nextProps) {
      return true
    }
    return hasPropsChanged(prevProps, nextProps, emits)
  }
  return false
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps)
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i]
    if (
      nextProps[key] !== prevProps[key] &&
      !isEmitListener(emitsOptions, key)
    ) {
      return true
    }
  }
  return false
}
function updateHOCHostEl({ vnode, parent }, el) {
  while (parent) {
    const root = parent.subTree
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.el = vnode.el
    }
    if (root === vnode) {
      ;(vnode = parent.vnode).el = el
      parent = parent.parent
    } else {
      break
    }
  }
}
const internalObjectProto = {}
const createInternalObject = () => Object.create(internalObjectProto)
const isInternalObject = (obj) =>
  Object.getPrototypeOf(obj) === internalObjectProto
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {}
  const attrs = createInternalObject()
  instance.propsDefaults = /* @__PURE__ */ Object.create(null)
  setFullProps(instance, rawProps, props, attrs)
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0
    }
  }
  if (!!(process.env.NODE_ENV !== 'production')) {
    validateProps(rawProps || {}, props, instance)
  }
  if (isStateful) {
    instance.props = isSSR ? props : shallowReactive(props)
  } else {
    if (!instance.type.props) {
      instance.props = attrs
    } else {
      instance.props = props
    }
  }
  instance.attrs = attrs
}
function isInHmrContext(instance) {
  while (instance) {
    if (instance.type.__hmrId) return true
    instance = instance.parent
  }
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag },
  } = instance
  const rawCurrentProps = toRaw(props)
  const [options] = instance.propsOptions
  let hasAttrsChanged = false
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    !(!!(process.env.NODE_ENV !== 'production') && isInHmrContext(instance)) &&
    (optimized || patchFlag > 0) &&
    !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i]
        if (isEmitListener(instance.emitsOptions, key)) {
          continue
        }
        const value = rawProps[key]
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value
              hasAttrsChanged = true
            }
          } else {
            const camelizedKey = camelize(key)
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false,
            )
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value
            hasAttrsChanged = true
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true
    }
    let kebabKey
    for (const key in rawCurrentProps) {
      if (
        !rawProps || // for camelCase
        (!hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
          // and converted to camelCase (#955)
          ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey)))
      ) {
        if (options) {
          if (
            rawPrevProps && // for camelCase
            (rawPrevProps[key] !== void 0 || // for kebab-case
              rawPrevProps[kebabKey] !== void 0)
          ) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true,
            )
          }
        } else {
          delete props[key]
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || (!hasOwn(rawProps, key) && true)) {
          delete attrs[key]
          hasAttrsChanged = true
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, 'set', '')
  }
  if (!!(process.env.NODE_ENV !== 'production')) {
    validateProps(rawProps || {}, props, instance)
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions
  let hasAttrsChanged = false
  let rawCastValues
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue
      }
      const value = rawProps[key]
      let camelKey
      if (options && hasOwn(options, (camelKey = camelize(key)))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value
        } else {
          ;(rawCastValues || (rawCastValues = {}))[camelKey] = value
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value
          hasAttrsChanged = true
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = toRaw(props)
    const castValues = rawCastValues || EMPTY_OBJ
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i]
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key),
      )
    }
  }
  return hasAttrsChanged
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key]
  if (opt != null) {
    const hasDefault = hasOwn(opt, 'default')
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default
      if (
        opt.type !== Function &&
        !opt.skipFactory &&
        isFunction(defaultValue)
      ) {
        const { propsDefaults } = instance
        if (key in propsDefaults) {
          value = propsDefaults[key]
        } else {
          const reset = setCurrentInstance(instance)
          value = propsDefaults[key] = defaultValue.call(null, props)
          reset()
        }
      } else {
        value = defaultValue
      }
      if (instance.ce) {
        instance.ce._setProp(key, value)
      }
    }
    if (
      opt[0]
      /* shouldCast */
    ) {
      if (isAbsent && !hasDefault) {
        value = false
      } else if (
        opt[1] &&
        /* shouldCastTrue */
        (value === '' || value === hyphenate(key))
      ) {
        value = true
      }
    }
  }
  return value
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap()
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache
  const cached = cache.get(comp)
  if (cached) {
    return cached
  }
  const raw = comp.props
  const normalized = {}
  const needCastKeys = []
  let hasExtends = false
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true
      const [props, keys] = normalizePropsOptions(raw2, appContext, true)
      extend(normalized, props)
      if (keys) needCastKeys.push(...keys)
    }
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps)
    }
    if (comp.extends) {
      extendProps(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps)
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR)
    }
    return EMPTY_ARR
  }
  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (!!(process.env.NODE_ENV !== 'production') && !isString(raw[i])) {
        warn$1(`props must be strings when using array syntax.`, raw[i])
      }
      const normalizedKey = camelize(raw[i])
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ
      }
    }
  } else if (raw) {
    if (!!(process.env.NODE_ENV !== 'production') && !isObject(raw)) {
      warn$1(`invalid props options`, raw)
    }
    for (const key in raw) {
      const normalizedKey = camelize(key)
      if (validatePropName(normalizedKey)) {
        const opt = raw[key]
        const prop = (normalized[normalizedKey] =
          isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt))
        const propType = prop.type
        let shouldCast = false
        let shouldCastTrue = true
        if (isArray(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index]
            const typeName = isFunction(type) && type.name
            if (typeName === 'Boolean') {
              shouldCast = true
              break
            } else if (typeName === 'String') {
              shouldCastTrue = false
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === 'Boolean'
        }
        prop[0] =
          /* shouldCast */
          shouldCast
        prop[1] =
          /* shouldCastTrue */
          shouldCastTrue
        if (shouldCast || hasOwn(prop, 'default')) {
          needCastKeys.push(normalizedKey)
        }
      }
    }
  }
  const res = [normalized, needCastKeys]
  if (isObject(comp)) {
    cache.set(comp, res)
  }
  return res
}
function validatePropName(key) {
  if (key[0] !== '$' && !isReservedProp(key)) {
    return true
  } else if (!!(process.env.NODE_ENV !== 'production')) {
    warn$1(`Invalid prop name: "${key}" is a reserved property.`)
  }
  return false
}
function getType(ctor) {
  if (ctor === null) {
    return 'null'
  }
  if (typeof ctor === 'function') {
    return ctor.name || ''
  } else if (typeof ctor === 'object') {
    const name = ctor.constructor && ctor.constructor.name
    return name || ''
  }
  return ''
}
function validateProps(rawProps, props, instance) {
  const resolvedValues = toRaw(props)
  const options = instance.propsOptions[0]
  const camelizePropsKey = Object.keys(rawProps).map((key) => camelize(key))
  for (const key in options) {
    let opt = options[key]
    if (opt == null) continue
    validateProp(
      key,
      resolvedValues[key],
      opt,
      !!(process.env.NODE_ENV !== 'production')
        ? shallowReadonly(resolvedValues)
        : resolvedValues,
      !camelizePropsKey.includes(key),
    )
  }
}
function validateProp(name, value, prop, props, isAbsent) {
  const { type, required, validator, skipCheck } = prop
  if (required && isAbsent) {
    warn$1('Missing required prop: "' + name + '"')
    return
  }
  if (value == null && !required) {
    return
  }
  if (type != null && type !== true && !skipCheck) {
    let isValid = false
    const types = isArray(type) ? type : [type]
    const expectedTypes = []
    for (let i = 0; i < types.length && !isValid; i++) {
      const { valid, expectedType } = assertType(value, types[i])
      expectedTypes.push(expectedType || '')
      isValid = valid
    }
    if (!isValid) {
      warn$1(getInvalidTypeMessage(name, value, expectedTypes))
      return
    }
  }
  if (validator && !validator(value, props)) {
    warn$1(
      'Invalid prop: custom validator check failed for prop "' + name + '".',
    )
  }
}
const isSimpleType = /* @__PURE__ */ makeMap(
  'String,Number,Boolean,Function,Symbol,BigInt',
)
function assertType(value, type) {
  let valid
  const expectedType = getType(type)
  if (expectedType === 'null') {
    valid = value === null
  } else if (isSimpleType(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isObject(value)
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType,
  }
}
function getInvalidTypeMessage(name, value, expectedTypes) {
  if (expectedTypes.length === 0) {
    return `Prop type [] for prop "${name}" won't match anything. Did you mean to use type Array instead?`
  }
  let message = `Invalid prop: type check failed for prop "${name}". Expected ${expectedTypes.map(capitalize).join(' | ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}
function styleValue(value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}
function isExplicable(type) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some((elem) => type.toLowerCase() === elem)
}
function isBoolean(...args) {
  return args.some((elem) => elem.toLowerCase() === 'boolean')
}
const isInternalKey = (key) =>
  key === '_' || key === '_ctx' || key === '$stable'
const normalizeSlotValue = (value) =>
  isArray(value) ? value.map(normalizeVNode) : [normalizeVNode(value)]
const normalizeSlot = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot
  }
  const normalized = withCtx((...args) => {
    if (
      !!(process.env.NODE_ENV !== 'production') &&
      currentInstance &&
      !(ctx === null && currentRenderingInstance) &&
      !(ctx && ctx.root !== currentInstance.root)
    ) {
      warn$1(
        `Slot "${key}" invoked outside of the render function: this will not track dependencies used in the slot. Invoke the slot function inside the render function instead.`,
      )
    }
    return normalizeSlotValue(rawSlot(...args))
  }, ctx)
  normalized._c = false
  return normalized
}
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue
    const value = rawSlots[key]
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx)
    } else if (value != null) {
      if (!!(process.env.NODE_ENV !== 'production') && true) {
        warn$1(
          `Non-function value encountered for slot "${key}". Prefer function slots for better performance.`,
        )
      }
      const normalized = normalizeSlotValue(value)
      slots[key] = () => normalized
    }
  }
}
const normalizeVNodeSlots = (instance, children) => {
  if (
    !!(process.env.NODE_ENV !== 'production') &&
    !isKeepAlive(instance.vnode) &&
    true
  ) {
    warn$1(
      `Non-function value encountered for default slot. Prefer function slots for better performance.`,
    )
  }
  const normalized = normalizeSlotValue(children)
  instance.slots.default = () => normalized
}
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key]
    }
  }
}
const initSlots = (instance, children, optimized) => {
  const slots = (instance.slots = createInternalObject())
  if (instance.vnode.shapeFlag & 32) {
    const type = children._
    if (type) {
      assignSlots(slots, children, optimized)
      if (optimized) {
        def(slots, '_', type, true)
      }
    } else {
      normalizeObjectSlots(children, slots)
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children)
  }
}
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance
  let needDeletionCheck = true
  let deletionComparisonTarget = EMPTY_OBJ
  if (vnode.shapeFlag & 32) {
    const type = children._
    if (type) {
      if (!!(process.env.NODE_ENV !== 'production') && isHmrUpdating) {
        assignSlots(slots, children, optimized)
        trigger(instance, 'set', '$slots')
      } else if (optimized && type === 1) {
        needDeletionCheck = false
      } else {
        assignSlots(slots, children, optimized)
      }
    } else {
      needDeletionCheck = !children.$stable
      normalizeObjectSlots(children, slots)
    }
    deletionComparisonTarget = children
  } else if (children) {
    normalizeVNodeSlots(instance, children)
    deletionComparisonTarget = { default: 1 }
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key]
      }
    }
  }
}
let supported
let perf
function startMeasure(instance, type) {
  if (instance.appContext.config.performance && isSupported()) {
    perf.mark(`vue-${type}-${instance.uid}`)
  }
  if (!!(process.env.NODE_ENV !== 'production') || false) {
    devtoolsPerfStart(instance, type, isSupported() ? perf.now() : Date.now())
  }
}
function endMeasure(instance, type) {
  if (instance.appContext.config.performance && isSupported()) {
    const startTag = `vue-${type}-${instance.uid}`
    const endTag = startTag + `:end`
    const measureName = `<${formatComponentName(instance, instance.type)}> ${type}`
    perf.mark(endTag)
    perf.measure(measureName, startTag, endTag)
    perf.clearMeasures(measureName)
    perf.clearMarks(startTag)
    perf.clearMarks(endTag)
  }
  if (!!(process.env.NODE_ENV !== 'production') || false) {
    devtoolsPerfEnd(instance, type, isSupported() ? perf.now() : Date.now())
  }
}
function isSupported() {
  if (supported !== void 0) {
    return supported
  }
  if (typeof window !== 'undefined' && window.performance) {
    supported = true
    perf = window.performance
  } else {
    supported = false
  }
  return supported
}
function initFeatureFlags() {
  const needWarn = []
  if (!!(process.env.NODE_ENV !== 'production') && needWarn.length) {
    const multi = needWarn.length > 1
    console.warn(
      `Feature flag${multi ? `s` : ``} ${needWarn.join(', ')} ${multi ? `are` : `is`} not explicitly defined. You are running the esm-bundler build of Vue, which expects these compile-time feature flags to be globally injected via the bundler config in order to get better tree-shaking in the production bundle.

For more details, see https://link.vuejs.org/feature-flags.`,
    )
  }
}
const queuePostRenderEffect = queueEffectWithSuspense
function createRenderer(options) {
  return baseCreateRenderer(options)
}
function baseCreateRenderer(options, createHydrationFns) {
  {
    initFeatureFlags()
  }
  const target = getGlobalThis()
  target.__VUE__ = true
  if (!!(process.env.NODE_ENV !== 'production') || false) {
    setDevtoolsHook$1(target.__VUE_DEVTOOLS_GLOBAL_HOOK__, target)
  }
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent,
  } = options
  const patch = (
    n1,
    n2,
    container,
    anchor = null,
    parentComponent = null,
    parentSuspense = null,
    namespace = void 0,
    slotScopeIds = null,
    optimized = !!(process.env.NODE_ENV !== 'production') && isHmrUpdating
      ? false
      : !!n2.dynamicChildren,
  ) => {
    if (n1 === n2) {
      return
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1)
      unmount(n1, parentComponent, parentSuspense, true)
      n1 = null
    }
    if (n2.patchFlag === -2) {
      optimized = false
      n2.dynamicChildren = null
    }
    const { type, ref: ref3, shapeFlag } = n2
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor)
        break
      case Comment:
        processCommentNode(n1, n2, container, anchor)
        break
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace)
        } else if (!!(process.env.NODE_ENV !== 'production')) {
          patchStaticNode(n1, n2, container, namespace)
        }
        break
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        break
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals,
          )
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals,
          )
        } else if (!!(process.env.NODE_ENV !== 'production')) {
          warn$1('Invalid VNode type:', type, `(${typeof type})`)
        }
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2)
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true)
    }
  }
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert((n2.el = hostCreateText(n2.children)), container, anchor)
    } else {
      const el = (n2.el = n1.el)
      if (n2.children !== n1.children) {
        if (
          !!(process.env.NODE_ENV !== 'production') &&
          isHmrUpdating &&
          n2.patchFlag === -1 &&
          '__elIndex' in n1
        ) {
          const childNodes = container.childNodes
          const newChild = hostCreateText(n2.children)
          const oldChild = childNodes[(n2.__elIndex = n1.__elIndex)]
          hostInsert(newChild, container, oldChild)
          hostRemove(oldChild)
        } else {
          hostSetText(el, n2.children)
        }
      }
    }
  }
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        (n2.el = hostCreateComment(n2.children || '')),
        container,
        anchor,
      )
    } else {
      n2.el = n1.el
    }
  }
  const mountStaticNode = (n2, container, anchor, namespace) => {
    ;[n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor,
    )
  }
  const patchStaticNode = (n1, n2, container, namespace) => {
    if (n2.children !== n1.children) {
      const anchor = hostNextSibling(n1.anchor)
      removeStaticNode(n1)
      ;[n2.el, n2.anchor] = hostInsertStaticContent(
        n2.children,
        container,
        anchor,
        namespace,
      )
    } else {
      n2.el = n1.el
      n2.anchor = n1.anchor
    }
  }
  const moveStaticNode = ({ el, anchor }, container, nextSibling2) => {
    let next
    while (el && el !== anchor) {
      next = hostNextSibling(el)
      hostInsert(el, container, nextSibling2)
      el = next
    }
    hostInsert(anchor, container, nextSibling2)
  }
  const removeStaticNode = ({ el, anchor }) => {
    let next
    while (el && el !== anchor) {
      next = hostNextSibling(el)
      hostRemove(el)
      el = next
    }
    hostRemove(anchor)
  }
  const processElement = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    if (n2.type === 'svg') {
      namespace = 'svg'
    } else if (n2.type === 'math') {
      namespace = 'mathml'
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    } else {
      const customElement = !!(n1.el && n1.el._isVueCE) ? n1.el : null
      try {
        if (customElement) {
          customElement._beginPatch()
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      } finally {
        if (customElement) {
          customElement._endPatch()
        }
      }
    }
  }
  const mountElement = (
    vnode,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    let el
    let vnodeHook
    const { props, shapeFlag, transition, dirs } = vnode
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props,
    )
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children)
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized,
      )
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, 'created')
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent)
    if (props) {
      for (const key in props) {
        if (key !== 'value' && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent)
        }
      }
      if ('value' in props) {
        hostPatchProp(el, 'value', null, props.value, namespace)
      }
      if ((vnodeHook = props.onVnodeBeforeMount)) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode)
      }
    }
    if (!!(process.env.NODE_ENV !== 'production') || false) {
      def(el, '__vnode', vnode, true)
      def(el, '__vueParentComponent', parentComponent, true)
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount')
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition)
    if (needCallTransitionHooks) {
      transition.beforeEnter(el)
    }
    hostInsert(el, container, anchor)
    if (
      (vnodeHook = props && props.onVnodeMounted) ||
      needCallTransitionHooks ||
      dirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        needCallTransitionHooks && transition.enter(el)
        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted')
      }, parentSuspense)
    }
  }
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId)
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i])
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree
      if (
        !!(process.env.NODE_ENV !== 'production') &&
        subTree.patchFlag > 0 &&
        subTree.patchFlag & 2048
      ) {
        subTree = filterSingleRoot(subTree.children) || subTree
      }
      if (
        vnode === subTree ||
        (isSuspense(subTree.type) &&
          (subTree.ssContent === vnode || subTree.ssFallback === vnode))
      ) {
        const parentVNode = parentComponent.vnode
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent,
        )
      }
    }
  }
  const mountChildren = (
    children,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
    start = 0,
  ) => {
    for (let i = start; i < children.length; i++) {
      const child = (children[i] = optimized
        ? cloneIfMounted(children[i])
        : normalizeVNode(children[i]))
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    }
  }
  const patchElement = (
    n1,
    n2,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    const el = (n2.el = n1.el)
    if (!!(process.env.NODE_ENV !== 'production') || false) {
      el.__vnode = n2
    }
    let { patchFlag, dynamicChildren, dirs } = n2
    patchFlag |= n1.patchFlag & 16
    const oldProps = n1.props || EMPTY_OBJ
    const newProps = n2.props || EMPTY_OBJ
    let vnodeHook
    parentComponent && toggleRecurse(parentComponent, false)
    if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate')
    }
    parentComponent && toggleRecurse(parentComponent, true)
    if (!!(process.env.NODE_ENV !== 'production') && isHmrUpdating) {
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }
    if (
      (oldProps.innerHTML && newProps.innerHTML == null) ||
      (oldProps.textContent && newProps.textContent == null)
    ) {
      hostSetElementText(el, '')
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
      )
      if (!!(process.env.NODE_ENV !== 'production')) {
        traverseStaticChildren(n1, n2)
      }
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false,
      )
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace)
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, 'class', null, newProps.class, namespace)
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, 'style', oldProps.style, newProps.style, namespace)
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i]
            const prev = oldProps[key]
            const next = newProps[key]
            if (next !== prev || key === 'value') {
              hostPatchProp(el, key, prev, next, namespace, parentComponent)
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children)
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace)
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
        dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated')
      }, parentSuspense)
    }
  }
  const patchBlockChildren = (
    oldChildren,
    newChildren,
    fallbackContainer,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
  ) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i]
      const newVNode = newChildren[i]
      const container =
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
          // which also requires the correct parent container
          !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
          oldVNode.shapeFlag & (6 | 64 | 128))
          ? hostParentNode(oldVNode.el)
          : // In other cases, the parent container is not actually used so we
            // just pass the block element here to avoid a DOM parentNode call.
            fallbackContainer
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true,
      )
    }
  }
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent,
            )
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue
        const next = newProps[key]
        const prev = oldProps[key]
        if (next !== prev && key !== 'value') {
          hostPatchProp(el, key, prev, next, namespace, parentComponent)
        }
      }
      if ('value' in newProps) {
        hostPatchProp(el, 'value', oldProps.value, newProps.value, namespace)
      }
    }
  }
  const processFragment = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))
    const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''))
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2
    if (
      !!(process.env.NODE_ENV !== 'production') && // #5523 dev root fragment may inherit directives
      (isHmrUpdating || patchFlag & 2048)
    ) {
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds
        ? slotScopeIds.concat(fragmentSlotScopeIds)
        : fragmentSlotScopeIds
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor)
      hostInsert(fragmentEndAnchor, container, anchor)
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    } else {
      if (
        patchFlag > 0 &&
        patchFlag & 64 &&
        dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
        // of renderSlot() with no valid children
        n1.dynamicChildren &&
        n1.dynamicChildren.length === dynamicChildren.length
      ) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
        )
        if (!!(process.env.NODE_ENV !== 'production')) {
          traverseStaticChildren(n1, n2)
        } else if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null ||
          (parentComponent && n2 === parentComponent.subTree)
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true,
            /* shallow */
          )
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      }
    }
  }
  const processComponent = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    n2.slotScopeIds = slotScopeIds
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized,
        )
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized,
        )
      }
    } else {
      updateComponent(n1, n2, optimized)
    }
  }
  const mountComponent = (
    initialVNode,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    optimized,
  ) => {
    const instance = (initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense,
    ))
    if (!!(process.env.NODE_ENV !== 'production') && instance.type.__hmrId) {
      registerHMR(instance)
    }
    if (!!(process.env.NODE_ENV !== 'production')) {
      pushWarningContext(initialVNode)
      startMeasure(instance, `mount`)
    }
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals
    }
    {
      if (!!(process.env.NODE_ENV !== 'production')) {
        startMeasure(instance, `init`)
      }
      setupComponent(instance, false, optimized)
      if (!!(process.env.NODE_ENV !== 'production')) {
        endMeasure(instance, `init`)
      }
    }
    if (!!(process.env.NODE_ENV !== 'production') && isHmrUpdating)
      initialVNode.el = null
    if (instance.asyncDep) {
      parentSuspense &&
        parentSuspense.registerDep(instance, setupRenderEffect, optimized)
      if (!initialVNode.el) {
        const placeholder = (instance.subTree = createVNode(Comment))
        processCommentNode(null, placeholder, container, anchor)
        initialVNode.placeholder = placeholder.el
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized,
      )
    }
    if (!!(process.env.NODE_ENV !== 'production')) {
      popWarningContext()
      endMeasure(instance, `mount`)
    }
  }
  const updateComponent = (n1, n2, optimized) => {
    const instance = (n2.component = n1.component)
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        if (!!(process.env.NODE_ENV !== 'production')) {
          pushWarningContext(n2)
        }
        updateComponentPreRender(instance, n2, optimized)
        if (!!(process.env.NODE_ENV !== 'production')) {
          popWarningContext()
        }
        return
      } else {
        instance.next = n2
        instance.update()
      }
    } else {
      n2.el = n1.el
      instance.vnode = n2
    }
  }
  const setupRenderEffect = (
    instance,
    initialVNode,
    container,
    anchor,
    parentSuspense,
    namespace,
    optimized,
  ) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook
        const { el, props } = initialVNode
        const { bm, m, parent, root, type } = instance
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode)
        toggleRecurse(instance, false)
        if (bm) {
          invokeArrayFns(bm)
        }
        if (
          !isAsyncWrapperVNode &&
          (vnodeHook = props && props.onVnodeBeforeMount)
        ) {
          invokeVNodeHook(vnodeHook, parent, initialVNode)
        }
        toggleRecurse(instance, true)
        {
          if (
            root.ce && // @ts-expect-error _def is private
            root.ce._def.shadowRoot !== false
          ) {
            root.ce._injectChildStyle(type)
          }
          if (!!(process.env.NODE_ENV !== 'production')) {
            startMeasure(instance, `render`)
          }
          const subTree = (instance.subTree = renderComponentRoot(instance))
          if (!!(process.env.NODE_ENV !== 'production')) {
            endMeasure(instance, `render`)
          }
          if (!!(process.env.NODE_ENV !== 'production')) {
            startMeasure(instance, `patch`)
          }
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace,
          )
          if (!!(process.env.NODE_ENV !== 'production')) {
            endMeasure(instance, `patch`)
          }
          initialVNode.el = subTree.el
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense)
        }
        if (
          !isAsyncWrapperVNode &&
          (vnodeHook = props && props.onVnodeMounted)
        ) {
          const scopedInitialVNode = initialVNode
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense,
          )
        }
        if (
          initialVNode.shapeFlag & 256 ||
          (parent &&
            isAsyncWrapper(parent.vnode) &&
            parent.vnode.shapeFlag & 256)
        ) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense)
        }
        instance.isMounted = true
        if (!!(process.env.NODE_ENV !== 'production') || false) {
          devtoolsComponentAdded(instance)
        }
        initialVNode = container = anchor = null
      } else {
        let { next, bu, u, parent, vnode } = instance
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance)
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el
              updateComponentPreRender(instance, next, optimized)
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              if (!instance.isUnmounted) {
                componentUpdateFn()
              }
            })
            return
          }
        }
        let originNext = next
        let vnodeHook
        if (!!(process.env.NODE_ENV !== 'production')) {
          pushWarningContext(next || instance.vnode)
        }
        toggleRecurse(instance, false)
        if (next) {
          next.el = vnode.el
          updateComponentPreRender(instance, next, optimized)
        } else {
          next = vnode
        }
        if (bu) {
          invokeArrayFns(bu)
        }
        if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
          invokeVNodeHook(vnodeHook, parent, next, vnode)
        }
        toggleRecurse(instance, true)
        if (!!(process.env.NODE_ENV !== 'production')) {
          startMeasure(instance, `render`)
        }
        const nextTree = renderComponentRoot(instance)
        if (!!(process.env.NODE_ENV !== 'production')) {
          endMeasure(instance, `render`)
        }
        const prevTree = instance.subTree
        instance.subTree = nextTree
        if (!!(process.env.NODE_ENV !== 'production')) {
          startMeasure(instance, `patch`)
        }
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace,
        )
        if (!!(process.env.NODE_ENV !== 'production')) {
          endMeasure(instance, `patch`)
        }
        next.el = nextTree.el
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el)
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense)
        }
        if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense,
          )
        }
        if (!!(process.env.NODE_ENV !== 'production') || false) {
          devtoolsComponentUpdated(instance)
        }
        if (!!(process.env.NODE_ENV !== 'production')) {
          popWarningContext()
        }
      }
    }
    instance.scope.on()
    const effect2 = (instance.effect = new ReactiveEffect(componentUpdateFn))
    instance.scope.off()
    const update = (instance.update = effect2.run.bind(effect2))
    const job = (instance.job = effect2.runIfDirty.bind(effect2))
    job.i = instance
    job.id = instance.uid
    effect2.scheduler = () => queueJob(job)
    toggleRecurse(instance, true)
    if (!!(process.env.NODE_ENV !== 'production')) {
      effect2.onTrack = instance.rtc
        ? (e) => invokeArrayFns(instance.rtc, e)
        : void 0
      effect2.onTrigger = instance.rtg
        ? (e) => invokeArrayFns(instance.rtg, e)
        : void 0
    }
    update()
  }
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance
    const prevProps = instance.vnode.props
    instance.vnode = nextVNode
    instance.next = null
    updateProps(instance, nextVNode.props, prevProps, optimized)
    updateSlots(instance, nextVNode.children, optimized)
    pauseTracking()
    flushPreFlushCbs(instance)
    resetTracking()
  }
  const patchChildren = (
    n1,
    n2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized = false,
  ) => {
    const c1 = n1 && n1.children
    const prevShapeFlag = n1 ? n1.shapeFlag : 0
    const c2 = n2.children
    const { patchFlag, shapeFlag } = n2
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        return
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        return
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense)
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2)
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true)
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, '')
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        }
      }
    }
  }
  const patchUnkeyedChildren = (
    c1,
    c2,
    container,
    anchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    c1 = c1 || EMPTY_ARR
    c2 = c2 || EMPTY_ARR
    const oldLength = c1.length
    const newLength = c2.length
    const commonLength = Math.min(oldLength, newLength)
    let i
    for (i = 0; i < commonLength; i++) {
      const nextChild = (c2[i] = optimized
        ? cloneIfMounted(c2[i])
        : normalizeVNode(c2[i]))
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
      )
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength,
      )
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength,
      )
    }
  }
  const patchKeyedChildren = (
    c1,
    c2,
    container,
    parentAnchor,
    parentComponent,
    parentSuspense,
    namespace,
    slotScopeIds,
    optimized,
  ) => {
    let i = 0
    const l2 = c2.length
    let e1 = c1.length - 1
    let e2 = l2 - 1
    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = (c2[i] = optimized
        ? cloneIfMounted(c2[i])
        : normalizeVNode(c2[i]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      } else {
        break
      }
      i++
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1]
      const n2 = (c2[e2] = optimized
        ? cloneIfMounted(c2[e2])
        : normalizeVNode(c2[e2]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized,
        )
      } else {
        break
      }
      e1--
      e2--
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor
        while (i <= e2) {
          patch(
            null,
            (c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i])),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
          i++
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true)
        i++
      }
    } else {
      const s1 = i
      const s2 = i
      const keyToNewIndexMap = /* @__PURE__ */ new Map()
      for (i = s2; i <= e2; i++) {
        const nextChild = (c2[i] = optimized
          ? cloneIfMounted(c2[i])
          : normalizeVNode(c2[i]))
        if (nextChild.key != null) {
          if (
            !!(process.env.NODE_ENV !== 'production') &&
            keyToNewIndexMap.has(nextChild.key)
          ) {
            warn$1(
              `Duplicate keys found during update:`,
              JSON.stringify(nextChild.key),
              `Make sure keys are unique.`,
            )
          }
          keyToNewIndexMap.set(nextChild.key, i)
        }
      }
      let j
      let patched = 0
      const toBePatched = e2 - s2 + 1
      let moved = false
      let maxNewIndexSoFar = 0
      const newIndexToOldIndexMap = new Array(toBePatched)
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i]
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true)
          continue
        }
        let newIndex
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key)
        } else {
          for (j = s2; j <= e2; j++) {
            if (
              newIndexToOldIndexMap[j - s2] === 0 &&
              isSameVNodeType(prevChild, c2[j])
            ) {
              newIndex = j
              break
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true)
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex
          } else {
            moved = true
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
          patched++
        }
      }
      const increasingNewIndexSequence = moved
        ? getSequence(newIndexToOldIndexMap)
        : EMPTY_ARR
      j = increasingNewIndexSequence.length - 1
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i
        const nextChild = c2[nextIndex]
        const anchorVNode = c2[nextIndex + 1]
        const anchor =
          nextIndex + 1 < l2
            ? // #13559, #14173 fallback to el placeholder for unresolved async component
              anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
            : parentAnchor
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2)
          } else {
            j--
          }
        }
      }
    }
  }
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType)
      return
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType)
      return
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals)
      return
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor)
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType)
      }
      hostInsert(vnode.anchor, container, anchor)
      return
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor)
      return
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition
    if (needTransition2) {
      if (moveType === 0) {
        transition.beforeEnter(el)
        hostInsert(el, container, anchor)
        queuePostRenderEffect(() => transition.enter(el), parentSuspense)
      } else {
        const { leave, delayLeave, afterLeave } = transition
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el)
          } else {
            hostInsert(el, container, anchor)
          }
        }
        const performLeave = () => {
          if (el._isLeaving) {
            el[leaveCbKey](
              true,
              /* cancelled */
            )
          }
          leave(el, () => {
            remove22()
            afterLeave && afterLeave()
          })
        }
        if (delayLeave) {
          delayLeave(el, remove22, performLeave)
        } else {
          performLeave()
        }
      }
    } else {
      hostInsert(el, container, anchor)
    }
  }
  const unmount = (
    vnode,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false,
  ) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
    } = vnode
    if (patchFlag === -2) {
      optimized = false
    }
    if (ref3 != null) {
      pauseTracking()
      setRef(ref3, null, parentSuspense, vnode, true)
      resetTracking()
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode)
      return
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode)
    let vnodeHook
    if (
      shouldInvokeVnodeHook &&
      (vnodeHook = props && props.onVnodeBeforeUnmount)
    ) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode)
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove)
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove)
        return
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeUnmount')
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove,
        )
      } else if (
        dynamicChildren && // #5154
        // when v-once is used inside a block, setBlockTracking(-1) marks the
        // parent block with hasOnce: true
        // so that it doesn't take the fast path during unmount - otherwise
        // components nested in v-once are never unmounted.
        !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
        (type !== Fragment || (patchFlag > 0 && patchFlag & 64))
      ) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true,
        )
      } else if (
        (type === Fragment && patchFlag & (128 | 256)) ||
        (!optimized && shapeFlag & 16)
      ) {
        unmountChildren(children, parentComponent, parentSuspense)
      }
      if (doRemove) {
        remove2(vnode)
      }
    }
    if (
      (shouldInvokeVnodeHook &&
        (vnodeHook = props && props.onVnodeUnmounted)) ||
      shouldInvokeDirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        shouldInvokeDirs &&
          invokeDirectiveHook(vnode, null, parentComponent, 'unmounted')
      }, parentSuspense)
    }
  }
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode
    if (type === Fragment) {
      if (
        !!(process.env.NODE_ENV !== 'production') &&
        vnode.patchFlag > 0 &&
        vnode.patchFlag & 2048 &&
        transition &&
        !transition.persisted
      ) {
        vnode.children.forEach((child) => {
          if (child.type === Comment) {
            hostRemove(child.el)
          } else {
            remove2(child)
          }
        })
      } else {
        removeFragment(el, anchor)
      }
      return
    }
    if (type === Static) {
      removeStaticNode(vnode)
      return
    }
    const performRemove = () => {
      hostRemove(el)
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave()
      }
    }
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition
      const performLeave = () => leave(el, performRemove)
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave)
      } else {
        performLeave()
      }
    } else {
      performRemove()
    }
  }
  const removeFragment = (cur, end) => {
    let next
    while (cur !== end) {
      next = hostNextSibling(cur)
      hostRemove(cur)
      cur = next
    }
    hostRemove(end)
  }
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    if (!!(process.env.NODE_ENV !== 'production') && instance.type.__hmrId) {
      unregisterHMR(instance)
    }
    const { bum, scope, job, subTree, um, m, a } = instance
    invalidateMount(m)
    invalidateMount(a)
    if (bum) {
      invokeArrayFns(bum)
    }
    scope.stop()
    if (job) {
      job.flags |= 8
      unmount(subTree, instance, parentSuspense, doRemove)
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense)
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true
    }, parentSuspense)
    if (!!(process.env.NODE_ENV !== 'production') || false) {
      devtoolsComponentRemoved(instance)
    }
  }
  const unmountChildren = (
    children,
    parentComponent,
    parentSuspense,
    doRemove = false,
    optimized = false,
    start = 0,
  ) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized)
    }
  }
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree)
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next()
    }
    const el = hostNextSibling(vnode.anchor || vnode.el)
    const teleportEnd = el && el[TeleportEndKey]
    return teleportEnd ? hostNextSibling(teleportEnd) : el
  }
  let isFlushing = false
  const render = (vnode, container, namespace) => {
    let instance
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true)
        instance = container._vnode.component
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace,
      )
    }
    container._vnode = vnode
    if (!isFlushing) {
      isFlushing = true
      flushPreFlushCbs(instance)
      flushPostFlushCbs()
      isFlushing = false
    }
  }
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options,
  }
  let hydrate
  return {
    render,
    hydrate,
    createApp: createAppAPI(render),
  }
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return (currentNamespace === 'svg' && type === 'foreignObject') ||
    (currentNamespace === 'mathml' &&
      type === 'annotation-xml' &&
      props &&
      props.encoding &&
      props.encoding.includes('html'))
    ? void 0
    : currentNamespace
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32
    job.flags |= 4
  } else {
    effect2.flags &= -33
    job.flags &= -5
  }
}
function needTransition(parentSuspense, transition) {
  return (
    (!parentSuspense || (parentSuspense && !parentSuspense.pendingBranch)) &&
    transition &&
    !transition.persisted
  )
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children
  const ch2 = n2.children
  if (isArray(ch1) && isArray(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i]
      let c2 = ch2[i]
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i])
          c2.el = c1.el
        }
        if (!shallow && c2.patchFlag !== -2) traverseStaticChildren(c1, c2)
      }
      if (c2.type === Text) {
        if (c2.patchFlag !== -1) {
          c2.el = c1.el
        } else {
          c2.__elIndex =
            i + // take fragment start anchor into account
            (n1.type === Fragment ? 1 : 0)
        }
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el
      }
      if (!!(process.env.NODE_ENV !== 'production')) {
        c2.el && (c2.el.__vnode = c2)
      }
    }
  }
}
function getSequence(arr) {
  const p = arr.slice()
  const result = [0]
  let i, j, u, v, c
  const len = arr.length
  for (i = 0; i < len; i++) {
    const arrI = arr[i]
    if (arrI !== 0) {
      j = result[result.length - 1]
      if (arr[j] < arrI) {
        p[i] = j
        result.push(i)
        continue
      }
      u = 0
      v = result.length - 1
      while (u < v) {
        c = (u + v) >> 1
        if (arr[result[c]] < arrI) {
          u = c + 1
        } else {
          v = c
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1]
        }
        result[u] = i
      }
    }
  }
  u = result.length
  v = result[u - 1]
  while (u-- > 0) {
    result[u] = v
    v = p[v]
  }
  return result
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent
    } else {
      return locateNonHydratedAsyncRoot(subComponent)
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++) hooks[i].flags |= 8
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder
  }
  const instance = anchorVnode.component
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree)
  }
  return null
}
const isSuspense = (type) => type.__isSuspense
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray(fn)) {
      suspense.effects.push(...fn)
    } else {
      suspense.effects.push(fn)
    }
  } else {
    queuePostFlushCb(fn)
  }
}
const Fragment = /* @__PURE__ */ Symbol.for('v-fgt')
const Text = /* @__PURE__ */ Symbol.for('v-txt')
const Comment = /* @__PURE__ */ Symbol.for('v-cmt')
const Static = /* @__PURE__ */ Symbol.for('v-stc')
const blockStack = []
let currentBlock = null
function openBlock(disableTracking = false) {
  blockStack.push((currentBlock = disableTracking ? null : []))
}
function closeBlock() {
  blockStack.pop()
  currentBlock = blockStack[blockStack.length - 1] || null
}
let isBlockTreeEnabled = 1
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren =
    isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null
  closeBlock()
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode)
  }
  return vnode
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(type, props, children, patchFlag, dynamicProps, true),
  )
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false
}
function isSameVNodeType(n1, n2) {
  if (
    !!(process.env.NODE_ENV !== 'production') &&
    n2.shapeFlag & 6 &&
    n1.component
  ) {
    const dirtyInstances = hmrDirtyComponents.get(n2.type)
    if (dirtyInstances && dirtyInstances.has(n1.component)) {
      n1.shapeFlag &= -257
      n2.shapeFlag &= -513
      return false
    }
  }
  return n1.type === n2.type && n1.key === n2.key
}
const createVNodeWithArgsTransform = (...args) => {
  return _createVNode(...args)
}
const normalizeKey = ({ key }) => (key != null ? key : null)
const normalizeRef = ({ ref: ref3, ref_key, ref_for }) => {
  if (typeof ref3 === 'number') {
    ref3 = '' + ref3
  }
  return ref3 != null
    ? isString(ref3) || isRef(ref3) || isFunction(ref3)
      ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for }
      : ref3
    : null
}
function createBaseVNode(
  type,
  props = null,
  children = null,
  patchFlag = 0,
  dynamicProps = null,
  shapeFlag = type === Fragment ? 0 : 1,
  isBlockNode = false,
  needFullChildrenNormalization = false,
) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance,
  }
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children)
    if (shapeFlag & 128) {
      type.normalize(vnode)
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16
  }
  if (!!(process.env.NODE_ENV !== 'production') && vnode.key !== vnode.key) {
    warn$1(`VNode created with invalid key (NaN). VNode type:`, vnode.type)
  }
  if (
    isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
    !isBlockNode && // has current parent block
    currentBlock && // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    vnode.patchFlag !== 32
  ) {
    currentBlock.push(vnode)
  }
  return vnode
}
const createVNode = !!(process.env.NODE_ENV !== 'production')
  ? createVNodeWithArgsTransform
  : _createVNode
function _createVNode(
  type,
  props = null,
  children = null,
  patchFlag = 0,
  dynamicProps = null,
  isBlockNode = false,
) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (!!(process.env.NODE_ENV !== 'production') && !type) {
      warn$1(`Invalid vnode type when creating vnode: ${type}.`)
    }
    type = Comment
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true,
      /* mergeRef: true */
    )
    if (children) {
      normalizeChildren(cloned, children)
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned
      } else {
        currentBlock.push(cloned)
      }
    }
    cloned.patchFlag = -2
    return cloned
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts
  }
  if (props) {
    props = guardReactiveProps(props)
    let { class: klass, style } = props
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass)
    }
    if (isObject(style)) {
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style)
      }
      props.style = normalizeStyle(style)
    }
  }
  const shapeFlag = isString(type)
    ? 1
    : isSuspense(type)
      ? 128
      : isTeleport(type)
        ? 64
        : isObject(type)
          ? 4
          : isFunction(type)
            ? 2
            : 0
  if (
    !!(process.env.NODE_ENV !== 'production') &&
    shapeFlag & 4 &&
    isProxy(type)
  ) {
    type = toRaw(type)
    warn$1(
      `Vue received a Component that was made a reactive object. This can lead to unnecessary performance overhead and should be avoided by marking the component with \`markRaw\` or using \`shallowRef\` instead of \`ref\`.`,
      `
Component that was made reactive: `,
      type,
    )
  }
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true,
  )
}
function guardReactiveProps(props) {
  if (!props) return null
  return isProxy(props) || isInternalObject(props) ? extend({}, props) : props
}
function cloneVNode(
  vnode,
  extraProps,
  mergeRef = false,
  cloneTransition = false,
) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref:
      extraProps && extraProps.ref
        ? // #2078 in the case of <component :is="vnode" ref="extra"/>
          // if the vnode itself already has a ref, cloneVNode will need to merge
          // the refs so the single vnode can be set on multiple refs
          mergeRef && ref3
          ? isArray(ref3)
            ? ref3.concat(normalizeRef(extraProps))
            : [ref3, normalizeRef(extraProps)]
          : normalizeRef(extraProps)
        : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children:
      !!(process.env.NODE_ENV !== 'production') &&
      patchFlag === -1 &&
      isArray(children)
        ? children.map(deepCloneVNode)
        : children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag:
      extraProps && vnode.type !== Fragment
        ? patchFlag === -1
          ? 16
          : patchFlag | 16
        : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce,
  }
  if (transition && cloneTransition) {
    setTransitionHooks(cloned, transition.clone(cloned))
  }
  return cloned
}
function deepCloneVNode(vnode) {
  const cloned = cloneVNode(vnode)
  if (isArray(vnode.children)) {
    cloned.children = vnode.children.map(deepCloneVNode)
  }
  return cloned
}
function createTextVNode(text = ' ', flag = 0) {
  return createVNode(Text, null, text, flag)
}
function normalizeVNode(child) {
  if (child == null || typeof child === 'boolean') {
    return createVNode(Comment)
  } else if (isArray(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice(),
    )
  } else if (isVNode(child)) {
    return cloneIfMounted(child)
  } else {
    return createVNode(Text, null, String(child))
  }
}
function cloneIfMounted(child) {
  return (child.el === null && child.patchFlag !== -1) || child.memo
    ? child
    : cloneVNode(child)
}
function normalizeChildren(vnode, children) {
  let type = 0
  const { shapeFlag } = vnode
  if (children == null) {
    children = null
  } else if (isArray(children)) {
    type = 16
  } else if (typeof children === 'object') {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default
      if (slot) {
        slot._c && (slot._d = false)
        normalizeChildren(vnode, slot())
        slot._c && (slot._d = true)
      }
      return
    } else {
      type = 32
      const slotFlag = children._
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1
        } else {
          children._ = 2
          vnode.patchFlag |= 1024
        }
      }
    }
  } else if (isFunction(children)) {
    children = { default: children, _ctx: currentRenderingInstance }
    type = 32
  } else {
    children = String(children)
    if (shapeFlag & 64) {
      type = 16
      children = [createTextVNode(children)]
    } else {
      type = 8
    }
  }
  vnode.children = children
  vnode.shapeFlag |= type
}
function mergeProps(...args) {
  const ret = {}
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i]
    for (const key in toMerge) {
      if (key === 'class') {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class])
        }
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style])
      } else if (isOn(key)) {
        const existing = ret[key]
        const incoming = toMerge[key]
        if (
          incoming &&
          existing !== incoming &&
          !(isArray(existing) && existing.includes(incoming))
        ) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming
        }
      } else if (key !== '') {
        ret[key] = toMerge[key]
      }
    }
  }
  return ret
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [vnode, prevVNode])
}
const emptyAppContext = createAppContext()
let uid = 0
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type
  const appContext =
    (parent ? parent.appContext : vnode.appContext) || emptyAppContext
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true,
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ['', 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null,
  }
  if (!!(process.env.NODE_ENV !== 'production')) {
    instance.ctx = createDevRenderContext(instance)
  } else {
    instance.ctx = { _: instance }
  }
  instance.root = parent ? parent.root : instance
  instance.emit = emit.bind(null, instance)
  if (vnode.ce) {
    vnode.ce(instance)
  }
  return instance
}
let currentInstance = null
const getCurrentInstance = () => currentInstance || currentRenderingInstance
let internalSetCurrentInstance
let setInSSRSetupState
{
  const g = getGlobalThis()
  const registerGlobalSetter = (key, setter) => {
    let setters
    if (!(setters = g[key])) setters = g[key] = []
    setters.push(setter)
    return (v) => {
      if (setters.length > 1) setters.forEach((set) => set(v))
      else setters[0](v)
    }
  }
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => (currentInstance = v),
  )
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => (isInSSRComponentSetup = v),
  )
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance
  internalSetCurrentInstance(instance)
  instance.scope.on()
  return () => {
    instance.scope.off()
    internalSetCurrentInstance(prev)
  }
}
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off()
  internalSetCurrentInstance(null)
}
const isBuiltInTag = /* @__PURE__ */ makeMap('slot,component')
function validateComponentName(name, { isNativeTag }) {
  if (isBuiltInTag(name) || isNativeTag(name)) {
    warn$1(
      'Do not use built-in or reserved HTML elements as component id: ' + name,
    )
  }
}
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4
}
let isInSSRComponentSetup = false
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR)
  const { props, children } = instance.vnode
  const isStateful = isStatefulComponent(instance)
  initProps(instance, props, isStateful, isSSR)
  initSlots(instance, children, optimized || isSSR)
  const setupResult = isStateful
    ? setupStatefulComponent(instance, isSSR)
    : void 0
  isSSR && setInSSRSetupState(false)
  return setupResult
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type
  if (!!(process.env.NODE_ENV !== 'production')) {
    if (Component.name) {
      validateComponentName(Component.name, instance.appContext.config)
    }
    if (Component.components) {
      const names = Object.keys(Component.components)
      for (let i = 0; i < names.length; i++) {
        validateComponentName(names[i], instance.appContext.config)
      }
    }
    if (Component.directives) {
      const names = Object.keys(Component.directives)
      for (let i = 0; i < names.length; i++) {
        validateDirectiveName(names[i])
      }
    }
    if (Component.compilerOptions && isRuntimeOnly()) {
      warn$1(
        `"compilerOptions" is only supported when using a build of Vue that includes the runtime compiler. Since you are using a runtime-only build, the options should be passed via your build tool config instead.`,
      )
    }
  }
  instance.accessCache = /* @__PURE__ */ Object.create(null)
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers)
  if (!!(process.env.NODE_ENV !== 'production')) {
    exposePropsOnRenderContext(instance)
  }
  const { setup } = Component
  if (setup) {
    pauseTracking()
    const setupContext = (instance.setupContext =
      setup.length > 1 ? createSetupContext(instance) : null)
    const reset = setCurrentInstance(instance)
    const setupResult = callWithErrorHandling(setup, instance, 0, [
      !!(process.env.NODE_ENV !== 'production')
        ? shallowReadonly(instance.props)
        : instance.props,
      setupContext,
    ])
    const isAsyncSetup = isPromise(setupResult)
    resetTracking()
    reset()
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance)
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance)
      if (isSSR) {
        return setupResult
          .then((resolvedResult) => {
            handleSetupResult(instance, resolvedResult, isSSR)
          })
          .catch((e) => {
            handleError(e, instance, 0)
          })
      } else {
        instance.asyncDep = setupResult
        if (!!(process.env.NODE_ENV !== 'production') && !instance.suspense) {
          const name = formatComponentName(instance, Component)
          warn$1(
            `Component <${name}>: setup function returned a promise, but no <Suspense> boundary was found in the parent component tree. A component with async setup() must be nested in a <Suspense> in order to be rendered.`,
          )
        }
      }
    } else {
      handleSetupResult(instance, setupResult, isSSR)
    }
  } else {
    finishComponentSetup(instance, isSSR)
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult
    } else {
      instance.render = setupResult
    }
  } else if (isObject(setupResult)) {
    if (!!(process.env.NODE_ENV !== 'production') && isVNode(setupResult)) {
      warn$1(
        `setup() should not return VNodes directly - return a render function instead.`,
      )
    }
    if (!!(process.env.NODE_ENV !== 'production') || false) {
      instance.devtoolsRawSetupState = setupResult
    }
    instance.setupState = proxyRefs(setupResult)
    if (!!(process.env.NODE_ENV !== 'production')) {
      exposeSetupStateOnRenderContext(instance)
    }
  } else if (
    !!(process.env.NODE_ENV !== 'production') &&
    setupResult !== void 0
  ) {
    warn$1(
      `setup() should return an object. Received: ${setupResult === null ? 'null' : typeof setupResult}`,
    )
  }
  finishComponentSetup(instance, isSSR)
}
const isRuntimeOnly = () => true
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type
  if (!instance.render) {
    instance.render = Component.render || NOOP
  }
  {
    const reset = setCurrentInstance(instance)
    pauseTracking()
    try {
      applyOptions(instance)
    } finally {
      resetTracking()
      reset()
    }
  }
  if (
    !!(process.env.NODE_ENV !== 'production') &&
    !Component.render &&
    instance.render === NOOP &&
    !isSSR
  ) {
    if (Component.template) {
      warn$1(
        `Component provided template option but runtime compilation is not supported in this build of Vue. Configure your bundler to alias "vue" to "vue/dist/vue.esm-bundler.js".`,
      )
    } else {
      warn$1(`Component is missing template or render function: `, Component)
    }
  }
}
const attrsProxyHandlers = !!(process.env.NODE_ENV !== 'production')
  ? {
      get(target, key) {
        markAttrsAccessed()
        track(target, 'get', '')
        return target[key]
      },
      set() {
        warn$1(`setupContext.attrs is readonly.`)
        return false
      },
      deleteProperty() {
        warn$1(`setupContext.attrs is readonly.`)
        return false
      },
    }
  : {
      get(target, key) {
        track(target, 'get', '')
        return target[key]
      },
    }
function getSlotsProxy(instance) {
  return new Proxy(instance.slots, {
    get(target, key) {
      track(instance, 'get', '$slots')
      return target[key]
    },
  })
}
function createSetupContext(instance) {
  const expose = (exposed) => {
    if (!!(process.env.NODE_ENV !== 'production')) {
      if (instance.exposed) {
        warn$1(`expose() should be called only once per setup().`)
      }
      if (exposed != null) {
        let exposedType = typeof exposed
        if (exposedType === 'object') {
          if (isArray(exposed)) {
            exposedType = 'array'
          } else if (isRef(exposed)) {
            exposedType = 'ref'
          }
        }
        if (exposedType !== 'object') {
          warn$1(
            `expose() should be passed a plain object, received ${exposedType}.`,
          )
        }
      }
    }
    instance.exposed = exposed || {}
  }
  if (!!(process.env.NODE_ENV !== 'production')) {
    let attrsProxy
    let slotsProxy
    return Object.freeze({
      get attrs() {
        return (
          attrsProxy ||
          (attrsProxy = new Proxy(instance.attrs, attrsProxyHandlers))
        )
      },
      get slots() {
        return slotsProxy || (slotsProxy = getSlotsProxy(instance))
      },
      get emit() {
        return (event, ...args) => instance.emit(event, ...args)
      },
      expose,
    })
  } else {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose,
    }
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return (
      instance.exposeProxy ||
      (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
        get(target, key) {
          if (key in target) {
            return target[key]
          } else if (key in publicPropertiesMap) {
            return publicPropertiesMap[key](instance)
          }
        },
        has(target, key) {
          return key in target || key in publicPropertiesMap
        },
      }))
    )
  } else {
    return instance.proxy
  }
}
const classifyRE = /(?:^|[-_])\w/g
const classify = (str) =>
  str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, '')
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component)
    ? Component.displayName || Component.name
    : Component.name || (includeInferred && Component.__name)
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component)
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/)
    if (match) {
      name = match[1]
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key
        }
      }
    }
    name =
      inferFromRegistry(instance.components) ||
      (instance.parent && inferFromRegistry(instance.parent.type.components)) ||
      inferFromRegistry(instance.appContext.components)
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`
}
function isClassComponent(value) {
  return isFunction(value) && '__vccOpts' in value
}
const computed = (getterOrOptions, debugOptions) => {
  const c = computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup)
  if (!!(process.env.NODE_ENV !== 'production')) {
    const i = getCurrentInstance()
    if (i && i.appContext.config.warnRecursiveComputed) {
      c._warnRecursive = true
    }
  }
  return c
}
function h(type, propsOrChildren, children) {
  try {
    setBlockTracking(-1)
    const l = arguments.length
    if (l === 2) {
      if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren])
        }
        return createVNode(type, propsOrChildren)
      } else {
        return createVNode(type, null, propsOrChildren)
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2)
      } else if (l === 3 && isVNode(children)) {
        children = [children]
      }
      return createVNode(type, propsOrChildren, children)
    }
  } finally {
    setBlockTracking(1)
  }
}
function initCustomFormatter() {
  if (
    !!!(process.env.NODE_ENV !== 'production') ||
    typeof window === 'undefined'
  ) {
    return
  }
  const vueStyle = { style: 'color:#3ba776' }
  const numberStyle = { style: 'color:#1677ff' }
  const stringStyle = { style: 'color:#f5222d' }
  const keywordStyle = { style: 'color:#eb2f96' }
  const formatter = {
    __vue_custom_formatter: true,
    header(obj) {
      if (!isObject(obj)) {
        return null
      }
      if (obj.__isVue) {
        return ['div', vueStyle, `VueInstance`]
      } else if (isRef(obj)) {
        pauseTracking()
        const value = obj.value
        resetTracking()
        return [
          'div',
          {},
          ['span', vueStyle, genRefFlag(obj)],
          '<',
          formatValue(value),
          `>`,
        ]
      } else if (isReactive(obj)) {
        return [
          'div',
          {},
          ['span', vueStyle, isShallow(obj) ? 'ShallowReactive' : 'Reactive'],
          '<',
          formatValue(obj),
          `>${isReadonly(obj) ? ` (readonly)` : ``}`,
        ]
      } else if (isReadonly(obj)) {
        return [
          'div',
          {},
          ['span', vueStyle, isShallow(obj) ? 'ShallowReadonly' : 'Readonly'],
          '<',
          formatValue(obj),
          '>',
        ]
      }
      return null
    },
    hasBody(obj) {
      return obj && obj.__isVue
    },
    body(obj) {
      if (obj && obj.__isVue) {
        return ['div', {}, ...formatInstance(obj.$)]
      }
    },
  }
  function formatInstance(instance) {
    const blocks = []
    if (instance.type.props && instance.props) {
      blocks.push(createInstanceBlock('props', toRaw(instance.props)))
    }
    if (instance.setupState !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock('setup', instance.setupState))
    }
    if (instance.data !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock('data', toRaw(instance.data)))
    }
    const computed2 = extractKeys(instance, 'computed')
    if (computed2) {
      blocks.push(createInstanceBlock('computed', computed2))
    }
    const injected = extractKeys(instance, 'inject')
    if (injected) {
      blocks.push(createInstanceBlock('injected', injected))
    }
    blocks.push([
      'div',
      {},
      [
        'span',
        {
          style: keywordStyle.style + ';opacity:0.66',
        },
        '$ (internal): ',
      ],
      ['object', { object: instance }],
    ])
    return blocks
  }
  function createInstanceBlock(type, target) {
    target = extend({}, target)
    if (!Object.keys(target).length) {
      return ['span', {}]
    }
    return [
      'div',
      { style: 'line-height:1.25em;margin-bottom:0.6em' },
      [
        'div',
        {
          style: 'color:#476582',
        },
        type,
      ],
      [
        'div',
        {
          style: 'padding-left:1.25em',
        },
        ...Object.keys(target).map((key) => {
          return [
            'div',
            {},
            ['span', keywordStyle, key + ': '],
            formatValue(target[key], false),
          ]
        }),
      ],
    ]
  }
  function formatValue(v, asRaw = true) {
    if (typeof v === 'number') {
      return ['span', numberStyle, v]
    } else if (typeof v === 'string') {
      return ['span', stringStyle, JSON.stringify(v)]
    } else if (typeof v === 'boolean') {
      return ['span', keywordStyle, v]
    } else if (isObject(v)) {
      return ['object', { object: asRaw ? toRaw(v) : v }]
    } else {
      return ['span', stringStyle, String(v)]
    }
  }
  function extractKeys(instance, type) {
    const Comp = instance.type
    if (isFunction(Comp)) {
      return
    }
    const extracted = {}
    for (const key in instance.ctx) {
      if (isKeyOfType(Comp, key, type)) {
        extracted[key] = instance.ctx[key]
      }
    }
    return extracted
  }
  function isKeyOfType(Comp, key, type) {
    const opts = Comp[type]
    if (
      (isArray(opts) && opts.includes(key)) ||
      (isObject(opts) && key in opts)
    ) {
      return true
    }
    if (Comp.extends && isKeyOfType(Comp.extends, key, type)) {
      return true
    }
    if (Comp.mixins && Comp.mixins.some((m) => isKeyOfType(m, key, type))) {
      return true
    }
  }
  function genRefFlag(v) {
    if (isShallow(v)) {
      return `ShallowRef`
    }
    if (v.effect) {
      return `ComputedRef`
    }
    return `Ref`
  }
  if (window.devtoolsFormatters) {
    window.devtoolsFormatters.push(formatter)
  } else {
    window.devtoolsFormatters = [formatter]
  }
}
const version = '3.5.26'
const warn = !!(process.env.NODE_ENV !== 'production') ? warn$1 : NOOP
!!(process.env.NODE_ENV !== 'production') || true ? devtools$1 : void 0
!!(process.env.NODE_ENV !== 'production') || true ? setDevtoolsHook$1 : NOOP
/**
 * vue v3.5.26
 * (c) 2018-present Yuxi (Evan) You and Vue contributors
 * @license MIT
 **/
function initDev() {
  {
    initCustomFormatter()
  }
}
if (!!(process.env.NODE_ENV !== 'production')) {
  initDev()
}
function createElement(type) {
  const el = {
    type,
    parent: null,
    children: [],
    props: {},
    style: {},
  }
  el.setAttribute = (key, value) => {
    el.props[key] = value
  }
  el.removeAttribute = (key) => {
    delete el.props[key]
  }
  return el
}
function insert(child, parent, anchor) {
  child.parent = parent
  const list = parent.children
  if (!anchor) {
    list.push(child)
    return
  }
  const idx = list.indexOf(anchor)
  if (idx < 0) {
    list.push(child)
    return
  }
  list.splice(idx, 0, child)
}
function remove(child) {
  const parent = child.parent
  if (!parent) return
  const list = parent.children
  const idx = list.indexOf(child)
  if (idx >= 0) list.splice(idx, 1)
  child.parent = null
}
function parentNode(node) {
  return node.parent
}
function nextSibling(node) {
  const parent = node.parent
  if (!parent) return null
  const idx = parent.children.indexOf(node)
  if (idx < 0) return null
  return parent.children[idx + 1] ?? null
}
function setElementText(el, text) {
  el.textContent = text
  el.children = []
}
function createText(text) {
  return { type: 'text', parent: null, text }
}
function setText(node, text) {
  node.text = text
}
function createComment(text) {
  return { type: 'comment', parent: null, text }
}
function patchProp(el, key, _prevValue, nextValue) {
  if (key === 'style' && nextValue && typeof nextValue === 'object') {
    Object.assign(el.style, nextValue)
    return
  }
  if (key === 'class') {
    el.className = typeof nextValue === 'string' ? nextValue : ''
    return
  }
  el.props[key] = nextValue
}
const rendererOptions = {
  patchProp,
  insert,
  remove,
  createElement,
  createText,
  createComment,
  setText,
  setElementText,
  parentNode,
  nextSibling,
}
const renderer = createRenderer(rendererOptions)
function createHeadlessApp(...args) {
  return renderer.createApp(...args)
}
function createHeadlessRoot() {
  return { children: [] }
}
function contains(rect, x, y) {
  return (
    x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h
  )
}
function containsRect(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}
function area(rect) {
  return Math.max(0, rect.w) * Math.max(0, rect.h)
}
function isVisible(node) {
  return node.visible !== false
}
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
let nextId = 0
function createCliEventManager(options) {
  const nodes = /* @__PURE__ */ new Map()
  let focusedId = null
  let capturedId = null
  const record = options?.record
  const onFocusChange = options?.onFocusChange
  function candidatesAt(cellX, cellY) {
    const list = []
    for (const node of nodes.values()) {
      if (!isVisible(node)) continue
      if (contains(node.rect, cellX, cellY)) list.push(node)
    }
    return list.sort(
      (a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex,
    )
  }
  function pickTarget(list) {
    if (list.length === 0) return null
    let target = list[0]
    for (const n of list) {
      if (n.zIndex > target.zIndex) target = n
      else if (n.zIndex === target.zIndex && area(n.rect) < area(target.rect))
        target = n
    }
    return target
  }
  function pathOuterToInner(list, target) {
    if (!target) return []
    const filtered = list.filter((n) => n.id !== target.id)
    return [...filtered, target]
  }
  function ancestorsForTarget(target) {
    const list = []
    for (const node of nodes.values()) {
      if (!isVisible(node)) continue
      if (containsRect(node.rect, target.rect)) list.push(node)
    }
    const sorted = list.sort(
      (a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex,
    )
    return pathOuterToInner(sorted, target)
  }
  function makeBaseEvent(type, path) {
    return {
      type,
      target: null,
      currentTarget: null,
      eventPhase: 2,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      timeStamp: now(),
      __stopped: false,
      stopPropagation() {
        this.__stopped = true
      },
      preventDefault() {
        this.defaultPrevented = true
      },
      composedPath() {
        return [...path].reverse()
      },
    }
  }
  function dispatchToNode(handlerKey, node, event) {
    event.currentTarget = node
    if (!node) return
    const handler = node.handlers[handlerKey]
    handler?.(event)
  }
  function dispatchWithPhases(type, path, target, event) {
    event.target = target
    const captureKey = `${type}Capture`
    event.eventPhase = 1
    for (const node of path) {
      dispatchToNode(captureKey, node, event)
      if (event.__stopped) return
    }
    if (target) {
      event.eventPhase = 2
      dispatchToNode(type, target, event)
      if (event.__stopped) return
    }
    event.eventPhase = 3
    for (let i = path.length - 2; i >= 0; i--) {
      dispatchToNode(type, path[i], event)
      if (event.__stopped) return
    }
  }
  function setFocus(nextId2) {
    if (focusedId === nextId2) return
    const prev = focusedId ? (nodes.get(focusedId) ?? null) : null
    const nextRaw = nextId2 ? (nodes.get(nextId2) ?? null) : null
    const next = nextRaw && isVisible(nextRaw) ? nextRaw : null
    focusedId = next?.id ?? null
    onFocusChange?.(prev?.id ?? null, focusedId)
    if (prev) {
      const path = ancestorsForTarget(prev)
      const ev = makeBaseEvent('blur', path)
      dispatchWithPhases('blur', path, prev, ev)
    }
    if (next) {
      const path = ancestorsForTarget(next)
      const ev = makeBaseEvent('focus', path)
      dispatchWithPhases('focus', path, next, ev)
    }
  }
  function buildPointerEvent(type, path, record2) {
    const base = makeBaseEvent(type, path)
    return Object.assign(base, {
      clientX: record2.clientX ?? record2.cellX,
      clientY: record2.clientY ?? record2.cellY,
      cellX: record2.cellX,
      cellY: record2.cellY,
      button: record2.type === 'wheel' ? void 0 : record2.button,
      buttons: record2.type === 'wheel' ? void 0 : record2.buttons,
      ctrlKey: record2.ctrlKey,
      shiftKey: record2.shiftKey,
      altKey: record2.altKey,
      metaKey: record2.metaKey,
      deltaY: record2.type === 'wheel' ? record2.deltaY : void 0,
    })
  }
  function keyCombo(native) {
    const parts = []
    if (native.metaKey) parts.push('Meta')
    if (native.ctrlKey) parts.push('Ctrl')
    if (native.altKey) parts.push('Alt')
    if (native.shiftKey) parts.push('Shift')
    parts.push(native.key)
    return parts.join('+')
  }
  function buildKeyboardEvent(type, path, record2) {
    const base = makeBaseEvent(type, path)
    return Object.assign(base, {
      key: record2.key,
      code: record2.code ?? '',
      combo: keyCombo(record2),
      ctrlKey: record2.ctrlKey,
      shiftKey: record2.shiftKey,
      altKey: record2.altKey,
      metaKey: record2.metaKey,
      repeat: record2.repeat,
    })
  }
  function buildInputEvent(type, path, record2) {
    const base = makeBaseEvent(type, path)
    return Object.assign(base, {
      data: record2.data,
      inputType: record2.inputType,
      isComposing: record2.isComposing,
      text: record2.text,
    })
  }
  function dispatchPointerEvent(type, record2, targetOverride) {
    const list = candidatesAt(record2.cellX, record2.cellY)
    const target = targetOverride ?? pickTarget(list)
    const path = target ? pathOuterToInner(list, target) : []
    const ev = buildPointerEvent(type, path, record2)
    dispatchWithPhases(type, path, target, ev)
  }
  function dispatchToFocused(type, record2) {
    const target = focusedId ? (nodes.get(focusedId) ?? null) : null
    const path = target ? ancestorsForTarget(target) : []
    const ev = buildKeyboardEvent(type, path, record2)
    dispatchWithPhases(type, path, target, ev)
  }
  function dispatchToFocusedText(type, record2) {
    const target = focusedId ? (nodes.get(focusedId) ?? null) : null
    const path = target ? ancestorsForTarget(target) : []
    const ev = buildInputEvent(type, path, record2)
    dispatchWithPhases(type, path, target, ev)
  }
  return {
    register(node) {
      const id = node.id ?? `n${nextId++}`
      const focusable = node.focusable
      const full = {
        id,
        rect: node.rect,
        zIndex: node.zIndex ?? 0,
        visible: node.visible ?? true,
        focusable,
        selectable: node.selectable ?? !focusable,
        handlers: node.handlers ?? {},
      }
      nodes.set(id, full)
      return full
    },
    update(id, next) {
      const prev = nodes.get(id)
      if (!prev) return
      const nextVisible = next.visible ?? prev.visible
      if (nextVisible === false) {
        if (focusedId === id) setFocus(null)
        if (capturedId === id) capturedId = null
      }
      nodes.set(id, {
        ...prev,
        ...next,
        rect: next.rect ?? prev.rect,
        zIndex: next.zIndex ?? prev.zIndex,
        visible: nextVisible,
        handlers: next.handlers ?? prev.handlers,
      })
    },
    unregister(id) {
      nodes.delete(id)
      if (focusedId === id) setFocus(null)
      if (capturedId === id) capturedId = null
    },
    setMetrics(_next) {},
    focus(id) {
      setFocus(id)
    },
    getFocused() {
      return focusedId
    },
    dispatch(event) {
      record?.(event)
      if (event.type === 'keydown' || event.type === 'keyup') {
        dispatchToFocused(event.type, event)
        return
      }
      if (
        event.type === 'pointerdown' ||
        event.type === 'pointermove' ||
        event.type === 'pointerup' ||
        event.type === 'click' ||
        event.type === 'dblclick' ||
        event.type === 'contextmenu' ||
        event.type === 'wheel'
      ) {
        if (event.type === 'pointerdown') {
          const list = candidatesAt(event.cellX, event.cellY)
          const target = pickTarget(list)
          if (target?.focusable) setFocus(target.id)
          capturedId = target?.id ?? null
          dispatchPointerEvent('pointerdown', event, target)
          return
        }
        if (event.type === 'pointermove' && capturedId) {
          const target = nodes.get(capturedId) ?? null
          if (!target) return
          const path = ancestorsForTarget(target)
          const ev = buildPointerEvent('pointermove', path, event)
          dispatchWithPhases('pointermove', path, target, ev)
          return
        }
        if (event.type === 'pointerup' && capturedId) {
          const target = nodes.get(capturedId) ?? null
          const path = target ? ancestorsForTarget(target) : []
          const ev = buildPointerEvent('pointerup', path, event)
          dispatchWithPhases('pointerup', path, target, ev)
          capturedId = null
          return
        }
        if (event.type === 'pointerup') {
          dispatchPointerEvent('pointerup', event)
          capturedId = null
          return
        }
        dispatchPointerEvent(event.type, event)
        return
      }
      if (
        event.type === 'beforeinput' ||
        event.type === 'input' ||
        event.type === 'compositionstart' ||
        event.type === 'compositionupdate' ||
        event.type === 'compositionend' ||
        event.type === 'paste'
      ) {
        dispatchToFocusedText(event.type, event)
      }
    },
    debugNodes() {
      return Array.from(nodes.values()).map((n) => ({
        id: n.id,
        rect: n.rect,
        zIndex: n.zIndex,
        visible: isVisible(n),
        focusable: Boolean(n.focusable),
      }))
    },
    dispose() {
      nodes.clear()
      focusedId = null
      capturedId = null
    },
  }
}
function createTraceStore(opts) {
  const enabled = ref(Boolean(opts?.enabled))
  const records = shallowReactive([])
  const max = Math.max(10, Math.floor(opts?.max ?? 400))
  function push(record) {
    if (!enabled.value) return
    records.push(record)
    if (records.length > max) records.splice(0, records.length - max)
  }
  function clear() {
    records.splice(0, records.length)
  }
  function snapshot() {
    return records.slice()
  }
  return { enabled, records, push, clear, snapshot }
}
const TerminalContextKey = Symbol('TerminalContext')
const LayoutContextKey = Symbol('LayoutContext')
const VisibilityContextKey = Symbol('VisibilityContext')
const EventZIndexContextKey = Symbol('EventZIndex')
const ImeAnchorContextKey = Symbol('ImeAnchor')
const RenderStackKey = Symbol('RenderStack')
let nextStackId = 0
let nextNodeId = 0
function createRenderManager(terminal) {
  let orderCounter = 0
  const nodes = /* @__PURE__ */ new Map()
  const dirtyRows = /* @__PURE__ */ new Set()
  let fullDirty = true
  const initialSize = terminal.snapshot()
  let terminalRows = initialSize.rows
  let allRows = Array.from({ length: terminalRows }, (_, i) => i)
  let sortedIds = []
  let sortedDirty = true
  terminal.on('resize', ({ rows: rows2 }) => {
    terminalRows = rows2
    fullDirty = true
    allRows = Array.from({ length: terminalRows }, (_, i) => i)
  })
  const rootStack = Object.freeze({
    id: `s${nextStackId++}`,
    parent: null,
    zIndex: 0,
    order: 0,
  })
  function createStack(parent, zIndex) {
    return Object.freeze({
      id: `s${nextStackId++}`,
      parent,
      zIndex: Number.isFinite(zIndex) ? zIndex : 0,
      order: ++orderCounter,
    })
  }
  function markRect(rect) {
    if (!rect) {
      for (let y = 0; y < terminalRows; y++) dirtyRows.add(y)
      return
    }
    const y0 = Math.floor(rect.y)
    const y1 = y0 + Math.max(0, Math.floor(rect.h))
    for (let y = y0; y < y1; y++) dirtyRows.add(y)
  }
  function register(node) {
    const id = `r${nextNodeId++}`
    const full = Object.freeze({
      id,
      stack: node.stack,
      zIndex: node.zIndex ?? 0,
      order: ++orderCounter,
      rect: node.rect ?? null,
      paint: node.paint,
    })
    nodes.set(id, full)
    markRect(full.rect)
    sortedDirty = true
    return full
  }
  function update(id, next) {
    const prev = nodes.get(id)
    if (!prev) return
    if (
      (next.stack && next.stack !== prev.stack) ||
      (typeof next.zIndex === 'number' && next.zIndex !== prev.zIndex)
    )
      sortedDirty = true
    const nextRect = next.rect ?? prev.rect
    markRect(prev.rect)
    markRect(nextRect)
    const full = Object.freeze({
      ...prev,
      stack: next.stack ?? prev.stack,
      zIndex: next.zIndex ?? prev.zIndex,
      rect: nextRect,
      paint: next.paint ?? prev.paint,
    })
    nodes.set(id, full)
  }
  function unregister(id) {
    const prev = nodes.get(id)
    if (prev) {
      markRect(prev.rect)
    }
    nodes.delete(id)
    sortedDirty = true
  }
  function stackPath(stack2) {
    const out2 = []
    let cur = stack2
    while (cur) {
      out2.push({ zIndex: cur.zIndex, order: cur.order, id: cur.id })
      cur = cur.parent
    }
    out2.reverse()
    return out2
  }
  function nodePath(node) {
    return [
      ...stackPath(node.stack),
      { zIndex: node.zIndex, order: node.order, id: node.id },
    ]
  }
  function compareNodes(a, b) {
    if (a.id === b.id) return 0
    const ap = nodePath(a)
    const bp = nodePath(b)
    const len = Math.min(ap.length, bp.length)
    for (let i = 0; i < len; i++) {
      const as = ap[i]
      const bs = bp[i]
      if (as.id === bs.id) continue
      if (as.zIndex !== bs.zIndex) return as.zIndex - bs.zIndex
      return as.order - bs.order
    }
    return ap.length - bp.length
  }
  function intersectsRows(rect, rows2) {
    if (!rect) return true
    const y0 = Math.floor(rect.y)
    const y1 = y0 + Math.max(0, Math.floor(rect.h))
    if (y1 <= y0) return false
    let lo = 0
    let hi = rows2.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((rows2[mid] ?? 0) < y0) lo = mid + 1
      else hi = mid
    }
    const y = rows2[lo]
    return y != null && y < y1
  }
  function render() {
    if (!fullDirty && dirtyRows.size === 0) return
    if (sortedDirty) {
      sortedIds = Array.from(nodes.values())
        .sort(compareNodes)
        .map((n) => n.id)
      sortedDirty = false
    }
    const list = sortedIds.map((id) => nodes.get(id)).filter(Boolean)
    const isFullRepaint = fullDirty
    const rows2 = isFullRepaint
      ? allRows
      : Array.from(dirtyRows)
          .filter((y) => y >= 0 && y < terminalRows)
          .sort((a, b) => a - b)
    fullDirty = false
    dirtyRows.clear()
    if (rows2.length === 0) return
    terminal.batch(() => {
      for (const node of list) {
        if (!isFullRepaint && !intersectsRows(node.rect, rows2)) continue
        node.paint(isFullRepaint ? void 0 : rows2)
      }
    })
  }
  return {
    rootStack,
    createStack,
    register,
    update,
    unregister,
    render,
  }
}
let portalId = 0
function isPlainObject(v) {
  if (!v || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}
function shallowEqualValue(a, b) {
  if (a === b) return true
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (!(k in b)) return false
    if (a[k] !== b[k]) return false
  }
  return true
}
function shallowEqualRecord(a, b) {
  if (a === b) return true
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (!(k in b)) return false
    if (!shallowEqualValue(a[k], b[k])) return false
  }
  return true
}
function createTerminalApp(options) {
  const terminal = createTerminal({ cols: options.cols, rows: options.rows })
  const trace = createTraceStore({
    enabled: Boolean(globalThis.__VT_DEBUG_TRACE__),
  })
  const events = createCliEventManager({
    record: (event) => trace.push({ type: 'event', at: Date.now(), event }),
    onFocusChange: (prev, next) =>
      trace.push({ type: 'focus', at: Date.now(), prev, next }),
  })
  const render = createRenderManager(terminal)
  const offCommit = terminal.on('commit', ({ dirtyRows }) => {
    trace.push({
      type: 'commit',
      at: Date.now(),
      dirtyRows,
      focusedId: events.getFocused(),
    })
  })
  let scheduled = false
  let mounted = false
  let disposed = false
  function flush() {
    if (disposed) return
    scheduled = false
    render.render()
    terminal.commit()
  }
  function invalidate() {
    if (disposed) return
    if (scheduled) return
    scheduled = true
    if (typeof globalThis.setImmediate === 'function') {
      globalThis.setImmediate(flush)
    } else {
      setTimeout(flush, 0)
    }
  }
  const portals = shallowReactive([])
  const runtime = {
    mount(component, initialProps) {
      const id = `p${portalId++}`
      let currentProps = { ...initialProps }
      const portal = shallowReactive({ id, component, props: currentProps })
      portals.push(portal)
      let alive = true
      const handle = {
        update(nextProps) {
          if (!alive) return
          const next = { ...currentProps, ...nextProps }
          if (shallowEqualRecord(currentProps, next)) return
          currentProps = next
          portal.props = currentProps
          invalidate()
        },
        move(x, y) {
          if (!alive) return
          const next = { ...currentProps, x, y }
          if (shallowEqualRecord(currentProps, next)) return
          currentProps = next
          portal.props = currentProps
          invalidate()
        },
        unmount() {
          if (!alive) return
          alive = false
          const idx = portals.findIndex((p) => p.id === id)
          if (idx >= 0) portals.splice(idx, 1)
          invalidate()
        },
      }
      invalidate()
      return handle
    },
  }
  const rootLayout = shallowReactive({
    originX: 0,
    originY: 0,
    clipRect: { x: 0, y: 0, w: options.cols, h: options.rows },
  })
  const offResize = terminal.on('resize', ({ cols: cols2, rows: rows2 }) => {
    rootLayout.clipRect = { x: 0, y: 0, w: cols2, h: rows2 }
    invalidate()
  })
  const ctx = {
    terminal,
    renderer: shallowRef(null),
    events: shallowRef(events),
    scheduler: { invalidate, flush },
    runtime,
    observability: { trace },
    defaultStyle: ref(options.defaultStyle ?? {}),
    render,
  }
  const imeAnchor = shallowRef(null)
  const Root = /* @__PURE__ */ defineComponent({
    name: 'TerminalAppRoot',
    setup() {
      provide(TerminalContextKey, ctx)
      provide(LayoutContextKey, rootLayout)
      provide(VisibilityContextKey, ref(true))
      provide(EventZIndexContextKey, ref(0))
      provide(RenderStackKey, shallowRef(render.rootStack))
      provide(ImeAnchorContextKey, imeAnchor)
      return () => {
        const portalVNodes = portals.map((p) =>
          h(p.component, { key: p.id, ...p.props }),
        )
        return h('div', null, [
          h(options.component, options.props ?? {}),
          ...portalVNodes,
        ])
      }
    },
  })
  const app2 = createHeadlessApp(Root)
  const hostRoot = createHeadlessRoot()
  return {
    app: app2,
    terminal,
    events,
    scheduler: ctx.scheduler,
    getImeAnchor() {
      return imeAnchor.value
    },
    mount() {
      if (disposed || mounted) return
      mounted = true
      app2.mount(hostRoot)
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (mounted) app2.unmount()
      offResize?.()
      offCommit?.()
      events.dispose()
      terminal.dispose()
    },
  }
}
const ANSI_PALETTE_HEX = Object.freeze({
  black: '#000000',
  red: '#c91b00',
  green: '#00c200',
  yellow: '#c7c400',
  blue: '#0225c7',
  magenta: '#c930c7',
  cyan: '#00c5c7',
  white: '#c7c7c7',
  blackBright: '#686868',
  redBright: '#ff6e67',
  greenBright: '#5ffa68',
  yellowBright: '#fffc67',
  blueBright: '#6871ff',
  magentaBright: '#ff76ff',
  cyanBright: '#5ffdff',
  whiteBright: '#ffffff',
})
function ansiHexToRgb(hex) {
  const h2 = hex.startsWith('#') ? hex.slice(1) : hex
  if (h2.length !== 6) return void 0
  const r = Number.parseInt(h2.slice(0, 2), 16)
  const g = Number.parseInt(h2.slice(2, 4), 16)
  const b = Number.parseInt(h2.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
    return void 0
  return { r, g, b }
}
const ANSI_PALETTE_RGB = Object.freeze(
  Object.fromEntries(
    Object.entries(ANSI_PALETTE_HEX).map(([k, v]) => [k, ansiHexToRgb(v)]),
  ),
)
function ansiColorRgb(name) {
  if (!name) return void 0
  return ANSI_PALETTE_RGB[name]
}
let writeSync = null
try {
  const fs = globalThis.require?.('node:fs') ?? globalThis.require?.('fs')
  if (fs?.writeSync) {
    writeSync = (fd, data) => {
      const buffer2 = Buffer.from(data, 'utf8')
      fs.writeSync(fd, buffer2)
    }
  }
} catch {}
const SYNC_START = '\x1B[?2026h'
const SYNC_END = '\x1B[?2026l'
function createStdoutRenderer(terminal, options) {
  const proc = globalThis.process
  const output = options?.output ?? proc?.stdout
  if (!output)
    throw new Error('createStdoutRenderer requires a Node stdout-like output')
  const out2 = output
  const clear = options?.clear ?? true
  const hideCursor = options?.hideCursor ?? true
  const altScreen = options?.altScreen ?? Boolean(out2.isTTY)
  const defaultBg = options?.defaultBg ?? 'black'
  const trackResize = options?.trackResize ?? true
  const getImeAnchor = options?.getImeAnchor
  function resolveUseSyncOutput() {
    if (options?.useSyncOutput != null) return options.useSyncOutput
    const env = proc?.env ?? {}
    const envValue = env.DIMCODE_SYNC_OUTPUT
    if (envValue != null) {
      const v = String(envValue).trim().toLowerCase()
      return v === '1' || v === 'true' || v === 'yes'
    }
    return false
  }
  const useSyncOutput = resolveUseSyncOutput()
  let disposed = false
  let lastFrameTime = 0
  let pendingRender = false
  let renderTimer = null
  let accumulatedDirtyRows = null
  const MIN_FRAME_MS = out2.isTTY ? 16 : 0
  function parseColorMode(raw) {
    const v = String(raw ?? '')
      .trim()
      .toLowerCase()
    if (!v) return null
    if (v === 'truecolor' || v === '24bit' || v === 'rgb') return 'truecolor'
    if (
      v === 'ansi256' ||
      v === '256' ||
      v === 'xterm256' ||
      v === 'xterm-256color'
    )
      return 'ansi256'
    if (v === 'ansi16' || v === '16') return 'ansi16'
    return null
  }
  function resolveColorMode() {
    const opt = options?.colorMode ?? 'auto'
    if (opt !== 'auto') return opt
    const env = proc?.env ?? {}
    const forced = parseColorMode(
      env.DIMCODE_COLOR_MODE ?? env.VUE_TUI_COLOR_MODE,
    )
    if (forced) return forced
    if (!out2.isTTY) return 'truecolor'
    const colorterm = String(env.COLORTERM ?? '').toLowerCase()
    if (colorterm.includes('truecolor') || colorterm.includes('24bit'))
      return 'truecolor'
    const termProgram = String(env.TERM_PROGRAM ?? '').toLowerCase()
    if (termProgram.includes('vscode')) return 'truecolor'
    return 'truecolor'
  }
  const colorMode = resolveColorMode()
  function styleKey(style) {
    return [
      style.fg ?? '',
      style.bg ?? defaultBg,
      style.bold ? '1' : '0',
      style.dim ? '1' : '0',
      style.italic ? '1' : '0',
      style.underline ? '1' : '0',
      style.inverse ? '1' : '0',
    ].join('|')
  }
  function openColor(fg) {
    if (!fg) return ''
    if (colorMode === 'ansi16') return ansiStyles[fg]?.open ?? ''
    const rgb = options?.palette?.[fg]
      ? ansiHexToRgb(options.palette[fg])
      : ansiColorRgb(fg)
    if (!rgb) return ''
    if (colorMode === 'ansi256')
      return ansiStyles.color?.ansi256?.(rgbToAnsi256(rgb)) ?? ''
    return ansiStyles.color?.ansi16m?.(rgb.r, rgb.g, rgb.b) ?? ''
  }
  function openBg(bg) {
    if (!bg) return ''
    if (colorMode === 'ansi16') {
      const key = `bg${bg[0].toUpperCase()}${bg.slice(1)}`
      return ansiStyles[key]?.open ?? ''
    }
    const rgb = options?.palette?.[bg]
      ? ansiHexToRgb(options.palette[bg])
      : ansiColorRgb(bg)
    if (!rgb) return ''
    if (colorMode === 'ansi256')
      return ansiStyles.bgColor?.ansi256?.(rgbToAnsi256(rgb)) ?? ''
    return ansiStyles.bgColor?.ansi16m?.(rgb.r, rgb.g, rgb.b) ?? ''
  }
  function openStyle(style) {
    let result = ''
    result += openColor(style.fg)
    result += openBg(style.bg ?? defaultBg)
    if (style.bold) result += ansiStyles.bold.open
    if (style.dim) result += ansiStyles.dim.open
    if (style.italic) result += ansiStyles.italic.open
    if (style.underline) result += ansiStyles.underline.open
    if (style.inverse) result += ansiStyles.inverse.open
    return result
  }
  function rgbToAnsi256(rgb) {
    const r = clampByte(rgb.r)
    const g = clampByte(rgb.g)
    const b = clampByte(rgb.b)
    if (r === g && g === b) {
      if (r < 8) return 16
      if (r > 248) return 231
      return 232 + Math.round((r - 8) / 10)
    }
    const to6 = (v) => Math.round(v / 51)
    const rc = to6(r)
    const gc = to6(g)
    const bc = to6(b)
    const cubeIndex = 16 + 36 * rc + 6 * gc + bc
    const cubeR = rc * 51
    const cubeG = gc * 51
    const cubeB = bc * 51
    const cubeDist = (r - cubeR) ** 2 + (g - cubeG) ** 2 + (b - cubeB) ** 2
    const gray = Math.round((r + g + b) / 3)
    const grayIndex =
      gray < 8 ? 16 : gray > 248 ? 231 : 232 + Math.round((gray - 8) / 10)
    const grayLevel =
      grayIndex === 16
        ? 0
        : grayIndex === 231
          ? 255
          : 8 + 10 * (grayIndex - 232)
    const grayDist =
      (r - grayLevel) ** 2 + (g - grayLevel) ** 2 + (b - grayLevel) ** 2
    return grayDist < cubeDist ? grayIndex : cubeIndex
  }
  function clampByte(n) {
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(255, Math.round(n)))
  }
  let lastRenderedRows = 0
  function doRender(dirtyRows) {
    if (disposed) return
    pendingRender = false
    accumulatedDirtyRows = null
    lastFrameTime = Date.now()
    const snapshot = terminal.snapshot()
    const bgSeq = openBg(defaultBg)
    const rowsToRender = (() => {
      if (!dirtyRows || dirtyRows.length === 0) return null
      const outRows = dirtyRows
        .map((y) => Math.floor(y))
        .filter((y) => y >= 0 && y < snapshot.rows)
        .sort((a, b) => a - b)
      return outRows.length ? outRows : null
    })()
    let frame = (useSyncOutput ? SYNC_START : '') + '\x1B[?7l'
    let activeStyleKey = null
    const renderRow = (y) => {
      frame += `\x1B[${y + 1};1H`
      const row = terminal.getRow(y)
      let currentText = ''
      let currentKey = null
      let currentStyle = null
      for (const cell of row) {
        if (cell.continuation) continue
        const ch = cell.ch || ' '
        const key = styleKey(cell.style)
        if (currentKey == null) {
          currentKey = key
          currentStyle = cell.style
          currentText = ch
          continue
        }
        if (key === currentKey) {
          currentText += ch
          continue
        }
        if (activeStyleKey !== currentKey) {
          frame += ansiStyles.reset.open
          frame += openStyle(currentStyle)
          activeStyleKey = currentKey
        }
        frame += currentText
        currentKey = key
        currentStyle = cell.style
        currentText = ch
      }
      if (currentKey != null) {
        if (activeStyleKey !== currentKey) {
          frame += ansiStyles.reset.open
          frame += openStyle(currentStyle)
          activeStyleKey = currentKey
        }
        frame += currentText
      }
      const bgKey = styleKey({ bg: defaultBg })
      if (activeStyleKey !== bgKey) {
        frame += ansiStyles.reset.open
        frame += bgSeq
        activeStyleKey = bgKey
      }
      frame += '\x1B[K'
    }
    if (!rowsToRender) {
      for (let y = 0; y < snapshot.rows; y++) renderRow(y)
    } else {
      for (const y of rowsToRender) renderRow(y)
    }
    if (!rowsToRender && lastRenderedRows > snapshot.rows) {
      const extraRows = lastRenderedRows - snapshot.rows
      const bgKey = styleKey({ bg: defaultBg })
      if (activeStyleKey !== bgKey) {
        frame += ansiStyles.reset.open
        frame += bgSeq
        activeStyleKey = bgKey
      }
      for (let i = 0; i < extraRows; i++) {
        frame += `\x1B[${snapshot.rows + i + 1};1H\x1B[K`
      }
    }
    if (!rowsToRender) lastRenderedRows = snapshot.rows
    if (getImeAnchor) {
      const anchor = getImeAnchor()
      if (anchor) {
        frame += `\x1B[${Math.floor(anchor.cellY) + 1};${Math.floor(anchor.cellX) + 1}H`
      }
    }
    frame += ansiStyles.reset.open
    frame += '\x1B[?7h' + SYNC_END
    if (writeSync && out2.fd === 1) {
      try {
        writeSync(1, frame)
      } catch {
        out2.write(frame)
      }
    } else {
      out2.write(frame)
    }
  }
  function render(dirtyRows) {
    if (disposed) return
    if (dirtyRows && dirtyRows.length > 0) {
      if (!accumulatedDirtyRows) {
        accumulatedDirtyRows = new Set(dirtyRows)
      } else {
        for (const y of dirtyRows) accumulatedDirtyRows.add(y)
      }
    } else if (!accumulatedDirtyRows) {
      accumulatedDirtyRows = null
    }
    if (pendingRender) return
    const now2 = Date.now()
    const elapsed = now2 - lastFrameTime
    if (elapsed >= MIN_FRAME_MS) {
      const rows2 = accumulatedDirtyRows
        ? Array.from(accumulatedDirtyRows)
        : dirtyRows
      doRender(rows2)
    } else {
      pendingRender = true
      if (renderTimer) clearTimeout(renderTimer)
      renderTimer = setTimeout(() => {
        renderTimer = null
        if (!disposed) {
          const rows2 = accumulatedDirtyRows
            ? Array.from(accumulatedDirtyRows)
            : null
          doRender(rows2)
        }
      }, MIN_FRAME_MS - elapsed)
    }
  }
  if (altScreen && out2.isTTY) out2.write('\x1B[?1049h')
  if (hideCursor) out2.write('\x1B[?25l')
  if (clear)
    out2.write(
      `${ansiStyles.reset.open}${openBg(defaultBg)}\x1B[2J\x1B[H${ansiStyles.reset.open}`,
    )
  const off = terminal.on('commit', ({ dirtyRows }) => {
    render(dirtyRows)
  })
  const resizeSource = options?.output ?? proc?.stdout
  const canTrackResize = Boolean(
    trackResize && out2.isTTY && typeof resizeSource?.on === 'function',
  )
  const onResize = () => {
    const cols2 = Number(resizeSource?.columns)
    const rows2 = Number(resizeSource?.rows)
    if (!Number.isFinite(cols2) || !Number.isFinite(rows2)) return
    const snap = terminal.snapshot()
    if (cols2 === snap.cols && rows2 === snap.rows) return
    terminal.resize(cols2, rows2)
    render()
  }
  if (canTrackResize) {
    try {
      resizeSource.on('resize', onResize)
      onResize()
    } catch {}
  }
  render()
  function setCursor(x, y) {
    if (disposed) return
    out2.write(`\x1B[${Math.floor(y) + 1};${Math.floor(x) + 1}H`)
  }
  function showCursor(visible) {
    if (disposed) return
    out2.write(visible ? '\x1B[?25h' : '\x1B[?25l')
  }
  function dispose() {
    if (disposed) return
    disposed = true
    if (renderTimer) {
      clearTimeout(renderTimer)
      renderTimer = null
    }
    accumulatedDirtyRows = null
    off()
    if (canTrackResize && typeof resizeSource?.off === 'function') {
      try {
        resizeSource.off('resize', onResize)
      } catch {}
    } else if (
      canTrackResize &&
      typeof resizeSource?.removeListener === 'function'
    ) {
      try {
        resizeSource.removeListener('resize', onResize)
      } catch {}
    }
    if (hideCursor) out2.write('\x1B[?25h')
    if (altScreen && out2.isTTY) out2.write('\x1B[?1049l')
  }
  return { render, dispose, setCursor, showCursor }
}
function useLayout() {
  const ctx = inject(LayoutContextKey, null)
  if (!ctx) throw new Error('LayoutContext is missing (TerminalProvider/TView)')
  return ctx
}
function useRenderStack() {
  const stack2 = inject(RenderStackKey, null)
  if (!stack2) throw new Error('RenderStack is missing')
  return stack2
}
function useTerminal() {
  const ctx = inject(TerminalContextKey, null)
  if (!ctx) throw new Error('TerminalProvider is missing')
  return ctx
}
function useTerminalNode(getOptions) {
  const { events } = useTerminal()
  const id = ref(null)
  const options = computed(() => getOptions())
  const stop = watchEffect(() => {
    const manager = events.value
    if (!manager) return
    const opt = options.value
    if (!id.value) {
      const node = manager.register({
        rect: opt.rect,
        zIndex: opt.zIndex ?? 0,
        visible: opt.visible,
        focusable: opt.focusable,
        selectable: opt.selectable,
        handlers: opt.handlers ?? {},
      })
      id.value = node.id
      return
    }
    manager.update(id.value, {
      rect: opt.rect,
      zIndex: opt.zIndex ?? 0,
      visible: opt.visible,
      focusable: opt.focusable,
      selectable: opt.selectable,
      handlers: opt.handlers ?? {},
    })
  })
  onBeforeUnmount(() => {
    stop()
    const manager = events.value
    if (manager && id.value) manager.unregister(id.value)
  })
  return { id }
}
const VUE_TERMINAL_SHOW_CB = '__vueTerminalOnShow'
const PLACEHOLDER_STYLE = Object.freeze({
  position: 'absolute',
  left: '-9999px',
  top: '0',
  width: '0',
  height: '0',
  overflow: 'hidden',
})
function useVisibility(options) {
  const { scheduler } = useTerminal()
  const parentVisible = inject(VisibilityContextKey, ref(true))
  const localVisible = ref(true)
  const visible = computed(() => parentVisible.value && localVisible.value)
  if (options?.provide) provide(VisibilityContextKey, visible)
  const onShow = (value) => {
    localVisible.value = value
    scheduler.invalidate()
  }
  const rootProps = {
    style: PLACEHOLDER_STYLE,
    onVnodeBeforeMount: (vnode) => {
      const el = vnode.el
      if (el && typeof el === 'object') el[VUE_TERMINAL_SHOW_CB] = onShow
    },
    onVnodeBeforeUnmount: (vnode) => {
      const el = vnode.el
      if (el && typeof el === 'object' && el[VUE_TERMINAL_SHOW_CB] === onShow)
        delete el[VUE_TERMINAL_SHOW_CB]
    },
  }
  return { visible, rootProps }
}
function intersectRect(a, b) {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w)
  const y1 = Math.min(a.y + a.h, b.y + b.h)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
function translateRect(rect, dx, dy) {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }
}
function useRenderNode(getOptions) {
  const { scheduler, render } = useTerminal()
  const parentStack = useRenderStack()
  const id = ref(null)
  const options = computed(() => getOptions())
  const stop = watchEffect(() => {
    const opt = options.value
    void opt.deps
    const stack2 = opt.stack ?? parentStack.value
    if (!stack2) return
    if (!id.value) {
      const node = render.register({
        stack: stack2,
        zIndex: opt.zIndex,
        rect: opt.rect,
        paint: opt.paint,
      })
      id.value = node.id
      scheduler.invalidate()
      return
    }
    render.update(id.value, {
      stack: stack2,
      zIndex: opt.zIndex ?? 0,
      rect: opt.rect ?? null,
      paint: opt.paint,
    })
    scheduler.invalidate()
  })
  onBeforeUnmount(() => {
    stop()
    if (id.value) {
      render.unregister(id.value)
      scheduler.invalidate()
    }
  })
  return { id }
}
let graphemeSegmenter = null
try {
  graphemeSegmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(void 0, { granularity: 'grapheme' })
      : null
} catch {
  graphemeSegmenter = null
}
function forEachGrapheme(text, cb) {
  if (!text) return
  const seg = graphemeSegmenter
  if (!seg) {
    for (const ch of text) {
      const r = cb(ch)
      if (r === false) return
    }
    return
  }
  for (const part of seg.segment(text)) {
    const r = cb(part.segment)
    if (r === false) return
  }
}
function sanitizeInlineText(text) {
  return text.replace(/[\n\r\t]/g, ' ')
}
function sanitizeTextBlock(text) {
  text = text.replace(/\r/g, '').replace(/\t/g, ' ')
  let out2 = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if ((cp <= 31 && cp !== 10) || cp === 127) continue
    out2 += ch
  }
  return out2
}
function textCellWidth$1(text) {
  let cells = 0
  forEachGrapheme(text, (g) => {
    cells += charCellWidth(g)
  })
  return cells
}
function sliceByCells(text, maxCells) {
  maxCells = Math.max(0, Math.floor(maxCells))
  if (maxCells <= 0) return ''
  let out2 = ''
  let cells = 0
  forEachGrapheme(text, (g) => {
    const w = charCellWidth(g)
    if (cells + w > maxCells) return false
    out2 += g
    cells += w
    return void 0
  })
  return out2
}
function padEndByCells(text, width) {
  width = Math.max(0, Math.floor(width))
  const cells = textCellWidth$1(text)
  if (cells >= width) return text
  return `${text}${' '.repeat(width - cells)}`
}
function wrapByCells(text, width) {
  width = Math.max(1, Math.floor(width))
  const out2 = []
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    let cells = 0
    forEachGrapheme(rawLine, (g) => {
      const w = charCellWidth(g)
      if (cells > 0 && cells + w > width) {
        out2.push(line)
        line = ''
        cells = 0
      }
      line += g
      cells += w
      if (cells >= width) {
        out2.push(line)
        line = ''
        cells = 0
      }
    })
    if (line || rawLine.length === 0) out2.push(line)
  }
  return out2.length ? out2 : ['']
}
const BORDER = {
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  h: '─',
  v: '│',
}
const TBox = /* @__PURE__ */ defineComponent({
  name: 'TBox',
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    border: { type: Boolean, default: true },
    title: { type: String, default: '' },
    padding: { type: Number, default: 0 },
    scrollX: { type: Number, default: 0 },
    scrollY: { type: Number, default: 0 },
    style: { type: Object, default: void 0 },
    clear: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    const { terminal, defaultStyle, render } = useTerminal()
    const parent = useLayout()
    const parentStack = useRenderStack()
    const { visible, rootProps } = useVisibility({ provide: true })
    const absRect = computed(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h }
      const translated = translateRect(raw, parent.originX, parent.originY)
      if (!parent.clipRect) return translated
      return (
        intersectRect(translated, parent.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 }
      )
    })
    const stack2 = computed(() =>
      render.createStack(parentStack.value, props.zIndex),
    )
    const contentLayout = shallowReactive({
      originX: 0,
      originY: 0,
      clipRect: null,
    })
    function drawBorder(r, style, dirtyRows) {
      if (!props.border || r.w < 2 || r.h < 2) return
      const x0 = r.x
      const x1 = r.x + r.w - 1
      const y0 = r.y
      const y1 = r.y + r.h - 1
      const drawTop = () => {
        terminal.put(x0, y0, BORDER.tl, style)
        terminal.put(x1, y0, BORDER.tr, style)
        for (let x = x0 + 1; x < x1; x++) terminal.put(x, y0, BORDER.h, style)
        if (props.title) {
          const max = Math.max(0, r.w - 4)
          const safe = sanitizeInlineText(props.title)
          const title = sliceByCells(safe, max)
          terminal.write(` ${title} `, { x: x0 + 1, y: y0, style })
        }
      }
      const drawBottom = () => {
        terminal.put(x0, y1, BORDER.bl, style)
        terminal.put(x1, y1, BORDER.br, style)
        for (let x = x0 + 1; x < x1; x++) terminal.put(x, y1, BORDER.h, style)
      }
      const drawMiddleRow = (y) => {
        terminal.put(x0, y, BORDER.v, style)
        terminal.put(x1, y, BORDER.v, style)
      }
      if (!dirtyRows) {
        drawTop()
        drawBottom()
        for (let y = y0 + 1; y < y1; y++) drawMiddleRow(y)
        return
      }
      for (const y of dirtyRows) {
        if (y < y0 || y > y1) continue
        if (y === y0) drawTop()
        else if (y === y1) drawBottom()
        else drawMiddleRow(y)
      }
    }
    watchEffect(() => {
      const r = absRect.value
      const borderInset = props.border ? 1 : 0
      const requestedPad = Math.max(0, Math.floor(props.padding))
      const maxPadX = Math.max(0, Math.floor((r.w - borderInset * 2 - 1) / 2))
      const maxPadY = Math.max(0, Math.floor((r.h - borderInset * 2 - 1) / 2))
      const pad = Math.min(requestedPad, maxPadX, maxPadY)
      const content = {
        x: r.x + borderInset + pad,
        y: r.y + borderInset + pad,
        w: Math.max(0, r.w - borderInset * 2 - pad * 2),
        h: Math.max(0, r.h - borderInset * 2 - pad * 2),
      }
      let contentRect = intersectRect(content, r)
      if (parent.clipRect && contentRect)
        contentRect = intersectRect(contentRect, parent.clipRect)
      if (!contentRect) contentRect = { x: 0, y: 0, w: 0, h: 0 }
      contentLayout.originX = content.x - Math.floor(props.scrollX)
      contentLayout.originY = content.y - Math.floor(props.scrollY)
      contentLayout.clipRect = contentRect
    })
    useRenderNode(() => ({
      stack: stack2.value,
      zIndex: 0,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.border,
        props.title,
        props.padding,
        props.style,
        props.clear,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return
        const r = absRect.value
        const style = props.style ?? defaultStyle.value
        if (props.clear) {
          if (!dirtyRows) {
            terminal.fill(r.x, r.y, r.w, r.h, ' ', style)
          } else {
            const y0 = Math.floor(r.y)
            const y1 = y0 + Math.max(0, Math.floor(r.h))
            for (const y of dirtyRows) {
              if (y < y0 || y >= y1) continue
              terminal.fill(r.x, y, r.w, 1, ' ', style)
            }
          }
        }
        drawBorder(r, style, dirtyRows ?? null)
      },
    }))
    provide(LayoutContextKey, contentLayout)
    provide(RenderStackKey, stack2)
    return () => h('div', rootProps, slots.default?.())
  },
})
function fitText(text, max) {
  if (max <= 0) return ''
  text = sanitizeInlineText(text)
  return sliceByCells(text, max)
}
function splitLines(text) {
  return sanitizeTextBlock(text).split('\n')
}
function computeDefaultWidth(text) {
  const lines = splitLines(text)
  let max = 0
  for (const line of lines) max = Math.max(max, textCellWidth$1(line))
  return max
}
const TText = /* @__PURE__ */ defineComponent({
  name: 'TText',
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    value: { type: String, required: true },
    w: { type: Number, default: void 0 },
    h: { type: Number, default: void 0 },
    style: { type: Object, default: void 0 },
    clear: { type: Boolean, default: true },
    wrap: { type: Boolean, default: false },
  },
  setup(props) {
    const { terminal, defaultStyle } = useTerminal()
    const layout = useLayout()
    const { visible, rootProps } = useVisibility()
    const lines = computed(() => {
      const w = props.w ?? computeDefaultWidth(props.value)
      if (w <= 0) return ['']
      if (!props.wrap) return splitLines(props.value).map((l) => fitText(l, w))
      const safe = sanitizeTextBlock(props.value)
      return wrapByCells(safe, w).map((l) => fitText(l, w))
    })
    const absRect = computed(() => {
      const width = props.w ?? computeDefaultWidth(props.value)
      const height =
        props.h ??
        (props.wrap ? lines.value.length || 1 : lines.value.length || 1)
      const raw = { x: props.x, y: props.y, w: width, h: height }
      const translated = translateRect(raw, layout.originX, layout.originY)
      if (!layout.clipRect) return translated
      return (
        intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 }
      )
    })
    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.value,
        props.w,
        props.h,
        props.wrap,
        props.style,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return
        const r = absRect.value
        if (r.w <= 0 || r.h <= 0) return
        const style = props.style ?? defaultStyle.value
        const blank = props.clear ? ' '.repeat(r.w) : ''
        const out2 = lines.value
        const maxLines = Math.min(out2.length, Math.max(0, Math.floor(r.h)))
        const paintRow = (y) => {
          const i = y - r.y
          if (i < 0 || i >= r.h) return
          if (props.clear) terminal.write(blank, { x: r.x, y, style })
          if (i < 0 || i >= maxLines) return
          const clipped = sliceByCells(out2[i] ?? '', r.w)
          terminal.write(padEndByCells(clipped, r.w), { x: r.x, y, style })
        }
        if (!dirtyRows) {
          for (let i = 0; i < r.h; i++) paintRow(r.y + i)
          return
        }
        for (const y of dirtyRows) paintRow(y)
      },
    }))
    return () => h('span', rootProps)
  },
})
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}
function textCellWidth(text) {
  let cells = 0
  for (const ch of text) cells += charCellWidth(ch)
  return cells
}
const TSelect = /* @__PURE__ */ defineComponent({
  name: 'TSelect',
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    options: { type: Array, required: true },
    modelValue: { type: [Number, Array], default: 0 },
    multiple: { type: Boolean, default: false },
    multipleEmit: { type: String, default: 'value' },
    style: { type: Object, default: void 0 },
    highlightStyle: { type: Object, default: void 0 },
    autoFocus: { type: Boolean, default: false },
    closeOnBlur: { type: Boolean, default: false },
  },
  emits: [
    'update:modelValue',
    'change',
    'confirm',
    'close',
    'focus',
    'blur',
    'keydown',
  ],
  setup(props, { emit: emit2 }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal()
    const layout = useLayout()
    const { visible, rootProps } = useVisibility()
    const parentEventZ = inject(
      EventZIndexContextKey,
      computed(() => 0),
    )
    const eventZ = computed(
      () => (parentEventZ.value ?? 0) + (props.zIndex ?? 0),
    )
    const focused = ref(false)
    const initialActive = (() => {
      const max = Math.max(0, props.options.length - 1)
      if (!props.multiple) {
        const idx = typeof props.modelValue === 'number' ? props.modelValue : 0
        return clamp(idx, 0, max)
      }
      const selected = Array.isArray(props.modelValue) ? props.modelValue : []
      const first = selected[0] ?? 0
      return clamp(first, 0, max)
    })()
    const active = ref(initialActive)
    const absRect = computed(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h }
      const translated = translateRect(raw, layout.originX, layout.originY)
      if (!layout.clipRect) return translated
      return (
        intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 }
      )
    })
    watchEffect(() => {
      const max = Math.max(0, props.options.length - 1)
      if (!props.multiple) {
        const idx = typeof props.modelValue === 'number' ? props.modelValue : 0
        active.value = clamp(idx, 0, max)
        return
      }
      active.value = clamp(active.value, 0, max)
    })
    function getOptionLabel(opt) {
      return typeof opt === 'string' ? opt : opt.label
    }
    function getOptionDetail(opt) {
      return typeof opt === 'string' ? void 0 : opt.detail
    }
    function commitSingle(index) {
      const next = clamp(index, 0, Math.max(0, props.options.length - 1))
      active.value = next
      emit2('update:modelValue', next)
      const opt = props.options[next]
      emit2('change', opt ? getOptionLabel(opt) : null)
    }
    function getSelectedIndices() {
      if (!props.multiple) return []
      const max = Math.max(0, props.options.length - 1)
      const raw = Array.isArray(props.modelValue) ? props.modelValue : []
      const set = /* @__PURE__ */ new Set()
      for (const v of raw) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        set.add(clamp(Math.trunc(v), 0, max))
      }
      return [...set].sort((a, b) => a - b)
    }
    function makeMultiplePayload(indices) {
      const values = indices
        .map((i) => props.options[i])
        .filter(Boolean)
        .map((opt) => getOptionLabel(opt))
      return { indices, values }
    }
    function emitMultiple(name, indices) {
      const payload = makeMultiplePayload(indices)
      if (props.multipleEmit === 'index') {
        emit2(name, payload.indices)
        return
      }
      if (props.multipleEmit === 'both') {
        emit2(name, payload)
        return
      }
      emit2(name, payload.values)
    }
    function toggleMultiple(index) {
      const nextIndex = clamp(index, 0, Math.max(0, props.options.length - 1))
      active.value = nextIndex
      const set = new Set(getSelectedIndices())
      if (set.has(nextIndex)) set.delete(nextIndex)
      else set.add(nextIndex)
      const indices = [...set].sort((a, b) => a - b)
      emit2('update:modelValue', indices)
      emitMultiple('change', indices)
    }
    function confirmMultiple() {
      const indices = getSelectedIndices()
      emitMultiple('confirm', indices)
    }
    function commit(index) {
      if (props.multiple) toggleMultiple(index)
      else commitSingle(index)
    }
    function onKeydown(e) {
      emit2('keydown', e)
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        active.value = clamp(
          active.value - 1,
          0,
          Math.max(0, props.options.length - 1),
        )
        if (!props.multiple) emit2('update:modelValue', active.value)
        scheduler.invalidate()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        active.value = clamp(
          active.value + 1,
          0,
          Math.max(0, props.options.length - 1),
        )
        if (!props.multiple) emit2('update:modelValue', active.value)
        scheduler.invalidate()
        return
      }
      if (
        props.multiple &&
        (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar')
      ) {
        e.preventDefault()
        toggleMultiple(active.value)
        return
      }
      if (e.key === 'Enter') {
        if (props.multiple) {
          e.preventDefault()
          confirmMultiple()
          return
        }
        commit(active.value)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        emit2('close')
      }
    }
    const { id } = useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e) => {
          const r = absRect.value
          const idx = e.cellY - r.y
          if (idx >= 0 && idx < props.options.length) commit(idx)
          else emit2('close')
        },
        focus: () => {
          focused.value = true
          emit2('focus')
          scheduler.invalidate()
        },
        blur: () => {
          focused.value = false
          emit2('blur')
          if (props.closeOnBlur) emit2('close')
          scheduler.invalidate()
        },
        keydown: onKeydown,
      },
    }))
    watchEffect(() => {
      if (!props.autoFocus) return
      if (!visible.value) return
      const manager = events.value
      const nodeId = id.value
      if (!manager || !nodeId) return
      if (manager.getFocused() === nodeId) return
      manager.focus(nodeId)
    })
    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.w,
        props.h,
        props.options,
        props.modelValue,
        props.multiple,
        props.multipleEmit,
        props.style,
        props.highlightStyle,
        focused.value,
        active.value,
        defaultStyle.value,
      ],
      paint: () => {
        if (!visible.value) return
        const r = absRect.value
        if (r.w <= 0 || r.h <= 0) return
        const base = props.style ?? defaultStyle.value
        const highlightBase = props.highlightStyle ?? {
          ...base,
          bg: 'yellow',
          fg: 'black',
        }
        const detailDimStyle = { ...base, dim: true }
        const highlightDetailStyle = { ...highlightBase, dim: true }
        const selectedSet = props.multiple
          ? new Set(getSelectedIndices())
          : null
        for (let i = 0; i < r.h; i++) {
          const opt = props.options[i]
          if (!opt) {
            terminal.write(' '.repeat(r.w), { x: r.x, y: r.y + i, style: base })
            continue
          }
          const isActiveRow = i === active.value
          const isChecked = props.multiple ? selectedSet.has(i) : isActiveRow
          const isHighlighted = props.multiple
            ? focused.value && isActiveRow
            : isActiveRow
          const prefix = props.multiple ? (isChecked ? '[x] ' : '[ ] ') : ''
          const label = sanitizeInlineText(getOptionLabel(opt))
          const detail = getOptionDetail(opt)
          const rawDetail = detail ? sanitizeInlineText(detail) : ''
          const labelText = `${prefix}${label}`
          const labelCells = textCellWidth(labelText)
          const minGap = 2
          const availableForDetail = r.w - labelCells - minGap
          if (rawDetail && availableForDetail >= 4) {
            const labelStyle = isHighlighted ? highlightBase : base
            terminal.write(labelText, { x: r.x, y: r.y + i, style: labelStyle })
            const detailCells = textCellWidth(rawDetail)
            const actualDetailWidth = Math.min(detailCells, availableForDetail)
            const gapWidth = r.w - labelCells - actualDetailWidth
            const gapStyle = isHighlighted ? highlightBase : base
            terminal.write(' '.repeat(gapWidth), {
              x: r.x + labelCells,
              y: r.y + i,
              style: gapStyle,
            })
            const detailText = sliceByCells(rawDetail, availableForDetail)
            const dStyle = isHighlighted ? highlightDetailStyle : detailDimStyle
            terminal.write(detailText, {
              x: r.x + labelCells + gapWidth,
              y: r.y + i,
              style: dStyle,
            })
          } else {
            const line = padEndByCells(sliceByCells(labelText, r.w), r.w)
            const style = isHighlighted ? highlightBase : base
            terminal.write(line, { x: r.x, y: r.y + i, style })
          }
        }
      },
    }))
    return () => h('span', rootProps)
  },
})
const cardPadding = 1
const headerH = 4
const footerH = 2
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: 'MultiSelectDemo',
  setup(__props) {
    const layout = useLayout()
    const cols2 = computed(() => layout.clipRect?.w ?? 0)
    const rows2 = computed(() => layout.clipRect?.h ?? 0)
    const options = [
      {
        label:
          'AppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleApple',
        detail: 'fruit',
      },
      { label: 'Banana', detail: 'fruit' },
      { label: 'Carrot', detail: 'vegetable' },
      { label: 'Duck', detail: 'meat' },
      { label: 'Egg', detail: 'protein' },
    ]
    function clamp2(n, min, max) {
      return Math.max(min, Math.min(max, n))
    }
    const selectedIndices = ref([1, 3])
    const selectedValues = computed(() =>
      selectedIndices.value.map((i) => options[i]?.label).filter(Boolean),
    )
    const confirmedValues = ref([])
    const cardW = computed(() => clamp2(cols2.value - 4, 34, 76))
    const cardH = computed(() => clamp2(rows2.value - 4, 14, 22))
    const cardX = computed(() =>
      Math.max(0, Math.floor((cols2.value - cardW.value) / 2)),
    )
    const cardY = computed(() =>
      Math.max(0, Math.floor((rows2.value - cardH.value) / 3)),
    )
    const contentW = computed(() =>
      Math.max(0, cardW.value - 2 - cardPadding * 2),
    )
    const contentH = computed(() =>
      Math.max(0, cardH.value - 2 - cardPadding * 2),
    )
    const selectVisibleH = computed(() => {
      const available = Math.max(3, contentH.value - headerH - footerH - 2)
      return Math.min(options.length, available)
    })
    const selectBoxH = computed(() => Math.max(3, selectVisibleH.value + 2))
    function onClose() {
      if (typeof process !== 'undefined' && typeof process.exit === 'function')
        process.exit(0)
    }
    function onChange(values) {}
    function onConfirm(values) {
      confirmedValues.value = values
    }
    return (_ctx, _cache) => {
      return (
        openBlock(),
        createBlock(
          unref(TBox),
          {
            x: 0,
            y: 0,
            w: cols2.value,
            h: rows2.value,
            border: false,
            padding: 0,
            style: { bg: 'black' },
          },
          {
            default: withCtx(() => [
              createVNode(
                unref(TBox),
                {
                  x: cardX.value,
                  y: cardY.value,
                  w: cardW.value,
                  h: cardH.value,
                  border: '',
                  title: 'Multi-select',
                  padding: cardPadding,
                  style: { fg: 'cyanBright', bg: 'black' },
                },
                {
                  default: withCtx(() => [
                    createVNode(
                      unref(TText),
                      {
                        x: 0,
                        y: 0,
                        w: contentW.value,
                        value: 'TSelect • multiple',
                        style: { fg: 'cyanBright', bold: true, bg: 'black' },
                      },
                      null,
                      8,
                      ['w'],
                    ),
                    createVNode(
                      unref(TText),
                      {
                        x: 0,
                        y: 1,
                        w: contentW.value,
                        value:
                          '↑/↓ Move   Space Toggle   Enter Confirm   Esc Exit',
                        style: { dim: true, bg: 'black' },
                      },
                      null,
                      8,
                      ['w'],
                    ),
                    createVNode(
                      unref(TText),
                      {
                        x: 0,
                        y: 2,
                        w: contentW.value,
                        value: `Selected: ${selectedValues.value.join(', ') || '(none)'}`,
                        style: { fg: 'yellowBright', bg: 'black' },
                      },
                      null,
                      8,
                      ['w', 'value'],
                    ),
                    createVNode(
                      unref(TText),
                      {
                        x: 0,
                        y: 3,
                        w: contentW.value,
                        value: '─'.repeat(Math.max(0, contentW.value)),
                        style: { dim: true, bg: 'black' },
                      },
                      null,
                      8,
                      ['w', 'value'],
                    ),
                    createVNode(
                      unref(TBox),
                      {
                        x: 0,
                        y: 4,
                        w: contentW.value,
                        h: selectBoxH.value,
                        border: '',
                        title: 'Options',
                        padding: 0,
                        style: { fg: 'whiteBright', dim: true, bg: 'black' },
                      },
                      {
                        default: withCtx(() => [
                          createVNode(
                            unref(TSelect),
                            {
                              x: 0,
                              y: 0,
                              w: Math.max(0, contentW.value - 2),
                              h: selectVisibleH.value,
                              options,
                              multiple: '',
                              modelValue: selectedIndices.value,
                              'onUpdate:modelValue':
                                _cache[0] ||
                                (_cache[0] = ($event) =>
                                  (selectedIndices.value = $event)),
                              autoFocus: '',
                              closeOnBlur: '',
                              style: { fg: 'whiteBright', bg: 'black' },
                              highlightStyle: {
                                fg: 'whiteBright',
                                bg: 'blueBright',
                                bold: true,
                              },
                              onClose,
                              onChange,
                              onConfirm,
                            },
                            null,
                            8,
                            ['w', 'h', 'modelValue'],
                          ),
                        ]),
                        _: 1,
                      },
                      8,
                      ['w', 'h'],
                    ),
                    createVNode(
                      unref(TText),
                      {
                        x: 0,
                        y: 4 + selectBoxH.value,
                        w: contentW.value,
                        value: `Confirmed: ${confirmedValues.value.join(', ') || '(none)'}`,
                        style: { fg: 'greenBright', bg: 'black' },
                      },
                      null,
                      8,
                      ['y', 'w', 'value'],
                    ),
                    createVNode(
                      unref(TText),
                      {
                        x: 0,
                        y: 5 + selectBoxH.value,
                        w: contentW.value,
                        value: `Indices: [${selectedIndices.value.join(', ')}]`,
                        style: { dim: true, bg: 'black' },
                      },
                      null,
                      8,
                      ['y', 'w', 'value'],
                    ),
                  ]),
                  _: 1,
                },
                8,
                ['x', 'y', 'w', 'h'],
              ),
            ]),
            _: 1,
          },
          8,
          ['w', 'h'],
        )
      )
    }
  },
})
const cols = Number.isFinite(process.stdout.columns)
  ? process.stdout.columns
  : 70
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 22
const app = createTerminalApp({
  cols,
  rows,
  component: _sfc_main,
  defaultStyle: { fg: 'whiteBright', bg: 'black' },
})
app.mount()
const smoke = process.env.VT_SMOKE === '1'
const out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { write: () => {} },
        clear: false,
        hideCursor: false,
        altScreen: false,
      }
    : { output: process.stdout, hideCursor: true },
)
const offCommitCursor = app.terminal.on('commit', () => {
  if (smoke) return
  const anchor = app.getImeAnchor()
  if (anchor) {
    out.setCursor(anchor.cellX, anchor.cellY)
    out.showCursor(false)
  }
})
app.scheduler.flush()
let driver = null
const exit = () => {
  driver?.dispose()
  offCommitCursor()
  out.dispose()
  app.dispose()
  process.exit(0)
}
process.on('SIGINT', exit)
if (process.stdout.isTTY) {
  process.stdout.on('resize', () => {
    const nextCols = Number.isFinite(process.stdout.columns)
      ? process.stdout.columns
      : cols
    const nextRows = Number.isFinite(process.stdout.rows)
      ? process.stdout.rows
      : rows
    app.terminal.resize(nextCols, nextRows)
    app.scheduler.flush()
  })
}
if (smoke) {
  exit()
} else {
  driver = createStdinDriver({
    dispatch: (e) => {
      app.events.dispatch(e)
      app.scheduler.flush()
    },
    enableMouse: true,
    onExit: exit,
  })
}
