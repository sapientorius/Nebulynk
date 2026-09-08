import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { h } from 'vue'
import * as naive from 'naive-ui'
import { setupI18n, setLocale } from '../../src/lib/i18n.js'

export async function componentContext(path = '/', routeComponent = null) {
  const pinia = createPinia()
  setActivePinia(pinia)
  setLocale('en')
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/meetings/:meetingId', name: 'meeting', component: routeComponent || { render: () => null } },
    { path: '/:pathMatch(.*)*', component: { render: () => null } }
  ] })
  await router.push(path)
  await router.isReady()
  return { pinia, router, mount(component, options = {}) {
    const Host = { render() {
      return h(naive.NConfigProvider, null, { default: () => h(naive.NDialogProvider, null, {
        default: () => h(naive.NMessageProvider, null, { default: () => h(routeComponent ? RouterView : component, options.props) })
      }) })
    } }
    const root = mount(Host, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router, { install: setupI18n }, naive.create({ components: Object.entries(naive)
          .filter(([name]) => /^N[A-Z]/.test(name)).map(([, component]) => component) })],
        ...options.global
      }
    })
    const wrapper = root.findComponent(component)
    wrapper.unmount = () => root.unmount()
    return wrapper
  } }
}

export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
