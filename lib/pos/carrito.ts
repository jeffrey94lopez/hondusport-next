import type { LineaPos, DescuentoPresetTipo } from '@/types'

export type DescuentoModo = 'monto' | 'porcentaje'

// Línea de venta de la UI: extiende LineaPos con campos que NUNCA viajan al
// server. `precioManual` marca que el precio de esta línea fue editado a
// mano (o es un ítem libre): al cambiar de cliente (final/revendedor) esas
// líneas NO se recalculan, solo las de inventario sin override. `key` es el
// id estable de React (no existe en LineaPos). `descuentoModo` solo decide
// cómo se muestra/edita el descuento (monto L. o %); el valor persistido
// (`descuento`) siempre es un monto en Lempiras, igual que en LineaPos.
export interface LineaVenta extends LineaPos {
  key: string
  precioManual: boolean
  descuentoModo: DescuentoModo
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function brutoLinea(l: Pick<LineaVenta, 'cantidad' | 'precio_unitario'>): number {
  return round2(l.cantidad * l.precio_unitario)
}

// Nunca deja que el descuento de una línea supere su propio bruto (cantidad
// × precio_unitario) — evita que emitirVenta (que NO relee precio/descuento,
// el override es intencional) reciba un total negativo en un documento
// fiscal cuando cantidad o precio bajan después de haber puesto un descuento.
export function clampDescuentoLinea(l: LineaVenta): LineaVenta {
  const bruto = brutoLinea(l)
  return { ...l, descuento: Math.min(Math.max(l.descuento, 0), bruto) }
}

// Bruto disponible para el descuento global: suma de cada línea ya neta de
// su propio descuento (mismo criterio que usa `prorratearDescuentoGlobal`
// para repartirlo). El descuento global nunca puede superar esto.
export function brutoTotalLineas(ls: LineaVenta[]): number {
  return round2(ls.reduce((s, l) => s + (brutoLinea(l) - l.descuento), 0))
}

export function clampDescuentoGlobal(next: LineaVenta[], descuentoGlobal: number): number {
  return Math.min(Math.max(descuentoGlobal, 0), brutoTotalLineas(next))
}

export function descuentoDesdePorcentaje(l: LineaVenta, pct: number): number {
  const p = Math.min(Math.max(pct, 0), 100)
  return round2(brutoLinea(l) * (p / 100))
}

/**
 * Convierte un preset de descuento (porcentaje o monto) a un monto en L.,
 * recortado a [0, bruto]. Reusado por los chips global y por línea del POS.
 */
export function presetToDescuento(preset: { tipo: DescuentoPresetTipo; valor: number }, bruto: number): number {
  const raw = preset.tipo === 'porcentaje' ? (bruto * preset.valor) / 100 : preset.valor
  return round2(Math.min(Math.max(raw, 0), bruto))
}

// Tope de cantidad de una línea: el stock disponible, salvo que la línea ya
// tenga más (carrito viejo o stock que bajó) — nunca se le baja al cajero una
// cantidad ya capturada; el servidor revalida al emitir.
export function topeCantidad(stockDisponible: number | null, cantidadActual: number): number {
  if (stockDisponible == null) return Infinity
  return Math.max(stockDisponible, cantidadActual)
}

// Denominaciones de billete/moneda en circulación que ofrece el chip de
// sugerencia de efectivo (L.) del modal de cobro — "el cliente paga con un
// billete de 500 y el cambio sale solo". Se muestran las 3 primeras
// MAYORES al monto pendiente (nunca una igual o menor, que no ahorraría el
// vuelto ni cubriría el pago).
const DENOMINACIONES_LPS = [20, 50, 100, 200, 500, 1000]

export function sugerenciasEfectivo(pendiente: number): number[] {
  return DENOMINACIONES_LPS.filter(d => d > pendiente).slice(0, 3)
}

// ---- Pestañas de ventas en curso ----
// Una venta abierta en el POS, ya sea que viva solo en memoria (recién creada
// con "+", nunca se le agregó nada) o que además tenga una fila espejo en
// `ventas_espera` (`esperaId`). `id` es un identificador de React/UI, ajeno
// a la BD — no confundir con `esperaId` (ver PosClient, que genera ambos con
// contadores separados).
export interface PestanaVenta {
  id: string
  esperaId: string | null
  nombre: string
  lineas: LineaVenta[]
  descuentoGlobal: number
  clienteId: string | null
  vendedorId: string | null
}

export function pestanaVacia(p: Pick<PestanaVenta, 'lineas'>): boolean {
  return p.lineas.length === 0
}

// Nombre por defecto de una pestaña nueva: "Venta N" con el primer N libre
// entre los nombres ya usados (no necesariamente todos con ese patrón — una
// pestaña renombrada a mano, p.ej. "señora del vestido azul", simplemente no
// participa del conteo). No reutiliza huecos dejados por pestañas cerradas
// más allá de tomar el primer entero libre, para no repetir un nombre que
// pueda seguir siendo reconocible por el cajero como "esa otra venta".
export function siguienteNombrePestana(nombresExistentes: string[]): string {
  const usados = new Set(
    nombresExistentes
      .map(n => /^Venta (\d+)$/.exec(n.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(m => Number(m[1])),
  )
  let n = 1
  while (usados.has(n)) n++
  return `Venta ${n}`
}

// Qué hacer con la fila de `ventas_espera` de una pestaña en el momento en
// que deja de estar activa (se cambia de pestaña, se cierra, o se emite la
// venta): nunca se persiste una pestaña vacía (evita filas basura), y una
// pestaña con líneas siempre queda reflejada en BD — se crea si es la
// primera vez, se actualiza si ya tenía fila. `esperaId` es la única señal
// de si ya existe fila: no depende de si hubo cambios desde el último guardado
// (actualizar sobre datos iguales es barato e idempotente).
export type AccionPersistenciaPestana =
  | { tipo: 'ninguna' }
  | { tipo: 'eliminar'; esperaId: string }
  | { tipo: 'crear' }
  | { tipo: 'actualizar'; esperaId: string }

export function accionPersistencia(p: Pick<PestanaVenta, 'esperaId' | 'lineas'>): AccionPersistenciaPestana {
  const vacia = pestanaVacia(p)
  if (vacia) return p.esperaId ? { tipo: 'eliminar', esperaId: p.esperaId } : { tipo: 'ninguna' }
  return p.esperaId ? { tipo: 'actualizar', esperaId: p.esperaId } : { tipo: 'crear' }
}
