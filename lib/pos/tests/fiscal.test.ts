import { describe, it, expect } from 'vitest'
import { validarRtn, formatearCorrelativo, estadoCai, DIAS_ALERTA_CAI } from '../fiscal'
import type { CaiAutorizacion } from '@/types'

const cai = (over: Partial<CaiAutorizacion> = {}): CaiAutorizacion => ({
  id: 'c1', cai: 'ABC123-XYZ', establecimiento: '000', punto_emision: '001',
  tipo_documento: '01', rango_desde: 1, rango_hasta: 1000, correlativo_actual: 0,
  fecha_limite: '2026-12-31', activo: true, created_at: '', updated_at: '', ...over,
})

describe('validarRtn', () => {
  it('acepta 14 dígitos', () => expect(validarRtn('08011999123456')).toBeNull())
  it('rechaza longitud incorrecta', () => expect(validarRtn('0801')).toMatch(/14 dígitos/))
  it('rechaza no numéricos', () => expect(validarRtn('0801A999123456')).toMatch(/solo números/))
})

describe('formatearCorrelativo', () => {
  it('arma los 16 dígitos con guiones', () =>
    expect(formatearCorrelativo(cai(), 123)).toBe('000-001-01-00000123'))
})

describe('estadoCai', () => {
  const hoy = new Date('2026-08-07T12:00:00')
  it('vigente sin alertas', () => {
    const e = estadoCai(cai({ correlativo_actual: 100 }), hoy)
    expect(e).toMatchObject({ vigente: true, restantes: 900, alerta: null })
  })
  it('alerta por vencer (<= 30 días)', () => {
    const e = estadoCai(cai({ fecha_limite: '2026-08-20' }), hoy)
    expect(e.vigente).toBe(true)
    expect(e.alerta).toMatch(/vence/i)
  })
  it('alerta por rango (<= 10% restante)', () => {
    const e = estadoCai(cai({ correlativo_actual: 950 }), hoy)
    expect(e.alerta).toMatch(/agot/i)
  })
  it('vencido por fecha o rango agotado => no vigente', () => {
    expect(estadoCai(cai({ fecha_limite: '2026-08-01' }), hoy).vigente).toBe(false)
    expect(estadoCai(cai({ correlativo_actual: 1000 }), hoy).vigente).toBe(false)
  })
})
