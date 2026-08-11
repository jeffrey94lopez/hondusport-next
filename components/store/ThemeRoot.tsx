'use client'
import { ThemeContext, type Theme } from '@/lib/store/theme-context'

interface ThemeRootProps {
  accent?: string
  children: React.ReactNode
}

// R1: la tienda queda fija en tema claro (el toggle está oculto). Se mantiene
// la infraestructura de tema (ThemeContext, data-theme) para poder revertir
// esto sin tocar el resto del árbol.
const theme: Theme = 'light'

export default function ThemeRoot({ accent, children }: ThemeRootProps) {
  function toggle() {
    // No-op: tema fijado en claro para R1 (toggle oculto en la UI).
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
