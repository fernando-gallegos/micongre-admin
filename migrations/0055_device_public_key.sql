-- Llave pública (P-256) del dispositivo para cifrar de punta a punta los push: el relay solo ve un bloque ilegible.
ALTER TABLE device_tokens ADD COLUMN public_key TEXT;
