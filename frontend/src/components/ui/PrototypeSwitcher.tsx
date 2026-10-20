// PROTOTYPE: floating bar for flipping between UI variants of one page.
// Throwaway; it renders nothing in production builds.
import { useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PrototypeVariant {
  key: string
  name: string
}

export interface PrototypeSwitcherProps {
  children?: ReactNode
  current: string
  lifted?: boolean
  onChange: (key: string) => void
  variants: readonly PrototypeVariant[]
}

export function PrototypeSwitcher({ children, current, lifted = false, onChange, variants }: PrototypeSwitcherProps) {
  const index = Math.max(0, variants.findIndex((variant) => variant.key === current))
  const variant = variants[index]

  function step(delta: number) {
    onChange(variants[(index + delta + variants.length) % variants.length].key)
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (!import.meta.env.DEV) return null

  return (
    <div aria-label="Prototype variant switcher" className={`prototype-switcher${lifted ? ' prototype-switcher--lifted' : ''}`} role="toolbar">
      <button aria-label="Previous variant" className="prototype-switcher__arrow" onClick={() => step(-1)} type="button"><ChevronLeft size={16} /></button>
      <span aria-live="polite" className="prototype-switcher__label"><strong>{variant.key}</strong> {variant.name}</span>
      <button aria-label="Next variant" className="prototype-switcher__arrow" onClick={() => step(1)} type="button"><ChevronRight size={16} /></button>
      {children}
    </div>
  )
}
