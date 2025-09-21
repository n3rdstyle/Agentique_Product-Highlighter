// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    userPrompt: '',
    threshold: 0.6,
    isEnabled: true
  });
});

// Handle messages from content script if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    chrome.storage.sync.get(['userPrompt', 'threshold', 'isEnabled'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  // Handle toggle highlighter messages
  if (message.action === 'toggleHighlighter') {
    // Could add any background processing here if needed
    console.log('Highlighter toggled:', message.isEnabled);
  }

  // Handle settings updates
  if (message.action === 'updateSettings') {
    // Could add any background processing here if needed
    console.log('Settings updated:', message.userPrompt);
  }
});