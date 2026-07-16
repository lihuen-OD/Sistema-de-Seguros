/**
 * seed-admin.ts
 *
 * Crea el primer usuario ADMIN a partir de SEED_ADMIN_EMAIL/PASSWORD/NAME.
 * Seguro para correr en producción: no toca ningún otro dato, y no hace
 * nada si ya existe un usuario con ese email.
 *
 * Uso:
 *   npm run db:seed:admin
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const BCRYPT_COST = 12

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrador'

  if (!email || !password) {
    console.error('Faltan SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD en el .env')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Ya existe un usuario con el email ${email} — no se crea de nuevo.`)
    return
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  await prisma.user.create({
    data: { name, email, passwordHash, role: 'ADMIN', mustChangePassword: true },
  })

  console.log(`Usuario ADMIN creado: ${email}. Va a tener que cambiar la contraseña en el primer login.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
