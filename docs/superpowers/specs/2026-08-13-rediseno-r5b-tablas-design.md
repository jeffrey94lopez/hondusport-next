# Rediseño R5b — Tablas admin con patrón compartido — Diseño

**Fecha:** 2026-08-13
**Serie:** Rediseño Hondusport (Google Stitch), **última ola**. Estado: R1 tienda ✅ · R2a
empresa ✅ · R2b descuentos ✅ · R3 shell+dashboard ✅ · R4 POS ✅ · R5a pantallas admin
Stitch ✅ · **R5b tablas genéricas** (cierra la serie).
**Estado:** aprobado para plan.

## Objetivo

Re-estilizar las 11 pantallas admin que quedan (tablas/listas + 3 pantallas pesadas + el
editor de cotización) al look Stitch, **creando un módulo CSS compartido** que elimine la
duplicación del patrón página/toolbar/tabla/botones/badges que hoy se repite casi idéntico
en 7 módulos. Solo estilo — cero cambios de lógica/datos.

## Decisión de arquitectura: módulo compartido

Se crea **`app/admin/tabla-admin.module.css`** con el patrón Stitch ya validado en R5a
(la lista de productos es la referencia interna):

- `.page`, `.topbar`, `.title`, `.subtitle`
- `.tabla` — encabezado gris (`--bg-hover`), hover de fila, sin líneas verticales
- `.filtros` — fila de controles; los presets/segmentos usan `btnMerlinChip` global
- `.btnPrimary` (negro, pill), `.btnEdit`, `.btnDelete`, `.btnCancel`
- `.badge` + variantes semánticas (`.badgeOk`, `.badgeWarn`, `.badgeDanger`, `.badgeMuted`)
- `.empty`, `.tableWrap`
- **`.search` / `.searchWrap`** — ver regla de buscadores abajo.

**Consumo con `composes`:** cada pantalla mantiene sus nombres de clase locales y hereda
el estilo compartido (`composes: tabla from '../tabla-admin.module.css'`). Así los `.tsx`
casi no cambian (menos riesgo de romper lógica) y lo específico de cada pantalla (badges
propios de clientes, filtros de movimientos) se queda en su módulo.

**Regla de seguridad:** si una clase de una pantalla no encaja en el patrón, se deja como
está en vez de forzarla al compartido.

## Regla global: barras de búsqueda con fondo blanco

**Todas** las barras de búsqueda de la app deben tener **fondo blanco** (`--bg-card`), no
el gris `--bg-hover` — sobre las cards blancas del look Stitch el gris se pierde y el campo
no se lee como un input. Aplica a:

- Las pantallas de R5b (las que tengan buscador).
- **Los buscadores ya existentes de olas anteriores**, que hoy usan gris: lista de productos
  (`.searchWrap .searchInput`), kanban de cotizaciones, inventario, POS (catálogo) y
  cualquier otro que aparezca al barrer. Se corrigen en R5b como parte de esta regla.
- Se implementa con **selector compuesto** (`.searchWrap .search`), porque la regla global
  `input[type=...]` de `app/globals.css` (0,1,1) pisa una clase sola (0,1,0) — lección
  recurrente de R4/R5a.

El borde se mantiene visible (`--border-input`) para que el campo se distinga sobre la card.

## Alcance

**Dentro — 11 pantallas en 3 grupos:**

| Grupo | Pantallas |
|---|---|
| **A — Tablas simples** | categorías, banners, cupones, envíos |
| **B — Tablas con filtros/badges** | pedidos, clientes, movimientos, lista de documentos POS |
| **C — Pesadas (patrón propio + compartido donde encaje)** | compras (lista + editor), cuentas por pagar, editor de cotización |

Más: el módulo compartido y el barrido de buscadores a fondo blanco.

**Fuera:**
- Cambios de lógica/datos: server actions, RPCs, exportadores, cálculos de compras/CxP
  (costeo, saldos, pagos, aplicaciones), kardex, validaciones.
- Hojas imprimibles: orden de compra (`HojaOrdenCompra`), estados de cuenta, kardex
  (`HojaKardex`), hojas fiscales, PDF de cotización.
- Migraciones.

## Principios

- **Solo estilo.** Conservar props/handlers/estado/queries de cada pantalla.
- **Dinero:** compras y CxP muestran costos/saldos/pagos — ningún número se recalcula ni
  se re-formatea fuera del `formatPrice()` que ya tengan. 2 decimales siempre.
- Tokens Merlin; no hardcodear valores con token.
- **Especificidad:** selector compuesto donde el re-skin cambie padding/fondo/tamaño de
  inputs o selects.
- El editor de cotización sigue el patrón de **cards por sección** del editor de producto
  (R5a), ya validado visualmente por el usuario.
- Idioma español; Lempiras `L.`.

## Mitigación de riesgo (módulo compartido)

El compartido toca 11 pantallas. Para acotarlo, la **primera tarea crea el módulo y lo
aplica solo a las 4 tablas simples** (grupo A). Si el patrón se ve bien ahí, los grupos B y
C lo adoptan con confianza; si algo no encaja, se detecta temprano sin arrastrar a las 11.

## Pruebas y verificación

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (verdes) al cierre de
  cada tarea.
- Verificación visual por tarea (login admin si el entorno lo permite; si no,
  estructura/estilos computados) y **pase visual final del usuario con el chrome agent**.
- Compras/CxP: confirmar que los montos mostrados son los mismos que antes del re-skin.

## Fuera de alcance

Cambios de lógica/datos; hojas imprimibles; migraciones; cualquier pantalla ya re-skineada
en olas anteriores (salvo el barrido de buscadores a fondo blanco).
