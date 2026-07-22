# Sistema de Administración Patrimonial, Seguros y Matafuegos

**Documentación funcional para usuarios y dirección**

---

## 1. Portada

**Nombre del sistema:** Sistema de Administración Patrimonial, Seguros y Matafuegos
*(identificado dentro de la plataforma como "Seguridad — LOS O'D")*

**Descripción breve:** Plataforma web para centralizar y controlar de forma ordenada los activos de la empresa, sus seguros, la documentación contable asociada, los matafuegos y su mantenimiento, y el análisis financiero y económico derivado de todo lo anterior.

**Área o finalidad:** Administración patrimonial, gestión de seguros corporativos y control de seguridad contra incendios (matafuegos).

**Estado actual:** Sistema en funcionamiento, desplegado en un ambiente de **producción** (uso real) y en un ambiente de **demo** independiente (pruebas y validación de cambios).

**Fecha del documento:** 21 de julio de 2026.

---

## 2. Introducción

El Sistema de Administración Patrimonial, Seguros y Matafuegos es una aplicación web interna que permite gestionar, desde un mismo lugar, todo lo relacionado con los bienes de la empresa (vehículos, maquinaria, establecimientos, edificios), las pólizas de seguro que los cubren, las facturas y demás documentos contables vinculados a esas pólizas, y el control de los matafuegos instalados en cada bien o ubicación.

Fue creado para reemplazar el uso de planillas, carpetas y controles manuales por una única fuente de información confiable, accesible desde el navegador, con historial y trazabilidad de cada dato cargado.

El sistema permite centralizar información como:

- El detalle patrimonial de cada activo de la empresa.
- Las pólizas de seguro vigentes, vencidas o próximas a vencer.
- Las facturas, notas de crédito/débito, endosos y refacturaciones asociadas a esas pólizas.
- El estado de pago de cada cuota.
- Los productores asesores de seguros y las tareas pendientes con cada uno.
- Los siniestros denunciados y su gestión hasta el cierre.
- Los matafuegos, sus vencimientos y sus auditorías periódicas.
- El costo de los seguros analizado por empresa, centro de costo, activo o póliza.

---

## 3. Problema actual que resuelve

Antes de contar con un sistema centralizado, este tipo de gestión suele estar distribuida en:

- Planillas de cálculo mantenidas por distintas personas.
- Archivos PDF sueltos (pólizas, facturas, certificados) guardados en carpetas.
- Correos electrónicos como único respaldo de gestiones importantes.
- Carpetas compartidas sin una estructura común.
- Controles manuales de vencimientos, hechos "a memoria" o con recordatorios personales.
- Información separada por área, sin relación entre sí.

Esta forma de trabajo genera problemas conocidos:

- **Dificultad para encontrar información** cuando se la necesita con urgencia.
- **Falta de trazabilidad**: no queda claro quién cargó, modificó o aprobó un dato.
- **Riesgo de vencimientos no controlados** (pólizas, matafuegos, cuotas) que pueden derivar en falta de cobertura.
- **Duplicación de carga**: la misma información se escribe varias veces en distintos archivos.
- **Dificultad para analizar costos** de forma consolidada por empresa, centro de costo o activo.
- **Dependencia de controles manuales**, sujetos a error humano y a la disponibilidad de una persona puntual.

---

## 4. Objetivo general del sistema

El sistema busca:

- Centralizar toda la información patrimonial, de seguros y de matafuegos en un único lugar.
- Ordenar la gestión de activos con una ficha completa y actualizada de cada uno.
- Controlar pólizas y vencimientos de forma sistemática, con alertas automáticas.
- Relacionar cada activo con las pólizas que lo cubren y con los matafuegos asociados.
- Registrar de manera prolija los documentos contables (facturas, notas de crédito/débito, endosos) vinculados a cada póliza.
- Controlar el estado y los vencimientos de los matafuegos, con un proceso formal de auditoría.
- Facilitar consultas rápidas y reportes exportables para la toma de decisiones.
- Mejorar el seguimiento administrativo de tareas pendientes con productores y responsables internos.

---

## 5. Beneficios principales

- **Información en un solo lugar**, accesible desde cualquier computadora con conexión a internet.
- **Mejor control de vencimientos**: pólizas, cuotas y matafuegos con alertas visuales de "vencido" y "próximo a vencer".
- **Reducción de errores manuales** al eliminar la carga duplicada en planillas separadas.
- **Mayor trazabilidad**: cada documento contable guarda un historial de creación, edición, aplicación y anulación, con fecha y responsable.
- **Facilidad para consultar** pólizas, activos y documentos desde una ficha ordenada, sin buscar en carpetas.
- **Seguimiento de matafuegos** con historial de cargas, recargas y auditorías de condición.
- **Mejor análisis económico y financiero**, con reportes que distinguen cuándo se genera un gasto y cuándo efectivamente se paga.
- **Control por empresa, centro de costo o activo**, permitiendo saber cuánto cuesta asegurar cada unidad de negocio.
- **Separación de accesos por usuario**, de modo que cada persona solo ve y gestiona lo que le corresponde.

---

## 6. Descripción general de módulos

### Dashboard general

**Para qué sirve:** es la pantalla de entrada al sistema, pensada para una lectura ejecutiva rápida.
**Qué muestra:** indicadores principales (valor patrimonial total, suma asegurada, pólizas vencidas, facturas pendientes, cuotas pendientes, matafuegos vencidos, tareas vencidas), gráficos de evolución de costos y de estado de pólizas, un ranking de prima por aseguradora, el estado general del parque de matafuegos, y listados de próximos vencimientos de pólizas y cuotas.
**Qué puede hacer el usuario:** filtrar por empresa, centro de costo y tipo de activo, y hacer clic en cualquier indicador para ir directamente al módulo correspondiente.
**Valor que aporta:** una foto instantánea del estado general de la gestión, sin necesidad de recorrer cada módulo por separado.

### Activos patrimoniales

**Para qué sirve:** es el módulo central del sistema. Permite registrar y consultar cada bien de la empresa (vehículos, maquinaria agrícola, establecimientos, edificios, infraestructura) con su ficha completa.
**Qué muestra:** listado con indicadores generales (activos totales, valor patrimonial, dados de baja, vendidos), y una ficha por activo con sus datos generales, imputación contable, valor patrimonial y asegurado, pólizas asociadas, documentos, matafuegos vinculados, siniestros, historial de valuaciones y documentación adjunta.
**Qué puede hacer el usuario:** crear y editar activos según su tipo, dar de baja un activo (sin eliminarlo, quedando su historial disponible), adjuntar documentación y fotos, asociar un matafuego existente, exportar el listado a Excel y generar una ficha en PDF de cada activo.
**Valor que aporta:** una única fuente de verdad sobre qué tiene la empresa, cuánto vale, dónde está imputado contablemente y qué seguros y matafuegos tiene asociados.

### Pólizas de seguro

**Para qué sirve:** administrar cada póliza contratada, esté o no asociada a un activo puntual (por ejemplo, seguros de responsabilidad civil o colectivos se cargan asociados directamente a una empresa y centro de costo).
**Qué muestra:** listado con indicadores (vigentes, vencidas, próximas a vencer, suma asegurada total) y, en el detalle de cada póliza, sus datos de vigencia, cobertura, montos asegurados en pesos y dólares, los documentos contables vinculados (facturas, notas de crédito/débito, endosos) y las tareas relacionadas.
**Qué puede hacer el usuario:** crear y editar pólizas, asociarlas a uno o varios activos o directamente a una empresa/centro de costo, adjuntar la póliza y certificados, exportar el listado a Excel y generar una ficha en PDF.
**Valor que aporta:** visibilidad completa de la cartera de seguros de la empresa y de su estado de vigencia en todo momento.

### Documentos contables

**Para qué sirve:** registrar los documentos económicos que emite la aseguradora sobre cada póliza: facturas, notas de crédito, notas de débito, endosos, refacturaciones y asientos de ajuste.
**Qué muestra:** listado general con filtros, y en el detalle de cada documento el neto, IVA, otros impuestos y total, el estado del documento y de pago, las cuotas con su vencimiento y estado, el saldo resultante de notas de crédito/débito aplicadas, los documentos relacionados y un historial de auditoría (creación, edición, aplicación, anulación, cambios de estado de pago).
**Qué puede hacer el usuario:** crear el tipo de documento que corresponda (cada uno con su propio formulario), asignar el importe entre una o varias pólizas cuando una misma factura las incluye a todas, cargar cuotas de pago, adjuntar el PDF respaldatorio, editar, aplicar o anular un documento (con motivo), y enviar una factura por correo electrónico directamente desde el sistema.
**Valor que aporta:** ordena la parte más sensible del proceso —la facturación de seguros— dejando trazabilidad de cada modificación y evitando que una factura quede "suelta" sin póliza asociada.

### Cuotas y estado de pago

**Para qué sirve:** dentro de cada documento contable, permite dividir el pago en cuotas y llevar el control de cuáles están pagadas, parcialmente pagadas o pendientes.
**Qué muestra:** el detalle de cada cuota (número, vencimiento, importe, estado) dentro del documento correspondiente, y su consolidación en el Análisis Financiero.
**Qué puede hacer el usuario:** actualizar el estado de pago de cada cuota a medida que se van abonando.
**Valor que aporta:** permite saber, en cualquier momento, qué compromisos de pago están pendientes y cuáles ya se resolvieron.

### Productores asesores de seguros

**Para qué sirve:** administrar la cartera de productores (intermediarios entre la empresa y las aseguradoras) y las tareas operativas vinculadas a cada uno.
**Qué muestra:** una ficha por productor con sus datos de contacto y matrícula, la cantidad de pólizas que gestiona y sus tareas activas y vencidas. Dentro del mismo módulo, un panel de **Tareas** centraliza todas las tareas pendientes, en curso, vencidas y finalizadas, con su prioridad y a qué productor, póliza o activo están vinculadas.
**Qué puede hacer el usuario:** consultar el detalle de cada productor, crear y asignar tareas (por ejemplo, "renovar póliza", "solicitar endoso", "gestionar siniestro") con fecha límite y prioridad, y hacer seguimiento de su cumplimiento.
**Valor que aporta:** evita que las gestiones con productores dependan de recordatorios informales, dejando un registro claro de qué está pendiente y con quién.

### Siniestros

**Para qué sirve:** registrar y hacer seguimiento de cada siniestro denunciado sobre un activo, propio o de terceros, hasta su cierre.
**Qué muestra:** listado con indicadores (en gestión, liquidados, monto reclamado, monto liquidado) y, en el detalle, los importes de valor real, reclamado, liquidado, franquicia y descubierto, los gastos asociados (mano de obra, repuestos, otros), la documentación y fotos adjuntas, y una línea de tiempo con cada evento del siniestro.
**Qué puede hacer el usuario:** crear y editar un siniestro, cargar gastos asociados, adjuntar documentación y fotos (es el único módulo que también acepta videos como evidencia), cambiar el estado del siniestro y generar una ficha en PDF.
**Valor que aporta:** centraliza toda la gestión de un siniestro —desde la denuncia hasta el cobro— en un único registro consultable, en lugar de dispersarse entre correos y carpetas.

### Matafuegos

**Para qué sirve:** registrar y controlar los matafuegos de la empresa, asociados a vehículos, maquinaria, establecimientos, edificios o infraestructura.
**Qué muestra:** listado con indicadores (vigentes, próximos a vencer, vencidos, total) y ficha de cada matafuego con tipo, capacidad, fechas de carga y vencimiento, y vencimiento de la prueba hidráulica.
**Qué puede hacer el usuario:** dar de alta y editar matafuegos, registrar una recarga en bloque para varios matafuegos a la vez, exportar el listado a Excel y generar una ficha en PDF de cada uno.
**Valor que aporta:** asegura que ningún matafuego quede vencido sin que se note, cumpliendo con la obligación de seguridad de mantenerlos vigentes.

### Auditoría de matafuegos

**Para qué sirve:** formalizar el proceso de revisión periódica de cada matafuego en el terreno, más allá del simple control de vencimiento.
**Qué muestra:** un panel de cobertura con los matafuegos pendientes y auditados en el período, y un panel de auditorías con su estado (enviada, necesita corrección, aprobada, rechazada). También existe un **Dashboard de Matafuegos** con la cobertura de auditoría del período, pendientes de revisión, distribución por tipo y un informe de hallazgos descargable en PDF, agrupado por establecimiento.
**Qué puede hacer el usuario:** un auditor completa un recorrido guiado paso a paso (ubicación del matafuego, validación de sus datos, checklist de condición con fotos y resumen final); quien tiene el permiso de revisión decide aprobar, rechazar o pedir una corrección sobre cada auditoría enviada.
**Valor que aporta:** deja constancia formal de que los matafuegos fueron efectivamente inspeccionados, con evidencia fotográfica y un circuito de aprobación, no solo de que "no vencieron".

### Análisis financiero

**Para qué sirve:** analizar cuándo se paga o vence el dinero comprometido en seguros, en base a las cuotas.
**Qué muestra:** una matriz configurable (por empresa, centro de costo, activo o póliza en las filas; por semana, mes o trimestre en las columnas), con el total pagado, pendiente y general, en pesos o en dólares.
**Qué puede hacer el usuario:** elegir la agrupación, el período y la moneda, y exportar la matriz a Excel o PDF.
**Valor que aporta:** permite anticipar el flujo de pagos futuros y detectar cuotas vencidas sin abonar.

### Análisis económico

**Para qué sirve:** analizar el costo de los seguros según la fecha en que se generó el gasto (fecha de la factura), independientemente de cuándo se pague.
**Qué muestra:** una matriz similar a la del análisis financiero, pero agrupando también por aseguradora y por año, con el costo total del período y la distribución por aseguradora.
**Qué puede hacer el usuario:** elegir la agrupación, el período y la moneda, y exportar a Excel o PDF.
**Valor que aporta:** permite conocer el costo real de asegurar cada activo, empresa o centro de costo, sin mezclar ese análisis con el estado de los pagos.

### Usuarios y perfiles de acceso

**Para qué sirve:** administrar quién puede ingresar al sistema y qué puede ver o hacer cada persona.
**Qué muestra:** el listado de usuarios y el listado de perfiles de acceso configurados.
**Qué puede hacer el usuario (con permiso de administración):** crear usuarios con una contraseña temporal, resetear contraseñas, y armar perfiles de acceso eligiendo qué módulos habilita cada uno.
**Valor que aporta:** garantiza que cada persona acceda solo a la información que le corresponde según su función. Más detalle en la sección 9.

### Adjuntos y documentación

**Para qué sirve:** respaldar con documentación real cada activo, póliza, documento contable o siniestro.
**Qué muestra:** en cada módulo que lo requiere, una zona para arrastrar archivos o seleccionarlos manualmente (y, desde el celular, tomar una foto directamente).
**Qué puede hacer el usuario:** adjuntar PDF, imágenes y planillas en la mayoría de los módulos; en Siniestros, además, adjuntar videos como evidencia.
**Valor que aporta:** evita depender de carpetas externas para encontrar el respaldo de cada gestión.

### Notificaciones y correo electrónico

**Para qué sirve:** centralizar las alertas de vencimiento de todo el sistema y permitir el envío de documentación por correo.
**Qué muestra:** un panel de notificaciones con pólizas, matafuegos, cuotas y adjuntos próximos a vencer o vencidos, cada uno marcable como revisado.
**Qué puede hacer el usuario:** revisar y marcar alertas, y enviar una factura por correo electrónico directamente desde su ficha, con un resumen del contenido antes de confirmar el envío.
**Valor que aporta:** reduce la posibilidad de que un vencimiento pase inadvertido y agiliza el envío de documentación a terceros.

> Este panel de notificaciones y el envío de correo están disponibles hoy solo para el perfil de Administrador y, en el caso del envío de mail, únicamente desde las facturas. Ampliar esta función a otros documentos es una mejora posible a futuro (ver sección 12).

### Configuración y catálogos

**Para qué sirve:** mantener actualizadas las listas de referencia que usa el resto del sistema, para que la información se cargue de forma estandarizada.
**Qué muestra e incluye:**
- **Empresas** y **Centros de Costo**, usados para imputar activos y pólizas.
- **Bienes de Uso**, el catálogo contable de referencia para clasificar activos.
- **Tipos de Seguro**, usados al cargar pólizas.
- **Configuración de Módulos**, donde se administran listas más específicas por módulo (por ejemplo: tipos de vehículo, tipos de siniestro, marcas y capacidades de matafuegos, formas de pago, monedas).
**Qué puede hacer el usuario:** crear, editar y activar o desactivar cada valor de estas listas.
**Valor que aporta:** evita que la misma información se escriba de formas distintas según quién la carga, manteniendo los reportes consistentes.

---

## 7. Funcionamiento básico del sistema

El recorrido habitual de uso del sistema es:

1. Ingresar con usuario y contraseña.
2. Consultar el dashboard general para tener una visión rápida del estado de la gestión.
3. Cargar o buscar un activo patrimonial.
4. Asociarle las pólizas de seguro correspondientes.
5. Registrar los documentos contables (facturas y sus modificaciones) vinculados a esas pólizas.
6. Controlar los vencimientos de pólizas y cuotas desde el dashboard o las notificaciones.
7. Revisar el estado de los matafuegos asociados a cada activo o establecimiento.
8. Registrar las auditorías periódicas de matafuegos.
9. Consultar los reportes de análisis financiero y económico para evaluar costos.

---

## 8. Ejemplo práctico de uso

**Ejemplo 1 — Activo con seguro:**
Se carga una camioneta como activo patrimonial, indicando su valor y a qué empresa y centro de costo pertenece. Luego se le asocia una póliza de seguro vigente. Cuando la aseguradora emite la factura correspondiente, se registra como documento contable vinculado a esa póliza, con sus cuotas de pago. A partir de ahí, el sistema permite consultar en todo momento si la camioneta tiene seguro vigente, si hay cuotas pendientes, y cuánto cuesta asegurarla dentro del centro de costo al que pertenece.

**Ejemplo 2 — Auditoría de matafuegos:**
Un responsable de seguridad ingresa al sistema, entra al módulo de Auditoría de Matafuegos y selecciona el matafuego que va a revisar. Confirma su ubicación, valida sus datos (marca, capacidad, vencimientos), completa un checklist de condición (limpieza, carga, precinto, manguera) adjuntando fotos, y envía la auditoría. Un responsable de aprobación revisa lo enviado y decide aprobarlo, rechazarlo o pedir una corrección, quedando todo registrado con fecha y evidencia.

---

## 9. Roles de usuario

El sistema no trabaja con una lista fija de roles con nombre (por ejemplo, no existe un rol llamado "Contador" o "Auditor" predefinido). En cambio, funciona con dos niveles:

- **Administrador**: acceso completo a todos los módulos, incluida la gestión de usuarios, perfiles de acceso y notificaciones. Es quien da de alta a las demás personas y decide qué puede ver o hacer cada una.
- **Usuario con Perfil de Acceso**: su acceso depende de un **perfil de acceso** que un administrador arma a medida, habilitando únicamente los módulos que esa persona necesita (por ejemplo, solo Pólizas y Documentos, o solo Matafuegos). Un mismo perfil puede reutilizarse para varias personas con la misma función.

Esto le da a la empresa flexibilidad para adaptar los accesos a su propia estructura, en lugar de forzar roles predefinidos. A modo de ejemplo, así se vería la configuración de perfiles típicos que un administrador podría armar (los nombres son ilustrativos, no roles fijos del sistema):

| Perfil de ejemplo | Módulos típicos que se le otorgarían | Qué podría hacer |
|---|---|---|
| Gestión de seguros | Pólizas, Documentos, Análisis Financiero/Económico, Productores | Cargar y administrar pólizas, facturas y tareas con productores |
| Gestión patrimonial | Activos | Cargar y consultar la ficha de cada activo, sus seguros y documentación |
| Auditor de matafuegos | Cobertura de Matafuegos | Realizar auditorías de campo sobre los matafuegos asignados |
| Aprobador de auditorías | Auditoría de Matafuegos, Dashboard de Matafuegos | Revisar y aprobar o rechazar auditorías enviadas por otros usuarios |
| Solo consulta | Los módulos que se necesiten, sin otorgar acciones destructivas | Ver información sin gestionar altas, bajas ni ediciones sensibles* |

*La distinción de "solo ver, no modificar" depende de qué módulos se otorguen y de cómo la empresa decida usarlos; hoy el sistema no tiene un modo de "solo lectura" separado por módulo, es una combinación posible a evaluar a futuro (ver sección 12).

---

## 10. Ambientes del sistema

El sistema está disponible en dos ambientes con datos independientes entre sí:

- **Producción:** es la versión real que usa la empresa en el día a día, con la información verdadera de activos, pólizas y documentos.
- **Demo:** es una versión de prueba, separada de la información real, pensada para validar cambios, capacitar usuarios o hacer pruebas antes de llevarlas a producción.

Además existe un **ambiente de desarrollo**, de uso exclusivo del equipo técnico, donde se prueban las mejoras antes de publicarlas en demo o producción.

No es necesario recordar direcciones ni configuraciones técnicas: cada persona accede al ambiente que le corresponde según cómo se le indique.

---

## 11. Seguridad y control

- Cada usuario ingresa al sistema con su propio usuario y contraseña.
- Las contraseñas se guardan de forma segura y nunca quedan visibles para nadie, ni siquiera para el equipo técnico.
- Cuando se crea un usuario nuevo o se resetea su contraseña, el sistema obliga a definir una contraseña propia en el primer ingreso.
- Los usuarios tienen acceso únicamente a los módulos habilitados en su perfil de acceso (ver sección 9); no todos ven ni modifican lo mismo.
- La información del ambiente de prueba (demo) está separada de la información real de producción.
- Los documentos y archivos adjuntos se almacenan de manera ordenada, vinculados siempre al activo, póliza o siniestro que corresponde.
- El sistema exige ciertos datos obligatorios antes de guardar información sensible (por ejemplo, no permite registrar una factura sin una póliza asociada), reduciendo errores de carga.

---

## 12. Estado actual del sistema

**Funcionalidades disponibles hoy:**

- Gestión completa de Activos, Pólizas, Documentos Contables y Cuotas.
- Gestión de Productores y Tareas.
- Gestión de Siniestros con gastos, adjuntos y línea de tiempo.
- Gestión de Matafuegos, con auditorías, dashboard propio e informe de hallazgos.
- Análisis Financiero y Económico con exportación a Excel y PDF.
- Dashboard ejecutivo general.
- Usuarios y perfiles de acceso configurables.
- Notificaciones de vencimientos y envío de facturas por correo.
- Exportación a Excel en todos los listados principales y fichas en PDF por registro.

**Funcionalidades en prueba o con mejoras pendientes:**

- El buscador general de la barra superior todavía no ejecuta búsquedas; está previsto para una etapa posterior.
- Algunos indicadores de cumplimiento en la pantalla de Productores (tareas vencidas, porcentaje de cumplimiento) aún no reflejan datos reales y están pendientes de conectar.
- El envío de correo desde las facturas depende de que el servicio de email esté habilitado en el ambiente donde se use; si no lo está, el sistema lo informa claramente en lugar de fallar.

**Posibles mejoras futuras:**

- Recuperación de contraseña de forma autónoma (sin depender de un administrador).
- Extender el envío de correo a pólizas y otros tipos de documentos, no solo facturas.
- Importación masiva de datos desde Excel para acelerar la carga inicial.
- Integración con un sistema contable externo.
- Reportes adicionales según necesidades que surjan del uso diario.
- Un procedimiento formal de solicitud y aprobación para el alta de usuarios nuevos.

---

## 13. Recomendaciones de uso

- Mantener los datos de activos y pólizas actualizados apenas ocurra un cambio.
- Revisar periódicamente los vencimientos de pólizas, cuotas y matafuegos, incluso si hay notificaciones automáticas.
- Usar correctamente los perfiles de acceso: otorgar solo los módulos que cada persona realmente necesita.
- No compartir usuarios entre distintas personas, para mantener la trazabilidad de quién hizo cada cambio.
- Cargar siempre la documentación respaldatoria (pólizas, facturas, certificados) como adjunto del registro correspondiente.
- Validar la información en el ambiente de demo antes de dar por buena una carga masiva o un cambio importante en producción.
- Usar el ambiente de demo para capacitar a nuevos usuarios sin riesgo sobre los datos reales.

---

## 14. Próximos pasos sugeridos

- Completar la carga inicial de todos los activos, pólizas y matafuegos reales que aún no estén en el sistema.
- Capacitar a los usuarios de cada área en el uso del sistema y de sus perfiles de acceso.
- Validar con las áreas administrativas y de seguros los perfiles de acceso definidos antes de habilitarlos de forma definitiva.
- Evaluar la importación de datos desde Excel para acelerar cargas masivas.
- Evaluar una futura integración con Finnegans u otro sistema contable/administrativo.
- Sumar reportes adicionales a medida que se identifiquen nuevas necesidades de análisis.
- Extender las notificaciones y el envío de correo a más tipos de documentos.
- Definir un procedimiento formal para solicitar y aprobar el alta de nuevos usuarios.

---

## 15. Cierre

El Sistema de Administración Patrimonial, Seguros y Matafuegos reemplaza controles dispersos en planillas, archivos y correos por una gestión ordenada, trazable y centralizada. Permite a la empresa saber en todo momento qué activos tiene, cómo están asegurados, qué se debe pagar y cuándo, y si sus matafuegos están en condiciones.

Más allá de digitalizar tareas que antes se hacían a mano, el sistema aporta una base sólida para tomar decisiones con información confiable y actualizada, y una plataforma preparada para seguir creciendo a medida que la empresa lo necesite.
