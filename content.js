// ===== ScreenFlow Content Script =====
// Handles: Full Page Scroll Capture & Area Selection

(function () {
    // Prevent multiple injections
    if (window.screenflowInjected) return;
    window.screenflowInjected = true;

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message.action === 'captureFullPage') {
            captureFullPage();
        } else if (message.action === 'selectArea') {
            initAreaSelection();
        }
    });

    // ===== Full Page Scroll Capture =====
    async function captureFullPage() {
        const originalScroll = { x: window.scrollX, y: window.scrollY };
        const pageWidth = document.documentElement.scrollWidth;
        const pageHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        const captures = [];
        let currentY = 0;

        // Show status overlay
        const statusEl = createStatusOverlay('Capturing full page...');

        try {
            // Scroll and capture
            while (currentY < pageHeight) {
                window.scrollTo(0, currentY);
                await sleep(600); // Wait for render + respect Chrome rate limit

                // Capture visible area via background
                const dataUrl = await captureVisible();
                captures.push({ dataUrl, y: currentY });

                currentY += viewportHeight;
                statusEl.textContent = 'Capturing... ' + Math.min(100, Math.round((currentY / pageHeight) * 100)) + '%';
            }

            // Restore scroll position
            window.scrollTo(originalScroll.x, originalScroll.y);

            // Stitch captures
            statusEl.textContent = 'Stitching images...';
            const finalDataUrl = await stitchImages(captures, pageWidth, pageHeight, viewportHeight);

            // Save and open editor
            await chrome.storage.local.set({ screenshotData: finalDataUrl });
            chrome.runtime.sendMessage({ action: 'openEditor' });

        } catch (err) {
            console.error('Full page capture error:', err);
            alert('Capture failed: ' + err.message);
        } finally {
            statusEl.remove();
        }
    }

    async function captureVisible() {
        return new Promise(function (resolve, reject) {
            chrome.runtime.sendMessage({ action: 'captureTab' }, function (response) {
                if (response && response.dataUrl) {
                    resolve(response.dataUrl);
                } else {
                    reject(new Error('Capture failed'));
                }
            });
        });
    }

    async function stitchImages(captures, width, height, viewportHeight) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        for (const capture of captures) {
            const img = await loadImage(capture.dataUrl);
            const drawHeight = Math.min(viewportHeight, height - capture.y);
            ctx.drawImage(img, 0, 0, width, drawHeight, 0, capture.y, width, drawHeight);
        }

        return canvas.toDataURL('image/png');
    }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = reject;
            img.src = src;
        });
    }

    // ===== Area Selection =====
    function initAreaSelection() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'screenflow-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);cursor:crosshair;z-index:999999;';

        // Create selection box
        const selectionBox = document.createElement('div');
        selectionBox.id = 'screenflow-selection';
        selectionBox.style.cssText = 'position:fixed;border:2px dashed #6366f1;background:rgba(99,102,241,0.1);display:none;z-index:1000000;';

        // Instructions
        const instructions = document.createElement('div');
        instructions.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#fff;padding:12px 24px;border-radius:8px;font-family:system-ui;font-size:14px;z-index:1000001;';
        instructions.textContent = 'Click and drag to select area. Press Esc to cancel.';

        document.body.appendChild(overlay);
        document.body.appendChild(selectionBox);
        document.body.appendChild(instructions);

        let startX, startY, isSelecting = false;

        overlay.addEventListener('mousedown', function (e) {
            startX = e.clientX;
            startY = e.clientY;
            isSelecting = true;
            selectionBox.style.display = 'block';
            selectionBox.style.left = startX + 'px';
            selectionBox.style.top = startY + 'px';
            selectionBox.style.width = '0';
            selectionBox.style.height = '0';
        });

        overlay.addEventListener('mousemove', function (e) {
            if (!isSelecting) return;
            const currentX = e.clientX;
            const currentY = e.clientY;

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        });

        overlay.addEventListener('mouseup', async function (e) {
            if (!isSelecting) return;
            isSelecting = false;

            const rect = selectionBox.getBoundingClientRect();
            cleanup();

            if (rect.width < 10 || rect.height < 10) {
                alert('Selection too small');
                return;
            }

            // Capture and crop
            try {
                const fullDataUrl = await captureVisible();
                const croppedDataUrl = await cropImage(fullDataUrl, rect);
                await chrome.storage.local.set({ screenshotData: croppedDataUrl });
                chrome.runtime.sendMessage({ action: 'openEditor' });
            } catch (err) {
                console.error('Crop error:', err);
            }
        });

        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', escHandler);
            }
        });

        function cleanup() {
            overlay.remove();
            selectionBox.remove();
            instructions.remove();
        }
    }

    async function cropImage(dataUrl, rect) {
        const img = await loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(
            img,
            rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr,
            0, 0, rect.width * dpr, rect.height * dpr
        );

        return canvas.toDataURL('image/png');
    }

    // ===== Helpers =====
    function createStatusOverlay(text) {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e2e;color:#fff;padding:20px 40px;border-radius:12px;font-family:system-ui;font-size:16px;z-index:999999;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
        el.textContent = text;
        document.body.appendChild(el);
        return el;
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

})();
