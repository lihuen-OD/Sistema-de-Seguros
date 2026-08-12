import type { AssetCategory, Silo } from '../types'

// Subconjunto de campos de formulario que buildMetadata necesita — tanto
// AssetNewPage como AssetEditPage tienen estos mismos campos (con más nombres
// propios de cada uno, que no hacen falta acá).
export interface AssetMetadataFormFields {
  chassisNumber: string
  plate: string
  engineNumber: string
  color: string
  fuelType: string
  powerHp: string
  cutWidth: string
  tankCapacity: string
  workWidth: string
  implementType: string
  surfaceM2: string
  buildingPurpose: string
  constructionType: string
  floors: string
  constructionYear: string
  address: string
  surfaceHa: string
  province: string
  locality: string
  cadastralReference: string
  landUse: string
  irrigatedSurfaceHa: string
  forestedSurfaceHa: string
  infraType: string
  infraCapacityTons: string
  infraContent: string
  technicalSpec: string
}

// Igual que EstBuilding (modules/assets/components/EstBuildingsSection.tsx) —
// se redeclara acá en vez de importarla para no crear una dependencia de
// shared/ hacia un componente de módulo; cualquier EstBuilding real ya
// cumple esta forma.
export interface AssetMetadataBuilding {
  name: string
  surfaceM2: string
  purpose: string
  constructionType: string
  constructionYear: string
}

// Mapea la categoría de activo a su metadata específica (Asset.metadata,
// JSON libre) — misma lógica que antes vivía duplicada en AssetNewPage.tsx y
// AssetEditPage.tsx. Devuelve solo los campos con valor (nunca claves vacías).
export function buildMetadata(
  category: AssetCategory | '',
  form: AssetMetadataFormFields,
  buildings: AssetMetadataBuilding[],
  silos: Silo[],
): Record<string, unknown> {
  const opt = (v: string) => v.trim() || undefined
  const num = (v: string) => v ? parseFloat(v) : undefined
  const int = (v: string) => v ? parseInt(v, 10) : undefined

  if (['vehiculo', 'camioneta', 'camion', 'moto', 'transporte_pasajeros'].includes(category)) {
    return {
      ...(opt(form.chassisNumber) && { chassisNumber: form.chassisNumber.trim() }),
      ...(opt(form.plate) && { plate: form.plate.trim() }),
      ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
      ...(opt(form.color) && { color: form.color.trim() }),
      ...(opt(form.fuelType) && { fuelType: form.fuelType }),
    }
  }
  if (['tractor', 'cosechadora', 'pulverizadora'].includes(category)) {
    return {
      ...(opt(form.plate) && { plate: form.plate.trim() }),
      ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
      ...(num(form.powerHp) !== undefined && { powerHp: num(form.powerHp) }),
      ...(num(form.cutWidth) !== undefined && { cutWidth: num(form.cutWidth) }),
      ...(num(form.tankCapacity) !== undefined && { tankCapacity: num(form.tankCapacity) }),
      ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
    }
  }
  if (category === 'implemento') {
    return {
      ...(opt(form.plate) && { plate: form.plate.trim() }),
      ...(opt(form.implementType) && { implementType: form.implementType }),
      ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
    }
  }
  if (category === 'edificio') {
    return {
      ...(num(form.surfaceM2) !== undefined && { surfaceM2: num(form.surfaceM2) }),
      ...(opt(form.buildingPurpose) && { buildingPurpose: form.buildingPurpose }),
      ...(opt(form.constructionType) && { constructionType: form.constructionType.trim() }),
      ...(int(form.floors) !== undefined && { floors: int(form.floors) }),
      ...(int(form.constructionYear) !== undefined && { constructionYear: int(form.constructionYear) }),
      ...(opt(form.address) && { address: form.address.trim() }),
    }
  }
  if (category === 'establecimiento') {
    return {
      ...(num(form.surfaceHa) !== undefined && { surfaceHa: num(form.surfaceHa) }),
      ...(opt(form.province) && { province: form.province }),
      ...(opt(form.locality) && { locality: form.locality.trim() }),
      ...(opt(form.address) && { address: form.address.trim() }),
      ...(buildings.length > 0 && {
        buildings: buildings.map((b) => ({
          name: b.name,
          ...(b.surfaceM2 && { surfaceM2: parseFloat(b.surfaceM2) }),
          ...(b.purpose && { purpose: b.purpose }),
          ...(b.constructionType && { constructionType: b.constructionType }),
          ...(b.constructionYear && { constructionYear: parseInt(b.constructionYear, 10) }),
        })),
      }),
      ...(silos.length > 0 && {
        silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
      }),
    }
  }
  if (category === 'campo_terreno') {
    return {
      ...(num(form.surfaceHa) !== undefined && { surfaceHa: num(form.surfaceHa) }),
      ...(opt(form.province) && { province: form.province }),
      ...(opt(form.locality) && { locality: form.locality.trim() }),
      ...(opt(form.address) && { address: form.address.trim() }),
      ...(opt(form.cadastralReference) && { cadastralReference: form.cadastralReference.trim() }),
      ...(opt(form.landUse) && { landUse: form.landUse }),
      ...(num(form.irrigatedSurfaceHa) !== undefined && { irrigatedSurfaceHa: num(form.irrigatedSurfaceHa) }),
      ...(num(form.forestedSurfaceHa) !== undefined && { forestedSurfaceHa: num(form.forestedSurfaceHa) }),
    }
  }
  if (category === 'infraestructura') {
    return {
      ...(opt(form.infraType) && { infraType: form.infraType }),
      ...(num(form.infraCapacityTons) !== undefined && { infraCapacityTons: num(form.infraCapacityTons) }),
      ...(opt(form.infraContent) && { infraContent: form.infraContent }),
      ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
      ...(silos.length > 0 && {
        silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
      }),
    }
  }
  if (['equipo', 'maquinaria'].includes(category)) {
    return {
      ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
    }
  }
  return {}
}
