import { buildManualDocumentSendEmail, type ManualDocumentEmailData } from '../email.templates'

const baseData: ManualDocumentEmailData = {
  documentType: 'INVOICE',
  documentTypeLabel: 'Factura',
  documentNumber: 'A-0001',
  issueDate: '2026-09-04',
  dueDate: null,
  insuranceCompany: 'Compañía Test',
  paymentMethod: null,
  currency: 'ARS',
  totalAmount: 125000,
  policyNumbers: [],
  linkedDocumentNumber: null,
  description: null,
  adjustmentReason: null,
  endorsementType: null,
  endorsementEffectiveDate: null,
  costCenters: [],
  attachments: [],
}

describe('buildManualDocumentSendEmail', () => {
  it.each([
    ['INVOICE', 'Factura', 'Se informa la factura correspondiente.'],
    ['CREDIT_NOTE', 'Nota de Crédito', 'Se informa la nota de crédito correspondiente.'],
    ['DEBIT_NOTE', 'Nota de Débito', 'Se informa la nota de débito correspondiente.'],
    ['ENDORSEMENT', 'Endoso', 'Se informa el endoso correspondiente.'],
    ['ADJUSTMENT_ENTRY', 'Asiento de Ajuste', 'Se informa el asiento de ajuste contable.'],
  ])('genera asunto y cuerpo propios para %s', (documentType, documentTypeLabel, intro) => {
    const result = buildManualDocumentSendEmail({ ...baseData, documentType, documentTypeLabel })

    expect(result.subject).toBe(`${documentTypeLabel} A-0001 - Compañía Test`)
    expect(result.html).toContain(intro)
    expect(result.html).not.toContain('undefined')
    expect(result.html).not.toContain('null')
  })

  it('genera un mail HTML válido sin sección de adjuntos cuando no hay archivos', () => {
    const result = buildManualDocumentSendEmail(baseData)

    expect(result.html).toContain('A-0001')
    expect(result.html).not.toContain('Adjuntos (0)')
    expect(result.html).not.toContain('Sin adjuntos')
  })

  it('incluye adjuntos y campos específicos únicamente cuando existen', () => {
    const result = buildManualDocumentSendEmail({
      ...baseData,
      documentType: 'ENDORSEMENT',
      documentTypeLabel: 'Endoso',
      policyNumbers: ['POL-001'],
      linkedDocumentNumber: 'FAC-001',
      description: 'Cambio de cobertura',
      adjustmentReason: 'Diferencia de redondeo',
      endorsementType: 'Cambio de cobertura',
      endorsementEffectiveDate: '2026-09-10',
      attachments: [{ name: 'endoso.pdf', fileUrl: null, attached: true }],
    })

    expect(result.subject).toBe('Endoso A-0001 - POL-001')
    expect(result.html).toContain('Vigencia del endoso')
    expect(result.html).toContain('Motivo del ajuste')
    expect(result.html).toContain('Tipo de endoso')
    expect(result.html).toContain('Documento relacionado')
    expect(result.html).toContain('Adjuntos (1)')
    expect(result.html).toContain('endoso.pdf')
  })
})
