# Hondusport CMS Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestructurar Google Sheets, corregir n8n, actualizar app.js y construir un panel admin CMS en PHP+HTML que reemplaza la edición directa del sheet.

**Architecture:** Google Sheets actúa como base de datos; n8n expone un webhook GET (lectura) y uno nuevo POST (escritura); el frontend JS lee del GET; el panel admin HTML+PHP escribe vía el POST. Las imágenes se suben directo a Hostinger vía PHP.

**Tech Stack:** Google Sheets, n8n, Vanilla JS, PHP 7.4+ (Hostinger cPanel), HTML5/CSS3

---

## Mapa de Archivos

| Acción | Ruta |
|---|---|
| Modificar | `app.js` — globals, loadData, selectShipping, updateCheckoutPreview, getOrderText, checkExitIntent, filtros |
| Modificar | `index.html` — contenedor shipping dinámico, wrapper free-shipping-section |
| Modificar | n8n nodo `Transform Data` — código JS completo |
| Crear | `admin-hs/config.php` |
| Crear | `admin-hs/login.php` |
| Crear | `admin-hs/upload.php` |
| Crear | `admin-hs/delete.php` |
| Crear | `admin-hs/list-imgs.php` |
| Crear | `admin-hs/index.html` |
| Crear | `admin-hs/dashboard.html` |
| Crear | `admin-hs/productos.html` |
| Crear | `admin-hs/filtros.html` |
| Crear | `admin-hs/envios.html` |
| Crear | `admin-hs/cupones.html` |
| Crear | `admin-hs/banners.html` |

---

## FASE 1 — Google Sheets

### Task 1: Reestructurar hoja `Productos`

**Files:** Google Sheets (manual)

- [ ] **Step 1: Renombrar columnas existentes**

Abre el spreadsheet. En la hoja `Productos`, renombra las cabeceras:
```
name     → nombre
price    → precio
gender   → genero
desc     → descripcion
```

- [ ] **Step 2: Eliminar columnas obsoletas**

Elimina las columnas: `img`, `img2`, `img3`, `oferta_horas`, `visitas`

- [ ] **Step 3: Agregar columnas nuevas al final**

Agrega estas cabeceras en columnas vacías al final:
```
precio_original | personalizable | oferta_fin | activo | imagenes
```

- [ ] **Step 4: Rellenar columna `activo` para productos existentes**

En toda la columna `activo`, escribe `TRUE` para todos los productos existentes.

- [ ] **Step 5: Migrar imágenes existentes**

Para cada producto, copia la URL que tenía en `img` a la nueva columna `imagenes`. Si tenía `img2` e `img3`, pégalas separadas por coma: `url1,url2,url3`.

- [ ] **Step 6: Verificar**

La hoja debe tener exactamente estas columnas en orden:
`id | nombre | precio | precio_original | stock | cat | genero | badge | descripcion | personalizable | oferta_fin | rating | imagenes | activo`

---

### Task 2: Crear hoja `Envios`

**Files:** Google Sheets (manual)

- [ ] **Step 1: Crear hoja nueva**

En el spreadsheet, clic en `+` (nueva hoja), nombrarla `Envios`.

- [ ] **Step 2: Agregar cabeceras**

Fila 1:
```
id | nombre | descripcion | tipo | costo | descuento | activo
```

- [ ] **Step 3: Agregar las opciones iniciales**

```
1 | Envío en Tegucigalpa   | Entrega en 24-48h   | delivery | 80  | 0  | TRUE
2 | Envío a otras ciudades | Entrega en 3-5 días | delivery | 150 | 0  | TRUE
3 | Retiro en tienda       | [tu dirección]      | pickup   | 0   | 10 | TRUE
```

---

### Task 3: Mejorar hoja `Filtros`

**Files:** Google Sheets (manual)

- [ ] **Step 1: Agregar columnas nuevas**

En la hoja `Filtros`, agrega estas cabeceras al final de las existentes:
```
categorias | imagen | orden
```

- [ ] **Step 2: Rellenar `categorias` para tallas y subcats existentes**

Para cada fila de `tipo=talla` o `tipo=subcat`, llena `categorias` con la categoría a la que pertenece (ej: `Camisetas` o `Zapatillas`). Para `tipo=cat` y `tipo=genero` dejar vacío.

- [ ] **Step 3: Rellenar `orden`**

Numera las filas de cada tipo (1, 2, 3...) para controlar el orden de aparición en la página.

---

### Task 4: Actualizar `Config` y crear hoja `📖 Guia`

**Files:** Google Sheets (manual)

- [ ] **Step 1: Agregar keys a Config**

En la hoja `Configuracion`, agregar al final:
```
free_shipping_activo | TRUE
cupones_popup_activo | TRUE
```

- [ ] **Step 2: Crear hoja Guia**

Nueva hoja llamada `📖 Guia`. Agregar tabla con columnas `key | descripcion | valores_permitidos | ejemplo`:

```
whatsapp_number         | Número para recibir pedidos                     | número sin + | 50499999999
free_shipping_meta      | Monto mínimo para envío gratis                  | número       | 999
free_shipping_activo    | Mostrar barra de envío gratis                   | TRUE / FALSE | TRUE
free_shipping_msg       | Mensaje cuando se alcanza envío gratis          | texto        | ✨ ¡ENVÍO GRATIS!
cupones_popup_activo    | Mostrar popup de cupón al salir                 | TRUE / FALSE | TRUE
stock_bajo_limite       | A partir de cuántas unidades mostrar alerta     | número       | 5
promo_bar_texto         | Texto de la barra promocional superior          | texto/HTML   | Envío gratis desde L.
nombre_negocio          | Nombre de la tienda                             | texto        | Hondu Sport
slogan                  | Frase debajo del logo                           | texto        | Elite Performance
logo_url                | URL del logo                                    | URL          | https://...
color_primario          | Color dorado principal                          | hex          | #C9A84C
telefono_visible        | Teléfono en el footer                           | texto        | +504 9999-9999
email_contacto          | Email en el footer                              | email        | info@hondusport.com
direccion               | Dirección en el footer                          | texto        | Tegucigalpa, Honduras
horario                 | Horario en el footer                            | texto        | Lun-Sáb 9am-6pm
facebook_url            | URL Facebook                                    | URL          | https://facebook.com/...
instagram_url           | URL Instagram                                   | URL          | https://instagram.com/...
tiktok_url              | URL TikTok                                      | URL          |
whatsapp_url            | URL botón flotante WhatsApp                     | URL wa.me    | https://wa.me/504...
```

- [ ] **Step 3: Commit**

```bash
# No hay código que commitear — anota el cambio
git add -A
git commit -m "docs: agregar guia de configuracion al spreadsheet (manual)"
```

---

## FASE 2 — n8n Workflow GET

### Task 5: Agregar nodo `Get Envios` al workflow GET

**Files:** n8n UI (manual)

- [ ] **Step 1: Abrir workflow `Products API - HS`**

En n8n, abre el workflow existente `Products API - HS`.

- [ ] **Step 2: Agregar nodo Google Sheets**

Duplica el nodo `Get Filtros`. Renómbralo `Get Envios`. Cambia `sheetName` a la hoja `Envios` del mismo spreadsheet.

- [ ] **Step 3: Conectar al nodo Transform Data**

Conecta la salida de `Get Envios` como entrada adicional al nodo `Transform Data` (igual que los demás nodos).

---

### Task 6: Actualizar nodo `Transform Data`

**Files:** n8n nodo `Transform Data` (manual — pegar código JS)

- [ ] **Step 1: Abrir el nodo Transform Data y reemplazar todo el código**

Selecciona todo el código actual y reemplázalo con:

```javascript
let productsRaw = [];
let configRaw = [];
let bannersRaw = [];
let cuponesRaw = [];
let filtrosRaw = [];
let enviosRaw = [];

try { productsRaw = $('Get Products').all(); } catch(e) {}
try { configRaw = $('Get Config').all(); } catch(e) {}
try { bannersRaw = $('Get Banners').all(); } catch(e) {}
try { cuponesRaw = $('Get Cupones').all(); } catch(e) {}
try { filtrosRaw = $('Get Filtros').all(); } catch(e) {}
try { enviosRaw = $('Get Envios').all(); } catch(e) {}

// --- Productos ---
const products = productsRaw
  .map(item => {
    const p = item.json;
    const imagenesRaw = String(p.imagenes || '');
    const imgs = imagenesRaw.split(',').map(u => u.trim()).filter(Boolean);
    return {
      id: parseInt(p.id) || 0,
      name: String(p.nombre || p.name || ''),
      price: parseFloat(p.precio || p.price) || 0,
      precio_original: parseFloat(p.precio_original) || 0,
      stock: parseInt(p.stock) || 0,
      cat: String(p.cat || ''),
      gender: String(p.genero || p.gender || ''),
      rating: parseInt(p.rating) || 5,
      badge: String(p.badge || ''),
      desc: String(p.descripcion || p.desc || ''),
      personalizable: String(p.personalizable || '').toUpperCase() === 'TRUE',
      oferta_fin: String(p.oferta_fin || ''),
      imagenes: imagenesRaw,
      imgs: imgs,
      activo: String(p.activo || 'TRUE').toUpperCase() === 'TRUE'
    };
  })
  .filter(p => p.activo && p.id > 0);

// --- Config ---
const config = {};
configRaw.forEach(item => {
  const c = item.json;
  if (c.key) {
    let val = c.value;
    if (typeof val === 'number') val = val.toLocaleString('fullwide', {useGrouping: false});
    config[String(c.key)] = String(val || '');
  }
});

// --- Banners ---
const banners = bannersRaw.map(item => {
  const b = item.json;
  return {
    titulo: String(b.titulo || ''),
    subtitulo: String(b.subtitulo || ''),
    btn_texto: String(b.btn_texto || 'Ver más'),
    btn_link: String(b.btn_link || '#tienda'),
    imagen: String(b.imagen || '')
  };
});

// --- Cupones ---
const cupones = cuponesRaw
  .filter(item => {
    const a = item.json.activo;
    return a === 'TRUE' || a === true || a === 'true';
  })
  .map(item => ({
    codigo: String(item.json.codigo || '').toUpperCase().trim(),
    descuento: parseInt(item.json.descuento) || 0,
    tipo: String(item.json.tipo || 'porcentaje')
  }));

// --- Filtros ---
const filtros = filtrosRaw
  .filter(item => {
    const a = item.json.activo;
    return a === 'TRUE' || a === true || a === 'true';
  })
  .map(item => ({
    tipo: String(item.json.tipo || '').toLowerCase().trim(),
    valor: String(item.json.valor || '').trim(),
    categorias: String(item.json.categorias || item.json.categoria || item.json.parent || '').trim(),
    imagen: String(item.json.imagen || '').trim(),
    orden: parseInt(item.json.orden) || 0,
    activo: true
  }))
  .sort((a, b) => a.orden - b.orden);

// --- Envios ---
const envios = enviosRaw
  .filter(item => {
    const a = item.json.activo;
    return a === 'TRUE' || a === true || a === 'true';
  })
  .map(item => ({
    id: parseInt(item.json.id) || 0,
    nombre: String(item.json.nombre || ''),
    descripcion: String(item.json.descripcion || ''),
    tipo: String(item.json.tipo || 'delivery').toLowerCase(),
    costo: parseFloat(item.json.costo) || 0,
    descuento: parseFloat(item.json.descuento) || 0
  }));

return [{
  json: {
    success: true,
    timestamp: new Date().toISOString(),
    data: { products, config, banners, cupones, filtros, envios }
  }
}];
```

- [ ] **Step 2: Guardar y ejecutar el workflow**

Clic en `Save` → `Test workflow`. Verificar en la salida del nodo `Send Response` que el JSON incluye `data.envios` como array y que `data.products[0].imgs` es un array.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: actualizar Transform Data n8n — nuevos campos productos, filtros y envios"
```

---

## FASE 3 — n8n Workflow POST (Admin)

### Task 7: Crear workflow `hondusport-admin`

**Files:** n8n UI (manual)

- [ ] **Step 1: Crear nuevo workflow**

En n8n, `+ New Workflow`, nombrar `Admin API - HS`.

- [ ] **Step 2: Agregar Webhook Trigger**

Nodo `Webhook`:
- HTTP Method: `POST`
- Path: `hondusport-admin`
- Response Mode: `Response Node`
- Allowed Origins: `*`

- [ ] **Step 3: Agregar nodo Switch**

Nodo `Switch` conectado al webhook:
- Mode: `Rules`
- Regla 1: `{{ $json.body.sheet }}` equals `Productos`
- Regla 2: `{{ $json.body.sheet }}` equals `Filtros`
- Regla 3: `{{ $json.body.sheet }}` equals `Envios`
- Regla 4: `{{ $json.body.sheet }}` equals `Cupones`
- Regla 5: `{{ $json.body.sheet }}` equals `Banners`
- Regla 6: `{{ $json.body.sheet }}` equals `Configuracion`

- [ ] **Step 4: Agregar nodo Code para cada rama**

Para cada rama del Switch, agregar un nodo `Code` que determina la operación. Ejemplo para `Productos`:

```javascript
const body = $input.first().json.body;
const action = body.action; // create | update | delete
const id = body.id;
const data = body.data || {};

return [{ json: { action, id, data, sheet: 'Productos' } }];
```

- [ ] **Step 5: Agregar nodo Google Sheets por rama**

Para cada nodo Code, conectar un nodo Google Sheets con:
- Credential: `Google Sheets SoporteTecnico` (la misma que usa el workflow GET)
- Document ID: `12Ldbs8vvPKtQNbrJO9DnZL_A6D0AAGukndheUmXmnRs`
- Sheet: el nombre correspondiente (`Productos`, `Filtros`, etc.)
- Operation: usar expresión `{{ $json.action === 'create' ? 'appendOrUpdate' : $json.action === 'delete' ? 'delete' : 'update' }}`
- Para `update`/`delete`: usar columna `id` como clave de búsqueda
- Para `create`: Append new row con los campos de `$json.data`
- **Excepción para la rama `Configuracion`**: la clave de búsqueda es la columna `key` (no `id`), y solo se actualiza la columna `value` con `$json.data.value`

- [ ] **Step 6: Agregar nodo Respond to Webhook al final**

Nodo `Respond to Webhook`:
- Respond With: JSON
- Response Body: `{{ { success: true, action: $json.action } }}`

- [ ] **Step 7: Anotar la URL del webhook**

La URL del nuevo webhook será:
`https://webhook.mplasesores.com/webhook/hondusport-admin`

Guardar esta URL — se usará en `admin-hs/config.php`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: crear workflow n8n hondusport-admin para escritura desde panel CMS"
```

---

## FASE 4 — app.js

### Task 8: Actualizar variables globales e imágenes en app.js

**Files:** Modify `app.js:1-21`, `app.js:56-65`, `app.js:264`, `app.js:546`, `app.js:683`, `app.js:754`, `app.js:1015-1016`, `app.js:1057`, `app.js:1204`, `app.js:1209`, `app.js:1396`

- [ ] **Step 1: Reemplazar variables globales (líneas 5-9)**

```javascript
// ANTES:
let COSTO_ENVIO = 0;
let PICKUP_DESCUENTO = 0;
let PICKUP_DIRECCION = "";
let PICKUP_ACTIVO = false;
let DELIVERY_METHOD = 'delivery';

// DESPUÉS:
let ENVIOS = [];
let SELECTED_ENVIO = null;
```

- [ ] **Step 2: En loadData(), reemplazar bloque de config de envío (líneas 58-65)**

```javascript
// ELIMINAR estas líneas:
if (data.config.costo_envio) COSTO_ENVIO = parseFloat(data.config.costo_envio);
if (data.config.pickup_descuento) PICKUP_DESCUENTO = parseFloat(data.config.pickup_descuento);
if (data.config.pickup_direccion) PICKUP_DIRECCION = data.config.pickup_direccion;
FREE_SHIPPING_MSG = ...
PICKUP_ACTIVO = String(data.config.pickup_activo || "").trim().toUpperCase() === "TRUE";
if (PICKUP_ACTIVO) document.getElementById('btn-pickup').style.display = 'inline-flex';

// AGREGAR en su lugar (después de `products = data.products`):
ENVIOS = data.envios || [];
SELECTED_ENVIO = ENVIOS[0] || null;
window.FREE_SHIPPING_ACTIVO = String(data.config.free_shipping_activo || 'TRUE').toUpperCase() === 'TRUE';
window.CUPONES_POPUP_ACTIVO = String(data.config.cupones_popup_activo || 'TRUE').toUpperCase() === 'TRUE';
FREE_SHIPPING_MSG = (data.config.free_shipping_msg && data.config.free_shipping_msg.trim() !== "")
  ? data.config.free_shipping_msg : "✨ ¡TIENES ENVÍO GRATIS!";
if (!window.FREE_SHIPPING_ACTIVO) {
  const fsSection = document.getElementById('free-shipping-section');
  if (fsSection) fsSection.style.display = 'none';
}
```

- [ ] **Step 3: Reemplazar todas las referencias a `p.img` por `p.imgs?.[0] || ''`**

Buscar y reemplazar en app.js:

| Línea | Antes | Después |
|---|---|---|
| 264 | `p.cat === cat && p.img)?.img` | `p.cat === cat && p.imgs?.[0])?.imgs?.[0]` |
| 546 | `const safeImg = escapeHTML(p.img \|\| '')` | `const safeImg = escapeHTML(p.imgs?.[0] \|\| '')` |
| 683 | `<img src="${p.img}"` | `<img src="${p.imgs?.[0] \|\| ''}"` |
| 754 | `const safeImg = escapeHTML(item.img)` | `const safeImg = escapeHTML(item.imgs?.[0] \|\| item.img \|\| '')` |
| 1015 | `document.getElementById('modal-img-main').src = p.img` | `document.getElementById('modal-img-main').src = p.imgs?.[0] \|\| ''` |
| 1016 | `(p.imgs \|\| [p.img, p.img2, p.img3].filter(Boolean))` | `(p.imgs \|\| []).filter(Boolean)` |
| 1057 | `<img src="${r.img}"` | `<img src="${r.imgs?.[0] \|\| ''}"` |
| 1204 | `(f.categoria \|\| f.parent \|\| '')` | `(f.categorias \|\| '')` |
| 1209 | `<img src="${p.img}"` | `<img src="${p.imgs?.[0] \|\| ''}"` |
| 1396 | `<img src="${p.img}"` | `<img src="${p.imgs?.[0] \|\| ''}"` |

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: migrar p.img a p.imgs[0] y cargar ENVIOS desde webhook"
```

---

### Task 9: Actualizar filtros con `categorias` y `orden`

**Files:** Modify `app.js:108-122`

- [ ] **Step 1: Reemplazar filtrado de filtros en loadData()**

Localizar el bloque que filtra `genderFiltros`, `catFiltros`, `tallaFiltros`, `subcatFiltros` (líneas ~108-111). Reemplazar:

```javascript
// ANTES:
const genderFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'gender' && ...);
const catFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'cat' && ...);
const tallaFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'talla' && ...);
const subcatFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'subcat' && ...);

// DESPUÉS (agrega .sort por orden):
const isActivo = f => f.activo === true || String(f.activo).toUpperCase() === 'TRUE';
const genderFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'genero' && isActivo(f))
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
const catFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'cat' && isActivo(f))
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
const tallaFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'talla' && isActivo(f))
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
const subcatFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'subcat' && isActivo(f))
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
```

- [ ] **Step 2: Reemplazar uso de `f.categoria || f.parent` por `f.categorias`**

Buscar todas las ocurrencias de `f.categoria || f.parent` en app.js y reemplazar por `f.categorias`:

```javascript
// ANTES (múltiples lugares):
(f.categoria || f.parent || '').split(',').map(c => c.trim().toLowerCase()).includes(p.cat.toLowerCase())

// DESPUÉS:
(f.categorias || '').split(',').map(c => c.trim().toLowerCase()).includes(p.cat.toLowerCase())
```

- [ ] **Step 3: Usar `f.imagen` para galería de categorías (línea ~262)**

```javascript
// ANTES:
const catImg = (catFilterObj && catFilterObj.imagen && catFilterObj.imagen.trim() !== "")
               ? catFilterObj.imagen
               : (products.find(p => p.cat === cat && p.img)?.img || '');

// DESPUÉS:
const catImg = (catFilterObj && catFilterObj.imagen && catFilterObj.imagen.trim() !== "")
               ? catFilterObj.imagen
               : (products.find(p => p.cat === cat && p.imgs?.[0])?.imgs?.[0] || '');
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: filtros con campo categorias y orden dinamico"
```

---

### Task 10: Reemplazar envíos hardcodeados por dinámicos

**Files:** Modify `app.js`, `index.html:311-318`

- [ ] **Step 1: Modificar index.html — reemplazar botones hardcodeados**

Localizar el bloque (líneas 311-318):
```html
<div style="display: flex; gap: 10px; margin-bottom: 1.5rem;">
    <button id="btn-delivery" class="delivery-option-btn active" onclick="selectDelivery('delivery')">
        <i class="fa-solid fa-truck"></i> ENVÍO A DOMICILIO
    </button>
    <button id="btn-pickup" class="delivery-option-btn" style="display:none;" onclick="selectDelivery('pickup')">
        <i class="fa-solid fa-store"></i> RETIRAR EN TIENDA
    </button>
</div>
```

Reemplazar por:
```html
<div id="shipping-options-container" style="display: flex; gap: 10px; margin-bottom: 1.5rem; flex-wrap: wrap;"></div>
```

- [ ] **Step 2: Modificar index.html — agregar wrapper free-shipping-section**

Localizar (líneas 170-171):
```html
<div class="shipping-meter"><div id="shipping-bar" class="shipping-bar"></div></div>
<p id="shipping-msg"></p>
```

Reemplazar por:
```html
<div id="free-shipping-section">
    <div class="shipping-meter"><div id="shipping-bar" class="shipping-bar"></div></div>
    <p id="shipping-msg"></p>
</div>
```

- [ ] **Step 3: En loadData(), agregar renderizado de botones de envío**

Después de cargar `ENVIOS`, agregar:
```javascript
// Renderizar botones de envío en el checkout modal
const shippingContainer = document.getElementById('shipping-options-container');
if (shippingContainer && ENVIOS.length > 0) {
  const icons = { delivery: 'fa-truck', pickup: 'fa-store' };
  shippingContainer.innerHTML = ENVIOS.map((e, i) => `
    <button class="delivery-option-btn ${i === 0 ? 'active' : ''}"
      onclick="selectShipping(${e.id})"
      data-envio-id="${e.id}">
      <i class="fa-solid ${icons[e.tipo] || 'fa-box'}"></i> ${escapeHTML(e.nombre)}
    </button>`).join('');
  SELECTED_ENVIO = ENVIOS[0];
}
```

- [ ] **Step 4: Reemplazar función `selectDelivery` por `selectShipping`**

Localizar la función `selectDelivery` (línea ~842) y reemplazarla completamente:

```javascript
function selectShipping(envioId) {
  // Guardar datos del formulario actual antes de cambiar
  const nameField = document.getElementById('c-name');
  if (nameField) {
    const saved = {
      name: nameField.value,
      phone: document.getElementById('c-phone')?.value || '',
      email: document.getElementById('c-email')?.value || '',
      city: document.getElementById('c-city')?.value || '',
      address: document.getElementById('c-address')?.value || ''
    };
    localStorage.setItem('hs_checkout_delivery', JSON.stringify(saved));
  }

  SELECTED_ENVIO = ENVIOS.find(e => e.id === envioId) || ENVIOS[0];

  document.querySelectorAll('.delivery-option-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-envio-id="${envioId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const saved = JSON.parse(localStorage.getItem('hs_checkout_delivery')) || {};
  const infoDiv = document.getElementById('delivery-info');

  const addressFields = SELECTED_ENVIO.tipo === 'delivery' ? `
    <input type="text" id="c-city" class="auto-save" placeholder="CIUDAD / DEPARTAMENTO" required value="${escapeHTML(saved.city || '')}">
    <textarea id="c-address" class="auto-save" placeholder="DIRECCIÓN EXACTA" rows="3" required>${escapeHTML(saved.address || '')}</textarea>` : '';

  const pickupInfo = SELECTED_ENVIO.tipo === 'pickup' && SELECTED_ENVIO.descripcion ? `
    <div style="padding:1rem; border:1.5px dashed var(--primary); background:rgba(201,168,76,0.05); margin-bottom:1.5rem;">
      <p style="font-weight:700; font-size:0.9rem; margin-bottom:5px;"><i class="fa-solid fa-location-dot"></i> PUNTO DE RETIRO:</p>
      <p style="font-size:0.85rem; opacity:0.8;">${escapeHTML(SELECTED_ENVIO.descripcion)}</p>
      ${SELECTED_ENVIO.descuento > 0 ? `<span style="display:block;margin-top:10px;color:#27AE60;font-weight:700;font-size:0.75rem;">🎁 DESCUENTO EXTRA: ${SELECTED_ENVIO.descuento}%</span>` : ''}
    </div>` : '';

  infoDiv.innerHTML = `
    ${pickupInfo}
    <form id="checkout-form" onsubmit="processCheckout(event)">
      <input type="text" id="c-name" class="auto-save" placeholder="NOMBRE COMPLETO" required value="${escapeHTML(saved.name || '')}">
      <input type="tel" id="c-phone" class="auto-save" placeholder="TELÉFONO" required value="${escapeHTML(saved.phone || '')}">
      <input type="email" id="c-email" class="auto-save" placeholder="CORREO ELECTRÓNICO" required value="${escapeHTML(saved.email || '')}">
      ${addressFields}
      <button type="submit" class="btn-add-main" style="width:100%; margin-bottom:10px;">COMPRAR</button>
    </form>`;

  initAutoSave();
  updateCheckoutPreview();
}
```

- [ ] **Step 5: Reemplazar `updateCheckoutPreview`**

```javascript
function updateCheckoutPreview() {
  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
  const couponDisc = activeDiscount > 0 ? subtotal * (activeDiscount / 100) : 0;
  const envioDisc = SELECTED_ENVIO ? subtotal * ((SELECTED_ENVIO.descuento || 0) / 100) : 0;
  const totalDiscount = couponDisc + envioDisc;
  const envioActivo = window.FREE_SHIPPING_ACTIVO !== false;
  const freeShippingMeta = parseFloat(FREE_SHIPPING_THRESHOLD) || 999;
  const shippingFee = (SELECTED_ENVIO && SELECTED_ENVIO.tipo === 'delivery' && (!envioActivo || subtotal < freeShippingMeta))
    ? (SELECTED_ENVIO.costo || 0) : 0;

  document.getElementById('preview-subtotal').innerText = formatPrice(subtotal);
  const dr = document.getElementById('preview-descuento-row');
  if (totalDiscount > 0) { dr.style.display = 'flex'; document.getElementById('preview-descuento').innerText = `-${formatPrice(totalDiscount)}`; }
  else dr.style.display = 'none';
  const sr = document.getElementById('preview-envio-row');
  if (SELECTED_ENVIO && SELECTED_ENVIO.tipo === 'delivery') {
    sr.style.display = 'flex';
    document.getElementById('preview-envio').innerText = shippingFee > 0 ? formatPrice(shippingFee) : 'GRATIS';
  } else sr.style.display = 'none';
  document.getElementById('preview-total').innerText = formatPrice(subtotal - totalDiscount + shippingFee);
}
```

- [ ] **Step 6: Reemplazar `getOrderText`**

```javascript
function getOrderText() {
  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
  let discountAmount = activeDiscount > 0 ? subtotal * (activeDiscount / 100) : 0;
  if (SELECTED_ENVIO && SELECTED_ENVIO.descuento > 0) discountAmount += subtotal * (SELECTED_ENVIO.descuento / 100);
  const freeShippingMeta = parseFloat(FREE_SHIPPING_THRESHOLD) || 999;
  const shippingFee = (SELECTED_ENVIO && SELECTED_ENVIO.tipo === 'delivery' &&
    (window.FREE_SHIPPING_ACTIVO === false || subtotal < freeShippingMeta))
    ? (SELECTED_ENVIO.costo || 0) : 0;

  let msg = `DATOS CLIENTE\nMétodo: ${SELECTED_ENVIO ? escapeHTML(SELECTED_ENVIO.nombre) : 'ENVÍO'}\n`;
  msg += `Nombre: ${document.getElementById('c-name').value}\n`;
  msg += `Tel: ${document.getElementById('c-phone').value}\n`;
  msg += `Email: ${document.getElementById('c-email').value}\n`;
  if (SELECTED_ENVIO && SELECTED_ENVIO.tipo === 'delivery') {
    msg += `Ciudad: ${document.getElementById('c-city')?.value || ''}\n`;
    msg += `Dirección: ${document.getElementById('c-address')?.value || ''}\n`;
  } else if (SELECTED_ENVIO && SELECTED_ENVIO.descripcion) {
    msg += `Punto retiro: ${SELECTED_ENVIO.descripcion}\n`;
  }
  msg += `\nPEDIDO\n`;
  cart.forEach(i => msg += `- ${i.name} (${i.size}) [${i.custom}] x${i.qty} - L.${i.price * i.qty}\n`);
  msg += `\nSubtotal: ${formatPrice(subtotal)}\nEnvío: ${shippingFee > 0 ? formatPrice(shippingFee) : 'Gratis'}\nDescuento total: -${formatPrice(discountAmount)}\nTOTAL FINAL: ${formatPrice(subtotal - discountAmount + shippingFee)}`;
  return encodeURIComponent(msg);
}
```

- [ ] **Step 7: Actualizar `openCheckoutModal`**

```javascript
// ANTES:
function openCheckoutModal() { if(cart.length > 0) { document.getElementById('checkout-modal').style.display = 'flex'; if (document.getElementById('delivery-info').innerHTML.trim() === "") selectDelivery(DELIVERY_METHOD); else updateCheckoutPreview(); } }

// DESPUÉS:
function openCheckoutModal() {
  if (cart.length > 0) {
    document.getElementById('checkout-modal').style.display = 'flex';
    const infoDiv = document.getElementById('delivery-info');
    if (!infoDiv.innerHTML.trim() && SELECTED_ENVIO) selectShipping(SELECTED_ENVIO.id);
    else updateCheckoutPreview();
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add app.js index.html
git commit -m "feat: envios dinamicos desde sheet — reemplaza delivery/pickup hardcodeados"
```

---

### Task 11: Toggle free shipping y coupon popup

**Files:** Modify `app.js:738-813`, `app.js:1351`

- [ ] **Step 1: Actualizar la lógica de la barra de envío gratis (línea ~738)**

```javascript
// ANTES (línea ~738):
if (finalTotal >= FREE_SHIPPING_THRESHOLD && !freeShippingReached) {

// DESPUÉS — verificar si está activo:
if (window.FREE_SHIPPING_ACTIVO !== false && finalTotal >= FREE_SHIPPING_THRESHOLD && !freeShippingReached) {
```

Y más abajo (línea ~811):
```javascript
// ANTES:
if (finalTotal >= FREE_SHIPPING_THRESHOLD) {

// DESPUÉS:
if (window.FREE_SHIPPING_ACTIVO !== false && finalTotal >= FREE_SHIPPING_THRESHOLD) {
```

- [ ] **Step 2: Actualizar `checkExitIntent` para respetar el toggle**

```javascript
// ANTES:
function checkExitIntent() { let t = false; document.addEventListener('mouseleave', (e) => { if(e.clientY < 0 && !t && window.innerWidth > 768) { document.getElementById('exit-popup').classList.add('active'); document.getElementById('exit-overlay').classList.add('active'); t=true; }}); }

// DESPUÉS:
function checkExitIntent() {
  if (window.CUPONES_POPUP_ACTIVO === false) return;
  let t = false;
  document.addEventListener('mouseleave', (e) => {
    if (e.clientY < 0 && !t && window.innerWidth > 768) {
      document.getElementById('exit-popup').classList.add('active');
      document.getElementById('exit-overlay').classList.add('active');
      t = true;
    }
  });
}
```

- [ ] **Step 3: Verificar en el navegador**

Abre la tienda. Verifica:
1. El carrito muestra los botones de envío con los nombres del sheet
2. Seleccionar cada opción de envío cambia el formulario (delivery muestra ciudad/dirección, pickup muestra la dirección del punto)
3. El total se calcula con el costo del envío seleccionado
4. Si `free_shipping_activo = FALSE` en Config, la barra desaparece
5. Si `cupones_popup_activo = FALSE`, el popup no aparece al mover el mouse

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: toggles free shipping y coupon popup desde config sheet"
```

---

## FASE 5 — PHP Admin Backend

### Task 12: Crear archivos PHP del panel admin

**Files:** Create `admin-hs/config.php`, `admin-hs/login.php`, `admin-hs/logout.php`

- [ ] **Step 1: Crear `admin-hs/config.php`**

```php
<?php
define('ADMIN_PASSWORD', 'hs_admin_2024');
define('MAX_UPLOAD_SIZE', 2 * 1024 * 1024);
define('SITE_URL', 'https://tudominio.com');
define('N8N_ADMIN_WEBHOOK', 'https://webhook.mplasesores.com/webhook/hondusport-admin');
define('N8N_GET_WEBHOOK', 'https://webhook.mplasesores.com/webhook/hondusport-products');
```

> ⚠️ Cambiar `ADMIN_PASSWORD` y `SITE_URL` antes de subir a Hostinger.

- [ ] **Step 2: Crear `admin-hs/login.php`**

```php
<?php
require_once 'config.php';
session_start();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['password']) && $_POST['password'] === ADMIN_PASSWORD) {
        $_SESSION['hs_admin_auth'] = true;
        header('Location: dashboard.html');
    } else {
        header('Location: index.html?error=1');
    }
    exit;
}
header('Location: index.html');
exit;
```

- [ ] **Step 3: Crear `admin-hs/logout.php`**

```php
<?php
session_start();
session_destroy();
header('Location: index.html');
exit;
```

- [ ] **Step 4: Crear `admin-hs/auth.php` (helper incluido en todos los PHP)**

```php
<?php
require_once __DIR__ . '/config.php';
session_start();
if (!isset($_SESSION['hs_admin_auth'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No autorizado']);
    exit;
}
```

---

### Task 13: Crear upload.php, delete.php, list-imgs.php

**Files:** Create `admin-hs/upload.php`, `admin-hs/delete.php`, `admin-hs/list-imgs.php`

- [ ] **Step 1: Crear `admin-hs/upload.php`**

```php
<?php
require_once 'auth.php';
header('Content-Type: application/json');

$tipo = preg_replace('/[^a-z]/', '', strtolower($_POST['tipo'] ?? 'productos'));
$id   = intval($_POST['id'] ?? 0);

if (!isset($_FILES['imagen']) || $_FILES['imagen']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['error' => 'No se recibió archivo']); exit;
}

$file = $_FILES['imagen'];
if ($file['size'] > MAX_UPLOAD_SIZE) {
    echo json_encode(['error' => 'Archivo mayor a 2MB']); exit;
}

$allowed = ['image/jpeg','image/png','image/webp'];
if (!in_array($file['type'], $allowed)) {
    echo json_encode(['error' => 'Formato no permitido (JPG, PNG, WEBP)']); exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ['jpg','jpeg','png','webp'])) {
    echo json_encode(['error' => 'Extensión no permitida']); exit;
}

$filename = $id . '-' . time() . '.' . $ext;
$dir = __DIR__ . '/imgs/' . $tipo . '/' . $id . '/';
if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
    echo json_encode(['error' => 'No se pudo crear directorio']); exit;
}

if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) {
    echo json_encode(['error' => 'Error al guardar imagen']); exit;
}

echo json_encode([
    'success'  => true,
    'url'      => SITE_URL . '/admin-hs/imgs/' . $tipo . '/' . $id . '/' . $filename,
    'filename' => $filename
]);
```

- [ ] **Step 2: Crear `admin-hs/delete.php`**

```php
<?php
require_once 'auth.php';
header('Content-Type: application/json');

$body    = json_decode(file_get_contents('php://input'), true);
$tipo    = preg_replace('/[^a-z]/', '', strtolower($body['tipo'] ?? 'productos'));
$id      = intval($body['id'] ?? 0);
$filename = basename($body['filename'] ?? '');

if (!$filename) { echo json_encode(['error' => 'Filename inválido']); exit; }

$path = __DIR__ . '/imgs/' . $tipo . '/' . $id . '/' . $filename;
if (!file_exists($path)) { echo json_encode(['error' => 'Archivo no encontrado']); exit; }

unlink($path);
echo json_encode(['success' => true]);
```

- [ ] **Step 3: Crear `admin-hs/list-imgs.php`**

```php
<?php
require_once 'auth.php';
header('Content-Type: application/json');

$tipo = preg_replace('/[^a-z]/', '', strtolower($_GET['tipo'] ?? 'productos'));
$id   = intval($_GET['id'] ?? 0);
$dir  = __DIR__ . '/imgs/' . $tipo . '/' . $id . '/';

if (!is_dir($dir)) { echo json_encode(['imgs' => []]); exit; }

$exts  = ['jpg','jpeg','png','webp'];
$files = array_values(array_filter(
    scandir($dir),
    fn($f) => in_array(strtolower(pathinfo($f, PATHINFO_EXTENSION)), $exts)
));

$base = SITE_URL . '/admin-hs/imgs/' . $tipo . '/' . $id . '/';
echo json_encode(['imgs' => array_map(fn($f) => ['filename' => $f, 'url' => $base . $f], $files)]);
```

- [ ] **Step 4: Crear `admin-hs/.htaccess` para proteger carpeta imgs de listado**

```
Options -Indexes
```

- [ ] **Step 5: Commit**

```bash
git add admin-hs/
git commit -m "feat: PHP backend del panel admin (upload, delete, list-imgs, login)"
```

---

## FASE 6 — HTML Admin Panel

### Task 14: Crear login y dashboard

**Files:** Create `admin-hs/index.html`, `admin-hs/dashboard.html`

- [ ] **Step 1: Crear `admin-hs/index.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hondusport Admin</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f0f; color: #eee; font-family: Inter, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .login-box { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 2.5rem; width: 340px; }
  .login-box h1 { font-size: 1.4rem; color: #C9A84C; letter-spacing: 2px; margin-bottom: 0.5rem; }
  .login-box p { font-size: 0.8rem; opacity: 0.5; margin-bottom: 2rem; }
  input { width: 100%; background: #111; border: 1px solid #333; color: #eee; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.95rem; margin-bottom: 1rem; }
  button { width: 100%; background: #C9A84C; color: #000; border: none; padding: 0.85rem; border-radius: 6px; font-weight: 700; font-size: 0.95rem; cursor: pointer; letter-spacing: 1px; }
  .error { background: #2a0000; border: 1px solid #ff4444; color: #ff6666; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem; }
</style>
</head>
<body>
<div class="login-box">
  <h1>HONDUSPORT</h1>
  <p>Panel de Administración</p>
  <?php if (isset($_GET['error'])): ?>
  <div class="error">Contraseña incorrecta.</div>
  <?php endif; ?>
  <form method="POST" action="login.php">
    <input type="password" name="password" placeholder="CONTRASEÑA" required autofocus>
    <button type="submit">INGRESAR</button>
  </form>
</div>
</body>
</html>
```

> Renombrar a `index.php` para que PHP procese el `<?php`.

- [ ] **Step 2: Crear `admin-hs/dashboard.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hondusport Admin</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f0f; color: #eee; font-family: Inter, sans-serif; display: flex; min-height: 100vh; }
  .sidebar { width: 220px; background: #141414; border-right: 1px solid #2a2a2a; display: flex; flex-direction: column; padding: 1.5rem 0; position: fixed; height: 100vh; }
  .sidebar .brand { padding: 0 1.5rem 1.5rem; border-bottom: 1px solid #2a2a2a; margin-bottom: 1rem; }
  .sidebar .brand h2 { color: #C9A84C; font-size: 1.1rem; letter-spacing: 2px; }
  .sidebar .brand p { font-size: 0.7rem; opacity: 0.4; margin-top: 2px; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 0.75rem 1.5rem; color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.9rem; font-weight: 600; letter-spacing: 0.5px; transition: 0.2s; cursor: pointer; border: none; background: none; width: 100%; text-align: left; }
  .nav-item:hover, .nav-item.active { color: #C9A84C; background: rgba(201,168,76,0.08); }
  .nav-item i { width: 18px; text-align: center; font-size: 0.95rem; }
  .sidebar-footer { margin-top: auto; padding: 1rem 1.5rem; border-top: 1px solid #2a2a2a; }
  .main { margin-left: 220px; flex: 1; display: flex; flex-direction: column; }
  .topbar { background: #141414; border-bottom: 1px solid #2a2a2a; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
  .topbar h1 { font-size: 1.1rem; letter-spacing: 1px; }
  .content { padding: 2rem; flex: 1; }
  iframe { border: none; width: 100%; height: calc(100vh - 60px); }
</style>
</head>
<body>
<aside class="sidebar">
  <div class="brand"><h2>HONDUSPORT</h2><p>PANEL ADMIN</p></div>
  <a class="nav-item active" onclick="loadSection('productos', this)"><i class="fa-solid fa-box"></i> Productos</a>
  <a class="nav-item" onclick="loadSection('filtros', this)"><i class="fa-solid fa-tags"></i> Categorías & Tallas</a>
  <a class="nav-item" onclick="loadSection('envios', this)"><i class="fa-solid fa-truck"></i> Envíos</a>
  <a class="nav-item" onclick="loadSection('cupones', this)"><i class="fa-solid fa-ticket"></i> Cupones</a>
  <a class="nav-item" onclick="loadSection('banners', this)"><i class="fa-solid fa-image"></i> Banners</a>
  <div class="sidebar-footer">
    <a class="nav-item" href="logout.php"><i class="fa-solid fa-right-from-bracket"></i> Salir</a>
  </div>
</aside>
<main class="main">
  <iframe id="content-frame" src="productos.html"></iframe>
</main>
<script>
function loadSection(name, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('content-frame').src = name + '.html';
}
</script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add admin-hs/
git commit -m "feat: login y dashboard layout del panel admin"
```

---

### Task 15: Crear productos.html

**Files:** Create `admin-hs/productos.html`

- [ ] **Step 1: Crear `admin-hs/productos.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Productos</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:Inter,sans-serif;padding:1.5rem}
  h2{color:#C9A84C;letter-spacing:2px;margin-bottom:1.5rem;font-size:1.1rem}
  .toolbar{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center}
  input[type=text],input[type=number],input[type=email],select,textarea{background:#1a1a1a;border:1px solid #333;color:#eee;padding:.6rem .9rem;border-radius:6px;font-size:.9rem;width:100%}
  .btn{padding:.6rem 1.2rem;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.85rem;letter-spacing:.5px}
  .btn-primary{background:#C9A84C;color:#000}
  .btn-secondary{background:#2a2a2a;color:#eee}
  .btn-danger{background:#c0392b;color:#fff}
  .btn-sm{padding:.4rem .8rem;font-size:.75rem}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{background:#1a1a1a;padding:.75rem 1rem;text-align:left;font-size:.75rem;letter-spacing:1px;color:#aaa;border-bottom:1px solid #2a2a2a}
  td{padding:.75rem 1rem;border-bottom:1px solid #1e1e1e;vertical-align:middle}
  tr:hover td{background:rgba(255,255,255,.03)}
  .product-thumb{width:50px;height:50px;object-fit:cover;border-radius:4px;background:#222}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700}
  .badge-active{background:rgba(39,174,96,.2);color:#27AE60}
  .badge-inactive{background:rgba(192,57,43,.2);color:#c0392b}
  .modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:100;overflow-y:auto;padding:2rem}
  .modal.open{display:flex;align-items:flex-start;justify-content:center}
  .modal-box{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:2rem;width:100%;max-width:700px;position:relative}
  .modal-box h3{color:#C9A84C;margin-bottom:1.5rem;letter-spacing:1px}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .form-full{grid-column:1/-1}
  label{font-size:.75rem;letter-spacing:.5px;color:#aaa;display:block;margin-bottom:.3rem}
  .imgs-grid{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.5rem}
  .img-item{position:relative;width:80px;height:80px}
  .img-item img{width:100%;height:100%;object-fit:cover;border-radius:6px}
  .img-item .del-img{position:absolute;top:-6px;right:-6px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
  .upload-area{border:2px dashed #333;border-radius:8px;padding:1.5rem;text-align:center;cursor:pointer;transition:.2s;margin-top:.5rem}
  .upload-area:hover{border-color:#C9A84C}
  .toast{position:fixed;bottom:2rem;right:2rem;background:#C9A84C;color:#000;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;font-size:.85rem;z-index:999;display:none}
  .search-bar{flex:1;max-width:300px}
</style>
</head>
<body>
<h2>📦 PRODUCTOS</h2>
<div class="toolbar">
  <input type="text" class="search-bar" id="search" placeholder="Buscar producto..." oninput="filterTable()">
  <select id="filter-cat" onchange="filterTable()" style="width:auto">
    <option value="">Todas las categorías</option>
  </select>
  <button class="btn btn-primary" onclick="openModal()"><i class="fa-solid fa-plus"></i> Nuevo Producto</button>
</div>
<table id="products-table">
  <thead><tr><th>FOTO</th><th>NOMBRE</th><th>PRECIO</th><th>CAT</th><th>STOCK</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
  <tbody id="products-body"></tbody>
</table>

<!-- Modal edición/creación -->
<div class="modal" id="edit-modal">
  <div class="modal-box">
    <h3 id="modal-title">NUEVO PRODUCTO</h3>
    <div class="form-grid">
      <div><label>NOMBRE *</label><input id="f-nombre" type="text" required></div>
      <div><label>CATEGORÍA *</label><input id="f-cat" type="text"></div>
      <div><label>PRECIO *</label><input id="f-precio" type="number" step="0.01"></div>
      <div><label>PRECIO ORIGINAL</label><input id="f-precio-original" type="number" step="0.01"></div>
      <div><label>STOCK</label><input id="f-stock" type="number"></div>
      <div><label>GÉNERO</label>
        <select id="f-genero"><option value="">-</option><option>Hombre</option><option>Mujer</option><option>Unisex</option></select>
      </div>
      <div><label>BADGE</label>
        <select id="f-badge"><option value="">Sin badge</option><option>Oferta</option><option>Nuevo</option><option>Más Vendido</option></select>
      </div>
      <div><label>RATING (1-5)</label><input id="f-rating" type="number" min="1" max="5" value="5"></div>
      <div class="form-full"><label>DESCRIPCIÓN</label><textarea id="f-desc" rows="3"></textarea></div>
      <div><label>PERSONALIZABLE</label>
        <select id="f-personalizable"><option value="FALSE">No</option><option value="TRUE">Sí</option></select>
      </div>
      <div><label>OFERTA FIN (fecha)</label><input id="f-oferta-fin" type="datetime-local"></div>
      <div><label>ACTIVO</label>
        <select id="f-activo"><option value="TRUE">Sí</option><option value="FALSE">No</option></select>
      </div>
      <div class="form-full">
        <label>IMÁGENES</label>
        <div class="imgs-grid" id="imgs-grid"></div>
        <div class="upload-area" onclick="document.getElementById('img-input').click()">
          <i class="fa-solid fa-cloud-arrow-up" style="font-size:1.5rem;color:#C9A84C;margin-bottom:.5rem;display:block"></i>
          <span style="font-size:.85rem;opacity:.6">Clic o arrastra para subir imagen (JPG, PNG, WEBP — máx 2MB)</span>
          <input type="file" id="img-input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="uploadImgs(this.files)">
        </div>
        <div style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="copyImgUrls()"><i class="fa-solid fa-copy"></i> Copiar URLs</button>
          <button class="btn btn-primary btn-sm" onclick="saveImgsToSheet()"><i class="fa-solid fa-floppy-disk"></i> Guardar imágenes en sheet</button>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:1rem;margin-top:1.5rem;justify-content:flex-end">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveProduct()"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const N8N_GET = 'https://webhook.mplasesores.com/webhook/hondusport-products';
const N8N_POST = 'https://webhook.mplasesores.com/webhook/hondusport-admin';
let allProducts = [];
let currentId = null;
let currentImgs = [];

async function loadProducts() {
  const res = await fetch(N8N_GET);
  const json = await res.json();
  allProducts = json.data.products;
  const cats = [...new Set(allProducts.map(p => p.cat).filter(Boolean))];
  const sel = document.getElementById('filter-cat');
  cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  renderTable(allProducts);
}

function renderTable(data) {
  document.getElementById('products-body').innerHTML = data.map(p => `
    <tr>
      <td><img class="product-thumb" src="${p.imgs?.[0] || ''}" onerror="this.src=''"></td>
      <td><strong>${p.name}</strong></td>
      <td>L. ${p.price}</td>
      <td>${p.cat}</td>
      <td>${p.stock || '∞'}</td>
      <td><span class="badge ${p.activo ? 'badge-active' : 'badge-inactive'}">${p.activo ? 'ACTIVO' : 'INACTIVO'}</span></td>
      <td style="display:flex;gap:.5rem">
        <button class="btn btn-secondary btn-sm" onclick="openModal(${p.id})"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

function filterTable() {
  const q = document.getElementById('search').value.toLowerCase();
  const cat = document.getElementById('filter-cat').value;
  renderTable(allProducts.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (!cat || p.cat === cat)
  ));
}

async function openModal(id = null) {
  currentId = id;
  document.getElementById('modal-title').textContent = id ? 'EDITAR PRODUCTO' : 'NUEVO PRODUCTO';
  const p = id ? allProducts.find(x => x.id === id) : {};
  document.getElementById('f-nombre').value = p.name || '';
  document.getElementById('f-cat').value = p.cat || '';
  document.getElementById('f-precio').value = p.price || '';
  document.getElementById('f-precio-original').value = p.precio_original || '';
  document.getElementById('f-stock').value = p.stock || '';
  document.getElementById('f-genero').value = p.gender || '';
  document.getElementById('f-badge').value = p.badge || '';
  document.getElementById('f-rating').value = p.rating || 5;
  document.getElementById('f-desc').value = p.desc || '';
  document.getElementById('f-personalizable').value = p.personalizable ? 'TRUE' : 'FALSE';
  document.getElementById('f-oferta-fin').value = p.oferta_fin || '';
  document.getElementById('f-activo').value = p.activo === false ? 'FALSE' : 'TRUE';

  currentImgs = p.imgs || [];
  if (id) await loadServerImgs(id);
  renderImgsGrid();
  document.getElementById('edit-modal').classList.add('open');
}

async function loadServerImgs(id) {
  try {
    const res = await fetch(`list-imgs.php?tipo=productos&id=${id}`);
    const json = await res.json();
    if (json.imgs && json.imgs.length > 0) {
      currentImgs = json.imgs.map(i => i.url);
    }
  } catch(e) {}
}

function renderImgsGrid() {
  document.getElementById('imgs-grid').innerHTML = currentImgs.map((url, i) => `
    <div class="img-item">
      <img src="${url}" onerror="this.src=''">
      <button class="del-img" onclick="removeImg(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

function removeImg(i) {
  currentImgs.splice(i, 1);
  renderImgsGrid();
}

async function uploadImgs(files) {
  for (const file of files) {
    const fd = new FormData();
    fd.append('imagen', file);
    fd.append('tipo', 'productos');
    fd.append('id', currentId || 0);
    const res = await fetch('upload.php', { method: 'POST', body: fd });
    const json = await res.json();
    if (json.success) { currentImgs.push(json.url); renderImgsGrid(); toast('✅ Imagen subida'); }
    else toast('❌ ' + json.error);
  }
}

function copyImgUrls() {
  navigator.clipboard.writeText(currentImgs.join(','));
  toast('✅ URLs copiadas al portapapeles');
}

async function saveImgsToSheet() {
  if (!currentId) { toast('Guarda el producto primero'); return; }
  await n8nPost({ sheet: 'Productos', action: 'update', id: currentId, data: { imagenes: currentImgs.join(',') } });
  toast('✅ Imágenes guardadas en el sheet');
}

async function saveProduct() {
  const data = {
    nombre: document.getElementById('f-nombre').value,
    cat: document.getElementById('f-cat').value,
    precio: document.getElementById('f-precio').value,
    precio_original: document.getElementById('f-precio-original').value,
    stock: document.getElementById('f-stock').value,
    genero: document.getElementById('f-genero').value,
    badge: document.getElementById('f-badge').value,
    rating: document.getElementById('f-rating').value,
    descripcion: document.getElementById('f-desc').value,
    personalizable: document.getElementById('f-personalizable').value,
    oferta_fin: document.getElementById('f-oferta-fin').value,
    activo: document.getElementById('f-activo').value,
    imagenes: currentImgs.join(',')
  };
  if (!data.nombre || !data.precio) { toast('❌ Nombre y precio son obligatorios'); return; }
  const action = currentId ? 'update' : 'create';
  const payload = currentId ? { sheet: 'Productos', action, id: currentId, data } : { sheet: 'Productos', action, data };
  const res = await n8nPost(payload);
  if (res.success) { toast('✅ Producto guardado'); closeModal(); loadProducts(); }
  else toast('❌ Error al guardar');
}

async function deleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  const res = await n8nPost({ sheet: 'Productos', action: 'delete', id });
  if (res.success) { toast('✅ Eliminado'); loadProducts(); }
}

async function n8nPost(body) {
  const res = await fetch(N8N_POST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function closeModal() { document.getElementById('edit-modal').classList.remove('open'); currentId = null; currentImgs = []; }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

loadProducts();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin-hs/productos.html
git commit -m "feat: panel admin — sección productos con CRUD e imágenes"
```

---

### Task 16: Crear filtros.html

**Files:** Create `admin-hs/filtros.html`

- [ ] **Step 1: Crear `admin-hs/filtros.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Categorías y Tallas</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:Inter,sans-serif;padding:1.5rem}
  h2{color:#C9A84C;letter-spacing:2px;margin-bottom:1.5rem;font-size:1.1rem}
  .tabs{display:flex;gap:.5rem;margin-bottom:1.5rem;flex-wrap:wrap}
  .tab{padding:.5rem 1.2rem;border:1px solid #333;border-radius:6px;background:#1a1a1a;color:#aaa;cursor:pointer;font-size:.85rem;font-weight:600}
  .tab.active{background:#C9A84C;color:#000;border-color:#C9A84C}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1.5rem}
  th{background:#1a1a1a;padding:.75rem 1rem;text-align:left;font-size:.75rem;letter-spacing:1px;color:#aaa;border-bottom:1px solid #2a2a2a}
  td{padding:.75rem 1rem;border-bottom:1px solid #1e1e1e;vertical-align:middle}
  tr:hover td{background:rgba(255,255,255,.03)}
  input,select{background:#1a1a1a;border:1px solid #333;color:#eee;padding:.5rem .75rem;border-radius:6px;font-size:.85rem;width:100%}
  .btn{padding:.5rem 1rem;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.8rem}
  .btn-primary{background:#C9A84C;color:#000}
  .btn-danger{background:#c0392b;color:#fff}
  .btn-sm{padding:.35rem .7rem;font-size:.75rem}
  .add-row{display:grid;gap:.75rem;margin-top:.5rem;padding:1rem;background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a}
  .add-row.cols2{grid-template-columns:1fr 1fr}
  .add-row.cols3{grid-template-columns:1fr 1fr 1fr}
  label{font-size:.7rem;color:#aaa;margin-bottom:.2rem;display:block}
  .toggle{display:inline-block;width:36px;height:20px;background:#333;border-radius:10px;cursor:pointer;position:relative;transition:.2s}
  .toggle.on{background:#C9A84C}
  .toggle::after{content:'';width:16px;height:16px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:.2s}
  .toggle.on::after{left:18px}
  .toast{position:fixed;bottom:2rem;right:2rem;background:#C9A84C;color:#000;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;font-size:.85rem;z-index:999;display:none}
</style>
</head>
<body>
<h2>🏷️ CATEGORÍAS & TALLAS</h2>
<div class="tabs">
  <div class="tab active" onclick="showTab('cat',this)">Categorías</div>
  <div class="tab" onclick="showTab('subcat',this)">Subcategorías</div>
  <div class="tab" onclick="showTab('talla',this)">Tallas</div>
  <div class="tab" onclick="showTab('genero',this)">Géneros</div>
</div>
<div id="tab-content"></div>
<div class="toast" id="toast"></div>

<script>
const N8N_GET = 'https://webhook.mplasesores.com/webhook/hondusport-products';
const N8N_POST = 'https://webhook.mplasesores.com/webhook/hondusport-admin';
let allFiltros = [];
let currentTab = 'cat';

async function load() {
  const res = await fetch(N8N_GET);
  const json = await res.json();
  allFiltros = json.data.filtros || [];
  showTab(currentTab);
}

function showTab(tipo, el) {
  currentTab = tipo;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  const data = allFiltros.filter(f => f.tipo === tipo);
  const needsCat = tipo === 'subcat' || tipo === 'talla';
  const cats = allFiltros.filter(f => f.tipo === 'cat').map(f => f.valor);

  let html = `<table><thead><tr>
    <th>VALOR</th>
    ${needsCat ? '<th>CATEGORÍAS</th>' : ''}
    ${tipo === 'cat' ? '<th>IMAGEN</th>' : ''}
    <th>ORDEN</th><th>ESTADO</th><th>ACCIONES</th>
  </tr></thead><tbody>`;

  data.forEach((f, i) => {
    html += `<tr>
      <td><input id="v-${i}" value="${f.valor}" style="width:120px"></td>
      ${needsCat ? `<td><input id="c-${i}" value="${f.categorias||''}" placeholder="Camisetas,Zapatillas" style="width:200px"></td>` : ''}
      ${tipo === 'cat' ? `<td><input id="img-${i}" value="${f.imagen||''}" placeholder="https://..." style="width:200px"></td>` : ''}
      <td><input id="o-${i}" type="number" value="${f.orden||0}" style="width:60px"></td>
      <td>
        <div class="toggle ${f.activo ? 'on' : ''}" onclick="toggleActivo(this, ${i})"></div>
      </td>
      <td style="display:flex;gap:.5rem">
        <button class="btn btn-primary btn-sm" onclick="saveRow(${i})"><i class="fa-solid fa-floppy-disk"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteRow(${i})"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;

  // Add new row form
  const hasCat = needsCat ? `<div><label>CATEGORÍAS (separadas por coma)</label><input id="new-cat" placeholder="Camisetas,Zapatillas"></div>` : '';
  const hasImg = tipo === 'cat' ? `<div><label>IMAGEN URL</label><input id="new-img" placeholder="https://..."></div>` : '';
  html += `<div class="add-row cols3">
    <div><label>VALOR *</label><input id="new-val" placeholder="Ej: XL, Running, 42"></div>
    ${hasCat}${hasImg}
    <div><label>ORDEN</label><input id="new-orden" type="number" value="0"></div>
    <div style="display:flex;align-items:flex-end">
      <button class="btn btn-primary" onclick="addRow()" style="width:100%"><i class="fa-solid fa-plus"></i> Agregar</button>
    </div>
  </div>`;

  document.getElementById('tab-content').innerHTML = html;
}

function toggleActivo(el, i) {
  const tipo = currentTab;
  const data = allFiltros.filter(f => f.tipo === tipo);
  data[i].activo = !data[i].activo;
  el.classList.toggle('on');
}

async function saveRow(i) {
  const tipo = currentTab;
  const data = allFiltros.filter(f => f.tipo === tipo);
  const f = data[i];
  const needsCat = tipo === 'subcat' || tipo === 'talla';
  const updated = {
    tipo,
    valor: document.getElementById(`v-${i}`).value,
    categorias: needsCat ? document.getElementById(`c-${i}`).value : '',
    imagen: tipo === 'cat' ? document.getElementById(`img-${i}`).value : '',
    orden: parseInt(document.getElementById(`o-${i}`).value) || 0,
    activo: f.activo ? 'TRUE' : 'FALSE'
  };
  const res = await n8nPost({ sheet: 'Filtros', action: 'update', id: f.id || i, data: updated });
  if (res.success) { toast('✅ Guardado'); load(); } else toast('❌ Error');
}

async function deleteRow(i) {
  if (!confirm('¿Eliminar este filtro?')) return;
  const data = allFiltros.filter(f => f.tipo === currentTab);
  const f = data[i];
  const res = await n8nPost({ sheet: 'Filtros', action: 'delete', id: f.id || i });
  if (res.success) { toast('✅ Eliminado'); load(); } else toast('❌ Error');
}

async function addRow() {
  const valor = document.getElementById('new-val').value.trim();
  if (!valor) { toast('❌ El valor es obligatorio'); return; }
  const tipo = currentTab;
  const needsCat = tipo === 'subcat' || tipo === 'talla';
  const data = {
    tipo,
    valor,
    categorias: needsCat ? (document.getElementById('new-cat')?.value || '') : '',
    imagen: tipo === 'cat' ? (document.getElementById('new-img')?.value || '') : '',
    orden: parseInt(document.getElementById('new-orden').value) || 0,
    activo: 'TRUE'
  };
  const res = await n8nPost({ sheet: 'Filtros', action: 'create', data });
  if (res.success) { toast('✅ Agregado'); load(); } else toast('❌ Error');
}

async function n8nPost(body) {
  const res = await fetch(N8N_POST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

load();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin-hs/filtros.html
git commit -m "feat: panel admin — sección filtros (categorías, tallas, subcats, géneros)"
```

---

### Task 17: Crear envios.html y cupones.html

**Files:** Create `admin-hs/envios.html`, `admin-hs/cupones.html`

- [ ] **Step 1: Crear `admin-hs/envios.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Envíos</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:Inter,sans-serif;padding:1.5rem}
  h2{color:#C9A84C;letter-spacing:2px;margin-bottom:1.5rem;font-size:1.1rem}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1.5rem}
  th{background:#1a1a1a;padding:.75rem 1rem;text-align:left;font-size:.75rem;letter-spacing:1px;color:#aaa;border-bottom:1px solid #2a2a2a}
  td{padding:.75rem 1rem;border-bottom:1px solid #1e1e1e;vertical-align:middle}
  tr:hover td{background:rgba(255,255,255,.03)}
  input,select{background:#1a1a1a;border:1px solid #333;color:#eee;padding:.5rem .75rem;border-radius:6px;font-size:.85rem}
  .btn{padding:.5rem 1rem;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.8rem}
  .btn-primary{background:#C9A84C;color:#000}.btn-danger{background:#c0392b;color:#fff}.btn-sm{padding:.35rem .7rem;font-size:.75rem}
  .add-row{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:.75rem;margin-top:.5rem;padding:1rem;background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a}
  label{font-size:.7rem;color:#aaa;margin-bottom:.2rem;display:block}
  .toggle{display:inline-block;width:36px;height:20px;background:#333;border-radius:10px;cursor:pointer;position:relative;transition:.2s}
  .toggle.on{background:#C9A84C}.toggle::after{content:'';width:16px;height:16px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:.2s}.toggle.on::after{left:18px}
  .toggle-row{display:flex;align-items:center;gap:1rem;padding:1rem;background:#1a1a1a;border-radius:8px;margin-bottom:1rem;border:1px solid #2a2a2a}
  .toast{position:fixed;bottom:2rem;right:2rem;background:#C9A84C;color:#000;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;font-size:.85rem;z-index:999;display:none}
</style>
</head>
<body>
<h2>🚚 OPCIONES DE ENVÍO</h2>
<div class="toggle-row">
  <div class="toggle on" id="fs-toggle" onclick="toggleFreeShipping(this)"></div>
  <div>
    <strong style="font-size:.9rem">Envío gratis activo</strong>
    <p style="font-size:.75rem;opacity:.5;margin-top:2px">Cuando está activo, se muestra la barra de envío gratis en el carrito</p>
  </div>
</div>
<table>
  <thead><tr><th>NOMBRE</th><th>DESCRIPCIÓN</th><th>TIPO</th><th>COSTO</th><th>DESCUENTO %</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
  <tbody id="envios-body"></tbody>
</table>
<div class="add-row">
  <div><label>NOMBRE *</label><input id="n-nombre" placeholder="Envío en Tegucigalpa" style="width:100%"></div>
  <div><label>DESCRIPCIÓN</label><input id="n-desc" placeholder="Entrega 24-48h" style="width:100%"></div>
  <div><label>TIPO</label><select id="n-tipo" style="width:100%"><option value="delivery">Delivery</option><option value="pickup">Pickup</option></select></div>
  <div><label>COSTO (L.)</label><input id="n-costo" type="number" value="0" style="width:100%"></div>
  <div><label>DESCUENTO %</label><input id="n-descuento" type="number" value="0" style="width:100%"></div>
  <div style="display:flex;align-items:flex-end">
    <button class="btn btn-primary" onclick="addEnvio()" style="width:100%"><i class="fa-solid fa-plus"></i> Agregar</button>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const N8N_GET = 'https://webhook.mplasesores.com/webhook/hondusport-products';
const N8N_POST = 'https://webhook.mplasesores.com/webhook/hondusport-admin';
let envios = [];

async function load() {
  const res = await fetch(N8N_GET);
  const json = await res.json();
  envios = json.data.envios || [];
  const fsActivo = json.data.config?.free_shipping_activo !== 'FALSE';
  const toggle = document.getElementById('fs-toggle');
  if (!fsActivo) toggle.classList.remove('on');
  renderTable();
}

function renderTable() {
  document.getElementById('envios-body').innerHTML = envios.map((e, i) => `<tr>
    <td><input value="${e.nombre}" onchange="envios[${i}].nombre=this.value" style="width:160px"></td>
    <td><input value="${e.descripcion||''}" onchange="envios[${i}].descripcion=this.value" style="width:180px"></td>
    <td><select onchange="envios[${i}].tipo=this.value" style="width:100px">
      <option value="delivery" ${e.tipo==='delivery'?'selected':''}>Delivery</option>
      <option value="pickup" ${e.tipo==='pickup'?'selected':''}>Pickup</option>
    </select></td>
    <td><input type="number" value="${e.costo}" onchange="envios[${i}].costo=parseFloat(this.value)||0" style="width:80px"></td>
    <td><input type="number" value="${e.descuento||0}" onchange="envios[${i}].descuento=parseFloat(this.value)||0" style="width:60px"></td>
    <td><div class="toggle ${e.activo!==false?'on':''}" onclick="toggleEnvio(${i},this)"></div></td>
    <td style="display:flex;gap:.5rem">
      <button class="btn btn-primary btn-sm" onclick="saveEnvio(${i})"><i class="fa-solid fa-floppy-disk"></i></button>
      <button class="btn btn-danger btn-sm" onclick="deleteEnvio(${i})"><i class="fa-solid fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

function toggleEnvio(i, el) { envios[i].activo = !el.classList.contains('on'); el.classList.toggle('on'); }

async function saveEnvio(i) {
  const e = envios[i];
  const res = await n8nPost({ sheet: 'Envios', action: 'update', id: e.id, data: { nombre: e.nombre, descripcion: e.descripcion, tipo: e.tipo, costo: e.costo, descuento: e.descuento, activo: e.activo !== false ? 'TRUE' : 'FALSE' } });
  if (res.success) toast('✅ Guardado'); else toast('❌ Error');
}

async function deleteEnvio(i) {
  if (!confirm('¿Eliminar?')) return;
  const res = await n8nPost({ sheet: 'Envios', action: 'delete', id: envios[i].id });
  if (res.success) { toast('✅ Eliminado'); load(); }
}

async function addEnvio() {
  const nombre = document.getElementById('n-nombre').value.trim();
  if (!nombre) { toast('❌ El nombre es obligatorio'); return; }
  const res = await n8nPost({ sheet: 'Envios', action: 'create', data: {
    nombre, descripcion: document.getElementById('n-desc').value,
    tipo: document.getElementById('n-tipo').value,
    costo: parseFloat(document.getElementById('n-costo').value) || 0,
    descuento: parseFloat(document.getElementById('n-descuento').value) || 0,
    activo: 'TRUE'
  }});
  if (res.success) { toast('✅ Agregado'); load(); } else toast('❌ Error');
}

async function toggleFreeShipping(el) {
  el.classList.toggle('on');
  const activo = el.classList.contains('on') ? 'TRUE' : 'FALSE';
  await n8nPost({ sheet: 'Configuracion', action: 'update', id: 'free_shipping_activo', data: { value: activo } });
  toast(`✅ Envío gratis ${activo === 'TRUE' ? 'activado' : 'desactivado'}`);
}

async function n8nPost(body) {
  const res = await fetch(N8N_POST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
load();
</script>
</body>
</html>
```

- [ ] **Step 2: Crear `admin-hs/cupones.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cupones</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:Inter,sans-serif;padding:1.5rem}
  h2{color:#C9A84C;letter-spacing:2px;margin-bottom:1.5rem;font-size:1.1rem}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1.5rem}
  th{background:#1a1a1a;padding:.75rem 1rem;text-align:left;font-size:.75rem;letter-spacing:1px;color:#aaa;border-bottom:1px solid #2a2a2a}
  td{padding:.75rem 1rem;border-bottom:1px solid #1e1e1e;vertical-align:middle}
  tr:hover td{background:rgba(255,255,255,.03)}
  input,select{background:#1a1a1a;border:1px solid #333;color:#eee;padding:.5rem .75rem;border-radius:6px;font-size:.85rem}
  .btn{padding:.5rem 1rem;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.8rem}
  .btn-primary{background:#C9A84C;color:#000}.btn-danger{background:#c0392b;color:#fff}.btn-sm{padding:.35rem .7rem;font-size:.75rem}
  .add-row{display:grid;grid-template-columns:1fr 1fr auto;gap:.75rem;padding:1rem;background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;align-items:flex-end}
  label{font-size:.7rem;color:#aaa;margin-bottom:.2rem;display:block}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700}
  .badge-active{background:rgba(39,174,96,.2);color:#27AE60}.badge-inactive{background:rgba(192,57,43,.2);color:#c0392b}
  .toggle-row{display:flex;align-items:center;gap:1rem;padding:1rem;background:#1a1a1a;border-radius:8px;margin-bottom:1rem;border:1px solid #2a2a2a}
  .toggle{display:inline-block;width:36px;height:20px;background:#333;border-radius:10px;cursor:pointer;position:relative;transition:.2s}
  .toggle.on{background:#C9A84C}.toggle::after{content:'';width:16px;height:16px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:.2s}.toggle.on::after{left:18px}
  .toast{position:fixed;bottom:2rem;right:2rem;background:#C9A84C;color:#000;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;font-size:.85rem;z-index:999;display:none}
</style>
</head>
<body>
<h2>🎟️ CUPONES DE DESCUENTO</h2>
<div class="toggle-row">
  <div class="toggle on" id="popup-toggle" onclick="togglePopup(this)"></div>
  <div>
    <strong style="font-size:.9rem">Popup de cupones activo</strong>
    <p style="font-size:.75rem;opacity:.5;margin-top:2px">Muestra el popup cuando el usuario intenta salir de la página</p>
  </div>
</div>
<table>
  <thead><tr><th>CÓDIGO</th><th>DESCUENTO %</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
  <tbody id="cupones-body"></tbody>
</table>
<div class="add-row">
  <div><label>CÓDIGO</label><input id="n-codigo" placeholder="VERANO20" style="text-transform:uppercase;width:100%"></div>
  <div><label>DESCUENTO %</label><input id="n-descuento" type="number" value="10" style="width:100%"></div>
  <div><button class="btn btn-primary" onclick="addCupon()"><i class="fa-solid fa-plus"></i> Agregar</button></div>
</div>
<div class="toast" id="toast"></div>

<script>
const N8N_GET = 'https://webhook.mplasesores.com/webhook/hondusport-products';
const N8N_POST = 'https://webhook.mplasesores.com/webhook/hondusport-admin';
let cupones = [];

async function load() {
  const res = await fetch(N8N_GET);
  const json = await res.json();
  cupones = json.data.cupones || [];
  const popupActivo = json.data.config?.cupones_popup_activo !== 'FALSE';
  if (!popupActivo) document.getElementById('popup-toggle').classList.remove('on');
  renderTable();
}

function renderTable() {
  document.getElementById('cupones-body').innerHTML = cupones.map((c, i) => `<tr>
    <td><strong>${c.codigo}</strong></td>
    <td>${c.descuento}%</td>
    <td><span class="badge ${c.activo !== false ? 'badge-active' : 'badge-inactive'}">${c.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
    <td style="display:flex;gap:.5rem">
      <button class="btn btn-primary btn-sm" onclick="toggleCupon(${i})">${c.activo !== false ? 'Desactivar' : 'Activar'}</button>
      <button class="btn btn-danger btn-sm" onclick="deleteCupon(${i})"><i class="fa-solid fa-trash"></i></button>
    </td>
  </tr>`).join('');
}

async function toggleCupon(i) {
  const c = cupones[i];
  const newActivo = c.activo === false ? 'TRUE' : 'FALSE';
  const res = await n8nPost({ sheet: 'Cupones', action: 'update', id: c.codigo, data: { activo: newActivo } });
  if (res.success) { toast('✅ Actualizado'); load(); }
}

async function deleteCupon(i) {
  if (!confirm('¿Eliminar este cupón?')) return;
  const res = await n8nPost({ sheet: 'Cupones', action: 'delete', id: cupones[i].codigo });
  if (res.success) { toast('✅ Eliminado'); load(); }
}

async function addCupon() {
  const codigo = document.getElementById('n-codigo').value.toUpperCase().trim();
  if (!codigo) { toast('❌ Código obligatorio'); return; }
  const res = await n8nPost({ sheet: 'Cupones', action: 'create', data: {
    codigo, descuento: parseInt(document.getElementById('n-descuento').value) || 10,
    tipo: 'porcentaje', activo: 'TRUE'
  }});
  if (res.success) { toast('✅ Cupón creado'); load(); }
}

async function togglePopup(el) {
  el.classList.toggle('on');
  const activo = el.classList.contains('on') ? 'TRUE' : 'FALSE';
  await n8nPost({ sheet: 'Configuracion', action: 'update', id: 'cupones_popup_activo', data: { value: activo } });
  toast(`✅ Popup ${activo === 'TRUE' ? 'activado' : 'desactivado'}`);
}

async function n8nPost(body) {
  const res = await fetch(N8N_POST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
load();
</script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add admin-hs/envios.html admin-hs/cupones.html
git commit -m "feat: panel admin — secciones envios y cupones"
```

---

### Task 18: Crear banners.html

**Files:** Create `admin-hs/banners.html`

- [ ] **Step 1: Crear `admin-hs/banners.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Banners</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#111;color:#eee;font-family:Inter,sans-serif;padding:1.5rem}
  h2{color:#C9A84C;letter-spacing:2px;margin-bottom:1.5rem;font-size:1.1rem}
  .banners-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.5rem;margin-bottom:1.5rem}
  .banner-card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;overflow:hidden}
  .banner-preview{width:100%;height:160px;object-fit:cover;display:block;background:#222}
  .banner-body{padding:1rem}
  input,select,textarea{background:#141414;border:1px solid #333;color:#eee;padding:.5rem .75rem;border-radius:6px;font-size:.85rem;width:100%;margin-bottom:.5rem}
  label{font-size:.7rem;color:#aaa;margin-bottom:.2rem;display:block}
  .btn{padding:.5rem 1rem;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.8rem}
  .btn-primary{background:#C9A84C;color:#000}.btn-danger{background:#c0392b;color:#fff}.btn-block{width:100%}
  .upload-area{border:2px dashed #333;border-radius:6px;padding:1rem;text-align:center;cursor:pointer;font-size:.8rem;color:#aaa;margin-bottom:.5rem}
  .upload-area:hover{border-color:#C9A84C}
  .toast{position:fixed;bottom:2rem;right:2rem;background:#C9A84C;color:#000;padding:.75rem 1.5rem;border-radius:8px;font-weight:700;font-size:.85rem;z-index:999;display:none}
</style>
</head>
<body>
<h2>🖼️ BANNERS DEL HERO</h2>
<div class="banners-grid" id="banners-grid"></div>
<div class="toast" id="toast"></div>

<script>
const N8N_GET = 'https://webhook.mplasesores.com/webhook/hondusport-products';
const N8N_POST = 'https://webhook.mplasesores.com/webhook/hondusport-admin';
let banners = [];

async function load() {
  const res = await fetch(N8N_GET);
  const json = await res.json();
  banners = json.data.banners || [];
  renderBanners();
}

function renderBanners() {
  document.getElementById('banners-grid').innerHTML = banners.map((b, i) => `
    <div class="banner-card">
      <img class="banner-preview" id="prev-${i}" src="${b.imagen||''}" onerror="this.src=''">
      <div class="banner-body">
        <label>TÍTULO</label><input id="b-titulo-${i}" value="${b.titulo||''}">
        <label>SUBTÍTULO</label><input id="b-sub-${i}" value="${b.subtitulo||''}">
        <label>TEXTO DEL BOTÓN</label><input id="b-btn-${i}" value="${b.btn_texto||'Ver más'}">
        <label>LINK DEL BOTÓN</label><input id="b-link-${i}" value="${b.btn_link||'#tienda'}">
        <label>IMAGEN URL</label><input id="b-img-${i}" value="${b.imagen||''}" oninput="document.getElementById('prev-${i}').src=this.value">
        <div class="upload-area" onclick="document.getElementById('file-${i}').click()">
          <i class="fa-solid fa-cloud-arrow-up"></i> Subir imagen al servidor
          <input type="file" id="file-${i}" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="uploadBanner(this.files[0], ${i})">
        </div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primary btn-block" onclick="saveBanner(${i})"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
          <button class="btn btn-danger" onclick="deleteBanner(${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('') + `
    <div class="banner-card" style="border:2px dashed #333;display:flex;align-items:center;justify-content:center;cursor:pointer;min-height:300px" onclick="addBanner()">
      <div style="text-align:center;opacity:.5"><i class="fa-solid fa-plus" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>Nuevo Banner</div>
    </div>`;
}

async function uploadBanner(file, i) {
  const fd = new FormData();
  fd.append('imagen', file);
  fd.append('tipo', 'banners');
  fd.append('id', i);
  const res = await fetch('upload.php', { method: 'POST', body: fd });
  const json = await res.json();
  if (json.success) {
    document.getElementById(`b-img-${i}`).value = json.url;
    document.getElementById(`prev-${i}`).src = json.url;
    toast('✅ Imagen subida');
  } else toast('❌ ' + json.error);
}

async function saveBanner(i) {
  const data = {
    titulo: document.getElementById(`b-titulo-${i}`).value,
    subtitulo: document.getElementById(`b-sub-${i}`).value,
    btn_texto: document.getElementById(`b-btn-${i}`).value,
    btn_link: document.getElementById(`b-link-${i}`).value,
    imagen: document.getElementById(`b-img-${i}`).value
  };
  const res = await n8nPost({ sheet: 'Banners', action: 'update', id: i + 1, data });
  if (res.success) toast('✅ Banner guardado'); else toast('❌ Error');
}

async function deleteBanner(i) {
  if (!confirm('¿Eliminar este banner?')) return;
  const res = await n8nPost({ sheet: 'Banners', action: 'delete', id: i + 1 });
  if (res.success) { toast('✅ Eliminado'); load(); }
}

async function addBanner() {
  const res = await n8nPost({ sheet: 'Banners', action: 'create', data: { titulo: 'Nuevo Banner', subtitulo: '', btn_texto: 'Ver más', btn_link: '#tienda', imagen: '' }});
  if (res.success) { toast('✅ Banner creado'); load(); }
}

async function n8nPost(body) {
  const res = await fetch(N8N_POST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
load();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin-hs/banners.html
git commit -m "feat: panel admin — sección banners"
```

---

### Task 19: Subir a Hostinger y verificación final

**Files:** Hostinger cPanel File Manager

- [ ] **Step 1: Editar `config.php` con tus valores reales**

```php
define('ADMIN_PASSWORD', 'tu_contraseña_segura_aqui');
define('SITE_URL', 'https://tu-dominio-real.com');
define('N8N_ADMIN_WEBHOOK', 'https://webhook.mplasesores.com/webhook/hondusport-admin');
define('N8N_GET_WEBHOOK', 'https://webhook.mplasesores.com/webhook/hondusport-products');
```

- [ ] **Step 2: Renombrar `index.html` a `index.php`**

El login usa `<?php` por lo tanto el archivo debe tener extensión `.php`.

- [ ] **Step 3: Subir la carpeta `admin-hs/` a Hostinger**

Vía cPanel File Manager o FTP, sube toda la carpeta `admin-hs/` al directorio `public_html/` de tu dominio.

- [ ] **Step 4: Crear directorio `imgs/` con permisos correctos**

En cPanel File Manager, crea `public_html/admin-hs/imgs/` con permisos `755`.

- [ ] **Step 5: Verificar checklist completo**

```
✅ Abrir https://tu-dominio.com/admin-hs/ → aparece formulario de login
✅ Ingresar contraseña → redirige al dashboard
✅ Sección Productos → lista los productos del webhook
✅ Editar un producto → cambia el nombre → Guardar → verificar en Google Sheet
✅ Subir imagen a un producto → aparece en la galería del modal
✅ Botón "Guardar imágenes en sheet" → actualiza columna `imagenes` en el sheet
✅ Sección Filtros → agregar talla "XXL" a "Camisetas" → aparece en la tienda
✅ Sección Envíos → toggle "Envío gratis" → barra desaparece en la tienda
✅ Sección Cupones → toggle popup → popup no aparece al salir
✅ Tienda: seleccionar opción de envío → formulario cambia según tipo delivery/pickup
✅ Tienda: producto nuevo aparece con imágenes correctas desde admin
```

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "feat: panel admin CMS completo — hondusport-admin v1.0"
```

---

## Notas Importantes

- **Orden de ejecución:** Las fases deben ejecutarse en orden. La Fase 4 (app.js) requiere que las Fases 1 y 2 estén completas para que los datos lleguen con el nuevo formato.
- **Compatibilidad de carrito:** Los ítems guardados en localStorage antes del cambio tendrán `item.img` en vez de `item.imgs`. La línea 754 maneja esto con el fallback `item.imgs?.[0] || item.img || ''`.
- **N8N POST workflow:** El nodo Google Sheets de n8n para `update` busca la fila por el valor de la columna `id`. Asegúrate de que la columna `id` existe en todas las hojas y es el identificador único.
- **PHP session:** El panel usa sesiones PHP simples. En Hostinger, asegúrate de que la sesión se mantenga entre páginas (el `dashboard.html` carga las páginas internas en un `<iframe>`, que comparte la sesión PHP del mismo dominio).
- **CORS en n8n:** El webhook POST debe tener `Access-Control-Allow-Origin: *` igual que el GET, para que el panel admin pueda llamarlo desde el navegador.
