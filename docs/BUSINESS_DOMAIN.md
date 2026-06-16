# Dominio de Negocio — Sistema de Administración Patrimonial y Seguros

> Documento pensado para que cualquier desarrollador entienda **qué es cada cosa, por qué existe y cómo se relaciona** antes de tocar código.

---

## Contexto general

El sistema administra el **patrimonio asegurable de una empresa agropecuaria/industrial** y todos los seguros contratados sobre ese patrimonio.

La empresa posee activos físicos de alto valor (tractores, cosechadoras, camiones, establecimientos, edificios). Sobre esos activos contrata pólizas de seguro con distintas aseguradoras. Por esas pólizas recibe facturas, las paga en cuotas, y ante siniestros abre reclamos. El sistema centraliza todo eso.

---

## Entidades del dominio

### 1. Company (Empresa)

**Qué es en el negocio:** una persona jurídica que tiene RUT/CUIT propio. El grupo puede tener varias empresas (holding). Por ejemplo: "Los O'Dwyer S.A.", "Agro Norte S.R.L.", etc.

**Por qué existe:** los activos y los costos de seguros deben imputarse a una empresa específica para la contabilidad.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `name` | Razón social |
| `taxId` | CUIT |
| `status` | Si está activa como entidad |

**No confundir con:** un centro de costo. Una empresa puede tener muchos centros de costo.

---

### 2. CostCenter (Centro de Costo)

**Qué es en el negocio:** una subdivisión contable dentro de una empresa. Permite saber "a qué área/actividad pertenece este gasto". Por ejemplo: "Agrícola Norte", "Ganadería", "Logística", "Administración".

**Por qué existe:** el seguro de un tractor que trabaja en el establecimiento norte debe imputarse al centro de costo "Agrícola Norte", no a "Administración".

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `code` | Código contable interno |
| `name` | Nombre legible |
| `companyId` | A qué empresa pertenece este CC |
| `area` | Área funcional (producción, logística, etc.) |

**Relación:** un `CostCenter` siempre pertenece a una `Company`. Un activo o póliza sin activo debe estar imputado a empresa + CC.

---

### 3. Asset (Activo / Bien Patrimonial)

**Qué es en el negocio:** un bien físico de la empresa que tiene valor económico y puede (o debe) estar asegurado. Es el objeto principal del sistema.

**Tipos de activos que maneja:**
- Vehículos: camionetas (Hilux, Amarok, F-150), camiones (Scania, Mercedes)
- Maquinaria agrícola: tractores (John Deere, Case IH), cosechadoras, pulverizadoras
- Implementos: plataformas draper, etc.
- Inmuebles: establecimientos rurales (campo), plantas industriales, edificios de oficinas
- Infraestructura: silos, instalaciones

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `internalCode` | Código único interno (ej: `VEH-001`, `TRA-001`) |
| `assetType` | Tipo (camioneta, tractor, edificio, etc.) |
| `patrimonialValueUsd` | Valor contable del activo en dólares |
| `valuationDate` | Fecha de última valuación |
| `fixedAssetCode` | Código del bien de uso en el sistema contable |
| `productiveUnit` | Unidad de negocio a la que pertenece |
| `companyId` | A qué empresa pertenece |
| `costCenterId` | A qué centro de costo está imputado |
| `status` | Estado operativo del activo |

**Estados del activo:**

| Estado | Cuándo ocurre |
|--------|--------------|
| `activo` | En uso normal |
| `inactivo` | No está en uso pero sigue en el patrimonio |
| `en_reparacion` | En taller, temporalmente fuera de servicio |
| `vendido` | Ya no pertenece a la empresa |
| `dado_de_baja` | Destruido, siniestro total, etc. |
| `pendiente_documentacion` | Ingresó pero falta documentación |

**Relaciones del activo:**
- Un activo → tiene cero, una o varias `Policy` (pólizas asociadas)
- Un activo → tiene cero o varios `FireExtinguisher` (matafuegos)
- Un activo → tiene cero o varios `AssetAttachment` (documentos adjuntos)
- Un activo → tiene cero o varios `Claim` (siniestros)

---

### 4. Policy (Póliza de Seguro)

**Qué es en el negocio:** el contrato de seguro emitido por una aseguradora. Define qué está cubierto, por cuánto dinero, desde cuándo hasta cuándo y quién lo gestiona.

**Regla fundamental:** una póliza puede estar asociada a un activo O no estarlo.

- **Póliza con activo:** seguro de un vehículo específico, una cosechadora, un edificio.
- **Póliza sin activo:** seguros institucionales como responsabilidad civil general, accidentes personales, seguro colectivo de vida, seguro de granizo por zona. En ese caso, **debe tener empresa y centro de costo** para poder imputar el costo.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `policyNumber` | Número de póliza de la aseguradora (ej: `AUT-2024-001234`) |
| `insuranceCompany` | Nombre de la aseguradora (Sancor, La Segunda, etc.) |
| `producerId` | Productor asesor que gestiona esta póliza |
| `insuranceType` | Ramo del seguro (Automotor, Maquinaria agrícola, Incendio, etc.) |
| `coverageType` | Tipo de cobertura (Todo riesgo, Terceros completos, etc.) |
| `startDate` / `endDate` | Vigencia de la póliza |
| `assetId` | Activo asegurado (puede ser `null`) |
| `companyId` | Empresa imputada si no hay activo |
| `costCenterId` | Centro de costo imputado si no hay activo |
| `insuredAmountArs` | Suma asegurada en pesos |
| `exchangeRate` | Tipo de cambio al momento del seguro |
| `insuredAmountUsd` | Suma asegurada en dólares |

**Estados de póliza (calculados):**

| Estado | Cómo se calcula |
|--------|----------------|
| `vigente` | `endDate` en el futuro |
| `proximo_vencer` | `endDate` dentro de los próximos 30 días |
| `vencida` | `endDate` ya pasó |
| `pendiente_documentacion` | Falta documentación adjunta |
| `sin_factura` | No tiene ningún `AccountingDocument` asociado |

---

### 5. AccountingDocument (Documento Contable)

**Qué es en el negocio:** un documento económico emitido por la aseguradora o el productor que representa un cobro. Puede ser una factura de prima, un endoso que modifica la póliza, una nota de crédito que devuelve dinero, o una refacturación.

**Tipos de documento:**

| Tipo | Cuándo ocurre |
|------|--------------|
| `factura` | La aseguradora cobra la prima del seguro |
| `endoso` | Modificación a una póliza ya emitida (cambio de vehículo, suma asegurada, etc.) |
| `nota_credito` | La aseguradora devuelve dinero (cancelación parcial, ajuste) |
| `refacturacion` | Corrección de una factura emitida incorrectamente |

**Regla crítica:** no puede existir un documento contable sin al menos una póliza asociada. Primero se crea la póliza, luego el documento.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `documentNumber` | Número del documento (ej: `A-0001-00012345`) |
| `issueDate` | Fecha de emisión del documento |
| `currency` | Moneda del documento (`ARS` o `USD`) |
| `exchangeRate` | Tipo de cambio al momento de emisión |
| `netAmount` | Importe neto (sin impuestos) |
| `vatAmount` | IVA |
| `otherTaxesAmount` | Otros impuestos |
| `totalAmount` | Total = Neto + IVA + Otros |
| `paymentStatus` | Estado de pago operativo |

**Estados de pago:**

| Estado | Significado |
|--------|------------|
| `pendiente` | No se pagó nada |
| `parcial` | Se pagaron algunas cuotas |
| `pagado` | Todas las cuotas están pagadas |

---

### 6. DocumentPolicyAllocation (Asignación de Documento a Póliza)

**Qué es en el negocio:** una factura puede incluir varias pólizas en un mismo documento. Por ejemplo, una sola factura de Sancor puede incluir 5 camionetas Hilux. Cada Hilux tiene su propia póliza, pero la factura es una sola. Esta entidad representa la distribución: cuánto del total de la factura le corresponde a cada póliza.

**Por qué existe:** para poder distribuir el costo de seguros por activo, por empresa, por centro de costo. Sin esta distribución no se puede saber cuánto cuesta asegurar específicamente el tractor vs. el establecimiento.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `accountingDocumentId` | Factura que contiene este ítem |
| `policyId` | Póliza a la que se imputa este importe |
| `allocatedAmount` | Importe asignado a esta póliza |
| `allocationPercentage` | `allocatedAmount / totalAmount` — calculado automáticamente |

**Relación:** `AccountingDocument` ←→ `Policy` es **muchos a muchos** a través de `DocumentPolicyAllocation`.

---

### 7. Installment (Cuota)

**Qué es en el negocio:** una factura puede pagarse en cuotas. Cada cuota tiene su propia fecha de vencimiento y su propio estado de pago. El análisis financiero se basa exactamente en esto: cuándo vence cada cuota y si está pagada o no.

**Diferencia clave con el análisis económico:**
- **Análisis financiero** → cuándo se pagan las cuotas (flujo de caja)
- **Análisis económico** → cuándo se emitió la factura (devengamiento del gasto)

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `accountingDocumentId` | A qué documento pertenece esta cuota |
| `installmentNumber` | Número de cuota (1/3, 2/3, 3/3) |
| `dueDate` | Fecha de vencimiento de la cuota |
| `amount` | Importe de la cuota |
| `paymentStatus` | `pendiente`, `parcial` o `pagado` |
| `paidAt` | Fecha real en que se pagó |

---

### 8. Producer (Productor Asesor de Seguros)

**Qué es en el negocio:** el intermediario entre la empresa y la aseguradora. Es un profesional matriculado (PAS — Productor Asesor de Seguros) que gestiona el portfolio de pólizas, cotiza, renueva y gestiona siniestros.

**Por qué existe en el sistema:** para controlar qué pólizas gestiona cada productor, cuánta prima administra, y asignarle tareas (renovar póliza, solicitar endoso, gestionar siniestro, etc.).

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `registrationNumber` | Matrícula del PAS |
| `name`, `phone`, `email`, `address` | Datos de contacto |

---

### 9. ProducerTask (Tarea del Productor)

**Qué es en el negocio:** una tarea operativa asignada internamente y vinculada a un productor. Por ejemplo: "Renovar póliza X antes del 31/08", "Solicitar endoso de cambio de vehículo", "Gestionar siniestro claim-5".

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `producerId` | Productor responsable de la tarea |
| `policyId` | Póliza relacionada (opcional) |
| `assetId` | Activo relacionado (opcional) |
| `assignedTo` | Empleado interno responsable |
| `dueDate` | Fecha límite |
| `priority` | `baja`, `media`, `alta` |
| `status` | `pendiente`, `en_curso`, `finalizada`, `vencida` |

---

### 10. FireExtinguisher (Matafuego)

**Qué es en el negocio:** matafuego físico instalado en un vehículo, maquinaria, establecimiento o edificio. Tiene fecha de carga (cuando fue cargado/recargado) y fecha de vencimiento. La empresa tiene obligación legal y de seguridad de mantenerlos vigentes.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `code` | Código interno del matafuego |
| `type` | Tipo de agente extintor (polvo, CO2, etc.) |
| `capacity` | Capacidad (ej: "6 kg", "10 kg") |
| `chargeDate` | Cuándo fue cargado por última vez |
| `expirationDate` | Cuándo vence |
| `associatedAssetId` | Activo al que está vinculado (puede ser null) |
| `associatedLocationType` | Tipo de ubicación (vehículo, establecimiento, etc.) |
| `status` | `vigente`, `proximo_vencer`, `vencido` |

**Regla de estado:**
- `vigente`: fecha de vencimiento > hoy + 30 días
- `proximo_vencer`: fecha de vencimiento en los próximos 30 días
- `vencido`: fecha de vencimiento < hoy

---

### 11. Claim (Siniestro)

**Qué es en el negocio:** un reclamo presentado a la aseguradora por un evento cubierto por la póliza. Puede ser un accidente, robo, granizo, incendio, rotura mecánica, etc.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `assetId` | Activo afectado por el siniestro |
| `policyId` | Póliza bajo la cual se denuncia (puede ser null si no se identificó aún) |
| `claimNumber` | Número de siniestro de la aseguradora |
| `claimType` | Tipo de evento |
| `occurrenceDate` | Cuándo ocurrió el siniestro |
| `reportDate` | Cuándo se denunció a la aseguradora |
| `claimedAmountArs` | Importe reclamado |
| `settledAmountArs` | Importe liquidado por la aseguradora |
| `deductibleArs` | Franquicia a cargo de la empresa |

**Estados del siniestro:**

| Estado | Significado |
|--------|------------|
| `denunciado` | Recién reportado, sin gestión aún |
| `en_tramite` | En proceso con la aseguradora |
| `liquidado` | Aprobado y pagado por la aseguradora |
| `rechazado` | La aseguradora no cubrió el siniestro |
| `cerrado` | Caso cerrado (liquidado o rechazado) |

---

### 12. AssetAttachment (Adjunto del Activo)

**Qué es en el negocio:** documentación vinculada a un activo específico. Puede ser el título de propiedad, la cédula verde, una factura de compra, un certificado técnico, fotos, etc.

**Campos clave:**

| Campo | Significado |
|-------|------------|
| `assetId` | Activo al que pertenece el documento |
| `fileType` | `pdf`, `image`, `excel`, `other` |
| `expirationDate` | Fecha de vencimiento (si aplica, ej: VTV, habilitación) |
| `uploadedBy` | Quién subió el documento |

---

## Mapa de relaciones

```
Company (Empresa)
  └─── CostCenter (Centro de costo) [1 empresa → N centros]

Asset (Activo)
  ├── companyId ────────────────────────── Company
  ├── costCenterId ─────────────────────── CostCenter
  ├── [1 activo → N pólizas]
  ├── [1 activo → N matafuegos]
  ├── [1 activo → N adjuntos]
  └── [1 activo → N siniestros]

Policy (Póliza)
  ├── assetId (nullable) ───────────────── Asset          [póliza con activo]
  ├── companyId (nullable) ─────────────── Company        [póliza sin activo]
  ├── costCenterId (nullable) ──────────── CostCenter     [póliza sin activo]
  └── producerId ───────────────────────── Producer

AccountingDocument (Documento Contable)
  └── [1 documento → N pólizas] via DocumentPolicyAllocation
        ├── accountingDocumentId ──────── AccountingDocument
        ├── policyId ─────────────────── Policy
        ├── allocatedAmount
        └── allocationPercentage

Installment (Cuota)
  └── accountingDocumentId ─────────────── AccountingDocument [1 doc → N cuotas]

ProducerTask (Tarea)
  ├── producerId ───────────────────────── Producer
  ├── policyId (nullable) ─────────────── Policy
  └── assetId (nullable) ───────────────── Asset

FireExtinguisher (Matafuego)
  └── associatedAssetId (nullable) ──────── Asset [1 activo → N matafuegos]

Claim (Siniestro)
  ├── assetId ──────────────────────────── Asset
  └── policyId (nullable) ─────────────── Policy
```

---

## Flujo completo de un seguro: de principio a fin

Este flujo es el más importante para entender cómo se conectan todas las entidades:

```
1. Se registra el ACTIVO
   (Toyota Hilux VEH-001, valuado en USD 32.000, empresa comp-1, CC cc-1)

2. Se crea la PÓLIZA asociada al activo
   (Póliza AUT-2024-001234, Sancor Seguros, todo riesgo, vigente hasta 31/08/2026,
    suma asegurada ARS 30.000.000, producida por el productor prod-1)

3. La aseguradora emite una FACTURA
   (doc-1: Factura A-0001-00012345 por ARS 1.071.000 con IVA)

4. La factura se ASIGNA a la póliza
   (DocumentPolicyAllocation: doc-1 → pol-1, 100% del importe)

5. La factura se paga en CUOTAS
   (Cuota 1/3: ARS 357.000 vence 01/10/2025, pagada)
   (Cuota 2/3: ARS 357.000 vence 01/11/2025, pagada)
   (Cuota 3/3: ARS 357.000 vence 01/12/2025, pendiente)

6. Si ocurre un siniestro se abre un CLAIM
   (Claim SIN-2025-004821: accidente, reclamado ARS 1.850.000, liquidado ARS 1.620.000)

7. Si el activo tiene matafuego se registra el MATAFUEGO
   (Matafuego MF-001 vencimiento 15/03/2026, vigente)
```

---

## Flujo de una factura con MÚLTIPLES pólizas

Este es el caso más complejo y más frecuente:

```
Una sola factura de Sancor cubre 5 camionetas:
Factura doc-10: ARS 5.000.000 total

DocumentPolicyAllocation:
  pol-1 (Hilux VEH-001) → ARS 1.100.000 → 22%
  pol-2 (Hilux VEH-002) → ARS  950.000 → 19%
  pol-11 (F-150 VEH-003) → ARS 1.200.000 → 24%
  pol-14 (Amarok VEH-004) → ARS  900.000 → 18%
  pol-17 (Hilux VEH-005) → ARS  850.000 → 17%
                Total → ARS 5.000.000 → 100%

Esto permite el análisis económico:
  - "¿Cuánto costo el seguro de VEH-001 este año?" → suma sus allocatedAmount
  - "¿Cuánto gastó la empresa comp-1 en seguros?" → suma todas las allocations de activos de comp-1
  - "¿Cuánto gastó el CC cc-1?" → suma allocations de pólizas vinculadas a cc-1
```

---

## Diferencia entre Análisis Financiero y Económico

Es la distinción más importante a nivel técnico y contable:

| | Análisis Financiero | Análisis Económico |
|--|--------------------|--------------------|
| **Qué mide** | Cuándo se paga el dinero | Cuándo se devenga el gasto |
| **Unidad base** | Cuota (installment) | Documento contable |
| **Fecha relevante** | `dueDate` de la cuota | `issueDate` del documento |
| **Estado relevante** | `paymentStatus` de la cuota | Solo el importe total |
| **Para qué sirve** | Cash flow: cuándo sale el dinero | Contabilidad: a qué período corresponde el gasto |

**Ejemplo:** una póliza anual con factura emitida en enero y 12 cuotas mensuales:
- **Económico:** todo el costo aparece en enero (mes de la factura)
- **Financiero:** el costo aparece distribuido mes a mes (cuando vence cada cuota)

---

## Reglas de negocio críticas

Estas reglas definen qué datos son válidos:

1. **Todo activo** debe tener `internalCode`, `assetType` y `status`.
2. **Una póliza sin activo** (`assetId = null`) DEBE tener `companyId` y `costCenterId`.
3. **Un documento contable** no puede existir sin al menos una póliza asociada via `DocumentPolicyAllocation`.
4. **La suma de `allocatedAmount`** en todas las allocations de un documento debe igualar el `totalAmount` del documento.
5. **`allocationPercentage`** se calcula: `allocatedAmount / totalAmount`. No se puede ingresar manualmente.
6. **Un matafuego** puede no estar vinculado a ningún activo, pero si está vinculado, solo puede estar en un activo a la vez.
7. **Un siniestro** siempre debe estar vinculado a un activo. La póliza es opcional al momento de la denuncia.

---

## Validaciones de estado (calculadas, no manuales)

Estos campos se calculan en runtime, no se guardan como dato fijo:

| Entidad | Campo | Cómo se calcula |
|---------|-------|-----------------|
| `Policy` | `status` | Comparando `endDate` con la fecha actual |
| `FireExtinguisher` | `status` | Comparando `expirationDate` con la fecha actual |
| `AccountingDocument` | `paymentStatus` | Derivado del estado de sus `Installment` |
| `ProducerTask` | `status = vencida` | Si `dueDate` < hoy y `status != finalizada` |

---

## Estado actual del sistema

| Módulo | Datos mock | Pantallas | Estado |
|--------|-----------|-----------|--------|
| Activos | ✅ 17 activos | ✅ Lista, detalle, ficha, nuevo, edición | Completo |
| Pólizas | ✅ ~20 pólizas | ✅ Lista, detalle, nuevo | Completo |
| Documentos contables | ✅ ~10 docs | ✅ Lista, detalle, nuevo | Completo |
| Cuotas | ✅ Mock data | Dentro de docs | Completo |
| Productores | ✅ Mock data | ✅ Lista, detalle, tareas | Completo |
| Matafuegos | ✅ Mock data | ✅ Lista, detalle | Completo |
| Siniestros | ✅ Mock data | ✅ Lista, detalle, nuevo | Completo |
| Análisis Financiero | ✅ Mock data | ✅ Pantalla | Completo |
| Análisis Económico | ✅ Mock data | ✅ Pantalla | Completo |
| Dashboard | ✅ Mock data | ✅ Pantalla | Completo |
| Empresas | ✅ Mock data | ✅ Pantalla | Completo |
| Centros de costo | ✅ Mock data | ✅ Pantalla | Completo |

**Etapa actual:** frontend mock-first navegable. Sin backend ni base de datos real.

---

## Decisiones pendientes de validar con el negocio

Antes de construir el backend estas preguntas deben resolverse:

1. ¿Cómo afecta un **endoso** a la póliza? ¿Suma suma asegurada? ¿Cambia la vigencia? ¿Modifica el importe?
2. ¿Cómo se procesa una **nota de crédito**? ¿Resta del total de la factura original?
3. ¿El estado de pago se registra **por cuota** o **por documento** completo?
4. ¿Las cuotas son fijas (el documento las define) o se pueden ajustar por póliza dentro del documento?
5. ¿El sistema será **multiempresa** (un solo login ve varias empresas) o monempresa?
6. ¿Se requerirá integración con sistema contable externo (SAP, Tango, etc.)?
7. ¿Se va a manejar el historial de tipos de cambio o solo el tipo de cambio al momento de la operación?
