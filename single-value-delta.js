/* Single Value + Δ% (Prev Period / Prior Year / MTD) — Looker Custom Viz */
looker.plugins.visualizations.add({
  id: "sv_delta_plus",
  label: "Single Value KPI + Δ%",
  options: {
    metric_label: { section: "Display", type: "string", label: "Metric Label (optional)", default: "" },
    format_mode: {
      section: "Display", type: "string", label: "Display As", display: "select",
      values: [{Number:"number"},{Percent:"percent"},{Currency:"currency"}], default: "number"
    },
    currency_symbol: { section: "Display", type: "string", label: "Currency Symbol", default: "$" },
    compact: { section: "Display", type: "boolean", label: "Compact (K / M / B)", default: true },
    decimals: { section: "Display", type: "number", label: "Decimals", default: 1 },
    suffix: { section: "Display", type: "string", label: "Value Suffix (e.g., ' clicks')", default: "" },
    positive_is_bad: { section: "Color", type: "boolean", label: "Positive is Bad", default: false },
    neutral_color: { section: "Color", type: "string", label: "Neutral Color", default: "#64748B" },
    good_color: { section: "Color", type: "string", label: "Up Color", default: "#1a7f37" },
    bad_color:  { section: "Color", type: "string", label: "Down Color", default: "#d33" },

    compare_mode: {
      section: "Compare", type: "string", label: "Compare Mode", display: "select",
      values: [{"Previous Period":"prev_period"},{"Previous Year":"prev_year"},{"MTD vs Prior MTD (day-matched)":"mtd_daymatch"}],
      default: "prev_period"
    },

    calc_mode: {
      section: "Metric", type: "string", label: "Metric Calc", display: "select",
      values: [{"Sum of measure[0]":"sum_single"},{"Ratio of sums (m0 / m1)":"ratio_of_sums"}], default: "sum_single"
    },
    measure_0_name: { section: "Metric", type: "string", label: "Primary Measure Name (optional)", default: "" },
    measure_1_name: { section: "Metric", type: "string", label: "Secondary Measure Name (for ratio, optional)", default: "" },

    big_size_px: { section: "Layout", type: "number", label: "Big Number Font Size (px)", default: 64 },
    sub_size_px: { section: "Layout", type: "number", label: "Subtext Font Size (px)", default: 14 }
  },

  create(el) {
    el.innerHTML = `
      <div id="svd-wrap" style="font-family:inherit;padding:12px;">
        <div id="svd-big" style="font-weight:700;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
        <div id="svd-sub" style="margin-top:6px;"></div>
      </div>`;
  },

updateAsync(data, el, config, queryResponse, details, done) {
  try {
    this.clearErrors();

    // ---------- Utilities ----------
    const err = (m)=>{ this.addError({title:"Configuration error", message:String(m)}); done(); throw m; };

    const getCell = (row, fieldName) => row?.[fieldName];
    const valOf   = (cell) => (cell == null ? null : (typeof cell === "object" && "value" in cell ? cell.value : cell));
    const numOf   = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const dateOf  = (v) => {
      if (v instanceof Date) return isNaN(v) ? null : v;
      // handle epoch seconds / ms and ISO strings
      if (typeof v === "number") {
        const d = new Date(v > 1e12 ? v : v * 1000);
        return isNaN(d) ? null : d;
      }
      if (v == null) return null;
      const d = new Date(String(v));
      return isNaN(d) ? null : d;
    };

    const DAY   = 24 * 3600 * 1000;
    const addDays = (d, n) => new Date(d.getTime() + n * DAY);

    // ---------- Field selection ----------
    const timeField = (queryResponse.fields.dimension_like || [])
      .find(f => f.is_timeframe === true || /date|time/i.test(f.name));
    if (!timeField) err("Add one time dimension to the query.");

    const measures = queryResponse.fields.measure_like || [];
    if (!measures.length) err("Add at least one measure.");

    const byName = (name)=> measures.find(m => m.name === name || m.label_short === name);
    const m0 = config.measure_0_name ? byName(config.measure_0_name) : measures[0];
    if (!m0) err("Primary measure not found. Check 'Primary Measure Name'.");

    const useRatio = config.calc_mode === "ratio_of_sums";
    const m1 = useRatio ? (config.measure_1_name ? byName(config.measure_1_name) : measures[1]) : null;
    if (useRatio && !m1) err("Ratio mode selected: supply a second measure.");

    // ---------- Normalize & aggregate rows per DATE ----------
    // We aggregate across ANY non-time dimensions so the viz always has one series keyed by date.
    const dayMap = new Map(); // isoDay -> { d, num, den }
    for (const row of data) {
      const dRaw = valOf(getCell(row, timeField.name));
      const d    = dateOf(dRaw);
      if (!d) continue; // ignore totals / null-date rows

      const v0 = numOf(valOf(getCell(row, m0.name))) ?? 0;
      const v1 = useRatio ? (numOf(valOf(getCell(row, m1.name))) ?? 0) : 0;

      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const prev = dayMap.get(key) || { d, num: 0, den: 0 };
      prev.num += v0;
      if (useRatio) prev.den += v1;
      dayMap.set(key, prev);
    }

    const rows = Array.from(dayMap.values()).sort((a, b) => a.d - b.d);
    if (!rows.length) err("No dated rows in selection (after removing totals).");

    // ---------- Infer grain (day / week / month) ----------
    const inferGrain = () => {
      if (rows.length < 2) return "day";
      const ms = rows.at(-1).d - rows.at(-2).d;
      if (Math.abs(ms - 7*DAY) < 3*DAY) return "week";
      if (Math.abs(ms) > 25*DAY) return "month";
      return "day";
    };
    const grain = inferGrain();

    // ---------- Window helpers ----------
    const start = rows[0].d, end = rows.at(-1).d;
    const unitsInWindow = (() => {
      if (grain === "week") return Math.max(1, Math.round(((end - start)/DAY + 1) / 7));
      if (grain === "month") return Math.max(1, (end.getFullYear() - start.getFullYear())*12 + (end.getMonth() - start.getMonth()) + 1);
      return Math.floor((end - start)/DAY) + 1;
    })();

    const sumRange = (s, e) => {
      if (useRatio) {
        let num = 0, den = 0;
        for (const r of rows) if (r.d >= s && r.d <= e) { num += r.num; den += r.den; }
        return den === 0 ? null : (num / den);
      } else {
        let num = 0;
        for (const r of rows) if (r.d >= s && r.d <= e) num += r.num;
        return num;
      }
    };

    let currStart = start, currEnd = end, prevStart, prevEnd;

    const sameSpanBack = () => {
      if (grain === "week") {
        prevEnd   = addDays(currStart, -1);
        prevStart = addDays(prevEnd, -7*unitsInWindow + 1);
      } else if (grain === "month") {
        prevEnd   = new Date(currStart.getFullYear(), currStart.getMonth(), 0);
        const sMo = new Date(currStart.getFullYear(), currStart.getMonth() - (unitsInWindow - 1), 1);
        prevStart = new Date(sMo.getFullYear(), sMo.getMonth(), 1);
      } else {
        prevEnd   = addDays(currStart, -1);
        prevStart = addDays(prevEnd, -(unitsInWindow - 1));
      }
    };

    const priorYearSameSpan = () => {
      prevStart = new Date(currStart.getFullYear()-1, currStart.getMonth(), currStart.getDate());
      prevEnd   = new Date(currEnd.getFullYear()-1,   currEnd.getMonth(),   currEnd.getDate());
    };

    const mtdDayMatched = () => {
      const looksMTD = currStart.getDate() === 1;
      if (!looksMTD) return sameSpanBack();
      const dayCount = Math.floor((currEnd - currStart)/DAY) + 1;
      const prevMonthStart = new Date(currStart.getFullYear(), currStart.getMonth()-1, 1);
      const prevMonthEnd   = new Date(currStart.getFullYear(), currStart.getMonth(), 0);
      prevStart = prevMonthStart;
      prevEnd   = addDays(prevMonthStart, dayCount - 1);
      if (prevEnd > prevMonthEnd) prevEnd = prevMonthEnd;
    };

    switch (config.compare_mode) {
      case "prev_year":    priorYearSameSpan(); break;
      case "mtd_daymatch": mtdDayMatched();     break;
      default:             sameSpanBack();      break;
    }

    const currVal = sumRange(currStart, currEnd);
    const prevVal = sumRange(prevStart, prevEnd);

    // ---------- Delta & colors ----------
    const delta = (prevVal === null || prevVal === 0 || currVal === null) ? null : ((currVal - prevVal) / prevVal);
    const arrow = (delta == null) ? "" : (delta > 0 ? "▲" : (delta < 0 ? "▼" : "•"));
    const isGood = delta > 0 ? !config.positive_is_bad : config.positive_is_bad;
    const color  = (delta == null) ? (config.neutral_color || "#64748B")
                  : (isGood ? (config.good_color || "#1a7f37") : (config.bad_color || "#d33"));

    // ---------- Formatting ----------
    const formatNumber = (val, d, compact) => {
      const abs = Math.abs(val), sign = val < 0 ? "-" : "";
      const fmt = (n) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      if (!compact) return sign + fmt(abs);
      if (abs >= 1e9) return sign + (abs/1e9).toFixed(d) + "B";
      if (abs >= 1e6) return sign + (abs/1e6).toFixed(d) + "M";
      if (abs >= 1e3) return sign + (abs/1e3).toFixed(d) + "K";
      return sign + fmt(abs);
    };
    const nf = (val, asPercent) => {
      if (val == null) return "n/a";
      const d = Number.isFinite(config.decimals) ? Math.max(0, config.decimals) : 1;
      if (asPercent || config.format_mode === "percent") return (val * 100).toFixed(d) + "%";
      const compact = !!config.compact;
      if (config.format_mode === "currency") return (config.currency_symbol || "$") + formatNumber(val, d, compact);
      return formatNumber(val, d, compact);
    };

    // ---------- Render ----------
    const bigEl = el.querySelector("#svd-big");
    const subEl = el.querySelector("#svd-sub");
    bigEl.style.fontSize = (config.big_size_px || 64) + "px";
    subEl.style.fontSize = (config.sub_size_px || 14) + "px";

    const label = (config.metric_label || m0.label || m0.label_short || m0.name);
    const big   = (config.format_mode === "percent") ? nf(currVal, true) : nf(currVal, false) + (config.suffix || "");
    bigEl.textContent = big;

    const compareLabel = (config.compare_mode === "prev_year")
      ? "vs previous year" : (config.compare_mode === "mtd_daymatch" ? "vs prior MTD" : "vs previous period");
    const deltaTxt = (delta == null) ? "n/a" : nf(delta, true);

    subEl.innerHTML = `<span style="color:${color};">${arrow} ${deltaTxt}</span> ${compareLabel} • ${label}`;

    done();
  } catch (e) {
    this.addError({title:"Runtime error", message:String(e)});
    done();
  }
}
});
