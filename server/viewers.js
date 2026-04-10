import { canGenerateDeckPreview } from "./previews.js";

function buildYouTubeEmbedUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname.includes("youtu.be")) {
    return `https://www.youtube.com/embed/${parsed.pathname.replace(/^\//, "")}`;
  }

  const videoId = parsed.searchParams.get("v");
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function buildGoogleEmbedUrl(url) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("docs.google.com")) {
    return null;
  }

  if (parsed.pathname.endsWith("/edit")) {
    return `${url.replace(/\/edit$/, "/preview")}`;
  }

  if (parsed.pathname.includes("/document/") || parsed.pathname.includes("/presentation/")) {
    return `${url.replace(/\?.*$/, "").replace(/\/$/, "")}/preview`;
  }

  if (parsed.pathname.includes("/spreadsheets/")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}widget=true`;
  }

  return null;
}

export function resolveViewerForAsset(asset) {
  if (!asset) {
    return {
      mode: "missing"
    };
  }

  if (asset.kind === "uploaded-file") {
    if (asset.mimeType === "application/pdf") {
      return {
        mode: "pdf"
      };
    }

    if (asset.preview?.mimeType === "application/pdf") {
      return {
        mode: "pdf-preview"
      };
    }

    if (canGenerateDeckPreview(asset)) {
      return {
        mode: "deck-preview"
      };
    }

    return {
      mode: "download"
    };
  }

  if (asset.kind === "external-link") {
    if (asset.provider === "youtube") {
      return {
        mode: "youtube",
        embedUrl: buildYouTubeEmbedUrl(asset.url),
        openUrl: asset.url
      };
    }

    if (asset.provider === "google") {
      return {
        mode: "google-embed",
        embedUrl: buildGoogleEmbedUrl(asset.url),
        openUrl: asset.url
      };
    }

    return {
      mode: "external-link",
      openUrl: asset.url
    };
  }

  return {
    mode: "unknown"
  };
}
