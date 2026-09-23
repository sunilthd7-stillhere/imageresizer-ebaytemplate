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


//------------------------------------eBay template code
// ============================================================
// EBAY IMAGE TEMPLATE
// ============================================================


// ------------------------------------------------------------
// Template elements
// ------------------------------------------------------------

const templateUrls =
    document.getElementById("templateUrls");

const templatePasteBtn =
    document.getElementById("templatePasteBtn");

const templateClearBtn =
    document.getElementById("templateClearBtn");

const templatePreviewBtn =
    document.getElementById("templatePreviewBtn");

const templateDownloadBtn =
    document.getElementById("templateDownloadBtn");

const templateQuality =
    document.getElementById("templateQuality");

const templateCanvas =
    document.getElementById("templatePreview");

const templateCtx =
    templateCanvas.getContext("2d");

const templateImageCount =
    document.getElementById("templateImageCount");

const templateProcessed =
    document.getElementById("templateProcessed");

const templateTotal =
    document.getElementById("templateTotal");

const templateFailed =
    document.getElementById("templateFailed");

const templateProgressFill =
    document.getElementById("templateProgressFill");

const templateStatus =
    document.getElementById("templateStatus");

const templateFailedUrls =
    document.getElementById("templateFailedUrls");

const templateCopyFailed =
    document.getElementById("templateCopyFailed");


// ------------------------------------------------------------
// Template dimensions
// ------------------------------------------------------------

const TEMPLATE_WIDTH = 1500;

const TEMPLATE_HEIGHT = 1500;


// Product area from your supplied frame
//
// X = 189
// Y = 189
// Width = 1122
// Height = 1122
// ------------------------------------------------------------

const PRODUCT_X = 189;

const PRODUCT_Y = 189;

const PRODUCT_WIDTH = 1122;

const PRODUCT_HEIGHT = 1122;


// ------------------------------------------------------------
// Background image
// ------------------------------------------------------------

const templateBackground =
    new Image();

templateBackground.src =
    "assets/background-frame.jpg";


// ------------------------------------------------------------
// Get template URLs
// ------------------------------------------------------------

function getTemplateUrls() {

    let text =
        templateUrls.value;

    // Spaces
    text = text.replace(/[ \t]+/g, "\n");

    // Commas
    text = text.replace(/,/g, "\n");

    let urls =
        text
            .split(/\r?\n/)
            .map(url => url.trim())
            .filter(url => url.length);

    // Remove duplicates
    urls = [...new Set(urls)];

    return urls;

}


// ------------------------------------------------------------
// Update template count
// ------------------------------------------------------------

function updateTemplateCount() {

    const urls =
        getTemplateUrls();

    templateImageCount.innerText =
        urls.length;

}


// ------------------------------------------------------------
// Paste handling
// ------------------------------------------------------------

templateUrls.addEventListener(
    "paste",
    function(e) {

        e.preventDefault();

        let text =
            (e.clipboardData ||
             window.clipboardData)
            .getData("text");

        text =
            text
                .replace(/[,\t ]+/g, "\n")
                .replace(/\n+/g, "\n")
                .trim();

        const start =
            this.selectionStart;

        const end =
            this.selectionEnd;

        this.value =
            this.value.substring(0, start) +
            text +
            this.value.substring(end);

        this.selectionStart =
        this.selectionEnd =
            start + text.length;

        updateTemplateCount();

    }
);


// ------------------------------------------------------------
// Clipboard button
// ------------------------------------------------------------

templatePasteBtn.onclick =
    async function() {

        try {

            const text =
                await navigator.clipboard.readText();

            const cleanText =
                text
                    .replace(/[,\t ]+/g, "\n")
                    .replace(/\n+/g, "\n")
                    .trim();

            templateUrls.value +=
                (templateUrls.value ? "\n" : "") +
                cleanText;

            updateTemplateCount();

        }
        catch(error) {

            alert(
                "Clipboard permission denied."
            );

        }

    };


// ------------------------------------------------------------
// Clear
// ------------------------------------------------------------

templateClearBtn.onclick =
    function() {

        templateUrls.value = "";

        templateFailedUrls.value = "";

        templateImageCount.innerText = "0";

        templateProcessed.innerText = "0";

        templateTotal.innerText = "0";

        templateFailed.innerText = "0";

        templateProgressFill.style.width = "0%";

        templateStatus.innerText =
            "Waiting...";

        drawTemplateBackground();

    };


// ------------------------------------------------------------
// Template image URL
// ------------------------------------------------------------

function getTemplateImageUrl(url) {

    /*
     * StoreFeeder Azure images do not provide CORS.
     *
     * Use weserv as an image proxy so the browser
     * can read the image.
     */

    if (
        url.includes(
            "storefeederimages.blob.core.windows.net"
        )
    ) {

        return (
            "https://images.weserv.nl/?url=" +
            encodeURIComponent(
                url.replace(/^https?:\/\//, "")
            ) +
            "&output=jpg&q=100"
        );

    }

    return url;

}


// ------------------------------------------------------------
// Load image
// ------------------------------------------------------------

function loadTemplateImage(url) {

    return new Promise(
        (resolve, reject) => {

            const img =
                new Image();

            img.crossOrigin =
                "anonymous";

            img.onload =
                function() {

                    resolve(img);

                };

            img.onerror =
                function() {

                    reject(
                        new Error(
                            "Unable to load image"
                        )
                    );

                };

            img.src =
                getTemplateImageUrl(url);

        }
    );

}


// ------------------------------------------------------------
// Draw background
// ------------------------------------------------------------

function drawTemplateBackground() {

    if (
        !templateBackground.complete ||
        !templateBackground.naturalWidth
    ) {

        templateBackground.onload =
            function() {

                drawTemplateBackground();

            };

        return;

    }

    templateCtx.clearRect(
        0,
        0,
        TEMPLATE_WIDTH,
        TEMPLATE_HEIGHT
    );

    templateCtx.drawImage(
        templateBackground,
        0,
        0,
        TEMPLATE_WIDTH,
        TEMPLATE_HEIGHT
    );

}


// ------------------------------------------------------------
// Draw product image
// ------------------------------------------------------------

async function createEbayTemplate(
    productUrl,
    quality = 0.95
) {

    // Draw frame first

    drawTemplateBackground();


    // Load product

    const img =
        await loadTemplateImage(
            productUrl
        );


    const sourceWidth =
        img.naturalWidth;

    const sourceHeight =
        img.naturalHeight;


    if (
        !sourceWidth ||
        !sourceHeight
    ) {

        throw new Error(
            "Invalid image dimensions"
        );

    }


    // --------------------------------------------
    // Calculate contain dimensions
    // --------------------------------------------

    const scale =
        Math.min(
            PRODUCT_WIDTH / sourceWidth,
            PRODUCT_HEIGHT / sourceHeight
        );


    const drawWidth =
        Math.round(
            sourceWidth * scale
        );


    const drawHeight =
        Math.round(
            sourceHeight * scale
        );


    // Centre inside product area

    const drawX =
        PRODUCT_X +
        Math.round(
            (PRODUCT_WIDTH - drawWidth) / 2
        );


    const drawY =
        PRODUCT_Y +
        Math.round(
            (PRODUCT_HEIGHT - drawHeight) / 2
        );


    // --------------------------------------------
    // Draw product
    // --------------------------------------------

    templateCtx.imageSmoothingEnabled =
        true;

    templateCtx.imageSmoothingQuality =
        "high";


    templateCtx.drawImage(
        img,

        0,
        0,
        sourceWidth,
        sourceHeight,

        drawX,
        drawY,
        drawWidth,
        drawHeight
    );


    // --------------------------------------------
    // Convert to JPEG
    // --------------------------------------------

    return new Promise(
        (resolve, reject) => {

            templateCanvas.toBlob(
                function(blob) {

                    if (!blob) {

                        reject(
                            new Error(
                                "JPEG conversion failed"
                            )
                        );

                        return;

                    }

                    resolve(blob);

                },
                "image/jpeg",
                quality
            );

        }
    );

}


// ------------------------------------------------------------
// Filename
// ------------------------------------------------------------

function getTemplateFilename(
    url,
    index
) {

    try {

        const parsed =
            new URL(url);

        let filename =
            parsed.searchParams.get(
                "filename"
            );


        if (filename) {

            filename =
                decodeURIComponent(
                    filename
                );

            filename =
                filename.replace(
                    /\.[^/.]+$/,
                    ""
                );

            return (
                filename +
                "_ebay.jpg"
            );

        }


        let path =
            parsed.pathname
                .split("/")
                .pop();


        if (path) {

            path =
                path.replace(
                    /\.[^/.]+$/,
                    ""
                );

            return (
                path +
                "_ebay.jpg"
            );

        }

    }
    catch(error) {

    }


    return (
        "image_" +
        String(index + 1)
            .padStart(4, "0") +
        "_ebay.jpg"
    );

}


// ------------------------------------------------------------
// Preview
// ------------------------------------------------------------

templatePreviewBtn.onclick =
    async function() {

        const urls =
            getTemplateUrls();

        if (!urls.length) {

            alert(
                "Please paste an image URL first."
            );

            return;

        }

        templatePreviewBtn.disabled =
            true;

        templateStatus.innerText =
            "Creating preview...";


        try {

            await createEbayTemplate(
                urls[0],
                parseFloat(
                    templateQuality.value
                )
            );

            templateStatus.innerText =
                "Preview created.";

        }
        catch(error) {

            console.error(error);

            templateStatus.innerText =
                "Preview failed.";

            alert(
                "Unable to load the image."
            );

        }


        templatePreviewBtn.disabled =
            false;

    };


// ------------------------------------------------------------
// Download ZIP
// ------------------------------------------------------------

templateDownloadBtn.onclick =
    async function() {

        const urls =
            getTemplateUrls();

        if (!urls.length) {

            alert(
                "Please paste product image URLs first."
            );

            return;

        }


        templateDownloadBtn.disabled =
            true;

        templatePreviewBtn.disabled =
            true;

        templateClearBtn.disabled =
            true;

        templatePasteBtn.disabled =
            true;


        templateFailedUrls.value =
            "";

        templateProcessed.innerText =
            "0";

        templateTotal.innerText =
            urls.length;

        templateFailed.innerText =
            "0";

        templateProgressFill.style.width =
            "0%";


        const zip =
            new JSZip();


        const quality =
            parseFloat(
                templateQuality.value
            );


        let processed = 0;

        let failed = 0;


        for (
            let i = 0;
            i < urls.length;
            i++
        ) {

            const url =
                urls[i];


            templateStatus.innerText =
                "Processing " +
                (i + 1) +
                " of " +
                urls.length;


            try {

                const blob =
                    await createEbayTemplate(
                        url,
                        quality
                    );


                const filename =
                    getTemplateFilename(
                        url,
                        i
                    );


                zip.file(
                    filename,
                    blob
                );

            }
            catch(error) {

                console.error(
                    url,
                    error
                );


                failed++;


                templateFailed.innerText =
                    failed;


                templateFailedUrls.value +=
                    url +
                    "\n";

            }


            processed++;


            templateProcessed.innerText =
                processed;


            const percent =
                Math.round(
                    processed /
                    urls.length *
                    100
                );


            templateProgressFill.style.width =
                percent + "%";

        }


        templateStatus.innerText =
            "Creating ZIP...";


        const zipBlob =
            await zip.generateAsync({

                type: "blob",

                compression: "DEFLATE",

                compressionOptions: {
                    level: 6
                }

            });


        const date =
            new Date();


        const dateString =
            date.getFullYear() +
            "-" +
            String(
                date.getMonth() + 1
            ).padStart(2, "0") +
            "-" +
            String(
                date.getDate()
            ).padStart(2, "0");


        saveAs(
            zipBlob,
            "ebay_template_" +
            dateString +
            ".zip"
        );


        templateStatus.innerText =
            "Finished. " +
            (processed - failed) +
            " created, " +
            failed +
            " failed.";


        templateDownloadBtn.disabled =
            false;

        templatePreviewBtn.disabled =
            false;

        templateClearBtn.disabled =
            false;

        templatePasteBtn.disabled =
            false;

    };


// ------------------------------------------------------------
// Copy failed URLs
// ------------------------------------------------------------

templateCopyFailed.onclick =
    async function() {

        if (
            !templateFailedUrls.value.trim()
        ) {

            return;

        }


        await navigator.clipboard.writeText(
            templateFailedUrls.value
        );


        templateStatus.innerText =
            "Failed URLs copied.";

    };


// ------------------------------------------------------------
// Count URLs
// ------------------------------------------------------------

templateUrls.addEventListener(
    "input",
    updateTemplateCount
);


// ------------------------------------------------------------
// Tabs
// ------------------------------------------------------------

document
    .querySelectorAll(".tabButton")
    .forEach(function(button) {

        button.addEventListener(
            "click",
            function() {

                const tabId =
                    this.dataset.tab;


                document
                    .querySelectorAll(
                        ".tabButton"
                    )
                    .forEach(function(btn) {

                        btn.classList.remove(
                            "active"
                        );

                    });


                document
                    .querySelectorAll(
                        ".tabContent"
                    )
                    .forEach(function(tab) {

                        tab.classList.remove(
                            "active"
                        );

                    });


                this.classList.add(
                    "active"
                );


                document
                    .getElementById(tabId)
                    .classList.add(
                        "active"
                    );

            }
        );

    });


// ------------------------------------------------------------
// Initialise template preview
// ------------------------------------------------------------

templateBackground.onload =
    function() {

        drawTemplateBackground();

    };


// Initial count

updateTemplateCount();
