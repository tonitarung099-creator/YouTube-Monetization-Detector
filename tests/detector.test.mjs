import "../detector.js";
import assert from "node:assert/strict";

const d = globalThis.YMDDetector;

assert.ok(d, "Detector harus tersedia di globalThis");

{
  const r = d.detectFromChannelHtml(
    '<div>{"sponsorButtonRenderer":{"text":"Join"}}</div>'
  );
  assert.equal(r.status, "detected");
  assert.ok(r.confidence >= 85);
}

{
  const r = d.detectFromChannelHtml(
    '<script>var x={"adPlacements":[{"foo":"bar"}]}</script>'
  );
  assert.equal(r.status, "possible");
}

{
  const r = d.detectFromChannelHtml("<html><body>channel biasa</body></html>");
  assert.equal(r.status, "unknown");
}

assert.equal(
  d.normalizeChannelUrl("https://www.youtube.com/@contoh/videos"),
  null
);
assert.equal(
  d.normalizeChannelUrl("https://www.youtube.com/@contoh"),
  "https://www.youtube.com/@contoh"
);

console.log("Semua test detector lulus.");
