# Rediseño R2a — Perfil de empresa unificado + re-skin de Configuración — Diseño

**Fecha:** 2026-08-11
**Serie:** Rediseño Hondusport (adopción de los diseños de Google Stitch). Ola **R2a** (la
serie R2 se partió en **R2a = perfil de empresa unificado** y **R2b = descuentos
configurables en POS**, que va después).
**Estado:** aprobado para plan.

## Objetivo

Unificar los datos de empresa (hoy repartidos y duplicados en la tabla `configuracion`)
en **un perfil canónico y único** del que leen todos los consumidores —tienda, factura
fiscal, nota de crédito, cotización PDF, orden de compra, estados de cuenta— y
**re-estilizar la pantalla de Configuración** al look Stitch, reorganizando sus secciones
como un sub-menú de pestañas (una pestaña = su(s) card(s)).

Solo se consolida **de dónde salen** los datos y se reorganiza/re-estiliza la UI de
Configuración. **No** cambia la matemática fiscal ni la emisión de documentos
(`emitir_documento`, snapshot inmutable), ni la lógica de costeo, ni la tienda salvo por
la fuente de sus datos de identidad.

## Contexto (estado actual)

`configuracion` es clave/valor (se lee con `toConfigMap()` y se inyecta desde los
layouts). Hoy el mismo dato real de empresa vive en varias claves y en varios grupos de
la UI (Empresa / Facturador / POS / Tienda):

- Nombre: `empresa_nombre_comercial`, `fiscal_nombre_comercial`, `fiscal_razon_social`, `site_name`.
- Teléfono: `empresa_telefono`, `fiscal_telefono`, `whatsapp_principal`.
- Dirección: `direccion` (en Empresa y en Tienda), `fiscal_domicilio`.
- Correo: `email_contacto` (en Empresa y en Tienda).
- Logo: `logo_url` (en Empresa y en Tienda).

Referencia visual del re-skin: `docs/diseno/stitch/hondusport_admin_configuraci_n_del_sistema/`
(`screen.png` + `code.html`): sub-nav lateral en card (Empresa/Facturador · CAIs ·
Métodos de pago · POS · Cotizaciones/Etapas · General), header con título + botón negro
"Guardar cambios", cards blancas redondeadas, iconos dorados.

## Alcance

**Dentro:**
- Perfil de empresa canónico en `configuracion` con reglas de fallback comercial↔fiscal.
- Migración SQL que consolida los valores de las claves que se retiran hacia las canónicas.
- Actualizar todos los consumidores para leer del perfil canónico (con fallbacks).
- Re-skin Stitch del **contenido** de la pantalla de Configuración y su sub-nav interno,
  reorganizado como pestañas (una pestaña = su(s) card(s)).

**Fuera:**
- El re-skin del **shell/sidebar global** del admin (eso es R3).
- Descuentos configurables en POS (R2b).
- Cambios a la matemática fiscal, a `emitir_documento`, al costeo o a la lógica de la tienda.
- Un namespace `empresa_*` completo que renombre también las claves fiscales (se decidió
  conservar las fiscales y consolidar solo los duplicados comerciales; ver §Modelo).

## 1. Arquitectura

- **Fuente única de verdad:** el perfil de empresa vive en `configuracion` (sigue siendo
  clave/valor, leído con `toConfigMap()`). No se crea una tabla nueva.
- **Comercial vs fiscal** (decisión "mayormente iguales, con overrides"):
  - Se conservan **nombre comercial** (marca, para tienda/branding y como nombre comercial
    en documentos) y **razón social** (legal, para SAR) como campos distintos —difieren de
    verdad.
  - **Dirección, teléfono y correo:** un valor base del perfil; los documentos fiscales
    admiten un **override opcional** (domicilio fiscal, correo de facturación). Override
    vacío ⇒ se usa el valor base. **RTN y CAI** siempre separados.
- **Lógica pura + tests:** la resolución de los valores fiscales con fallback vive en
  `lib/empresa/perfil.ts` (funciones puras), con tests en `lib/empresa/tests/`
  (convención CLAUDE.md: reglas con peso van en `lib/` con test).

## 2. Modelo de datos (perfil canónico)

Se **conservan las claves fiscales** existentes (alimentan documentos; bajo riesgo
dejarlas) y se **consolidan los duplicados comerciales**. Claves canónicas:

- `empresa_nombre_comercial` — marca ("Hondusport"). La tienda y los documentos leen esta.
  Se **retira** `site_name` (migrar valor → `empresa_nombre_comercial` si la canónica está
  vacía). `fiscal_nombre_comercial` se **retira** como campo propio y pasa a ser, en los
  documentos, el mismo nombre comercial.
- `fiscal_razon_social` — razón social legal (se **conserva** la clave; no se renombra,
  para no tocar su consumo en los documentos). En la UI se rotula "Razón Social".
- `fiscal_rtn` — RTN (se conserva).
- `logo_url`, `empresa_icono_url` — se conservan.
- `empresa_telefono` — teléfono único. Se **retira** `fiscal_telefono` (migrar → `empresa_telefono`
  si la canónica está vacía); el documento fiscal usa `empresa_telefono`.
- `email_contacto` — correo base. `empresa_email_facturacion` — override opcional para el
  correo que aparece en la factura (fallback a `email_contacto`).
- `direccion` (+ `ciudad`) — dirección comercial/física. `fiscal_domicilio` — override
  opcional del domicilio fiscal (fallback a `direccion`).
- `whatsapp_principal`, `whatsapp_secundario`, `horario` — se conservan (canal tienda).
- `fiscal_leyenda`, `empresa_terminos_cotizacion`, `empresa_terminos_factura`,
  `cotizacion_estilo`, `metodo_costeo`, `moneda_secundaria_activa`, `tasa_cambio_usd` — se
  conservan.
- **Tienda/marketing** (sin cambio de dueño): `site_url`, `eslogan`, `color_principal`,
  redes (`instagram`/`facebook`/`twitter`/`youtube`/`tiktok`), SEO (`meta_descripcion`,
  `og_image_url`, `ga_id`, `gtm_id`), funcionalidades (`free_shipping_activo`,
  `free_shipping_minimo`, `cupones_popup_activo`, `promo_bar_activo`, `promo_bar_texto`,
  `modo_mantenimiento`).

**Nota de nomenclatura:** para minimizar el churn en los documentos fiscales, la razón
social y el RTN conservan sus claves actuales (`fiscal_razon_social`, `fiscal_rtn`). El
"perfil canónico" es conceptual: la unificación consiste en (a) **retirar** los duplicados
verdaderos (`site_name`, `fiscal_nombre_comercial`, `fiscal_telefono`), (b) fijar **una**
clave dueña por atributo, y (c) resolver los overrides fiscales con fallback. No es un
renombrado masivo.

**Reglas de resolución (funciones puras, `lib/empresa/perfil.ts`, con test):**
- `nombreComercial(cfg)` = `empresa_nombre_comercial` (o `site_name` como fallback de solo
  lectura durante la transición, si existiera).
- `razonSocial(cfg)` = `fiscal_razon_social` (fallback a `empresa_nombre_comercial` si vacío).
- `rtn(cfg)` = `fiscal_rtn`.
- `telefonoEmpresa(cfg)` = `empresa_telefono` (fallback a `fiscal_telefono`/`whatsapp_principal`
  solo lectura de transición si vacío).
- `correoFacturacion(cfg)` = `empresa_email_facturacion || email_contacto`.
- `domicilioFiscal(cfg)` = `fiscal_domicilio || direccion`.
- `logoEmpresa(cfg)` = `logo_url`.

Cada regla con su test (valor presente, override vacío→fallback, ambos vacíos→cadena vacía).

## 3. UI de Configuración (sub-nav de pestañas + re-skin Stitch)

Sub-nav lateral (estilo card Stitch). **Una pestaña = su(s) card(s)**; navegar cambia el
contenido (no un scroll único). Reemplaza los grupos top-tab actuales (Empresa / Facturador
/ POS / Tienda) y las sub-tabs anidadas de Tienda.

| Pestaña | Contenido |
|---|---|
| **Empresa / Facturador** | Card "Detalles de la Empresa": logo + ícono, nombre comercial, razón social, RTN, dirección + domicilio fiscal (override), teléfono, correo + correo facturación (override), WhatsApp principal/secundario, horario, leyenda fiscal, términos de cotización/factura, estilo de cotización, método de costeo, moneda secundaria + tasa. |
| **CAIs** | `CaisSection` (autorizaciones SAR). |
| **Métodos de pago** | Card de métodos de pago (separada de la actual `PosSection`). |
| **POS** | Cajas, vendedores, límite consumidor final, toggles POS (documento modal, bloquear límite CxC, conteo ciego, devoluciones sin efectivo). |
| **Cotizaciones / Etapas** | Estilo/términos de cotización + `EtapasSection`. |
| **Tienda** | Cards: Identidad (site_url, eslogan, color, logo), Contacto (whatsapp, correo, dirección, ciudad, horario — leyendo del perfil, sin re-duplicar), Redes, SEO, Funcionalidades. |

- Re-skin al look Stitch: header con título "Configuración" + botón negro "Guardar
  cambios"; sub-nav lateral en card; cards blancas redondeadas; inputs redondeados; iconos
  dorados. Tokens Merlin (`app/merlin.css`), nada hardcodeado.
- El shell/sidebar global del admin **no** se toca (R3).
- Se eliminan los inputs que duplican datos ya presentes en el perfil de Empresa (p. ej.
  la pestaña Tienda deja de repetir dirección/correo del perfil; muestra lo específico de
  tienda o lo lee del perfil de solo lectura).
- El guardado sigue usando el Server Action `saveConfig`; la validación de RTN
  (`validarRtn`) se conserva.

## 4. Consumidores a actualizar

Leer del perfil canónico (con los fallbacks de §2), sin cambiar la lógica de negocio:
- **Documentos fiscales:** `app/admin/pos/documento/[id]/DocumentoHoja.tsx`,
  `app/admin/pos/components/NotaCreditoHoja.tsx` — nombre comercial/razón social/RTN/
  domicilio fiscal/teléfono/correo facturación desde `lib/empresa/perfil.ts`.
- **Cotización PDF:** `app/admin/cotizaciones/[id]/pdf/page.tsx`.
- **Orden de compra:** `app/admin/compras/[id]/orden/HojaOrdenCompra.tsx`.
- **Estados de cuenta:** `app/admin/cuentas-por-cobrar/cliente/[id]/HojaEstadoCuentaCliente.tsx`,
  `app/admin/cuentas-por-pagar/proveedor/[id]/HojaEstadoCuenta.tsx`.
- **Tienda:** `app/(store)/layout.tsx` / `app/(store)/page.tsx` (SEO/branding),
  `components/store/Footer.tsx`, y cualquier consumo de `site_name`.

Nota: los documentos ya emitidos son **snapshots inmutables**; el cambio solo afecta a la
composición de documentos/PDF que se renderizan desde `configuracion` en vivo, no a los
correlativos ni a datos ya congelados.

## 5. Migración

Script SQL en `supabase/` (lo corre el usuario en el SQL Editor **antes** del push):
- Para cada clave que se retira (`site_name`, `fiscal_nombre_comercial`, `fiscal_telefono`),
  hacer un `upsert` hacia la clave canónica **solo si la canónica está vacía/ausente**
  (no sobrescribe un valor ya puesto).
- No borrar las claves retiradas en la misma migración (se dejan huérfanas, inertes) para
  poder revertir; una limpieza opcional posterior las elimina una vez confirmado.
- Incluir un **smoke** que verifique que las claves canónicas quedaron pobladas y que un
  `SELECT` de las funciones de resolución (o su equivalente en datos) da los valores
  esperados.

## 6. Pruebas y verificación

- **Unitarias:** tests de `lib/empresa/perfil.ts` (cada regla de fallback).
- `npm test` (nuevos + existentes verdes), `npx tsc --noEmit`, `npm run build`.
- **Visual (dev server):** el re-skin de Configuración —sub-nav de pestañas, cada pestaña
  con su card, look Stitch— y que guardar cambios funciona.
- **Documento de prueba:** renderizar/emitir un documento fiscal de prueba y confirmar que
  razón social, RTN, domicilio fiscal, nombre comercial, teléfono y correo salen correctos
  (con y sin overrides).

## 7. Restricciones globales

- Idioma español (Honduras); moneda Lempiras `L.`.
- La lógica de negocio con peso (resolución de perfil/fallbacks) va en `lib/` con test.
- Tokens Merlin; no hardcodear valores que ya tienen token.
- Sin cambios a la matemática fiscal, a `emitir_documento`, al costeo ni a la emisión.
- Migración aplicada por el usuario **antes** del push; confirmar deploy a producción.

## Fuera de alcance

R2b (descuentos configurables), R3 (shell + dashboard), R5 (resto de módulos admin);
namespace `empresa_*` completo; cualquier cambio a documentos ya emitidos.
