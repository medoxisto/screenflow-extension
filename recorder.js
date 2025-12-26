// ===== Enhanced Screen Recorder with Webcam =====
let mediaRecorder = null;
let recordedChunks = [];
let screenStream = null;
let webcamStream = null;
let timerInterval = null;
let startTime = null;
let pausedTime = 0;
let isPaused = false;

// DOM Elements
const preview = document.getElementById('preview');
const webcamPreview = document.getElementById('webcamPreview');
const placeholder = document.getElementById('placeholder');
const countdownOverlay = document.getElementById('countdownOverlay');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const timer = document.getElementById('timer');
const status = document.getElementById('status');
const audioCheck = document.getElementById('audioCheck');
const systemAudioCheck = document.getElementById('systemAudioCheck');
const webcamCheck = document.getElementById('webcamCheck');
const qualitySelect = document.getElementById('qualitySelect');
const countdownSelect = document.getElementById('countdownSelect');
const webcamPosition = document.getElementById('webcamPosition');
const webcamPositionLabel = document.getElementById('webcamPositionLabel');

// Event Listeners
startBtn.addEventListener('click', initiateRecording);
pauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click', stopRecording);

webcamCheck.addEventListener('change', function () {
    webcamPositionLabel.style.display = webcamCheck.checked ? 'flex' : 'none';
});

webcamPosition.addEventListener('change', function () {
    webcamPreview.className = webcamPosition.value;
});

// Keyboard Shortcuts
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mediaRecorder && mediaRecorder.state !== 'inactive') {
        stopRecording();
    }
});

async function initiateRecording() {
    const countdown = parseInt(countdownSelect.value);

    if (countdown > 0) {
        await runCountdown(countdown);
    }

    startRecording();
}

function runCountdown(seconds) {
    return new Promise(function (resolve) {
        placeholder.style.display = 'none';
        countdownOverlay.style.display = 'block';

        let current = seconds;
        countdownOverlay.textContent = current;

        const interval = setInterval(function () {
            current--;
            if (current <= 0) {
                clearInterval(interval);
                countdownOverlay.style.display = 'none';
                resolve();
            } else {
                countdownOverlay.textContent = current;
                countdownOverlay.style.animation = 'none';
                countdownOverlay.offsetHeight;
                countdownOverlay.style.animation = 'pulse 1s ease-in-out';
            }
        }, 1000);
    });
}

async function startRecording() {
    try {
        status.textContent = 'Requesting screen access...';

        const quality = parseInt(qualitySelect.value);
        const widthMap = { 720: 1280, 1080: 1920, 1440: 2560 };

        // 1. Get Screen Stream
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                width: { ideal: widthMap[quality] },
                height: { ideal: quality }
            },
            audio: systemAudioCheck.checked
        });

        // Show preview
        preview.srcObject = screenStream;
        preview.style.display = 'block';
        placeholder.style.display = 'none';

        // 2. Get Webcam Stream (if enabled)
        if (webcamCheck.checked) {
            try {
                webcamStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 320, height: 240, facingMode: 'user' },
                    audio: false
                });
                webcamPreview.srcObject = webcamStream;
                webcamPreview.style.display = 'block';
                webcamPreview.className = webcamPosition.value;
            } catch (camErr) {
                console.warn('Webcam access denied:', camErr);
            }
        }

        // 3. Create Combined Stream with Audio Mixing
        let finalStream = screenStream;

        if (audioCheck.checked) {
            try {
                const micStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true }
                });

                const audioContext = new AudioContext();
                const dest = audioContext.createMediaStreamDestination();

                // System audio
                if (screenStream.getAudioTracks().length > 0) {
                    const sysSource = audioContext.createMediaStreamSource(screenStream);
                    sysSource.connect(dest);
                }

                // Mic audio
                const micSource = audioContext.createMediaStreamSource(micStream);
                micSource.connect(dest);

                // Combined stream
                finalStream = new MediaStream([
                    ...screenStream.getVideoTracks(),
                    ...dest.stream.getAudioTracks()
                ]);
            } catch (micErr) {
                console.warn('Microphone access denied:', micErr);
            }
        }

        // 4. Setup MediaRecorder
        const options = { mimeType: 'video/webm;codecs=vp9' };
        mediaRecorder = new MediaRecorder(finalStream, options);
        recordedChunks = [];

        mediaRecorder.ondataavailable = function (e) {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = function () {
            downloadRecording();
        };

        // Handle stream end
        screenStream.getVideoTracks()[0].onended = function () {
            stopRecording();
        };

        // 5. Start recording
        mediaRecorder.start(1000);
        startTime = Date.now();
        pausedTime = 0;
        timerInterval = setInterval(updateTimer, 1000);

        // Update UI
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        status.textContent = '🔴 Recording in progress...';

    } catch (err) {
        console.error('Recording error:', err);
        status.textContent = 'Error: ' + err.message;
        placeholder.style.display = 'block';
    }
}

function togglePause() {
    if (!mediaRecorder) return;

    if (isPaused) {
        mediaRecorder.resume();
        isPaused = false;
        pauseBtn.textContent = '⏸️ Pause';
        status.textContent = '🔴 Recording in progress...';
        startTime = Date.now() - pausedTime;
        timerInterval = setInterval(updateTimer, 1000);
    } else {
        mediaRecorder.pause();
        isPaused = true;
        pauseBtn.textContent = '▶️ Resume';
        status.textContent = '⏸️ Recording paused';
        pausedTime = Date.now() - startTime;
        clearInterval(timerInterval);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (screenStream) {
        screenStream.getTracks().forEach(function (t) { t.stop(); });
    }
    if (webcamStream) {
        webcamStream.getTracks().forEach(function (t) { t.stop(); });
        webcamPreview.style.display = 'none';
    }
    clearInterval(timerInterval);

    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    isPaused = false;
    pauseBtn.textContent = '⏸️ Pause';
    status.textContent = 'Processing video...';
}

function downloadRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ScreenFlow-' + Date.now() + '.webm';
    a.click();
    URL.revokeObjectURL(url);

    status.textContent = '✅ Recording saved!';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
    timer.textContent = '00:00';
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    timer.textContent = mins + ':' + secs;
}
