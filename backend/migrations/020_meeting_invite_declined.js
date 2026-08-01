export async function up(knex) {
  await knex.raw(`
    DO $$
    DECLARE
      enum_type regtype;
      is_enum_type boolean := false;
      check_constraint_name text;
      check_definition text;
    BEGIN
      SELECT a.atttypid::regtype
      INTO enum_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'meeting_participants'
        AND a.attname = 'invite_status'
        AND a.attnum > 0
        AND NOT a.attisdropped
      LIMIT 1;

      IF enum_type IS NOT NULL THEN
        SELECT t.typtype = 'e'
        INTO is_enum_type
        FROM pg_type t
        WHERE t.oid = enum_type::oid;
      END IF;

      IF enum_type IS NOT NULL AND is_enum_type THEN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          WHERE e.enumtypid = enum_type
            AND e.enumlabel = 'declined'
        ) THEN
          EXECUTE format('ALTER TYPE %s ADD VALUE ''declined''', enum_type);
        END IF;
      ELSE
        SELECT con.conname, pg_get_constraintdef(con.oid)
        INTO check_constraint_name, check_definition
        FROM pg_constraint con
        WHERE con.conrelid = 'meeting_participants'::regclass
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%invite_status%'
        LIMIT 1;

        IF check_constraint_name IS NOT NULL
          AND (check_definition IS NULL OR check_definition NOT ILIKE '%declined%')
        THEN
          EXECUTE format(
            'ALTER TABLE meeting_participants DROP CONSTRAINT %I',
            check_constraint_name
          );
          EXECUTE format(
            'ALTER TABLE meeting_participants ADD CONSTRAINT %I CHECK (invite_status IN (''invited'', ''joined'', ''left'', ''declined''))',
            check_constraint_name
          );
        END IF;
      END IF;
    END
    $$;
  `)
}

export async function down() {
  // PostgreSQL enum values cannot be removed safely in a rollback.
}
