// Settings page — production version using real API data.

function SettingsPage({ t }) {
  const [section, setSection] = React.useState('general');
  const [config, setConfig] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const load = () => {
    setLoading(true);
    apiFetch('/api/settings')
      .then(cfg => { setConfig(cfg); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  React.useEffect(() => { load(); }, []);

  const saveConfig = (updated) => {
    setSaving(true);
    setSaved(false);
    apiFetch('/api/settings', { method: 'POST', body: JSON.stringify(updated) })
      .then(() => { setConfig(updated); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); })
      .catch(() => setSaving(false));
  };

  const sections = [
    { id: 'general',    label: 'General',           icon: 'settings' },
    { id: 'network',    label: 'Network & Discovery', icon: 'globe' },
    { id: 'display',    label: 'Display',            icon: 'eye' },
    { id: 'thresholds', label: 'Thresholds',         icon: 'thermo' },
    { id: 'backup',     label: 'Backup & Data',      icon: 'download' },
    { id: 'about',      label: 'About',              icon: 'help' },
  ];

  if (loading) return (
    <div style={{padding:60, textAlign:'center', color:t.textMuted}}>
      <Spinner t={t} size={20}/><div style={{marginTop:12}}>Loading settings…</div>
    </div>
  );

  if (error) return (
    <div style={{padding:40, textAlign:'center', color:t.danger, fontSize:13}}>
      Failed to load settings: {error}
      <div style={{marginTop:12}}><button onClick={load} style={{...protoBtn(t)}}>Retry</button></div>
    </div>
  );

  const cfg = config || {};

  return (
    <div style={{display:'grid', gridTemplateColumns:'220px 1fr', gap:24}}>
      <div style={{display:'flex', flexDirection:'column', gap:2}}>
        {sections.map(s => (
          <div key={s.id} onClick={() => setSection(s.id)} style={{
            display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500,
            background: section === s.id ? t.accentGlow : 'transparent',
            color: section === s.id ? t.accent : t.textMuted,
            transition:'all .12s',
          }}>
            {Icons[s.icon]({size:15, color: section === s.id ? t.accent : t.textMuted})}
            {s.label}
          </div>
        ))}
      </div>
      <div>
        {saved && (
          <div style={{marginBottom:12, padding:'10px 16px', background: t.success + '22', border:`1px solid ${t.success}55`, borderRadius:8, fontSize:13, color:t.success, display:'flex', alignItems:'center', gap:8}}>
            <Icons.check size={14}/> Settings saved successfully.
          </div>
        )}
        {section === 'general'    && <SetGeneral    t={t} cfg={cfg} onChange={updated => saveConfig({...cfg, ...updated})} saving={saving}/>}
        {section === 'network'    && <SetNetwork    t={t} cfg={cfg} onChange={updated => saveConfig({...cfg, ...updated})} saving={saving}/>}
        {section === 'display'    && <SetDisplay    t={t} cfg={cfg} onChange={updated => saveConfig({...cfg, ...updated})} saving={saving}/>}
        {section === 'thresholds' && <SetThresholds t={t} cfg={cfg} onChange={updated => saveConfig({...cfg, ...updated})} saving={saving}/>}
        {section === 'backup'     && <SetBackup     t={t} cfg={cfg}/>}
        {section === 'about'      && <SetAbout      t={t} cfg={cfg}/>}
      </div>
    </div>
  );
}

function SectionHeader({ t, title, desc }) {
  return (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:22, fontWeight:700, letterSpacing:'-0.02em'}}>{title}</div>
      <div style={{fontSize:13, color:t.textMuted, marginTop:4}}>{desc}</div>
    </div>
  );
}

function SetGeneral({ t, cfg, onChange, saving }) {
  const [form, setForm] = React.useState({
    instance_name: cfg.instance_name || cfg.instanceName || 'HashHive',
    language:      cfg.language || 'en',
    timezone:      cfg.timezone || 'UTC',
    poll_interval: cfg.poll_interval ?? cfg.pollInterval ?? 10,
    usage_stats:   cfg.usage_stats ?? cfg.usageStats ?? false,
  });
  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  return (
    <div>
      <SectionHeader t={t} title="General" desc="Basic preferences for your HashHive instance."/>
      <Card t={t}>
        <SettingRow t={t} label="Instance name" desc="Shown in browser tab and notifications.">
          <Input t={t} value={form.instance_name} onChange={v => set('instance_name', v)} style={{minWidth:240}}/>
        </SettingRow>
        <SettingRow t={t} label="Language" desc="Interface language.">
          <Select t={t} value={form.language} onChange={v => set('language', v)}
            options={[['en','English'],['de','Deutsch'],['es','Español'],['fr','Français']]}/>
        </SettingRow>
        <SettingRow t={t} label="Timezone" desc="All timestamps displayed in this zone.">
          <Select t={t} value={form.timezone} onChange={v => set('timezone', v)}
            options={[['UTC','UTC'],['Europe/Berlin','Europe/Berlin'],['America/New_York','America/New_York'],['Asia/Tokyo','Asia/Tokyo']]}/>
        </SettingRow>
        <SettingRow t={t} label="Polling interval" desc="How often devices are queried (seconds).">
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <input type="range" min={5} max={60} step={5} value={form.poll_interval} onChange={e => set('poll_interval', +e.target.value)} style={{accentColor:t.accent, width:180}}/>
            <span style={{fontFamily:PROTO_MONO, fontSize:13, minWidth:60}}>{form.poll_interval}s</span>
          </div>
        </SettingRow>
        <SettingRow t={t} label="Usage statistics" desc="Help improve HashHive with anonymous crash reports." last>
          <Toggle t={t} on={form.usage_stats} onChange={v => set('usage_stats', v)}/>
        </SettingRow>
      </Card>
      <div style={{marginTop:14, display:'flex', justifyContent:'flex-end', gap:8}}>
        <button style={{...protoBtn(t)}} onClick={() => setForm({ instance_name: cfg.instance_name || 'HashHive', language: cfg.language || 'en', timezone: cfg.timezone || 'UTC', poll_interval: cfg.poll_interval ?? 10, usage_stats: cfg.usage_stats ?? false })}>Reset</button>
        <button onClick={() => onChange(form)} disabled={saving} style={{...protoBtn(t, 'primary'), opacity: saving ? 0.55 : 1}}>
          {saving ? <><Spinner t={t}/> Saving…</> : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function SetNetwork({ t, cfg, onChange, saving }) {
  const [ranges, setRanges] = React.useState(cfg.scan_ranges || cfg.scanRanges || ['192.168.1.0/24']);
  const [discovery, setDiscovery] = React.useState(cfg.auto_discovery ?? cfg.autoDiscovery ?? true);
  const [timeout, setTimeout_] = React.useState(cfg.http_timeout || cfg.httpTimeout || '5s');

  return (
    <div>
      <SectionHeader t={t} title="Network & Discovery" desc="How HashHive finds miners on your network."/>
      <Card t={t}>
        <SettingRow t={t} label="Auto-discovery" desc="Scan the network for new miners every 5 minutes.">
          <Toggle t={t} on={discovery} onChange={setDiscovery}/>
        </SettingRow>
        <SettingRow t={t} label="Scan ranges" desc="CIDR ranges to scan." last>
          <div style={{display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end'}}>
            {ranges.map((r, i) => (
              <div key={i} style={{display:'flex', gap:6, alignItems:'center'}}>
                <Input t={t} value={r} onChange={v => { const nr = [...ranges]; nr[i] = v; setRanges(nr); }} mono style={{width:180}}/>
                <button onClick={() => setRanges(ranges.filter((_,j) => j !== i))} style={{...protoBtn(t), padding:6}}><Icons.trash size={12}/></button>
              </div>
            ))}
            <button onClick={() => setRanges([...ranges, ''])} style={{...protoBtn(t), fontSize:11}}><Icons.plus size={11}/> Add range</button>
          </div>
        </SettingRow>
      </Card>

      <Card t={t} style={{marginTop:14}}>
        <SettingRow t={t} label="HTTP timeout" desc="Per-device request timeout." last>
          <Input t={t} value={timeout} onChange={setTimeout_} mono style={{width:80}}/>
        </SettingRow>
      </Card>
      <div style={{marginTop:14, display:'flex', justifyContent:'flex-end', gap:8}}>
        <button onClick={() => onChange({ scan_ranges: ranges, auto_discovery: discovery, http_timeout: timeout })} disabled={saving}
          style={{...protoBtn(t, 'primary'), opacity: saving ? 0.55 : 1}}>
          {saving ? <><Spinner t={t}/> Saving…</> : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function SetDisplay({ t, cfg, onChange, saving }) {
  const [form, setForm] = React.useState({
    hashrate_unit: cfg.hashrate_unit || cfg.hashrateUnit || 'GH/s',
    temp_unit:     cfg.temp_unit     || cfg.tempUnit     || '°C',
    currency:      cfg.currency      || 'EUR',
    power_price:   cfg.power_price   ?? cfg.powerPrice   ?? 0.32,
  });
  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  return (
    <div>
      <SectionHeader t={t} title="Display" desc="Customize how data is shown."/>
      <Card t={t}>
        <SettingRow t={t} label="Hashrate unit" desc="Preferred unit for display.">
          <Segmented t={t} value={form.hashrate_unit} onChange={v => set('hashrate_unit', v)} options={['MH/s','GH/s','TH/s']}/>
        </SettingRow>
        <SettingRow t={t} label="Temperature unit" desc="">
          <Segmented t={t} value={form.temp_unit} onChange={v => set('temp_unit', v)} options={['°C','°F']}/>
        </SettingRow>
        <SettingRow t={t} label="Currency" desc="For earnings calculations.">
          <Select t={t} value={form.currency} onChange={v => set('currency', v)} options={[['EUR','EUR (€)'],['USD','USD ($)'],['GBP','GBP (£)']]}/>
        </SettingRow>
        <SettingRow t={t} label="Power price" desc="Used to compute power cost." last>
          <div style={{display:'flex', gap:4, alignItems:'center'}}>
            <Input t={t} value={String(form.power_price)} onChange={v => set('power_price', parseFloat(v) || 0)} mono style={{width:70}}/>
            <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{form.currency === 'USD' ? '$/kWh' : form.currency === 'GBP' ? '£/kWh' : '€/kWh'}</span>
          </div>
        </SettingRow>
      </Card>
      <div style={{marginTop:14, display:'flex', justifyContent:'flex-end'}}>
        <button onClick={() => onChange(form)} disabled={saving} style={{...protoBtn(t, 'primary'), opacity: saving ? 0.55 : 1}}>
          {saving ? <><Spinner t={t}/> Saving…</> : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function SetThresholds({ t, cfg, onChange, saving }) {
  const defaults = cfg.thresholds || {};
  const [form, setForm] = React.useState({
    temp_warn:    defaults.temp_warn    ?? 68,
    temp_crit:    defaults.temp_crit    ?? 75,
    hr_drop_warn: defaults.hr_drop_warn ?? 10,
    hr_drop_crit: defaults.hr_drop_crit ?? 25,
    offline_secs: defaults.offline_secs ?? 120,
  });
  const set = (k, v) => setForm(f => ({...f, [k]: v}));

  return (
    <div>
      <SectionHeader t={t} title="Thresholds" desc="Default alert thresholds. Override per-device or per-rule in Alerts."/>
      <Card t={t}>
        <ThresholdRow t={t} label="Chip temp warning"      val={form.temp_warn}    unit="°C" color={t.warning} onChange={v => set('temp_warn', v)}/>
        <ThresholdRow t={t} label="Chip temp critical"     val={form.temp_crit}    unit="°C" color={t.danger}  onChange={v => set('temp_crit', v)}/>
        <ThresholdRow t={t} label="Hashrate drop warning"  val={form.hr_drop_warn} unit="%"  color={t.warning} onChange={v => set('hr_drop_warn', v)}/>
        <ThresholdRow t={t} label="Hashrate drop critical" val={form.hr_drop_crit} unit="%"  color={t.danger}  onChange={v => set('hr_drop_crit', v)}/>
        <ThresholdRow t={t} label="Offline threshold"      val={form.offline_secs} unit="s"  color={t.danger}  onChange={v => set('offline_secs', v)} last/>
      </Card>
      <div style={{marginTop:14, display:'flex', justifyContent:'flex-end'}}>
        <button onClick={() => onChange({ thresholds: form })} disabled={saving} style={{...protoBtn(t, 'primary'), opacity: saving ? 0.55 : 1}}>
          {saving ? <><Spinner t={t}/> Saving…</> : 'Save thresholds'}
        </button>
      </div>
    </div>
  );
}

function ThresholdRow({ t, label, val, unit, color, onChange, last }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 240px 80px', gap:14, alignItems:'center', padding:'14px 0', borderBottom: last ? 'none' : `1px solid ${t.border}`}}>
      <div style={{fontSize:13}}>{label}</div>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <div style={{flex:1, height:4, background:t.border, borderRadius:2, position:'relative'}}>
          <div style={{position:'absolute', left:0, top:0, height:'100%', width:`${Math.min(100, val)}%`, background:color, borderRadius:2}}/>
        </div>
      </div>
      <div style={{display:'flex', gap:4, alignItems:'center', justifyContent:'flex-end'}}>
        <Input t={t} value={String(val)} onChange={v => onChange && onChange(parseInt(v) || 0)} mono style={{width:50, textAlign:'right'}}/>
        <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{unit}</span>
      </div>
    </div>
  );
}

function SetBackup({ t, cfg }) {
  return (
    <div>
      <SectionHeader t={t} title="Backup & Data" desc="Export your configuration and historical data."/>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Card t={t}>
          <Label t={t}>Configuration</Label>
          <div style={{fontSize:13, color:t.textMuted, marginTop:6, marginBottom:12}}>
            Export devices, pools, alert rules and preferences as a portable JSON file.
          </div>
          <div style={{display:'flex', gap:6}}>
            <a href="/api/settings/export" download="hashhive-config.json" style={{...protoBtn(t, 'primary'), textDecoration:'none', display:'flex', alignItems:'center', gap:4}}>
              <Icons.download size={13}/> Export JSON
            </a>
            <button style={{...protoBtn(t)}}><Icons.upload size={13}/> Import</button>
          </div>
        </Card>
        <Card t={t}>
          <Label t={t}>Historical data</Label>
          <div style={{fontSize:13, color:t.textMuted, marginTop:6, marginBottom:12}}>
            Hashrate, shares, and temperature samples at 30s resolution.
          </div>
          <div style={{display:'flex', gap:6}}>
            <a href="/api/earnings/export?format=csv" download="hashhive-earnings.csv" style={{...protoBtn(t), textDecoration:'none', display:'flex', alignItems:'center', gap:4}}>
              <Icons.download size={13}/> Export CSV
            </a>
          </div>
        </Card>
      </div>
      <Card t={t} style={{marginTop:14}}>
        <SettingRow t={t} label="Retention window" desc="Samples older than this are dropped.">
          <Select t={t} value={cfg.retention || '14d'} onChange={()=>{}} options={[['7d','7 days'],['14d','14 days'],['30d','30 days'],['90d','90 days']]}/>
        </SettingRow>
        <SettingRow t={t} label="Auto-backup" desc="Daily config export to ~/.hashhive/backups." last>
          <Toggle t={t} on={cfg.auto_backup ?? false} onChange={()=>{}}/>
        </SettingRow>
      </Card>
    </div>
  );
}

function SetAbout({ t, cfg }) {
  const version = cfg.version || cfg.app_version || '—';
  const backend = cfg.backend || '—';
  const uptime  = cfg.uptime  || '—';

  return (
    <div>
      <SectionHeader t={t} title="About" desc=""/>
      <Card t={t}>
        <div style={{display:'flex', gap:16, alignItems:'center', paddingBottom:16, borderBottom:`1px solid ${t.border}`}}>
          <HiveMark size={52} primary={t.accent} secondary={t.honey}/>
          <div>
            <div style={{fontSize:22, fontWeight:700}}>HashHive</div>
            <div style={{fontSize:13, color:t.textMuted, marginTop:4}}>Unified mining dashboard · {version !== '—' ? `v${version}` : ''}</div>
          </div>
          <div style={{flex:1}}/>
          <button style={{...protoBtn(t, 'primary')}}><Icons.download size={13}/> Check for updates</button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:24, marginTop:18}}>
          <KV t={t} k="Version" v={version} mono/>
          <KV t={t} k="Backend" v={backend} mono/>
          <KV t={t} k="Uptime" v={uptime} mono/>
          {cfg.device_count != null && <KV t={t} k="Devices" v={`${cfg.device_count} managed`} mono/>}
          {cfg.db_size && <KV t={t} k="DB size" v={cfg.db_size} mono/>}
          <KV t={t} k="License" v="MIT" mono/>
        </div>
      </Card>
      <Card t={t} style={{marginTop:14}}>
        <div style={{display:'flex', gap:14}}>
          <a href="https://github.com/hashhive" target="_blank" rel="noopener" style={{...protoBtn(t), textDecoration:'none', display:'flex', alignItems:'center', gap:4}}><Icons.link size={13}/> GitHub</a>
          <button style={{...protoBtn(t)}}><Icons.help size={13}/> Documentation</button>
          <button style={{...protoBtn(t)}}><Icons.alert size={13}/> Report an issue</button>
        </div>
      </Card>
    </div>
  );
}

function SettingRow({ t, label, desc, children, last }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:18, alignItems:'center', padding:'16px 0', borderBottom: last ? 'none' : `1px solid ${t.border}`}}>
      <div>
        <div style={{fontSize:13, fontWeight:500}}>{label}</div>
        {desc && <div style={{fontSize:12, color:t.textMuted, marginTop:3}}>{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

window.SettingsPage = SettingsPage;
