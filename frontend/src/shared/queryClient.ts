import { QueryClient } from '@tanstack/react-query'

// Instancia única, importada tanto por `main.tsx` (Provider) como por
// `shared/api/client.ts` (para limpiar el cache ante un 401) — antes vivía
// como variable local de `main.tsx`, inalcanzable desde el interceptor.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      // Un 429 significa "ya estás pegándole demasiado al límite" — reintentar
      // solo suma otro request al mismo balde que acaba de rechazarte. El
      // interceptor de api/client.ts marca este caso con `.status = 429`.
      retry: (failureCount, error) => {
        if ((error as { status?: number }).status === 429) return false
        return failureCount < 1
      },
      // Al volver a la pestaña/ventana después de un rato afuera (ej: la
      // compu estuvo suspendida), revalida en vez de confiar en datos que
      // pueden llevar horas sin refrescarse. Antes estaba en false y era
      // parte de por qué la sesión podía quedar en un estado colgado.
      refetchOnWindowFocus: true,
    },
  },
})
