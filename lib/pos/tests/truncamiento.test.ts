import { describe, it, expect } from 'vitest'
import { hayTruncamiento } from '../truncamiento'

describe('hayTruncamiento', () => {
  it('detecta cuando faltan filas', () => {
    expect(hayTruncamiento(1000, 1342)).toBe(true)
  })

  it('no reporta truncamiento cuando llegaron todas', () => {
    expect(hayTruncamiento(137, 137)).toBe(false)
  })

  it('un turno vacio no es truncamiento', () => {
    expect(hayTruncamiento(0, 0)).toBe(false)
  })

  // Sin conteo no hay evidencia de que falten filas. Bloquear un cierre de
  // caja por una sospecha sin respaldo seria peor que el riesgo que se cubre:
  // el cajero se quedaria sin poder cerrar por un fallo del conteo, no por un
  // problema real con los datos.
  it('sin conteo NO reporta truncamiento', () => {
    expect(hayTruncamiento(0, null)).toBe(false)
    expect(hayTruncamiento(500, null)).toBe(false)
  })

  // Defensivo: si el conteo llegara por debajo de las filas recibidas (una
  // insercion concurrente entre la consulta y el conteo), no es truncamiento.
  it('mas filas que el conteo tampoco es truncamiento', () => {
    expect(hayTruncamiento(1001, 1000)).toBe(false)
  })
})
