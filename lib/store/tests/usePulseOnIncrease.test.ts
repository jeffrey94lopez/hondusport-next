import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePulseOnIncrease } from '../usePulseOnIncrease'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('usePulseOnIncrease', () => {
  it('no pulsa en el montaje', () => {
    // Con carrito ya cargado desde localStorage el badge no debe latir solo.
    const { result } = renderHook(() => usePulseOnIncrease(3))
    expect(result.current).toBe(false)
  })

  it('pulsa cuando el valor sube', () => {
    const { result, rerender } = renderHook(({ v }) => usePulseOnIncrease(v), {
      initialProps: { v: 0 },
    })
    rerender({ v: 1 })
    expect(result.current).toBe(true)
  })

  it('NO pulsa cuando el valor baja', () => {
    // Quitar del carrito no es un evento que festejar.
    const { result, rerender } = renderHook(({ v }) => usePulseOnIncrease(v), {
      initialProps: { v: 2 },
    })
    rerender({ v: 1 })
    expect(result.current).toBe(false)
  })

  it('deja de pulsar al cumplirse la duración', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => usePulseOnIncrease(v, 600), {
      initialProps: { v: 0 },
    })
    rerender({ v: 1 })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(false)
  })

  it('una subida durante el pulso reinicia la duración en vez de cortarla', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => usePulseOnIncrease(v, 600), {
      initialProps: { v: 0 },
    })
    rerender({ v: 1 })

    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender({ v: 2 })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    // A los 800ms del primer clic seguiría pulsando por el segundo.
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe(false)
  })
})
