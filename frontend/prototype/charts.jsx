// Chart primitives — SVG-only, no dependencies.

// Interactive area chart with hover + zoom brush.
function AreaChart({ t, data, accent, h = 200, showGrid = true, unit = 'GH/s', brushed = null, onBrush = null }) {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(800);
  const [hover, setHover] = React.useState(null);
  const [brushStart, setBrushStart] = React.useState(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const ww = entries[0].contentRect.width;
      if (ww) setW(ww);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const PAD_L = 48, PAD_R = 12, PAD_T = 14, PAD_B = 26;
  const innerW = Math.max(50, w - PAD_L - PAD_R);
  const innerH = h - PAD_T - PAD_B;

  const min = Math.min(...data), max = Math.max(...data);
  const pad = (max - min) * 0.12 || 1;
  const y0 = min - pad, y1 = max + pad;

  const x = (i) => PAD_L + (i/(data.length-1)) * innerW;
  const y = (v) => PAD_T + innerH - ((v-y0)/(y1-y0)) * innerH;

  const pts = data.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = 'M' + pts.join(' L');
  const area = line + ` L ${x(data.length-1)},${PAD_T + innerH} L ${PAD_L},${PAD_T + innerH} Z`;

  // y ticks (4)
  const yTicks = 4;
  const ticks = Array.from({length: yTicks + 1}, (_, i) => y0 + (y1 - y0) * (i/yTicks));

  const handleMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const rel = (px - PAD_L) / innerW;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1))));
    setHover({idx, x: x(idx), y: y(data[idx]), v: data[idx]});
    if (brushStart != null && onBrush) {
      onBrush({from: Math.min(brushStart, idx), to: Math.max(brushStart, idx)});
    }
  };

  const handleDown = (e) => {
    if (!onBrush) return;
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((px - PAD_L) / innerW * (data.length - 1))));
    setBrushStart(idx);
    onBrush({from: idx, to: idx});
  };
  const handleUp = () => setBrushStart(null);
  const handleLeave = () => { setHover(null); setBrushStart(null); };

  return (
    <div ref={ref} style={{width:'100%', position:'relative', userSelect:'none'}}
         onMouseMove={handleMove} onMouseDown={handleDown} onMouseUp={handleUp} onMouseLeave={handleLeave}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{display:'block'}}>
        <defs>
          <linearGradient id={`ac-${accent.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32"/>
            <stop offset="100%" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Grid */}
        {showGrid && ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={y(v)} x2={w - PAD_R} y2={y(v)} stroke={t.border} strokeDasharray="2 4"/>
            <text x={PAD_L - 8} y={y(v) + 3} fill={t.textMuted} fontSize="10" fontFamily={PROTO_MONO} textAnchor="end">
              {v >= 1000 ? (v/1000).toFixed(1) + 'k' : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* x-axis labels: 4 ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const xi = Math.round(p * (data.length - 1));
          const hoursAgo = Math.round((1 - p) * (data.length - 1) / (data.length - 1) * 24);
          return (
            <text key={i} x={x(xi)} y={h - 8} fill={t.textMuted} fontSize="10" fontFamily={PROTO_MONO} textAnchor="middle">
              {i === 4 ? 'now' : `-${Math.round((1-p) * 24)}h`}
            </text>
          );
        })}

        {/* Brush range */}
        {brushed && brushed.from !== brushed.to && (
          <rect x={x(brushed.from)} y={PAD_T} width={x(brushed.to) - x(brushed.from)} height={innerH}
            fill={accent} fillOpacity="0.12" stroke={accent} strokeWidth="1" strokeDasharray="2 2"/>
        )}

        <path d={area} fill={`url(#ac-${accent.replace('#','')})`}/>
        <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>

        {/* Hover */}
        {hover && (
          <g>
            <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={PAD_T + innerH} stroke={t.textMuted} strokeDasharray="2 3" opacity="0.5"/>
            <circle cx={hover.x} cy={hover.y} r="5" fill={t.bg} stroke={accent} strokeWidth="2"/>
          </g>
        )}
      </svg>

      {hover && (
        <div style={{
          position:'absolute', left: Math.min(hover.x + 12, w - 120), top: hover.y - 10,
          background:t.surface3, border:`1px solid ${t.borderStrong}`, borderRadius:6,
          padding:'6px 10px', fontSize:11, fontFamily:PROTO_MONO, color:t.text,
          pointerEvents:'none', whiteSpace:'nowrap', boxShadow:'0 4px 12px rgba(0,0,0,0.3)',
          zIndex:2,
        }}>
          <div style={{color:accent, fontWeight:600}}>{hover.v.toFixed(1)} {unit}</div>
          <div style={{color:t.textMuted, fontSize:10, marginTop:2}}>{Math.round((1 - hover.idx/(data.length-1)) * 24)}h ago</div>
        </div>
      )}
    </div>
  );
}

// Sparkline with optional target line
function MiniChart({ t, data, color, h = 40, target = null }) {
  const w = 160;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v,i) => `${((i/(data.length-1))*w).toFixed(1)},${(h - 4 - ((v-min)/r) * (h - 8)).toFixed(1)}`);
  const line = 'M' + pts.join(' L');
  const area = line + ` L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{display:'block'}}>
      <path d={area} fill={color} opacity="0.14"/>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      {target != null && (
        <line x1="0" x2={w} y1={h - 4 - ((target - min)/r) * (h - 8)} y2={h - 4 - ((target - min)/r) * (h - 8)}
          stroke={t.textMuted} strokeDasharray="3 3" strokeWidth="1"/>
      )}
    </svg>
  );
}

// Horizontal stacked bar (share distribution)
function StackBar({ t, segments, total, h = 22 }) {
  let offset = 0;
  return (
    <div style={{display:'flex', height:h, background:t.surface2, borderRadius:4, overflow:'hidden'}}>
      {segments.map((s,i) => {
        const w = (s.value / total) * 100;
        return <div key={i} title={`${s.label}: ${s.value}`} style={{width:`${w}%`, background:s.color, transition:'width .2s'}}/>;
      })}
    </div>
  );
}

// Heatmap grid
function Heatmap({ t, rows, labels, cells, getColor, cellSize = 14, gap = 2 }) {
  return (
    <div style={{overflow:'auto'}}>
      <div style={{display:'inline-block', minWidth:'100%'}}>
        {rows.map((row, ri) => (
          <div key={ri} style={{display:'flex', alignItems:'center', gap:8, marginBottom:gap}}>
            <div style={{width:74, fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO, textAlign:'right', flexShrink:0}}>{row.name}</div>
            <div style={{display:'flex', gap:gap, flex:1}}>
              {row.values.map((v, ci) => (
                <div key={ci} title={`${row.name} @ -${(row.values.length - ci) * 0.5}h: ${v}°C`}
                     style={{width:cellSize, height:cellSize, borderRadius:2, background: getColor(v), flexShrink:0}}/>
              ))}
            </div>
          </div>
        ))}
        {labels && (
          <div style={{display:'flex', gap:gap, marginTop:8, marginLeft:82, fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO}}>
            {labels.map((l, i) => <div key={i} style={{width:cellSize, textAlign:'center', flexShrink:0}}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

// Vertical bar chart (e.g. histogram)
function BarChart({ t, bars, accent, h = 140, highlight = null }) {
  const max = Math.max(...bars.map(b => b.count), 1);
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:4, height:h + 28, paddingBottom:28, position:'relative'}}>
      {bars.map((b, i) => {
        const bh = (b.count / max) * h;
        const isHi = highlight === i;
        return (
          <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', minWidth:0}}>
            <div style={{fontSize:10, fontFamily:PROTO_MONO, color: isHi ? accent : t.textMuted, marginBottom:4, fontWeight: isHi ? 600 : 400}}>{b.count || ''}</div>
            <div style={{width:'100%', height:bh, background: isHi ? accent : t.surface2, borderRadius:'3px 3px 0 0', transition:'all .15s', border: isHi ? `1px solid ${accent}` : `1px solid transparent`}}/>
            <div style={{fontSize:9, color:t.textDim, fontFamily:PROTO_MONO, marginTop:6, transform:'rotate(-25deg)', transformOrigin:'left top', whiteSpace:'nowrap'}}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// Dual-line comparison (earnings vs cost)
function DualLineChart({ t, series, colors, labels, h = 180 }) {
  const all = series.flat();
  const min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.1;
  const y0 = Math.max(0, min - pad), y1 = max + pad;
  const w = 800, PAD_L = 38, PAD_R = 12, PAD_T = 10, PAD_B = 24;
  const innerW = w - PAD_L - PAD_R, innerH = h - PAD_T - PAD_B;
  const n = series[0].length;
  const x = i => PAD_L + (i/(n-1))*innerW;
  const y = v => PAD_T + innerH - ((v-y0)/(y1-y0))*innerH;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{display:'block'}}>
      {[0,0.25,0.5,0.75,1].map((p,i) => (
        <g key={i}>
          <line x1={PAD_L} x2={w-PAD_R} y1={PAD_T + innerH*p} y2={PAD_T + innerH*p} stroke={t.border} strokeDasharray="2 4"/>
          <text x={PAD_L - 6} y={PAD_T + innerH*p + 3} fill={t.textMuted} fontSize="9" fontFamily={PROTO_MONO} textAnchor="end">
            €{(y1 - (y1-y0)*p).toFixed(1)}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        const pts = s.map((v,i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        const line = 'M' + pts.join(' L');
        return (
          <g key={si}>
            <path d={line} fill="none" stroke={colors[si]} strokeWidth="2" strokeLinecap="round"/>
            {s.map((v,i) => <circle key={i} cx={x(i)} cy={y(v)} r="2" fill={colors[si]}/>)}
          </g>
        );
      })}
      {/* Legend */}
      {labels.map((l,i) => (
        <g key={i} transform={`translate(${PAD_L + i * 110}, ${h - 6})`}>
          <rect width="12" height="3" fill={colors[i]} rx="1.5"/>
          <text x="18" y="3" fill={t.text} fontSize="10" fontFamily={PROTO_MONO}>{l}</text>
        </g>
      ))}
    </svg>
  );
}

// Donut chart
function Donut({ t, segments, size = 120, thickness = 14, label, sublabel }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{position:'relative', width:size, height:size}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={t.surface2} strokeWidth={thickness}/>
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circ;
          const el = (
            <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color}
              strokeWidth={thickness} strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-acc} strokeLinecap="butt"/>
          );
          acc += dash;
          return el;
        })}
      </svg>
      <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
        {label && <div style={{fontSize:20, fontWeight:700, fontFamily:PROTO_MONO, letterSpacing:'-0.02em'}}>{label}</div>}
        {sublabel && <div style={{fontSize:10, color:t.textMuted, fontFamily:PROTO_MONO, marginTop:2}}>{sublabel}</div>}
      </div>
    </div>
  );
}

window.AreaChart = AreaChart;
window.MiniChart = MiniChart;
window.StackBar = StackBar;
window.Heatmap = Heatmap;
window.BarChart = BarChart;
window.DualLineChart = DualLineChart;
window.Donut = Donut;
