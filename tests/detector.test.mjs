import "../detector.js";
import assert from "node:assert/strict";

const d = globalThis.YMDDetector;

assert.ok(d, "Detector harus tersedia di globalThis");

{
  const r = d.detectFromChannelHtml(
    '<div>{"sponsorButtonRenderer":{"text":"Join"}}</div>'
  );
  assert.equal(r.status, "detected");
  assert.ok(r.confidence >= 86);
}

{
  const r = d.detectFromVideoHtml(
    '<script>var x=[{"key":"yt_ad","value":"1"}]</script>'
  );
  assert.equal(r.status, "possible");
  assert.ok(r.signals.some((s) => s.id === "yt_ad"));
}

{
  const r = d.detectFromVideoHtml(
    '<script>var x={"monetizationDetails":{"isMonetized":true}}</script>'
  );
  assert.equal(r.status, "detected");
}

{
  const ids = d.extractVideoIds(
    '{"watchEndpoint":{"videoId":"abcdefghijk"}} {"videoId":"12345678901"}',
    3
  );
  assert.deepEqual(ids, ["abcdefghijk", "12345678901"]);
}

{
  const channel = d.detectFromChannelHtml("<html></html>");
  const v1 = d.detectFromVideoHtml('[{"key":"yt_ad","value":"1"}]');
  const v2 = d.detectFromVideoHtml('[{"key":"yt_ad","value":"1"}]');
  const merged = d.mergeChannelEvidence(channel, [v1, v2]);

  assert.equal(merged.status, "detected");
  assert.equal(merged.sampleSummary.ytAdHits, 2);
}

{
  const channel = d.detectFromChannelHtml("<html></html>");
  const v1 = d.detectFromVideoHtml('[{"key":"yt_ad","value":"1"}]');
  const merged = d.mergeChannelEvidence(channel, [v1]);

  assert.equal(merged.status, "possible");
  assert.equal(merged.sampleSummary.ytAdHits, 1);
}

{
  const r = d.detectFromChannelHtml(
    '<div>{"showLiveChatActionPanelRenderer":{}}</div>'
  );
  assert.equal(r.status, "unknown");
}

assert.equal(
  d.normalizeChannelUrl("https://www.youtube.com/@contoh/videos"),
  "https://www.youtube.com/@contoh"
);
assert.equal(
  d.normalizeChannelUrl("https://www.youtube.com/@contoh/shorts"),
  "https://www.youtube.com/@contoh"
);
assert.equal(
  d.normalizeChannelUrl("https://www.youtube.com/watch?v=abcdefghijk"),
  null
);

console.log("Semua test detector lulus.");
