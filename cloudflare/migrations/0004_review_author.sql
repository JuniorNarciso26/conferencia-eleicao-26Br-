-- Executar uma unica vez apos 0003_direct_upload.sql.
-- Mantem identificacao publica GitHub do revisor no instante da decisao.
-- Mesmo que a conta mude de login, o nome registrado para a revisao fica preservado.
ALTER TABLE zone_uploads ADD COLUMN reviewer_login TEXT;
-- Recupera o login registrado em users para revisoes historicas (incluindo zona 0252).
-- O nome recuperado corresponde ao registro atualmente salvo, que pode ter sido atualizado desde a revisao.
UPDATE zone_uploads
SET reviewer_login = (SELECT login FROM users WHERE id=zone_uploads.reviewer_id)
WHERE reviewer_id IS NOT NULL AND reviewer_login IS NULL;
