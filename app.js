"use strict";

/* ============================================================
   GITHUB SETTINGS
   ============================================================ */

const GITHUB_OWNER =
    "sunilthd7-stillhere";

const GITHUB_REPO =
    "imageresizer-ebaytemplate";

const GITHUB_BRAND_PATH =
    "assets/brand-logo";

const GITHUB_BRAND_API =
    "https://api.github.com/repos/" +
    GITHUB_OWNER +
    "/" +
    GITHUB_REPO +
    "/contents/" +
    GITHUB_BRAND_PATH;


/* ============================================================
   ELEMENTS
   ============================================================ */

const imageUrls =
    document.getElementById("imageUrls");

const resizeBtn =
    document.getElementById("resizeBtn");

const pasteBtn =
    document.getElementById("pasteBtn");

const clearBtn =
    document.getElementById("clearBtn");

const resizeStatus =
    document.getElementById("resizeStatus");

const progressFill =
    document.getElementById("progressFill");


/* ============================================================
   TAB SYSTEM
   ============================================================ */

const tabButtons =
    document.querySelectorAll(".tab-button");

const tabContents =
    document.querySelectorAll(".tab-content");


function activateTab(tabName) {

    tabButtons.forEach(function(button) {

        button.classList.toggle(
            "active",
            button.dataset.tab === tabName
        );

    });


    tabContents.forEach(function(tab) {

        tab.classList.toggle(
            "active",
            tab.id === tabName
        );

    });


    const url =
        new URL(window.location.href);

    url.searchParams.set(
        "tab",
        tabName
    );

    history.replaceState(
        null,
        "",
        url
    );
}


tabButtons.forEach(function(button) {

    button.addEventListener(
        "click",
        function() {

            activateTab(
                button.dataset.tab
            );

        }
    );

});


const initialTab =
    new URLSearchParams(
        window.location.search
    ).get("tab");

if (
    initialTab === "resize" ||
    initialTab === "ebay" ||
    initialTab === "settings"
) {
    activateTab(initialTab);
}


/* ============================================================
   CLIPBOARD
   ============================================================ */

pasteBtn.addEventListener(
    "click",
    async function() {

        try {

            const text =
                await navigator.clipboard.readText();

            imageUrls.value = text;

        } catch (error) {

            alert(
                "Unable to read clipboard. " +
                "Please paste the URLs manually."
            );

        }

    }
);


clearBtn.addEventListener(
    "click",
    function() {

        imageUrls.value = "";

        setResizeStatus(
            "Ready."
        );

        setProgress(0);

    }
);


/* ============================================================
   IMAGE PROXY
   ============================================================ */

function getProxyImageUrl(url) {

    if (!url) {
        return url;
    }


    if (
        url.includes(
            "storefeederimages.blob.core.windows.net"
        )
    ) {

        return (
            "https://images.weserv.nl/?" +
            "url=" +
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


/* ============================================================
   LOAD IMAGE
   ============================================================ */

async function loadImage(url) {

    const imageUrl =
        getProxyImageUrl(url);

    console.log(
        "Loading image:",
        imageUrl
    );


    const response =
        await fetch(
            imageUrl,
            {
                method: "GET",
                mode: "cors",
                cache: "no-store"
            }
        );


    console.log(
        "Image response:",
        response
    );


    if (!response.ok) {

        throw new Error(
            "HTTP " +
            response.status +
            " while loading image"
        );

    }


    const blob =
        await response.blob();


    if (
        !blob.type.startsWith("image/")
    ) {

        throw new Error(
            "Server did not return an image. " +
            "Content-Type: " +
            blob.type
        );

    }


    const objectUrl =
        URL.createObjectURL(blob);


    try {

        const img =
            await new Promise(
                function(resolve, reject) {

                    const image =
                        new Image();


                    image.onload =
                        function() {

                            resolve(image);

                        };


                    image.onerror =
                        function() {

                            reject(
                                new Error(
                                    "Browser could not decode image"
                                )
                            );

                        };


                    image.src =
                        objectUrl;

                }
            );


        return img;

    } finally {

        URL.revokeObjectURL(
            objectUrl
        );

    }

}


/* ============================================================
   RESIZE CANVAS
   ============================================================ */

const RESIZE_WIDTH = 2000;
const RESIZE_HEIGHT = 2000;


/* ============================================================
   RESIZE IMAGE
   ============================================================ */

async function resizeImage(
    sourceUrl
) {

    const img =
        await loadImage(
            sourceUrl
        );


    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width =
        RESIZE_WIDTH;

    canvas.height =
        RESIZE_HEIGHT;


    const ctx =
        canvas.getContext(
            "2d"
        );


    /*
     * IMPORTANT:
     *
     * Always paint white first.
     *
     * This makes transparent PNG/GIF
     * backgrounds white.
     */

    ctx.save();

    ctx.fillStyle =
        "#ffffff";

    ctx.fillRect(
        0,
        0,
        RESIZE_WIDTH,
        RESIZE_HEIGHT
    );

    ctx.restore();


    /*
     * Preserve aspect ratio.
     */

    const scale =
        Math.min(
            RESIZE_WIDTH /
                img.naturalWidth,

            RESIZE_HEIGHT /
                img.naturalHeight
        );


    const width =
        img.naturalWidth *
        scale;

    const height =
        img.naturalHeight *
        scale;


    const x =
        (
            RESIZE_WIDTH -
            width
        ) / 2;


    const y =
        (
            RESIZE_HEIGHT -
            height
        ) / 2;


    ctx.drawImage(
        img,
        x,
        y,
        width,
        height
    );


    /*
     * Convert to JPEG.
     *
     * This also guarantees the final
     * image has a white background.
     */

    const blob =
        await new Promise(
            function(resolve) {

                canvas.toBlob(
                    resolve,
                    "image/jpeg",
                    0.95
                );

            }
        );


    if (!blob) {

        throw new Error(
            "Canvas failed to create JPEG"
        );

    }


    /*
     * Add 300 DPI metadata.
     */

    const arrayBuffer =
        await blob.arrayBuffer();


    const binary =
        arrayBufferToBinary(
            arrayBuffer
        );


    let jpegData;

    try {

        jpegData =
            piexif.insert(
                create300DpiExif(),
                binary
            );

    } catch (error) {

        console.warn(
            "Unable to insert DPI metadata:",
            error
        );

        /*
         * If EXIF insertion fails,
         * still return the normal JPEG.
         */

        return blob;

    }


    const jpegBytes =
        binaryToUint8Array(
            jpegData
        );


    return new Blob(
        [jpegBytes],
        {
            type: "image/jpeg"
        }
    );

}


/* ============================================================
   300 DPI EXIF
   ============================================================ */

function create300DpiExif() {

    const zeroth = {};

    zeroth[
        piexif.ImageIFD.XResolution
    ] = [300, 1];

    zeroth[
        piexif.ImageIFD.YResolution
    ] = [300, 1];

    zeroth[
        piexif.ImageIFD.ResolutionUnit
    ] = 2;


    return piexif.dump({
        "0th": zeroth,
        "Exif": {},
        "GPS": {},
        "Interop": {},
        "1st": {},
        "thumbnail": null
    });

}


/* ============================================================
   ARRAY BUFFER → BINARY
   ============================================================ */

function arrayBufferToBinary(
    buffer
) {

    const bytes =
        new Uint8Array(
            buffer
        );

    let binary = "";

    const chunkSize =
        0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode.apply(
            null,
            bytes.subarray(
                i,
                i + chunkSize
            )
        );

    }


    return binary;

}


/* ============================================================
   BINARY → UINT8ARRAY
   ============================================================ */

function binaryToUint8Array(
    binary
) {

    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);

    }


    return bytes;

}


/* ============================================================
   RESIZE STATUS
   ============================================================ */

function setResizeStatus(
    message
) {

    resizeStatus.textContent =
        message;

}


function setProgress(
    percent
) {

    progressFill.style.width =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        ) + "%";

}


/* ============================================================
   RESIZE + ZIP
   ============================================================ */

resizeBtn.addEventListener(
    "click",
    async function() {

        const urls =
            imageUrls.value
                .split(/\r?\n/)
                .map(
                    function(url) {
                        return url.trim();
                    }
                )
                .filter(Boolean);


        if (!urls.length) {

            alert(
                "Please enter at least one image URL."
            );

            return;

        }


        if (
            typeof JSZip ===
            "undefined"
        ) {

            alert(
                "JSZip has not loaded. " +
                "Please refresh the page."
            );

            return;

        }


        resizeBtn.disabled =
            true;


        pasteBtn.disabled =
            true;


        clearBtn.disabled =
            true;


        setProgress(0);


        const zip =
            new JSZip();


        let successCount = 0;

        let failedCount = 0;

        const failures = [];


        setResizeStatus(
            "Starting..."
        );


        for (
            let i = 0;
            i < urls.length;
            i++
        ) {

            const url =
                urls[i];


            setResizeStatus(
                "Processing " +
                (i + 1) +
                " of " +
                urls.length +
                ":\n" +
                url
            );


            try {

                const blob =
                    await resizeImage(
                        url
                    );


                /*
                 * IMPORTANT:
                 *
                 * JSZip.add() receives the actual
                 * Blob here.
                 */

                const filename =
                    getOutputFilename(
                        url,
                        i
                    );


                zip.file(
                    filename,
                    blob
                );


                successCount++;


            } catch (error) {

                console.error(
                    "Resize failed:",
                    url,
                    error
                );


                failedCount++;


                failures.push(
                    {
                        url: url,
                        error:
                            error.message
                    }
                );

            }


            setProgress(
                (
                    (i + 1) /
                    urls.length
                ) * 100
            );

        }


        if (successCount === 0) {

            setResizeStatus(
                "No images were successfully processed.\n\n" +
                failures
                    .map(
                        function(item) {

                            return (
                                item.url +
                                "\n" +
                                item.error
                            );

                        }
                    )
                    .join("\n\n")
            );


            resizeBtn.disabled =
                false;

            pasteBtn.disabled =
                false;

            clearBtn.disabled =
                false;


            return;

        }


        setResizeStatus(
            "Creating ZIP...\n" +
            successCount +
            " successful\n" +
            failedCount +
            " failed"
        );


        try {

            const zipBlob =
                await zip.generateAsync(
                    {
                        type: "blob",
                        compression: "DEFLATE",
                        compressionOptions: {
                            level: 6
                        }
                    }
                );


            const downloadUrl =
                URL.createObjectURL(
                    zipBlob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                downloadUrl;


            link.download =
                "resized-images.zip";


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            setTimeout(
                function() {

                    URL.revokeObjectURL(
                        downloadUrl
                    );

                },
                1000
            );


            setResizeStatus(
                "Complete.\n\n" +
                successCount +
                " image(s) added to ZIP.\n" +
                failedCount +
                " image(s) failed."
            );


        } catch (error) {

            console.error(
                "ZIP creation failed:",
                error
            );


            setResizeStatus(
                "ZIP creation failed:\n" +
                error.message
            );

        }


        resizeBtn.disabled =
            false;

        pasteBtn.disabled =
            false;

        clearBtn.disabled =
            false;

    }
);


/* ============================================================
   OUTPUT FILENAME
   ============================================================ */

function getOutputFilename(
    url,
    index
) {

    try {

        const parsed =
            new URL(url);


        let name =
            parsed.pathname
                .split("/")
                .pop();


        if (!name) {

            name =
                "image-" +
                (index + 1);

        }


        name =
            name.replace(
                /\.[^.]+$/,
                ""
            );


        name =
            name.replace(
                /[^a-z0-9_-]/gi,
                "_"
            );


        return (
            name +
            "_2000x2000.jpg"
        );

    } catch (error) {

        return (
            "image-" +
            (index + 1) +
            "_2000x2000.jpg"
        );

    }

}


/* ============================================================
   EBAY TEMPLATE
   ============================================================ */

const brandSelect =
    document.getElementById(
        "brandSelect"
    );

const templateUrls =
    document.getElementById(
        "templateUrls"
    );

const templatePasteBtn =
    document.getElementById(
        "templatePasteBtn"
    );

const templateClearBtn =
    document.getElementById(
        "templateClearBtn"
    );

const templatePreviewBtn =
    document.getElementById(
        "templatePreviewBtn"
    );

const templateDownloadBtn =
    document.getElementById(
        "templateDownloadBtn"
    );

const templatePrevBtn =
    document.getElementById(
        "templatePrevBtn"
    );

const templateNextBtn =
    document.getElementById(
        "templateNextBtn"
    );

const templatePreviewCounter =
    document.getElementById(
        "templatePreviewCounter"
    );

const templateCanvas =
    document.getElementById(
        "templatePreview"
    );

const templateCtx =
    templateCanvas.getContext(
        "2d"
    );

const templateStatus =
    document.getElementById(
        "templateStatus"
    );


const TEMPLATE_WIDTH = 1500;
const TEMPLATE_HEIGHT = 1500;

const PRODUCT_X = 189;
const PRODUCT_Y = 189;

const PRODUCT_WIDTH = 1122;
const PRODUCT_HEIGHT = 1122;

const LOGO_X = 60;
const LOGO_Y = 5;

const LOGO_WIDTH = 540;
const LOGO_HEIGHT = 130;


const templateBackground =
    new Image();

templateBackground.src =
    "assets/background-frame.jpg";


let templatePreviewIndex =
    0;

let templateImages = [];

let BRAND_LOGOS = {};


/* ============================================================
   BRAND NAME
   ============================================================ */

function getBrandNameFromFilename(
    filename
) {

    let name =
        filename.replace(
            /\.[^/.]+$/,
            ""
        );


    name =
        name.replace(
            /[-_]+/g,
            " "
        );


    name =
        name.replace(
            /\w\S*/g,
            function(word) {

                return (
                    word.charAt(0)
                        .toUpperCase() +
                    word.substring(1)
                        .toLowerCase()
                );

            }
        );


    return name.trim();

}


/* ============================================================
   LOAD BRAND LOGOS
   ============================================================ */

async function loadBrandLogos() {

    brandSelect.innerHTML =
        "<option>Loading brands...</option>";

    brandSelect.disabled =
        true;


    try {

        const response =
            await fetch(
                GITHUB_BRAND_API,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "GitHub API HTTP " +
                response.status
            );

        }


        const files =
            await response.json();


        BRAND_LOGOS = {};


        const imageFiles =
            files.filter(
                function(file) {

                    return (
                        file.type ===
                            "file" &&
                        /\.(png|jpg|jpeg|webp|gif|svg)$/i
                            .test(
                                file.name
                            )
                    );

                }
            );


        imageFiles.sort(
            function(a, b) {

                return a.name.localeCompare(
                    b.name,
                    undefined,
                    {
                        numeric: true,
                        sensitivity: "base"
                    }
                );

            }
        );


        imageFiles.forEach(
            function(file) {

                const brandName =
                    getBrandNameFromFilename(
                        file.name
                    );


                /*
                 * Use the GitHub Pages URL,
                 * not the API download URL.
                 */

                const logoUrl =
                    new URL(
                        file.path,
                        document.baseURI
                    ).href;


                BRAND_LOGOS[
                    brandName
                ] = logoUrl;

            }
        );


        brandSelect.innerHTML =
            '<option value="">Select Brand</option>';


        Object.keys(
            BRAND_LOGOS
        ).forEach(
            function(brandName) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    brandName;


                option.textContent =
                    brandName;


                brandSelect.appendChild(
                    option
                );

            }
        );


        if (
            !imageFiles.length
        ) {

            brandSelect.innerHTML =
                '<option value="">No brand logos found</option>';

            brandSelect.disabled =
                true;

            return;

        }


        brandSelect.disabled =
            false;


        await drawTemplateBackground();


    } catch (error) {

        console.error(
            "Brand loading failed:",
            error
        );


        brandSelect.innerHTML =
            '<option value="">Unable to load brands</option>';


        brandSelect.disabled =
            true;

    }

}


/* ============================================================
   LOAD SELECTED BRAND LOGO
   ============================================================ */

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


            logo.crossOrigin =
                "anonymous";


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


/* ============================================================
   DRAW EBAY BACKGROUND
   ============================================================ */

async function drawTemplateBackground() {

    if (
        !templateBackground.complete
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


    templateCtx.drawImage(
        templateBackground,
        0,
        0,
        TEMPLATE_WIDTH,
        TEMPLATE_HEIGHT
    );


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


/* ============================================================
   BRAND CHANGE
   ============================================================ */

brandSelect.addEventListener(
    "change",
    async function() {

        await drawTemplateBackground();

    }
);


/* ============================================================
   TEMPLATE URLS
   ============================================================ */

templatePasteBtn.addEventListener(
    "click",
    async function() {

        try {

            templateUrls.value =
                await navigator.clipboard.readText();

        } catch (error) {

            alert(
                "Unable to access clipboard."
            );

        }

    }
);


templateClearBtn.addEventListener(
    "click",
    function() {

        templateUrls.value = "";

        templateImages = [];

        templatePreviewIndex = 0;

        updateTemplateCounter();

        drawTemplateBackground();

    }
);


/* ============================================================
   TEMPLATE IMAGE LOADING
   ============================================================ */

async function loadTemplateImage(
    url
) {

    return loadImage(url);

}


/* ============================================================
   DRAW PRODUCT
   ============================================================ */

async function drawTemplateProduct(
    url
) {

    await drawTemplateBackground();


    const img =
        await loadTemplateImage(
            url
        );


    const scale =
        Math.min(
            PRODUCT_WIDTH /
                img.naturalWidth,

            PRODUCT_HEIGHT /
                img.naturalHeight
        );


    const width =
        img.naturalWidth *
        scale;


    const height =
        img.naturalHeight *
        scale;


    const x =
        PRODUCT_X +
        (
            PRODUCT_WIDTH -
            width
        ) / 2;


    const y =
        PRODUCT_Y +
        (
            PRODUCT_HEIGHT -
            height
        ) / 2;


    templateCtx.drawImage(
        img,
        x,
        y,
        width,
        height
    );

}


/* ============================================================
   TEMPLATE PREVIEW
   ============================================================ */

templatePreviewBtn.addEventListener(
    "click",
    async function() {

        templateImages =
            templateUrls.value
                .split(/\r?\n/)
                .map(
                    function(url) {
                        return url.trim();
                    }
                )
                .filter(Boolean);


        if (
            !templateImages.length
        ) {

            alert(
                "Please enter at least one image URL."
            );

            return;

        }


        templatePreviewIndex =
            0;


        await showTemplatePreview();

    }
);


/* ============================================================
   SHOW TEMPLATE PREVIEW
   ============================================================ */

async function showTemplatePreview() {

    if (
        !templateImages.length
    ) {
        return;
    }


    const url =
        templateImages[
            templatePreviewIndex
        ];


    try {

        templateStatus.textContent =
            "Loading image...";


        await drawTemplateProduct(
            url
        );


        updateTemplateCounter();


        templateStatus.textContent =
            "Preview ready.";

    } catch (error) {

        console.error(
            error
        );


        templateStatus.textContent =
            "Unable to load product image:\n" +
            error.message;

    }

}


/* ============================================================
   COUNTER
   ============================================================ */

function updateTemplateCounter() {

    if (
        !templateImages.length
    ) {

        templatePreviewCounter.textContent =
            "0 / 0";

        return;

    }


    templatePreviewCounter.textContent =
        (
            templatePreviewIndex + 1
        ) +
        " / " +
        templateImages.length;

}


/* ============================================================
   PREVIOUS
   ============================================================ */

templatePrevBtn.addEventListener(
    "click",
    async function() {

        if (
            !templateImages.length
        ) {
            return;
        }


        if (
            templatePreviewIndex > 0
        ) {

            templatePreviewIndex--;

            await showTemplatePreview();

        }

    }
);


/* ============================================================
   NEXT
   ============================================================ */

templateNextBtn.addEventListener(
    "click",
    async function() {

        if (
            !templateImages.length
        ) {
            return;
        }


        if (
            templatePreviewIndex <
            templateImages.length - 1
        ) {

            templatePreviewIndex++;

            await showTemplatePreview();

        }

    }
);


/* ============================================================
   DOWNLOAD EBAY TEMPLATE
   ============================================================ */

templateDownloadBtn.addEventListener(
    "click",
    function() {

        templateCanvas.toBlob(
            function(blob) {

                if (!blob) {

                    alert(
                        "Unable to create image."
                    );

                    return;

                }


                const url =
                    URL.createObjectURL(
                        blob
                    );


                const link =
                    document.createElement(
                        "a"
                    );


                link.href =
                    url;


                link.download =
                    "ebay-template.jpg";


                document.body.appendChild(
                    link
                );


                link.click();


                link.remove();


                setTimeout(
                    function() {

                        URL.revokeObjectURL(
                            url
                        );

                    },
                    1000
                );

            },
            "image/jpeg",
            0.95
        );

    }
);


/* ============================================================
   SETTINGS
   ============================================================ */

const githubTokenInput =
    document.getElementById(
        "githubToken"
    );

const saveGithubToken =
    document.getElementById(
        "saveGithubToken"
    );

const clearGithubToken =
    document.getElementById(
        "clearGithubToken"
    );

const brandNameInput =
    document.getElementById(
        "brandName"
    );

const brandFileInput =
    document.getElementById(
        "brandFile"
    );

const uploadBrandBtn =
    document.getElementById(
        "uploadBrandBtn"
    );

const brandUploadStatus =
    document.getElementById(
        "brandUploadStatus"
    );

const brandList =
    document.getElementById(
        "brandList"
    );

const refreshBrandsBtn =
    document.getElementById(
        "refreshBrandsBtn"
    );


/* ============================================================
   TOKEN
   ============================================================ */

function getGithubToken() {

    return sessionStorage.getItem(
        "github_token"
    ) || "";

}


githubTokenInput.value =
    getGithubToken();


saveGithubToken.addEventListener(
    "click",
    function() {

        const token =
            githubTokenInput.value.trim();


        if (!token) {

            alert(
                "Please enter your GitHub token."
            );

            return;

        }


        sessionStorage.setItem(
            "github_token",
            token
        );


        alert(
            "GitHub token saved for this browser session."
        );

    }
);


clearGithubToken.addEventListener(
    "click",
    function() {

        sessionStorage.removeItem(
            "github_token"
        );


        githubTokenInput.value =
            "";


        alert(
            "GitHub token cleared."
        );

    }
);


/* ============================================================
   GITHUB AUTH HEADERS
   ============================================================ */

function githubHeaders() {

    const token =
        getGithubToken();


    const headers = {
        "Accept":
            "application/vnd.github+json"
    };


    if (token) {

        headers[
            "Authorization"
        ] =
            "Bearer " +
            token;

    }


    return headers;

}


/* ============================================================
   LOAD SETTINGS BRAND LIST
   ============================================================ */

async function loadSettingsBrands() {

    brandList.textContent =
        "Loading...";


    try {

        const response =
            await fetch(
                GITHUB_BRAND_API,
                {
                    headers:
                        githubHeaders(),

                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "GitHub API HTTP " +
                response.status
            );

        }


        const files =
            await response.json();


        const imageFiles =
            files.filter(
                function(file) {

                    return (
                        file.type ===
                            "file" &&
                        /\.(png|jpg|jpeg|webp|gif|svg)$/i
                            .test(
                                file.name
                            )
                    );

                }
            );


        brandList.innerHTML = "";


        if (
            !imageFiles.length
        ) {

            brandList.textContent =
                "No brand logos found.";

            return;

        }


        imageFiles.sort(
            function(a, b) {

                return a.name.localeCompare(
                    b.name,
                    undefined,
                    {
                        numeric: true,
                        sensitivity: "base"
                    }
                );

            }
        );


        imageFiles.forEach(
            function(file) {

                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "brand-row";


                const img =
                    document.createElement(
                        "img"
                    );


                img.src =
                    new URL(
                        file.path,
                        document.baseURI
                    ).href;


                img.alt =
                    file.name;


                const name =
                    document.createElement(
                        "div"
                    );


                name.className =
                    "brand-name";


                name.textContent =
                    getBrandNameFromFilename(
                        file.name
                    );


                const deleteButton =
                    document.createElement(
                        "button"
                    );


                deleteButton.className =
                    "danger";


                deleteButton.textContent =
                    "Delete";


                deleteButton.addEventListener(
                    "click",
                    async function() {

                        await deleteBrandLogo(
                            file
                        );

                    }
                );


                row.appendChild(
                    img
                );


                row.appendChild(
                    name
                );


                row.appendChild(
                    deleteButton
                );


                brandList.appendChild(
                    row
                );

            }
        );


    } catch (error) {

        console.error(
            error
        );


        brandList.textContent =
            "Unable to load brand logos.\n" +
            error.message;

    }

}


/* ============================================================
   UPLOAD BRAND
   ============================================================ */

uploadBrandBtn.addEventListener(
    "click",
    async function() {

        const brandName =
            brandNameInput.value.trim();


        const file =
            brandFileInput.files[0];


        if (!getGithubToken()) {

            alert(
                "Please save your GitHub token first."
            );

            return;

        }


        if (!brandName) {

            alert(
                "Please enter the brand name."
            );

            return;

        }


        if (!file) {

            alert(
                "Please select a logo file."
            );

            return;

        }


        try {

            uploadBrandBtn.disabled =
                true;


            brandUploadStatus.textContent =
                "Preparing upload...";


            const extension =
                getFileExtension(
                    file.name
                );


            const filename =
                sanitiseBrandFilename(
                    brandName
                ) +
                extension;


            const path =
                GITHUB_BRAND_PATH +
                "/" +
                filename;


            const apiUrl =
                "https://api.github.com/repos/" +
                GITHUB_OWNER +
                "/" +
                GITHUB_REPO +
                "/contents/" +
                path;


            /*
             * Convert file to Base64.
             */

            const base64 =
                await fileToBase64(
                    file
                );


            /*
             * Check whether file already exists.
             */

            let existingSha =
                null;


            const existingResponse =
                await fetch(
                    apiUrl,
                    {
                        headers:
                            githubHeaders(),

                        cache:
                            "no-store"
                    }
                );


            if (
                existingResponse.ok
            ) {

                const existing =
                    await existingResponse.json();


                existingSha =
                    existing.sha;

            }


            const body = {

                message:
                    existingSha
                        ? "Update brand logo: " +
                          brandName
                        : "Add brand logo: " +
                          brandName,

                content:
                    base64

            };


            if (existingSha) {

                body.sha =
                    existingSha;

            }


            brandUploadStatus.textContent =
                "Uploading to GitHub...";


            const response =
                await fetch(
                    apiUrl,
                    {
                        method:
                            "PUT",

                        headers:
                            {
                                ...githubHeaders(),

                                "Content-Type":
                                    "application/json"
                            },

                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );


            const result =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    result.message ||
                    "GitHub upload failed"
                );

            }


            brandUploadStatus.textContent =
                "Brand logo uploaded successfully.";


            brandNameInput.value =
                "";


            brandFileInput.value =
                "";


            await loadSettingsBrands();

            await loadBrandLogos();


        } catch (error) {

            console.error(
                error
            );


            brandUploadStatus.textContent =
                "Upload failed:\n" +
                error.message;

        } finally {

            uploadBrandBtn.disabled =
                false;

        }

    }
);


/* ============================================================
   FILE TO BASE64
   ============================================================ */

function fileToBase64(
    file
) {

    return new Promise(
        function(resolve, reject) {

            const reader =
                new FileReader();


            reader.onload =
                function() {

                    const result =
                        reader.result;


                    const base64 =
                        result.split(
                            ","
                        )[1];


                    resolve(
                        base64
                    );

                };


            reader.onerror =
                reject;


            reader.readAsDataURL(
                file
            );

        }
    );

}


/* ============================================================
   FILE EXTENSION
   ============================================================ */

function getFileExtension(
    filename
) {

    const match =
        filename.match(
            /\.[^.]+$/
        );


    return match
        ? match[0].toLowerCase()
        : ".png";

}


/* ============================================================
   SANITISE BRAND FILENAME
   ============================================================ */

function sanitiseBrandFilename(
    name
) {

    return name
        .trim()
        .replace(
            /[^a-zA-Z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        );

}


/* ============================================================
   DELETE BRAND
   ============================================================ */

async function deleteBrandLogo(
    file
) {

    if (!getGithubToken()) {

        alert(
            "Please save your GitHub token first."
        );

        return;

    }


    const confirmed =
        confirm(
            "Delete brand logo:\n\n" +
            file.name +
            "\n\nThis will delete the file from GitHub."
        );


    if (!confirmed) {
        return;
    }


    try {

        const apiUrl =
            "https://api.github.com/repos/" +
            GITHUB_OWNER +
            "/" +
            GITHUB_REPO +
            "/contents/" +
            file.path;


        const response =
            await fetch(
                apiUrl,
                {
                    method:
                        "DELETE",

                    headers:
                        {
                            ...githubHeaders(),

                            "Content-Type":
                                "application/json"
                        },

                    body:
                        JSON.stringify(
                            {
                                message:
                                    "Delete brand logo: " +
                                    file.name,

                                sha:
                                    file.sha
                            }
                        )
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.message ||
                "GitHub delete failed"
            );

        }


        await loadSettingsBrands();

        await loadBrandLogos();


    } catch (error) {

        console.error(
            error
        );


        alert(
            "Delete failed:\n" +
            error.message
        );

    }

}


/* ============================================================
   REFRESH SETTINGS
   ============================================================ */

refreshBrandsBtn.addEventListener(
    "click",
    async function() {

        await loadSettingsBrands();

    }
);


/* ============================================================
   INITIALISE
   ============================================================ */

loadBrandLogos();

loadSettingsBrands();
