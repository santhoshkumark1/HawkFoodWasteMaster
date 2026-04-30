import React, { useEffect, useState } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

const TIER_CONFIG = {
  critical: { cls: "red",   label: "Critical", dot: "#CC0000" },
  high:     { cls: "red",   label: "High",     dot: "#CC0000" },
  medium:   { cls: "amber", label: "Medium",   dot: "#B45309" },
  low:      { cls: "green", label: "Low",       dot: "#0D7A55" },
};

const SHIFT_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

function WasteTierBar({ pct }) {
  if (pct == null) return null;
  const color = pct >= 56 ? "var(--scarlet)" : pct >= 36 ? "var(--amber)" : pct >= 16 ? "#6366F1" : "var(--green)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
      <div style={{
        flex: 1, height: 5, background: "var(--lighter)",
        borderRadius: 99, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${Math.min(pct, 100)}%`,
          background: color, borderRadius: 99,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, minWidth: 36, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function ItemRow({ item }) {
  const tier = TIER_CONFIG[item.waste_tier] || TIER_CONFIG.medium;
  return (
    <div style={{
      padding: "12px 0",
      borderBottom: "1px solid var(--lighter)",
      display: "grid",
      gridTemplateColumns: "1fr 90px 90px",
      gap: 14,
      alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 15, color: "var(--dark)", marginBottom: 3 }}>{item.name}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{item.station}</div>
        {item.notes && (
          <div style={{ fontSize: 13, color: "#aaa", marginTop: 3, fontStyle: "italic" }}>
            {item.notes}
          </div>
        )}
        <WasteTierBar pct={item.waste_pct} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--dark)" }}>
          {item.batch_lbs != null ? `${item.batch_lbs}` : "—"}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>lbs cooked</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <span className={`badge ${tier.cls}`}>{tier.label}</span>
      </div>
    </div>
  );
}

export default function MenuCrossRef({ selectedDate, availableDates: parentDates }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [activeShift, setShift] = useState("lunch");
  const [showAll, setShowAll]   = useState(false);
  const [menuDate, setMenuDate] = useState(selectedDate || null);

  useEffect(() => {
    setMenuDate(selectedDate || null);
  }, [selectedDate]);

  useEffect(() => {
    setLoading(true);
    const url = menuDate
      ? `${API}/menu/today?date=${menuDate}`
      : `${API}/menu/today`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); setShowAll(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [menuDate]);

  if (loading) return (
    <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
      <div style={{ fontSize: 15, color: "var(--muted)" }}>Loading today's menu…</div>
    </div>
  );

  if (error || !data) return (
    <div className="card">
      <div className="section-label">Today's Menu</div>
      <div style={{ fontSize: 15, color: "var(--muted)", paddingTop: 8 }}>
        Menu data unavailable — check backend connection.
      </div>
    </div>
  );

  const shiftData  = data.shifts?.[activeShift] || {};
  const items      = shiftData.items || [];
  const atRisk     = data.at_risk_items || [];
  const displayed  = showAll ? items : items.slice(0, 6);

  const criticalCount = items.filter(i => ["critical","high"].includes(i.waste_tier)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* At-risk callout */}
      {atRisk.length > 0 && (
        <div style={{
          background: "var(--black)",
          borderRadius: "var(--radius)",
          padding: "20px 24px",
          display: "flex", alignItems: "flex-start", gap: 14,
          boxShadow: "var(--shadow-lg)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 0% 50%, rgba(204,0,0,0.10) 0%, transparent 65%)",
            pointerEvents: "none",
          }} />
          <div style={{
            width: 36, height: 36, background: "var(--scarlet)",
            borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 17, flexShrink: 0,
          }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, letterSpacing: "0.10em",
              textTransform: "uppercase", color: "#CC4444", marginBottom: 8,
            }}>
              {atRisk.length} high-waste item{atRisk.length !== 1 ? "s" : ""} on today's menu
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {atRisk.map((item, i) => (
                <span key={i} style={{
                  background: "rgba(204,0,0,0.15)",
                  color: "#ff6666", fontSize: 14, fontWeight: 500,
                  padding: "4px 12px", borderRadius: 99,
                }}>
                  {item.name} · {item.waste_pct}%
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="card">
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 20,
        }}>
          <div>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Menu vs Waste Scores
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {(data.available_dates || parentDates || []).map(d => (
                <button
                  key={d}
                  onClick={() => setMenuDate(d)}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500,
                    cursor: "pointer", fontFamily: "var(--font-body)", transition: "all 0.15s",
                    border: `1.5px solid ${data.date === d ? "var(--scarlet)" : "var(--lighter)"}`,
                    background: data.date === d ? "rgba(204,0,0,0.06)" : "var(--white)",
                    color: data.date === d ? "var(--scarlet)" : "var(--muted)",
                  }}
                >
                  {d.slice(5)}
                </button>
              ))}
              {criticalCount > 0 && (
                <span style={{ color: "var(--scarlet)", fontWeight: 600, fontSize: 13 }}>
                  · {criticalCount} high-risk {activeShift} items
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["breakfast","lunch","dinner"].map(s => (
              <button
                key={s}
                onClick={() => { setShift(s); setShowAll(false); }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  border: `1.5px solid ${activeShift === s ? "var(--scarlet)" : "var(--lighter)"}`,
                  background: activeShift === s ? "rgba(204,0,0,0.06)" : "var(--white)",
                  color: activeShift === s ? "var(--scarlet)" : "var(--muted)",
                  fontSize: 14, fontWeight: 500,
                  cursor: "pointer", fontFamily: "var(--font-body)",
                  transition: "all 0.15s",
                }}
              >
                {SHIFT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 90px 90px",
          gap: 14, padding: "0 0 10px",
          borderBottom: "2px solid var(--lighter)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
            Item · Station
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>
            Batch
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>
            Risk
          </div>
        </div>

        {/* Item rows */}
        {items.length === 0 ? (
          <div style={{ fontSize: 15, color: "var(--muted)", padding: "24px 0" }}>
            No menu items found for this shift.
          </div>
        ) : (
          <>
            {displayed.map((item, i) => (
              <ItemRow key={i} item={item} />
            ))}
            {items.length > 6 && (
              <button
                onClick={() => setShowAll(!showAll)}
                style={{
                  width: "100%", marginTop: 12, padding: "11px",
                  background: "var(--lighter)", border: "none",
                  borderRadius: "var(--radius-sm)", fontSize: 14,
                  color: "var(--mid)", cursor: "pointer",
                  fontFamily: "var(--font-body)", fontWeight: 500,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.target.style.background = "#e4e4e2"}
                onMouseLeave={e => e.target.style.background = "var(--lighter)"}
              >
                {showAll ? "Show less" : `Show ${items.length - 6} more items`}
              </button>
            )}
          </>
        )}

        {/* Shift summary */}
        {shiftData.total_cooked_lbs != null && (
          <div style={{
            marginTop: 18, padding: "16px 18px",
            background: "var(--lighter)", borderRadius: 10,
            display: "flex", gap: 32,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>Total cooked</div>
              <div style={{ fontSize: 22, fontFamily: "var(--font-display)", color: "var(--dark)", marginTop: 4 }}>
                {shiftData.total_cooked_lbs} lbs
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>Expected waste</div>
              <div style={{ fontSize: 22, fontFamily: "var(--font-display)", color: "var(--scarlet)", marginTop: 4 }}>
                {shiftData.total_waste_lbs} lbs
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>Items on menu</div>
              <div style={{ fontSize: 22, fontFamily: "var(--font-display)", color: "var(--dark)", marginTop: 4 }}>
                {shiftData.item_count}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
