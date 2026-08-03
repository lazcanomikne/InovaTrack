-- INOVATRACK · Normaliza la taxonomía de roles
--
-- 0001_init.sql dejó 'colaborador' como default de `usuarios.rol` (y el
-- comentario del lado listaba "direccion | jefe | colaborador"), pero el
-- resto del código ya opera con un catálogo distinto: esOficina() en
-- api/_vueltas.js compara contra 'oficina'/'direccion', catalogos.js filtra
-- 'chofer' para la lista de choferes, y scripts/chofer.mjs ya da de alta con
-- 'chofer' explícito. Cualquier fila que haya quedado en 'colaborador' (o sin
-- rol) no aparecía como chofer en la oficina ni como oficina en ningún lado.
--
-- Este archivo sólo normaliza los DATOS existentes al catálogo único
-- chofer | oficina | direccion. No toca el DEFAULT de la columna: SQLite no
-- soporta ALTER COLUMN para eso sin recrear la tabla (arrastrando índices y
-- referencias de otras tablas), y ningún alta actual depende de ese default
-- —scripts/chofer.mjs siempre manda 'chofer' explícito—, así que el riesgo de
-- la reconstrucción no se justifica. El DEFAULT ya quedó en 'chofer' para
-- instalaciones nuevas (ver 0001_init.sql).
UPDATE usuarios
SET rol = 'chofer'
WHERE rol IS NULL OR rol NOT IN ('chofer', 'oficina', 'direccion');
