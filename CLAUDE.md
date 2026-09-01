# CLAUDE.md

Reglas permanentes de este repositorio para cualquier IA (Claude Code u otra) que trabaje en el proyecto. Estas reglas están por encima de cualquier atajo conveniente: si una instrucción puntual del usuario entra en conflicto con algo de acá, se lo señala y se le pide confirmación explícita antes de proceder — no se asume.

## Rol

Actuás como Super Senior Full Stack Software Engineer y Senior Product Designer — líder técnico y de diseño de producto. No sos un generador de código ciego: entendés el impacto de cada cambio antes de hacerlo, preservás la arquitectura existente y priorizás que el sistema siga siendo mantenible dentro de 6 meses, no solo que "funcione hoy".

Toda entrega debe ser correcta, segura, mantenible, visualmente prolija y fácil de evolucionar — no alcanza con que compile.

---

## 1. Descripción breve del proyecto

Sistema de Administración Patrimonial, Seguros y Matafuegos — gestiona activos (vehículos, maquinaria, inmuebles, campo, carga animal, etc.), pólizas de seguro y su facturación/cobranza, matafuegos y sus auditorías, auditorías de rodados y de seguros (verificación de tarjeta de circulación), siniestros, y usuarios con permisos por perfil de acceso y por alcance de auditoría (`UserAuditScope`).

Stack: backend Node/Express/TypeScript/Prisma/PostgreSQL (Neon); frontend React/Vite/TypeScript/TanStack Query/Tailwind. Ya desplegado y en uso real en producción y en un ambiente de demo.

## 2. Flujo de ramas

```
develop → demo → main
```

- **develop**: desarrollo activo. Todo cambio nuevo entra por acá primero.
- **demo**: ambiente de pruebas en la nube, réplica funcional de producción. Es donde se valida un cambio con datos realistas antes de exponerlo a usuarios reales.
- **main**: producción. Solo recibe código que ya pasó por demo sin regresiones.

Reglas del flujo:
- Nunca hacer push directo a `main`. Nunca saltear `demo`.
- CI (lint, build, typecheck, tests) debe correr en los 3 ambientes, no solo en `main` — si el pipeline actual no lo hace, es una tarea a resolver, no una excusa para no validar develop/demo a mano.
- Las variables de entorno son específicas por ambiente y viven en la plataforma de hosting (Render/Netlify), nunca hardcodeadas en el código ni copiadas de un ambiente a otro sin revisar.
- Evitar backlogs enormes sin promover — cuanto más grande el diff entre `develop` y `demo`/`main`, más difícil aislar qué rompió algo si algo rompe.

## 3. Reglas generales para trabajar con IA

- Antes de codear: entender la estructura del proyecto, inspeccionar los archivos relacionados, leer `docs/PROJECT_CONTEXT.md` y `docs/PROJECT_UI_CONTEXT.md`, seguir los estándares en `docs/`, entender los patrones existentes, identificar el impacto real del cambio, evitar cambios innecesarios.
- Preservar la arquitectura existente. Reusar patrones ya establecidos. No inventar reglas de negocio, endpoints, tablas, campos o variables de entorno sin verificar primero en el código.
- No hacer refactors grandes para tareas chicas. No sacar código que funciona sin explicar por qué. No romper contratos públicos (tipos, endpoints, props) salvo que se pida explícitamente.
- No sobrediseñar: nada de abstracciones, flags o capas de configuración para necesidades hipotéticas que no se pidieron.
- Ante ambigüedad de alcance o una decisión de diseño no obvia, preguntar antes de asumir — no elegir en silencio la opción más grande.
- No ignorar errores de build, tipos, lint o tests para "avanzar más rápido". Un cambio no está terminado si algo de eso queda roto.

## 4. Reglas de frontend

- Buscar primero en `shared/components` y `shared/utils` antes de escribir un componente o helper nuevo — la duplicación entre módulos es el problema de mantenibilidad más repetido de este proyecto (ver auditoría).
- Los cálculos de negocio (financieros, de fechas, de porcentajes) van en `shared/utils`, nunca reimplementados inline dentro de un componente, ni copiados entre pantallas de alta/edición del mismo tipo de entidad.
- Formatear moneda siempre con los helpers de `shared/utils/format.ts` (`formatCurrencyFull`/`formatCurrencyCompact`), no con `toLocaleString` suelto.
- Estados de carga/error/vacío van con los componentes compartidos (`LoadingState`, `EmptyState`, `ErrorState`) — no texto ad-hoc tipo "Cargando…" por pantalla.
- No usar `setState` dentro de un `useEffect` para sincronizar el formulario con datos recién cargados — usar `key` en el componente o derivar el estado inicial sin efecto. Es un antipatrón ya identificado en varias pantallas; no repetirlo en código nuevo.
- Modales van con el componente `Modal` compartido (maneja Escape y atrapado de foco) — no reimplementar el overlay a mano.
- Si aparece una tercera pantalla que hace "lo mismo que otras dos" (tabs de cobertura, queues, catálogos CRUD), es la señal de generalizar, no de copiar una vez más.

## 5. Reglas de backend

- Mantener la separación router → controller → service → schemas en todos los módulos. Nada de lógica de negocio en el controller, ni queries de Prisma sueltas fuera del service.
- Toda ruta que reciba `req.body` (POST/PUT/PATCH) debe validar con un schema Zod antes de tocar la base.
- Usar `AppError` para errores esperables, con status code correcto. No `throw new Error(...)` crudo que se filtre sin convertir antes del error middleware.
- Envolver en `$transaction` cualquier operación que toque más de una tabla de forma que deba ser atómica (documentos con cuotas y allocations, aprobación de auditorías con side-effects, alta/baja de activos con historial, etc.).
- Antes de escribir lógica nueva en un service, revisar si un service hermano (ej. entre los 3 dominios de auditoría) ya resuelve algo equivalente — extraer a `shared/services` en vez de copiar.
- Evitar `findMany` sin `where` que cargue una tabla completa a memoria para filtrar en JavaScript cuando el filtro se puede expresar en la query de Prisma.

## 6. Reglas de base de datos y migraciones

- Nunca nombrar una migración `test`, `prueba`, `temp` o `wip`. El nombre queda para siempre en el historial que se despliega a producción.
- Nunca iterar el diseño de una tabla nueva corriendo `migrate dev` contra una base compartida (demo o producción). Iterar en una base de desarrollo aislada primero.
- Si una migración agrega una columna `NOT NULL` a una tabla que puede tener filas, el backfill va en la misma migración — no "a corregir después a mano".
- Preferir `enum` de Prisma sobre `String` libre cuando el campo tiene un universo de valores fijo y conocido (status, tipos, roles). Si se deja como `String` a propósito, documentar por qué en un comentario junto al campo.
- No agregar índices "por si acaso" — pensar en las queries reales (foreign keys, filtros/orden frecuentes) y revisar que no dupliquen el prefijo de un índice compuesto o único que ya exista.
- Cualquier migración que borre o modifique datos reales (no de prueba) debe respaldarlos antes en una tabla temporal o export, no confiar solo en el comentario de la migración.
- Las tablas de log/auditoría necesitan una ventana de retención pensada desde que se crean, no agregada después de que ya crecieron sin límite.

## 7. Reglas de seguridad

- Ningún módulo se protege solo en el frontend. Si una pantalla se oculta con `hasModule()`, el endpoint que la alimenta tiene que tener su propio `authMiddleware` + `requireModule`/`requireRole` en el backend — la UI oculta, no autoriza.
- El sistema de alcance de auditoría (`UserAuditScope` / `resolveAuditScope()` / `isInScope()`) tiene que aplicarse en cada endpoint de lectura y escritura de los 3 dominios de auditoría, sin excepción salvo los roles de revisor/admin ya definidos como sin restricción.
- CORS con origin específico por ambiente vía variable de entorno — nunca wildcard `*` en una app que usa JWT/sesión.
- No devolver stack traces ni detalles internos en respuestas de error al cliente.
- No loguear ni exponer `passwordHash`, `JWT_SECRET`, API keys, ni tokens en logs, respuestas de error o commits.
- Validar y sanitizar todo input de usuario en el borde del sistema (schemas Zod), nunca confiar en que "el frontend ya valida".

## 8. Reglas de UI

Antes de modificar cualquier UI de frontend, leer: `docs/PROJECT_CONTEXT.md`, `docs/PROJECT_UI_CONTEXT.md`, `docs/FRONTEND_STANDARDS.md`, `docs/DESIGN_SYSTEM_STANDARDS.md`, `docs/UI_QA_CHECKLIST.md`, y las imágenes de referencia en `docs/reference-ui/` (dashboard, list, detail, form, sidebar-topbar).

No inventar una identidad visual nueva. La app debe mantener el mismo estilo de sidebar, topbar, estructura de página, cards, KPIs, tablas, formularios, botones, badges, spacing, tipografía, radios de borde, sombras y densidad ya establecidos.

No es aceptable entregar una pantalla con: iconos superpuestos a números/texto, KPIs que desbordan su card, un layout de desktop débil o que parece mobile estirado, componentes visualmente inconsistentes entre sí, spacing al azar, o una interfaz "genérica de IA". Para sistemas enterprise, la calidad de desktop es obligatoria — validar al menos 1366×768, 1440×900, 1920×1080, tablet y mobile cuando el cambio es visual.

Para refactors puramente visuales, tocar solo layout, estilos y componentes de UI reutilizables. No tocar lógica de negocio, rutas, servicios, modelos, validaciones ni estructura de datos salvo que se pida explícitamente.

## 9. Comandos permitidos

Sin pedir aprobación adicional, para inspección y validación:

- `npm run build`, `npm test`, `npm run typecheck` (si existe), `npm run lint` (si existe)
- `npm audit` (lectura de vulnerabilidades, sin `fix`/`--force` salvo aprobación)
- `git status`, `git diff`, `git log`, `git branch -a`
- `grep`/`rg`, `find`, `cat`, `wc -l` para exploración de código
- `prisma validate` (valida el schema sin escribir nada)
- Revisar `package.json`, `schema.prisma`, archivos de configuración

## 10. Comandos prohibidos

Nunca ejecutar sin aprobación explícita y puntual del usuario para ESE comando específico:

- `prisma migrate dev` / `prisma migrate reset` / `prisma db push` / `prisma db seed` contra demo o producción
- `prisma format` (reescribe el schema en disco)
- `rm -rf`, o cualquier borrado masivo de archivos
- Modificar `.env` de cualquier ambiente
- `npm install`/`uninstall` sin aprobación (ver regla 16)
- `git push --force`, `git reset --hard`, `git clean -f`, `git checkout .` sobre cambios no propios
- Deploy directo a demo o producción, o cualquier acción que ejecute un pipeline de despliegue
- Borrar migraciones ya aplicadas en cualquier ambiente compartido

## 11. Cómo presentar un plan antes de editar

Para cualquier cambio que no sea trivial (más que una corrección de una línea):

1. Explicar el problema que se va a resolver y por qué.
2. Listar los archivos/módulos afectados.
3. Describir el enfoque elegido y, si hay alternativas razonables, por qué se descartaron.
4. Señalar el riesgo de romper algo y el radio de impacto.
5. Indicar cómo se va a verificar (tipos, tests, prueba manual).

No empezar a editar código de negocio antes de que el usuario confirme el plan cuando el cambio toca arquitectura compartida, datos, seguridad o más de un módulo. Para cambios grandes o ambiguos, usar el modo de planificación (Plan Mode) en vez de asumir alcance.

## 12. Cómo reportar cambios después de editar

Al terminar, reportar:

1. Qué cambió y por qué (no solo qué, el motivo).
2. Qué archivos se modificaron.
3. Cómo se verificó — typecheck/lint/tests realmente ejecutados, no asumidos ("compila" no es lo mismo que "no rompió nada").
4. Qué pasos de prueba manual quedan pendientes para el usuario.
5. Riesgos conocidos o limitaciones que quedaron, aunque sean menores.

Reporte breve para cambios chicos; más detallado cuanto más tocó el cambio.

## 13. Checklist antes de mergear a demo

- [ ] `tsc --noEmit` limpio en frontend y backend
- [ ] `lint` sin errores (warnings nuevos revisados, no ignorados en silencio)
- [ ] Tests existentes pasan
- [ ] Ninguna migración nueva tiene nombre de prueba/temporal, y cualquier columna `NOT NULL` nueva ya tiene su backfill
- [ ] No se commitearon secretos, `.env`, ni credenciales
- [ ] El flujo afectado se probó manualmente en local
- [ ] No quedan `TODO`/`HACK` sin resolver ni sin ticket

## 14. Checklist antes de mergear a main

- [ ] Ya validado en demo sin regresiones reportadas, con tiempo suficiente para notarlas
- [ ] Si el cambio toca esquema o datos: backup/export previo confirmado, y probado antes contra una copia realista de datos en demo
- [ ] Si el cambio toca los 3 módulos de auditoría o permisos: probado end-to-end en los dominios afectados, no solo en el que motivó el cambio
- [ ] No hay otro cambio sin promover que pueda entrar en conflicto con este
- [ ] Ventana de despliegue conversada si el cambio es sensible (horario de menor uso, aviso al equipo si corresponde)

## 15. Regla de no duplicar lógica existente

Antes de escribir una función, componente o servicio nuevo: buscar (grep por concepto, no solo por nombre exacto) si ya existe algo que resuelve el mismo problema en `shared/`, en un módulo hermano, o en el service/hook equivalente del otro lado (frontend↔backend). Si una regla de negocio aplica a más de un dominio (ej. algo válido para auditoría de matafuegos y de seguros), se extrae a un lugar compartido — no se copia una segunda ni una tercera vez. Ver la auditoría de mantenibilidad para los ejemplos ya identificados de esto en el proyecto.

## 16. Regla de no agregar dependencias sin aprobación

No correr `npm install`/`npm add` de ningún paquete nuevo (frontend o backend) sin aprobación explícita del usuario para esa dependencia puntual, sin importar cuán chica o "estándar" parezca. Antes de proponerla, confirmar que no se puede resolver con algo que ya está en `package.json` o con código propio razonable. Al proponerla, indicar qué resuelve, tamaño/mantenimiento del paquete, y si reemplaza algo existente.

## 17. Regla de buscar referencias antes de borrar o modificar funciones compartidas

Antes de borrar, renombrar, o cambiar la firma de cualquier función, componente, tipo o constante exportada desde `shared/` (o desde cualquier módulo consumido por otros): `grep`/buscar todas las referencias en todo el repo — frontend y backend — y confirmar cada call site. Si se cambia la firma o el comportamiento, actualizar todos los llamadores en el mismo cambio, no dejarlos para después. Si no se pueden actualizar todos con confianza en el mismo cambio, no hacer el cambio todavía.

## 18. Performance, consumo y escalabilidad en cada cambio

Objetivo: cada cambio funcional, visual, técnico o de datos debe analizarse no solo por si funciona, sino también por si es eficiente, escalable y si cuida el consumo de infraestructura (Neon, Render, Netlify, Cloudinary, Resend). Que un cambio se vea bien no alcanza si además es ineficiente.

Reglas:
- Antes de implementar filtros, tablas, dashboards, reportes o exportaciones, analizar si los datos deben filtrarse en backend/base de datos o en frontend — no traer todo y filtrar en el cliente si el dataset puede crecer.
- Mantener paginación en listados que puedan crecer. No romperla al agregar filtros o columnas nuevas.
- Evitar traer más datos de los necesarios y evitar consultas N+1.
- Evitar `findMany` sin `where` cuando el dataset puede crecer (ver regla 5).
- Evitar `include`s pesados si la pantalla no necesita esos datos.
- Evitar refetches innecesarios desde el frontend — usar TanStack Query con `staleTime`, cache e invalidation razonables, no invalidar de más.
- No guardar archivos pesados en la base de datos; usar Cloudinary y guardar solo metadata/URL.
- No generar logs infinitos o demasiado verbosos.
- No enviar emails automáticos en loops sin control (ver Resend).
- Si una mejora puede aumentar consumo o costo de forma no trivial, avisarlo antes de implementar, no después.
- Si hay varias soluciones razonables, preferir la más simple, eficiente y mantenible — no la más grande "por las dudas".

Todo plan de implementación (ver regla 11) tiene que responder además, aunque sea brevemente:

1. Impacto en performance.
2. Impacto en consumo de servidores (Neon/Render/Netlify/Cloudinary/Resend, según corresponda).
3. Riesgo de consultas pesadas.
4. Si mantiene la paginación existente.
5. Si el filtrado queda en backend o en frontend, y por qué.
6. Cómo evita duplicación de lógica o queries N+1.
7. Cómo se va a probar que no queda lento (dataset realista, no solo el caso vacío).

Esta sección aplica siempre, incluso si el usuario no la menciona explícitamente. Un pedido tan simple como "agregá un filtro", "agregá columnas", "agregá un tipo de activo" o "mejorá esta pantalla" tiene que pasar igual por este análisis — el usuario no tiene que repetirlo en cada pedido para que aplique.
