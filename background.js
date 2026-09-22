importScripts("detector.js");

const CACHE_PREFIX = "ymd:channel:";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SAMPLE_VIDEO_COUNT = 3;
const FETCH_TIMEOUT_MS = 12000;

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

async function incrementStats(videoSamples = 0) {
  const { ymdStats = { scans: 0, videoSamples: 0 } } =
    await chrome.storage.local.get("ymdStats");

  ymdStats.scans = (ymdStats.scans || 0) + 1;
  ymdStats.videoSamples = (ymdStats.videoSamples || 0) + videoSamples;
  ymdStats.lastScanAt = Date.now();

  await chrome.storage.local.set({ ymdStats });
}

async function fetchText(url, credentials = "include") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.7"
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube merespons HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectSampleVideo(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const html = await fetchText(url, "omit");
    const detection = YMDDetector.detectFromVideoHtml(html);

    return {
      videoId,
      url,
      ok: true,
      status: detection.status,
      signals: detection.signals
    };
  } catch (error) {
    return {
      videoId,
      url,
      ok: false,
      status: "unknown",
      signals: [],
      error: error?.message || "Gagal memeriksa video"
    };
  }
}

function pickSampleVideoIds(html) {
  const ids = YMDDetector.extractVideoIds(html, 12);
  return ids.slice(0, SAMPLE_VIDEO_COUNT);
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

  const [channelHtml, videosHtml] = await Promise.all([
    fetchText(url),
    fetchText(url + "/videos").catch(() => "")
  ]);

  const channelDetection = YMDDetector.detectFromChannelHtml(
    channelHtml + "\n" + videosHtml
  );

  const sampleIds = pickSampleVideoIds(videosHtml || channelHtml);
  const sampleResults = await Promise.all(
    sampleIds.map((videoId) => inspectSampleVideo(videoId))
  );

  const videoDetections = sampleResults
    .filter((sample) => sample.ok)
    .map((sample) => ({
      status: sample.status,
      signals: sample.signals
    }));

  const merged = YMDDetector.mergeChannelEvidence(
    channelDetection,
    videoDetections
  );

  const result = {
    ...merged,
    channelUrl: url,
    cached: false,
    samples: sampleResults,
    methodVersion: 2
  };

  await setCached(url, result);
  await incrementStats(sampleResults.length);

  return result;
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
