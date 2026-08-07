import type { CaiAutorizacion } from '@/types'

export const DIAS_ALERTA_CAI = 30
export const PORCENTAJE_ALERTA_RANGO = 0.10

export function validarRtn(rtn: string): string | null {
  const limpio = rtn.trim()
  if (!/^[0-9]+$/.test(limpio)) return 'El RTN debe contener solo números'
  if (limpio.length !== 14) return 'El RTN debe tener 14 dígitos'
  return null
}

export function formatearCorrelativo(
  cai: Pick<CaiAutorizacion, 'establecimiento' | 'punto_emision' | 'tipo_documento'>,
  numero: number,
): string {
  return `${cai.establecimiento}-${cai.punto_emision}-${cai.tipo_documento}-${String(numero).padStart(8, '0')}`
}

export interface EstadoCai {
  vigente: boolean
  diasParaVencer: number
  restantes: number
  alerta: string | null
}

export function estadoCai(cai: CaiAutorizacion, hoy: Date): EstadoCai {
  const limite = new Date(cai.fecha_limite + 'T23:59:59')
  const diasParaVencer = Math.floor((limite.getTime() - hoy.getTime()) / 86_400_000)
  const restantes = cai.rango_hasta - cai.correlativo_actual
  const total = cai.rango_hasta - cai.rango_desde + 1
  const vigente = diasParaVencer >= 0 && restantes > 0 && cai.activo
  let alerta: string | null = null
  if (!vigente) alerta = restantes <= 0 ? 'Rango agotado' : 'CAI vencido'
  else if (diasParaVencer <= DIAS_ALERTA_CAI) alerta = `El CAI vence en ${diasParaVencer} días`
  else if (restantes <= total * PORCENTAJE_ALERTA_RANGO) alerta = `El rango se está agotando: quedan ${restantes} números`
  return { vigente, diasParaVencer, restantes, alerta }
}
