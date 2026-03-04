from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from openai import OpenAI
import os
from dotenv import load_dotenv
import json
import requests

from database import get_db, Base, engine
from sqlalchemy.ext.asyncio import AsyncSession
import schemas, crud

from schemas import RejectedAdCreate

from typing import List

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.post("/ads", response_model=schemas.RejectedAdOut)
async def create_ad(ad: schemas.RejectedAdCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create_rejected_ad(db, ad)

@app.get("/ads", response_model=List[schemas.RejectedAdOut])
async def get_ads(db: AsyncSession = Depends(get_db)):
    return await crud.get_all_rejected_ads(db)

# ================== AI ANALYSIS ===================

with open("violation_matrix.json", "r") as f:
    VIOLATION_MATRIX = json.load(f)

class AnalyzeRequest(BaseModel):
    image_base64: Optional[str] = None
    headline: str
    description: str
    platform: str

class AnalyzeResponse(BaseModel):
    score: int
    verdict: str
    text_violations: List[str]
    image_violations: List[str]
    text_suggestions: List[str]
    image_suggestions: List[str]

def build_prompt(data: AnalyzeRequest) -> str:
    return f"""
You are reviewing this ad as a policy moderator at {data.platform.capitalize()}, trained on real-world ad rejection cases. Be strict, detailed, and conservative.

This ad consists of:
- Text: a headline and description
- An image (provided separately below)

Your job is to evaluate both the text and the image independently.

---

### 1. TEXT Content

Headline: {data.headline}  
Description: {data.description}

Check for:
- Unverifiable or exaggerated claims
- Manipulative urgency
- Emotional triggers (fear/shame)
- Prohibited CTA

---

### 2. IMAGE Content

You'll see an image. Check for:
- Misleading visuals (charts, before/after)
- Emotionally triggering design
- Fake UI elements
- Wealth/luxury implications

---

### 3. RESPONSE FORMAT

Score: <Leave Blank> (0 = very risky / many violations, 100 = perfectly safe / compliant)
Verdict: <Safe / Borderline / Risky>

Text Violations:
- <list text violations>

Image Violations:
- <list image violations>

Text Suggestions:
* <text suggestion 1>
* <text suggestion 2>

Image Suggestions:
* <image suggestion 1>
* <image suggestion 2>
"""

def calculate_score_from_violations(violations: List[str]) -> int:
    total = 0
    for v in violations:
        for keyword, weight in VIOLATION_MATRIX.items():
            if keyword in v.lower():
                total += weight
                break
    return max(0, 100 - total)

def parse_gpt_output(raw_text: str) -> AnalyzeResponse:
    lines = raw_text.splitlines()
    verdict = ""
    text_violations, image_violations = [], []
    text_suggestions, image_suggestions = [], []
    in_text_violations = in_image_violations = False
    in_text_suggestions = in_image_suggestions = False

    for line in lines:
        line = line.strip()
        if line.lower().startswith("verdict:"):
            verdict = line.split(":", 1)[1].strip()
        elif line.lower().startswith("text violations"):
            in_text_violations = True
            in_image_violations = in_text_suggestions = in_image_suggestions = False
        elif line.lower().startswith("image violations"):
            in_image_violations = True
            in_text_violations = in_text_suggestions = in_image_suggestions = False
        elif line.lower().startswith("text suggestions"):
            in_text_suggestions = True
            in_text_violations = in_image_violations = in_image_suggestions = False
        elif line.lower().startswith("image suggestions"):
            in_image_suggestions = True
            in_text_violations = in_image_violations = in_text_suggestions = False
        elif line.startswith("-"):
            item = line.lstrip("- ").strip()
            if in_text_violations:
                text_violations.append(item)
            elif in_image_violations:
                image_violations.append(item)
        elif line.startswith("*"):
            item = line.lstrip("* ").strip()
            if in_text_suggestions:
                text_suggestions.append(item)
            elif in_image_suggestions:
                image_suggestions.append(item)

    score = calculate_score_from_violations(text_violations + image_violations)

    return AnalyzeResponse(
        score=score,
        verdict=verdict,
        text_violations=text_violations,
        image_violations=image_violations,
        text_suggestions=text_suggestions,
        image_suggestions=image_suggestions,
    )

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_ad(data: AnalyzeRequest):
    prompt = build_prompt(data)

    messages = [
        {"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data.image_base64}"}}
        ]} if data.image_base64 else
        {"role": "user", "content": prompt}
    ]

    response = client.chat.completions.create(
        model="gpt-4o" if data.image_base64 else "gpt-4",
        messages=messages,
        temperature=0.1
    )

    return parse_gpt_output(response.choices[0].message.content)

# ================== CONTACT FORM ===================

class EmailData(BaseModel):
    name: str
    email: str
    message: str

@app.post("/send")
async def send_email(data: EmailData):
    service_id = os.getenv("EMAILJS_SERVICE_ID")
    template_id = os.getenv("EMAILJS_TEMPLATE_ID")
    public_key = os.getenv("EMAILJS_PUBLIC_KEY")
    private_key = os.getenv("EMAILJS_PRIVATE_KEY")

    if not all([service_id, template_id, public_key, private_key]):
        return JSONResponse(status_code=500, content={"success": False, "error": "Missing EmailJS config"})

    payload = {
        "service_id": service_id,
        "template_id": template_id,
        "user_id": public_key,
        "template_params": {
            "name": data.name,
            "email": data.email,
            "message": data.message
        }
    }

    headers = {"Content-Type": "application/json"}
    response = requests.post("https://api.emailjs.com/api/v1.0/email/send", json=payload, headers=headers)

    if response.status_code == 200:
        return {"success": True}
    else:
        return JSONResponse(status_code=500, content={"success": False, "error": response.text})