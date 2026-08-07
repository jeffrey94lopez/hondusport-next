import type { Producto, ProductoVariante } from '@/types'
import { slugify, uniqueSlug } from './slug'
import { calcularCambioStock } from './costeo'

export const COLUMNAS = [
  'id', 'sku', 'nombre', 'marca', 'precio', 'precio_original', 'precio_revendedor',
  'stock', 'stock_minimo', 'costo_entrada', 'descripcion', 'categoria', 'subcategoria',
  'genero', 'canal', 'isv', 'badge', 'tallas', 'colores', 'personalizable', 'activo',
] as const

export const VARIANTES_COLUMNAS = [
  'producto_id', 'producto', 'variante_id', 'variante', 'sku', 'precio', 'stock',
  'costo', 'precio_revendedor', 'costo_entrada', 'activo',
] as const

export const CANALES = ['tienda', 'mostrador', 'ambas'] as const
export const ISV_VALORES = ['15', '18', 'exento'] as const

const REFERENCIA_IMPORT = 'import excel'

export const NOTA_VENDE_POR_VARIANTES = 'vende por variantes'

export const INSTRUCCIONES: string[] = [
  'Hondusport — Plantilla de inventario',
  '',
  'Pestaña "Actualizar": productos existentes. Edita las celdas y vuelve a subir el archivo.',
  'Pestaña "Nuevos": escribe aquí las filas de productos a crear (no pongas id).',
  '',
  'Reglas:',
  '- NO modifiques la columna "id": es la llave del producto.',
  '- Obligatorios: nombre y precio (precio mayor a 0). No pueden ir vacíos.',
  '- Celda vacía en un campo opcional = ese valor no se cambia.',
  '- stock: vacío = no cambia; 0 = agotado; un número = existencias. Ilimitado se fija en el panel.',
  '- precio_original: vacío = no cambia. Para quitar una oferta usa el panel.',
  '- Para quitar todas las tallas o colores usa el panel: dejar la celda vacía significa "no cambia".',
  '- Para desactivar: activo = FALSO. Borrar una fila NO elimina el producto.',
  '- tallas y colores: separados por coma. Ejemplo: "S, M, L".',
  '- categoria y subcategoria: por nombre exacto. La subcategoría debe pertenecer a esa categoría.',
  '- personalizable y activo: VERDADERO o FALSO.',
  '- canal: tienda, mostrador o ambas. isv: 15, 18 o exento. Vacío = no cambia (o el default en altas).',
  '- costo_entrada: solo aplica si el stock aumenta; vacío = ajuste sin costo (no cambia el costo actual).',
  '',
  'Pestaña "Variantes": variantes de productos (stock y precio por variante).',
  '- NO modifiques producto_id ni variante_id: son las llaves.',
  '- Para crear una variante: fila nueva con producto_id y variante (nombre), variante_id vacío.',
  '- variante (nombre): obligatorio y único dentro del producto.',
  '- precio: vacío = no cambia (en filas nuevas = hereda el precio del padre).',
  '- stock: vacío = no cambia (en filas nuevas = ilimitado); 0 = agotada.',
  '- costo: solo informativo (no se puede editar desde aquí); costo_entrada aplica igual que en "Actualizar"/"Nuevos".',
  '- Si un producto tiene variantes, su stock y tallas en "Actualizar" se ignoran.',
]

export interface InventoryRow {
  id?: string | number
  sku?: string | number
  nombre?: string
  marca?: string
  precio?: string | number
  precio_original?: string | number
  precio_revendedor?: string | number
  stock?: string | number
  stock_minimo?: string | number
  costo_entrada?: string | number
  descripcion?: string
  categoria?: string
  subcategoria?: string
  genero?: string
  canal?: string
  isv?: string
  badge?: string
  tallas?: string
  colores?: string
  personalizable?: string | boolean | number
  activo?: string | boolean | number
}

export function parseBool(v: unknown): boolean {
  const s = String(v ?? '').toUpperCase().trim()
  return s === 'VERDADERO' || s === 'TRUE' || s === '1' || s === 'SI' || s === 'SÍ'
}

export function parseNum(v: unknown): number | undefined {
  const s = String(v ?? '').trim()
  if (s === '') return undefined
  return Number(s)
}

export function cellText(v: unknown): string | undefined {
  const s = String(v ?? '').trim()
  return s === '' ? undefined : s
}

export function cellBool(v: unknown): boolean | undefined {
  const s = String(v ?? '').trim()
  if (s === '') return undefined
  return parseBool(v)
}

export function splitList(v: unknown): string[] {
  return String(v ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export function joinList(arr: string[] | null | undefined): string {
  return (arr ?? []).join(', ')
}

export function normNombre(s: unknown): string {
  return String(s ?? '').trim().toLowerCase()
}

export interface CategoriaRef { id: string; valor: string }

export function buildExportData(
  productos: Producto[],
  categorias: CategoriaRef[],
  subcategorias: CategoriaRef[],
  variantes: ProductoVariante[],
): { actualizar: Record<string, string | number>[]; variantes: Record<string, string | number>[] } {
  const catById = new Map(categorias.map(c => [c.id, c.valor]))
  const subById = new Map(subcategorias.map(c => [c.id, c.valor]))
  const conVariantes = new Set(variantes.map(v => v.producto_id))

  const actualizar = productos.map(p => ({
    id: p.id,
    sku: p.sku ?? '',
    nombre: p.nombre,
    marca: p.marca ?? '',
    precio: p.precio,
    precio_original: p.precio_original ?? '',
    precio_revendedor: p.precio_revendedor ?? '',
    stock: conVariantes.has(p.id) ? NOTA_VENDE_POR_VARIANTES : (p.stock ?? ''),
    stock_minimo: p.stock_minimo ?? '',
    costo_entrada: '', // campo de entrada (acción), no informativo: siempre vacío al exportar
    descripcion: p.descripcion ?? '',
    categoria: p.categoria_id ? (catById.get(p.categoria_id) ?? '') : '',
    subcategoria: p.subcategoria_id ? (subById.get(p.subcategoria_id) ?? '') : '',
    genero: p.genero ?? '',
    canal: p.canal,
    isv: p.isv,
    badge: p.badge ?? '',
    tallas: conVariantes.has(p.id) ? NOTA_VENDE_POR_VARIANTES : joinList(p.tallas),
    colores: joinList(p.colores),
    personalizable: p.personalizable ? 'VERDADERO' : 'FALSO',
    activo: p.activo ? 'VERDADERO' : 'FALSO',
  }))

  const variantesPorProducto = new Map<string, ProductoVariante[]>()
  for (const v of variantes) {
    const lista = variantesPorProducto.get(v.producto_id) ?? []
    lista.push(v)
    variantesPorProducto.set(v.producto_id, lista)
  }

  const filasVariantes: Record<string, string | number>[] = []
  for (const p of productos) {
    const propias = variantesPorProducto.get(p.id)
    if (!propias) continue
    const ordenadas = [...propias].sort((a, b) => a.orden - b.orden)
    for (const v of ordenadas) {
      filasVariantes.push({
        producto_id: v.producto_id,
        producto: p.nombre,
        variante_id: v.id,
        variante: v.nombre,
        sku: v.sku ?? '',
        precio: v.precio ?? '',
        stock: v.stock ?? '',
        costo: v.costo ?? '', // solo-lectura informativo: el import lo ignora
        precio_revendedor: v.precio_revendedor ?? '',
        costo_entrada: '', // campo de entrada (acción), no informativo: siempre vacío al exportar
        activo: v.activo ? 'VERDADERO' : 'FALSO',
      })
    }
  }

  return { actualizar, variantes: filasVariantes }
}

export interface ProductoData {
  nombre: string
  slug: string
  descripcion: string | null
  precio: number
  precio_original: number | null
  precio_revendedor: number | null
  categoria_id: string | null
  subcategoria_id: string | null
  stock: number | null
  stock_minimo: number | null
  genero: string | null
  canal: 'tienda' | 'mostrador' | 'ambas'
  isv: '15' | '18' | 'exento'
  badge: string | null
  tallas: string[] | null
  colores: string[] | null
  marca: string | null
  sku: string | null
  personalizable: boolean
  activo: boolean
}

export interface ImportError {
  pestaña: 'Actualizar' | 'Nuevos' | 'Variantes'
  fila: number
  motivo: string
}

export interface SubcategoriaRef { id: string; valor: string; categorias_padre: string[] | null }

export interface ParseContext {
  existentes: Producto[]
  categorias: CategoriaRef[]
  subcategorias: SubcategoriaRef[]
  variantesExistentes: ProductoVariante[]
}

// Movimiento de kardex calculado por el parser a partir de un diff de stock.
// producto_id / variante_id en null significan "se resuelve al crear":
// - Alta de PRODUCTO: producto_id null; se liga por `productoSlugTemp` (el
//   `slug` generado del create en round-trip, o el `sku` del grupo en el
//   import externo) contra el uuid que la ruta obtiene al insertar productos.
// - Alta de VARIANTE nueva: variante_id null; `producto_id` ya viene resuelto
//   (real) si el producto padre existe (round-trip siempre; externo cuando el
//   producto ya existía) o null + `productoSlugTemp` si el producto padre
//   TAMBIÉN es un alta (solo posible en el import externo). El campo `orden`
//   lleva el MISMO valor que el `VarianteCreate`/`VarianteCreateExterna`
//   correspondiente en `variantes.creates` — es la clave de correlación
//   directa que la ruta usa (join por `(producto_id | productoSlugTemp,
//   orden)`) para resolver el `variante_id` real tras el insert, sin depender
//   de posición ni re-derivar qué creates generaron movimiento.
export interface MovimientoImport {
  producto_id: string | null
  productoSlugTemp?: string
  variante_id: string | null
  orden?: number   // solo en altas de variante nueva (ver arriba)
  tipo: 'entrada' | 'ajuste'
  cantidad: number
  costo_unitario: number | null
  stock_anterior: number | null
  referencia: string
}

export interface VarianteRow {
  producto_id?: string
  producto?: string
  variante_id?: string
  variante?: string
  sku?: string | number
  precio?: string | number
  stock?: string | number
  costo?: string | number         // solo-lectura informativo: el import lo ignora
  precio_revendedor?: string | number
  costo_entrada?: string | number
  activo?: string | boolean | number
}

export interface VarianteData {
  nombre: string
  sku: string | null
  precio: number | null
  stock: number | null
  precio_revendedor: number | null
  activo: boolean
}

export type VarianteUpdate = VarianteData & { id: string; producto_id: string }
export type VarianteCreate = VarianteData & { producto_id: string; orden: number }

export interface ParseResult {
  updates: (ProductoData & { id: string })[]
  creates: ProductoData[]
  errors: ImportError[]
  variantes: { updates: VarianteUpdate[]; creates: VarianteCreate[] }
  movimientos: MovimientoImport[]
}

// Datos suficientes para construir un MovimientoImport una vez se conocen los
// ids (o el productoSlugTemp) del recurso. Separa la VALIDACIÓN (temprana,
// junto al resto de la fila) de la construcción del objeto final (tardía,
// una vez resueltos slug/sku de un alta) sin repetir el cálculo.
export interface MovimientoParcial {
  tipo: 'entrada' | 'ajuste'
  cantidad: number
  costo_unitario: number | null
  stock_anterior: number | null
}

// Valida y calcula (sin ids) el movimiento de kardex a partir de un diff de
// stock. Reutiliza calcularCambioStock: un cambio de modalidad (null <-> número)
// no es un movimiento real de inventario (se escribe directo, sin kardex) —
// mismo criterio que ya usa el panel de admin (ver costeo.ts). Devuelve null
// si no hay movimiento que registrar. Empuja a rowErrors si costoEntrada viene
// en una fila que no es un aumento de stock.
export function calcularMovimientoStock(
  stockAnterior: number | null,
  stockNuevo: number | null,
  costoEntrada: number | null,
  rowErrors: string[],
): MovimientoParcial | null {
  const cambio = calcularCambioStock(stockAnterior, stockNuevo)
  if (cambio.tipo !== 'delta') {
    if (costoEntrada != null) rowErrors.push('el costo_entrada solo aplica si el stock aumenta')
    return null
  }
  if (cambio.delta > 0) {
    return { tipo: costoEntrada != null ? 'entrada' : 'ajuste', cantidad: cambio.delta, costo_unitario: costoEntrada ?? null, stock_anterior: stockAnterior }
  }
  if (costoEntrada != null) rowErrors.push('el costo_entrada solo aplica si el stock aumenta')
  return { tipo: 'ajuste', cantidad: cambio.delta, costo_unitario: null, stock_anterior: stockAnterior }
}

function parseCanal(v: unknown, base: Producto['canal'], rowErrors: string[]): Producto['canal'] {
  const cell = cellText(v)
  if (cell === undefined) return base
  if (!(CANALES as readonly string[]).includes(cell)) { rowErrors.push(`el canal "${cell}" no es válido`); return base }
  return cell as Producto['canal']
}

function parseIsv(v: unknown, base: Producto['isv'], rowErrors: string[]): Producto['isv'] {
  const cell = cellText(v)
  if (cell === undefined) return base
  if (!(ISV_VALORES as readonly string[]).includes(cell)) { rowErrors.push(`el isv "${cell}" no es válido`); return base }
  return cell as Producto['isv']
}

// precio_revendedor (producto o variante): vacío = no cambia (updates) / hereda-null (altas).
export function parsePrecioRevendedor(v: unknown, base: number | null, rowErrors: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return base
  if (Number.isNaN(n) || n <= 0) { rowErrors.push('el precio_revendedor debe ser mayor a 0'); return base }
  return n
}

function parseStockMinimo(v: unknown, base: number | null, rowErrors: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return base
  if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) { rowErrors.push('el stock_minimo debe ser un número entero de 0 o más'); return base }
  return n
}

// costo_entrada: transitorio, no se persiste como campo propio. vacío = null.
export function parseCostoEntrada(v: unknown, rowErrors: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return null
  if (Number.isNaN(n) || n <= 0) { rowErrors.push('el costo_entrada debe ser mayor a 0'); return null }
  return n
}

export function parseInventoryUpload(
  input: { actualizar: InventoryRow[]; nuevos: InventoryRow[]; variantes: VarianteRow[] },
  ctx: ParseContext,
): ParseResult {
  const errors: ImportError[] = []
  const updates: (ProductoData & { id: string })[] = []
  const creates: ProductoData[] = []
  const varUpdates: VarianteUpdate[] = []
  const varCreates: VarianteCreate[] = []
  const movimientos: MovimientoImport[] = []

  const porId = new Map(ctx.existentes.map(p => [p.id, p]))
  const catByNombre = new Map(ctx.categorias.map(c => [normNombre(c.valor), c]))
  const subByNombre = new Map(ctx.subcategorias.map(c => [normNombre(c.valor), c]))

  // SKU (recortado) -> id del producto dueño en BD
  const idPorSku = new Map<string, string>()
  for (const p of ctx.existentes) {
    if (p.sku) idPorSku.set(p.sku.trim(), p.id)
  }
  // SKUs ya vistos en este archivo -> fila que lo tomó
  const skuVistos = new Map<string, number>()
  // ids ya vistos en la pestaña Actualizar -> fila que lo tomó
  const idVistos = new Map<string, number>()
  const slugs = ctx.existentes.map(p => p.slug)
  const subPorId = new Map(ctx.subcategorias.map(s => [s.id, s]))

  // --- Índices de variantes (BD) ---
  const varPorId = new Map(ctx.variantesExistentes.map(v => [v.id, v]))
  const varsPorProducto = new Map<string, ProductoVariante[]>()
  for (const v of ctx.variantesExistentes) {
    const lista = varsPorProducto.get(v.producto_id) ?? []
    lista.push(v)
    varsPorProducto.set(v.producto_id, lista)
  }
  // nombre (normalizado) -> id de variante dueña, por producto
  const nombresVarBDPorProducto = new Map<string, Map<string, string>>()
  for (const [pid, lista] of varsPorProducto) {
    nombresVarBDPorProducto.set(pid, new Map(lista.map(v => [normNombre(v.nombre), v.id])))
  }
  // orden máximo ya usado por producto (para las altas)
  const maxOrdenPorProducto = new Map<string, number>()
  for (const [pid, lista] of varsPorProducto) {
    maxOrdenPorProducto.set(pid, Math.max(...lista.map(v => v.orden)))
  }
  // SKU (recortado) de variante -> id de variante dueña en BD
  const skuVarEnBD = new Map<string, string>()
  for (const v of ctx.variantesExistentes) {
    if (v.sku) skuVarEnBD.set(v.sku.trim(), v.id)
  }
  // vistos en este archivo: "producto_id::nombre normalizado" -> fila; sku -> fila
  const nombreVarVistos = new Map<string, number>()
  const skuVarVistos = new Map<string, number>()
  // cuántas altas de variante ya se contaron para cada producto (para calcular "orden")
  const nuevasVarPorProducto = new Map<string, number>()

  // Resuelve categoría/subcat efectivas o empuja errores. Devuelve ids resueltos.
  function resolverCategorias(
    row: InventoryRow, pestaña: 'Actualizar' | 'Nuevos', fila: number,
    baseCat: string | null, baseSub: string | null, rowErrors: string[],
  ): { categoria_id: string | null; subcategoria_id: string | null } {
    const catCell = cellText(row.categoria)
    const subCell = cellText(row.subcategoria)

    let categoria_id = baseCat
    if (catCell !== undefined) {
      const cat = catByNombre.get(normNombre(catCell))
      if (!cat) { rowErrors.push(`la categoría "${catCell}" no existe`); categoria_id = baseCat }
      else categoria_id = cat.id
    }

    let subcategoria_id = baseSub
    if (subCell !== undefined) {
      const sub = subByNombre.get(normNombre(subCell))
      if (!sub) { rowErrors.push(`la subcategoría "${subCell}" no existe`) }
      else if (!categoria_id) { rowErrors.push(`la subcategoría "${subCell}" requiere una categoría`) }
      else if (!(sub.categorias_padre ?? []).includes(categoria_id)) {
        rowErrors.push(`la subcategoría "${subCell}" no pertenece a esa categoría`)
      } else {
        subcategoria_id = sub.id
      }
    } else if (catCell !== undefined && subcategoria_id) {
      // La categoría cambió pero la subcategoría se conserva: re-validar que
      // la subcat conservada siga perteneciendo a la nueva categoría efectiva.
      const subActual = subPorId.get(subcategoria_id)
      const valor = subActual?.valor ?? subcategoria_id
      if (!categoria_id) {
        rowErrors.push(`la subcategoría "${valor}" requiere una categoría`)
      } else if (!(subActual?.categorias_padre ?? []).includes(categoria_id)) {
        rowErrors.push(`la subcategoría "${valor}" no pertenece a esa categoría`)
      }
    }
    return { categoria_id, subcategoria_id }
  }

  // Valida y registra SKU. Devuelve el SKU final (o null). Empuja errores.
  // Debe llamarse SOLO cuando el resto de la fila ya pasó validación, para no
  // reservar el SKU de filas que terminarán rechazadas por otro motivo.
  function resolverSku(
    row: InventoryRow, fila: number, propioId: string | null,
    baseSku: string | null, rowErrors: string[],
  ): string | null {
    const cell = cellText(row.sku)
    const skuFinal = cell !== undefined ? cell : baseSku
    if (!skuFinal) return null
    const dueño = idPorSku.get(skuFinal)
    if (dueño && dueño !== propioId) {
      rowErrors.push(`el SKU "${skuFinal}" ya pertenece a otro producto`)
      return skuFinal
    }
    const filaPrevia = skuVistos.get(skuFinal)
    if (filaPrevia !== undefined) {
      rowErrors.push(`el SKU "${skuFinal}" está repetido (también en la fila ${filaPrevia})`)
      return skuFinal
    }
    skuVistos.set(skuFinal, fila)
    return skuFinal
  }

  function parsePrecio(v: unknown, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) { rowErrors.push('el precio no puede ir vacío'); return null }
    if (Number.isNaN(n)) { rowErrors.push('el precio no es un número válido'); return null }
    if (n <= 0) { rowErrors.push('el precio debe ser mayor a 0'); return null }
    return n
  }

  function parsePrecioOriginal(v: unknown, base: number | null, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) return base                       // vacío = no cambia (o base null en altas)
    if (Number.isNaN(n) || n < 0) { rowErrors.push('el precio_original no es un número válido'); return base }
    return n
  }

  function parseStock(v: unknown, base: number | null, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) return base                       // vacío = no cambia (o base null en altas)
    if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
      rowErrors.push('el stock debe ser un número entero de 0 o más'); return base
    }
    return n
  }

  // precio de variante: vacío = no cambia (updates) / hereda (altas, base = null)
  function parsePrecioVariante(v: unknown, base: number | null, rowErrors: string[]): number | null {
    const n = parseNum(v)
    if (n === undefined) return base
    if (Number.isNaN(n) || n <= 0) { rowErrors.push('el precio de la variante debe ser mayor a 0'); return base }
    return n
  }

  // Valida el nombre de la variante (único por producto, BD + archivo).
  // NO reserva: solo empuja errores. La reserva (nombreVarVistos.set) se hace
  // en el sitio de la llamada, una vez que TODA la fila pasó validación —
  // igual que el SKU de producto, para no bloquear una fila futura válida con
  // el nombre de una fila descartada por otro motivo (ej. SKU repetido).
  function validarNombreVariante(
    producto_id: string, propioId: string | null, nombre: string, rowErrors: string[],
  ): void {
    const key = normNombre(nombre)
    const dueñoBD = nombresVarBDPorProducto.get(producto_id)?.get(key)
    if (dueñoBD && dueñoBD !== propioId) {
      rowErrors.push(`la variante "${nombre}" ya existe en este producto`)
      return
    }
    const fileKey = `${producto_id}::${key}`
    const filaPrevia = nombreVarVistos.get(fileKey)
    if (filaPrevia !== undefined) {
      rowErrors.push(`la variante "${nombre}" está repetida en el archivo (también en la fila ${filaPrevia})`)
    }
  }

  // Valida el SKU de variante (único global, BD + archivo) y devuelve el SKU final.
  // NO reserva: la reserva (skuVarVistos.set) se hace en el sitio de la llamada,
  // una vez que TODA la fila pasó validación (mismo motivo que arriba).
  function validarSkuVariante(
    row: VarianteRow, propioId: string | null, baseSku: string | null, rowErrors: string[],
  ): string | null {
    const cell = cellText(row.sku)
    const skuFinal = cell !== undefined ? cell : baseSku
    if (!skuFinal) return null
    const dueño = skuVarEnBD.get(skuFinal)
    if (dueño && dueño !== propioId) {
      rowErrors.push(`el SKU "${skuFinal}" ya pertenece a otra variante`)
      return skuFinal
    }
    const filaPrevia = skuVarVistos.get(skuFinal)
    if (filaPrevia !== undefined) {
      rowErrors.push(`el SKU "${skuFinal}" está repetido (también en la fila ${filaPrevia})`)
    }
    return skuFinal
  }

  // --- Pestaña Actualizar ---
  input.actualizar.forEach((row, i) => {
    const fila = i + 2
    const rowErrors: string[] = []
    const id = cellText(row.id)
    if (!id) { errors.push({ pestaña: 'Actualizar', fila, motivo: 'falta el id (no borres esa columna)' }); return }
    const prod = porId.get(id)
    if (!prod) { errors.push({ pestaña: 'Actualizar', fila, motivo: `el id "${id}" no existe` }); return }
    const filaPreviaId = idVistos.get(id)
    if (filaPreviaId !== undefined) {
      errors.push({ pestaña: 'Actualizar', fila, motivo: `el id "${id}" está repetido (también en la fila ${filaPreviaId})` })
      return
    }
    idVistos.set(id, fila)

    // Si el producto vende por variantes, su stock y tallas se administran desde
    // la pestaña Variantes: las celdas de Actualizar (incluida la nota exportada) se ignoran.
    const tieneVariantes = (varsPorProducto.get(id) ?? []).length > 0

    const nombre = cellText(row.nombre)
    if (!nombre) rowErrors.push('el nombre no puede ir vacío')
    const precio = parsePrecio(row.precio, rowErrors)
    const precio_original = parsePrecioOriginal(row.precio_original, prod.precio_original, rowErrors)
    const precio_revendedor = parsePrecioRevendedor(row.precio_revendedor, prod.precio_revendedor, rowErrors)
    const stock = tieneVariantes ? prod.stock : parseStock(row.stock, prod.stock, rowErrors)
    const stock_minimo = parseStockMinimo(row.stock_minimo, prod.stock_minimo, rowErrors)
    const canal = parseCanal(row.canal, prod.canal, rowErrors)
    const isv = parseIsv(row.isv, prod.isv, rowErrors)
    const costoEntrada = parseCostoEntrada(row.costo_entrada, rowErrors)
    const { categoria_id, subcategoria_id } = resolverCategorias(row, 'Actualizar', fila, prod.categoria_id, prod.subcategoria_id, rowErrors)
    const movInfo = calcularMovimientoStock(prod.stock, stock, costoEntrada, rowErrors)

    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Actualizar', fila, motivo: m })); return }

    // El SKU solo se valida/reserva una vez que el resto de la fila es válido,
    // para no bloquear una fila futura por el SKU de una fila descartada.
    const sku = resolverSku(row, fila, id, prod.sku, rowErrors)
    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Actualizar', fila, motivo: m })); return }

    updates.push({
      id,
      nombre: nombre!,
      slug: prod.slug,
      descripcion: cellText(row.descripcion) ?? prod.descripcion,
      precio: precio!,
      precio_original,
      precio_revendedor,
      categoria_id,
      subcategoria_id,
      stock,
      stock_minimo,
      genero: cellText(row.genero) ?? prod.genero,
      canal,
      isv,
      badge: cellText(row.badge) ?? prod.badge,
      tallas: tieneVariantes ? prod.tallas : (cellText(row.tallas) !== undefined ? splitList(row.tallas) : prod.tallas),
      colores: cellText(row.colores) !== undefined ? splitList(row.colores) : prod.colores,
      marca: cellText(row.marca) ?? prod.marca,
      sku,
      personalizable: cellBool(row.personalizable) ?? prod.personalizable,
      activo: cellBool(row.activo) ?? prod.activo,
    })

    if (movInfo) movimientos.push({ ...movInfo, producto_id: id, variante_id: null, referencia: REFERENCIA_IMPORT })
  })

  // --- Pestaña Nuevos ---
  input.nuevos.forEach((row, i) => {
    const fila = i + 2
    const vacia = COLUMNAS.every(col => cellText((row as Record<string, unknown>)[col]) === undefined)
    if (vacia) return

    const rowErrors: string[] = []
    if (cellText(row.id) !== undefined) rowErrors.push('las filas nuevas no llevan id (déjalo vacío)')

    const nombre = cellText(row.nombre)
    if (!nombre) rowErrors.push('el nombre no puede ir vacío')
    const precio = parsePrecio(row.precio, rowErrors)
    const precio_original = parsePrecioOriginal(row.precio_original, null, rowErrors)
    const precio_revendedor = parsePrecioRevendedor(row.precio_revendedor, null, rowErrors)
    const stock = parseStock(row.stock, null, rowErrors)
    const stock_minimo = parseStockMinimo(row.stock_minimo, null, rowErrors)
    const canal = parseCanal(row.canal, 'ambas', rowErrors)
    const isv = parseIsv(row.isv, '15', rowErrors)
    const costoEntrada = parseCostoEntrada(row.costo_entrada, rowErrors)
    const { categoria_id, subcategoria_id } = resolverCategorias(row, 'Nuevos', fila, null, null, rowErrors)
    // Alta: no hay stock previo (el producto no existe todavía) -> stock_anterior = 0.
    const movInfo = calcularMovimientoStock(0, stock, costoEntrada, rowErrors)

    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Nuevos', fila, motivo: m })); return }

    // El SKU solo se valida/reserva una vez que el resto de la fila es válido,
    // para no bloquear una fila futura por el SKU de una fila descartada.
    const sku = resolverSku(row, fila, null, null, rowErrors)
    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Nuevos', fila, motivo: m })); return }

    const slug = uniqueSlug(slugify(nombre!) || 'producto', slugs)
    slugs.push(slug)

    creates.push({
      nombre: nombre!,
      slug,
      descripcion: cellText(row.descripcion) ?? null,
      precio: precio!,
      precio_original,
      precio_revendedor,
      categoria_id,
      subcategoria_id,
      stock,
      stock_minimo,
      genero: cellText(row.genero) ?? null,
      canal,
      isv,
      badge: cellText(row.badge) ?? null,
      tallas: cellText(row.tallas) !== undefined ? splitList(row.tallas) : null,
      colores: cellText(row.colores) !== undefined ? splitList(row.colores) : null,
      marca: cellText(row.marca) ?? null,
      sku,
      personalizable: cellBool(row.personalizable) ?? false,
      activo: cellBool(row.activo) ?? true,
    })

    if (movInfo) movimientos.push({ ...movInfo, producto_id: null, productoSlugTemp: slug, variante_id: null, referencia: REFERENCIA_IMPORT })
  })

  // --- Pestaña Variantes ---
  input.variantes.forEach((row, i) => {
    const fila = i + 2
    const vacia = VARIANTES_COLUMNAS.every(col => cellText(row[col]) === undefined)
    if (vacia) return

    const rowErrors: string[] = []
    const producto_id = cellText(row.producto_id)
    if (!producto_id) { errors.push({ pestaña: 'Variantes', fila, motivo: 'falta el producto_id' }); return }
    if (!porId.has(producto_id)) {
      errors.push({ pestaña: 'Variantes', fila, motivo: `el producto_id "${producto_id}" no existe` })
      return
    }

    const variante_id = cellText(row.variante_id) ?? null
    let base: ProductoVariante | null = null
    if (variante_id) {
      const v = varPorId.get(variante_id)
      if (!v || v.producto_id !== producto_id) {
        errors.push({ pestaña: 'Variantes', fila, motivo: `la variante_id "${variante_id}" no existe o no pertenece a ese producto` })
        return
      }
      base = v
    }

    const nombreCell = cellText(row.variante)
    if (!variante_id && !nombreCell) rowErrors.push('el nombre de la variante no puede ir vacío')
    const nombre = nombreCell ?? (base ? base.nombre : undefined)

    const precio = parsePrecioVariante(row.precio, base ? base.precio : null, rowErrors)
    const stock = parseStock(row.stock, base ? base.stock : null, rowErrors)
    const precio_revendedor = parsePrecioRevendedor(row.precio_revendedor, base ? base.precio_revendedor : null, rowErrors)
    const activo = cellBool(row.activo) ?? (base ? base.activo : true)
    const costoEntrada = parseCostoEntrada(row.costo_entrada, rowErrors)
    // Alta de variante: no hay stock previo (la variante no existe todavía) -> stock_anterior = 0.
    const movInfo = calcularMovimientoStock(base ? base.stock : 0, stock, costoEntrada, rowErrors)

    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Variantes', fila, motivo: m })); return }

    // Nombre y SKU solo se validan (sin reservar todavía) en este punto. Si
    // cualquiera de los dos falla, la fila completa se descarta y NINGUNO de
    // los dos recursos se reserva — así una fila válida posterior con el
    // mismo nombre o SKU no se bloquea por una fila rechazada por el otro dato.
    validarNombreVariante(producto_id, variante_id, nombre!, rowErrors)
    const sku = validarSkuVariante(row, variante_id, base ? base.sku : null, rowErrors)
    if (rowErrors.length) { rowErrors.forEach(m => errors.push({ pestaña: 'Variantes', fila, motivo: m })); return }

    // La fila completa es válida: recién ahora se reservan nombre y SKU.
    nombreVarVistos.set(`${producto_id}::${normNombre(nombre!)}`, fila)
    if (sku) skuVarVistos.set(sku, fila)

    if (variante_id) {
      varUpdates.push({ id: variante_id, producto_id, nombre: nombre!, sku, precio, stock, precio_revendedor, activo })
      // Update: variante_id conocido directamente.
      if (movInfo) movimientos.push({ ...movInfo, producto_id, variante_id, referencia: REFERENCIA_IMPORT })
    } else {
      const maxOrden = maxOrdenPorProducto.get(producto_id) ?? -1
      const posicion = nuevasVarPorProducto.get(producto_id) ?? 0
      const orden = maxOrden + 1 + posicion
      nuevasVarPorProducto.set(producto_id, posicion + 1)
      varCreates.push({ producto_id, nombre: nombre!, sku, precio, stock, precio_revendedor, activo, orden })
      // Alta: variante_id null (se resuelve al crear); producto_id ya es real
      // porque en round-trip la pestaña Variantes solo liga a productos
      // existentes (ver validación arriba). `orden` es la clave de correlación
      // que Task 10 usa para ligar este movimiento con la fila insertada en
      // producto_variantes: mismo valor que lleva el VarianteCreate.
      if (movInfo) movimientos.push({ ...movInfo, producto_id, variante_id: null, orden, referencia: REFERENCIA_IMPORT })
    }
  })

  return { updates, creates, errors, variantes: { updates: varUpdates, creates: varCreates }, movimientos }
}
