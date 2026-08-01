import { MeetingsService } from '../../src/services/meetings/meetings.js'

export function createMeetingsService({
  db,
  app,
  artifactDomainService,
  recordingControlDomainService
} = {}) {
  const targetDb = db || (() => {
    throw new Error('db should be mocked in test')
  })

  const targetApp = app || createMeetingsApp()

  return new MeetingsService({
    Model: targetDb,
    app: targetApp,
    artifactDomainService,
    recordingControlDomainService
  })
}

export function createMeetingsApp({ emitted = [], services = {}, getValues = {} } = {}) {
  return {
    get(name) {
      return Object.prototype.hasOwnProperty.call(getValues, name) ? getValues[name] : null
    },
    service(name) {
      if (services[name]) return services[name]
      return {
        emit(eventName, payload) {
          emitted.push({ service: name, eventName, payload })
        }
      }
    },
    channel() {
      return {
        connections: [],
        join() {}
      }
    }
  }
}
