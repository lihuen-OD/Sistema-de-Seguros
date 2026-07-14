import { QueryClient } from '@tanstack/react-query'

// Instancia única, importada tanto por `main.tsx` (Provider) como por
// `shared/api/client.ts` (para limpiar el cache ante un 401) — antes vivía
// como variable local de `main.tsx`, inalcanzable desde el interceptor.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
