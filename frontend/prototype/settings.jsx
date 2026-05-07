// Settings page with sub-nav

function SettingsPage({ t }) {
  const [section, setSection] = React.useState('general');
  const sections = [
    { id: 'general', label: 'General', icon: 'settings' },
    { id: 'network', label: 'Network & Discovery', icon: 'globe' },
    { id: 'display', label: 'Display', icon: 'eye' },
    { id: 'thresholds', label: 'Thresholds', icon: 'thermo' },
    { id: 'backup', label: 'Backup & Data', icon: 'download' },
    { id: 'about', label: 'About', icon: 'help' },
  ];
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
        {section === 'general' && <SetGeneral t={t}/>}
        {section === 'network' && <SetNetwork t={t}/>}
        {section === 'display' && <SetDisplay t={t}/>}
        {section === 'thresholds' && <SetThresholds t={t}/>}
        {section === 'backup' && <SetBackup t={t}/>}
        {section === 'about' && <SetAbout t={t}/>}
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

function SetGeneral({ t }) {
  const [lang, setLang] = React.useState('en');
  const [tz, setTz] = React.useState('Europe/Berlin');
  const [poll, setPoll] = React.useState(10);
  return (
    <div>
      <SectionHeader t={t} title="General" desc="Basic preferences for your HashHive instance."/>
      <Card t={t}>
        <SettingRow t={t} label="Instance name" desc="Shown in browser tab and notifications.">
          <Input t={t} value="Rig A · Home" onChange={()=>{}} style={{minWidth:240}}/>
        </SettingRow>
        <SettingRow t={t} label="Language" desc="Interface language.">
          <Select t={t} value={lang} onChange={setLang}
            options={[['en','English'],['de','Deutsch'],['es','Español'],['fr','Français']]}/>
        </SettingRow>
        <SettingRow t={t} label="Timezone" desc="All timestamps displayed in this zone.">
          <Select t={t} value={tz} onChange={setTz}
            options={[['UTC','UTC'],['Europe/Berlin','Europe/Berlin'],['America/New_York','America/New_York'],['Asia/Tokyo','Asia/Tokyo']]}/>
        </SettingRow>
        <SettingRow t={t} label="Polling interval" desc="How often devices are queried.">
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <input type="range" min={5} max={60} step={5} value={poll} onChange={e => setPoll(+e.target.value)} style={{accentColor:t.accent, width:180}}/>
            <span style={{fontFamily:PROTO_MONO, fontSize:13, minWidth:60}}>{poll}s</span>
          </div>
        </SettingRow>
        <SettingRow t={t} label="Usage statistics" desc="Help improve HashHive with anonymous crash reports." last>
          <Toggle t={t} on={false} onChange={()=>{}}/>
        </SettingRow>
      </Card>
      <div style={{marginTop:14, display:'flex', justifyContent:'flex-end', gap:8}}>
        <button style={{...protoBtn(t)}}>Reset</button>
        <button style={{...protoBtn(t, 'primary')}}>Save changes</button>
      </div>
    </div>
  );
}

function SetNetwork({ t }) {
  const [ranges, setRanges] = React.useState(['192.168.1.0/24', '10.0.0.0/24']);
  return (
    <div>
      <SectionHeader t={t} title="Network & Discovery" desc="How HashHive finds miners on your network."/>
      <Card t={t}>
        <SettingRow t={t} label="Auto-discovery" desc="Scan the network for new miners every 5 minutes.">
          <Toggle t={t} on onChange={()=>{}}/>
        </SettingRow>
        <SettingRow t={t} label="Scan ranges" desc="CIDR ranges to scan. Smaller ranges = faster discovery." last>
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
        <SettingRow t={t} label="Last scan" desc="Scans 512 addresses on average.">
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:13, fontFamily:PROTO_MONO, color:t.accent}}>2 min ago · found 2 new</div>
            <button style={{...protoBtn(t), marginTop:6}}><Icons.restart size={12}/> Scan now</button>
          </div>
        </SettingRow>
        <SettingRow t={t} label="HTTP timeout" desc="Per-device request timeout." last>
          <Input t={t} value="5s" onChange={()=>{}} mono style={{width:80}}/>
        </SettingRow>
      </Card>
    </div>
  );
}

function SetDisplay({ t }) {
  return (
    <div>
      <SectionHeader t={t} title="Display" desc="Customize how data is shown."/>
      <Card t={t}>
        <SettingRow t={t} label="Theme" desc="Light or dark interface.">
          <Segmented t={t} value="dark" onChange={()=>{}} options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'auto',label:'Auto'}]}/>
        </SettingRow>
        <SettingRow t={t} label="Hashrate unit" desc="Preferred unit for display.">
          <Segmented t={t} value="GH/s" onChange={()=>{}} options={['MH/s','GH/s','TH/s']}/>
        </SettingRow>
        <SettingRow t={t} label="Temperature unit" desc="">
          <Segmented t={t} value="°C" onChange={()=>{}} options={['°C','°F']}/>
        </SettingRow>
        <SettingRow t={t} label="Currency" desc="For earnings calculations.">
          <Select t={t} value="EUR" onChange={()=>{}} options={[['EUR','EUR (€)'],['USD','USD ($)'],['GBP','GBP (£)']]}/>
        </SettingRow>
        <SettingRow t={t} label="Power price" desc="Used to compute power cost." last>
          <div style={{display:'flex', gap:4, alignItems:'center'}}>
            <Input t={t} value="0.32" onChange={()=>{}} mono style={{width:70}}/>
            <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>€/kWh</span>
          </div>
        </SettingRow>
      </Card>
    </div>
  );
}

function SetThresholds({ t }) {
  return (
    <div>
      <SectionHeader t={t} title="Thresholds" desc="Default alert thresholds. Override per-device or per-rule in Alerts."/>
      <Card t={t}>
        <ThresholdRow t={t} label="Chip temp warning" val={68} unit="°C" color={t.warning}/>
        <ThresholdRow t={t} label="Chip temp critical" val={75} unit="°C" color={t.danger}/>
        <ThresholdRow t={t} label="Hashrate drop warning" val={10} unit="%" color={t.warning}/>
        <ThresholdRow t={t} label="Hashrate drop critical" val={25} unit="%" color={t.danger}/>
        <ThresholdRow t={t} label="Offline threshold" val={120} unit="s" color={t.danger} last/>
      </Card>
    </div>
  );
}

function ThresholdRow({ t, label, val, unit, color, last }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 240px 80px', gap:14, alignItems:'center', padding:'14px 0', borderBottom: last ? 'none' : `1px solid ${t.border}`}}>
      <div style={{fontSize:13}}>{label}</div>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <div style={{flex:1, height:4, background:t.border, borderRadius:2, position:'relative'}}>
          <div style={{position:'absolute', left:0, top:0, height:'100%', width:`${Math.min(100, val)}%`, background:color, borderRadius:2}}/>
        </div>
      </div>
      <div style={{display:'flex', gap:4, alignItems:'center', justifyContent:'flex-end'}}>
        <Input t={t} value={String(val)} onChange={()=>{}} mono style={{width:50, textAlign:'right'}}/>
        <span style={{fontSize:11, color:t.textMuted, fontFamily:PROTO_MONO}}>{unit}</span>
      </div>
    </div>
  );
}

function SetBackup({ t }) {
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
            <button style={{...protoBtn(t, 'primary')}}><Icons.download size={13}/> Export JSON</button>
            <button style={{...protoBtn(t)}}><Icons.upload size={13}/> Import</button>
          </div>
        </Card>
        <Card t={t}>
          <Label t={t}>Historical data</Label>
          <div style={{fontSize:13, color:t.textMuted, marginTop:6, marginBottom:12}}>
            32.4 MB · 14 days · hashrate, shares, temp samples at 30s resolution.
          </div>
          <div style={{display:'flex', gap:6}}>
            <button style={{...protoBtn(t)}}><Icons.download size={13}/> Export CSV</button>
            <button style={{...protoBtn(t, 'danger')}}><Icons.trash size={13}/> Purge old data</button>
          </div>
        </Card>
      </div>
      <Card t={t} style={{marginTop:14}}>
        <SettingRow t={t} label="Retention window" desc="Samples older than this are dropped.">
          <Select t={t} value="14d" onChange={()=>{}} options={[['7d','7 days'],['14d','14 days'],['30d','30 days'],['90d','90 days']]}/>
        </SettingRow>
        <SettingRow t={t} label="Auto-backup" desc="Daily config export to ~/.hashhive/backups." last>
          <Toggle t={t} on onChange={()=>{}}/>
        </SettingRow>
      </Card>
    </div>
  );
}

function SetAbout({ t }) {
  return (
    <div>
      <SectionHeader t={t} title="About" desc=""/>
      <Card t={t}>
        <div style={{display:'flex', gap:16, alignItems:'center', paddingBottom:16, borderBottom:`1px solid ${t.border}`}}>
          <HiveMark size={52} primary={t.accent} secondary={t.honey}/>
          <div>
            <div style={{fontSize:22, fontWeight:700}}>HashHive</div>
            <div style={{fontSize:13, color:t.textMuted, marginTop:4}}>Unified mining dashboard · v1.4.2</div>
          </div>
          <div style={{flex:1}}/>
          <button style={{...protoBtn(t, 'primary')}}><Icons.download size={13}/> Check for updates</button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:24, marginTop:18}}>
          <KV t={t} k="Version" v="1.4.2" mono/>
          <KV t={t} k="Backend" v="FastAPI 0.112 · Python 3.11" mono/>
          <KV t={t} k="Uptime" v="6d 14h 22m" mono/>
          <KV t={t} k="Devices" v="16 managed" mono/>
          <KV t={t} k="DB size" v="32.4 MB" mono/>
          <KV t={t} k="License" v="MIT" mono/>
        </div>
      </Card>
      <Card t={t} style={{marginTop:14}}>
        <div style={{display:'flex', gap:14}}>
          <button style={{...protoBtn(t)}}><Icons.link size={13}/> GitHub</button>
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
