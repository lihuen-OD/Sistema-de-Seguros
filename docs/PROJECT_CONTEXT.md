# Project Context

## Project name

**Sistema de Administración Patrimonial, Seguros y Matafuegos**

Nombre comercial tentativo:

* Asset & Insurance
* Patrimonio Pro
* Asset Insurance Manager

**Status:** Pending final business name.

---

## Business objective

El objetivo del sistema es diseñar y desarrollar una aplicación SaaS empresarial para administrar activos patrimoniales asegurables, pólizas de seguros, documentos contables asociados, costos de seguros, vencimientos, estados de pago, productores asesores de seguros y matafuegos.

El sistema debe permitir controlar de forma centralizada:

* Activos asegurables.
* Seguros asociados a activos.
* Seguros no asociados a activos específicos.
* Costos de seguros.
* Facturas, endosos, notas de crédito y refacturaciones.
* Vencimientos de pólizas.
* Vencimientos de cuotas.
* Estados de pago.
* Distribución por empresa.
* Distribución por centro de costo.
* Distribución por bien de uso.
* Distribución por activo.
* Distribución por póliza.
* Productores asesores de seguros.
* Tareas vinculadas a productores, pólizas o activos.
* Matafuegos asociados a activos, maquinaria, vehículos o establecimientos.
* Vencimientos de matafuegos.
* Análisis financiero.
* Análisis económico.
* Documentación asociada a activos, pólizas y documentos contables.

La primera versión debe funcionar como un **frontend profesional completamente navegable con datos ficticios realistas**.

No se debe desarrollar backend complejo en esta etapa.
No se debe conectar una base de datos real en esta etapa.
No se debe conectar servicios externos reales en esta etapa.

La arquitectura debe quedar preparada para una futura integración con backend y base de datos real, probablemente PostgreSQL. Supabase puede ser una alternativa futura si se confirma, pero no debe asumirse como decisión obligatoria salvo indicación expresa.

---

## Product type

**Sistema empresarial SaaS / plataforma de gestión patrimonial, seguros y análisis financiero.**

Tipo de producto:

* SaaS empresarial.
* Sistema de gestión interna.
* Plataforma patrimonial.
* Sistema de seguros corporativos.
* Dashboard financiero/económico.
* Sistema de control documental.
* Sistema de control de vencimientos.
* Sistema operativo para administración patrimonial y financiera.

---

## Current project status

**Initial stage: frontend mock-first.**

La primera etapa del proyecto debe ser:

* Frontend navegable.
* Datos ficticios realistas.
* Sin backend complejo.
* Sin base de datos real.
* Sin autenticación real.
* Sin servicios externos reales.
* Sin conexión a Supabase todavía.
* Sin integración con sistemas contables.
* Preparado arquitectónicamente para backend y base de datos futura.

El objetivo de esta etapa es validar:

* Experiencia de usuario.
* Flujos funcionales.
* Navegación.
* Diseño visual.
* Estructura de módulos.
* Tablas.
* Dashboards.
* Fichas patrimoniales.
* Análisis financiero y económico.

---

## Users and roles

### Administrador general

Usuario con acceso completo al sistema.

Puede:

* Ver dashboard ejecutivo.
* Gestionar activos.
* Gestionar pólizas.
* Gestionar documentos contables.
* Gestionar cuotas.
* Gestionar productores.
* Gestionar tareas.
* Gestionar matafuegos.
* Consultar análisis financiero.
* Consultar análisis económico.
* Exportar información.
* Consultar reportes.
* Administrar catálogos.

### Responsable de seguros

Usuario encargado de la gestión operativa de seguros.

Puede:

* Crear y actualizar pólizas.
* Adjuntar documentación de pólizas.
* Registrar documentos contables.
* Asociar documentos a una o varias pólizas.
* Registrar cuotas.
* Marcar estado de pago.
* Consultar vencimientos.
* Consultar productores.
* Consultar activos relacionados.

### Responsable patrimonial

Usuario encargado del control de activos de la empresa.

Puede:

* Crear y actualizar activos.
* Consultar fichas patrimoniales.
* Adjuntar documentación.
* Consultar pólizas asociadas.
* Consultar estado financiero del activo.
* Consultar matafuegos asociados.
* Ver dashboard del activo.

### Responsable de mantenimiento / seguridad e higiene

Usuario encargado del control de matafuegos.

Puede:

* Registrar matafuegos.
* Asociarlos a vehículos, maquinaria, establecimientos o infraestructura.
* Consultar vencimientos.
* Actualizar fechas de carga y vencimiento.
* Consultar historial.
* Ver alertas.

### Usuario ejecutivo / gerencial

Usuario orientado a consulta y análisis.

Puede:

* Ver indicadores generales.
* Consultar costos por empresa.
* Consultar costos por centro de costo.
* Consultar costos por activo.
* Consultar costos por póliza.
* Ver dashboards financieros y económicos.
* Exportar reportes.

**Status:** Roles proposed. Deben validarse con negocio antes de producción.

---

## Main modules

El sistema tiene cuatro módulos principales:

1. Gestión de Activos.
2. Seguros y Gestión Financiera.
3. Productores Asesores de Seguros.
4. Matafuegos.

Además, debe incluir módulos o secciones transversales:

* Dashboard ejecutivo.
* Buscador global.
* Gestión documental.
* Exportaciones.
* Configuración / catálogos.
* Alertas y vencimientos.
* Preparación futura para autenticación y roles.
* Preparación futura para auditoría.

---

# Module 1 — Gestión de Activos

## Purpose

Este módulo es el corazón patrimonial del sistema.

Debe permitir registrar, consultar y administrar todos los activos asegurables de la empresa.

## Asset types

Debe contemplar como mínimo:

* Vehículos.
* Camionetas.
* Camiones.
* Tractores.
* Cosechadoras.
* Pulverizadoras.
* Implementos.
* Plantas.
* Establecimientos.
* Edificios.
* Infraestructura.

## Asset master file / Ficha patrimonial

Cada activo debe tener una ficha patrimonial completa.

### General data

Campos:

* Código interno.
* Nombre.
* Tipo de activo.
* Marca.
* Modelo.
* Año.
* Número de serie.
* Estado.

Estados sugeridos:

* Activo.
* Inactivo.
* En reparación.
* Vendido.
* Dado de baja.
* Pendiente de documentación.

### Patrimonial information

Campos:

* Valor patrimonial en USD.
* Fecha de valuación.
* Observaciones.

### Accounting allocation / Imputación contable

Campos:

* Empresa.
* Centro de costo.
* Bien de uso.
* Unidad productiva.
* Área.

### Documentation

Debe permitir adjuntar o simular adjuntos:

* PDF.
* Excel.
* Imágenes.
* Certificados.
* Documentación adicional.

En la primera versión los adjuntos pueden ser ficticios o simulados visualmente.

### Associated insurance

Desde la ficha del activo se debe visualizar:

* Pólizas históricas.
* Pólizas vigentes.
* Coberturas.
* Fechas de vigencia.
* Compañía aseguradora.
* Productor.
* Monto asegurado.
* Estado de la póliza.

### Financial status of the asset

Mostrar:

* Tiene seguro vigente.
* Tiene seguro vencido.
* Facturas pendientes.
* Facturas pagadas.
* Total asegurado.
* Total pendiente asociado.
* Total pagado asociado.

### Fire extinguishers associated with the asset

Mostrar:

* Si tiene matafuego asociado.
* Código del matafuego.
* Fecha de carga.
* Fecha de vencimiento.
* Estado.

### Asset dashboard

Cada activo debe tener un dashboard o ficha ejecutiva con:

* Valor patrimonial.
* Valor asegurado.
* Diferencia entre valor patrimonial y valor asegurado.
* Cantidad de pólizas.
* Cantidad de documentos asociados.
* Estado del seguro.
* Estado de pagos.
* Estado de matafuegos.
* Historial de seguros.
* Historial documental.

### Asset detail UI rule

El detalle del activo debe diseñarse como **ficha patrimonial ejecutiva**, no como un formulario largo genérico.

Debe tener:

* Header compacto.
* Botón volver a inventario.
* Nombre del activo.
* Código, tipo y año.
* Badge de estado.
* Botón “Ficha PDF”.
* Columna izquierda con ficha patrimonial.
* Columna izquierda con imputación contable.
* Columna derecha con KPIs: valor patrimonial, valor asegurado y diferencia.
* Card de observaciones.
* Tabs compactas: pólizas, documentos, matafuegos y adjuntos.
* Tablas compactas.
* Scroll horizontal contenido solamente dentro de tablas, nunca global.

---

# Module 2 — Seguros y Gestión Financiera

Este módulo se divide en:

A. Pólizas.
B. Documentos Contables.
C. Análisis Financiero.
D. Análisis Económico.

---

## A. Pólizas

### Purpose

Registrar y administrar pólizas de seguros, tanto asociadas a activos como no asociadas a activos.

### Policy fields

Campos:

* Número de póliza.
* Compañía aseguradora.
* Productor.
* Tipo de seguro.
* Tipo de cobertura.
* Fecha de inicio.
* Fecha de vencimiento.
* Descripción libre.

### Attachments

Debe permitir adjuntar o simular adjuntos:

* Póliza.
* Certificados.
* Tarjeta de circulación.
* Documentación adicional.

### Economic fields

Campos económicos:

* Monto asegurado en pesos.
* Tipo de cambio.
* Monto asegurado en dólares.

Regla sugerida:

* Si se carga monto asegurado en pesos y tipo de cambio, puede calcularse monto asegurado en dólares.
* Si se carga monto asegurado en dólares y tipo de cambio, puede calcularse equivalente en pesos.
* No inventar reglas contables no definidas.

### Association rules

Una póliza puede:

1. Estar asociada a un activo.
2. No estar asociada a ningún activo.

Ejemplo de póliza sin activo:

* Accidentes personales.
* Responsabilidad civil general.
* Seguro colectivo.
* Seguro institucional.

### Mandatory rule when policy has no asset

Si la póliza no está asociada a ningún activo, es obligatorio solicitar:

* Empresa.
* Centro de costo.

Esto permite imputar el costo aunque no exista activo patrimonial asociado.

### Policy status

Estados calculados sugeridos:

* Vigente.
* Próxima a vencer.
* Vencida.
* Pendiente de documentación.
* Sin factura asociada.

El estado vigente/vencido debe calcularse usando fecha de inicio y fecha de vencimiento.

---

## B. Documentos Contables

### Purpose

Registrar documentos económicos asociados a pólizas.

### Document types

Tipos:

* Factura.
* Endoso.
* Nota de crédito.
* Refacturación.

### Mandatory rule

No puede existir un documento contable sin póliza asociada.

Flujo obligatorio:

1. Primero se crea la póliza.
2. Luego se crea el documento contable.
3. El documento se asocia a una o varias pólizas.

### Document fields

Campos:

* Tipo de documento.
* Número de documento.
* Fecha de emisión.
* Moneda.
* Tipo de cambio.
* Neto.
* IVA.
* Otros impuestos.
* Total.
* PDF adjunto.
* Estado de pago.

### Currency

Monedas mínimas:

* ARS.
* USD.

### Amounts

Importes:

* Neto.
* IVA.
* Otros impuestos.
* Total.

Regla sugerida:

```text
Total = Neto + IVA + Otros impuestos
```

La primera versión puede permitir edición manual del total, pero debe mostrar el cálculo de manera consistente.

### Policy relationship

Un documento contable puede incluir:

* Una póliza.
* Varias pólizas.

Ejemplo:

Una factura puede contener:

* Hilux 1.
* Hilux 2.
* Hilux 3.
* Hilux 4.
* Hilux 5.

Cada póliza tendrá un valor asignado dentro de la factura.

### Cost allocation rule

El sistema debe calcular automáticamente la participación porcentual de cada póliza dentro de la factura.

Fórmula:

```text
Participación de póliza = Importe asignado a la póliza / Total de importes asignados a pólizas
```

Ese porcentaje se utilizará para distribuir costos por:

* Empresa.
* Centro de costo.
* Bien de uso.
* Activo.
* Póliza.

### Installments / Cuotas

Debe permitir registrar:

* Cantidad de cuotas.
* Fecha de vencimiento de cada cuota.
* Importe de cada cuota.

Visualizaciones requeridas:

* Vista calendario.
* Vista tabla.

### Payment status

Estados simples:

* Pendiente.
* Parcialmente pagado.
* Totalmente pagado.

Importante:

No desarrollar contabilidad completa.
Solo registrar estado de pago operativo.

---

## C. Análisis Financiero

### Purpose

Permitir analizar pagos y vencimientos financieros según cuotas.

El análisis financiero se basa en:

* Cuotas.
* Fechas de vencimiento.
* Estado de pago.
* Importe de cuota.

### Main view

Pantalla principal tipo matriz dinámica.

### Configurable rows

Filas configurables:

* Centros de costo.
* Empresas.
* Bienes de uso.
* Activos.
* Pólizas.

### Configurable columns

Columnas configurables:

* Semana.
* Mes.
* Trimestre.
* Año.

### Visualization rules

Colores:

* Rojo: cuotas pendientes.
* Verde: cuotas pagadas.
* Amarillo: parcialmente pagado o advertencia, si aplica.

Mostrar:

* Total pagado.
* Total pendiente.
* Total general.

### Currency selector

Permitir:

* Vista en pesos.
* Vista en dólares.
* Selector de moneda.

### Important distinction

El análisis financiero considera cuándo se paga o vence una cuota.
No debe confundirse con el análisis económico.

---

## D. Análisis Económico

### Purpose

Permitir analizar el costo económico de los seguros según fecha de factura/documento.

El análisis económico se basa en:

* Fecha de factura/documento.
* Importe total del documento.
* Distribución del costo a pólizas, activos, centros de costo y empresas.

### Difference from financial analysis

No considera cuotas.
No considera vencimiento de cuotas.
No considera estado de pago como eje principal.

Considera únicamente:

* Fecha de factura.
* Importe total del documento.

### Metrics

Mostrar:

* Costos por período.
* Costos por empresa.
* Costos por centro de costo.
* Costos por activo.
* Costos por póliza.
* Costos por aseguradora.
* Costos por productor.

### Currency selector

Permitir:

* Vista en pesos.
* Vista en dólares.

---

## Insurance dashboard

### Indicators

El dashboard de seguros debe mostrar:

* Pólizas vigentes.
* Pólizas vencidas.
* Pólizas próximas a vencer.
* Prima total.
* Facturas pendientes.
* Facturas pagadas.

### Charts

Gráficos requeridos:

* Costos por aseguradora.
* Costos por centro de costo.
* Costos por empresa.
* Costos por activo.
* Evolución mensual de costos.
* Próximos vencimientos.

---

# Module 3 — Productores Asesores de Seguros

## Purpose

Administrar productores asesores, su cartera de pólizas y tareas operativas.

## Producer fields

Campos:

* Nombre.
* Matrícula.
* Teléfono.
* Email.
* Dirección.

## Producer profile

Visualizar:

* Pólizas gestionadas.
* Prima administrada.
* Cantidad de siniestros.
* Tareas pendientes.
* Tareas vencidas.
* Tareas finalizadas.

## Task management

Permitir asignar tareas.

Ejemplos:

* Solicitar cotización.
* Renovar póliza.
* Enviar documentación.
* Gestionar siniestro.
* Solicitar endoso.
* Reclamar documentación.
* Revisar vencimiento.

### Task fields

Campos sugeridos:

* Título.
* Descripción.
* Productor asignado.
* Póliza asociada opcional.
* Activo asociado opcional.
* Fecha de creación.
* Fecha de vencimiento.
* Prioridad.
* Estado.
* Responsable interno.

### Task statuses

Estados:

* Pendiente.
* En curso.
* Finalizada.
* Vencida.

### Compliance dashboard

Mostrar:

* Tareas cumplidas.
* Tareas pendientes.
* Tareas vencidas.
* Cumplimiento por productor.
* Próximos vencimientos de tareas.

---

# Module 4 — Matafuegos

## Purpose

Registrar y controlar matafuegos asociados a activos, vehículos, maquinaria o establecimientos.

## Fire extinguisher fields

Campos:

* Código.
* Tipo.
* Capacidad.
* Fecha de carga.
* Fecha de vencimiento.
* Estado.
* Observaciones.

## Association

Asociar a:

* Vehículo.
* Maquinaria.
* Establecimiento.
* Edificio.
* Infraestructura.

Regla sugerida:

* Un matafuego puede estar asociado a un activo.
* Un activo puede tener cero, uno o varios matafuegos.

## History

Mantener historial completo de:

* Cargas.
* Recargas.
* Vencimientos.
* Cambios de ubicación.
* Cambios de activo asociado.
* Observaciones.

La primera versión puede simular historial con datos ficticios.

## Fire extinguishers dashboard

### Indicators

Mostrar:

* Matafuegos activos.
* Próximos a vencer.
* Vencidos.

### Charts

Gráficos:

* Estado general.
* Distribución por establecimiento.
* Distribución por empresa.
* Distribución por tipo.
* Vencimientos por mes.

### Automatic alerts

Colores:

* Rojo: vencidos.
* Amarillo: próximos a vencer.
* Verde: vigentes.

Regla sugerida para próximos a vencer:

* Próximo a vencer = fecha de vencimiento dentro de los próximos 30 días.

**Status:** Assumption. Validar con negocio.

---

## Main business rules

### General rules

* No desarrollar backend complejo en la primera etapa.
* No conectar bases de datos externas en la primera etapa.
* Usar datos ficticios realistas.
* Preparar arquitectura futura para backend y base real.
* Mantener UX profesional de software empresarial premium.
* No inventar reglas de negocio fuera de este documento.

### Asset rules

* Todo activo debe tener código interno.
* Todo activo debe tener tipo.
* Todo activo debe tener estado.
* Un activo puede tener cero, una o varias pólizas.
* Un activo puede tener cero, uno o varios matafuegos.
* Un activo puede tener documentación adjunta.
* Un activo debe permitir visualizar historial de pólizas y documentación.

### Policy rules

* Una póliza puede estar asociada a un activo o no.
* Si una póliza no tiene activo asociado, debe solicitar empresa y centro de costo.
* Toda póliza debe tener número de póliza.
* Toda póliza debe tener compañía.
* Toda póliza debe tener fecha de inicio y vencimiento.
* Las pólizas deben poder clasificarse como vigentes, vencidas o próximas a vencer.
* Una póliza puede tener múltiples documentos contables asociados.
* Una póliza puede tener múltiples adjuntos.

### Accounting document rules

* No puede existir documento contable sin póliza asociada.
* Primero se crea la póliza, luego el documento.
* Un documento puede asociarse a una o varias pólizas.
* Si un documento se asocia a varias pólizas, debe existir un importe asignado por póliza.
* El sistema debe calcular la participación porcentual de cada póliza dentro del documento.
* El estado de pago es operativo, no contable.
* No desarrollar contabilidad completa.

### Installment rules

* Un documento puede tener una o varias cuotas.
* Cada cuota debe tener fecha de vencimiento.
* Cada cuota debe tener importe.
* Cada cuota debe tener estado de pago.
* El análisis financiero usa cuotas y vencimientos.
* La visualización de cuotas debe existir en tabla y calendario.

### Financial analysis rules

* El análisis financiero considera cuotas.
* El análisis financiero considera fechas de vencimiento.
* El análisis financiero considera estado de pago.
* Debe distinguir pagado, pendiente y total.
* Debe permitir ver pesos y dólares.
* Debe permitir agrupar por empresa, centro de costo, bien de uso, activo y póliza.

### Economic analysis rules

* El análisis económico no considera cuotas.
* El análisis económico se basa en fecha de factura/documento.
* El análisis económico se basa en importe total del documento.
* Debe permitir agrupar por período, empresa, centro de costo, activo y póliza.
* Debe permitir vista en pesos y dólares.

### Producer rules

* Un productor puede gestionar múltiples pólizas.
* Un productor puede tener tareas asignadas.
* Las tareas pueden estar asociadas a pólizas o activos.
* Las tareas deben tener estado.
* Las tareas vencidas deben destacarse visualmente.

### Fire extinguisher rules

* Un matafuego puede asociarse a vehículo, maquinaria, establecimiento, edificio o infraestructura.
* Debe tener fecha de carga y fecha de vencimiento.
* Debe calcular estado vigente, próximo a vencer o vencido.
* Debe mostrar historial completo.

---

## Tech stack

### Frontend

Stack recomendado para esta primera versión:

* React.
* TypeScript.
* Vite.
* Tailwind CSS.
* React Router.
* Recharts para gráficos.
* Lucide React para íconos.
* TanStack Table o tabla propia bien estructurada.
* React Hook Form para formularios si se implementan formularios reales.
* Zod para validaciones si se implementan formularios reales.
* Mock data local en TypeScript.

### Backend

**Pending.**

No desarrollar backend complejo en esta etapa.

Futuro backend a definir:

* Node.js / Express.
* NestJS.
* Spring Boot.
* Backend serverless.
* Otro.

No tomar decisión definitiva sin validación.

### Database

**Pending.**

No hay base de datos real en la primera etapa.

La futura base probablemente será relacional.

Opción probable:

* PostgreSQL.

Posibles alternativas:

* PostgreSQL autogestionado.
* Neon.
* Railway.
* Render PostgreSQL.
* Supabase usando PostgreSQL.
* AWS RDS PostgreSQL.
* Google Cloud SQL PostgreSQL.
* Azure Database for PostgreSQL.

**Important:** Supabase puede ser una alternativa futura, pero no debe tratarse como obligatorio salvo decisión explícita.

### Deployment

**Pending.**

Para frontend se puede evaluar:

* Vercel.
* Netlify.
* Render Static Site.
* Hosting propio.

### External services

Primera etapa:

* Ningún servicio externo obligatorio.
* No conectar APIs reales.
* No conectar base externa.
* No usar almacenamiento real.

Futuro:

* Base de datos PostgreSQL.
* Storage de adjuntos.
* Autenticación.
* Servicio de email/alertas.
* Exportación PDF.
* Exportación Excel.
* OCR para facturas o pólizas si se define.

---

## Architecture notes

La arquitectura debe seguir una estrategia **mock-first, backend-ready, database-ready**.

Esto significa:

* La primera versión usa datos ficticios.
* Las pantallas no deben quedar acopladas directamente a datos hardcodeados dentro del componente.
* Debe existir separación entre UI, datos y reglas de negocio.
* Deben usarse tipos/interfaces claras.
* Debe prepararse una futura capa de repositorios o servicios.
* La futura conexión a backend/base de datos debe poder agregarse sin rehacer toda la UI.

Arquitectura conceptual:

```text
UI Page / Component
  -> Hook or Service
    -> Repository
      -> Mock data now
      -> API/backend/database in the future
```

No asumir Supabase como destino obligatorio.

La arquitectura futura debe ser compatible con una base relacional, especialmente PostgreSQL.

---

## Frontend architecture

Estructura recomendada:

```text
frontend/
  src/
    app/
      App.tsx
      routes.tsx
      providers.tsx

    modules/
      dashboard/
      assets/
      insurance/
        policies/
        accounting-documents/
        financial-analysis/
        economic-analysis/
      producers/
      fire-extinguishers/
      settings/

    shared/
      components/
        layout/
        sidebar/
        topbar/
        page-header/
        cards/
        data-table/
        filters/
        charts/
        badges/
        forms/
        modals/
        file-upload/
        empty-states/
      hooks/
      utils/
      constants/
      types/

    data/
      mock-assets.ts
      mock-policies.ts
      mock-documents.ts
      mock-installments.ts
      mock-producers.ts
      mock-fire-extinguishers.ts
      mock-companies.ts
      mock-cost-centers.ts

    services/
      repositories/
        asset.repository.ts
        policy.repository.ts
        accounting-document.repository.ts
        producer.repository.ts
        fire-extinguisher.repository.ts
```

### Layout rules

El layout general debe tener:

* AppShell fuerte.
* Sidebar fija en desktop.
* Sidebar drawer/overlay en mobile.
* Topbar.
* Buscador global.
* Área principal full width.
* Sin wrappers globales que limiten el ancho innecesariamente.
* Sin `max-width` global en dashboards, tablas o pantallas internas.
* Contenido desktop-first.
* Grids de KPIs de 3 o 4 columnas cuando el espacio lo permite.
* Tablas con overflow controlado dentro de su contenedor, nunca global.

### Shared design components

El frontend debe usar componentes compartidos:

* AppShell.
* Sidebar.
* Topbar.
* PageHeader.
* PageContent.
* KpiCard.
* MetricGrid.
* SectionCard.
* DataTable.
* FilterBar.
* StatusPill.
* Badge.
* EmptyState.
* LoadingState.
* ErrorState.
* FileDropzone.
* ChartCard.
* FormSection.
* Tabs.
* SearchInput.
* ActionButton.

No crear un diseño diferente por módulo.

---

## Backend architecture

**Pending.**

No aplica para primera etapa.

Cuando se defina backend, debe contemplar:

* API segura.
* Validaciones server-side.
* Autenticación.
* Autorización por roles.
* Auditoría.
* Conexión a PostgreSQL.
* Manejo seguro de archivos adjuntos.
* Paginación y filtros server-side.
* Exportaciones controladas.
* Migraciones versionadas.
* Backups.

---

## Data model notes

### Main entities

Entidades principales:

* Company.
* CostCenter.
* Asset.
* AssetDocument.
* Policy.
* PolicyDocument.
* AccountingDocument.
* AccountingDocumentPolicyAllocation.
* Installment.
* Producer.
* ProducerTask.
* FireExtinguisher.
* FireExtinguisherHistory.
* InsuranceCompany.
* CoverageType.
* InsuranceType.
* ProductiveUnit.
* Area.
* FixedAssetCategory.

### Company

Campos sugeridos:

* id.
* name.
* taxId.
* status.

### CostCenter

Campos sugeridos:

* id.
* code.
* name.
* companyId.
* area.
* status.

### Asset

Campos sugeridos:

* id.
* internalCode.
* name.
* assetType.
* brand.
* model.
* year.
* serialNumber.
* status.
* patrimonialValueUsd.
* valuationDate.
* observations.
* companyId.
* costCenterId.
* fixedAssetCode.
* productiveUnit.
* area.
* documents.
* createdAt.
* updatedAt.

### Policy

Campos sugeridos:

* id.
* policyNumber.
* insuranceCompany.
* producerId.
* insuranceType.
* coverageType.
* startDate.
* endDate.
* assetId nullable.
* companyId nullable.
* costCenterId nullable.
* insuredAmountArs.
* exchangeRate.
* insuredAmountUsd.
* description.
* status.
* documents.
* createdAt.
* updatedAt.

### AccountingDocument

Campos sugeridos:

* id.
* documentType.
* documentNumber.
* issueDate.
* currency.
* exchangeRate.
* netAmount.
* vatAmount.
* otherTaxesAmount.
* totalAmount.
* paymentStatus.
* pdfUrl.
* createdAt.
* updatedAt.

### AccountingDocumentPolicyAllocation

Entidad intermedia para asignar documentos a pólizas.

Campos sugeridos:

* id.
* accountingDocumentId.
* policyId.
* allocatedAmount.
* allocationPercentage.

### Installment

Campos sugeridos:

* id.
* accountingDocumentId.
* installmentNumber.
* dueDate.
* amount.
* currency.
* paymentStatus.
* paidAt nullable.

### Producer

Campos sugeridos:

* id.
* name.
* registrationNumber.
* phone.
* email.
* address.
* status.

### ProducerTask

Campos sugeridos:

* id.
* title.
* description.
* producerId.
* policyId nullable.
* assetId nullable.
* assignedTo nullable.
* dueDate.
* priority.
* status.
* createdAt.
* completedAt nullable.

### FireExtinguisher

Campos sugeridos:

* id.
* code.
* type.
* capacity.
* chargeDate.
* expirationDate.
* associatedAssetId nullable.
* associatedLocationType.
* status.
* observations.
* createdAt.
* updatedAt.

### FireExtinguisherHistory

Campos sugeridos:

* id.
* fireExtinguisherId.
* eventType.
* eventDate.
* previousValue.
* newValue.
* observations.
* createdBy.

---

## Security rules specific to this project

Aunque la primera etapa sea mock, el sistema debe diseñarse como software empresarial seguro.

### General security rules

* No hardcodear credenciales reales.
* No usar claves reales en frontend.
* No conectar servicios externos sin autorización.
* No exponer información sensible innecesariamente.
* Validar datos de formularios.
* Preparar validaciones server-side en futura etapa backend.
* No permitir documentos sin póliza asociada.
* No permitir pólizas sin activo y sin empresa/centro de costo.
* Preparar control de roles.
* Preparar auditoría para cambios críticos.
* Preparar manejo seguro de archivos.
* Preparar permisos por empresa si el sistema escala a multiempresa.
* Evitar lógica sensible solo en frontend cuando exista backend.

### Sensitive business information

La siguiente información debe tratarse como sensible:

* Valores patrimoniales.
* Montos asegurados.
* Facturas.
* Estados de pago.
* Centros de costo.
* Distribución por empresa.
* Pólizas.
* Certificados.
* Documentación adjunta.
* Información de productores.
* Vencimientos críticos.

---

## UI/UX notes

La interfaz debe sentirse como un software empresarial premium, no como una UI genérica generada por IA.

Inspiración visual:

* Replit visual polish.
* Lovable visual completeness.
* Linear clarity.
* Odoo enterprise structure.
* HubSpot admin experience.
* Monday dashboard density.
* ERP / CRM / finance dashboards modernos.

### UI requirements

Debe incluir:

* Sidebar moderna.
* Topbar.
* Buscador global.
* Dashboard ejecutivo.
* Cards KPI.
* Tablas avanzadas.
* Filtros dinámicos.
* Gráficos.
* Exportación Excel.
* Exportación PDF.
* Drag & Drop visual para adjuntos.
* Modo oscuro.
* Diseño responsive.
* Badges de estado.
* Estados vacíos.
* Alertas visuales.
* Detalles tipo ficha.
* Tablas compactas.

### Desktop-first

El sistema debe priorizar desktop.

Validar especialmente:

* 1366x768.
* 1440x900.
* 1920x1080.

Mobile y tablet deben funcionar correctamente, pero el diseño principal no debe parecer una interfaz móvil estirada a escritorio.

### Visual quality rules

* No iconos tapando números.
* No números desbordados.
* No textos pegados a bordes.
* No tablas rompiendo el layout.
* No scroll horizontal global en desktop.
* No cards blancas perdidas sobre fondo blanco.
* No formatos inconsistentes de moneda.
* No módulos con estilos distintos.
* No diseño tipo landing page.
* No UI genérica de dashboard IA.
* No exceso de minimalismo.
* No colores aleatorios.
* No sombras/radios inconsistentes.
* No botones inconsistentes.

### Formatting rules

Usar formato numérico consistente:

* KPIs: formato compacto profesional.

  * Ejemplo: `AR$ 266,5M`, `US$ 23,0M`.
* Tablas: formato completo.

  * Ejemplo: `AR$ 266.500.000,00`, `US$ 23.000.000,00`.
* Detalles: formato completo o medio según contexto, pero consistente.

Crear helpers de formato:

* `formatCurrencyCompact`.
* `formatCurrencyFull`.
* `formatNumber`.
* `formatPercent`.
* `formatDate`.

---

## Important flows

### Flow 1 — Dashboard ejecutivo

1. Usuario ingresa al sistema.
2. Visualiza KPIs principales.
3. Consulta activos, pólizas, facturas, vencimientos y matafuegos.
4. Accede rápidamente a módulos principales.

### Flow 2 — Listado de activos

1. Usuario entra a Gestión de Activos.
2. Ve KPIs del módulo.
3. Filtra por tipo, estado o empresa.
4. Busca por código, nombre o tipo.
5. Accede al detalle del activo.

### Flow 3 — Detalle de activo / Ficha patrimonial

1. Usuario abre un activo.
2. Visualiza ficha patrimonial ejecutiva.
3. Consulta datos generales.
4. Consulta imputación contable.
5. Consulta valor patrimonial, valor asegurado y diferencia.
6. Consulta observaciones.
7. Consulta pólizas asociadas.
8. Consulta documentos.
9. Consulta matafuegos.
10. Consulta adjuntos.

### Flow 4 — Crear póliza asociada a activo

1. Usuario crea póliza.
2. Selecciona activo.
3. Sistema relaciona póliza con activo.
4. Se cargan datos de compañía, productor, cobertura y vigencia.
5. Se cargan montos asegurados.
6. Se adjuntan documentos.
7. La póliza aparece en ficha del activo.

### Flow 5 — Crear póliza sin activo

1. Usuario crea póliza.
2. No selecciona activo.
3. Sistema exige empresa y centro de costo.
4. Usuario guarda póliza.
5. La póliza queda disponible para documentos contables.

### Flow 6 — Crear documento contable

1. Usuario crea documento contable.
2. Selecciona una o varias pólizas.
3. Carga tipo, número, fecha, moneda e importes.
4. Asigna importe por póliza.
5. Sistema calcula porcentaje de participación.
6. Usuario adjunta PDF.
7. Usuario carga cuotas.
8. Documento impacta en análisis financiero y económico.

### Flow 7 — Cuotas y estado de pago

1. Usuario consulta documento.
2. Visualiza cuotas.
3. Cambia estado de pago.
4. El sistema refleja pendiente, parcial o pagado.
5. La información alimenta análisis financiero.

### Flow 8 — Análisis financiero

1. Usuario abre análisis financiero.
2. Selecciona moneda.
3. Selecciona agrupación de filas.
4. Selecciona período de columnas.
5. Visualiza cuotas pagadas y pendientes.
6. Consulta totales.

### Flow 9 — Análisis económico

1. Usuario abre análisis económico.
2. Selecciona moneda.
3. Selecciona agrupación.
4. Sistema usa fecha de documento e importe total.
5. Visualiza costos por período, empresa, centro de costo, activo o póliza.

### Flow 10 — Productores

1. Usuario consulta productores.
2. Abre perfil.
3. Ve pólizas gestionadas.
4. Ve prima administrada.
5. Consulta o asigna tareas.
6. Controla cumplimiento.

### Flow 11 — Matafuegos

1. Usuario consulta matafuegos.
2. Registra o edita matafuego.
3. Asocia a activo o ubicación.
4. Consulta fecha de carga y vencimiento.
5. Sistema muestra estado vigente, próximo a vencer o vencido.

---

## Environment variables

### Current mock-first stage

```bash
# No required environment variables for the mock-only frontend stage.
```

### Future backend/database stage

Pending.

Variables posibles cuando se defina arquitectura:

```bash
DATABASE_URL=pending
JWT_SECRET=pending
APP_ENV=pending
FILE_STORAGE_PROVIDER=pending
```

Si se usa frontend separado:

```bash
VITE_API_URL=pending
```

Si se usa PostgreSQL gestionado:

```bash
DATABASE_URL=postgresql://pending
```

---

## Commands

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

**Status:** Pending validation. Confirmar si existe script `test` en `package.json`.

### Migrations

```bash
pending
```

No hay migraciones en la etapa mock-first.

---

## Risks and warnings

### Technical risks

* Crear componentes demasiado acoplados a mock data.
* No separar UI de servicios/repositorios.
* Mezclar reglas de negocio dentro de componentes visuales.
* Definir mal el modelo de datos antes de validar pantallas.
* Conectar base de datos antes de tener claros los flujos.
* Asumir Supabase sin decisión confirmada.
* No preparar correctamente relaciones muchos-a-muchos entre documentos y pólizas.
* No modelar correctamente distribución de importes por póliza.
* Confundir análisis financiero con análisis económico.
* No contemplar archivos adjuntos desde el diseño de datos.
* No contemplar auditoría futura.

### UX/UI risks

* Usar diseños genéricos tipo plantilla.
* Dejar demasiado espacio vacío.
* Usar layout centrado con `max-width` en pantallas empresariales.
* Crear tabs excesivamente grandes.
* No mostrar suficiente información ejecutiva.
* No diferenciar estados con claridad.
* No respetar responsive.
* No mantener consistencia visual entre módulos.
* No diseñar la ficha de activo como ficha patrimonial.
* No controlar scroll/overflow de tablas.
* No mantener formato numérico consistente.

### Business risks

* No validar roles reales con usuarios de negocio.
* No validar reglas de vencimiento.
* No validar moneda y tipo de cambio.
* No validar cómo se distribuyen costos entre pólizas.
* No validar cómo se tratarán notas de crédito.
* No validar si endosos suman, restan o modifican pólizas.
* No validar cómo se manejará refacturación.
* No validar si el estado de pago se registra por documento o por cuota.
* No validar si se requiere integración con sistema contable.
* No validar si se requiere OCR de facturas o pólizas.

---

## AI-specific instructions for this project

* Do not invent business rules.
* Do not modify core flows without checking this file.
* Do not change API contracts without reviewing frontend/backend impact.
* Do not modify database schema without documenting migration impact.
* Do not assume Supabase as confirmed architecture.
* Do not assume PostgreSQL is final until confirmed, but treat it as the most likely relational option.
* Do not connect external services unless explicitly requested.
* Do not create backend complexity in the mock-first stage.
* Do not change the global layout without checking `docs/PROJECT_UI_CONTEXT.md`.
* Do not create generic AI-looking UI.
* Do not modify shared components without checking all screens that use them.
* Do not mix financial analysis and economic analysis.
* Do not allow accounting documents without associated policies.
* Do not allow policies without asset unless company and cost center are provided.
* Keep the first stage mock-first.
* Keep the architecture backend-ready and database-ready.
* Use Spanish labels in the UI.
* Maintain professional enterprise UX.
* Document every assumption.

---

## Assumptions

The following assumptions are not confirmed and must be validated:

1. The first version is frontend-only with mock data.
2. PostgreSQL is the most likely future database, but not confirmed.
3. Supabase is not confirmed and must not be treated as final architecture unless explicitly decided.
4. “Próximo a vencer” means within the next 30 days.
5. Payment status is operational, not formal accounting.
6. Accounting documents can be distributed across multiple policies.
7. Distribution percentage is calculated from allocated amount divided by total allocated amount.
8. Attachments will be simulated in the first stage.
9. Authentication and roles are future work.
10. Export PDF/Excel can be simulated or frontend-based in the first version.
11. Backend will be defined after validating the frontend and business flows.
12. The system may later require integration with a real accounting or ERP system.

---

## Pending decisions

* Final project name.
* Final frontend stack confirmation.
* Final backend technology.
* Final database technology.
* Final deployment platform.
* Authentication strategy.
* Authorization/roles model.
* File storage strategy.
* Export strategy.
* Whether OCR will be required.
* Whether integration with accounting systems will be required.
* Whether the system will be single-company or multi-company/multitenant.
* Exact rule for “próximo a vencer”.
* Exact behavior of endosos, notas de crédito and refacturación.
* Exact payment flow.
* Whether installments are managed at document level or can be adjusted per policy allocation.
