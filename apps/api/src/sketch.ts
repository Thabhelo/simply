export const SKETCH_ELEMENT_TYPES = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow'] as const
export type SketchElementType = (typeof SKETCH_ELEMENT_TYPES)[number]

export type ExcalidrawElementSkeleton = {
  type: SketchElementType
  x: number
  y: number
  width: number
  height: number
  label?: { text: string }
}

const MAX_ELEMENTS = 24
const MAX_LABEL = 64
const MIN_SIZE = 16
const MAX_SIZE = 480
const MAX_COORD = 1400

function isSketchType(value: string): value is SketchElementType {
  return (SKETCH_ELEMENT_TYPES as readonly string[]).includes(value)
}

function finiteNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < min || value > max) return undefined
  return value
}

function cleanLabel(raw: unknown): { text: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const text = 'text' in raw && typeof raw.text === 'string' ? raw.text.trim() : ''
  if (!text) return undefined
  const safe = text.replace(/[<>&]/g, '').slice(0, MAX_LABEL)
  return safe ? { text: safe } : undefined
}

/** Validate model-emitted Excalidraw skeletons; drop invalid entries. */
export function cleanExcalidrawElements(raw: unknown): ExcalidrawElementSkeleton[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined

  const cleaned: ExcalidrawElementSkeleton[] = []
  for (const item of raw.slice(0, MAX_ELEMENTS)) {
    if (!item || typeof item !== 'object') continue
    const typeRaw = 'type' in item && typeof item.type === 'string' ? item.type.trim().toLowerCase() : ''
    if (!isSketchType(typeRaw)) continue

    const x = finiteNumber('x' in item ? item.x : undefined, 0, MAX_COORD)
    const y = finiteNumber('y' in item ? item.y : undefined, 0, MAX_COORD)
    const width = finiteNumber('width' in item ? item.width : undefined, MIN_SIZE, MAX_SIZE)
    const height = finiteNumber('height' in item ? item.height : undefined, MIN_SIZE, MAX_SIZE)
    if (x === undefined || y === undefined || width === undefined || height === undefined) continue

    const label = cleanLabel('label' in item ? item.label : undefined)
    if (typeRaw !== 'arrow' && !label) continue

    cleaned.push({ type: typeRaw, x, y, width, height, ...(label ? { label } : {}) })
  }

  return cleaned.length > 0 ? cleaned : undefined
}
