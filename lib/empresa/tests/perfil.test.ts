import { describe, it, expect } from 'vitest'
import {
  nombreComercial,
  razonSocial,
  rtn,
  telefonoEmpresa,
  correoFacturacion,
  domicilioFiscal,
  logoEmpresa,
} from '../perfil'

describe('nombreComercial', () => {
  it('usa empresa_nombre_comercial', () => {
    expect(nombreComercial({ empresa_nombre_comercial: 'Hondusport' })).toBe('Hondusport')
  })
  it('cae a site_name durante la transición', () => {
    expect(nombreComercial({ site_name: 'Vieja Marca' })).toBe('Vieja Marca')
  })
  it('vacío si no hay ninguno', () => {
    expect(nombreComercial({})).toBe('')
  })
})

describe('razonSocial', () => {
  it('usa fiscal_razon_social', () => {
    expect(razonSocial({ fiscal_razon_social: 'Hondusport S.A.' })).toBe('Hondusport S.A.')
  })
  it('cae al nombre comercial si no hay razón social', () => {
    expect(razonSocial({ empresa_nombre_comercial: 'Hondusport' })).toBe('Hondusport')
  })
})

describe('rtn', () => {
  it('devuelve el RTN', () => {
    expect(rtn({ fiscal_rtn: '08011990123456' })).toBe('08011990123456')
  })
  it('vacío si no hay', () => {
    expect(rtn({})).toBe('')
  })
})

describe('telefonoEmpresa', () => {
  it('usa empresa_telefono', () => {
    expect(telefonoEmpresa({ empresa_telefono: '2232-0000' })).toBe('2232-0000')
  })
  it('cae a fiscal_telefono y luego a whatsapp_principal', () => {
    expect(telefonoEmpresa({ fiscal_telefono: '2232-1111' })).toBe('2232-1111')
    expect(telefonoEmpresa({ whatsapp_principal: '50499999999' })).toBe('50499999999')
  })
})

describe('correoFacturacion', () => {
  it('usa el override empresa_email_facturacion', () => {
    expect(correoFacturacion({ empresa_email_facturacion: 'fac@x.com', email_contacto: 'c@x.com' })).toBe('fac@x.com')
  })
  it('cae a email_contacto si no hay override', () => {
    expect(correoFacturacion({ email_contacto: 'c@x.com' })).toBe('c@x.com')
  })
})

describe('domicilioFiscal', () => {
  it('usa el override fiscal_domicilio', () => {
    expect(domicilioFiscal({ fiscal_domicilio: 'Col. Fiscal', direccion: 'Col. Comercial' })).toBe('Col. Fiscal')
  })
  it('cae a la dirección comercial si no hay override', () => {
    expect(domicilioFiscal({ direccion: 'Col. Comercial' })).toBe('Col. Comercial')
  })
})

describe('logoEmpresa', () => {
  it('devuelve logo_url', () => {
    expect(logoEmpresa({ logo_url: 'http://x/logo.png' })).toBe('http://x/logo.png')
  })
})
