#!/bin/sh

nginx

cleanup() {
    echo "Shutting down..."
    nginx -s quit 2>/dev/null || true
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup TERM INT

cd /app/backend
node server.js &
NODE_PID=$!
wait "$NODE_PID"
cleanup
