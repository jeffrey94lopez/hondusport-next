import type { XlsxRow, ProductoAgrupado } from '@/types'

function isActive(val: unknown): boolean {
  const s = String(val ?? '').toUpperCase().trim()
  return s === 'VERDADERO' || s === 'TRUE' || s === '1'
}

export function agruparProductos(rows: XlsxRow[]): ProductoAgrupado[] {
  const map = new Map<string, ProductoAgrupado>()

  for (const row of rows) {
    const nombre = String(row.nombre_producto ?? '').trim()
    if (!nombre) continue
    if (!isActive(row.is_active)) continue

    const precio = parseFloat(String(row.precio_venta ?? '0')) || 0
    const stock = parseInt(String(row.existencia ?? '0')) || 0
    const talla = String(row.tamano ?? '').trim()
    const color = String(row.color ?? '').trim()

    if (map.has(nombre)) {
      const p = map.get(nombre)!
      p.stock += stock
      if (talla && !p.tallas.includes(talla)) p.tallas.push(talla)
      if (color && !p.colores.includes(color)) p.colores.push(color)
    } else {
      map.set(nombre, {
        nombre,
        precio,
        stock,
        tallas: talla ? [talla] : [],
        colores: color ? [color] : [],
        marca: String(row.marca ?? '').trim(),
        sku: String(row.cbarras ?? '').trim(),
        categoria: String(row.nombre_categoria ?? '').trim(),
        activo: true,
        descripcion: String(row.descripcion_producto ?? '').trim(),
      })
    }
  }

  return Array.from(map.values())
}
