import { estaAgotado } from './variantes'
import { getDiscountPercent } from './format'
import type { StoreProducto } from '@/types/store'

/** Cuantos dias cuenta un producto como "nuevo" para la banda 3. */
export const DIAS_NUEVO = 30

/**
 * producto_id -> posicion comercial (1 = mas vendido), de la vista
 * `producto_ventas_rank`. Un producto AUSENTE del mapa no tuvo ventas netas
 * positivas en la ventana; no es lo mismo que tener posicion alta.
 */
export type VentasRank = Record<string, number>

const MS_POR_DIA = 86_400_000

function esNuevo(p: StoreProducto, ahora: Date): boolean {
  const dias = (ahora.getTime() - new Date(p.createdAt).getTime()) / MS_POR_DIA
  return dias < DIAS_NUEVO
}

function descuento(p: StoreProducto): number {
  return getDiscountPercent(p.precio, p.precioOriginal) ?? 0
}

/**
 * Banda comercial del producto. Un producto cae en la PRIMERA que lo acepta,
 * asi que el orden de estas comprobaciones ES la prioridad de negocio:
 * la curacion manual pesa mas que las ventas, y las ventas mas que la novedad.
 */
function banda(p: StoreProducto, ventas: VentasRank, ahora: Date): number {
  if (estaAgotado(p.stock, p.variantes)) return 6
  if (p.badge) return 1
  if (ventas[p.id] != null) return 2
  if (esNuevo(p, ahora)) return 3
  if (descuento(p) > 0) return 4
  return 5
}

function compararEnBanda(
  a: StoreProducto,
  b: StoreProducto,
  numeroBanda: number,
  ventas: VentasRank,
): number {
  if (numeroBanda === 1 || numeroBanda === 2 || numeroBanda === 6) {
    // Sin posicion va al final de su banda, no al principio.
    const pa = ventas[a.id] ?? Number.POSITIVE_INFINITY
    const pb = ventas[b.id] ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
  } else if (numeroBanda === 3) {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    if (ta !== tb) return tb - ta
  } else if (numeroBanda === 4) {
    const da = descuento(a)
    const db = descuento(b)
    if (da !== db) return db - da
  }
  // Desempate final SIEMPRE por nombre y, si tambien empata, por id: nombre
  // no es unico en el esquema (solo slug lo es), asi que sin el id como
  // ultimo criterio el orden no seria una funcion total.
  //
  // El nombre se compara con locale explicito ('es') porque es texto que lee una
  // persona: sin locale, localeCompare usa el del runtime, que difiere entre el
  // servidor (Node) y el navegador en la hidratacion.
  //
  // El id NO: es un identificador opaco, no texto, asi que se compara byte a
  // byte. Una colacion sensible al locale sobre un uuid es la herramienta
  // equivocada y reintroduciria por la puerta de atras la dependencia del
  // runtime que el locale explicito de arriba viene a cerrar.
  const porNombre = a.nombre.localeCompare(b.nombre, 'es')
  if (porNombre !== 0) return porNombre
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Ordena la vitrina por bandas comerciales. No muta la entrada.
 *
 * `ahora` es inyectable para que los tests no dependan del reloj.
 */
export function ordenarVitrina(
  productos: StoreProducto[],
  ventas: VentasRank,
  ahora: Date = new Date(),
): StoreProducto[] {
  return productos
    .map(p => ({ p, b: banda(p, ventas, ahora) }))
    .sort((x, y) => (x.b !== y.b ? x.b - y.b : compararEnBanda(x.p, y.p, x.b, ventas)))
    .map(x => x.p)
}
