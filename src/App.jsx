import { useState } from "react";
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

      <div style={{ marginTop: 20 }}>
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
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr",
                    borderBottom: "1px solid #f1f5f9",
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
    </div>
  );
}