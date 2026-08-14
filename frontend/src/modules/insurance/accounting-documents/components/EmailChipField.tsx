import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

interface EmailChipFieldProps {
  emails: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
  autoFocus?: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Campo "Para/Cc/Cco" al estilo Gmail: cada dirección confirmada se muestra
// como chip removible, y lo que se está tipeando queda en `draft` hasta que
// se confirma (Enter/Tab/coma o blur) — igual que Gmail, una dirección con
// formato inválido no se descarta, solo se marca en rojo para que el usuario
// la corrija o la borre.
export function EmailChipField({ emails, onChange, placeholder, autoFocus }: EmailChipFieldProps) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const trimmed = raw.trim().replace(/,$/, '')
    if (!trimmed) return
    if (!emails.includes(trimmed)) onChange([...emails, trimmed])
    setDraft('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault()
        commit(draft)
      }
    } else if (e.key === 'Backspace' && !draft && emails.length > 0) {
      onChange(emails.slice(0, -1))
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 w-full px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-400 transition-all"
    >
      {emails.map((email, i) => (
        <span
          key={email}
          className={clsx(
            'flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium',
            EMAIL_RE.test(email) ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-600 border border-red-200',
          )}
        >
          {email}
          <button
            type="button"
            onClick={() => onChange(emails.filter((_, idx) => idx !== i))}
            className="p-0.5 rounded-full hover:bg-black/10 transition-colors"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={emails.length === 0 ? placeholder : ''}
        autoFocus={autoFocus}
        className="flex-1 min-w-[140px] outline-none text-slate-800 placeholder:text-slate-400 bg-transparent py-1"
      />
    </div>
  )
}
