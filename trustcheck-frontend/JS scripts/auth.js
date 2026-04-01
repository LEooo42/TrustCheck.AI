/*
Function to run the authentication logic for the whole site.
Paramaters:
- none: Uses page elements, localStorage, and the backend API
Returns:
- none: Sets up auth UI, events, and session handling
*/
(function ()
{
    const API_BASE = "https://trustcheck-ai.onrender.com"
    const TOKEN_KEY = "tc_token"
    const SESSION_KEY = "tc_session"
    const EMAIL_VERIFICATION_UI_ENABLED = false

    /*
    Function to get the saved auth token.
    Paramaters:
    - none: Reads the token from localStorage
    Returns:
    - string|null token: The saved token or null
    */
    function getToken()
    {
        return localStorage.getItem(TOKEN_KEY) || null
    }

    /*
    Function to save the auth token.
    Paramaters:
    - string token: The token returned by the backend
    Returns:
    - none: Saves the token in localStorage
    */
    function saveToken(token)
    {
        localStorage.setItem(TOKEN_KEY, token)
    }

    /*
    Function to remove the saved auth token.
    Paramaters:
    - none: Uses the token key from localStorage
    Returns:
    - none: Removes the token from storage
    */
    function clearToken()
    {
        localStorage.removeItem(TOKEN_KEY)
    }

    /*
    Function to get the saved user session.
    Paramaters:
    - none: Reads the session JSON from localStorage
    Returns:
    - object|null session: The saved session or null
    */
    function getSession()
    {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")
    }

    /*
    Function to save the user session.
    Paramaters:
    - object user: The user object from the backend
    Returns:
    - none: Saves the session in localStorage
    */
    function saveSession(user)
    {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user))
    }

    /*
    Function to clear the saved user session.
    Paramaters:
    - none: Uses the session key from localStorage
    Returns:
    - none: Removes the session from storage
    */
    function clearSession()
    {
        localStorage.removeItem(SESSION_KEY)
    }

    window.TC_AUTH = { getToken: getToken }

    /*
    Function to build the URL for internal pages.
    Paramaters:
    - string filename: The page file name
    Returns:
    - string path: The relative path to that page
    */
    function pagesUrl(filename)
    {
        return filename
    }

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
                    <button type="button" class="auth-resend-btn${EMAIL_VERIFICATION_UI_ENABLED ? "" : " auth-resend-btn--disabled"}" id="loginResendVerification" ${EMAIL_VERIFICATION_UI_ENABLED ? "" : "disabled aria-disabled='true' title='Email verification is currently unavailable.'"}>Resend Verification Email</button>
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
    </div>`)

    document.head.insertAdjacentHTML("beforeend", `
        <style id="tc-auth-verification-styles">
            .auth-resend-btn {
                width: 100%;
                padding: 12px;
                border-radius: 10px;
                border: 1px solid rgba(255, 209, 102, 0.24);
                background: rgba(255, 209, 102, 0.08);
                color: #d7b76a;
                font-size: 13px;
                font-weight: 600;
                font-family: 'Poppins', sans-serif;
                cursor: pointer;
                margin: 6px 0 10px;
                transition: background-color 0.2s ease, transform 0.15s ease, opacity 0.15s ease;
            }

            .auth-resend-btn:not(:disabled):hover {
                background: rgba(255, 209, 102, 0.16);
                transform: translateY(-1px);
            }

            .auth-resend-btn:active:not(:disabled) {
                transform: translateY(0);
            }

            .auth-resend-btn:disabled,
            .auth-resend-btn--disabled {
                opacity: 0.58;
                cursor: not-allowed;
                filter: grayscale(0.18);
            }
        </style>
    `)

    document.body.insertAdjacentHTML("beforeend", `
    <div id="userMenu" class="user-menu hidden" role="menu">
        <div class="user-menu__info">
            <span class="user-menu__name" id="userMenuName"></span>
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
    </div>`)

    /*
    Function to refresh the auth button in the header.
    Paramaters:
    - none: Uses the saved session and header elements
    Returns:
    - none: Updates the button label and state
    */
    function updateHeaderButton()
    {
        const headerButton = document.querySelector("header .register-button")
        const mobileButton = document.getElementById("mobileLoginBtn")

        if (!headerButton)
        {
            return
        }

        const session = getSession()

        if (session)
        {
            const initials = session.name
                .split(" ")
                .map(function(word)
                {
                    return word[0]
                })
                .join("")
                .toUpperCase()
                .slice(0, 2)

            headerButton.innerHTML = `<span class="auth-avatar">${initials}</span> ${session.name.split(" ")[0]}`
            headerButton.classList.add("register-button--logged-in")

            if (mobileButton)
            {
                mobileButton.textContent = session.name.split(" ")[0] || "Account"
                mobileButton.classList.add("mobile-login-btn--logged-in")
            }
        }
        else
        {
            headerButton.innerHTML = "Get Started"
            headerButton.classList.remove("register-button--logged-in")

            if (mobileButton)
            {
                mobileButton.textContent = "Get Started"
                mobileButton.classList.remove("mobile-login-btn--logged-in")
            }
        }

        const loggedIn = !!getSession()

        document.querySelectorAll("a[href*='settings.html'], .mobile-nav-drawer a[href='settings.html']").forEach(function(link)
        {
            if (loggedIn)
            {
                link.removeAttribute("data-locked")
                link.style.opacity = ""
                link.style.pointerEvents = ""
                link.title = ""
            }
            else
            {
                link.setAttribute("data-locked", "1")
                link.style.opacity = "0.35"
                link.style.pointerEvents = "none"
                link.title = "Log in to access Settings"
            }
        })
    }

    /*
    Function to open the auth modal.
    Paramaters:
    - string tab: The tab name to open first
    Returns:
    - none: Shows the modal and resets its fields
    */
    function openModal(tab)
    {
        const overlay = document.getElementById("authOverlay")
        let tabToOpen = "login"

        if (typeof tab === "string")
        {
            tabToOpen = tab
        }

        overlay.classList.remove("hidden")
        overlay.classList.add("active")
        document.body.style.overflow = "hidden"
        switchTab(tabToOpen)

        ["loginEmail", "loginPassword", "signupName", "signupEmail", "signupPassword"].forEach(function(id)
        {
            const element = document.getElementById(id)

            if (element)
            {
                element.value = ""
            }
        })

        ["loginError", "signupError"].forEach(function(id)
        {
            const element = document.getElementById(id)

            if (element)
            {
                element.textContent = ""
                element.classList.add("hidden")
            }
        })
    }

    /*
    Function to close the auth modal.
    Paramaters:
    - none: Uses the modal and result popup elements
    Returns:
    - none: Hides the modal and restores scroll if needed
    */
    function closeModal()
    {
        const overlay = document.getElementById("authOverlay")
        const resultPopup = document.getElementById("aiResultPopup")

        overlay.classList.remove("active")
        overlay.classList.add("hidden")

        if (!resultPopup || resultPopup.style.display !== "flex")
        {
            document.body.style.overflow = ""
        }
    }

    /*
    Function to switch between login and signup tabs.
    Paramaters:
    - string name: The tab name to activate
    Returns:
    - none: Updates the tab and form states
    */
    function switchTab(name)
    {
        document.querySelectorAll(".auth-tab").forEach(function(tabButton)
        {
            tabButton.classList.toggle("auth-tab--active", tabButton.dataset.authTab === name)
        })

        document.querySelectorAll(".auth-form").forEach(function(form)
        {
            const expectedId = "authForm" + name.charAt(0).toUpperCase() + name.slice(1)
            form.classList.toggle("auth-form--active", form.id === expectedId)
        })
    }

    /*
    Function to show an error message.
    Paramaters:
    - string id: The target element id
    - string message: The message to show
    Returns:
    - none: Updates the error element
    */
    function showError(id, message)
    {
        const element = document.getElementById(id)

        if (!element)
        {
            return
        }

        element.textContent = message
        element.classList.remove("hidden")
    }

    /*
    Function to find the best backend error message.
    Paramaters:
    - object data: The response body from the backend
    - string fallback: The message to use if nothing better exists
    Returns:
    - string message: The best message to show to the user
    */
    function extractErrorMessage(data, fallback)
    {
        if (!data)
        {
            return fallback
        }

        if (typeof data.detail === "string")
        {
            return data.detail
        }

        if (data.detail && typeof data.detail.message === "string")
        {
            return data.detail.message
        }

        if (typeof data.message === "string")
        {
            return data.message
        }

        return fallback
    }

    /*
    Function to hide an error message.
    Paramaters:
    - string id: The target element id
    Returns:
    - none: Hides the error element if it exists
    */
    function hideError(id)
    {
        const element = document.getElementById(id)

        if (element)
        {
            element.classList.add("hidden")
        }
    }

    /*
    Function to set the loading state for submit buttons.
    Paramaters:
    - string buttonId: The button element id
    - boolean isBusy: True while the request is running
    Returns:
    - none: Updates button state and text
    */
    function setSubmitting(buttonId, isBusy)
    {
        const button = document.getElementById(buttonId)
        let idleLabel = "Create Account"

        if (!button)
        {
            return
        }

        if (buttonId === "loginSubmit")
        {
            idleLabel = "Log In"
        }

        button.disabled = isBusy

        if (isBusy)
        {
            button.textContent = "Please wait…"
        }
        else
        {
            button.textContent = idleLabel
        }
    }

    /*
    Function to handle user sign up.
    Paramaters:
    - none: Reads the signup form fields
    Returns:
    - Promise<void> none: Sends signup data to the backend
    */
    async function handleSignup()
    {
        hideError("signupError")

        const name = document.getElementById("signupName").value.trim()
        const email = document.getElementById("signupEmail").value.trim().toLowerCase()
        const password = document.getElementById("signupPassword").value

        if (!name)
        {
            showError("signupError", "Please enter your name.")
            return
        }

        if (!/\S+@\S+\.\S+/.test(email))
        {
            showError("signupError", "Please enter a valid email.")
            return
        }

        if (password.length < 6)
        {
            showError("signupError", "Password must be at least 6 characters.")
            return
        }

        setSubmitting("signupSubmit", true)

        try
        {
            const response = await fetch(`${API_BASE}/auth/register`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name, email: email, password: password })
            })
            const data = await response.json().catch(function()
            {
                return {}
            })

            if (!response.ok)
            {
                showError("signupError", extractErrorMessage(data, "Registration failed."))
                return
            }

            saveToken(data.token)
            saveSession(data.user)
            closeModal()
            updateHeaderButton()

            if (EMAIL_VERIFICATION_UI_ENABLED)
            {
                showVerificationReminder()
            }
        }
        catch
        {
            showError("signupError", "Could not reach the server. Is the backend running?")
        }
        finally
        {
            setSubmitting("signupSubmit", false)
        }
    }

    /*
    Function to handle user login.
    Paramaters:
    - none: Reads the login form fields
    Returns:
    - Promise<void> none: Sends login data to the backend
    */
    async function handleLogin()
    {
        hideError("loginError")

        const loginResendButton = document.getElementById("loginResendVerification")
        const email = document.getElementById("loginEmail").value.trim().toLowerCase()
        const password = document.getElementById("loginPassword").value

        if (loginResendButton)
        {
            loginResendButton.classList.add("hidden")
        }

        if (!email || !password)
        {
            showError("loginError", "Please fill in all fields.")
            return
        }

        setSubmitting("loginSubmit", true)

        try
        {
            const response = await fetch(`${API_BASE}/auth/login`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, password: password })
            })
            const data = await response.json().catch(function()
            {
                return {}
            })

            if (!response.ok)
            {
                const message = extractErrorMessage(data, "Login failed.")

                if (
                    EMAIL_VERIFICATION_UI_ENABLED
                    && data.detail
                    && data.detail.code === "EMAIL_NOT_VERIFIED"
                    && loginResendButton
                )
                {
                    loginResendButton.classList.remove("hidden")
                }

                showError("loginError", message)
                return
            }

            saveToken(data.token)
            saveSession(data.user)
            closeModal()
            updateHeaderButton()

            if (EMAIL_VERIFICATION_UI_ENABLED && data.needs_verification)
            {
                showVerificationReminder()
            }
        }
        catch
        {
            showError("loginError", "Could not reach the server. Is the backend running?")
        }
        finally
        {
            setSubmitting("loginSubmit", false)
        }
    }

    /*
    Function to show the email verification reminder toast.
    Paramaters:
    - none: Uses session data and sessionStorage
    Returns:
    - none: Shows a toast once per browser session
    */
    function showVerificationReminder()
    {
        const session = getSession()

        if (!EMAIL_VERIFICATION_UI_ENABLED)
        {
            return
        }

        if (session && session.verified)
        {
            return
        }

        if (sessionStorage.getItem("tc_verify_reminder"))
        {
            return
        }

        sessionStorage.setItem("tc_verify_reminder", "1")

        const toast = document.createElement("div")
        toast.className = "auth-toast"
        toast.innerHTML = `
            <svg viewBox="0 0 16 16" fill="none" style="width:16px;height:16px;flex-shrink:0">
                <circle cx="8" cy="8" r="7" stroke="#ffd166" stroke-width="1.3"/>
                <path d="M8 5v4" stroke="#ffd166" stroke-width="1.3" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="0.6" fill="#ffd166"/>
            </svg>
            <span>Check your inbox to verify your email address.</span>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#667;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 8px">×</button>
        `

        document.body.appendChild(toast)

        setTimeout(function()
        {
            toast.remove()
        }, 7000)
    }

    /*
    Function to open the user menu.
    Paramaters:
    - HTMLElement button: The button that opened the menu
    Returns:
    - none: Positions and shows the user menu
    */
    function openUserMenu(button)
    {
        const menu = document.getElementById("userMenu")
        const session = getSession()

        if (!menu)
        {
            return
        }

        document.getElementById("userMenuName").textContent = session ? session.name : ""
        document.getElementById("userMenuEmail").textContent = session ? session.email : ""

        const badge = document.getElementById("userMenuBadge")

        if (session && !session.verified)
        {
            badge.textContent = "Email not verified"
            badge.classList.remove("hidden")
        }
        else
        {
            badge.classList.add("hidden")
        }

        const settingsLink = document.getElementById("userMenuSettings")
        settingsLink.href = pagesUrl("settings.html")

        const rect = button.getBoundingClientRect()
        menu.style.top = (rect.bottom + window.scrollY + 8) + "px"
        menu.style.left = (rect.right + window.scrollX) + "px"

        menu.classList.remove("hidden")
        menu.classList.add("active")

        requestAnimationFrame(function()
        {
            const menuWidth = menu.offsetWidth
            let left = rect.right + window.scrollX - menuWidth

            if (left < 8)
            {
                left = 8
            }

            menu.style.left = left + "px"
        })
    }

    /*
    Function to close the user menu.
    Paramaters:
    - none: Uses the user menu element
    Returns:
    - none: Hides the menu
    */
    function closeUserMenu()
    {
        const menu = document.getElementById("userMenu")

        if (menu)
        {
            menu.classList.add("hidden")
            menu.classList.remove("active")
        }
    }

    /*
    Function to check if the user menu is open.
    Paramaters:
    - none: Uses the user menu element
    Returns:
    - boolean isOpen: True if the menu is visible
    */
    function isMenuOpen()
    {
        const menu = document.getElementById("userMenu")

        if (!menu)
        {
            return false
        }

        return !menu.classList.contains("hidden")
    }

    /*
    Function to log the user out.
    Paramaters:
    - none: Uses local session and token storage
    Returns:
    - none: Clears auth data and refreshes the header
    */
    function handleLogout()
    {
        closeUserMenu()
        clearToken()
        clearSession()
        updateHeaderButton()
    }

    /*
    Function to verify the saved session with the backend.
    Paramaters:
    - none: Uses the saved token and backend /auth/me endpoint
    Returns:
    - Promise<void> none: Refreshes session data if possible
    */
    async function verifySession()
    {
        const token = getToken()

        if (!token)
        {
            return
        }

        try
        {
            const response = await fetch(`${API_BASE}/auth/me`,
            {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!response.ok)
            {
                clearToken()
                clearSession()
            }
            else
            {
                const previousSession = getSession()
                const user = await response.json()
                saveSession(user)

                if (user.verified && previousSession && !previousSession.verified)
                {
                    sessionStorage.removeItem("tc_verify_reminder")
                    document.querySelectorAll(".auth-toast").forEach(function(toast)
                    {
                        toast.remove()
                    })
                }
            }
        }
        catch
        {
            /* Keep the cached session if the server is unreachable */
        }

        updateHeaderButton()
    }

    document.addEventListener("click", function(event)
    {
        const menu = document.getElementById("userMenu")
        const overlay = document.getElementById("authOverlay")

        if (event.target === overlay)
        {
            closeModal()
            return
        }

        const liveHeaderButton = document.querySelector("header .register-button")

        if (liveHeaderButton && (liveHeaderButton === event.target || liveHeaderButton.contains(event.target)))
        {
            if (getSession())
            {
                if (isMenuOpen())
                {
                    closeUserMenu()
                }
                else
                {
                    openUserMenu(liveHeaderButton)
                }
            }
            else
            {
                openModal()
            }

            return
        }

        const mobileLiveButton = document.getElementById("mobileLoginBtn")

        if (mobileLiveButton && (mobileLiveButton === event.target || mobileLiveButton.contains(event.target)))
        {
            const drawer = document.getElementById("mobileNavDrawer")
            const hamburger = document.getElementById("navHamburger")

            if (drawer)
            {
                drawer.classList.remove("open")
            }

            if (hamburger)
            {
                hamburger.classList.remove("open")
            }

            if (getSession())
            {
                if (isMenuOpen())
                {
                    closeUserMenu()
                }
                else
                {
                    openUserMenu(mobileLiveButton)
                }
            }
            else
            {
                openModal()
            }

            return
        }

        if (event.target && event.target.closest("#userMenuLogout"))
        {
            handleLogout()
            return
        }

        if (isMenuOpen() && menu && !menu.contains(event.target))
        {
            closeUserMenu()
        }
    })

    /*
    Function to resend a verification email from the login tab.
    Paramaters:
    - none: Reads the email field from the login form
    Returns:
    - Promise<void> none: Calls the resend endpoint when enabled
    */
    async function handleResendVerificationFromLogin()
    {
        if (!EMAIL_VERIFICATION_UI_ENABLED)
        {
            showError("loginError", "Email verification is currently unavailable.")
            return
        }

        hideError("loginError")

        const email = document.getElementById("loginEmail").value.trim().toLowerCase()

        if (!/\S+@\S+\.\S+/.test(email))
        {
            showError("loginError", "Enter your email first, then resend the verification link.")
            return
        }

        const button = document.getElementById("loginResendVerification")

        if (!button)
        {
            return
        }

        button.disabled = true
        button.textContent = "Sending…"

        try
        {
            const response = await fetch(`${API_BASE}/auth/resend-verification-public`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email })
            })
            const data = await response.json().catch(function()
            {
                return {}
            })

            if (!response.ok)
            {
                showError("loginError", extractErrorMessage(data, "Could not resend the verification email."))
                return
            }

            showError("loginError", data.message || "If that account exists and is unverified, a new email is on its way.")
        }
        catch
        {
            showError("loginError", "Could not reach the server. Is the backend running?")
        }
        finally
        {
            button.disabled = false
            button.textContent = "Resend verification email"
        }
    }

    document.getElementById("authClose").addEventListener("click", closeModal)

    document.querySelectorAll(".auth-tab").forEach(function(button)
    {
        button.addEventListener("click", function()
        {
            switchTab(button.dataset.authTab)
        })
    })

    document.getElementById("loginSubmit").addEventListener("click", handleLogin)

    const loginResendVerificationButton = document.getElementById("loginResendVerification")

    if (EMAIL_VERIFICATION_UI_ENABLED && loginResendVerificationButton)
    {
        loginResendVerificationButton.addEventListener("click", handleResendVerificationFromLogin)
    }

    document.getElementById("signupSubmit").addEventListener("click", handleSignup)

    document.getElementById("loginPassword").addEventListener("keydown", function(event)
    {
        if (event.key === "Enter")
        {
            handleLogin()
        }
    })

    document.getElementById("signupPassword").addEventListener("keydown", function(event)
    {
        if (event.key === "Enter")
        {
            handleSignup()
        }
    })

    document.addEventListener("keydown", function(event)
    {
        if (event.key === "Escape")
        {
            closeModal()
            closeUserMenu()
        }
    })

    updateHeaderButton()
    verifySession()
})()
