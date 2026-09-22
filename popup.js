const enabled = document.getElementById("enabled");
const maxChannels = document.getElementById("maxChannels");
const showConfidence = document.getElementById("showConfidence");
const scanCount = document.getElementById("scanCount");

async function load() {
  const data = await chrome.storage.local.get([
    "ymdEnabled",
    "ymdSettings",
    "ymdStats"
  ]);

  enabled.checked = data.ymdEnabled !== false;

  const settings = data.ymdSettings || {};
  maxChannels.value = String(settings.maxChannelsPerPage || 30);
  showConfidence.checked = settings.showConfidence !== false;
  scanCount.textContent = String(data.ymdStats?.scans || 0);
}

async function saveSettings() {
  await chrome.storage.local.set({
    ymdSettings: {
      maxChannelsPerPage: Number(maxChannels.value),
      showConfidence: showConfidence.checked
    }
  });
}

enabled.addEventListener("change", () => {
  chrome.storage.local.set({ ymdEnabled: enabled.checked });
});

maxChannels.addEventListener("change", saveSettings);
showConfidence.addEventListener("change", saveSettings);

load();
