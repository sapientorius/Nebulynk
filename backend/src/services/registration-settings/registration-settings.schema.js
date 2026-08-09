export const patchSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    enabled: { type: 'boolean' },
    allowed_domains: {
      type: 'array',
      maxItems: 100,
      items: { type: 'string', minLength: 1, maxLength: 253 }
    },
    requires_admin_approval: { type: 'boolean' }
  }
}
