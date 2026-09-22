importScripts("detector.js");

const CACHE_PREFIX = "ymd:channel:";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(url) {
  return CACHE_PREFIX + url;
}

async function getCached(url) {
  const key = cacheKey(url);
  const data = await chrome.storage.local.get(key);
  const entry = data[key];

  if (!entry || !entry.checkedAt) return null;
  if (Date.now() - entry.checkedAt > CACHE_TTL_MS) return null;
  return entry;
}

async function setCached(url, result) {
  await chrome.storage.local.set({
    [cacheKey(url)]: result
  });
}

async function incrementStats() {
  const { ymdStats = { scans: 0 } } = await chrome.storage.local.get("ymdStats");
  ymdStats.scans = (ymdStats.scans || 0) + 1;
  ymdStats.lastScanAt = Date.now();
  await chrome.storage.local.set({ ymdStats });
}

async function scanChannel(rawUrl, force = false) {
  const url = YMDDetector.normalizeChannelUrl(rawUrl);
  if (!url) {
    throw new Error("URL channel tidak valid");
  }

  if (!force) {
    const cached = await getCached(url);
    if (cached) return { ...cached, cached: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.7"
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube merespons HTTP ${response.status}`);
    }

    const html = await response.text();
    const detection = YMDDetector.detectFromChannelHtml(html);
    const result = {
      ...detection,
      channelUrl: url,
      cached: false
    };

    await setCached(url, result);
    await incrementStats();
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["ymdEnabled", "ymdSettings"]);
  const patch = {};

  if (typeof current.ymdEnabled !== "boolean") patch.ymdEnabled = true;
  if (!current.ymdSettings) {
    patch.ymdSettings = {
      maxChannelsPerPage: 30,
      showConfidence: true
    };
  }

  if (Object.keys(patch).length) {
    await chrome.storage.local.set(patch);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "YMD_SCAN_CHANNEL") return false;

  scanChannel(message.url, Boolean(message.force))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error?.message || "Gagal memeriksa channel"
      })
    );

  return true;
});
