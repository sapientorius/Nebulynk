// Sets user_id from the authenticated user on create operations
export const setUserId = (field = 'user_id') => async (context) => {
  if (context.params.user) {
    context.data[field] = context.params.user.id
  }
  return context
}
