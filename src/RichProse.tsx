import { memo, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { preprocessLessonContent } from './preprocessContent'

type Props = {
  children: string
  className?: string
}

// Hoisted to module scope so their references stay stable across renders —
// passing fresh arrays/objects would make ReactMarkdown re-process needlessly.
const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [rehypeKatex]
const COMPONENTS: Components = {
  p: ({ children: nodes }) => <p className="rich-p">{nodes}</p>,
  strong: ({ children: nodes }) => <strong className="rich-strong">{nodes}</strong>,
  ol: ({ children: nodes }) => <ol className="rich-ol">{nodes}</ol>,
  ul: ({ children: nodes }) => <ul className="rich-ul">{nodes}</ul>,
  li: ({ children: nodes }) => <li className="rich-li">{nodes}</li>,
  code: ({ className: codeClass, children: nodes }) =>
    codeClass ? (
      <code className={codeClass}>{nodes}</code>
    ) : (
      <code className="rich-inline-code">{nodes}</code>
    ),
}

function RichProse({ children, className }: Props) {
  // The regex preprocessing chain is non-trivial; only re-run when text changes.
  const content = useMemo(() => preprocessLessonContent(children), [children])

  return (
    <div className={className ? `rich-prose ${className}` : 'rich-prose'}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default memo(RichProse)
