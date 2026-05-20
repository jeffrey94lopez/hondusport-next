document.addEventListener('DOMContentLoaded', function(){
  const page = location.pathname.split('/').pop().replace('.html','').replace('.php','') || 'productos';
  const nav = [
    { id:'productos',  icon:'fa-box',    label:'Productos' },
    { id:'filtros',    icon:'fa-tags',   label:'Categorías & Tallas' },
    { id:'envios',     icon:'fa-truck',  label:'Envíos' },
    { id:'cupones',    icon:'fa-ticket', label:'Cupones' },
    { id:'banners',    icon:'fa-image',  label:'Banners' }
  ];

  // Sidebar element
  const sidebar = document.createElement('aside');
  sidebar.id = 'hs-sidebar';
  sidebar.innerHTML = `
    <div class="hs-brand">
      <span class="hs-brand-name">HONDUSPORT</span>
      <span class="hs-brand-sub">ADMIN</span>
    </div>
    <nav class="hs-nav">
      ${nav.map(n=>`
        <a href="${n.id}.html" class="hs-nav-item${page===n.id?' active':''}">
          <i class="fa-solid ${n.icon}"></i>
          <span>${n.label}</span>
        </a>`).join('')}
    </nav>
    <div class="hs-nav-footer">
      <a href="logout.php" class="hs-nav-item">
        <i class="fa-solid fa-right-from-bracket"></i>
        <span>Salir</span>
      </a>
    </div>`;

  // Wrap existing body content in a main area
  const wrap = document.createElement('div');
  wrap.id = 'hs-shell';

  const main = document.createElement('main');
  main.id = 'hs-main';

  // Move all existing body children into main
  while (document.body.firstChild) {
    main.appendChild(document.body.firstChild);
  }

  wrap.appendChild(sidebar);
  wrap.appendChild(main);
  document.body.appendChild(wrap);

  // Inject shell styles
  const style = document.createElement('style');
  style.textContent = `
    body { padding: 0 !important; margin: 0; background: #0d0d0d; }
    #hs-shell { display: flex; min-height: 100vh; }

    #hs-sidebar {
      width: 220px;
      min-width: 220px;
      background: #141414;
      border-right: 1px solid #252525;
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      flex-shrink: 0;
    }
    .hs-brand {
      padding: 1.4rem 1.5rem 1.2rem;
      border-bottom: 1px solid #252525;
    }
    .hs-brand-name {
      display: block;
      color: #C9A84C;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 3px;
    }
    .hs-brand-sub {
      display: block;
      font-size: .65rem;
      letter-spacing: 2px;
      color: rgba(255,255,255,.3);
      margin-top: 3px;
    }
    .hs-nav { flex: 1; padding: .75rem 0; }
    .hs-nav-item {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: .72rem 1.5rem;
      color: rgba(255,255,255,.5);
      text-decoration: none;
      font-size: .85rem;
      font-weight: 600;
      letter-spacing: .3px;
      transition: color .15s, background .15s;
      border: none;
      border-left: 2px solid transparent;
      background: none;
      width: 100%;
      cursor: pointer;
      box-sizing: border-box;
      font-family: inherit;
    }
    .hs-nav-item i { width: 17px; text-align: center; font-size: .9rem; flex-shrink: 0; }
    .hs-nav-item:hover { color: #C9A84C; background: rgba(201,168,76,.07); }
    .hs-nav-item.active {
      color: #C9A84C;
      background: rgba(201,168,76,.1);
      border-left-color: #C9A84C;
    }
    .hs-nav-footer {
      padding: .75rem 0;
      border-top: 1px solid #252525;
    }
    #hs-main {
      flex: 1;
      min-width: 0;
      padding: 1.5rem;
      overflow-y: auto;
    }

    /* Mobile: collapse sidebar to icons only */
    @media (max-width: 768px) {
      #hs-sidebar { width: 54px; min-width: 54px; }
      .hs-brand-name, .hs-brand-sub, .hs-nav-item span { display: none; }
      .hs-nav-item { justify-content: center; padding: .85rem; }
      .hs-brand { padding: 1rem .5rem; }
      #hs-main { padding: 1rem; }
    }
  `;
  document.head.appendChild(style);
});
