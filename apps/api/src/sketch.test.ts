import { describe, expect, it } from 'vitest'
import { cleanExcalidrawElements } from './sketch.js'

describe('cleanExcalidrawElements', () => {
  it('keeps valid labeled rectangles', () => {
    expect(
      cleanExcalidrawElements([
        { type: 'rectangle', x: 40, y: 60, width: 120, height: 80, label: { text: 'Query Q' } },
        { type: 'rectangle', x: 200, y: 60, width: 120, height: 80, label: { text: 'Key K' } },
      ]),
    ).toEqual([
      { type: 'rectangle', x: 40, y: 60, width: 120, height: 80, label: { text: 'Query Q' } },
      { type: 'rectangle', x: 200, y: 60, width: 120, height: 80, label: { text: 'Key K' } },
    ])
  })

  it('drops invalid types, coords, and empty labels', () => {
    expect(
      cleanExcalidrawElements([
        { type: 'image', x: 0, y: 0, width: 100, height: 100, label: { text: 'nope' } },
        { type: 'rectangle', x: -1, y: 0, width: 100, height: 100, label: { text: 'bad x' } },
        { type: 'rectangle', x: 0, y: 0, width: 100, height: 100, label: { text: '' } },
        { type: 'arrow', x: 10, y: 10, width: 80, height: 20 },
      ]),
    ).toEqual([{ type: 'arrow', x: 10, y: 10, width: 80, height: 20 }])
  })

  it('returns undefined for empty or all-invalid input', () => {
    expect(cleanExcalidrawElements(undefined)).toBeUndefined()
    expect(cleanExcalidrawElements([])).toBeUndefined()
    expect(cleanExcalidrawElements([{ type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }])).toBeUndefined()
  })
})
