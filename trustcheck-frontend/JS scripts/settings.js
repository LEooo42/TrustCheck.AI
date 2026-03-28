/* =============================================================
   TrustCheck.AI — Settings Page
   ============================================================= */

const API_BASE = "https://trustcheck-ai.onrender.com";

document.getElementById("year").textContent = new Date().getFullYear();

/* ── Redirect if not logged in ─────────────────────────────── */
const token   = (window.TC_AUTH && window.TC_AUTH.getToken()) || localStorage.getItem("tc_token");
const session = JSON.parse(localStorage.getItem("tc_session") || "null");

if (!token || !session) {
    window.location.href = "index.html";
}

/* ── Populate initial data ─────────────────────────────────── */
function populatePage(user) {
    const name    = user.name    || session.name    || "";
    const email   = user.email   || session.email   || "";
    const verified = user.verified !== undefined ? user.verified : session.verified;

    // Avatar
    const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const avatar   = document.getElementById("settingsAvatar");
    avatar.textContent = initials;

    document.getElementById("settingsEmail").textContent = email;
    document.getElementById("settingsName").value = name;

    // Verification status
    const vsEl = document.getElementById("verificationStatus");
    const resendBtn = document.getElementById("resendVerificationBtn");
    resendBtn.classList.add("hidden");
    if (verified) {
        vsEl.innerHTML = `
            <div class="verify-badge verify-badge--ok">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#39d98a" stroke-width="1.3"/>
                <path d="M5 8l2 2 4-4" stroke="#39d98a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Email verified
            </div>`;
    } else {
        vsEl.innerHTML = `
            <div class="verify-badge verify-badge--warn">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#ffd166" stroke-width="1.3"/>
                <path d="M8 5v4" stroke="#ffd166" stroke-width="1.3" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="0.6" fill="#ffd166"/></svg>
                Email not verified
            </div>
            <p class="verify-hint">Check your inbox for a verification email, or request a new one below.</p>`;
        resendBtn.classList.remove("hidden");
    }
}

/* ── Fetch fresh user data ─────────────────────────────────── */
(async () => {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            window.location.href = "index.html";
            return;
        }
        const user = await res.json();
        populatePage(user);
    } catch {
        populatePage(session);
    }
})();

/* ── Nav tab switching ─────────────────────────────────────── */
document.querySelectorAll(".settings-nav__item").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".settings-nav__item").forEach(b => b.classList.remove("settings-nav__item--active"));
        document.querySelectorAll(".settings-section").forEach(s => s.classList.remove("active"));
        btn.classList.add("settings-nav__item--active");
        document.getElementById("section-" + btn.dataset.section).classList.add("active");
        clearMsgs();
    });
});

function clearMsgs() {
    ["profileMsg","securityMsg","verificationMsg"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = ""; el.classList.add("hidden"); }
    });
}

function showMsg(id, text, isError) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className   = "settings-msg " + (isError ? "settings-msg--error" : "settings-msg--ok");
}

function extractErrorMessage(data, fallback) {
    if (!data) return fallback;
    if (typeof data.detail === "string") return data.detail;
    if (data.detail && typeof data.detail.message === "string") return data.detail.message;
    if (typeof data.message === "string") return data.message;
    return fallback;
}

function setBusy(btnId, busy, label) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled    = busy;
    btn.textContent = busy ? "Saving…" : label;
}

/* ── Save profile (name) ───────────────────────────────────── */
document.getElementById("saveProfileBtn").addEventListener("click", async () => {
    const name = document.getElementById("settingsName").value.trim();
    if (!name) return showMsg("profileMsg", "Name cannot be empty.", true);

    setBusy("saveProfileBtn", true, "Save Changes");
    try {
        const res  = await fetch(`${API_BASE}/auth/settings`, {
            method:  "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) return showMsg("profileMsg", extractErrorMessage(data, "Update failed."), true);

        // Update local session
        const sess = JSON.parse(localStorage.getItem("tc_session") || "null");
        if (sess) { sess.name = data.name; localStorage.setItem("tc_session", JSON.stringify(sess)); }

        populatePage(data);
        showMsg("profileMsg", "Name updated successfully.", false);
    } catch {
        showMsg("profileMsg", "Could not reach the server.", true);
    } finally {
        setBusy("saveProfileBtn", false, "Save Changes");
    }
});

/* ── Save password ─────────────────────────────────────────── */
document.getElementById("savePasswordBtn").addEventListener("click", async () => {
    const current  = document.getElementById("currentPassword").value;
    const newPw    = document.getElementById("newPassword").value;
    const confirm  = document.getElementById("confirmPassword").value;

    if (!current || !newPw || !confirm)
        return showMsg("securityMsg", "Please fill in all fields.", true);
    if (newPw.length < 6)
        return showMsg("securityMsg", "New password must be at least 6 characters.", true);
    if (newPw !== confirm)
        return showMsg("securityMsg", "Passwords do not match.", true);

    setBusy("savePasswordBtn", true, "Update Password");
    try {
        const res  = await fetch(`${API_BASE}/auth/settings`, {
            method:  "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ current_password: current, new_password: newPw }),
        });
        const data = await res.json();
        if (!res.ok) return showMsg("securityMsg", extractErrorMessage(data, "Update failed."), true);

        document.getElementById("currentPassword").value = "";
        document.getElementById("newPassword").value     = "";
        document.getElementById("confirmPassword").value = "";
        showMsg("securityMsg", "Password updated successfully.", false);
    } catch {
        showMsg("securityMsg", "Could not reach the server.", true);
    } finally {
        setBusy("savePasswordBtn", false, "Update Password");
    }
});

/* ── Resend verification ───────────────────────────────────── */
document.getElementById("resendVerificationBtn").addEventListener("click", async () => {
    setBusy("resendVerificationBtn", true, "Resend Verification Email");
    try {
        const res  = await fetch(`${API_BASE}/auth/resend-verification`, {
            method:  "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) return showMsg("verificationMsg", extractErrorMessage(data, "Failed to send."), true);
        showMsg("verificationMsg", "Verification email sent! Check your inbox.", false);
    } catch {
        showMsg("verificationMsg", "Could not reach the server.", true);
    } finally {
        setBusy("resendVerificationBtn", false, "Resend Verification Email");
    }
});

/* ── Bookmarks ─────────────────────────────────────────────── */
let bookmarksLoaded = false;

async function loadBookmarks() {
    if (bookmarksLoaded) return;
    const loadingEl = document.getElementById("bookmarksLoading");
    const emptyEl   = document.getElementById("bookmarksEmpty");
    const listEl    = document.getElementById("bookmarksList");
    const msgEl     = document.getElementById("bookmarksMsg");

    try {
        const res = await fetch(`${API_BASE}/v1/bookmarks`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to load bookmarks.");
        const bms = await res.json();

        loadingEl.classList.add("hidden");

        if (!bms.length) {
            emptyEl.classList.remove("hidden");
            return;
        }

        bms.forEach(bm => {
            const score = Number(bm.score ?? 0);
            const scoreClass = score >= 70 ? "bm-card__score--high"
                             : score >= 40 ? "bm-card__score--mid"
                             : "bm-card__score--low";
            const date = bm.created_at
                ? new Date(bm.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })
                : "";

            const card = document.createElement("div");
            card.className = "bm-card";
            card.innerHTML = `
                <div class="bm-card__left">
                    <div class="bm-card__platform">${bm.platform || "—"}</div>
                    <div class="bm-card__text">${bm.summary || bm.ad_text || "No preview"}</div>
                    <div class="bm-card__meta">
                        <span class="bm-card__score ${scoreClass}">${score}/100</span>
                        <span class="bm-card__verdict">${bm.verdict || ""}</span>
                    </div>
                    ${date ? `<div class="bm-card__date">${date}</div>` : ""}
                </div>
                <button class="bm-card__remove" title="Remove bookmark" data-id="${bm.analysis_id}">
                    <svg viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                </button>`;
            listEl.appendChild(card);
        });

        listEl.addEventListener("click", async e => {
            const btn = e.target.closest(".bm-card__remove");
            if (!btn) return;
            const id = btn.dataset.id;
            try {
                await fetch(`${API_BASE}/v1/bookmarks/${id}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` }
                });
                btn.closest(".bm-card").remove();
                if (!listEl.querySelector(".bm-card")) emptyEl.classList.remove("hidden");
            } catch { alert("Could not remove bookmark."); }
        });

        bookmarksLoaded = true;
    } catch (err) {
        loadingEl.classList.add("hidden");
        msgEl.textContent = err.message || "Could not load bookmarks.";
        msgEl.className = "settings-msg settings-msg--error";
    }
}

document.querySelectorAll(".settings-nav__item").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.dataset.section === "bookmarks") loadBookmarks();
    });
});
