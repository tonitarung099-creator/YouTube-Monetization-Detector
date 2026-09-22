(() => {
  const detector = globalThis.YMDDetector;
  if (!detector) return;

  const resultCache = new Map();
  const pending = new Map();
  let routeToken = 0;
  let scanTimer = null;
  let observer = null;

  const CHANNEL_SELECTOR = [
    'a[href^="/@"]',
    'a[href^="/channel/"]',
    'a[href^="/c/"]',
    'a[href^="/user/"]'
  ].join(",");

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "Tidak ada respons" });
        });
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });
  }

  async function getEnabled() {
    const { ymdEnabled = true } = await chrome.storage.local.get("ymdEnabled");
    return ymdEnabled;
  }

  async function getSettings() {
    const { ymdSettings = {} } = await chrome.storage.local.get("ymdSettings");
    return {
      maxChannelsPerPage: Number(ymdSettings.maxChannelsPerPage) || 30,
      showConfidence: ymdSettings.showConfidence !== false
    };
  }

  function clearUi() {
    document.getElementById("ymd-floating-status")?.remove();
    for (const badge of document.querySelectorAll(".ymd-badge")) badge.remove();
  }

  function ensureGlobalPanel() {
    let panel = document.getElementById("ymd-floating-status");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "ymd-floating-status";
    panel.className = "ymd-floating ymd-status-unknown";
    panel.innerHTML = `
      <span class="ymd-dot"></span>
      <span class="ymd-floating-text">Monetisasi: memindai…</span>
    `;
    document.documentElement.appendChild(panel);
    return panel;
  }

  function updateGlobalPanel(result) {
    if (!location.pathname.startsWith("/watch")) {
      document.getElementById("ymd-floating-status")?.remove();
      return;
    }

    const panel = ensureGlobalPanel();
    const nextClass = `ymd-floating ymd-status-${result.status || "unknown"}`;
    if (panel.className !== nextClass) panel.className = nextClass;

    const nextText =
      result.status === "detected"
        ? "Monetisasi terdeteksi"
        : result.status === "possible"
        ? "Kemungkinan monetisasi"
        : "Status monetisasi belum pasti";

    const text = panel.querySelector(".ymd-floating-text");
    if (text && text.textContent !== nextText) text.textContent = nextText;

    const signalText = (result.signals || []).map((s) => s.label).join(" • ");
    const nextTitle =
      signalText ||
      "Tidak ada sinyal publik yang cukup untuk memastikan status monetisasi.";
    if (panel.title !== nextTitle) panel.title = nextTitle;
  }

  function createBadge(result, settings) {
    const badge = document.createElement("span");
    badge.className = `ymd-badge ymd-status-${result.status}`;
    badge.dataset.ymdBadge = "1";

    const confidence =
      settings.showConfidence && result.confidence
        ? ` ${result.confidence}%`
        : "";

    badge.textContent =
      result.status === "detected"
        ? `✓ MONET${confidence}`
        : result.status === "possible"
        ? `? MUNGKIN${confidence}`
        : "? BELUM PASTI";

    const details = (result.signals || []).map((s) => s.label).join("\n");
    badge.title =
      details ||
      "YouTube tidak menyediakan status YPP publik secara langsung. Tidak ada sinyal publik yang cukup.";
    return badge;
  }

  function injectBadge(anchor, result, settings) {
    if (!anchor?.isConnected) return;

    const holder =
      anchor.closest("#channel-name, ytd-channel-name, #text-container") ||
      anchor.parentElement ||
      anchor;

    if (holder.querySelector(":scope > .ymd-badge")) return;
    holder.appendChild(createBadge(result, settings));
  }

  async function scanUrl(url) {
    const normalized = detector.normalizeChannelUrl(url);
    if (!normalized) return null;

    if (resultCache.has(normalized)) return resultCache.get(normalized);
    if (pending.has(normalized)) return pending.get(normalized);

    const promise = sendMessage({
      type: "YMD_SCAN_CHANNEL",
      url: normalized
    }).then((response) => {
      pending.delete(normalized);
      if (!response?.ok) return null;
      resultCache.set(normalized, response.result);
      return response.result;
    });

    pending.set(normalized, promise);
    return promise;
  }

  function collectChannelAnchors(limit) {
    const anchors = [];
    const seenElements = new Set();

    for (const anchor of document.querySelectorAll(CHANNEL_SELECTOR)) {
      if (anchors.length >= limit) break;
      if (seenElements.has(anchor)) continue;
      if (anchor.dataset.ymdProcessed === "1") continue;

      const href = anchor.getAttribute("href");
      const normalized = detector.normalizeChannelUrl(href);
      if (!normalized) continue;

      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      seenElements.add(anchor);
      anchor.dataset.ymdProcessed = "1";
      anchors.push({ anchor, url: normalized });
    }

    return anchors;
  }

  async function scanPage() {
    if (!(await getEnabled())) {
      clearUi();
      return;
    }

    const myToken = routeToken;
    const settings = await getSettings();
    const items = collectChannelAnchors(settings.maxChannelsPerPage);

    const queue = [...items];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && myToken === routeToken) {
        const item = queue.shift();
        if (!item) break;

        const result = await scanUrl(item.url);
        if (result && myToken === routeToken) {
          injectBadge(item.anchor, result, settings);
        }

        await sleep(120);
      }
    });

    await Promise.all(workers);

    if (location.pathname.startsWith("/watch")) {
      const domDetection = detector.detectFromDocument(document);
      const channelLink = document.querySelector(
        '#owner a[href^="/@"], #owner a[href^="/channel/"], ytd-video-owner-renderer a[href^="/@"]'
      );
      const channelResult = channelLink
        ? await scanUrl(channelLink.getAttribute("href"))
        : null;

      const best =
        channelResult?.status === "detected"
          ? channelResult
          : domDetection.status === "detected"
          ? domDetection
          : channelResult || domDetection;

      updateGlobalPanel(best);
    } else {
      updateGlobalPanel({ status: "unknown" });
    }
  }

  function scheduleScan(delay = 500) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanPage, delay);
  }

  function resetForNavigation() {
    routeToken += 1;
    for (const el of document.querySelectorAll("[data-ymd-processed]")) {
      delete el.dataset.ymdProcessed;
    }
    scheduleScan(650);
  }

  function isExtensionMutation(mutation) {
    const target =
      mutation.target?.nodeType === Node.ELEMENT_NODE
        ? mutation.target
        : mutation.target?.parentElement;

    if (target?.closest?.("#ymd-floating-status, .ymd-badge")) return true;

    const added = Array.from(mutation.addedNodes || []);
    if (!added.length) return false;

    return added.every((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      return (
        node.matches?.("#ymd-floating-status, .ymd-badge") ||
        node.closest?.("#ymd-floating-status, .ymd-badge")
      );
    });
  }

  function startObserver() {
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (m) => !isExtensionMutation(m) && Boolean(m.addedNodes?.length)
      );
      if (relevant) scheduleScan(650);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener("yt-navigate-finish", resetForNavigation, true);
  window.addEventListener("popstate", resetForNavigation);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.ymdEnabled && changes.ymdEnabled.newValue === false) {
      clearUi();
      return;
    }

    if (changes.ymdEnabled || changes.ymdSettings) resetForNavigation();
  });

  startObserver();
  scheduleScan(700);
})();
