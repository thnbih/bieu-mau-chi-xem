import { useEffect, useMemo, useRef, useState } from "react";
import pako from "pako";

const bracketColors = [
  "var(--json-bracket-1)",
  "var(--json-bracket-2)",
  "var(--json-bracket-3)",
  "var(--json-bracket-4)",
  "var(--json-bracket-5)",
  "var(--json-bracket-6)",
];

const blockedApiBases = [
  "https://api-sdsfdsfdbvtudu.tudu.com.vn",
];

const apiProxyEndpoint = "/api/proxy";

const apiPresets = [
  {
    id: "tu-du-2",
    label: "Từ Dũ 2",
    url: "https://api-bvtuducangio.tudu.com.vn/",
  },
  {
    id: "thu-duc",
    label: "Thủ Đức",
    url: "https://api-his.benhvienkhuvucthuduc.vn",
  },
  {
    id: "vien-tim",
    label: "Viện Tim",
    url: "http://172.16.95.20:2301",
  },
  {
    id: "cho-ray",
    label: "Chợ Rẫy",
    url: "https://api-his.choray.vn/",
  },
];

const normalizeApiBaseUrl = (value) => {
  return (value || "").trim().replace(/\/+$/, "");
};

const normalizeForSearch = (value) => {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

const isLineMatched = (line, normalizedSearch, normalizedSearchWords) => {
  if (!normalizedSearch) return false;

  const normalizedLine = normalizeForSearch(line);
  if (normalizedLine.includes(normalizedSearch)) return true;

  if (normalizedSearchWords.length > 1) {
    return normalizedSearchWords.every((word) => normalizedLine.includes(word));
  }

  return false;
};

const nextDepthAfterLine = (line, startDepth) => {
  let depth = startDepth;
  let inString = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inString) {
      if (char === '"' && (index === 0 || line[index - 1] !== "\\")) {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      depth += 1;
    } else if ((char === "}" || char === "]") && depth > 0) {
      depth -= 1;
    }
  }

  return depth;
};

const buildJsonLineMeta = (jsonLines) => {
  let depth = 0;
  return jsonLines.map((line) => {
    const meta = { depthStart: depth };
    depth = nextDepthAfterLine(line, depth);
    return meta;
  });
};

const isBlockedApiRequest = (baseUrl, path) => {
  const normalizedBaseUrl = baseUrl.trim();
  const normalizedPath = path.trim();

  if (
    normalizedPath === "/admin" ||
    normalizedPath.startsWith("/admin/") ||
    normalizedPath.startsWith("/admin?")
  ) {
    return false;
  }

  const requestUrl = path.startsWith("http")
    ? path.trim()
    : `${normalizedBaseUrl}/api/his/v1/files/${path}`;

  try {
    const requestOrigin = new URL(requestUrl).origin;
    return blockedApiBases.includes(requestOrigin);
  } catch {
    return blockedApiBases.some(
      (blockedBase) => normalizedBaseUrl.replace(/\/+$/, "") === blockedBase
    );
  }
};

export default function App() {
  const [baseUrl, setBaseUrl] = useState(
    "https://api-his.benhvienkhuvucthuduc.vn"
  );
  const [path, setPath] = useState(
    "dl-bao-cao/2026-04-23/96c5efd5-426e-438b-a97c-e905b868c34d.gz"
  );
  const [token, setToken] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [jsonFontSize, setJsonFontSize] = useState(13);
  const [blockedStage, setBlockedStage] = useState("none");
  const [blockedMessage, setBlockedMessage] = useState("");
  const [blockedCountdown, setBlockedCountdown] = useState(15);
  const viewerRef = useRef(null);
  const blockedVideoRef = useRef(null);
  const blockedMaxSeekTimeRef = useRef(0);
  const minJsonFontSize = 1;
  const maxJsonFontSize = 50;

  const selectedApiPreset = useMemo(() => {
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);

    return (
      apiPresets.find(
        (preset) => normalizeApiBaseUrl(preset.url) === normalizedBaseUrl
      )?.id || "other"
    );
  }, [baseUrl]);

  const normalizeToken = (rawToken) => {
    return rawToken
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/[\r\n\t]/g, "");
  };

  const isGzipPayload = (bytes) => {
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  };

  const decodeResponseBody = async (res) => {
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (isGzipPayload(bytes)) {
      return pako.ungzip(bytes, { to: "string" });
    }

    return new TextDecoder("utf-8").decode(bytes);
  };

  const previewBody = (text, maxLength = 160) => {
    const compactText = text.replace(/\s+/g, " ").trim();
    return compactText.length > maxLength
      ? `${compactText.slice(0, maxLength)}...`
      : compactText;
  };

  const showBlockedFlow = () => {
    setLoading(false);
    setResult("");
    setBlockedMessage("");
    setActiveMatchIndex(0);
    setBlockedCountdown(15);
    blockedMaxSeekTimeRef.current = 0;
    setBlockedStage("video");
  };

  useEffect(() => {
    if (blockedStage !== "video" || blockedCountdown <= 0) return undefined;

    const timerId = window.setInterval(() => {
      setBlockedCountdown((currentCountdown) => {
        if (currentCountdown <= 1) {
          window.clearInterval(timerId);
          return 0;
        }

        return currentCountdown - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [blockedStage, blockedCountdown]);

  const handleBlockedVideoLoaded = () => {
    const video = blockedVideoRef.current;
    if (!video) return;

    video.volume = 1;
    video.muted = false;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  };

  const handleBlockedVideoTimeUpdate = () => {
    const video = blockedVideoRef.current;
    if (!video) return;

    blockedMaxSeekTimeRef.current = Math.max(
      blockedMaxSeekTimeRef.current,
      video.currentTime
    );
  };

  const handleBlockedVideoSeeking = () => {
    const video = blockedVideoRef.current;
    if (!video) return;

    if (video.currentTime > blockedMaxSeekTimeRef.current + 0.1) {
      video.currentTime = blockedMaxSeekTimeRef.current;
    }
  };

  const handleBlockedVideoEnded = () => {
    setBlockedStage("image");
  };

  const closeBlockedVideo = () => {
    if (blockedCountdown > 0) return;
    setBlockedStage("image");
  };

  const closeBlockedPicture = () => {
    setBlockedStage("none");
    setBlockedMessage("Dự án này chưa được tra cứu rồi hihi");
  };

  useEffect(() => {
    if (!blockedMessage) return undefined;

    const timerId = window.setTimeout(() => {
      setBlockedMessage("");
    }, 3200);

    return () => window.clearTimeout(timerId);
  }, [blockedMessage]);

  const fetchGz = async () => {
    if (isBlockedApiRequest(baseUrl, path)) {
      showBlockedFlow();
      return;
    }

    try {
      setLoading(true);
      setActiveMatchIndex(0);
      setResult("");

      const normalizedToken = normalizeToken(token);
      if (!normalizedToken) {
        throw new Error("Thiếu token. Hãy dán JWT vào ô Bearer Token.");
      }

      const url = path.startsWith("http")
        ? path
        : `${baseUrl}/api/his/v1/files/${path}`;

      const requestUrl = import.meta.env.DEV
        ? `${url}`
        : `${apiProxyEndpoint}?url=${encodeURIComponent(url)}`;

      const res = await fetch(requestUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${normalizedToken}`,
        },
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        let errorMessage = `HTTP ${res.status}`;

        if (contentType.includes("application/json")) {
          const errorJson = await res.json();
          errorMessage = `${errorMessage} - ${errorJson.message || "Loi khong xac dinh"}`;
          if (errorJson.trace) {
            errorMessage = `${errorMessage}\nTrace: ${errorJson.trace}`;
          }
        } else {
          const errorText = await res.text();
          if (errorText) {
            errorMessage = `${errorMessage} - ${errorText}`;
          }
        }

        throw new Error(errorMessage);
      }

      const bodyText = await decodeResponseBody(res);

      const contentType = res.headers.get("content-type") || "";
      const trimmedBody = bodyText.trimStart();
      const looksLikeJson =
        contentType.includes("application/json") ||
        contentType.includes("application/problem+json") ||
        trimmedBody.startsWith("{") ||
        trimmedBody.startsWith("[");

      if (!looksLikeJson) {
        throw new Error(
          `Response khong phai JSON/gzip. content-type=${contentType || "(none)"}. preview=${previewBody(bodyText)}`
        );
      }

      const json = JSON.parse(bodyText);

      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setResult(`ERROR: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const isError = result.startsWith("ERROR:");

  const jsonLines = useMemo(() => {
    if (isError || !result) return [];
    return result.split("\n");
  }, [isError, result]);

  const normalizedSearch = useMemo(
    () => normalizeForSearch(searchText),
    [searchText]
  );
  const normalizedSearchWords = useMemo(
    () => normalizedSearch.split(" ").filter(Boolean),
    [normalizedSearch]
  );

  const matchedLineIndexes = useMemo(() => {
    if (isError || !normalizedSearch) return [];

    const matches = [];
    for (let i = 0; i < jsonLines.length; i += 1) {
      if (isLineMatched(jsonLines[i], normalizedSearch, normalizedSearchWords)) {
        matches.push(i);
      }
    }
    return matches;
  }, [isError, jsonLines, normalizedSearch, normalizedSearchWords]);

  const matchedLineSet = useMemo(
    () => new Set(matchedLineIndexes),
    [matchedLineIndexes]
  );

  const jsonLineMeta = useMemo(() => buildJsonLineMeta(jsonLines), [jsonLines]);

  const previewMatches = useMemo(() => {
    return matchedLineIndexes.map((lineIndex, idx) => ({
      idx,
      lineIndex,
      preview: jsonLines[lineIndex]?.trim() || "(dong trong)",
    }));
  }, [matchedLineIndexes, jsonLines]);

  const currentMatchedLine = matchedLineIndexes.length
    ? matchedLineIndexes[activeMatchIndex % matchedLineIndexes.length]
    : -1;

  useEffect(() => {
    if (currentMatchedLine < 0 || !viewerRef.current) return;
    const row = viewerRef.current.querySelector(
      `[data-line-index="${currentMatchedLine}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [currentMatchedLine]);

  const goToNextMatch = () => {
    if (!matchedLineIndexes.length) return;
    setActiveMatchIndex((prev) => (prev + 1) % matchedLineIndexes.length);
  };

  const goToPrevMatch = () => {
    if (!matchedLineIndexes.length) return;
    setActiveMatchIndex(
      (prev) =>
        (prev - 1 + matchedLineIndexes.length) % matchedLineIndexes.length
    );
  };

  const increaseJsonFontSize = () => {
    setJsonFontSize((currentSize) =>
      Math.min(maxJsonFontSize, currentSize + 1)
    );
  };

  const decreaseJsonFontSize = () => {
    setJsonFontSize((currentSize) =>
      Math.max(minJsonFontSize, currentSize - 1)
    );
  };

  const handleApiPresetChange = (presetUrl) => {
    setBaseUrl(presetUrl);
  };

  const handleOtherApiChange = () => {
    setBaseUrl("");
  };

  const highlightPreviewText = (text) => {
    if (!normalizedSearch || !text) return text;

    const sourceChars = Array.from(text);
    let normalizedText = "";
    const normalizedToSourceIndex = [];

    sourceChars.forEach((char, sourceIdx) => {
      const normalizedChar = char
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      Array.from(normalizedChar).forEach((nChar) => {
        normalizedText += nChar;
        normalizedToSourceIndex.push(sourceIdx);
      });
    });

    if (!normalizedText) return text;

    const segments = [];
    let cursor = 0;
    let searchFrom = 0;

    while (true) {
      const foundAt = normalizedText.indexOf(normalizedSearch, searchFrom);
      if (foundAt === -1) break;

      const sourceStart = normalizedToSourceIndex[foundAt];
      const sourceEnd =
        normalizedToSourceIndex[foundAt + normalizedSearch.length - 1] + 1;

      if (sourceStart > cursor) {
        segments.push({ text: text.slice(cursor, sourceStart), hit: false });
      }

      segments.push({ text: text.slice(sourceStart, sourceEnd), hit: true });
      cursor = sourceEnd;
      searchFrom = foundAt + normalizedSearch.length;
    }

    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), hit: false });
    }

    if (!segments.length) {
      return text;
    }

    return segments.map((segment, idx) =>
      segment.hit ? (
        <mark
          key={`preview-hit-${idx}`}
          style={{ background: "#fde68a", color: "#7c2d12", padding: 0 }}
        >
          {segment.text}
        </mark>
      ) : (
        <span key={`preview-txt-${idx}`}>{segment.text}</span>
      )
    );
  };

  const renderJsonLine = (line, depthStart = 0) => {
    if (!line) return " ";

    const nodes = [];
    let partIndex = 0;
    let index = 0;
    let depth = depthStart;

    const pushText = (text) => {
      if (!text) return;
      nodes.push(text);
    };

    const isEscaped = (text, position) => {
      let slashCount = 0;
      for (let cursor = position - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
        slashCount += 1;
      }
      return slashCount % 2 === 1;
    };

    while (index < line.length) {
      const char = line[index];

      if (char === '"') {
        let endIndex = index + 1;
        while (endIndex < line.length) {
          if (line[endIndex] === '"' && !isEscaped(line, endIndex)) {
            break;
          }
          endIndex += 1;
        }

        const token = line.slice(index, Math.min(endIndex + 1, line.length));
        let lookAhead = endIndex + 1;
        while (lookAhead < line.length && /\s/.test(line[lookAhead])) {
          lookAhead += 1;
        }
        const isKey = line[lookAhead] === ":";

        nodes.push(
          <span
            key={`tok-${partIndex}`}
            style={{
              color: isKey ? "var(--json-key)" : "var(--json-value)",
              fontWeight: isKey ? 600 : 500,
            }}
          >
            {token}
          </span>
        );

        index = Math.min(endIndex + 1, line.length);
        partIndex += 1;
        continue;
      }

      if (char === "{" || char === "}" || char === "[" || char === "]") {
        const isOpening = char === "{" || char === "[";
        const level = isOpening ? depth : Math.max(depth - 1, 0);
        const color = bracketColors[level % bracketColors.length];

        nodes.push(
          <span
            key={`tok-${partIndex}`}
            style={{ color, fontWeight: 700 }}
          >
            {char}
          </span>
        );

        depth = isOpening ? depth + 1 : Math.max(depth - 1, 0);
        index += 1;
        partIndex += 1;
        continue;
      }

      if (char === "-" || /[0-9]/.test(char)) {
        const numberMatch = line.slice(index).match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
        if (numberMatch) {
          nodes.push(
            <span
              key={`tok-${partIndex}`}
              style={{ color: "var(--json-value)", fontWeight: 500 }}
            >
              {numberMatch[1]}
            </span>
          );
          index += numberMatch[1].length;
          partIndex += 1;
          continue;
        }
      }

      const literalMatch = line.slice(index).match(/^(true|false|null)\b/);
      if (literalMatch) {
        nodes.push(
          <span
            key={`tok-${partIndex}`}
            style={{ color: "var(--json-value)", fontWeight: 500 }}
          >
            {literalMatch[1]}
          </span>
        );
        index += literalMatch[1].length;
        partIndex += 1;
        continue;
      }

      pushText(char);
      index += 1;
    }

    return nodes.length ? nodes : " ";
  };

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1280,
        margin: "0 auto",
        color: "var(--text)",
      }}
    >
      {blockedStage === "video" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(92vw, 560px)",
              maxWidth: "100%",
              background: "#0f172a",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(0, 0, 0, 0.35)",
            }}
          >
          <div
            style={{
              padding: "10px 14px 8px",
              color: "#e2e8f0",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            NGHE HẾT THÌ MỚI ĐƯỢC
          </div>
          <video
            ref={blockedVideoRef}
            src="/video.mp4"
            autoPlay
            playsInline
            preload="auto"
            controls={false}
            onLoadedMetadata={handleBlockedVideoLoaded}
            onTimeUpdate={handleBlockedVideoTimeUpdate}
            onSeeking={handleBlockedVideoSeeking}
            onEnded={handleBlockedVideoEnded}
            onContextMenu={(event) => event.preventDefault()}
            style={{
              width: "100%",
              height: "320px",
              maxHeight: "60vh",
              objectFit: "contain",
              background: "#000",
              display: "block",
            }}
          />
          <button
            type="button"
            onClick={closeBlockedVideo}
            disabled={blockedCountdown > 0}
            style={{
              position: "absolute",
              right: 12,
              top: 10,
              minWidth: 140,
              padding: "8px 12px",
              border: "none",
              borderRadius: 999,
              background: blockedCountdown > 0 ? "rgba(255,255,255,0.7)" : "#f8fafc",
              color: "#111827",
              fontWeight: 700,
              cursor: blockedCountdown > 0 ? "not-allowed" : "pointer",
              opacity: blockedCountdown > 0 ? 0.85 : 1,
            }}
          >
            {blockedCountdown > 0 ? `Đóng sau ${blockedCountdown}s` : "Đóng"}
          </button>
          </div>
        </div>
      )}

      {blockedStage === "image" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "min(92vw, 1100px)",
              maxHeight: "92vh",
              background: "#111",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(0, 0, 0, 0.5)",
            }}
          >
            <img
              src="/picture.jpg"
              alt="Thong bao chan tra cuu"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "calc(92vh - 64px)",
                objectFit: "contain",
                background: "#111",
              }}
            />
            <button
              type="button"
              onClick={closeBlockedPicture}
              style={{
                position: "absolute",
                right: 12,
                top: 12,
                minWidth: 96,
                padding: "8px 12px",
                border: "none",
                borderRadius: 999,
                background: "#f8fafc",
                color: "#111827",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: 16 }}>Đọc biểu mẫu chỉ xem cực hay</h2>

      {blockedMessage && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 10000,
            padding: "12px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.16)",
            background: "rgba(15, 23, 42, 0.96)",
            color: "#e2e8f0",
            fontWeight: 700,
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.35)",
            maxWidth: "calc(100vw - 32px)",
            textAlign: "center",
          }}
        >
          {blockedMessage}
        </div>
      )}

      <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
        <div>
          <label>Các phiếu xuất nhập kho, các phiếu dữ liệu hơn 10.000 dòng json có thể không xem được</label>
          <br />
          <div
            role="radiogroup"
            aria-label="Chon nhanh API"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              margin: "8px 0 10px",
            }}
          >
            {apiPresets.map((preset) => (
              <label
                key={preset.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background:
                    selectedApiPreset === preset.id
                      ? "var(--row-active)"
                      : "var(--surface)",
                  cursor: "pointer",
                  userSelect: "none",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <input
                  type="radio"
                  name="api-preset"
                  checked={selectedApiPreset === preset.id}
                  onChange={() => handleApiPresetChange(preset.url)}
                />
                {preset.label}
              </label>
            ))}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background:
                  selectedApiPreset === "other"
                    ? "var(--row-active)"
                    : "var(--surface)",
                cursor: "pointer",
                userSelect: "none",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <input
                type="radio"
                name="api-preset"
                checked={selectedApiPreset === "other"}
                onChange={handleOtherApiChange}
              />
              Khác
            </label>
          </div>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Chon 1 preset ben tren hoac nhap Base URL khac"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label>API Path (fileDuLieu):</label>
          <br />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label>Bearer Token:</label>
          <br />
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Dan JWT hoac ca 'Bearer <token>'"
            rows={4}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <button
        onClick={fetchGz}
        disabled={loading}
        style={{ marginTop: 10, cursor: loading ? "not-allowed" : "pointer" }}
      >
        {loading ? "Loading..." : "Fetch & Decode"}
      </button>

      <div
        style={{
          marginTop: 20,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 700px", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong>JSON Output</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" onClick={decreaseJsonFontSize} disabled={jsonFontSize <= minJsonFontSize} style={{ minWidth: 36 }}>
                  A-
                </button>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{jsonFontSize}px</span>
                <button type="button" onClick={increaseJsonFontSize} disabled={jsonFontSize >= maxJsonFontSize} style={{ minWidth: 36 }}>
                  A+
                </button>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={wrapLines}
                  onChange={(e) => setWrapLines(e.target.checked)}
                />
                Wrap lines
              </label>
            </div>
          </div>

          <div
            ref={viewerRef}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface)",
              maxHeight: 520,
              overflow: "auto",
              boxShadow: "0 16px 40px var(--shadow-soft)",
            }}
          >
            {!result && (
              <div style={{ padding: 14, color: "var(--muted)", fontSize: 14 }}>
                Chua co du lieu. Bam "Fetch & Decode" de tai va hien thi JSON.
              </div>
            )}

            {isError && (
              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  background: "var(--error-bg)",
                  color: "var(--error-text)",
                  whiteSpace: "pre-wrap",
                  fontFamily: "Consolas, 'Courier New', monospace",
                  lineHeight: 1.55,
                  fontSize: 13,
                }}
              >
                {result}
              </pre>
            )}

            {!isError && result && (
              <div
                style={{
                  fontFamily: "Consolas, 'Courier New', monospace",
                  fontSize: jsonFontSize,
                  lineHeight: 1.65,
                  tabSize: 2,
                }}
              >
                {jsonLines.map((line, index) => (
                  <div
                    key={index}
                    data-line-index={index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "56px 1fr",
                      borderBottom: "1px solid var(--line)",
                      background:
                        currentMatchedLine === index
                          ? "var(--row-active)"
                          : matchedLineSet.has(index)
                            ? "var(--row-match)"
                            : "transparent",
                    }}
                  >
                    <div
                      style={{
                        textAlign: "right",
                        padding: "0 10px",
                        color: "var(--muted)",
                        background:
                          index % 2 === 0
                            ? "var(--line-soft)"
                            : "var(--surface-strong)",
                        userSelect: "none",
                        borderRight: "1px solid var(--line)",
                      }}
                    >
                      {index + 1}
                    </div>
                    <div
                      style={{
                        padding: "0 12px",
                        whiteSpace: wrapLines ? "pre-wrap" : "pre",
                        wordBreak: wrapLines ? "break-word" : "normal",
                        color: "var(--text-strong)",
                      }}
                    >
                      {renderJsonLine(line, jsonLineMeta[index]?.depthStart || 0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside
          style={{
            flex: "0 1 320px",
            minWidth: 280,
            width: 320,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "var(--surface-2)",
            padding: 10,
            boxShadow: "0 16px 40px var(--shadow-soft)",
          }}
        >
          <strong style={{ display: "block", marginBottom: 8 }}>Tìm kiếm (tương đối)</strong>
          <input
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setActiveMatchIndex(0);
            }}
            placeholder="Tim trong JSON..."
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--text-strong)",
              boxSizing: "border-box",
            }}
          />

          <div
            style={{
              marginTop: 8,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            <span>
              {normalizedSearch
                ? `${matchedLineIndexes.length} kết quả`
                : "Nhập từ khóa để tìm"}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={goToPrevMatch}
                disabled={!matchedLineIndexes.length}
                style={{
                  cursor: matchedLineIndexes.length ? "pointer" : "not-allowed",
                }}
              >
                Prev
              </button>
              <button
                onClick={goToNextMatch}
                disabled={!matchedLineIndexes.length}
                style={{
                  cursor: matchedLineIndexes.length ? "pointer" : "not-allowed",
                }}
              >
                Next
              </button>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: 8,
              maxHeight: 430,
              overflow: "auto",
            }}
          >
            {normalizedSearch && !previewMatches.length && (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Hăm có kết quả.</div>
            )}

            {!normalizedSearch && (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Kết quả preview sẽ hiển thị tại đây.
              </div>
            )}

            {previewMatches.map((item) => (
              <button
                key={`preview-${item.idx}-${item.lineIndex}`}
                onClick={() => setActiveMatchIndex(item.idx)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 6,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 9px",
                  background:
                    currentMatchedLine === item.lineIndex
                      ? "var(--row-active-soft)"
                      : "var(--surface)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
                  Dong {item.lineIndex + 1}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: "var(--text-strong)",
                    fontFamily: "Consolas, 'Courier New', monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {highlightPreviewText(item.preview)}
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}