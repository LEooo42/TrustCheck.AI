/* =============================================================
   TrustCheck.AI — Auth Modal
   Handles: open/close, tab switching, sign-up, login, logout
   Storage: localStorage (swap fetch() calls for real API later)
   ============================================================= */

(function () {

  /* ── State ─────────────────────────────────────────────────── */
  const STORAGE_KEY = "tc_users";
  const SESSION_KEY = "tc_session";

  function getUsers() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  }
  function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }
  function getSession() {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  }
  function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* ── Inject modal HTML ─────────────────────────────────────── */
  const MODAL_HTML = `
  <div id="authOverlay" class="auth-overlay hidden" role="dialog" aria-modal="true" aria-label="Authentication">
    <div class="auth-modal">

      <button class="auth-modal__close" id="authClose" aria-label="Close">
        <svg viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>

      <div class="auth-modal__brand">
        <span class="auth-modal__logo">TrustCheck<span>.AI</span></span>
        <p class="auth-modal__tagline">Analyze ads. Ensure compliance.</p>
      </div>

      <!-- Tabs -->
      <div class="auth-tabs">
        <button class="auth-tab auth-tab--active" data-auth-tab="login">Log In</button>
        <button class="auth-tab" data-auth-tab="signup">Sign Up</button>
      </div>

      <!-- Login form -->
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

      <!-- Sign-up form -->
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
  </div>`;

  document.body.insertAdjacentHTML("beforeend", MODAL_HTML);

  /* ── Update header button based on session ─────────────────── */
  function updateHeaderButton() {
    const btn = document.querySelector(".register-button");
    if (!btn) return;
    const session = getSession();

    if (session) {
      const initials = session.name
        .split(" ")
        .map(w => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      btn.innerHTML = `<span class="auth-avatar">${initials}</span> ${session.name.split(" ")[0]}`;
      btn.classList.add("register-button--logged-in");
      btn.onclick = handleLogout;
    } else {
      btn.innerHTML = "Get Started";
      btn.classList.remove("register-button--logged-in");
      btn.onclick = openModal;
    }
  }

  /* ── Modal open / close ────────────────────────────────────── */
  function openModal(tab) {
    const overlay = document.getElementById("authOverlay");
    overlay.classList.remove("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    // Default to login unless signup is requested
    switchTab(typeof tab === "string" ? tab : "login");

    // Clear fields and errors
    ["loginEmail","loginPassword","signupName","signupEmail","signupPassword"]
      .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
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
      f.classList.toggle("auth-form--active", f.id === "authForm" + name.charAt(0).toUpperCase() + name.slice(1)));
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

  /* ── Sign up ───────────────────────────────────────────────── */
  function handleSignup() {
    hideError("signupError");
    const name     = document.getElementById("signupName").value.trim();
    const email    = document.getElementById("signupEmail").value.trim().toLowerCase();
    const password = document.getElementById("signupPassword").value;

    if (!name)                        return showError("signupError", "Please enter your name.");
    if (!/\S+@\S+\.\S+/.test(email))  return showError("signupError", "Please enter a valid email.");
    if (password.length < 6)          return showError("signupError", "Password must be at least 6 characters.");

    const users = getUsers();
    if (users[email])                 return showError("signupError", "An account with this email already exists.");

    // Simple hash — replace with bcrypt on a real backend
    users[email] = { name, email, password: btoa(password) };
    saveUsers(users);
    saveSession({ name, email });

    closeModal();
    updateHeaderButton();
  }

  /* ── Log in ────────────────────────────────────────────────── */
  function handleLogin() {
    hideError("loginError");
    const email    = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) return showError("loginError", "Please fill in all fields.");

    const users = getUsers();
    const user  = users[email];

    if (!user || user.password !== btoa(password))
      return showError("loginError", "Incorrect email or password.");

    saveSession({ name: user.name, email });
    closeModal();
    updateHeaderButton();
  }

  /* ── Log out ───────────────────────────────────────────────── */
  function handleLogout() {
    if (!confirm("Log out of TrustCheck.AI?")) return;
    clearSession();
    updateHeaderButton();
  }

  /* ── Event wiring ──────────────────────────────────────────── */
  document.getElementById("authClose").addEventListener("click", closeModal);

  document.getElementById("authOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("authOverlay")) closeModal();
  });

  document.querySelectorAll(".auth-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.authTab));
  });

  document.getElementById("loginSubmit").addEventListener("click", handleLogin);
  document.getElementById("signupSubmit").addEventListener("click", handleSignup);

  // Allow Enter key to submit
  document.getElementById("loginPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });
  document.getElementById("signupPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") handleSignup();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

  // Wire the header button
  const headerBtn = document.querySelector(".register-button");
  if (headerBtn) headerBtn.addEventListener("click", openModal);

  /* ── Init ──────────────────────────────────────────────────── */
  updateHeaderButton();

})();
