#!/bin/sh

nginx

STOPPING=
cleanup() {
    STOPPING=1
    echo "Shutting down..."
    nginx -s quit 2>/dev/null || true
    if [ -n "$WATCHDOG_PID" ]; then
        kill "$WATCHDOG_PID" 2>/dev/null || true
    fi
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || true
        wait "$NODE_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup TERM INT

# Watchdog (docs/module-packages.md «Watchdog»): node touches $PORTAL_HEARTBEAT_FILE every few
# seconds while its event loop runs (services/heartbeat.js). When the file is older than
# PORTAL_WATCHDOG_SECONDS (default 180; 0 = off) AND /health does not answer, node is alive
# but hung (a synchronous loop in a module's code): it is killed and started again; the boot
# markers of the packages that were loading block them at the next start. A slow boot (the
# database late, a long migration) keeps beating and is never killed.
WATCHDOG_SECONDS=${PORTAL_WATCHDOG_SECONDS:-180}
export PORTAL_HEARTBEAT_FILE=${PORTAL_HEARTBEAT_FILE:-/tmp/portal-heartbeat}
KILLED_FLAG="$PORTAL_HEARTBEAT_FILE.killed"

watchdog() {
    trap - TERM INT
    pid=$1
    started=$(date +%s)
    while kill -0 "$pid" 2>/dev/null; do
        sleep "${PORTAL_WATCHDOG_INTERVAL:-10}"
        now=$(date +%s)
        beat=$(stat -c %Y "$PORTAL_HEARTBEAT_FILE" 2>/dev/null || echo 0)
        [ "$beat" -lt "$started" ] && beat=$started
        if [ $((now - beat)) -gt "$WATCHDOG_SECONDS" ]; then
            if wget -q -T 5 -O /dev/null "http://127.0.0.1:${PORT:-3001}/health" 2>/dev/null; then
                continue
            fi
            echo "Watchdog: node ($pid) has been unresponsive for over ${WATCHDOG_SECONDS}s; killing it"
            touch "$KILLED_FLAG"
            kill -9 "$pid" 2>/dev/null || true
            return
        fi
    done
}

# The app asks for a restart after a module package is installed, updated or
# removed (docs/module-packages.md): it exits with code 75 and is started again
# at once while nginx keeps answering. A node the watchdog killed is started
# again too. Any other exit ends the container (docker restarts it: restart: unless-stopped).
cd "${PORTAL_APP_DIR:-/app/backend}"
while :; do
    rm -f "$PORTAL_HEARTBEAT_FILE" "$KILLED_FLAG" 2>/dev/null || true
    node "${PORTAL_ENTRY:-server.js}" &
    NODE_PID=$!
    WATCHDOG_PID=
    if [ "$WATCHDOG_SECONDS" -gt 0 ] 2>/dev/null; then
        watchdog "$NODE_PID" &
        WATCHDOG_PID=$!
    fi
    wait "$NODE_PID"
    CODE=$?
    NODE_PID=
    if [ -n "$WATCHDOG_PID" ]; then
        kill "$WATCHDOG_PID" 2>/dev/null || true
        wait "$WATCHDOG_PID" 2>/dev/null || true
        WATCHDOG_PID=
    fi
    if [ -z "$STOPPING" ] && [ "$CODE" = "75" ]; then
        rm -f "${MODULES_DIR:-/app/data/modules}/.restart-requested" 2>/dev/null || true
        echo "Restarting the app (module packages changed)..."
        continue
    fi
    if [ -z "$STOPPING" ] && [ -f "$KILLED_FLAG" ]; then
        echo "Restarting the app (killed by the watchdog)..."
        continue
    fi
    break
done
cleanup
