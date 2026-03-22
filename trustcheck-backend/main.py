"""
TrustCheck.AI - FastAPI Back-End v2
POST /auth/register      -> create account
POST /auth/login         -> returns JWT token
GET  /auth/me            -> get current user
GET  /v1/history         -> analysis history (auth required)
DELETE /v1/history/{id}  -> delete one entry
DELETE /v1/history       -> clear all history
POST /v1/analyze         -> analyze ad (saves to DB if logged in)
GET  /v1/rate-status     -> remaining requests for this IP
"""

from dotenv import load_dotenv
load_dotenv()

import os, uuid, base64, json, logging, re, time, sqlite3
import hashlib, hmac, secrets
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

import anthropic, httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("trustcheck")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="TrustCheck.AI", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Anthropic ─────────────────────────────────────────────────────────────────
api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise RuntimeError("ANTHROPIC_API_KEY is not set")
claude = anthropic.Anthropic(api_key=api_key)

# ── Token (HMAC-SHA256, no PyJWT needed) ──────────────────────────────────────
TOKEN_SECRET = os.getenv("TOKEN_SECRET", secrets.token_hex(32))
TOKEN_TTL    = int(os.getenv("TOKEN_TTL_HOURS", "168")) * 3600  # 7 days default

def make_token(user_id: str) -> str:
    payload = json.dumps({"uid": user_id, "exp": int(time.time()) + TOKEN_TTL})
    p64 = base64.urlsafe_b64encode(payload.encode()).decode()
    sig = hmac.new(TOKEN_SECRET.encode(), p64.encode(), hashlib.sha256).hexdigest()
    return f"{p64}.{sig}"

def verify_token(token: str) -> Optional[str]:
    try:
        p64, sig = token.rsplit(".", 1)
        expected = hmac.new(TOKEN_SECRET.encode(), p64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(base64.urlsafe_b64decode(p64).decode())
        return payload["uid"] if payload["exp"] >= time.time() else None
    except Exception:
        return None

# ── Password hashing (PBKDF2, stdlib only) ───────────────────────────────────
def hash_password(pw: str) -> str:
    salt = secrets.token_hex(16)
    dk   = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260_000)
    return f"{salt}:{dk.hex()}"

def check_password(pw: str, stored: str) -> bool:
    try:
        salt, dk_hex = stored.split(":", 1)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 260_000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False

# ── SQLite ────────────────────────────────────────────────────────────────────
DB_PATH = os.getenv("DB_PATH", "trustcheck.db")

def init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.executescript("""
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS users (
                id            TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analyses (
                id                TEXT PRIMARY KEY,
                user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                platform          TEXT NOT NULL,
                ad_text           TEXT NOT NULL,
                score             INTEGER NOT NULL,
                grade             TEXT NOT NULL,
                verdict           TEXT NOT NULL,
                summary           TEXT,
                text_violations   TEXT,
                image_violations  TEXT,
                text_suggestions  TEXT,
                image_suggestions TEXT,
                created_at        TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_analyses_user
                ON analyses(user_id, created_at DESC);
        """)
    log.info("DB ready: %s", DB_PATH)

init_db()

@contextmanager
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

# ── Auth dependency ───────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)

def get_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> Optional[dict]:
    if not creds:
        return None
    uid = verify_token(creds.credentials)
    if not uid:
        return None
    with db() as con:
        row = con.execute("SELECT id, name, email FROM users WHERE id=?", (uid,)).fetchone()
    return dict(row) if row else None

def require_auth(user=Depends(get_user)) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user

# ── Rate limiter ──────────────────────────────────────────────────────────────
RATE_LIMIT      = int(os.getenv("RATE_LIMIT", "10"))
RATE_WINDOW_SEC = int(os.getenv("RATE_WINDOW_SEC", "3600"))
_rate: dict[str, list[float]] = defaultdict(list)

def get_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host or "unknown")

def rate_check(ip: str) -> tuple[bool, int, int]:
    now  = time.time()
    wstart = now - RATE_WINDOW_SEC
    ts   = [t for t in _rate[ip] if t > wstart]
    _rate[ip] = ts
    if len(ts) >= RATE_LIMIT:
        reset = int(min(ts) + RATE_WINDOW_SEC - now) + 1
        return False, 0, reset
    _rate[ip].append(now)
    return True, RATE_LIMIT - len(ts) - 1, RATE_WINDOW_SEC

# ── Platform policies ─────────────────────────────────────────────────────────
POLICIES = {
    "facebook": """
Facebook / Meta Advertising Policies (key rules):
- No misleading, false, or deceptive claims.
- No discrimination based on age, gender, race, religion, national origin, disability, or sexual orientation.
- No adult content, nudity, or sexually suggestive material.
- No promotion of tobacco, recreational drugs, or unapproved pharmaceuticals.
- No sensational or shocking imagery.
- No before/after images implying unrealistic results.
- No use of Facebook branding without permission.
- Financial products must include relevant disclosures.
- Personal attributes must not be referenced negatively.
- Text must not cover more than 20% of ad image area.
""",
    "google": """
Google Ads Policies (key rules):
- No counterfeit goods, dangerous products, or dishonest practices.
- No inappropriate content (hate speech, graphic violence).
- Healthcare / medical ads require certification and regional compliance.
- Financial services ads must disclose fees, risks, and license information.
- No misleading ad copy (exaggerated claims, hidden fees).
- Destination pages must match ad content.
- No collection of user data without clear consent.
- Political ads require authorization and funding disclosure.
""",
    "tiktok": """
TikTok Advertising Policies (key rules):
- No misleading or exaggerated claims.
- No content targeting or harmful to minors.
- No tobacco, alcohol, gambling, or weapons promotion.
- No adult or sexually suggestive content.
- No hate speech or discrimination.
- Financial products must include risk warnings.
- Influencer content must be disclosed with #ad or #sponsored.
- No before/after body imagery or idealized body content.
- Political advertising is heavily restricted.
""",
    "linkedin": """
LinkedIn Advertising Policies (key rules):
- No misleading or false professional claims.
- No discrimination of any kind.
- No adult content — LinkedIn is a professional network.
- Financial services must include required disclosures.
- Job ads must not contain discriminatory language.
- Competitive ads must be factual.
- Sponsored content must be clearly labeled.
- No fake endorsements or fabricated testimonials.
""",
}

# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    name: str
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str

class Violation(BaseModel):
    code: str
    severity: str
    source: str = "text"
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

class HistoryEntry(BaseModel):
    id: str
    platform: str
    ad_text: str
    score: int
    grade: str
    verdict: str
    summary: str
    text_violations: list[str]
    image_violations: list[str]
    text_suggestions: list[str]
    image_suggestions: list[str]
    created_at: str

class RateStatus(BaseModel):
    limit: int
    remaining: int
    window_seconds: int

# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/auth/register")
async def register(body: RegisterIn):
    name  = body.name.strip()
    email = body.email.strip().lower()
    pw    = body.password

    if not name:
        raise HTTPException(400, "Name is required.")
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        raise HTTPException(400, "Invalid email address.")
    if len(pw) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    try:
        with db() as con:
            con.execute(
                "INSERT INTO users (id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)",
                (uid, name, email, hash_password(pw), now),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists.")

    log.info("Registered: %s", email)
    return {"token": make_token(uid), "user": {"id": uid, "name": name, "email": email}}


@app.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    pw    = body.password
    if not email or not pw:
        raise HTTPException(400, "Email and password are required.")
    with db() as con:
        row = con.execute(
            "SELECT id,name,email,password_hash FROM users WHERE email=?", (email,)
        ).fetchone()
    if not row or not check_password(pw, row["password_hash"]):
        raise HTTPException(401, "Incorrect email or password.")
    log.info("Login: %s", email)
    return {"token": make_token(row["id"]),
            "user": {"id": row["id"], "name": row["name"], "email": row["email"]}}


@app.get("/auth/me")
async def me(user=Depends(require_auth)):
    return user


# ── History endpoints ─────────────────────────────────────────────────────────

@app.get("/v1/history", response_model=list[HistoryEntry])
async def get_history(user=Depends(require_auth)):
    with db() as con:
        rows = con.execute(
            """SELECT id,platform,ad_text,score,grade,verdict,summary,
                      text_violations,image_violations,
                      text_suggestions,image_suggestions,created_at
               FROM analyses WHERE user_id=?
               ORDER BY created_at DESC LIMIT 100""",
            (user["id"],),
        ).fetchall()

    def parse(v):
        if not v: return []
        try: return json.loads(v)
        except: return []

    return [HistoryEntry(
        id=r["id"], platform=r["platform"], ad_text=r["ad_text"],
        score=r["score"], grade=r["grade"], verdict=r["verdict"],
        summary=r["summary"] or "",
        text_violations=parse(r["text_violations"]),
        image_violations=parse(r["image_violations"]),
        text_suggestions=parse(r["text_suggestions"]),
        image_suggestions=parse(r["image_suggestions"]),
        created_at=r["created_at"],
    ) for r in rows]


@app.delete("/v1/history/{entry_id}")
async def delete_entry(entry_id: str, user=Depends(require_auth)):
    with db() as con:
        r = con.execute(
            "DELETE FROM analyses WHERE id=? AND user_id=?", (entry_id, user["id"])
        )
    if r.rowcount == 0:
        raise HTTPException(404, "Entry not found.")
    return {"deleted": entry_id}


@app.delete("/v1/history")
async def clear_history(user=Depends(require_auth)):
    with db() as con:
        con.execute("DELETE FROM analyses WHERE user_id=?", (user["id"],))
    return {"cleared": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_prompt(platform: str, ad_text: str, language: str) -> str:
    policy = POLICIES.get(platform, POLICIES["google"])
    return f"""You are TrustCheck.AI, an expert advertising compliance auditor.

## Platform: {platform.upper()}
## Language: {language}

## Policies
{policy}

## Ad Text
\"\"\"{ad_text}\"\"\"

## Instructions
Analyze the ad text and any images for policy compliance.
Assign a score 0-100, a grade (pass>=80, review 60-79, fail<60).
Tag each violation with source: text | image | both.

## Output — valid JSON only, no fences
{{
  "score": <int>,
  "grade": "<pass|review|fail>",
  "summary": "<2-3 sentences>",
  "violations": [{{"code":"...","severity":"<high|medium|low>","source":"<text|image|both>","rationale":"...","suggested_fix":"..."}}],
  "suggestions": {{"text": ["..."], "image": ["..."]}}
}}"""


def encode_image(data: bytes, mt: str) -> dict:
    return {"type": "image", "source": {
        "type": "base64", "media_type": mt,
        "data": base64.standard_b64encode(data).decode()
    }}


def parse_json(raw: str) -> dict:
    cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        log.error("JSON parse error: %s | raw: %s", e, raw[:400])
        raise HTTPException(502, "AI returned malformed JSON.")


async def fetch_url(url: str) -> tuple[str, Optional[bytes], Optional[str]]:
    H = {"User-Agent": "Mozilla/5.0 (compatible; TrustCheckBot/1.0)"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as c:
        try:
            r = await c.get(url, headers=H)
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(400, f"URL returned HTTP {e.response.status_code}")
        except httpx.RequestError:
            raise HTTPException(400, "Could not reach the URL.")
        if "html" not in r.headers.get("content-type", ""):
            raise HTTPException(400, "URL does not point to an HTML page.")
        html = r.content

    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script","style","noscript","nav","footer","header","aside"]):
        t.decompose()
    text = " ".join(soup.get_text(" ", strip=True).split())[:2000]

    img_url = None
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        img_url = og["content"]
    else:
        tag = soup.find("img", src=True)
        if tag:
            src = tag["src"]
            img_url = src if src.startswith("http") else ("https:" + src if src.startswith("//") else None)

    img_bytes = img_mt = None
    if img_url:
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10) as ic:
                ir = await ic.get(img_url, headers=H)
                ir.raise_for_status()
                mt = ir.headers.get("content-type","").split(";")[0].strip()
                if mt in {"image/jpeg","image/png","image/webp","image/gif"}:
                    img_bytes, img_mt = ir.content, mt
        except Exception:
            pass

    return text, img_bytes, img_mt


# ── Rate status ───────────────────────────────────────────────────────────────

@app.get("/v1/rate-status", response_model=RateStatus)
async def rate_status(request: Request):
    ip = get_ip(request)
    now, ws = time.time(), RATE_WINDOW_SEC
    ts = [t for t in _rate[ip] if t > now - ws]
    remaining = max(0, RATE_LIMIT - len(ts))
    return RateStatus(limit=RATE_LIMIT, remaining=remaining, window_seconds=ws)


# ── Analyze ───────────────────────────────────────────────────────────────────

@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    platform: str = Form(...),
    ad_text:  str = Form(...),
    language: str = Form("auto"),
    images:   list[UploadFile] = File(default=[]),
    ad_url:   str = Form(default=""),
    user: Optional[dict] = Depends(get_user),
):
    # Rate limit
    ip = get_ip(request)
    ok, remaining, reset = rate_check(ip)
    if not ok:
        raise HTTPException(429, detail={
            "error": "Rate limit exceeded",
            "message": f"You have used all {RATE_LIMIT} analyses for this hour. Try again in {reset} seconds.",
            "remaining": 0, "reset_in_seconds": reset, "limit": RATE_LIMIT,
        })

    # Validate
    platform = platform.lower().strip()
    if platform not in POLICIES:
        raise HTTPException(400, f"Unsupported platform '{platform}'.")
    if not ad_text.strip():
        raise HTTPException(400, "ad_text must not be empty.")
    if len(ad_text) > 2000:
        raise HTTPException(400, "ad_text exceeds 2000 characters.")

    original_text = ad_text.strip()
    content: list[dict] = []
    ALLOWED = {"image/jpeg","image/png","image/gif","image/webp"}
    MAX_IMG  = 5 * 1024 * 1024

    if ad_url and ad_url.strip():
        u = ad_url.strip()
        if not u.startswith(("http://","https://")):
            raise HTTPException(400, "ad_url must start with http:// or https://")
        pg_text, img_bytes, img_mt = await fetch_url(u)
        merged = original_text
        if pg_text:
            merged = (merged + "\n\n[Page content]:\n" + pg_text).strip()
        ad_text = merged[:3000]
        if img_bytes and img_mt:
            content.append(encode_image(img_bytes, img_mt))
    else:
        for up in images:
            if up.content_type not in ALLOWED:
                raise HTTPException(400, f"Unsupported image type '{up.content_type}'.")
            b = await up.read()
            if len(b) > MAX_IMG:
                raise HTTPException(400, f"Image '{up.filename}' exceeds 5 MB.")
            content.append(encode_image(b, up.content_type))

    content.append({"type": "text", "text": build_prompt(platform, ad_text, language)})
    log.info("Analyze | ip=%s platform=%s user=%s", ip, platform,
             user["email"] if user else "guest")

    # Claude
    try:
        resp = claude.messages.create(
            model="claude-opus-4-5",
            max_tokens=1500,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e}")

    data    = parse_json(resp.content[0].text)
    score   = max(0, min(100, int(data.get("score", 50))))
    grade   = data.get("grade", "review")
    if grade not in ("pass","review","fail"):
        grade = "pass" if score >= 80 else ("review" if score >= 60 else "fail")
    verdict = "Safe" if grade == "pass" else ("Borderline" if grade == "review" else "Risky")

    violations = [Violation(
        code=str(v.get("code","UNKNOWN")),
        severity=str(v.get("severity","medium")),
        source=str(v.get("source","text")),
        rationale=str(v.get("rationale","")),
        suggested_fix=str(v.get("suggested_fix","")),
    ) for v in data.get("violations",[])]

    raw_s = data.get("suggestions", [])
    if isinstance(raw_s, dict):
        text_s  = [str(s) for s in raw_s.get("text", [])]
        image_s = [str(s) for s in raw_s.get("image", [])]
        all_s   = text_s + image_s
    else:
        all_s  = [str(s) for s in raw_s]
        text_s = all_s; image_s = []

    def fmt(v): return f"[{v.severity.upper()}] {v.code}: {v.rationale}"
    tv = [fmt(v) for v in violations if v.source in ("text","both")]
    iv = [fmt(v) for v in violations if v.source in ("image","both")]

    analysis_id = str(uuid.uuid4())

    if user:
        with db() as con:
            con.execute(
                """INSERT INTO analyses
                   (id,user_id,platform,ad_text,score,grade,verdict,
                    summary,text_violations,image_violations,
                    text_suggestions,image_suggestions,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (analysis_id, user["id"], platform, original_text[:500],
                 score, grade, verdict, str(data.get("summary","")),
                 json.dumps(tv), json.dumps(iv),
                 json.dumps(text_s), json.dumps(image_s),
                 datetime.now(timezone.utc).isoformat()),
            )
        log.info("Saved analysis %s for %s score=%d", analysis_id, user["email"], score)

    return AnalyzeResponse(
        analysis_id=analysis_id, platform=platform,
        score=score, grade=grade,
        result=AnalysisResult(
            summary=str(data.get("summary","")),
            violations=violations,
            suggestions=all_s,
            text_suggestions=text_s,
            image_suggestions=image_s,
        ),
    )


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0", "platforms": list(POLICIES)}
