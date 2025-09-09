/* Single Value + Δ% (Prev Period / Prior Year / MTD) — Looker Custom Viz
   Author: You + ChatGPT
   Usage:
     - Query must include exactly ONE time dimension + at least ONE measure.
     - Optional: include a second measure if using ratio_of_sums.
     - Apply any date filter; viz will compute current and comparison windows.
*/

looker.plugins.visualizations.add({
  id: "sv_delta_plus",
  label: "Single Value KPI + Δ%",
  options: {
    metric_label: {
      section: "Display",
      type: "string",
      label: "Metric Label (optional)",
      default: ""
    },
    format_mode: {
      section: "Display",
      type: "string",
      label: "Display As",
      display: "select",
      values: [
        {"Number": "number"},
        {"Percent": "percent"},
        {"Currency": "currency"}
      ],
      default: "number"
    },
    currency_symbol: {
      section: "Display",
      type: "string",
      label: "Currency Symbol",
      default: "$"
    },
    compact: {
      section: "Display",
      type: "boolean",
      label: "Compact (K / M / B)",
      default: true
    },
    decimals: {
      section: "Display",
      type: "number",
      label: "Decimals",
      default: 1
    },
    suffix: {
      section: "Display",
      type: "string",
      label: "Value Suffix (e.g., ' clicks')",
      default: ""
    },
    positive_is_bad: {
      section: "Color",
      type: "boolean",
      label: "Positive is Bad",
      default: false
    },
    neutral_color: {
      section: "Color",
      type: "string",
      label: "Neutral Color",
      default: "#64748B"
    },
    good_color: {
      section: "Color",
      type: "string",
      label: "Up Color",
      default: "#1a7f37"
    },
    bad_color: {
      section: "Color",
      type: "string",
      label: "Down Color",
      default: "#d33"
    },

    // Compare logic
    compare_mode: {
      section: "Compare",
      type: "string",
      label: "Compare Mode",
      display: "select",
      values: [
        {"Previous Period": "prev_period"},
        {"Previous Year": "prev_year"},
        {"MTD vs Prior MTD (day-matched)": "mtd_daymatch"}
      ],
      default: "prev_period"
    },

    // Calculation mode for the main metric
    calc_mode: {
      section: "Metric",
      type: "string",
      label: "Metric Calc",
      display: "select",
      values: [
        {"Sum of measure[0]": "sum_single"},
        {"Ratio of sums (m0 / m1)": "ratio_of_sums"}
      ],
      default: "sum_single"
    },
    // Which fields to use (optional: auto-detected if blank)
    measure_0_name: {
      section: "Metric",
      type: "string",
      label: "Primary Measure Name (optional)",
      default: ""
    },
    measure_1_name: {
      section: "Metric",
      type: "string",
      label: "Secondary Measure Name (for ratio, optional)",
      default: ""
    },

    // Layout sizing
    big_size_px: {
      section: "Layout",
      type: "number",
      label: "Big Number Font Size (px)",
      default: 64
    },
    sub_size_px: {
      section: "Layout",
      type: "number",
      label: "Subtext Font Size (px)",
      default: 14
    }
  },

  create(el, config) {
    el.innerHTML = `
      <div id="svd-wrap" style="font-family: inherit; padding: 12px;">
        <div id="svd-big"
             style="font-weight:700; line-height:1.05; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
        <div id="svd-sub" style="margin-top:6px;"></div>
      </div>`;
  },

  updateAsync(data, el, config, queryResponse, details, done) {
    try {
      // ---- Helpers ----
      const err = (msg) => { this.addError({title:"Configuration error", message: String(msg)}); throw msg; };

      const timeField = queryResponse.fields.dimension_like.find(
        f => (f.is_timeframe === true) || /date|time/i.test(f.name)
      );
      if (!timeField) err("Add one time dimension to the query.");

      // Measure selection: allow explicit names or defaults
      const measures = queryResponse.fields.measure_like;
      if (!measures.length) err("Add at least one measure.");
      const pickMeasureByName = (name) => measures.find(m => m.name === name || m.label_short === name);

      const m0 = (config.measure_0_name ? pickMeasureByName(config.measure_0_name) : measures[0]);
      if (!m0) err("Primary measure not found. Check 'Primary Measure Name'.");

      const m1 = (config.calc_mode === "ratio_of_sums")
        ? (config.measure_1_name ? pickMeasureByName(config.measure_1_name) : measures[1])
        : null;
      if (config.calc_mode === "ratio_of_sums" && !m1) err("Ratio mode selected: supply a second measure.");

      // Extract rows -> [{d: Date, vals: {m0: number, m1?: number}}...] sorted asc
      const rows = data.map(r => {
        const dv = r[timeField.name]?.value;
        const d = dv ? new Date(dv) : null;
        const v0raw = r[m0.name]?.value;
        const v1raw = m1 ? r[m1.name]?.value : null;
        const v0 = (typeof v0raw === "number") ? v0raw : Number(v0raw);
        const v1 = m1 ? ((typeof v1raw === "number") ? v1raw : Number(v1raw)) : null;
        return (d && !isNaN(d) && isFinite(v0) && (m1 ? isFinite(v1) : true)) ? { d, v0, v1 } : null;
      }).filter(Boolean).sort((a,b)=> a.d - b.d);

      if (!rows.length) err("No data rows in the selected date range.");

      // Detect grain (rough): day/week/month via distance between last two rows
      const inferGrain = () => {
        if (rows.length < 2) return "day";
        const ms = rows[rows.length-1].d - rows[rows.length-2].d;
        const DAY = 24*3600*1000;
        if (Math.abs(ms - 7*DAY) < 3*DAY) return "week";
        if (Math.abs(ms) > 25*DAY) return "month";
        return "day";
      };
      const grain = inferGrain();

      // Window utilities
      const DAY = 24*3600*1000;
      const clone = d => new Date(d.getTime());
      const addDays = (d,n) => new Date(d.getTime() + n*DAY);
      const start = rows[0].d;
      const end   = rows[rows.length-1].d;

      // Count units within current window (inclusive)
      const unitsInWindow = (() => {
        if (grain === "week") {
          // count by whole weeks between start..end
          const diffDays = Math.floor((end - start)/DAY) + 1;
          return Math.max(1, Math.round(diffDays / 7));
        }
        if (grain === "month") {
          // crude month count based on year/month
          const months = (end.getFullYear()-start.getFullYear())*12 + (end.getMonth()-start.getMonth()) + 1;
          return Math.max(1, months);
        }
        // day
        return Math.floor((end - start)/DAY) + 1;
      })();

      // Sum helper for a date range
      function sumRange(s, e) {
        let num = 0, den = 0;
        for (const r of rows) {
          if (r.d >= s && r.d <= e) {
            if (config.calc_mode === "ratio_of_sums") {
              num += r.v0 || 0;
              den += r.v1 || 0;
            } else {
              num += r.v0 || 0;
            }
          }
        }
        return (config.calc_mode === "ratio_of_sums")
          ? (den === 0 ? null : (num / den))
          : num;
      }

      // Compute compare windows
      let currStart = start, currEnd = end;
      let prevStart, prevEnd;

      const sameSpanBack = () => {
        if (grain === "week") {
          prevEnd   = addDays(currStart, -1);
          prevStart = addDays(prevEnd, -7*unitsInWindow + 1);
        } else if (grain === "month") {
          // move back "unitsInWindow" months
          prevEnd = new Date(currStart.getFullYear(), currStart.getMonth(), 0); // day before start-of-month
          const sMonth = new Date(currStart.getFullYear(), currStart.getMonth() - (unitsInWindow - 1), 1);
          prevStart = new Date(sMonth.getFullYear(), sMonth.getMonth(), 1);
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
        // If the current window appears to start on first-of-month, treat as MTD.
        const looksMTD = (currStart.getDate() === 1);
        if (!looksMTD) sameSpanBack(); // fallback to prev period
        else {
          const dayCount = (grain === "day")
            ? (Math.floor((currEnd - currStart)/DAY) + 1)
            : unitsInWindow * (grain === "week" ? 7 : 30); // fallback approx
          const prevMonthStart = new Date(currStart.getFullYear(), currStart.getMonth()-1, 1);
          prevStart = prevMonthStart;
          prevEnd = addDays(prevMonthStart, dayCount - 1);
          // cap at end of previous month
          const prevMonthEnd = new Date(currStart.getFullYear(), currStart.getMonth(), 0);
          if (prevEnd > prevMonthEnd) prevEnd = prevMonthEnd;
        }
      };

      switch (config.compare_mode) {
        case "prev_year":    priorYearSameSpan(); break;
        case "mtd_daymatch": mtdDayMatched();     break;
        default:             sameSpanBack();      break;
      }

      const currVal = sumRange(currStart, currEnd);
      const prevVal = sumRange(prevStart, prevEnd);

      // Δ and colors
      const delta = (prevVal === null || prevVal === 0 || currVal === null)
        ? null
        : ((currVal - prevVal) / prevVal);

      const arrow = (delta == null) ? "" : (delta > 0 ? "▲" : (delta < 0 ? "▼" : "•"));
      const isGood = delta > 0 ? !config.positive_is_bad : config.positive_is_bad;
      const color  = (delta == null) ? (config.neutral_color || "#64748B")
                    : (isGood ? (config.good_color || "#1a7f37")
                              : (config.bad_color  || "#d33"));

      // Value formatting
      const nf = (val, asPercent) => {
        if (val == null) return "n/a";
        const d = Number.isFinite(config.decimals) ? Math.max(0, config.decimals) : 1;

        if (asPercent || config.format_mode === "percent") {
          return (val * 100).toFixed(d) + "%";
        }

        const compact = !!config.compact;
        if (config.format_mode === "currency") {
          const sym = (config.currency_symbol || "$");
          return sym + formatNumber(val, d, compact);
        }

        // plain number
        return formatNumber(val, d, compact);
      };

      function formatNumber(val, d, compact) {
        const abs = Math.abs(val);
        const sign = val < 0 ? "-" : "";
        const fmt = (n) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if (!compact) return sign + fmt(abs);

        if (abs >= 1e9)  return sign + (abs/1e9).toFixed(d) + "B";
        if (abs >= 1e6)  return sign + (abs/1e6).toFixed(d) + "M";
        if (abs >= 1e3)  return sign + (abs/1e3).toFixed(d) + "K";
        return sign + fmt(abs);
      }

      // Title pieces
      const label = (config.metric_label || m0.label || m0.label_short || m0.name);
      const big   = (config.format_mode === "percent")
        ? nf(currVal, true)  // show as percent directly (e.g., CTR)
        : nf(currVal, false) + (config.suffix || "");

      // Render
      const bigEl = el.querySelector("#svd-big");
      const subEl = el.querySelector("#svd-sub");
      bigEl.style.fontSize = (config.big_size_px || 64) + "px";
      subEl.style.fontSize = (config.sub_size_px || 14) + "px";

      bigEl.textContent = big;

      const compareLabel =
        (config.compare_mode === "prev_year")   ? "vs previous year
