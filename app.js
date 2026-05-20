// ─── SHELL RENDERER ──────────────────────────────────────────────────────────
        function renderShell() {
            document.getElementById('app').innerHTML = `
<div id="page-loader"><div class="hs-spinner"></div><p>Cargando</p></div>
<div id="toast" class="toast">✅ PRODUCTO AGREGADO</div>
<div id="free-shipping-toast" class="free-shipping-toast">
  <div style="font-size:3rem">🎉</div>
  <h3 style="margin:.5rem 0">ENVÍO GRATIS</h3>
  <p style="font-size:.9rem;opacity:.9">¡Llegaste a la meta!</p>
</div>
<div class="cart-overlay" id="cart-overlay"></div>
<div class="exit-overlay" id="exit-overlay"></div>
<div class="promo-bar" id="top-promo"></div>

<nav id="main-nav">
  <button class="hamburger" id="hamburger-btn" aria-label="Menú">
    <div class="line1"></div><div class="line2"></div><div class="line3"></div>
  </button>
  <a href="javascript:void(0)" onclick="goToHome()" class="logo">
    <img src="" alt="" class="logo-img" id="nav-logo">
  </a>
  <ul class="nav-links" id="nav-menu"></ul>
  <div class="search-container" style="display:flex;align-items:center;position:relative;gap:5px;">
    <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:.75rem;opacity:.4;pointer-events:none;"></i>
    <input type="text" id="main-search" placeholder="BUSCAR..." aria-label="Buscar" autocomplete="off" readonly onclick="openMegaSearch()" style="width:100%;cursor:pointer;">
    <button onclick="startVoiceSearch()" aria-label="Buscar por Voz" style="background:none;border:none;color:var(--text);padding:5px;cursor:pointer;transition:.2s;">
      <i id="mic-icon" class="fa-solid fa-microphone"></i>
    </button>
    <div id="recent-searches" class="recent-searches"></div>
  </div>
  <div class="nav-actions">
    <button class="icon-btn" onclick="toggleTheme()" aria-label="Cambiar Tema"><i id="theme-toggle-icon" class="fa-solid fa-sun"></i></button>
    <button class="icon-btn" onclick="toggleWishlistDrawer()" aria-label="Ver Favoritos">
      <i class="fa-solid fa-heart"></i>
      <span id="wishlist-badge" style="position:absolute;top:-5px;right:-10px;background:#E74C3C;color:white;font-size:10px;padding:2px 6px;border-radius:50%;font-family:Inter;display:none;">0</span>
    </button>
    <button class="icon-btn" onclick="toggleCart()" aria-label="Ver Carrito">
      <i class="fa-solid fa-cart-shopping"></i>
      <span id="cart-badge">0</span>
    </button>
  </div>
</nav>

<header class="hero"><div class="slide active"><div class="slide-content"><h1>...</h1></div></div></header>

<div id="category-bar" class="category-bar">
  <div class="category-bar-inner" id="category-bar-inner">
    <button class="cat-filter-btn active" data-cat="">TODOS</button>
  </div>
</div>

<div style="display:flex;gap:10px;margin:15px auto;max-width:1200px;padding:0 1rem;align-items:center;justify-content:space-between;">
  <button class="mobile-filter-trigger" id="mobile-filter-btn" style="margin:0;">🔍 FILTROS</button>
  <div class="sort-container">
    <i class="fa-solid fa-arrow-down-a-z" style="opacity:.5;font-size:.8rem;margin-right:5px;"></i>
    <select id="sort-by" onchange="applyFilters()" style="padding:8px 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-family:Inter,sans-serif;font-size:.8rem;font-weight:600;cursor:pointer;outline:none;">
      <option value="default">DESTACADOS</option>
      <option value="price-asc">PRECIO: MENOR A MAYOR</option>
      <option value="price-desc">PRECIO: MAYOR A MENOR</option>
      <option value="name-asc">NOMBRE: A-Z</option>
      <option value="name-desc">NOMBRE: Z-A</option>
    </select>
  </div>
</div>

<main class="main-content" id="tienda">
  <aside class="sidebar" id="sidebar">
    <button onclick="document.getElementById('sidebar').classList.remove('active')" class="sidebar-close-btn" style="width:100%;text-align:right;background:transparent;border:none;font-size:1.2rem;margin-bottom:1rem;cursor:pointer;" aria-label="Cerrar filtros">✕</button>
    <div id="sidebar-filters"></div>
    <div class="filter-group">
      <h4>PRECIO MÁXIMO: <span id="price-val">L. 5,000.00</span></h4>
      <input type="range" id="price-range" min="500" max="5000" step="100" value="5000" style="width:100%;">
    </div>
    <button id="btn-clear-filters" onclick="clearAllFilters()" style="width:100%;padding:10px;margin-top:1rem;background:transparent;border:1px solid var(--text);color:var(--text);border-radius:4px;font-weight:600;font-size:.8rem;cursor:pointer;transition:.3s;">
      <i class="fa-solid fa-trash-can" style="margin-right:5px;"></i> LIMPIAR FILTROS
    </button>
  </aside>
  <section>
    <div id="section-ofertas" style="display:none;">
      <h3 class="section-badge-title">Ofertas Especiales <span class="offer-tag-premium">OFERTAS ACTIVAS</span><span style="opacity:.2;margin:0 6px;">—</span><span id="count-ofertas" class="section-count"></span></h3>
      <div class="carousel-wrapper">
        <button class="carousel-btn prev"><i class="fa-solid fa-chevron-left"></i></button>
        <div id="grid-ofertas" class="products-grid"></div>
        <button class="carousel-btn next"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
    <div id="section-nuevos" style="display:none;">
      <h3 class="section-badge-title">Nuevos Productos <span style="opacity:.2;margin:0 6px;">—</span><span id="count-nuevos" class="section-count"></span></h3>
      <div class="carousel-wrapper">
        <button class="carousel-btn prev"><i class="fa-solid fa-chevron-left"></i></button>
        <div id="grid-nuevos" class="products-grid"></div>
        <button class="carousel-btn next"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
    <div id="section-mas-vendidos" style="display:none;">
      <h3 class="section-badge-title">Más Vendidos <span style="opacity:.2;margin:0 6px;">—</span><span id="count-mas-vendidos" class="section-count"></span></h3>
      <div class="carousel-wrapper">
        <button class="carousel-btn prev"><i class="fa-solid fa-chevron-left"></i></button>
        <div id="grid-mas-vendidos" class="products-grid"></div>
        <button class="carousel-btn next"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
    <div id="section-todos">
      <h3 class="section-badge-title">Catálogo<span id="count-todos" class="section-count"></span></h3>
      <div id="products-container" class="products-grid">
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>
        <div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div><div class="skeleton-text short"></div></div>
      </div>
      <div id="load-more-container" style="text-align:center;margin:2rem 0;display:none;">
        <button id="load-more-btn" class="hero-btn-outline" style="background:transparent;color:var(--text);padding:10px 30px;border-color:var(--border);" onclick="loadMoreProducts()">MOSTRAR MÁS</button>
      </div>
    </div>
    <div id="no-results" style="display:none;text-align:center;padding:3rem;"><p style="opacity:.6;">🚫 NO SE ENCONTRARON PRODUCTOS.</p></div>
  </section>
</main>

<div id="wishlist-drawer" role="dialog" class="cart-drawer">
  <div class="cart-header"><h2>MIS FAVORITOS</h2><div class="cart-close" onclick="toggleWishlistDrawer()">✕</div></div>
  <div id="wishlist-items" style="flex-grow:1;overflow-y:auto;margin-bottom:10px;padding:1rem;"></div>
  <div style="padding:1.5rem;border-top:1px solid var(--border);">
    <button onclick="toggleWishlistDrawer()" class="btn-add-main" style="width:100%;">SEGUIR COMPRANDO</button>
  </div>
</div>

<div id="cart-drawer" role="dialog">
  <div class="cart-header"><h2>MI CARRITO</h2><div class="cart-close" onclick="toggleCart()">✕</div></div>
  <div id="free-shipping-section">
    <div class="shipping-meter"><div id="shipping-bar" class="shipping-bar"></div></div>
    <p id="shipping-msg"></p>
  </div>
  <div id="cart-items" style="flex-grow:1;overflow-y:auto;margin-bottom:10px;"></div>
  <div style="padding-top:1.5rem;border-top:1px solid var(--border);">
    <div id="cart-total-container" style="display:flex;flex-direction:column;gap:.3rem;">
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.3rem;">
        <span>TOTAL:</span>
        <div style="text-align:right">
          <span id="cart-subtotal-val" style="display:none;font-size:.9rem;color:#888;text-decoration:line-through;"></span>
          <span id="cart-total-val">L. 0.00</span>
          <span id="discount-badge" style="display:none;background:#E74C3C;color:white;font-size:10px;padding:2px 5px;border-radius:3px;margin-left:5px;">-10%</span>
        </div>
      </div>
    </div>
    <button id="checkout-init-btn" onclick="openCheckoutModal()" class="btn-add-main" style="width:100%;margin-top:1rem;">FINALIZAR PEDIDO</button>
  </div>
</div>

<div id="product-page-view" style="display:none;margin:2rem auto;max-width:1200px;padding:0 4%;">
  <div class="product-page-content" style="display:grid;grid-template-columns:1fr 1.2fr;gap:3rem;align-items:start;">
    <div class="gallery-container" style="background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;position:sticky;top:100px;">
      <div class="img-zoom-container" id="img-zoom-container" style="border-radius:8px;border:1px solid var(--border);margin:0 auto;width:100%;display:flex;align-items:center;justify-content:center;">
        <img id="modal-img-main" src="" alt="Principal" style="border-radius:8px;object-fit:contain;width:100%;max-height:600px;padding:1px;">
      </div>
      <div id="modal-thumbs" class="thumb-row" style="margin-top:15px;width:100%;justify-content:flex-start;background:transparent;"></div>
    </div>
    <div style="padding:1rem 0;">
      <button onclick="goToHome()" style="background:none;border:none;font-size:.85rem;font-family:Inter;font-weight:700;cursor:pointer;color:var(--text);opacity:.6;margin-bottom:20px;display:inline-flex;align-items:center;gap:8px;"><i class="fa-solid fa-arrow-left"></i> VOLVER AL CATÁLOGO</button>
      <h2 id="m-title" class="m-title" style="font-size:2.5rem;letter-spacing:2px;"></h2>
      <p id="m-price" class="price" style="font-size:1.8rem;margin-bottom:1rem;color:var(--primary);font-weight:700;"></p>
      <p id="m-desc" style="margin:1.5rem 0;font-size:.95rem;opacity:.8;line-height:1.6;font-family:Inter;"></p>
      <div style="margin:2rem 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <label style="font-size:.75rem;letter-spacing:1px;font-weight:700;margin:0;">SELECCIONA TU TALLA</label>
          <button onclick="openSizeGuide()" style="background:none;border:none;color:var(--primary);font-size:.75rem;font-weight:600;cursor:pointer;text-decoration:underline;display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-ruler-horizontal"></i> GUÍA DE TALLAS</button>
        </div>
        <div id="m-size-container" class="talla-btn-group"></div>
      </div>
      <div style="margin:2rem 0;">
        <label style="font-size:.75rem;letter-spacing:1px;font-weight:700;display:block;margin-bottom:12px;">PERSONALIZACIÓN (OPCIONAL)</label>
        <div class="custom-input-box" style="padding:14px 14px 14px 42px;">
          <i class="fa-solid fa-pen" style="left:15px;"></i>
          <input type="text" id="m-custom" placeholder="EJ. NOMBRE Y NÚMERO">
        </div>
        <span style="font-size:.7rem;opacity:.5;letter-spacing:.5px;margin-top:8px;display:block;">Se imprimirá exactamente como lo escribas</span>
      </div>
      <button id="m-add-btn" class="btn-add-main" style="width:100%;padding:15px;font-size:.9rem;margin-top:1rem;border-radius:6px;">AGREGAR AL CARRITO</button>
      <div class="share-btn-container" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:20px;">
        <button class="share-btn" onclick="shareProductWhatsApp()"><i class="fa-brands fa-whatsapp"></i> WHATSAPP</button>
        <button class="share-btn" onclick="shareProductFacebook()"><i class="fa-brands fa-facebook-f"></i> FACEBOOK</button>
        <button class="share-btn" onclick="shareProductInstagram()"><i class="fa-brands fa-instagram"></i> INSTAGRAM</button>
        <button class="share-btn" onclick="copyProductLink()"><i class="fa-solid fa-copy"></i> COPIAR ENLACE</button>
      </div>
      <div class="reviews-section" style="margin-top:3rem;border-top:1px solid var(--border);padding-top:2rem;padding-bottom:2rem;">
        <h4 id="m-reviews-title" style="font-size:1rem;margin-bottom:1.5rem;font-family:'Bebas Neue';letter-spacing:1px;">RESEÑAS DE CLIENTES</h4>
        <div id="m-reviews-container"></div>
        <button style="width:100%;border:1.5px dashed var(--border);background:transparent;padding:15px;color:var(--text);font-weight:bold;font-family:Inter,sans-serif;cursor:pointer;border-radius:6px;font-size:.8rem;letter-spacing:1px;transition:.2s;">ESCRIBIR UNA RESEÑA</button>
      </div>
      <div class="related-section" style="padding-bottom:2rem;">
        <h4 style="font-family:'Bebas Neue';letter-spacing:1px;font-size:1rem;margin-bottom:1rem;">TAMBIÉN TE PUEDE GUSTAR</h4>
        <div id="related-products" class="related-grid" style="padding-bottom:20px;"></div>
      </div>
      <section id="recently-viewed-section" style="display:none;padding-bottom:2rem;border-top:1px solid var(--border);padding-top:2rem;">
        <h4 style="font-family:'Bebas Neue';letter-spacing:1px;font-size:1rem;margin-bottom:1rem;">VISTOS RECIENTEMENTE</h4>
        <div class="carousel-wrapper" style="width:100%;">
          <button class="carousel-btn prev" onclick="document.getElementById('grid-recent').scrollBy({left:-200,behavior:'smooth'})"><i class="fa-solid fa-chevron-left"></i></button>
          <div id="grid-recent" class="products-grid" style="display:flex;gap:15px;overflow-x:auto;padding:10px 0;"></div>
          <button class="carousel-btn next" onclick="document.getElementById('grid-recent').scrollBy({left:200,behavior:'smooth'})"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </section>
    </div>
  </div>
</div>

<div id="size-guide-modal" class="modal" style="z-index:10001;" onclick="closeSizeGuide(event)" role="dialog">
  <div class="modal-content" style="max-width:500px;padding:2rem;" onclick="event.stopPropagation()">
    <button class="modal-close" onclick="closeSizeGuide()">✕</button>
    <h2 style="font-family:'Bebas Neue',sans-serif;font-size:2rem;margin-bottom:1rem;text-align:center;">GUÍA DE TALLAS</h2>
    <div style="margin-bottom:1.5rem;">
      <h4 style="font-size:.9rem;margin-bottom:10px;color:var(--primary);">ROPA DEPORTIVA</h4>
      <table style="width:100%;border-collapse:collapse;font-size:.85rem;text-align:center;">
        <tr style="background:rgba(201,168,76,.1);font-weight:bold;"><th style="padding:8px;border:1px solid var(--border);">Talla</th><th style="padding:8px;border:1px solid var(--border);">Pecho (cm)</th><th style="padding:8px;border:1px solid var(--border);">Largo (cm)</th></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">S</td><td style="padding:8px;border:1px solid var(--border);">96-104</td><td style="padding:8px;border:1px solid var(--border);">69-71</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">M</td><td style="padding:8px;border:1px solid var(--border);">104-112</td><td style="padding:8px;border:1px solid var(--border);">71-73</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">L</td><td style="padding:8px;border:1px solid var(--border);">112-124</td><td style="padding:8px;border:1px solid var(--border);">73-75</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">XL</td><td style="padding:8px;border:1px solid var(--border);">124-136</td><td style="padding:8px;border:1px solid var(--border);">75-77</td></tr>
      </table>
    </div>
    <div>
      <h4 style="font-size:.9rem;margin-bottom:10px;color:var(--primary);">ZAPATILLAS (EUR)</h4>
      <table style="width:100%;border-collapse:collapse;font-size:.85rem;text-align:center;">
        <tr style="background:rgba(201,168,76,.1);font-weight:bold;"><th style="padding:8px;border:1px solid var(--border);">EUR</th><th style="padding:8px;border:1px solid var(--border);">US Men</th><th style="padding:8px;border:1px solid var(--border);">CM</th></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">40</td><td style="padding:8px;border:1px solid var(--border);">7</td><td style="padding:8px;border:1px solid var(--border);">25</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">41</td><td style="padding:8px;border:1px solid var(--border);">8</td><td style="padding:8px;border:1px solid var(--border);">26</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">42</td><td style="padding:8px;border:1px solid var(--border);">8.5</td><td style="padding:8px;border:1px solid var(--border);">26.5</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">43</td><td style="padding:8px;border:1px solid var(--border);">9.5</td><td style="padding:8px;border:1px solid var(--border);">27.5</td></tr>
        <tr><td style="padding:8px;border:1px solid var(--border);">44</td><td style="padding:8px;border:1px solid var(--border);">10</td><td style="padding:8px;border:1px solid var(--border);">28</td></tr>
      </table>
    </div>
    <p style="text-align:center;font-size:.75rem;opacity:.6;margin-top:15px;">* Las medidas son aproximadas.</p>
  </div>
</div>

<div id="checkout-modal" class="checkout-modal" onclick="closeCheckoutModal()">
  <div class="checkout-content" onclick="event.stopPropagation()">
    <div class="checkout-close-mobile" style="position:sticky;top:0;background:var(--card);width:100%;display:none;justify-content:flex-end;padding:0 0 1rem 0;border:none;z-index:5;">
      <button onclick="closeCheckoutModal()" style="font-size:.8rem;letter-spacing:1px;font-weight:700;color:var(--text);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-xmark"></i> CERRAR</button>
    </div>
    <div id="shipping-options-container" style="display:flex;gap:10px;margin-bottom:1.5rem;flex-wrap:wrap;"></div>
    <div id="checkout-total-preview" style="padding:1rem;background:rgba(201,168,76,.05);border:1px solid var(--border);border-radius:6px;margin-bottom:1rem;font-size:.85rem;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal:</span><span id="preview-subtotal">L. 0.00</span></div>
      <div id="preview-descuento-row" style="display:flex;justify-content:space-between;margin-bottom:4px;color:#27AE60;"><span>Descuento:</span><span id="preview-descuento">-L. 0.00</span></div>
      <div id="preview-envio-row" style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Envío:</span><span id="preview-envio">L. 0.00</span></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700;color:var(--primary);border-top:1px solid var(--border);padding-top:8px;"><span>TOTAL:</span><span id="preview-total">L. 0.00</span></div>
    </div>
    <div id="delivery-info"></div>
  </div>
</div>

<div id="exit-popup">
  <button onclick="closeExitPopup()" style="position:absolute;top:15px;right:15px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text);">✕</button>
  <h2>¡ESPERA! ✋</h2>
  <p style="margin:1rem 0;font-size:.9rem;">Obtén un beneficio exclusivo antes de irte.</p>
  <input type="text" id="exit-coupon-input" placeholder="CÓDIGO">
  <p id="exit-error-msg" style="color:#E74C3C;font-size:.8rem;margin-bottom:10px;display:none;">INVÁLIDO</p>
  <button class="btn-add-main" style="width:100%;" onclick="validateExitCoupon()">CANJEAR</button>
</div>

<button id="cart-fab" style="position:fixed;bottom:20px;right:20px;z-index:500;display:none;background:var(--primary);color:white;height:44px;border-radius:30px;border:none;cursor:pointer;align-items:center;justify-content:center;gap:8px;padding:0 16px;font-size:.85rem;font-weight:700;letter-spacing:1px;font-family:Inter;box-shadow:0 4px 15px rgba(0,0,0,.2);transition:transform .2s;white-space:nowrap;" onclick="toggleCart()">
  <i class="fa-solid fa-cart-shopping" style="font-size:.9rem;"></i>
  <span id="cart-fab-text">0 ITEMS</span>
</button>

<button class="back-to-top" id="btn-top" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</button>

<div id="social-proof-toast" class="toast" style="bottom:20px;left:20px;top:auto;transform:translateY(100px);right:auto;margin-left:0;background:var(--card);color:var(--text);border:1px solid var(--border);box-shadow:0 5px 15px rgba(0,0,0,.1);display:flex;align-items:center;gap:12px;padding:12px 20px;">
  <i class="fa-solid fa-bolt" style="color:#F1C40F;"></i>
  <div style="text-align:left;">
    <p id="sp-text" style="font-size:.8rem;margin:0;white-space:normal;"></p>
    <p style="font-size:.65rem;opacity:.5;margin:2px 0 0 0;">Hace un momento</p>
  </div>
</div>

<footer>
  <div class="footer-grid">
    <div id="footer-col-brand">
      <p id="footer-slogan" style="opacity:.6;margin:1rem 0;font-size:.9rem;"></p>
      <p id="footer-address"></p>
    </div>
    <div id="footer-col-links"><h4>TIENDA</h4><div id="footer-cat-list"></div></div>
    <div id="footer-col-contact">
      <h4>CONTACTO</h4>
      <p id="footer-phone"></p><p id="footer-email"></p><p id="footer-horario"></p>
    </div>
  </div>
  <hr>
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
    <p id="footer-copy" style="font-size:.8rem;opacity:.5;"></p>
    <div id="social-links" style="display:flex;gap:1rem;padding-top:0;"></div>
  </div>
</footer>

<div id="search-overlay" class="search-overlay">
  <div class="search-overlay-content" onclick="event.stopPropagation()">
    <div class="search-header">
      <i class="fa-solid fa-magnifying-glass search-icon-lg"></i>
      <input type="text" id="mega-search-input" placeholder="¿Qué estás buscando?" autocomplete="off">
      <button onclick="closeMegaSearch()" class="search-close-btn">✕</button>
    </div>
    <div class="search-results-container">
      <div id="search-suggestions" class="search-suggestions">
        <h4>BÚSQUEDAS POPULARES</h4>
        <div class="popular-tags" id="popular-tags"></div>
      </div>
      <div id="mega-search-results" class="mega-search-results"></div>
    </div>
  </div>
</div>

<nav class="bottom-nav">
  <button class="bottom-nav-item active" onclick="window.scrollTo({top:0,behavior:'smooth'})"><i class="fa-solid fa-house"></i><span>Inicio</span></button>
  <button class="bottom-nav-item" onclick="openMegaSearch()"><i class="fa-solid fa-magnifying-glass"></i><span>Buscar</span></button>
  <button class="bottom-nav-item" onclick="toggleCart()"><i class="fa-solid fa-cart-shopping"></i><span>Carrito</span><span id="bottom-cart-badge" class="bottom-badge" style="display:none;">0</span></button>
  <button class="bottom-nav-item" onclick="toggleWishlistDrawer()"><i class="fa-solid fa-heart"></i><span>Favoritos</span></button>
</nav>

<div id="mobile-nav-drawer" class="mobile-nav-drawer">
  <div class="mobile-nav-drawer-header">
    <img id="mobile-nav-logo" src="" alt="" style="height:40px;object-fit:contain;">
    <button onclick="closeMobileNav()" class="mobile-nav-close" aria-label="Cerrar menú">✕</button>
  </div>
  <ul id="mobile-nav-links" class="mobile-nav-links"></ul>
  <div id="mobile-nav-socials" class="mobile-nav-socials"></div>
</div>

<div id="product-sticky-bar" class="product-sticky-bar">
  <span id="sticky-product-name" class="sticky-product-name"></span>
  <button class="btn-add-main sticky-add-btn" onclick="stickyAddToCart()">+ CARRITO</button>
</div>`;
        }

// GLOBALS
        let WHATSAPP_NUMBER = "50499999999";
        let FREE_SHIPPING_THRESHOLD = 999;
        let FREE_SHIPPING_MSG = ""; 
        let ENVIOS = [];
        let SELECTED_ENVIO = null;
        let STOCK_LIMITE = 5;
        let products = [];
        let currentProducts = [];
        let activeDiscount = 0;
        let recentSearches = JSON.parse(localStorage.getItem('hondusport_searches')) || [];
        let cart = JSON.parse(localStorage.getItem('hondusport_cart')) || [];
        let activeTallas = [];
        let activeSubcats = [];
        let currentModalProduct = null;
        let selectedModalTalla = '';
        let freeShippingReached = false; 

        // --- SANITIZATION ---
        function escapeHTML(str) {
            if (typeof str !== 'string' && typeof str !== 'number') return '';
            return String(str).replace(/[&<>'"]/g, 
                tag => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[tag] || tag)
            );
        }

        // --- HELPERS ---
        function isActivo(f) {
            return f.activo === true || String(f.activo).trim().toUpperCase() === 'TRUE';
        }

        // Paginación y Vistos Recientemente
        let recentViews = JSON.parse(localStorage.getItem('hs_recent_views')) || [];
        let hsWishlist = JSON.parse(localStorage.getItem('hs_wishlist')) || [];
        let itemsPerPage = 12;
        let currentPage = 1;

        let formDataDelivery = { name: '', phone: '', email: '', city: '', address: '' };
        let formDataPickup = { name: '', phone: '', email: '' };

        async function loadData() {
            const loader = document.getElementById('page-loader');
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const productoParam = urlParams.get('producto');

                const res = await fetch('https://webhook.mplasesores.com/webhook/hondusport-products');
                if (!res.ok) throw new Error('Error al conectar con el servidor.');
                const response = await res.json();
                const data = response.data;
                products = data.products;

                if (data.config.whatsapp_number) WHATSAPP_NUMBER = String(data.config.whatsapp_number);
                if (data.config.free_shipping_meta) FREE_SHIPPING_THRESHOLD = parseFloat(data.config.free_shipping_meta);
                ENVIOS = data.envios || [];
                SELECTED_ENVIO = ENVIOS[0] || null;
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
                window.FREE_SHIPPING_ACTIVO = String(data.config.free_shipping_activo || 'TRUE').toUpperCase() === 'TRUE';
                window.CUPONES_POPUP_ACTIVO = String(data.config.cupones_popup_activo || 'TRUE').toUpperCase() === 'TRUE';
                FREE_SHIPPING_MSG = (data.config.free_shipping_msg && data.config.free_shipping_msg.trim() !== "")
                  ? data.config.free_shipping_msg : "✨ ¡TIENES ENVÍO GRATIS!";
                if (!window.FREE_SHIPPING_ACTIVO) {
                  const fsSection = document.getElementById('free-shipping-section');
                  if (fsSection) fsSection.style.display = 'none';
                }

                if (data.config.stock_bajo_limite) STOCK_LIMITE = parseInt(data.config.stock_bajo_limite);

                if (data.config.promo_bar_texto) {
                    const bar = document.querySelector('.promo-bar');
                    bar.innerHTML = data.config.promo_bar_texto;
                    const promoVal = document.getElementById('promo-val');
                    if (promoVal) promoVal.innerText = formatPrice(FREE_SHIPPING_THRESHOLD);
                    else bar.innerHTML += ` <span id="promo-val">${formatPrice(FREE_SHIPPING_THRESHOLD)}</span>`;
                }

                if (data.config.nombre_negocio) {
                    const titulo = data.config.nombre_negocio + (data.config.slogan ? ' | ' + data.config.slogan : '');
                    document.title = titulo;
                    const setMeta = (id, val) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
                    setMeta('og-title', titulo); setMeta('og-desc', data.config.meta_descripcion || '');
                    setMeta('og-image', data.config.og_imagen || data.config.logo_url || '');
                    setMeta('og-url', window.location.origin);
                    if (data.config.logo_url) {
                        const fav = document.getElementById('favicon'); if (fav) fav.href = data.config.logo_url;
                        const apl = document.getElementById('apple-icon'); if (apl) apl.href = data.config.logo_url;
                    }
                }
                if (data.config.logo_url && data.config.logo_url.trim() !== '') {
                    document.querySelectorAll('.logo-img').forEach(img => img.src = data.config.logo_url);
                    const fLogo = document.getElementById('footer-logo');
                    if (fLogo) fLogo.style.filter = 'brightness(0) invert(1)';
                }

                const colorMap = {
                    'color_primario': '--primary', 'color_bg_light': '--bg-light', 'color_text_light': '--text-light', 'color_card_light': '--card-light',
                    'color_border_light': '--border-light', 'color_bg_dark': '--bg-dark', 'color_text_dark': '--text-dark', 'color_card_dark': '--card-dark', 
                    'color_border_dark': '--border-dark', 'color_btn_bg': '--btn-bg', 'color_btn_text': '--btn-text', 'color_btn_hover': '--btn-hover',
                    'color_qty_btn_bg': '--qty-btn-bg', 'color_qty_btn_text': '--qty-btn-text'
                };
                Object.entries(colorMap).forEach(([key, cssVar]) => {
                    if (data.config[key] && data.config[key].trim() !== '') { document.documentElement.style.setProperty(cssVar, data.config[key].trim()); }
                });

                window.BADGE_COLORS = {
                    'Oferta': data.config.color_badge_oferta || '#E74C3C', 'Más Vendido': data.config.color_badge_oferta || '#E74C3C',
                    'Nuevo': data.config.color_badge_nuevo || '#27AE60', 'Sustentable': data.config.color_badge_eco || '#2980B9', 'Últimas unidades': data.config.color_badge_limite || '#E67E22'
                };

                const hero = document.querySelector('.hero');
                hero.innerHTML = data.banners.map((b, i) => `
                    <div class="slide ${i === 0 ? 'active' : ''}" style="background-image: linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url('${b.imagen}')">
                        <div class="slide-content"><h1>${b.titulo}</h1><p>${b.subtitulo}</p><a href="${b.btn_link}" class="hero-btn-outline">${b.btn_texto}</a></div>
                    </div>`).join('');

                window.CUPONES = (data.cupones || []).filter(c => c.activo !== false);
                window.ALL_FILTROS = data.filtros || [];

                const genderFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'genero' && isActivo(f))
                  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
                const catFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'cat' && isActivo(f))
                  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
                const tallaFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'talla' && isActivo(f))
                  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
                const subcatFiltros = window.ALL_FILTROS.filter(f => f.tipo === 'subcat' && isActivo(f))
                  .sort((a, b) => (a.orden || 0) - (b.orden || 0));

                const sidebarDiv = document.getElementById('sidebar-filters');
                sidebarDiv.innerHTML = `
                    <div class="filter-group"><h4>GÉNERO</h4>${genderFiltros.map(f => `<label><input type="checkbox" class="filter-check" data-type="genero" value="${f.valor}"> ${f.valor}</label>`).join('')}</div>
                    <div class="filter-group"><h4>CATEGORÍA</h4>${catFiltros.map(f => `<label><input type="checkbox" class="filter-check" data-type="cat" value="${f.valor}"> ${f.valor}</label>`).join('')}</div>
                    <div class="filter-group">
                        <h4>TALLA</h4>
                        <div class="talla-btn-group">
                            ${tallaFiltros.map(f => `<button class="talla-btn" data-talla="${f.valor}" data-categoria="${f.categorias || ''}" onclick="toggleTalla(this)">${f.valor}</button>`).join('')}
                        </div>
                    </div>`;

                if (subcatFiltros.length > 0) {
                    sidebarDiv.innerHTML += `
                        <div class="filter-group">
                            <h4>SUBCATEGORÍA</h4>
                            <div class="talla-btn-group">
                                ${subcatFiltros.map(f => `<button class="talla-btn" data-subcat="${f.valor}" data-parent="${f.categorias || ''}" onclick="toggleSubcat(this)">${f.valor}</button>`).join('')}
                            </div>
                        </div>`;
                }
                
                document.querySelectorAll('.filter-check').forEach(c => c.addEventListener('change', applyFilters));

                const categoriasUnicas = catFiltros.map(f => f.valor).filter(v => v && v.trim() !== "");
                const catInner = document.getElementById('category-bar-inner');
                catInner.innerHTML = `<button class="cat-filter-btn active" data-cat="">TODOS</button>`;
                categoriasUnicas.forEach(cat => {
                    const subcatsForCat = subcatFiltros.filter(s => {
                        const parentCat = (s.categorias || '').toLowerCase();
                        return parentCat.includes(cat.toLowerCase());
                    });

                    if (subcatsForCat.length > 0) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'cat-dropdown-wrapper';
                        
                        const btn = document.createElement('button');
                        btn.className = 'cat-filter-btn'; 
                        btn.dataset.cat = cat; 
                        btn.innerText = cat.toUpperCase();
                        wrapper.appendChild(btn);
                        
                        const dropdown = document.createElement('div');
                        dropdown.className = 'cat-dropdown';
                        subcatsForCat.forEach(s => {
                            const subBtn = document.createElement('button');
                            subBtn.className = 'cat-sub-item';
                            subBtn.innerText = s.valor.toUpperCase();
                            subBtn.onclick = () => {
                                filterFromFooter(cat);
                                toggleSubcatFromBar(s.valor);
                            };
                            dropdown.appendChild(subBtn);
                        });
                        wrapper.appendChild(dropdown);
                        catInner.appendChild(wrapper);
                    } else {
                        const btn = document.createElement('button');
                        btn.className = 'cat-filter-btn'; 
                        btn.dataset.cat = cat; 
                        btn.innerText = cat.toUpperCase();
                        catInner.appendChild(btn);
                    }
                });
                setupCatFilters();

                // Populate mobile nav drawer with categories
                const mobileNavLinks = document.getElementById('mobile-nav-links');
                if (mobileNavLinks) {
                    mobileNavLinks.innerHTML = '';
                    const mTodosLi = document.createElement('li');
                    const mTodosBtn = document.createElement('button');
                    mTodosBtn.innerText = 'TODOS LOS PRODUCTOS';
                    mTodosBtn.onclick = () => {
                        renderProducts(products);
                        document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
                        closeMobileNav();
                    };
                    mTodosLi.appendChild(mTodosBtn);
                    mobileNavLinks.appendChild(mTodosLi);

                    categoriasUnicas.forEach(cat => {
                        const li = document.createElement('li');
                        const btn = document.createElement('button');
                        btn.innerText = cat.toUpperCase();
                        btn.onclick = () => {
                            filterFromFooter(cat);
                            document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
                            closeMobileNav();
                        };
                        li.appendChild(btn);
                        mobileNavLinks.appendChild(li);
                    });
                }

                // Sync logo in mobile drawer if custom logo configured
                const mobileNavLogo = document.getElementById('mobile-nav-logo');
                if (mobileNavLogo && data.config.logo_url && data.config.logo_url.trim() !== '') {
                    mobileNavLogo.src = data.config.logo_url;
                }

                const navMenu = document.getElementById('nav-menu');
                navMenu.innerHTML = '';
                const todosLi = document.createElement('li');
                const todosBtn = document.createElement('button');
                todosBtn.className = 'nav-cat-btn active';
                todosBtn.innerText = 'TODOS';
                todosBtn.onclick = () => {
                    renderProducts(products);
                    document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
                    document.querySelectorAll('.nav-cat-btn').forEach(b => b.classList.remove('active'));
                    todosBtn.classList.add('active');
                    document.getElementById('nav-menu').classList.remove('active');
                    document.getElementById('hamburger-btn').classList.remove('active');
                };
                todosLi.appendChild(todosBtn);
                navMenu.appendChild(todosLi);

                categoriasUnicas.forEach(cat => {
                    const li = document.createElement('li');
                    const btn = document.createElement('button');
                    btn.className = 'nav-cat-btn';
                    btn.dataset.cat = cat;
                    btn.innerText = cat.toUpperCase();
                    btn.onclick = () => {
                        filterFromFooter(cat);
                        document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
                        document.querySelectorAll('.nav-cat-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        document.getElementById('nav-menu').classList.remove('active');
                        document.getElementById('hamburger-btn').classList.remove('active');
                    };
                    li.appendChild(btn);
                    navMenu.appendChild(li);
                });

                const catGallery = document.createElement('section');
                catGallery.id = 'category-gallery';
                catGallery.style.textAlign = 'center';
                
                const catTitle = document.createElement('h2');
                catTitle.innerText = 'NUESTRAS CATEGORÍAS';
                catTitle.style.cssText = 'font-family: "Bebas Neue", sans-serif; font-size: 2rem; letter-spacing: 2px; margin-bottom: 1.5rem; text-align: center; color: var(--text);';
                catGallery.appendChild(catTitle);
                
                const galleryGrid = document.createElement('div');
                galleryGrid.id = 'category-gallery-inner'; 
                categoriasUnicas.forEach(cat => {
                    const catFilterObj = catFiltros.find(f => f.valor === cat);
                    const catImg = (catFilterObj && catFilterObj.imagen && catFilterObj.imagen.trim() !== "")
                                   ? catFilterObj.imagen
                                   : (products.find(p => p.cat === cat && p.imgs?.[0])?.imgs?.[0] || '');

                    const card = document.createElement('div');
                    card.className = 'category-card';
                    card.onclick = () => filterFromFooter(cat);
                    card.innerHTML = `
                        <img src="${catImg}" class="cat-bg" alt="${cat}">
                        <div class="cat-overlay"></div>
                        <div class="cat-title">${cat}</div>
                    `;
                    galleryGrid.appendChild(card);
                });
                
                catGallery.appendChild(galleryGrid);
                const tiendaEl = document.getElementById('tienda');
                tiendaEl.parentNode.insertBefore(catGallery, tiendaEl);

                renderProducts(products); 

                const footerListDiv = document.getElementById('footer-cat-list');
                const footerUl = document.createElement('ul');
                footerUl.style.listStyle = 'none'; footerUl.style.display = 'flex'; footerUl.style.flexDirection = 'column'; footerUl.style.gap = '8px';
                const createFooterLi = (label, catVal) => {
                    const li = document.createElement('li');
                    const btn = document.createElement('button');
                    btn.className = 'footer-filter-btn'; btn.innerText = label;
                    btn.onclick = () => filterFromFooter(catVal);
                    li.appendChild(btn); return li;
                };
                footerUl.appendChild(createFooterLi('COLECCIÓN', ''));
                categoriasUnicas.forEach(cat => footerUl.appendChild(createFooterLi(cat.toUpperCase(), cat)));
                if (products.some(p => p.badge === 'Oferta')) footerUl.appendChild(createFooterLi('OFERTAS', 'OFERTAS'));
                footerListDiv.innerHTML = ''; footerListDiv.appendChild(footerUl);

                if (document.getElementById('footer-address')) {
                    if (data.config.direccion) document.getElementById('footer-address').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${data.config.direccion}`;
                    else document.getElementById('footer-address').style.display = 'none';
                }
                if (document.getElementById('footer-phone')) {
                    if (data.config.telefono_visible) document.getElementById('footer-phone').innerHTML = `<i class="fa-solid fa-phone"></i> ${data.config.telefono_visible}`;
                    else document.getElementById('footer-phone').style.display = 'none';
                }
                if (document.getElementById('footer-email')) {
                    if (data.config.email_contacto) document.getElementById('footer-email').innerHTML = `<i class="fa-solid fa-envelope"></i> ${data.config.email_contacto}`;
                    else document.getElementById('footer-email').style.display = 'none';
                }
                if (document.getElementById('footer-horario')) {
                    if (data.config.horario) document.getElementById('footer-horario').innerHTML = `<i class="fa-solid fa-clock"></i> ${data.config.horario}`;
                    else document.getElementById('footer-horario').style.display = 'none';
                }

                const redes = [{ key: 'facebook_url', icon: 'fa-facebook-f' }, { key: 'instagram_url', icon: 'fa-instagram' }, { key: 'tiktok_url', icon: 'fa-tiktok' }, { key: 'whatsapp_url', icon: 'fa-whatsapp' }, { key: 'twitter_url', icon: 'fa-x-twitter' }, { key: 'youtube_url', icon: 'fa-youtube' }];
                const socialContainer = document.getElementById('social-links');
                if (socialContainer) {
                    socialContainer.innerHTML = redes.filter(r => data.config[r.key] && data.config[r.key].trim() !== '').map(r => `
                        <a href="${data.config[r.key]}" target="_blank" rel="noopener" 
                           style="width: 36px; height: 36px; border-radius: 50%; background: transparent; border: 1.5px solid rgba(255, 255, 255, 0.3); color: rgba(255, 255, 255, 0.7); display: flex; align-items: center; justify-content: center; text-decoration: none; transition: 0.2s; font-size: 0.9rem;"
                           onmouseover="this.style.borderColor='white'; this.style.color='white'; this.style.background='rgba(255,255,255,0.1)';"
                           onmouseout="this.style.borderColor='rgba(255, 255, 255, 0.3)'; this.style.color='rgba(255, 255, 255, 0.7)'; this.style.background='transparent';">
                           <i class="fa-brands ${r.icon}"></i>
                        </a>`).join('');
                }

                if (data.config.whatsapp_url && data.config.whatsapp_url.trim() !== '') {
                    const wa = document.createElement('a');
                    wa.href = data.config.whatsapp_url; wa.target = '_blank'; wa.rel = 'noopener'; wa.innerHTML = '<i class="fa-brands fa-whatsapp"></i>';
                    wa.style.cssText = `position:fixed; bottom:80px; left:85px; background:#25D366; color:white; width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; z-index:99; box-shadow:0 4px 15px rgba(0,0,0,0.3); text-decoration:none; transition:transform 0.2s;`;
                    wa.onmouseover = () => wa.style.transform = 'scale(1.1)';
                    wa.onmouseout = () => wa.style.transform = 'scale(1)';
                    document.body.appendChild(wa);
                }

                const año = new Date().getFullYear();
                const nombreFooter = data.config.nombre_negocio || 'HONDU SPORT';
                const sloganEl = document.getElementById('footer-slogan');
                if (sloganEl) sloganEl.innerText = data.config.slogan || '';
                const copyEl = document.getElementById('footer-copy');
                if (copyEl) copyEl.innerText = '© ' + año + ' ' + nombreFooter + '. TODOS LOS DERECHOS RESERVADOS.';

                if (productoParam) {
                    const id = parseFloat(productoParam);
                    if (products.find(p => p.id === id)) requestAnimationFrame(() => openProductPage(id));
                }

                initHero();
                updateCartUI();
                if (loader) loader.style.display = 'none';
            } catch (error) {
                console.error('Error:', error);
                if (loader) loader.style.display = 'none';
                document.getElementById('products-container').innerHTML = `<div style="text-align:center; padding:3rem; grid-column:1/-1;"><p style="opacity:0.6;">Error al cargar datos.</p></div>`;
            }
        }
        
        function clearFilters() {
            activeTallas = [];
            activeSubcats = [];
            document.querySelectorAll('.filter-check').forEach(c => c.checked = false);
            document.getElementById('price-range').value = 5000;
            document.getElementById('price-val').innerText = formatPrice(5000);
            document.getElementById('main-search').value = '';
            document.querySelectorAll('.talla-btn').forEach(b => {
                b.classList.remove('active');
                b.style.display = 'inline-block';
            });
            document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
            const btnTodos = document.querySelector('.cat-filter-btn[data-cat=""]');
            if (btnTodos) btnTodos.classList.add('active');
            renderProducts(products);
            document.getElementById('sidebar').classList.remove('active');
        }

        function toggleSubcatFromBar(val) {
            activeSubcats = [val];
            applyFilters();
            document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
        }

        function toggleSubcat(btn) {
            const val = btn.dataset.subcat;
            if (activeSubcats.includes(val)) { activeSubcats = activeSubcats.filter(s => s !== val); btn.classList.remove('active'); }
            else { activeSubcats.push(val); btn.classList.add('active'); }
            applyFilters();
        }

        function toggleTalla(btn) {
            const val = btn.dataset.talla;
            if (activeTallas.includes(val)) { activeTallas = activeTallas.filter(t => t !== val); btn.classList.remove('active'); }
            else { activeTallas.push(val); btn.classList.add('active'); }
            applyFilters();
        }

        function setViewMode(mode) {
            viewMode = mode;
            document.getElementById('btn-grid').classList.toggle('active', mode === 'grid');
            document.getElementById('btn-list').classList.toggle('active', mode === 'list');
            renderProducts(currentProducts);
        }

        function filterFromFooter(cat) {
            let filtered = products;
            if (cat === 'OFERTAS') filtered = products.filter(p => p.badge === 'Oferta');
            else if (cat !== '') filtered = products.filter(p => p.cat === cat);
            renderProducts(filtered);
            document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
            const catButtons = document.querySelectorAll('.cat-filter-btn');
            catButtons.forEach(btn => btn.classList.remove('active'));
            const targetBtn = Array.from(catButtons).find(btn => btn.dataset.cat === (cat === 'OFERTAS' ? 'NOT_ACTIVE' : cat));
            if (targetBtn) targetBtn.classList.add('active');
        }

        function setupCatFilters() {
            const buttons = document.querySelectorAll('.cat-filter-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const cat = btn.dataset.cat;
                    activeTallas = [];
                    activeSubcats = [];
                    const tallaBtns = document.querySelectorAll('.talla-btn');
                    tallaBtns.forEach(tBtn => {
                        tBtn.classList.remove('active');
                        if (cat === "") tBtn.style.display = 'inline-block';
                        else {
                            const cats = tBtn.dataset.categoria || tBtn.dataset.parent || "";
                            tBtn.style.display = cats.split(',').map(c => c.trim().toLowerCase()).includes(cat.toLowerCase()) ? 'inline-block' : 'none';
                        }
                    });
                    if (cat === "") renderProducts(products);
                    else renderProducts(products.filter(p => p.cat === cat));
                });
            });
        }

        function formatPrice(amount) { return "L. " + amount.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

        function applyFilters() {
            const searchVal = document.getElementById('main-search').value.toLowerCase();
            const maxPrice = parseInt(document.getElementById('price-range').value);
            const activeChecks = Array.from(document.querySelectorAll('.filter-check:checked'));
            
            // Filtrado base
            let filtered = products.filter(p => {
                const matchesPrice = p.price <= maxPrice;
                const genderFilters = activeChecks.filter(c => c.dataset.type === 'genero').map(c => c.value);
                const catFilters = activeChecks.filter(c => c.dataset.type === 'cat').map(c => c.value);
                const matchesGender = (genderFilters.length === 0 || genderFilters.includes(p.gender));
                const matchesCat = (catFilters.length === 0 || catFilters.includes(p.cat));
                let matchesTalla = true;
                if (activeTallas.length > 0) {
                    const validSizeFilters = window.ALL_FILTROS.filter(f => activeTallas.includes(f.valor) && f.tipo === 'talla');
                    matchesTalla = validSizeFilters.some(f => (f.categorias || '').split(',').map(c => c.trim().toLowerCase()).includes(p.cat.toLowerCase()));
                }
                let matchesSubcat = true;
                if (activeSubcats.length > 0) matchesSubcat = p.subcat && activeSubcats.includes(p.subcat);
                return matchesPrice && matchesGender && matchesCat && matchesTalla && matchesSubcat;
            });

            // Lógica de Búsqueda (Fuzzy Search con Fuse.js)
            if (searchVal.trim() !== '') {
                if (typeof Fuse !== 'undefined') {
                    const fuse = new Fuse(filtered, {
                        keys: ['name', 'cat', 'subcat', 'desc'],
                        threshold: 0.4,
                        ignoreLocation: true
                    });
                    const result = fuse.search(searchVal);
                    filtered = result.map(r => r.item);
                } else {
                    filtered = filtered.filter(p => p.name.toLowerCase().includes(searchVal));
                }
            }

            // Lógica de Ordenamiento (Sort By)
            const sortBy = document.getElementById('sort-by') ? document.getElementById('sort-by').value : 'default';
            if (sortBy === 'price-asc') {
                filtered.sort((a, b) => a.price - b.price);
            } else if (sortBy === 'price-desc') {
                filtered.sort((a, b) => b.price - a.price);
            } else if (sortBy === 'name-asc') {
                filtered.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sortBy === 'name-desc') {
                filtered.sort((a, b) => b.name.localeCompare(a.name));
            }

            renderProducts(filtered);
        }

        function clearAllFilters() {
            document.getElementById('main-search').value = '';
            const priceRange = document.getElementById('price-range');
            priceRange.value = priceRange.max;
            document.getElementById('price-val').innerText = formatPrice(parseFloat(priceRange.max));
            
            document.querySelectorAll('.filter-check').forEach(c => c.checked = false);
            
            if (document.getElementById('sort-by')) {
                document.getElementById('sort-by').value = 'default';
            }

            activeTallas = [];
            activeSubcats = [];
            
            document.querySelectorAll('.cat-filter-btn').forEach(b => b.classList.remove('active'));
            const todosBtn = Array.from(document.querySelectorAll('.cat-filter-btn')).find(b => b.dataset.cat === "");
            if (todosBtn) todosBtn.classList.add('active');

            document.querySelectorAll('.talla-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.style.display = 'inline-block';
            });
            
            renderProducts(products);
            document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
            
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('active');
            }
        }

        function renderProducts(data, append = false) {
            currentProducts = data;
            const container = document.getElementById('products-container');
            const noResults = document.getElementById('no-results');
            const sOfertas = document.getElementById('section-ofertas');
            const sNuevos = document.getElementById('section-nuevos');
            const sVendidos = document.getElementById('section-mas-vendidos');
            const sTodos = document.getElementById('section-todos');
            const loadMoreContainer = document.getElementById('load-more-container');
            
            if (!append) {
                currentPage = 1;
                container.innerHTML = '';
            }

            // Datos a renderizar en la página actual
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedData = data.slice(startIndex, endIndex);
            
            const cardHTML = (p, rank = null) => {
                const safeName = escapeHTML(p.name);
                const safeBadge = escapeHTML(p.badge || '');
                const safeImg = escapeHTML(p.imgs?.[0] || '');

                const originalPriceHtml = (p.precio_original && p.precio_original > p.price) ? `<span class="card-original-price">${formatPrice(p.precio_original)}</span>` : '';
                const stockHtml = (p.stock && p.stock > 0 && p.stock <= STOCK_LIMITE) ? `<span class="card-stock-warning">ÚLTIMAS ${p.stock} UNIDADES</span>` : '';
                const visitsHtml = (p.visitas && p.visitas > 0) ? `<span class="card-visits">${p.visitas} personas lo vieron hoy</span>` : '';
                const isWished = hsWishlist.includes(p.id);

                // Countdown timer para productos en Oferta (leyendo de webhook o fallback)
                let timerHtml = '';
                if (p.badge === 'Oferta') {
                    let totalSeconds = 0;
                    if (p.oferta_fin) {
                        try {
                            const targetTime = new Date(p.oferta_fin).getTime();
                            const now = new Date().getTime();
                            if (targetTime > now) totalSeconds = Math.floor((targetTime - now) / 1000);
                        } catch(e) {}
                    }
                    if (totalSeconds <= 0 && p.oferta_horas) {
                        totalSeconds = parseInt(p.oferta_horas) * 3600;
                    }
                    if (totalSeconds <= 0) {
                        // random fallback si no viene dato en el webhook sheet
                        const hours = Math.floor(Math.random() * 5) + 1;
                        const mins = Math.floor(Math.random() * 59);
                        totalSeconds = hours * 3600 + mins * 60;
                    }
                    
                    if (totalSeconds > 0) {
                        timerHtml = `<div class="offer-timer" data-time="${totalSeconds}">⏳ Calculando...</div>`;
                    }
                }

                return `
                <article class="product-card fade-in-up">
                    ${rank !== null ? `<span class="card-rank">${rank}</span>` : ''}
                    ${p.badge ? `<span class="badge" style="background:${getBadgeColor(p.badge)}">${safeBadge}</span>` : ''}
                    
                    <button class="wishlist-btn ${isWished ? 'active' : ''}" onclick="toggleWishlist(event, ${p.id})">
                        <i class="${isWished ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>
                    
                    <div class="product-img-container" onclick="openProductPage(${p.id})">
                        <img src="${safeImg}" alt="${safeName}" loading="lazy">
                        ${timerHtml}
                    </div>
                    <div class="product-info">
                        <div class="product-text-content" onclick="openProductPage(${p.id})" style="cursor:pointer;">
                            <div class="stars">${'★'.repeat(p.rating || 5)}${'☆'.repeat(5-(p.rating || 5))}</div>
                            ${visitsHtml}
                            <h3>${safeName}</h3>
                            <p class="price">${originalPriceHtml}${formatPrice(p.price)}</p>
                            ${stockHtml}
                        </div>
                        <div class="card-btn-row">
                            <button class="btn-add-main" style="width: 50%; margin-top: 0; border-radius: 0;" onclick="openProductPage(${p.id})">VER</button>
                            <button class="btn-add-main" style="width: 50%; margin-top: 0; background: var(--primary); color: white; border-radius: 0;" onclick="quickAdd(${p.id})">+ CARRITO</button>
                        </div>
                        <button class="card-mobile-add-btn" onclick="quickAdd(${p.id})">+ CARRITO</button>
                    </div>
                </article>`;
            };

            const isFullCatalog = (data.length === products.length && products.length > 0);
            
            if (isFullCatalog) {
                const ofertas = products.filter(p => p.badge === 'Oferta');
                const nuevos = products.filter(p => p.badge === 'Nuevo');
                const vendidos = products.filter(p => p.badge === 'Más Vendido');

                if (ofertas.length > 0) {
                    sOfertas.style.display = 'block';
                    document.getElementById('grid-ofertas').innerHTML = ofertas.map(p => cardHTML(p)).join('');
                    document.getElementById('count-ofertas').innerText = `${ofertas.length} PRODUCTOS`;
                } else sOfertas.style.display = 'none';

                if (nuevos.length > 0) {
                    sNuevos.style.display = 'block';
                    document.getElementById('grid-nuevos').innerHTML = nuevos.map(p => cardHTML(p)).join('');
                    document.getElementById('count-nuevos').innerText = `${nuevos.length} PRODUCTOS`;
                } else sNuevos.style.display = 'none';

                if (vendidos.length > 0) {
                    sVendidos.style.display = 'block';
                    document.getElementById('grid-mas-vendidos').innerHTML = vendidos.map((p, idx) => cardHTML(p, idx + 1)).join('');
                    document.getElementById('count-mas-vendidos').innerText = `${vendidos.length} PRODUCTOS`;
                } else sVendidos.style.display = 'none';

                sTodos.style.display = 'block';
                const hasSpecials = ofertas.length > 0 || nuevos.length > 0 || vendidos.length > 0;
                const todosTitle = document.querySelector('#section-todos .section-badge-title');
                if (todosTitle) todosTitle.childNodes[0].textContent = hasSpecials ? "VER TODO " : "CATÁLOGO COMPLETO ";
                initCarouselBtns();
            } else {
                sOfertas.style.display = 'none'; sNuevos.style.display = 'none'; sVendidos.style.display = 'none';
                sTodos.style.display = data.length === 0 ? 'none' : 'block';
            }

            container.innerHTML += paginatedData.map(p => cardHTML(p)).join('');
            document.getElementById('count-todos').innerText = `${data.length} PRODUCTOS`;
            noResults.style.display = data.length === 0 ? 'block' : 'none';

            if (endIndex < data.length) {
                loadMoreContainer.style.display = 'block';
            } else {
                loadMoreContainer.style.display = 'none';
            }

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
            }, { threshold: 0.1 });
            document.querySelectorAll('.product-card').forEach(card => observer.observe(card));

            startOfferTimers();
            renderRecentViews();
        }

        function startOfferTimers() {
            document.querySelectorAll('.offer-timer[data-time]:not([data-started])').forEach(el => {
                el.dataset.started = '1';
                let secs = parseInt(el.dataset.time) || 0;
                if (secs <= 0) { el.style.display = 'none'; return; }
                const pad = n => String(n).padStart(2, '0');
                const tick = () => {
                    if (secs <= 0) { el.style.display = 'none'; return; }
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const s = secs % 60;
                    el.textContent = `⏳ ${pad(h)}:${pad(m)}:${pad(s)}`;
                    secs--;
                };
                tick();
                setInterval(tick, 1000);
            });
        }

        function loadMoreProducts() {
            currentPage++;
            renderProducts(currentProducts, true);
        }

        function renderRecentViews() {
            const section = document.getElementById('recently-viewed-section');
            const grid = document.getElementById('grid-recent');
            if (!recentViews || recentViews.length === 0 || !products.length) {
                section.style.display = 'none';
                return;
            }
            
            const recentProducts = recentViews.map(id => products.find(p => p.id === id)).filter(Boolean);
            if (recentProducts.length === 0) {
                section.style.display = 'none';
                return;
            }

            const cardHTML = (p) => `
                <article class="product-card fade-in-up" style="flex: 0 0 calc(25% - 12px); min-width: 130px; max-width: 220px; white-space: normal;">
                    <div class="product-img-container" onclick="openProductPage(${p.id})"><img src="${p.imgs?.[0] || ''}" alt="${p.name}" loading="lazy"></div>
                    <div class="product-info">
                        <div class="product-text-content">
                            <h3>${p.name}</h3>
                            <p class="price">${formatPrice(p.price)}</p>
                        </div>
                    </div>
                </article>`;

            grid.innerHTML = recentProducts.map(p => cardHTML(p)).join('');
            section.style.display = 'block';
            
            setTimeout(() => {
                document.querySelectorAll('#recently-viewed-section .product-card').forEach(card => card.classList.add('visible'));
            }, 100);
        }

        function initCarouselBtns() {
            document.querySelectorAll('.carousel-wrapper').forEach(wrapper => {
                const grid = wrapper.querySelector('.products-grid');
                const btnPrev = wrapper.querySelector('.carousel-btn.prev');
                const btnNext = wrapper.querySelector('.carousel-btn.next');
                if (btnPrev && btnNext) {
                    btnPrev.style.pointerEvents = 'auto';
                    btnNext.style.pointerEvents = 'auto';
                    btnPrev.onclick = () => grid.scrollBy({ left: -200, behavior: 'smooth' });
                    btnNext.onclick = () => grid.scrollBy({ left: 200, behavior: 'smooth' });
                }
            });
        }

        function quickAdd(id) {
            const p = products.find(x => x.id === id);
            if (!p) return;
            const tallasDisponibles = (window.ALL_FILTROS || []).filter(f => f.tipo === 'talla' && isActivo(f) && (f.categorias || '').split(',').map(c => c.trim().toLowerCase()).includes(p.cat.toLowerCase())).map(f => f.valor);
            addToCart(p.id, tallasDisponibles[0] || "", "Sin personalización");
            showToast("✅ AGREGADO AL CARRITO");
        }

        function viewCartItem(idx) {
            const item = cart[idx];
            toggleCart();
            setTimeout(() => {
                openProductPage(item.id);
            }, 350);
        }

        function updateCartUI() {
            const container = document.getElementById('cart-items');
            const totalVal = document.getElementById('cart-total-val');
            const subtotalVal = document.getElementById('cart-subtotal-val');
            const discountBadge = document.getElementById('discount-badge');
            const subtotal = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
            const finalTotal = activeDiscount > 0 ? subtotal * (1 - (activeDiscount / 100)) : subtotal;

            if (window.FREE_SHIPPING_ACTIVO !== false && finalTotal >= FREE_SHIPPING_THRESHOLD && !freeShippingReached) {
                freeShippingReached = true;
                const celebration = document.getElementById('free-shipping-toast');
                celebration.classList.add('active');
                setTimeout(() => celebration.classList.remove('active'), 2500);
            } else if (finalTotal < FREE_SHIPPING_THRESHOLD) freeShippingReached = false;

            if (cart.length === 0) {
                const cca = document.getElementById('cart-coupon-area');
                if(cca) cca.remove();
                let msg = activeDiscount > 0 ? `🎉 TU DESCUENTO DEL ${activeDiscount}% SIGUE ACTIVO` : "TU CARRITO ESTÁ VACÍO";
                container.innerHTML = `<div class="cart-empty-msg"><p class="cart-empty-text">${msg}</p></div>`;
                subtotalVal.style.display = 'none'; discountBadge.style.display = 'none'; totalVal.style.color = 'inherit';
            } else {
                container.innerHTML = cart.map((item, idx) => {
                    const safeName = escapeHTML(item.name);
                    const safeImg = escapeHTML(item.imgs?.[0] || item.img || '');
                    const safeCustom = escapeHTML(item.custom);
                    const safeSize = escapeHTML(item.size);
                    return `
                    <div class="cart-item">
                        <img src="${safeImg}" alt="${safeName}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; flex-shrink:0;">
                        <div style="flex-grow:1; min-width:0;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                                <h4 class="cart-item-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">${safeName}</h4>
                                <button onclick="removeFromCart(${idx})" class="cart-item-delete" style="flex-shrink:0;">🗑️</button>
                            </div>
                            <p class="cart-item-size" style="margin:2px 0;">TALLA: ${safeSize}</p>
                            <div class="custom-edit-container" style="margin:3px 0;">
                                <span class="input-icon-label">✏️</span>
                                <input type="text" class="custom-edit-input" data-index="${idx}" value="${safeCustom === 'Sin personalización' ? '' : safeCustom}" placeholder="Personalización">
                            </div>
                            <div class="cart-item-controls" style="margin-top:4px;">
                                <div class="qty-controls">
                                    <button onclick="changeQty(${idx}, -1)" class="qty-btn">-</button>
                                    <span>${item.qty}</span>
                                    <button onclick="changeQty(${idx}, 1)" class="qty-btn">+</button>
                                </div>
                                <span class="cart-item-price">${formatPrice(item.price * item.qty)}</span>
                            </div>
                        </div>
                    </div>`
                }).join('');
                container.querySelectorAll('.custom-edit-input').forEach(input => {
                    input.addEventListener('blur', () => {
                        const idx = parseInt(input.dataset.index);
                        cart[idx].custom = input.value.trim() || 'Sin personalización';
                        input.classList.add('save-success'); setTimeout(() => input.classList.remove('save-success'), 800);
                        saveAndUpdate();
                    });
                    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') input.blur(); });
                });
                if (!document.getElementById('cart-coupon-area')) {
                    const cca = document.createElement('div');
                    cca.id = 'cart-coupon-area';
                    cca.innerHTML = `<input type="text" id="coupon-input" placeholder="CÓDIGO DE DESCUENTO" class="cart-coupon-input"><button onclick="applyCouponFromCart()" class="cart-coupon-btn">APLICAR</button>`;
                    const btnInit = document.getElementById('checkout-init-btn');
                    if (btnInit && btnInit.parentNode) {
                        btnInit.parentNode.insertBefore(cca, btnInit);
                    }
                }
                if (activeDiscount > 0) {
                    subtotalVal.innerText = formatPrice(subtotal); subtotalVal.style.display = 'block';
                    discountBadge.style.display = 'inline-block'; totalVal.style.color = '#C9A84C';
                    discountBadge.innerText = `-${activeDiscount}%`;
                }
            }
            totalVal.innerText = formatPrice(finalTotal);
            document.getElementById('cart-badge').innerText = cart.reduce((acc, i) => acc + i.qty, 0);
            const fsSection = document.getElementById('free-shipping-section');
            if (fsSection) fsSection.style.display = window.FREE_SHIPPING_ACTIVO === false ? 'none' : '';
            document.getElementById('shipping-bar').style.width = `${Math.min((finalTotal/FREE_SHIPPING_THRESHOLD)*100, 100)}%`;
            const promoValSpan = document.getElementById('promo-val');
            if (promoValSpan) promoValSpan.innerText = formatPrice(FREE_SHIPPING_THRESHOLD);
            const msg = document.getElementById('shipping-msg');
            if (window.FREE_SHIPPING_ACTIVO !== false && finalTotal >= FREE_SHIPPING_THRESHOLD) {
                msg.innerHTML = FREE_SHIPPING_MSG || "✨ ¡TIENES ENVÍO GRATIS!"; msg.style.color = "var(--primary)";
            } else if (SELECTED_ENVIO && SELECTED_ENVIO.tipo === 'delivery' && SELECTED_ENVIO.costo > 0) {
                msg.innerHTML = `ENVÍO A DOMICILIO: <b>${formatPrice(SELECTED_ENVIO.costo)}</b>`;
                msg.style.color = "var(--text)";
            }

            const cartFab = document.getElementById('cart-fab');
            if (cartFab) {
                const totalItems = cart.reduce((acc, i) => acc + i.qty, 0);
                if (totalItems > 0) {
                    document.getElementById('cart-fab-text').innerText = totalItems + ' ITEMS';
                    cartFab.classList.add('visible');
                } else {
                    cartFab.classList.remove('visible');
                }
            }
            
            const bottomBadge = document.getElementById('bottom-cart-badge');
            if (bottomBadge) {
                const totalItems = cart.reduce((acc, i) => acc + i.qty, 0);
                if (totalItems > 0) {
                    bottomBadge.innerText = totalItems;
                    bottomBadge.style.display = 'block';
                } else {
                    bottomBadge.style.display = 'none';
                }
            }
            
        }

        function selectShipping(envioId) {
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

          SELECTED_ENVIO = ENVIOS.find(e => e.id === envioId) || ENVIOS[0] || null;

          document.querySelectorAll('.delivery-option-btn').forEach(b => b.classList.remove('active'));
          const activeBtn = document.querySelector(`[data-envio-id="${envioId}"]`);
          if (activeBtn) activeBtn.classList.add('active');

          const saved = JSON.parse(localStorage.getItem('hs_checkout_delivery')) || {};
          const infoDiv = document.getElementById('delivery-info');
          if (!infoDiv || !SELECTED_ENVIO) return;

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

        function initAutoSave() {
            document.querySelectorAll('.auto-save').forEach(input => {
                input.addEventListener('input', () => {
                    const savedContent = {
                        name: document.getElementById('c-name')?.value || '',
                        phone: document.getElementById('c-phone')?.value || '',
                        email: document.getElementById('c-email')?.value || '',
                        city: document.getElementById('c-city')?.value || '',
                        address: document.getElementById('c-address')?.value || ''
                    };
                    localStorage.setItem('hs_checkout_delivery', JSON.stringify(savedContent));
                });
            });
        }

        function updateCheckoutPreview() {
          const subtotal = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
          const couponDisc = activeDiscount > 0 ? subtotal * (activeDiscount / 100) : 0;
          const envioDisc = SELECTED_ENVIO ? subtotal * ((SELECTED_ENVIO.descuento || 0) / 100) : 0;
          const totalDiscount = couponDisc + envioDisc;
          const freeShippingMeta = parseFloat(FREE_SHIPPING_THRESHOLD) || 999;
          const shippingFee = (SELECTED_ENVIO && SELECTED_ENVIO.tipo === 'delivery' &&
            (window.FREE_SHIPPING_ACTIVO === false || subtotal < freeShippingMeta))
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

        function applyCouponFromCart() {
            const val = document.getElementById('coupon-input').value.trim().toUpperCase();
            const cupon = (window.CUPONES || []).find(c => c.codigo === val);
            if (cupon) { activeDiscount = cupon.descuento; saveAndUpdate(); showToast("✅ DESCUENTO APLICADO"); }
            else showToast("❌ CÓDIGO INVÁLIDO");
        }

        function validateExitCoupon() {
            const input = document.getElementById('exit-coupon-input').value.trim().toUpperCase();
            const cupon = (window.CUPONES || []).find(c => c.codigo === input);
            if (cupon) { activeDiscount = cupon.descuento; saveAndUpdate(); closeExitPopup(); toggleCart(true); }
            else document.getElementById('exit-error-msg').style.display = 'block';
        }

        function getBadgeColor(text) { if (window.BADGE_COLORS && window.BADGE_COLORS[text]) return window.BADGE_COLORS[text]; return "#E74C3C"; }
        function removeFromCart(idx) { cart.splice(idx, 1); saveAndUpdate(); }
        function saveAndUpdate() { localStorage.setItem('hondusport_cart', JSON.stringify(cart)); localStorage.setItem('hondusport_discount', JSON.stringify(activeDiscount)); updateCartUI(); }
        
        function handleSearch(event) {
            applyFilters();
            if (event.type === 'blur' || (event.type === 'keydown' && event.key === 'Enter')) {
                const val = event.target.value.trim();
                if (val && !recentSearches.includes(val)) {
                    recentSearches = [val, ...recentSearches].slice(0, 3);
                    localStorage.setItem('hondusport_searches', JSON.stringify(recentSearches));
                }
            }
        }

        function showRecent() {
            const input = document.getElementById('main-search');
            const div = document.getElementById('recent-searches');
            if (input.value === "" && recentSearches.length > 0) {
                div.innerHTML = recentSearches.map(s => `<div class="recent-item" onclick="execRecent('${s}')"><i class="fa-solid fa-clock"></i> ${s}</div>`).join('');
                div.style.display = 'block';
            } else div.style.display = 'none';
        }

        function execRecent(val) { document.getElementById('main-search').value = val; document.getElementById('recent-searches').style.display = 'none'; applyFilters(); }
        
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

        function openProductPage(id) {
            const p = products.find(x => x.id === id);
            if (!p) return;
            currentModalProduct = p;
            
            const url = new URL(window.location);
            url.searchParams.set('producto', id);
            window.history.pushState({}, '', url);

            const elementsToHide = ['.hero', '#category-bar', '#tienda', '#category-gallery'];
            elementsToHide.forEach(sel => {
                const el = document.querySelector(sel);
                if (el) el.style.display = 'none';
            });
            document.getElementById('product-page-view').style.display = 'block';
            window.scrollTo({top:0, behavior:'smooth'});
            closeMegaSearch();
            
            // Convert hamburger to back button
            const hbBtn = document.getElementById('hamburger-btn');
            if (hbBtn) {
                hbBtn.innerHTML = '<i class="fa-solid fa-arrow-left" style="font-size: 1.25rem;"></i>';
                hbBtn.onclick = goToHome;
            }

            // Añadir a Vistos Recientemente
            recentViews = recentViews.filter(vId => vId !== id);
            recentViews.unshift(id);
            if (recentViews.length > 6) recentViews.pop();
            localStorage.setItem('hs_recent_views', JSON.stringify(recentViews));
            renderRecentViews();

            document.getElementById('modal-img-main').src = p.imgs?.[0] || '';
            document.getElementById('modal-thumbs').innerHTML = (p.imgs || []).filter(Boolean).map((url, i) => `<img src="${url}" class="thumb-img ${i===0?'active':''}" onclick="changeGallery(this, '${url}')">`).join('');
            
            initZoomEffect(); // Inicializar el efecto de Zoom

            const tallas = (window.ALL_FILTROS || []).filter(f => f.tipo === 'talla' && (f.activo === true || String(f.activo).trim().toUpperCase() === 'TRUE') && (f.categorias || '').split(',').map(c => c.trim().toLowerCase()).includes(p.cat.toLowerCase())).map(f => f.valor);
            const final = tallas.length > 0 ? tallas : (p.cat === "Zapatillas" ? ["37", "38", "39", "40", "41", "42", "43", "44"] : ["S", "M", "L", "XL"]);
            document.getElementById('m-size-container').innerHTML = final.map((t, i) => `<button class="talla-btn ${i===0?'active':''}" data-talla="${t}" onclick="setModalTalla(this)">${t}</button>`).join('');
            selectedModalTalla = final[0];
            document.getElementById('m-title').innerText = p.name;
            const mPriceEl = document.getElementById('m-price');
            if (p.precio_original && p.precio_original > p.price) mPriceEl.innerHTML = `<span class="modal-original-price">${formatPrice(p.precio_original)}</span> <span class="modal-current-price">${formatPrice(p.price)}</span>`;
            else mPriceEl.innerText = formatPrice(p.price);
            document.getElementById('m-desc').innerText = p.desc;
            
            // --- RESEÑAS DINÁMICAS ---
            const reviewsContainer = document.getElementById('m-reviews-container');
            if (reviewsContainer) {
                const rating = p.rating || 5;
                const starsHTML = '<span style="color:#F1C40F;">' + '⭐'.repeat(rating) + '</span>';
                
                let reviewsHTML = `
                    <div style="font-size: 0.8rem; margin-bottom: 1rem; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 6px;">
                        ${starsHTML} <strong style="margin-left:5px;">Cliente Verificado</strong>
                        <p style="margin: 5px 0 0 0; opacity: 0.8; font-style: italic;">"Excelente producto, muy buena calidad y el envío fue rápido."</p>
                    </div>
                `;
                if (rating >= 4) {
                    reviewsHTML += `
                        <div style="font-size: 0.8rem; margin-bottom: 1rem; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 6px;">
                            ${starsHTML} <strong style="margin-left:5px;">Usuario Anónimo</strong>
                            <p style="margin: 5px 0 0 0; opacity: 0.8; font-style: italic;">"Me encantó. Recomendado."</p>
                        </div>
                    `;
                }
                reviewsContainer.innerHTML = reviewsHTML;
                const reviewsTitle = document.getElementById('m-reviews-title');
                if (reviewsTitle) reviewsTitle.innerText = `RESEÑAS DE CLIENTES (${rating >= 4 ? 2 : 1})`;
            }

            document.getElementById('m-custom').value = "";
            document.getElementById('m-add-btn').onclick = () => { addToCart(p.id, selectedModalTalla, document.getElementById('m-custom').value || "Sin personalización"); showToast("✅ PRODUCTO AGREGADO"); };
            document.getElementById('related-products').innerHTML = products.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 2).map(r => `<div class="related-item" onclick="openProductPage(${r.id})"><img src="${r.imgs?.[0] || ''}" alt="R"><div><p class="related-item-title">${r.name}</p><p class="related-item-price">${formatPrice(r.price)}</p></div></div>`).join('');
            
            document.title = `${p.name} | Hondu Sport`;
        }

        function setModalTalla(btn) { document.querySelectorAll('#m-size-container .talla-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); selectedModalTalla = btn.dataset.talla; }

        function shareProductWhatsApp() {
            const url = window.location.origin + window.location.pathname + '?producto=' + currentModalProduct.id;
            const text = `¡Mira este producto en Hondu Sport!\n*${currentModalProduct.name}*\nPrecio: ${formatPrice(currentModalProduct.price)}\n\nVer producto: ${url}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }

        function shareProductFacebook() {
            const url = window.location.origin + window.location.pathname + '?producto=' + currentModalProduct.id;
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
        }

        function shareProductInstagram() {
            const url = window.location.origin + window.location.pathname + '?producto=' + currentModalProduct.id;
            navigator.clipboard.writeText(url).then(() => showToast("📋 LINK COPIADO — PÉGALO EN INSTAGRAM"));
        }

        // --- Funciones para Guía de Tallas ---
        function openSizeGuide() {
            document.getElementById('size-guide-modal').style.display = 'flex';
        }

        function closeSizeGuide(event) {
            if (event && event.target.id === 'size-guide-modal') {
                document.getElementById('size-guide-modal').style.display = 'none';
            } else if (!event) {
                document.getElementById('size-guide-modal').style.display = 'none';
            }
        }

        function copyProductLink() {
            const url = window.location.origin + window.location.pathname + '?producto=' + currentModalProduct.id;
            navigator.clipboard.writeText(url).then(() => showToast("📋 LINK COPIADO"));
        }

        // --- Social Proof (Toast Aleatorio) ---
        function initSocialProof() {
            const cities = ['Tegucigalpa', 'San Pedro Sula', 'La Ceiba', 'Comayagua', 'Choluteca', 'Roatán', 'Siguatepeque'];
            const toast = document.getElementById('social-proof-toast');
            const textEl = document.getElementById('sp-text');

            setInterval(() => {
                if (products.length > 0) {
                    const randomProduct = products[Math.floor(Math.random() * products.length)];
                    const randomCity = cities[Math.floor(Math.random() * cities.length)];
                    textEl.innerHTML = `Alguien de <b>${randomCity}</b> acaba de comprar<br><span style="color:var(--primary); font-weight:bold;">${randomProduct.name}</span>`;
                    
                    toast.classList.add('active');
                    setTimeout(() => {
                        toast.classList.remove('active');
                    }, 5000); 
                }
            }, 35000); // Muestra cada 35 segundos
        }

        // Iniciar en la carga principal
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initSocialProof, 15000); // Esperar 15s iniciales antes del primer loop
            updateWishlistBadge();
        });

        // --- Funciones Wishlist ---
        function updateWishlistBadge() {
            const badge = document.getElementById('wishlist-badge');
            if (badge) {
                if (hsWishlist.length > 0) {
                    badge.style.display = 'block';
                    badge.innerText = hsWishlist.length;
                } else {
                    badge.style.display = 'none';
                }
            }
        }
        
        function toggleWishlist(event, id) {
            if (event) event.stopPropagation();
            const idx = hsWishlist.indexOf(id);
            if (idx > -1) {
                hsWishlist.splice(idx, 1);
                showToast("🗑️ ELIMINADO DE FAVORITOS");
            } else {
                hsWishlist.push(id);
                showToast("❤️ AÑADIDO A FAVORITOS");
            }
            localStorage.setItem('hs_wishlist', JSON.stringify(hsWishlist));
            updateWishlistBadge();
            
            // Si el grid principal esta visible y tiene este producto, actualizar visualmente
            const btn = document.querySelector(`.wishlist-btn[onclick="toggleWishlist(event, ${id})"]`);
            if (btn) {
                if (idx > -1) {
                    btn.classList.remove('active');
                    btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
                } else {
                    btn.classList.add('active');
                    btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
                }
            }
            
            // Si el drawer está abierto, actualizarlo
            if (document.getElementById('wishlist-drawer').classList.contains('open')) {
                renderWishlistDrawer();
            }
        }
        
        function toggleWishlistDrawer(forceOpen = false) {
            const navMenu = document.getElementById('nav-menu');
            const hamburger = document.getElementById('hamburger-btn');
            if(navMenu) navMenu.classList.remove('active');
            if(hamburger) hamburger.classList.remove('active');
            
            const d = document.getElementById('wishlist-drawer'); 
            const o = document.getElementById('cart-overlay');
            
            if (forceOpen) { 
                d.classList.add('open'); 
                o.classList.add('active'); 
                renderWishlistDrawer();
            } else { 
                if (d.classList.contains('open')) { 
                    d.classList.remove('open'); 
                    o.classList.remove('active'); 
                } else { 
                    document.getElementById('cart-drawer').classList.remove('open');
                    d.classList.add('open'); 
                    o.classList.add('active'); 
                    renderWishlistDrawer();
                } 
            }
        }

        function renderWishlistDrawer() {
            const container = document.getElementById('wishlist-items');
            if (hsWishlist.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding: 2rem; opacity:0.6;"><i class="fa-regular fa-heart" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>Tus favoritos están vacíos</div>`;
                return;
            }
            
            const wished = products.filter(p => hsWishlist.includes(p.id) || hsWishlist.includes(String(p.id)) || hsWishlist.includes(Number(p.id)));
            
            container.innerHTML = wished.map(p => {
                const tallasDisponibles = (window.ALL_FILTROS || []).filter(f => f.tipo === 'talla' && isActivo(f) && (f.categorias || '').split(',').map(c => c.trim().toLowerCase()).includes(p.cat.toLowerCase())).map(f => f.valor);
                const tallaDefault = tallasDisponibles[0] || "";
                
                return `
                <div class="cart-item">
                    <img src="${p.imgs?.[0] || ''}" alt="${p.name}" class="cart-item-img" onclick="toggleWishlistDrawer(); openProductPage(${p.id})">
                    <div class="cart-item-info">
                        <div class="cart-item-title" onclick="toggleWishlistDrawer(); openProductPage(${p.id})">${p.name}</div>
                        <div class="cart-item-price">${formatPrice(p.price)}</div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <button onclick="addToCart(${p.id}, '${tallaDefault}', 'Sin personalización'); showToast('✅ AGREGADO AL CARRITO');" style="background: var(--primary); color: white; border: none; padding: 5px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; cursor: pointer;">
                                + CARRITO
                            </button>
                            <button onclick="toggleWishlist(event, ${p.id})" style="background: transparent; color: #E74C3C; border: 1px solid #E74C3C; padding: 5px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; cursor: pointer;">
                                ELIMINAR
                            </button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        // --- Efecto Zoom Modal ---
        function initZoomEffect() {
            const container = document.getElementById('img-zoom-container');
            const img = document.getElementById('modal-img-main');

            container.addEventListener('mousemove', (e) => {
                const rect = container.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const xPercent = (x / rect.width) * 100;
                const yPercent = (y / rect.height) * 100;
                
                img.style.transformOrigin = `${xPercent}% ${yPercent}%`;
                img.style.transform = "scale(2)";
            });

            container.addEventListener('mouseleave', () => {
                img.style.transformOrigin = "center center";
                img.style.transform = "scale(1)";
            });
        }
        
        function goToHome() { 
            window.location.href = window.location.pathname; 
        }
        function openCheckoutModal() {
          if (cart.length > 0) {
            document.getElementById('checkout-modal').style.display = 'flex';
            const infoDiv = document.getElementById('delivery-info');
            if (!infoDiv.innerHTML.trim() && SELECTED_ENVIO) selectShipping(SELECTED_ENVIO.id);
            else updateCheckoutPreview();
          }
        }
        function closeCheckoutModal() { document.getElementById('checkout-modal').style.display = 'none'; }
        function processCheckout(e) { e.preventDefault(); window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${getOrderText()}`, '_blank'); }
        
        function setupEventListeners() {
            const nav = document.getElementById('main-nav');
            const hbBtn = document.getElementById('hamburger-btn');
            
            const searchOverlay = document.getElementById('search-overlay');
            if (searchOverlay) searchOverlay.addEventListener('click', closeMegaSearch);
            const megaInput = document.getElementById('mega-search-input');
            if (megaInput) megaInput.addEventListener('input', executeMegaSearch);
            document.addEventListener('click', (e) => { 
                if (!e.target.closest('.search-container')) document.getElementById('recent-searches').style.display = 'none'; 
                if (document.getElementById('sidebar').classList.contains('active') && !e.target.closest('#sidebar') && !e.target.closest('#mobile-filter-btn')) document.getElementById('sidebar').classList.remove('active');
            });
            document.getElementById('price-range').addEventListener('input', (e) => { document.getElementById('price-val').innerText = formatPrice(parseInt(e.target.value)); applyFilters(); });
            hbBtn.onclick = () => {
                if (window.innerWidth <= 768) {
                    hbBtn.classList.toggle('active');
                    const drawer = document.getElementById('mobile-nav-drawer');
                    const overlay = document.getElementById('cart-overlay');
                    if (drawer.classList.contains('open')) {
                        closeMobileNav();
                    } else {
                        drawer.classList.add('open');
                        overlay.classList.add('active');
                    }
                } else {
                    hbBtn.classList.toggle('active');
                    document.getElementById('nav-menu').classList.toggle('active');
                }
            };
            document.getElementById('mobile-filter-btn').onclick = () => document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('cart-overlay').onclick = () => {
                if (document.getElementById('cart-drawer').classList.contains('open')) toggleCart();
                if (document.getElementById('wishlist-drawer').classList.contains('open')) toggleWishlistDrawer();
                if (document.getElementById('mobile-nav-drawer').classList.contains('open')) closeMobileNav();
            };
            document.getElementById('exit-overlay').onclick = closeExitPopup;
            window.onscroll = () => {
                document.getElementById('btn-top').style.display = window.scrollY > 400 ? 'flex' : 'none';
                if (window.scrollY > 50) nav.classList.add('scrolled'); else nav.classList.remove('scrolled');
                const hint = document.querySelector('.scroll-hint');
                if (hint) hint.classList.toggle('hidden', window.scrollY > 100);
            };
        }

        function changeGallery(el, url) { const m = document.getElementById('modal-img-main'); m.style.opacity = '0'; setTimeout(() => { m.src = url; m.style.opacity = '1'; document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active')); el.classList.add('active'); }, 300); }
        function toggleCart(forceOpen = false) { 
            document.getElementById('nav-menu').classList.remove('active');
            document.getElementById('hamburger-btn').classList.remove('active');
            const d = document.getElementById('cart-drawer'); const o = document.getElementById('cart-overlay');
            if (forceOpen) { d.classList.add('open'); o.classList.add('active'); }
            else { if (d.classList.contains('open')) { d.classList.remove('open'); o.classList.remove('active'); } else { d.classList.add('open'); o.classList.add('active'); } }
        }
        function closeMobileNav() {
            document.getElementById('mobile-nav-drawer').classList.remove('open');
            document.getElementById('hamburger-btn').classList.remove('active');
            document.getElementById('cart-overlay').classList.remove('active');
        }

        function stickyAddToCart() {
            if (!currentModalProduct) return;
            const talla = selectedModalTalla;
            const customInput = document.getElementById('m-custom');
            const custom = customInput ? customInput.value || 'Sin personalización' : 'Sin personalización';
            addToCart(currentModalProduct.id, talla, custom);
            showToast('✅ PRODUCTO AGREGADO');
        }

        function closeExitPopup() { document.getElementById('exit-popup').classList.remove('active'); document.getElementById('exit-overlay').classList.remove('active'); }
        function showToast(t) { const el = document.getElementById('toast'); el.innerText=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'), 2500); }
        function addToCart(id, size, custom) { const p = products.find(x=>x.id===id); const ex = cart.find(i=>i.id===id && i.size===size && i.custom===custom); if(ex) ex.qty++; else cart.push({...p, qty:1, size, custom}); saveAndUpdate(); animateCartBadge(); }
        function animateCartBadge() { const b = document.getElementById('cart-badge'); b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); }
        function initHero() {
            // Scroll hint
            const heroEl = document.querySelector('.hero');
            if (heroEl && !heroEl.querySelector('.scroll-hint')) {
                const hint = document.createElement('div');
                hint.className = 'scroll-hint';
                hint.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
                heroEl.appendChild(hint);
            }

            let c = 0; const hero = document.querySelector('.hero'); const s = document.querySelectorAll('.slide'); 
            if(s.length > 1) { 
                const indicatorsDiv = document.createElement('div'); indicatorsDiv.className = 'slide-indicators';
                s.forEach((_, i) => { const dot = document.createElement('span'); dot.className = `indicator ${i === 0 ? 'active' : ''}`; dot.onclick = () => { s[c].classList.remove('active'); c = i; s[c].classList.add('active'); updateIndicators(c); }; indicatorsDiv.appendChild(dot); });
                hero.appendChild(indicatorsDiv);
                function updateIndicators(index) { document.querySelectorAll('.indicator').forEach((dot, i) => dot.classList.toggle('active', i === index)); }
                setInterval(() => { s[c].classList.remove('active'); c = (c+1)%s.length; s[c].classList.add('active'); updateIndicators(c); }, 5000); 
            } 
        }
        function toggleTheme() { 
            const newTheme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.body.setAttribute('data-theme', newTheme);
            document.getElementById('theme-toggle-icon').className = newTheme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        }
        function checkExitIntent() {
          let t = false;
          document.addEventListener('mouseleave', (e) => {
            if (window.CUPONES_POPUP_ACTIVO === false) return;
            if (e.clientY < 0 && !t && window.innerWidth > 768) {
              document.getElementById('exit-popup').classList.add('active');
              document.getElementById('exit-overlay').classList.add('active');
              t = true;
            }
          });
        }
        function changeQty(idx, d) { cart[idx].qty += d; if(cart[idx].qty<=0) cart.splice(idx,1); saveAndUpdate(); }
        function copyToClipboard() { const text = decodeURIComponent(getOrderText()); navigator.clipboard.writeText(text).then(() => showToast("📋 PEDIDO COPIADO")); }

        function openMegaSearch() {
            document.getElementById('search-overlay').classList.add('active');
            setTimeout(() => document.getElementById('mega-search-input').focus(), 100);
        }
        function closeMegaSearch() {
            document.getElementById('search-overlay').classList.remove('active');
            document.getElementById('mega-search-input').value = '';
            document.getElementById('mega-search-results').innerHTML = '';
            document.getElementById('search-suggestions').style.display = 'block';
        }
        function setMegaSearch(val) {
            document.getElementById('mega-search-input').value = val;
            executeMegaSearch();
        }
        function executeMegaSearch() {
            const query = document.getElementById('mega-search-input').value.toLowerCase();
            const resultsContainer = document.getElementById('mega-search-results');
            const suggestionsContainer = document.getElementById('search-suggestions');
            
            if (query.trim() === '') {
                resultsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'block';
                return;
            }
            suggestionsContainer.style.display = 'none';
            
            let filtered = [];
            if (typeof Fuse !== 'undefined') {
                const fuse = new Fuse(products, { keys: ['name', 'cat', 'subcat', 'desc'], threshold: 0.4 });
                filtered = fuse.search(query).map(r => r.item);
            } else {
                filtered = products.filter(p => p.name.toLowerCase().includes(query));
            }
            
            if (filtered.length === 0) {
                resultsContainer.innerHTML = '<p style="text-align:center; opacity:0.6; grid-column:1/-1;">No se encontraron resultados para "' + query + '"</p>';
                return;
            }
            
            resultsContainer.innerHTML = filtered.slice(0, 8).map(p => `
                <div class="search-result-item" onclick="closeMegaSearch(); document.getElementById('tienda').scrollIntoView({behavior:'smooth'}); setTimeout(() => openProductPage(${p.id}), 300)">
                    <img src="${p.imgs?.[0] || ''}" class="search-result-img" alt="${p.name}">
                    <div class="search-result-title">${p.name}</div>
                    <div class="search-result-price">${formatPrice(p.price)}</div>
                </div>
            `).join('');
        }

        document.addEventListener('DOMContentLoaded', () => {
            renderShell();
            loadData();
            setupEventListeners();
            checkExitIntent();
        });

        window.addEventListener('popstate', (event) => {
            const urlParams = new URLSearchParams(window.location.search);
            const productoParam = urlParams.get('producto');
            if (productoParam) {
                openProductPage(parseFloat(productoParam));
            } else {
                window.location.reload();
            }
        });
