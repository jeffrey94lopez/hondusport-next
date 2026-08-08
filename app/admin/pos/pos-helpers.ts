// Puras de presentación compartidas entre PosClient y sus paneles
// (CatalogoPanel/CarritoPanel): viven aquí (y no en cada componente) porque
// tanto el orquestador (mutadores de `lineas`) como los paneles (render)
// las necesitan, y no son reglas de negocio del checkout (esas están en
// lib/pos/*, ver Task 1).
import { precioLineaPos } from '@/lib/pos/emision'
import { toStoreVariantes, stockEfectivo } from '@/lib/store/variantes'
import type { LineaVenta } from '@/lib/pos/carrito'
import type { Producto, ProductoVariante } from '@/types'

export const round2 = (n: number) => Math.round(n * 100) / 100

// Puras de los inputs de dinero en texto plano (nunca `type="number"`, ver
// spec de UX de mostrador): el estado de cada campo es el STRING crudo que
// tecleó el cajero — `parseMoneyInput` solo se usa al derivar el número para
// calcular/validar, nunca para reescribir lo que el usuario está tecleando
// (evita que un input controlado le "corrija" el texto a medio escribir,
// p.ej. al borrar el punto decimal). `valorMostrado` es el criterio inverso:
// cómo se pinta un monto que NO se está editando en este momento (al montar,
// al perder foco, o cuando lo asigna el sistema vía chip) — 0 siempre se
// pinta vacío (con el placeholder "0.00" del input) para que el cajero nunca
// tenga que borrar un cero forzado antes de teclear.
export function parseMoneyInput(texto: string): number {
  return Number(texto.replace(',', '.')) || 0
}

export function valorMostrado(n: number): string {
  return n === 0 ? '' : String(n)
}

export function variantesActivasDe(producto: Producto): ProductoVariante[] {
  return (producto.producto_variantes ?? []).filter(v => v.activo).sort((a, b) => a.orden - b.orden)
}

// Precio(s) del producto para el card del catálogo, respetando tipo de
// cliente (revendedor puede tener precio propio por variante).
export function preciosCatalogo(producto: Producto, tipoCliente: 'final' | 'revendedor'): number[] {
  const activas = variantesActivasDe(producto)
  if (activas.length === 0) return [precioLineaPos(tipoCliente, producto, null)]
  return activas.map(v => precioLineaPos(tipoCliente, producto, v))
}

// Tope de cantidad para una línea de inventario: null = ilimitado (mismo
// criterio que el carrito de la tienda, ver lib/store/cart.ts).
export function topeStock(linea: LineaVenta, productosPorId: Map<string, Producto>): number | null {
  if (!linea.producto_id) return null
  const producto = productosPorId.get(linea.producto_id)
  if (!producto) return null
  const variantes = toStoreVariantes(producto.precio, producto.producto_variantes ?? [])
  if (linea.variante_id) return variantes.find(v => v.id === linea.variante_id)?.stock ?? null
  return stockEfectivo(producto.stock, variantes)
}
