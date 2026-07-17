import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { FormInput } from './FormSection'

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

// FormInput con un botón de mostrar/ocultar — para que se pueda revisar lo
// que se tipeó antes de confirmar (alta de usuario, reset de contraseña, login).
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <FormInput {...props} type={visible ? 'text' : 'password'} className={`pr-10 ${className ?? ''}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}
