<<<<<<< HEAD
# skyblock-bz-flip
Skyblock baazar flipping assiantant 
=======
# Skyblock Flips Scraper

Fullstack project that scrapes [https://skyblock.bz/flips](https://skyblock.bz/flips) and provides a React UI for filtering, sorting, and blacklisting Skyblock flips.

## Structure

```
skyblock-flips/
├── backend/
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── tailwind.config.cjs
│   ├── postcss.config.cjs
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── index.css
└── README.md
```

## Run locally

### Backend

```bash
cd backend
npm install
node server.js
```

API endpoint: `http://localhost:3001/api/flips` (cached for 30 seconds).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend reads from `VITE_API_URL` if set, otherwise assumes `http://localhost:3001/api/flips`.

> Tip: if you change the backend port, remember to update `VITE_API_URL` (or the default inside `App.jsx`) so the frontend fetches from the correct origin.

<<<<<<< HEAD
⚠️ Respect the target site’s scraping policies, rate limits, and `robots.txt`.
>>>>>>> 731362a (Initial commit: Skyblock Flips scraper and UI)
=======

>>>>>>> d9dcd11 (Save local changes before rebase)
