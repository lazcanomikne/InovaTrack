-- Tipo de vuelta: qué va a hacer el chofer en esa parada.
--   entrega     → llevar mercancía (el caso de siempre; por eso es el default)
--   recoleccion → recoger algo del cliente
--   otro        → cualquier otra diligencia
--
-- No es destructivo: agrega una columna con default, así las vueltas que ya
-- existen quedan como 'entrega', que es lo que todas eran hasta ahora.
ALTER TABLE vueltas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'entrega';
