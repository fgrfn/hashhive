// Theme + reusable primitives for the prototype.

// Personality × mode color palettes.
// Hive = the default purple+honey; Foundry = industrial slate+amber;
// Bloom = soft coral+teal.
const PROTO_PALETTES = {
  hive: {
    dark: {
      bg:'#0f0b18', surface:'#181124', surface2:'#211733', surface3:'#2a1f42',
      border:'rgba(255,255,255,0.07)', borderStrong:'rgba(255,255,255,0.14)',
      text:'#ece7f5', textMuted:'#8b83a3', textDim:'#5d576f',
      accent:'#a855f7', accentDim:'#7c3aed', accentGlow:'rgba(168,85,247,0.14)',
      honey:'#fbbf24', honeyDim:'#d97706',
      success:'#34d399', warning:'#f59e0b', danger:'#f43f5e', info:'#38bdf8',
    },
    light: {
      bg:'#faf8ff', surface:'#ffffff', surface2:'#f3eeff', surface3:'#e9e0ff',
      border:'rgba(20,15,40,0.08)', borderStrong:'rgba(20,15,40,0.15)',
      text:'#191327', textMuted:'#6b6485', textDim:'#a09bb3',
      accent:'#7c3aed', accentDim:'#6d28d9', accentGlow:'rgba(124,58,237,0.10)',
      honey:'#d97706', honeyDim:'#b45309',
      success:'#059669', warning:'#d97706', danger:'#e11d48', info:'#0284c7',
    },
  },
  foundry: {
    dark: {
      bg:'#0a0c10', surface:'#11151c', surface2:'#181e27', surface3:'#222a36',
      border:'rgba(255,255,255,0.06)', borderStrong:'rgba(255,255,255,0.12)',
      text:'#e6ebf2', textMuted:'#7d8797', textDim:'#4d5868',
      accent:'#f59e0b', accentDim:'#d97706', accentGlow:'rgba(245,158,11,0.12)',
      honey:'#38bdf8', honeyDim:'#0284c7',
      success:'#10b981', warning:'#f59e0b', danger:'#ef4444', info:'#38bdf8',
    },
    light: {
      bg:'#f4f6f9', surface:'#ffffff', surface2:'#eceff4', surface3:'#dfe3eb',
      border:'rgba(15,20,30,0.08)', borderStrong:'rgba(15,20,30,0.18)',
      text:'#0f1724', textMuted:'#576170', textDim:'#8a94a3',
      accent:'#c2410c', accentDim:'#9a3412', accentGlow:'rgba(194,65,12,0.09)',
      honey:'#0369a1', honeyDim:'#075985',
      success:'#047857', warning:'#b45309', danger:'#b91c1c', info:'#0369a1',
    },
  },
  bloom: {
    dark: {
      bg:'#1a1117', surface:'#241820', surface2:'#2f2029', surface3:'#3d2a35',
      border:'rgba(255,255,255,0.06)', borderStrong:'rgba(255,255,255,0.13)',
      text:'#fbeee8', textMuted:'#c39eaa', textDim:'#8a6c78',
      accent:'#fb7185', accentDim:'#e11d48', accentGlow:'rgba(251,113,133,0.14)',
      honey:'#5eead4', honeyDim:'#14b8a6',
      success:'#34d399', warning:'#fbbf24', danger:'#fb7185', info:'#5eead4',
    },
    light: {
      bg:'#fff3f2', surface:'#ffffff', surface2:'#ffe4e0', surface3:'#fecdcd',
      border:'rgba(90,30,45,0.08)', borderStrong:'rgba(90,30,45,0.15)',
      text:'#3f1b22', textMuted:'#8a5a64', textDim:'#b88d95',
      accent:'#e11d48', accentDim:'#be123c', accentGlow:'rgba(225,29,72,0.10)',
      honey:'#0d9488', honeyDim:'#0f766e',
      success:'#059669', warning:'#d97706', danger:'#e11d48', info:'#0891b2',
    },
  },
};

// protoTheme(dark, personality = 'hive', density = 'cozy') → theme with spacing scales
const protoTheme = (dark, personality = 'hive', density = 'cozy') => {
  const pal = (PROTO_PALETTES[personality] || PROTO_PALETTES.hive)[dark ? 'dark' : 'light'];
  // Density → a multiplier applied to padding, gaps, row heights.
  const densityScale = density === 'compact' ? 0.78 : density === 'spacious' ? 1.18 : 1;
  // Radius varies by personality: Hive=rounded, Foundry=sharp, Bloom=very rounded
  const radiusScale = personality === 'foundry' ? 0.3 : personality === 'bloom' ? 1.35 : 1;
  return {
    ...pal,
    _personality: personality,
    _density: density,
    _ds: densityScale,
    _rs: radiusScale,
  };
};

const PROTO_FONT = "'Space Grotesk', 'Inter', system-ui, sans-serif";
const PROTO_MONO = "'JetBrains Mono', ui-monospace, monospace";
const PROTO_FONT_FOUNDRY = "'JetBrains Mono', ui-monospace, monospace";
const PROTO_FONT_BLOOM = "'Space Grotesk', 'Inter', system-ui, sans-serif";

// Return the body font to use for a given personality
function protoBodyFont(personality) {
  if (personality === 'foundry') return "'JetBrains Mono', ui-monospace, monospace";
  return PROTO_FONT;
}

// Shared btn helper (v variants: ghost, primary, danger)
function protoBtn(t, v = 'ghost') {
  const base = {
    display:'inline-flex', alignItems:'center', gap:6,
    borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:500,
    fontFamily:'inherit', cursor:'pointer', transition:'all .15s',
    whiteSpace:'nowrap',
  };
  if (v === 'primary') return {...base, background:t.accent, color:'#fff', border:`1px solid ${t.accent}`};
  if (v === 'honey')   return {...base, background:t.honey,  color:'#1a1200', border:`1px solid ${t.honey}`};
  if (v === 'danger')  return {...base, background:'transparent', color:t.danger, border:`1px solid rgba(244,63,94,0.25)`};
  return {...base, background:'transparent', color:t.text, border:`1px solid ${t.border}`};
}

function Pill({ t, sev, children }) {
  const map = {
    critical: {bg: t.danger + '22',  fg: t.danger},
    warning:  {bg: t.warning + '22', fg: t.warning},
    info:     {bg: t.info + '22',    fg: t.info},
    success:  {bg: t.success + '22', fg: t.success},
    muted:    {bg: t.surface2,       fg: t.textMuted},
    accent:   {bg: t.accentGlow,     fg: t.accent},
    honey:    {bg: t.honey + '22',   fg: t.honey},
  };
  const c = map[sev] || map.muted;
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:5,
      fontSize:11, padding:'3px 8px', borderRadius:12,
      background:c.bg, color:c.fg, fontWeight:500, fontFamily:PROTO_MONO,
      letterSpacing:'0.02em'}}>
      {children}
    </span>
  );
}

function StatusPill({ t, status }) {
  const map = {
    online:   {sev:'success', label:'Online'},
    warning:  {sev:'warning', label:'Warning'},
    offline:  {sev:'critical', label:'Offline'},
    paused:   {sev:'muted', label:'Paused'},
  };
  const m = map[status] || map.online;
  const c = {success:t.success, warning:t.warning, critical:t.danger, muted:t.textMuted}[m.sev];
  return (
    <Pill t={t} sev={m.sev}>
      <span style={{width:5, height:5, borderRadius:'50%', background:c}}/>
      {m.label}
    </Pill>
  );
}

function Label({ t, children, style }) {
  return (
    <div style={{fontSize:10, color:t.textMuted, textTransform:'uppercase',
      letterSpacing:'0.1em', fontWeight:600, fontFamily:PROTO_MONO, ...style}}>
      {children}
    </div>
  );
}

function Card({ t, children, style, noPad = false }) {
  return (
    <div data-card style={{background:t.surface, border:`1px solid ${t.border}`, borderRadius:12,
      padding: noPad ? 0 : 18, ...style}}>
      {children}
    </div>
  );
}

// Segmented range selector
function Segmented({ t, options, value, onChange, style }) {
  return (
    <div style={{display:'inline-flex', gap:4, padding:3, background:t.surface2, borderRadius:8, border:`1px solid ${t.border}`, ...style}}>
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const on = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            background: on ? t.accent : 'transparent',
            color: on ? '#fff' : t.textMuted,
            border:'none', borderRadius:6, padding:'4px 10px',
            fontSize:11, fontWeight:500, cursor:'pointer',
            fontFamily:PROTO_MONO, letterSpacing:'0.02em', transition:'all .15s',
          }}>{label}</button>
        );
      })}
    </div>
  );
}

// Toggle switch
function Toggle({ t, on = false, onChange, size = 'md' }) {
  const w = size === 'sm' ? 30 : 36;
  const h = size === 'sm' ? 18 : 20;
  const thumb = h - 4;
  return (
    <div onClick={() => onChange && onChange(!on)} style={{
      width:w, height:h, borderRadius:h/2,
      background: on ? t.accent : t.borderStrong,
      position:'relative', transition:'background .15s',
      cursor:'pointer', flexShrink:0,
    }}>
      <div style={{position:'absolute', top:2, left: on ? w - thumb - 2 : 2,
        width:thumb, height:thumb, borderRadius:'50%', background:'#fff',
        transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
    </div>
  );
}

// Text input
function Input({ t, value, onChange, placeholder, type = 'text', mono = true, style }) {
  return (
    <input type={type} value={value} onChange={e => onChange && onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width:'100%', padding:'9px 12px',
        background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8,
        color:t.text, fontSize:13,
        fontFamily: mono ? PROTO_MONO : 'inherit', outline:'none',
        transition:'border-color .15s',
        ...style,
      }}
      onFocus={e => e.target.style.borderColor = t.accent}
      onBlur={e => e.target.style.borderColor = t.border}
    />
  );
}

// Variant switcher shown at top-right of every page
function VariantBar({ t, variant, onChange }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:8}}>
      <Label t={t}>Variant</Label>
      <Segmented t={t} options={[{value:'v1', label:'A'}, {value:'v2', label:'B'}]} value={variant} onChange={onChange}/>
    </div>
  );
}

window.protoTheme = protoTheme;
window.PROTO_PALETTES = PROTO_PALETTES;
window.protoBodyFont = protoBodyFont;
window.PROTO_FONT = PROTO_FONT;
window.PROTO_MONO = PROTO_MONO;
window.protoBtn = protoBtn;
window.Pill = Pill;
window.StatusPill = StatusPill;
window.Label = Label;
window.Card = Card;
window.Segmented = Segmented;
window.Toggle = Toggle;
window.Input = Input;
// Select dropdown — options: [[value,label], …]
function Select({ t, value, options, onChange, style }) {
  return (
    <select value={value} onChange={e => onChange && onChange(e.target.value)} style={{
      padding:'8px 30px 8px 12px', background:t.surface2, border:`1px solid ${t.border}`, borderRadius:8,
      color:t.text, fontSize:13, fontFamily: PROTO_MONO, outline:'none', cursor:'pointer',
      appearance:'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 4l3 3 3-3' stroke='${encodeURIComponent(t.textMuted)}' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center',
      ...style,
    }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

// Form field — label + input + error
function FormField({ t, label, value, onChange, mono = false, placeholder, error, readOnly }) {
  return (
    <div>
      <Label t={t} style={{marginBottom:6}}>{label}</Label>
      <input value={value} onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder} readOnly={readOnly}
        style={{
          width:'100%', padding:'9px 12px',
          background:t.surface2, border:`1px solid ${error ? t.danger : t.border}`, borderRadius:8,
          color:t.text, fontSize:13,
          fontFamily: mono ? PROTO_MONO : 'inherit', outline:'none',
          transition:'border-color .15s',
          opacity: readOnly ? 0.7 : 1,
        }}
        onFocus={e => !error && (e.target.style.borderColor = t.accent)}
        onBlur={e => !error && (e.target.style.borderColor = t.border)}
      />
      {error && <div style={{fontSize:11, color:t.danger, marginTop:4, fontFamily:PROTO_MONO}}>{error}</div>}
    </div>
  );
}

window.Select = Select;
window.FormField = FormField;
window.VariantBar = VariantBar;
