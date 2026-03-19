document.addEventListener("DOMContentLoaded", () =>
{
    /* ── Footer year ───────────────────────────────────────────── */
    const yearSpan = document.getElementById("year");
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    /* ── State ─────────────────────────────────────────────────── */
    let currentSort   = "newest";
    let currentFilter = "all";

    /* ── Elements ──────────────────────────────────────────────── */
    const wrapper        = document.querySelector(".history-wrapper");
    const placeholder    = document.querySelector(".placeholder-box");
    const toolbar        = document.getElementById("historyToolbar");
    const platformFilter = document.getElementById("platformFilter");
    const sortBtns       = document.querySelectorAll(".sort-btn");

    /* ── Load from localStorage (never mutate the stored array) ── */
    function loadHistory() {
        return JSON.parse(localStorage.getItem("adHistory") || "[]");
    }

    /* ── Sort ──────────────────────────────────────────────────── */
    function sortEntries(entries, mode) {
        const copy = [...entries];
        switch (mode) {
            case "oldest":     return copy.reverse();
            case "score-high": return copy.sort((a, b) => b.score - a.score);
            case "score-low":  return copy.sort((a, b) => a.score - b.score);
            default:           return copy; // newest-first already
        }
    }

    /* ── Filter ────────────────────────────────────────────────── */
    function filterEntries(entries, platform) {
        if (platform === "all") return entries;
        return entries.filter(e => (e.platform || "").toLowerCase() === platform);
    }

    /* ── Verdict colour class ──────────────────────────────────── */
    function verdictClass(verdict) {
        const v = (verdict || "").toLowerCase();
        if (v.includes("safe") && !v.includes("border")) return "verdict--safe";
        if (v.includes("border")) return "verdict--borderline";
        return "verdict--risky";
    }

    /* ── Score ring colour ─────────────────────────────────────── */
    function scoreColor(score) {
        const hue = Math.round((score / 100) * 120);
        return `hsl(${hue}, 85%, 55%)`;
    }

    /* ── Build one card ────────────────────────────────────────── */
    function buildCard(entry) {
        const date = entry.timestamp
            ? new Date(entry.timestamp).toLocaleString(undefined, {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit"
              })
            : "—";

        const platform = (entry.platform || "unknown");
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);

        const safeList = arr =>
            Array.isArray(arr) && arr.length
                ? arr.map(v => `<li>${v}</li>`).join("")
                : "<li class='none'>None</li>";

        const circumference = 125.66;
        const offset = circumference - (Math.min(100, Math.max(0, entry.score)) / 100) * circumference;

        const card = document.createElement("div");
        card.className = "history-card";
        card.dataset.platform = platform.toLowerCase();
        card.innerHTML = `
            <div class="hcard__header">
                <div class="hcard__meta">
                    <span class="hcard__platform">${platformLabel}</span>
                    <span class="hcard__date">${date}</span>
                </div>
                <span class="hcard__verdict ${verdictClass(entry.verdict)}">${entry.verdict || "—"}</span>
            </div>
            <div class="hcard__score-row">
                <div class="hcard__score-ring">
                    <svg viewBox="0 0 48 48" style="transform:rotate(-90deg);width:48px;height:48px;">
                        <circle class="hring-track" cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
                        <circle class="hring-fill" cx="24" cy="24" r="20" fill="none"
                            stroke="${scoreColor(entry.score)}" stroke-width="5"
                            stroke-linecap="round"
                            stroke-dasharray="${circumference}"
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
        return card;
    }

    /* ── Render all cards ──────────────────────────────────────── */
    function render() {
        wrapper.querySelectorAll(".history-card, .no-results-msg").forEach(el => el.remove());

        const all      = loadHistory();
        const filtered = filterEntries(all, currentFilter);
        const sorted   = sortEntries(filtered, currentSort);

        if (sorted.length === 0) {
            const msg = document.createElement("p");
            msg.className = "no-results-msg";
            msg.textContent = all.length > 0
                ? "No results match this filter."
                : "No history yet.";
            wrapper.appendChild(msg);
            return;
        }

        sorted.forEach(entry => wrapper.appendChild(buildCard(entry)));
    }

    /* ── Init ──────────────────────────────────────────────────── */
    const history = loadHistory();

    if (history.length === 0) return; // leave placeholder visible

    if (placeholder) placeholder.remove();
    toolbar.style.display = "block";

    render();

    /* ── Sort buttons ──────────────────────────────────────────── */
    sortBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            sortBtns.forEach(b => b.classList.remove("sort-btn--active"));
            btn.classList.add("sort-btn--active");
            currentSort = btn.dataset.sort;
            render();
        });
    });

    /* ── Platform filter ───────────────────────────────────────── */
    platformFilter.addEventListener("change", () => {
        currentFilter = platformFilter.value;
        render();
    });

    /* ── Clear All ─────────────────────────────────────────────── */
    document.getElementById("clearHistoryBtn").addEventListener("click", () => {
        document.getElementById("confirmPopup").classList.remove("hidden");
    });

    document.getElementById("confirmClearBtn").addEventListener("click", () => {
        localStorage.removeItem("adHistory");
        location.reload();
    });

    document.getElementById("cancelClearBtn").addEventListener("click", () => {
        document.getElementById("confirmPopup").classList.add("hidden");
    });
});
