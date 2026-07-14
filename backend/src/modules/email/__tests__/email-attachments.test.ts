import { resolveEmailAttachments } from '../email-attachments'

describe('resolveEmailAttachments', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('adjunta un archivo real descargado correctamente', async () => {
    const bytes = new TextEncoder().encode('contenido de prueba')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    }) as unknown as typeof fetch

    const { attachments, summaries } = await resolveEmailAttachments([
      { name: 'archivo.pdf', fileUrl: 'https://cdn.example.com/archivo.pdf' },
    ])

    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe('archivo.pdf')
    expect(attachments[0].content.toString()).toBe('contenido de prueba')
    expect(summaries).toEqual([
      { name: 'archivo.pdf', fileUrl: 'https://cdn.example.com/archivo.pdf', attached: true },
    ])
  })

  it('no adjunta archivos con URL local:// (no hay archivo real sin Cloudinary)', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch

    const { attachments, summaries } = await resolveEmailAttachments([
      { name: 'sin-cloudinary.pdf', fileUrl: 'local://sin-cloudinary.pdf' },
    ])

    expect(attachments).toHaveLength(0)
    expect(summaries).toEqual([{ name: 'sin-cloudinary.pdf', fileUrl: null, attached: false }])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('marca como no adjuntado (pero linkeado) si la descarga falla', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    const { attachments, summaries } = await resolveEmailAttachments([
      { name: 'roto.pdf', fileUrl: 'https://cdn.example.com/roto.pdf' },
    ])

    expect(attachments).toHaveLength(0)
    expect(summaries[0]).toEqual({ name: 'roto.pdf', fileUrl: 'https://cdn.example.com/roto.pdf', attached: false })
  })

  it('respeta el tope total de tamaño y deja el resto solo como link', async () => {
    const big = new Uint8Array(10 * 1024 * 1024) // 10 MB
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => big.buffer,
    }) as unknown as typeof fetch

    const files = [
      { name: 'a.pdf', fileUrl: 'https://cdn.example.com/a.pdf' },
      { name: 'b.pdf', fileUrl: 'https://cdn.example.com/b.pdf' },
      { name: 'c.pdf', fileUrl: 'https://cdn.example.com/c.pdf' },
    ]

    const { attachments, summaries } = await resolveEmailAttachments(files)

    // 10MB + 10MB ya supera el tope de 15MB — solo el primero entra adjuntado.
    expect(attachments).toHaveLength(1)
    expect(summaries.filter((s) => s.attached)).toHaveLength(1)
    expect(summaries.filter((s) => !s.attached)).toHaveLength(2)
  })
})
