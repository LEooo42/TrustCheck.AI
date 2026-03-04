document.getElementById("year").textContent = new Date().getFullYear(); // setting a current year for the footer

// finding all the HTML elements
const dropArea = document.getElementById('drop-area');        
const fileInput = document.getElementById('fileInput');       
const fileNameDisplay = document.getElementById('fileName');  
const deleteBtn = document.getElementById('delete-btn');     
const previewArea = document.getElementById('previewArea');  

/*
Function to update the display with the selected file names  
Parameters:  
- files: FileList - list of selected files  
Returns:  
- None
*/
function updateFileList(files) 
{
  //if no files selected
  if(files.length === 0) 
  {
    fileNameDisplay.textContent = "No files selected"; 
    previewArea.innerHTML = ""; //clear previous area
    return;
  }

  const names = Array.from(files).map(f => f.name); // extract file names into array
  fileNameDisplay.textContent = names.join(", ");   // join file names with commas and display
} 

/*
Function to display thumbnail previews of selected image files  
Parameters:  
- files: FileList - list of selected files  
Returns:  
- None
*/
function showImagePreviews(files) 
{
  previewArea.innerHTML = ""; // clear previous area

  // loop through each file
  Array.from(files).forEach(file => 
  {
    if(!file.type.startsWith("image/")) return; // skip file if not image

    const reader = new FileReader(); // create a new FileReader

    // when file loading is complete
    reader.onload = () => 
    {
      const img = document.createElement("img");  // create new <img> element
      img.src = reader.result;                    // set image source to loaded data
      img.classList.add("thumbnail");             // add styling class
      previewArea.appendChild(img);               // append image to preview area
    };
    reader.readAsDataURL(file); // read file as a data URL
  });
} 

/*
Anonymous function to handle dragover event on drop area (highlight drop zone)  
Parameters:  
- e: DragEvent  
Returns:  
- None
*/
dropArea.addEventListener('dragover', (e) => 
{
  e.preventDefault();                   // prevent default browser file opening
  dropArea.classList.add('drag-over');  // dd visual highlight
});

/*
Anonymous function to handle dragleave event on drop area (remove highlight)  
Parameters:  
- None  
Returns:  
- None
*/
dropArea.addEventListener('dragleave', () => 
{
  dropArea.classList.remove('drag-over'); 
});

/*
Anonymous function to handle file drop event, process dropped files  
Parameters:  
- e: DragEvent  
Returns:  
- None
*/
dropArea.addEventListener('drop', (e) => 
{
  e.preventDefault(); // prevent default file opening
  dropArea.classList.remove('drag-over'); // remove highlight

  const files = e.dataTransfer.files; // get dropped files

  // if at least one file loaded
  if(files.length > 0) 
  {
    fileInput.files = files;  // assign dropped files to input
    updateFileList(files);    // update file names
    showImagePreviews(files); // show image previews
  }
});

/*
Anonymous function to handle file selection through input element  
Parameters:  
- None  
Returns:  
- None
*/
fileInput.addEventListener('change', () => 
{
  // if a file was chosen
  if(fileInput.files.length > 0) 
  {
    updateFileList(fileInput.files);    // update file names
    showImagePreviews(fileInput.files); // show image previews
  }
});

/*
Anonymous function to handle delete/reset button click - clears input and preview  
Parameters:  
- e: MouseEvent  
Returns:  
- None
*/
deleteBtn.addEventListener('click', (e) => 
{
  e.preventDefault();         // prevent form submission or link navigation
  fileInput.value = "";       // clear file input field
  updateFileList([]);         // clear file display
  previewArea.innerHTML = ""; // clear preview area
});

/*
Anonymous function triggered when DOM is fully loaded, sets up listeners and UI behavior  
Parameters:  
- None  
Returns:  
- None
*/
document.addEventListener("DOMContentLoaded", () => 
{
  // get needed HTML elements
  const imageInput = document.getElementById("fileInput");
  const imagePreview = document.getElementById("imagePreview");
  const analyzeBtn = document.getElementById("analyzeButton");

  /*
  Function to validate the form fields and enable / disable the analyze button  
  Parameters:  
  - None
  Returns:  
  - None
  */
  function validateForm() 
  {
    const hasText = document.getElementById("textInput").value.trim().length > 0;     // check if text is entered
    const hasPlatform = document.getElementById("platformSelect").value !== "";       // check if platform is selected
    const hasImage = fileInput.files.length > 0;                                      // check if an image is selected
    analyzeBtn.disabled = !(hasText && hasPlatform && hasImage);                      // enable or disable button
  }

  // set event listeners for input validation
  document.getElementById("textInput").addEventListener("input", validateForm);
  document.getElementById("platformSelect").addEventListener("change", validateForm);
  fileInput.addEventListener("change", validateForm);

  validateForm();

  // display image preview for selected image
  imageInput.addEventListener("change", () => 
  {
    const file = imageInput.files[0]; // get selected file

    if(file) 
    {
      const reader = new FileReader(); // create reader

      // when loaded
      reader.onload = (e) => 
      {
        imagePreview.src = e.target.result;   // set image preview source
        imagePreview.style.display = "block"; // show image
      };

      reader.readAsDataURL(file); //read image data
    } 
    else 
    {
      // clear the fields if no file selected
      imagePreview.src = "";
      imagePreview.style.display = "none";
    }
  });

  // handle clicking the analyze button
  analyzeBtn.addEventListener("click", async () => 
  {
    analyzeBtn.style.display = "none"; // hide the button
    document.getElementById("loadingDots").style.display = "flex"; // show loading animation

    const description = document.getElementById("textInput").value;   // get ad description
    const platform = document.getElementById("platformSelect").value; // get selected platform
    const file = fileInput.files[0];                                  // get selected file

    let image_base64 = null; // variable for base64
    if(file) 
    {
      image_base64 = await toBase64(file); // convert file to base64
    }

    // object with form data
    const adData = 
    {
      headline: "",   // no headline used yet
      description,    // user-provided text
      platform,       // selected platform
      image_base64,   // encoded image
    };

    try 
    {
      const response = await fetch("http://127.0.0.1:8000/analyze",  // send data to local backend (temp)
      {
        method: "POST",                                   // HTTP method
        headers: { "Content-Type": "application/json" },  // send JSON
        body: JSON.stringify(adData),                     // convert object to string
      });

      const result = await response.json(); // parse response from server
      showPopup(result); // show results to user

      const storedHistory = JSON.parse(localStorage.getItem("adHistory")) || [];

      storedHistory.push({
        timestamp: new Date().toISOString(),
        description,
        platform,
        score: result.score,
        verdict: result.verdict,
        textViolations: result.text_violations,
        imageViolations: result.image_violations,
        textSuggestions: result.text_suggestions,
        imageSuggestions: result.image_suggestions
      });

      localStorage.setItem("adHistory", JSON.stringify(storedHistory));
    } 
    catch (error) 
    {
      console.error("Analysis failed:", error);
    } 
    finally 
    {
      analyzeBtn.style.display = "block"; // re-show analyze button
      document.getElementById("loadingDots").style.display = "none"; // hide loading animation
    }
  });
});

/*
Function to convert a File object to a Base64-encoded string  
Parameters:  
- file: File - the file to convert  
Returns:  
- Promise<string>: Base64-encoded string (without header)
*/
function toBase64(file) 
{ 
  // return promise for async conversion
  return new Promise((resolve, reject) => 
  {
    const reader = new FileReader(); // create file reader
    reader.readAsDataURL(file); // read file as Data URL
    reader.onload = () => 
    {
      const base64String = reader.result.split(",")[1]; // get base64 portion
      resolve(base64String); // resolve promise
    };
    reader.onerror = (error) => reject(error); // reject on error
  });
}

/*
Function to display the AI analysis result in a popup with formatted violations and suggestions  
Parameters:  
- result: Object - the JSON result returned from the backend  
Returns:  
- None
*/
// function showPopup(result) 
// {
//   const resultArea = document.getElementById("aiResultContent"); // get element for results

//   const textV = result.text_violations || ["Couldn't get text violations"];         // get text violations 
//   const imageV = result.image_violations || ["Couldn't get image violations"];      // get image violations
//   const textS = result.text_suggestions || ["No text suggestions available"];       // get text suggestions
//   const imageS = result.image_suggestions || ["No image suggestions available"];    // get image suggestions

//   // create nicely formatted result text
//   const formattedText = 
//   `
//   Score: ${result.score}
//   Verdict: ${result.verdict}

//   Text Violations:
//   ${textV.length ? textV.map(v => "- " + v).join("\n") : "- None"}

//   Image Violations:
//   ${imageV.length ? imageV.map(v => "- " + v).join("\n") : "- None"}

//   Text Suggestions:
//   ${textS.length ? textS.map(s => "* " + s).join("\n") : "* None"}

//   Image Suggestions:
//   ${imageS.length ? imageS.map(s => "* " + s).join("\n") : "* None"}
//   `;

//   resultArea.innerText = formattedText; // set the text content

//   const slider = document.getElementById("scoreSlider");    // get the score slider
//   const scoreLabel = document.getElementById("scoreValue"); // get score label

//   slider.value = result.score; // update slider
//   scoreLabel.textContent = `Score: ${result.score}`; // update label

//   document.getElementById("aiResultPopup").classList.remove("hidden"); // show popup
//   console.log("API returned:", result); // log for debugging (temp)
// }

function showPopup(result) {
  if (!result || Object.keys(result).length === 0) return; // don’t show if empty

  const popup = document.getElementById("aiResultPopup");
  popup.classList.remove("hidden");
  popup.classList.add("active");

  const score = Number(result.score ?? 0);
  const platform = document.getElementById("platformSelect").value || "—";
  const verdict = (result.verdict || "").trim() || verdictFromScore(score);

  // Badge
  const badge = document.getElementById("verdictBadge");
  badge.textContent = verdict;
  badge.className = "badge " + badgeClass(verdict);

  // Meta
  document.getElementById("platformValue").textContent = platform;
  document.getElementById("overallLabel").textContent = labelFromScore(score);

  // Gauge
  renderGauge(score);

  // Lists
  fillList("textViolations", sanitizeList(result.text_violations));
  fillList("imageViolations", sanitizeList(result.image_violations));
  fillList("textSuggestions", sanitizeList(result.text_suggestions), true);
  fillList("imageSuggestions", sanitizeList(result.image_suggestions), true);

  // Copy button
  document.getElementById("copyReportBtn").onclick = () =>
    copyReport({ score, verdict, platform, result });

  // Center it visually
  popup.scrollIntoView({ behavior: "smooth", block: "center" });
  console.log("AI:", result);
}

function closePopup() {
  const popup = document.getElementById("aiResultPopup");
  popup.classList.add("hidden");
  popup.classList.remove("active");
}

/* ---------- helpers ---------- */

function renderGauge(score) {
  const gauge = document.getElementById("scoreGauge");
  const valueEl = document.getElementById("scoreValue");

  const angle = Math.round((score / 100) * 360);
  const hue = Math.round((score / 100) * 120);

  // update ring color and angle
  gauge.style.setProperty("--angle", angle + "deg");
  gauge.style.setProperty("--gcolor", `hsl(${hue} 90% 55%)`);
  gauge.style.background = `
    radial-gradient(closest-side, #1f1f21 80%, transparent 80%) content-box,
    conic-gradient(hsl(${hue} 90% 55%) ${angle}deg, rgba(255,255,255,.08) 0deg)
  `;

  // animate number count-up
  let current = 0;
  const step = Math.max(1, Math.round(score / 50));
  clearInterval(gauge._timer);
  gauge._timer = setInterval(() => {
    current += step;
    if (current >= score) {
      current = score;
      clearInterval(gauge._timer);
    }
    valueEl.textContent = current;
  }, 20);
}



function fillList(id, arr){
  const el = document.getElementById(id);
  el.innerHTML = "";
  if(!arr || arr.length === 0){
    el.innerHTML = `<li class="empty">None</li>`;
    return;
  }
  arr.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

function sanitizeList(list){
  if(!Array.isArray(list)) return [];
  return list
    .map(s => String(s).trim())
    .filter(Boolean)
    .filter(s => !/^(-\s*)?none$/i.test(s));
}

function verdictFromScore(score){
  if(score >= 80) return "Safe";
  if(score >= 60) return "Borderline";
  return "Risky";
}
function labelFromScore(score){
  if(score >= 90) return "Very Safe";
  if(score >= 80) return "Safe";
  if(score >= 70) return "Moderate";
  if(score >= 60) return "Borderline";
  return "Risky";
}
function badgeClass(verdict){
  const v = verdict.toLowerCase();
  if(v.includes("safe") && !v.includes("border")) return "badge--safe";
  if(v.includes("border")) return "badge--borderline";
  return "badge--risky";
}

function copyReport({ score, verdict, platform, result }){
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

/*
Function to close the AI result popup  
Parameters:  
- None  
Returns:  
- None
*/

