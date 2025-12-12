#!/bin/bash

# Function to handle script exit
cleanup() {
    echo "Stopping servers..."
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
    fi
    exit
}

# Trap SIGINT (Ctrl+C) to run cleanup
trap cleanup SIGINT

echo "Starting Backend..."
cd backend
npm start &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to initialize
sleep 2

echo "Starting Frontend..."
cd frontend
npm run dev

# Wait for background processes
wait
