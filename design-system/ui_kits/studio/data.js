window.EBTData = {
  downloads: [
    { title:"Keynote livestream — full session", src:"youtube.com", fmt:"MP4 · 1080p · H.264", dur:"01:12:40", size:"2.1 GB", pct:100, state:"ok" },
    { title:"Interview b-roll pack", src:"vimeo.com", fmt:"MP4 · 2160p · H.265", dur:"00:18:22", size:"4.8 GB", pct:64, state:"processing", eta:"3m 10s" },
    { title:"Podcast episode 212", src:"soundcloud.com", fmt:"WAV · 48 kHz · 24-bit", dur:"00:54:03", size:"892 MB", pct:0, state:"queued" }
  ],
  converts: [
    { name:"A007_C012.MXF", from:"XAVC-I", to:"ProRes 422 HQ", size:"12.4 GB", pct:100, state:"ok" },
    { name:"A007_C013.MXF", from:"XAVC-I", to:"ProRes 422 HQ", size:"9.8 GB", pct:78, state:"processing", eta:"1m 42s" },
    { name:"drone_04.MP4", from:"H.265", to:"DNxHR SQ", size:"3.1 GB", pct:0, state:"queued" },
    { name:"vo_take3.M4A", from:"AAC", to:"WAV 48/24", size:"84 MB", pct:0, state:"queued" },
    { name:"legacy_promo.WMV", from:"VC-1", to:"H.264", size:"612 MB", pct:34, state:"failed" }
  ],
  presets: ["ProRes 422 HQ · UHD","DNxHR SQ · 1080p","H.264 · web 12 Mbps","WAV 48 kHz / 24-bit","MP3 320 kbps"],
  activity: { label:"Converting A007_C013.MXF", pct:78, eta:"1m 42s" }
};
