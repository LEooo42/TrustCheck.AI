/* 
=============================================================
   TrustCheck.AI — Auth (v2)
   All auth calls go to the real backend API.
   Token stored in localStorage under "tc_token".
   Session info (name, email) stored under "tc_session".
   ============================================================= 
*/

(function () {

  const API_BASE    = "http://127.0.0.1:8000";
  const TOKEN_KEY   = "tc_token";
  const SESSION_KEY = "tc_session";

  /* ── Storage helpers ───────────────────────────────────────── */
  function getToken()     { return localStorage.getItem(TOKEN_KEY) || null; }
  function saveToken(t)   { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken()   { localStorage.removeItem(TOKEN_KEY); }
  function getSession()   { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  function saveSession(u) { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /* Expose token getter so index.js can attach it to /analyze requests */
  window.TC_AUTH = { getToken };

  /* ── Inject modal HTML ─────────────────────────────────────── */
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
        <div class="auth-field">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email"/>
        </div>
        <div class="auth-field">
          <label for="loginPassword">Password</label>
          <input type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password"/>
        </div>
        <p class="auth-error hidden" id="loginError"></p>
        <button class="auth-submit" id="loginSubmit">Log In</button>
      </div>
      <div class="auth-form" id="authFormSignup">
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
        <button class="auth-submit" id="signupSubmit">Create Account</button>
      </div>
    </div>
  </div>`);

  /* ── Inject user dropdown menu ─────────────────────────────── */
  document.body.insertAdjacentHTML("beforeend", `
  <div id="userMenu" class="user-menu hidden" role="menu">
    <div class="user-menu__info">
      <span class="user-menu__name"  id="userMenuName"></span>
      <span class="user-menu__email" id="userMenuEmail"></span>
    </div>
    <div class="user-menu__divider"></div>
    <button class="user-menu__item user-menu__item--danger" id="userMenuLogout" role="menuitem">
      <svg viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Log Out
    </button>
  </div>`);

  /* ── Header button ─────────────────────────────────────────── */
  function updateHeaderButton() {
    const btn     = document.querySelector(".register-button");
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
    document.body.style.overflow = "";
  }

  function switchTab(name) {
    document.querySelectorAll(".auth-tab").forEach(t =>
      t.classList.toggle("auth-tab--active", t.dataset.authTab === name));
    document.querySelectorAll(".auth-form").forEach(f =>
      f.classList.toggle("auth-form--active",
        f.id === "authForm" + name.charAt(0).toUpperCase() + name.slice(1)));
  }

  /* ── Validation helpers ────────────────────────────────────── */
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

  /* ── User dropdown ─────────────────────────────────────────── */
  function openUserMenu(btn) {
    const menu    = document.getElementById("userMenu");
    const session = getSession();
    if (!menu) return;

    // Populate
    document.getElementById("userMenuName").textContent  = session ? session.name  : "";
    document.getElementById("userMenuEmail").textContent = session ? session.email : "";

    // Position below the button, right-aligned
    const rect = btn.getBoundingClientRect();
    menu.style.top  = (rect.bottom + window.scrollY + 8) + "px";
    menu.style.left = (rect.right  + window.scrollX)     + "px"; // will clamp below

    menu.classList.remove("hidden");
    menu.classList.add("active");

    // Clamp after paint so we know the menu width
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
      else         { saveSession(await res.json()); }
    } catch { /* server unreachable — keep cached session */ }
    updateHeaderButton();
  }

  /* ── Single document-level click handler ───────────────────── *
   *  Handles ALL clicks in one place to avoid stacking listeners  */
  document.addEventListener("click", e => {
    const headerBtn = document.querySelector(".register-button");
    const menu      = document.getElementById("userMenu");
    const overlay   = document.getElementById("authOverlay");

    /* Close modal on backdrop click */
    if (e.target === overlay) { closeModal(); return; }

    /* Header button clicked */
    if (headerBtn && headerBtn.contains(e.target)) {
      if (getSession()) {
        /* Logged in: toggle dropdown */
        isMenuOpen() ? closeUserMenu() : openUserMenu(headerBtn);
      } else {
        /* Logged out: open login modal */
        openModal();
      }
      return;
    }

    /* Logout button inside the dropdown */
    if (e.target && e.target.closest("#userMenuLogout")) {
      handleLogout();
      return;
    }

    /* Click outside open menu → close it */
    if (isMenuOpen() && menu && !menu.contains(e.target)) {
      closeUserMenu();
    }
  });

  /* ── Other event wiring ────────────────────────────────────── */
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
