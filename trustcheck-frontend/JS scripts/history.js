document.addEventListener("DOMContentLoaded", function ()
{
    const API_BASE = "https://trustcheck-ai.onrender.com"
    const BOOKMARKS_ENDPOINT = `${API_BASE}/v1/bookmarks`

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

    let currentSort = "newest"
    let currentFilter = "all"
    let allEntries = []
    let allBookmarks = []
    let activeTab = "history"
    let bookmarkPlatformFilter = "all"
    let bookmarkVerdictFilter = "all"

    const wrapper = document.querySelector(".history-wrapper")
    const placeholder = document.querySelector(".placeholder-box")
    const toolbar = document.getElementById("historyToolbar")
    const historyTabs = document.getElementById("historyTabs")
    const platformFilter = document.getElementById("platformFilter")
    const sortButtons = document.querySelectorAll(".sort-btn")
    const bookmarksWrapper = document.getElementById("bookmarksWrapper")
    const bookmarksToolbar = document.getElementById("bookmarksToolbar")
    const bookmarksEmpty = document.getElementById("bookmarksEmpty")
    const historyCountElement = document.getElementById("historyCount")
    const bookmarksCountElement = document.getElementById("bookmarksCount")

    /*
    Function to get the saved auth token.
    Paramaters:
    - none: Reads the token from auth helpers or localStorage
    Returns:
    - string|null token: The saved token or null
    */
    function getToken()
    {
        if (window.TC_AUTH && window.TC_AUTH.getToken())
        {
            return window.TC_AUTH.getToken()
        }

        return localStorage.getItem("tc_token") || null
    }

    /*
    Function to load analysis history entries.
    Paramaters:
    - none: Uses the backend API and localStorage fallback
    Returns:
    - Promise<Array> entries: A list of history entries
    */
    async function loadEntries()
    {
        const token = getToken()

        if (token)
        {
            try
            {
                const response = await fetch(`${API_BASE}/v1/history`,
                {
                    headers:
                    {
                        Authorization: `Bearer ${token}`
                    }
                })

                if (response.ok)
                {
                    const data = await response.json()

                    return data.map(function(entry)
                    {
                        return {
                            timestamp: entry.created_at,
                            description: entry.ad_text,
                            platform: entry.platform,
                            score: entry.score,
                            verdict: entry.verdict,
                            textViolations: entry.text_violations || [],
                            imageViolations: entry.image_violations || [],
                            textSuggestions: entry.text_suggestions || [],
                            imageSuggestions: entry.image_suggestions || [],
                            _backendId: entry.id,
                            _fromServer: true
                        }
                    })
                }
            }
            catch (error)
            {
                console.warn("Could not fetch server history, falling back to localStorage", error)
            }
        }

        return JSON.parse(localStorage.getItem("adHistory") || "[]")
    }

    /*
    Function to load bookmarks for the logged-in user.
    Paramaters:
    - none: Uses the backend bookmarks endpoint
    Returns:
    - Promise<Array> bookmarks: A list of bookmarks
    */
    async function loadBookmarks()
    {
        const token = getToken()

        if (!token)
        {
            return []
        }

        try
        {
            const response = await fetch(BOOKMARKS_ENDPOINT,
            {
                headers:
                {
                    Authorization: `Bearer ${token}`
                }
            })

            if (response.ok)
            {
                return await response.json()
            }
        }
        catch
        {
            /* Ignore bookmark loading errors here */
        }

        return []
    }

    /*
    Function to sort history entries.
    Paramaters:
    - Array entries: The entries to sort
    - string mode: The selected sort mode
    Returns:
    - Array sortedEntries: A sorted copy of the entries
    */
    function sortEntries(entries, mode)
    {
        const copy = [...entries]

        switch (mode)
        {
            case "oldest":
                return copy.reverse()

            case "score-high":
                return copy.sort(function(a, b)
                {
                    return b.score - a.score
                })

            case "score-low":
                return copy.sort(function(a, b)
                {
                    return a.score - b.score
                })

            default:
                return copy
        }
    }

    /*
    Function to filter history entries by platform.
    Paramaters:
    - Array entries: The full history list
    - string platform: The selected platform filter
    Returns:
    - Array filteredEntries: The matching entries
    */
    function filterEntries(entries, platform)
    {
        if (platform === "all")
        {
            return entries
        }

        return entries.filter(function(entry)
        {
            return (entry.platform || "").toLowerCase() === platform
        })
    }

    /*
    Function to filter bookmarks by the active bookmark filters.
    Paramaters:
    - Array bookmarks: The full bookmark list
    Returns:
    - Array filteredBookmarks: The matching bookmarks
    */
    function filterBookmarks(bookmarks)
    {
        return bookmarks.filter(function(bookmark)
        {
            const platformMatches = bookmarkPlatformFilter === "all"
                || (bookmark.platform || "").toLowerCase() === bookmarkPlatformFilter
            const verdictMatches = bookmarkVerdictFilter === "all"
                || (bookmark.verdict || "").toLowerCase().includes(bookmarkVerdictFilter)

            return platformMatches && verdictMatches
        })
    }

    /*
    Function to choose the verdict CSS class.
    Paramaters:
    - string verdict: The verdict text
    Returns:
    - string className: The CSS class for the verdict badge
    */
    function verdictClass(verdict)
    {
        const loweredVerdict = (verdict || "").toLowerCase()

        if (loweredVerdict.includes("safe") && !loweredVerdict.includes("border"))
        {
            return "verdict--safe"
        }

        if (loweredVerdict.includes("border"))
        {
            return "verdict--borderline"
        }

        return "verdict--risky"
    }

    /*
    Function to build the score color.
    Paramaters:
    - number score: The entry score from 0 to 100
    Returns:
    - string color: The HSL color for the score ring
    */
    function scoreColor(score)
    {
        return `hsl(${Math.round((score / 100) * 120)}, 85%, 55%)`
    }

    /*
    Function to build list markup for card details.
    Paramaters:
    - Array items: The detail items to show
    Returns:
    - string markup: The HTML list items markup
    */
    function buildListMarkup(items)
    {
        if (!Array.isArray(items) || items.length === 0)
        {
            return "<li class='none'>None</li>"
        }

        return items.map(function(item)
        {
            return `<li>${item}</li>`
        }).join("")
    }

    /*
    Function to build a history card element.
    Paramaters:
    - object entry: The history entry to display
    Returns:
    - HTMLElement card: The finished history card
    */
    function buildCard(entry)
    {
        let date = "—"

        if (entry.timestamp)
        {
            date = new Date(entry.timestamp).toLocaleString(undefined,
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            })
        }

        const platform = entry.platform || "unknown"
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1)
        const ringCircumference = 125.66
        const offset = ringCircumference - (Math.min(100, Math.max(0, entry.score)) / 100) * ringCircumference
        const safeDescription = (entry.description || "").replace(/"/g, "&quot;")
        const deleteButtonMarkup = entry._fromServer
            ? `<button class="hcard__delete-btn" title="Delete this entry" data-id="${entry._backendId}">
                    <svg viewBox="0 0 14 14" fill="none"><path d="M2 3h10M5 3V2h4v1M6 6v5M8 6v5M3 3l1 9h6l1-9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
               </button>`
            : ""

        const card = document.createElement("div")
        card.className = "history-card"
        card.dataset.platform = platform.toLowerCase()
        card.innerHTML = `
            <div class="hcard__header">
                <div class="hcard__meta">
                    <span class="hcard__platform">${platformLabel}</span>
                    <span class="hcard__date">${date}</span>
                </div>
                <div class="hcard__header-right">
                    <span class="hcard__verdict ${verdictClass(entry.verdict)}">${entry.verdict || "—"}</span>
                    <button class="hcard__rerun-btn" title="Re-run this analysis" data-text="${safeDescription}" data-platform="${platform.toLowerCase()}">
                        <svg viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.38-3.62" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polyline points="12.5,1.5 12.5,5 9,5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    ${deleteButtonMarkup}
                </div>
            </div>
            <div class="hcard__score-row">
                <div class="hcard__score-ring">
                    <svg viewBox="0 0 48 48" style="transform:rotate(-90deg);width:48px;height:48px;">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
                        <circle cx="24" cy="24" r="20" fill="none"
                            stroke="${scoreColor(entry.score)}" stroke-width="5"
                            stroke-linecap="round"
                            stroke-dasharray="${ringCircumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <span class="hring-num">${entry.score}</span>
                </div>
                <p class="hcard__desc">${entry.description || "—"}</p>
            </div>
            <details class="hcard__details">
                <summary>View details</summary>
                <div class="hcard__detail-grid">
                    <div>
                        <p class="hcard__detail-heading">Text Violations</p>
                        <ul class="hcard__list hcard__list--violation">${buildListMarkup(entry.textViolations)}</ul>
                    </div>
                    <div>
                        <p class="hcard__detail-heading">Image Violations</p>
                        <ul class="hcard__list hcard__list--violation">${buildListMarkup(entry.imageViolations)}</ul>
                    </div>
                    <div>
                        <p class="hcard__detail-heading">Text Suggestions</p>
                        <ul class="hcard__list hcard__list--suggestion">${buildListMarkup(entry.textSuggestions)}</ul>
                    </div>
                    <div>
                        <p class="hcard__detail-heading">Image Suggestions</p>
                        <ul class="hcard__list hcard__list--suggestion">${buildListMarkup(entry.imageSuggestions)}</ul>
                    </div>
                </div>
            </details>
        `

        const rerunButton = card.querySelector(".hcard__rerun-btn")

        if (rerunButton)
        {
            rerunButton.addEventListener("click", function ()
            {
                const text = rerunButton.dataset.text || ""
                const rerunPlatform = rerunButton.dataset.platform || ""

                sessionStorage.setItem("tc_rerun", JSON.stringify(
                {
                    text: text,
                    platform: rerunPlatform
                }))
                window.location.href = "index.html"
            })
        }

        const deleteButton = card.querySelector(".hcard__delete-btn")

        if (deleteButton)
        {
            deleteButton.addEventListener("click", async function ()
            {
                if (!confirm("Delete this analysis?"))
                {
                    return
                }

                const id = deleteButton.dataset.id
                const token = getToken()

                try
                {
                    await fetch(`${API_BASE}/v1/history/${id}`,
                    {
                        method: "DELETE",
                        headers:
                        {
                            Authorization: `Bearer ${token}`
                        }
                    })

                    allEntries = allEntries.filter(function(savedEntry)
                    {
                        return savedEntry._backendId !== id
                    })

                    if (historyCountElement)
                    {
                        historyCountElement.textContent = allEntries.length
                    }

                    render()

                    if (allEntries.length === 0)
                    {
                        showEmpty()
                    }
                }
                catch
                {
                    alert("Could not delete entry. Try again.")
                }
            })
        }

        return card
    }

    /*
    Function to build a bookmark card element.
    Paramaters:
    - object bookmark: The bookmark to display
    Returns:
    - HTMLElement card: The finished bookmark card
    */
    function buildBookmarkCard(bookmark)
    {
        let date = "—"

        if (bookmark.created_at)
        {
            date = new Date(bookmark.created_at).toLocaleString(undefined,
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            })
        }

        const platform = bookmark.platform || "unknown"
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1)
        const ringCircumference = 125.66
        const offset = ringCircumference - (Math.min(100, Math.max(0, bookmark.score)) / 100) * ringCircumference
        const safeText = (bookmark.ad_text || "").replace(/"/g, "&quot;")
        let summaryMarkup = ""

        if (bookmark.summary)
        {
            summaryMarkup = `<p class="hcard__summary">${bookmark.summary}</p>`
        }

        const card = document.createElement("div")
        card.className = "history-card bookmark-card"
        card.dataset.platform = platform.toLowerCase()
        card.innerHTML = `
            <div class="hcard__header">
                <div class="hcard__meta">
                    <span class="hcard__platform">${platformLabel}</span>
                    <span class="hcard__date">${date}</span>
                </div>
                <div class="hcard__header-right">
                    <span class="hcard__verdict ${verdictClass(bookmark.verdict)}">${bookmark.verdict || "—"}</span>
                    <button class="hcard__rerun-btn bm-rerun-btn" title="Re-run this ad"
                        data-text="${safeText}"
                        data-platform="${platform.toLowerCase()}">
                        <svg viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.38-3.62" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polyline points="12.5,1.5 12.5,5 9,5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="hcard__delete-btn bm-remove-btn" title="Remove bookmark"
                        data-analysis-id="${bookmark.analysis_id}">
                        <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v11l-6-3-6 3V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    </button>
                </div>
            </div>
            <div class="hcard__score-row">
                <div class="hcard__score-ring">
                    <svg viewBox="0 0 48 48" style="transform:rotate(-90deg);width:48px;height:48px;">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
                        <circle cx="24" cy="24" r="20" fill="none"
                            stroke="${scoreColor(bookmark.score)}" stroke-width="5"
                            stroke-linecap="round"
                            stroke-dasharray="${ringCircumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <span class="hring-num">${bookmark.score}</span>
                </div>
                <div class="hcard__desc-col">
                    <p class="hcard__desc">${bookmark.ad_text || "—"}</p>
                    ${summaryMarkup}
                </div>
            </div>
        `

        card.querySelector(".bm-rerun-btn").addEventListener("click", function ()
        {
            sessionStorage.setItem("tc_rerun", JSON.stringify(
            {
                text: bookmark.ad_text || "",
                platform: platform.toLowerCase()
            }))
            window.location.href = "index.html"
        })

        card.querySelector(".bm-remove-btn").addEventListener("click", async function ()
        {
            if (!confirm("Remove this bookmark?"))
            {
                return
            }

            const token = getToken()

            try
            {
                await fetch(`${BOOKMARKS_ENDPOINT}/${bookmark.analysis_id}`,
                {
                    method: "DELETE",
                    headers:
                    {
                        Authorization: `Bearer ${token}`
                    }
                })

                allBookmarks = allBookmarks.filter(function(savedBookmark)
                {
                    return savedBookmark.analysis_id !== bookmark.analysis_id
                })

                if (bookmarksCountElement)
                {
                    bookmarksCountElement.textContent = allBookmarks.length
                }

                renderBookmarks()
            }
            catch
            {
                alert("Could not remove bookmark. Try again.")
            }
        })

        return card
    }

    /*
    Function to render the history list.
    Paramaters:
    - none: Uses the current history state and filters
    Returns:
    - none: Rebuilds the history cards in the page
    */
    function render()
    {
        wrapper.querySelectorAll(".history-card, .no-results-msg").forEach(function(element)
        {
            element.remove()
        })

        const filteredEntries = filterEntries(allEntries, currentFilter)
        const sortedEntries = sortEntries(filteredEntries, currentSort)

        if (sortedEntries.length === 0)
        {
            const message = document.createElement("p")
            message.className = "no-results-msg"

            if (allEntries.length > 0)
            {
                message.textContent = "No results match this filter."
            }
            else
            {
                message.textContent = "No history yet."
            }

            wrapper.appendChild(message)
            return
        }

        sortedEntries.forEach(function(entry)
        {
            wrapper.appendChild(buildCard(entry))
        })
    }

    /*
    Function to render the bookmark list.
    Paramaters:
    - none: Uses the current bookmark state and filters
    Returns:
    - none: Rebuilds the bookmark cards in the page
    */
    function renderBookmarks()
    {
        bookmarksWrapper.querySelectorAll(".bookmark-card, .no-results-msg").forEach(function(element)
        {
            element.remove()
        })

        const filteredBookmarks = filterBookmarks(allBookmarks)

        if (filteredBookmarks.length === 0)
        {
            bookmarksEmpty.style.display = ""
            return
        }

        bookmarksEmpty.style.display = "none"

        const sortedBookmarks = [...filteredBookmarks].sort(function(a, b)
        {
            return new Date(b.created_at) - new Date(a.created_at)
        })

        sortedBookmarks.forEach(function(bookmark)
        {
            bookmarksWrapper.appendChild(buildBookmarkCard(bookmark))
        })
    }

    /*
    Function to switch between the History and Bookmarks tabs.
    Paramaters:
    - string tab: The tab name to open
    Returns:
    - none: Updates visible sections and controls
    */
    function switchTab(tab)
    {
        activeTab = tab

        document.querySelectorAll(".htab").forEach(function(button)
        {
            button.classList.toggle("htab--active", button.dataset.tab === tab)
        })

        if (tab === "history")
        {
            wrapper.style.display = ""

            if (allEntries.length > 0)
            {
                toolbar.style.display = "block"
            }
            else
            {
                toolbar.style.display = "none"
            }

            bookmarksWrapper.style.display = "none"
            bookmarksToolbar.style.display = "none"
        }
        else
        {
            wrapper.style.display = "none"
            toolbar.style.display = "none"
            bookmarksWrapper.style.display = ""

            if (allBookmarks.length > 0)
            {
                bookmarksToolbar.style.display = "block"
            }
            else
            {
                bookmarksToolbar.style.display = "none"
            }

            renderBookmarks()
        }
    }

    /*
    Function to show the empty history placeholder.
    Paramaters:
    - none: Uses the history wrapper and placeholder element
    Returns:
    - none: Restores the empty state layout
    */
    function showEmpty()
    {
        toolbar.style.display = "none"

        wrapper.querySelectorAll(".history-card, .no-results-msg").forEach(function(element)
        {
            element.remove()
        })

        if (placeholder)
        {
            wrapper.insertBefore(placeholder, wrapper.firstChild)
        }
    }

    /*
    Function to clear all history entries.
    Paramaters:
    - none: Uses the backend API and local storage
    Returns:
    - Promise<void> none: Deletes history and reloads the page
    */
    async function clearAll()
    {
        const token = getToken()

        if (token)
        {
            try
            {
                await fetch(`${API_BASE}/v1/history`,
                {
                    method: "DELETE",
                    headers:
                    {
                        Authorization: `Bearer ${token}`
                    }
                })
            }
            catch
            {
                /* Ignore server clear errors here */
            }
        }

        localStorage.removeItem("adHistory")
        location.reload()
    }

    /*
    Function to clear all bookmarks.
    Paramaters:
    - none: Uses the backend bookmarks endpoint
    Returns:
    - Promise<void> none: Removes all saved bookmarks
    */
    async function clearAllBookmarks()
    {
        const token = getToken()

        if (!token)
        {
            return
        }

        for (const bookmark of allBookmarks)
        {
            try
            {
                await fetch(`${BOOKMARKS_ENDPOINT}/${bookmark.analysis_id}`,
                {
                    method: "DELETE",
                    headers:
                    {
                        Authorization: `Bearer ${token}`
                    }
                })
            }
            catch
            {
                /* Ignore individual bookmark delete errors here */
            }
        }

        allBookmarks = []

        if (bookmarksCountElement)
        {
            bookmarksCountElement.textContent = 0
        }

        bookmarksToolbar.style.display = "none"
        renderBookmarks()
    }

    /*
    Function to start the page.
    Paramaters:
    - none: Loads history, bookmarks, and event handlers
    Returns:
    - Promise<void> none: Prepares the page UI
    */
    async function initializePage()
    {
        const loadedData = await Promise.all([loadEntries(), loadBookmarks()])
        const entries = loadedData[0]
        const bookmarks = loadedData[1]

        allEntries = entries
        allBookmarks = bookmarks

        const hasHistory = allEntries.length > 0
        const token = getToken()

        if (token)
        {
            historyTabs.style.display = "flex"
        }

        if (historyCountElement)
        {
            historyCountElement.textContent = allEntries.length
        }

        if (bookmarksCountElement)
        {
            bookmarksCountElement.textContent = allBookmarks.length
        }

        if (hasHistory)
        {
            if (placeholder)
            {
                placeholder.remove()
            }

            toolbar.style.display = "block"
            render()
        }

        document.querySelectorAll(".htab").forEach(function(button)
        {
            button.addEventListener("click", function ()
            {
                switchTab(button.dataset.tab)
            })
        })

        sortButtons.forEach(function(button)
        {
            button.addEventListener("click", function ()
            {
                sortButtons.forEach(function(otherButton)
                {
                    otherButton.classList.remove("sort-btn--active")
                })

                button.classList.add("sort-btn--active")
                currentSort = button.dataset.sort
                render()
            })
        })

        if (platformFilter)
        {
            platformFilter.addEventListener("change", function ()
            {
                currentFilter = platformFilter.value
                render()
            })
        }

        const bookmarkPlatformSelect = document.getElementById("bookmarkPlatformFilter")
        const bookmarkVerdictSelect = document.getElementById("bookmarkVerdictFilter")

        if (bookmarkPlatformSelect)
        {
            bookmarkPlatformSelect.addEventListener("change", function ()
            {
                bookmarkPlatformFilter = bookmarkPlatformSelect.value
                renderBookmarks()
            })
        }

        if (bookmarkVerdictSelect)
        {
            bookmarkVerdictSelect.addEventListener("change", function ()
            {
                bookmarkVerdictFilter = bookmarkVerdictSelect.value
                renderBookmarks()
            })
        }

        const clearHistoryButton = document.getElementById("clearHistoryBtn")

        if (clearHistoryButton)
        {
            clearHistoryButton.addEventListener("click", function ()
            {
                document.getElementById("confirmPopup").classList.remove("hidden")
            })
        }

        const confirmClearButton = document.getElementById("confirmClearBtn")

        if (confirmClearButton)
        {
            confirmClearButton.addEventListener("click", clearAll)
        }

        const cancelClearButton = document.getElementById("cancelClearBtn")

        if (cancelClearButton)
        {
            cancelClearButton.addEventListener("click", function ()
            {
                document.getElementById("confirmPopup").classList.add("hidden")
            })
        }

        const clearBookmarksButton = document.getElementById("clearBookmarksBtn")

        if (clearBookmarksButton)
        {
            clearBookmarksButton.addEventListener("click", function ()
            {
                document.getElementById("confirmBookmarksPopup").classList.remove("hidden")
            })
        }

        const confirmClearBookmarksButton = document.getElementById("confirmClearBookmarksBtn")

        if (confirmClearBookmarksButton)
        {
            confirmClearBookmarksButton.addEventListener("click", async function ()
            {
                document.getElementById("confirmBookmarksPopup").classList.add("hidden")
                await clearAllBookmarks()
            })
        }

        const cancelClearBookmarksButton = document.getElementById("cancelClearBookmarksBtn")

        if (cancelClearBookmarksButton)
        {
            cancelClearBookmarksButton.addEventListener("click", function ()
            {
                document.getElementById("confirmBookmarksPopup").classList.add("hidden")
            })
        }
    }

    initializePage()
})
