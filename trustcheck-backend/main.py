"""
TrustCheck.AI - FastAPI Back-End v3
Auth: register (with email verification), login, me, settings
History: get, delete one, clear all, stats
Bookmarks: add, list, remove
Analyze: saves to DB if logged in
"""

from dotenv import load_dotenv
load_dotenv()

import os, uuid, base64, json, logging, re, time, sqlite3
from pathlib import Path
import hashlib, hmac, secrets, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional, List, Any


import anthropic, httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import HTMLResponse
from pydantic import BaseModel


# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("trustcheck")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="TrustCheck.AI", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Anthropic ─────────────────────────────────────────────────────────────────
api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise RuntimeError("ANTHROPIC_API_KEY is not set")
claude = anthropic.Anthropic(api_key=api_key)

# ── Token helpers ─────────────────────────────────────────────────────────────
TOKEN_SECRET = os.getenv("TOKEN_SECRET", secrets.token_hex(32))
TOKEN_TTL    = int(os.getenv("TOKEN_TTL_HOURS", "168")) * 3600

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

# ── Password hashing ──────────────────────────────────────────────────────────
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

# ── Database ──────────────────────────────────────────────────────────────────

def resolve_db_path() -> str:
    """Return an absolute DB path outside the frontend workspace by default.

    Why: when the app is served with a live-reload dev server, writing to a SQLite
    file inside the project folder can trigger a browser refresh. That only happens
    for logged-in users because only their analyses are persisted. The popup then
    appears to close "by itself" even though the page actually reloaded.
    """
    raw = os.getenv("DB_PATH")
    if raw:
        return str(Path(raw).expanduser().resolve())

    data_dir = Path.home() / ".trustcheckai"
    data_dir.mkdir(parents=True, exist_ok=True)
    return str((data_dir / "trustcheck.db").resolve())

DB_PATH = resolve_db_path()

def init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.executescript("""
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                email           TEXT NOT NULL UNIQUE,
                password_hash   TEXT NOT NULL,
                verified        INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS email_verifications (
                token       TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at  TEXT NOT NULL
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

            CREATE TABLE IF NOT EXISTS bookmarks (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                analysis_id TEXT NOT NULL,
                platform    TEXT NOT NULL,
                score       INTEGER NOT NULL,
                verdict     TEXT NOT NULL,
                summary     TEXT,
                ad_text     TEXT,
                created_at  TEXT NOT NULL,
                UNIQUE(user_id, analysis_id)
            );

            CREATE INDEX IF NOT EXISTS idx_analyses_user
                ON analyses(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_bookmarks_user
                ON bookmarks(user_id, created_at DESC);
        """)

        # ── Migrations: safely add columns/tables to existing DBs ──
        existing_cols = {
            row[1]
            for row in con.execute("PRAGMA table_info(users)").fetchall()
        }
        if "verified" not in existing_cols:
            con.execute("ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0")
            log.info("Migration: added users.verified column")

        existing_tables = {
            row[0]
            for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        if "email_verifications" not in existing_tables:
            con.execute("""
                CREATE TABLE email_verifications (
                    token       TEXT PRIMARY KEY,
                    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at  TEXT NOT NULL
                )
            """)
            log.info("Migration: created email_verifications table")

        if "bookmarks" not in existing_tables:
            con.execute("""
                CREATE TABLE bookmarks (
                    id          TEXT PRIMARY KEY,
                    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    analysis_id TEXT NOT NULL,
                    platform    TEXT NOT NULL,
                    score       INTEGER NOT NULL,
                    verdict     TEXT NOT NULL,
                    summary     TEXT,
                    ad_text     TEXT,
                    created_at  TEXT NOT NULL,
                    UNIQUE(user_id, analysis_id)
                )
            """)
            con.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id, created_at DESC)")
            log.info("Migration: created bookmarks table")

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

# ── Email ─────────────────────────────────────────────────────────────────────
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")          # e.g. trustcheckai@gmail.com
SMTP_PASS     = os.getenv("SMTP_PASS", "")          # Gmail app password
FRONTEND_URL  = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

def send_verification_email(to_email: str, name: str, token: str):
    """Send email verification link. Silently skips if SMTP not configured."""
    if not SMTP_USER or not SMTP_PASS:
        log.warning("SMTP not configured — skipping verification email for %s. Token: %s", to_email, token)
        return

    verify_url = f"{FRONTEND_URL}/HTML pages/verify.html?token={token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Verify your TrustCheck.AI account"
    msg["From"]    = f"TrustCheck.AI <{SMTP_USER}>"
    msg["To"]      = to_email

    text = f"""Hi {name},

Welcome to TrustCheck.AI! Please verify your email address by clicking the link below:

{verify_url}

This link expires in 24 hours.

If you didn't create this account, you can safely ignore this email.

— The TrustCheck.AI team
"""
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0a0f1e;color:#c8d0e8;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#13141a;border-radius:16px;padding:36px;border:1px solid rgba(56,133,241,0.2)">
    <h1 style="margin:0 0 6px;font-size:22px;color:#fff">TrustCheck<span style="color:#3885f1">.AI</span></h1>
    <p style="margin:0 0 28px;color:#667;font-size:13px">Ad Compliance Checker</p>
    <p style="font-size:15px;margin:0 0 10px">Hi <strong style="color:#fff">{name}</strong>,</p>
    <p style="font-size:14px;color:#889;margin:0 0 28px;line-height:1.6">
      Welcome! Please verify your email address to activate your account.
    </p>
    <a href="{verify_url}"
       style="display:inline-block;background:#3885f1;color:#fff;text-decoration:none;
              padding:13px 28px;border-radius:10px;font-weight:600;font-size:14px">
      Verify Email Address
    </a>
    <p style="font-size:12px;color:#445;margin:28px 0 0">
      Link expires in 24 hours. If you didn't sign up, ignore this email.
    </p>
  </div>
</body>
</html>
"""
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        log.info("Verification email sent to %s", to_email)
    except Exception as e:
        log.error("Failed to send verification email to %s: %s", to_email, e)

# ── Auth dependency ───────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)

def get_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> Optional[dict]:
    if not creds:
        return None
    uid = verify_token(creds.credentials)
    if not uid:
        return None
    with db() as con:
        row = con.execute(
            "SELECT id, name, email, verified FROM users WHERE id=?", (uid,)
        ).fetchone()
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
    now, ws = time.time(), RATE_WINDOW_SEC
    ts = [t for t in _rate[ip] if t > now - ws]
    _rate[ip] = ts
    if len(ts) >= RATE_LIMIT:
        reset = int(min(ts) + ws - now) + 1
        return False, 0, reset
    _rate[ip].append(now)
    return True, RATE_LIMIT - len(ts) - 1, ws

# ── Platform policies ─────────────────────────────────────────────────────────
POLICIES = {
    "facebook": """
Facebook / Meta Advertising Policies (key rules):
- No misleading, false, or deceptive claims.
- No discrimination based on protected characteristics.
- No adult content, nudity, or sexually suggestive material.
- No promotion of tobacco, recreational drugs, or unapproved pharmaceuticals.
- No sensational or shocking imagery.
- No before/after images implying unrealistic results.
- Financial products must include relevant disclosures.
- Text must not cover more than 20% of ad image area.
""",
    "google": """
Google Ads Policies (key rules):
- No counterfeit goods, dangerous products, or dishonest practices.
- No inappropriate content (hate speech, graphic violence).
- Healthcare/medical ads require certification and regional compliance.
- Financial services ads must disclose fees, risks, and license information.
- No misleading ad copy (exaggerated claims, hidden fees).
- Destination pages must match ad content.
- Political ads require authorization and funding disclosure.
""",
    "tiktok": """
TikTok Advertising Policies (key rules):
- No misleading or exaggerated claims.
- No content harmful to minors.
- No tobacco, alcohol, gambling, or weapons promotion.
- No adult or sexually suggestive content.
- Financial products must include risk warnings.
- Influencer content must be disclosed with #ad or #sponsored.
- No before/after body imagery or idealized body content.
""",
    "linkedin": """
LinkedIn Advertising Policies (key rules):
- No misleading or false professional claims.
- No discrimination of any kind.
- No adult content.
- Financial services must include required disclosures.
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

class SettingsIn(BaseModel):
    name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class BookmarkIn(BaseModel):
    analysis_id: str
    platform: str
    score: int
    verdict: str
    summary: Optional[str] = ""
    ad_text: Optional[str] = ""

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

class StatsResponse(BaseModel):
    total: int
    avg_score: float
    pass_count: int
    review_count: int
    fail_count: int
    top_platform: str

class BookmarkEntry(BaseModel):
    id: str
    analysis_id: str
    platform: str
    score: int
    verdict: str
    summary: str
    ad_text: str
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

    uid  = str(uuid.uuid4())
    now  = datetime.now(timezone.utc).isoformat()
    try:
        with db() as con:
            con.execute(
                "INSERT INTO users (id,name,email,password_hash,verified,created_at) VALUES (?,?,?,?,0,?)",
                (uid, name, email, hash_password(pw), now),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists.")

    # Generate verification token (24 hour expiry)
    v_token  = secrets.token_urlsafe(32)
    v_expiry = datetime.fromtimestamp(time.time() + 86400, tz=timezone.utc).isoformat()
    with db() as con:
        con.execute(
            "INSERT INTO email_verifications (token,user_id,expires_at) VALUES (?,?,?)",
            (v_token, uid, v_expiry),
        )

    send_verification_email(email, name, v_token)
    log.info("Registered: %s (verified=False)", email)

    return {
        "token": make_token(uid),
        "user": {"id": uid, "name": name, "email": email, "verified": False},
        "message": "Account created. Please check your email to verify your address."
    }


@app.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    pw    = body.password
    if not email or not pw:
        raise HTTPException(400, "Email and password are required.")
    with db() as con:
        row = con.execute(
            "SELECT id,name,email,password_hash,verified FROM users WHERE email=?", (email,)
        ).fetchone()
    if not row or not check_password(pw, row["password_hash"]):
        raise HTTPException(401, "Incorrect email or password.")
    log.info("Login: %s", email)
    return {
        "token": make_token(row["id"]),
        "user": {"id": row["id"], "name": row["name"], "email": row["email"], "verified": bool(row["verified"])}
    }


@app.get("/auth/me")
async def me(user=Depends(require_auth)):
    return user


@app.get("/auth/verify-email")
async def verify_email(token: str):
    """Marks account as verified. Called when user clicks the email link."""
    now = datetime.now(timezone.utc).isoformat()
    with db() as con:
        row = con.execute(
            "SELECT user_id, expires_at FROM email_verifications WHERE token=?", (token,)
        ).fetchone()
        if not row:
            return HTMLResponse(_verify_page("Invalid or already used verification link.", success=False))
        if row["expires_at"] < now:
            con.execute("DELETE FROM email_verifications WHERE token=?", (token,))
            return HTMLResponse(_verify_page("This verification link has expired. Please request a new one.", success=False))
        con.execute("UPDATE users SET verified=1 WHERE id=?", (row["user_id"],))
        con.execute("DELETE FROM email_verifications WHERE token=?", (token,))

    log.info("Email verified for user_id=%s", row["user_id"])
    return HTMLResponse(_verify_page("Your email has been verified! You can now close this tab.", success=True))


def _verify_page(message: str, success: bool) -> str:
    color  = "#39d98a" if success else "#ff6b6b"
    icon   = "✓" if success else "✗"
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Email Verification — TrustCheck.AI</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;background:#0a0f1e;font-family:Poppins,sans-serif;display:flex;
             align-items:center;justify-content:center;min-height:100vh">
  <div style="background:#13141a;border:1px solid rgba(56,133,241,0.2);border-radius:20px;
              padding:48px 40px;text-align:center;max-width:420px;width:90%">
    <div style="width:64px;height:64px;border-radius:50%;background:{color}22;
                border:2px solid {color};display:flex;align-items:center;justify-content:center;
                margin:0 auto 24px;font-size:28px;color:{color}">{icon}</div>
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px">TrustCheck<span style="color:#3885f1">.AI</span></h1>
    <p style="color:#8899aa;font-size:14px;line-height:1.6;margin:0 0 28px">{message}</p>
    <a href="/" style="display:inline-block;background:#3885f1;color:#fff;text-decoration:none;
                       padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px">
      Back to TrustCheck.AI
    </a>
  </div>
</body>
</html>"""


@app.post("/auth/resend-verification")
async def resend_verification(user=Depends(require_auth)):
    """Resend verification email."""
    if user.get("verified"):
        raise HTTPException(400, "Email is already verified.")
    with db() as con:
        row = con.execute("SELECT name, email FROM users WHERE id=?", (user["id"],)).fetchone()
        # Delete any old tokens
        con.execute("DELETE FROM email_verifications WHERE user_id=?", (user["id"],))
    v_token  = secrets.token_urlsafe(32)
    v_expiry = datetime.fromtimestamp(time.time() + 86400, tz=timezone.utc).isoformat()
    with db() as con:
        con.execute(
            "INSERT INTO email_verifications (token,user_id,expires_at) VALUES (?,?,?)",
            (v_token, user["id"], v_expiry),
        )
    send_verification_email(row["email"], row["name"], v_token)
    return {"message": "Verification email sent."}


@app.put("/auth/settings")
async def update_settings(body: SettingsIn, user=Depends(require_auth)):
    """Update display name and/or password."""
    updates = []
    params  = []

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty.")
        updates.append("name=?")
        params.append(name)

    if body.new_password is not None:
        if not body.current_password:
            raise HTTPException(400, "Current password is required to set a new password.")
        if len(body.new_password) < 6:
            raise HTTPException(400, "New password must be at least 6 characters.")
        with db() as con:
            row = con.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        if not check_password(body.current_password, row["password_hash"]):
            raise HTTPException(401, "Current password is incorrect.")
        updates.append("password_hash=?")
        params.append(hash_password(body.new_password))

    if not updates:
        raise HTTPException(400, "Nothing to update.")

    params.append(user["id"])
    with db() as con:
        con.execute(f"UPDATE users SET {', '.join(updates)} WHERE id=?", params)

    # Return fresh user data
    with db() as con:
        row = con.execute("SELECT id,name,email,verified FROM users WHERE id=?", (user["id"],)).fetchone()
    return dict(row)


# ── Stats endpoint ────────────────────────────────────────────────────────────

@app.get("/v1/stats", response_model=StatsResponse)
async def get_stats(user=Depends(require_auth)):
    with db() as con:
        rows = con.execute(
            "SELECT score, grade, platform FROM analyses WHERE user_id=?",
            (user["id"],)
        ).fetchall()

    if not rows:
        return StatsResponse(total=0, avg_score=0.0, pass_count=0,
                             review_count=0, fail_count=0, top_platform="—")

    total        = len(rows)
    avg_score    = round(sum(r["score"] for r in rows) / total, 1)
    pass_count   = sum(1 for r in rows if r["grade"] == "pass")
    review_count = sum(1 for r in rows if r["grade"] == "review")
    fail_count   = sum(1 for r in rows if r["grade"] == "fail")

    platform_counts: dict[str, int] = {}
    for r in rows:
        platform_counts[r["platform"]] = platform_counts.get(r["platform"], 0) + 1
    top_platform = max(platform_counts, key=platform_counts.get) if platform_counts else "—"

    return StatsResponse(
        total=total, avg_score=avg_score,
        pass_count=pass_count, review_count=review_count, fail_count=fail_count,
        top_platform=top_platform,
    )


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


# ── Bookmark endpoints ────────────────────────────────────────────────────────

@app.post("/v1/bookmarks", response_model=BookmarkEntry)
async def add_bookmark(body: BookmarkIn, user=Depends(require_auth)):
    bid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    try:
        with db() as con:
            con.execute(
                """INSERT INTO bookmarks
                   (id,user_id,analysis_id,platform,score,verdict,summary,ad_text,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (bid, user["id"], body.analysis_id, body.platform, body.score,
                 body.verdict, body.summary or "", body.ad_text or "", now),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Already bookmarked.")
    return BookmarkEntry(
        id=bid, analysis_id=body.analysis_id, platform=body.platform,
        score=body.score, verdict=body.verdict, summary=body.summary or "",
        ad_text=body.ad_text or "", created_at=now,
    )


@app.get("/v1/bookmarks", response_model=list[BookmarkEntry])
async def get_bookmarks(user=Depends(require_auth)):
    with db() as con:
        rows = con.execute(
            """SELECT id,analysis_id,platform,score,verdict,summary,ad_text,created_at
               FROM bookmarks WHERE user_id=?
               ORDER BY created_at DESC""",
            (user["id"],),
        ).fetchall()
    return [BookmarkEntry(**dict(r)) for r in rows]


@app.delete("/v1/bookmarks/{analysis_id}")
async def remove_bookmark(analysis_id: str, user=Depends(require_auth)):
    with db() as con:
        r = con.execute(
            "DELETE FROM bookmarks WHERE analysis_id=? AND user_id=?",
            (analysis_id, user["id"]),
        )
    if r.rowcount == 0:
        raise HTTPException(404, "Bookmark not found.")
    return {"removed": analysis_id}


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_prompt(platform: str, ad_text: str, language: str, has_images: bool = False) -> str:
    policy = POLICIES.get(platform, POLICIES["google"])

    if has_images:
        image_section = (
            "## Images\n"
            "Images are attached. Visually inspect each one for image-specific violations.\n"
            "Image violations must use \"source\": \"image\" or \"source\": \"both\".\n"
            "Check for: misleading visuals, before/after imagery, nudity, shocking content, excessive text overlay."
        )
        source_rule = (
            "CRITICAL source field rules:\n"
            "- \"text\"  = violation found only in the ad copy\n"
            "- \"image\" = violation found only in the image(s)\n"
            "- \"both\"  = violation present in both text and image\n"
            "You MUST use \"image\" or \"both\" for any violation detected from the image."
        )
        image_sugg = '"image": ["<specific improvement based on what you see in the image>"]'
    else:
        image_section = (
            "## Images\n"
            "NO image was provided. Analysing text ONLY.\n"
            "CRITICAL: Every violation MUST have \"source\": \"text\".\n"
            "Using \"image\" or \"both\" is FORBIDDEN. suggestions.image MUST be []."
        )
        source_rule = (
            "CRITICAL: No image provided.\n"
            "- Every violation \"source\" MUST be \"text\".\n"
            "- suggestions.image MUST be []."
        )
        image_sugg = '"image": []'

    return f"""You are TrustCheck.AI, an expert advertising compliance auditor.

## Platform: {platform.upper()}
## Language: {language}

## Platform Policies
{policy}

## Ad Text
\"\"\"{ad_text}\"\"\"

{image_section}

## Source Field Rules
{source_rule}

## Output
Respond with valid JSON only. No markdown fences, no extra keys, no trailing commas.
Keep violations to the most impactful (max 6). Keep each suggestion list to max 5 items.

{{
  "score": <0-100 int>,
  "grade": "<pass|review|fail>",
  "summary": "<2-3 sentence overview>",
  "violations": [
    {{
      "code": "<SNAKE_CASE_CODE>",
      "severity": "<high|medium|low>",
      "source": "<text|image|both>",
      "rationale": "<why this violates policy>",
      "suggested_fix": "<concrete fix>"
    }}
  ],
  "suggestions": {{
    "text": ["<actionable text improvement>"],
    {image_sugg}
  }}
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
    return RateStatus(limit=RATE_LIMIT, remaining=max(0, RATE_LIMIT - len(ts)), window_seconds=ws)


# ── Analyze ───────────────────────────────────────────────────────────────────

@app.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: Request,
    platform: str = Form(...),
    ad_text: str = Form(...),
    language: str = Form("auto"),
    images: Optional[List[Any]] = File(default=None),
    ad_url: str = Form(default=""),
    user: Optional[dict] = Depends(get_user),
):
    ip = get_ip(request)
    ok, remaining, reset = rate_check(ip)
    if not ok:
        raise HTTPException(429, detail={
            "error": "Rate limit exceeded",
            "message": f"You have used all {RATE_LIMIT} analyses for this hour. Try again in {reset} seconds.",
            "remaining": 0, "reset_in_seconds": reset, "limit": RATE_LIMIT,
        })

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
        for up in (images or []):
            # Render/Swagger sends a bare empty string "" when the field is left
            # blank; FastAPI now lets it through (Any type) so we filter it here.
            if not isinstance(up, UploadFile):
                continue
            if not up.filename and not up.size:
                continue
            b = await up.read()
            if not b:
                continue
            if up.content_type not in ALLOWED:
                raise HTTPException(400, f"Unsupported image type '{up.content_type}'.")
            if len(b) > MAX_IMG:
                raise HTTPException(400, f"Image '{up.filename}' exceeds 5 MB.")
            content.append(encode_image(b, up.content_type))

    has_images = len(content) > 0  # True if any image blocks were added above
    content.append({"type": "text", "text": build_prompt(platform, ad_text, language, has_images)})
    log.info("Analyze | ip=%s platform=%s user=%s", ip, platform,
             user["email"] if user else "guest")

    try:
        resp = claude.messages.create(
            model="claude-opus-4-5",
            max_tokens=2048,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e}")

    data    = parse_json(resp.content[0].text)
    log.info("Claude raw response | score=%s grade=%s violations=%d text_sugg=%d image_sugg=%d",
             data.get("score"), data.get("grade"),
             len(data.get("violations", [])),
             len((data.get("suggestions") or {}).get("text", []) if isinstance(data.get("suggestions"), dict) else []),
             len((data.get("suggestions") or {}).get("image", []) if isinstance(data.get("suggestions"), dict) else []))
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
        log.info("Saved analysis %s user=%s score=%d", analysis_id, user["email"], score)

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
    return {"status": "ok", "version": "3.0.0", "platforms": list(POLICIES)}

@app.get("/")
def root():
    return {"status": "TrustCheck AI backend running"}