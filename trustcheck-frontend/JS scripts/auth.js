/* =============================================================
   TrustCheck.AI — Auth (v3)
   Real backend API. Token in localStorage "tc_token".
   Session in "tc_session".
   ============================================================= */

(function () {

  const API_BASE    = "https://trustcheck-ai.onrender.com";
  const TOKEN_KEY   = "tc_token";
  const SESSION_KEY = "tc_session";

  /* ── Storage helpers ───────────────────────────────────────── */
  function getToken()     { return localStorage.getItem(TOKEN_KEY) || null; }
  function saveToken(t)   { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken()   { localStorage.removeItem(TOKEN_KEY); }
  function getSession()   { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  function saveSession(u) { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /* Expose for other scripts */
  window.TC_AUTH = { getToken };

  /* ── Build absolute path to any page in HTML pages/ ─────────── */
  function pagesUrl(filename) {
    const loc = window.location.href;
    // Find the root of the project (everything up to and including the folder
    // that contains "HTML pages" or "trustcheck-frontend")
    const match = loc.match(/^(.*trustcheck-frontend[\/])/i);
    if (match) return match[1] + "HTML%20pages/" + filename;
    // Fallback: if we're already inside HTML pages, use relative path
    if (loc.includes("HTML%20pages") || loc.includes("HTML pages")) {
      return filename;
    }
    return "HTML%20pages/" + filename;
  }

  /* ── Inject auth modal ─────────────────────────────────────── */
  document.body.insertAdjacentHTML("beforeend", `
  <div id="authOverlay" class="auth-overlay hidden" role="dialog" aria-modal="true">
    <div class="auth-modal">
      <button class="auth-modal__close" id="authClose" aria-label="Close">
        <svg viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <div class="auth-modal__brand">
        <span class="auth-modal__logo">TrustCheck<span>.AI</span></span>
        <p class="auth-modal__tagline">Analyze ads. Ensure compliance.</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab auth-tab--active" data-auth-tab="login">Log In</button>
        <button class="auth-tab" data-auth-tab="signup">Sign Up</button>
      </div>
      <div class="auth-form auth-form--active" id="authFormLogin">
        <form onsubmit="return false;" autocomplete="on">
        <div class="auth-field">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email"/>
        </div>
        <div class="auth-field">
          <label for="loginPassword">Password</label>
          <input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password"/>
        </div>
        <p class="auth-error hidden" id="loginError"></p>
        <button type="button" class="auth-submit" id="loginSubmit">Log In</button>
        </form>
      </div>
      <div class="auth-form" id="authFormSignup">
        <form onsubmit="return false;" autocomplete="on">
        <div class="auth-field">
          <label for="signupName">Name</label>
          <input type="text" id="signupName" placeholder="Your name" autocomplete="name"/>
        </div>
        <div class="auth-field">
          <label for="signupEmail">Email</label>
          <input type="email" id="signupEmail" placeholder="you@example.com" autocomplete="email"/>
        </div>
        <div class="auth-field">
          <label for="signupPassword">Password</label>
          <input type="password" id="signupPassword" placeholder="Min. 6 characters" autocomplete="new-password"/>
        </div>
        <p class="auth-error hidden" id="signupError"></p>
        <button type="button" class="auth-submit" id="signupSubmit">Create Account</button>
        </form>
      </div>
    </div>
  </div>`);

  /* ── Inject user dropdown ──────────────────────────────────── */
  document.body.insertAdjacentHTML("beforeend", `
  <div id="userMenu" class="user-menu hidden" role="menu">
    <div class="user-menu__info">
      <span class="user-menu__name"  id="userMenuName"></span>
      <span class="user-menu__email" id="userMenuEmail"></span>
      <span class="user-menu__badge hidden" id="userMenuBadge"></span>
    </div>
    <div class="user-menu__divider"></div>
    <a class="user-menu__item" id="userMenuSettings" role="menuitem">
      <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.93 2.93l1.06 1.06M12.01 12.01l1.06 1.06M2.93 13.07l1.06-1.06M12.01 3.99l1.06-1.06" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      Settings
    </a>
    <div class="user-menu__divider"></div>
    <button class="user-menu__item user-menu__item--danger" id="userMenuLogout" role="menuitem">
      <svg viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Log Out
    </button>
  </div>`);

  /* ── Header button ─────────────────────────────────────────── */
  function updateHeaderButton() {
    const btn     = document.querySelector("header .register-button");
    if (!btn) return;
    const session = getSession();
    if (session) {
      const initials = session.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      btn.innerHTML = `<span class="auth-avatar">${initials}</span> ${session.name.split(" ")[0]}`;
      btn.classList.add("register-button--logged-in");
    } else {
      btn.innerHTML = "Get Started";
      btn.classList.remove("register-button--logged-in");
    }
  }

  /* ── Modal ─────────────────────────────────────────────────── */
  function openModal(tab) {
    const overlay = document.getElementById("authOverlay");
    overlay.classList.remove("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
    switchTab(typeof tab === "string" ? tab : "login");
    ["loginEmail","loginPassword","signupName","signupEmail","signupPassword"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    ["loginError","signupError"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ""; el.classList.add("hidden"); }
    });
  }

  function closeModal() {
    const overlay = document.getElementById("authOverlay");
    overlay.classList.remove("active");
    overlay.classList.add("hidden");
    // Only restore scroll if the result popup is not open
    const resultPopup = document.getElementById("aiResultPopup");
    if (!resultPopup || resultPopup.style.display !== "flex") {
      document.body.style.overflow = "";
    }
  }

  function switchTab(name) {
    document.querySelectorAll(".auth-tab").forEach(t =>
      t.classList.toggle("auth-tab--active", t.dataset.authTab === name));
    document.querySelectorAll(".auth-form").forEach(f =>
      f.classList.toggle("auth-form--active",
        f.id === "authForm" + name.charAt(0).toUpperCase() + name.slice(1)));
  }

  /* ── Helpers ───────────────────────────────────────────────── */
  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }
  function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  }
  function setSubmitting(btnId, busy) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled    = busy;
    btn.textContent = busy ? "Please wait…" : (btnId === "loginSubmit" ? "Log In" : "Create Account");
  }

  /* ── Sign Up ───────────────────────────────────────────────── */
  async function handleSignup() {
    hideError("signupError");
    const name  = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim().toLowerCase();
    const pw    = document.getElementById("signupPassword").value;

    if (!name)                       return showError("signupError", "Please enter your name.");
    if (!/\S+@\S+\.\S+/.test(email)) return showError("signupError", "Please enter a valid email.");
    if (pw.length < 6)               return showError("signupError", "Password must be at least 6 characters.");

    setSubmitting("signupSubmit", true);
    try {
      const res  = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) return showError("signupError", data.detail || "Registration failed.");
      saveToken(data.token);
      saveSession(data.user);
      closeModal();
      updateHeaderButton();
      // Show verification reminder as a gentle toast
      showVerificationReminder();
    } catch {
      showError("signupError", "Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting("signupSubmit", false);
    }
  }

  /* ── Log In ────────────────────────────────────────────────── */
  async function handleLogin() {
    hideError("loginError");
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const pw    = document.getElementById("loginPassword").value;

    if (!email || !pw) return showError("loginError", "Please fill in all fields.");

    setSubmitting("loginSubmit", true);
    try {
      const res  = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) return showError("loginError", data.detail || "Login failed.");
      saveToken(data.token);
      saveSession(data.user);
      closeModal();
      updateHeaderButton();
    } catch {
      showError("loginError", "Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting("loginSubmit", false);
    }
  }

  /* ── Verification reminder toast ──────────────────────────── */
  function showVerificationReminder() {
    // Only show once per session
    if (sessionStorage.getItem("tc_verify_reminder")) return;
    sessionStorage.setItem("tc_verify_reminder", "1");

    const toast = document.createElement("div");
    toast.className = "auth-toast";
    toast.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" style="width:16px;height:16px;flex-shrink:0">
        <circle cx="8" cy="8" r="7" stroke="#ffd166" stroke-width="1.3"/>
        <path d="M8 5v4" stroke="#ffd166" stroke-width="1.3" stroke-linecap="round"/>
        <circle cx="8" cy="11" r="0.6" fill="#ffd166"/>
      </svg>
      <span>Check your inbox to verify your email address.</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#667;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 8px">×</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 7000);
  }

  /* ── User dropdown ─────────────────────────────────────────── */
  function openUserMenu(btn) {
    const menu    = document.getElementById("userMenu");
    const session = getSession();
    if (!menu) return;

    document.getElementById("userMenuName").textContent  = session ? session.name  : "";
    document.getElementById("userMenuEmail").textContent = session ? session.email : "";

    // Verification badge
    const badge = document.getElementById("userMenuBadge");
    if (session && !session.verified) {
      badge.textContent = "Email not verified";
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    // Settings link — path depends on current page
    const settingsLink = document.getElementById("userMenuSettings");
    settingsLink.href = pagesUrl("settings.html");

    const rect = btn.getBoundingClientRect();
    menu.style.top  = (rect.bottom + window.scrollY + 8) + "px";
    menu.style.left = (rect.right  + window.scrollX) + "px";

    menu.classList.remove("hidden");
    menu.classList.add("active");

    requestAnimationFrame(() => {
      const mw = menu.offsetWidth;
      let left = rect.right + window.scrollX - mw;
      if (left < 8) left = 8;
      menu.style.left = left + "px";
    });
  }

  function closeUserMenu() {
    const menu = document.getElementById("userMenu");
    if (menu) { menu.classList.add("hidden"); menu.classList.remove("active"); }
  }

  function isMenuOpen() {
    const menu = document.getElementById("userMenu");
    return menu && !menu.classList.contains("hidden");
  }

  /* ── Log Out ───────────────────────────────────────────────── */
  function handleLogout() {
    closeUserMenu();
    clearToken();
    clearSession();
    updateHeaderButton();
  }

  /* ── Session verification on load ─────────────────────────── */
  async function verifySession() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { clearToken(); clearSession(); }
      else {
        const user = await res.json();
        saveSession(user);
      }
    } catch { /* server unreachable — keep cached session */ }
    updateHeaderButton();
  }

  /* ── Single document click handler ────────────────────────── */
  document.addEventListener("click", e => {
    const menu    = document.getElementById("userMenu");
    const overlay = document.getElementById("authOverlay");

    if (e.target === overlay) { closeModal(); return; }

    // Scope to the header button only, not any other .register-button on the page
    const liveBtn = document.querySelector("header .register-button");
    if (liveBtn && (liveBtn === e.target || liveBtn.contains(e.target))) {
      if (getSession()) {
        isMenuOpen() ? closeUserMenu() : openUserMenu(liveBtn);
      } else {
        openModal();
      }
      return;
    }

    if (e.target && e.target.closest("#userMenuLogout")) {
      handleLogout();
      return;
    }

    if (isMenuOpen() && menu && !menu.contains(e.target)) {
      closeUserMenu();
    }
  });

  /* ── Other wiring ──────────────────────────────────────────── */
  document.getElementById("authClose").addEventListener("click", closeModal);
  document.querySelectorAll(".auth-tab").forEach(btn =>
    btn.addEventListener("click", () => switchTab(btn.dataset.authTab)));
  document.getElementById("loginSubmit").addEventListener("click", handleLogin);
  document.getElementById("signupSubmit").addEventListener("click", handleSignup);
  document.getElementById("loginPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });
  document.getElementById("signupPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") handleSignup();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeModal(); closeUserMenu(); }
  });

  /* ── Init ──────────────────────────────────────────────────── */
  updateHeaderButton();
  verifySession();

})();
