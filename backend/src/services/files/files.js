import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { getFileUrl, deleteFile } from '../../lib/storage.js'
import { sanitizeFileForExternal, sanitizeFilesForExternal } from '../../lib/file-response.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { FilesRepository } from '../../domains/files/repository.js'
import { FilesDomainService } from '../../domains/files/service.js'
import { removeFileSearchDocument } from '../../lib/search-index.js'

export class FilesService extends KnexService {
  constructor(options) {
    super(options)
    this.domainService = options.domainService
  }

  async find(params) {
    const access = await this.domainService.resolveFindAccess(params)
    const data = await this.domainService.listFiles(access)
    const client = this.options.app.get('storagePresignClient') || this.options.app.get('storageClient')

    for (const file of data) {
      file.url = await getFileUrl(client, {
        key: file.storage_key,
        bucket: file.bucket
      })
    }

    return {
      data: params.provider ? sanitizeFilesForExternal(data) : data
    }
  }

  async get(id, params) {
    const access = await this.domainService.resolveGetAccess(id, params)
    const file = { ...access.file }

    const client = this.options.app.get('storagePresignClient') || this.options.app.get('storageClient')
    file.url = await getFileUrl(client, {
      key: file.storage_key,
      bucket: file.bucket
    })

    return params.provider ? sanitizeFileForExternal(file) : file
  }

  async remove(id, params) {
    const access = await this.domainService.resolveRemoveAccess(id, params)

    if (access.requiresManagePermission) {
      const context = {
        app: this.options.app,
        params: {
          ...params,
          query: access.permissionQuery
        }
      }
      await checkPermission('manage_messages')(context)
    }

    const client = this.options.app.get('storageClient')
    await deleteFile(client, {
      key: access.file.storage_key,
      bucket: access.file.bucket
    })

    await this.domainService.deleteFile(id)
    await removeFileSearchDocument(this.options.Model, id)
    return access.file
  }
}

export const files = (app) => {
  const db = app.get('postgresqlClient')
  const domainService = new FilesDomainService({
    repository: new FilesRepository(db)
  })

  const options = {
    Model: db,
    name: 'files',
    paginate: false,
    app,
    domainService
  }

  app.use('files', new FilesService(options), {
    methods: ['find', 'get', 'remove'],
    events: []
  })

  const service = app.service('files')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {},
    after: {},
    error: {}
  })
}
