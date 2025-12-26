// ===== ScreenFlow Background Service Worker =====
// Handles: Tab capture requests from content script, opens editor

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

    // Capture visible tab (called by content script for full page / area)
    if (message.action === 'captureTab') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, function (dataUrl) {
            sendResponse({ dataUrl: dataUrl });
        });
        return true; // Keep channel open for async response
    }

    // Open editor (called after capture is complete)
    if (message.action === 'openEditor') {
        chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    }

});
