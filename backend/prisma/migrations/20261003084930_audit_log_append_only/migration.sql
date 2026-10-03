-- Make "AuditLog" append-only at the database level.
-- INSERT and SELECT stay allowed; every UPDATE or DELETE raises an error.
-- TRUNCATE is deliberately not blocked so the test database can be reset
-- (use TRUNCATE ... CASCADE there, never DELETE).

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
