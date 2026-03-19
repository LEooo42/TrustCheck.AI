# TrustCheck.AI — Back-End

FastAPI server that powers the AI ad-compliance analysis.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | FastAPI |
| AI Model | Claude (Anthropic) |
| Server | Uvicorn |
| Image support | JPEG · PNG · GIF · WEBP (up to 5 MB each) |

---

## Setup

### 1. Clone & enter the folder
```bash
git clone https://github.com/LEooo42/TrustCheck.AI.git
cd TrustCheck.AI/backend
```

### 2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Add your API key
```bash
cp .env.example .env
# Open .env and paste your Anthropic API key
```

### 5. Run the server
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The server will be available at **http://127.0.0.1:8000**

---

## API Reference

### `POST /v1/analyze`

Analyzes an ad for platform policy compliance.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `platform` | string | ✅ | `facebook` or `google` |
| `ad_text` | string | ✅ | The ad caption / body text |
| `language` | string | ❌ | Language hint, e.g. `en` (default: `auto`) |
| `images` | file(s) | ❌ | One or more ad images |

**Response:**
```json
{
  "analysis_id": "uuid",
  "platform": "facebook",
  "score": 82,
  "grade": "pass",
  "result": {
    "summary": "...",
    "violations": [
      {
        "code": "MISLEADING_CLAIM",
        "severity": "high",
        "rationale": "...",
        "suggested_fix": "..."
      }
    ],
    "suggestions": ["..."]
  }
}
```

**Grade scale:**
- `pass` → score ≥ 80 ✅
- `review` → score 60–79 ⚠️
- `fail` → score < 60 ❌

### `GET /health`
Returns `{ "status": "ok" }` — use for uptime monitoring.

---

## Interactive Docs

Once running, visit **http://127.0.0.1:8000/docs** for the Swagger UI where you can test every endpoint directly in your browser.

---

## Deployment (quick options)

| Platform | Command |
|---|---|
| **Railway** | Connect repo → set `ANTHROPIC_API_KEY` env var → deploy |
| **Render** | New Web Service → Build: `pip install -r requirements.txt` → Start: `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Fly.io** | `fly launch` → set secret with `fly secrets set ANTHROPIC_API_KEY=...` |

> Remember to update `API_BASE` in `index.js` from `http://127.0.0.1:8000` to your deployed URL.
