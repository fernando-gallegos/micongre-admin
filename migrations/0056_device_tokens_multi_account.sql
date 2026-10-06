-- Un mismo teléfono puede estar registrado para varias personas a la vez (familias con un solo celular): la unicidad
-- pasa de "token" a "persona + token", así iniciar sesión con otra cuenta ya no le quita el registro a la anterior.
DROP INDEX device_tokens_token_idx;
CREATE UNIQUE INDEX device_tokens_user_token_idx ON device_tokens (user_id, token);
CREATE INDEX device_tokens_token_idx ON device_tokens (token);
