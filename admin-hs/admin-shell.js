document.addEventListener('DOMContentLoaded', function () {
  var pages = [
    { id: 'productos', icon: '📦', label: 'Productos' },
    { id: 'filtros',   icon: '🏷️', label: 'Categorías' },
    { id: 'envios',    icon: '🚚', label: 'Envíos' },
    { id: 'cupones',   icon: '🎟️', label: 'Cupones' },
    { id: 'banners',   icon: '🖼️', label: 'Banners' }
  ];

  var current = location.pathname.split('/').pop().replace('.html', '').replace('.php', '') || 'productos';

  var nav = document.createElement('nav');
  nav.id = 'hs-topnav';
  nav.innerHTML =
    '<a href="productos.html" class="hs-brand">HONDUSPORT <span>ADMIN</span></a>' +
    '<div class="hs-links">' +
    pages.map(function (p) {
      return '<a href="' + p.id + '.html" class="hs-link' + (current === p.id ? ' active' : '') + '">' +
        '<span class="hs-icon">' + p.icon + '</span>' +
        '<span class="hs-label">' + p.label + '</span>' +
        '</a>';
    }).join('') +
    '</div>' +
    '<a href="logout.php" class="hs-logout" title="Salir">⏻</a>';

  document.body.insertBefore(nav, document.body.firstChild);

  /* Styles */
  var css = document.createElement('style');
  css.textContent = [
    '#hs-topnav{display:flex;align-items:center;gap:0;background:#141414;border-bottom:1px solid #252525;',
    'padding:0 1.25rem;height:52px;position:sticky;top:0;z-index:900;',
    'font-family:Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);}',

    '.hs-brand{color:#C9A84C;font-size:.85rem;font-weight:700;letter-spacing:2.5px;text-decoration:none;',
    'white-space:nowrap;margin-right:1.5rem;}',
    '.hs-brand span{font-size:.65rem;opacity:.45;letter-spacing:2px;margin-left:4px;vertical-align:middle;}',

    '.hs-links{display:flex;align-items:center;gap:2px;flex:1;overflow-x:auto;}',
    '.hs-link{display:flex;align-items:center;gap:6px;padding:.4rem .85rem;color:rgba(255,255,255,.5);',
    'text-decoration:none;font-size:.78rem;font-weight:600;border-radius:5px;',
    'white-space:nowrap;transition:color .15s,background .15s;}',
    '.hs-link:hover{color:#C9A84C;background:rgba(201,168,76,.08);}',
    '.hs-link.active{color:#C9A84C;background:rgba(201,168,76,.12);}',
    '.hs-icon{font-size:.85rem;}',

    '.hs-logout{margin-left:auto;color:rgba(255,255,255,.35);text-decoration:none;',
    'font-size:1.1rem;padding:.3rem .5rem;border-radius:4px;transition:.15s;flex-shrink:0;}',
    '.hs-logout:hover{color:#c0392b;}',

    'body{padding-top:0!important;}',

    '@media(max-width:600px){',
    '.hs-brand{margin-right:.5rem;}',
    '.hs-label{display:none;}',
    '.hs-link{padding:.4rem .6rem;}',
    '}'
  ].join('');
  document.head.appendChild(css);
});
