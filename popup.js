// ===== ScreenFlow Popup =====

// Record Screen
document.getElementById('recordBtn').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('recorder.html') });
    window.close();
});

// Visible Area Screenshot
document.getElementById('visibleBtn').addEventListener('click', async function () {
    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        await chrome.storage.local.set({ screenshotData: dataUrl });
        chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
        window.close();
    } catch (err) {
        alert('Screenshot failed: ' + err.message);
    }
});

// Full Page Screenshot (Scroll Capture)
document.getElementById('fullPageBtn').addEventListener('click', async function () {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Inject content script for scroll capture
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Send message to start full page capture
        chrome.tabs.sendMessage(tab.id, { action: 'captureFullPage' });
        window.close();
    } catch (err) {
        alert('Full page capture failed: ' + err.message);
    }
});

// Select Area Screenshot
document.getElementById('selectAreaBtn').addEventListener('click', async function () {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Inject content script for area selection
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Send message to start area selection
        chrome.tabs.sendMessage(tab.id, { action: 'selectArea' });
        window.close();
    } catch (err) {
        alert('Area selection failed: ' + err.message);
    }
});

// GIF Converter
document.getElementById('gifBtn').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
    window.close();
});
