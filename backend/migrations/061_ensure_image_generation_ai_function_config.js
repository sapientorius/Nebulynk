export async function up(knex) {
  const hasAiFunctionConfigs = await knex.schema.hasTable('ai_function_configs')
  if (!hasAiFunctionConfigs) return

  const existing = await knex('ai_function_configs')
    .where('function_key', 'image_generation')
    .first()
  if (existing) return

  await knex('ai_function_configs').insert({
    function_key: 'image_generation',
    enabled: false,
    provider_instance_id: null,
    model: null,
    updated_at: new Date().toISOString()
  })
}

export async function down() {
  // This migration repairs application configuration data. Removing the row on
  // rollback could discard provider/model choices made after the repair.
}
