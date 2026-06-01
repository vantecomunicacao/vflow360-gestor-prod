// Helpers compartilhados entre os webhooks de WhatsApp (Stevo e Uazap) para
// extrair payloads de mídia (áudio, imagem, vídeo, PDF) das estruturas
// heterogêneas que cada provedor envia. Mantém os nomes de campo mais
// abrangentes possíveis (URL, fileURL, DirectPath, mediaBase64 etc.) e a
// normalização de URLs relativas do WhatsApp (mmg.whatsapp.net).

export type ExtractedMedia = {
  url?: string;
  base64?: string;
  mimetype?: string;
};

export function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanBase64(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    return dataUrlMatch[2].replace(/\s/g, "");
  }

  const normalized = trimmed.replace(/\s/g, "");
  if (normalized.length < 120) return "";
  return /^[A-Za-z0-9+/=]+$/.test(normalized) ? normalized : "";
}

export function extractDataUrl(value: string): ExtractedMedia {
  const match = value.trim().match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return {};

  return {
    mimetype: match[1],
    base64: match[2].replace(/\s/g, ""),
  };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function mergeMedia(primary: ExtractedMedia, fallback: ExtractedMedia): ExtractedMedia {
  return {
    url: primary.url || fallback.url,
    base64: primary.base64 || fallback.base64,
    mimetype: primary.mimetype || fallback.mimetype,
  };
}

export function normalizeMimeType(value: string, mediaType: string): string {
  const normalized = toText(value).split(";")[0].toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return normalized;
  if (mediaType === "image") return "image/jpeg";
  if (mediaType === "audio") return "audio/ogg";
  if (mediaType === "video") return "video/mp4";
  return "application/octet-stream";
}

export function normalizeMediaUrl(rawUrl: string): string {
  const value = toText(rawUrl);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://mmg.whatsapp.net${value}`;
  return "";
}

export function extractMediaData(
  input: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): ExtractedMedia {
  if (depth > 6 || input == null) return {};

  if (typeof input === "string") {
    const maybeDataUrl = extractDataUrl(input);
    if (maybeDataUrl.base64) return maybeDataUrl;
    if (/^https?:\/\//i.test(input.trim()) || input.trim().startsWith("/")) {
      return { url: normalizeMediaUrl(input.trim()) };
    }
    const maybeBase64 = cleanBase64(input);
    return maybeBase64 ? { base64: maybeBase64 } : {};
  }

  if (Array.isArray(input)) {
    let acc: ExtractedMedia = {};
    for (const item of input) {
      acc = mergeMedia(acc, extractMediaData(item, depth + 1, seen));
      if (acc.url && acc.base64 && acc.mimetype) break;
    }
    return acc;
  }

  if (typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  if (seen.has(obj)) return {};
  seen.add(obj);

  const directUrl =
    toText(obj.mediaUrl) ||
    toText(obj.url) ||
    toText(obj.URL) ||
    toText(obj.link) ||
    toText(obj.downloadUrl) ||
    toText(obj.fileUrl) ||
    toText(obj.fileURL) ||
    toText(obj.directPath) ||
    toText(obj.DirectPath);

  const directMime =
    toText(obj.mimetype) ||
    toText(obj.mimeType) ||
    toText(obj.contentType) ||
    toText(obj.fileType) ||
    toText(obj.mediaType);

  const directBase64 =
    cleanBase64(toText(obj.base64)) ||
    cleanBase64(toText(obj.data)) ||
    cleanBase64(toText(obj.fileData)) ||
    cleanBase64(toText(obj.body)) ||
    cleanBase64(toText(obj.mediaBase64));

  let acc: ExtractedMedia = {
    url: normalizeMediaUrl(directUrl),
    base64: directBase64,
    mimetype: directMime,
  };

  for (const value of Object.values(obj)) {
    acc = mergeMedia(acc, extractMediaData(value, depth + 1, seen));
    if (acc.url && acc.base64 && acc.mimetype) break;
  }

  return acc;
}
