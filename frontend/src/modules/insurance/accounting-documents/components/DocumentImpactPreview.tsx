import { Info, AlertTriangle } from 'lucide-react'
import { formatCurrencyFull } from '../../../../shared/utils/format'
import type { AccountingDocument, DocumentType, EconomicImpactType, AdjustmentSign } from '../../../../shared/types'

interface DocumentImpactPreviewProps {
  documentType: DocumentType
  linkedDocument?: AccountingDocument | null
  amount: number
  currency: string
  economicImpactType?: EconomicImpactType | ''
  adjustmentSign?: AdjustmentSign | ''
}

function Box({ tone, children }: { tone: 'info' | 'warning'; children: React.ReactNode }) {
  const cls =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-brand-200 bg-brand-50 text-brand-800'
  const Icon = tone === 'warning' ? AlertTriangle : Info
  const iconCls = tone === 'warning' ? 'text-amber-500' : 'text-brand-500'
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${cls}`}>
      <Icon size={14} className={`flex-shrink-0 mt-0.5 ${iconCls}`} />
      <p className="text-xs leading-snug">{children}</p>
    </div>
  )
}

// Adelanto de qué va a pasar cuando se guarde/aplique el documento, antes de
// confirmarlo — mensajes tomados literalmente de la especificación de cada
// tipo (Nota de Crédito/Débito/Endoso/Ajuste).
export function DocumentImpactPreview({
  documentType,
  linkedDocument,
  amount,
  currency,
  economicImpactType,
  adjustmentSign,
}: DocumentImpactPreviewProps) {
  const formattedAmount = formatCurrencyFull(amount, currency)

  if (documentType === 'CREDIT_NOTE') {
    if (!linkedDocument) return null
    return (
      <Box tone="info">
        Esta Nota de Crédito reducirá el saldo de la Factura{' '}
        <strong>{linkedDocument.documentNumber}</strong> en {formattedAmount} cuando sea aplicada.
      </Box>
    )
  }

  if (documentType === 'DEBIT_NOTE') {
    if (!linkedDocument) {
      return (
        <Box tone="info">
          Esta Nota de Débito no está asociada a una factura — funcionará como documento propio, con
          su propio estado de pago.
        </Box>
      )
    }
    return (
      <Box tone="info">
        Esta Nota de Débito aumentará el saldo de la Factura{' '}
        <strong>{linkedDocument.documentNumber}</strong> en {formattedAmount} cuando sea aplicada.
      </Box>
    )
  }

  if (documentType === 'ENDORSEMENT') {
    if (economicImpactType === 'NO_IMPACT') {
      return <Box tone="info">Este Endoso modificará la póliza sin impacto económico.</Box>
    }
    if (economicImpactType === 'INCREASES_COST' || economicImpactType === 'DECREASES_COST') {
      if (!linkedDocument) return null
      const verb = economicImpactType === 'INCREASES_COST' ? 'aumentará' : 'reducirá'
      return (
        <Box tone="info">
          Este Endoso {verb} el saldo de la Factura <strong>{linkedDocument.documentNumber}</strong> en{' '}
          {formattedAmount} cuando sea aplicado.
        </Box>
      )
    }
    if (economicImpactType === 'PENDING_DEFINITION') {
      return (
        <Box tone="info">
          Este endoso queda registrado, pero el impacto económico deberá completarse más adelante.
        </Box>
      )
    }
    return null
  }

  if (documentType === 'ADJUSTMENT_ENTRY') {
    if (!linkedDocument || !adjustmentSign) return null
    const verb = adjustmentSign === 'NEGATIVE' ? 'restará' : 'sumará'
    return (
      <Box tone="info">
        Este Asiento de Ajuste {verb} {formattedAmount} al saldo del documento{' '}
        <strong>{linkedDocument.documentNumber}</strong> cuando sea aplicado.
      </Box>
    )
  }

  return null
}
