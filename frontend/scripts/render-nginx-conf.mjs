import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildFrontendContentSecurityPolicy,
  resolveFrontendConnectSourceOrigins
} from '../security-headers.config.js'

function readArg(name) {
  const args = process.argv.slice(2)
  const index = args.findIndex((value) => value === name || value.startsWith(`${name}=`))
  if (index === -1) return ''
  const value = args[index]
  if (value === name) return args[index + 1] || ''
  return value.slice(name.length + 1)
}

export function renderNginxConfig(env = process.env) {
  const connectOrigins = resolveFrontendConnectSourceOrigins({
    apiOrigins: [env.VITE_API_URL, env.VITE_BACKEND_URL],
    livekitOrigins: [env.VITE_LIVEKIT_URL]
  })
  const csp = buildFrontendContentSecurityPolicy({ connectOrigins })

  return `server {
  listen 8080;
  server_name localhost;

  root /usr/share/nginx/html;
  index index.html;

  add_header Content-Security-Policy "${csp}" always;
  add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), fullscreen=(self)" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header X-Content-Type-Options "nosniff" always;

  # Required for Vue Router history mode.
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache static assets aggressively, including self-hosted MediaPipe assets.
  location ~* \\.(js|css|png|jpg|jpeg|gif|ico|wasm|tflite)$ {
    expires 1y;
    add_header Cache-Control "public, no-transform";
  }
}
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = readArg('--out')
  const rendered = renderNginxConfig()

  if (outputPath) {
    const target = resolve(outputPath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, rendered)
  } else {
    process.stdout.write(rendered)
  }
}
