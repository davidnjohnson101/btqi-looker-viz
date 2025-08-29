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
      values: (queryResponse) =>
        queryResponse.fields.measure_like.concat(queryResponse.fields.dimension_like)
          .reduce((o,f)=> (o[f.name]=f.label || f.name, o), {}),
      default: ""
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .btqi-card{position:relative; border-radius:12px; padding:20px; text-align:center; color:#1f2937; }
        .btqi-value{font-size:48px; line-height:1; font-weight:600; margin-bottom:6px;}
        .btqi-band{display:inline-flex; align-items:center; gap:8px; font-size:16px;}
        .dot{width:10px; height:10px; border-radius:50%;}
        /* tooltip */
        .info{position:absolute; top:12px; right:12px; cursor:default;}
        .info .bubble{display:none; position:absolute; right:0; top:24px; width:280px; background:#111827; color:#fff;
                      border-radius:8px; padding:10px 12px; box-shadow:0 8px 24px rgba(0,0,0,.2); z-index:5;}
        .info:hover .bubble{display:block;}
        .info .i{width:18px; height:18px; border-radius:50%; background:#e5e7eb; color:#111827; 
                 display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;}
      </style>
      <div class="btqi-card">
        <div class="info">
          <div class="i">i</div>
          <div class="bubble" id="btqi-tip"></div>
        </div>
        <div class="btqi-value" id="btqi-value">–</div>
        <div class="btqi-band">
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

      const cell = data[0]?.[fieldName];
      const score = typeof cell?.value === "number" ? cell.value : parseFloat(cell?.value);
      const v = isFinite(score) ? score : null;

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

      // apply UI
      const card   = element.querySelector(".btqi-card");
      const value  = element.querySelector("#btqi-value");
      const dot    = element.querySelector("#btqi-dot");
      const label  = element.querySelector("#btqi-label");
      const tip    = element.querySelector("#btqi-tip");

      value.textContent = (v==null ? "–" : v.toFixed(1));
      dot.style.background = b.color;
      label.textContent = `${b.name} Traffic Quality`;
      tip.innerHTML = `<b>BTQI (0–10)</b><br>Calculated from: Leads per Session × (Engagement ÷ Bounce).<br><br>
                       <b>Band:</b> ${b.name}<br>${b.desc}`;

      // optional background tint to match band
      card.style.background = b.color + "1A"; // 10% alpha via hex (1A)
      done();
    } catch (e) {
      console.error(e);
      done();
    }
  }
});
