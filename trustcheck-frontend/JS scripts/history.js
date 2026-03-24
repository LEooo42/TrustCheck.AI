document.addEventListener("DOMContentLoaded", () => {

    const API_BASE = "http://127.0.0.1:8000";

    /* ── Footer year ───────────────────────────────────────────── */
    const yearSpan = document.getElementById("year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    /* ── State ─────────────────────────────────────────────────── */
    let currentSort   = "newest";
    let currentFilter = "all";
    let allEntries    = [];     // master list, refreshed on load

    /* ── Elements ──────────────────────────────────────────────── */
    const wrapper        = document.querySelector(".history-wrapper");
    const placeholder    = document.querySelector(".placeholder-box");
    const toolbar        = document.getElementById("historyToolbar");
    const platformFilter = document.getElementById("platformFilter");
    const sortBtns       = document.querySelectorAll(".sort-btn");

    /* ── Token helper ──────────────────────────────────────────── */
    function getToken() {
        return (window.TC_AUTH && window.TC_AUTH.getToken())
            || localStorage.getItem("tc_token")
            || null;
    }

    /* ── Load entries ──────────────────────────────────────────── */
    async function loadEntries() {
        const token = getToken();
        if (token) {
            try {
                const res = await fetch(`${API_BASE}/v1/history`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    // Normalise backend shape to the local shape history.js uses
                    return data.map(e => ({
                        timestamp:       e.created_at,
                        description:     e.ad_text,
                        platform:        e.platform,
                        score:           e.score,
                        verdict:         e.verdict,
                        textViolations:  e.text_violations  || [],
                        imageViolations: e.image_violations || [],
                        textSuggestions: e.text_suggestions || [],
                        imageSuggestions:e.image_suggestions|| [],
                        _backendId:      e.id,   // for delete
                        _fromServer:     true,
                    }));
                }
            } catch (err) {
                console.warn("Could not fetch server history, falling back to localStorage", err);
            }
        }
        // Guest — use localStorage
        return JSON.parse(localStorage.getItem("adHistory") || "[]");
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

    /* ── Build card ────────────────────────────────────────────── */
    function buildCard(entry) {
        const date = entry.timestamp
            ? new Date(entry.timestamp).toLocaleString(undefined, {
                day:"2-digit", month:"short", year:"numeric",
                hour:"2-digit", minute:"2-digit"
              })
            : "—";

        const platform = (entry.platform || "unknown");
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

        const safeList = arr =>
            Array.isArray(arr) && arr.length
                ? arr.map(v => `<li>${v}</li>`).join("")
                : "<li class='none'>None</li>";

        const C = 125.66;
        const offset = C - (Math.min(100, Math.max(0, entry.score)) / 100) * C;

        const card = document.createElement("div");
        card.className = "history-card";
        card.dataset.platform = platform.toLowerCase();

        // Delete button (only for server entries when logged in)
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
                        <svg viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 105-.86" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M7 3V1l-2 2 2 2V3z" fill="currentColor"/></svg>
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

        // Wire re-run button — navigate to home with pre-filled data
        const rerun = card.querySelector(".hcard__rerun-btn");
        if (rerun) {
            rerun.addEventListener("click", () => {
                const text     = rerun.dataset.text     || "";
                const platform = rerun.dataset.platform || "";
                // Store in sessionStorage so index.js can pick it up
                sessionStorage.setItem("tc_rerun", JSON.stringify({ text, platform }));
                window.location.href = "index.html";
            });
        }

        // Wire per-card delete button
        const del = card.querySelector(".hcard__delete-btn");
        if (del) {
            del.addEventListener("click", async () => {
                if (!confirm("Delete this analysis?")) return;
                const id = del.dataset.id;
                const token = getToken();
                try {
                    await fetch(`${API_BASE}/v1/history/${id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    allEntries = allEntries.filter(e => e._backendId !== id);
                    render();
                    if (allEntries.length === 0) showEmpty();
                } catch {
                    alert("Could not delete entry. Try again.");
                }
            });
        }

        return card;
    }

    /* ── Render ────────────────────────────────────────────────── */
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

    function showEmpty() {
        toolbar.style.display = "none";
        wrapper.querySelectorAll(".history-card, .no-results-msg").forEach(el => el.remove());
        if (placeholder) wrapper.insertBefore(placeholder, wrapper.firstChild);
    }

    /* ── Clear All ─────────────────────────────────────────────── */
    async function clearAll() {
        const token = getToken();
        if (token) {
            try {
                await fetch(`${API_BASE}/v1/history`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch {
                /* server unreachable — still clear locally */
            }
        }
        localStorage.removeItem("adHistory");
        location.reload();
    }

    /* ── Init ──────────────────────────────────────────────────── */
    (async () => {
        allEntries = await loadEntries();

        if (allEntries.length === 0) return; // leave placeholder

        if (placeholder) placeholder.remove();
        toolbar.style.display = "block";
        render();

        /* Sort buttons */
        sortBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                sortBtns.forEach(b => b.classList.remove("sort-btn--active"));
                btn.classList.add("sort-btn--active");
                currentSort = btn.dataset.sort;
                render();
            });
        });

        /* Platform filter */
        platformFilter.addEventListener("change", () => {
            currentFilter = platformFilter.value;
            render();
        });

        /* Clear All button */
        document.getElementById("clearHistoryBtn").addEventListener("click", () => {
            document.getElementById("confirmPopup").classList.remove("hidden");
        });
        document.getElementById("confirmClearBtn").addEventListener("click", clearAll);
        document.getElementById("cancelClearBtn").addEventListener("click", () => {
            document.getElementById("confirmPopup").classList.add("hidden");
        });
    })();
});
