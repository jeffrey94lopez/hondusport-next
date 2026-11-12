import fs from 'fs'
import path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
const env = {}
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1')
})
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }

// 1. Trae la categoría "Camisas Deportivas" y sus productos activos + variantes.
const catRes = await fetch(`${SUPABASE_URL}/rest/v1/categorias?tipo=eq.cat&valor=eq.Camisas%20Deportivas&select=id`, { headers })
const [{ id: camisasId }] = await catRes.json()

const prodRes = await fetch(
  `${SUPABASE_URL}/rest/v1/productos?categoria_id=eq.${camisasId}&activo=eq.true&select=id,nombre,precio,tallas,subcategoria_id,producto_variantes(id,nombre,precio,stock)`,
  { headers },
)
const productos = await prodRes.json()

// 2. Normaliza el nombre quitando "TEMP. NN/NN" y patrones sueltos de año/temporada.
function normalizar(nombre) {
  return nombre
    .replace(/temp\.?\s*\d{2}\/\d{2}/gi, '')
    .replace(/\b(20)?\d{2}\s*[\/-]\s*(20)?\d{2}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toUpperCase()
}

// 3. Agrupa por (nombre normalizado, subcategoria_id).
const grupos = new Map()
for (const p of productos) {
  const key = `${normalizar(p.nombre)}::${p.subcategoria_id ?? ''}`
  const lista = grupos.get(key) ?? []
  lista.push(p)
  grupos.set(key, lista)
}

// 4. Solo reporta grupos con 2+ productos (candidatos reales a fusión).
const candidatos = [...grupos.entries()]
  .filter(([, lista]) => lista.length > 1)
  .map(([key, lista]) => ({ nombreNormalizado: key.split('::')[0], productos: lista }))

console.log(JSON.stringify(candidatos, null, 2))
console.error(`\n${candidatos.length} grupos candidatos de ${productos.length} productos activos en Camisas Deportivas.`)
