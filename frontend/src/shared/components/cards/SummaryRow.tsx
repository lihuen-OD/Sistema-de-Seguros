// Fila "label - valor" para bloques de resumen dentro de una ficha de
// detalle (ej. total facturado, saldo pendiente) — antes duplicado entre
// AssetDetailPage.tsx y PolicyDetailPage.tsx.
export function SummaryRow({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}
