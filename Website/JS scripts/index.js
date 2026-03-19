/* =========================
   TrustCheck - improved JS
   ========================= */

/* ---------- config ---------- */

document.getElementById("year").textContent = new Date().getFullYear();

const API_BASE = "http://127.0.0.1:8000";
const ANALYZE_ENDPOINT = `${API_BASE}/v1/analyze`;

const MAX_HISTORY = 50;
const REQUIRE_IMAGE = true; // set false if you want text-only analysis

/* ---------- element refs ---------- */

const dropArea = document.getElementById("drop-area");
const fileInput = document.getElementById("fileInput");
const fileNameDisplay = document.getElementById("fileName");
const deleteBtn = document.getElementById("delete-btn");
const previewArea = document.getElementById("previewArea");

const textInput = document.getElementById("textInput");
const platformSelect = document.getElementById("platformSelect");
const analyzeBtn = document.getElementById("analyzeButton");
const loadingDots = document.getElementById("loadingDots");

// Optional (only if exists in your HTML)
const imagePreview = document.getElementById("imagePreview");

/* ---------- utils ---------- */

/*
Function to safely set files into a file input using DataTransfer
Parameters:
- input: HTMLInputElement
- files: FileList
Returns:
- None
*/
function setInputFiles(input, files) {
  const dt = new DataTransfer();
  Array.from(files).forEach(f => dt.items.add(f));
  input.files = dt.files;
}

/*
Function to fetch with timeout using AbortController
Parameters:
- url: string
- options: object
- timeoutMs: number
Returns:
- Promise<Response>
*/
async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/*
Function to sanitize an array of strings
Parameters:
- list: any
Returns:
- string[]
*/
function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(s => String(s).trim())
    .filter(Boolean)
    .filter(s => !/^(-\s*)?none$/i.test(s));
}

/*
Function to show a friendly error to the user
Parameters:
- message: string
Returns:
- None
*/
function showError(message) {
  console.error(message);
  alert(message);
}

/*
Function to build a bounded history list in localStorage
Parameters:
- item: object
Returns:
- None
*/
function pushHistory(item) {
  const storedHistory = JSON.parse(localStorage.getItem("adHistory")) || [];
  storedHistory.unshift(item);
  localStorage.setItem("adHistory", JSON.stringify(storedHistory.slice(0, MAX_HISTORY)));
}

/* ---------- file list + preview ---------- */

/*
Function to update the display with the selected file names
Parameters:
- files: FileList | File[]
Returns:
- None
*/
function updateFileList(files) {
  const arr = Array.from(files || []);
  if (arr.length === 0) {
    fileNameDisplay.textContent = "No files selected";
    return;
  }

  const names = arr.map(f => f.name);
  fileNameDisplay.textContent = names.join(", ");
}

/*
Function to display thumbnail previews of selected image files
Parameters:
- files: FileList | File[]
Returns:
- None
*/
function showImagePreviews(files) {
  previewArea.innerHTML = "";

  const arr = Array.from(files || []);
  if (arr.length === 0) return;

  arr.forEach(file => {
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.src = reader.result;
      img.classList.add("thumbnail");
      previewArea.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  // Optional single preview (first image)
  if (imagePreview) {
    const first = arr.find(f => f.type.startsWith("image/"));
    if (!first) {
      imagePreview.src = "";
      imagePreview.style.display = "none";
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      imagePreview.src = e.target.result;
      imagePreview.style.display = "block";
    };
    reader.readAsDataURL(first);
  }
}

/*
Function to clear the selected files and previews
Parameters:
- None
Returns:
- None
*/
function clearFiles() {
  fileInput.value = "";
  updateFileList([]);
  previewArea.innerHTML = "";
  if (imagePreview) {
    imagePreview.src = "";
    imagePreview.style.display = "none";
  }
}

/* ---------- form validation ---------- */

/*
Function to validate fields and enable / disable analyze button
Parameters:
- None
Returns:
- None
*/
function validateForm() {
  const hasText = textInput.value.trim().length > 0;
  const hasPlatform = platformSelect.value !== "";
  const hasImage = fileInput.files.length > 0;

  const ok = REQUIRE_IMAGE ? (hasText && hasPlatform && hasImage) : (hasText && hasPlatform);
  analyzeBtn.disabled = !ok;
}

/* ---------- API adaptation (v1 backend -> your UI) ---------- */

/*
Function to map backend /v1/analyze response into your UI "result" shape
Parameters:
- apiResult: object
Returns:
- object
*/
function adaptV1ResultToUi(apiResult) {
  // expected: { analysis_id, score, grade, platform, result: { summary, violations, suggestions } }
  const score = Number(apiResult?.score ?? 0);
  const grade = String(apiResult?.grade ?? "").toLowerCase();

  let verdict = "Risky";
  if (grade === "pass") verdict = "Safe";
  else if (grade === "review") verdict = "Borderline";

  const violations = apiResult?.result?.violations ?? [];
  const suggestions = apiResult?.result?.suggestions ?? [];

  // readable violation lines
  const vLines = sanitizeList(
    violations.map(v => {
      const sev = (v.severity || "medium").toUpperCase();
      const code = v.code || "UNKNOWN";
      const why = v.rationale || "";
      return `[${sev}] ${code}: ${why}`.trim();
    })
  );

  // suggested fixes include per-violation suggested_fix + general suggestions
  const fixLines = [];
  violations.forEach(v => {
    if (v.suggested_fix && String(v.suggested_fix).trim()) fixLines.push(String(v.suggested_fix).trim());
  });
  suggestions.forEach(s => {
    if (s && String(s).trim()) fixLines.push(String(s).trim());
  });

  // Until backend provides a "source" field (text/image/both), put everything into text buckets
  return {
    score,
    verdict,
    summary: String(apiResult?.result?.summary || ""),
    text_violations: vLines,
    image_violations: [],
    text_suggestions: sanitizeList(fixLines),
    image_suggestions: []
  };
}

/* ---------- popup UI (your existing functions) ---------- */

function showPopup(result) {
  if (!result || Object.keys(result).length === 0) return;

  const popup = document.getElementById("aiResultPopup");
  popup.classList.remove("hidden");
  popup.classList.add("active");

  const score = Number(result.score ?? 0);
  const platform = platformSelect.value || "—";
  const verdict = (result.verdict || "").trim() || verdictFromScore(score);

  // Verdict pill
  const pill = document.getElementById("verdictBadge");
  pill.textContent = verdict;
  pill.className = "verdict-pill " + pillClass(verdict);

  // Meta chips
  document.getElementById("platformValue").textContent =
    platform.charAt(0).toUpperCase() + platform.slice(1);
  document.getElementById("overallLabel").textContent = labelFromScore(score);

  // Summary
  const summaryEl = document.getElementById("summaryText");
  if (summaryEl) {
    summaryEl.textContent = result.summary || "—";
    const chip = document.getElementById("summaryChip");
    if (chip) chip.style.display = result.summary ? "flex" : "none";
  }

  // SVG ring score
  renderRing(score);

  // Fill lists
  fillList("textViolations", sanitizeList(result.text_violations));
  fillList("imageViolations", sanitizeList(result.image_violations));
  fillList("textSuggestions", sanitizeList(result.text_suggestions));
  fillList("imageSuggestions", sanitizeList(result.image_suggestions));

  // Tab counts
  const vCount = sanitizeList(result.text_violations).length +
                 sanitizeList(result.image_violations).length;
  const sCount = sanitizeList(result.text_suggestions).length +
                 sanitizeList(result.image_suggestions).length;
  document.getElementById("violationsCount").textContent = vCount;
  document.getElementById("suggestionsCount").textContent = sCount;

  // Reset tabs
  switchTab("violations");
  document.querySelectorAll(".ai-tab").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  document.getElementById("copyReportBtn").onclick = () =>
    copyReport({ score, verdict, platform, result });
}

function closePopup() {
  const popup = document.getElementById("aiResultPopup");
  popup.classList.add("hidden");
  popup.classList.remove("active");
}

function renderRing(score) {
  const fill = document.getElementById("scoreRingFill");
  const valueEl = document.getElementById("scoreValue");
  if (!fill || !valueEl) return;

  const circumference = 314.16;
  const hue = Math.round((score / 100) * 120);
  const color = `hsl(${hue}, 85%, 55%)`;

  fill.style.stroke = color;
  fill.style.strokeDashoffset = circumference - (score / 100) * circumference;

  let current = 0;
  const step = Math.max(1, Math.round(score / 60));
  clearInterval(fill._timer);
  fill._timer = setInterval(() => {
    current = Math.min(current + step, score);
    valueEl.textContent = current;
    if (current >= score) clearInterval(fill._timer);
  }, 16);
}

function switchTab(name) {
  document.querySelectorAll(".ai-tab").forEach(t => {
    t.classList.toggle("ai-tab--active", t.dataset.tab === name);
  });
  document.querySelectorAll(".ai-panel").forEach(p => {
    p.classList.toggle("ai-panel--active", p.id === "panel-" + name);
  });
}

function pillClass(verdict) {
  const v = verdict.toLowerCase();
  if (v.includes("safe") && !v.includes("border")) return "verdict-pill--safe";
  if (v.includes("border")) return "verdict-pill--borderline";
  return "verdict-pill--risky";
}

function fillList(id, arr) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  if (!arr || arr.length === 0) {
    el.innerHTML = `<li class="empty">None</li>`;
    return;
  }

  arr.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

function verdictFromScore(score) {
  if (score >= 80) return "Safe";
  if (score >= 60) return "Borderline";
  return "Risky";
}

function labelFromScore(score) {
  if (score >= 90) return "Very Safe";
  if (score >= 80) return "Safe";
  if (score >= 70) return "Moderate";
  if (score >= 60) return "Borderline";
  return "Risky";
}



function copyReport({ score, verdict, platform, result }) {
  const mk = (title, items) =>
    `${title}\n${(items && items.length) ? items.map(v => `- ${v}`).join("\n") : "- None"}`;

  const text = [
    `Score: ${score}`,
    `Verdict: ${verdict}`,
    `Platform: ${platform}`,
    "",
    mk("Text Violations:", result.text_violations),
    "",
    mk("Image Violations:", result.image_violations),
    "",
    mk("Text Suggestions:", result.text_suggestions),
    "",
    mk("Image Suggestions:", result.image_suggestions),
  ].join("\n");

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyReportBtn");
    const old = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = old), 1000);
  });
}

/* ---------- events ---------- */

dropArea.addEventListener("dragover", e => {
  e.preventDefault();
  dropArea.classList.add("drag-over");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("drag-over");
});

dropArea.addEventListener("drop", e => {
  e.preventDefault();
  dropArea.classList.remove("drag-over");

  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    setInputFiles(fileInput, files);
    updateFileList(fileInput.files);
    showImagePreviews(fileInput.files);
    validateForm();
  }
});

fileInput.addEventListener("change", () => {
  updateFileList(fileInput.files);
  showImagePreviews(fileInput.files);
  validateForm();
});

deleteBtn.addEventListener("click", e => {
  e.preventDefault();
  clearFiles();
  validateForm();
});

textInput.addEventListener("input", validateForm);
platformSelect.addEventListener("change", validateForm);

analyzeBtn.addEventListener("click", async () => {
  analyzeBtn.disabled = true;
  analyzeBtn.style.display = "none";
  loadingDots.style.display = "flex";

  const description = textInput.value.trim();
  const platform = platformSelect.value;

  try {
    const form = new FormData();
    form.append("platform", platform);
    form.append("language", "auto");
    form.append("ad_text", description);

    // Multiple images supported
    Array.from(fileInput.files).forEach(f => form.append("images", f));

    const response = await fetchWithTimeout(ANALYZE_ENDPOINT, {
      method: "POST",
      body: form
    }, 30000);

    if (!response.ok) {
      let detail = `Request failed (${response.status})`;
      try {
        const err = await response.json();
        if (err?.detail) detail = err.detail;
      } catch {}
      throw new Error(detail);
    }

    const apiResult = await response.json();
    const uiResult = adaptV1ResultToUi(apiResult);

    showPopup(uiResult);

    pushHistory({
      timestamp: new Date().toISOString(),
      description,
      platform,
      score: uiResult.score,
      verdict: uiResult.verdict,
      textViolations: uiResult.text_violations,
      imageViolations: uiResult.image_violations,
      textSuggestions: uiResult.text_suggestions,
      imageSuggestions: uiResult.image_suggestions,
      analysisId: apiResult.analysis_id || null
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      showError("Request timed out. Try again.");
    } else {
      showError(err?.message || "Analysis failed. Please try again.");
    }
  } finally {
    analyzeBtn.style.display = "block";
    loadingDots.style.display = "none";
    validateForm();
  }
});

/* ---------- init ---------- */

// Initial UI state
updateFileList([]);
if (imagePreview) imagePreview.style.display = "none";
validateForm();