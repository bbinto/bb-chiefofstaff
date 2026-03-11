# Podcast Functionality

This document explains how the podcast / text-to-speech (TTS) system works in bb-chiefofstaff — from clicking a button in the UI to a downloadable MP3.

---

## Overview

Any markdown report can be converted to an MP3 podcast episode. The system:

1. Optionally condenses the report into a short, narration-friendly "light" version
2. Passes the markdown to an external Python script (`md2podcast.py`) that converts it to speech
3. Streams live progress back to the browser
4. Serves the finished MP3 for download or (optionally) uploads it to an RSS feed

```
Report (.md)
  └─► [Optional] Light report  ──► Condensed .md
        └─► md2podcast.py  ──► .mp3
              └─► Browser download / RSS feed
```

---

## Quick Start

### Prerequisites

```bash
# 1. Clone the TTS converter (separate repo)
git clone https://github.com/bbinto/md-to-podcast /home/pi/Documents/GitHub/md-to-podcast

# 2. Install Python dependencies
pip install edge-tts openai ffmpeg-python

# 3. Ensure ffmpeg is on PATH
sudo apt install ffmpeg

# 4. Set the path in config.json
```

### config.json

```json
{
  "md2podcastPath": "/home/pi/Documents/GitHub/md-to-podcast/md2podcast.py"
}
```

This path is **required**. Podcast creation fails silently if it is missing.

---

## Architecture

```
Browser
  │  POST /api/reports/:filename/podcast
  │
  ▼
frontend/server.js
  │  Validates file, reads config, builds command
  │  Spawns child process → stores in activeExecutions Map
  │  Returns { executionId }
  │
  ├─► GET /api/execution/:id/stream   (SSE — real-time logs)
  └─► GET /api/execution/:id          (polling fallback)
  │
  ▼
md-to-podcast/md2podcast.py
  │  Strips markdown → plain text
  │  Chunks text (4 000 char max per chunk)
  │  Calls TTS engine per chunk
  │  Combines chunks with ffmpeg
  │  Writes reports/<basename>.mp3
  │
  └─► (Optional) Publish to RSS feed + FTP upload
```

---

## Step-by-Step Flow

### 1. User clicks "Create Podcast"

`ReportViewer.jsx` sends:

```http
POST /api/reports/daily-brief-2026-02-25.md/podcast
Content-Type: application/json

{ "engine": "edge", "voice": "", "rate": 1.0 }
```

### 2. Backend spawns the converter

`server.js` builds and runs:

```bash
python3 /path/to/md2podcast.py \
  /path/to/reports/daily-brief-2026-02-25.md \
  /path/to/reports/daily-brief-2026-02-25.mp3 \
  --engine edge \
  --voice "" \
  --rate "+0%"
```

The process is tracked in memory under an `executionId` like `podcast-1708937234567`.

**Rate conversion:** The frontend always sends a numeric rate (e.g. `1.0`). The backend converts it to the format each engine expects:

| Frontend value | Edge format | OpenAI format |
|---|---|---|
| `1.0` (normal) | `+0%` | `1.0` |
| `1.2` (20% faster) | `+20%` | `1.2` |
| `0.8` (20% slower) | `-20%` | `0.8` |

### 3. Live progress streams to the browser

The frontend opens a Server-Sent Events connection:

```
GET /api/execution/podcast-1708937234567/stream
```

Each log line from `md2podcast.py` is forwarded as a JSON event:

```
data: {"type":"info","message":"Starting podcast conversion..."}
data: {"type":"stdout","message":"Reading file... 42 317 chars"}
data: {"type":"stdout","message":"Chunk 1/3 → TTS..."}
data: {"type":"status","status":"completed","exitCode":0}
```

If the SSE connection fails, the frontend falls back to polling every 1.5 seconds.

### 4. MP3 is served for download

On completion the frontend automatically triggers:

```
GET /api/reports/daily-brief-2026-02-25.md/podcast
→ streams reports/daily-brief-2026-02-25.mp3
```

The MP3 file lives in the same `reports/` directory as the source markdown.

---

## TTS Engines

### `edge` (default — free, no API key)

Uses Microsoft Edge's neural TTS via the `edge-tts` Python library.

```bash
--engine edge --voice "en-US-AriaNeural" --rate "+0%"
```

**Recommended voices:**

| Voice | Style |
|---|---|
| `en-US-AriaNeural` | Friendly, conversational (default) |
| `en-US-GuyNeural` | Male, professional |
| `en-US-JennyNeural` | Female, warm |

List all available voices:
```bash
python md2podcast.py --list-voices --engine edge
```

### `openai` (higher quality, requires API key)

Uses the OpenAI TTS API (`tts-1` or `tts-1-hd`).

```bash
--engine openai --voice "nova" --rate "1.0"
```

**Requires:** `OPENAI_API_KEY` environment variable.

**Voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

---

## Configuration

Settings are resolved in this priority order:

```
Request body  →  Environment variables  →  config.json  →  Defaults
```

| Setting | Env var | config.json key | Default |
|---|---|---|---|
| TTS engine | `MD2PODCAST_ENGINE` | `md2podcastEngine` | `edge` |
| Voice | `MD2PODCAST_VOICE` | `md2podcastVoice` | `""` (engine default) |
| Speech rate | `MD2PODCAST_RATE` | `md2podcastRate` | `1.0` |
| Script path | `MD2PODCAST_PATH` | `md2podcastPath` | *(required)* |

---

## Shell Scripts

### `light.sh` — Condense a report before conversion

Long reports with lots of tables and metadata do not narrate well. `light.sh` calls the `/light` API endpoint to generate a condensed, TTS-optimised version first.

```bash
sh light.sh daily-brief-2026-02-25.md
# → Creates daily-brief-2026-02-25-light.md
# → Output is clean prose with no tables, emojis, or cost metadata
```

Then convert the light report:
```bash
# via the UI — select the -light.md file and click Create Podcast
```

The light report is generated by the currently selected LLM (Claude / Gemini / Ollama) using this prompt structure:

- Strip operational metadata (tokens, cost, environmental impact)
- Rewrite in spoken, podcast-host style
- Keep to four sections: Executive Summary → Key Insights → Actions → Risks

### `podcast.sh` — Legacy direct conversion

The original script that bypasses the API entirely and runs `md2podcast.py` directly, then uploads to FTP.

```bash
sh podcast.sh daily-brief-2026-02-25
# Note: filename WITHOUT the .md extension
```

This script also calls `upload_podcast_ftp.py` to push the episode to a podcast hosting server and update the RSS feed. It is kept for manual/offline use but the UI flow is preferred.

---

## RSS Feed & FTP Publishing (Optional)

`md2podcast.py` accepts a `--publish` flag that adds the episode to a local RSS feed:

```bash
python md2podcast.py input.md output.mp3 --engine edge --publish \
  --title "Daily Brief 2026-02-25" \
  --description "Weekly summary for the team"
```

This updates:
- `podcast/episodes.json` — episode index
- `podcast/feed.xml` — RSS 2.0 feed
- Copies the MP3 to `podcast/episodes/`

`upload_podcast_ftp.py` then syncs the `podcast/` directory to an FTP server configured in `md-to-podcast/ftp_upload_config.json`:

```json
{
  "host": "ftp.example.com",
  "port": 21,
  "username": "your_username",
  "password": "your_password",
  "remote_dir": "/public_html/podcast",
  "podcast_dir": "./podcast",
  "tls": true
}
```

> The `podcast.sh` script runs both steps automatically. The UI flow does **not** publish to RSS — it only creates the local MP3.

---

## File Locations

| File | Location |
|---|---|
| Source reports | `reports/*.md` |
| Generated MP3s | `reports/*.mp3` |
| TTS script | `../md-to-podcast/md2podcast.py` |
| RSS feed files | `../md-to-podcast/podcast/` |
| Episode index | `../md-to-podcast/podcast/episodes.json` |
| RSS XML | `../md-to-podcast/podcast/feed.xml` |
| FTP config | `../md-to-podcast/ftp_upload_config.json` |

---

## Frontend UI

In the **Report Viewer**, two controls appear for each report:

| Button | When visible | Action |
|---|---|---|
| Microphone icon | Always | Create MP3 from this report |
| Download MP3 | After MP3 exists | Download the generated file |

A modal shows live logs during conversion, with colour-coded lines (info / stdout / stderr / error). On success the file downloads automatically and the modal closes.

---

## Troubleshooting

**"md2podcastPath not configured"**
→ Add `"md2podcastPath": "/path/to/md2podcast.py"` to `config.json`.

**Podcast creation starts but produces no MP3**
→ Check that `ffmpeg` is installed and on PATH (`ffmpeg -version`).

**Edge TTS fails silently**
→ Run `pip install --upgrade edge-tts` and check network access.

**OpenAI engine returns auth error**
→ Set `OPENAI_API_KEY` in your `.env` file.

**SSE logs not appearing in browser**
→ The UI falls back to polling automatically — logs will appear slightly delayed.

**Light report is empty**
→ The active LLM must be reachable. Check Settings and confirm the API key is set.

---

## Morning Briefing Automation

> "I prefer listening over reading — especially in the car. Having agent reports automatically converted into podcast-friendly audio is perfect for staying on top of things hands-free."

The full morning briefing pipeline runs automatically so that a fresh audio episode is ready before you wake up.

### How it works

A cron job runs `daily-brief-cron.sh` each morning (e.g. 8:00 AM) while you sleep. By the time you're up and ready to leave, the RSS feed already contains today's episode.

```
[Cron — e.g. 6:00 AM]
  └─► daily-brief-cron.sh
        │
        ├─ Step 1: npm start daily-brief
        │    └─► reports/daily-brief-YYYY-MM-DD.md
        │
        ├─ Step 2: npm run light -- <filename>
        │    └─► reports/daily-brief-YYYY-MM-DD-light.md
        │         (prose rewrite, no tables or metadata — optimised for speech)
        │
        └─ Step 3: sh podcast.sh <filename>-light
             └─► reports/daily-brief-YYYY-MM-DD-light.mp3
                  + podcast/feed.xml  (RSS updated)
                  + FTP upload to podcast host

[You wake up]
  └─► Google Home / smart speaker
        └─► "Play my Daily Briefing podcast"
              └─► Streams latest episode from RSS feed
```

### Setting up the cron job

```bash
# Interactive setup — prompts for hour and minute
./setup-daily-cron.sh
```

Or add it manually (`crontab -e`):

```
# Run at 6:00 AM every day (adjust to suit your wake-up time)
0 6 * * * cd /home/pi/Documents/GitHub/bb-chiefofstaff && /home/pi/Documents/GitHub/bb-chiefofstaff/daily-brief-cron.sh
```

**Tip:** Schedule it 1–2 hours before you typically wake up to ensure the full pipeline (report → light → TTS → FTP upload) has time to complete.

### Monitoring

```bash
# Watch the live run
tail -f logs/daily-brief-cron.log

# Review yesterday's run
cat logs/daily-brief-cron.log
```

Each step is timestamped. If any step fails the script exits immediately, so the log will show exactly where it stopped.

### Google Home / smart speaker setup

1. Host your RSS feed at a public URL (configured in `md-to-podcast/ftp_upload_config.json`).
2. Add the feed URL to a podcast app that your smart speaker can access (e.g. Google Podcasts, Pocket Casts, or a custom Google Home routine via a media URL).
3. Create a Google Home routine triggered at wake-up (or on voice command) that plays the latest episode from your feed.

Once set up, saying *"Hey Google, play my daily briefing"* (or having it play automatically when your morning alarm fires) delivers a freshly generated, AI-narrated summary of everything that matters — hands-free, ready for the commute.
