import {
  cellText, parseNum, parseBool, splitList, normNombre,
  parseCostoEntrada, calcularMovimientoStock,
  type ProductoData, type ParseContext, type VarianteData, type VarianteUpdate, type MovimientoImport,
} from './inventoryRoundtrip'
import { slugify, uniqueSlug } from './slug'
import type { Producto, ProductoVariante } from '@/types'

export type CampoPlataforma =
  | 'sku' | 'nombre' | 'precio' | 'precio_original' | 'stock'
  | 'descripcion' | 'categoria' | 'subcategoria' | 'genero'
  | 'badge' | 'marca' | 'talla' | 'color' | 'sku_variante' | 'costo' | 'personalizable' | 'activo'

export type Mapeo = Partial<Record<CampoPlataforma, string>>

const REFERENCIA_IMPORT_EXTERNO = 'import externo'

export const CAMPOS_PLATAFORMA: { campo: CampoPlataforma; label: string; obligatorio: boolean }[] = [
  { campo: 'sku', label: 'SKU (identificador)', obligatorio: true },
  { campo: 'nombre', label: 'Nombre', obligatorio: true },
  { campo: 'precio', label: 'Precio', obligatorio: true },
  { campo: 'precio_original', label: 'Precio original (oferta)', obligatorio: false },
  { campo: 'stock', label: 'Stock', obligatorio: false },
  { campo: 'costo', label: 'Costo (de la entrada de stock)', obligatorio: false },
  { campo: 'marca', label: 'Marca', obligatorio: false },
  { campo: 'categoria', label: 'Categoría', obligatorio: false },
  { campo: 'subcategoria', label: 'Subcategoría', obligatorio: false },
  { campo: 'genero', label: 'Género', obligatorio: false },
  { campo: 'talla', label: 'Talla (por variante)', obligatorio: false },
  { campo: 'color', label: 'Color (por variante)', obligatorio: false },
  { campo: 'sku_variante', label: 'SKU de variante', obligatorio: false },
  { campo: 'descripcion', label: 'Descripción', obligatorio: false },
  { campo: 'badge', label: 'Badge', obligatorio: false },
  { campo: 'personalizable', label: 'Personalizable', obligatorio: false },
  { campo: 'activo', label: 'Activo', obligatorio: false },
]

function compact(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function tokens(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

const ALIAS: Record<CampoPlataforma, string[]> = {
  sku: ['sku', 'cbarras', 'codigo', 'codigobarras', 'codigodebarras', 'upc', 'ean', 'barcode'],
  nombre: ['nombre', 'nombreproducto', 'producto', 'articulo', 'descripcioncorta'],
  precio: ['precio', 'precioventa', 'pvp'],
  precio_original: ['preciooriginal', 'precioanterior', 'preciolista', 'preciotachado'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'inventario', 'disponible'],
  costo: ['costo', 'preciocosto', 'preciocompra', 'costounitario', 'costodeentrada'],
  descripcion: ['descripcion', 'descripcionproducto', 'detalle', 'descripcionlarga'],
  categoria: ['categoria', 'nombrecategoria'],
  subcategoria: ['subcategoria', 'vnombresubcategoria', 'nombresubcategoria'],
  genero: ['genero', 'sexo'],
  badge: ['badge', 'etiqueta'],
  marca: ['marca', 'fabricante'],
  talla: ['talla', 'tamano', 'size', 'medida'],
  color: ['color', 'colores'],
  sku_variante: ['skuvariante', 'codigovariante', 'skuhijo', 'variantsku'],
  personalizable: ['personalizable'],
  activo: ['activo', 'isactive', 'habilitado'],
}

export function sugerirMapeo(columnas: string[]): Mapeo {
  const cols = columnas.map(c => ({ raw: c, k: compact(c) }))
  const usados = new Set<string>()
  const mapeo: Mapeo = {}
  for (const { campo } of CAMPOS_PLATAFORMA) {
    const alias = ALIAS[campo]
    let hit = cols.find(c => !usados.has(c.raw) && alias.includes(c.k))
    if (!hit) hit = cols.find(c => !usados.has(c.raw) && tokens(c.raw).some(t => alias.includes(t)))
    if (hit) { mapeo[campo] = hit.raw; usados.add(hit.raw) }
  }
  return mapeo
}

export function validarMapeo(mapeo: Mapeo): string[] {
  const errs: string[] = []
  for (const { campo, label, obligatorio } of CAMPOS_PLATAFORMA) {
    if (obligatorio && !mapeo[campo]) errs.push(`falta mapear ${label}`)
  }
  return errs
}

export interface VarianteExterna {
  fila: number
  nombre: string          // "M / Azul" | "M" | "Azul" | sku_variante si no hay talla/color
  sku: string | null      // sku_variante de la fila
  precio?: string
  stock?: string
  costo?: string          // costo de la entrada de stock de esta variante (opcional)
}

export interface GrupoProducto {
  sku: string
  filas: number[]
  nombre?: string
  precio?: string
  precio_original?: string
  stock?: string
  costo?: string           // solo para grupos planos (sin variantes): costo de la entrada de stock
  descripcion?: string
  categoria?: string
  subcategoria?: string
  genero?: string
  badge?: string
  marca?: string
  tallas: string[]
  colores: string[]
  variantes: VarianteExterna[]
  personalizable?: string
  activo?: string
}

const ESCALARES = [
  'nombre', 'precio', 'precio_original', 'descripcion', 'categoria',
  'subcategoria', 'genero', 'badge', 'marca', 'personalizable', 'activo',
] as const

interface FilaDatos {
  fila: number
  talla?: string
  color?: string
  skuVar?: string
  precio?: string
  stock?: string
  costo?: string
}

export function agruparPorSku(
  rows: Record<string, unknown>[],
  mapeo: Mapeo,
): { grupos: GrupoProducto[]; sinSku: number[] } {
  const map = new Map<string, GrupoProducto>()
  const filasPorSku = new Map<string, FilaDatos[]>()
  const sinSku: number[] = []

  const cel = (row: Record<string, unknown>, campo: CampoPlataforma): string | undefined => {
    const col = mapeo[campo]
    return col ? cellText(row[col]) : undefined
  }

  rows.forEach((row, i) => {
    const fila = i + 2
    const tieneDatos = CAMPOS_PLATAFORMA.some(({ campo }) => cel(row, campo) !== undefined)
    if (!tieneDatos) return
    const sku = cel(row, 'sku')
    if (!sku) { sinSku.push(fila); return }

    let g = map.get(sku)
    if (!g) { g = { sku, filas: [], tallas: [], colores: [], variantes: [] }; map.set(sku, g) }
    g.filas.push(fila)

    if (mapeo.talla) for (const t of splitList(row[mapeo.talla])) if (!g.tallas.includes(t)) g.tallas.push(t)
    if (mapeo.color) for (const c of splitList(row[mapeo.color])) if (!g.colores.includes(c)) g.colores.push(c)

    for (const campo of ESCALARES) {
      if (g[campo] === undefined) {
        const v = cel(row, campo)
        if (v !== undefined) g[campo] = v
      }
    }

    const filas = filasPorSku.get(sku) ?? []
    filas.push({
      fila,
      talla: cel(row, 'talla'),
      color: cel(row, 'color'),
      skuVar: cel(row, 'sku_variante'),
      precio: cel(row, 'precio'),
      stock: cel(row, 'stock'),
      costo: cel(row, 'costo'),
    })
    filasPorSku.set(sku, filas)
  })

  for (const g of map.values()) {
    const filasDatos = filasPorSku.get(g.sku) ?? []
    const esConVariantes = filasDatos.length > 1 || filasDatos.some(f => f.talla || f.color || f.skuVar)

    if (esConVariantes) {
      g.variantes = filasDatos.map(f => ({
        fila: f.fila,
        nombre: [f.talla, f.color].filter(Boolean).join(' / ') || f.skuVar || '',
        sku: f.skuVar ?? null,
        ...(f.precio !== undefined ? { precio: f.precio } : {}),
        ...(f.stock !== undefined ? { stock: f.stock } : {}),
        ...(f.costo !== undefined ? { costo: f.costo } : {}),
      }))
      g.stock = undefined
      g.costo = undefined
    } else {
      g.variantes = []
      let total: number | undefined
      for (const f of filasDatos) {
        if (f.stock === undefined) continue
        const n = parseNum(f.stock)
        if (n !== undefined && !Number.isNaN(n)) total = (total ?? 0) + n
      }
      g.stock = total !== undefined ? String(total) : undefined
      g.costo = filasDatos.find(f => f.costo !== undefined)?.costo
    }
  }

  return { grupos: [...map.values()], sinSku }
}

export interface ImportExternoError { sku: string | null; fila: number | null; motivo: string }
export interface Resumen {
  crear: number
  actualizar: number
  conError: number
  variantesCrear: number
  variantesActualizar: number
  movimientos: number
}
export interface VarianteCreateExterna extends VarianteData {
  productoSku: string      // liga con el padre (existente o por crear); la ruta resuelve el producto_id
  orden: number
}
export interface ExternalParseResult {
  updates: (ProductoData & { id: string })[]
  creates: ProductoData[]
  errors: ImportExternoError[]
  resumen: Resumen
  variantes: { updates: VarianteUpdate[]; creates: VarianteCreateExterna[] }
  movimientos: MovimientoImport[]
}

function precioReq(v: string | undefined, errs: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) { errs.push('falta el precio'); return null }
  if (Number.isNaN(n)) { errs.push('el precio no es un número válido'); return null }
  if (n <= 0) { errs.push('el precio debe ser mayor a 0'); return null }
  return n
}
function numOpt(v: string | undefined, base: number | null, campo: string, errs: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return base
  if (Number.isNaN(n) || n < 0) { errs.push(`el ${campo} no es un número válido`); return base }
  return n
}
function stockOpt(v: string | undefined, base: number | null, errs: string[]): number | null {
  const n = parseNum(v)
  if (n === undefined) return base
  if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) { errs.push('el stock debe ser un entero de 0 o más'); return base }
  return n
}
function boolOpt(v: string | undefined): boolean | undefined {
  return v === undefined ? undefined : parseBool(v)
}

// Determina el resultado de casar/validar las variantes de un grupo.
// Devuelve null (con motivos en `groupErrors`) si el grupo debe descartarse
// por completo — atómico, como el resto de errores de grupo.
function resolverVariantesDeGrupo(
  g: GrupoProducto,
  existente: Producto | null,
  precioPadre: number | null,
  varPorSku: Map<string, ProductoVariante>,
  varsPorProducto: Map<string, ProductoVariante[]>,
  maxOrdenPorProducto: Map<string, number>,
  skuVarVistosGlobal: Map<string, number>,
  groupErrors: { fila: number; motivo: string }[],
): { updates: VarianteUpdate[]; creates: VarianteCreateExterna[]; skuReservas: Map<string, number>; movimientos: MovimientoImport[] } | null {
  const varUpdates: VarianteUpdate[] = []
  const varCreates: VarianteCreateExterna[] = []
  const movimientos: MovimientoImport[] = []
  const nombresEnGrupo = new Set<string>()
  const idsUsadosEnGrupo = new Set<string>()
  const skuReservas = new Map<string, number>() // reservas locales; se funden al global solo si el grupo entero es válido
  // orden de las altas: continúa después del máximo orden ya usado en BD para
  // este producto (o desde 0 si es un producto nuevo); el contador SOLO avanza
  // con altas, nunca con updates (misma posición no debe "saltar" por ellos).
  const maxOrdenBD = (existente ? maxOrdenPorProducto.get(existente.id) : undefined) ?? -1
  let siguienteOrden = maxOrdenBD + 1

  g.variantes.forEach(v => {
    const rowErrors: string[] = []
    const nombreV = cellText(v.nombre)
    if (!nombreV) {
      groupErrors.push({ fila: v.fila, motivo: `la fila ${v.fila} no se puede distinguir como variante (falta talla/color/sku de variante)` })
      return
    }
    const nombreKey = normNombre(nombreV)
    if (nombresEnGrupo.has(nombreKey)) {
      groupErrors.push({ fila: v.fila, motivo: `la variante "${nombreV}" está repetida en el archivo` })
      return
    }

    let skuFinal: string | null = null
    if (v.sku) {
      const skuTrim = v.sku.trim()
      if (skuVarVistosGlobal.has(skuTrim) || skuReservas.has(skuTrim)) {
        groupErrors.push({ fila: v.fila, motivo: `el SKU de variante "${skuTrim}" está repetido en el archivo` })
        return
      }
      skuFinal = skuTrim
    }

    // Casar: por sku de variante (BD, global) → debe pertenecer al producto del grupo.
    let matched: ProductoVariante | null = null
    if (skuFinal) {
      const found = varPorSku.get(skuFinal)
      if (found) {
        if (!existente || found.producto_id !== existente.id) {
          groupErrors.push({ fila: v.fila, motivo: `el SKU de variante "${skuFinal}" ya pertenece a otro producto` })
          return
        }
        matched = found
      }
    }
    // si no casó por sku, por nombre dentro del producto existente
    if (!matched && existente) {
      const candidatos = varsPorProducto.get(existente.id) ?? []
      matched = candidatos.find(c => normNombre(c.nombre) === nombreKey) ?? null
    }
    if (matched && idsUsadosEnGrupo.has(matched.id)) {
      groupErrors.push({ fila: v.fila, motivo: `la variante existente "${matched.nombre}" ya fue usada en otra fila del mismo grupo` })
      return
    }

    // precio propio: solo si viene y difiere del precio del padre
    let precioVar: number | null = null
    if (v.precio !== undefined) {
      const n = parseNum(v.precio)
      if (n === undefined || Number.isNaN(n) || n <= 0) {
        rowErrors.push(`el precio de la variante en la fila ${v.fila} no es un número válido`)
      } else if (precioPadre !== null && n !== precioPadre) {
        precioVar = n
      }
    }

    // stock: si viene, entero >= 0; si no, hereda el de la variante existente (updates) o null (altas)
    let stockVar: number | null = matched ? matched.stock : null
    if (v.stock !== undefined) {
      const n = parseNum(v.stock)
      if (n === undefined || Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
        rowErrors.push(`el stock de la variante en la fila ${v.fila} debe ser un entero de 0 o más`)
      } else {
        stockVar = n
      }
    }

    // costo de la entrada (opcional): valida y calcula el movimiento de kardex.
    // Alta de variante: no hay stock previo -> stock_anterior = 0.
    const costoEntrada = parseCostoEntrada(v.costo, rowErrors)
    const movInfo = calcularMovimientoStock(matched ? matched.stock : 0, stockVar, costoEntrada, rowErrors)

    if (rowErrors.length) { rowErrors.forEach(m => groupErrors.push({ fila: v.fila, motivo: m })); return }

    nombresEnGrupo.add(nombreKey)
    if (matched) idsUsadosEnGrupo.add(matched.id)
    if (skuFinal) skuReservas.set(skuFinal, v.fila)

    if (matched) {
      varUpdates.push({
        id: matched.id, producto_id: matched.producto_id, nombre: nombreV,
        sku: skuFinal, precio: precioVar, stock: stockVar, precio_revendedor: matched.precio_revendedor, activo: matched.activo,
      })
      // Update: producto_id/variante_id reales (la variante ya existe).
      if (movInfo) movimientos.push({ ...movInfo, producto_id: matched.producto_id, variante_id: matched.id, referencia: REFERENCIA_IMPORT_EXTERNO })
    } else {
      const ordenAlta = siguienteOrden
      varCreates.push({ productoSku: g.sku, orden: ordenAlta, nombre: nombreV, sku: skuFinal, precio: precioVar, stock: stockVar, precio_revendedor: null, activo: true })
      siguienteOrden++

      if (movInfo) {
        // Alta de variante de un producto YA existente: producto_id real,
        // variante_id null (se resuelve al crear). Alta de variante de un
        // producto TAMBIÉN nuevo: ni producto_id ni variante_id existen aún
        // -> se liga por productoSlugTemp (sku). `orden` es la clave de
        // correlación (igual al orden del VarianteCreateExterna de arriba)
        // que la ruta usa para resolver el variante_id real tras el insert.
        movimientos.push(
          existente
            ? { ...movInfo, producto_id: existente.id, variante_id: null, orden: ordenAlta, referencia: REFERENCIA_IMPORT_EXTERNO }
            : { ...movInfo, producto_id: null, productoSlugTemp: g.sku, variante_id: null, orden: ordenAlta, referencia: REFERENCIA_IMPORT_EXTERNO },
        )
      }
    }
  })

  if (groupErrors.length) return null
  return { updates: varUpdates, creates: varCreates, skuReservas, movimientos }
}

export function parseExternalImport(grupos: GrupoProducto[], ctx: ParseContext): ExternalParseResult {
  const updates: (ProductoData & { id: string })[] = []
  const creates: ProductoData[] = []
  const errors: ImportExternoError[] = []
  const varUpdates: VarianteUpdate[] = []
  const varCreates: VarianteCreateExterna[] = []
  const movimientos: MovimientoImport[] = []

  const catByNombre = new Map(ctx.categorias.map(c => [normNombre(c.valor), c]))
  const subByNombre = new Map(ctx.subcategorias.map(c => [normNombre(c.valor), c]))
  const subById = new Map(ctx.subcategorias.map(c => [c.id, c]))
  const prodPorSku = new Map<string, Producto>()
  const skusDupBD = new Set<string>()
  for (const p of ctx.existentes) {
    if (!p.sku) continue
    const k = p.sku.trim()
    if (prodPorSku.has(k)) skusDupBD.add(k)
    else prodPorSku.set(k, p)
  }
  const slugs = ctx.existentes.map(p => p.slug)
  let conError = 0

  // --- Índices de variantes existentes (BD) ---
  const varPorSku = new Map<string, ProductoVariante>()
  for (const v of ctx.variantesExistentes) {
    if (v.sku) varPorSku.set(v.sku.trim(), v)
  }
  const varsPorProducto = new Map<string, ProductoVariante[]>()
  for (const v of ctx.variantesExistentes) {
    const lista = varsPorProducto.get(v.producto_id) ?? []
    lista.push(v)
    varsPorProducto.set(v.producto_id, lista)
  }
  // máximo orden ya usado en BD, por producto (para que las altas no colisionen)
  const maxOrdenPorProducto = new Map<string, number>()
  for (const [pid, lista] of varsPorProducto) {
    maxOrdenPorProducto.set(pid, Math.max(...lista.map(v => v.orden)))
  }
  // sku de variante ya reservado por un grupo VÁLIDO anterior de este mismo archivo
  const skuVarVistosGlobal = new Map<string, number>()

  for (const g of grupos) {
    const errs: string[] = []
    const fila = g.filas[0] ?? null
    if (skusDupBD.has(g.sku)) {
      conError++
      errors.push({ sku: g.sku, fila, motivo: `el SKU "${g.sku}" está duplicado en la base de datos; corrígelo en el panel` })
      continue
    }
    const existente = prodPorSku.get(g.sku) ?? null

    const nombre = cellText(g.nombre)
    if (!nombre) errs.push('falta el nombre')
    const precio = precioReq(g.precio, errs)
    const precio_original = numOpt(g.precio_original, existente?.precio_original ?? null, 'precio_original', errs)
    const stock = stockOpt(g.stock, existente?.stock ?? null, errs)
    // Costo de la entrada (solo aplica a grupos planos: g.costo viene undefined
    // cuando el grupo tiene variantes, ya que el costo ahí se maneja por fila).
    // Alta: no hay stock previo (el producto no existe todavía) -> stock_anterior = 0.
    const costoEntrada = parseCostoEntrada(g.costo, errs)
    const movInfoProducto = calcularMovimientoStock(existente ? existente.stock : 0, stock, costoEntrada, errs)

    // categoría / subcategoría
    let categoria_id = existente?.categoria_id ?? null
    let subcategoria_id = existente?.subcategoria_id ?? null
    const catCell = cellText(g.categoria)
    if (catCell !== undefined) {
      const cat = catByNombre.get(normNombre(catCell))
      if (!cat) errs.push(`la categoría "${catCell}" no existe`)
      else categoria_id = cat.id
    }
    const subCell = cellText(g.subcategoria)
    if (subCell !== undefined) {
      const sub = subByNombre.get(normNombre(subCell))
      if (!sub) errs.push(`la subcategoría "${subCell}" no existe`)
      else if (!categoria_id) errs.push(`la subcategoría "${subCell}" requiere una categoría`)
      else if (!(sub.categorias_padre ?? []).includes(categoria_id)) errs.push(`la subcategoría "${subCell}" no pertenece a esa categoría`)
      else subcategoria_id = sub.id
    } else if (catCell !== undefined && subcategoria_id) {
      // cambió la categoría pero se conserva la subcat: re-validar
      const s = subById.get(subcategoria_id)
      if (!categoria_id || !(s?.categorias_padre ?? []).includes(categoria_id)) {
        errs.push(`la subcategoría "${s?.valor ?? subcategoria_id}" no pertenece a esa categoría`)
      }
    }

    // --- variantes del grupo (si aplica) ---
    const groupErrors: { fila: number; motivo: string }[] = []
    let varUpdatesGrupo: VarianteUpdate[] = []
    let varCreatesGrupo: VarianteCreateExterna[] = []
    let skuReservasGrupo = new Map<string, number>()
    let movimientosGrupo: MovimientoImport[] = []
    if (g.variantes.length > 0) {
      const resultado = resolverVariantesDeGrupo(g, existente, precio, varPorSku, varsPorProducto, maxOrdenPorProducto, skuVarVistosGlobal, groupErrors)
      if (resultado) {
        varUpdatesGrupo = resultado.updates
        varCreatesGrupo = resultado.creates
        skuReservasGrupo = resultado.skuReservas
        movimientosGrupo = resultado.movimientos
      }
    }

    if (errs.length || groupErrors.length) {
      conError++
      errs.forEach(m => errors.push({ sku: g.sku, fila, motivo: m }))
      groupErrors.forEach(e => errors.push({ sku: g.sku, fila: e.fila, motivo: e.motivo }))
      continue
    }

    for (const [sku, f] of skuReservasGrupo) skuVarVistosGlobal.set(sku, f)
    varUpdates.push(...varUpdatesGrupo)
    varCreates.push(...varCreatesGrupo)
    movimientos.push(...movimientosGrupo)

    if (movInfoProducto) {
      // Alta: producto_id null, se liga por productoSlugTemp (el sku del grupo).
      movimientos.push(
        existente
          ? { ...movInfoProducto, producto_id: existente.id, variante_id: null, referencia: REFERENCIA_IMPORT_EXTERNO }
          : { ...movInfoProducto, producto_id: null, productoSlugTemp: g.sku, variante_id: null, referencia: REFERENCIA_IMPORT_EXTERNO },
      )
    }

    if (existente) {
      updates.push({
        id: existente.id,
        nombre: nombre!,
        slug: existente.slug,
        descripcion: cellText(g.descripcion) ?? existente.descripcion,
        precio: precio!,
        precio_original,
        precio_revendedor: existente.precio_revendedor,
        categoria_id,
        subcategoria_id,
        stock,
        stock_minimo: existente.stock_minimo,
        genero: cellText(g.genero) ?? existente.genero,
        canal: existente.canal,
        isv: existente.isv,
        badge: cellText(g.badge) ?? existente.badge,
        tallas: g.tallas.length ? g.tallas : existente.tallas,
        colores: g.colores.length ? g.colores : existente.colores,
        marca: cellText(g.marca) ?? existente.marca,
        sku: g.sku,
        personalizable: boolOpt(g.personalizable) ?? existente.personalizable,
        activo: boolOpt(g.activo) ?? existente.activo,
      })
    } else {
      const slug = uniqueSlug(slugify(nombre!) || 'producto', slugs)
      slugs.push(slug)
      creates.push({
        nombre: nombre!,
        slug,
        descripcion: cellText(g.descripcion) ?? null,
        precio: precio!,
        precio_original,
        precio_revendedor: null,
        categoria_id,
        subcategoria_id,
        stock,
        stock_minimo: null,
        genero: cellText(g.genero) ?? null,
        canal: 'ambas',
        isv: '15',
        badge: cellText(g.badge) ?? null,
        tallas: g.tallas.length ? g.tallas : null,
        colores: g.colores.length ? g.colores : null,
        marca: cellText(g.marca) ?? null,
        sku: g.sku,
        personalizable: boolOpt(g.personalizable) ?? false,
        activo: boolOpt(g.activo) ?? true,
      })
    }
  }

  return {
    updates,
    creates,
    errors,
    resumen: {
      crear: creates.length,
      actualizar: updates.length,
      conError,
      variantesCrear: varCreates.length,
      variantesActualizar: varUpdates.length,
      movimientos: movimientos.length,
    },
    variantes: { updates: varUpdates, creates: varCreates },
    movimientos,
  }
}
