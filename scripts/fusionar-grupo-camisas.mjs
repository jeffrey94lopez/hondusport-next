// Fusiona UN grupo de camisas duplicadas por temporada, ya aprobado por el
// dueño (ver Task 8: scripts/reporte-duplicados-camisas.mjs, y el diseño en
// docs/superpowers/specs/2026-11-11-camisas-temporada-version-design.md,
// decisión 7: el dueño aprueba cada grupo antes de tocar producción).
//
// ⚠️  NUNCA correr sin --dry-run contra un grupo que el dueño no haya
//     aprobado explícitamente (survivor, nombre final, y a qué temporada
//     pertenece cada perdedor). Correr primero SIEMPRE con --dry-run y
//     revisar la salida antes de quitar la bandera.
//
// Uso:
//   node scripts/fusionar-grupo-camisas.mjs --dry-run   (recomendado siempre primero)
//   node scripts/fusionar-grupo-camisas.mjs             (ejecución real, solo tras aprobar el dry-run)
//
// Edita la constante GRUPO de abajo con los datos del grupo aprobado antes de
// correr (mismo patrón que scripts/import-productos.mjs: constantes al inicio
// del archivo, no flags de CLI para los datos del dominio).

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const envPath = path.join(process.cwd(), '.env.local')
const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1')
})
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }

const DRY_RUN = process.argv.includes('--dry-run')

// ─────────────────────────────────────────────────────────────────────────
// GRUPO: el único dato que cambia entre corridas. Reemplazar con los valores
// reales de un grupo ya aprobado por el dueño (Step 1 del plan) antes de
// correr. Los valores de ejemplo de abajo NO son un grupo real — son solo
// para que el archivo tenga una forma válida; el dueño nunca aprobó esto.
//
// survivorId:            id del producto que sobrevive la fusión.
// survivorNombre:        nombre final, des-estacionado (decisión 8),
//                        ej. "Real Madrid Local" en vez de "... TEMP. 24/25".
// survivorTemporadaValor: a qué fila `categorias` (tipo='temporada') pertenece
//                        el stock PROPIO del survivor (el que ya tenía antes
//                        de la fusión) — lo dice el dueño en el Step 1, no es
//                        inferible del nombre una vez normalizado.
// survivorStockPorTalla: SOLO si el survivor es un producto plano
//                        (`tallas`/`stock`, sin filas `producto_variantes`):
//                        reparto manual por talla, ej. { "M": 4, "L": 2 }.
//                        El total debe sumar producto.stock — no se puede
//                        derivar de los datos, lo da el dueño.
// losers:                un objeto por producto perdedor:
//   productoId:          id del producto que se desactiva.
//   temporadaValor:      a qué fila `categorias` (tipo='temporada') pertenece
//                        el stock de ESTE perdedor (el dueño lo dice en Step 1).
//   stockPorTalla:       igual que survivorStockPorTalla, pero solo si ESTE
//                        perdedor es un producto plano.
const GRUPO = {
  survivorId: '00000000-0000-0000-0000-000000000000',
  survivorNombre: 'Nombre Des-Estacionado',
  survivorTemporadaValor: '24/25',
  survivorStockPorTalla: null,
  losers: [
    { productoId: '00000000-0000-0000-0000-000000000001', temporadaValor: '25/26', stockPorTalla: null },
  ],
}
// ─────────────────────────────────────────────────────────────────────────

async function get(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers })
  if (!res.ok) throw new Error(`GET ${query} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

// POST/PATCH son las únicas operaciones mutantes — ambas respetan DRY_RUN:
// en dry-run solo imprimen el payload planeado y devuelven un stand-in (con
// un id ficticio para que el resto del flujo pueda seguir encadenando datos
// de forma legible), nunca tocan la base de datos.
async function post(table, body) {
  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] POST ${table}`)
    console.log(JSON.stringify(body, null, 2))
    return { ...body, id: body.id ?? `DRY-RUN-${randomUUID()}` }
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`POST ${table} -> ${res.status}: ${JSON.stringify(data)}`)
  return Array.isArray(data) ? data[0] : data
}

async function patch(table, id, body) {
  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] PATCH ${table}?id=eq.${id}`)
    console.log(JSON.stringify(body, null, 2))
    return { id, ...body }
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`PATCH ${table}?id=eq.${id} -> ${res.status}: ${JSON.stringify(data)}`)
  return Array.isArray(data) ? data[0] : data
}

async function resolverTemporadas() {
  const rows = await get('categorias?tipo=eq.temporada&select=id,valor')
  return new Map(rows.map(r => [r.valor, r.id]))
}

function resolverTemporadaId(mapa, valor) {
  const id = mapa.get(valor)
  if (!id) {
    throw new Error(
      `Temporada "${valor}" no existe en categorias (tipo='temporada'). ` +
      `Créala primero desde /admin/categorias (Task 4) antes de fusionar.`,
    )
  }
  return id
}

async function fetchProducto(id) {
  const rows = await get(
    `productos?id=eq.${id}&select=id,nombre,tallas,stock,costo,activo,` +
    `producto_variantes(id,nombre,stock,costo,version,temporada_id,activo)`,
  )
  if (rows.length === 0) throw new Error(`Producto ${id} no encontrado`)
  return rows[0]
}

// Referencia de kardex común a ambas puntas de una transferencia, para poder
// rastrear en el POS qué movimientos pertenecen a la misma fusión.
function referenciaFusion(loserId, survivorId) {
  return `fusion-camisas:${loserId}->${survivorId}`
}

// Inserta el par de movimientos 'ajuste' que documentan una transferencia de
// stock (nunca se escribe `stock` directo — CLAUDE.md). `costo` es el costo
// vigente de la variante/producto de origen; se usa igual en ambas puntas
// porque la fusión no cambia el costo, solo reubica la existencia.
async function registrarTransferenciaKardex({ loserProductoId, loserVarianteId, survivorProductoId, survivorVarianteId, cantidad, costo, loserId, survivorId }) {
  if (typeof cantidad !== 'number' || cantidad === 0) return // null (ilimitado) o 0: nada que mover en el kardex
  const referencia = referenciaFusion(loserId, survivorId)
  await post('movimientos_inventario', {
    producto_id: loserProductoId,
    variante_id: loserVarianteId,
    tipo: 'ajuste',
    cantidad: -cantidad,
    costo_resultante: costo ?? null,
    referencia,
  })
  await post('movimientos_inventario', {
    producto_id: survivorProductoId,
    variante_id: survivorVarianteId,
    tipo: 'ajuste',
    cantidad,
    costo_resultante: costo ?? null,
    referencia,
  })
}

// ── Survivor: resuelve su propio stock pre-existente (Step 2) ──
async function migrarStockDelSobreviviente(survivor, survivorTemporadaId, stockPorTalla) {
  if (survivor.producto_variantes.length === 0) {
    // Caso plano: crea una producto_variantes por talla. Es un ALTA de
    // variante (estado inicial) — no genera movimiento de kardex, misma
    // excepción documentada en CLAUDE.md para altas manuales.
    const tallas = survivor.tallas ?? []
    if (tallas.length === 0) {
      console.warn(`[ADVERTENCIA] Sobreviviente ${survivor.id} ("${survivor.nombre}") no tiene tallas ni variantes; no hay stock propio que migrar.`)
      return
    }
    for (const talla of tallas) {
      let stock = null
      if (survivor.stock != null) {
        if (tallas.length === 1) {
          // Única talla: el reparto es el stock completo, no es una
          // suposición — no hay otra talla con la que repartir.
          stock = survivor.stock
        } else if (stockPorTalla && stockPorTalla[talla] != null) {
          stock = stockPorTalla[talla]
        } else {
          throw new Error(
            `Falta survivorStockPorTalla['${talla}'] para "${survivor.nombre}" (${survivor.id}): ` +
            `tiene stock plano (${survivor.stock}) en ${tallas.length} tallas y no se puede repartir ` +
            `automáticamente. Pide al dueño el reparto por talla antes de correr esto.`,
          )
        }
      }
      await post('producto_variantes', {
        producto_id: survivor.id,
        nombre: talla,
        stock,
        version: 'fan',
        temporada_id: survivorTemporadaId,
        activo: true,
      })
    }
  } else {
    // Ya tiene producto_variantes sin los ejes nuevos: solo se les marca
    // version/temporada_id (no se mueve stock, es el mismo producto).
    for (const v of survivor.producto_variantes) {
      if (v.version == null && v.temporada_id == null) {
        await patch('producto_variantes', v.id, { version: 'fan', temporada_id: survivorTemporadaId })
      }
    }
  }
}

// ── Loser: mueve su stock bajo el survivor y genera el kardex (Step 2) ──
async function migrarLoser(loser, survivorId, temporadaId) {
  if (loser.producto_variantes.length > 0) {
    for (const v of loser.producto_variantes) {
      await registrarTransferenciaKardex({
        loserProductoId: loser.id,
        loserVarianteId: v.id,
        survivorProductoId: survivorId,
        survivorVarianteId: v.id, // misma fila, solo cambia su producto_id
        cantidad: v.stock,
        costo: v.costo,
        loserId: loser.id,
        survivorId,
      })
      await patch('producto_variantes', v.id, { producto_id: survivorId, version: 'fan', temporada_id: temporadaId })
    }
  } else {
    // Caso plano: no hay fila que reparentar, se crean filas nuevas
    // directamente bajo el survivor, y se "cierra" el stock plano del
    // perdedor con su propio ajuste de kardex.
    const tallas = loser.tallas ?? []
    if (tallas.length === 0) {
      console.warn(`[ADVERTENCIA] Perdedor ${loser.id} ("${loser.nombre}") no tiene tallas ni variantes; no hay stock que trasladar.`)
      return
    }
    let restante = loser.stock
    for (const talla of tallas) {
      let stock = null
      if (loser.stock != null) {
        if (tallas.length === 1) {
          stock = loser.stock // única talla: reparto no ambiguo
        } else if (loser.stockPorTalla && loser.stockPorTalla[talla] != null) {
          stock = loser.stockPorTalla[talla]
        } else {
          throw new Error(
            `Falta stockPorTalla['${talla}'] para el perdedor "${loser.nombre}" (${loser.id}): ` +
            `tiene stock plano (${loser.stock}) en ${tallas.length} tallas y no se puede repartir ` +
            `automáticamente. Pide al dueño el reparto por talla antes de correr esto.`,
          )
        }
        restante -= stock
      }
      const nueva = await post('producto_variantes', {
        producto_id: survivorId,
        nombre: talla,
        stock,
        version: 'fan',
        temporada_id: temporadaId,
        activo: true,
      })
      await registrarTransferenciaKardex({
        loserProductoId: loser.id,
        loserVarianteId: null, // el stock vivía en el producto plano, no en una variante
        survivorProductoId: survivorId,
        survivorVarianteId: nueva.id,
        cantidad: stock,
        costo: loser.costo,
        loserId: loser.id,
        survivorId,
      })
    }
    if (loser.stock != null) {
      if (restante !== 0) {
        console.warn(
          `[ADVERTENCIA] El reparto por talla de "${loser.nombre}" no cuadra con su stock plano ` +
          `(${loser.stock}); sobran/faltan ${restante} unidades. Verificar con el dueño antes de aprobar.`,
        )
      }
      // Cierra el stock plano del perdedor ahora que ya quedó registrado en
      // el kardex arriba (mismo patrón que fijar_stock al cambiar de
      // modalidad: el ajuste ya documentó el movimiento, esto solo refleja
      // el estado final).
      await patch('productos', loser.id, { stock: 0 })
    }
  }
}

async function fusionarGrupo(grupo) {
  console.log(DRY_RUN
    ? '=== DRY RUN: ningún cambio se enviará a producción ===\n'
    : '=== EJECUCIÓN REAL: esto va a modificar producción ===\n')

  const temporadas = await resolverTemporadas()
  const survivorTemporadaId = resolverTemporadaId(temporadas, grupo.survivorTemporadaValor)

  const survivor = await fetchProducto(grupo.survivorId)
  console.log(`Sobreviviente: "${survivor.nombre}" (${survivor.id}) — temporada propia: ${grupo.survivorTemporadaValor}`)
  await migrarStockDelSobreviviente(survivor, survivorTemporadaId, grupo.survivorStockPorTalla)

  for (const loserInput of grupo.losers) {
    const temporadaId = resolverTemporadaId(temporadas, loserInput.temporadaValor)
    const loser = await fetchProducto(loserInput.productoId)
    loser.stockPorTalla = loserInput.stockPorTalla ?? null
    console.log(`\nPerdedor: "${loser.nombre}" (${loser.id}) -> temporada ${loserInput.temporadaValor}`)
    await migrarLoser(loser, grupo.survivorId, temporadaId)
    await patch('productos', loser.id, { activo: false })
  }

  console.log(`\nRenombrando sobreviviente a "${grupo.survivorNombre}"`)
  await patch('productos', grupo.survivorId, { nombre: grupo.survivorNombre })

  console.log(DRY_RUN ? '\n=== FIN DRY RUN (nada se envió) ===' : '\n=== Fusión completada ===')
}

fusionarGrupo(GRUPO).catch(err => {
  console.error('\n[ERROR]', err.message)
  process.exit(1)
})
