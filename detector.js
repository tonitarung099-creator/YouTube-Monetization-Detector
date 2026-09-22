(() => {
  const CHANNEL_SIGNALS = [
    {
      id: "channel_membership",
      weight: 95,
      tier: "strong",
      patterns: [
        /sponsorButtonRenderer/i,
        /sponsorships(?:Button|Header|Offer|Expandable)?Renderer/i,
        /"joinButton"\s*:/i,
        /ytd-sponsor-button-renderer/i
      ],
      label: "Membership/Join tersedia"
    },
    {
      id: "super_thanks",
      weight: 90,
      tier: "strong",
      patterns: [
        /superThanksButtonRenderer/i,
        /superThanksCommand/i,
        /"superThanksButton"\s*:/i
      ],
      label: "Super Thanks terdeteksi"
    },
    {
      id: "super_chat",
      weight: 85,
      tier: "strong",
      patterns: [
        /purchaseMessageEndpoint/i,
        /superChat(?:Renderer|Command|Endpoint)?/i,
        /superSticker(?:Renderer|Command|Endpoint)?/i
      ],
      label: "Super Chat/Super Sticker terdeteksi"
    },
    {
      id: "merch_shelf",
      weight: 45,
      tier: "medium",
      patterns: [
        /merchShelfRenderer/i,
        /ytd-merch-shelf-renderer/i
      ],
      label: "Merch shelf terdeteksi"
    },
    {
      id: "explicit_monetized_flag",
      weight: 95,
      tier: "strong",
      patterns: [
        /"isMonetized"\s*:\s*true/i,
        /"is_monetized"\s*:\s*true/i,
        /"is_monetized"\s*:\s*"true"/i,
        /"key"\s*:\s*"is_monetized"\s*,\s*"value"\s*:\s*"true"/i
      ],
      label: "Flag monetisasi eksplisit terdeteksi"
    }
  ];

  const VIDEO_SIGNALS = [
    {
      id: "yt_ad",
      weight: 60,
      tier: "medium",
      patterns: [
        /\[\{"key":"yt_ad","value":"1"\}\]/i,
        /"key"\s*:\s*"yt_ad"\s*,\s*"value"\s*:\s*"1"/i
      ],
      label: "Sinyal yt_ad aktif pada video"
    },
    {
      id: "video_monetization_details",
      weight: 90,
      tier: "strong",
      patterns: [
        /"monetizationDetails"\s*:\s*\{/i,
        /"isMonetized"\s*:\s*true/i
      ],
      label: "Monetization details pada video terdeteksi"
    },
    {
      id: "ad_placements",
      weight: 15,
      tier: "weak",
      patterns: [
        /"adPlacements"\s*:/i,
        /"playerAds"\s*:/i,
        /adBreakServiceRenderer/i
      ],
      label: "Sinyal iklan umum terdeteksi"
    }
  ];

  function uniqueSignals(signals) {
    const seen = new Set();
    return signals.filter((signal) => {
      if (seen.has(signal.id)) return false;
      seen.add(signal.id);
      return true;
    });
  }

  function findSignals(text, definitions) {
    if (!text) return [];
    return definitions.filter((definition) =>
      definition.patterns.some((pattern) => pattern.test(text))
    );
  }

  function toPublicSignal(signal) {
    return {
      id: signal.id,
      label: signal.label,
      weight: signal.weight,
      tier: signal.tier
    };
  }

  function classifyScore(score, strongCount = 0) {
    if (strongCount > 0 || score >= 85) {
      return {
        status: "detected",
        label: "MONETISASI TERDETEKSI",
        shortLabel: "MONET",
        confidence: Math.min(99, Math.max(86, score))
      };
    }

    if (score >= 35) {
      return {
        status: "possible",
        label: "KEMUNGKINAN DIMONETISASI",
        shortLabel: "MUNGKIN",
        confidence: Math.min(84, Math.max(45, score))
      };
    }

    return {
      status: "unknown",
      label: "TIDAK DAPAT DIPASTIKAN",
      shortLabel: "BELUM PASTI",
      confidence: 0
    };
  }

  function detectFromChannelHtml(html) {
    const found = uniqueSignals(findSignals(html, CHANNEL_SIGNALS));
    const strongCount = found.filter((signal) => signal.tier === "strong").length;
    const score = Math.min(
      99,
      found.reduce((sum, signal) => sum + signal.weight, 0)
    );

    return {
      ...classifyScore(score, strongCount),
      score,
      signals: found.map(toPublicSignal),
      checkedAt: Date.now()
    };
  }

  function detectFromVideoHtml(html) {
    const channelSignals = findSignals(html, CHANNEL_SIGNALS);
    const videoSignals = findSignals(html, VIDEO_SIGNALS);
    const found = uniqueSignals([...channelSignals, ...videoSignals]);
    const strongCount = found.filter((signal) => signal.tier === "strong").length;
    const score = Math.min(
      99,
      found.reduce((sum, signal) => sum + signal.weight, 0)
    );

    return {
      ...classifyScore(score, strongCount),
      score,
      signals: found.map(toPublicSignal),
      checkedAt: Date.now()
    };
  }

  function detectFromDocument(doc) {
    const tokens = [];

    const selectors = [
      ['button[aria-label*="Thanks" i]', "superThanksButtonRenderer"],
      ['button[aria-label*="Terima kasih" i]', "superThanksButtonRenderer"],
      ['button[aria-label*="Join" i]', "sponsorButtonRenderer"],
      ['button[aria-label*="Gabung" i]', "sponsorButtonRenderer"],
      ['yt-button-shape button[aria-label*="Join" i]', "sponsorButtonRenderer"],
      ['ytd-sponsor-button-renderer', "sponsorButtonRenderer"],
      ['ytd-button-renderer a[href*="/join"]', "sponsorButtonRenderer"],
      ['ytd-merch-shelf-renderer', "merchShelfRenderer"],
      ['yt-live-chat-paid-message-renderer', "superChatRenderer"],
      ['yt-live-chat-paid-sticker-renderer', "superStickerRenderer"]
    ];

    for (const [selector, token] of selectors) {
      try {
        const element = doc.querySelector(selector);
        if (element) tokens.push(token);
      } catch (_) {}
    }

    return detectFromChannelHtml(tokens.join("\n"));
  }

  function extractVideoIds(html, limit = 12) {
    if (!html || limit <= 0) return [];

    const ids = [];
    const seen = new Set();
    const patterns = [
      /"watchEndpoint"\s*:\s*\{\s*"videoId"\s*:\s*"([\w-]{11})"/g,
      /"videoId"\s*:\s*"([\w-]{11})"/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const id = match[1];
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= limit) return ids;
      }
    }

    return ids;
  }

  function mergeChannelEvidence(channelDetection, videoDetections = []) {
    const channel = channelDetection || detectFromChannelHtml("");
    const videos = Array.isArray(videoDetections) ? videoDetections : [];

    const mergedSignals = new Map();
    for (const signal of channel.signals || []) {
      mergedSignals.set(signal.id, signal);
    }

    let ytAdHits = 0;
    let strongVideoHits = 0;
    let genericAdHits = 0;

    for (const video of videos) {
      const ids = new Set((video.signals || []).map((signal) => signal.id));
      if (ids.has("yt_ad")) ytAdHits += 1;
      if (ids.has("video_monetization_details") || ids.has("explicit_monetized_flag")) {
        strongVideoHits += 1;
      }
      if (ids.has("ad_placements")) genericAdHits += 1;

      for (const signal of video.signals || []) {
        if (signal.id === "ad_placements") continue;
        mergedSignals.set(signal.id, signal);
      }
    }

    const channelStrong = (channel.signals || []).some(
      (signal) => signal.tier === "strong"
    );

    let status = "unknown";
    let confidence = 0;
    let label = "TIDAK DAPAT DIPASTIKAN";
    let shortLabel = "BELUM PASTI";

    if (channelStrong) {
      status = "detected";
      confidence = 97;
      label = "MONETISASI TERDETEKSI";
      shortLabel = "MONET";
    } else if (strongVideoHits >= 1) {
      status = "detected";
      confidence = 94;
      label = "MONETISASI TERDETEKSI";
      shortLabel = "MONET";
    } else if (ytAdHits >= 2) {
      status = "detected";
      confidence = 92;
      label = "MONETISASI TERDETEKSI";
      shortLabel = "MONET";
    } else if (ytAdHits === 1) {
      status = "possible";
      confidence = 74;
      label = "KEMUNGKINAN DIMONETISASI";
      shortLabel = "MUNGKIN";
    } else if ((channel.signals || []).length > 0 || genericAdHits >= 2) {
      status = "possible";
      confidence = 55;
      label = "KEMUNGKINAN DIMONETISASI";
      shortLabel = "MUNGKIN";
    }

    const signals = [...mergedSignals.values()];
    if (ytAdHits >= 2) {
      signals.push({
        id: "multiple_yt_ad_samples",
        label: `yt_ad aktif pada ${ytAdHits} video sampel`,
        weight: 90,
        tier: "strong"
      });
    } else if (ytAdHits === 1) {
      signals.push({
        id: "single_yt_ad_sample",
        label: "yt_ad aktif pada 1 video sampel",
        weight: 60,
        tier: "medium"
      });
    }

    return {
      status,
      confidence,
      label,
      shortLabel,
      score: confidence,
      signals: uniqueSignals(signals),
      sampleSummary: {
        checked: videos.length,
        ytAdHits,
        strongVideoHits,
        genericAdHits
      },
      checkedAt: Date.now()
    };
  }

  function normalizeChannelUrl(input) {
    try {
      const url = new URL(input, "https://www.youtube.com");
      if (url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") {
        return null;
      }

      const path = url.pathname.replace(/\/+$/, "");
      const accepted = [
        /^\/@[^/]+$/i,
        /^\/channel\/UC[\w-]+$/i,
        /^\/c\/[^/]+$/i,
        /^\/user\/[^/]+$/i
      ];

      if (!accepted.some((re) => re.test(path))) return null;
      return "https://www.youtube.com" + path;
    } catch (_) {
      return null;
    }
  }

  globalThis.YMDDetector = {
    detectFromChannelHtml,
    detectFromVideoHtml,
    detectFromDocument,
    extractVideoIds,
    mergeChannelEvidence,
    normalizeChannelUrl,
    classifyScore
  };
})();
