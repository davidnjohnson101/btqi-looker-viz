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
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        /* Root card fills the tile, rounded, premium spacing */
        .btqi-card{
          position:relative; width:100%; height:100%;
          box-sizing:border-box;
          border-radius:16px; padding:28px 32px;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          /* background set dynamically */
        }
        .btqi-value{
          font-size: clamp(40px, 8vw, 64px);
          line-height:1; font-weight:800; letter-spacing:.3px;
          margin-bottom:10px;
        }
        .btqi-band{
          display:inline-flex; align-items:center; gap:10px;
          font-size:18px; font-weight:600;
          backdrop-filter: saturate(120%);
        }
        .dot{width:12px; height:12px; border-radius:50%; border:2px solid rgba(0,0,0,.18)}
        /* subtle ambient shadow for “card within a tile” look */
        .btqi-card:after{
          content:""; position:absolute; inset:0;
          box-shadow:0 10px 24px rgba(0,0,0,.10);
          border-radius:16px; pointer-events:none;
        }
        /* tooltip */
        .info{position:absolute; top:12px; right:12px; cursor:default;}
        .info .bubble{
          display:none; position:absolute; right:0; top:26px; width:300px;
          background:#111827; color:#fff; border-radius:10px; padding:12px 14px;
          box-shadow:0 16px 36px rgba(0,0,0,.25); z-index:5; font-size:13px; line-height:1.35;
        }
        .info:hover .bubble{display:block;}
        .info .i{
          width:22px; height:22px; border-radius:50%;
          background:rgba(255,255,255,.85); color:#111827;
          display:flex; align-items:center; justify-content:center;
          font-size:12px; font-weight:800;
          box-shadow:0 2px 6px rgba(0,0,0,.15);
        }
      </style>

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

      // utilities for contrast
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

      // apply UI
      const card  = element.querySelector(".btqi-card");
      const value = element.querySelector("#btqi-value");
      const dot   = element.querySelector("#btqi-dot");
      const label = element.querySelector("#btqi-label");
      const tip   = element.querySelector("#btqi-tip");
      const bandRow = element.querySelector("#btqi-band");

      // full-bleed solid background + auto text contrast
      const textColor = getContrastText(b.color);
      card.style.background = b.color;
      card.style.color = textColor;
      // dot outline flips on dark backgrounds for clarity
      dot.style.borderColor = textColor === "#ffffff" ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.18)";

      value.textContent = (v==null ? "–" : v.toFixed(1));
      dot.style.background = textColor === "#ffffff" ? "rgba(255,255,255,.92)" : b.color; // small accent
      label.textContent = `${b.name} Traffic Quality`;

      // ensure the band text inherits contrast color
      bandRow.style.color = textColor;

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
