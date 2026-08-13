import type { CxcFila } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

// Grupo de la cascada de CxC (nivel 1: cliente, nivel 2: documentos). `total`
// es la suma de `saldo` de los documentos del cliente — la única aritmética
// de dinero que hace esta función; todo lo demás (saldo/estado/bucket/
// dias_vencido por documento) ya viene calculado por la vista `CxcFila`.
export interface GrupoCxcCliente {
  clienteId: string
  clienteNombre: string
  filas: CxcFila[]
  total: number
}

// Agrupa documentos con saldo por cliente, preservando el orden de PRIMERA
// APARICIÓN del cliente en `filas` (no reordena por nombre ni por monto).
// Usado por la cascada de /admin/cuentas-por-cobrar (R5a): antes vivía inline
// en el componente, sin test, pese a sumar dinero (`total`) — regla con peso
// según convención del proyecto (CLAUDE.md).
export function agruparPorCliente(filas: CxcFila[]): GrupoCxcCliente[] {
  const orden: string[] = []
  const map = new Map<string, GrupoCxcCliente>()
  for (const f of filas) {
    let g = map.get(f.cliente_id)
    if (!g) {
      g = { clienteId: f.cliente_id, clienteNombre: f.cliente_nombre || 'Sin cliente', filas: [], total: 0 }
      map.set(f.cliente_id, g)
      orden.push(f.cliente_id)
    }
    g.filas.push(f)
    g.total = round2(g.total + f.saldo)
  }
  return orden.map(id => map.get(id)!)
}
