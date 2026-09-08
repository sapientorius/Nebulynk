// Run with all old backend processes stopped. Knex runs this migration atomically.
export async function up(knex) {
  await knex.raw('LOCK TABLE message_reminders IN EXCLUSIVE MODE')
  await knex.raw(`
    UPDATE message_reminders AS r
    SET status = 'delivered',
        delivered_at = COALESCE(r.delivered_at, n.created_at), updated_at = CURRENT_TIMESTAMP
    FROM notifications AS n
    WHERE r.status = 'processing' AND r.notification_id = n.id
      AND n.type = 'message_reminder' AND n.user_id = r.user_id AND n.message_id = r.message_id
  `)
  await knex('message_reminders').where('status', 'processing').whereNotNull('delivered_at')
    .update({ status: 'delivered', updated_at: knex.fn.now() })
  // Cancel losers before reactivation so the existing partial unique index holds.
  await knex.raw(`
    WITH ranked AS (
      SELECT id, user_id, message_id,
        row_number() OVER (PARTITION BY user_id, message_id ORDER BY created_at DESC NULLS LAST, id DESC) AS rank
      FROM message_reminders WHERE status = 'processing'
    )
    UPDATE message_reminders AS r
    SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    FROM ranked AS old
    WHERE r.id = old.id AND (old.rank > 1 OR EXISTS (
      SELECT 1 FROM message_reminders AS active
      WHERE active.user_id = old.user_id AND active.message_id = old.message_id AND active.status = 'active'
    ))
  `)
  await knex('message_reminders').where('status', 'processing').update({
    status: 'active', notification_id: null, cancelled_at: null, updated_at: knex.fn.now()
  })
}

export async function down() {
  // Data repair is irreversible: never resurrect delivered/cancelled reminders.
}
