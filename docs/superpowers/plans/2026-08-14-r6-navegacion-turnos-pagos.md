# R6 — Navegación del admin, pantalla de Turnos y pago a proveedor — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de checkbox (`- [ ]`) para seguimiento.

**Goal:** Reorganizar el menú del admin por flujo de trabajo, sacar los turnos de caja del modal a una pantalla propia con historial y detalle, y eliminar el doble tecleo del monto en el pago a proveedor.

**Architecture:** La reorganización del menú es una edición de datos en un solo archivo (`NAV_GROUPS` de `Sidebar.tsx`): ninguna pantalla cambia de URL, así que no se tocan `revalidatePath()`, enlaces internos ni marcadores. La pantalla de Turnos es una vista nueva sobre los Server Actions y las funciones puras que ya usa el mostrador (`abrirSesion`/`cerrarSesion`, `esperadoCaja`) — no reimplementa el arqueo. El cambio de CxP mueve la suma y las reglas de validez del formulario a `lib/cxp/` como funciones puras con test, y aprovecha que la RPC `registrar_pago_proveedor` ya deriva el total del pago en el servidor a partir de las aplicaciones.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Supabase (PostgREST + RPC), CSS Modules, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-r6-navegacion-turnos-pagos-design.md`

## Global Constraints

- **Rutas estables.** Ninguna pantalla existente cambia de URL. La reorganización es de menú. Las únicas rutas nuevas son `/admin/pos/turnos` y `/admin/pos/turnos/[id]`.
- **Sin migraciones.** Esta ola no lleva ninguna. Todo sale de tablas existentes (`sesiones_caja`, `cajas`, `documentos`, `compra_saldos`).
- **Dinero:** todo importe se muestra con `formatPrice()` de `@/lib/store/format`, 2 decimales, Lempiras `L.`. Ningún total se recalcula fuera de la lógica pura testeada. El arqueo usa `esperadoCaja()` de `@/lib/pos/emision` — nunca una segunda cuenta.
- **Lógica de negocio con peso (dinero, integridad) va en `lib/` como función pura con test en `lib/<área>/tests/`**, nunca embebida en el componente.
- **Especificidad CSS:** `app/globals.css` tiene una regla global sobre `input[type="text"]`, `input[type="email"]`, `input[type="number"]`, `input[type="password"]`, `input[type="url"]`, `input:not([type])`, `textarea` y `select` con especificidad (0,1,1) que pisa una clase de CSS Module sola (0,1,0). Todo cambio de fondo, borde, padding, ancho o tamaño en un campo usa **selector compuesto de dos clases** (0,2,0). Matices: `input[type="date"]` NO está en esa lista global, y una clase sola SÍ le gana al selector de elemento `select`.
- **Patrón visual:** las pantallas de tabla consumen `app/admin/tabla-admin.module.css` con `composes: X from '…'` como **primera declaración** de la regla. Referencia de consumo: `app/admin/envios/envios.module.css`.
- **Botones:** los colores del CTA vienen de las clases globales `btnMerlinPrimary` / `btnMerlinSecondary` / `btnMerlinTertiary` / `btnMerlinChip` aplicadas en el JSX; las clases de módulo aportan solo layout. No duplicar colores.
- **Listados:** todo `select()` de listado lleva `.limit()` explícito. Sin él, PostgREST aplica su tope por defecto y trunca en silencio.
- **Tokens Merlin** (`app/merlin.css`, mapeo semántico en `:root` de `app/globals.css`): no hardcodear valores que ya tienen token.
- **Idioma:** UI, nombres de dominio y mensajes de commit en español, formato convencional (`feat(admin): …`, `fix(admin): …`).
- Al cerrar cada tarea: `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run lint`. Reportar resultados reales.
- **Nota de entorno:** `npm run build` puede fallar con `EPERM ... unlink '.next\...'` porque el repo está en OneDrive y bloquea archivos. Si pasa: `rm -rf .next` y reintentar. `npm run lint` arrastra ~24000 problemas preexistentes provenientes de `.claude/` y `coverage/` (no son código del proyecto); lo que importa es no introducir problemas nuevos en `app/`, `components/` o `lib/`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `components/admin/icons.tsx` | **Modificar** — agregar `IconTurnos` y su clave `turnos` en `ICONOS`. |
| `components/admin/Sidebar.tsx` | **Modificar** — nuevo `NAV_GROUPS`, entradas sueltas para Clientes y Reportes, colapso por defecto y clave de `localStorage` v2. |
| `lib/pos/turnos.ts` | **Crear** — funciones puras del historial de turnos: filtro y totales. |
| `lib/pos/tests/turnos.test.ts` | **Crear** — tests de lo anterior. |
| `app/admin/pos/turnos/page.tsx` | **Crear** — Server Component: carga turno abierto, cajas e historial. |
| `app/admin/pos/turnos/TurnosClient.tsx` | **Crear** — Client Component: card de turno actual, filtros e historial. |
| `app/admin/pos/turnos/turnos.module.css` | **Crear** — estilos, consumiendo `tabla-admin.module.css`. |
| `app/admin/pos/turnos/[id]/page.tsx` | **Crear** — Server Component del detalle de un turno. |
| `app/admin/pos/turnos/[id]/TurnoDetalleView.tsx` | **Crear** — Client Component del detalle (arqueo + documentos). |
| `lib/cxp/cxp.ts` | **Modificar** — agregar `sumaAplicaciones` y `validarAplicaciones`. |
| `lib/cxp/tests/cxp.test.ts` | **Modificar** — tests de las dos funciones nuevas. |
| `app/admin/cuentas-por-pagar/PagoModal.tsx` | **Modificar** — saldo total en modo auto; sin campo de monto general en modo manual. |
| `app/admin/cuentas-por-pagar/cxp.module.css` | **Modificar** — estilos del total calculado y del saldo pendiente. |

---

## Task 1: Reorganización del menú

**Files:**
- Modify: `components/admin/icons.tsx:59-63` (agregar `IconTurnos` junto a los demás), `components/admin/icons.tsx:92-113` (registro `ICONOS`)
- Modify: `components/admin/Sidebar.tsx:9-59` (clave de localStorage y `NAV_GROUPS`), `components/admin/Sidebar.tsx:151-231` (render de entradas sueltas)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: la ruta `/admin/pos/turnos` queda enlazada en el menú antes de existir (la crea la Task 3). Entre Task 1 y Task 3 ese enlace da 404 — es aceptable y esperado dentro de la rama; **no** crear un stub para taparlo.

- [ ] **Step 1: Agregar el icono de Turnos**

En `components/admin/icons.tsx`, después de `IconMovimientos` (línea 60), agregar:

```tsx
export const IconTurnos = ({ className }: IconProps) =>
  base(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, className)
```

Y en el objeto `ICONOS` (línea 92), agregar la clave después de `movimientos`:

```tsx
  turnos: IconTurnos,
```

- [ ] **Step 2: Reescribir NAV_GROUPS**

En `components/admin/Sidebar.tsx`, reemplazar el bloque completo `const NAV_GROUPS = [ … ] as const satisfies …` (líneas 14-59) por:

```tsx
const NAV_GROUPS = [
  {
    label: 'PUNTO DE VENTA',
    items: [
      { href: '/admin/pos', icon: 'pos', label: 'POS' },
      { href: '/admin/pos/turnos', icon: 'turnos', label: 'Turnos' },
    ],
  },
  {
    label: 'INGRESOS',
    items: [
      { href: '/admin/pos/documentos', icon: 'documentos', label: 'Documentos' },
      { href: '/admin/cotizaciones', icon: 'cotizaciones', label: 'Cotizaciones' },
      { href: '/admin/cuentas-por-cobrar', icon: 'cxc', label: 'Cuentas por cobrar' },
    ],
  },
  {
    label: 'EGRESOS',
    items: [
      { href: '/admin/compras', icon: 'compras', label: 'Compras' },
      { href: '/admin/cuentas-por-pagar', icon: 'cxp', label: 'Cuentas por pagar' },
    ],
  },
  {
    label: 'INVENTARIO',
    items: [
      { href: '/admin/productos', icon: 'productos', label: 'Productos' },
      { href: '/admin/inventario', icon: 'inventario', label: 'Inventario físico' },
      { href: '/admin/movimientos', icon: 'movimientos', label: 'Movimientos' },
    ],
  },
  {
    label: 'TIENDA',
    items: [
      { href: '/admin/pedidos', icon: 'pedidos', label: 'Pedidos', badge: true },
      { href: '/admin/categorias', icon: 'categorias', label: 'Categorías' },
      { href: '/admin/banners', icon: 'banners', label: 'Banners' },
      { href: '/admin/cupones', icon: 'cupones', label: 'Cupones' },
      { href: '/admin/envios', icon: 'envios', label: 'Envíos' },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string
  items: ReadonlyArray<{ href: string; icon: IconoKey; label: string; badge?: boolean }>
}>

// Entradas sueltas del pie de la navegación (fuera de todo grupo): un grupo
// colapsable de un solo hijo solo agrega un clic. Se pintan con el mismo
// markup que INICIO.
const SUELTAS = [
  { href: '/admin/clientes', icon: 'clientes' as IconoKey, label: 'Clientes' },
  { href: '/admin/reportes', icon: 'reportes' as IconoKey, label: 'Reportes' },
]
```

Ojo: `/admin/pos/turnos` anida bajo `/admin/pos`, igual que `/admin/pos/documentos`. El `isActive` existente (líneas 121-128) ya resuelve esto eligiendo el href más largo entre los que matchean — **no hay que tocarlo**, pero sí verificarlo en el Step 6.

- [ ] **Step 3: Cambiar el default de colapso y la clave persistida**

En `components/admin/Sidebar.tsx` línea 10, reemplazar:

```tsx
const GRUPOS_KEY = 'hs_admin_nav_groups'
```

por:

```tsx
// v2: las etiquetas de grupo cambiaron de contenido y el valor por defecto se
// invirtió (ahora arrancan colapsados salvo PUNTO DE VENTA). Con la clave vieja,
// un navegador con estado guardado seguiría aplicando el mapa anterior y el
// usuario no vería el cambio. La clave vieja se deja morir sola: el estado de
// colapso de un menú no vale una migración.
const GRUPOS_KEY = 'hs_admin_nav_v2'

// Grupos colapsados por defecto salvo PUNTO DE VENTA, que es donde se trabaja
// a diario. Se usa como valor inicial y como fallback cuando no hay nada
// guardado para un grupo concreto.
const GRUPO_COLAPSADO_DEFAULT: Record<string, boolean> = {
  'PUNTO DE VENTA': false,
  INGRESOS: true,
  EGRESOS: true,
  INVENTARIO: true,
  TIENDA: true,
}
```

En la línea 78, cambiar el estado inicial:

```tsx
  const [gruposColapsados, setGruposColapsados] = useState<Record<string, boolean>>(GRUPO_COLAPSADO_DEFAULT)
```

Y en la línea 167, cambiar el fallback por grupo:

```tsx
          const grupoColapsado = grupoTieneActivo ? false : (gruposColapsados[group.label] ?? GRUPO_COLAPSADO_DEFAULT[group.label] ?? true)
```

El comentario del guard de montaje (líneas 80-84) dice "expandido, sin grupos plegados" — actualizarlo a: "el SSR siempre pinta el estado por defecto (sidebar expandido, grupos según `GRUPO_COLAPSADO_DEFAULT`)".

- [ ] **Step 4: Pintar las entradas sueltas**

En `components/admin/Sidebar.tsx`, justo después del `</div>` que cierra el `.map` de `NAV_GROUPS` y antes de `</nav>` (línea 230-231), agregar:

```tsx
        {SUELTAS.map(entrada => {
          const Icono = ICONOS[entrada.icon]
          return (
            <Link
              key={entrada.href}
              href={entrada.href}
              className={`${styles.item} ${isActive(entrada.href) ? styles.active : ''}`}
              title={collapsed ? entrada.label : undefined}
            >
              <span className={styles.icon}><Icono className="iconoMerlin" /></span>
              {!collapsed && <span className={styles.itemLabel}>{entrada.label}</span>}
            </Link>
          )
        })}
```

- [ ] **Step 5: Incluir las sueltas en el prefix-matching**

`ALL_HREFS` (línea 119) solo recorre `NAV_GROUPS`. Si `/admin/clientes` y `/admin/reportes` no están ahí, `isActive` cae al `pathname === href` del caso sin matches y **no resaltaría en una subruta** como `/admin/reportes/ganancias`. Reemplazar la línea 119 por:

```tsx
  const ALL_HREFS = [
    ...NAV_GROUPS.flatMap(g => g.items.map(i => i.href)),
    ...SUELTAS.map(s => s.href),
  ]
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
```
Esperado: sin errores. Si `ICONOS.turnos` no existe, el `satisfies` de `NAV_GROUPS` falla aquí — es la red que valida el Step 1.

```bash
npm run build
```
Esperado: compila. Recuerda: si sale `EPERM ... unlink '.next\...'`, `rm -rf .next` y reintenta.

Levanta el server y comprueba manualmente en el navegador:
- Los 5 grupos aparecen en el orden PUNTO DE VENTA, INGRESOS, EGRESOS, INVENTARIO, TIENDA, seguidos de Clientes y Reportes sueltos.
- Al cargar `/admin`, solo PUNTO DE VENTA está expandido.
- En `/admin/reportes/ganancias`, la entrada Reportes está resaltada.
- En `/admin/pos/documentos`, resalta Documentos y **no** POS.
- Plegar un grupo, recargar, y comprobar que sigue plegado.

- [ ] **Step 7: Commit**

```bash
git add components/admin/icons.tsx components/admin/Sidebar.tsx
git commit -m "feat(admin): reorganizar el menu por flujo de trabajo (R6)"
```

---

## Task 2: Lógica pura del historial de turnos

**Files:**
- Create: `lib/pos/turnos.ts`
- Test: `lib/pos/tests/turnos.test.ts`

**Interfaces:**
- Consumes: el tipo `SesionCaja` de `@/types` (ya existe: `{ id, caja_id, estado, monto_inicial, abierta_at, cerrada_at, monto_esperado, monto_contado, diferencia, notas, usuario }`, con `abierta_at`/`cerrada_at` como ISO string).
- Produces:
  - `export interface FiltroTurnos { desde: string; hasta: string; cajaId: string; usuario: string }` — `desde`/`hasta` en `YYYY-MM-DD`, cadena vacía = sin filtro; `cajaId`/`usuario` cadena vacía = todos.
  - `export function filtrarTurnos(turnos: SesionCaja[], filtro: FiltroTurnos): SesionCaja[]`
  - `export function totalesTurnos(turnos: SesionCaja[]): { inicial: number; esperado: number; contado: number; diferencia: number }`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/pos/tests/turnos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filtrarTurnos, totalesTurnos, type FiltroTurnos } from '../turnos'
import type { SesionCaja } from '@/types'

function turno(over: Partial<SesionCaja>): SesionCaja {
  return {
    id: 'x', caja_id: 'c1', estado: 'cerrada', monto_inicial: 100,
    abierta_at: '2026-08-10T14:00:00Z', cerrada_at: '2026-08-10T22:00:00Z',
    monto_esperado: 500, monto_contado: 500, diferencia: 0,
    notas: null, usuario: 'ana@hs.com', ...over,
  }
}

const SIN_FILTRO: FiltroTurnos = { desde: '', hasta: '', cajaId: '', usuario: '' }

describe('filtrarTurnos', () => {
  it('sin filtros devuelve todo', () => {
    const t = [turno({ id: 'a' }), turno({ id: 'b' })]
    expect(filtrarTurnos(t, SIN_FILTRO).map(x => x.id)).toEqual(['a', 'b'])
  })

  it('filtra por caja y por usuario', () => {
    const t = [
      turno({ id: 'a', caja_id: 'c1', usuario: 'ana@hs.com' }),
      turno({ id: 'b', caja_id: 'c2', usuario: 'ana@hs.com' }),
      turno({ id: 'c', caja_id: 'c1', usuario: 'beto@hs.com' }),
    ]
    expect(filtrarTurnos(t, { ...SIN_FILTRO, cajaId: 'c1' }).map(x => x.id)).toEqual(['a', 'c'])
    expect(filtrarTurnos(t, { ...SIN_FILTRO, usuario: 'ana@hs.com' }).map(x => x.id)).toEqual(['a', 'b'])
  })

  // El rango se compara contra el DÍA de apertura en UTC. `hasta` es inclusivo:
  // un turno abierto el mismo día de `hasta` debe entrar, si no el usuario
  // filtra "hasta hoy" y no ve el turno de hoy.
  it('el rango de fechas es inclusivo en ambos extremos', () => {
    const t = [
      turno({ id: 'a', abierta_at: '2026-08-09T23:00:00Z' }),
      turno({ id: 'b', abierta_at: '2026-08-10T01:00:00Z' }),
      turno({ id: 'c', abierta_at: '2026-08-11T12:00:00Z' }),
    ]
    const r = filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-11' })
    expect(r.map(x => x.id)).toEqual(['b', 'c'])
  })

  it('un turno abierto (sin cierre) entra igual por su fecha de apertura', () => {
    const t = [turno({ id: 'a', estado: 'abierta', cerrada_at: null, monto_esperado: null, monto_contado: null, diferencia: null })]
    expect(filtrarTurnos(t, { ...SIN_FILTRO, desde: '2026-08-10', hasta: '2026-08-10' })).toHaveLength(1)
  })
})

describe('totalesTurnos', () => {
  it('suma los cuatro totales tratando null como cero', () => {
    const t = [
      turno({ monto_inicial: 100, monto_esperado: 500.25, monto_contado: 500.25, diferencia: 0 }),
      turno({ monto_inicial: 50, monto_esperado: null, monto_contado: null, diferencia: null }),
      turno({ monto_inicial: 25.5, monto_esperado: 300.1, monto_contado: 295.1, diferencia: -5 }),
    ]
    expect(totalesTurnos(t)).toEqual({ inicial: 175.5, esperado: 800.35, contado: 795.35, diferencia: -5 })
  })

  it('sin turnos devuelve ceros', () => {
    expect(totalesTurnos([])).toEqual({ inicial: 0, esperado: 0, contado: 0, diferencia: 0 })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
npx vitest run lib/pos/tests/turnos.test.ts
```
Esperado: FALLA con un error de resolución del módulo `../turnos` (no existe todavía).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/pos/turnos.ts`:

```ts
import type { SesionCaja } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface FiltroTurnos {
  desde: string   // YYYY-MM-DD, '' = sin límite inferior
  hasta: string   // YYYY-MM-DD, '' = sin límite superior (inclusivo)
  cajaId: string  // '' = todas
  usuario: string // '' = todos
}

// Día UTC (YYYY-MM-DD) de un timestamp ISO. Se compara como cadena porque el
// formato es lexicográficamente ordenable, y así el filtro no depende de la
// zona horaria del navegador (una comparación con Date local movería el corte
// de día y dejaría fuera turnos de la madrugada).
function diaUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

export function filtrarTurnos(turnos: SesionCaja[], filtro: FiltroTurnos): SesionCaja[] {
  return turnos.filter(t => {
    const dia = diaUTC(t.abierta_at)
    if (filtro.desde && dia < filtro.desde) return false
    if (filtro.hasta && dia > filtro.hasta) return false
    if (filtro.cajaId && t.caja_id !== filtro.cajaId) return false
    if (filtro.usuario && t.usuario !== filtro.usuario) return false
    return true
  })
}

export function totalesTurnos(
  turnos: SesionCaja[],
): { inicial: number; esperado: number; contado: number; diferencia: number } {
  let inicial = 0, esperado = 0, contado = 0, diferencia = 0
  for (const t of turnos) {
    inicial += t.monto_inicial
    esperado += t.monto_esperado ?? 0
    contado += t.monto_contado ?? 0
    diferencia += t.diferencia ?? 0
  }
  return {
    inicial: round2(inicial),
    esperado: round2(esperado),
    contado: round2(contado),
    diferencia: round2(diferencia),
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
npx vitest run lib/pos/tests/turnos.test.ts
```
Esperado: PASA, 6 tests.

- [ ] **Step 5: Correr la suite completa y el typecheck**

```bash
npm test
npx tsc --noEmit
```
Esperado: toda la suite verde (los 1695 tests previos más los 6 nuevos), typecheck sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/pos/turnos.ts lib/pos/tests/turnos.test.ts
git commit -m "feat(pos): filtro y totales del historial de turnos (R6)"
```

---

## Task 3: Pantalla de Turnos

**Files:**
- Create: `app/admin/pos/turnos/page.tsx`
- Create: `app/admin/pos/turnos/TurnosClient.tsx`
- Create: `app/admin/pos/turnos/turnos.module.css`

**Interfaces:**
- Consumes:
  - `filtrarTurnos`, `totalesTurnos`, `FiltroTurnos` de `@/lib/pos/turnos` (Task 2).
  - `abrirSesion(cajaId: string, montoInicial: number): Promise<PosResult<{ sesionId: string }>>` y `cerrarSesion(sesionId: string, montoContado: number, notas: string): Promise<PosResult<{ esperado: number; diferencia: number }>>` de `@/app/admin/pos/actions`. `PosResult<T>` es `{ ok: true; data: T } | { ok: false; error: string }`.
  - `esperadoCaja(montoInicial, docs, cobros?, devoluciones?)` de `@/lib/pos/emision`, que devuelve `{ efectivoEsperado, porMetodo, cobrosPorMetodo, devolucionesPorMetodo }`.
  - `parseMoneyInput(s: string): number` de `@/app/admin/pos/pos-helpers`.
  - El módulo compartido `app/admin/tabla-admin.module.css`.
- Produces: la ruta `/admin/pos/turnos`, que la Task 1 ya enlaza desde el menú.

- [ ] **Step 1: Crear el Server Component**

Crear `app/admin/pos/turnos/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase-server'
import type { Caja, SesionCaja } from '@/types'
import TurnosClient from './TurnosClient'

export const dynamic = 'force-dynamic'

export default async function TurnosPage() {
  const supabase = await createClient()

  const [{ data: cajas }, { data: sesionesAbiertas }, { data: historial }] = await Promise.all([
    supabase.from('cajas').select('*').eq('activo', true).order('nombre'),
    supabase.from('sesiones_caja').select('*').eq('estado', 'abierta'),
    // `.limit()` explícito: sin él PostgREST aplica su tope por defecto y el
    // historial se truncaría en silencio.
    supabase
      .from('sesiones_caja')
      .select('*')
      .order('abierta_at', { ascending: false })
      .limit(2000),
  ])

  return (
    <TurnosClient
      cajas={(cajas ?? []) as Caja[]}
      sesionesAbiertas={(sesionesAbiertas ?? []) as SesionCaja[]}
      historial={(historial ?? []) as SesionCaja[]}
    />
  )
}
```

Antes de escribirlo, confirma el nombre exacto del tipo de caja abriendo `types/index.ts` y buscando `interface Caja`. Si el proyecto lo llama distinto, usa el nombre real — **no** inventes un tipo nuevo ni uses `any`.

- [ ] **Step 2: Crear el Client Component**

Crear `app/admin/pos/turnos/TurnosClient.tsx`. Requisitos concretos:

- **Card de turno actual** por cada sesión abierta: nombre de la caja (resuelto contra `cajas` por `caja_id` — `sesiones_caja` solo trae el id), usuario, hora de apertura formateada, `monto_inicial` con `formatPrice`, y un botón "Cerrar turno" que abre el flujo de cierre.
- Si `sesionesAbiertas` está vacío: una card con un `<select>` de caja, un campo de monto inicial y un botón "Abrir turno" que llama `abrirSesion(cajaId, parseMoneyInput(montoStr))`. Tras `ok`, `router.refresh()`.
- **Cerrar turno**: reusa el Server Action `cerrarSesion(sesionId, parseMoneyInput(contadoStr), notas)`. No recalcules el esperado a mano: `cerrarSesion` ya lo computa en el servidor con `esperadoCaja` y devuelve `{ esperado, diferencia }`. Muestra el resultado devuelto y luego `router.refresh()`.
- **Filtros**: cuatro controles (`desde`, `hasta` de tipo `date`; `cajaId` y `usuario` como `<select>`), en estado local, aplicados con `filtrarTurnos(historial, filtro)` dentro de un `useMemo`. Las opciones de usuario salen de los usuarios distintos presentes en `historial` (`[...new Set(historial.map(t => t.usuario).filter(Boolean))]`).
- **Tabla del historial**, con las columnas: Caja · Usuario · Apertura · Cierre · Inicial · Esperado · Contado · Diferencia. El número de cada fila enlaza a `/admin/pos/turnos/${t.id}`.
- La diferencia se colorea igual que en `HistorialModal`: negativa (faltante) en `var(--danger)`, positiva (sobrante) en `var(--success)`, cero en el color de texto normal.
- **Pie de totales** con `totalesTurnos(turnosFiltrados)`, en las mismas cuatro columnas de dinero.
- Todos los importes con `formatPrice()`. Ningún cálculo de dinero fuera de `totalesTurnos` y de lo que devuelve `cerrarSesion`.

Lee `app/admin/pos/components/HistorialModal.tsx` como referencia de cómo se pintan hoy estas mismas columnas y el color de la diferencia, para no divergir.

- [ ] **Step 3: Crear el módulo CSS**

Crear `app/admin/pos/turnos/turnos.module.css` consumiendo el patrón compartido:

```css
.page { composes: page from '../../tabla-admin.module.css'; }
.topbar { composes: topbar from '../../tabla-admin.module.css'; }
.title { composes: title from '../../tabla-admin.module.css'; }
.subtitle { composes: subtitle from '../../tabla-admin.module.css'; }
.filtros { composes: filtros from '../../tabla-admin.module.css'; }
.tableWrap { composes: tableWrap from '../../tabla-admin.module.css'; overflow-x: auto; }
.table { composes: tabla from '../../tabla-admin.module.css'; }
.table tr:last-child td { border-bottom: none; }
.table td { vertical-align: middle; white-space: nowrap; }
.empty { composes: empty from '../../tabla-admin.module.css'; }
```

`overflow-x: auto` es obligatorio: el compartido trae `overflow: hidden` para que el radio de la card recorte la tabla, y con `nowrap` en las celdas de dinero las últimas columnas se recortarían sin scroll (esta regresión ya ocurrió en R5b).

Para los campos de los filtros y del formulario de apertura, usa **selectores compuestos**:

```css
.filtros .filtroInput,
.filtros .filtroSelect {
  background: var(--bg-card);
  border: 1px solid var(--border-input);
  border-radius: var(--radius-input);
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: var(--text);
}
```

Los botones aportan solo layout desde el módulo; el color lo dan `btnMerlinPrimary` / `btnMerlinSecondary` en el JSX.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes.

Levanta el server y comprueba en `/admin/pos/turnos`:
- Con un turno abierto, la card lo muestra con su caja y monto inicial.
- Sin turno abierto, aparece el formulario de apertura.
- Los filtros reducen la tabla y el pie de totales cambia en consecuencia.
- La diferencia negativa sale en rojo y la positiva en verde.
- El enlace de una fila lleva a `/admin/pos/turnos/<id>` (404 hasta la Task 4 — esperado).

- [ ] **Step 5: Commit**

```bash
git add app/admin/pos/turnos
git commit -m "feat(pos): pantalla de turnos con historial y filtros (R6)"
```

---

## Task 4: Detalle de un turno

**Files:**
- Create: `app/admin/pos/turnos/[id]/page.tsx`
- Create: `app/admin/pos/turnos/[id]/TurnoDetalleView.tsx`
- Modify: `app/admin/pos/turnos/turnos.module.css` (agregar las clases del detalle)

**Interfaces:**
- Consumes: `esperadoCaja` de `@/lib/pos/emision`; el módulo `turnos.module.css` de la Task 3.
- Produces: la ruta `/admin/pos/turnos/[id]`, a la que enlaza la tabla de la Task 3.

- [ ] **Step 1: Crear el Server Component**

Crear `app/admin/pos/turnos/[id]/page.tsx`. Debe:

- Recibir `params` como `Promise<{ id: string }>` y hacer `const { id } = await params` (App Router de Next 16).
- Cargar la sesión por id; si no existe, `notFound()` de `next/navigation`.
- Cargar la caja por `caja_id` para resolver el nombre.
- Cargar los documentos del turno con sus pagos, con exactamente el mismo `select` que usa `cerrarSesion` en `app/admin/pos/actions.ts:199-203`:
  `.from('documentos').select('estado, total, documento_pagos(monto, metodos_pago(tipo))').eq('sesion_id', id)`
  más los campos que el detalle necesita mostrar (`id`, `numero`, `created_at`). Añade `.limit(5000)`.
- Antes de escribirlo, **lee `app/admin/pos/actions.ts` alrededor de la línea 199** y replica el mapeo de la relación embebida: el comentario que hay ahí explica que sin tipos `Database` generados, el cliente infiere `documento_pagos → metodos_pago` como arreglo, pero PostgREST devuelve un objeto para ese embed to-one. Si no replicas ese mapeo, `esperadoCaja` recibe pagos mal formados y el desglose sale en cero.

- [ ] **Step 2: Crear la vista del detalle**

Crear `app/admin/pos/turnos/[id]/TurnoDetalleView.tsx`, con tres bloques:

1. **Cabecera:** caja, usuario, apertura y cierre, y un enlace de vuelta a `/admin/pos/turnos`.
2. **Arqueo:** `monto_inicial`, efectivo esperado, `monto_contado` y la diferencia rotulada igual que `CierreModal` — `Cuadra exacto` si es 0, `Sobrante` si es positiva, `Faltante` si es negativa, mostrando el valor absoluto. Debajo, el desglose por método de pago que devuelve `esperadoCaja(...).porMetodo`.
3. **Documentos del turno:** tabla con número, hora, estado y total, con `.limit(5000)` ya aplicado en el servidor y el número enlazando a `/admin/pos/documento/${d.id}`.

El desglose **debe** calcularse con `esperadoCaja()`, la misma función que usa `CierreModal` y `cerrarSesion`. No sumar pagos a mano.

Para un turno cerrado, `monto_esperado` y `diferencia` ya están congelados en la fila de `sesiones_caja`: **muestra esos valores guardados**, no los recalculados. El recálculo con `esperadoCaja` es para el desglose por método, que no se persiste. Para un turno todavía abierto no hay valores guardados: ahí sí se muestra el esperado vivo de `esperadoCaja`, rotulado como estimado.

- [ ] **Step 3: Agregar las clases del detalle al módulo CSS**

En `app/admin/pos/turnos/turnos.module.css`, agregar las clases que use la vista (cards de arqueo, filas de desglose, etiqueta de diferencia). Reutiliza tokens: `var(--bg-card)`, `var(--border-light)`, `var(--radius-card)`, `var(--shadow-card)`, `var(--danger)`, `var(--success)`. No hardcodees colores.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
```
Esperado: los tres verdes.

En el navegador, abre el detalle de un turno cerrado real y comprueba que el esperado, el contado y la diferencia coinciden **exactamente** con lo que muestra el modal de historial del POS para ese mismo turno. Si divergen, el mapeo de la relación embebida del Step 1 está mal.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/pos/turnos"
git commit -m "feat(pos): detalle de turno con arqueo y documentos (R6)"
```

---

## Task 5: Lógica pura del pago a proveedor

**Files:**
- Modify: `lib/cxp/cxp.ts` (agregar al final, después de `excedeLimite`)
- Test: `lib/cxp/tests/cxp.test.ts` (agregar dos bloques `describe`)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `export function sumaAplicaciones(montos: number[]): number`
  - `export function validarAplicaciones(aplicaciones: { numero: string; monto: number; saldo: number }[]): string | null` — devuelve el mensaje del problema, o `null` si es válido.

- [ ] **Step 1: Escribir los tests que fallan**

El archivo ya importa de `'../cxp'` en su línea 2. **Extiende ese import** en vez de agregar uno segundo:

```ts
import { saldoCompra, estadoPago, bucketAntiguedad, distribuirPago, excedeLimite, sumaAplicaciones, validarAplicaciones } from '../cxp'
```

Y agrega al final del archivo:

```ts
describe('sumaAplicaciones', () => {
  it('suma redondeando a 2 decimales', () => {
    expect(sumaAplicaciones([100.1, 200.25, 0.05])).toBe(300.4)
  })

  it('sin montos devuelve cero', () => {
    expect(sumaAplicaciones([])).toBe(0)
  })

  // Sin redondeo, 0.1 + 0.2 da 0.30000000000000004 y el total mostrado
  // divergiría del que registra el servidor.
  it('no arrastra error de coma flotante', () => {
    expect(sumaAplicaciones([0.1, 0.2])).toBe(0.3)
  })
})

describe('validarAplicaciones', () => {
  it('acepta un reparto válido', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 100, saldo: 500 },
      { numero: 'C-002', monto: 0, saldo: 200 },
    ])).toBeNull()
  })

  it('rechaza si todo es cero', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 0, saldo: 500 },
    ])).toBe('Aplica un monto a por lo menos una compra.')
  })

  it('rechaza una lista vacía', () => {
    expect(validarAplicaciones([])).toBe('Aplica un monto a por lo menos una compra.')
  })

  // Un monto negativo invalida TODO el formulario, no solo su línea: el
  // llamador filtra las líneas <= 0 antes de enviar, así que una fila en -50
  // junto a otra en 150 registraría 150 mientras el total mostrado dice 100.
  it('rechaza cualquier monto negativo', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: -50, saldo: 500 },
      { numero: 'C-002', monto: 150, saldo: 500 },
    ])).toBe('Los montos no pueden ser negativos.')
  })

  it('rechaza un abono que excede el saldo de su compra, nombrandola', () => {
    expect(validarAplicaciones([
      { numero: 'C-007', monto: 600, saldo: 500 },
    ])).toBe('El abono a C-007 excede su saldo.')
  })

  // Tolerancia de medio centavo, igual que el resto del módulo.
  it('tolera medio centavo por encima del saldo', () => {
    expect(validarAplicaciones([
      { numero: 'C-001', monto: 500.004, saldo: 500 },
    ])).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
npx vitest run lib/cxp/tests/cxp.test.ts
```
Esperado: FALLA — `sumaAplicaciones` y `validarAplicaciones` no están exportadas.

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/cxp/cxp.ts`:

```ts
// Total de un pago manual: la suma de lo aplicado a cada compra. Se redondea a
// 2 decimales para que el total mostrado no arrastre error de coma flotante
// frente al que deriva el servidor a partir de las mismas aplicaciones.
export function sumaAplicaciones(montos: number[]): number {
  return round2(montos.reduce((s, m) => s + m, 0))
}

// Reglas de validez del reparto manual de un pago a proveedor. Devuelve el
// motivo del rechazo (texto ya listo para mostrar) o null si es válido.
export function validarAplicaciones(
  aplicaciones: { numero: string; monto: number; saldo: number }[],
): string | null {
  for (const a of aplicaciones) {
    // Un monto negativo invalida todo el formulario, no solo su línea: quien
    // envía filtra las líneas <= 0, así que una fila en -50 junto a otra en 150
    // registraría 150 mientras el total mostrado diría 100.
    if (a.monto < 0) return 'Los montos no pueden ser negativos.'
    if (a.monto > a.saldo + 0.005) return `El abono a ${a.numero} excede su saldo.`
  }
  if (!aplicaciones.some(a => a.monto > 0)) return 'Aplica un monto a por lo menos una compra.'
  return null
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
npx vitest run lib/cxp/tests/cxp.test.ts
```
Esperado: PASA, incluidos los 9 nuevos.

- [ ] **Step 5: Correr la suite completa y el typecheck**

```bash
npm test
npx tsc --noEmit
```
Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
git add lib/cxp/cxp.ts lib/cxp/tests/cxp.test.ts
git commit -m "feat(cxp): suma y validacion del reparto manual de pagos (R6)"
```

---

## Task 6: Flujo de pago a proveedor

**Files:**
- Modify: `app/admin/cuentas-por-pagar/PagoModal.tsx` (líneas 59-104 validación, 193-202 campo de monto, 225-261 bloques por modo)
- Modify: `app/admin/cuentas-por-pagar/cxp.module.css`

**Interfaces:**
- Consumes: `sumaAplicaciones(montos: number[]): number` y `validarAplicaciones(aplicaciones: { numero: string; monto: number; saldo: number }[]): string | null` de `@/lib/cxp/cxp` (Task 5).
- Produces: nada para tareas posteriores.

**Contexto que el implementador necesita:** la RPC `registrar_pago_proveedor` recibe **solo `aplicaciones`** (ver `app/admin/cuentas-por-pagar/actions.ts:116-121`); el total del pago se deriva en el servidor. El campo de monto general que se retira en modo manual **hoy ya se descarta** — quitarlo no cambia nada de la frontera de confianza. `RegistrarPagoInput` tiene `montoGlobal?: number`, que **se conserva** porque lo usa el modo automático.

- [ ] **Step 1: Mostrar el saldo pendiente total en modo automático**

En `PagoModal.tsx`, después del `useMemo` de `comprasProveedor` (línea 72), agregar:

```tsx
  // Saldo pendiente total del proveedor: el techo de un pago con distribución
  // automática. Sin él, el usuario teclea a ciegas y solo descubre que se pasó
  // cuando el servidor responde "El monto supera el total adeudado".
  const saldoTotalProveedor = useMemo(
    () => sumaAplicaciones(comprasProveedor.map(c => c.saldo)),
    [comprasProveedor],
  )
```

Y reemplazar el bloque de la línea 225-227 por:

```tsx
        {modo === 'global' && distrib === 'auto' && (
          <div className={styles.saldoTotalRow}>
            <span>Saldo pendiente del proveedor</span>
            <span className={styles.saldoTotalValor}>{formatPrice(saldoTotalProveedor)}</span>
          </div>
        )}
        {modo === 'global' && distrib === 'auto' && (
          <p className={styles.hint}>Se aplica a las compras más antiguas primero.</p>
        )}
```

- [ ] **Step 2: Ocultar el campo de monto general en modo manual**

El campo "Monto" (líneas 193-202) debe dejar de renderizarse cuando `modo === 'global' && distrib === 'manual'`. Envolverlo:

```tsx
        {!(modo === 'global' && distrib === 'manual') && (
          <label className={styles.formLabel}>
            Monto
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={montoStr}
              onChange={e => setMontoStr(e.target.value)}
            />
          </label>
        )}
```

Sigue existiendo en modo *abono* (una sola compra) y en modo global con distribución automática, que es donde es el único dato.

- [ ] **Step 3: Cambiar el pie del detalle manual al total calculado**

Reemplazar el bloque de la línea 252-259 por:

```tsx
            {comprasProveedor.length > 0 && (
              <div className={styles.detalleTotal}>
                <span>Total del pago</span>
                <span className={styles.totalCalculado}>{formatPrice(sumaManual)}</span>
              </div>
            )}
```

Y cambiar el `useMemo` de `sumaManual` (líneas 74-77) para que use la función pura:

```tsx
  const sumaManual = useMemo(
    () => sumaAplicaciones(comprasProveedor.map(c => parseMoneyInput(montosCompra[c.compra_id] ?? ''))),
    [comprasProveedor, montosCompra],
  )
```

- [ ] **Step 4: Reescribir la validación**

Reemplazar el bloque `problema` (líneas 80-104) por:

```tsx
  // Validación por modo. `problema` es el motivo (para el botón) o null si es válido.
  const problema: string | null = (() => {
    if (!fecha) return 'Indica la fecha del pago.'
    if (modo === 'abono') {
      if (!fila) return 'Falta la compra.'
      if (monto <= 0) return 'Ingresa un monto mayor a cero.'
      if (monto > fila.saldo + 0.005) return 'El monto excede el saldo de la compra.'
      return null
    }
    // global
    if (!proveedorId) return 'Selecciona un proveedor.'
    if (distrib === 'manual') {
      // El total del pago es la suma de lo aplicado: ya no hay monto general
      // que cuadrar, así que desaparece la validación "Σ = monto".
      return validarAplicaciones(
        comprasProveedor.map(c => ({
          numero: c.numero,
          monto: parseMoneyInput(montosCompra[c.compra_id] ?? ''),
          saldo: c.saldo,
        })),
      )
    }
    if (monto <= 0) return 'Ingresa un monto mayor a cero.'
    return null
  })()
```

Ojo al orden: el `if (monto <= 0)` que estaba antes del `if (distrib === 'manual')` **debe bajar**, porque en modo manual ya no hay `monto` que validar y bloquearía el envío para siempre.

- [ ] **Step 5: Agregar el import**

En la línea 5 de `PagoModal.tsx`, junto a los demás imports:

```tsx
import { sumaAplicaciones, validarAplicaciones } from '@/lib/cxp/cxp'
```

- [ ] **Step 6: Añadir los estilos**

En `app/admin/cuentas-por-pagar/cxp.module.css`, agregar:

```css
/* Saldo pendiente total del proveedor (modo distribución automática): el techo
   del pago, para no teclear a ciegas. */
.saldoTotalRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: var(--bg-hover);
  border-radius: var(--radius-input);
  font-size: 0.85rem;
  color: var(--text-muted);
}
.saldoTotalValor { font-weight: 700; color: var(--text); }

/* Total del pago manual: es la suma de lo aplicado, no un dato que se teclee. */
.totalCalculado { font-weight: 700; color: var(--text); }
```

Revisa si `.sumaOk` y `.sumaMal` quedan sin usar tras el Step 3; si ningún otro archivo las referencia, elimínalas.

- [ ] **Step 7: Verificar**

```bash
npx tsc --noEmit
npm test
npm run build
npm run lint
```
Esperado: los cuatro sin problemas nuevos en `app/`, `components/` ni `lib/`.

En el navegador, en `/admin/cuentas-por-pagar` con datos reales:
- "Nuevo pago" → distribución automática: aparece el saldo pendiente del proveedor y cambia al cambiar de proveedor.
- "Elegir compras": el campo de monto general desapareció; al escribir montos por compra, "Total del pago" se actualiza en vivo.
- Un monto que excede el saldo de una compra deshabilita el botón y su `title` nombra la compra.
- Registrar un pago manual de dos compras: el saldo del proveedor baja **exactamente** la suma aplicada, y el pago queda con ese total.
- El botón "Abonar" de una fila sigue mostrando el campo de monto, precargado con el saldo de la compra.

- [ ] **Step 8: Commit**

```bash
git add app/admin/cuentas-por-pagar/PagoModal.tsx app/admin/cuentas-por-pagar/cxp.module.css
git commit -m "feat(cxp): el total del pago manual se calcula de lo aplicado (R6)"
```

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Tarea |
|---|---|
| Estructura destino del menú (5 grupos + 2 sueltas) | Task 1, Steps 2 y 4 |
| Clientes y Reportes como entradas sueltas | Task 1, Steps 2, 4 y 5 |
| Rutas estables (solo cambia el menú) | Task 1 — ningún step mueve un directorio de `app/` |
| Colapso por defecto salvo PUNTO DE VENTA | Task 1, Step 3 |
| Renombrar la clave de `localStorage` | Task 1, Step 3 |
| Conservar "el grupo activo siempre expandido" | Task 1, Step 3 (se conserva `grupoTieneActivo`) |
| `/admin/pos/turnos` con card de turno actual e historial filtrable | Tasks 2 y 3 |
| Columnas y color de la diferencia como `HistorialModal` | Task 3, Step 2 |
| `/admin/pos/turnos/[id]` con documentos, efectivo y arqueo | Task 4 |
| El modal del POS se conserva | Ningún step lo toca — es una omisión deliberada |
| Turnos reusa `abrirSesion`/`cerrarSesion` y `esperadoCaja` | Task 3 Step 2, Task 4 Step 2 |
| `.limit()` explícito en el historial | Task 3 Step 1 (`.limit(2000)`), Task 4 Step 1 (`.limit(5000)`) |
| Sin migraciones | Ningún step crea SQL |
| Saldo pendiente total en distribución automática | Task 6, Step 1 |
| Sin campo de monto general en modo manual | Task 6, Step 2 |
| Total calculado en vivo | Task 6, Step 3 |
| Se retira "la suma debe igualar el monto" | Task 6, Step 4 |
| Se conservan: sin negativos, sin exceder saldo, al menos una > 0 | Task 5, `validarAplicaciones` |
| La frontera de confianza no se toca | Task 6 — ningún step edita `actions.ts` ni la RPC |
| Lógica pura con test en `lib/` | Tasks 2 y 5 |

Sin huecos.

**Escaneo de placeholders:** sin "TBD", sin "similar a la Task N", sin pasos que describan sin mostrar. Los tres puntos donde el plan pide leer un archivo antes de escribir (el tipo `Caja` en Task 3 Step 1, el mapeo de la relación embebida en Task 4 Step 1, `HistorialModal` como referencia en Task 3 Step 2) son verificaciones contra el código real, no huecos: en los tres el plan dice exactamente qué buscar y qué falla si se ignora.

**Consistencia de tipos:** `FiltroTurnos` se define en Task 2 y se consume con los mismos cuatro campos en Task 3. `filtrarTurnos`/`totalesTurnos` conservan nombre y firma entre Task 2 y Task 3. `sumaAplicaciones`/`validarAplicaciones` conservan nombre y firma entre Task 5 y Task 6; la forma `{ numero, monto, saldo }` que arma Task 6 Step 4 coincide con la que valida Task 5. `SesionCaja` se usa con los campos reales de `types/index.ts:280-292`. `PosResult<T>` se documenta en el bloque Interfaces de Task 3 porque el implementador no lo tiene a la vista.
