import { describe, it, expect } from 'vitest'
import { ordenarVitrina, DIAS_NUEVO } from '../vitrina'
import type { StoreProducto } from '@/types/store'

const AHORA = new Date('2026-08-31T12:00:00.000Z')

function hace(dias: number): string {
  return new Date(AHORA.getTime() - dias * 86_400_000).toISOString()
}

function prod(over: Partial<StoreProducto> = {}): StoreProducto {
  return {
    id: 'p', nombre: 'Producto', slug: 'producto', descripcion: '',
    precio: 500, precioOriginal: null, cat: 'Camisetas', catId: 'c1',
    subcat: null, subcatId: null, genero: null, badge: null, tallas: [],
    imagenes: [], stock: 10, rating: 5, ofertaFin: null,
    personalizable: false, createdAt: hace(400), variantes: [],
    ...over,
  }
}

const ids = (ps: StoreProducto[]) => ps.map(p => p.id)

describe('ordenarVitrina — reparto en bandas', () => {
  it('los agotados van al final, despues de todo lo disponible', () => {
    const productos = [
      prod({ id: 'agotado', stock: 0 }),
      prod({ id: 'disponible', stock: 3 }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['disponible', 'agotado'])
  })

  it('stock null es ilimitado, no agotado', () => {
    const productos = [
      prod({ id: 'agotado', stock: 0 }),
      prod({ id: 'ilimitado', stock: null }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['ilimitado', 'agotado'])
  })

  it('un producto con todas sus variantes agotadas cuenta como agotado', () => {
    const productos = [
      prod({
        id: 'todasAgotadas', stock: null, variantes: [
          { id: 'v1', nombre: 'M', precio: null, precioEfectivo: 500, stock: 0, agotada: true },
        ],
      }),
      prod({ id: 'conStock', stock: null, variantes: [
        { id: 'v2', nombre: 'L', precio: null, precioEfectivo: 500, stock: 4, agotada: false },
      ] }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['conStock', 'todasAgotadas'])
  })

  it('respeta el orden de las seis bandas', () => {
    const productos = [
      prod({ id: 'b5_resto' }),
      prod({ id: 'b6_agotado', stock: 0 }),
      prod({ id: 'b3_nuevo', createdAt: hace(5) }),
      prod({ id: 'b1_badge', badge: 'Más Vendido' }),
      prod({ id: 'b4_descuento', precio: 400, precioOriginal: 800 }),
      prod({ id: 'b2_ventas' }),
    ]
    const ventas = { b2_ventas: 1 }
    expect(ids(ordenarVitrina(productos, ventas, AHORA))).toEqual([
      'b1_badge', 'b2_ventas', 'b3_nuevo', 'b4_descuento', 'b5_resto', 'b6_agotado',
    ])
  })

  it('las bandas son excluyentes: gana la primera que acepta', () => {
    // Tiene badge Y ventas Y es nuevo Y tiene descuento: manda la banda 1.
    const todoALaVez = prod({
      id: 'todo', badge: 'Oferta', createdAt: hace(1), precio: 400, precioOriginal: 800,
    })
    const soloVentas = prod({ id: 'ventas' })
    const orden = ids(ordenarVitrina([soloVentas, todoALaVez], { ventas: 1, todo: 99 }, AHORA))
    expect(orden).toEqual(['todo', 'ventas'])
  })
})

describe('ordenarVitrina — orden dentro de cada banda', () => {
  it('banda 2: menor posicion primero (mas vendido arriba)', () => {
    const productos = [prod({ id: 'tercero' }), prod({ id: 'primero' }), prod({ id: 'segundo' })]
    const ventas = { primero: 1, segundo: 2, tercero: 3 }
    expect(ids(ordenarVitrina(productos, ventas, AHORA))).toEqual(['primero', 'segundo', 'tercero'])
  })

  it('banda 3: el mas reciente primero', () => {
    const productos = [
      prod({ id: 'viejo', createdAt: hace(20) }),
      prod({ id: 'recien', createdAt: hace(1) }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['recien', 'viejo'])
  })

  it(`banda 3: a los ${DIAS_NUEVO} dias ya no es nuevo y cae a la banda 5`, () => {
    const productos = [
      prod({ id: 'aunNuevo', nombre: 'Zeta', createdAt: hace(DIAS_NUEVO - 1) }),
      prod({ id: 'yaNo', nombre: 'Alfa', createdAt: hace(DIAS_NUEVO + 1) }),
      // Limite exacto: esNuevo usa "<" estricto, asi que a DIAS_NUEVO dias ya
      // no cuenta como nuevo y cae a la banda 5, junto con 'yaNo'.
      prod({ id: 'limite', nombre: 'Medio', createdAt: hace(DIAS_NUEVO) }),
    ]
    // Si ambos estuvieran en la banda 5, 'Alfa' iria primero por nombre.
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['aunNuevo', 'yaNo', 'limite'])
  })

  it('banda 4: mayor porcentaje de descuento primero', () => {
    const productos = [
      prod({ id: 'baja', precio: 900, precioOriginal: 1000 }),
      prod({ id: 'alta', precio: 300, precioOriginal: 1000 }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['alta', 'baja'])
  })

  it('banda 5: alfabetico por nombre', () => {
    const productos = [
      prod({ id: 'c', nombre: 'Calceta' }),
      prod({ id: 'a', nombre: 'Abrigo' }),
      prod({ id: 'b', nombre: 'Bermuda' }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['a', 'b', 'c'])
  })

  it('banda 6: el agotado que mas se vendia encabeza su banda', () => {
    const productos = [
      prod({ id: 'pocoVendido', stock: 0 }),
      prod({ id: 'muyVendido', stock: 0 }),
    ]
    expect(ids(ordenarVitrina(productos, { muyVendido: 1, pocoVendido: 8 }, AHORA)))
      .toEqual(['muyVendido', 'pocoVendido'])
  })

  it('banda 1: sin ventas va al final de su banda, no al principio', () => {
    const productos = [
      prod({ id: 'sinVentas', nombre: 'Aaa', badge: 'Oferta' }),
      prod({ id: 'conVentas', nombre: 'Zzz', badge: 'Oferta' }),
    ]
    expect(ids(ordenarVitrina(productos, { conVentas: 5 }, AHORA)))
      .toEqual(['conVentas', 'sinVentas'])
  })
})

describe('ordenarVitrina — es una funcion total', () => {
  it('desempata por nombre cuando todo lo demas empata', () => {
    const productos = [
      prod({ id: 'z', nombre: 'Zapato' }),
      prod({ id: 'a', nombre: 'Abrigo' }),
    ]
    expect(ids(ordenarVitrina(productos, {}, AHORA))).toEqual(['a', 'z'])
  })

  it('dos productos con el mismo nombre no dependen del orden de llegada', () => {
    // nombre repetido (no es unico en el esquema; solo slug lo es), misma
    // banda y misma posicion de ventas: el unico desempate valido es el id.
    const uno = prod({ id: 'uno', nombre: 'Repetido' })
    const dos = prod({ id: 'dos', nombre: 'Repetido' })
    const a = ids(ordenarVitrina([uno, dos], {}, AHORA))
    const b = ids(ordenarVitrina([dos, uno], {}, AHORA))
    expect(a).toEqual(b)
  })

  it('mismas entradas en otro orden dan el MISMO resultado', () => {
    // Es el defecto que esta fase viene a eliminar: sin desempate, el orden de
    // llegada decidia, y la consulta no lo garantiza.
    const base = [
      prod({ id: '1', nombre: 'Uno' }), prod({ id: '2', nombre: 'Dos' }),
      prod({ id: '3', nombre: 'Tres' }), prod({ id: '4', nombre: 'Cuatro', stock: 0 }),
    ]
    const a = ids(ordenarVitrina(base, {}, AHORA))
    const b = ids(ordenarVitrina([...base].reverse(), {}, AHORA))
    expect(a).toEqual(b)
  })

  it('no muta el arreglo de entrada', () => {
    const productos = [prod({ id: 'b', nombre: 'Bbb' }), prod({ id: 'a', nombre: 'Aaa' })]
    const copia = [...productos]
    ordenarVitrina(productos, {}, AHORA)
    expect(productos).toEqual(copia)
  })

  it('lista vacia devuelve lista vacia', () => {
    expect(ordenarVitrina([], {}, AHORA)).toEqual([])
  })
})
