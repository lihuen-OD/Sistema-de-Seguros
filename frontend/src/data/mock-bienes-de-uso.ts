import type { BienDeUso } from '../shared/types'

/**
 * Catálogo simulado de Bienes de Uso proveniente de Finnegans.
 * En producción este listado se reemplazará por una llamada a la API de Finnegans.
 */
export const mockBienesDeUso: BienDeUso[] = [
  // Rodados
  { id: 'bu-001', code: 'BU-00001', description: 'Camioneta Toyota Hilux 4x4',       category: 'Rodados' },
  { id: 'bu-002', code: 'BU-00002', description: 'Camioneta Ford Ranger XLS',         category: 'Rodados' },
  { id: 'bu-003', code: 'BU-00003', description: 'Vehículo Volkswagen Amarok',        category: 'Rodados' },
  { id: 'bu-004', code: 'BU-00004', description: 'Camión Scania R450',                category: 'Rodados' },
  { id: 'bu-005', code: 'BU-00005', description: 'Camión Mercedes-Benz Actros',       category: 'Rodados' },
  { id: 'bu-006', code: 'BU-00006', description: 'Moto Honda CG 150',                 category: 'Rodados' },
  // Maquinaria agrícola
  { id: 'bu-010', code: 'BU-00010', description: 'Tractor John Deere 8R 340',        category: 'Maquinaria agrícola' },
  { id: 'bu-011', code: 'BU-00011', description: 'Tractor Case IH Magnum 340',       category: 'Maquinaria agrícola' },
  { id: 'bu-012', code: 'BU-00012', description: 'Cosechadora John Deere S690',      category: 'Maquinaria agrícola' },
  { id: 'bu-013', code: 'BU-00013', description: 'Pulverizadora Jacto Uniport 4530', category: 'Maquinaria agrícola' },
  { id: 'bu-014', code: 'BU-00014', description: 'Sembradora Agrometal TX Mega',     category: 'Maquinaria agrícola' },
  { id: 'bu-015', code: 'BU-00015', description: 'Plataforma draper JD 640FD 40ft',  category: 'Maquinaria agrícola' },
  // Inmuebles
  { id: 'bu-020', code: 'BU-00020', description: 'Establecimiento El Ombú 1200 ha',  category: 'Inmuebles' },
  { id: 'bu-021', code: 'BU-00021', description: 'Galpón principal Est. El Ombú',    category: 'Inmuebles' },
  { id: 'bu-022', code: 'BU-00022', description: 'Oficinas Centrales CABA',          category: 'Inmuebles' },
  // Infraestructura
  { id: 'bu-030', code: 'BU-00030', description: 'Silos metálicos Richiger Lote 3',  category: 'Infraestructura' },
  { id: 'bu-031', code: 'BU-00031', description: 'Tanque de agua 50.000 lts',        category: 'Infraestructura' },
  { id: 'bu-032', code: 'BU-00032', description: 'Manga y corral ganadero',          category: 'Infraestructura' },
]
