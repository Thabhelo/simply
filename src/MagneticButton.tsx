import {
  useState,
  useEffect,
  type ReactNode,
  type CSSProperties,
  type MouseEvent,
} from 'react'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  circleColor?: string
  circleSize?: number
  onClick?: () => void
  href?: string
  type?: 'button' | 'submit'
}

export default function MagneticButton({
  children,
  className,
  style,
  circleColor = 'rgba(0,0,0,0.08)',
  onClick,
  href,
  type = 'button',
}: Props) {
  const [circle, setCircle] = useState<{
    x: number
    y: number
    id: number
    size: number
  } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (circle && !leaving) {
      const r = requestAnimationFrame(() => setExpanded(true))
      return () => cancelAnimationFrame(r)
    }
  }, [circle, leaving])

  const handleEnter = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setLeaving(false)
    setExpanded(false)
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const dx = Math.max(x, rect.width - x)
    const dy = Math.max(y, rect.height - y)
    const size = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 2)
    setCircle({ x, y, id: Date.now(), size })
  }

  const handleLeave = () => {
    setLeaving(true)
  }

  const size = expanded && circle ? circle.size : 0
  const sharedProps = {
    onMouseEnter: handleEnter,
    onMouseLeave: handleLeave,
    className,
    style: { position: 'relative' as const, overflow: 'hidden' as const, ...style },
    children: (
      <>
        {circle ? (
          <span
            style={{
              position: 'absolute',
              left: circle.x,
              top: circle.y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: circleColor,
              transform: 'translate(-50%, -50%)',
              transition: 'width 0.35s ease-in, height 0.35s ease-in, opacity 0.4s ease',
              opacity: leaving ? 0 : 1,
              pointerEvents: 'none',
            }}
            onTransitionEnd={(e) => {
              if (leaving && e.propertyName === 'opacity') {
                setCircle(null)
                setExpanded(false)
              }
            }}
          />
        ) : null}
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: '100%',
            justifyContent: 'center',
          }}
        >
          {children}
        </span>
      </>
    ),
  }

  if (href) {
    return (
      <a href={href} onClick={onClick} {...sharedProps}>
        {sharedProps.children}
      </a>
    )
  }

  return (
    <button type={type} onClick={onClick} {...sharedProps}>
      {sharedProps.children}
    </button>
  )
}
