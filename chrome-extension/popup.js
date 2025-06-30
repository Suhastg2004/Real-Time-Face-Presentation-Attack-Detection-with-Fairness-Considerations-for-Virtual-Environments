// popup.js

let isDetecting = false;
const DEFAULT_URL = 'http://127.0.0.1:8000/api/detect/';

document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn       = document.getElementById('toggleDetection');
    const clearBtn        = document.getElementById('clearResults');
    const saveBtn         = document.getElementById('saveSettings');
    const statusDiv       = document.getElementById('status');
    const backendUrlInput = document.getElementById('backendUrl');
    const lastResultDiv   = document.getElementById('lastResult');

    // Load saved settings (or fall back to default)
    chrome.storage.sync.get(['backendUrl', 'isDetecting'], function(result) {
        backendUrlInput.value = result.backendUrl || DEFAULT_URL;
        if (result.isDetecting) {
            isDetecting = result.isDetecting;
            updateUI();
        }
    });

    // Utility: check URL validity
    function validateUrl(u) {
        try {
            new URL(u);
            return true;
        } catch {
            return false;
        }
    }

    // Utility: detect supported video‐call domains
    function isVideoCallSite(url) {
        if (!url) return false;
        const domains = [
            'meet.google.com',
            'zoom.us',
            'teams.microsoft.com',
            'webex.com',
            'gotomeeting.com'
        ];
        return domains.some(d => url.includes(d));
    }

    // Send a message to the content script, with error handling
    function sendMessageToContentScript(message, callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const tab = tabs[0];
            if (!tab) return;

            if (!isVideoCallSite(tab.url)) {
                statusDiv.className   = 'status fake';
                statusDiv.textContent = 'Please open a supported video call site.';
                return;
            }

            chrome.tabs.sendMessage(tab.id, message, function(response) {
                if (chrome.runtime.lastError) {
                    statusDiv.className   = 'status fake';
                    statusDiv.textContent = 'Content script not loaded. Refresh the page.';
                } else if (callback) {
                    callback(response);
                }
            });
        });
    }

    // Toggle detection on/off
    toggleBtn.addEventListener('click', function() {
        const url = backendUrlInput.value.trim();

        if (!validateUrl(url)) {
            statusDiv.className   = 'status fake';
            statusDiv.textContent = 'Invalid backend URL. Please correct and Save Settings.';
            return;
        }

        // Persist URL and toggle state
        chrome.storage.sync.set({ backendUrl: url });
        isDetecting = !isDetecting;
        chrome.storage.sync.set({ isDetecting: isDetecting });

        // Instruct content script to start/stop
        const action = isDetecting ? 'startDetection' : 'stopDetection';
        sendMessageToContentScript({ action, backendUrl: url });

        updateUI();
    });

    // Clear displayed results
    clearBtn.addEventListener('click', function() {
        sendMessageToContentScript({ action: 'clearResults' });
        statusDiv.className   = 'status unknown';
        statusDiv.textContent = 'Detection cleared';
        lastResultDiv.textContent = 'No recent detections';
    });

    // Save settings without toggling detection
    saveBtn.addEventListener('click', function() {
        const url = backendUrlInput.value.trim();

        if (!validateUrl(url)) {
            statusDiv.className   = 'status fake';
            statusDiv.textContent = 'Invalid URL. Please enter a valid URL.';
            return;
        }

        saveBtn.disabled = true;
        chrome.storage.sync.set({ backendUrl: url }, function() {
            statusDiv.className   = 'status real';
            statusDiv.textContent = 'Settings saved!';
            setTimeout(function() {
                statusDiv.textContent = '';
                updateUI();
                saveBtn.disabled = false;
            }, 1500);
        });
    });

    // Listen for detection results from content script
    chrome.runtime.onMessage.addListener(function(request) {
        if (request.action === 'detectionResult') {
            updateStatus(request.result);
        }
    });

    // Initial status when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];
        if (tab && isVideoCallSite(tab.url)) {
            statusDiv.className   = 'status unknown';
            statusDiv.textContent = 'Ready to detect on ' + new URL(tab.url).hostname;
        } else {
            statusDiv.className   = 'status fake';
            statusDiv.textContent = 'Please open a supported video call site.';
        }
    });

    // Update toggle button text and status area
    function updateUI() {
        toggleBtn.textContent = isDetecting ? 'Stop Detection' : 'Start Detection';

        if (isDetecting) {
            statusDiv.className   = 'status unknown';
            statusDiv.textContent = 'Detection Active…';
        } else {
            statusDiv.className   = 'status unknown';
            statusDiv.textContent = 'Detection Inactive';
        }
    }

    // Render the latest detection result
    function updateStatus(result) {
        if (result.error) {
            statusDiv.className   = 'status fake';
            statusDiv.textContent = 'Error: ' + result.error;
        } else {
            const real    = result.is_real;
            const conf    = (result.confidence * 100).toFixed(1);
            statusDiv.className   = real ? 'status real' : 'status fake';
            statusDiv.textContent = real
                ? `Real Person (${conf}%)`
                : `Fake/Spoof Detected (${conf}%)`;
            lastResultDiv.textContent =
                `Last check: ${new Date().toLocaleTimeString()} — ${result.status || ''}`;
        }
    }
});
