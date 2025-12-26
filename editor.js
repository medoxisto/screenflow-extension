// ===== Enhanced Screenshot Editor =====
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let currentTool = 'arrow';
let isDrawing = false;
let startX, startY;
let stepNumber = 1;

// Undo/Redo History
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 30;

// Load screenshot from storage
chrome.storage.local.get('screenshotData', function (data) {
    if (data.screenshotData) {
        const img = new Image();
        img.onload = function () {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            saveState();
        };
        img.src = data.screenshotData;
    } else {
        canvas.width = 800;
        canvas.height = 600;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = '24px Arial';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.fillText('No screenshot loaded', canvas.width / 2, canvas.height / 2);
        saveState();
    }
});

// Tool buttons
document.querySelectorAll('.tool-btn[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(function (b) {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
    });
});

// Action buttons
document.getElementById('downloadBtn').addEventListener('click', downloadImage);
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);
document.getElementById('copyBtn').addEventListener('click', copyToClipboard);

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); downloadImage(); }
});

// Drawing Events
canvas.addEventListener('mousedown', function (e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;

    ctx.strokeStyle = document.getElementById('colorPicker').value;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = parseInt(document.getElementById('sizePicker').value);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (currentTool === 'text') {
        const text = prompt('Enter text:');
        if (text) {
            ctx.font = 'bold ' + (ctx.lineWidth * 5) + 'px Arial';
            ctx.fillText(text, startX, startY);
            saveState();
        }
        isDrawing = false;
    } else if (currentTool === 'number') {
        drawNumberedStep(startX, startY, stepNumber);
        stepNumber++;
        saveState();
        isDrawing = false;
    }
});

canvas.addEventListener('mouseup', function (e) {
    if (!isDrawing) return;
    isDrawing = false;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;

    switch (currentTool) {
        case 'arrow': drawArrow(startX, startY, endX, endY); break;
        case 'rect': ctx.strokeRect(startX, startY, endX - startX, endY - startY); break;
        case 'circle': drawEllipse(startX, startY, endX, endY); break;
        case 'line': drawLine(startX, startY, endX, endY); break;
        case 'highlight': drawHighlight(startX, startY, endX, endY); break;
        case 'blur': applyBlur(startX, startY, endX - startX, endY - startY); break;
    }

    saveState();
});

// ===== Drawing Functions =====
function drawArrow(x1, y1, x2, y2) {
    const headLen = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function drawLine(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function drawEllipse(x1, y1, x2, y2) {
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.stroke();
}

function drawHighlight(x1, y1, x2, y2) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = document.getElementById('colorPicker').value;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
}

function drawNumberedStep(x, y, num) {
    const radius = 16;
    const color = document.getElementById('colorPicker').value;

    // Circle background
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Number
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num.toString(), x, y);
}

function applyBlur(x, y, w, h) {
    const pixelSize = 10;
    const absW = Math.abs(w);
    const absH = Math.abs(h);
    const minX = Math.min(x, x + w);
    const minY = Math.min(y, y + h);

    if (absW < 5 || absH < 5) return;

    try {
        const imageData = ctx.getImageData(minX, minY, absW, absH);
        const data = imageData.data;

        for (let py = 0; py < absH; py += pixelSize) {
            for (let px = 0; px < absW; px += pixelSize) {
                const i = (py * absW + px) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];

                for (let dy = 0; dy < pixelSize && py + dy < absH; dy++) {
                    for (let dx = 0; dx < pixelSize && px + dx < absW; dx++) {
                        const j = ((py + dy) * absW + (px + dx)) * 4;
                        data[j] = r;
                        data[j + 1] = g;
                        data[j + 2] = b;
                    }
                }
            }
        }

        ctx.putImageData(imageData, minX, minY);
    } catch (err) {
        console.error('Blur failed:', err);
    }
}

// ===== History Functions =====
function saveState() {
    redoStack = [];
    undoStack.push(canvas.toDataURL());
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }
}

function undo() {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreState(undoStack[undoStack.length - 1]);
}

function redo() {
    if (redoStack.length === 0) return;
    const state = redoStack.pop();
    undoStack.push(state);
    restoreState(state);
}

function restoreState(dataUrl) {
    const img = new Image();
    img.onload = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
}

// ===== Export Functions =====
function downloadImage() {
    const a = document.createElement('a');
    a.download = 'Screenshot-' + Date.now() + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
}

function copyToClipboard() {
    canvas.toBlob(function (blob) {
        navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]).then(function () {
            alert('Copied to clipboard!');
        }).catch(function (err) {
            console.error('Copy failed:', err);
            alert('Copy failed. Try the Save button instead.');
        });
    });
}
