import { useEffect, useState } from 'react'
import './VisualSteps.css'

export type VisualStep = { label: string; narration: string }

type Props = {
  steps: VisualStep[]
  title: string
  staticForExport?: boolean
}

export default function VisualSteps({ steps, title, staticForExport }: Props) {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!playing || steps.length <= 1) return
    const id = window.setInterval(() => {
      setActive((index) => (index + 1) % steps.length)
    }, 4000)
    return () => window.clearInterval(id)
  }, [playing, steps.length])

  if (steps.length === 0) return null

  if (staticForExport) {
    return (
      <div className="visual-steps visual-steps-static" aria-label={`Walkthrough for ${title}`}>
        <p className="visual-steps-kicker">Walkthrough</p>
        <ol className="visual-steps-static-list">
          {steps.map((item, index) => (
            <li key={`${item.label}-${index}`} className="visual-steps-static-item">
              <h4 className="visual-steps-label">
                {index + 1}. {item.label}
              </h4>
              <p className="visual-steps-narration">{item.narration}</p>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  const step = steps[active]

  return (
    <div className="visual-steps" aria-label={`Animated explanation for ${title}`}>
      <div className="visual-steps-head">
        <p className="visual-steps-kicker">Walkthrough</p>
        <button type="button" className="visual-steps-toggle" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <div className="visual-steps-stage">
        <div className="visual-steps-progress">
          {steps.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              className={`visual-steps-dot${index === active ? ' active' : ''}${index < active ? ' done' : ''}`}
              aria-label={`Step ${index + 1}: ${item.label}`}
              onClick={() => {
                setActive(index)
                setPlaying(false)
              }}
            />
          ))}
        </div>
        <h4 className="visual-steps-label">{step.label}</h4>
        <p className="visual-steps-narration">{step.narration}</p>
      </div>
    </div>
  )
}
