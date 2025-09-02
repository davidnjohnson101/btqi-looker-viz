// btqi_kpi.js  — Full-bleed KPI with robust options + improved tooltip (left, wide, smart flip)
looker.plugins.visualizations.add({
  id: "btqi_kpi",
  label: "BTQI KPI",
  options: {
    // DATA
    value_field: {
      section: "Data",
      label: "BTQI Field",
      type: "string",
      display: "select",
      values: (qr) =>
        qr.fields.measure_like.concat(qr.fields.dimension_like)
          .reduce((o,f)=> (o[f.name]=f.label || f.name, o), {}),
      default: ""
    },
    multirow_mode: {
      section: "Data",
      label: "If multiple rows",
      type: "string",
      display: "select",
      values: [{ "Use first row": "first" }, { "Average the field": "avg" }],
      default: "first"
    },

    // APPEARANCE
    align: {
      section: "Appearance",
      label: "Alignment",
      type: "string",
      display: "select",
      values: [{ "Center": "center" }, { "Left": "left" }],
      default: "center"
    },
    value_size: {
      section: "Appearance",
      label: "Value Size",
      type: "string",
      display: "select",
      values: [{ "S": "s" }, { "M": "m" }, { "L": "l" }],
      default: "m"
    },
    show_header: {
      section: "Appearance",
      label: "Show Internal Title",
      type: "boolean",
      default: false
    },
    header_text: {
      section: "Appearance",
      label: "Internal Title Text",
      type: "string",
      default: "Traffic Quality Score"
    },
    fill_mode: {
      section: "Appearance",
      label: "Background Fill",
      type: "string",
      display: "select",
      values: [{ "Solid band color": "solid" }, { "Subtle tint": "tint" }],
      default: "solid"
    },
    corner_radius: {
      section: "Appearance",
      label: "Corner Radius (px)",
      type: "number",
      default: 12
    },
    show_band_text: {
      section: "Appearance",
      label: "Show Band Text",
      type: "boolean",
      default: true
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .btqi-root { position:absolute; inset:0; width:100%; height:100%; }

        .btqi-header{
          font-weight:700; font-family: "Google Sans", "Noto Sans", "Noto Sans JP", "Noto Sans CJK KR", "Noto Sans Arabic UI", "Noto Sans Devanagari UI", "Noto Sans Hebrew", "Noto Sans Thai UI", Helvetica, Arial, sans-serif; letter-spacing:.2px; text-align:center;
          margin: 4px 0 8px 0; opacity:.9;
        }

        /* Full-bleed card */
        .btqi-card{
          position:absolute; inset:0;
          width:100%; height:100%;
          box-sizing:border-box;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
        }
        .btqi-inner{
          width:100%;
          display:flex; flex-direction:column; align-items:center; gap:10px;
        }
        .btqi-inner.left { align-items:flex-start; padding-left:24px; }

        .value{ line-height:1; font-weight:800; letter-spacing:.3px; margin:0; }
        .value.s { font-size: clamp(36px, 6vw, 48px); }
        .value.m { font-size: clamp(44px, 7.5vw, 64px); }
        .value.l { font-size: clamp(52px, 9vw, 80px); }

        .band{
          display:inline-flex; align-items:center; gap:10px;
          font-size:18px; font-weight:700;
        }

        /* glossy dot */
        .dot{
          width:14px; height:14px; border-radius:50%;
          box-shadow: inset 0 2px 3px rgba(0,0,0,.15), 0 0 0 2px rgba(0,0,0,.12);
          background: radial-gradient(100% 100% at 35% 30%, rgba(255,255,255,.9), rgba(255,255,255,.1) 45%), #999;
        }

        /* === Tooltip (moved left, wider, on top, internal scroll if needed) === */
        .info{ position:absolute; top:10px; left:10px; z-index:9999; }
        .info .i{
          width:22px; height:22px; border-radius:50%;
          background:rgba(255,255,255,.9); color:#111827;
          display:flex; align-items:center; justify-content:center;
          font-size:12px; font-weight:800;
          box-shadow:0 2px 6px rgba(0,0,0,.15); cursor:default;
        }
        .bubble{
          display:none; position:absolute; left:0; top:18px;
          width:420px; max-width:calc(100vw - 64px);
          background:#111827; color:#fff; border-radius:10px; padding:12px 14px;
          box-shadow:0 16px 36px rgba(0,0,0,.25); font-size:13px; line-height:1.35;
        }
        .info.open .bubble { display:block; }
      </style>

      <div class="btqi-root">
        <div class="btqi-header" id="btqi-header" style="display:none;"></div>
        <div class="btqi-card" id="btqi-card" aria-label="Traffic Quality Score card">
          <div class="info" id="btqi-info" aria-hidden="true">
            <div class="i">i</div>
            <div class="bubble" id="btqi-tip"></div>
          </div>
          <div class="btqi-inner" id="btqi-inner">
            <h1 class="value m" id="btqi-value">–</h1>
            <div class="band" id="btqi-band" style="display:none;">
              <div class="dot" id="btqi-dot"></div>
              <div id="btqi-label">–</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Tooltip toggle (click/tap)
    const info = element.querySelector("#btqi-info");
    info.addEventListener("click", (e) => {
      e.stopPropagation();
      info.classList.toggle("open");
    });
    document.addEventListener("click", () => info.classList.remove("open"));

    // Smart placement: flip to the right side if not enough room on the left
    const placeTooltip = () => {
      try {
        const cardRect = element.querySelector("#btqi-card").getBoundingClientRect();
        const infoRect = info.getBoundingClientRect();
        const bubble   = element.querySelector("#btqi-tip");

        // default left
        info.style.left = "10px";  info.style.right = "auto";
        bubble.style.left = "0";   bubble.style.right = "auto";

        const spaceRight = cardRect.right - infoRect.left;
        if (spaceRight < 460) { // need ~420px bubble + padding
          info.style.left = "auto";  info.style.right = "10px";
          bubble.style.left = "auto"; bubble.style.right = "0";
        }
      } catch(_) {}
    };
    // expose for update phase
    element._btqi_placeTooltip = placeTooltip;
    window.addEventListener("resize", placeTooltip);
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    try {
      const fieldName = config.value_field || (queryResponse.fields.measure_like[0]?.name);
      if (!fieldName) throw new Error("Select a BTQI field in the visualization options.");

      const getScore = () => {
        if (!data || data.length === 0) return null;
        if (config.multirow_mode === "avg" && data.length > 1) {
          const vals = data.map(r => {
            const cell = r?.[fieldName];
            const n = typeof cell?.value === "number" ? cell.value : parseFloat(cell?.value);
            return isFinite(n) ? n : null;
          }).filter(v => v !== null);
          if (!vals.length) return null;
          return vals.reduce((a,b)=>a+b,0) / vals.length;
        } else {
          const cell = data[0]?.[fieldName];
          const n = typeof cell?.value === "number" ? cell.value : parseFloat(cell?.value);
          return isFinite(n) ? n : null;
        }
      };
      const v = getScore();

      const band = (s) => {
        if (s == null) return {name:"N/A", color:"#9ca3af", desc:"No data."};
        if (s < 3)        return {name:"Poor",      color:"#e74c3c", desc:"Weak traffic: low engagement and almost no conversions."};
        if (s < 5)        return {name:"Low",       color:"#e67e22", desc:"Limited traffic: some activity but few leads generated."};
        if (s < 7)        return {name:"Moderate",  color:"#f1c40f", desc:"Stable traffic: average engagement and consistent leads."};
        if (s < 8.5)      return {name:"Good",      color:"#2ecc71", desc:"Strong traffic: high engagement and reliable lead flow."};
        return                 {name:"Excellent", color:"#27ae60", desc:"Top-tier traffic: exceptional engagement and conversions."};
      };
      const b = band(v);

      // helpers
      const hexToRgb = (hex) => { const h=hex.replace('#',''); const i=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16); return {r:(i>>16)&255,g:(i>>8)&255,b:i&255}; };
      const luminance = ({r,g,b}) => { const a=[r,g,b].map(v=>{ v/=255; return v<=.03928? v/12.92 : Math.pow((v+.055)/1.055,2.4)}); return .2126*a[0]+.7152*a[1]+.0722*a[2]; };
      const contrastText = (hex) => luminance(hexToRgb(hex)) > .6 ? "#111827" : "#ffffff";
      const mix = (hex, pct=.85)=>{ const {r,g,b}=hexToRgb(hex); const m=c=>Math.round(c+(255-c)*pct); const toH=n=>n.toString(16).padStart(2,"0"); return `#${toH(m(r))}${toH(m(g))}${toH(m(b))}`; };

      // elements
      const header   = element.querySelector("#btqi-header");
      const inner    = element.querySelector("#btqi-inner");
      const card     = element.querySelector("#btqi-card");
      const valueEl  = element.querySelector("#btqi-value");
      const dot      = element.querySelector("#btqi-dot");
      const bandRow  = element.querySelector("#btqi-band");
      const labelEl  = element.querySelector("#btqi-label");
      const tip      = element.querySelector("#btqi-tip");

      header.style.display = config.show_header ? "block" : "none";
      header.textContent   = config.header_text || "Traffic Quality Score";

      inner.classList.toggle("left", config.align === "left");
      valueEl.classList.remove("s","m","l");
      valueEl.classList.add(config.value_size || "m");

      const bg = (config.fill_mode === "tint") ? mix(b.color, 0.88) : b.color;
      const textColor = contrastText(bg);
      card.style.background   = bg;
      card.style.borderRadius = (config.corner_radius ?? 12) + "px";
      card.style.color        = textColor;

      if (config.show_band_text !== false) {
        bandRow.style.display = "inline-flex";
        labelEl.textContent   = `${b.name} Traffic Quality`;
        dot.style.background  = `radial-gradient(100% 100% at 35% 30%, rgba(255,255,255,.9), rgba(255,255,255,.15) 45%), ${b.color}`;
        dot.style.boxShadow   = textColor === "#ffffff"
          ? "inset 0 2px 3px rgba(0,0,0,.15), 0 0 0 2px rgba(255,255,255,.35)"
          : "inset 0 2px 3px rgba(0,0,0,.15), 0 0 0 2px rgba(0,0,0,.15)";
      } else {
        bandRow.style.display = "none";
      }

      valueEl.textContent = (v==null ? "–" : v.toFixed(1));

      tip.innerHTML = `<b>BTQI (0–10)</b><br/>
        Calculated from <i>Leads per Session × (Engagement ÷ Bounce).</i><br/><br/>
        <b>Band:</b> ${b.name}<br/>${b.desc}`;

      // place/flip tooltip after render
      if (typeof element._btqi_placeTooltip === "function") {
        element._btqi_placeTooltip();
      }

      done();
    } catch (e) {
      console.error(e);
      done();
    }
  }
});
