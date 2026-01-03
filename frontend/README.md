# Mari, the Chief of Staff Frontend Dashboard

A modern web dashboard for viewing and filtering agent reports from Mari, the Chief of Staff system.

## Features

- 📊 View all agent reports from the `reports/` folder
- 🔍 Filter reports by agent type (okr-progress, product-engineering, business-health, etc.)
- 📝 Beautiful markdown rendering with syntax highlighting
- 🎨 Modern, responsive UI built with React and Tailwind CSS
- ⚡ Fast and lightweight with Vite

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the API server (in one terminal):
```bash
npm run server
```

3. Start the development server (in another terminal):
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

## Available Agents

The dashboard automatically detects all agent types from the reports folder. Common agents include:

- **okr-progress** - OKR tracking and progress reports
- **product-engineering** - Development progress and launches
- **business-health** - ARR metrics, deals, and churn analysis
- **weekly-recap** - Weekly team communications and activities
- And more...

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── FilterBar.jsx      # Agent filtering UI
│   │   ├── ReportList.jsx     # List of reports
│   │   └── ReportViewer.jsx   # Markdown report viewer
│   ├── App.jsx                # Main app component
│   ├── main.jsx               # Entry point
│   └── index.css              # Global styles
├── server.js                  # Express API server
├── package.json
└── vite.config.js
```

## API Endpoints

The Express server provides:

- `GET /api/reports` - Get all reports with metadata
- `GET /api/reports/:filename` - Get specific report content
- `GET /api/agents` - Get list of unique agent names

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` folder.

