import { detectFileType, isAllowedMimetype, matchesDeclaredMimetype, formatFileSize, sanitizeFileName } from '../files'

// ── detectFileType ────────────────────────────────────────────────────────────

describe('detectFileType', () => {
  it('detects PDF', () => {
    expect(detectFileType('application/pdf')).toBe('pdf')
  })

  it('detects image types', () => {
    expect(detectFileType('image/jpeg')).toBe('image')
    expect(detectFileType('image/jpg')).toBe('image')
    expect(detectFileType('image/png')).toBe('image')
    expect(detectFileType('image/gif')).toBe('image')
    expect(detectFileType('image/webp')).toBe('image')
  })

  it('detects Excel / spreadsheet types', () => {
    expect(detectFileType('application/vnd.ms-excel')).toBe('excel')
    expect(
      detectFileType(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('excel')
    expect(detectFileType('text/csv')).toBe('excel')
  })

  it('detects Word types', () => {
    expect(detectFileType('application/msword')).toBe('word')
    expect(
      detectFileType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('word')
  })

  it('detects video types', () => {
    expect(detectFileType('video/mp4')).toBe('video')
    expect(detectFileType('video/quicktime')).toBe('video')
    expect(detectFileType('video/x-msvideo')).toBe('video')
    expect(detectFileType('video/webm')).toBe('video')
  })

  it('returns other for unknown MIME types', () => {
    expect(detectFileType('application/zip')).toBe('other')
    expect(detectFileType('text/plain')).toBe('other')
    expect(detectFileType('application/x-msdownload')).toBe('other')
    expect(detectFileType('')).toBe('other')
  })
})

// ── isAllowedMimetype ─────────────────────────────────────────────────────────

describe('isAllowedMimetype', () => {
  it('allows PDF', () => {
    expect(isAllowedMimetype('application/pdf')).toBe(true)
  })

  it('allows image types', () => {
    expect(isAllowedMimetype('image/jpeg')).toBe(true)
    expect(isAllowedMimetype('image/png')).toBe(true)
    expect(isAllowedMimetype('image/webp')).toBe(true)
  })

  it('allows Excel and CSV', () => {
    expect(isAllowedMimetype('application/vnd.ms-excel')).toBe(true)
    expect(isAllowedMimetype('text/csv')).toBe(true)
  })

  it('allows Word', () => {
    expect(isAllowedMimetype('application/msword')).toBe(true)
    expect(
      isAllowedMimetype(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true)
  })

  it('allows video', () => {
    expect(isAllowedMimetype('video/mp4')).toBe(true)
    expect(isAllowedMimetype('video/quicktime')).toBe(true)
    expect(isAllowedMimetype('video/x-msvideo')).toBe(true)
    expect(isAllowedMimetype('video/webm')).toBe(true)
  })

  it('rejects disallowed types', () => {
    expect(isAllowedMimetype('application/zip')).toBe(false)
    expect(isAllowedMimetype('text/html')).toBe(false)
    expect(isAllowedMimetype('application/x-msdownload')).toBe(false)
    expect(isAllowedMimetype('application/javascript')).toBe(false)
    expect(isAllowedMimetype('')).toBe(false)
  })
})

// ── matchesDeclaredMimetype ───────────────────────────────────────────────────

describe('matchesDeclaredMimetype', () => {
  it('accepts a real PDF signature', () => {
    expect(matchesDeclaredMimetype(Buffer.from('%PDF-1.4 ...'), 'application/pdf')).toBe(true)
  })

  it('rejects a fake PDF (wrong bytes, right declared mimetype)', () => {
    expect(matchesDeclaredMimetype(Buffer.from('not-a-real-pdf'), 'application/pdf')).toBe(false)
  })

  it('accepts a real JPEG signature', () => {
    expect(matchesDeclaredMimetype(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), 'image/jpeg')).toBe(true)
  })

  it('rejects an HTML file renamed to .jpg (declared image/jpeg)', () => {
    expect(matchesDeclaredMimetype(Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg')).toBe(false)
  })

  it('accepts a real PNG signature', () => {
    expect(
      matchesDeclaredMimetype(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), 'image/png'),
    ).toBe(true)
  })

  it('accepts a real GIF signature', () => {
    expect(matchesDeclaredMimetype(Buffer.from('GIF89a...'), 'image/gif')).toBe(true)
  })

  it('accepts a real WebP signature', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
    expect(matchesDeclaredMimetype(buf, 'image/webp')).toBe(true)
  })

  it('rejects a WebP-declared file missing the WEBP tag', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('AVI ')])
    expect(matchesDeclaredMimetype(buf, 'image/webp')).toBe(false)
  })

  it('accepts a real XLSX/DOCX (ZIP) signature', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    expect(matchesDeclaredMimetype(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(matchesDeclaredMimetype(buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
  })

  it('rejects a non-ZIP file declared as XLSX', () => {
    expect(
      matchesDeclaredMimetype(
        Buffer.from('not a zip'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(false)
  })

  it('accepts a real legacy XLS/DOC (OLE2) signature', () => {
    const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])
    expect(matchesDeclaredMimetype(buf, 'application/vnd.ms-excel')).toBe(true)
    expect(matchesDeclaredMimetype(buf, 'application/msword')).toBe(true)
  })

  it('does not verify formats without a reliable signature (CSV, video) — declared mimetype is trusted', () => {
    expect(matchesDeclaredMimetype(Buffer.from('a,b,c\n1,2,3'), 'text/csv')).toBe(true)
    expect(matchesDeclaredMimetype(Buffer.from('anything'), 'video/mp4')).toBe(true)
  })
})

// ── formatFileSize ────────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes when size < 1KB', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('formats kilobytes when 1KB <= size < 1MB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(10240)).toBe('10.0 KB')
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats megabytes when size >= 1MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
    expect(formatFileSize(1024 * 1024 * 20)).toBe('20.0 MB')
  })
})

// ── sanitizeFileName ──────────────────────────────────────────────────────────

describe('sanitizeFileName', () => {
  it('leaves a normal filename untouched', () => {
    expect(sanitizeFileName('poliza-2026.pdf')).toBe('poliza-2026.pdf')
  })

  it('strips control characters', () => {
    expect(sanitizeFileName('archivo\x00malicioso.pdf')).toBe('archivomalicioso.pdf')
  })

  it('falls back to a default name when the cleaned name is empty', () => {
    expect(sanitizeFileName('   ')).toBe('archivo')
  })

  it('truncates an overly long name while preserving the extension', () => {
    const longName = `${'a'.repeat(300)}.pdf`
    const result = sanitizeFileName(longName, 200)
    expect(result.length).toBe(200)
    expect(result.endsWith('.pdf')).toBe(true)
  })

  it('truncates without trying to preserve an implausibly long "extension"', () => {
    const longName = 'a'.repeat(300)
    const result = sanitizeFileName(longName, 200)
    expect(result.length).toBe(200)
  })
})
