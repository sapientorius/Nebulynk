import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, extname, dirname } from 'node:path'

const ROOT = process.cwd()
const SRC_DIR = join(ROOT, 'src')
const OUT_FILE = join(ROOT, 'src/lib/generated-ui-messages.js')

function sanitizeSegment(value) {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase())
    .filter(Boolean)
    .join('.')
}

function slugFromText(text) {
  const normalized = text
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
  if (!normalized) return 'text'
  const parts = normalized.split(/\s+/).filter(Boolean).slice(0, 8)
  return parts.join('_') || 'text'
}

function parseStringLiteral(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    const quote = trimmed[0]
    const body = trimmed.slice(1, -1)
    const escaped = body
      .replace(/\\/g, '\\\\')
      .replace(new RegExp(`\\${quote}`, 'g'), `\\${quote}`)
    try {
      return JSON.parse(`"${escaped.replace(/"/g, '\\"')}"`)
    } catch {
      return body
    }
  }
  return null
}

function splitTopLevelTemplate(templateBody) {
  const parts = []
  let cursor = ''
  for (let i = 0; i < templateBody.length; i += 1) {
    const char = templateBody[i]
    if (char === '\\') {
      cursor += char
      if (i + 1 < templateBody.length) {
        cursor += templateBody[i + 1]
        i += 1
      }
      continue
    }
    if (char === '$' && templateBody[i + 1] === '{') {
      parts.push({ type: 'text', value: cursor })
      cursor = ''
      i += 2
      let depth = 1
      let expr = ''
      while (i < templateBody.length && depth > 0) {
        const inner = templateBody[i]
        if (inner === '\\') {
          expr += inner
          if (i + 1 < templateBody.length) {
            expr += templateBody[i + 1]
            i += 1
          }
          i += 1
          continue
        }
        if (inner === '{') {
          depth += 1
          expr += inner
          i += 1
          continue
        }
        if (inner === '}') {
          depth -= 1
          if (depth === 0) break
          expr += inner
          i += 1
          continue
        }
        expr += inner
        i += 1
      }
      parts.push({ type: 'expr', value: expr.trim() })
      continue
    }
    cursor += char
  }
  parts.push({ type: 'text', value: cursor })
  return parts
}

function paramNameFromExpr(expr, fallbackIndex) {
  const clean = expr
    .replace(/\?.*$/g, '')
    .replace(/[^a-zA-Z0-9._]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  if (!clean) return `value_${fallbackIndex}`
  const tokens = clean.split('.').filter(Boolean)
  const tail = tokens.slice(-2).join('_')
  return tail || `value_${fallbackIndex}`
}

function parseTranslatableLiteral(raw) {
  const trimmed = raw.trim()
  const plain = parseStringLiteral(trimmed)
  if (plain !== null) {
    return { message: plain, params: [] }
  }
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    const body = trimmed.slice(1, -1)
    const parts = splitTopLevelTemplate(body)
    const usedNames = new Set()
    const params = []
    let message = ''
    let idx = 1
    for (const part of parts) {
      if (part.type === 'text') {
        message += part.value
        continue
      }
      let name = paramNameFromExpr(part.value, idx)
      while (usedNames.has(name)) {
        idx += 1
        name = `${name}_${idx}`
      }
      usedNames.add(name)
      params.push({ name, expression: part.value })
      message += `{${name}}`
      idx += 1
    }
    return { message, params }
  }
  return null
}

function escapeJsString(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
}

function isIdentifierChar(char) {
  return /[a-zA-Z0-9_$]/.test(char)
}

function parseCallArgs(source, openParenIndex) {
  let i = openParenIndex + 1
  let arg1 = ''
  let arg2 = ''
  let mode = 1
  let parenDepth = 0
  let braceDepth = 0
  let bracketDepth = 0
  let quote = null
  let templateExprDepth = 0

  while (i < source.length) {
    const ch = source[i]
    const target = mode === 1 ? 'arg1' : 'arg2'

    if (quote) {
      if (quote === '`') {
        if (ch === '\\') {
          if (mode === 1) arg1 += ch + (source[i + 1] || '')
          else arg2 += ch + (source[i + 1] || '')
          i += 2
          continue
        }
        if (ch === '$' && source[i + 1] === '{') {
          if (mode === 1) arg1 += '${'
          else arg2 += '${'
          templateExprDepth += 1
          i += 2
          continue
        }
        if (ch === '}' && templateExprDepth > 0) {
          if (mode === 1) arg1 += ch
          else arg2 += ch
          templateExprDepth -= 1
          i += 1
          continue
        }
        if (ch === '`' && templateExprDepth === 0) {
          if (mode === 1) arg1 += ch
          else arg2 += ch
          quote = null
          i += 1
          continue
        }
        if (mode === 1) arg1 += ch
        else arg2 += ch
        i += 1
        continue
      }
      if (ch === '\\') {
        if (mode === 1) arg1 += ch + (source[i + 1] || '')
        else arg2 += ch + (source[i + 1] || '')
        i += 2
        continue
      }
      if (ch === quote) {
        if (mode === 1) arg1 += ch
        else arg2 += ch
        quote = null
        i += 1
        continue
      }
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }

    if (ch === '(') {
      parenDepth += 1
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }
    if (ch === ')') {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
        return { arg1: arg1.trim(), arg2: arg2.trim(), endIndex: i + 1 }
      }
      parenDepth -= 1
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }
    if (ch === '{') {
      braceDepth += 1
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }
    if (ch === '}') {
      braceDepth -= 1
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }
    if (ch === '[') {
      bracketDepth += 1
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }
    if (ch === ']') {
      bracketDepth -= 1
      if (mode === 1) arg1 += ch
      else arg2 += ch
      i += 1
      continue
    }

    if (ch === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && mode === 1) {
      mode = 2
      i += 1
      continue
    }

    if (mode === 1) arg1 += ch
    else arg2 += ch
    i += 1
  }

  return null
}

async function collectFiles(dir, list = []) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(full, list)
      continue
    }
    const ext = extname(entry.name)
    if (ext === '.js' || ext === '.vue') list.push(full)
  }
  return list
}

function buildNestedObject(entries) {
  const out = {}
  for (const [key, value] of Object.entries(entries)) {
    const parts = key.split('.')
    let cursor = out
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      if (i === parts.length - 1) {
        cursor[part] = value
      } else {
        cursor[part] = cursor[part] || {}
        cursor = cursor[part]
      }
    }
  }
  return out
}

function toJsObjectLiteral(value, indent = 2) {
  if (typeof value === 'string') {
    return `'${escapeJsString(value)}'`
  }
  if (Array.isArray(value)) {
    const inner = value.map((item) => toJsObjectLiteral(item, indent + 2)).join(', ')
    return `[${inner}]`
  }
  const pad = ' '.repeat(indent)
  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${pad}${key}: ${toJsObjectLiteral(val, indent + 2)}`)
  return `{\n${entries.join(',\n')}\n${' '.repeat(Math.max(indent - 2, 0))}}`
}

const files = await collectFiles(SRC_DIR)
const enEntries = {}
const deEntries = {}
const pairToKey = new Map()
const keyCollisionCount = new Map()

let modifiedFiles = 0
let replacedCalls = 0

for (const file of files) {
  const rel = relative(SRC_DIR, file).replace(/\\/g, '/')
  let source = await readFile(file, 'utf8')
  let cursor = 0
  let output = ''
  let localChanges = 0

  while (cursor < source.length) {
    const trIdxCandidates = [source.indexOf('$tr(', cursor), source.indexOf('this.$tr(', cursor), source.indexOf('tr(', cursor)]
      .filter((index) => index !== -1)
    if (trIdxCandidates.length === 0) {
      output += source.slice(cursor)
      break
    }
    const start = Math.min(...trIdxCandidates)
    output += source.slice(cursor, start)

    let callStart = start
    let marker = '$tr('
    if (source.startsWith('this.$tr(', start)) {
      marker = 'this.$tr('
    } else if (source.startsWith('tr(', start)) {
      const prev = start > 0 ? source[start - 1] : ''
      const next = source[start + 3] || ''
      if (isIdentifierChar(prev) || next === undefined) {
        output += source[start]
        cursor = start + 1
        continue
      }
      marker = 'tr('
    }

    const openParenIndex = start + marker.length - 1
    const parsed = parseCallArgs(source, openParenIndex)
    if (!parsed) {
      output += source.slice(start, openParenIndex + 1)
      cursor = openParenIndex + 1
      continue
    }

    const english = parseTranslatableLiteral(parsed.arg1)
    const german = parseTranslatableLiteral(parsed.arg2)
    if (!english || !german) {
      output += source.slice(start, parsed.endIndex)
      cursor = parsed.endIndex
      continue
    }

    const pairKey = `${english.message}\u0000${german.message}`
    let key = pairToKey.get(pairKey)
    if (!key) {
      const ns = sanitizeSegment(dirname(rel))
      const baseSlug = slugFromText(english.message)
      const baseKey = ns ? `ui.${ns}.${baseSlug}` : `ui.${baseSlug}`
      const count = (keyCollisionCount.get(baseKey) || 0) + 1
      keyCollisionCount.set(baseKey, count)
      key = count === 1 ? baseKey : `${baseKey}_${count}`
      pairToKey.set(pairKey, key)
      enEntries[key] = english.message
      deEntries[key] = german.message
    }

    let replacement = `$t('${key}'`
    if (english.params.length > 0) {
      const paramsExpr = english.params.map((item) => `${item.name}: ${item.expression}`).join(', ')
      replacement += `, { ${paramsExpr} }`
    }
    replacement += ')'
    output += replacement
    cursor = parsed.endIndex
    localChanges += 1
    replacedCalls += 1
    callStart += 1
  }

  if (localChanges > 0) {
    modifiedFiles += 1
    await writeFile(file, output, 'utf8')
  }
}

const enNested = buildNestedObject(enEntries)
const deNested = buildNestedObject(deEntries)

const generated = `export const generatedUiMessages = ${toJsObjectLiteral({ en: enNested, de: deNested }, 2)}\n`
await writeFile(OUT_FILE, generated, 'utf8')

console.log(`Converted ${replacedCalls} calls across ${modifiedFiles} files.`)
console.log(`Generated message file: ${relative(ROOT, OUT_FILE)}`)
