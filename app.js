"use strict";

/* ============================================================
   IMAGE TOOLS
   - Resize Image      : bulk resize to square JPEG, white background, 300 DPI
   - eBay Template     : product image inside brand frame + logo
   - Brand Logos       : everyone can view; only the repo owner can upload/delete
   ============================================================ */


/* ============================================================
   SETTINGS - change these if needed
   ============================================================ */

const CONFIG = {

    githubOwner: "sunilthd7-stillhere",
    githubRepo: "imageresizer-ebaytemplate",
    brandPath: "assets/brand-logo",
    backgroundFrame: "assets/background-frame.jpg",

    dpi: 300,
    resizeQuality: 0.95,
    concurrentDownloads: 6,

    template: {
        width: 1500,
        height: 1500,
        product: { x: 189, y: 189, w: 1122, h: 1122 },
        logo: { x: 60, y: 20, w: 540, h: 130 }
    },

    // Multi-image template (variation listing main image)
    multi: {
        gap: 24,          // space between images (px)
        maxImages: 15     // first image big + up to 14 around it
    },

    // Hosts that block direct browser downloads (CORS) - always use the proxy.
    proxyHosts: [
        "storefeederimages.blob.core.windows.net"
    ],

    // Brand list is cached so we stay under GitHub's 60 requests/hour limit.
    brandCacheMinutes: 10,

    maxLogoBytes: 2 * 1024 * 1024
};

const GITHUB_API =
    "https://api.github.com/repos/" +
    CONFIG.githubOwner + "/" + CONFIG.githubRepo;

const $ = function(id) {
    return document.getElementById(id);
};


/* ============================================================
   SMALL HELPERS
   ============================================================ */

function storageGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
}

function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch (e) { /* ignore */ }
}

function storageRemove(store, key) {
    try { store.removeItem(key); } catch (e) { /* ignore */ }
}

function setStatus(el, message, type) {
    el.textContent = message;
    el.classList.toggle("error", type === "error");
    el.classList.toggle("ok", type === "ok");
}

function todayString() {
    const d = new Date();
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function downloadBlob(blob, filename) {

    if (typeof saveAs === "function") {
        saveAs(blob, filename);
        return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        return false;
    }
}

/* Run a worker over items with a concurrency limit. */
async function runPool(items, limit, worker) {

    let next = 0;

    const runners = [];

    for (let r = 0; r < Math.min(limit, items.length); r++) {

        runners.push((async function() {
            while (next < items.length) {
                const index = next++;
                await worker(items[index], index);
            }
        })());
    }

    await Promise.all(runners);
}


/* ============================================================
   URL LIST HELPERS
   ============================================================ */

function parseUrlList(text, removeDuplicates) {

    let urls = text
        .split(/[\s,]+/)
        .map(function(v) { return v.trim(); })
        .filter(Boolean);

    if (removeDuplicates) {
        urls = [...new Set(urls)];
    }

    return urls;
}

function cleanPastedText(text) {
    return text.split(/[\s,]+/).filter(Boolean).join("\n");
}

/* Paste into a textarea: put each URL on its own line. */
function attachPasteCleaner(textarea, onChange) {

    textarea.addEventListener("paste", function(e) {

        const data = (e.clipboardData || window.clipboardData);

        if (!data) {
            return;
        }

        e.preventDefault();

        let text = cleanPastedText(data.getData("text"));

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);

        if (before && !/\s$/.test(before)) text = "\n" + text;
        if (after && !/^\s/.test(after)) text = text + "\n";

        textarea.setRangeText(text, start, end, "end");

        onChange();
    });

    textarea.addEventListener("input", onChange);
}

async function appendClipboard(textarea, onChange) {

    try {

        const text = cleanPastedText(await navigator.clipboard.readText());

        if (!text) {
            return;
        }

        textarea.value +=
            (textarea.value && !/\n$/.test(textarea.value) ? "\n" : "") + text;

        onChange();

    } catch (e) {
        alert("Clipboard permission denied. Please paste with Ctrl+V instead.");
    }
}

/* Filename (without extension) taken from ?filename= or the URL path. */
function baseNameFromUrl(url, index) {

    try {

        const u = new URL(url);

        let name =
            u.searchParams.get("filename") ||
            decodeURIComponent(u.pathname.split("/").pop() || "");

        name = name
            .replace(/\.[^.]+$/, "")
            .replace(/[\\/:*?"<>|]+/g, "_")
            .trim();

        if (name) {
            return name;
        }

    } catch (e) { /* fall through */ }

    return "image_" + String(index + 1).padStart(4, "0");
}

/* Stops two URLs with the same filename overwriting each other in the ZIP. */
function makeUniqueNames(urls, suffix) {

    const used = new Set();

    return urls.map(function(url, i) {

        const base = baseNameFromUrl(url, i) + suffix;

        let name = base + ".jpg";
        let n = 2;

        while (used.has(name.toLowerCase())) {
            name = base + "_" + n++ + ".jpg";
        }

        used.add(name.toLowerCase());

        return name;
    });
}


/* ============================================================
   IMAGE LOADING
   Tries the image directly first; if the site blocks it (CORS)
   or the browser can't read the format, retries via images.weserv.nl.
   The proxy returns PNG so transparency is kept - we then paint
   white behind it ourselves.
   ============================================================ */

function proxyUrl(url) {
    return "https://images.weserv.nl/?url=" +
        encodeURIComponent(url) +
        "&output=png";
}

function mustUseProxy(url) {
    try {
        const host = new URL(url).hostname;
        return CONFIG.proxyHosts.some(function(h) {
            return host === h || host.endsWith("." + h);
        });
    } catch (e) {
        return false;
    }
}

async function fetchBlob(url) {

    const response = await fetch(url, { mode: "cors", cache: "no-store" });

    if (!response.ok) {
        throw new Error("HTTP " + response.status);
    }

    const blob = await response.blob();

    if (!blob.size) {
        throw new Error("Empty file");
    }

    if (/text\/html|application\/json/i.test(blob.type)) {
        throw new Error("Link is a web page, not an image");
    }

    return blob;
}

/* Returns something drawImage() can use: an ImageBitmap or an <img>. */
async function decodeBlob(blob) {

    const isSvg = /svg/i.test(blob.type);

    if (!isSvg && typeof createImageBitmap === "function") {
        try {
            return await createImageBitmap(blob);
        } catch (e) { /* fall back to <img> */ }
    }

    const objectUrl = URL.createObjectURL(blob);

    try {

        const img = new Image();
        img.src = objectUrl;
        await img.decode();

        if (!img.naturalWidth) {
            throw new Error("no size");
        }

        return img;

    } catch (e) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Browser could not read this image format");
    }
}

async function loadImageFromUrl(url) {

    if (!/^https?:\/\//i.test(url)) {
        throw new Error("Not a valid http(s) link");
    }

    const attempts = mustUseProxy(url)
        ? [proxyUrl(url)]
        : [url, proxyUrl(url)];

    let lastError = null;

    for (const attempt of attempts) {
        try {
            return await decodeBlob(await fetchBlob(attempt));
        } catch (e) {
            lastError = e;
        }
    }

    throw new Error(
        (lastError && lastError.message) || "Unable to load image"
    );
}

function sizeOf(img) {
    return {
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height
    };
}

/* Draw an image centred inside a box, keeping aspect ratio.
   whiteBehind: paint white first so transparent PNG/GIF areas become white. */
function drawContain(ctx, img, box, whiteBehind) {

    const size = sizeOf(img);

    const scale = Math.min(box.w / size.w, box.h / size.h);

    const w = Math.round(size.w * scale);
    const h = Math.round(size.h * scale);
    const x = box.x + Math.round((box.w - w) / 2);
    const y = box.y + Math.round((box.h - h) / 2);

    if (whiteBehind) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, w, h);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(img, 0, 0, size.w, size.h, x, y, w, h);
}


/* ============================================================
   JPEG + 300 DPI
   Writes the DPI straight into the JPEG's JFIF header,
   so no extra library (piexif) is needed.
   ============================================================ */

function canvasToJpeg(canvas, quality) {
    return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
            if (blob && blob.size) {
                resolve(blob);
            } else {
                reject(new Error("Could not create JPEG"));
            }
        }, "image/jpeg", quality);
    });
}

async function setJpegDpi(blob, dpi) {

    const bytes = new Uint8Array(await blob.arrayBuffer());

    const hi = (dpi >> 8) & 255;
    const lo = dpi & 255;

    const hasJfif =
        bytes[0] === 0xFF && bytes[1] === 0xD8 &&
        bytes[2] === 0xFF && bytes[3] === 0xE0 &&
        bytes[6] === 0x4A && bytes[7] === 0x46 &&
        bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0x00;

    if (hasJfif) {
        bytes[13] = 1;          // units: dots per inch
        bytes[14] = hi; bytes[15] = lo;   // X density
        bytes[16] = hi; bytes[17] = lo;   // Y density
        return new Blob([bytes], { type: "image/jpeg" });
    }

    // No JFIF header (some browsers) - insert one after the start marker.
    const app0 = new Uint8Array([
        0xFF, 0xE0, 0x00, 0x10,
        0x4A, 0x46, 0x49, 0x46, 0x00,
        0x01, 0x01,
        0x01, hi, lo, hi, lo,
        0x00, 0x00
    ]);

    return new Blob(
        [bytes.subarray(0, 2), app0, bytes.subarray(2)],
        { type: "image/jpeg" }
    );
}

async function canvasToDpiJpeg(canvas, quality) {
    return setJpegDpi(await canvasToJpeg(canvas, quality), CONFIG.dpi);
}


/* ============================================================
   TABS  (?tab=resize | ebay | settings)
   ============================================================ */

const TAB_PARAM = {
    resizeTab: "resize",
    ebayTab: "ebay",
    settingsTab: "settings"
};

const tabButtons = document.querySelectorAll(".tabButton");
const tabContents = document.querySelectorAll(".tabContent");

function activateTab(tabId, updateUrl) {

    if (!TAB_PARAM[tabId]) {
        tabId = "resizeTab";
    }

    tabButtons.forEach(function(b) {
        b.classList.toggle("active", b.dataset.tab === tabId);
    });

    tabContents.forEach(function(t) {
        t.classList.toggle("active", t.id === tabId);
    });

    if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", TAB_PARAM[tabId]);
        history.pushState({}, "", url);
    }
}

function getTabFromUrl() {

    const tab = new URLSearchParams(window.location.search).get("tab");

    for (const id in TAB_PARAM) {
        if (TAB_PARAM[id] === tab) {
            return id;
        }
    }

    return "resizeTab";
}

tabButtons.forEach(function(button) {
    button.addEventListener("click", function() {
        activateTab(button.dataset.tab, true);
    });
});

window.addEventListener("popstate", function() {
    activateTab(getTabFromUrl(), false);
});

activateTab(getTabFromUrl(), false);


/* ============================================================
   RESIZE IMAGE TAB
   ============================================================ */

const R = {
    urls: $("urls"),
    paste: $("pasteBtn"),
    clear: $("clearBtn"),
    download: $("downloadBtn"),
    dedupe: $("removeDuplicates"),
    size: $("resizeSize"),
    fill: $("progressFill"),
    done: $("downloaded"),
    total: $("total"),
    failed: $("failed"),
    count: $("imageCount"),
    status: $("status"),
    failedList: $("failedUrls"),
    copyFailed: $("copyFailed")
};

let resizeBusy = false;

function getResizeUrls() {
    return parseUrlList(R.urls.value, R.dedupe.checked);
}

function updateResizeCount() {
    R.count.textContent = getResizeUrls().length;
}

function setResizeBusy(busy) {
    resizeBusy = busy;
    R.download.disabled = busy;
    R.clear.disabled = busy;
    R.paste.disabled = busy;
    R.size.disabled = busy;
}

function updateResizeProgress(done, total) {
    R.done.textContent = done;
    R.total.textContent = total;
    R.fill.style.width = (total ? Math.round(done / total * 100) : 0) + "%";
}

async function resizeToJpeg(url, size) {

    const img = await loadImageFromUrl(url);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");

    // White background - transparent PNG/GIF become white
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    drawContain(ctx, img, { x: 0, y: 0, w: size, h: size }, false);

    if (img.close) img.close();

    return canvasToDpiJpeg(canvas, CONFIG.resizeQuality);
}

// Remember the chosen size on this computer
(function() {
    const saved = storageGet(localStorage, "resizeSize");
    if (saved && R.size.querySelector('option[value="' + saved + '"]')) {
        R.size.value = saved;
    }
    R.size.addEventListener("change", function() {
        storageSet(localStorage, "resizeSize", R.size.value);
    });
})();

attachPasteCleaner(R.urls, updateResizeCount);

R.dedupe.addEventListener("change", updateResizeCount);

R.paste.addEventListener("click", function() {
    appendClipboard(R.urls, updateResizeCount);
});

R.clear.addEventListener("click", function() {
    R.urls.value = "";
    R.failedList.value = "";
    R.failed.textContent = "0";
    updateResizeProgress(0, 0);
    setStatus(R.status, "Waiting...");
    updateResizeCount();
});

R.copyFailed.addEventListener("click", async function() {
    if (!R.failedList.value.trim()) return;
    if (await copyText(R.failedList.value)) {
        setStatus(R.status, "Failed URLs copied.", "ok");
    }
});

R.urls.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === "Enter") {
        R.download.click();
    }
});

R.download.addEventListener("click", async function() {

    if (resizeBusy) return;

    const urls = getResizeUrls();

    if (!urls.length) {
        alert("Paste some image URLs first.");
        return;
    }

    if (typeof JSZip === "undefined") {
        alert("JSZip did not load. Please refresh the page.");
        return;
    }

    const size = parseInt(R.size.value, 10) || 1500;
    const names = makeUniqueNames(urls, "");
    const zip = new JSZip();
    const started = Date.now();
    const failures = [];

    let completed = 0;
    let succeeded = 0;

    setResizeBusy(true);
    R.failedList.value = "";
    R.failed.textContent = "0";
    updateResizeProgress(0, urls.length);
    setStatus(R.status, "Starting...");

    await runPool(urls, CONFIG.concurrentDownloads, async function(url, index) {

        let lastError = null;

        // Try twice
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const blob = await resizeToJpeg(url, size);
                zip.file(names[index], blob);
                succeeded++;
                lastError = null;
                break;
            } catch (e) {
                lastError = e;
            }
        }

        if (lastError) {
            console.warn("Resize failed:", url, lastError);
            failures.push(url + "   (" + lastError.message + ")");
            R.failed.textContent = failures.length;
            R.failedList.value = failures.join("\n");
        }

        completed++;
        updateResizeProgress(completed, urls.length);
        setStatus(R.status, "Processed " + completed + " of " + urls.length + "...");
    });

    if (!succeeded) {
        setStatus(
            R.status,
            "No images could be processed, so no ZIP was created.\n" +
            "See the Failed URLs box below for the reason.",
            "error"
        );
        setResizeBusy(false);
        return;
    }

    try {

        setStatus(R.status, "Creating ZIP...");

        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        });

        downloadBlob(zipBlob, "images_" + size + "_" + todayString() + ".zip");

        const seconds = ((Date.now() - started) / 1000).toFixed(1);

        setStatus(
            R.status,
            "Finished in " + seconds + "s • " + succeeded + " resized • " +
            failures.length + " failed",
            failures.length ? "" : "ok"
        );

    } catch (e) {
        setStatus(R.status, "ZIP creation failed: " + e.message, "error");
    }

    setResizeBusy(false);
});

updateResizeCount();


/* ============================================================
   BRAND LOGOS - shared by the eBay tab and the Brand Logos tab
   ============================================================ */

const BRAND_CACHE_KEY = "brandListCache_v2";
const TOKEN_KEY = "thd_github_token";

let brands = [];            // [{ name, fileName, path, sha, url, pagesUrl }]
let ownerLogin = null;      // set when a valid owner token is unlocked
const logoCache = new Map();

function getToken() {
    return storageGet(sessionStorage, TOKEN_KEY) ||
        storageGet(localStorage, TOKEN_KEY) || "";
}

function githubHeaders(withToken) {

    const headers = { "Accept": "application/vnd.github+json" };

    const token = getToken();

    if (withToken && token) {
        headers["Authorization"] = "Bearer " + token;
    }

    return headers;
}

/* "john-guest.png" -> "John Guest".  "JG-Speedfit.png" -> "JG Speedfit" */
function brandNameFromFile(filename) {
    return filename
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim()
        .split(/\s+/)
        .map(function(word) {
            return word === word.toLowerCase()
                ? word.charAt(0).toUpperCase() + word.slice(1)
                : word;
        })
        .join(" ");
}

/* "John Guest" -> "John-Guest" (safe filename, keeps capitals) */
function brandSlug(name) {
    return name.trim()
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function isImageFile(name) {
    return /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

function readBrandCache() {
    try {
        const raw = storageGet(localStorage, BRAND_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

async function fetchBrandList(force) {

    const cache = readBrandCache();

    const fresh = cache &&
        Date.now() - cache.time < CONFIG.brandCacheMinutes * 60000;

    if (!force && fresh) {
        return { items: cache.items, note: "" };
    }

    try {

        const response = await fetch(
            GITHUB_API + "/contents/" + encodePath(CONFIG.brandPath),
            { headers: githubHeaders(!!ownerLogin), cache: "no-store" }
        );

        if (response.status === 404) {
            return { items: [], note: "" };
        }

        if (!response.ok) {

            const limited =
                response.status === 403 || response.status === 429;

            throw new Error(
                limited
                    ? "GitHub request limit reached - please try again in a few minutes."
                    : "GitHub API error " + response.status
            );
        }

        const files = await response.json();

        const items = (Array.isArray(files) ? files : [])
            .filter(function(f) { return f.type === "file" && isImageFile(f.name); })
            .map(function(f) {
                return {
                    name: brandNameFromFile(f.name),
                    fileName: f.name,
                    path: f.path,
                    sha: f.sha,
                    // Direct from GitHub: available immediately after upload
                    url: f.download_url + "?v=" + f.sha.slice(0, 10),
                    // Backup: from the GitHub Pages site
                    pagesUrl: new URL(f.path, document.baseURI).href
                };
            })
            .sort(function(a, b) {
                return a.name.localeCompare(b.name, undefined, {
                    numeric: true, sensitivity: "base"
                });
            });

        storageSet(localStorage, BRAND_CACHE_KEY,
            JSON.stringify({ time: Date.now(), items: items }));

        return { items: items, note: "" };

    } catch (e) {

        if (cache) {
            return {
                items: cache.items,
                note: "Showing saved list (" + e.message + ")"
            };
        }

        throw e;
    }
}

function clearBrandCache() {
    storageRemove(localStorage, BRAND_CACHE_KEY);
}

async function loadBrands(force) {

    E.brand.disabled = true;
    S.count.textContent = "Loading...";

    try {

        const result = await fetchBrandList(force);

        brands = result.items;

        fillBrandDropdown();
        renderBrandList(result.note);

    } catch (e) {

        console.error("Brand loading failed:", e);

        brands = [];

        E.brand.innerHTML = '<option value="">Unable to load brands</option>';
        S.count.textContent = "Unable to load brand logos";
        S.list.innerHTML = "";

        const msg = document.createElement("p");
        msg.className = "statusText error";
        msg.textContent = e.message;
        S.list.appendChild(msg);
    }
}

function findBrand(name) {
    return brands.find(function(b) { return b.name === name; }) || null;
}

async function loadLogoImage(brand) {

    async function fromUrl(url) {
        let blob = await fetchBlob(url);
        // GitHub serves SVG as text/plain - fix the type so it can be drawn
        if (/\.svg$/i.test(brand.fileName)) {
            blob = new Blob([blob], { type: "image/svg+xml" });
        }
        return decodeBlob(blob);
    }

    try {
        return await fromUrl(brand.url);
    } catch (e) {
        return await fromUrl(brand.pagesUrl);
    }
}

function getLogo(brandName) {

    const brand = findBrand(brandName);

    if (!brand) {
        return Promise.resolve(null);
    }

    const key = brand.path + "@" + brand.sha;

    if (!logoCache.has(key)) {

        const promise = loadLogoImage(brand).catch(function(e) {
            logoCache.delete(key);
            throw new Error("Logo for " + brand.name + " could not be loaded");
        });

        logoCache.set(key, promise);
    }

    return logoCache.get(key);
}


/* ============================================================
   EBAY TEMPLATE TAB
   ============================================================ */

const E = {
    brand: $("brandSelect"),
    urls: $("templateUrls"),
    paste: $("templatePasteBtn"),
    clear: $("templateClearBtn"),
    preview: $("templatePreviewBtn"),
    download: $("templateDownloadBtn"),
    prev: $("templatePrevBtn"),
    next: $("templateNextBtn"),
    counter: $("templatePreviewCounter"),
    quality: $("templateQuality"),
    removeWhite: $("templateRemoveWhite"),
    mode: $("templateMode"),
    canvas: $("templatePreview"),
    count: $("templateImageCount"),
    processed: $("templateProcessed"),
    total: $("templateTotal"),
    failed: $("templateFailed"),
    fill: $("templateProgressFill"),
    status: $("templateStatus"),
    failedList: $("templateFailedUrls"),
    copyFailed: $("templateCopyFailed")
};

const previewCtx = E.canvas.getContext("2d");

let previewIndex = 0;
let previewSeq = 0;
let templateBusy = false;
let backgroundPromise = null;

// Small cache so switching brand / Previous / Next doesn't re-download
const previewImageCache = new Map();

function getBackground() {

    if (!backgroundPromise) {

        backgroundPromise = fetchBlob(CONFIG.backgroundFrame)
            .then(decodeBlob)
            .catch(function(e) {
                backgroundPromise = null;
                throw new Error(
                    "Background frame not found (" + CONFIG.backgroundFrame + ")"
                );
            });
    }

    return backgroundPromise;
}

function getPreviewImage(url) {

    if (!previewImageCache.has(url)) {

        const promise = loadImageFromUrl(url).catch(function(e) {
            previewImageCache.delete(url);
            throw e;
        });

        previewImageCache.set(url, promise);

        // keep only the last 20
        if (previewImageCache.size > 20) {
            previewImageCache.delete(previewImageCache.keys().next().value);
        }
    }

    return previewImageCache.get(url);
}

function isMultiMode() {
    return E.mode.value === "multi";
}

/* ------------------------------------------------------------
   MULTI-IMAGE LAYOUT
   First image big (top-left), the rest in cells around it:
     2-4 images : big image left, small images stacked on the right
     5+ images  : big image top-left, small images down the right
                  side and along the bottom (L shape)
   Every image gets its own box with a gap, so nothing overlaps.
   ------------------------------------------------------------ */
function collageLayout(count, area) {

    const gap = CONFIG.multi.gap;
    const others = count - 1;

    if (others <= 0) {
        return [area];
    }

    const boxes = [];

    // 2 - 4 images: one column on the right
    if (others <= 3) {

        const cell = Math.floor((area.h - gap * 2) / 3);
        const mainW = area.w - cell - gap;

        boxes.push({ x: area.x, y: area.y, w: mainW, h: area.h });

        const columnH = others * cell + (others - 1) * gap;
        let y = area.y + Math.round((area.h - columnH) / 2);

        for (let i = 0; i < others; i++) {
            boxes.push({ x: area.x + mainW + gap, y: y, w: cell, h: cell });
            y += cell + gap;
        }

        return boxes;
    }

    // 5+ images: grid of g x g cells, big image takes (g-1) x (g-1)
    const g = Math.max(3, Math.ceil((others + 1) / 2));
    const cellW = (area.w - gap * (g - 1)) / g;
    const cellH = (area.h - gap * (g - 1)) / g;

    function cellBox(col, row, offsetX) {
        return {
            x: Math.round(area.x + (offsetX || 0) + col * (cellW + gap)),
            y: Math.round(area.y + row * (cellH + gap)),
            w: Math.floor(cellW),
            h: Math.floor(cellH)
        };
    }

    // Big image
    boxes.push({
        x: area.x,
        y: area.y,
        w: Math.floor((g - 1) * cellW + (g - 2) * gap),
        h: Math.floor((g - 1) * cellH + (g - 2) * gap)
    });

    // Right column, top to bottom
    for (let row = 0; row < g && boxes.length < count; row++) {
        boxes.push(cellBox(g - 1, row));
    }

    // Bottom row, centred under the big image
    const remaining = count - boxes.length;
    const offsetX = ((g - 1) - remaining) * (cellW + gap) / 2;

    for (let col = 0; col < remaining; col++) {
        boxes.push(cellBox(col, g - 1, offsetX));
    }

    return boxes;
}

function drawProduct(ctx, img, box) {

    if (E.removeWhite.checked) {

        // "Multiply" blend: white in the product photo becomes see-through,
        // so the frame / badges behind it are not covered by a white box.
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        drawContain(ctx, img, box, false);
        ctx.restore();

    } else {

        // Normal: product drawn on a white box
        drawContain(ctx, img, box, true);
    }
}

/* products: array of images (1 = single layout, 2+ = multi layout) */
function drawTemplate(ctx, background, logo, products) {

    const T = CONFIG.template;

    ctx.clearRect(0, 0, T.width, T.height);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, T.width, T.height);

    if (background) {
        ctx.drawImage(background, 0, 0, T.width, T.height);
    }

    if (logo) {
        drawContain(ctx, logo, T.logo, false);
    }

    const list = products || [];

    if (!list.length) {
        return;
    }

    const boxes = collageLayout(list.length, T.product);

    list.forEach(function(img, i) {
        drawProduct(ctx, img, boxes[i]);
    });
}

function getTemplateUrls() {
    return parseUrlList(E.urls.value, true);
}

function updateTemplateCount() {

    const urls = getTemplateUrls();

    if (previewIndex > urls.length - 1) {
        previewIndex = Math.max(0, urls.length - 1);
    }

    E.count.textContent = urls.length;

    if (isMultiMode()) {

        const used = Math.min(urls.length, CONFIG.multi.maxImages);

        E.counter.textContent = used
            ? used + " in 1 image"
            : "0 / 0";

        E.prev.disabled = true;
        E.next.disabled = true;
        return;
    }

    E.counter.textContent = urls.length
        ? (previewIndex + 1) + " / " + urls.length
        : "0 / 0";

    E.prev.disabled = templateBusy || previewIndex <= 0;
    E.next.disabled = templateBusy || previewIndex >= urls.length - 1;
}

/* Redraw frame + logo only (no product) */
async function drawEmptyTemplate() {

    const seq = ++previewSeq;

    let background = null;
    let logo = null;

    try { background = await getBackground(); } catch (e) {
        setStatus(E.status, e.message, "error");
    }

    try { logo = await getLogo(E.brand.value); } catch (e) {
        setStatus(E.status, e.message, "error");
    }

    if (seq === previewSeq) {
        drawTemplate(previewCtx, background, logo, null);
    }
}

async function showPreview() {

    const urls = getTemplateUrls();

    updateTemplateCount();

    if (!urls.length) {
        await drawEmptyTemplate();
        return;
    }

    const seq = ++previewSeq;

    try {

        const frame = await Promise.all([
            getBackground(),
            getLogo(E.brand.value)
        ]);

        // ---------- MULTI: all images in one template ----------
        if (isMultiMode()) {

            const list = urls.slice(0, CONFIG.multi.maxImages);

            setStatus(E.status, "Loading " + list.length + " images...");

            const results = await Promise.all(list.map(function(url) {
                return getPreviewImage(url).then(
                    function(img) { return { img: img }; },
                    function(e) { return { url: url, error: e }; }
                );
            }));

            if (seq !== previewSeq) return;

            const images = results.filter(function(r) { return r.img; })
                .map(function(r) { return r.img; });

            const failed = results.filter(function(r) { return r.error; });

            drawTemplate(previewCtx, frame[0], frame[1], images);

            let message = "Preview: " + images.length + " images in one template";

            if (urls.length > list.length) {
                message += "\nOnly the first " + list.length + " URLs are used.";
            }

            if (failed.length) {
                message += "\n" + failed.length + " could not load:\n" +
                    failed.map(function(f) { return f.url; }).join("\n");
            }

            setStatus(E.status, message, failed.length ? "error" : "");
            return;
        }

        // ---------- SINGLE: one product per template ----------
        const url = urls[previewIndex];

        setStatus(E.status,
            "Loading preview " + (previewIndex + 1) + " of " + urls.length + "...");

        const product = await getPreviewImage(url);

        // A newer preview was requested while this one was loading
        if (seq !== previewSeq) return;

        drawTemplate(previewCtx, frame[0], frame[1], [product]);

        setStatus(E.status,
            "Preview " + (previewIndex + 1) + " of " + urls.length);

    } catch (e) {

        if (seq !== previewSeq) return;

        console.error(e);

        setStatus(E.status, "Preview failed: " + e.message, "error");
    }
}

function setTemplateBusy(busy) {
    templateBusy = busy;
    E.download.disabled = busy;
    E.preview.disabled = busy;
    E.clear.disabled = busy;
    E.paste.disabled = busy;
    E.removeWhite.disabled = busy;
    E.mode.disabled = busy;
    E.brand.disabled = busy || !brands.length;
    updateTemplateCount();
}

function fillBrandDropdown() {

    const previous = E.brand.value || storageGet(localStorage, "lastBrand") || "";

    E.brand.innerHTML = "";

    if (!brands.length) {
        E.brand.innerHTML = '<option value="">No brand logos found</option>';
        E.brand.disabled = true;
        drawEmptyTemplate();
        return;
    }

    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Select Brand";
    E.brand.appendChild(first);

    brands.forEach(function(b) {
        const option = document.createElement("option");
        option.value = b.name;
        option.textContent = b.name;
        E.brand.appendChild(option);
    });

    if (findBrand(previous)) {
        E.brand.value = previous;
    }

    E.brand.disabled = templateBusy;

    showPreview();
}

attachPasteCleaner(E.urls, function() {
    previewIndex = 0;
    updateTemplateCount();
});

E.paste.addEventListener("click", function() {
    appendClipboard(E.urls, function() {
        previewIndex = 0;
        updateTemplateCount();
    });
});

// Remember the "remove white background" choice on this computer
(function() {
    const saved = storageGet(localStorage, "templateRemoveWhite");
    if (saved !== null) {
        E.removeWhite.checked = saved === "1";
    }
    E.removeWhite.addEventListener("change", function() {
        storageSet(localStorage, "templateRemoveWhite", E.removeWhite.checked ? "1" : "0");
        showPreview();
    });
})();

// Single / Multi mode (remembered on this computer)
function updateModeUi() {
    E.download.textContent = isMultiMode() ? "⬇ Download JPG" : "⬇ Download ZIP";
}

(function() {
    const saved = storageGet(localStorage, "templateMode");
    if (saved === "single" || saved === "multi") {
        E.mode.value = saved;
    }
    updateModeUi();
    E.mode.addEventListener("change", function() {
        storageSet(localStorage, "templateMode", E.mode.value);
        previewIndex = 0;
        updateModeUi();
        showPreview();
    });
})();

E.brand.addEventListener("change", function() {
    storageSet(localStorage, "lastBrand", E.brand.value);
    showPreview();
});

E.clear.addEventListener("click", function() {
    E.urls.value = "";
    E.failedList.value = "";
    previewIndex = 0;
    E.processed.textContent = "0";
    E.total.textContent = "0";
    E.failed.textContent = "0";
    E.fill.style.width = "0%";
    setStatus(E.status, "Waiting...");
    updateTemplateCount();
    drawEmptyTemplate();
});

E.preview.addEventListener("click", function() {

    if (!getTemplateUrls().length) {
        alert("Please paste an image URL first.");
        return;
    }

    if (!E.brand.value) {
        alert("Please select a brand first.");
        return;
    }

    previewIndex = 0;
    showPreview();
});

E.prev.addEventListener("click", function() {
    if (previewIndex > 0) {
        previewIndex--;
        showPreview();
    }
});

E.next.addEventListener("click", function() {
    if (previewIndex < getTemplateUrls().length - 1) {
        previewIndex++;
        showPreview();
    }
});

E.copyFailed.addEventListener("click", async function() {
    if (!E.failedList.value.trim()) return;
    if (await copyText(E.failedList.value)) {
        setStatus(E.status, "Failed URLs copied.", "ok");
    }
});

async function loadWithRetry(url) {
    try {
        return await loadImageFromUrl(url);
    } catch (e) {
        return await loadImageFromUrl(url);
    }
}

function resetTemplateProgress(total) {
    E.failedList.value = "";
    E.processed.textContent = "0";
    E.total.textContent = total;
    E.failed.textContent = "0";
    E.fill.style.width = "0%";
}

function recordTemplateFailure(failures, url, error) {
    console.warn("Template failed:", url, error);
    failures.push(url + "   (" + error.message + ")");
    E.failed.textContent = failures.length;
    E.failedList.value = failures.join("\n");
}

/* MULTI: all URLs -> one JPG (first image big) */
async function downloadMultiTemplate(urls, background, logo, quality) {

    const list = urls.slice(0, CONFIG.multi.maxImages);
    const images = new Array(list.length).fill(null);
    const failures = [];

    let processed = 0;

    resetTemplateProgress(list.length);

    await runPool(list, CONFIG.concurrentDownloads, async function(url, index) {

        try {
            images[index] = await loadWithRetry(url);
        } catch (e) {
            recordTemplateFailure(failures, url, e);
        }

        processed++;
        E.processed.textContent = processed;
        E.fill.style.width = Math.round(processed / list.length * 100) + "%";
        setStatus(E.status, "Loaded " + processed + " of " + list.length + "...");
    });

    // Keep the original order - first working image is the big one
    const loaded = images.filter(Boolean);

    if (!loaded.length) {
        setStatus(E.status, "No images could be loaded, so nothing was created.", "error");
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = CONFIG.template.width;
    canvas.height = CONFIG.template.height;

    drawTemplate(canvas.getContext("2d"), background, logo, loaded);

    // Show the same result in the preview
    previewSeq++;
    previewCtx.drawImage(canvas, 0, 0);

    const blob = await canvasToDpiJpeg(canvas, quality);

    loaded.forEach(function(img) { if (img.close) img.close(); });

    const firstUrl = list[images.indexOf(loaded[0])];

    downloadBlob(blob, baseNameFromUrl(firstUrl, 0) + "_ebay_multi.jpg");

    let message = "Finished. 1 image created with " + loaded.length + " products";

    if (failures.length) message += ", " + failures.length + " failed";
    if (urls.length > list.length) message += "\nOnly the first " + list.length + " URLs were used.";

    setStatus(E.status, message + ".", failures.length ? "" : "ok");
}

/* SINGLE: one JPG per URL, all in a ZIP */
async function downloadSingleTemplates(urls, background, logo, quality, brandName) {

    if (typeof JSZip === "undefined") {
        alert("JSZip did not load. Please refresh the page.");
        return;
    }

    const names = makeUniqueNames(urls, "_ebay");
    const zip = new JSZip();
    const failures = [];

    let processed = 0;
    let succeeded = 0;

    resetTemplateProgress(urls.length);

    await runPool(urls, CONFIG.concurrentDownloads, async function(url, index) {

        try {

            const product = await loadWithRetry(url);

            const canvas = document.createElement("canvas");
            canvas.width = CONFIG.template.width;
            canvas.height = CONFIG.template.height;

            drawTemplate(canvas.getContext("2d"), background, logo, [product]);

            if (product.close) product.close();

            zip.file(names[index], await canvasToDpiJpeg(canvas, quality));

            succeeded++;

        } catch (e) {
            recordTemplateFailure(failures, url, e);
        }

        processed++;
        E.processed.textContent = processed;
        E.fill.style.width = Math.round(processed / urls.length * 100) + "%";
        setStatus(E.status, "Processed " + processed + " of " + urls.length + "...");
    });

    if (!succeeded) {
        setStatus(E.status,
            "No images could be processed, so no ZIP was created.\n" +
            "See the Failed URLs box below for the reason.", "error");
        return;
    }

    setStatus(E.status, "Creating ZIP...");

    const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });

    downloadBlob(zipBlob,
        "ebay_" + brandSlug(brandName).toLowerCase() + "_" + todayString() + ".zip");

    setStatus(E.status,
        "Finished. " + succeeded + " created, " + failures.length + " failed.",
        failures.length ? "" : "ok");
}

E.download.addEventListener("click", async function() {

    if (templateBusy) return;

    const urls = getTemplateUrls();

    if (!urls.length) {
        alert("Please paste product image URLs first.");
        return;
    }

    if (!E.brand.value) {
        alert("Please select a brand first.");
        return;
    }

    setTemplateBusy(true);

    const brandName = E.brand.value;
    const quality = parseFloat(E.quality.value) || 0.95;

    try {

        const background = await getBackground();
        const logo = await getLogo(brandName);

        if (isMultiMode()) {
            await downloadMultiTemplate(urls, background, logo, quality);
        } else {
            await downloadSingleTemplates(urls, background, logo, quality, brandName);
        }

    } catch (e) {
        console.error(e);
        setStatus(E.status, "Failed: " + e.message, "error");
    }

    setTemplateBusy(false);
});

updateTemplateCount();


/* ============================================================
   BRAND LOGOS TAB
   Everyone: view the list.
   Owner only: upload / replace / delete (needs your GitHub token,
   and the token must belong to CONFIG.githubOwner).
   ============================================================ */

const S = {
    count: $("brandCountText"),
    refresh: $("refreshBrandsBtn"),
    list: $("brandList"),
    panel: $("ownerPanel"),
    loggedOut: $("ownerLoggedOut"),
    loggedIn: $("ownerLoggedIn"),
    token: $("githubToken"),
    remember: $("rememberToken"),
    login: $("ownerLoginBtn"),
    loginStatus: $("ownerStatus"),
    ownerName: $("ownerName"),
    logout: $("ownerLogoutBtn"),
    brandName: $("brandName"),
    brandFile: $("brandFile"),
    filePreview: $("brandFilePreview"),
    upload: $("uploadBrandBtn"),
    uploadStatus: $("brandUploadStatus")
};

function renderBrandList(note) {

    S.list.innerHTML = "";

    S.count.textContent =
        brands.length + " brand logo" + (brands.length === 1 ? "" : "s") +
        (note ? "  •  " + note : "");

    if (!brands.length) {
        const p = document.createElement("p");
        p.textContent = "No brand logos found in " + CONFIG.brandPath + ".";
        S.list.appendChild(p);
        return;
    }

    brands.forEach(function(brand) {

        const card = document.createElement("div");
        card.className = "brandCard";

        const box = document.createElement("div");
        box.className = "logoBox";

        const img = document.createElement("img");
        img.alt = brand.name;
        img.loading = "lazy";
        img.src = brand.url;
        img.onerror = function() {
            if (img.src !== brand.pagesUrl) img.src = brand.pagesUrl;
        };
        box.appendChild(img);

        const title = document.createElement("div");
        title.className = "brandTitle";
        title.textContent = brand.name;

        const file = document.createElement("div");
        file.className = "brandFile";
        file.textContent = brand.fileName;

        card.appendChild(box);
        card.appendChild(title);
        card.appendChild(file);

        // Delete button only for the verified owner
        if (ownerLogin) {
            const del = document.createElement("button");
            del.className = "dangerBtn";
            del.textContent = "Delete";
            del.addEventListener("click", function() {
                deleteBrand(brand);
            });
            card.appendChild(del);
        }

        S.list.appendChild(card);
    });
}

async function githubError(response, fallback) {

    let message = fallback + " (HTTP " + response.status + ")";

    try {
        const data = await response.json();
        if (data && data.message) message = data.message;
    } catch (e) { /* ignore */ }

    if (response.status === 401) {
        message = "Your token is invalid or has expired.";
    } else if (response.status === 403 && /not accessible/i.test(message)) {
        message = "Your token does not have 'Contents: Read and write' permission for this repository.";
    } else if (response.status === 409) {
        message = "The file changed on GitHub. Press Refresh and try again.";
    }

    return new Error(message);
}

/* Check the token really belongs to the owner and can write to the repo */
async function verifyOwnerToken(token) {

    const headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token
    };

    const userResponse = await fetch("https://api.github.com/user", {
        headers: headers, cache: "no-store"
    });

    if (!userResponse.ok) {
        throw await githubError(userResponse, "Could not check token");
    }

    const user = await userResponse.json();

    if (!user.login ||
        user.login.toLowerCase() !== CONFIG.githubOwner.toLowerCase()) {

        throw new Error(
            "This token belongs to \"" + user.login + "\". " +
            "Only " + CONFIG.githubOwner + " can manage brand logos."
        );
    }

    const repoResponse = await fetch(GITHUB_API, { headers: headers, cache: "no-store" });

    if (!repoResponse.ok) {
        throw new Error("This token cannot access the " + CONFIG.githubRepo + " repository.");
    }

    const repo = await repoResponse.json();

    if (repo.permissions && repo.permissions.push === false) {
        throw new Error("This token does not have write access to the repository.");
    }

    return user.login;
}

function showOwnerUi() {
    S.loggedOut.hidden = !!ownerLogin;
    S.loggedIn.hidden = !ownerLogin;
    S.ownerName.textContent = ownerLogin || "";
    renderBrandList("");
}

function lockOwner() {
    ownerLogin = null;
    storageRemove(sessionStorage, TOKEN_KEY);
    storageRemove(localStorage, TOKEN_KEY);
    S.token.value = "";
    setStatus(S.uploadStatus, "");
    showOwnerUi();
}

S.login.addEventListener("click", async function() {

    const token = S.token.value.trim();

    if (!token) {
        setStatus(S.loginStatus, "Please paste your GitHub token.", "error");
        return;
    }

    S.login.disabled = true;
    setStatus(S.loginStatus, "Checking token with GitHub...");

    try {

        const login = await verifyOwnerToken(token);

        storageSet(S.remember.checked ? localStorage : sessionStorage, TOKEN_KEY, token);

        ownerLogin = login;
        S.token.value = "";
        setStatus(S.loginStatus, "");
        showOwnerUi();

    } catch (e) {
        ownerLogin = null;
        setStatus(S.loginStatus, e.message, "error");
    } finally {
        S.login.disabled = false;
    }
});

S.token.addEventListener("keydown", function(e) {
    if (e.key === "Enter") S.login.click();
});

S.logout.addEventListener("click", lockOwner);

S.refresh.addEventListener("click", async function() {
    S.refresh.disabled = true;
    await loadBrands(true);
    S.refresh.disabled = false;
});

S.brandFile.addEventListener("change", function() {

    const file = S.brandFile.files[0];

    if (S.filePreview.src) {
        URL.revokeObjectURL(S.filePreview.src);
    }

    if (!file) {
        S.filePreview.hidden = true;
        return;
    }

    S.filePreview.src = URL.createObjectURL(file);
    S.filePreview.hidden = false;

    // Suggest a brand name from the file name
    if (!S.brandName.value.trim()) {
        S.brandName.value = brandNameFromFile(file.name);
    }
});

function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() {
            resolve(String(reader.result).split(",")[1]);
        };
        reader.onerror = function() {
            reject(new Error("Could not read the file"));
        };
        reader.readAsDataURL(file);
    });
}

function fileExtension(file) {

    const match = file.name.match(/\.[^.]+$/);
    let ext = match ? match[0].toLowerCase() : "";

    if (ext === ".jpeg") ext = ".jpg";

    if (!/^\.(png|jpg|webp|gif|svg)$/.test(ext)) {
        const byType = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/svg+xml": ".svg"
        };
        ext = byType[file.type] || "";
    }

    return ext;
}

async function githubDelete(path, sha, message) {

    const response = await fetch(GITHUB_API + "/contents/" + encodePath(path), {
        method: "DELETE",
        headers: Object.assign(githubHeaders(true), { "Content-Type": "application/json" }),
        body: JSON.stringify({ message: message, sha: sha })
    });

    if (!response.ok) {
        throw await githubError(response, "GitHub delete failed");
    }
}

S.upload.addEventListener("click", async function() {

    if (!ownerLogin || !getToken()) {
        setStatus(S.uploadStatus, "Please unlock with your GitHub token first.", "error");
        return;
    }

    const name = S.brandName.value.trim();
    const file = S.brandFile.files[0];

    if (!name) {
        setStatus(S.uploadStatus, "Please enter the brand name.", "error");
        return;
    }

    if (!file) {
        setStatus(S.uploadStatus, "Please choose a logo file.", "error");
        return;
    }

    const ext = fileExtension(file);

    if (!ext) {
        setStatus(S.uploadStatus, "Logo must be PNG, JPG, WEBP, GIF or SVG.", "error");
        return;
    }

    if (file.size > CONFIG.maxLogoBytes) {
        setStatus(S.uploadStatus, "Logo is too large (max 2 MB).", "error");
        return;
    }

    const slug = brandSlug(name);

    if (!slug) {
        setStatus(S.uploadStatus, "Brand name must contain letters or numbers.", "error");
        return;
    }

    S.upload.disabled = true;

    try {

        setStatus(S.uploadStatus, "Checking existing logos...");

        // Always use the latest list so we have the right file versions
        await loadBrands(true);

        const fileName = slug + ext;
        const path = CONFIG.brandPath + "/" + fileName;

        // Same brand already saved (any extension / capitals)?
        const existing = brands.filter(function(b) {
            return b.fileName.replace(/\.[^.]+$/, "").toLowerCase() === slug.toLowerCase();
        });

        if (existing.length &&
            !confirm("A logo for \"" + existing[0].name + "\" already exists.\n\nReplace it?")) {
            setStatus(S.uploadStatus, "Upload cancelled.");
            return;
        }

        const sameFile = existing.find(function(b) { return b.path === path; });

        setStatus(S.uploadStatus, "Uploading to GitHub...");

        const body = {
            message: (sameFile ? "Update" : "Add") + " brand logo: " + name,
            content: await fileToBase64(file)
        };

        if (sameFile) {
            body.sha = sameFile.sha;
        }

        const response = await fetch(GITHUB_API + "/contents/" + encodePath(path), {
            method: "PUT",
            headers: Object.assign(githubHeaders(true), { "Content-Type": "application/json" }),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw await githubError(response, "GitHub upload failed");
        }

        // Remove old copies with a different extension or capitals
        for (const old of existing) {
            if (old.path !== path) {
                await githubDelete(old.path, old.sha, "Replace brand logo: " + old.fileName);
            }
        }

        S.brandName.value = "";
        S.brandFile.value = "";
        S.filePreview.hidden = true;

        clearBrandCache();
        await loadBrands(true);

        const uploaded = brands.find(function(b) { return b.path === path; });
        if (uploaded) {
            E.brand.value = uploaded.name;
            storageSet(localStorage, "lastBrand", uploaded.name);
            showPreview();
        }

        setStatus(S.uploadStatus, "✅ " + name + " logo uploaded.", "ok");

    } catch (e) {
        console.error(e);
        setStatus(S.uploadStatus, "Upload failed: " + e.message, "error");
    } finally {
        S.upload.disabled = false;
    }
});

async function deleteBrand(brand) {

    if (!ownerLogin || !getToken()) {
        alert("Please unlock with your GitHub token first.");
        return;
    }

    if (!confirm("Delete the " + brand.name + " logo?\n\n" +
        brand.fileName + " will be removed from GitHub.")) {
        return;
    }

    try {

        setStatus(S.uploadStatus, "Deleting " + brand.fileName + "...");

        await githubDelete(brand.path, brand.sha, "Delete brand logo: " + brand.fileName);

        clearBrandCache();
        await loadBrands(true);

        setStatus(S.uploadStatus, "🗑 " + brand.name + " logo deleted.", "ok");

    } catch (e) {
        console.error(e);
        setStatus(S.uploadStatus, "Delete failed: " + e.message, "error");
        alert("Delete failed:\n" + e.message);
    }
}


/* ============================================================
   START
   ============================================================ */

(async function init() {

    drawEmptyTemplate();

    // If the owner saved a token earlier, check it silently
    const saved = getToken();

    if (saved) {
        try {
            ownerLogin = await verifyOwnerToken(saved);
        } catch (e) {
            console.warn("Saved token no longer valid:", e.message);
            lockOwner();
        }
    }

    showOwnerUi();

    await loadBrands(false);

})();

window.addEventListener("load", function() {
    if (getTabFromUrl() === "resizeTab") R.urls.focus();
});

// Stop the browser opening a file if one is dropped on the page
document.addEventListener("dragover", function(e) { e.preventDefault(); });
document.addEventListener("drop", function(e) {
    if (e.target !== S.brandFile) e.preventDefault();
});
