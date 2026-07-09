// Minimal HLS playlist parser shared by the popup and the offscreen page.
// Plain script (no modules) so it can be loaded with a <script> tag in both.
// Exposes a single global: ScrawnloadM3U8.
(function (global) {
  function parseAttributes(line) {
    // Attribute lists are comma-separated KEY=VALUE pairs where VALUE may be
    // a quoted string containing commas.
    const attrs = {};
    const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
    let match;
    while ((match = regex.exec(line))) {
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      attrs[match[1]] = value;
    }
    return attrs;
  }

  function resolveUrl(url, baseUrl) {
    return new URL(url, baseUrl).href;
  }

  // Returns { isMaster, variants, segments, initSegment, live, mediaSequence }.
  // - variants: [{url, bandwidth, resolution, codecs}] for master playlists
  // - segments: [{url, duration, key: {method, uri, iv} | null}] for media playlists
  // - initSegment: url | null (EXT-X-MAP, fMP4 streams)
  // - live: true when the playlist has no EXT-X-ENDLIST
  function parse(text, baseUrl) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== "#EXTM3U") {
      throw new Error("Not an M3U8 playlist");
    }

    const result = {
      isMaster: false,
      variants: [],
      segments: [],
      initSegment: null,
      live: true,
      mediaSequence: 0,
    };

    let pendingVariant = null;
    let currentKey = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        result.isMaster = true;
        const attrs = parseAttributes(line.slice("#EXT-X-STREAM-INF:".length));
        pendingVariant = {
          bandwidth: attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : null,
          resolution: attrs.RESOLUTION || null,
          codecs: attrs.CODECS || null,
        };
      } else if (line.startsWith("#EXT-X-KEY:")) {
        const attrs = parseAttributes(line.slice("#EXT-X-KEY:".length));
        if (attrs.METHOD === "NONE") {
          currentKey = null;
        } else {
          currentKey = {
            method: attrs.METHOD,
            uri: attrs.URI ? resolveUrl(attrs.URI, baseUrl) : null,
            iv: attrs.IV || null,
          };
        }
      } else if (line.startsWith("#EXT-X-MAP:")) {
        const attrs = parseAttributes(line.slice("#EXT-X-MAP:".length));
        if (attrs.URI) result.initSegment = resolveUrl(attrs.URI, baseUrl);
      } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
        result.mediaSequence = parseInt(line.split(":")[1], 10) || 0;
      } else if (line.startsWith("#EXT-X-ENDLIST")) {
        result.live = false;
      } else if (line.startsWith("#EXTINF:")) {
        const duration = parseFloat(line.slice("#EXTINF:".length)) || 0;
        // The URI is the next non-comment line.
        while (i + 1 < lines.length && lines[i + 1].startsWith("#")) i++;
        if (i + 1 < lines.length) {
          i++;
          result.segments.push({
            url: resolveUrl(lines[i], baseUrl),
            duration,
            key: currentKey,
          });
        }
      } else if (pendingVariant && !line.startsWith("#")) {
        pendingVariant.url = resolveUrl(line, baseUrl);
        result.variants.push(pendingVariant);
        pendingVariant = null;
      }
    }

    // Master playlists never contain segments; a playlist with neither
    // variants nor segments is malformed but treated as an empty media list.
    if (result.isMaster) result.live = false;
    return result;
  }

  // Encryption summary for UI purposes: "none", "aes-128", or "drm".
  function encryptionKind(parsed) {
    let kind = "none";
    for (const seg of parsed.segments) {
      if (!seg.key) continue;
      if (seg.key.method === "AES-128") kind = "aes-128";
      else return "drm"; // SAMPLE-AES and anything else we can't decrypt
    }
    return kind;
  }

  const api = { parse, encryptionKind, parseAttributes };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // for node-based tests
  } else {
    global.ScrawnloadM3U8 = api;
  }
})(this);
