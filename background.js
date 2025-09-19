chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    userPrompt: '',
    threshold: 0.6,
    isEnabled: true
  });
});

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    chrome.storage.sync.get(['userPrompt', 'threshold', 'isEnabled'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});