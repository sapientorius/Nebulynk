<template>
  <div>
    <n-space justify="space-between" align="center" style="margin-bottom: 16px">
      <h3 style="margin: 0">{{ $t('ui.components.admin.role_management') }}</h3>
      <n-button type="primary" @click="showCreateModal = true">{{ $t('ui.components.admin.new_role') }}</n-button>
    </n-space>

    <n-spin :show="loading">
      <n-card v-for="role in roles" :key="role.id" style="margin-bottom: 12px">
        <template #header>
          <n-space align="center" :size="8">
            <span>{{ role.name }}</span>
            <n-tag v-if="role.is_system" size="small" type="info">{{ $t('ui.components.admin.system') }}</n-tag>
            <n-tag size="small" :type="role.scope === 'platform' ? 'warning' : 'success'">
              {{ role.scope }}
            </n-tag>
          </n-space>
        </template>
        <template #header-extra>
          <n-button
            v-if="!role.is_system"
            size="small"
            type="error"
            quaternary
            @click="deleteRole(role)"
          >
            {{ $t('ui.components.admin.delete') }}
          </n-button>
        </template>
        <p v-if="role.description" style="margin: 0 0 12px 0; opacity: 0.7">{{ role.description }}</p>
        <n-checkbox-group
          :value="getRolePermissionNames(role.id)"
          @update:value="(val) => updateRolePermissions(role.id, val)"
        >
          <n-space>
            <n-checkbox
              v-for="perm in allPermissions"
              :key="perm.id"
              :value="perm.name"
              :label="perm.name"
            />
          </n-space>
        </n-checkbox-group>
      </n-card>
    </n-spin>

    <n-modal v-model:show="showCreateModal">
      <n-card :title="$t('ui.components.admin.create_role')" style="max-width: 400px">
        <n-form :model="newRole">
          <n-form-item :label="$t('ui.components.admin.name')">
            <n-input v-model:value="newRole.name" :placeholder="$t('ui.components.admin.role_name')" />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.description')">
            <n-input v-model:value="newRole.description" type="textarea" :placeholder="$t('ui.components.admin.optional')" />
          </n-form-item>
          <n-form-item :label="$t('ui.components.admin.scope')">
            <n-radio-group v-model:value="newRole.scope">
              <n-radio value="platform">{{ $t('ui.components.admin.platform') }}</n-radio>
              <n-radio value="channel">Channel</n-radio>
            </n-radio-group>
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showCreateModal = false">{{ $t('ui.components.admin.cancel') }}</n-button>
            <n-button type="primary" :loading="creating" @click="doCreateRole">{{ $t('ui.components.admin.create') }}</n-button>
          </n-space>
        </template>
      </n-card>
    </n-modal>
  </div>
</template>

<script>
import { useAdminStore } from '../../stores/index.js'

export default {
  name: 'RoleManager',
  data() {
    return {
      showCreateModal: false,
      creating: false,
      newRole: {
        name: '',
        description: '',
        scope: 'platform'
      }
    }
  },
  computed: {
    adminStore() {
      return useAdminStore()
    },
    roles() {
      return this.adminStore.roles
    },
    allPermissions() {
      return this.adminStore.permissions
    },
    loading() {
      return this.adminStore.loadingRoleData
    }
  },
  async created() {
    await this.loadData()
  },
  methods: {
    async loadData() {
      try {
        await this.adminStore.refreshRoleData()
      } catch (error) {
        console.error('Failed to load RBAC data:', error)
      }
    },

    getRolePermissionNames(roleId) {
      return this.adminStore.getRolePermissionNames(roleId)
    },

    async updateRolePermissions(roleId, newPermNames) {
      try {
        await this.adminStore.updateRolePermissions(roleId, newPermNames)
      } catch (error) {
        console.error('Failed to update permissions:', error)
      }
    },

    async doCreateRole() {
      if (!this.newRole.name.trim()) return
      this.creating = true
      try {
        await this.adminStore.createRole({
          name: this.newRole.name.trim(),
          description: this.newRole.description,
          scope: this.newRole.scope
        })
        this.showCreateModal = false
        this.newRole = { name: '', description: '', scope: 'platform' }
      } catch (error) {
        console.error('Failed to create role:', error)
      } finally {
        this.creating = false
      }
    },

    async deleteRole(role) {
      try {
        await this.adminStore.deleteRole(role.id)
      } catch (error) {
        console.error('Failed to delete role:', error)
      }
    }
  }
}
</script>
