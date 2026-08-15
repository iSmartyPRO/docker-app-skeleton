#!/bin/sh

# Function to handle shutdown
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

# Trap SIGTERM and SIGINT
trap cleanup SIGTERM SIGINT

# Start backend in dev mode (with nodemon for hot reload)
cd /app/backend
npm run dev &
BACKEND_PID=$!

# Start frontend in dev mode (with Vite for hot reload)
cd /app/frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
