import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UseFormMutationOptions<TData, TVariables> {
  successMessage?: string
  invalidateKeys?: string[][]
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>
}

export function useFormMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseFormMutationOptions<TData, TVariables> = {},
) {
  const queryClient = useQueryClient()
  const { successMessage = 'Guardado correctamente', invalidateKeys = [], onSuccess } = options

  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: async (data, variables) => {
      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
        )
      }
      if (onSuccess) {
        await onSuccess(data, variables)
      }
      toast.success(successMessage)
    },
    // onError is intentionally omitted: client.ts interceptor already shows the toast
  })

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
  }
}
