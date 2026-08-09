# Facturas y Notas de Crédito — Documentación fiscal del sistema POS (Hondusport)

**Destinatario:** contador de la empresa / explicación ante el SAR.
**Fecha:** 2026-08-09.
**Alcance:** cómo el sistema de punto de venta emite y controla los documentos
fiscales (facturas), los comprobantes internos y las notas de crédito por
devolución, y cómo trata el Impuesto Sobre Ventas (ISV) en cada caso.

> **Salvedad.** Este documento describe el diseño y los controles del sistema y
> el criterio contable/tributario general del ISV aplicado. No sustituye la
> asesoría de un profesional colegiado ni el texto del reglamento. La regla
> definitiva la fija el SAR y la práctica del contador de la empresa.

---

## 1. Marco fiscal

- **Régimen:** facturación bajo el **Régimen de Facturación del SAR**
  (Acuerdo 481-2017), modalidad **autoimpresor**.
- **CAI (Código de Autorización de Impresión):** cada tipo de documento fiscal se
  emite dentro de un CAI vigente que autoriza un **rango de correlativos** y fija
  una **fecha límite de emisión**.
- **Estructura del correlativo:** 16 dígitos con el formato
  `EST-PTO-TIPO-NNNNNNNN` (Establecimiento – Punto de emisión – Tipo de documento
  – Número consecutivo de 8 dígitos).
- **Códigos de tipo de documento usados:**
  - `01` — **Factura**.
  - `03` — **Nota de Crédito**.

---

## 2. Documentos que emite el sistema

| Documento | Fiscal | Correlativo | CAI | Uso |
|---|---|---|---|---|
| **Factura** | Sí | `EST-PTO-01-NNNNNNNN` | `01` | Venta con efectos fiscales; genera ISV débito fiscal. |
| **Comprobante** | No | Número interno consecutivo | — | Constancia de venta sin efectos fiscales (a solicitud del cliente que no requiere factura). |
| **Nota de Crédito** | Sí | `EST-PTO-03-NNNNNNNN` | `03` | Acredita/reversa total o parcialmente una **factura** por devolución. |
| **Devolución de comprobante** | No | Número interno consecutivo | — | Reversa total o parcial de un **comprobante** (no fiscal). |

Cada documento fiscal contiene los requisitos del Art. 10-11 del reglamento:
datos del emisor y del CAI, identificación del cliente (obligatoria si la venta
supera L 10,000.00), desglose de valores **exento / exonerado / gravado 15% /
gravado 18%**, ISV por tasa, descuentos, total en números y en letras, y —cuando
aplica— la tasa de cambio si se factura en moneda extranjera.

---

## 3. Control de correlativos y CAI

- El **correlativo es consecutivo y sin saltos**: se asigna de forma **atómica**
  al momento de emitir (una sola operación de base de datos incrementa el
  correlativo del CAI y crea el documento; si algo falla, no se consume número).
- El sistema **valida antes de emitir** que el CAI esté **vigente** (dentro de la
  fecha límite) y que el correlativo **no exceda el rango autorizado**; si el CAI
  está vencido o agotado, la emisión se bloquea.
- La Nota de Crédito toma su correlativo de un **CAI propio de tipo `03`**,
  independiente del CAI de facturas (`01`). Se configura como cualquier otro CAI
  (establecimiento, punto de emisión, tipo `03`, rango y fecha límite).

---

## 4. Inmutabilidad y trazabilidad (controles de integridad)

- **Los documentos emitidos son inmutables.** Una vez emitida, una factura,
  comprobante o nota de crédito **no puede editarse** (regla forzada por la base de
  datos, no solo por la aplicación). El único cambio permitido sobre un documento
  emitido es marcarlo como **anulado** (comprobantes) o acreditarlo con una **nota
  de crédito** (facturas).
- **Registro de inventario de solo-agregado (append-only):** cada movimiento de
  existencias (venta, devolución, ajuste) queda como un asiento histórico que no se
  borra ni se reescribe. La devolución no "deshace" la venta: **agrega** un
  movimiento de reposición, dejando la trazabilidad completa.
- **Numeración interna** de comprobantes y devoluciones por secuencia consecutiva.

---

## 5. Anulación de comprobante vs. Nota de Crédito de factura

Distinción clave y conforme a la práctica del SAR:

- **Comprobante (no fiscal):** puede **anularse** (p. ej. error de emisión el mismo
  día). La anulación repone el inventario y deja el comprobante en estado
  `anulado`, con motivo y fecha.
- **Factura (fiscal): NO se anula.** Una vez emitida, cualquier corrección o
  devolución se documenta con una **Nota de Crédito** que la referencia. Esto
  preserva la integridad del correlativo fiscal y del débito fiscal declarado.

---

## 6. Notas de Crédito — tratamiento fiscal y contable

### 6.1 Qué es y qué reversa

Una Nota de Crédito **reversa el ISV débito fiscal** que se cobró en la factura
original, en la proporción de lo que se devuelve. Documenta:

- La **referencia a la factura original** (su número/correlativo y CAI).
- Los **ítems y cantidades devueltos**.
- La **base gravable** devuelta y el **ISV** correspondiente, **a la misma tasa**
  de la venta original (15% o 18%, o exento/exonerado según corresponda).
- El **total acreditado** en números y en letras.

### 6.2 Devolución parcial

El sistema permite devolver **solo parte** de una factura (algunos ítems, algunas
unidades). Se puede emitir **más de una nota de crédito** sobre la misma factura,
siempre que la suma de lo devuelto **no exceda lo facturado**. El sistema controla,
por cada línea de la factura, la **cantidad aún devolvible** = cantidad facturada −
cantidad ya devuelta en notas de crédito previas.

### 6.3 Cálculo del ISV en una devolución parcial

El criterio es **acreditar la parte proporcional real** de la línea, reconstruida
con la misma matemática de la emisión (no se divide un ISV ya redondeado):

1. **Precio neto por unidad** = (precio unitario − descuento de la línea prorrateado
   entre las unidades de esa línea).
2. **Base devuelta** = precio neto por unidad × cantidad devuelta, redondeada a 2
   decimales.
3. **ISV de la nota de crédito** = base devuelta × tasa de la línea (15% o 18%).

De este modo el ISV acreditado en la nota de crédito **es igual** al ISV que se
cobró originalmente sobre esas unidades, y la suma de las notas de crédito
parciales **nunca excede** el ISV de la factura.

### 6.4 Ejemplo numérico

**Factura original (una línea):**

| Concepto | Valor |
|---|---|
| Producto | Camiseta |
| Cantidad | 3 |
| Precio unitario (con ISV incluido) | L 230.00 |
| Descuento de línea | L 0.00 |
| Tasa | 15% |

Desglose de la factura (precio incluye ISV, se desglosa hacia atrás):

- Base gravada por unidad = 230.00 ÷ 1.15 = **L 200.00**
- ISV por unidad = 230.00 − 200.00 = **L 30.00**
- Total línea (3 u): base **L 600.00** + ISV **L 90.00** = **L 690.00**

**Nota de Crédito por devolución de 1 unidad:**

- Base devuelta = 200.00 × 1 = **L 200.00**
- ISV acreditado = 200.00 × 15% = **L 30.00**
- Total acreditado = **L 230.00**

Quedan **2 unidades** aún devolvibles de esa línea (base L 400.00 + ISV L 60.00).
La factura original permanece intacta; el crédito se documenta en la nota de
crédito con referencia a ella.

### 6.5 Efectos de la Nota de Crédito

Al emitirse, la nota de crédito, en una sola operación atómica:

1. **Reversa el ISV débito fiscal** de lo devuelto (base + ISV a la misma tasa).
2. **Repone el inventario** de los productos devueltos (movimiento de tipo
   *devolución* al costo vigente; no altera el costo promedio).
3. **Ajusta la cuenta por cobrar** si la venta fue al crédito: reduce el saldo
   pendiente del cliente en el monto acreditado.
4. **Reembolsa** al cliente según se elija: **efectivo** (egreso de la caja, que se
   refleja en el arqueo del turno), **saldo a favor** del cliente (nota de crédito
   interna para compras futuras), o **abono a su cuenta por cobrar**.

### 6.6 Control opcional "sin devoluciones en efectivo"

La empresa puede activar una regla que **prohíbe reembolsar en efectivo**; en ese
caso la devolución solo puede resolverse como saldo a favor o abono a la cuenta por
cobrar. El control se aplica en el servidor (no solo en la pantalla).

---

## 7. Desglose del ISV (referencia)

- **15%** — tasa general del ISV.
- **18%** — tasa aplicable a determinados bienes/servicios.
- **Exento** — operaciones sin ISV por naturaleza del bien/servicio.
- **Exonerado** — cliente con constancia/orden de compra exenta (se registran los
  datos de exoneración: orden de compra exenta, constancia, registro SAG).

La factura y la nota de crédito desglosan estos cuatro rubros por separado, con su
ISV por tasa, de modo que el **libro de ventas** y las declaraciones puedan
construirse directamente de los documentos emitidos.

---

## 8. Notas para el registro contable

- **Venta (factura):** reconoce ingreso, ISV débito fiscal por cobrar al fisco, y
  costo de venta con salida de inventario.
- **Nota de crédito (devolución):** reversa proporcional del ingreso y del ISV
  débito fiscal, y **reingreso de inventario** al costo. Si la venta fue al crédito,
  reduce la cuenta por cobrar; si fue de contado, se reembolsa (efectivo, saldo a
  favor o abono).
- La reversa del ISV se declara en el período correspondiente, reduciendo el débito
  fiscal del mes en que se emite la nota de crédito, con soporte en el documento y
  su referencia a la factura original.

---

## 9. Estado de implementación

- **En producción:** emisión de facturas (CAI `01`), comprobantes, anulación de
  comprobantes, documento imprimible con todos los requisitos SAR, y el control de
  correlativos/CAI e inmutabilidad descritos arriba.
- **En implementación (sub-proyecto P5a):** las notas de crédito por devolución
  (factura → NC fiscal CAI `03`; comprobante → devolución interna), con el
  tratamiento de ISV, reposición de inventario, ajuste de cuenta por cobrar,
  reembolso y el control opcional "sin efectivo" descritos en este documento.

---

## 10. Trazabilidad y reportes

Todos los documentos quedan almacenados de forma inmutable y consultables por
tipo, fecha, cliente y CAI. El **libro de ventas SAR** (sub-proyecto P6) se
construye directamente de las facturas y notas de crédito emitidas, con el desglose
de base e ISV por tasa que exige el reporte.
