const LATEX_ENV = 'matrix|bmatrix|pmatrix|vmatrix|Bmatrix|align\\*?|equation\\*?|gather\\*?|cases'

/** Normalize AI lesson text so markdown + KaTeX render reliably. */
export function preprocessLessonContent(raw: string): string {
  let text = raw.trim()
  if (!text) return text

  text = normalizeEscapes(text)
  text = convertAlternateMathDelimiters(text)
  text = text.replace(/```(?:latex|math)\s*\n([\s\S]*?)```/gi, (_, math) => `$$${math.trim()}$$`)
  text = wrapLatexEnvironments(text)
  text = text.replace(/(\s)(\d+\.\s+\*\*)/g, '\n\n$2')

  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g)
  text = segments
    .map((segment) => {
      if (segment.startsWith('$')) return normalizeMathSegment(segment)
      return wrapBareLatex(segment)
    })
    .join('')

  text = collapseBrokenDollars(text)
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function normalizeEscapes(text: string): string {
  return text.replace(/\\\\(?=[a-zA-Z{[])/g, '\\')
}

function convertAlternateMathDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$${math.trim()}$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`)
}

function normalizeMathSegment(segment: string): string {
  const display = segment.startsWith('$$')
  const inner = display ? segment.slice(2, -2) : segment.slice(1, -1)
  const fixed = inner.replace(/\\\\(?=[a-zA-Z{[])/g, '\\').trim()
  return display ? `$$${fixed}$$` : `$${fixed}$`
}

function wrapLatexEnvironments(text: string): string {
  const envPattern = new RegExp(`\\\\begin\\{(${LATEX_ENV})\\}[\\s\\S]*?\\\\end\\{\\1\\}`, 'g')
  return text.replace(envPattern, (match) => {
    if (match.includes('$$')) return match
    return `$$${match}$$`
  })
}

function wrapBareLatex(segment: string): string {
  let out = segment

  out = out.replace(
    /\\(?:text|mathrm|mathbf|mathbb|mathcal|frac|sqrt|sum|int|prod|lim|log|exp|ReLU|softmax|argmax|argmin|dots|ldots|cdots|cdot|times|leq|geq|neq|approx|infty|alpha|beta|gamma|delta|theta|lambda|sigma|pi|phi|omega|nabla|partial|left|right)(?:\{[^{}]*\}|\[[^\]]*\])*(?:\{[^{}]*\})*(?:\([^)]*\))?/g,
    (match) => `$${match}$`,
  )

  out = out.replace(
    /([A-Za-z]+(?:_\{[^{}]+\}|\^[^{}]+)+(?:\s*[=+\-*/]\s*[A-Za-z0-9_\\{}^().,\s]+)*)/g,
    (match) => {
      if (match.includes('$')) return match
      if (!/[_\\^{}]/.test(match)) return match
      return `$${match.trim()}$`
    },
  )

  return out
}

function collapseBrokenDollars(text: string): string {
  return text.replace(/\$\$\$+/g, '$$').replace(/\$\s+\$/g, ' ')
}
