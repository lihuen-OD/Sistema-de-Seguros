import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './app/App'
import { ensureDevToken } from './shared/api/auth'
import { queryClient } from './shared/queryClient'
import './index.css'

// El auto-login de desarrollo nunca debe poder ejecutarse en un build de
// producción, aunque el backend quedara mal configurado (sin NODE_ENV=production).
const bootstrap = import.meta.env.DEV ? ensureDevToken() : Promise.resolve()

bootstrap.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  )
})
