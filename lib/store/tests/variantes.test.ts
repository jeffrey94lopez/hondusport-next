import { describe, it, expect } from 'vitest'
import {
  precioEfectivo, imagenesEfectivas, toStoreVariantes, stockEfectivo, estaAgotado, precioDesde,
  validarCompra, traducirErrorPedido, tieneEjesTemporada, versionesDisponibles,
  temporadasDisponibles, tallasDisponibles, resolverVariante,
} from '../variantes'
import type { ProductoVariante } from '@/types'

function variante(over: Partial<ProductoVariante>): ProductoVariante {
  return {
    id: 'v1', producto_id: 'p1', nombre: 'M', sku: null, precio: null,
    stock: null, costo: null, precio_revendedor: null, imagenes: null, activo: true, orden: 0, created_at: '', updated_at: '',
    version: null, temporada_id: null, ...over,
  }
}

describe('precioEfectivo', () => {
  it('usa el precio propio si existe', () => expect(precioEfectivo(100, 150)).toBe(150))
  it('hereda el del padre si es null', () => expect(precioEfectivo(100, null)).toBe(100))
})

describe('imagenesEfectivas', () => {
  const padre = ['padre1.jpg', 'padre2.jpg']
  it('usa las propias de la variante si no está vacío', () => {
    expect(imagenesEfectivas(padre, ['v1.jpg'])).toEqual(['v1.jpg'])
  })
  it('hereda las del padre si la variante viene null', () => expect(imagenesEfectivas(padre, null)).toEqual(padre))
  it('hereda las del padre si la variante viene undefined', () => expect(imagenesEfectivas(padre, undefined)).toEqual(padre))
  it('hereda las del padre si la variante viene vacía', () => expect(imagenesEfectivas(padre, [])).toEqual(padre))
  it('el padre sin imágenes propias se queda vacío', () => expect(imagenesEfectivas([], null)).toEqual([]))
})

describe('toStoreVariantes', () => {
  it('excluye inactivas y ordena por orden y nombre', () => {
    const out = toStoreVariantes(100, [], [
      variante({ id: 'b', nombre: 'B', orden: 1 }),
      variante({ id: 'x', nombre: 'X', activo: false }),
      variante({ id: 'a', nombre: 'A', orden: 0 }),
      variante({ id: 'a2', nombre: 'A2', orden: 1 }),
    ])
    expect(out.map(v => v.id)).toEqual(['a', 'b', 'a2'])
  })
  it('calcula precioEfectivo y agotada', () => {
    const out = toStoreVariantes(100, [], [
      variante({ id: 'v1', precio: 150, stock: 0 }),
      variante({ id: 'v2', precio: null, stock: null }),
    ])
    expect(out[0]).toMatchObject({ precioEfectivo: 150, agotada: true })
    expect(out[1]).toMatchObject({ precioEfectivo: 100, agotada: false })
  })
  it('hereda las imágenes del producto cuando la variante no tiene propias', () => {
    const out = toStoreVariantes(100, ['padre.jpg'], [variante({ id: 'v1', imagenes: null })])
    expect(out[0].imagenes).toEqual(['padre.jpg'])
  })
  it('usa las imágenes propias de la variante cuando las tiene', () => {
    const out = toStoreVariantes(100, ['padre.jpg'], [variante({ id: 'v1', imagenes: ['propia.jpg'] })])
    expect(out[0].imagenes).toEqual(['propia.jpg'])
  })
})

describe('toStoreVariantes: ejes version/temporada', () => {
  it('copia version y temporada_id a la variante de tienda', () => {
    const out = toStoreVariantes(100, [], [
      variante({ id: 'v1', version: 'fan', temporada_id: 'temp-24-25' }),
    ])
    expect(out[0].version).toBe('fan')
  })
  it('resuelve temporada contra el array de categorias tipo temporada', () => {
    const temporadas = [
      { id: 'temp-24-25', valor: '24/25', orden: 2 },
      { id: 'temp-23-24', valor: '23/24', orden: 1 },
    ]
    const out = toStoreVariantes(100, [], [
      variante({ id: 'v1', version: 'fan', temporada_id: 'temp-24-25' }),
    ], temporadas)
    expect(out[0].temporada).toEqual({ id: 'temp-24-25', etiqueta: '24/25', orden: 2 })
  })
  it('temporada es null cuando temporada_id es null', () => {
    const out = toStoreVariantes(100, [], [variante({ id: 'v1' })])
    expect(out[0].temporada).toBeNull()
  })
})

describe('stockEfectivo', () => {
  it('sin variantes devuelve el stock del padre', () => {
    expect(stockEfectivo(7, [])).toBe(7)
    expect(stockEfectivo(null, [])).toBeNull()
  })
  it('suma las variantes e ignora el stock del padre', () => {
    expect(stockEfectivo(99, [{ stock: 2 }, { stock: 3 }])).toBe(5)
  })
  it('una variante ilimitada hace ilimitado el total', () => {
    expect(stockEfectivo(0, [{ stock: 2 }, { stock: null }])).toBeNull()
  })
})

describe('estaAgotado', () => {
  it('true solo cuando el stock efectivo es 0', () => {
    expect(estaAgotado(0, [])).toBe(true)
    expect(estaAgotado(null, [])).toBe(false)
    expect(estaAgotado(9, [{ stock: 0 }, { stock: 0 }])).toBe(true)
  })
})

describe('precioDesde', () => {
  it('sin variantes: precio del padre, no varía', () =>
    expect(precioDesde(100, [])).toEqual({ min: 100, varia: false }))
  it('con precios distintos: mínimo y varia=true', () =>
    expect(precioDesde(100, [{ precioEfectivo: 90 }, { precioEfectivo: 120 }])).toEqual({ min: 90, varia: true }))
  it('con precios iguales: varia=false', () =>
    expect(precioDesde(100, [{ precioEfectivo: 100 }, { precioEfectivo: 100 }])).toEqual({ min: 100, varia: false }))
})

describe('validarCompra', () => {
  const prod = { id: 'p1', nombre: 'Camisa', activo: true }
  it('producto inactivo se rechaza', () => {
    const r = validarCompra({ ...prod, activo: false }, [], undefined)
    expect(r.ok).toBe(false)
  })
  it('canal mostrador se rechaza', () => {
    const r = validarCompra({ ...prod, canal: 'mostrador' }, [], undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('"Camisa" ya no está disponible')
  })
  it('canal tienda pasa', () => {
    expect(validarCompra({ ...prod, canal: 'tienda' }, [], undefined)).toEqual({ ok: true, variante: null })
  })
  it('canal ambas pasa', () => {
    expect(validarCompra({ ...prod, canal: 'ambas' }, [], undefined)).toEqual({ ok: true, variante: null })
  })
  it('canal undefined pasa (tolerante, default ambas)', () => {
    expect(validarCompra({ ...prod, canal: undefined }, [], undefined)).toEqual({ ok: true, variante: null })
  })
  it('plano sin variante pasa con variante null', () => {
    expect(validarCompra(prod, [], undefined)).toEqual({ ok: true, variante: null })
  })
  it('producto con variantes exige varianteId', () => {
    const r = validarCompra(prod, [variante({ id: 'v1' })], undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('Camisa')
  })
  it('varianteId ajeno o inexistente se rechaza', () => {
    const ajena = variante({ id: 'v9', producto_id: 'OTRO' })
    expect(validarCompra(prod, [ajena], 'v9').ok).toBe(false)
    expect(validarCompra(prod, [variante({ id: 'v1' })], 'no-existe').ok).toBe(false)
  })
  it('variante válida se devuelve', () => {
    const v = variante({ id: 'v1', producto_id: 'p1' })
    expect(validarCompra(prod, [v], 'v1')).toEqual({ ok: true, variante: v })
  })
})

describe('validarCompra: producto fusionado-fuera (Review Focus)', () => {
  it('rechaza un carrito con varianteId de un producto ya desactivado', () => {
    const producto = { id: 'loser-1', nombre: 'Real Madrid Local (viejo)', activo: false }
    const result = validarCompra(producto, [], 'cualquier-variante-id')
    expect(result).toEqual({ ok: false, motivo: `"${producto.nombre}" ya no está disponible` })
  })
})

describe('tieneEjesTemporada', () => {
  it('false si ninguna variante trae los ejes nuevos', () =>
    expect(tieneEjesTemporada([variante({ version: null, temporada_id: null })])).toBe(false))
  it('true si alguna variante trae version o temporada_id', () =>
    expect(tieneEjesTemporada([variante({ version: 'fan', temporada_id: 'x' })])).toBe(true))
})

describe('versionesDisponibles', () => {
  it('devuelve los valores únicos presentes', () => {
    const out = versionesDisponibles([
      variante({ version: 'fan' }), variante({ version: 'jugador' }), variante({ version: 'fan' }),
    ])
    expect(out).toEqual(['fan', 'jugador'])
  })
})

const temporadasCat = [
  { id: 't24', valor: '24/25', orden: 2 },
  { id: 't23', valor: '23/24', orden: 1 },
]

const hijasVersionTemporada: ProductoVariante[] = [
  variante({ id: 'f24-m', nombre: 'M', version: 'fan', temporada_id: 't24' }),
  variante({ id: 'f24-l', nombre: 'L', version: 'fan', temporada_id: 't24' }),
  variante({ id: 'f23-s', nombre: 'S', version: 'fan', temporada_id: 't23' }),
  variante({ id: 'j24-m', nombre: 'M', version: 'jugador', temporada_id: 't24' }),
]

const variantesTienda = toStoreVariantes(100, [], hijasVersionTemporada, temporadasCat)

describe('temporadasDisponibles', () => {
  it('filtra por version, deduplica y ordena por categorias.orden', () => {
    const out = temporadasDisponibles(variantesTienda, 'fan')
    expect(out).toEqual([
      { id: 't23', etiqueta: '23/24', orden: 1 },
      { id: 't24', etiqueta: '24/25', orden: 2 },
    ])
  })
})

describe('tallasDisponibles', () => {
  it('solo tallas de la combinación version+temporada exacta', () => {
    const out = tallasDisponibles(variantesTienda, 'fan', 't24')
    expect(out).toEqual(['M', 'L'])
    expect(out).not.toContain('S')
  })
})

describe('resolverVariante', () => {
  it('encuentra la variante exacta', () => {
    const v = resolverVariante(variantesTienda, 'fan', 't24', 'M')
    expect(v?.id).toBe('f24-m')
  })
  it('devuelve undefined si la combinación no existe', () => {
    expect(resolverVariante(variantesTienda, 'fan', 't24', 'XL')).toBeUndefined()
    expect(resolverVariante(variantesTienda, 'jugador', 't23', 'M')).toBeUndefined()
  })
})

describe('traducirErrorPedido', () => {
  it('stock insuficiente con unidades', () =>
    expect(traducirErrorPedido('HS_STOCK|Camisa (M)|3')).toBe('Solo quedan 3 unidades de "Camisa (M)"'))
  it('stock cero = agotado', () =>
    expect(traducirErrorPedido('HS_STOCK|Camisa|0')).toBe('"Camisa" está agotado'))
  it('requiere variante', () =>
    expect(traducirErrorPedido('HS_REQUIERE_VARIANTE|Camisa')).toBe('Elige una variante de "Camisa"'))
  it('variante inválida', () =>
    expect(traducirErrorPedido('HS_VARIANTE|Camisa')).toBe('La variante seleccionada de "Camisa" ya no está disponible'))
  it('producto inactivo', () =>
    expect(traducirErrorPedido('HS_INACTIVO|Camisa')).toBe('"Camisa" ya no está disponible'))
  it('pedido inexistente', () =>
    expect(traducirErrorPedido('HS_PEDIDO|abc-123')).toBe('El pedido ya no existe'))
  it('desconocido devuelve null', () => {
    expect(traducirErrorPedido('otra cosa')).toBeNull()
    expect(traducirErrorPedido(undefined)).toBeNull()
  })
})
