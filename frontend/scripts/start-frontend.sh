#!/bin/sh
set -eu
node /opt/nebulynk/frontend/scripts/render-nginx-conf.mjs --runtime
nginx -t -c /tmp/nebulynk/nginx.conf
exec nginx -c /tmp/nebulynk/nginx.conf -g 'daemon off;'
