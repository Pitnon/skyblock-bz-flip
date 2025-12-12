# Skyblock Bazaar Flipper

A full-stack application that analyzes real-time data from the Hypixel Skyblock Bazaar API to find the most profitable flips.

## Features

- **Real-time Data**: Fetches data directly from the official Hypixel API (`https://api.hypixel.net/v2/skyblock/bazaar`).
- **Smart Analysis**: Calculates profit margins and Coins Per Hour based on current Buy Order and Sell Offer prices.
- **Volume Tracking**: Uses hourly volume estimates (lower of instabuy/instasell) to ensure realistic profit projections.
- **Customizable**:
  - Adjustable tax rates (default 1.125%).
  - Advanced filtering (Price, Volume, Margin, CPH).
  - Blacklist specific items.
- **Live Updates**: Auto-refreshes data every 10 seconds to match API updates.

## Project Structure

```
skyblock-bz-flip/
├── backend/            # Node.js Express Server
│   ├── server.js       # API logic & Hypixel data fetching
│   └── package.json
├── frontend/           # React + Vite Frontend
│   ├── src/            # UI Components & Logic
│   └── package.json
└── start.sh            # One-click startup script
```

## Getting Started

### Prerequisites

- Node.js (v16+ recommended)
- npm

### Installation

1. Clone the repository.
2. Install dependencies for both backend and frontend:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### Running the Project

You can start both the backend and frontend with a single command:

```bash
./start.sh
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api/flips

## How it Works

1. **Backend**:
   - Polls the Hypixel Bazaar API.
   - Calculates the "Buy Price" (Sell Offer) and "Sell Price" (Buy Order) using the top order for maximum accuracy.
   - Calculates margins accounting for user-defined tax rates.
   - Estimates hourly volume and potential profit (Coins Per Hour).
   - Caches results for 10 seconds to respect API rate limits.

2. **Frontend**:
   - Displays the analyzed data in a sortable table.
   - Allows users to filter by price range, volume, and profitability.
   - Persists user preferences (filters, tax rate) in local storage.

## Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js, Express, Axios, Node-Cache
