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


// ============================================================
// EBAY IMAGE TEMPLATE
// ============================================================


// ============================================================
// BRAND CONFIGURATION
// ============================================================


const brandSelect =
    document.getElementById("brandSelect");
// ============================================================
// AUTOMATICALLY LOAD BRAND LOGOS FROM GITHUB
// ============================================================

const GITHUB_BRAND_API =
    "https://api.github.com/repos/" +
    "sunilthd7-stillhere/" +
    "imageresizer-ebaytemplate/" +
    "contents/assets/brand-logo";


let BRAND_LOGOS = {};


// ============================================================
// LOAD ALL BRAND LOGOS
// ============================================================

async function loadBrandLogo() {

    return new Promise(
        function(resolve) {

            const brand =
                brandSelect.value;

            if (!brand) {
                resolve(null);
                return;
            }

            const logo =
                new Image();

            logo.onload =
                function() {
                    resolve(logo);
                };

            logo.onerror =
                function() {
                    resolve(null);
                };

            logo.src =
                BRAND_LOGOS[brand];

        }
    );

}


// ============================================================
// CREATE BRAND NAME FROM FILENAME
// ============================================================

function getBrandNameFromFilename(
    filename
) {

    // Remove extension

    let name =
        filename.replace(
            /\.[^/.]+$/,
            ""
        );


    // Replace separators

    name =
        name.replace(
            /[-_]+/g,
            " "
        );


    // Convert to title case

    name =
        name.replace(
            /\w\S*/g,
            function(word) {

                return word.charAt(0)
                    .toUpperCase() +
                    word.substring(1)
                        .toLowerCase();

            }
        );


    return name.trim();

}

// ============================================================
// ELEMENTS
// ============================================================

const templateUrls =
    document.getElementById("templateUrls");

const brandSelect =
    document.getElementById("brandSelect");

const templatePasteBtn =
    document.getElementById("templatePasteBtn");

const templateClearBtn =
    document.getElementById("templateClearBtn");

const templatePreviewBtn =
    document.getElementById("templatePreviewBtn");

const templateDownloadBtn =
    document.getElementById("templateDownloadBtn");

const templatePrevBtn =
    document.getElementById("templatePrevBtn");

const templateNextBtn =
    document.getElementById("templateNextBtn");

const templatePreviewCounter =
    document.getElementById(
        "templatePreviewCounter"
    );

const templateQuality =
    document.getElementById("templateQuality");

const templateCanvas =
    document.getElementById("templatePreview");

const templateCtx =
    templateCanvas.getContext("2d");

const templateImageCount =
    document.getElementById(
        "templateImageCount"
    );

const templateProcessed =
    document.getElementById(
        "templateProcessed"
    );

const templateTotal =
    document.getElementById(
        "templateTotal"
    );

const templateFailed =
    document.getElementById(
        "templateFailed"
    );

const templateProgressFill =
    document.getElementById(
        "templateProgressFill"
    );

const templateStatus =
    document.getElementById(
        "templateStatus"
    );

const templateFailedUrls =
    document.getElementById(
        "templateFailedUrls"
    );

const templateCopyFailed =
    document.getElementById(
        "templateCopyFailed"
    );


// ============================================================
// TEMPLATE DIMENSIONS
// ============================================================

const TEMPLATE_WIDTH = 1500;

const TEMPLATE_HEIGHT = 1500;


// Product area

const PRODUCT_X = 189;

const PRODUCT_Y = 189;

const PRODUCT_WIDTH = 1122;

const PRODUCT_HEIGHT = 1122;


// ============================================================
// BRAND LOGO AREA
// ============================================================
//
// This is the area occupied by the John Guest logo
// in your supplied background.
//
// Adjust these numbers if another brand needs a
// slightly different position.
// ============================================================

const LOGO_X = 60;

const LOGO_Y = 5;

const LOGO_WIDTH = 540;

const LOGO_HEIGHT = 130;


// ============================================================
// BACKGROUND
// ============================================================

const templateBackground =
    new Image();

templateBackground.src =
    "assets/background-frame.jpg";


// ============================================================
// CURRENT PREVIEW
// ============================================================

let templatePreviewIndex = 0;


// ============================================================
// LOAD BRAND LOGO
// ============================================================

function loadBrandLogo() {

    return new Promise(
        function(resolve) {

            const brand =
                brandSelect.value;


            if (!brand) {

                resolve(null);

                return;

            }


            const logo =
                new Image();


            logo.onload =
                function() {

                    resolve(logo);

                };


            logo.onerror =
                function() {

                    console.error(
                        "Brand logo failed:",
                        BRAND_LOGOS[brand]
                    );

                    resolve(null);

                };


            logo.src =
                BRAND_LOGOS[brand];

        }
    );

}


// ============================================================
// GET TEMPLATE URLS
// ============================================================

function getTemplateUrls() {

    let text =
        templateUrls.value;


    // Spaces become new lines

    text =
        text.replace(
            /[ \t]+/g,
            "\n"
        );


    // Commas become new lines

    text =
        text.replace(
            /,/g,
            "\n"
        );


    let urls =
        text
            .split(/\r?\n/)
            .map(
                function(url) {

                    return url.trim();

                }
            )
            .filter(
                function(url) {

                    return url.length > 0;

                }
            );


    // Remove duplicates

    urls =
        [...new Set(urls)];


    return urls;

}


// ============================================================
// UPDATE COUNT
// ============================================================

function updateTemplateCount() {

    const urls =
        getTemplateUrls();


    templateImageCount.innerText =
        urls.length;


    templatePreviewCounter.innerText =
        urls.length
            ? (
                templatePreviewIndex + 1
            ) +
            " / " +
            urls.length
            : "0 / 0";


    updatePreviewButtons();

}


// ============================================================
// PREVIEW BUTTONS
// ============================================================

function updatePreviewButtons() {

    const urls =
        getTemplateUrls();


    if (!urls.length) {

        templatePrevBtn.disabled =
            true;

        templateNextBtn.disabled =
            true;

        return;

    }


    templatePrevBtn.disabled =
        templatePreviewIndex <= 0;


    templateNextBtn.disabled =
        templatePreviewIndex >=
        urls.length - 1;

}


// ============================================================
// STORE IMAGE URL
// ============================================================

function getTemplateImageUrl(url) {

    if (
        url.includes(
            "storefeederimages.blob.core.windows.net"
        )
    ) {

        return (
            "https://images.weserv.nl/?url=" +
            encodeURIComponent(
                url.replace(
                    /^https?:\/\//,
                    ""
                )
            ) +
            "&output=jpg&q=100"
        );

    }


    return url;

}


// ============================================================
// LOAD PRODUCT IMAGE
// ============================================================

function loadTemplateImage(url) {

    return new Promise(
        function(resolve, reject) {

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
                getTemplateImageUrl(
                    url
                );

        }
    );

}


// ============================================================
// DRAW BACKGROUND + BRAND LOGO
// ============================================================

async function drawTemplateBackground() {

    if (
        !templateBackground.complete ||
        !templateBackground.naturalWidth
    ) {

        await new Promise(
            function(resolve) {

                templateBackground.onload =
                    resolve;

            }
        );

    }


    templateCtx.clearRect(
        0,
        0,
        TEMPLATE_WIDTH,
        TEMPLATE_HEIGHT
    );


    // Background

    templateCtx.drawImage(
        templateBackground,
        0,
        0,
        TEMPLATE_WIDTH,
        TEMPLATE_HEIGHT
    );


    // Brand logo

    const logo =
        await loadBrandLogo();


    if (!logo) {

        return;

    }


    const scale =
        Math.min(
            LOGO_WIDTH /
                logo.naturalWidth,

            LOGO_HEIGHT /
                logo.naturalHeight
        );


    const width =
        logo.naturalWidth *
        scale;


    const height =
        logo.naturalHeight *
        scale;


    const x =
        LOGO_X +
        (
            LOGO_WIDTH -
            width
        ) / 2;


    const y =
        LOGO_Y +
        (
            LOGO_HEIGHT -
            height
        ) / 2;


    templateCtx.drawImage(
        logo,
        x,
        y,
        width,
        height
    );

}


// ============================================================
// CREATE EBAY TEMPLATE
// ============================================================

async function createEbayTemplate(
    productUrl,
    quality = 0.95
) {

    // Draw background and logo

    await drawTemplateBackground();


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


    // ========================================================
    // CONTAIN
    // ========================================================

    const scale =
        Math.min(
            PRODUCT_WIDTH /
                sourceWidth,

            PRODUCT_HEIGHT /
                sourceHeight
        );


    const drawWidth =
        Math.round(
            sourceWidth *
            scale
        );


    const drawHeight =
        Math.round(
            sourceHeight *
            scale
        );


    // Centre product

    const drawX =
        PRODUCT_X +
        Math.round(
            (
                PRODUCT_WIDTH -
                drawWidth
            ) / 2
        );


    const drawY =
        PRODUCT_Y +
        Math.round(
            (
                PRODUCT_HEIGHT -
                drawHeight
            ) / 2
        );


    // ========================================================
    // DRAW
    // ========================================================

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


    // ========================================================
    // JPEG
    // ========================================================

    return new Promise(
        function(resolve, reject) {

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


// ============================================================
// FILENAME
// ============================================================

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
        String(
            index + 1
        ).padStart(
            4,
            "0"
        ) +
        "_ebay.jpg"
    );

}


// ============================================================
// PREVIEW CURRENT IMAGE
// ============================================================

async function showTemplatePreview() {

    const urls =
        getTemplateUrls();


    if (!urls.length) {

        templatePreviewCounter.innerText =
            "0 / 0";

        updatePreviewButtons();

        return;

    }


    if (
        templatePreviewIndex < 0
    ) {

        templatePreviewIndex = 0;

    }


    if (
        templatePreviewIndex >=
        urls.length
    ) {

        templatePreviewIndex =
            urls.length - 1;

    }


    templatePreviewCounter.innerText =
        (
            templatePreviewIndex + 1
        ) +
        " / " +
        urls.length;


    updatePreviewButtons();


    templateStatus.innerText =
        "Loading preview " +
        (
            templatePreviewIndex + 1
        ) +
        " of " +
        urls.length +
        "...";


    try {

        await createEbayTemplate(
            urls[
                templatePreviewIndex
            ],
            parseFloat(
                templateQuality.value
            )
        );


        templateStatus.innerText =
            "Preview " +
            (
                templatePreviewIndex + 1
            ) +
            " of " +
            urls.length;

    }
    catch(error) {

        console.error(error);


        templateStatus.innerText =
            "Preview failed.";


        alert(
            "Unable to load this image."
        );

    }

}


// ============================================================
// PREVIOUS
// ============================================================

templatePrevBtn.onclick =
    async function() {

        if (
            templatePreviewIndex <= 0
        ) {

            return;

        }


        templatePreviewIndex--;


        await showTemplatePreview();

    };


// ============================================================
// NEXT
// ============================================================

templateNextBtn.onclick =
    async function() {

        const urls =
            getTemplateUrls();


        if (
            templatePreviewIndex >=
            urls.length - 1
        ) {

            return;

        }


        templatePreviewIndex++;


        await showTemplatePreview();

    };


// ============================================================
// PASTE
// ============================================================

templateUrls.addEventListener(
    "paste",
    function(e) {

        e.preventDefault();


        let text =
            (
                e.clipboardData ||
                window.clipboardData
            ).getData("text");


        text =
            text
                .replace(
                    /[,\t ]+/g,
                    "\n"
                )
                .replace(
                    /\n+/g,
                    "\n"
                )
                .trim();


        const start =
            this.selectionStart;


        const end =
            this.selectionEnd;


        this.value =
            this.value.substring(
                0,
                start
            ) +
            text +
            this.value.substring(
                end
            );


        this.selectionStart =
        this.selectionEnd =
            start +
            text.length;


        templatePreviewIndex = 0;


        updateTemplateCount();

    }
);


// ============================================================
// PASTE CLIPBOARD
// ============================================================

templatePasteBtn.onclick =
    async function() {

        try {

            const text =
                await navigator
                    .clipboard
                    .readText();


            const cleanText =
                text
                    .replace(
                        /[,\t ]+/g,
                        "\n"
                    )
                    .replace(
                        /\n+/g,
                        "\n"
                    )
                    .trim();


            templateUrls.value +=
                (
                    templateUrls.value
                    ? "\n"
                    : ""
                ) +
                cleanText;


            templatePreviewIndex = 0;


            updateTemplateCount();

        }
        catch(error) {

            alert(
                "Clipboard permission denied."
            );

        }

    };


// ============================================================
// TEXTAREA INPUT
// ============================================================

templateUrls.addEventListener(
    "input",
    function() {

        templatePreviewIndex = 0;

        updateTemplateCount();

    }
);


// ============================================================
// BRAND CHANGE
// ============================================================

brandSelect.addEventListener(
    "change",
    async function() {

        const urls =
            getTemplateUrls();


        if (urls.length) {

            await showTemplatePreview();

        }
        else {

            await drawTemplateBackground();

        }

    }
);


// ============================================================
// CLEAR
// ============================================================

templateClearBtn.onclick =
    function() {

        templateUrls.value =
            "";

        templateFailedUrls.value =
            "";

        templatePreviewIndex =
            0;


        templateImageCount.innerText =
            "0";


        templateProcessed.innerText =
            "0";


        templateTotal.innerText =
            "0";


        templateFailed.innerText =
            "0";


        templateProgressFill.style.width =
            "0%";


        templateStatus.innerText =
            "Waiting...";


        updateTemplateCount();


        drawTemplateBackground();

    };


// ============================================================
// PREVIEW BUTTON
// ============================================================

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


        if (!brandSelect.value) {

            alert(
                "Please select a brand first."
            );

            return;

        }


        templatePreviewIndex =
            0;


        templatePreviewBtn.disabled =
            true;


        try {

            await showTemplatePreview();

        }
        finally {

            templatePreviewBtn.disabled =
                false;

        }

    };


// ============================================================
// DOWNLOAD ZIP
// ============================================================

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


        if (!brandSelect.value) {

            alert(
                "Please select a brand first."
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

        templatePrevBtn.disabled =
            true;

        templateNextBtn.disabled =
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
                (
                    i + 1
                ) +
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
                percent +
                "%";

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
            ).padStart(
                2,
                "0"
            ) +
            "-" +
            String(
                date.getDate()
            ).padStart(
                2,
                "0"
            );


        saveAs(
            zipBlob,
            "ebay_template_" +
            dateString +
            ".zip"
        );


        templateStatus.innerText =
            "Finished. " +
            (
                processed - failed
            ) +
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


        updatePreviewButtons();

    };


// ============================================================
// COPY FAILED
// ============================================================

templateCopyFailed.onclick =
    async function() {

        if (
            !templateFailedUrls.value.trim()
        ) {

            return;

        }


        await navigator
            .clipboard
            .writeText(
                templateFailedUrls.value
            );


        templateStatus.innerText =
            "Failed URLs copied.";

    };




// ============================================================
// INITIAL BACKGROUND
// ============================================================

templateBackground.onload =
    async function() {

        await drawTemplateBackground();

    };


// ============================================================
// INITIAL COUNT
// ============================================================

updateTemplateCount();

// ============================================================
// BRAND DROPDOWN INIT
// ============================================================

loadBrandLogos();

// ============================================================
// TAB SYSTEM WITH URL PARAMETER
// ============================================================

const tabButtons =
    document.querySelectorAll(
        ".tabButton"
    );

const tabContents =
    document.querySelectorAll(
        ".tabContent"
    );


function activateTab(
    tabId,
    updateUrl = true
) {

    // Remove active

    tabButtons.forEach(
        function(button) {

            button.classList.remove(
                "active"
            );

        }
    );


    tabContents.forEach(
        function(tab) {

            tab.classList.remove(
                "active"
            );

        }
    );


    // Activate selected

    const button =
        document.querySelector(
            '.tabButton[data-tab="' +
            tabId +
            '"]'
        );


    const tab =
        document.getElementById(
            tabId
        );


    if (!button || !tab) {

        return;

    }


    button.classList.add(
        "active"
    );


    tab.classList.add(
        "active"
    );


    // Update URL

    if (updateUrl) {

        const url =
            new URL(
                window.location.href
            );


        if (
            tabId === "resizeTab"
        ) {

            url.searchParams.set(
                "tab",
                "resize"
            );

        }
        else if (
            tabId === "ebayTab"
        ) {

            url.searchParams.set(
                "tab",
                "ebay"
            );

        }


        window.history.pushState(
            {},
            "",
            url
        );

    }

}


// ============================================================
// TAB CLICK
// ============================================================

tabButtons.forEach(
    function(button) {

        button.addEventListener(
            "click",
            function() {

                activateTab(
                    this.dataset.tab,
                    true
                );

            }
        );

    }
);


// ============================================================
// BACK / FORWARD BUTTON
// ============================================================

window.addEventListener(
    "popstate",
    function() {

        activateTab(
            getTabFromUrl(),
            false
        );

    }
);


// ============================================================
// GET TAB FROM URL
// ============================================================

function getTabFromUrl() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const tab =
        params.get("tab");


    if (tab === "ebay") {

        return "ebayTab";

    }


    return "resizeTab";

}


// ============================================================
// INITIAL TAB
// ============================================================

activateTab(
    getTabFromUrl(),
    false
);
