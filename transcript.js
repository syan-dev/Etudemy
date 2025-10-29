// transcript.js
// Lightweight YouTube transcript fetcher (no transcript panel needed)
const TranscriptModule = (() => {
  async function getTranscript(videoUrl) {
    const isShorts = /youtube\.com\/shorts\//.test(videoUrl);
    const videoId = isShorts
      ? videoUrl.split("/shorts/")[1].split(/[/?#&]/)[0]
      : new URLSearchParams(new URL(videoUrl).search).get("v");
    if (!videoId) throw new Error("No video ID found");

    try {
      if (isShorts) {
        return await getTranscriptFromShorts(videoId);
      } else {
        return await getTranscriptFromRegularVideo(videoUrl);
      }
    } catch (err) {
      console.error("[Transcript] getTranscript error:", err);
      throw new Error(`Failed to get transcript: ${err.message}`);
    }
  }

  async function readTranscript(videoUrl) {
    const transcriptObj = await getTranscript(videoUrl);
    const lines = transcriptObj.transcript
      .map(([timestamp, text]) => `(${timestamp}) ${text}`)
      .join("\n");
    const fullText = `Title: ${transcriptObj.title}\n\n${lines}`;
    return {
      title: transcriptObj.title,
      fullText,
      segments: transcriptObj.transcript, // Array<[timestamp, text]>
      videoUrl
    };
  }

  // ---------- internals ----------
  async function getTranscriptFromShorts(videoId) {
    const transformedUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const html = await fetch(transformedUrl).then(r => r.text());
    const { title, ytData, dataKey, resolvedType } =
      await resolveYouTubeDataFromHtml(html);
    const items = await getTranscriptItems(ytData, dataKey);
    if (!items.length) return { title, transcript: [] };
    const transcript = createTranscriptArray(items, resolvedType);
    return { title, transcript };
  }

  async function getTranscriptFromRegularVideo(videoUrl) {
    const { title, ytData, dataKey, resolvedType } =
      await resolveYouTubeData(videoUrl);
    const items = await getTranscriptItems(ytData, dataKey);
    if (!items.length) return { title, transcript: [] };
    const transcript = createTranscriptArray(items, resolvedType);
    return { title, transcript };
  }

  async function resolveYouTubeDataFromHtml(html) {
    try {
      const ytData = extractJsonFromHtml(html, "ytInitialData");
      if (ytData) {
        const title =
          ytData?.videoDetails?.title ||
          ytData?.playerOverlays?.playerOverlayRenderer?.videoDetails?.playerOverlayVideoDetailsRenderer?.title?.simpleText ||
          "Untitled";
        const panels = ytData?.engagementPanels || [];
        const hasPanel = panels.some(p =>
          p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
        );
        if (hasPanel) {
          return { title, ytData, dataKey: "ytInitialData", resolvedType: "regular" };
        }
      }
    } catch (e) {
      console.warn("[Transcript] ytInitialData parse fail:", e);
    }

    try {
      const playerData = extractJsonFromHtml(html, "ytInitialPlayerResponse");
      if (playerData) {
        const title =
          playerData?.videoDetails?.title ||
          playerData?.microformat?.playerMicroformatRenderer?.title?.simpleText ||
          "Untitled";
        return {
          title,
          ytData: playerData,
          dataKey: "ytInitialPlayerResponse",
          resolvedType: "shorts"
        };
      }
    } catch (e) {
      console.warn("[Transcript] ytInitialPlayerResponse parse fail:", e);
    }

    throw new Error("Could not extract transcript data from page");
  }

  async function resolveYouTubeData(videoUrl) {
    const dataKey = "ytInitialData";
    const html = await fetch(videoUrl).then(res => res.text());
    let ytData = extractJsonFromHtml(html, dataKey);

    let title =
      ytData?.videoDetails?.title ||
      ytData?.playerOverlays?.playerOverlayRenderer?.videoDetails?.playerOverlayVideoDetailsRenderer?.title?.simpleText ||
      "Untitled";

    const panels = ytData?.engagementPanels || [];
    const hasPanel = panels.some(p =>
      p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
    );

    if (!hasPanel) {
      const fallback = extractJsonFromHtml(html, "ytInitialPlayerResponse");
      return {
        title: title || fallback?.videoDetails?.title || "Untitled",
        ytData: fallback,
        dataKey: "ytInitialPlayerResponse",
        resolvedType: "shorts"
      };
    }

    return { title, ytData, dataKey, resolvedType: "regular" };
  }

  function createTranscriptArray(items, type) {
    return type === "regular"
      ? items.map(item => getSegmentData(item))
      : items.filter(e => e.segs).map(e => getShortsSegmentData(e));
  }

  function getSegmentData(item) {
    const seg = item?.transcriptSegmentRenderer;
    if (!seg) return ["", ""];
    const timestamp = seg.startTimeText?.simpleText || "";
    const text = seg.snippet?.runs?.map(r => r.text).join(" ") || "";
    return [timestamp, text];
  }

  function getShortsSegmentData(event) {
    const timestamp = msToTimestamp(event.tStartMs);
    const text = (event.segs || [])
      .map(seg => seg.utf8)
      .join(" ")
      .replace(/\n/g, " ");
    return [timestamp, text];
  }

  function msToTimestamp(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  }

  async function getTranscriptItems(ytData, dataKey) {
    if (dataKey === "ytInitialPlayerResponse") {
      const baseUrl =
        ytData?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]?.baseUrl;
      if (!baseUrl) throw new Error("Transcript not available for this video.");
      const captionUrl = baseUrl + "&fmt=json3";
      const json = await fetch(captionUrl).then(res => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json();
      });
      return json.events || [];
    }

    const params =
      ytData.engagementPanels?.find(p =>
        p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
      )?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer
        ?.continuationEndpoint?.getTranscriptEndpoint?.params;

    if (!params) throw new Error("Transcript not available for this video");

    const hl =
      ytData.topbar?.desktopTopbarRenderer?.searchbox?.fusionSearchboxRenderer?.config?.webSearchboxConfig?.requestLanguage ||
      "en";
    const clientData = ytData.responseContext?.serviceTrackingParams?.[0]?.params;
    const visitorData =
      ytData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;

    const body = {
      context: {
        client: {
          hl,
          visitorData,
          clientName: clientData?.[0]?.value,
          clientVersion: clientData?.[1]?.value
        },
        request: { useSsl: true }
      },
      params
    };

    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const json = await res.json();
    return (
      json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content
        ?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || []
    );
  }

  function extractJsonFromHtml(html, key) {
    const regexes = [
      new RegExp(`window\\["${key}"\\]\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`var ${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`)
    ];
    for (const rgx of regexes) {
      const m = html.match(rgx);
      if (m && m[1]) {
        try { return JSON.parse(m[1]); }
        catch (err) { console.warn(`[Transcript] parse ${key} fail:`, err.message); }
      }
    }
    throw new Error(`${key} not found`);
  }

  return { getTranscript, readTranscript };
})();

if (typeof window !== "undefined") window.TranscriptModule = TranscriptModule;
