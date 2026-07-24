import { toast } from 'sonner'

// Toast con los mismos mensajes que ya se muestran en rojo debajo de cada
// campo — no los reemplaza, los complementa: si el campo con el error quedó
// fuera de la vista al hacer scroll, el cartel sigue siendo visible.
export function notifyValidationErrors(errors: Record<string, string | undefined>): void {
  const messages = Object.values(errors).filter((m): m is string => Boolean(m))
  if (messages.length === 0) return
  toast.error(messages.join(' • '))
}
