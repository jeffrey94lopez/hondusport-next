'use client'
import { useState } from 'react'
import { ThemeContext, type Theme } from '@/lib/store/theme-context'

const STORAGE_KEY = 'hs_theme'

interface ThemeRootProps {
  accent?: string
  children: React.ReactNode
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'light'
}

export default function ThemeRoot({ accent, children }: ThemeRootProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  function toggle() {
    setTheme(prev => {
      const next: Theme = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div
        className="storeRoot"
        data-theme={theme}
        suppressHydrationWarning
        style={accent ? ({ '--primary': accent } as React.CSSProperties) : undefined}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
