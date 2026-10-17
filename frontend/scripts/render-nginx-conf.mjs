import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildFrontendContentSecurityPolicy, resolveFrontendConnectSourceOrigins } from '../security-headers.config.js'
import { resolveRuntimeConfig, serializeRuntimeConfig } from './frontend-runtime-config.mjs'

function securityHeaders(config) {
  const connectOrigins = resolveFrontendConnectSourceOrigins({
    apiOrigins: [config.apiUrl, config.backendUrl],
    livekitOrigins: [config.livekitUrl]
  })
  return `  add_header Content-Security-Policy "${buildFrontendContentSecurityPolicy({ connectOrigins })}" always;
  add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), fullscreen=(self)" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Content-Type-Options "nosniff" always;`
}

export function renderNginxConfig(env = process.env, { runtime = false } = {}) {
  const config = resolveRuntimeConfig(env, { requireApi: runtime })
  const headers = securityHeaders(config)
  const server = `server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
${headers}

  location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 "ok\\n";
  }
  location = /runtime-config.js {
    ${runtime ? 'alias /tmp/nebulynk/runtime-config.js;' : 'try_files $uri =404;'}
    default_type application/javascript;
${headers}
    add_header Cache-Control "no-store" always;
  }
  location = /index.html {
${headers}
    add_header Cache-Control "no-store" always;
  }
  location / {
    try_files $uri $uri/ /index.html;
${headers}
    add_header Cache-Control "no-store" always;
  }
  # Only content-addressed assets and versioned vendor files get a long cache.
  location ~ ^/(assets|vendor)/ {
    try_files $uri =404;
${headers}
    add_header Cache-Control "public, max-age=31536000, immutable, no-transform" always;
  }
}
`
  if (!runtime) return server
  return `worker_processes auto;
pid /tmp/nebulynk/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log /dev/stdout;
  sendfile on;
  client_body_temp_path /tmp/nebulynk/client_temp;
  proxy_temp_path /tmp/nebulynk/proxy_temp;
  fastcgi_temp_path /tmp/nebulynk/fastcgi_temp;
  uwsgi_temp_path /tmp/nebulynk/uwsgi_temp;
  scgi_temp_path /tmp/nebulynk/scgi_temp;
${server}}
`
}

export async function writeRuntimeFiles(env = process.env, directory = '/tmp/nebulynk') {
  const config = resolveRuntimeConfig(env)
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'runtime-config.js'), serializeRuntimeConfig(config))
  await writeFile(resolve(directory, 'nginx.conf'), renderNginxConfig(env, { runtime: true }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--runtime')) {
      await writeRuntimeFiles()
    } else {
      const index = process.argv.indexOf('--out')
      const output = index === -1 ? '' : process.argv[index + 1]
      if (output) {
        await mkdir(dirname(resolve(output)), { recursive: true })
        await writeFile(resolve(output), renderNginxConfig())
      } else process.stdout.write(renderNginxConfig())
    }
  } catch (error) {
    console.error(`Nebulynk frontend configuration: ${error.message}`)
    process.exitCode = 1
  }
}
