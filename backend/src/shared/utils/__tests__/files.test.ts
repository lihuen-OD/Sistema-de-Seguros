import { detectFileType, isAllowedMimetype, formatFileSize } from '../files'

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

  it('returns other for unknown MIME types', () => {
    expect(detectFileType('application/zip')).toBe('other')
    expect(detectFileType('text/plain')).toBe('other')
    expect(detectFileType('video/mp4')).toBe('other')
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

  it('rejects disallowed types', () => {
    expect(isAllowedMimetype('application/zip')).toBe(false)
    expect(isAllowedMimetype('text/html')).toBe(false)
    expect(isAllowedMimetype('video/mp4')).toBe(false)
    expect(isAllowedMimetype('application/javascript')).toBe(false)
    expect(isAllowedMimetype('')).toBe(false)
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
