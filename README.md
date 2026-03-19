# TrustCheck.AI

> An AI-powered ad compliance checker that analyzes advertising content against platform policies. Built by one curious developer.

---

## What it does

TrustCheck.AI lets you submit an ad's text and images, choose a target platform, and receive an instant compliance report powered by Claude AI. The report includes:

- A **compliance score** from 0 to 100
- A **verdict** -> Safe, Borderline, or Risky
- A breakdown of **violations** found in both text and image content, each with severity level and a concrete fix suggestion
- A list of **general improvement suggestions**
- A plain-English **summary** of the overall assessment

Supported platforms: **Facebook / Meta** and **Google Ads**.

---

## Project structure

```
TrustCheck.AI/
│
├── Website/                        # Front-end
│   ├── HTML pages/
│   │   ├── index.html              # Main analyzer page
│   │   ├── history.html            # Past analysis history
│   │   ├── about.html              # About page
│   │   └── contact.html            # Contact form
│   │
│   ├── CSS styles/
│   │   ├── index.css
│   │   ├── history.css
│   │   ├── about.css
│   │   └── contact.css
│   │
│   ├── JS scripts/
│   │   ├── index.js                # Core analyzer logic + API calls
│   │   ├── history.js              # localStorage history rendering
│   │   ├── about.js
│   │   └── contact.js              # EmailJS contact form
│   │
│   └── Images/
│
└── trustcheck-backend/             # Back-end
    ├── main.py                     # FastAPI application
    ├── requirements.txt
    ├── .env.example
    └── .gitignore
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Front-end | Vanilla HTML · CSS · JavaScript |
| Background | Vanta.NET (Three.js) |
| Contact form | EmailJS |
| Back-end | Python · FastAPI · Uvicorn |
| AI model | Claude (Anthropic) |
| Data validation | Pydantic |

---

## Getting started

### Prerequisites

- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com)

### 1. Clone the repository

```bash
git clone https://github.com/LEooo42/TrustCheck.AI.git
cd TrustCheck.AI
```

### 2. Set up the back-end

```bash
cd trustcheck-backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure your API key
cp .env.example .env
# Open .env and paste your Anthropic API key
```

### 3. Start the server

```bash
uvicorn main:app --reload
```

The API will be running at **http://127.0.0.1:8000**

### 4. Open the front-end

Open `Website/HTML pages/index.html` in your browser. The front-end is pre-configured to point to `http://127.0.0.1:8000` - no extra setup needed.

---

## API reference

### `POST /v1/analyze`

Analyzes ad content for platform policy compliance.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `platform` | string | ✅ | `facebook` or `google` |
| `ad_text` | string | ✅ | The ad caption or body text |
| `language` | string | ❌ | Language hint, e.g. `en` (default: `auto`) |
| `images` | file(s) | ❌ | One or more ad images (JPEG, PNG, GIF, WEBP · max 5 MB each) |

**Example response:**

```json
{
  "analysis_id": "e3b0c442-...",
  "platform": "facebook",
  "score": 72,
  "grade": "review",
  "result": {
    "summary": "The ad contains several claims that require substantiation...",
    "violations": [
      {
        "code": "UNSUBSTANTIATED_CLAIM",
        "severity": "high",
        "rationale": "'Guaranteed results' requires verifiable evidence.",
        "suggested_fix": "Replace with 'clinically tested' and link to a study."
      }
    ],
    "suggestions": [
      "Add a disclaimer for financial claims near the CTA."
    ]
  }
}
```

**Grade scale:**

| Grade | Score | Meaning |
|---|---|---|
| `pass` | ≥ 80 | Ad is compliant ✅ |
| `review` | 60 - 79 | Minor issues, review recommended ⚠️ |
| `fail` | < 60 | Significant violations found ❌ |

### `GET /health`

Returns `{ "status": "ok" }` - use for uptime monitoring.

### Interactive docs

While the server is running, visit **http://127.0.0.1:8000/docs** for the full Swagger UI.

---

## Features

- **Multi-image support** -> upload multiple ad creatives in one submission
- **Drag & drop** upload interface
- **Analysis history** -> past results saved to `localStorage` and viewable on the History page
- **Copy report** -> one-click copy of the full analysis to clipboard
- **Animated background** -> Vanta.NET interactive net visualization
- **Responsive design** -> works on desktop and mobile
- **Contact form** -> powered by EmailJS, no server required

---

## Deployment

To deploy the back-end, set the `ANTHROPIC_API_KEY` environment variable on your host and update `API_BASE` in `Website/JS scripts/index.js` to point to your deployed URL.

| Platform | Notes |
|---|---|
| **Railway** | Connect repo → set env var → deploy |
| **Render** | Build: `pip install -r requirements.txt` · Start: `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Fly.io** | `fly launch` -> `fly secrets set ANTHROPIC_API_KEY=...` |

The front-end is static HTML - deploy it on **GitHub Pages**, **Netlify**, or **Vercel** for free.

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com) |

---

## License

This project is open source and free to use. Built with curiosity by [LEooo42](https://github.com/LEooo42).
