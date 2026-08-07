import type { LineaPos, LineaDesglosada, TotalesDocumento } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export type ColumnaFiscal = 'exento' | 'exonerado' | 'g15' | 'g18'
export type LineaConColumna = LineaDesglosada & { columna: ColumnaFiscal }

/**
 * Desglosar una línea de venta: calcular base, ISV y columna fiscal.
 * - Si exonerado (cliente) y no exento (producto): base = bruto/(1+tasa), importe = base, isv_monto = 0
 * - Si exento (producto): base = importe = bruto, isv_monto = 0
 * - Si gravado normal: base = bruto/(1+tasa), isv_monto = bruto - base, importe = bruto
 */
export function desglosarLinea(linea: LineaPos, exonerado: boolean): LineaConColumna {
  // Calcular bruto (cantidad * precio - descuento)
  const bruto = round2(linea.cantidad * linea.precio_unitario - linea.descuento)

  // Determinar tasa ISV
  const isv_tasa = linea.isv === '15' ? 0.15 : linea.isv === '18' ? 0.18 : 0

  let base: number
  let isv_monto: number
  let importe: number
  let columna: ColumnaFiscal

  if (linea.isv === 'exento') {
    // Producto exento
    base = importe = bruto
    isv_monto = 0
    columna = 'exento'
  } else if (exonerado) {
    // Cliente exonerado, producto gravado
    base = round2(bruto / (1 + isv_tasa))
    importe = base
    isv_monto = 0
    columna = 'exonerado'
  } else {
    // Producto gravado normal
    base = round2(bruto / (1 + isv_tasa))
    isv_monto = round2(bruto - base)
    importe = bruto
    columna = linea.isv === '15' ? 'g15' : 'g18'
  }

  return {
    ...linea,
    importe,
    base,
    isv_monto,
    columna,
  }
}

/**
 * Prorratear descuento global proporcional al bruto de cada línea.
 * Asignar el residuo de redondeo a la línea de mayor bruto (empate: la primera).
 */
export function prorratearDescuentoGlobal(lineas: LineaPos[], descuentoGlobal: number): LineaPos[] {
  // Calcular bruto de cada línea (antes de descuentos globales)
  const brutos = lineas.map(l => l.cantidad * l.precio_unitario - l.descuento)
  const totalBruto = brutos.reduce((s, b) => s + b, 0)

  if (totalBruto === 0) {
    // Sin bruto, no hay prorrateo
    return lineas
  }

  // Asignar descuento proporcional a cada línea
  const partes = brutos.map(b => round2((b / totalBruto) * descuentoGlobal))
  const sumaPartes = round2(partes.reduce((s, p) => s + p, 0))
  const residuo = round2(descuentoGlobal - sumaPartes)

  // Encontrar índice de mayor bruto (empate: primer)
  let maxIdx = 0
  for (let i = 1; i < brutos.length; i++) {
    if (brutos[i] > brutos[maxIdx]) {
      maxIdx = i
    }
  }

  // Retornar líneas con descuentos actualizados
  return lineas.map((l, i) => ({
    ...l,
    descuento: l.descuento + partes[i] + (i === maxIdx ? residuo : 0),
  }))
}

/**
 * Calcular totales del documento agrupando por columna fiscal.
 */
export function totalesDocumento(
  lineas: LineaConColumna[],
  descuentoGlobal: number,
  totalLetras: string,
): TotalesDocumento {
  let total_exento = 0
  let total_exonerado = 0
  let total_gravado15 = 0
  let total_gravado18 = 0
  let isv15 = 0
  let isv18 = 0

  for (const linea of lineas) {
    if (linea.columna === 'exento') {
      total_exento += linea.importe
    } else if (linea.columna === 'exonerado') {
      total_exonerado += linea.importe
    } else if (linea.columna === 'g15') {
      total_gravado15 += linea.base
      isv15 += linea.isv_monto
    } else if (linea.columna === 'g18') {
      total_gravado18 += linea.base
      isv18 += linea.isv_monto
    }
  }

  const total =
    total_exento +
    total_exonerado +
    total_gravado15 +
    total_gravado18 +
    isv15 +
    isv18

  // Las líneas ya llevan el descuento global prorrateado, no sumar descuentoGlobal
  const descuento_total = round2(lineas.reduce((s, l) => s + l.descuento, 0))

  return {
    total_exento,
    total_exonerado,
    total_gravado15,
    total_gravado18,
    isv15,
    isv18,
    descuento_total,
    total,
    total_letras: totalLetras,
  }
}
