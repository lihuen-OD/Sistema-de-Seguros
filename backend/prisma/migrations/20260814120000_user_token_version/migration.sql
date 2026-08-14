-- AlterTable
-- Contador para invalidar tokens JWT emitidos antes de un cambio/reseteo de
-- contraseña — ver comentario en el campo tokenVersion del modelo User.
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
