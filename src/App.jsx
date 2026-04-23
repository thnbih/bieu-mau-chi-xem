import { useEffect, useMemo, useRef, useState } from "react";
import pako from "pako";

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
  const viewerRef = useRef(null);

  const normalizeToken = (rawToken) => {
    return rawToken
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/[\r\n\t]/g, "");
  };

  const fetchGz = async () => {
    try {
      setLoading(true);
      setResult("");

      const normalizedToken = normalizeToken(token);
      if (!normalizedToken) {
        throw new Error("Thiếu token. Hãy dán JWT vào ô Bearer Token.");
      }

      const url = path.startsWith("http")
        ? path
        : `${baseUrl}/api/his/v1/files/${path}`;

      const res = await fetch(url, {
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

      const arrayBuffer = await res.arrayBuffer();
      const compressed = new Uint8Array(arrayBuffer);
      const decompressed = pako.ungzip(compressed, { to: "string" });
      const json = JSON.parse(decompressed);

      setResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setResult("ERROR: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isError = result.startsWith("ERROR:");
  const jsonLines = !isError && result ? result.split("\n") : [];

  const normalizeForSearch = (value) => {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalizedSearch = normalizeForSearch(searchText);
  const normalizedSearchWords = normalizedSearch.split(" ").filter(Boolean);

  const isLineMatched = (line) => {
    if (!normalizedSearch) return false;

    const normalizedLine = normalizeForSearch(line);
    if (normalizedLine.includes(normalizedSearch)) return true;

    if (normalizedSearchWords.length > 1) {
      return normalizedSearchWords.every((word) => normalizedLine.includes(word));
    }

    return false;
  };

  const matchedLineIndexes = useMemo(() => {
    if (isError || !normalizedSearch) return [];

    const matches = [];
    for (let i = 0; i < jsonLines.length; i += 1) {
      if (isLineMatched(jsonLines[i])) {
        matches.push(i);
      }
    }
    return matches;
  }, [isError, jsonLines, normalizedSearch]);

  const matchedLineSet = useMemo(
    () => new Set(matchedLineIndexes),
    [matchedLineIndexes]
  );

  const previewMatches = useMemo(() => {
    return matchedLineIndexes.map((lineIndex, idx) => ({
      idx,
      lineIndex,
      preview: jsonLines[lineIndex]?.trim() || "(dong trong)",
    }));
  }, [matchedLineIndexes, jsonLines]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchText, result]);

  const currentMatchedLine = matchedLineIndexes.length
    ? matchedLineIndexes[activeMatchIndex % matchedLineIndexes.length]
    : -1;

  useEffect(() => {
    if (currentMatchedLine < 0 || !viewerRef.current) return;
    const row = viewerRef.current.querySelector(
      `[data-line-index=\"${currentMatchedLine}\"]`
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

  const renderJsonLine = (line) => {
    if (!line) return " ";

    const tokenRegex =
      /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\btrue\b|\bfalse\b|\bnull\b/g;
    const nodes = [];
    let lastIndex = 0;
    let partIndex = 0;
    let match;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(line.slice(lastIndex, match.index));
      }

      const isKey = Boolean(match[1]);
      nodes.push(
        <span
          key={`tok-${partIndex}`}
          style={{
            color: isKey ? "#ea580c" : "#1e3a8a",
            fontWeight: isKey ? 600 : 500,
          }}
        >
          {match[0]}
        </span>
      );

      lastIndex = tokenRegex.lastIndex;
      partIndex += 1;
    }

    if (lastIndex < line.length) {
      nodes.push(line.slice(lastIndex));
    }

    return nodes.length ? nodes : " ";
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h2>Đọc biểu mẫu chỉ xem cực hay</h2>

      <div>
        <label>Base URL (api của dự án):</label>
        <br />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
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
            }}
          >
            <strong>JSON Output</strong>
            <label
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={wrapLines}
                onChange={(e) => setWrapLines(e.target.checked)}
              />
              Wrap lines
            </label>
          </div>

          <div
            ref={viewerRef}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 10,
              background: "#f8fafc",
              maxHeight: 520,
              overflow: "auto",
            }}
          >
          {!result && (
            <div style={{ padding: 14, color: "#64748b", fontSize: 14 }}>
              Chua co du lieu. Bam "Fetch & Decode" de tai va hien thi JSON.
            </div>
          )}

          {isError && (
            <pre
              style={{
                margin: 0,
                padding: 14,
                background: "#fff1f2",
                color: "#9f1239",
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
                fontSize: 13,
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
                    borderBottom: "1px solid #f1f5f9",
                    background:
                      currentMatchedLine === index
                        ? "#fde68a"
                        : matchedLineSet.has(index)
                          ? "#fef3c7"
                          : "transparent",
                  }}
                >
                  <div
                    style={{
                      textAlign: "right",
                      padding: "0 10px",
                      color: "#94a3b8",
                      background: "#f1f5f9",
                      userSelect: "none",
                      borderRight: "1px solid #e2e8f0",
                    }}
                  >
                    {index + 1}
                  </div>
                  <div
                    style={{
                      padding: "0 12px",
                      whiteSpace: wrapLines ? "pre-wrap" : "pre",
                      wordBreak: wrapLines ? "break-word" : "normal",
                      color: "#0f172a",
                    }}
                  >
                    {renderJsonLine(line)}
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
            border: "1px solid #d1d5db",
            borderRadius: 10,
            background: "#ffffff",
            padding: 10,
          }}
        >
          <strong style={{ display: "block", marginBottom: 8 }}>Tìm kiếm (tương đối)</strong>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tim trong JSON..."
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
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
              color: "#475569",
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
              borderTop: "1px solid #e2e8f0",
              paddingTop: 8,
              maxHeight: 430,
              overflow: "auto",
            }}
          >
            {normalizedSearch && !previewMatches.length && (
              <div style={{ color: "#64748b", fontSize: 13 }}>Hăm có kết quả.</div>
            )}

            {!normalizedSearch && (
              <div style={{ color: "#64748b", fontSize: 13 }}>
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
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "8px 9px",
                  background:
                    currentMatchedLine === item.lineIndex ? "#fffbeb" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>
                  Dong {item.lineIndex + 1}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: "#0f172a",
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