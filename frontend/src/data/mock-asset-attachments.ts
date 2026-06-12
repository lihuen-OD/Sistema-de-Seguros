import type { AssetAttachment } from '../shared/types'

// Reference date: 2026-06-11
// próximo a vencer  → expiration within 30 days (≤ 2026-07-11)
// vencido           → expiration before today  (< 2026-06-11)
// vigente           → expiration beyond 30 days (> 2026-07-11)

export const mockAssetAttachments: AssetAttachment[] = [
  // ── asset-1: Toyota Hilux VEH-001 ─────────────────────────────────────────
  {
    id: 'att-001',
    assetId: 'asset-1',
    name: 'Cédula Verde - Toyota Hilux VEH-001.pdf',
    description: 'Cédula de identificación del vehículo',
    fileType: 'pdf',
    fileSize: '1.2 MB',
    expirationDate: null,
    uploadedAt: '2022-03-15',
    uploadedBy: 'Administración',
  },
  {
    id: 'att-002',
    assetId: 'asset-1',
    name: 'VTV 2026 - Toyota Hilux VEH-001.pdf',
    description: 'Verificación Técnica Vehicular',
    fileType: 'pdf',
    fileSize: '0.8 MB',
    expirationDate: '2026-07-05',
    uploadedAt: '2026-01-10',
    uploadedBy: 'Lihuen Segovia',
  },
  {
    id: 'att-003',
    assetId: 'asset-1',
    name: 'Factura de Compra - Toyota Hilux VEH-001.pdf',
    description: 'Factura original de adquisición',
    fileType: 'pdf',
    fileSize: '2.1 MB',
    expirationDate: null,
    uploadedAt: '2022-03-10',
    uploadedBy: 'Administración',
  },
  {
    id: 'att-004',
    assetId: 'asset-1',
    name: 'Habilitación Municipal 2025 - VEH-001.pdf',
    description: 'Habilitación municipal de transporte',
    fileType: 'pdf',
    fileSize: '0.5 MB',
    expirationDate: '2025-12-31',
    uploadedAt: '2025-01-10',
    uploadedBy: 'Lihuen Segovia',
  },

  // ── asset-2: Toyota Hilux VEH-002 ─────────────────────────────────────────
  {
    id: 'att-005',
    assetId: 'asset-2',
    name: 'Cédula Verde - Toyota Hilux VEH-002.pdf',
    description: '',
    fileType: 'pdf',
    fileSize: '1.1 MB',
    expirationDate: null,
    uploadedAt: '2021-06-01',
    uploadedBy: 'Administración',
  },
  {
    id: 'att-006',
    assetId: 'asset-2',
    name: 'VTV 2026 - Toyota Hilux VEH-002.pdf',
    description: 'Verificación Técnica Vehicular',
    fileType: 'pdf',
    fileSize: '0.7 MB',
    expirationDate: '2026-06-20',
    uploadedAt: '2026-01-15',
    uploadedBy: 'Lihuen Segovia',
  },

  // ── asset-3: John Deere 8R 340 (Tractor TRA-001) ─────────────────────────
  {
    id: 'att-007',
    assetId: 'asset-3',
    name: 'Manual de Operaciones - John Deere 8R 340.pdf',
    description: 'Manual técnico del fabricante',
    fileType: 'pdf',
    fileSize: '15.3 MB',
    expirationDate: null,
    uploadedAt: '2020-09-01',
    uploadedBy: 'Administración',
  },
  {
    id: 'att-008',
    assetId: 'asset-3',
    name: 'Certificado de Garantía - John Deere 8R 340.pdf',
    description: 'Garantía extendida del fabricante',
    fileType: 'pdf',
    fileSize: '0.9 MB',
    expirationDate: '2025-09-15',
    uploadedAt: '2020-09-01',
    uploadedBy: 'Administración',
  },
  {
    id: 'att-009',
    assetId: 'asset-3',
    name: 'Inspección Técnica 2026 - TRA-001.pdf',
    description: 'Inspección técnica obligatoria',
    fileType: 'pdf',
    fileSize: '1.4 MB',
    expirationDate: '2027-03-20',
    uploadedAt: '2026-03-20',
    uploadedBy: 'Mantenimiento',
  },
]
