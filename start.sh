#!/bin/sh

nginx

STOPPING=
cleanup() {
    STOPPING=1
    echo "Shutting down..."
    nginx -s quit 2>/dev/null || true
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup TERM INT

# The app asks for a restart after a module package is installed, updated or
# removed (docs/module-packages.md): it exits with code 75 and is started again
# at once while nginx keeps answering. Any other exit ends the container
# (docker restarts it: restart: unless-stopped).
cd /app/backend
while :; do
    node server.js &
    NODE_PID=$!
    wait "$NODE_PID"
    CODE=$?
    NODE_PID=
    if [ -z "$STOPPING" ] && [ "$CODE" = "75" ]; then
        rm -f "${MODULES_DIR:-/app/data/modules}/.restart-requested" 2>/dev/null || true
        echo "Restarting the app (module packages changed)..."
        continue
    fi
    break
done
cleanup
