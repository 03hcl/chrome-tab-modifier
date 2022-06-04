let title_changed = false;
let icon_changed = false;
let page_changed = false;

function fetch_rule(tab_modifier) {
  for (const rule of tab_modifier.rules) {
    const detect = rule.detection;
    const url = rule.url_fragment;
    if ((detect === undefined || detect === 'CONTAINS') && location.href.indexOf(url) !== -1) { return rule; }
    if ((detect === undefined || detect === 'CONTAINS') && location.href.indexOf(url) !== -1) { return rule; }
    else if (detect === 'STARTS' && location.href.startsWith(url) === true) { return rule; }
    else if (detect === 'ENDS' && location.href.endsWith(url) === true) { return rule; }
    else if (detect ===  'REGEXP' && new RegExp(url).test(location.href) === true) { return rule; }
    else if (detect ===  'EXACT' && location.href === url) { return rule; }
  }
  return null;
}

function get_text_by_selector(selector) {
  const parent = document.querySelector(selector);
  if (parent === null) { return ''; }
  for (node of parent.childNodes) {
    let value = '';
    if (node.tagName === 'input') { value = node.value; }
    else if (node.tagName === 'select') { value = node.options[node.selectedIndex].text; }
    else { value = node.innerText || node.textContent; }
    value = value.trim();
    if (value !== '') { return value; }
  }
  return '';
}

function update_title(title, tag, value) {
  if (value === '') { return title; }
  return title.replace(tag, value);
};

function handle_selector_matcher(title) {
  const matches = title.match(/\{([^}]+)}/g);
  if (matches === null) { return title; }
  for (match of matches) {
    const selector = match.substring(1, match.length - 1);
    const text = get_text_by_selector(selector);
    title = update_title(title, match, text);
  }
  return title;
}

function handle_matcher(title, matcher, current, tag_prefix) {
  if (matcher === null) { return title; }
  try {
    matches = current.match(new RegExp(matcher), 'g');
    if (matches === null) { return title; }
    for (const i in matches) { title = update_title(title, tag_prefix + i, matches[i]); }
  }
  catch (e) { console.log(e); }
  return title;
}

function process_title(rule, current_url, current_title) {
  let title = rule.tab.title;
  title = handle_selector_matcher(title);
  title = handle_matcher(title, rule.tab.title_matcher, current_title, '@');
  title = handle_matcher(title, rule.tab.url_matcher, current_url, '$');
  return title;
};

function apply_title_observer(rule) {
  const title_callback = (mutations, observer) => {
    if (title_changed === true) {
      title_changed = false;
      return;
    }
    if (rule.tab.title === null) { return; }
    const before = document.title;
    const after = process_title(rule, location.href, document.title);
    if (before !== after) {
      title_changed = true;
      document.title = after;
    }
  };

  // Observe when the website has changed the title
  const title_observer = new window.WebKitMutationObserver(title_callback);
  const config = { subtree: true, characterresponse: true, childList: true };
  title_observer.observe(document.querySelector('head > title'), config);
}

function process_icon(new_icon) {
  // Remove existing favicons
  const nodes = document.querySelectorAll('head link[rel*="icon"]');
  for (const node of nodes) { node.parentNode.removeChild(node); }
  // Create new favicon
  const link = document.createElement('link');
  link.type = 'image/x-icon';
  link.rel  = 'icon';
  // Set preconfigured or custom (http|https|data) icon
  if (/^(https?|data):/.test(new_icon) === true) { link.href = new_icon; }
  else { link.href = chrome.extension.getURL('/img/' + new_icon); }
  document.getElementsByTagName('head')[0].appendChild(link);
};

function apply_icon_observer(rule) {
  const change_icon = (node) => {
    if (node.type !== 'image/x-icon') { return; }
    icon_changed = true;
    process_icon(rule.tab.icon);
  };

  const icon_callback = (mutations, observer) => {
    if (icon_changed === true) {
      icon_changed = false;
      return;
    }
    // Handle favicon changes,  Detect added or removed favicon
    for (const mutation of mutations) {
      change_icon(mutation.target);
      for (const node of mutation.addedNodes) { change_icon(node); }
      for (const node of mutation.removedNodes) { change_icon(node); }
    }
  };

  const observer_icon = new window.WebKitMutationObserver(icon_callback);

  // Observe when the website has changed the head so the script
  // will detect favicon manipulation (add/remove)
  observer_icon.observe(
    document.querySelector('head'),
    {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true
    }
  );
}

function process_page(rule) {
  // Set title
  if (rule.tab.title !== null && document.title !== null) {
    document.title = process_title(rule, location.href, document.title);
  }

  // Observe when the website has changed the title
  if (document.querySelector('head > title') !== null) {
    apply_title_observer(rule);
  }

  // Pin the tab
  if (rule.tab.pinned === true) {
    chrome.runtime.sendMessage({ action: 'setPinned' });
  }

  // Set new icon
  if (rule.tab.icon !== null) {
    process_icon(rule.tab.icon);
    if (document.querySelector('head link[rel*="icon"]') !== null) { apply_icon_observer(rule); }
  }

  // Protect the tab
  if (rule.tab.protected === true) {
    window.onbeforeunload = () => { return ''; };
  }

  // Keep this tab unique
  if (rule.tab.unique === true) {
    chrome.runtime.sendMessage({ action: 'setUnique', url_fragment: rule.url_fragment });
  }

  // Mute the tab
  if (rule.tab.muted === true) {
    chrome.runtime.sendMessage({ action: 'setMuted' });
  }
}

function apply_page_observer(rule) {
  const page_callback = (mutations, observer) => {
    if (page_changed === true) {
      page_changed = false;
      return;
    }
    page_changed = true;
    process_page(rule);
  };
  const page_observer = new window.WebKitMutationObserver(page_callback);
  const config = { subtree: true, characterresponse: true, childList: true };
  page_observer.observe(document.body, config);
}

chrome.storage.local.get('tab_modifier', (items) => {
  const tab_modifier = items.tab_modifier;
  if (tab_modifier === undefined) { return; }
  const rule = fetch_rule(tab_modifier);
  if (rule === null) { return; }
  process_page(rule);
  apply_page_observer(rule);
  // Reverted #39
  // window.onhashchange = processPage;
});
