function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function resolveColumnName(column) {
  if (typeof column !== 'string') return column
  const normalized = column.replace(/\s+as\s+.*/i, '')
  return normalized.includes('.') ? normalized.split('.').at(-1) : normalized
}

function matchesWhere(row, whereClauses) {
  return whereClauses.every((clause) => {
    if (clause.type === 'where') {
      if (typeof clause.field === 'object' && clause.field !== null) {
        return Object.entries(clause.field).every(([key, value]) => {
          const field = resolveColumnName(key)
          if (value && typeof value === 'object' && Array.isArray(value.$in)) {
            return value.$in.includes(row[field])
          }
          return row[field] === value
        })
      }
      const field = resolveColumnName(clause.field)
      if (clause.operator) {
        const left = row[field]
        const right = clause.value
        if (clause.operator === '>=') return left >= right
        if (clause.operator === '>') return left > right
        if (clause.operator === '<=') return left <= right
        if (clause.operator === '<') return left < right
        if (clause.operator === '!=') return left !== right
      }
      return row[field] === clause.value
    }

    if (clause.type === 'whereNotNull') {
      const field = resolveColumnName(clause.field)
      return row[field] !== null && row[field] !== undefined
    }

    if (clause.type === 'whereNull') {
      const field = resolveColumnName(clause.field)
      return row[field] === null || row[field] === undefined
    }

    if (clause.type === 'whereIn') {
      return clause.values.includes(row[resolveColumnName(clause.field)])
    }

    return true
  })
}

function pickColumns(row, columns) {
  if (!columns || columns.length === 0 || resolveColumnName(columns[0]) === '*') {
    return clone(row)
  }

  const next = {}
  for (const column of columns) {
    const field = resolveColumnName(column)
    next[field] = row[field]
  }
  return next
}

function createBuilder(tables, tableName, whereClauses = [], options = {}) {
  const rows = tables[tableName]
  if (!rows) {
    throw new Error(`Unexpected table: ${tableName}`)
  }

  return {
    client: { driverName: 'pg' },
    where(field, operatorOrValue, maybeValue) {
      if (arguments.length >= 3) {
        whereClauses.push({ type: 'where', field, operator: operatorOrValue, value: maybeValue })
        return this
      }
      whereClauses.push({ type: 'where', field, value: operatorOrValue })
      return this
    },
    andWhere(field, operatorOrValue, maybeValue) {
      return this.where(field, operatorOrValue, maybeValue)
    },
    whereNotNull(field) {
      whereClauses.push({ type: 'whereNotNull', field })
      return this
    },
    whereNull(field) {
      whereClauses.push({ type: 'whereNull', field })
      return this
    },
    whereIn(field, values) {
      whereClauses.push({ type: 'whereIn', field, values: [...values] })
      return this
    },
    forUpdate() {
      return this
    },
    join() {
      return this
    },
    leftJoin() {
      return this
    },
    orderBy(field, direction = 'asc') {
      options.orderBy = [...(options.orderBy || []), { field, direction }]
      return this
    },
    limit(value) {
      options.limit = Number(value)
      return this
    },
    offset(value) {
      options.offset = Number(value)
      return this
    },
    select(...columns) {
      options.select = columns
      return this
    },
    clearSelect() {
      delete options.select
      return this
    },
    clearOrder() {
      delete options.orderBy
      return this
    },
    count(column) {
      options.count = column
      return this
    },
    first() {
      const list = this._resolve()
      return Promise.resolve(list[0] ? clone(list[0]) : undefined)
    },
    insert(payload) {
      const items = Array.isArray(payload) ? payload : [payload]
      for (const item of items) {
        if (
          tableName === 'user_sponsorship_prompt_preferences'
          && rows.some((row) => row.user_id === item.user_id)
        ) {
          const error = new Error('duplicate key value violates unique constraint')
          error.code = '23505'
          error.constraint = 'user_sponsorship_prompt_preferences_pkey'
          return Promise.reject(error)
        }
        rows.push(clone(item))
      }
      return Promise.resolve(items.length)
    },
    update(patchData) {
      let count = 0
      for (const row of rows) {
        if (!matchesWhere(row, whereClauses)) continue
        Object.assign(row, clone(patchData))
        count += 1
      }
      return Promise.resolve(count)
    },
    del() {
      const kept = []
      let count = 0
      for (const row of rows) {
        if (matchesWhere(row, whereClauses)) {
          count += 1
          continue
        }
        kept.push(row)
      }
      tables[tableName] = kept
      return Promise.resolve(count)
    },
    delete() {
      return this.del()
    },
    clone() {
      return createBuilder(tables, tableName, [...whereClauses], { ...options })
    },
    then(resolve, reject) {
      return Promise.resolve(this._resolve().map((row) => clone(row))).then(resolve, reject)
    },
    catch(reject) {
      return Promise.resolve(this._resolve().map((row) => clone(row))).catch(reject)
    },
    _resolve() {
      let filtered = tables[tableName].filter((row) => matchesWhere(row, whereClauses))
      if (options.count) {
        return [{ total: filtered.length }]
      }
      if (options.orderBy?.length > 0) {
        filtered = [...filtered].sort((left, right) => {
          for (const order of options.orderBy) {
            const leftValue = left[order.field]
            const rightValue = right[order.field]
            if (leftValue === rightValue) continue
            if (order.direction === 'desc') {
              return leftValue < rightValue ? 1 : -1
            }
            return leftValue > rightValue ? 1 : -1
          }
          return 0
        })
      }

      if (Number.isFinite(options.limit)) {
        filtered = filtered.slice(0, options.limit)
      }
      if (Number.isFinite(options.offset) && options.offset > 0) {
        filtered = filtered.slice(options.offset)
      }
      return filtered.map((row) => pickColumns(row, options.select))
    }
  }
}

export function createMemoryDb(seed = {}) {
  const tables = {
    ai_provider_instances: [],
    ai_provider_secrets: [],
    ai_provider_model_cache: [],
    ai_function_configs: [],
    smtp_settings: [],
    smtp_secrets: [],
    password_resets: [],
    registration_email_tokens: [],
    auth_sessions: [],
    auth_login_challenges: [],
    auth_passkey_challenges: [],
    meetings: [],
    meeting_participants: [],
    meeting_artifacts: [],
    meeting_questions: [],
    meeting_recordings: [],
    meeting_recording_pauses: [],
    voice_message_artifacts: [],
    message_summaries: [],
    channels: [],
    channel_members: [],
    files: [],
    messages: [],
    users: [],
    roles: [],
    permissions: [],
    role_permissions: [],
    user_roles: [],
    user_two_factor: [],
    user_two_factor_pending: [],
    user_two_factor_recovery_codes: [],
    user_passkeys: [],
    invites: [],
    push_subscriptions: [],
    platform_settings: [],
    user_sponsorship_prompt_preferences: [],
    search_documents: [],
    notifications: [],
    message_reminders: [],
    ...clone(seed)
  }

  tables.users = tables.users.map((user) => (
    Object.prototype.hasOwnProperty.call(user, 'registration_status')
      ? user
      : { ...user, registration_status: 'active' }
  ))

  const db = (tableName) => createBuilder(tables, tableName)
  db.tables = tables
  db.transaction = async (callback) => callback((tableName) => createBuilder(tables, tableName))
  return db
}
