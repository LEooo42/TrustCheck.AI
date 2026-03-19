"""
TrustCheck.AI — FastAPI Back-End
POST /v1/analyze  →  analyzes ad text + images against platform policies
"""

from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import base64
import json
import logging
import re
from typing import Optional

import anthropic
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
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

# ── Platform policy summaries ─────────────────────────────────────────────────
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
- Text must not cover more than 20 % of ad image area.
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
}

# ── Response schema ───────────────────────────────────────────────────────────
class Violation(BaseModel):
    code: str
    severity: str          # "high" | "medium" | "low"
    rationale: str
    suggested_fix: str

class AnalysisResult(BaseModel):
    summary: str
    violations: list[Violation]
    suggestions: list[str]

class AnalyzeResponse(BaseModel):
    analysis_id: str
    platform: str
    score: int             # 0-100, higher = more compliant
    grade: str             # "pass" | "review" | "fail"
    result: AnalysisResult

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
4. Determine a grade: "pass" (score ≥ 80), "review" (60–79), or "fail" (< 60).
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
      "rationale": "<why this is a violation>",
      "suggested_fix": "<concrete fix>"
    }}
  ],
  "suggestions": ["<general tip 1>", "<general tip 2>"]
}}"""

# ── Helper: encode images for Claude ─────────────────────────────────────────
def encode_image(image_bytes: bytes, media_type: str) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
        },
    }

# ── Helper: parse Claude JSON safely ─────────────────────────────────────────
def parse_claude_json(raw: str) -> dict:
    # Strip accidental markdown fences
    cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        log.error("JSON parse error: %s\nRaw:\n%s", e, raw[:500])
        raise HTTPException(status_code=502, detail="AI returned malformed JSON.")

# ── Main endpoint ─────────────────────────────────────────────────────────────
@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    platform: str = Form(..., description="facebook | google"),
    ad_text: str = Form(..., description="The ad caption / body text"),
    language: str = Form("auto", description="Language hint, e.g. 'en', 'auto'"),
    images: list[UploadFile] = File(default=[]),
):
    platform = platform.lower().strip()
    if platform not in PLATFORM_POLICIES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported platform '{platform}'. Supported: {list(PLATFORM_POLICIES)}",
        )

    if not ad_text.strip():
        raise HTTPException(status_code=400, detail="ad_text must not be empty.")

    # Build message content list
    content: list[dict] = []

    # Attach images
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB per image

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

    # Add the text prompt last
    content.append({"type": "text", "text": build_prompt(platform, ad_text, language)})

    log.info("Analyzing ad | platform=%s | images=%d | text_len=%d", platform, len(images), len(ad_text))

    # Call Claude
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

    # Validate & coerce
    score = max(0, min(100, int(data.get("score", 50))))
    grade = data.get("grade", "review")
    if grade not in ("pass", "review", "fail"):
        grade = "pass" if score >= 80 else ("review" if score >= 60 else "fail")

    violations = [
        Violation(
            code=str(v.get("code", "UNKNOWN")),
            severity=str(v.get("severity", "medium")),
            rationale=str(v.get("rationale", "")),
            suggested_fix=str(v.get("suggested_fix", "")),
        )
        for v in data.get("violations", [])
    ]

    return AnalyzeResponse(
        analysis_id=str(uuid.uuid4()),
        platform=platform,
        score=score,
        grade=grade,
        result=AnalysisResult(
            summary=str(data.get("summary", "")),
            violations=violations,
            suggestions=[str(s) for s in data.get("suggestions", [])],
        ),
    )

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "TrustCheck.AI"}
