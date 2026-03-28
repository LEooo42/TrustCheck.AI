document.addEventListener("DOMContentLoaded", () => {

    const API_BASE          = "https://trustcheck-ai.onrender.com";
    const BOOKMARKS_ENDPOINT = `${API_BASE}/v1/bookmarks`;

    /* ── Footer year ───────────────────────────────────────────── */
    const yearSpan = document.getElementById("year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    /* ── State ─────────────────────────────────────────────────── */
    let currentSort         = "newest";
    let currentFilter       = "all";
    let allEntries          = [];
    let allBookmarks        = [];
    let activeTab           = "history";   // "history" | "bookmarks"
    let bmPlatformFilter    = "all";
    let bmVerdictFilter     = "all";

    /* ── Elements ──────────────────────────────────────────────── */
    const wrapper          = document.querySelector(".history-wrapper");
    const placeholder      = document.querySelector(".placeholder-box");
    const toolbar          = document.getElementById("historyToolbar");
    const historyTabs      = document.getElementById("historyTabs");
    const platformFilter   = document.getElementById("platformFilter");
    const sortBtns         = document.querySelectorAll(".sort-btn");
    const bookmarksWrapper = document.getElementById("bookmarksWrapper");
    const bookmarksToolbar = document.getElementById("bookmarksToolbar");
    const bookmarksEmpty   = document.getElementById("bookmarksEmpty");
    const historyCountEl   = document.getElementById("historyCount");
    const bookmarksCountEl = document.getElementById("bookmarksCount");

    /* ── Token helper ──────────────────────────────────────────── */
    function getToken() {
        return (window.TC_AUTH && window.TC_AUTH.getToken())
            || localStorage.getItem("tc_token")
            || null;
    }

    /* ── Load history entries ──────────────────────────────────── */
    async function loadEntries() {
        const token = getToken();
        if (token) {
            try {
                const res = await fetch(`${API_BASE}/v1/history`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.map(e => ({
                        timestamp:        e.created_at,
                        description:      e.ad_text,
                        platform:         e.platform,
                        score:            e.score,
                        verdict:          e.verdict,
                        textViolations:   e.text_violations   || [],
                        imageViolations:  e.image_violations  || [],
                        textSuggestions:  e.text_suggestions  || [],
                        imageSuggestions: e.image_suggestions || [],
                        _backendId:       e.id,
                        _fromServer:      true,
                    }));
                }
            } catch (err) {
                console.warn("Could not fetch server history, falling back to localStorage", err);
            }
        }
        return JSON.parse(localStorage.getItem("adHistory") || "[]");
    }

    /* ── Load bookmarks ────────────────────────────────────────── */
    async function loadBookmarks() {
        const token = getToken();
        if (!token) return [];
        try {
            const res = await fetch(BOOKMARKS_ENDPOINT, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) return await res.json();
        } catch {}
        return [];
    }

    /* ── Sort ──────────────────────────────────────────────────── */
    function sortEntries(entries, mode) {
        const copy = [...entries];
        switch (mode) {
            case "oldest":     return copy.reverse();
            case "score-high": return copy.sort((a, b) => b.score - a.score);
            case "score-low":  return copy.sort((a, b) => a.score - b.score);
            default:           return copy;
        }
    }

    /* ── Filter ────────────────────────────────────────────────── */
    function filterEntries(entries, platform) {
        if (platform === "all") return entries;
        return entries.filter(e => (e.platform || "").toLowerCase() === platform);
    }

    function filterBookmarks(bms) {
        return bms.filter(b => {
            const pMatch = bmPlatformFilter === "all" ||
                (b.platform || "").toLowerCase() === bmPlatformFilter;
            const vMatch = bmVerdictFilter === "all" ||
                (b.verdict || "").toLowerCase().includes(bmVerdictFilter);
            return pMatch && vMatch;
        });
    }

    /* ── Verdict colour ────────────────────────────────────────── */
    function verdictClass(v) {
        const lv = (v || "").toLowerCase();
        if (lv.includes("safe") && !lv.includes("border")) return "verdict--safe";
        if (lv.includes("border")) return "verdict--borderline";
        return "verdict--risky";
    }

    function scoreColor(s) {
        return `hsl(${Math.round((s / 100) * 120)}, 85%, 55%)`;
    }

    /* ── Build history card ────────────────────────────────────── */
    function buildCard(entry) {
        const date = entry.timestamp
            ? new Date(entry.timestamp).toLocaleString(undefined, {
                day:"2-digit", month:"short", year:"numeric",
                hour:"2-digit", minute:"2-digit"
              })
            : "—";

        const platform      = (entry.platform || "unknown");
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

        const safeList = arr =>
            Array.isArray(arr) && arr.length
                ? arr.map(v => `<li>${v}</li>`).join("")
                : "<li class='none'>None</li>";

        const C      = 125.66;
        const offset = C - (Math.min(100, Math.max(0, entry.score)) / 100) * C;

        const card = document.createElement("div");
        card.className = "history-card";
        card.dataset.platform = platform.toLowerCase();

        const deleteBtn = entry._fromServer
            ? `<button class="hcard__delete-btn" title="Delete this entry" data-id="${entry._backendId}">
                 <svg viewBox="0 0 14 14" fill="none"><path d="M2 3h10M5 3V2h4v1M6 6v5M8 6v5M3 3l1 9h6l1-9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
               </button>`
            : "";

        card.innerHTML = `
            <div class="hcard__header">
                <div class="hcard__meta">
                    <span class="hcard__platform">${platformLabel}</span>
                    <span class="hcard__date">${date}</span>
                </div>
                <div class="hcard__header-right">
                    <span class="hcard__verdict ${verdictClass(entry.verdict)}">${entry.verdict || "—"}</span>
                    <button class="hcard__rerun-btn" title="Re-run this analysis" data-text="${(entry.description || '').replace(/"/g,'&quot;')}" data-platform="${platform.toLowerCase()}">
                        <svg viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.38-3.62" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polyline points="12.5,1.5 12.5,5 9,5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    ${deleteBtn}
                </div>
            </div>
            <div class="hcard__score-row">
                <div class="hcard__score-ring">
                    <svg viewBox="0 0 48 48" style="transform:rotate(-90deg);width:48px;height:48px;">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
                        <circle cx="24" cy="24" r="20" fill="none"
                            stroke="${scoreColor(entry.score)}" stroke-width="5"
                            stroke-linecap="round"
                            stroke-dasharray="${C}"
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
                        <ul class="hcard__list hcard__list--violation">${safeList(entry.textViolations)}</ul>
                    </div>
                    <div>
                        <p class="hcard__detail-heading">Image Violations</p>
                        <ul class="hcard__list hcard__list--violation">${safeList(entry.imageViolations)}</ul>
                    </div>
                    <div>
                        <p class="hcard__detail-heading">Text Suggestions</p>
                        <ul class="hcard__list hcard__list--suggestion">${safeList(entry.textSuggestions)}</ul>
                    </div>
                    <div>
                        <p class="hcard__detail-heading">Image Suggestions</p>
                        <ul class="hcard__list hcard__list--suggestion">${safeList(entry.imageSuggestions)}</ul>
                    </div>
                </div>
            </details>
        `;

        const rerun = card.querySelector(".hcard__rerun-btn");
        if (rerun) {
            rerun.addEventListener("click", () => {
                const text     = rerun.dataset.text     || "";
                const platform = rerun.dataset.platform || "";
                sessionStorage.setItem("tc_rerun", JSON.stringify({ text, platform }));
                window.location.href = "index.html";
            });
        }

        const del = card.querySelector(".hcard__delete-btn");
        if (del) {
            del.addEventListener("click", async () => {
                if (!confirm("Delete this analysis?")) return;
                const id    = del.dataset.id;
                const token = getToken();
                try {
                    await fetch(`${API_BASE}/v1/history/${id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    allEntries = allEntries.filter(e => e._backendId !== id);
                    if (historyCountEl) historyCountEl.textContent = allEntries.length;
                    render();
                    if (allEntries.length === 0) showEmpty();
                } catch {
                    alert("Could not delete entry. Try again.");
                }
            });
        }

        return card;
    }

    /* ── Build bookmark card ───────────────────────────────────── */
    function buildBookmarkCard(bm) {
        const date = bm.created_at
            ? new Date(bm.created_at).toLocaleString(undefined, {
                day:"2-digit", month:"short", year:"numeric",
                hour:"2-digit", minute:"2-digit"
              })
            : "—";

        const platform      = (bm.platform || "unknown");
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
        const C             = 125.66;
        const offset        = C - (Math.min(100, Math.max(0, bm.score)) / 100) * C;

        const card = document.createElement("div");
        card.className = "history-card bookmark-card";
        card.dataset.platform = platform.toLowerCase();

        card.innerHTML = `
            <div class="hcard__header">
                <div class="hcard__meta">
                    <span class="hcard__platform">${platformLabel}</span>
                    <span class="hcard__date">${date}</span>
                </div>
                <div class="hcard__header-right">
                    <span class="hcard__verdict ${verdictClass(bm.verdict)}">${bm.verdict || "—"}</span>
                    <button class="hcard__rerun-btn bm-rerun-btn" title="Re-run this ad"
                        data-text="${(bm.ad_text || '').replace(/"/g,'&quot;')}"
                        data-platform="${platform.toLowerCase()}">
                        <svg viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.38-3.62" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polyline points="12.5,1.5 12.5,5 9,5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="hcard__delete-btn bm-remove-btn" title="Remove bookmark"
                        data-analysis-id="${bm.analysis_id}">
                        <svg viewBox="0 0 16 16" fill="none"><path d="M3 2h10a1 1 0 011 1v11l-6-3-6 3V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                    </button>
                </div>
            </div>
            <div class="hcard__score-row">
                <div class="hcard__score-ring">
                    <svg viewBox="0 0 48 48" style="transform:rotate(-90deg);width:48px;height:48px;">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
                        <circle cx="24" cy="24" r="20" fill="none"
                            stroke="${scoreColor(bm.score)}" stroke-width="5"
                            stroke-linecap="round"
                            stroke-dasharray="${C}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <span class="hring-num">${bm.score}</span>
                </div>
                <div class="hcard__desc-col">
                    <p class="hcard__desc">${bm.ad_text || "—"}</p>
                    ${bm.summary ? `<p class="hcard__summary">${bm.summary}</p>` : ""}
                </div>
            </div>
        `;

        card.querySelector(".bm-rerun-btn").addEventListener("click", () => {
            sessionStorage.setItem("tc_rerun", JSON.stringify({
                text: bm.ad_text || "",
                platform: platform.toLowerCase(),
            }));
            window.location.href = "index.html";
        });

        card.querySelector(".bm-remove-btn").addEventListener("click", async () => {
            if (!confirm("Remove this bookmark?")) return;
            const token = getToken();
            try {
                await fetch(`${BOOKMARKS_ENDPOINT}/${bm.analysis_id}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
                allBookmarks = allBookmarks.filter(b => b.analysis_id !== bm.analysis_id);
                if (bookmarksCountEl) bookmarksCountEl.textContent = allBookmarks.length;
                renderBookmarks();
            } catch {
                alert("Could not remove bookmark. Try again.");
            }
        });

        return card;
    }

    /* ── Render history ────────────────────────────────────────── */
    function render() {
        wrapper.querySelectorAll(".history-card, .no-results-msg").forEach(el => el.remove());

        const filtered = filterEntries(allEntries, currentFilter);
        const sorted   = sortEntries(filtered, currentSort);

        if (sorted.length === 0) {
            const msg = document.createElement("p");
            msg.className = "no-results-msg";
            msg.textContent = allEntries.length > 0 ? "No results match this filter." : "No history yet.";
            wrapper.appendChild(msg);
            return;
        }

        sorted.forEach(entry => wrapper.appendChild(buildCard(entry)));
    }

    /* ── Render bookmarks ──────────────────────────────────────── */
    function renderBookmarks() {
        bookmarksWrapper.querySelectorAll(".bookmark-card, .no-results-msg").forEach(el => el.remove());

        const filtered = filterBookmarks(allBookmarks);

        if (filtered.length === 0) {
            bookmarksEmpty.style.display = "";
            return;
        }

        bookmarksEmpty.style.display = "none";
        // Sort by newest first
        const sorted = [...filtered].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );
        sorted.forEach(bm => bookmarksWrapper.appendChild(buildBookmarkCard(bm)));
    }

    /* ── Tab switching ─────────────────────────────────────────── */
    function switchTab(tab) {
        activeTab = tab;
        document.querySelectorAll(".htab").forEach(b => {
            b.classList.toggle("htab--active", b.dataset.tab === tab);
        });

        if (tab === "history") {
            wrapper.style.display        = "";
            toolbar.style.display        = allEntries.length  > 0 ? "block" : "none";
            bookmarksWrapper.style.display = "none";
            bookmarksToolbar.style.display = "none";
        } else {
            wrapper.style.display          = "none";
            toolbar.style.display          = "none";
            bookmarksWrapper.style.display = "";
            bookmarksToolbar.style.display = allBookmarks.length > 0 ? "block" : "none";
            renderBookmarks();
        }
    }

    /* ── Show empty (no history at all) ────────────────────────── */
    function showEmpty() {
        toolbar.style.display = "none";
        wrapper.querySelectorAll(".history-card, .no-results-msg").forEach(el => el.remove());
        if (placeholder) wrapper.insertBefore(placeholder, wrapper.firstChild);
    }

    /* ── Clear All history ─────────────────────────────────────── */
    async function clearAll() {
        const token = getToken();
        if (token) {
            try {
                await fetch(`${API_BASE}/v1/history`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch {}
        }
        localStorage.removeItem("adHistory");
        location.reload();
    }

    /* ── Clear All bookmarks ───────────────────────────────────── */
    async function clearAllBookmarks() {
        const token = getToken();
        if (!token) return;
        // Delete each bookmark individually
        for (const bm of allBookmarks) {
            try {
                await fetch(`${BOOKMARKS_ENDPOINT}/${bm.analysis_id}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch {}
        }
        allBookmarks = [];
        if (bookmarksCountEl) bookmarksCountEl.textContent = 0;
        bookmarksToolbar.style.display = "none";
        renderBookmarks();
    }

    /* ── Init ──────────────────────────────────────────────────── */
    (async () => {
        const [entries, bookmarks] = await Promise.all([loadEntries(), loadBookmarks()]);
        allEntries   = entries;
        allBookmarks = bookmarks;

        const hasHistory   = allEntries.length   > 0;
        const hasBookmarks = allBookmarks.length  > 0;

        // Show tabs only if user is logged in (has token) so bookmarks are meaningful
        const token = getToken();
        if (token) {
            historyTabs.style.display = "flex";
        }

        if (historyCountEl)   historyCountEl.textContent   = allEntries.length;
        if (bookmarksCountEl) bookmarksCountEl.textContent = allBookmarks.length;

        if (hasHistory) {
            if (placeholder) placeholder.remove();
            toolbar.style.display = "block";
            render();
        }

        // Tab buttons
        document.querySelectorAll(".htab").forEach(btn => {
            btn.addEventListener("click", () => switchTab(btn.dataset.tab));
        });

        // Sort buttons
        sortBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                sortBtns.forEach(b => b.classList.remove("sort-btn--active"));
                btn.classList.add("sort-btn--active");
                currentSort = btn.dataset.sort;
                render();
            });
        });

        // Platform filter
        if (platformFilter) {
            platformFilter.addEventListener("change", () => {
                currentFilter = platformFilter.value;
                render();
            });
        }

        // Bookmark filters
        const bmPlatFilter = document.getElementById("bookmarkPlatformFilter");
        const bmVerdFilter = document.getElementById("bookmarkVerdictFilter");
        if (bmPlatFilter) {
            bmPlatFilter.addEventListener("change", () => {
                bmPlatformFilter = bmPlatFilter.value;
                renderBookmarks();
            });
        }
        if (bmVerdFilter) {
            bmVerdFilter.addEventListener("change", () => {
                bmVerdictFilter = bmVerdFilter.value;
                renderBookmarks();
            });
        }

        // Clear All history
        const clearHistBtn = document.getElementById("clearHistoryBtn");
        if (clearHistBtn) {
            clearHistBtn.addEventListener("click", () => {
                document.getElementById("confirmPopup").classList.remove("hidden");
            });
        }
        document.getElementById("confirmClearBtn")?.addEventListener("click", clearAll);
        document.getElementById("cancelClearBtn")?.addEventListener("click", () => {
            document.getElementById("confirmPopup").classList.add("hidden");
        });

        // Clear All bookmarks
        const clearBmBtn = document.getElementById("clearBookmarksBtn");
        if (clearBmBtn) {
            clearBmBtn.addEventListener("click", () => {
                document.getElementById("confirmBookmarksPopup").classList.remove("hidden");
            });
        }
        document.getElementById("confirmClearBookmarksBtn")?.addEventListener("click", async () => {
            document.getElementById("confirmBookmarksPopup").classList.add("hidden");
            await clearAllBookmarks();
        });
        document.getElementById("cancelClearBookmarksBtn")?.addEventListener("click", () => {
            document.getElementById("confirmBookmarksPopup").classList.add("hidden");
        });
    })();
});
