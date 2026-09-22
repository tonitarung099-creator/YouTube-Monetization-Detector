(() => {
  const STRONG_SIGNALS = [
    {
      id: "channel_membership",
      weight: 80,
      patterns: [
        /sponsorButtonRenderer/i,
        /sponsorships(?:Button|Header|Offer|Expandable)?Renderer/i,
        /"sponsorButton"/i,
        /"memberships?"/i
      ],
      label: "Membership/Join tersedia"
    },
    {
      id: "super_thanks",
      weight: 75,
      patterns: [
        /superThanks/i,
        /superThanksButtonRenderer/i,
        /superThanksCommand/i
      ],
      label: "Super Thanks terdeteksi"
    },
    {
      id: "super_chat",
      weight: 70,
      patterns: [
        /purchaseMessageEndpoint/i,
        /superChat(?:Renderer|Command|Endpoint)?/i,
        /superSticker(?:Renderer|Command|Endpoint)?/i
      ],
      label: "Super Chat/Super Sticker terdeteksi"
    }
  ];

  const WEAK_SIGNALS = [
    {
      id: "ad_placements",
      weight: 25,
      patterns: [
        /"adPlacements"\s*:/i,
        /"playerAds"\s*:/i,
        /adBreakServiceRenderer/i
      ],
      label: "Sinyal penayangan iklan terdeteksi"
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

  function classify(score, strongCount) {
    if (strongCount > 0 || score >= 70) {
      return {
        status: "detected",
        label: "MONETISASI TERDETEKSI",
        shortLabel: "MONET",
        confidence: Math.min(99, Math.max(85, score))
      };
    }

    if (score >= 25) {
      return {
        status: "possible",
        label: "MUNGKIN DIMONETISASI",
        shortLabel: "MUNGKIN",
        confidence: Math.min(79, Math.max(35, score + 15))
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
    const strong = findSignals(html, STRONG_SIGNALS);
    const weak = findSignals(html, WEAK_SIGNALS);
    const signals = uniqueSignals([...strong, ...weak]);
    const rawScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
    const score = Math.min(99, rawScore);
    const classification = classify(score, strong.length);

    return {
      ...classification,
      score,
      signals: signals.map(({ id, label, weight }) => ({ id, label, weight })),
      checkedAt: Date.now()
    };
  }

  function detectFromDocument(doc) {
    const textBits = [];

    const selectors = [
      'button[aria-label*="Thanks" i]',
      'button[aria-label*="Terima kasih" i]',
      'button[aria-label*="Join" i]',
      'button[aria-label*="Gabung" i]',
      'yt-button-shape button[aria-label*="Join" i]',
      'ytd-sponsor-button-renderer',
      'ytd-button-renderer a[href*="/join"]'
    ];

    for (const selector of selectors) {
      try {
        for (const el of doc.querySelectorAll(selector)) {
          textBits.push(el.outerHTML || el.textContent || "");
        }
      } catch (_) {}
    }

    return detectFromChannelHtml(textBits.join("\n"));
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
    detectFromDocument,
    normalizeChannelUrl,
    classify
  };
})();
