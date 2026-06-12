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

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

function isActive(val) {
  const s = String(val ?? '').toUpperCase().trim()
  return s === 'VERDADERO' || s === 'TRUE' || s === '1'
}

const file = 'Productos_2026-6-3.xlsx'
const buffer = fs.readFileSync(file)
const workbook = XLSX.read(buffer, { type: 'buffer' })
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet)

const tallas = new Set()
for (const row of rows) {
  if (!isActive(row.is_active)) continue
  const t = String(row.tamano ?? '').trim()
  if (t) tallas.add(t)
}
const tallasList = [...tallas].sort()
console.log(`Tallas únicas a crear: ${tallasList.length}`)

// 1. Crear categoria "General" (tipo=cat) para los productos importados (CAT. GENERAL en el excel)
const catRes = await fetch(`${SUPABASE_URL}/rest/v1/categorias`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify([{ tipo: 'cat', valor: 'General', categorias_padre: null, orden: 2, activo: true }]),
})
const catData = await catRes.json()
if (!catRes.ok) {
  console.error('ERROR creando categoria General', catRes.status, JSON.stringify(catData, null, 2))
  process.exit(1)
}
const generalCatId = catData[0].id
console.log('Categoria "General" creada:', generalCatId)

// 2. Crear tallas (tipo=talla) con categorias_padre=["General"]
const tallasPayload = tallasList.map((valor, idx) => ({
  tipo: 'talla',
  valor,
  categorias_padre: ['General'],
  orden: idx + 1,
  activo: true,
}))

const tallaRes = await fetch(`${SUPABASE_URL}/rest/v1/categorias`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify(tallasPayload),
})
const tallaData = await tallaRes.json()
if (!tallaRes.ok) {
  console.error('ERROR creando tallas', tallaRes.status, JSON.stringify(tallaData, null, 2))
  process.exit(1)
}
console.log(`Tallas creadas: ${tallaData.length}`)

// 3. Asignar categoria_id="General" a los productos importados (categoria_id IS NULL)
const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/productos?categoria_id=is.null`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify({ categoria_id: generalCatId }),
})
const updateData = await updateRes.json()
if (!updateRes.ok) {
  console.error('ERROR actualizando productos', updateRes.status, JSON.stringify(updateData, null, 2))
  process.exit(1)
}
console.log(`Productos actualizados con categoria "General": ${updateData.length}`)
