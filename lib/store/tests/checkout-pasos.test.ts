import { describe, it, expect } from 'vitest'
import { pasosActivos } from '../checkout-pasos'

describe('pasosActivos', () => {
  it('incluye "direccion" cuando el envío es delivery', () => {
    expect(pasosActivos('delivery')).toEqual(['contacto', 'envio', 'direccion', 'confirmar'])
  })

  it('omite "direccion" cuando el envío es pickup', () => {
    expect(pasosActivos('pickup')).toEqual(['contacto', 'envio', 'confirmar'])
  })

  it('omite "direccion" cuando aún no hay envío seleccionado (undefined)', () => {
    expect(pasosActivos(undefined)).toEqual(['contacto', 'envio', 'confirmar'])
  })

  it('mantiene el orden contacto -> envio -> (direccion) -> confirmar', () => {
    const pasos = pasosActivos('delivery')
    expect(pasos.indexOf('contacto')).toBe(0)
    expect(pasos.indexOf('envio')).toBe(1)
    expect(pasos.indexOf('direccion')).toBe(2)
    expect(pasos.indexOf('confirmar')).toBe(3)
  })
})
