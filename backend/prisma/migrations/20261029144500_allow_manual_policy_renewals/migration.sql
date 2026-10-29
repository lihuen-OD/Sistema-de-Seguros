-- Permite marcar una póliza como renovada administrativamente sin requerir
-- una póliza sucesora. Las filas históricas y sus relaciones no se modifican.
ALTER TABLE "policy_renewals"
  ALTER COLUMN "renewalPolicyId" DROP NOT NULL;
