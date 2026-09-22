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
      maxChannelsPerPage: Number(ymdSettings.maxChannelsPerPage) || 15,
      showConfidence: ymdSettings.showConfidence !== false
    };
  }

  function clearUi() {
    document.getElementById("ymd-floating-status")?.remove();
    for (const badge of document.querySelectorAll(".ymd-badge")) badge.remove();
  }

  function resultDetails(result) {
    const lines = [];
    for (const signal of result?.signals || []) {
      lines.push("• " + signal.label);
    }

    if (result?.sampleSummary?.checked) {
      lines.push(
        `• Sampel video: ${result.sampleSummary.checked}, yt_ad aktif: ${result.sampleSummary.ytAdHits || 0}`
      );
    }

    return (
      lines.join("\n") ||
      "Tidak ada sinyal publik yang cukup untuk memastikan status monetisasi."
    );
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
    const relevant =
      location.pathname.startsWith("/watch") ||
      location.pathname.startsWith("/shorts/") ||
      detector.normalizeChannelUrl(location.href);

    if (!relevant) {
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

    panel.title = resultDetails(result);
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

    badge.title = resultDetails(result);
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
    const seenUrls = new Set();

    for (const anchor of document.querySelectorAll(CHANNEL_SELECTOR)) {
      if (anchors.length >= limit) break;
      if (anchor.dataset.ymdProcessed === "1") continue;

      const normalized = detector.normalizeChannelUrl(anchor.getAttribute("href"));
      if (!normalized || seenUrls.has(normalized)) continue;

      const rect = anchor.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      seenUrls.add(normalized);
      anchor.dataset.ymdProcessed = "1";
      anchors.push({ anchor, url: normalized });
    }

    return anchors;
  }

  function findOwnerChannelLink() {
    const selectors = [
      '#owner a[href^="/@"]',
      '#owner a[href^="/channel/"]',
      'ytd-video-owner-renderer a[href^="/@"]',
      'ytd-reel-video-renderer[is-active] a[href^="/@"]',
      'ytd-reel-player-overlay-renderer a[href^="/@"]',
      'a.yt-simple-endpoint[href^="/@"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const normalized = detector.normalizeChannelUrl(el?.getAttribute("href"));
      if (normalized) return normalized;
    }

    return detector.normalizeChannelUrl(location.href);
  }

  async function scanCurrentContext() {
    const domDetection = detector.detectFromDocument(document);
    const channelUrl = findOwnerChannelLink();
    const channelResult = channelUrl ? await scanUrl(channelUrl) : null;

    if (channelResult?.status === "detected") return channelResult;
    if (domDetection.status === "detected") return domDetection;
    if (channelResult?.status === "possible") return channelResult;
    if (domDetection.status === "possible") return domDetection;

    return channelResult || domDetection;
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
    const workerCount = Math.min(3, queue.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (queue.length && myToken === routeToken) {
        const item = queue.shift();
        if (!item) break;

        const result = await scanUrl(item.url);
        if (result && myToken === routeToken) {
          injectBadge(item.anchor, result, settings);
        }

        await sleep(180);
      }
    });

    await Promise.all(workers);

    const isDetailPage =
      location.pathname.startsWith("/watch") ||
      location.pathname.startsWith("/shorts/") ||
      Boolean(detector.normalizeChannelUrl(location.href));

    if (isDetailPage && myToken === routeToken) {
      const result = await scanCurrentContext();
      if (result && myToken === routeToken) updateGlobalPanel(result);
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
    document.getElementById("ymd-floating-status")?.remove();

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
        (mutation) =>
          !isExtensionMutation(mutation) && Boolean(mutation.addedNodes?.length)
      );
      if (relevant) scheduleScan(700);
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
