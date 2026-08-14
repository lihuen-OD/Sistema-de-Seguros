import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  // vite build inlina esta variable en el bundle en tiempo de compilación — si
  // falta, cae en el fallback a localhost:3001 (ver shared/api/client.ts) y el
  // build queda apuntando a un backend inexistente en demo/producción, sin
  // ningún error visible hasta que un usuario reporta que nada funciona.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (!env.VITE_API_URL) {
      throw new Error(
        'VITE_API_URL no está definida. Sin esta variable el build queda apuntando a ' +
        'http://localhost:3001 (el fallback de desarrollo), rompiendo todas las llamadas a la ' +
        'API en demo/producción. Configurala en las variables de entorno de la plataforma de ' +
        'build (Netlify) antes de compilar.',
      )
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
