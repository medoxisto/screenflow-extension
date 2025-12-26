// ===== GIF Converter =====
const videoPreview = document.getElementById('videoPreview');
const fileInput = document.getElementById('fileInput');
const loadBtn = document.getElementById('loadBtn');
const convertBtn = document.getElementById('convertBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultContainer = document.getElementById('resultContainer');
const gifPreview = document.getElementById('gifPreview');
const downloadGifBtn = document.getElementById('downloadGifBtn');

let videoFile = null;
let gifBlob = null;

// Load from storage (if coming from recorder)
chrome.storage.local.get('recordingBlob', function (data) {
    if (data.recordingBlob) {
        const blob = dataURLtoBlob(data.recordingBlob);
        loadVideo(blob);
        chrome.storage.local.remove('recordingBlob');
    }
});

// Event Listeners
loadBtn.addEventListener('click', function () {
    fileInput.click();
});

fileInput.addEventListener('change', function (e) {
    if (e.target.files.length > 0) {
        loadVideo(e.target.files[0]);
    }
});

convertBtn.addEventListener('click', startConversion);

downloadGifBtn.addEventListener('click', function () {
    if (gifBlob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(gifBlob);
        a.download = 'ScreenFlow-' + Date.now() + '.gif';
        a.click();
    }
});

function loadVideo(file) {
    videoFile = file;
    videoPreview.src = URL.createObjectURL(file);
    convertBtn.disabled = false;
}

async function startConversion() {
    if (!videoFile) return;

    const quality = parseInt(document.getElementById('qualitySelect').value);
    const fps = parseInt(document.getElementById('fpsSelect').value);
    const maxWidth = parseInt(document.getElementById('widthSelect').value);

    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';
    convertBtn.disabled = true;
    progressFill.style.width = '0%';
    progressText.textContent = 'Loading video...';

    try {
        // Create video element for frame extraction
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;

        await new Promise(function (resolve) {
            video.onloadedmetadata = function () {
                // WebM files sometimes report Infinity duration
                if (video.duration === Infinity || isNaN(video.duration)) {
                    video.currentTime = 1e101; // Seek to end to force duration
                    video.ontimeupdate = function () {
                        video.ontimeupdate = null;
                        video.currentTime = 0;
                        resolve();
                    };
                } else {
                    resolve();
                }
            };
        });

        let duration = video.duration;
        if (!duration || duration === Infinity || isNaN(duration)) {
            throw new Error('Could not read video duration. Try a different format (MP4 recommended).');
        }

        // Limit to max 60 seconds for GIF (to prevent memory issues)
        if (duration > 60) {
            duration = 60;
            progressText.textContent = 'Note: Limiting to first 60 seconds';
            await new Promise(r => setTimeout(r, 1500));
        }

        const frameInterval = 1 / fps;
        const totalFrames = Math.floor(duration * fps);

        // Calculate dimensions
        const scale = Math.min(1, maxWidth / video.videoWidth);
        const width = Math.floor(video.videoWidth * scale);
        const height = Math.floor(video.videoHeight * scale);

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Create GIF encoder
        const gif = new GIF({
            workers: 2,
            quality: quality,
            width: width,
            height: height,
            workerScript: 'lib/gif.worker.js'
        });

        // Extract frames
        progressText.textContent = 'Extracting frames...';

        for (let i = 0; i < totalFrames; i++) {
            const time = i * frameInterval;
            video.currentTime = time;

            await new Promise(function (resolve) {
                video.onseeked = resolve;
            });

            ctx.drawImage(video, 0, 0, width, height);
            gif.addFrame(ctx, { copy: true, delay: Math.round(1000 / fps) });

            const progress = Math.round((i / totalFrames) * 50);
            progressFill.style.width = progress + '%';
            progressText.textContent = 'Extracting frame ' + (i + 1) + ' of ' + totalFrames;
        }

        // Render GIF
        progressText.textContent = 'Encoding GIF...';
        progressFill.style.width = '50%';

        gif.on('progress', function (p) {
            const progress = 50 + Math.round(p * 50);
            progressFill.style.width = progress + '%';
        });

        gif.on('finished', function (blob) {
            gifBlob = blob;
            progressFill.style.width = '100%';
            progressText.textContent = 'Done!';

            // Show result
            gifPreview.src = URL.createObjectURL(blob);
            resultContainer.style.display = 'block';
            convertBtn.disabled = false;
        });

        gif.render();

    } catch (err) {
        console.error('Conversion error:', err);
        progressText.textContent = 'Error: ' + err.message;
        convertBtn.disabled = false;
    }
}

function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
}
