const API_BASE = "https://trustcheck-ai.onrender.com"
const EMAIL_VERIFICATION_UI_ENABLED = false
const token = (window.TC_AUTH && window.TC_AUTH.getToken()) || localStorage.getItem("tc_token")
const session = JSON.parse(localStorage.getItem("tc_session") || "null")
let verifyPollTimer = null
let bookmarksLoaded = false

/*
Function to set the current year in the footer.
Paramaters:
- none: Uses the #year element from the page
Returns:
- none: Updates the footer text
*/
function setFooterYear()
{
    const yearElement = document.getElementById("year")

    if (!yearElement)
    {
        return
    }

    yearElement.textContent = new Date().getFullYear()
}

setFooterYear()

if (!token || !session)
{
    window.location.href = "index.html"
}

/*
Function to fill the Settings page with user data.
Paramaters:
- object user: The latest user data from the backend or storage
Returns:
- none: Updates the page fields and verification section
*/
function populatePage(user)
{
    const name = user.name || session.name || ""
    const email = user.email || session.email || ""
    let verified = session.verified

    if (user.verified !== undefined)
    {
        verified = user.verified
    }

    const initials = name
        .split(" ")
        .map(function(word)
        {
            return word[0]
        })
        .join("")
        .toUpperCase()
        .slice(0, 2)

    const avatar = document.getElementById("settingsAvatar")
    const verificationStatus = document.getElementById("verificationStatus")
    const resendButton = document.getElementById("resendVerificationBtn")
    const verificationSubText = document.querySelector("#section-verification .settings-section__sub")

    avatar.textContent = initials
    document.getElementById("settingsEmail").textContent = email
    document.getElementById("settingsName").value = name

    if (resendButton)
    {
        resendButton.classList.remove("hidden")
        resendButton.disabled = true
        resendButton.setAttribute("aria-disabled", "true")
        resendButton.title = "Email verification is currently unavailable."
    }

    if (!EMAIL_VERIFICATION_UI_ENABLED)
    {
        if (verificationSubText)
        {
            verificationSubText.textContent = "Verification email sending is currently disabled."
        }

        if (verified)
        {
            verificationStatus.innerHTML = `
                <div class="verify-badge verify-badge--ok">
                    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#39d98a" stroke-width="1.3"/>
                    <path d="M5 8l2 2 4-4" stroke="#39d98a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    Email verified
                </div>`
        }
        else
        {
            verificationStatus.innerHTML = `
                <div class="verify-badge verify-badge--warn">
                    <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#ffd166" stroke-width="1.3"/>
                    <path d="M8 5v4" stroke="#ffd166" stroke-width="1.3" stroke-linecap="round"/>
                    <circle cx="8" cy="11" r="0.6" fill="#ffd166"/></svg>
                    Email not verified
                </div>
                <p class="verify-hint">Verification emails are temporarily unavailable, so resend actions have been disabled.</p>`
        }

        return
    }

    if (verified)
    {
        verificationStatus.innerHTML = `
            <div class="verify-badge verify-badge--ok">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#39d98a" stroke-width="1.3"/>
                <path d="M5 8l2 2 4-4" stroke="#39d98a" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Email verified
            </div>`
    }
    else
    {
        verificationStatus.innerHTML = `
            <div class="verify-badge verify-badge--warn">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#ffd166" stroke-width="1.3"/>
                <path d="M8 5v4" stroke="#ffd166" stroke-width="1.3" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="0.6" fill="#ffd166"/></svg>
                Email not verified
            </div>
            <p class="verify-hint">Check your inbox for a verification email, or request a new one below.</p>`

        if (resendButton)
        {
            resendButton.classList.remove("hidden")
            resendButton.disabled = false
            resendButton.removeAttribute("aria-disabled")
            resendButton.title = ""
        }
    }
}

/*
Function to load the freshest user data.
Paramaters:
- none: Uses the saved token and backend API
Returns:
- Promise<void> none: Populates the page with fresh data or fallback data
*/
async function fetchFreshUserData()
{
    try
    {
        const response = await fetch(`${API_BASE}/auth/me`,
        {
            headers:
            {
                Authorization: `Bearer ${token}`
            }
        })

        if (!response.ok)
        {
            window.location.href = "index.html"
            return
        }

        const user = await response.json()
        populatePage(user)
    }
    catch
    {
        populatePage(session)
    }
}

fetchFreshUserData()

/*
Function to clear all feedback messages in Settings.
Paramaters:
- none: Uses the three message elements on the page
Returns:
- none: Hides and clears the messages
*/
function clearMsgs()
{
    ["profileMsg", "securityMsg", "verificationMsg"].forEach(function(id)
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
Function to show a feedback message.
Paramaters:
- string id: The target message element id
- string text: The text to show
- boolean isError: True for an error style, false for success
Returns:
- none: Updates the message element
*/
function showMsg(id, text, isError)
{
    const element = document.getElementById(id)

    if (!element)
    {
        return
    }

    element.textContent = text

    if (isError)
    {
        element.className = "settings-msg settings-msg--error"
    }
    else
    {
        element.className = "settings-msg settings-msg--ok"
    }
}

/*
Function to extract the best error message from a backend response.
Paramaters:
- object data: The parsed backend response
- string fallback: A default message
Returns:
- string message: The message that should be shown
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
Function to set a button busy state.
Paramaters:
- string buttonId: The button element id
- boolean isBusy: True while the action is running
- string label: The normal label for the button
Returns:
- none: Updates button text and disabled state
*/
function setBusy(buttonId, isBusy, label)
{
    const button = document.getElementById(buttonId)

    if (!button)
    {
        return
    }

    button.disabled = isBusy

    if (isBusy)
    {
        button.textContent = "Saving…"
    }
    else
    {
        button.textContent = label
    }
}

/*
Function to start polling for email verification.
Paramaters:
- none: Uses the backend /auth/me endpoint and saved session
Returns:
- none: Starts one polling timer if needed
*/
function startVerifyPoll()
{
    if (verifyPollTimer)
    {
        return
    }

    verifyPollTimer = setInterval(async function ()
    {
        try
        {
            const response = await fetch(`${API_BASE}/auth/me`,
            {
                headers:
                {
                    Authorization: `Bearer ${token}`
                }
            })

            if (!response.ok)
            {
                return
            }

            const user = await response.json()

            if (user.verified)
            {
                clearInterval(verifyPollTimer)
                verifyPollTimer = null

                const savedSession = JSON.parse(localStorage.getItem("tc_session") || "null")

                if (savedSession)
                {
                    savedSession.verified = true
                    localStorage.setItem("tc_session", JSON.stringify(savedSession))
                }

                populatePage(user)
                showMsg("verificationMsg", "Your email has been verified! ✓", false)
            }
        }
        catch
        {
            /* Ignore temporary polling errors */
        }
    }, 4000)
}

/*
Function to load the saved bookmarks for the Settings page.
Paramaters:
- none: Uses the backend bookmarks endpoint
Returns:
- Promise<void> none: Renders bookmark cards into the page
*/
async function loadBookmarks()
{
    if (bookmarksLoaded)
    {
        return
    }

    const loadingElement = document.getElementById("bookmarksLoading")
    const emptyElement = document.getElementById("bookmarksEmpty")
    const listElement = document.getElementById("bookmarksList")
    const messageElement = document.getElementById("bookmarksMsg")

    try
    {
        const response = await fetch(`${API_BASE}/v1/bookmarks`,
        {
            headers:
            {
                Authorization: `Bearer ${token}`
            }
        })

        if (!response.ok)
        {
            throw new Error("Failed to load bookmarks.")
        }

        const bookmarks = await response.json()
        loadingElement.classList.add("hidden")

        if (!bookmarks.length)
        {
            emptyElement.classList.remove("hidden")
            return
        }

        bookmarks.forEach(function(bookmark)
        {
            const score = Number(bookmark.score ?? 0)
            let scoreClass = "bm-card__score--low"

            if (score >= 70)
            {
                scoreClass = "bm-card__score--high"
            }
            else if (score >= 40)
            {
                scoreClass = "bm-card__score--mid"
            }

            let dateMarkup = ""

            if (bookmark.created_at)
            {
                const date = new Date(bookmark.created_at).toLocaleDateString(undefined,
                {
                    dateStyle: "medium"
                })
                dateMarkup = `<div class="bm-card__date">${date}</div>`
            }

            const card = document.createElement("div")
            card.className = "bm-card"
            card.innerHTML = `
                <div class="bm-card__left">
                    <div class="bm-card__platform">${bookmark.platform || "—"}</div>
                    <div class="bm-card__text">${bookmark.summary || bookmark.ad_text || "No preview"}</div>
                    <div class="bm-card__meta">
                        <span class="bm-card__score ${scoreClass}">${score}/100</span>
                        <span class="bm-card__verdict">${bookmark.verdict || ""}</span>
                    </div>
                    ${dateMarkup}
                </div>
                <button class="bm-card__remove" title="Remove bookmark" data-id="${bookmark.analysis_id}">
                    <svg viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                </button>`
            listElement.appendChild(card)
        })

        listElement.addEventListener("click", async function (event)
        {
            const button = event.target.closest(".bm-card__remove")

            if (!button)
            {
                return
            }

            const id = button.dataset.id

            try
            {
                await fetch(`${API_BASE}/v1/bookmarks/${id}`,
                {
                    method: "DELETE",
                    headers:
                    {
                        Authorization: `Bearer ${token}`
                    }
                })

                button.closest(".bm-card").remove()

                if (!listElement.querySelector(".bm-card"))
                {
                    emptyElement.classList.remove("hidden")
                }
            }
            catch
            {
                alert("Could not remove bookmark.")
            }
        })

        bookmarksLoaded = true
    }
    catch (error)
    {
        loadingElement.classList.add("hidden")
        messageElement.textContent = error.message || "Could not load bookmarks."
        messageElement.className = "settings-msg settings-msg--error"
    }
}

document.querySelectorAll(".settings-nav__item").forEach(function(button)
{
    button.addEventListener("click", function ()
    {
        document.querySelectorAll(".settings-nav__item").forEach(function(otherButton)
        {
            otherButton.classList.remove("settings-nav__item--active")
        })

        document.querySelectorAll(".settings-section").forEach(function(section)
        {
            section.classList.remove("active")
        })

        button.classList.add("settings-nav__item--active")
        document.getElementById("section-" + button.dataset.section).classList.add("active")
        clearMsgs()
    })
})

document.getElementById("saveProfileBtn").addEventListener("click", async function ()
{
    const name = document.getElementById("settingsName").value.trim()

    if (!name)
    {
        showMsg("profileMsg", "Name cannot be empty.", true)
        return
    }

    setBusy("saveProfileBtn", true, "Save Changes")

    try
    {
        const response = await fetch(`${API_BASE}/auth/settings`,
        {
            method: "PUT",
            headers:
            {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name: name })
        })
        const data = await response.json()

        if (!response.ok)
        {
            showMsg("profileMsg", extractErrorMessage(data, "Update failed."), true)
            return
        }

        const savedSession = JSON.parse(localStorage.getItem("tc_session") || "null")

        if (savedSession)
        {
            savedSession.name = data.name
            localStorage.setItem("tc_session", JSON.stringify(savedSession))
        }

        populatePage(data)
        showMsg("profileMsg", "Name updated successfully.", false)
    }
    catch
    {
        showMsg("profileMsg", "Could not reach the server.", true)
    }
    finally
    {
        setBusy("saveProfileBtn", false, "Save Changes")
    }
})

document.getElementById("savePasswordBtn").addEventListener("click", async function ()
{
    const currentPassword = document.getElementById("currentPassword").value
    const newPassword = document.getElementById("newPassword").value
    const confirmPassword = document.getElementById("confirmPassword").value

    if (!currentPassword || !newPassword || !confirmPassword)
    {
        showMsg("securityMsg", "Please fill in all fields.", true)
        return
    }

    if (newPassword.length < 6)
    {
        showMsg("securityMsg", "New password must be at least 6 characters.", true)
        return
    }

    if (newPassword !== confirmPassword)
    {
        showMsg("securityMsg", "Passwords do not match.", true)
        return
    }

    setBusy("savePasswordBtn", true, "Update Password")

    try
    {
        const response = await fetch(`${API_BASE}/auth/settings`,
        {
            method: "PUT",
            headers:
            {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(
            {
                current_password: currentPassword,
                new_password: newPassword
            })
        })
        const data = await response.json()

        if (!response.ok)
        {
            showMsg("securityMsg", extractErrorMessage(data, "Update failed."), true)
            return
        }

        document.getElementById("currentPassword").value = ""
        document.getElementById("newPassword").value = ""
        document.getElementById("confirmPassword").value = ""
        showMsg("securityMsg", "Password updated successfully.", false)
    }
    catch
    {
        showMsg("securityMsg", "Could not reach the server.", true)
    }
    finally
    {
        setBusy("savePasswordBtn", false, "Update Password")
    }
})

const resendVerificationButton = document.getElementById("resendVerificationBtn")

if (resendVerificationButton)
{
    if (!EMAIL_VERIFICATION_UI_ENABLED)
    {
        resendVerificationButton.disabled = true
        resendVerificationButton.classList.remove("hidden")
        resendVerificationButton.setAttribute("aria-disabled", "true")
        resendVerificationButton.title = "Email verification is currently unavailable."
    }
    else
    {
        resendVerificationButton.addEventListener("click", async function ()
        {
            setBusy("resendVerificationBtn", true, "Resend Verification Email")

            try
            {
                const response = await fetch(`${API_BASE}/auth/resend-verification`,
                {
                    method: "POST",
                    headers:
                    {
                        Authorization: `Bearer ${token}`
                    }
                })
                const data = await response.json()

                if (!response.ok)
                {
                    showMsg("verificationMsg", extractErrorMessage(data, "Failed to send."), true)
                    return
                }

                showMsg("verificationMsg", "Verification email sent! Check your inbox — this page will update automatically when verified.", false)
                startVerifyPoll()
            }
            catch
            {
                showMsg("verificationMsg", "Could not reach the server.", true)
            }
            finally
            {
                setBusy("resendVerificationBtn", false, "Resend Verification Email")
            }
        })
    }
}

document.querySelectorAll(".settings-nav__item").forEach(function(button)
{
    button.addEventListener("click", function ()
    {
        if (button.dataset.section === "bookmarks")
        {
            loadBookmarks()
        }

        if (button.dataset.section === "verification")
        {
            const savedSession = JSON.parse(localStorage.getItem("tc_session") || "null")

            if (savedSession && !savedSession.verified)
            {
                startVerifyPoll()
            }
        }
    })
})
