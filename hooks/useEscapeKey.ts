'use client'
import { useEffect } from 'react'

export function useEscapeKey(isActive: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!isActive) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onEscape])
}
