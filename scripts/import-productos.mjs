import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'

const envPath = path.join(process.cwd(), '.env.local')
const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

function isActive(val) {
  const s = String(val ?? '').toUpperCase().trim()
  return s === 'VERDADERO' || s === 'TRUE' || s === '1'
}

function agruparProductos(rows) {
  const map = new Map()

  for (const row of rows) {
    const nombre = String(row.nombre_producto ?? '').trim()
    if (!nombre) continue
    if (!isActive(row.is_active)) continue

    const precio = parseFloat(String(row.precio_venta ?? '0')) || 0
    const stock = parseInt(String(row.existencia ?? '0')) || 0
    const talla = String(row.tamano ?? '').trim()
    const color = String(row.color ?? '').trim()

    if (map.has(nombre)) {
      const p = map.get(nombre)
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

const file = process.argv[2] ?? 'Productos_2026-6-3.xlsx'
const buffer = fs.readFileSync(file)
const workbook = XLSX.read(buffer, { type: 'buffer' })
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet)

const productos = agruparProductos(rows)
console.log(`Productos a importar: ${productos.length}`)

const payload = productos.map(p => ({
  nombre: p.nombre,
  precio: p.precio,
  stock: p.stock,
  tallas: p.tallas.length > 0 ? p.tallas : null,
  colores: p.colores.length > 0 ? p.colores : null,
  marca: p.marca || null,
  sku: p.sku || null,
  descripcion: p.descripcion || null,
  activo: true,
}))

const res = await fetch(`${SUPABASE_URL}/rest/v1/productos`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(payload),
})

const data = await res.json()
if (!res.ok) {
  console.error('ERROR', res.status, JSON.stringify(data, null, 2))
  process.exit(1)
}
console.log(`Importados/actualizados: ${data.length} de ${productos.length}`)
