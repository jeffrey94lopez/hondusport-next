# Rediseño R2a — Perfil de empresa unificado + re-skin de Configuración — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar los datos de empresa en un perfil canónico (con resolvers puros + fallback comercial↔fiscal) del que leen todos los consumidores, y re-estilizar la pantalla de Configuración al look Stitch con sub-nav de pestañas (una pestaña = su card).

**Architecture:** Los datos siguen en la tabla clave/valor `configuracion` (`ConfigMap = Record<string,string>`). Se crea `lib/empresa/perfil.ts` con funciones puras que resuelven cada atributo con fallback a las claves retiradas (transición segura). Los consumidores (documentos fiscales, PDF de cotización, orden de compra, estados de cuenta, tienda) dejan de leer claves crudas y llaman a los resolvers. La UI de Configuración se reorganiza en pestañas y se re-estiliza a Stitch. Una migración SQL no destructiva consolida los valores de las claves retiradas hacia las canónicas.

**Tech Stack:** Next.js 16 (App Router, Server + Client Components), TypeScript, CSS Modules, Vitest, Supabase (Postgres, tabla `configuracion`).

## Global Constraints

- Idioma español (Honduras); moneda Lempiras `L.`.
- `configuracion` es clave/valor (`toConfigMap()`); no se crea tabla nueva. `ConfigMap = Record<string, string>` (agregar una clave nueva NO requiere cambio de tipo).
- La lógica con peso (resolución de perfil/fallbacks) va en `lib/empresa/` con test (convención CLAUDE.md).
- Tokens Merlin (`app/merlin.css`); no hardcodear valores que ya tienen token.
- **Sin cambios** a la matemática fiscal, a la RPC `emitir_documento`, al costeo ni a la emisión. Solo cambia de dónde se leen los datos de empresa y la UI de Configuración.
- Claves que se **retiran** (dejan de tener input en la UI y se consolidan por migración): `site_name`, `fiscal_nombre_comercial`, `fiscal_telefono`. Se conservan `fiscal_razon_social` y `fiscal_rtn`.
- Clave **nueva**: `empresa_email_facturacion` (override opcional del correo en factura).
- Al terminar cada tarea: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes). Reportar resultados reales.

---

## File Structure

- `lib/empresa/perfil.ts` (crear) — resolvers puros del perfil de empresa.
- `lib/empresa/tests/perfil.test.ts` (crear) — tests de cada resolver.
- `app/admin/pos/documento/[id]/DocumentoHoja.tsx` (modificar) — usar resolvers en el encabezado emisor.
- `app/admin/pos/components/NotaCreditoHoja.tsx` (modificar) — íd.
- `app/admin/cotizaciones/[id]/pdf/page.tsx` (modificar) — íd.
- `app/admin/compras/[id]/orden/HojaOrdenCompra.tsx` (modificar) — íd.
- `app/admin/cuentas-por-cobrar/cliente/[id]/HojaEstadoCuentaCliente.tsx` (modificar) — íd.
- `app/admin/cuentas-por-pagar/proveedor/[id]/HojaEstadoCuenta.tsx` (modificar) — íd.
- `components/store/Footer.tsx` + `app/(store)/page.tsx` / `app/(store)/layout.tsx` (modificar) — `site_name` → `nombreComercial`.
- `supabase/migration-r2a-empresa.sql` (crear) — migración no destructiva + smoke.
- `app/admin/configuracion/ConfigClient.tsx` + `config.module.css` (modificar) — reorg de pestañas + card unificada de Empresa + dedupe + separar Métodos de pago.
- `app/admin/configuracion/MetodosPagoSection.tsx` (crear, si hace falta extraer de `PosSection`) — card de métodos de pago para su propia pestaña.

---

## Task 1: Resolvers del perfil de empresa (`lib/empresa/perfil.ts`)

**Files:**
- Create: `lib/empresa/perfil.ts`
- Test: `lib/empresa/tests/perfil.test.ts`

**Interfaces:**
- Consumes: `ConfigMap` (de `@/types`, = `Record<string, string>`).
- Produces: `nombreComercial(cfg)`, `razonSocial(cfg)`, `rtn(cfg)`, `telefonoEmpresa(cfg)`, `correoFacturacion(cfg)`, `domicilioFiscal(cfg)`, `logoEmpresa(cfg)` — todas `(cfg: ConfigMap) => string`. Los consumidores (Tasks 2–4) las llaman.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/empresa/tests/perfil.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  nombreComercial,
  razonSocial,
  rtn,
  telefonoEmpresa,
  correoFacturacion,
  domicilioFiscal,
  logoEmpresa,
} from '../perfil'

describe('nombreComercial', () => {
  it('usa empresa_nombre_comercial', () => {
    expect(nombreComercial({ empresa_nombre_comercial: 'Hondusport' })).toBe('Hondusport')
  })
  it('cae a site_name durante la transición', () => {
    expect(nombreComercial({ site_name: 'Vieja Marca' })).toBe('Vieja Marca')
  })
  it('vacío si no hay ninguno', () => {
    expect(nombreComercial({})).toBe('')
  })
})

describe('razonSocial', () => {
  it('usa fiscal_razon_social', () => {
    expect(razonSocial({ fiscal_razon_social: 'Hondusport S.A.' })).toBe('Hondusport S.A.')
  })
  it('cae al nombre comercial si no hay razón social', () => {
    expect(razonSocial({ empresa_nombre_comercial: 'Hondusport' })).toBe('Hondusport')
  })
})

describe('rtn', () => {
  it('devuelve el RTN', () => {
    expect(rtn({ fiscal_rtn: '08011990123456' })).toBe('08011990123456')
  })
  it('vacío si no hay', () => {
    expect(rtn({})).toBe('')
  })
})

describe('telefonoEmpresa', () => {
  it('usa empresa_telefono', () => {
    expect(telefonoEmpresa({ empresa_telefono: '2232-0000' })).toBe('2232-0000')
  })
  it('cae a fiscal_telefono y luego a whatsapp_principal', () => {
    expect(telefonoEmpresa({ fiscal_telefono: '2232-1111' })).toBe('2232-1111')
    expect(telefonoEmpresa({ whatsapp_principal: '50499999999' })).toBe('50499999999')
  })
})

describe('correoFacturacion', () => {
  it('usa el override empresa_email_facturacion', () => {
    expect(correoFacturacion({ empresa_email_facturacion: 'fac@x.com', email_contacto: 'c@x.com' })).toBe('fac@x.com')
  })
  it('cae a email_contacto si no hay override', () => {
    expect(correoFacturacion({ email_contacto: 'c@x.com' })).toBe('c@x.com')
  })
})

describe('domicilioFiscal', () => {
  it('usa el override fiscal_domicilio', () => {
    expect(domicilioFiscal({ fiscal_domicilio: 'Col. Fiscal', direccion: 'Col. Comercial' })).toBe('Col. Fiscal')
  })
  it('cae a la dirección comercial si no hay override', () => {
    expect(domicilioFiscal({ direccion: 'Col. Comercial' })).toBe('Col. Comercial')
  })
})

describe('logoEmpresa', () => {
  it('devuelve logo_url', () => {
    expect(logoEmpresa({ logo_url: 'http://x/logo.png' })).toBe('http://x/logo.png')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/empresa/tests/perfil.test.ts`
Expected: FAIL (módulo `../perfil` no existe).

- [ ] **Step 3: Implementar los resolvers**

Crear `lib/empresa/perfil.ts`:

```ts
import type { ConfigMap } from '@/types'

// Perfil de empresa unificado: una función por atributo, con fallback a las
// claves retiradas (site_name, fiscal_telefono) para una transición segura
// aun antes de correr la migración. Ver spec R2a.

/** Nombre comercial (marca) para tienda y documentos. Vacío si no hay ninguno. */
export function nombreComercial(cfg: ConfigMap): string {
  return cfg.empresa_nombre_comercial?.trim() || cfg.site_name?.trim() || ''
}

/** Razón social legal (factura SAR); cae al nombre comercial si no está. */
export function razonSocial(cfg: ConfigMap): string {
  return cfg.fiscal_razon_social?.trim() || nombreComercial(cfg)
}

/** RTN del emisor. */
export function rtn(cfg: ConfigMap): string {
  return cfg.fiscal_rtn?.trim() || ''
}

/** Teléfono de la empresa (documentos y contacto). */
export function telefonoEmpresa(cfg: ConfigMap): string {
  return cfg.empresa_telefono?.trim() || cfg.fiscal_telefono?.trim() || cfg.whatsapp_principal?.trim() || ''
}

/** Correo que aparece en la factura; override opcional, cae al correo de contacto. */
export function correoFacturacion(cfg: ConfigMap): string {
  return cfg.empresa_email_facturacion?.trim() || cfg.email_contacto?.trim() || ''
}

/** Domicilio fiscal; override opcional, cae a la dirección comercial. */
export function domicilioFiscal(cfg: ConfigMap): string {
  return cfg.fiscal_domicilio?.trim() || cfg.direccion?.trim() || ''
}

/** URL del logo de empresa. */
export function logoEmpresa(cfg: ConfigMap): string {
  return cfg.logo_url?.trim() || ''
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/empresa/tests/perfil.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add lib/empresa/perfil.ts lib/empresa/tests/perfil.test.ts
git commit -m "feat(empresa): resolvers puros del perfil de empresa con fallback comercial/fiscal (R2a)"
```

---

## Task 2: Documentos fiscales usan los resolvers (`DocumentoHoja`, `NotaCreditoHoja`)

**Files:**
- Modify: `app/admin/pos/documento/[id]/DocumentoHoja.tsx`
- Modify: `app/admin/pos/components/NotaCreditoHoja.tsx`

**Interfaces:**
- Consumes: `nombreComercial`, `razonSocial`, `rtn`, `telefonoEmpresa`, `domicilioFiscal`, `logoEmpresa` de `@/lib/empresa/perfil` (Task 1). Ambos componentes ya reciben `config: ConfigMap` por props.

**Contexto:** el encabezado emisor de `DocumentoHoja` hoy lee claves crudas (verificado):
```tsx
{config.fiscal_nombre_comercial || config.fiscal_razon_social || 'Hondusport'}
{config.fiscal_razon_social && <div>{config.fiscal_razon_social}</div>}
<div>RTN: {config.fiscal_rtn || '—'}</div>
{config.fiscal_domicilio && <div>{config.fiscal_domicilio}</div>}
{config.fiscal_telefono && <div>Tel: {config.fiscal_telefono}</div>}
```
y el logo con `config.logo_url`.

- [ ] **Step 1: `DocumentoHoja` — importar y usar resolvers**

En `app/admin/pos/documento/[id]/DocumentoHoja.tsx`, importar:
```tsx
import { nombreComercial, razonSocial, rtn, telefonoEmpresa, domicilioFiscal, logoEmpresa } from '@/lib/empresa/perfil'
```
Dentro del componente, derivar los valores una vez:
```tsx
const emisorNombre = nombreComercial(config) || 'Hondusport'
const emisorRazon = razonSocial(config)
const emisorRtn = rtn(config)
const emisorDomicilio = domicilioFiscal(config)
const emisorTelefono = telefonoEmpresa(config)
const emisorLogo = logoEmpresa(config)
```
Reemplazar el encabezado emisor por (mismo markup/clases, solo cambia el origen):
```tsx
{formato === 'carta' && emisorLogo && (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={emisorLogo} alt="Logo" className={styles.logo} />
)}
<div className={styles.emisor}>
  <div className={styles.emisorNombre}>{emisorNombre}</div>
  {emisorRazon && emisorRazon !== emisorNombre && <div>{emisorRazon}</div>}
  <div>RTN: {emisorRtn || '—'}</div>
  {emisorDomicilio && <div>{emisorDomicilio}</div>}
  {emisorTelefono && <div>Tel: {emisorTelefono}</div>}
</div>
```
(La condición `emisorRazon !== emisorNombre` evita repetir la línea cuando la razón social cae al nombre comercial.)

- [ ] **Step 2: `NotaCreditoHoja` — mismo tratamiento**

Abrir `app/admin/pos/components/NotaCreditoHoja.tsx`, localizar su encabezado emisor (busca `fiscal_` / `logo_url` / `config.`), e importar y usar los mismos resolvers con el mismo mapeo:
- nombre comercial → `nombreComercial(config) || 'Hondusport'`
- razón social → `razonSocial(config)` (mostrar solo si difiere del nombre)
- RTN → `rtn(config)`
- domicilio → `domicilioFiscal(config)`
- teléfono → `telefonoEmpresa(config)`
- logo → `logoEmpresa(config)`
No cambiar nada más del documento (montos, correlativos, cliente, CAI).

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual (si hay datos): renderizar un documento fiscal de prueba y confirmar que nombre comercial/razón social/RTN/domicilio/teléfono/logo salen correctos (con y sin `fiscal_domicilio`/`fiscal_telefono`, para ejercitar el fallback).

```bash
git add app/admin/pos/documento/[id]/DocumentoHoja.tsx app/admin/pos/components/NotaCreditoHoja.tsx
git commit -m "feat(pos): documentos fiscales leen el perfil de empresa via resolvers (R2a)"
```

---

## Task 3: Otros documentos usan los resolvers (cotización PDF, orden de compra, estados de cuenta)

**Files:**
- Modify: `app/admin/cotizaciones/[id]/pdf/page.tsx`
- Modify: `app/admin/compras/[id]/orden/HojaOrdenCompra.tsx`
- Modify: `app/admin/cuentas-por-cobrar/cliente/[id]/HojaEstadoCuentaCliente.tsx`
- Modify: `app/admin/cuentas-por-pagar/proveedor/[id]/HojaEstadoCuenta.tsx`

**Interfaces:**
- Consumes: resolvers de `@/lib/empresa/perfil` (Task 1).

**Contexto:** estos documentos imprimen encabezado de empresa leyendo claves de `configuracion`. Mapeo a aplicar en CADA uno (reemplazar la lectura cruda por el resolver correspondiente):

| Lectura cruda actual | Reemplazo |
|---|---|
| `..._nombre_comercial` / `site_name` (nombre de empresa) | `nombreComercial(cfg) \|\| 'Hondusport'` |
| `fiscal_razon_social` | `razonSocial(cfg)` |
| `fiscal_rtn` | `rtn(cfg)` |
| `fiscal_domicilio` / `direccion` (domicilio del emisor) | `domicilioFiscal(cfg)` |
| `fiscal_telefono` / `empresa_telefono` / `whatsapp_principal` (tel. emisor) | `telefonoEmpresa(cfg)` |
| `email_contacto` (correo del emisor en el documento) | `correoFacturacion(cfg)` |
| `logo_url` | `logoEmpresa(cfg)` |

**Importante:** NO tocar las lecturas de dirección/teléfono/correo del **cliente** o **proveedor** (esas viven en las filas de cliente/proveedor, no en `configuracion`) — solo las del **emisor/empresa**.

- [ ] **Step 1: Cotización PDF**

En `app/admin/cotizaciones/[id]/pdf/page.tsx`, importar los resolvers necesarios de `@/lib/empresa/perfil` y reemplazar las lecturas del encabezado de empresa según la tabla. Conservar el resto (términos, ítems, cliente, totales).

- [ ] **Step 2: Orden de compra**

En `app/admin/compras/[id]/orden/HojaOrdenCompra.tsx`, íd. para el encabezado de la empresa (la que emite la orden). NO tocar los datos del proveedor.

- [ ] **Step 3: Estados de cuenta cliente y proveedor**

En `HojaEstadoCuentaCliente.tsx` y `HojaEstadoCuenta.tsx` (proveedor), reemplazar solo el encabezado de empresa según la tabla. NO tocar los datos del cliente/proveedor ni los saldos.

- [ ] **Step 4: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual (si hay datos): abrir cada documento y confirmar el encabezado de empresa correcto.

```bash
git add "app/admin/cotizaciones/[id]/pdf/page.tsx" "app/admin/compras/[id]/orden/HojaOrdenCompra.tsx" "app/admin/cuentas-por-cobrar/cliente/[id]/HojaEstadoCuentaCliente.tsx" "app/admin/cuentas-por-pagar/proveedor/[id]/HojaEstadoCuenta.tsx"
git commit -m "feat(admin): cotizacion/orden/estados de cuenta leen el perfil de empresa via resolvers (R2a)"
```

---

## Task 4: Tienda usa el nombre comercial canónico (`Footer`, home/layout)

**Files:**
- Modify: `components/store/Footer.tsx`
- Modify: `app/(store)/page.tsx` y/o `app/(store)/layout.tsx` (donde se use `site_name` para branding/SEO)

**Interfaces:**
- Consumes: `nombreComercial` de `@/lib/empresa/perfil` (Task 1).

- [ ] **Step 1: Localizar usos de `site_name` en la tienda**

Buscar con Grep `site_name` en `app/(store)` y `components/store`. Cada uso que muestre el nombre del negocio (branding, `<title>`, metadata, footer) debe pasar a `nombreComercial(config)` (con `config`/`configMap` ya disponible en ese scope) o, si es un layout que arma metadata, a `nombreComercial(configMap) || 'Hondusport'`.

- [ ] **Step 2: Aplicar**

Reemplazar los usos de `site_name` por `nombreComercial(...)`. Importar `import { nombreComercial } from '@/lib/empresa/perfil'`. No cambiar otra lógica de la tienda.

- [ ] **Step 3: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores. Visual: el footer/título de la tienda muestran el nombre correcto (dev server, tienda pública).

```bash
git add components/store/Footer.tsx "app/(store)/page.tsx" "app/(store)/layout.tsx"
git commit -m "feat(tienda): nombre del negocio desde el perfil de empresa canonico (R2a)"
```

---

## Task 5: Migración SQL no destructiva + smoke

**Files:**
- Create: `supabase/migration-r2a-empresa.sql`

**Contexto:** consolidar los valores de las claves retiradas hacia las canónicas **sin sobrescribir** valores ya presentes y **sin borrar** las retiradas (para poder revertir). `configuracion` tiene columnas `key` (PK) y `value`. La migración la corre el usuario en el SQL Editor antes del push.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migration-r2a-empresa.sql`:

```sql
-- R2a: consolidar datos de empresa hacia las claves canónicas.
-- No destructivo: solo inserta la canónica si NO existe (no pisa valores puestos);
-- deja las claves retiradas intactas (inertes) para poder revertir.

-- site_name -> empresa_nombre_comercial
insert into configuracion (key, value)
select 'empresa_nombre_comercial', c.value
from configuracion c
where c.key = 'site_name'
  and coalesce(c.value, '') <> ''
  and not exists (
    select 1 from configuracion e
    where e.key = 'empresa_nombre_comercial' and coalesce(e.value, '') <> ''
  );

-- fiscal_nombre_comercial -> empresa_nombre_comercial (si aún no hay nombre comercial)
insert into configuracion (key, value)
select 'empresa_nombre_comercial', c.value
from configuracion c
where c.key = 'fiscal_nombre_comercial'
  and coalesce(c.value, '') <> ''
  and not exists (
    select 1 from configuracion e
    where e.key = 'empresa_nombre_comercial' and coalesce(e.value, '') <> ''
  );

-- fiscal_telefono -> empresa_telefono
insert into configuracion (key, value)
select 'empresa_telefono', c.value
from configuracion c
where c.key = 'fiscal_telefono'
  and coalesce(c.value, '') <> ''
  and not exists (
    select 1 from configuracion e
    where e.key = 'empresa_telefono' and coalesce(e.value, '') <> ''
  );
```

- [ ] **Step 2: Escribir el smoke de verificación (en el mismo archivo, como comentario final o bloque aparte)**

Agregar al final del archivo un bloque de verificación (para correr manualmente tras la migración):

```sql
-- SMOKE (correr aparte tras la migración; debe mostrar las canónicas pobladas
-- cuando existía el valor viejo):
--   select key, value from configuracion
--   where key in ('empresa_nombre_comercial','empresa_telefono',
--                 'site_name','fiscal_nombre_comercial','fiscal_telefono')
--   order by key;
```

- [ ] **Step 3: Commit (la migración la aplica el usuario, no se ejecuta aquí)**

```bash
git add supabase/migration-r2a-empresa.sql
git commit -m "chore(empresa): migracion no destructiva que consolida datos de empresa a claves canonicas (R2a)"
```

> **Entrega:** el usuario corre esta migración en el SQL Editor de Supabase **antes** del push a producción. Los resolvers (Task 1) ya caen a las claves viejas, así que la app funciona con o sin migración; la migración solo pre-puebla las canónicas que muestra la nueva UI.

---

## Task 6: Reorganizar Configuración en sub-nav de pestañas + card unificada de Empresa

**Files:**
- Modify: `app/admin/configuracion/ConfigClient.tsx`
- Create: `app/admin/configuracion/MetodosPagoSection.tsx` (si conviene extraer los métodos de pago de `PosSection`)
- Modify: `app/admin/configuracion/config.module.css` (solo lo necesario para la nueva estructura; el re-skin visual va en Task 7)

**Interfaces:**
- Consumes: `ConfigMap`, `saveConfig` (Server Action existente), `validarRtn`, y los componentes `CaisSection`, `PosSection`, `EtapasSection` (existentes). `ConfigClient` ya recibe `config`, `cais`, `cajas`, `vendedores`, `metodos`, `etapas`.

**Objetivo:** reemplazar los grupos top-tab actuales (`Empresa` / `Facturador` / `POS` / `Tienda` con sub-tabs anidadas) por **un sub-nav lateral de pestañas**, donde **cada pestaña muestra su(s) card(s)**:

| Pestaña (`id`) | Contenido |
|---|---|
| `empresa` (Empresa / Facturador) | **Card unificada "Detalles de la Empresa"**: logo (`logo_url`) + ícono (`empresa_icono_url`); nombre comercial (`empresa_nombre_comercial`); razón social (`fiscal_razon_social`); RTN (`fiscal_rtn`, con `validarRtn`); dirección (`direccion`) + domicilio fiscal override (`fiscal_domicilio`); teléfono (`empresa_telefono`); correo (`email_contacto`) + correo facturación override (`empresa_email_facturacion`); WhatsApp principal/secundario; horario; leyenda fiscal (`fiscal_leyenda`); términos de cotización/factura; estilo de cotización; método de costeo; moneda secundaria + tasa. |
| `cais` (CAIs) | `<CaisSection cais={cais} />` |
| `metodos` (Métodos de pago) | card de métodos de pago |
| `pos` (POS) | cajas, vendedores, límite consumidor final y toggles POS |
| `cotizaciones` (Cotizaciones / Etapas) | `<EtapasSection etapas={etapas} />` (+ los campos de estilo/términos de cotización si no quedaron en Empresa) |
| `tienda` (Tienda) | Identidad (`site_url`, `eslogan`, `color_principal`, logo), Contacto (whatsapp, correo, dirección, ciudad, horario — **leyendo del perfil, sin re-duplicar edición**), Redes, SEO, Funcionalidades |

- [ ] **Step 1: Redefinir el sub-nav de pestañas**

En `ConfigClient.tsx`, reemplazar los arreglos `GRUPOS` y `SECTIONS` por un único arreglo de pestañas y un `useState` de la pestaña activa:

```tsx
const PESTANAS = [
  { id: 'empresa', label: 'Empresa / Facturador' },
  { id: 'cais', label: 'CAIs' },
  { id: 'metodos', label: 'Métodos de pago' },
  { id: 'pos', label: 'POS' },
  { id: 'cotizaciones', label: 'Cotizaciones / Etapas' },
  { id: 'tienda', label: 'Tienda' },
] as const
type PestanaId = typeof PESTANAS[number]['id']
```
Renderizar el sub-nav como una lista vertical (columna izquierda) y el contenido de la pestaña activa a la derecha. Conservar el botón "Guardar cambios" (submit del `config-form`) y el flujo `handleSave`/`saveConfig`/`validarRtn`.

- [ ] **Step 2: Card unificada de Empresa (pestaña `empresa`)**

Construir la card de Empresa fusionando los campos que hoy están repartidos en los grupos `empresa` y `facturador` (ver tabla). Detalles:
- Nombre comercial: input ligado a `empresa_nombre_comercial` (ya no `site_name` ni `fiscal_nombre_comercial`).
- Razón social: `fiscal_razon_social`. RTN: `fiscal_rtn` (mantener `validarRtn` en `handleSave`).
- Dirección: `direccion`. Domicilio fiscal (override, con ayuda "Si se deja vacío, se usa la dirección"): `empresa_… ` → usar la clave `fiscal_domicilio`.
- Teléfono: `empresa_telefono`. (Se retira el input de `fiscal_telefono`.)
- Correo: `email_contacto`. Correo facturación (override, ayuda "Si se deja vacío, se usa el correo de contacto"): `empresa_email_facturacion`.
- Resto (whatsapp, horario, leyenda fiscal, términos, estilo cotización, método de costeo, moneda) tal cual, ligados a sus claves actuales.
- **Eliminar** los inputs de `site_name`, `fiscal_nombre_comercial`, `fiscal_telefono` (claves retiradas).

- [ ] **Step 3: Separar Métodos de pago (pestaña `metodos`)**

Hoy `PosSection` recibe `metodos` y los renderiza junto con cajas/vendedores. Extraer la parte de métodos de pago a un componente `MetodosPagoSection.tsx` (o renderizar condicionalmente esa porción bajo la pestaña `metodos`), y dejar en la pestaña `pos` cajas/vendedores/límite/toggles. Mantener toda la lógica (server actions de métodos/cajas/vendedores) intacta.

- [ ] **Step 4: Pestaña Tienda sin duplicar edición del perfil**

En la pestaña `tienda`, conservar Identidad (`site_url`, `eslogan`, `color_principal`, logo), Redes, SEO y Funcionalidades. En "Contacto", NO volver a poner inputs de dirección/correo/teléfono que ya se editan en Empresa (mostrarlos como solo lectura leyendo del perfil, o simplemente omitirlos y dejar solo lo específico de tienda como `ciudad`/`horario` si aplica). El objetivo: un solo lugar de edición por dato.

- [ ] **Step 5: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual (dev server, `/admin/configuracion`, requiere login admin): el sub-nav de pestañas cambia el contenido; la card de Empresa muestra/guarda los campos unificados; guardar cambios persiste (probar cambiar el nombre comercial y recargar).

```bash
git add app/admin/configuracion/ConfigClient.tsx app/admin/configuracion/MetodosPagoSection.tsx app/admin/configuracion/config.module.css
git commit -m "feat(config): sub-nav de pestañas + card unificada de empresa, sin duplicar datos (R2a)"
```

---

## Task 7: Re-skin Stitch de la pantalla de Configuración

**Files:**
- Modify: `app/admin/configuracion/config.module.css`
- Modify: `app/admin/configuracion/ConfigClient.tsx` (solo clases/estructura visual si hace falta; sin cambiar lógica)

**Referencia visual:** `docs/diseno/stitch/hondusport_admin_configuraci_n_del_sistema/` (`screen.png` + `code.html`). Replicar el LOOK; NO copiar el HTML de Stitch.

- [ ] **Step 1: Aplicar el look Stitch**

Sobre la estructura ya reorganizada (Task 6): header con título "Configuración" + subtítulo y botón negro "Guardar cambios" (pill); sub-nav lateral como **card** (ítems con icono dorado, el activo resaltado en dorado/beige); contenido en **cards blancas redondeadas** con títulos e icono dorado; inputs redondeados; upload de logo circular. Usar tokens Merlin (`var(--brand)`, `var(--cta)`, `var(--radius-card)`, `var(--radius-input)`, `var(--radius-btn)`, etc.); no hardcodear valores con token. El shell/sidebar global del admin NO se toca.

- [ ] **Step 2: Verificación, build, commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sin errores.
Visual (dev server, `/admin/configuracion`): la pantalla luce como el diseño Stitch (sub-nav en card, cards blancas, botón negro, iconos dorados), responsive; guardar sigue funcionando.

```bash
git add app/admin/configuracion/config.module.css app/admin/configuracion/ConfigClient.tsx
git commit -m "feat(config): re-skin de Configuracion al look Stitch (R2a)"
```

---

## Self-Review (hecho al escribir el plan)

**1. Spec coverage:**
- Perfil canónico + fallbacks en `lib/empresa/perfil.ts` con test → Task 1. ✅
- Documentos fiscales leen del perfil → Task 2. ✅
- Cotización/orden/estados de cuenta → Task 3. ✅
- Tienda (site_name → nombre comercial) → Task 4. ✅
- Migración SQL no destructiva + smoke → Task 5. ✅
- UI: sub-nav de pestañas (una pestaña = su card) + card unificada + dedupe + separar métodos → Task 6. ✅
- Re-skin Stitch de Configuración → Task 7. ✅
- Sin cambios a matemática fiscal/emisión/costeo → constraints + cada tarea toca solo origen de datos/UI. ✅
- Claves retiradas (`site_name`, `fiscal_nombre_comercial`, `fiscal_telefono`), nueva (`empresa_email_facturacion`), conservadas (`fiscal_razon_social`, `fiscal_rtn`) → Tasks 1/5/6. ✅

**2. Placeholder scan:** el resolver (Task 1) y la migración (Task 5) van con código concreto. Los consumidores (Tasks 2–4) tienen mapeo concreto clave→resolver; Task 2 trae el diff exacto de `DocumentoHoja` (verificado en el código). Task 6/7 dan estructura y directivas concretas + referencia Stitch (naturaleza de un re-skin). Sin "TBD".

**3. Type consistency:** los nombres de los resolvers (`nombreComercial`, `razonSocial`, `rtn`, `telefonoEmpresa`, `correoFacturacion`, `domicilioFiscal`, `logoEmpresa`) son idénticos en Task 1 (definición) y Tasks 2–4 (consumo). `ConfigMap = Record<string,string>` (sin cambio de tipo por la clave nueva). Las pestañas de Task 6 (`PestanaId`) se usan solo ahí.

## Notas de entrega (para el controlador SDD)

- **Migración:** Task 5 genera SQL que el **usuario** corre en el SQL Editor antes del push. Los resolvers caen a las claves viejas, así que no hay ventana de rotura entre deploy y migración.
- **Login admin:** la verificación visual de Configuración (Tasks 6–7) requiere sesión admin; si el subagente no puede autenticarse, verifica por estructura/estilos computados y deja constancia. La verificación de documentos (Tasks 2–3) también es admin.
- **Orden sugerido de tareas:** 1 → 2 → 3 → 4 → 5 → 6 → 7 (resolvers primero; migración antes del re-skin de UI para que la card de Empresa muestre valores migrados).
- Al mergear: migración aplicada, FF a `main`, verificar deploy READY por SHA; confirmar con el usuario antes de producción.
