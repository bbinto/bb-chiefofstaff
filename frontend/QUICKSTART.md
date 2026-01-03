# Quick Start Guide

## Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

You need to run two processes:

### Terminal 1: API Server
```bash
npm run server
```
This starts the Express server on `http://localhost:3001` that serves the reports.

### Terminal 2: Frontend Dev Server
```bash
npm run dev
```
This starts the Vite dev server on `http://localhost:3000`.

## Usage

1. Open your browser to `http://localhost:3000`
2. Use the filter dropdown to select an agent type (e.g., "Okr Progress", "Product Engineering")
3. Click on any report to view its full content
4. Use the "Back to Reports" button to return to the list

## Troubleshooting

**Error: "Failed to fetch reports"**
- Make sure the API server is running (`npm run server` in Terminal 1)
- Check that the `reports/` folder exists in the parent directory

**No reports showing**
- Verify that markdown files exist in the `../reports/` folder
- Check the server console for any error messages

**Port already in use**
- Change the port in `vite.config.js` (frontend) or `server.js` (API)
- Or kill the process using the port

