"""
TrustCheck.AI - FastAPI Back-End
POST /v1/analyze  -> analyzes ad text + images against platform policies
GET  /v1/rate-status -> returns remaining requests for current IP
"""

from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import base64
import json
import logging
import re
import time
from collections import defaultdict
from typing import Optional

import anthropic
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("trustcheck")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="TrustCheck.AI",
    description="Ad compliance checker powered by Claude AI",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to your domain in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Anthropic client ──────────────────────────────────────────────────────────
api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise RuntimeError("ANTHROPIC_API_KEY is not set")

client = anthropic.Anthropic(api_key=api_key)

# ── Rate limiter (in-memory, per IP) ─────────────────────────────────────────
RATE_LIMIT      = int(os.getenv("RATE_LIMIT", "10"))        # max requests
RATE_WINDOW_SEC = int(os.getenv("RATE_WINDOW_SEC", "3600")) # per hour

# { ip: [(timestamp, ...), ...] }
_rate_store: dict[str, list[float]] = defaultdict(list)

def _get_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _rate_check(ip: str) -> tuple[bool, int, int]:
    """
    Returns (allowed, remaining, reset_in_seconds).
    Prunes stale timestamps and checks the window.
    """
    now = time.time()
    window_start = now - RATE_WINDOW_SEC
    timestamps = [t for t in _rate_store[ip] if t > window_start]
    _rate_store[ip] = timestamps

    used = len(timestamps)
    remaining = max(0, RATE_LIMIT - used)

    if used >= RATE_LIMIT:
        oldest = min(timestamps)
        reset_in = int(oldest + RATE_WINDOW_SEC - now) + 1
        return False, 0, reset_in

    _rate_store[ip].append(now)
    return True, remaining - 1, RATE_WINDOW_SEC

# ── Platform policies ─────────────────────────────────────────────────────────
PLATFORM_POLICIES: dict[str, str] = {
    "facebook": """
Facebook / Meta Advertising Policies (key rules):
- No misleading, false, or deceptive claims.
- No discrimination based on age, gender, race, religion, national origin, disability, or sexual orientation.
- No adult content, nudity, or sexually suggestive material.
- No promotion of tobacco, recreational drugs, or unapproved pharmaceuticals.
- No sensational or shocking imagery.
- No before/after images implying unrealistic results (especially in health/beauty).
- No use of Facebook branding without permission.
- Financial products must include relevant disclosures.
- Personal attributes (health, finances, relationships) must not be referenced negatively.
- Text must not cover more than 20% of ad image area.
""",
    "google": """
Google Ads Policies (key rules):
- No counterfeit goods, dangerous products, or dishonest practices.
- No enabling dishonest behavior (fake documents, hacking tools).
- No inappropriate content (hate speech, graphic violence, shocking content).
- Healthcare / medical ads must comply with local regulations and require certification.
- Financial services ads must disclose fees, risks, and license information.
- No ads that spoof or falsely represent brands.
- No misleading ad copy (exaggerated claims, hidden fees).
- Destination pages must match ad content (no bait-and-switch).
- No collection of user data without clear consent / privacy policy.
- Political ads require authorization and funding disclosure.
""",
    "tiktok": """
TikTok Advertising Policies (key rules):
- No misleading, false, or exaggerated claims about products or services.
- No content targeting minors or that could be seen by users under 18 in inappropriate ways.
- No promotion of tobacco, alcohol, gambling, or weapons.
- No adult content, nudity, or sexually suggestive material.
- No content promoting violence, hate speech, or discrimination.
- No healthcare or pharmaceutical ads without proper certification and regional compliance.
- Financial products must include risk warnings and regulatory disclosures.
- No ads using TikTok sounds, effects, or trends without proper licensing.
- Influencer / branded content must be clearly disclosed with #ad or #sponsored.
- No counterfeit goods or intellectual property violations.
- Weight loss and body image ads face strict restrictions — no before/after or idealized body imagery.
- Political advertising is heavily restricted and requires authorization.
""",
    "linkedin": """
LinkedIn Advertising Policies (key rules):
- No misleading, deceptive, or false claims about products, services, or professional credentials.
- No discrimination based on age, gender, race, religion, national origin, disability, or sexual orientation.
- No adult or sexually suggestive content — LinkedIn is a professional network.
- No promotion of tobacco, recreational drugs, or weapons.
- Financial services ads must include required disclosures and comply with local regulations.
- Job ads must not contain discriminatory language or requirements.
- No content that demeans or disrespects any professional group.
- Ads targeting by professional attributes (job title, company, skills) must be relevant to the audience.
- No collection of sensitive professional data without clear consent.
- Competitive advertising must be factual and not disparage competitors falsely.
- Sponsored content must be clearly labeled as advertising.
- No fake endorsements or fabricated testimonials from professionals.
""",
}

# ── Response schema ───────────────────────────────────────────────────────────
class Violation(BaseModel):
    code: str
    severity: str
    source: str = "text"   # "text" | "image" | "both"
    rationale: str
    suggested_fix: str

class AnalysisResult(BaseModel):
    summary: str
    violations: list[Violation]
    suggestions: list[str]
    text_suggestions: list[str] = []
    image_suggestions: list[str] = []

class AnalyzeResponse(BaseModel):
    analysis_id: str
    platform: str
    score: int
    grade: str
    result: AnalysisResult

class RateStatusResponse(BaseModel):
    limit: int
    remaining: int
    window_seconds: int

# ── Prompt builder ────────────────────────────────────────────────────────────
def build_prompt(platform: str, ad_text: str, language: str) -> str:
    policy = PLATFORM_POLICIES.get(platform, PLATFORM_POLICIES["google"])
    return f"""You are TrustCheck.AI, an expert advertising compliance auditor.

## Your Task
Analyze the provided ad content (text and/or images) for compliance with the platform's advertising policies.

## Platform: {platform.upper()}
## Detected / Requested Language: {language}

## Platform Policies
{policy}

## Ad Text Submitted
\"\"\"{ad_text}\"\"\"

## Instructions
1. Carefully review the ad text AND every image provided.
2. Identify ALL policy violations, even minor ones.
3. Assign a compliance score from 0 (completely non-compliant) to 100 (fully compliant).
4. Determine a grade: "pass" (score >= 80), "review" (60-79), or "fail" (< 60).
5. For each violation provide: code, severity (high/medium/low), rationale, and a concrete suggested_fix.
6. Add general improvement suggestions beyond the violations.

## Output Format
Respond ONLY with valid JSON — no extra text, no markdown fences.
{{
  "score": <integer 0-100>,
  "grade": "<pass|review|fail>",
  "summary": "<2-3 sentence overall assessment>",
  "violations": [
    {{
      "code": "<SHORT_SNAKE_CASE_CODE>",
      "severity": "<high|medium|low>",
      "source": "<text|image|both>",
      "rationale": "<why this is a violation>",
      "suggested_fix": "<concrete fix>"
    }}
  ],
  "suggestions": {{
    "text": ["<text improvement tip>"],
    "image": ["<image improvement tip>"]
  }}
}}

Important: Use "source": "text" for violations found only in the ad copy, "source": "image" for violations found only in the image(s), and "source": "both" when the violation spans both. If no images were provided, use "source": "text" for all violations and leave image suggestions empty."""

# ── Helpers ───────────────────────────────────────────────────────────────────
def encode_image(image_bytes: bytes, media_type: str) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
        },
    }

def parse_claude_json(raw: str) -> dict:
    cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        log.error("JSON parse error: %s\nRaw:\n%s", e, raw[:500])
        raise HTTPException(status_code=502, detail="AI returned malformed JSON.")

# ── Rate status endpoint ──────────────────────────────────────────────────────
@app.get("/v1/rate-status", response_model=RateStatusResponse)
async def rate_status(request: Request):
    ip = _get_ip(request)
    now = time.time()
    window_start = now - RATE_WINDOW_SEC
    timestamps = [t for t in _rate_store[ip] if t > window_start]
    used = len(timestamps)
    remaining = max(0, RATE_LIMIT - used)
    return RateStatusResponse(
        limit=RATE_LIMIT,
        remaining=remaining,
        window_seconds=RATE_WINDOW_SEC,
    )

# ── Main analyze endpoint ─────────────────────────────────────────────────────
@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    platform: str = Form(..., description="facebook | google | tiktok | linkedin"),
    ad_text: str = Form(..., description="The ad caption / body text"),
    language: str = Form("auto", description="Language hint, e.g. 'en', 'auto'"),
    images: list[UploadFile] = File(default=[]),
):
    # ── Rate limit check ──────────────────────────────────────────────────────
    ip = _get_ip(request)
    allowed, remaining, reset_in = _rate_check(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "Rate limit exceeded",
                "message": f"You have used all {RATE_LIMIT} analyses for this hour. Try again in {reset_in} seconds.",
                "remaining": 0,
                "reset_in_seconds": reset_in,
                "limit": RATE_LIMIT,
            }
        )

    # ── Validation ────────────────────────────────────────────────────────────
    platform = platform.lower().strip()
    if platform not in PLATFORM_POLICIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported platform '{platform}'. Supported: {list(PLATFORM_POLICIES)}",
        )

    if not ad_text.strip():
        raise HTTPException(status_code=400, detail="ad_text must not be empty.")

    if len(ad_text) > 2000:
        raise HTTPException(status_code=400, detail="ad_text exceeds 2000 character limit.")

    # ── Build message content ─────────────────────────────────────────────────
    content: list[dict] = []
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    MAX_IMAGE_BYTES = 5 * 1024 * 1024

    for upload in images:
        if upload.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image type '{upload.content_type}'. Use JPEG, PNG, GIF or WEBP.",
            )
        img_bytes = await upload.read()
        if len(img_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail=f"Image '{upload.filename}' exceeds 5 MB limit.")
        content.append(encode_image(img_bytes, upload.content_type))

    content.append({"type": "text", "text": build_prompt(platform, ad_text, language)})

    log.info("Analyzing ad | ip=%s | platform=%s | images=%d | text_len=%d | remaining=%d",
             ip, platform, len(images), len(ad_text), remaining)

    # ── Call Claude ───────────────────────────────────────────────────────────
    try:
        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1500,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIError as e:
        log.exception("Anthropic API error")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")

    raw_text = response.content[0].text
    data = parse_claude_json(raw_text)

    score = max(0, min(100, int(data.get("score", 50))))
    grade = data.get("grade", "review")
    if grade not in ("pass", "review", "fail"):
        grade = "pass" if score >= 80 else ("review" if score >= 60 else "fail")

    violations = [
        Violation(
            code=str(v.get("code", "UNKNOWN")),
            severity=str(v.get("severity", "medium")),
            source=str(v.get("source", "text")),
            rationale=str(v.get("rationale", "")),
            suggested_fix=str(v.get("suggested_fix", "")),
        )
        for v in data.get("violations", [])
    ]

    # Parse structured suggestions (new format) or fallback to flat list (old format)
    raw_suggestions = data.get("suggestions", [])
    if isinstance(raw_suggestions, dict):
        text_suggestions = [str(s) for s in raw_suggestions.get("text", [])]
        image_suggestions = [str(s) for s in raw_suggestions.get("image", [])]
        all_suggestions = text_suggestions + image_suggestions
    else:
        all_suggestions = [str(s) for s in raw_suggestions]
        text_suggestions = all_suggestions
        image_suggestions = []

    return AnalyzeResponse(
        analysis_id=str(uuid.uuid4()),
        platform=platform,
        score=score,
        grade=grade,
        result=AnalysisResult(
            summary=str(data.get("summary", "")),
            violations=violations,
            suggestions=all_suggestions,
            text_suggestions=text_suggestions,
            image_suggestions=image_suggestions,
        ),
    )

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "TrustCheck.AI", "platforms": list(PLATFORM_POLICIES)}
