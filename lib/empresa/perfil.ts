import type { ConfigMap } from '@/types'

// Perfil de empresa unificado: una función por atributo, con fallback a las
// claves retiradas (site_name, fiscal_telefono) para una transición segura
// aun antes de correr la migración. Ver spec R2a.

/** Nombre comercial (marca) para tienda y documentos. Vacío si no hay ninguno. */
export function nombreComercial(cfg: ConfigMap): string {
  return cfg.empresa_nombre_comercial?.trim() || cfg.site_name?.trim() || ''
}

/** Razón social legal (factura SAR); cae al nombre comercial si no está. */
export function razonSocial(cfg: ConfigMap): string {
  return cfg.fiscal_razon_social?.trim() || nombreComercial(cfg)
}

/** RTN del emisor. */
export function rtn(cfg: ConfigMap): string {
  return cfg.fiscal_rtn?.trim() || ''
}

/** Teléfono de la empresa (documentos y contacto). */
export function telefonoEmpresa(cfg: ConfigMap): string {
  return cfg.empresa_telefono?.trim() || cfg.fiscal_telefono?.trim() || cfg.whatsapp_principal?.trim() || ''
}

/** Correo que aparece en la factura; override opcional, cae al correo de contacto. */
export function correoFacturacion(cfg: ConfigMap): string {
  return cfg.empresa_email_facturacion?.trim() || cfg.email_contacto?.trim() || ''
}

/** Domicilio fiscal; override opcional, cae a la dirección comercial. */
export function domicilioFiscal(cfg: ConfigMap): string {
  return cfg.fiscal_domicilio?.trim() || cfg.direccion?.trim() || ''
}

/** URL del logo de empresa. */
export function logoEmpresa(cfg: ConfigMap): string {
  return cfg.logo_url?.trim() || ''
}
