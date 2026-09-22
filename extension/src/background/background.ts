chrome.runtime.onInstalled.addListener(() => {
  console.log('Auto Listing AI installed');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_UPDATE' || message.type === 'CAPTURE_COMPLETE') {
    void chrome.runtime.sendMessage(message);
    return;
  }

  if (message.type !== 'FORWARD_TO_PAGE') return;

  if (message.tabId === undefined) {
    sendResponse({ success: false, error: 'No target tab specified' });
    return;
  }

  chrome.tabs.sendMessage(message.tabId, message.payload ?? { type: 'STOP_CAPTURE' })
    .then(() => sendResponse({ success: true }))
    .catch((error: unknown) => {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Page unavailable',
      });
    });

  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  await chrome.sidePanel.open({
    tabId: tab.id
  });
});