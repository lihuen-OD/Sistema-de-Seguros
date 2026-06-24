import {
  Car, Truck, Settings2, Layers, Wrench,
  Building2, Landmark, Box, Cog, Network, Package, Bike,
} from 'lucide-react'
import type { ElementType } from 'react'
import type { AssetCategory } from '../types'

export interface CategoryGroupItem {
  key: AssetCategory
  label: string
  desc: string
  icon: ElementType
  color: string
}

export interface CategoryGroup {
  label: string
  items: CategoryGroupItem[]
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Vehículos',
    items: [
      { key: 'vehiculo',  label: 'Vehículo',  desc: 'Auto, utilitario o pick-up liviana', icon: Car,   color: 'text-blue-600 bg-blue-50' },
      { key: 'camioneta', label: 'Camioneta', desc: 'Pick-up 4x4 o doble cabina',          icon: Truck, color: 'text-blue-600 bg-blue-50' },
      { key: 'camion',    label: 'Camión',    desc: 'Camión de carga o transporte pesado', icon: Truck, color: 'text-slate-600 bg-slate-100' },
      { key: 'moto',      label: 'Moto',      desc: 'Motocicleta o cuatriciclo',           icon: Bike,  color: 'text-blue-600 bg-blue-50' },
    ],
  },
  {
    label: 'Maquinaria agrícola',
    items: [
      { key: 'tractor',       label: 'Tractor',       desc: 'Tractor de campo o industrial',       icon: Settings2, color: 'text-green-600 bg-green-50' },
      { key: 'cosechadora',   label: 'Cosechadora',   desc: 'Cosechadora de granos o forraje',     icon: Layers,    color: 'text-green-600 bg-green-50' },
      { key: 'pulverizadora', label: 'Pulverizadora', desc: 'Autopropulsada o de arrastre',        icon: Layers,    color: 'text-green-600 bg-green-50' },
      { key: 'implemento',    label: 'Implemento',    desc: 'Sembradora, rastra, arado, acoplado', icon: Wrench,    color: 'text-orange-600 bg-orange-50' },
    ],
  },
  {
    label: 'Inmuebles y construcciones',
    items: [
      { key: 'edificio',        label: 'Edificio',        desc: 'Galpón, depósito, vivienda, oficinas',        icon: Building2, color: 'text-purple-600 bg-purple-50' },
      { key: 'establecimiento', label: 'Establecimiento', desc: 'Campo o predio con múltiples construcciones', icon: Landmark,  color: 'text-purple-600 bg-purple-50' },
    ],
  },
  {
    label: 'Otros',
    items: [
      { key: 'equipo',          label: 'Equipo',          desc: 'Equipo técnico o especializado',     icon: Box,     color: 'text-slate-600 bg-slate-100' },
      { key: 'maquinaria',      label: 'Maquinaria',      desc: 'Maquinaria industrial o de proceso', icon: Cog,     color: 'text-slate-600 bg-slate-100' },
      { key: 'infraestructura', label: 'Infraestructura', desc: 'Silo, tanque, obra civil, alambrado', icon: Network, color: 'text-slate-600 bg-slate-100' },
    ],
  },
  {
    label: 'Producción animal',
    items: [
      { key: 'carga', label: 'Carga', desc: 'Hacienda en pie u otra carga animal (porcino, bovino, etc.)', icon: Package, color: 'text-amber-600 bg-amber-50' },
    ],
  },
]

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  vehiculo: 'Vehículo', camioneta: 'Camioneta', camion: 'Camión', moto: 'Moto',
  tractor: 'Tractor', cosechadora: 'Cosechadora', pulverizadora: 'Pulverizadora', implemento: 'Implemento',
  edificio: 'Edificio', establecimiento: 'Establecimiento',
  equipo: 'Equipo', maquinaria: 'Maquinaria', infraestructura: 'Infraestructura',
  carga: 'Carga',
}

export const IMPL_TYPES = ['Sembradora', 'Arado', 'Rastra', 'Fertilizadora', 'Cincel', 'Rolo', 'Acoplado', 'Otro']

/** Maps AssetCategory → Finnegans accounting categories (used in create form) */
export const CATEGORY_TO_FINNEGANS: Partial<Record<AssetCategory, string[]>> = {
  vehiculo:        ['Rodados'],
  camioneta:       ['Rodados'],
  camion:          ['Rodados'],
  moto:            ['Rodados'],
  tractor:         ['Maquinaria y Equipo'],
  cosechadora:     ['Maquinaria y Equipo'],
  pulverizadora:   ['Maquinaria y Equipo'],
  implemento:      ['Maquinaria y Equipo', 'Implementos Agrícolas'],
  equipo:          ['Maquinaria y Equipo'],
  maquinaria:      ['Maquinaria y Equipo'],
  edificio:        ['Inmuebles'],
  establecimiento: ['Inmuebles'],
  infraestructura: ['Infraestructura y Mejoras'],
}

/** Reverse map: stored assetType label → AssetCategory key (used in edit form) */
export const LABEL_TO_CATEGORY: Record<string, AssetCategory> = Object.fromEntries(
  Object.entries(CATEGORY_LABEL).map(([key, label]) => [label, key as AssetCategory]),
)

/** Maps stored assetType string → Finnegans accounting categories (used in edit form) */
export const ASSET_TYPE_TO_FINNEGANS: Record<string, string[]> = {
  'Vehículo':        ['Rodados'],
  'Camioneta':       ['Rodados'],
  'Camión':          ['Rodados'],
  'Moto':            ['Rodados'],
  'Tractor':         ['Maquinaria y Equipo'],
  'Cosechadora':     ['Maquinaria y Equipo'],
  'Pulverizadora':   ['Maquinaria y Equipo'],
  'Implemento':      ['Maquinaria y Equipo', 'Implementos Agrícolas'],
  'Equipo':          ['Maquinaria y Equipo'],
  'Maquinaria':      ['Maquinaria y Equipo'],
  'Edificio':        ['Inmuebles'],
  'Establecimiento': ['Inmuebles'],
  'Infraestructura': ['Infraestructura y Mejoras'],
}
