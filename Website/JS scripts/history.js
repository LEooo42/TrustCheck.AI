document.addEventListener("DOMContentLoaded", () => 
{
    /* Set current year in footer */
    const yearSpan = document.getElementById("year");
    if(yearSpan) yearSpan.textContent = new Date().getFullYear();

    const historyContainer = document.querySelector(".history-wrapper");
    const history = JSON.parse(localStorage.getItem("adHistory")) || [];

    if(history.length === 0) return;

    const placeholder = document.querySelector(".placeholder-box");
    if(placeholder) placeholder.remove();

    document.getElementById("clearHistoryContainer").style.display = "block";

    history.reverse().forEach(entry => 
    {
        const card = document.createElement("div");
        card.className = "history-card";
        card.innerHTML = `
        <p><strong>Platform:</strong> ${entry.platform}</p>
        <p><strong>Description:</strong> ${entry.description}</p>
        <p><strong>Score:</strong> ${entry.score}</p>
        <p><strong>Verdict:</strong> ${entry.verdict}</p>
        <details>
            <summary>Details</summary>
            <p><strong>Text Violations:</strong><br>${entry.textViolations.join("<br>")}</p>
            <p><strong>Image Violations:</strong><br>${entry.imageViolations.join("<br>")}</p>
            <p><strong>Text Suggestions:</strong><br>${entry.textSuggestions.join("<br>")}</p>
            <p><strong>Image Suggestions:</strong><br>${entry.imageSuggestions.join("<br>")}</p>
        </details>
        <hr>
        `;
        historyContainer.appendChild(card);
    });

    document.getElementById("clearHistoryBtn").addEventListener("click", () => 
    {
        document.getElementById("confirmPopup").classList.remove("hidden");
    });

    document.getElementById("cancelClearBtn").addEventListener("click", () => 
    {
        document.getElementById("confirmPopup").classList.add("hidden");
    });

    document.getElementById("confirmClearBtn").addEventListener("click", () => 
    {
        localStorage.removeItem("adHistory");
        location.reload(); 
    });
});

