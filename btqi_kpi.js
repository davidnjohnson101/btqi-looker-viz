// btqi_kpi.js
looker.plugins.visualizations.add({
  id: "btqi_kpi",
  label: "BTQI KPI with Tooltip",
  options: {
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
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .btqi-wrap { width:100%; height:100%; }
        .btqi-header{
          font-weight:700; letter-spacing:.2px; text-align:center;
          margin: 6px 0 12px 0; opacity:.9;
        }
        .btqi-card {
  position: absolute; 
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%; height: 100%;
  box-sizing: border-box;
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  justify-content: center;

  /* Remove padding and rounded corners so it fills tile */
  border-radius: 0; 
  padding: 0;
}
        .btqi-value{
          font-size: clamp(40px, 8vw, 64px);
          line-height:1; font-weight:800; letter-spacing:.3px;
          margin-bottom:10px;
        }
        .btqi-band{ display:inline-flex; align-items:center; gap:10px; font-size:18px; font-weight:600; }
        .dot{ width:12px; height:12px; border-radius:50%; border:2px solid rgba(0,0,0,.18) }
        .info{ position:absolute; top:12px; right:12px; cursor:default; }
        .info .bubble{
          display:none; position:absolute; right:0; top:26px; width:300px;
          background:#111827; color:#fff; border-radius:10px; padding:12px 14px;
          box-shadow:0 16px 36px rgba(0,0,0,.25); z-index:5; font-size:13px; line-height:1.35;
        }
        .info:hover .bubble{ display:block; }
        .info .i{
          width:22px; height:22px; border-radius:50%;
          background:rgba(255,255,255,.85); color:#111827;
          display:flex; align-items:center; justify-content:center;
          font-size:12px; font-weight:800;
          box-shadow:0 2px 6px rgba(0,0,0,.15);
        }
      </style>

      <div class="btqi-wrap">
        <div class="btqi-header" id="btqi-header" style="display:none;"></div>
        <div class="btqi-card" aria-label="Traffic Quality Score card">
          <div class="info" aria-hidden="true">
            <div class="i">i</div>
            <div class="bubble" id="btqi-tip"></div>
          </div>
          <div class="btqi-value" id="btqi-value">–</div>
          <div class="btqi-band" id="btqi-band">
            <div class="dot" id="btqi-dot"></div>
            <div id="btqi-label">–</div>
          </div>
        </div>
      </div>
    `;
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    try {
      const fieldName = config.value_field || (queryResponse.fields.measure_like[0]?.name);
      if (!fieldName) throw new Error("Select a BTQI field in the visualization options.");

      const cell  = data[0]?.[fieldName];
      const score = typeof cell?.value === "number" ? cell.value : parseFloat(cell?.value);
      const v     = isFinite(score) ? score : null;

      // band mapping
      const band = (s) => {
        if (s == null) return {name:"N/A", color:"#9ca3af", desc:"No data."};
        if (s < 3)        return {name:"Poor",      color:"#e74c3c", desc:"Weak traffic: low engagement and almost no conversions."};
        if (s < 5)        return {name:"Low",       color:"#e67e22", desc:"Limited traffic: some activity but few leads generated."};
        if (s < 7)        return {name:"Moderate",  color:"#f1c40f", desc:"Stable traffic: average engagement and consistent leads."};
        if (s < 8.5)      return {name:"Good",      color:"#2ecc71", desc:"Strong traffic: high engagement and reliable lead flow."};
        return                 {name:"Excellent", color:"#27ae60", desc:"Top-tier traffic: exceptional engagement and conversions."};
      };
      const b = band(v);

      // utils
      const hexToRgb = (hex) => {
        const h = hex.replace('#','');
        const int = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
        return { r:(int>>16)&255, g:(int>>8)&255, b:int&255 };
      };
      const luminance = ({r,g,b}) => {
        const a=[r,g,b].map(v=>{ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
        return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
      };
      const getContrastText = (hex) => luminance(hexToRgb(hex)) > 0.6 ? "#111827" : "#ffffff";
      const mix = (hex, pct=0.85) => { // lighten toward white
        const {r,g,b}=hexToRgb(hex);
        const m=(c)=>Math.round(c+(255-c)*pct);
        const toHex=(n)=>n.toString(16).padStart(2,"0");
        return `#${toHex(m(r))}${toHex(m(g))}${toHex(m(b))}`;
      };

      // elements
      const wrap  = element.querySelector(".btqi-wrap");
      const header= element.querySelector("#btqi-header");
      const card  = element.querySelector(".btqi-card");
      const value = element.querySelector("#btqi-value");
      const dot   = element.querySelector("#btqi-dot");
      const label = element.querySelector("#btqi-label");
      const tip   = element.querySelector("#btqi-tip");
      const bandRow = element.querySelector("#btqi-band");

      // header toggle
      header.style.display = config.show_header ? "block" : "none";
      header.textContent   = config.header_text || "Traffic Quality Score";

      // fill style
      const mode = (config.fill_mode || "solid");
      const bg   = mode === "solid" ? b.color : mix(b.color, 0.88); // subtle tint option
      const text = getContrastText(bg);

      // apply
      card.style.background = bg;
      card.style.color = text;
      dot.style.borderColor = text === "#ffffff" ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.18)";
      dot.style.background  = text === "#ffffff" ? "rgba(255,255,255,.92)" : b.color;
      bandRow.style.color   = text;

      value.textContent = (v==null ? "–" : v.toFixed(1));
      label.textContent = `${b.name} Traffic Quality`;
      tip.innerHTML = `<b>BTQI (0–10)</b><br/>
        Calculated from <i>Leads per Session × (Engagement ÷ Bounce)</i> and scaled so “Excellent” is rare and meaningful.<br/><br/>
        <b>Band:</b> ${b.name}<br/>${b.desc}`;

      done();
    } catch (e) {
      console.error(e);
      done();
    }
  }
});
