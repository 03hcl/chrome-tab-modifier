/*jshint esversion: 6, loopfunc: true */

let options_url = chrome.extension.getURL('html/options.html');

// --------------------------------------------------------------------------------------------------------
// Functions

function openOptionsPage(hash) {
  chrome.tabs.query({ url: options_url }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true, highlighted: true }, function (current_tab) {
        chrome.windows.update(current_tab.windowId, { focused: true });
      });
    }
    else { chrome.tabs.create({ url: (hash !== undefined) ? options_url + '#' + hash : options_url }); }
  });
};

function getStorage(callback) {
  chrome.storage.local.get('tab_modifier', (items) => { callback(items.tab_modifier); });
};

// --------------------------------------------------------------------------------------------------------
// Events

chrome.runtime.onMessage.addListener((message, sender) => {
  switch (message.action) {
    case 'setUnique':
      chrome.tabs.get(sender.tab.id, (current_tab) => {
        if (current_tab === undefined) { return; }
        chrome.tabs.query({}, function (tabs) {
          for (const tab of tabs) {
            if (tab.url.indexOf(message.url_fragment) === -1 || tab.id === current_tab.id) { continue; }
            let tab_id = tab.id;
            chrome.tabs.executeScript(
              current_tab.id,
              { code: 'window.onbeforeunload = null;' },
              () => {
                chrome.tabs.remove(current_tab.id);
                chrome.tabs.update(tab_id, { url: current_tab.url, highlighted: true });
              }
            );
          }
        });
      });
      break;
    case 'setPinned':
      chrome.tabs.update(sender.tab.id, { pinned: true });
      break;
    case 'setMuted':
      chrome.tabs.update(sender.tab.id, { muted: true });
      break;
  }
});

chrome.browserAction.onClicked.addListener(() => { openOptionsPage(); });

chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case 'install':
      openOptionsPage('install');
      break;
    case 'update':
      getStorage((tab_modifier) => {
        if (tab_modifier === undefined || tab_modifier.settings === undefined) { return; }
        if (
          tab_modifier.settings !== undefined
          && tab_modifier.settings.enable_new_version_notification === true
          && details.previousVersion !== chrome.runtime.getManifest().version
        ) {
          openOptionsPage('update/' + chrome.runtime.getManifest().version);
        }
      });
      break;
  }
});

chrome.contextMenus.create({ id: 'rename-tab', title: 'Rename Tab', contexts: ['all'] });

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== 'rename-tab') { return; }
  let title = prompt('Enter the new title, a Tab rule will be automatically created for you based on current URL');

  getStorage((tab_modifier) => {
    if (tab_modifier === undefined) {
      tab_modifier = { settings: { enable_new_version_notification: false }, rules: [] };
    }

    let rule = {
      name: 'Rule created from right-click (' + tab.url.replace(/(^\w+:|^)\/\//, '').substring(0, 15) + '...)',
      detection: 'CONTAINS',
      url_fragment: tab.url,
      tab: {
        title: title,
        icon: null,
        pinned: false,
        protected: false,
        unique: false,
        muted: false,
        title_matcher: null,
        url_matcher: null
      }
    };

    tab_modifier.rules.push(rule);
    chrome.storage.local.set({ tab_modifier: tab_modifier });
    chrome.tabs.reload(tab.id);
  });
});
