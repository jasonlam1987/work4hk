export type BrOcrResult = {
  name: string
  english_name: string
  business_registration_number: string
  company_address: string
  business_type: string
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

const normalizeNoSpace = (s: string) =>
  clean(s)
    .replace(/[\s\u00A0]+/g, '')
    .replace(/[：:。．.]+/g, '')
    .trim()

const normalizeDigitsLike = (s: string) =>
  s
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/B/g, '8')
    .replace(/S/g, '5')
    .replace(/Z/g, '2')

const stopLabel =
  /^(?:商業登記|登記證|Business\s*Registration|BR\s*No|Registration\s*No|Certificate\s*No|Cert(?:ificate)?\s*No|證書(?:編號|號碼)|地址|Address|公司地址|業務地址|業務性質|Nature\s*of\s*Business|法律地位|Status|生效日期|Date\s*of\s*Commencement|屆滿日期|Date\s*of\s*Expiry|登記費|Fee|徵費|Levy)\b/i
const blacklist =
  /(?:\bFORM\b|\bChapter\b|regulation|BUSINESS\s+REGISTRATION|ORDINANCE|REGULATIONS|RECEIVED\s+FEE|Please\s+cut\s+along|表格|第\d+條|商業登記條例|商業登記規例)/i

const isLabelOnly = (s: string) =>
  /^(?:地址|Address|公司名稱|名稱|Name\s*of\s*Business(?:\/Corporation)?|Nature\s*of\s*Business|業務性質|Certificate\s*No\.?|Cert(?:ificate)?\s*No\.?|證書(?:編號|號碼)|法律地位|Status)$/i.test(
    s.trim()
  ) ||
  /^(?:地址|Address|公司名稱|名稱|NameofBusiness(?:\/Corporation)?|NatureofBusiness|業務性質|CertificateNo\.?|Cert(?:ificate)?No\.?|證書(?:編號|號碼)|法律地位|Status)$/i.test(
    normalizeNoSpace(s)
  )

const looksLikeCompanyName = (s: string) =>
  /有限公司|有限責任|公司\b/i.test(s) || /\b(LIMITED|LTD\.?|CO\.?|COMPANY)\b/i.test(s)

const looksLikeAddress = (s: string) => {
  const t = clean(s)
  if (!t) return false

  const hasDigit = /\d/.test(t)
  const enTokens =
    /\b(RM|UNIT|FLOOR|FLAT|ROAD|STREET|BUILDING|TOWER|BLOCK|SHOP|ROOM|SUITE|GF|G\/F)\b/i.test(t)
  const zhTokens = /(號|樓|室|座|層|街|道|路|巷|區|大廈|村|苑|邨|徑|里|中心|商場|碼頭|工業|大樓|閣)/.test(t)
  const hkArea = /(香港|九龍|新界)/.test(t) || /\bHONG\s*KONG\b|\bKOWLOON\b|\bNEW\s*TERRITORIES\b/i.test(t)

  const score = Number(hasDigit) + Number(enTokens) + Number(zhTokens) + Number(hkArea)
  if (looksLikeCompanyName(t) && !(hasDigit || enTokens || zhTokens)) return false
  return score >= 2
}

const sanitizeAddressSuffix = (s: string) => {
  let t = clean(s)
  if (!t) return ''

  for (let i = 0; i < 6; i++) {
    const before = t
    t = t
      .replace(/\bBODY\s+CORPORATE\b\s*$/i, '')
      .replace(/\bCORPORATE\b\s*$/i, '')
      .replace(/\bBODY\b\s*$/i, '')
      .replace(/\bTRADING\b\s*$/i, '')
      .replace(/\bTRAD\b\s*$/i, '')
      .replace(/\bTRA\b\s*$/i, '')
      .replace(/[\s,;]+$/g, '')
      .trim()
    if (t === before) break
  }
  return t
}

const median = (arr: number[]) => {
  if (arr.length === 0) return 18
  const a = [...arr].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 === 1 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

type Det = {
  text: string
  minX: number
  maxX: number
  minY: number
  maxY: number
  cx: number
  cy: number
  h: number
  w: number
}

const toDet = (t: any): Det | null => {
  const text = clean(String(t?.DetectedText || ''))
  const poly = t?.Polygon || t?.ItemPolygon || t?.DetectedWords?.[0]?.WordPolygon
  const pts = Array.isArray(poly) ? poly : Array.isArray(poly?.Points) ? poly.Points : null
  if (!pts || !Array.isArray(pts) || pts.length === 0) return null
  const xs = pts.map((p: any) => Number(p?.X)).filter((n: any) => Number.isFinite(n))
  const ys = pts.map((p: any) => Number(p?.Y)).filter((n: any) => Number.isFinite(n))
  if (xs.length === 0 || ys.length === 0) return null
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    text,
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    h: Math.max(1, maxY - minY),
    w: Math.max(1, maxX - minX),
  }
}

const groupLines = (items: Det[], yTol: number) => {
  const sorted = [...items].sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx))
  const groups: Array<{ cy: number; items: Det[] }> = []
  for (const it of sorted) {
    const g = groups.find(gr => Math.abs(gr.cy - it.cy) <= yTol)
    if (!g) {
      groups.push({ cy: it.cy, items: [it] })
    } else {
      g.items.push(it)
      g.cy = (g.cy * (g.items.length - 1) + it.cy) / g.items.length
    }
  }
  return groups
    .map(g => ({
      cy: g.cy,
      text: clean(g.items.sort((a, b) => a.cx - b.cx).map(x => x.text).join(' ')),
      items: g.items,
    }))
    .filter(g => g.text)
}

const normalizeLabelText = (s: string) => clean(s).replace(/[：:。.]$/g, '').trim()

const isStopLabelText = (s: string) => stopLabel.test(s) || stopLabel.test(normalizeNoSpace(s))

const isBusinessTypeNoise = (s: string) => {
  const t = clean(s)
  if (!t) return true
  if (/(生效日期|屆滿日期)/.test(t)) return true
  if (/Date\s*of\s*(Commencement|Expiry)/i.test(t)) return true
  if (/Certificate\s*No|Cert(?:ificate)?\s*No|登記證號碼|登記號碼|商業登記/i.test(t)) return true
  if (/Fee\s*(and\s*Levy)?|Levy/i.test(t) || /(登記費|徵費)/.test(t)) return true
  if (/Status|法律地位/i.test(t)) return true
  if (/BODY\s+CORPORATE|\bBODY\b|\bCORPORATE\b/i.test(t)) return true
  return false
}

const findBestLabelDet = (dets: Det[], regexes: RegExp[], yTol: number, xMargin: number) => {
  const cands = dets
    .filter(d => regexes.some(r => r.test(normalizeLabelText(d.text))))
    .filter(d => !blacklist.test(d.text))
    .filter(d => normalizeLabelText(d.text).length <= 32)

  if (cands.length === 0) return null

  const hasValueRight = (label: Det) =>
    dets.some(d => d.minX >= label.maxX + xMargin && Math.abs(d.cy - label.cy) <= yTol)

  const scored = cands.map(d => {
    const t = normalizeLabelText(d.text)
    const valueBonus = hasValueRight(d) ? 2000 : 0
    const leftBonus = Math.max(0, 2000 - d.minX)
    const lenPenalty = t.length * 20
    return { d, score: valueBonus + leftBonus - lenPenalty }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.d || null
}

const collectRightOf = (dets: Det[], label: Det, yTol: number, xMargin: number, maxLines: number) => {
  const candidates = dets.filter(
    d =>
      d.minX >= label.maxX + xMargin &&
      d.cy >= label.cy - yTol &&
      d.cy <= label.cy + yTol * maxLines &&
      !blacklist.test(d.text)
  )
  return groupLines(candidates, yTol)
    .map(x => x.text)
    .filter(v => v && !isLabelOnly(v) && !isStopLabelText(v))
}

const collectAfter = (lines: string[], labelRegexes: RegExp[], maxLines = 6) => {
  const idx = lines.findIndex(l => labelRegexes.some(r => r.test(l)))
  if (idx < 0) return []
  const out: string[] = []
  for (let i = idx + 1; i < Math.min(lines.length, idx + 1 + maxLines); i++) {
    const v = clean(lines[i])
    if (!v) continue
    if (isLabelOnly(v)) continue
    if (blacklist.test(v)) continue
    if (isStopLabelText(v) && out.length > 0) break
    out.push(v)
  }
  return out
}

const collectUntil = (lines: string[], startIndex: number, endLabelRegexes: RegExp[], maxLines = 20) => {
  if (startIndex < 0) return []
  const out: string[] = []
  for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 1 + maxLines); i++) {
    const v = clean(lines[i])
    if (!v) continue
    if (isLabelOnly(v)) continue
    if (blacklist.test(v)) continue
    if (endLabelRegexes.some(r => r.test(v)) || isStopLabelText(v)) break
    out.push(v)
  }
  return out
}

const extractBr8 = (s: string) => {
  const t = normalizeDigitsLike(s)
  const m1 = t.match(/(\d{8})\s*[-–—]\s*\d{3}/)
  if (m1?.[1]) return m1[1]
  const m2 = t.match(/(\d{8})\s+\d{3}/)
  if (m2?.[1]) return m2[1]
  const m3 = t.match(/(\d{8})/)
  return m3?.[1] || ''
}

export const extractBrOcrFields = (detections: any[], extractedText: string): BrOcrResult => {
  const dets = detections.map(toDet).filter(Boolean) as Det[]
  const lines = extractedText
    .split(/\r?\n/)
    .map((s: string) => s.trim())
    .filter(Boolean)

  const lineH = median(dets.map(d => d.h))
  const yTol = Math.max(10, lineH * 0.9)
  const xMargin = 10

  const findNameBlock = () => {
    const label = findBestLabelDet(
      dets,
      [/法團所用名稱/, /Name\s*of\s*Business/i, /Name\s*of\s*Corporation/i],
      yTol,
      xMargin
    )
    if (!label) return []
    return collectRightOf(dets, label, yTol, xMargin, 5)
  }

  const findChineseNameByLayout = () => {
    const block = findNameBlock()
    const zh = block.filter(v => /[\u4e00-\u9fff]/.test(v) && !/業務\s*\/\s*分行名稱/.test(v))
    const preferred = zh.find(v => v.includes('有限公司') || v.endsWith('公司'))
    return preferred || zh[0] || ''
  }

  const findEnglishNameByLayout = () => {
    const block = findNameBlock()
    const en = block.filter(v => /[A-Za-z]/.test(v) && !/Name\s*of\s*(?:Business|Corporation)/i.test(v))
    for (let i = 0; i < en.length; i++) {
      const a = en[i]
      const b = en[i + 1]
      if (a && b && /[A-Za-z]/.test(a) && /^(LIMITED|LTD\.?|CO\.?|COMPANY)$/i.test(b)) return clean(`${a} ${b}`)
    }
    const preferred = en.find(v => /LIMITED|LTD\.?|CO\.?|COMPANY/i.test(v))
    return clean(preferred || en[0] || '')
  }

  const findBusinessTypeByLayout = () => {
    const labelCands = dets.filter(d => /Nature\s*of\s*Business/i.test(d.text) || /業務性質/.test(d.text))
    if (labelCands.length === 0) return ''

    const scoreValue = (v: string) => {
      const t = clean(v)
      if (!t) return -1
      if (isBusinessTypeNoise(t)) return -1
      if (blacklist.test(t)) return -1
      if (isLabelOnly(t)) return -1
      if (isStopLabelText(t)) return -1

      let score = 0
      const hasLetters = /[A-Za-z]/.test(t)
      const hasDigits = /\d/.test(t)
      if (hasLetters) score += 50
      if (!hasDigits) score += 20
      if (/^[A-Z][A-Z\s&\-/]{2,40}$/.test(t)) score += 60
      if (t.length >= 3 && t.length <= 40) score += 20
      if (/\bTRADING\b/i.test(t)) score += 200
      return score
    }

    const pickFromLabel = (label: Det) => {
      const region = dets.filter(d => {
        const inRowRight = d.minX >= label.maxX + xMargin && Math.abs(d.cy - label.cy) <= yTol
        const belowSameColumn =
          d.cy >= label.cy - yTol &&
          d.cy <= label.cy + yTol * 6 &&
          d.minX >= Math.max(0, label.minX - xMargin) &&
          d.minX <= label.maxX + 800
        return (inRowRight || belowSameColumn) && !blacklist.test(d.text)
      })

      const lineTexts = groupLines(region, yTol)
        .map(x => x.text)
        .map(v => v.replace(/[：:]/g, ' ').trim())
        .filter(v => v && !isBusinessTypeNoise(v))

      const singleTexts = region
        .map(x => x.text)
        .map(v => v.replace(/[：:]/g, ' ').trim())
        .filter(v => v && !isBusinessTypeNoise(v))

      const candidates = [...lineTexts, ...singleTexts]
      let best = ''
      let bestScore = -1
      for (const c of candidates) {
        const sc = scoreValue(c)
        if (sc > bestScore) {
          bestScore = sc
          best = c
        }
      }
      return { best, bestScore }
    }

    let best = ''
    let bestScore = -1
    for (const lab of labelCands) {
      const { best: b, bestScore: s } = pickFromLabel(lab)
      if (s > bestScore) {
        bestScore = s
        best = b
      }
      if (/\bTRADING\b/i.test(b)) return 'TRADING'
    }
    const merged = clean(best)
    if (!merged || isBusinessTypeNoise(merged)) return ''
    if (/\bTRADING\b/i.test(merged)) return 'TRADING'
    return merged
  }

  const findAddressByLayout = (nameZh: string, nameEn: string) => {
    const label = findBestLabelDet(dets, [/^地址$/i, /\bAddress\b/i, /地址\s*Address/i], yTol, xMargin)
    if (!label) return ''
    const got = collectRightOf(dets, label, yTol, xMargin, 10)
      .map(v => v.replace(/\bAddress\b/i, '').trim())
      .filter(Boolean)

    const mergedRaw = clean(got.join(' '))
    const merged = sanitizeAddressSuffix(mergedRaw)
    if (!merged) return ''
    const nZh = clean(nameZh)
    const nEn = clean(nameEn)
    if (nZh && clean(merged) === nZh) return ''
    if (nEn && clean(merged).toUpperCase() === nEn.toUpperCase()) return ''
    if (!looksLikeAddress(merged)) return ''
    return merged
  }

  const findBrNoByLayout = () => {
    const label = findBestLabelDet(
      dets,
      [
        /登記證號碼/i,
        /登記號碼/i,
        /商業登記(?:號碼|編號)?/i,
        /Business\s*Registration/i,
        /BR\s*No\.?/i,
        /Registration\s*No\.?/i,
        /Certificate\s*No\.?/i,
        /Cert(?:ificate)?\s*No\.?/i,
      ],
      yTol,
      xMargin
    )
    if (!label) return ''
    const got = collectRightOf(dets, label, yTol, xMargin, 4).join(' ')
    const v = extractBr8(got)
    if (v) return v
    return ''
  }

  const findChineseName = () => {
    const byLayout = findChineseNameByLayout()
    if (byLayout) return byLayout
    const nameIdx = lines.findIndex(l => /法團所用名稱|Name of Business|Corporation/i.test(l))
    const block = collectUntil(lines, nameIdx, [/^(?:地址|Address|公司地址|業務地址)\b/i], 12)
    const candidates = block.filter(v => /[\u4e00-\u9fff]/.test(v) && !/業務\s*\/\s*分行名稱/.test(v))
    const preferred = candidates.find(v => v.includes('有限公司') || v.endsWith('公司'))
    if (preferred) return preferred
    if (candidates.length > 0) return candidates[0]
    for (const l of lines) {
      if (l.includes('有限公司') || l.endsWith('公司')) {
        if (l.includes('商業登記') || l.includes('登記證') || l.includes('Business')) continue
        return l
      }
    }
    return ''
  }

  const findEnglishName = () => {
    const byLayout = findEnglishNameByLayout()
    if (byLayout) return byLayout
    const nameIdx = lines.findIndex(l => /法團所用名稱|Name of Business|Corporation/i.test(l))
    const block = collectUntil(lines, nameIdx, [/^(?:地址|Address|公司地址|業務地址)\b/i], 12)
    const candidates = block
      .filter(v => /[A-Za-z]/.test(v))
      .filter(v => !/Name\s*of\s*(?:Business|Corporation)|Corporation/i.test(v))
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i]
      const b = candidates[i + 1]
      if (a && b && /[A-Za-z]/.test(a) && /^(LIMITED|LTD\.?|CO\.?|COMPANY)$/i.test(b)) return clean(`${a} ${b}`)
    }
    const preferred = candidates.find(v => /LIMITED|LTD\.?|CO\.?|COMPANY/i.test(v))
    if (preferred) return clean(preferred)
    return clean(candidates[0] || '')
  }

  const findBrNo = () => {
    const byLayout = findBrNoByLayout()
    if (byLayout) return byLayout

    for (let i = 0; i < lines.length; i++) {
      const l = normalizeDigitsLike(lines[i])
      const labeled =
        /(?:商業登記(?:號碼|編號)?|登記號碼|登記證號碼|Business\s*Registration(?:\s*No\.?)?|BR\s*No\.?|Registration\s*No\.?|Certificate\s*No\.?|Cert(?:ificate)?\s*No\.?|證書(?:編號|號碼))/i.test(
          l
        )
      if (!labeled) continue
      const direct = extractBr8(l)
      if (direct) return direct
      const take = normalizeDigitsLike([lines[i + 1] || '', lines[i + 2] || '', lines[i + 3] || ''].join(' '))
      const fromNext = extractBr8(take)
      if (fromNext) return fromNext
    }

    const all = normalizeDigitsLike(extractedText)
    const m0 = all.match(/(\d{8})\s*[-–—]\s*000/i) || all.match(/(\d{8})\s+000/i)
    if (m0?.[1]) return m0[1]
    const m1 = all.match(/(\d{8})\s*[-–—]\s*\d{3}/i) || all.match(/(\d{8})\s+\d{3}/i)
    if (m1?.[1]) return m1[1]
    return ''
  }

  const findBusinessType = () => {
    const byLayout = findBusinessTypeByLayout()
    if (byLayout) return byLayout
    const candidates = collectAfter(lines, [/Nature of Business/i, /業務性質/i], 6)
      .map(v => v.replace(/[：:]/g, ' ').trim())
      .filter(v => v && !isStopLabelText(v) && !blacklist.test(v) && !isBusinessTypeNoise(v))
      .slice(0, 2)
    const merged = clean(candidates.join(' '))
    if (/\bTRADING\b/i.test(merged)) return 'TRADING'
    return merged
  }

  const findAddress = (nameZh: string, nameEn: string) => {
    const byLayout = findAddressByLayout(nameZh, nameEn)
    if (byLayout) return byLayout

    const candidates = collectAfter(lines, [/^(?:地址|Address|公司地址|業務地址)$/i, /\bAddress\b/i, /^地址/], 12)
    const filtered = candidates
      .map(v => v.replace(/\bAddress\b/i, '').trim())
      .filter(v => v && !isLabelOnly(v) && !isStopLabelText(v) && !blacklist.test(v))
    const mergedRaw = filtered.length > 0 ? clean(filtered.join(' ')) : ''
    const merged = sanitizeAddressSuffix(mergedRaw)
    const nZh = clean(nameZh)
    const nEn = clean(nameEn)
    const rejectIfName = (val: string) => {
      if (nZh && clean(val) === nZh) return true
      if (nEn && clean(val).toUpperCase() === nEn.toUpperCase()) return true
      return false
    }
    if (merged && !rejectIfName(merged) && looksLikeAddress(merged)) return merged
    for (const l of lines) {
      const v = clean(l).replace(/\bAddress\b/i, '').trim()
      if (!v) continue
      if (/Name\s*of\s*(?:Business|Corporation)|Corporation/i.test(v)) continue
      if (blacklist.test(v)) continue
      if (rejectIfName(v)) continue
      const sanitized = sanitizeAddressSuffix(v)
      if (looksLikeAddress(sanitized)) return sanitized
    }
    return ''
  }

  const nameZh = findChineseName()
  const nameEn = findEnglishName()

  return {
    name: nameZh,
    english_name: nameEn,
    business_registration_number: findBrNo(),
    company_address: findAddress(nameZh, nameEn),
    business_type: findBusinessType(),
  }
}

