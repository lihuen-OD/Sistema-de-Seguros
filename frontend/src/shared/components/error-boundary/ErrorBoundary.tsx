import { Component, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageContent } from '../page-header/PageContent'
import { ErrorState } from '../empty-states/ErrorState'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// Error boundaries solo se pueden implementar con class components — no hay
// equivalente en hooks. Sin esto, un error de render en cualquier página
// blanquea toda la app sin posibilidad de recuperación.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <PageContent>
          <ErrorState
            title="Ocurrió un error inesperado"
            description="Algo falló al mostrar esta página. Probá recargar — si el problema persiste, contactá a soporte."
            action={
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
              >
                <RefreshCw size={15} />
                Recargar página
              </button>
            }
          />
        </PageContent>
      )
    }

    return this.props.children
  }
}
