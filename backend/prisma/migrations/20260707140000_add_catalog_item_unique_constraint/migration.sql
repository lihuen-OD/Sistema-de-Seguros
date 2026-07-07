-- Fase 6 — Catálogos con validación fuerte.
-- Verificado antes de aplicar: no existen duplicados (category, label) en los
-- datos actuales (SELECT category, label, COUNT(*) ... HAVING COUNT(*) > 1 → vacío).

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_category_label_key" ON "catalog_items"("category", "label");
