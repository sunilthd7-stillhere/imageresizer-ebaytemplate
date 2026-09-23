// ======================================
// Bulk Image Resizer
// Part 1
// ======================================

const textarea = document.getElementById("urls");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");
const pasteBtn = document.getElementById("pasteBtn");

const removeDuplicates = document.getElementById("removeDuplicates");

const progressFill = document.getElementById("progressFill");
const downloadedText = document.getElementById("downloaded");
const totalText = document.getElementById("total");
const failedText = document.getElementById("failed");
const imageCount = document.getElementById("imageCount");
const statusText = document.getElementById("status");

const failedUrls = document.getElementById("failedUrls");
const copyFailed = document.getElementById("copyFailed");

const CANVAS_SIZE = 1500;
const JPEG_QUALITY = 0.95;
const CONCURRENT_DOWNLOADS = 10;

// ======================================
// Count Images
// ======================================

function updateImageCount() {

    let urls = getUrls();

    imageCount.innerText = urls.length;

}

// ======================================
// Get URLs
// ======================================

function getUrls() {

    let text = textarea.value;

    text = text
        .replace(/,/g, "\n")
        .replace(/\t/g, "\n")
        .replace(/ +/g, "\n");

    let urls = text
        .split(/\r?\n/)
        .map(v => v.trim())
        .filter(v => v.length);

    if (removeDuplicates.checked) {
        urls = [...new Set(urls)];
    }

    return urls;

}

// ======================================
// Paste Event
// ======================================

textarea.addEventListener("paste", function(e){

    e.preventDefault();

    let text = (e.clipboardData || window.clipboardData)
        .getData("text");

    text = text
        .replace(/[,\t ]+/g,"\n")
        .replace(/\n+/g,"\n")
        .trim();

    const start = this.selectionStart;
    const end = this.selectionEnd;

    this.value =
        this.value.substring(0,start) +
        text +
        this.value.substring(end);

    this.selectionStart =
    this.selectionEnd =
        start + text.length;

    updateImageCount();

});

// ======================================
// Typing
// ======================================

textarea.addEventListener("input",updateImageCount);

// ======================================
// Clear
// ======================================

clearBtn.onclick = ()=>{

    textarea.value="";

    failedUrls.value="";

    progressFill.style.width="0%";

    downloadedText.innerText=0;
    totalText.innerText=0;
    failedText.innerText=0;

    statusText.innerText="Waiting...";

    updateImageCount();

};

// ======================================
// Clipboard Button
// ======================================

pasteBtn.onclick = async ()=>{

    try{

        const text = await navigator.clipboard.readText();

        textarea.value +=
            (textarea.value ? "\n":"") +
            text
                .replace(/[,\t ]+/g,"\n")
                .replace(/\n+/g,"\n");

        updateImageCount();

    }catch(e){

        alert("Clipboard permission denied.");

    }

};

// ======================================
// Copy Failed URLs
// ======================================

copyFailed.onclick=()=>{

    navigator.clipboard.writeText(
        failedUrls.value
    );

    alert("Failed URLs copied.");

};

// ======================================
// Progress
// ======================================

function updateProgress(done,total){

    downloadedText.innerText=done;

    totalText.innerText=total;

    let percent=0;

    if(total>0)
        percent=Math.round(done/total*100);

    progressFill.style.width=percent+"%";

}
// ======================================
// Bulk Image Resizer
// Part 2 - Download Manager
// ======================================
async function fetchImage(url) {

    let fetchUrl = url;

    if (url.includes("storefeederimages.blob.core.windows.net")) {

        fetchUrl =
            "https://images.weserv.nl/?url=" +
            url.replace(/^https?:\/\//, "");

    }

    console.log(fetchUrl);

    const response = await fetch(fetchUrl);

    console.log(response);

    return await response.blob();
}
async function fetchImageXX(url) {

    try {
/*
        const response = await fetch(url, {
            mode: "cors",
            cache: "no-cache"
        });
*/
let fetchUrl = url;

if (url.includes("storefeederimages.blob.core.windows.net")) {

    fetchUrl =
        "https://images.weserv.nl/?url=" +
        encodeURIComponent(url.replace(/^https?:\/\//, ""));

}

const response = await fetch(fetchUrl,{
    mode:"cors",
    cache:"no-cache"
});
        
        if (!response.ok)
            throw new Error("HTTP " + response.status);

        const blob = await response.blob();

        return blob;

    } catch (err) {

        throw err;

    }

}

// Extract filename from URL
function getFilename(url, index) {

    try {

        const u = new URL(url);

        const filename = u.searchParams.get("filename");

        if (filename)
            return filename;

        let path = u.pathname.split("/").pop();

        if (path && path.includes("."))
            return path;

    } catch (e) {

    }

    return "image_" + String(index + 1).padStart(4, "0") + ".jpg";

}

// Run promises with concurrency limit
async function runQueue(items, worker, limit = CONCURRENT_DOWNLOADS) {

    let current = 0;

    let running = [];

    async function next() {

        if (current >= items.length)
            return;

        const index = current++;

        const p = worker(items[index], index)
            .catch(console.error)
            .finally(() => {

                running.splice(running.indexOf(p), 1);

            });

        running.push(p);

        let promise = Promise.resolve();

        if (running.length >= limit)
            promise = Promise.race(running);

        await promise;

        await next();

    }

    await next();

    await Promise.all(running);

}

// ======================================
// Download Button
// ======================================

downloadBtn.onclick = async function () {

    const urls = getUrls();

    if (!urls.length) {

        alert("Paste some image URLs first.");

        return;

    }

    downloadBtn.disabled = true;

    failedUrls.value = "";

    failedText.innerText = "0";

    downloadedText.innerText = "0";

    totalText.innerText = urls.length;

    progressFill.style.width = "0%";

    statusText.innerText = "Preparing...";

    const zip = new JSZip();

    let completed = 0;

    let failed = 0;

    await runQueue(

        urls,

        async (url, index) => {

            statusText.innerText =
                "Downloading " + (index + 1) + " of " + urls.length;

            try {

                const blob = await fetchImage(url);

                const filename = getFilename(url, index);

                await processImage(blob, filename, zip);

            } catch (e) {

                failed++;

                failedText.innerText = failed;

                failedUrls.value += url + "\n";

            }

            completed++;

            updateProgress(completed, urls.length);

        },

        CONCURRENT_DOWNLOADS

    );

    statusText.innerText = "Generating ZIP...";

    const content = await zip.generateAsync({

        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
            level: 6
        }

    });

    saveAs(content, "images.zip");

    statusText.innerText =
        "Finished. " +
        completed +
        " processed, " +
        failed +
        " failed.";

    downloadBtn.disabled = false;

};
// ======================================
// Bulk Image Resizer
// Part 3 - Image Resize
// ======================================

async function processImage(blob, filename, zip) {

    return new Promise((resolve, reject) => {

        const img = new Image();

        img.onload = () => {

            try {

                const canvas = document.createElement("canvas");

                canvas.width = CANVAS_SIZE;
                canvas.height = CANVAS_SIZE;

                const ctx = canvas.getContext("2d");

                // White background
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

                const srcWidth = img.width;
                const srcHeight = img.height;

                // Keep aspect ratio
                const scale = Math.min(
                    CANVAS_SIZE / srcWidth,
                    CANVAS_SIZE / srcHeight
                );

                const newWidth = Math.round(srcWidth * scale);
                const newHeight = Math.round(srcHeight * scale);

                const x = Math.round((CANVAS_SIZE - newWidth) / 2);
                const y = Math.round((CANVAS_SIZE - newHeight) / 2);

                // Better resize quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                ctx.drawImage(
                    img,
                    0,
                    0,
                    srcWidth,
                    srcHeight,
                    x,
                    y,
                    newWidth,
                    newHeight
                );
/*
                // Always save as JPG
                canvas.toBlob(function(outputBlob){

                    if(!outputBlob){
                        reject("Canvas conversion failed");
                        return;
                    }

                    let outputName = filename;

                    outputName = outputName.replace(/\.(png|webp|jpeg)$/i, ".jpg");

                    if(!outputName.toLowerCase().endsWith(".jpg"))
                        outputName += ".jpg";

                    zip.file(outputName, outputBlob);

                    resolve();

                }, "image/jpeg", JPEG_QUALITY);
*/
                // Create JPEG
                const jpegData = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
                
                // Create EXIF metadata
                const zeroth = {};
                zeroth[piexif.ImageIFD.XResolution] = [300, 1];
                zeroth[piexif.ImageIFD.YResolution] = [300, 1];
                zeroth[piexif.ImageIFD.ResolutionUnit] = 2;
                
                const exifObj = {
                    "0th": zeroth
                };
                
                const exifBytes = piexif.dump(exifObj);
                
                const jpegWithExif = piexif.insert(exifBytes, jpegData);
                
                // Convert DataURL to Blob
                const byteString = atob(jpegWithExif.split(",")[1]);
                const mimeString = jpegWithExif.split(",")[0].split(":")[1].split(";")[0];
                
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                
                const outputBlob = new Blob([ab], { type: mimeString });
                
                let outputName = filename;
                
                outputName = outputName.replace(/\.(png|webp|jpeg)$/i, ".jpg");
                
                if (!outputName.toLowerCase().endsWith(".jpg")) {
                    outputName += ".jpg";
                }
                
                zip.file(outputName, outputBlob);
                
                resolve();
            }
            catch(ex){

                reject(ex);

            }

        };

        img.onerror = () => {

            reject("Invalid image");

        };

        img.src = URL.createObjectURL(blob);

    });

}
// ======================================
// Bulk Image Resizer
// Part 4 - Final Utilities
// ======================================

// Update image count when duplicate option changes
removeDuplicates.addEventListener("change", updateImageCount);

// Initialise
updateImageCount();

// Format date for ZIP filename
function getZipFilename() {

    const d = new Date();

    const yyyy = d.getFullYear();

    const mm = String(d.getMonth() + 1).padStart(2, "0");

    const dd = String(d.getDate()).padStart(2, "0");

    return `images_${yyyy}-${mm}-${dd}.zip`;

}

// Replace download handler so it uses dated ZIP name
downloadBtn.onclick = async function () {

    const urls = getUrls();

    if (!urls.length) {

        alert("Paste some image URLs first.");

        return;

    }

    downloadBtn.disabled = true;
    clearBtn.disabled = true;
    pasteBtn.disabled = true;

    failedUrls.value = "";
    failedText.innerText = "0";
    downloadedText.innerText = "0";
    totalText.innerText = urls.length;
    progressFill.style.width = "0%";

    const zip = new JSZip();

    let completed = 0;
    let failed = 0;

    const started = Date.now();

    statusText.innerText = "Starting...";

    await runQueue(

        urls,

        async (url, index) => {

            statusText.innerText =
                `Downloading ${index + 1} of ${urls.length}`;

            let success = false;

            // Retry once
            for (let attempt = 1; attempt <= 2; attempt++) {

                try {

                    const blob = await fetchImage(url);

                    const filename = getFilename(url, index);

                    await processImage(blob, filename, zip);

                    success = true;

                    break;

                } catch (e) {

                    if (attempt === 2) {

                        failed++;

                        failedText.innerText = failed;

                        failedUrls.value += url + "\n";

                    }

                }

            }

            completed++;

            updateProgress(completed, urls.length);

        },

        CONCURRENT_DOWNLOADS

    );

    statusText.innerText = "Creating ZIP...";

    const zipBlob = await zip.generateAsync({

        type: "blob",

        compression: "DEFLATE",

        compressionOptions: {

            level: 6

        }

    });

    saveAs(zipBlob, getZipFilename());

    const seconds =
        ((Date.now() - started) / 1000).toFixed(1);

    statusText.innerText =
        `Finished in ${seconds}s • ${completed - failed} downloaded • ${failed} failed`;

    downloadBtn.disabled = false;
    clearBtn.disabled = false;
    pasteBtn.disabled = false;

};

// Prevent dropping non-text files
document.addEventListener("dragover", e => e.preventDefault());

document.addEventListener("drop", e => {

    e.preventDefault();

});

// Keyboard shortcut (Ctrl + Enter)
textarea.addEventListener("keydown", e => {

    if (e.ctrlKey && e.key === "Enter") {

        downloadBtn.click();

    }

});

// Auto-focus textarea
window.onload = () => {

    textarea.focus();

};
