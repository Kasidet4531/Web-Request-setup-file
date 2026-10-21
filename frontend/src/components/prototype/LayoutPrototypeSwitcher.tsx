// PROTOTYPE, throwaway: floating switcher for the single-column layout variants.
// See layout-prototype.css for the question and the variants. Dev builds only.
import { useEffect, useState } from 'react'
import './layout-prototype.css'

const variants = [
  { key: 'current', name: 'Current layout' },
  { key: 'a', name: 'Card fits form, centred' },
  { key: 'b', name: 'Rows fill the card' },
  { key: 'c', name: 'Form centred in wide card' },
  { key: 'd', name: 'A widened 25% each side' },
] as const

function initialIndex() {
  const index = variants.findIndex((variant) => variant.key === new URLSearchParams(window.location.search).get('variant'))
  return index === -1 ? 0 : index
}

export function LayoutPrototypeSwitcher() {
  const [index, setIndex] = useState(initialIndex)
  const variant = variants[index]

  useEffect(() => {
    // The variant stays in memory across in-app navigation; the URL carries it for reloads and sharing.
    if (variant.key === 'current') delete document.documentElement.dataset.layoutPrototype
    else document.documentElement.dataset.layoutPrototype = variant.key
    const url = new URL(window.location.href)
    url.searchParams.set('variant', variant.key)
    window.history.replaceState(window.history.state, '', url)
    console.info('[layout prototype]', variant.key, variant.name)
  }, [variant])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'ArrowRight') setIndex((value) => (value + 1) % variants.length)
      if (event.key === 'ArrowLeft') setIndex((value) => (value + variants.length - 1) % variants.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="layout-prototype-switcher" aria-label="Layout prototype switcher">
      <button type="button" aria-label="Previous variant" onClick={() => setIndex((value) => (value + variants.length - 1) % variants.length)}>←</button>
      <span>PROTOTYPE {variant.key.toUpperCase()}: {variant.name}</span>
      <button type="button" aria-label="Next variant" onClick={() => setIndex((value) => (value + 1) % variants.length)}>→</button>
    </div>
  )
}
