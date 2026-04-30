import React, { useState, useRef, useEffect } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";
const SHIFTS = ["breakfast", "lunch", "dinner"];
const SHIFT_EMOJI = { breakfast: "🌅", lunch: "☀️", dinner: "🌙" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function pctColor(pct) {
  if (pct >= 75) return "var(--scarlet)";
  if (pct >= 40) return "var(--amber)";
  return "var(--green)";
}

function pctLabel(pct) {
  if (pct >= 75) return "High waste";
  if (pct >= 40) return "Moderate";
  return "Low waste";
}

function pctBadgeClass(pct) {
  if (pct >= 75) return "red";
  if (pct >= 40) return "amber";
  return "green";
}

export default function LoggerPage() {
  const [shift, setShift] = useState("lunch");
  const [date, setDate]   = useState(todayStr());
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    setBatchLoading(true);
    setBatchData(null);
    fetch(`${API}/batch-optimize?shift=${shift}`)
      .then(r => r.json())
      .then(d => { setBatchData(d); setBatchLoading(false); })
      .catch(() => setBatchLoading(false));
  }, [shift]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", image);
      form.append("shift", shift);
      form.append("date", date);
      const res = await fetch(`${API}/analyze-photo`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message || "Analysis failed. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="page-wrap">
      {/* Header */}
      <div className="gap-24">
        <div className="page-eyebrow">FSW Tool</div>
        <h1 className="page-title">Log Waste Bin</h1>
        <p className="page-sub">Photograph the bin at each bag change. AI estimates fullness in seconds.</p>
      </div>

      <div className="logger-grid gap-24">
        {/* Left column — controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Shift selector */}
          <div className="card gap-16">
            <div className="section-label">Select shift</div>
            <div className="shift-tabs">
              {SHIFTS.map((s) => (
                <button
                  key={s}
                  className={`shift-tab${shift === s ? " active" : ""}`}
                  onClick={() => setShift(s)}
                >
                  {SHIFT_EMOJI[s]} {s}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Date</div>
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={e => setDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid var(--lighter)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 15,
                  fontFamily: "var(--font-body)",
                  color: "var(--dark)",
                  background: "var(--white)",
                  outline: "none",
                  cursor: "pointer",
                }}
                onFocus={e => e.target.style.borderColor = "var(--scarlet)"}
                onBlur={e => e.target.style.borderColor = "var(--lighter)"}
              />
            </div>
          </div>

          {/* Upload zone */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              className={`upload-zone${preview ? " filled" : ""}`}
              onClick={() => fileRef.current.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {preview ? (
                <img src={preview} alt="Bin preview" className="upload-preview" />
              ) : (
                <div className="upload-inner">
                  <div className="upload-icon-wrap">📷</div>
                  <div className="upload-hint">Tap to upload bin photo</div>
                  <div className="upload-sub">JPG or PNG · drag & drop supported</div>
                </div>
              )}
            </div>
            {preview && (
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--lighter)" }}>
                <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); reset(); }}>
                  Remove photo
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: "none" }}
          />

          {/* Submit */}
          <button className="btn-primary" onClick={handleSubmit} disabled={!image || loading}>
            {loading ? (
              <><span className="spin" />Analyzing photo…</>
            ) : (
              "Analyze waste bin"
            )}
          </button>

          {error && <div className="error-bar">⚠ {error}</div>}
        </div>

        {/* Right column — result */}
        <div>
          {!result && !loading && (
            <div className="card" style={{ textAlign: "center", padding: "56px 28px" }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🗑️</div>
              <div style={{ fontSize: 16, color: "var(--muted)", fontWeight: 300 }}>
                Result will appear here after analysis
              </div>
            </div>
          )}

          {result && (
            <div className="result-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div className="section-label">{result.shift} shift · analysis</div>
                  <div className="result-pct" style={{ color: pctColor(result.fullness_percent) }}>
                    {result.fullness_percent}%
                  </div>
                  <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 4 }}>bin fullness</div>
                </div>
                <span className={`badge ${pctBadgeClass(result.fullness_percent)}`}>
                  {pctLabel(result.fullness_percent)}
                </span>
              </div>

              <div style={{ padding: "18px 20px", background: "var(--lighter)", borderRadius: 10 }}>
                <div className="result-lbs">
                  ~<strong>{result.estimated_lbs} lbs</strong> estimated food waste
                </div>
                <div className="result-meta" style={{ marginTop: 8 }}>
                  Confidence:{" "}
                  <span style={{ textTransform: "capitalize", fontWeight: 500 }}>
                    {result.confidence}
                  </span>
                  {" · "}
                  {new Date(result.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              <div className="saved-pill">
                ✓ Saved to dashboard
              </div>

              <div style={{ marginTop: 18 }}>
                <button className="btn-ghost" onClick={reset}>Log another bin</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch Optimize */}
      <div className="card gap-24" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="section-label">Pre-Shift Batch Guide</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
              Recommended batch sizes based on historical waste for <strong style={{ textTransform: "capitalize" }}>{shift}</strong>
            </div>
          </div>
          {batchData && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--green)" }}>Projected savings</div>
              <div style={{ fontSize: 24, fontFamily: "var(--font-display)", color: "var(--green)", marginTop: 2 }}>
                {batchData.summary?.projected_lbs_saved} lbs
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>${batchData.summary?.projected_cost_saved} · {batchData.summary?.projected_co2_avoided_lbs} lbs CO₂</div>
            </div>
          )}
        </div>

        {batchLoading && <div style={{ fontSize: 15, color: "var(--muted)" }}>Loading batch recommendations…</div>}

        {batchData?.chef_briefing && (
          <div style={{
            padding: "16px 18px", background: "var(--lighter)", borderRadius: 10,
            fontSize: 15, color: "var(--dark)", fontStyle: "italic", borderLeft: "4px solid var(--scarlet)",
            lineHeight: 1.55,
          }}>
            {batchData.chef_briefing}
          </div>
        )}

        {batchData?.items?.filter(i => i.action === "reduce").length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
              Items to cut
            </div>
            {batchData.items.filter(i => i.action === "reduce").slice(0, 6).map((item, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 90px 90px 80px",
                gap: 12, padding: "11px 0",
                borderBottom: "1px solid var(--lighter)", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 15, color: "var(--dark)" }}>{item.item}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{item.station} · {item.historical_waste_pct}% hist. waste</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, color: "var(--muted)", textDecoration: "line-through" }}>{item.current_batch_lbs} lbs</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: "var(--green)" }}>{item.recommended_lbs} lbs</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{
                    background: "var(--green-bg)", color: "var(--green)",
                    fontSize: 13, fontWeight: 600, padding: "4px 10px", borderRadius: 99,
                  }}>
                    -{item.lbs_saved} lbs
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="site-footer">
        HawkWaste · IIT Commons · Powered by GPT-4o-mini vision
      </div>
    </div>
  );
}
