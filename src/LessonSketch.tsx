import { useEffect, useMemo, useState } from 'react'
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw'
import '@excalidraw/excalidraw/index.css'
import './LessonSketch.css'

export type SketchElementType = 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'arrow'

export type ExcalidrawElementSkeleton = {
  type: SketchElementType
  x: number
  y: number
  width: number
  height: number
  label?: { text: string }
}

type Props = {
  mermaid?: string
  elements?: ExcalidrawElementSkeleton[]
}

export default function LessonSketch({ mermaid, elements }: Props) {
  const inputKey = useMemo(
    () => `${mermaid ?? ''}|${JSON.stringify(elements ?? [])}`,
    [mermaid, elements],
  )
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [sketchElements, setSketchElements] = useState<ReturnType<typeof convertToExcalidrawElements> | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        let skeletons: ExcalidrawElementSkeleton[] | undefined = elements?.length ? elements : undefined

        if (!skeletons && mermaid?.trim()) {
          const parsed = await parseMermaidToExcalidraw(mermaid.trim(), {
            themeVariables: { fontSize: '16px' },
          })
          skeletons = parsed.elements as ExcalidrawElementSkeleton[]
        }

        if (!skeletons?.length || cancelled) return

        const converted = convertToExcalidrawElements(
          skeletons as Parameters<typeof convertToExcalidrawElements>[0],
          { regenerateIds: true },
        )
        if (!converted.length || cancelled) return

        setSketchElements(converted)
        setLoadedKey(inputKey)
      } catch {
        if (!cancelled) {
          setSketchElements(null)
          setLoadedKey(inputKey)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mermaid, elements, inputKey])

  if (!sketchElements?.length || loadedKey !== inputKey) return null

  return (
    <div className="guide-sketch" aria-label="Lesson sketch">
      <Excalidraw
        initialData={{
          elements: sketchElements,
          appState: {
            viewBackgroundColor: '#fffaf5',
            currentItemStrokeColor: '#3d2e24',
            currentItemBackgroundColor: '#e8f0f6',
          },
        }}
        viewModeEnabled
        zenModeEnabled
        gridModeEnabled={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveAsImage: false,
            toggleTheme: false,
          },
          tools: { image: false },
        }}
      />
    </div>
  )
}
