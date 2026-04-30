import os
import json
import base64
import time
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Simple in-memory response cache {key: (timestamp, data)}
_cache = {}
CACHE_TTL = 120  # 2 minutes

def get_cache(key):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None

def set_cache(key, data):
    _cache[key] = (time.time(), data)

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LOGS_FILE = os.path.join(DATA_DIR, "logs.json")
MOCK_FILE = os.path.join(DATA_DIR, "mockData.json")
MENU_FILE = os.path.join(DATA_DIR, "menuDataset.json")
CHEF_MENU_FILE = os.path.join(DATA_DIR, "chefMenuDataset.json")
WEEKLY_MENU_FILE = os.path.join(DATA_DIR, "weeklyMenuDataset.json")


def read_json(path):
    with open(path, "r") as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def ensure_logs_file():
    if not os.path.exists(LOGS_FILE):
        write_json(LOGS_FILE, [])


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "project": "HawkWaste", "campus": "IIT Commons"})


@app.route("/chef/menu", methods=["GET"])
def get_chef_menu():
    try:
        shift = request.args.get("shift")
        data = read_json(CHEF_MENU_FILE)
        if shift and shift in ["breakfast", "lunch", "dinner"]:
            return jsonify({
                "shift": shift,
                "metadata": data["metadata"],
                "data": data[shift],
                "daily_summary": data["daily_summary"]
            })
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chef/compare", methods=["POST"])
def compare_cooked_vs_waste():
    try:
        body = request.get_json()
        shift = body.get("shift", "lunch")
        actual_waste_lbs = body.get("actual_waste_lbs", 0)

        chef_data = read_json(CHEF_MENU_FILE)
        shift_data = chef_data.get(shift, {})

        expected_waste = shift_data.get("shift_total_wasted_lbs_estimate", 0)
        total_cooked = shift_data.get("shift_total_cooked_lbs", 0)
        actual_waste_pct = round((actual_waste_lbs / total_cooked) * 100, 1) if total_cooked else 0
        expected_waste_pct = round((expected_waste / total_cooked) * 100, 1) if total_cooked else 0
        diff = round(actual_waste_lbs - expected_waste, 1)
        status = "over_expected" if diff > 2 else "under_expected" if diff < -2 else "on_track"

        prompt = (
            f"At IIT Commons {shift} shift today, chefs cooked {total_cooked} lbs total. "
            f"Expected waste was {expected_waste} lbs ({expected_waste_pct}%). "
            f"Actual waste measured was {actual_waste_lbs} lbs ({actual_waste_pct}%). "
            f"Difference: {diff:+} lbs. Status: {status}. "
            f"Give one specific management action in under 30 words. "
            f"If over expected, name which station to cut tomorrow. Be direct."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
        )

        insight = response.choices[0].message.content.strip()

        return jsonify({
            "shift": shift,
            "total_cooked_lbs": total_cooked,
            "expected_waste_lbs": expected_waste,
            "expected_waste_pct": expected_waste_pct,
            "actual_waste_lbs": actual_waste_lbs,
            "actual_waste_pct": actual_waste_pct,
            "difference_lbs": diff,
            "status": status,
            "management_insight": insight,
            "stations": [
                {
                    "station": s["station"],
                    "cooked_lbs": s["station_total_cooked_lbs"],
                    "expected_waste_lbs": s["station_total_wasted_lbs_estimate"]
                }
                for s in shift_data.get("stations", [])
            ]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


IMAGES_DIR = os.path.join(DATA_DIR, "bin_images")
os.makedirs(IMAGES_DIR, exist_ok=True)

@app.route("/analyze-photo", methods=["POST"])
def analyze_photo():
    try:
        shift = request.form.get("shift", "lunch")
        date_override = request.form.get("date", "")
        log_date = date_override if date_override else datetime.now().strftime("%Y-%m-%d")
        disposal_method = request.form.get("disposal_method", "landfill")
        image_file = request.files.get("image")

        if not image_file:
            return jsonify({"error": "No image provided"}), 400

        # Save image to disk before encoding
        image_id = datetime.now().strftime("%Y%m%d%H%M%S")
        ext = (image_file.filename or "bin.jpg").rsplit(".", 1)[-1].lower()
        ext = ext if ext in ("jpg", "jpeg", "png", "webp") else "jpg"
        image_filename = f"{image_id}_{shift}.{ext}"
        image_path = os.path.join(IMAGES_DIR, image_filename)
        image_bytes = image_file.read()
        with open(image_path, "wb") as f:
            f.write(image_bytes)

        image_data = base64.b64encode(image_bytes).decode("utf-8")
        mime_type = image_file.content_type or "image/jpeg"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "This is a food waste bin at IIT Commons university dining hall. "
                                "Look at how full the bin is. "
                                "Estimate: 1) fullness as a percentage 0-100, "
                                "2) weight in pounds assuming a standard 32-gallon bin "
                                "(empty=0lbs, full=~25lbs of food waste), "
                                "3) your confidence level. "
                                "Return ONLY valid JSON, no explanation, no markdown: "
                                '{"fullness_percent": number, "estimated_lbs": number, "confidence": "low"|"medium"|"high"}'
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_data}",
                                "detail": "low",
                            },
                        },
                    ],
                }
            ],
            max_tokens=100,
        )

        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(raw)

        log_entry = {
            "id":               image_id,
            "date":             log_date,
            "timestamp":        datetime.now().isoformat(),
            "shift":            shift,
            "fullness_percent": result.get("fullness_percent", 0),
            "estimated_lbs":    result.get("estimated_lbs", 0),
            "confidence":       result.get("confidence", "low"),
            "image_filename":   image_filename,
            "disposal_method":  disposal_method,
        }

        ensure_logs_file()
        logs = read_json(LOGS_FILE)
        logs.append(log_entry)
        write_json(LOGS_FILE, logs)

        _cache.clear()

        return jsonify(log_entry)

    except json.JSONDecodeError:
        return jsonify({"error": "AI returned unexpected format"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/logs", methods=["GET"])
def get_logs():
    ensure_logs_file()
    logs = read_json(LOGS_FILE)
    mock = read_json(MOCK_FILE)
    item_logs = []
    mock_logs = []
    for entry in mock.get("logs", []):
        # Per-item breakdown for table views
        for item in entry.get("entries", []):
            item_logs.append({
                "date":          entry["date"],
                "shift":         entry["shift"],
                "station":       item["station"],
                "item":          item["item"],
                "waste_percent": item["wastePercent"],
                "portions_made": item["portionsMade"],
                "portions_left": item["portionsLeft"],
            })
        # Per-shift totals for chart — use precomputed totalWasteLbs
        mock_logs.append({
            "date":           entry["date"],
            "shift":          entry["shift"],
            "totalWasteLbs":  entry.get("totalWasteLbs", 0),
        })
    return jsonify({
        "photo_logs": logs,
        "item_logs":  item_logs,
        "mock_logs":  mock_logs,
        "summary":    mock.get("weekSummary", {}),
    })


@app.route("/recommendation", methods=["GET"])
def get_recommendation():
    cached = get_cache("recommendation")
    if cached:
        return jsonify(cached)
    try:
        mock = read_json(MOCK_FILE)
        menu = read_json(MENU_FILE)
        summary = mock.get("weekSummary", {})
        worst = summary.get("worstItems", [])
        best = summary.get("bestItems", [])
        insights = menu.get("ai_recommendation_context", {}).get("key_insights", [])
        population = menu.get("ai_recommendation_context", {}).get("population_profile", {})

        ensure_logs_file()
        photo_logs = read_json(LOGS_FILE)
        photo_waste_lbs = sum(e.get("estimated_lbs", 0) for e in photo_logs)
        mock_waste_lbs = summary.get("totalWasteLbs", 0)
        combined_waste = round(mock_waste_lbs + photo_waste_lbs, 1)
        total_shifts = len(mock.get("logs", [])) + len(photo_logs) or 1
        avg_per_shift = round(combined_waste / total_shifts, 1)

        photo_context = ""
        if photo_logs:
            recent = photo_logs[-3:]
            photo_context = (
                f" Recent bin scans: " +
                ", ".join([f"{e['shift']} {e['date']} {e.get('fullness_percent',0)}% full ~{e.get('estimated_lbs',0)} lbs" for e in recent]) +
                "."
            )

        worst_text = ", ".join([f"{i['item']} ({i['avgWaste']} waste)" for i in worst[:3]])
        best_text = ", ".join([f"{i['item']} ({i['avgWaste']} waste)" for i in best[:3]])
        insight_text = "; ".join(insights[:4])

        prompt = (
            f"You are a food waste analyst for IIT Commons dining hall at Illinois Institute of Technology, run by Chartwells. "
            f"Student population: {population.get('age_range', '18-35')}, "
            f"{population.get('international_students_pct', 60)}% international, "
            f"dietary restrictions include {', '.join(population.get('dietary_restrictions', []))}. "
            f"This week: highest waste items: {worst_text}. Lowest waste: {best_text}. "
            f"Key patterns observed: {insight_text}. "
            f"Total waste: {combined_waste} lbs this week ({len(photo_logs)} bin scans + mock logs).{photo_context} "
            f"Give ONE specific actionable recommendation. Name exact item and station. Under 40 words. No intro."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
        )

        tip = response.choices[0].message.content.strip()

        result = {
            "tip": tip,
            "worst_items": worst[:5],
            "best_items": best[:5],
            "total_waste_lbs": combined_waste,
            "avg_waste_per_shift": avg_per_shift,
        }
        set_cache("recommendation", result)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/predict", methods=["GET"])
def predict_waste():
    try:
        menu = read_json(MENU_FILE)
        shift = request.args.get("shift", "lunch")

        shift_data = menu.get("menu", {}).get(shift, {})
        items = shift_data.get("items", [])

        at_risk = []
        safe = []
        for item in items:
            score = (
                item.get("familiarity", 3) +
                item.get("cultural_fit", 3) +
                item.get("visual_appeal", 3) +
                item.get("comfort_level", 3) +
                (2 if item.get("protein_present") else 0)
            )
            max_score = 18
            risk_pct = round((1 - score / max_score) * 100)
            entry = {
                "name": item["name"],
                "station": item.get("station", shift_data.get("station", "—")),
                "historical_waste_pct": item.get("historical_waste_pct", 0),
                "predicted_risk_pct": risk_pct,
                "waste_tier": item.get("waste_tier", "medium"),
                "notes": item.get("notes", ""),
                "protein_present": item.get("protein_present", False),
            }
            if item.get("waste_tier") in ["high", "critical"]:
                at_risk.append(entry)
            else:
                safe.append(entry)

        at_risk.sort(key=lambda x: x["historical_waste_pct"], reverse=True)
        safe.sort(key=lambda x: x["historical_waste_pct"])

        at_risk_text = "; ".join([
            f"{i['name']} (historically {i['historical_waste_pct']}% waste, {i['notes']})"
            for i in at_risk[:3]
        ])

        prompt = (
            f"You are predicting food waste for {shift} at IIT Commons, serving a mixed population "
            f"of undergrad, grad, faculty and staff — 60% international students. "
            f"Items most likely to waste based on menu scoring: {at_risk_text}. "
            f"Give a single pre-shift production warning in under 35 words. "
            f"Name specific items and suggest batch reduction amounts. Be direct."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
        )

        prediction = response.choices[0].message.content.strip()

        return jsonify({
            "shift": shift,
            "prediction": prediction,
            "at_risk_items": at_risk[:5],
            "safe_items": safe[:5],
            "total_items_analyzed": len(items),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/menu", methods=["GET"])
def get_menu():
    stations = [
        "Breakfast Entree Line", "Create (Omelet Bar)",
        "Fruit and Yogurt Bar", "Bakery", "Global Kitchen",
        "Pizza", "Daily Grill", "Chef Made Soups",
    ]
    return jsonify({"location": "IIT Commons", "stations": stations})


@app.route("/menu/today", methods=["GET"])
def get_todays_menu():
    """
    Shows what was actually served on a given date, cross-referenced with waste scores.
    Reads from mockData logs — no future menu file needed.
    ?date=2026-04-04  (optional — defaults to most recent date in logs)
    ?shift=lunch      (optional — returns all shifts if omitted)
    """
    try:
        mock   = read_json(MOCK_FILE)
        scores = read_json(MENU_FILE)
        chef   = read_json(CHEF_MENU_FILE) if os.path.exists(CHEF_MENU_FILE) else {}

        # Build batch size lookup from chefMenuDataset
        batch_lookup = {}
        for shift_key in ["breakfast", "lunch", "dinner"]:
            for station in chef.get(shift_key, {}).get("stations", []):
                for item in station.get("items", []):
                    batch_lookup[item["name"].lower()] = item.get("batch_lbs_cooked")

        def fuzzy_batch(name):
            key = name.lower()
            if key in batch_lookup:
                return batch_lookup[key]
            for chef_name, lbs in batch_lookup.items():
                if key in chef_name or chef_name in key:
                    return lbs
            name_words = set(key.split())
            best_match, best_score = None, 0
            for chef_name, lbs in batch_lookup.items():
                chef_words = set(chef_name.split())
                overlap = len(name_words & chef_words)
                if overlap > best_score and overlap >= 2:
                    best_score = overlap
                    best_match = lbs
            return best_match

        # Build waste score lookup from menuDataset
        score_lookup = {}
        for shift_key in ["breakfast", "lunch", "dinner"]:
            for item in scores.get("menu", {}).get(shift_key, {}).get("items", []):
                score_lookup[item["name"].lower()] = {
                    "historical_waste_pct": item.get("historical_waste_pct"),
                    "waste_tier":           item.get("waste_tier"),
                    "familiarity":          item.get("familiarity"),
                    "cultural_fit":         item.get("cultural_fit"),
                    "protein_present":      item.get("protein_present"),
                    "notes":                item.get("notes"),
                }

        requested_date  = request.args.get("date")
        requested_shift = request.args.get("shift")

        # Get all available dates from logs
        logs = mock.get("logs", [])
        available_dates = sorted(set(e["date"] for e in logs))
        if not available_dates:
            return jsonify({"error": "No log data found"}), 404

        target_date = requested_date if requested_date in available_dates else available_dates[-1]

        # Group log entries by shift for the target date
        shifts_data = {}
        for entry in logs:
            if entry["date"] != target_date:
                continue
            shift = entry["shift"]
            enriched = []
            for item in entry.get("entries", []):
                name     = item["item"]
                sc       = score_lookup.get(name.lower())
                if not sc:
                    key = name.lower()
                    for sn, sv in score_lookup.items():
                        if key in sn or sn in key:
                            sc = sv
                            break
                    if not sc:
                        name_words = set(key.split())
                        best, best_n = None, 0
                        for sn, sv in score_lookup.items():
                            n = len(name_words & set(sn.split()))
                            if n > best_n and n >= 2:
                                best_n = n
                                best = sv
                        sc = best or {}
                waste_pct = item.get("wastePercent") or sc.get("historical_waste_pct")
                tier      = sc.get("waste_tier")
                if not tier and waste_pct is not None:
                    if waste_pct >= 56:   tier = "critical"
                    elif waste_pct >= 36: tier = "high"
                    elif waste_pct >= 16: tier = "medium"
                    else:                 tier = "low"
                enriched.append({
                    "name":                 name,
                    "station":              item.get("station", ""),
                    "portions_made":        item.get("portionsMade"),
                    "portions_left":        item.get("portionsLeft"),
                    "waste_pct":            waste_pct,
                    "waste_tier":           tier or "medium",
                    "batch_lbs":            fuzzy_batch(name),
                    "historical_waste_pct": sc.get("historical_waste_pct"),
                    "familiarity":          sc.get("familiarity"),
                    "cultural_fit":         sc.get("cultural_fit"),
                    "protein_present":      sc.get("protein_present"),
                    "notes":                sc.get("notes"),
                })
            enriched.sort(key=lambda x: (x.get("waste_pct") or 0), reverse=True)
            total_cooked = chef.get(shift, {}).get("shift_total_cooked_lbs")
            shifts_data[shift] = {
                "items":            enriched,
                "total_cooked_lbs": total_cooked,
                "total_waste_lbs":  entry.get("totalWasteLbs"),
                "shift_notes":      entry.get("notes", ""),
                "item_count":       len(enriched),
            }

        shifts_to_return = (
            [requested_shift] if requested_shift in ["breakfast", "lunch", "dinner"]
            else ["breakfast", "lunch", "dinner"]
        )

        all_items = []
        result_shifts = {}
        for s in shifts_to_return:
            if s in shifts_data:
                result_shifts[s] = shifts_data[s]
                for item in shifts_data[s]["items"]:
                    all_items.append({**item, "shift": s})

        at_risk = sorted(
            [i for i in all_items if i.get("waste_tier") in ("high", "critical")],
            key=lambda x: (x.get("waste_pct") or 0), reverse=True
        )[:8]

        return jsonify({
            "date":            target_date,
            "available_dates": available_dates,
            "shifts":          result_shifts,
            "at_risk_items":   at_risk,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/trend", methods=["GET"])
def get_trend():
    """
    Week-over-week waste trend, sustainability score, and per-item trajectories.
    Uses mockData logs grouped by date.
    """
    cached = get_cache("trend")
    if cached:
        return jsonify(cached)
    try:
        mock = read_json(MOCK_FILE)
        logs = mock.get("logs", [])

        ensure_logs_file()
        photo_logs = read_json(LOGS_FILE)

        # --- Daily totals ---
        daily = {}
        for entry in logs:
            date = entry["date"]
            if date not in daily:
                daily[date] = {"total_lbs": 0, "shifts": [], "item_waste_pcts": []}
            daily[date]["total_lbs"] += entry.get("totalWasteLbs", 0)
            daily[date]["shifts"].append(entry["shift"])
            for item in entry.get("entries", []):
                daily[date]["item_waste_pcts"].append(item["wastePercent"])

        for entry in photo_logs:
            date = entry.get("date", "")
            if not date:
                continue
            if date not in daily:
                daily[date] = {"total_lbs": 0, "shifts": [], "item_waste_pcts": []}
            daily[date]["total_lbs"] += entry.get("estimated_lbs", 0)
            daily[date]["shifts"].append(entry.get("shift", "unknown"))
            fp = entry.get("fullness_percent", 0)
            if fp:
                daily[date]["item_waste_pcts"].append(fp)

        sorted_dates = sorted(daily.keys())

        # Avg waste % per day (across all items served that day)
        daily_avg_waste_pct = {}
        for date in sorted_dates:
            pcts = daily[date]["item_waste_pcts"]
            daily_avg_waste_pct[date] = round(sum(pcts) / len(pcts), 1) if pcts else 0

        # --- Split into two halves for week-over-week comparison ---
        mid = len(sorted_dates) // 2
        early_dates = sorted_dates[:mid] if mid > 0 else sorted_dates[:1]
        late_dates  = sorted_dates[mid:] if mid > 0 else sorted_dates[1:]

        early_lbs     = round(sum(daily[d]["total_lbs"] for d in early_dates), 1)
        late_lbs      = round(sum(daily[d]["total_lbs"] for d in late_dates), 1)
        early_avg_pct = round(sum(daily_avg_waste_pct[d] for d in early_dates) / len(early_dates), 1)
        late_avg_pct  = round(sum(daily_avg_waste_pct[d] for d in late_dates) / len(late_dates), 1)

        lbs_delta     = round(late_lbs - early_lbs, 1)
        pct_delta     = round(late_avg_pct - early_avg_pct, 1)
        trajectory    = "improving" if lbs_delta < 0 else "worsening" if lbs_delta > 0 else "stable"

        # Normalize to per-day for fair comparison (periods may have different day counts)
        early_lbs_per_day = round(early_lbs / max(len(early_dates), 1), 1)
        late_lbs_per_day  = round(late_lbs  / max(len(late_dates),  1), 1)
        change_pct        = round(((late_lbs_per_day - early_lbs_per_day) / early_lbs_per_day) * 100, 1) if early_lbs_per_day else 0

        # --- Sustainability score (0–100) ---
        # Based on avg item waste % of the most recent day. Lower waste % = higher score.
        latest_date     = sorted_dates[-1]
        latest_avg_pct  = daily_avg_waste_pct[latest_date]
        # Map: 0% waste → 100 score, 60%+ waste → 0 score
        sustainability_score = max(0, round(100 - (latest_avg_pct / 60) * 100))

        # --- Per-item trajectory (items that appear on multiple dates) ---
        item_appearances = {}
        for entry in logs:
            date = entry["date"]
            for item in entry.get("entries", []):
                name = item["item"].lower()
                if name not in item_appearances:
                    item_appearances[name] = {"name": item["item"], "records": []}
                item_appearances[name]["records"].append({
                    "date": date,
                    "waste_pct": item["wastePercent"]
                })

        improving_items = []
        worsening_items = []
        for data in item_appearances.values():
            records = sorted(data["records"], key=lambda x: x["date"])
            if len(records) < 2:
                continue
            first_pct = records[0]["waste_pct"]
            last_pct  = records[-1]["waste_pct"]
            delta     = round(last_pct - first_pct, 1)
            entry_out = {
                "item":       data["name"],
                "first_seen_waste_pct": first_pct,
                "latest_waste_pct":     last_pct,
                "delta_pct":  delta,
                "appearances": len(records),
            }
            if delta <= -5:
                improving_items.append(entry_out)
            elif delta >= 5:
                worsening_items.append(entry_out)

        improving_items.sort(key=lambda x: x["delta_pct"])
        worsening_items.sort(key=lambda x: x["delta_pct"], reverse=True)

        # --- AI commentary ---
        top_worsening = ", ".join([f"{i['item']} (+{i['delta_pct']}%)" for i in worsening_items[:3]])
        top_improving = ", ".join([f"{i['item']} ({i['delta_pct']}%)" for i in improving_items[:3]]) or "none"
        trend_direction = f"up {change_pct}%" if change_pct > 0 else f"down {abs(change_pct)}%"

        prompt = (
            f"IIT Commons food waste trend: waste is {trend_direction} per day "
            f"({early_lbs_per_day} lbs/day early week → {late_lbs_per_day} lbs/day recent). "
            f"Sustainability score: {sustainability_score}/100. "
            f"Worsening items: {top_worsening or 'none'}. Improving: {top_improving}. "
            f"Write one sentence of honest feedback for the dining manager. No intro. Be direct."
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=60,
        )
        commentary = response.choices[0].message.content.strip()

        result = {
            "sustainability_score": sustainability_score,
            "score_label": (
                "excellent" if sustainability_score >= 75 else
                "good"      if sustainability_score >= 55 else
                "fair"      if sustainability_score >= 35 else
                "poor"
            ),
            "trajectory": trajectory,
            "commentary": commentary,
            "period_comparison": {
                "early_period":           early_dates,
                "late_period":            late_dates,
                "early_lbs_per_day":      early_lbs_per_day,
                "late_lbs_per_day":       late_lbs_per_day,
                "change_pct":             change_pct,
                "avg_item_waste_pct_early": early_avg_pct,
                "avg_item_waste_pct_late":  late_avg_pct,
                "waste_pct_delta":         pct_delta,
            },
            "daily_totals": [
                {
                    "date":           d,
                    "total_lbs":      round(daily[d]["total_lbs"], 1),
                    "avg_waste_pct":  daily_avg_waste_pct[d],
                }
                for d in sorted_dates
            ],
            "item_trajectories": {
                "worsening": worsening_items[:5],
                "improving": improving_items[:5],
            },
        }
        set_cache("trend", result)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/impact", methods=["GET"])
def get_impact():
    """
    Environmental impact of food waste.
    ?scope=week (default) | ?scope=shift&shift=lunch&date=2026-04-04 | ?lbs=42.5
    """
    try:
        CO2_PER_LB   = 1.9
        WATER_PER_LB = 25.0
        COST_PER_LB  = 3.00
        LBS_PER_MEAL = 1.2

        scope     = request.args.get("scope", "week")
        raw_lbs   = request.args.get("lbs")
        shift_arg = request.args.get("shift", "lunch")
        date_arg  = request.args.get("date")

        if raw_lbs:
            total_lbs = float(raw_lbs)
            label = f"custom ({total_lbs} lbs)"
        elif scope == "shift":
            mock  = read_json(MOCK_FILE)
            entry = None
            for log in mock.get("logs", []):
                if log["shift"] == shift_arg:
                    if date_arg is None or log["date"] == date_arg:
                        entry = log
            if not entry:
                return jsonify({"error": "Shift not found"}), 404
            total_lbs = entry["totalWasteLbs"]
            label = f"{entry['date']} {shift_arg}"
        else:
            mock      = read_json(MOCK_FILE)
            total_lbs = mock["weekSummary"]["totalWasteLbs"]
            label     = mock.get("week", "this week")

        co2_lbs   = round(total_lbs * CO2_PER_LB, 1)
        co2_kg    = round(co2_lbs * 0.453592, 1)
        water_gal = round(total_lbs * WATER_PER_LB, 0)
        cost_usd  = round(total_lbs * COST_PER_LB, 2)
        meals_lost = int(total_lbs / LBS_PER_MEAL)

        reduction_pct  = 0.20
        saved_lbs      = round(total_lbs * reduction_pct, 1)
        saved_co2_lbs  = round(saved_lbs * CO2_PER_LB, 1)
        saved_water    = round(saved_lbs * WATER_PER_LB, 0)
        saved_cost     = round(saved_lbs * COST_PER_LB, 2)
        saved_meals    = int(saved_lbs / LBS_PER_MEAL)
        annual_savings = round(saved_cost * 52, 2)

        return jsonify({
            "scope": label,
            "waste_lbs": total_lbs,
            "environmental_impact": {
                "co2_lbs":       co2_lbs,
                "co2_kg":        co2_kg,
                "water_gallons": int(water_gal),
                "food_cost_usd": cost_usd,
                "meals_equivalent": meals_lost,
            },
            "potential_savings_at_20pct_reduction": {
                "lbs_saved":           saved_lbs,
                "co2_lbs_avoided":     saved_co2_lbs,
                "water_gallons_saved": int(saved_water),
                "money_saved_usd":     saved_cost,
                "meals_recoverable":   saved_meals,
                "annual_money_saved":  annual_savings,
            },
            "context": {
                "co2_equivalent":    f"Driving a car {round(co2_kg / 0.21, 0):.0f} km",
                "water_equivalent":  f"{int(water_gal / 8.34):.0f} standard bath tubs",
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/batch-optimize", methods=["GET"])
def batch_optimize():
    """
    Pre-shift batch size recommendations based on historical waste.
    ?shift=breakfast|lunch|dinner  (default: lunch)
    """
    try:
        shift      = request.args.get("shift", "lunch")
        chef_data  = read_json(CHEF_MENU_FILE)
        shift_data = chef_data.get(shift)

        if not shift_data:
            return jsonify({"error": f"No chef data for shift: {shift}"}), 404

        recommendations    = []
        total_current_lbs  = 0
        total_recommended_lbs = 0

        for station in shift_data.get("stations", []):
            for item in station.get("items", []):
                waste_pct = item.get("waste_pct_estimate", 0)
                batch_lbs = item.get("batch_lbs_cooked", 0)
                total_current_lbs += batch_lbs

                if waste_pct < 20:
                    recommended_lbs = batch_lbs
                    action = "no_change"
                else:
                    cut_fraction    = (waste_pct / 100) * 0.75
                    recommended_lbs = round(batch_lbs * (1 - cut_fraction), 1)
                    action = "reduce"

                lbs_saved = round(batch_lbs - recommended_lbs, 1)
                total_recommended_lbs += recommended_lbs

                recommendations.append({
                    "item":                  item["name"],
                    "station":               station["station"],
                    "current_batch_lbs":     batch_lbs,
                    "recommended_lbs":       recommended_lbs,
                    "lbs_saved":             lbs_saved,
                    "historical_waste_pct":  waste_pct,
                    "action":                action,
                })

        recommendations.sort(key=lambda x: x["lbs_saved"], reverse=True)

        total_lbs_saved = round(total_current_lbs - total_recommended_lbs, 1)
        co2_avoided     = round(total_lbs_saved * 1.9, 1)
        cost_avoided    = round(total_lbs_saved * 3.0, 2)

        top_cuts = [
            f"{r['item']} ({r['current_batch_lbs']} → {r['recommended_lbs']} lbs, saves {r['lbs_saved']} lbs)"
            for r in recommendations if r["action"] == "reduce"
        ][:4]
        top_cuts_text = "; ".join(top_cuts) if top_cuts else "No major cuts needed"

        prompt = (
            f"Pre-shift batch briefing for {shift} at IIT Commons. "
            f"Recommended cuts: {top_cuts_text}. "
            f"Total projected savings: {total_lbs_saved} lbs, ${cost_avoided}. "
            f"Write a 2-sentence briefing for the kitchen team. Direct, no intro."
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
        )
        briefing = response.choices[0].message.content.strip()

        return jsonify({
            "shift":          shift,
            "chef_briefing":  briefing,
            "summary": {
                "current_total_lbs":         round(total_current_lbs, 1),
                "recommended_total_lbs":     round(total_recommended_lbs, 1),
                "projected_lbs_saved":       total_lbs_saved,
                "projected_co2_avoided_lbs": co2_avoided,
                "projected_cost_saved":      cost_avoided,
            },
            "items": recommendations,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    ensure_logs_file()
    app.run(debug=True, port=5001)