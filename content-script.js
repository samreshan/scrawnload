(function () {
  const MEDIA_LINK_REGEX = /\.(mp4|webm|mkv|mov|m4v|m4a|mp3|ogg|oga|wav|flac|aac|m3u8|mpd)(\?|#|$)/i;
  const seen = new Set();

  function report(url) {
    if (!url) return;
    let absolute;
    try {
      absolute = new URL(url, document.baseURI).href;
    } catch {
      return;
    }
    if (seen.has(absolute)) return;
    seen.add(absolute);
    chrome.runtime.sendMessage({
      type: "MEDIA_DETECTED",
      url: absolute,
      title: document.title,
    });
  }

  function scan() {
    document.querySelectorAll("video, audio").forEach((el) => {
      if (el.currentSrc) report(el.currentSrc);
      if (el.src) report(el.src);
      el.querySelectorAll("source").forEach((s) => s.src && report(s.src));
    });

    document
      .querySelectorAll(
        'meta[property="og:video"], meta[property="og:video:url"], ' +
          'meta[property="og:video:secure_url"], meta[property="og:audio"]'
      )
      .forEach((m) => m.content && report(m.content));

    document.querySelectorAll("a[href]").forEach((a) => {
      if (MEDIA_LINK_REGEX.test(a.href)) report(a.href);
    });
  }

  scan();

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Single-page apps often swap video sources via history.pushState without
  // triggering DOM mutations we'd otherwise catch, so poll as a fallback.
  setInterval(scan, 4000);
})();
