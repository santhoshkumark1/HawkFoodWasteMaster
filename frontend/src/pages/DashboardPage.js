import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import MenuCrossRef from "../components/MenuCrossRef";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

const SHIFT_COLORS = {
  breakfast: "#F59E0B",
  lunch:     "#10B981",
  dinner:    "#6366F1",
};

function pctColor(pct) {
  if (pct >= 75) return "var(--scarlet)";
  if (pct >= 40) return "var(--amber)";
  return "var(--green)";
}

function pctBadgeClass(pct) {
  if (pct >= 75) return "red";
  if (pct >= 40) return "amber";
  return "green";
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #eee",
      borderRadius: 10, padding: "12px 16px", fontSize: 14,
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#333", fontSize: 15 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 2 }}>
          <span style={{ textTransform: "capitalize" }}>{p.name}</span>
          <span style={{ fontWeight: 500 }}>{p.value} lbs</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [logs, setLogs]           = useState(null);
  const [rec, setRec]             = useState(null);
  const [impact, setImpact]       = useState(null);
  const [trend, setTrend]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [recLoading, setRecLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState(null);

  const fetchLogs = useCallback(() => {
    fetch(`${API}/logs`)
      .then(r => r.json())
      .then(d => { setLogs(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs();

    fetch(`${API}/recommendation`)
      .then(r => r.json())
      .then(d => { setRec(d); setRecLoading(false); })
      .catch(() => setRecLoading(false));

    fetch(`${API}/impact?scope=week`)
      .then(r => r.json())
      .then(d => setImpact(d))
      .catch(() => {});

    fetch(`${API}/trend`)
      .then(r => r.json())
      .then(d => setTrend(d))
      .catch(() => {});
  }, [fetchLogs]);

  useEffect(() => {
    const onFocus = () => fetchLogs();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchLogs]);

  if (loading) return (
    <div className="page-wrap" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 16, color: "var(--muted)" }}>Loading dashboard data…</div>
    </div>
  );

  const summary    = logs?.summary     || {};
  const itemLogs   = logs?.item_logs   || [];
  const photoLogs  = logs?.photo_logs  || [];
  const mockLogs   = logs?.mock_logs   || [];

  const availableDates = [...new Set([
    ...mockLogs.map(e => e.date),
    ...photoLogs.map(e => e.date),
  ])].filter(Boolean).sort();
  const activeDates = selectedDates || availableDates;

  const filteredMockLogs = mockLogs.filter(e => activeDates.includes(e.date));
  const filteredItemLogs = itemLogs.filter(e => activeDates.includes(e.date));
  const filteredPhotoLogs = photoLogs.filter(e => activeDates.includes(e.date));

  const mockWasteLbs = filteredMockLogs.reduce((s, e) => s + (parseFloat(e.totalWasteLbs) || 0), 0);
  const photoWasteLbs = filteredPhotoLogs.reduce((s, e) => s + (parseFloat(e.estimated_lbs) || 0), 0);
  const totalWasteLbs = Math.round((mockWasteLbs + photoWasteLbs) * 10) / 10;
  const shiftCount = filteredMockLogs.length + filteredPhotoLogs.length || 1;
  const avgPerShift = Math.round((totalWasteLbs / shiftCount) * 10) / 10;

  const itemWasteMap = {};
  filteredItemLogs.forEach(e => {
    if (!itemWasteMap[e.item]) itemWasteMap[e.item] = [];
    itemWasteMap[e.item].push(e.waste_percent);
  });
  const itemAvgs = Object.entries(itemWasteMap).map(([item, pcts]) => ({
    item,
    avgWaste: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
  }));
  const worstItems = [...itemAvgs].sort((a, b) => b.avgWaste - a.avgWaste).slice(0, 5);
  const bestItems  = [...itemAvgs].sort((a, b) => a.avgWaste - b.avgWaste).slice(0, 5);

  const dateMap = {};
  filteredMockLogs.forEach(entry => {
    const key = entry.date;
    if (!dateMap[key]) dateMap[key] = { date: entry.date.slice(5), fullDate: entry.date, breakfast: 0, lunch: 0, dinner: 0 };
    dateMap[key][entry.shift] += parseFloat(entry.totalWasteLbs) || 0;
  });
  filteredPhotoLogs.forEach(entry => {
    const key = entry.date;
    if (!dateMap[key]) dateMap[key] = { date: entry.date.slice(5), fullDate: entry.date, breakfast: 0, lunch: 0, dinner: 0 };
    dateMap[key][entry.shift] += parseFloat(entry.estimated_lbs) || 0;
  });
  const chartData = Object.values(dateMap).sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  const recentPhotos = [...filteredPhotoLogs].reverse().slice(0, 6);

  const toggleDate = (date) => {
    if (!selectedDates) {
      setSelectedDates([date]);
      return;
    }
    if (selectedDates.includes(date)) {
      const next = selectedDates.filter(d => d !== date);
      setSelectedDates(next.length > 0 ? next : null);
    } else {
      const next = [...selectedDates, date].sort();
      setSelectedDates(next.length === availableDates.length ? null : next);
    }
  };

  const scoreColor = trend
    ? (trend.sustainability_score >= 55 ? "var(--green)" : trend.sustainability_score >= 35 ? "var(--amber)" : "var(--scarlet)")
    : "var(--muted)";

  return (
    <div className="dash-shell">

      {/* ── LEFT PANEL (Gmail-style sidebar) ── */}
      <aside className="dash-left-panel">
        <div className="page-eyebrow" style={{ padding: "0 4px" }}>Manager View</div>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.02em",
          color: "var(--black)", lineHeight: 1.2, margin: "6px 0 4px", padding: "0 4px",
        }}>
          HawkWaste Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 300, padding: "0 4px", marginBottom: 20 }}>
          IIT Commons · Chartwells<br />Week of Apr 4, 2026
        </p>

        <div className="panel-section-label">Filter by date</div>

        <button
          onClick={() => setSelectedDates(null)}
          className={`panel-item${!selectedDates ? " active" : ""}`}
        >
          <span className="panel-item-icon">📅</span>
          All dates
        </button>
        {availableDates.map(d => {
          const isActive = activeDates.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggleDate(d)}
              className={`panel-item${isActive && selectedDates ? " active" : ""}`}
            >
              <span className="panel-item-icon">📋</span>
              {d}
            </button>
          );
        })}
      </aside>

      {/* ── RIGHT CONTENT ── */}
      <div className="dash-right-content">

        {/* ── Hero row: AI Recommendation + Sustainability Score ── */}
        <div className="hero-row">

        {/* AI Recommendation */}
        <div className="ai-hero" style={{ marginBottom: 0 }}>
          <div className="ai-hero-icon">🤖</div>
          <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
            <div className="ai-hero-eyebrow">AI-Powered Recommendation</div>
            {recLoading ? (
              <div className="ai-hero-loading">
                Analyzing this week's waste patterns…
              </div>
            ) : (
              <div className="ai-hero-text">
                "{rec?.tip || "Unable to load recommendation."}"
              </div>
            )}
            {rec && !recLoading && (
              <div style={{ display: "flex", gap: 20, marginTop: 18, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14, color: "#999" }}>
                  Weekly waste: <strong style={{ color: "#e8e8e8" }}>{rec.total_waste_lbs} lbs</strong>
                </div>
                <div style={{ fontSize: 14, color: "#999" }}>
                  Avg per shift: <strong style={{ color: "#e8e8e8" }}>{rec.avg_waste_per_shift} lbs</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sustainability Score */}
        {trend ? (
          <div className="score-hero">
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
              Sustainability Score
            </div>
            <div className="score-ring">
              <div className="score-ring-bg" />
              <div className="score-ring-fill" style={{
                borderTopColor: scoreColor,
                borderRightColor: trend.sustainability_score >= 50 ? scoreColor : "transparent",
                borderBottomColor: trend.sustainability_score >= 75 ? scoreColor : "transparent",
              }} />
              <span style={{
                fontSize: 42, fontFamily: "var(--font-display)", lineHeight: 1,
                color: scoreColor, position: "relative", zIndex: 1,
              }}>
                {trend.sustainability_score}
              </span>
            </div>
            <span style={{
              display: "inline-block",
              fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "5px 14px", borderRadius: 99, marginBottom: 12,
              background: trend.trajectory === "improving" ? "var(--green-bg)" : "rgba(204,0,0,0.08)",
              color: trend.trajectory === "improving" ? "var(--green)" : "var(--scarlet)",
            }}>
              {trend.trajectory === "improving" ? "↑ Improving" : trend.trajectory === "worsening" ? "↓ Worsening" : "→ Stable"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, textAlign: "center", background: "var(--lighter)", borderRadius: 8, padding: "10px 4px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Early</div>
                <div style={{ fontSize: 20, fontFamily: "var(--font-display)", color: "var(--dark)", marginTop: 2 }}>{trend.period_comparison?.early_lbs_per_day}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>lbs/day</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", background: "var(--lighter)", borderRadius: 8, padding: "10px 4px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Recent</div>
                <div style={{ fontSize: 20, fontFamily: "var(--font-display)", color: trend.period_comparison?.change_pct > 0 ? "var(--scarlet)" : "var(--green)", marginTop: 2 }}>
                  {trend.period_comparison?.late_lbs_per_day}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>lbs/day</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", background: "var(--lighter)", borderRadius: 8, padding: "10px 4px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Change</div>
                <div style={{ fontSize: 20, fontFamily: "var(--font-display)", color: trend.period_comparison?.change_pct > 0 ? "var(--scarlet)" : "var(--green)", marginTop: 2 }}>
                  {trend.period_comparison?.change_pct > 0 ? "+" : ""}{trend.period_comparison?.change_pct}%
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="score-hero" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 15, color: "var(--muted)" }}>Loading score…</div>
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <div className="stat-card red">
          <div className="stat-label">{selectedDates ? `Waste (${activeDates.length} day${activeDates.length > 1 ? "s" : ""})` : "Total waste this week"}</div>
          <div className="stat-num">{totalWasteLbs}</div>
          <div className="stat-unit">pounds</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Avg per shift</div>
          <div className="stat-num">{avgPerShift}</div>
          <div className="stat-unit">pounds</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Bins logged</div>
          <div className="stat-num">{filteredPhotoLogs.length}</div>
          <div className="stat-unit">{selectedDates ? "selected dates" : "this session"}</div>
        </div>
        <div className="stat-card" style={{ "--stat-color": "#6366F1" }}>
          <div className="stat-label">Shifts tracked</div>
          <div className="stat-num">{filteredMockLogs.length}</div>
          <div className="stat-unit">{selectedDates ? "selected dates" : "this week"}</div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="dash-body gap-24">

        {/* LEFT — chart + menu cross-ref + impact */}
        <div className="dash-main">
          {/* Chart */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div className="section-label" style={{ marginBottom: 0 }}>Waste by day & shift</div>
              <div className="legend">
                {Object.entries(SHIFT_COLORS).map(([s, c]) => (
                  <div key={s} className="legend-item">
                    <div className="legend-dot" style={{ background: c }} />
                    <span style={{ textTransform: "capitalize" }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barSize={22} barGap={4} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 13, fill: "#999" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 13, fill: "#999" }} unit=" lbs" axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="breakfast" fill={SHIFT_COLORS.breakfast} radius={[4,4,0,0]} />
                  <Bar dataKey="lunch"     fill={SHIFT_COLORS.lunch}     radius={[4,4,0,0]} />
                  <Bar dataKey="dinner"    fill={SHIFT_COLORS.dinner}    radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 15 }}>
                No chart data yet — waste logs will appear here
              </div>
            )}
          </div>

          {/* Menu cross-reference */}
          <MenuCrossRef selectedDate={selectedDates ? activeDates[activeDates.length - 1] : undefined} availableDates={availableDates} />

          {/* Environmental Impact */}
          {impact && (
            <div className="card">
              <div className="section-label">Environmental Impact This Week</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
                {[
                  { label: "CO₂ Equivalent",  value: `${impact.environmental_impact.co2_kg} kg`,                           sub: impact.context.co2_equivalent,      color: "var(--scarlet)" },
                  { label: "Water Wasted",    value: `${impact.environmental_impact.water_gallons.toLocaleString()} gal`,  sub: impact.context.water_equivalent,    color: "#6366F1"        },
                  { label: "Food Cost Lost",  value: `$${impact.environmental_impact.food_cost_usd.toLocaleString()}`,     sub: "in wasted ingredients",             color: "var(--amber)"   },
                  { label: "Meals Lost",      value: `${impact.environmental_impact.meals_equivalent}`,                    sub: "meals that could have been served", color: "var(--green)"   },
                ].map((stat, i) => (
                  <div key={i} style={{ background: "var(--lighter)", borderRadius: 10, padding: "18px 20px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>{stat.label}</div>
                    <div style={{ fontSize: 26, fontFamily: "var(--font-display)", color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{stat.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 16, padding: "16px 18px",
                background: "rgba(13,122,85,0.06)", borderRadius: 10,
                borderLeft: "4px solid var(--green)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)", marginBottom: 4 }}>
                  If waste is cut 20%
                </div>
                <div style={{ fontSize: 15, color: "var(--dark)", lineHeight: 1.6 }}>
                  Save <strong>{impact.potential_savings_at_20pct_reduction.co2_lbs_avoided} lbs CO₂</strong>,{" "}
                  <strong>{impact.potential_savings_at_20pct_reduction.water_gallons_saved.toLocaleString()} gallons</strong> water,{" "}
                  and <strong>${impact.potential_savings_at_20pct_reduction.annual_money_saved.toLocaleString()}/year</strong> in food costs.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — sidebar panels */}
        <div className="dash-side">
          {/* Highest + Lowest waste side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card">
              <div className="section-label" style={{ color: "var(--scarlet)" }}>Highest waste</div>
              {worstItems.length === 0 ? (
                <div style={{ fontSize: 15, color: "var(--muted)", paddingTop: 8 }}>No data yet</div>
              ) : worstItems.map((item, i) => (
                <div key={i} className="item-row">
                  <div className="item-name">{item.item}</div>
                  <span className="badge red">{item.avgWaste}%</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="section-label" style={{ color: "var(--green)" }}>Lowest waste</div>
              {bestItems.length === 0 ? (
                <div style={{ fontSize: 15, color: "var(--muted)", paddingTop: 8 }}>No data yet</div>
              ) : bestItems.map((item, i) => (
                <div key={i} className="item-row">
                  <div className="item-name">{item.item}</div>
                  <span className="badge green">{item.avgWaste}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Worsening items (from trend) */}
          {trend?.item_trajectories?.worsening?.length > 0 && (
            <div className="card">
              <div className="section-label" style={{ color: "var(--scarlet)" }}>Trending worse this week</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {trend.item_trajectories.worsening.map((item, i) => (
                  <span key={i} style={{
                    background: "rgba(204,0,0,0.07)", color: "var(--scarlet)",
                    fontSize: 14, padding: "6px 14px", borderRadius: 99, fontWeight: 500,
                  }}>
                    {item.item} <strong>+{item.delta_pct}%</strong>
                  </span>
                ))}
              </div>
              {trend.commentary && (
                <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 14, lineHeight: 1.5, fontStyle: "italic" }}>
                  {trend.commentary}
                </div>
              )}
            </div>
          )}

          {/* Recent photo logs */}
          {recentPhotos.length > 0 && (
            <div className="card">
              <div className="section-label">Recent bin logs</div>
              {recentPhotos.map((log, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 0", borderBottom: i < recentPhotos.length - 1 ? "1px solid var(--lighter)" : "none",
                  gap: 10,
                }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, textTransform: "capitalize" }}>{log.shift}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{log.date}</div>
                  </div>
                  <div style={{ fontSize: 14, color: "var(--mid)", textAlign: "right" }}>
                    {log.estimated_lbs} lbs
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: pctColor(log.fullness_percent), minWidth: 48, textAlign: "right" }}>
                    {log.fullness_percent}%
                  </div>
                  <span className={`badge ${pctBadgeClass(log.fullness_percent)}`} style={{ minWidth: 60, textAlign: "center" }}>
                    {log.fullness_percent >= 75 ? "High" : log.fullness_percent >= 40 ? "Mid" : "Low"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

        <div className="site-footer">
          HawkWaste · IIT Commons · Chartwells · Built at IIT Hackathon 2026
        </div>
      </div>
    </div>
  );
}
