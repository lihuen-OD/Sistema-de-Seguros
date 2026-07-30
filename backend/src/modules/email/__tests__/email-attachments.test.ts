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

  it('no cuelga el envío si la descarga nunca responde — corta por timeout y deja el archivo solo como link', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn((_url: unknown, opts?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new Error('AbortError')))
      }),
    ) as unknown as typeof fetch

    const pending = resolveEmailAttachments([
      { name: 'colgado.pdf', fileUrl: 'https://cdn.example.com/colgado.pdf' },
    ])

    await jest.advanceTimersByTimeAsync(10_000)
    const { attachments, summaries } = await pending

    expect(attachments).toHaveLength(0)
    expect(summaries).toEqual([
      { name: 'colgado.pdf', fileUrl: 'https://cdn.example.com/colgado.pdf', attached: false },
    ])

    jest.useRealTimers()
  })

  it('descarga los adjuntos en paralelo, no uno por uno', async () => {
    // Ninguno de los dos "fetch" resuelve solo — si el código esperara al
    // primero antes de arrancar el segundo (en serie), el segundo jamás se
    // dispararía y este test quedaría colgado.
    const pendingResolvers: Record<string, (v: unknown) => void> = {}
    global.fetch = jest.fn((url: unknown) => new Promise((resolve) => {
      pendingResolvers[String(url)] = resolve
    })) as unknown as typeof fetch

    const pending = resolveEmailAttachments([
      { name: 'a.pdf', fileUrl: 'https://cdn.example.com/a.pdf' },
      { name: 'b.pdf', fileUrl: 'https://cdn.example.com/b.pdf' },
    ])

    // Deja correr los microtasks pendientes sin resolver ningún fetch todavía.
    await Promise.resolve()
    await Promise.resolve()
    expect(Object.keys(pendingResolvers).sort()).toEqual([
      'https://cdn.example.com/a.pdf',
      'https://cdn.example.com/b.pdf',
    ])

    const okResponse = (text: string) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(text).buffer })
    pendingResolvers['https://cdn.example.com/a.pdf'](okResponse('x'))
    pendingResolvers['https://cdn.example.com/b.pdf'](okResponse('y'))

    const { attachments } = await pending
    expect(attachments).toHaveLength(2)
  })
})
