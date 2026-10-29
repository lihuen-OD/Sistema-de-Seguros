import type { QueryClient } from '@tanstack/react-query'
import { policyKeys } from '../../../../shared/api/policies.api'
import { notificationKeys } from '../../../../shared/api/notifications.api'

// Marcar o deshacer una renovación cambia el estado visible (effectiveStatus)
// de ambas pólizas: listados, búsquedas, conteos del dashboard, historial
// (todo bajo policyKeys.all), los dos detalles y las alertas de vencimiento.
// Los montos no dependen de esto, pero viajan en las mismas queries.
export function invalidateRenewalQueries(queryClient: QueryClient, policyIds: string[]) {
  queryClient.invalidateQueries({ queryKey: policyKeys.all })
  for (const id of new Set(policyIds)) {
    queryClient.invalidateQueries({ queryKey: policyKeys.detail(id) })
  }
  queryClient.invalidateQueries({ queryKey: notificationKeys.preview })
  queryClient.invalidateQueries({ queryKey: notificationKeys.list })
}
