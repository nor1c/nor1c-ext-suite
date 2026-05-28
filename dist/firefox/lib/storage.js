async function getToggles(keys) {
  const result = await chrome.storage.sync.get(keys);
  return result;
}

function onStorageChange(key, callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[key]) {
      callback(changes[key].newValue);
    }
  });
}

function listenForMessages(handlers) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const handler = handlers[msg.type];
    if (handler) {
      const result = handler(msg, sender);
      if (result instanceof Promise) {
        result.then(sendResponse);
        return true;
      }
      sendResponse(result);
    }
  });
}
