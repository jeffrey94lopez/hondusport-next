export type ClaseReferencia =
  | 'documento' | 'nota_credito' | 'pedido' | 'compra' | 'conteo'
  | 'alta' | 'manual' | 'modalidad' | 'otra'

export type DireccionMov = 'entrada' | 'salida' | 'neutro'

// Parsea la referencia cruda del kardex a { clase, valor }. Los prefijos con ':'
// llevan un uuid/numero; 'alta'/'manual'/'modalidad' son etiquetas; cualquier
// otra cadena sin prefijo conocido se trata como candidato a número de compra
// (el server la resuelve contra compras.numero; si no matchea, se muestra cruda).
export function parseReferencia(ref: string | null): { clase: ClaseReferencia; valor: string | null } {
  if (!ref) return { clase: 'otra', valor: null }
  const idx = ref.indexOf(':')
  if (idx >= 0) {
    const prefijo = ref.slice(0, idx)
    const valor = ref.slice(idx + 1) || null
    if (prefijo === 'documento') return { clase: 'documento', valor }
    if (prefijo === 'nota_credito') return { clase: 'nota_credito', valor }
    if (prefijo === 'pedido') return { clase: 'pedido', valor }
    if (prefijo === 'conteo') return { clase: 'conteo', valor }
    return { clase: 'otra', valor: ref }
  }
  if (ref === 'alta') return { clase: 'alta', valor: null }
  if (ref === 'manual') return { clase: 'manual', valor: null }
  if (ref === 'modalidad') return { clase: 'modalidad', valor: null }
  return { clase: 'compra', valor: ref }
}

export function etiquetaTipoMovimiento(tipo: string): { nombre: string; direccion: DireccionMov } {
  switch (tipo) {
    case 'entrada': return { nombre: 'Entrada', direccion: 'entrada' }
    case 'inicial': return { nombre: 'Alta inicial', direccion: 'entrada' }
    case 'compra': return { nombre: 'Compra', direccion: 'entrada' }
    case 'devolucion': return { nombre: 'Devolución', direccion: 'entrada' }
    case 'reposicion_cancelacion': return { nombre: 'Reposición (cancelación)', direccion: 'entrada' }
    case 'venta_pos': return { nombre: 'Venta mostrador', direccion: 'salida' }
    case 'venta_web': return { nombre: 'Venta web', direccion: 'salida' }
    case 'ajuste': return { nombre: 'Ajuste', direccion: 'neutro' }
    case 'conteo': return { nombre: 'Conteo físico', direccion: 'neutro' }
    default: return { nombre: tipo, direccion: 'neutro' }
  }
}

export function saldoCorrido<T extends { cantidad: number }>(movimientosAsc: T[]): (T & { saldo: number })[] {
  let acc = 0
  return movimientosAsc.map(m => {
    acc += m.cantidad
    return { ...m, saldo: acc }
  })
}
