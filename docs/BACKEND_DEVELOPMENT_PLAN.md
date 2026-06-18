# Plan de Desarrollo Backend — Sistema de Seguros LO

**Stack:** Express + TypeScript + Prisma + PostgreSQL (Neon) + JWT  
**Arquitectura:** REST API modular, Repository pattern, RBAC  
**Estado:** Frontend 100% completo. Backend folder vacío — listo para implementar.

---

## Índice

1. [Stack y decisiones técnicas](#1-stack-y-decisiones-técnicas)
2. [Estructura de proyecto](#2-estructura-de-proyecto)
3. [Base de datos — schema Prisma](#3-base-de-datos--schema-prisma)
4. [Módulos y fases de desarrollo](#4-módulos-y-fases-de-desarrollo)
5. [Autenticación y roles](#5-autenticación-y-roles)
6. [Contratos de API](#6-contratos-de-api)
7. [Seguridad](#7-seguridad)
8. [Reglas de negocio críticas](#8-reglas-de-negocio-críticas)
9. [Testing](#9-testing)
10. [Deployment](#10-deployment)

---

## 1. Stack y decisiones técnicas

| Layer | Tecnología | Razón |
|---|---|---|
| Framework | Express 4 + TypeScript 5 | Liviano, flexible, full control |
| ORM | Prisma 5 | Type-safe, migraciones declarativas, DX excelente |
| Base de datos | PostgreSQL 16 (Neon) | Relacional, serverless, free tier generoso |
| Autenticación | JWT (access + refresh) | Stateless, escalable, estándar de industria |
| Validación | Zod | Runtime validation + TypeScript inference automática |
| File upload | Multer + Cloudinary (o S3) | Archivos fuera de la DB, URLs persistentes |
| Testing | Jest + Supertest | Cobertura de unidad e integración |
| Documentación | Swagger (swagger-jsdoc) | Generada desde los comentarios de rutas |
| Logs | Winston | Logging estructurado, niveles por ambiente |
| Seguridad | Helmet + CORS + rate-limit | HTTP headers, CORS controlado, anti-bruteforce |

### Dependencias principales

```bash
# Core
npm install express prisma @prisma/client zod bcryptjs jsonwebtoken
npm install multer @aws-sdk/client-s3 cloudinary

# Middleware
npm install helmet cors express-rate-limit morgan winston

# Utils
npm install date-fns uuid

# Types
npm install -D typescript @types/express @types/node @types/bcryptjs @types/jsonwebtoken @types/multer @types/cors

# Dev
npm install -D ts-node-dev jest @types/jest supertest @types/supertest ts-jest
```

---

## 2. Estructura de proyecto

```
backend/
├── prisma/
│   ├── schema.prisma          # Definición completa del modelo
│   ├── migrations/            # Historial de migraciones
│   └── seed.ts                # Datos iniciales (roles, admin, tipos de seguro)
│
├── src/
│   ├── server.ts              # Entry point (puerto, listen)
│   ├── app.ts                 # Express app (middlewares, rutas)
│   ├── config/
│   │   ├── env.ts             # Variables de entorno con Zod
│   │   └── database.ts        # PrismaClient singleton
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts        # JWT verify + inject req.user
│   │   ├── roles.middleware.ts       # RBAC guard por rol
│   │   ├── validate.middleware.ts    # Zod schema validation
│   │   ├── error.middleware.ts       # Error handler global
│   │   ├── upload.middleware.ts      # Multer config
│   │   └── audit.middleware.ts       # Log de acciones por usuario
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.router.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.schemas.ts       # Zod schemas
│   │   │
│   │   ├── users/
│   │   ├── companies/
│   │   ├── cost-centers/
│   │   ├── insurance-types/
│   │   ├── assets/
│   │   ├── producers/
│   │   ├── policies/
│   │   ├── documents/
│   │   ├── fire-extinguishers/
│   │   ├── claims/
│   │   └── dashboard/
│   │
│   └── shared/
│       ├── types/
│       │   └── index.ts              # Tipos compartidos (RequestUser, etc.)
│       ├── utils/
│       │   ├── pagination.ts
│       │   ├── filters.ts
│       │   └── dates.ts              # Lógica de status por fecha
│       └── errors/
│           └── AppError.ts           # Error personalizado con status code
│
├── .env                        # LOCAL — nunca en git
├── .env.example                # Plantilla para onboarding
└── package.json
```

### Patrón por módulo (repetir para cada uno)

```
modules/assets/
├── assets.router.ts       # Rutas Express
├── assets.controller.ts   # Request/Response handlers
├── assets.service.ts      # Lógica de negocio + llamadas a Prisma
├── assets.schemas.ts      # Zod: CreateAssetSchema, UpdateAssetSchema, etc.
└── assets.types.ts        # Tipos TS del módulo (si no están en shared)
```

---

## 3. Base de datos — schema Prisma

### Tablas principales

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // Neon requiere esto para migraciones
}

// ─── Auth ───────────────────────────────────────────────

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(VIEWER)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}

enum Role {
  ADMIN
  CONTADOR
  PRODUCTOR
  VIEWER
}

// ─── Catálogos ────────────────────────────────────────────

model Company {
  id        String     @id @default(uuid())
  name      String
  cuit      String?    @unique
  email     String?
  phone     String?
  address   String?
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  policies  Policy[]

  @@map("companies")
}

model CostCenter {
  id          String             @id @default(uuid())
  name        String
  code        String?            @unique
  description String?
  isActive    Boolean            @default(true)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  allocations AssetAllocation[]

  @@map("cost_centers")
}

model InsuranceType {
  id          String              @id @default(uuid())
  name        String              @unique
  description String?
  isActive    Boolean             @default(true)
  createdAt   DateTime            @default(now())
  coverages   InsuranceCoverage[]
  policies    Policy[]

  @@map("insurance_types")
}

model InsuranceCoverage {
  id              String        @id @default(uuid())
  name            String
  description     String?
  insuranceTypeId String
  insuranceType   InsuranceType @relation(fields: [insuranceTypeId], references: [id])

  @@map("insurance_coverages")
}

// ─── Activos ──────────────────────────────────────────────

model Asset {
  id              String            @id @default(uuid())
  name            String
  assetType       String
  brand           String?
  model           String?
  serialNumber    String?
  purchaseDate    String?
  purchaseValue   Float?
  currentValue    Float?
  location        String?
  description     String?
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  allocations      AssetAllocation[]
  valueHistory     AssetValueHistory[]
  attachments      AssetAttachment[]
  fireExtinguishers FireExtinguisher[]

  @@map("assets")
}

model AssetAllocation {
  id           String     @id @default(uuid())
  assetId      String
  costCenterId String
  percentage   Float
  asset        Asset      @relation(fields: [assetId], references: [id], onDelete: Cascade)
  costCenter   CostCenter @relation(fields: [costCenterId], references: [id])

  @@map("asset_allocations")
}

model AssetValueHistory {
  id        String   @id @default(uuid())
  assetId   String
  value     Float
  date      String
  note      String?
  asset     Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@map("asset_value_history")
}

model AssetAttachment {
  id             String   @id @default(uuid())
  assetId        String
  name           String
  description    String?
  fileType       String
  fileSize       String
  fileUrl        String
  expirationDate String?
  notifyEmail    String?
  uploadedAt     DateTime @default(now())
  uploadedBy     String
  asset          Asset    @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@map("asset_attachments")
}

// ─── Productores ──────────────────────────────────────────

model Producer {
  id          String          @id @default(uuid())
  name        String
  email       String?
  phone       String?
  matrícula   String?         @unique
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  tasks       ProducerTask[]
  policies    Policy[]

  @@map("producers")
}

model ProducerTask {
  id          String   @id @default(uuid())
  producerId  String
  title       String
  description String?
  dueDate     String?
  status      String   @default("pendiente")
  createdAt   DateTime @default(now())
  producer    Producer @relation(fields: [producerId], references: [id], onDelete: Cascade)

  @@map("producer_tasks")
}

// ─── Pólizas ──────────────────────────────────────────────

model Policy {
  id               String             @id @default(uuid())
  policyNumber     String             @unique
  insuranceTypeId  String
  companyId        String
  producerId       String?
  insuredName      String
  startDate        String
  endDate          String
  premium          Float
  currency         String             @default("ARS")
  description      String?
  coverages        String[]           // IDs de InsuranceCoverage seleccionadas
  isActive         Boolean            @default(true)
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  insuranceType    InsuranceType      @relation(fields: [insuranceTypeId], references: [id])
  company          Company            @relation(fields: [companyId], references: [id])
  producer         Producer?          @relation(fields: [producerId], references: [id])
  attachments      PolicyAttachment[]
  allocations      DocumentPolicyAllocation[]

  @@map("policies")
}

model PolicyAttachment {
  id             String   @id @default(uuid())
  policyId       String
  name           String
  description    String?
  fileType       String
  fileSize       String
  fileUrl        String
  expirationDate String?
  notifyEmail    String?
  uploadedAt     DateTime @default(now())
  uploadedBy     String
  policy         Policy   @relation(fields: [policyId], references: [id], onDelete: Cascade)

  @@map("policy_attachments")
}

// ─── Documentos Contables ─────────────────────────────────

model AccountingDocument {
  id              String   @id @default(uuid())
  documentNumber  String   @unique
  documentType    String
  issueDate       String
  netAmount       Float
  vatAmount       Float    @default(0)
  otherTaxesAmount Float   @default(0)
  currency        String   @default("ARS")
  exchangeRate    Float    @default(1)
  description     String?
  paymentStatus   String   @default("pendiente")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  installments  Installment[]
  allocations   DocumentPolicyAllocation[]
  attachments   DocumentAttachment[]

  @@map("accounting_documents")
}

model Installment {
  id                    String              @id @default(uuid())
  accountingDocumentId  String
  installmentNumber     Int
  dueDate               String
  amount                Float
  paymentStatus         String              @default("pendiente")
  paymentDate           String?
  paymentMethod         String?
  notes                 String?
  document              AccountingDocument  @relation(fields: [accountingDocumentId], references: [id], onDelete: Cascade)

  @@map("installments")
}

model DocumentPolicyAllocation {
  id                   String              @id @default(uuid())
  accountingDocumentId String
  policyId             String
  allocatedAmount      Float
  allocationPercentage Float
  document             AccountingDocument  @relation(fields: [accountingDocumentId], references: [id], onDelete: Cascade)
  policy               Policy              @relation(fields: [policyId], references: [id])

  @@map("document_policy_allocations")
}

model DocumentAttachment {
  id                   String              @id @default(uuid())
  accountingDocumentId String
  name                 String
  description          String?
  fileType             String
  fileSize             String
  fileUrl              String
  uploadedAt           DateTime            @default(now())
  uploadedBy           String
  document             AccountingDocument  @relation(fields: [accountingDocumentId], references: [id], onDelete: Cascade)

  @@map("document_attachments")
}

// ─── Matafuegos ───────────────────────────────────────────

model FireExtinguisher {
  id             String                   @id @default(uuid())
  assetId        String?
  locationType   String
  location       String
  type           String
  capacity       String
  brand          String?
  serialNumber   String?
  expirationDate String
  lastRechargeDate String?
  isActive       Boolean                  @default(true)
  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt

  asset          Asset?                   @relation(fields: [assetId], references: [id])
  history        FireExtinguisherHistory[]

  @@map("fire_extinguishers")
}

model FireExtinguisherHistory {
  id                 String           @id @default(uuid())
  fireExtinguisherId String
  action             String
  date               String
  performedBy        String?
  notes              String?
  nextDueDate        String?
  createdAt          DateTime         @default(now())
  extinguisher       FireExtinguisher @relation(fields: [fireExtinguisherId], references: [id], onDelete: Cascade)

  @@map("fire_extinguisher_history")
}

// ─── Siniestros ───────────────────────────────────────────

model Claim {
  id          String       @id @default(uuid())
  policyId    String?
  title       String
  description String?
  claimDate   String
  status      String       @default("abierto")
  amount      Float?
  currency    String       @default("ARS")
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  events      ClaimEvent[]

  @@map("claims")
}

model ClaimEvent {
  id          String   @id @default(uuid())
  claimId     String
  title       String
  description String?
  date        String
  type        String
  createdBy   String?
  createdAt   DateTime @default(now())
  claim       Claim    @relation(fields: [claimId], references: [id], onDelete: Cascade)

  @@map("claim_events")
}
```

---

## 4. Módulos y fases de desarrollo

### Fase 1 — Foundation (2-3 días)

**Objetivo:** Proyecto base funcional con auth JWT y un endpoint de health check.

```
1. Inicializar proyecto:
   - npm init, tsconfig.json, .eslintrc, .prettierrc
   - Express + middleware global (helmet, cors, morgan, rate-limit)
   - Error handler global (AppError class)
   - Config de variables de entorno con Zod (env.ts)

2. Conectar Prisma + Neon:
   - prisma init
   - DATABASE_URL en .env
   - Ejecutar prisma migrate dev --name init

3. Módulo Auth:
   - POST /auth/register  (solo para admin inicial / seed)
   - POST /auth/login     → { accessToken, refreshToken }
   - POST /auth/refresh   → nuevo accessToken desde refreshToken
   - POST /auth/logout    → invalida refreshToken
   - GET  /auth/me        → usuario autenticado

4. JWT Middleware:
   - Verify access token
   - Inject req.user = { id, email, role }

5. Health check:
   - GET /health → { status: "ok", db: "connected" }
```

**Archivos clave:**
- `src/config/env.ts` — Zod schema para todas las env vars
- `src/middleware/error.middleware.ts` — catch-all error handler
- `src/middleware/auth.middleware.ts` — JWT verify
- `src/modules/auth/` — service completo con bcrypt + JWT

---

### Fase 2 — Catálogos (2 días)

**Objetivo:** CRUD de entidades de configuración. Son las más simples.

```
Módulos en orden:
  - companies      (aseguradoras)
  - cost-centers   (centros de costo)
  - insurance-types + coverages
  - users          (gestión de usuarios, solo ADMIN)
```

**Endpoints estándar por módulo:**
```
GET    /companies          → lista paginada con filtros
POST   /companies          → crear
GET    /companies/:id      → detalle
PUT    /companies/:id      → actualizar
DELETE /companies/:id      → soft delete (isActive = false)
```

**Notas:**
- Los deletes son siempre soft (isActive = false), nunca hard delete en catálogos
- Insurance coverages van anidadas en insurance-types:
  `GET /insurance-types/:id/coverages`

---

### Fase 3 — Activos (3-4 días)

**Objetivo:** Módulo más relacionado del sistema. Activos + allocations + attachments.

```
GET    /assets                     → lista con filtros (tipo, estado)
POST   /assets                     → crear con allocations en el body
GET    /assets/:id                 → detalle completo
PUT    /assets/:id                 → actualizar
DELETE /assets/:id                 → soft delete

GET    /assets/:id/allocations     → distribución por CC
PUT    /assets/:id/allocations     → reemplazar todas las allocations
GET    /assets/:id/value-history   → historial de valuaciones
POST   /assets/:id/value-history   → agregar valuación

GET    /assets/:id/attachments     → lista de adjuntos
POST   /assets/:id/attachments     → subir archivo (multipart/form-data)
DELETE /assets/:id/attachments/:attachmentId
```

**Reglas:**
- La suma de `AssetAllocation.percentage` debe ser exactamente 100
- El status del activo se computa en el GET (no se guarda):
  ```
  si tiene matafuegos → ver status de matafuegos
  si tiene fecha de vencimiento → computar por fecha
  sino → "activo"
  ```

---

### Fase 4 — Productores (2 días)

```
GET    /producers              → lista
POST   /producers              → crear
GET    /producers/:id          → detalle con tasks
PUT    /producers/:id          → actualizar

GET    /producers/:id/tasks    → tareas del productor
POST   /producers/:id/tasks    → crear tarea
PUT    /producers/:id/tasks/:taskId → actualizar tarea
DELETE /producers/:id/tasks/:taskId → eliminar tarea
```

---

### Fase 5 — Pólizas (4-5 días)

**Objetivo:** Módulo central. Conecta con companies, producers, insurance-types, documents.

```
GET    /policies                   → lista con filtros (status, company, type)
POST   /policies                   → crear
GET    /policies/:id               → detalle completo (con coverages, allocations)
PUT    /policies/:id               → actualizar
DELETE /policies/:id               → soft delete

GET    /policies/:id/attachments   → adjuntos
POST   /policies/:id/attachments   → subir adjunto
DELETE /policies/:id/attachments/:attachmentId
```

**Regla de status (computado en GET):**
```typescript
function computePolicyStatus(endDate: string): 'vigente' | 'proxima_a_vencer' | 'vencida' {
  const end = new Date(endDate)
  const today = new Date()
  const in30Days = addDays(today, 30)

  if (end < today) return 'vencida'
  if (end <= in30Days) return 'proxima_a_vencer'
  return 'vigente'
}
```

---

### Fase 6 — Documentos Contables (5-6 días)

**Objetivo:** El módulo financiero más complejo. Cuotas, allocations, estado derivado.

```
GET    /documents                      → lista con filtros (status, type, fecha)
POST   /documents                      → crear con cuotas + allocations en body
GET    /documents/:id                  → detalle completo
PUT    /documents/:id                  → actualizar cabecera
DELETE /documents/:id                  → hard delete con cascade (cuotas + allocations + adjuntos)

GET    /documents/:id/installments     → cuotas
PUT    /documents/:id/installments/:installmentId → actualizar estado de cuota

GET    /documents/:id/allocations      → pólizas asignadas
PUT    /documents/:id/allocations      → reemplazar allocations

GET    /documents/:id/attachments      → adjuntos
POST   /documents/:id/attachments      → subir adjunto
DELETE /documents/:id/attachments/:attachmentId
```

**Regla de status derivado (se recalcula cada vez que cambia una cuota):**
```typescript
// En documents.service.ts, dentro de updateInstallment():
async recalculateDocumentStatus(documentId: string) {
  const installments = await prisma.installment.findMany({ where: { accountingDocumentId: documentId } })
  const paid = installments.filter(i => i.paymentStatus === 'pagado').length

  const paymentStatus =
    paid === 0 ? 'pendiente' :
    paid === installments.length ? 'pagado' : 'parcial'

  await prisma.accountingDocument.update({
    where: { id: documentId },
    data: { paymentStatus },
  })
}
```

---

### Fase 7 — Matafuegos (2-3 días)

```
GET    /fire-extinguishers             → lista con filtros (status, locationType)
POST   /fire-extinguishers             → crear
GET    /fire-extinguishers/:id         → detalle con historial
PUT    /fire-extinguishers/:id         → actualizar
DELETE /fire-extinguishers/:id         → soft delete

POST   /fire-extinguishers/:id/history → registrar recarga/inspección
GET    /fire-extinguishers/by-asset/:assetId → matafuegos de un activo
```

**Regla de status (computado en GET, nunca guardado):**
```typescript
function computeExtinguisherStatus(expirationDate: string): 'vigente' | 'proximo_a_vencer' | 'vencido' {
  const exp = new Date(expirationDate)
  const today = new Date()
  const in30Days = addDays(today, 30)

  if (exp < today) return 'vencido'
  if (exp <= in30Days) return 'proximo_a_vencer'
  return 'vigente'
}
```

---

### Fase 8 — Siniestros (2 días)

```
GET    /claims             → lista con filtros (status, policy, fecha)
POST   /claims             → crear
GET    /claims/:id         → detalle con eventos
PUT    /claims/:id         → actualizar
DELETE /claims/:id         → soft delete

POST   /claims/:id/events  → agregar evento
DELETE /claims/:id/events/:eventId
```

---

### Fase 9 — Dashboard y Analytics (2-3 días)

```
GET /dashboard/kpis
  → {
      totalPolicies, activePolicies, expiringPolicies,
      totalDocuments, pendingAmount, paidAmount,
      totalExtinguishers, expiringExtinguishers,
      totalClaims, openClaims
    }

GET /dashboard/financial-analysis?year=2024
  → { monthlyPremiums[], monthlyPayments[], byInsuranceType[] }

GET /dashboard/economic-analysis?year=2024
  → { byAsset[], byCostCenter[], totalCost }
```

---

### Fase 10 — File Storage y Notificaciones (2-3 días)

```
1. Cloudinary (recomendado) o AWS S3:
   - multer + multer-storage-cloudinary
   - fileUrl se guarda en DB al subir
   - Download → redirect a URL de Cloudinary

2. Notificaciones por email (Nodemailer + Gmail o SendGrid):
   - Pólizas próximas a vencer (cron job diario)
   - Adjuntos próximos a vencer (con notifyEmail configurado)
   - Se puede implementar con node-cron
```

---

### Fase 11 — Testing y Seed (3 días)

```
1. Seed: prisma/seed.ts
   - Admin user
   - Roles
   - 5 companies mock
   - 10 insurance types con coverages
   - Datos de demostración (opcional)

2. Tests:
   - Unit: services críticos (auth, status computation, payment status)
   - Integration: endpoints con Supertest + base de datos de test
   - Prioridad: auth, documents, policies
```

---

## 5. Autenticación y roles

### JWT Flow

```
Login → POST /auth/login
  → accessToken (JWT, 15min, en body)
  + refreshToken (JWT, 7 días, en httpOnly cookie)

Requests autenticados → Authorization: Bearer <accessToken>

Token vencido → POST /auth/refresh
  → lee refreshToken de cookie
  → devuelve nuevo accessToken

Logout → POST /auth/logout
  → borra cookie refreshToken
  → (opcional) blacklist del token en Redis/DB
```

### Roles y permisos

| Rol | Descripción | Permisos |
|---|---|---|
| `ADMIN` | Administrador total | Todo (CRUD en todos los módulos, gestión de usuarios) |
| `CONTADOR` | Área contable | CRUD en documentos, ver todo lo demás |
| `PRODUCTOR` | Productor de seguros | Ver y editar pólizas propias, ver documentos |
| `VIEWER` | Solo lectura | GET en todos los módulos |

```typescript
// Uso en rutas:
router.delete('/documents/:id',
  authMiddleware,           // verifica JWT
  requireRole('ADMIN', 'CONTADOR'),  // verifica rol
  documentsController.delete
)
```

---

## 6. Contratos de API

### Formato de respuesta estándar

```typescript
// Éxito — lista
{
  "data": [...],
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}

// Éxito — item único
{
  "data": { ...entity }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Datos inválidos",
    "details": [{ "field": "email", "message": "Email inválido" }]
  }
}
```

### Status codes

| Situación | Status |
|---|---|
| Creación exitosa | 201 Created |
| Actualización/Delete exitoso | 200 OK |
| No autenticado | 401 Unauthorized |
| Sin permisos | 403 Forbidden |
| No encontrado | 404 Not Found |
| Validación fallida | 422 Unprocessable Entity |
| Error servidor | 500 Internal Server Error |

### Filtros y paginación (query params estándar)

```
GET /policies?page=1&limit=20&status=vigente&insuranceTypeId=xxx&search=póliza
GET /documents?paymentStatus=pendiente&currency=USD&year=2024
GET /fire-extinguishers?status=proximo_a_vencer&locationType=edificio
```

---

## 7. Seguridad

### Lista de controles obligatorios

```typescript
// app.ts — middlewares en orden:

app.use(helmet())                          // Headers de seguridad HTTP
app.use(cors({ origin: ALLOWED_ORIGINS })) // CORS controlado
app.use(rateLimit({                        // Anti-bruteforce global
  windowMs: 15 * 60 * 1000,               // 15 minutos
  max: 100,
}))
app.use(rateLimitAuth)                     // Rate limit específico para /auth/login (5 intentos/min)
app.use(express.json({ limit: '10kb' }))   // Limitar body size (evitar DoS)
app.use(morgan('combined', { stream: logger.stream }))
```

### Variables de entorno requeridas (.env.example)

```env
# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
DIRECT_URL=postgresql://user:password@host/dbname?sslmode=require

# JWT
JWT_SECRET=minimum-32-chars-random-string-here
JWT_REFRESH_SECRET=different-minimum-32-chars-random-string
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173

# File Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email (opcional, Fase 10)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

### Input validation con Zod (patrón)

```typescript
// assets.schemas.ts
export const CreateAssetSchema = z.object({
  name: z.string().min(1).max(200),
  assetType: z.string().min(1),
  brand: z.string().optional(),
  purchaseValue: z.number().positive().optional(),
  allocations: z.array(z.object({
    costCenterId: z.string().uuid(),
    percentage: z.number().min(0.01).max(100),
  })).refine(
    (allocs) => allocs.reduce((sum, a) => sum + a.percentage, 0) === 100,
    { message: 'Las allocations deben sumar exactamente 100%' }
  ),
})

export type CreateAssetDTO = z.infer<typeof CreateAssetSchema>
```

### Protección de archivos adjuntos

```typescript
// Validar MIME type real (no solo extensión)
const ALLOWED_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.ms-excel', ...]
const MAX_FILE_SIZE_MB = 20

// Los archivos se sirven desde Cloudinary (URLs firmadas con TTL) o con presigned URLs de S3
// Nunca exponer rutas internas del filesystem
```

---

## 8. Reglas de negocio críticas

Estas reglas DEBEN vivir en el backend. El frontend actualmente las computa localmente (mock), pero la fuente de verdad es el servidor.

### Status de pólizas (computado en READ)
```
vencida          → endDate < today
proxima_a_vencer → today ≤ endDate ≤ today + 30 días
vigente          → endDate > today + 30 días
```

### Status de matafuegos (computado en READ)
```
vencido          → expirationDate < today
proximo_a_vencer → today ≤ expirationDate ≤ today + 30 días
vigente          → expirationDate > today + 30 días
```

### Status de documentos (computado en WRITE al actualizar cuota)
```
pagado   → todas las cuotas en estado "pagado"
parcial  → al menos una cuota "pagado" pero no todas
pendiente → ninguna cuota "pagado"
```

### Validación de allocations de activos
```
suma de percentages debe ser exactamente 100.00
mínimo 1 allocation, máximo sin límite
```

### Cascade deletes
```
DELETE documento → cascade: cuotas, allocations de pólizas, adjuntos
DELETE activo    → cascade: allocations de CC, historial de valuaciones, adjuntos
DELETE póliza    → soft delete (isActive=false), no borrar documentos asociados
DELETE matafuego → cascade: historial de recargas/inspecciones
DELETE siniestro → cascade: eventos del siniestro
```

---

## 9. Testing

### Prioridades de cobertura

| Módulo | Tipo | Prioridad |
|---|---|---|
| auth | Integration (login, refresh, logout) | Crítica |
| documents + installments | Unit (status derivation) | Crítica |
| policies | Unit (status computation) | Alta |
| assets (allocations) | Unit (sum validation) | Alta |
| fire-extinguishers | Unit (status computation) | Alta |
| file upload | Integration (mock Cloudinary) | Media |
| dashboard/KPIs | Integration | Media |

### Estructura de tests

```
src/
  modules/
    auth/
      __tests__/
        auth.service.test.ts
        auth.integration.test.ts
    documents/
      __tests__/
        documents.service.test.ts    # testea recalculateDocumentStatus()
```

### Test de integración con DB de test

```typescript
// jest.config.ts
export default {
  testEnvironment: 'node',
  globalSetup: './tests/setup.ts',    // crea DB de test, corre migrations
  globalTeardown: './tests/teardown.ts',
  setupFilesAfterFramework: ['./tests/reset-db.ts'],  // trunca tablas entre tests
}
```

---

## 10. Deployment

### Para staging/producción (recomendado)

| Servicio | Para qué | Costo |
|---|---|---|
| Railway | Backend Express | Free tier / $5/mes |
| Neon | PostgreSQL | Free tier (3 GB) |
| Cloudinary | File storage | Free tier (25 GB) |
| Vercel | Frontend (ya en uso) | Free |

### CI/CD básico (GitHub Actions)

```yaml
# .github/workflows/backend.yml
on:
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  deploy:
    steps:
      - checkout
      - npm ci
      - npx tsc --noEmit        # type check
      - npm test                 # tests
      - npx prisma migrate deploy # migraciones en prod
      - deploy a Railway
```

### Variables de entorno en producción

- Nunca el `.env` en git
- Usar el dashboard de Railway / Render para env vars
- `DATABASE_URL` con pooler URL de Neon (para producción)
- `DIRECT_URL` con direct URL de Neon (para migraciones)

---

## Orden de implementación recomendado

```
Semana 1:   Fase 1 (Foundation + Auth) + Fase 2 (Catálogos)
Semana 2:   Fase 3 (Activos) + Fase 4 (Productores)
Semana 3:   Fase 5 (Pólizas) + Fase 7 (Matafuegos)
Semana 4:   Fase 6 (Documentos — la más compleja)
Semana 5:   Fase 8 (Siniestros) + Fase 9 (Dashboard)
Semana 6:   Fase 10 (Files + Email) + Fase 11 (Tests + Seed)
```

**Total estimado:** 6 semanas para backend completo y en producción.

---

## Comandos de inicio

```bash
# Crear proyecto
mkdir backend && cd backend
npm init -y
npm install typescript ts-node-dev @types/node --save-dev
npx tsc --init

# Instalar dependencias core
npm install express @prisma/client zod bcryptjs jsonwebtoken helmet cors express-rate-limit morgan winston uuid
npm install -D prisma @types/express @types/bcryptjs @types/jsonwebtoken @types/cors @types/uuid

# Inicializar Prisma
npx prisma init

# (Después de configurar DATABASE_URL en .env)
npx prisma migrate dev --name init

# Seed
npx prisma db seed

# Dev
npm run dev  # ts-node-dev src/server.ts
```
