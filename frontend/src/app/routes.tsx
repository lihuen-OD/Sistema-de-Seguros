export const ROUTES = {
  DASHBOARD: '/dashboard',

  ASSETS: '/assets',
  ASSETS_NEW: '/assets/new',
  ASSETS_DETAIL: (id: string) => `/assets/${id}`,

  POLICIES: '/insurance/policies',
  POLICIES_NEW: '/insurance/policies/new',
  POLICIES_DETAIL: (id: string) => `/insurance/policies/${id}`,
  POLICIES_EDIT: (id: string) => `/insurance/policies/${id}/edit`,

  DOCUMENTS: '/insurance/documents',
  DOCUMENTS_NEW: '/insurance/documents/new',
  DOCUMENTS_DETAIL: (id: string) => `/insurance/documents/${id}`,

  FINANCIAL_ANALYSIS: '/insurance/financial-analysis',
  ECONOMIC_ANALYSIS: '/insurance/economic-analysis',

  PRODUCERS: '/producers',
  PRODUCERS_NEW: '/producers/new',
  PRODUCERS_DETAIL: (id: string) => `/producers/${id}`,
  PRODUCERS_TASKS: '/producers/tasks',

  FIRE_EXTINGUISHERS: '/fire-extinguishers',
  FIRE_EXTINGUISHERS_NEW: '/fire-extinguishers/new',
  FIRE_EXTINGUISHERS_DETAIL: (id: string) => `/fire-extinguishers/${id}`,

  SETTINGS_COMPANIES: '/settings/companies',
  SETTINGS_COST_CENTERS: '/settings/cost-centers',
}
