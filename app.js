/* ====== I18N ====== */
const I18N = { 
  "pt-BR": { Idioma: "Idioma", Geral: "Geral", Contadores: "Contadores", Plataformas: "Plataformas", Instrucoes: "Instruções", LogoBox: "Logo-box", Reset: "Zerar" }, 
  "en": { Idioma: "Language", Geral: "General", Contadores: "Counters", Plataformas: "Platforms", Instrucoes: "Instructions", LogoBox: "Logo box", Reset: "Reset" } };

/* ====== Defaults & State ====== */
const STORAGE = 'playjegue_stream_state_v6';
const DEFAULT_PLATFORMS = [
  { name: 'youtube', label: 'YouTube', username: '', enabled: false, color: '#ff0000', iconKey: 'youtube', iconUrl: '', category: 'principais' },
  { name: 'twitch', label: 'Twitch', username: '', enabled: false, color: '#9146ff', iconKey: 'twitch', iconUrl: '', category: 'principais' },
  { name: 'kick', label: 'Kick', username: '', enabled: false, color: '#53fc18', iconKey: 'kick', iconUrl: '', category: 'principais' },
  { name: 'instagram', label: 'Instagram', username: '', enabled: false, color: '#e1306c', iconKey: 'instagram', iconUrl: '', category: 'redes' },
  { name: 'tiktok', label: 'TikTok', username: '', enabled: false, color: '#ff0050', iconKey: 'tiktok', iconUrl: '', category: 'redes' },
  { name: 'discord', label: 'Discord', username: '', enabled: false, color: '#7289da', iconKey: 'discord', iconUrl: '', category: 'redes' },
  { name: 'playstation', label: 'PlayStation', username: '', enabled: false, color: '#0070d1', iconKey: 'playstation', iconUrl: '', category: 'consoles' },
  { name: 'xbox', label: 'Xbox', username: '', enabled: false, color: '#107c10', iconKey: 'xbox', iconUrl: '', category: 'consoles' },
  { name: 'custom', label: 'CUSTOM', username: 'Streamer BAR', enabled: true, color: '#734500', iconKey: '', iconUrl: 'PLAY_JEGUE_LOGO_1x1.png', category: 'custom' }
];

let state = {
  death: 0, showDeath: true,
  trophyCur: 0, trophyMax: 1, showTrophy: true,
  platforms: [], currentIndex: 0,
  rotate: true, transitionSec: 5,
  barW: 455, barH: 60, barR: 50, barAlpha: 1,
  mainConsole: 'playstation',
  lang: (navigator.language && navigator.language.startsWith('pt-BR')) ? 'pt-BR' : 'en',
  currentTab: 'contadores',
  glow: false, glowColor: '#cecece', shadowAmt: 0.4,
  iconAnim: true,
  logoBox: { enabled: true, size: 65, bgColor: 'auto', borderEnabled: true, borderWidth: 1, borderColor: '#ffffff', radius: 999 }
};
let rotateTimer = null;
let CURRENT_ID = new URLSearchParams(location.search).get('id') || null;

/* ================= Supabase Setup ================= */
const SUPABASE_URL = "https://yjmztvtwbjssmbtfdgue.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqbXp0dnR3Ympzc21idGZkZ3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MzUwNjEsImV4cCI6MjA3MjUxMTA2MX0.PQ-T5gd5a7w0BoExYgTFKe-V3w8Pwq98V9eggRt7Dsc";

/* ====== Simple DB: IndexedDB + localStorage fallback ====== */
function idbOpen() {
  return new Promise((res) => {
    if (!window.indexedDB)
      return res(null); const req = indexedDB.open('PlayJEGUEDB', 5);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('states')) db.createObjectStore('states', { keyPath: 'id' });
    }; req.onsuccess = () => res(req.result); req.onerror = () => res(null);
  });
}

/* ================= Supabase Helpers ================= */
async function dbPut(id, data){
  if(!supabase) return false;
  
  if(!id){
    console.warn("Tentando salvar sem ID, gerando novo...");
    id = generateID();
    CURRENT_ID = id;
    const url = new URL(location.href);
    url.searchParams.set('id', CURRENT_ID);
    history.replaceState({}, '', url.toString());
    updateIdField();
  }
  const { error } = await supabase
    .from('states')
    .upsert({ id, state: data, updated: new Date().toISOString() });
  if(error) console.error("Erro Supabase PUT", error);
  return !error;
}

async function dbGet(id){
  if(!supabase) return null;
  
  const { data, error } = await supabase
    .from('states')
    .select('state')
    .eq('id', id)
    .single();
  if(error) {
    console.warn("Erro Supabase GET", error);
    return null;
  }
  return data.state;
}

function generateID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }

async function ensureIdAndSave() { 
  if (!CURRENT_ID) { 
    CURRENT_ID = generateID(); 
    const url = new URL(location.href); 
    url.searchParams.set('id', CURRENT_ID); 
    window.history.replaceState({}, '', url.toString()); 
  } 
  updateIdField();
  
  try { 
    localStorage.setItem(STORAGE, JSON.stringify(state)); 
  } catch (e) { } 
  
  return CURRENT_ID; 
}

/* ====== Broadcast between Dock and Source ====== */
const channel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('playjegue-sync') : null;
function broadcast() { try { if (channel) channel.postMessage({ id: CURRENT_ID, state }); } catch (e) { } }
if (channel) {
  channel.onmessage = (ev) => {
    try {
      const msg = ev.data || {}; if (!msg || msg.id !== CURRENT_ID) return; state = Object.assign(state, msg.state || {}); // merge
      save(false); renderBar(); renderPlatformLists();
    } catch (e) { }
  };
}

/* ====== Helpers ====== */
const $ = s => document.querySelector(s); const $$ = s => Array.from(document.querySelectorAll(s));
function enabledPlatforms() { return state.platforms.filter(p => p.enabled); }
function save(doBroadcast = true) { 
  try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (e) { } 
  if (CURRENT_ID) { dbPut(CURRENT_ID, state); } 
  if (doBroadcast) broadcast(); 
}

function setBarStyle() {
  document.documentElement.style.setProperty('--bar-w', state.barW + 'px');
  document.documentElement.style.setProperty('--bar-h', state.barH + 'px');
  document.documentElement.style.setProperty('--bar-r', state.barR + 'px');
  document.documentElement.style.setProperty('--bar-alpha', state.barAlpha);
  document.documentElement.style.setProperty('--glow-color', state.glowColor);
  document.documentElement.style.setProperty('--shadow-amt', state.shadowAmt);
  document.documentElement.style.setProperty('--glow-enabled', state.glow ? 1 : 0);
  document.documentElement.style.setProperty('--logo-size', (state.logoBox.size || 65) + 'px');
  document.documentElement.style.setProperty('--logo-border-enabled', state.logoBox.borderEnabled ? 1 : 0);
  document.documentElement.style.setProperty('--logo-border-width', (state.logoBox.borderWidth || 1) + 'px');
  document.documentElement.style.setProperty('--logo-border-color', state.logoBox.borderColor || '#ffffff');
  document.documentElement.style.setProperty('--logo-radius', (state.logoBox.radius || 999) + 'px');
  // background of logo-box
  let bg = 'transparent';
  if (state.logoBox.enabled) {
    if (state.logoBox.bgColor && state.logoBox.bgColor !== 'auto') { bg = state.logoBox.bgColor; }
    else {
      const ep = enabledPlatforms(); const p = ep.length ? ep[state.currentIndex % ep.length] : null;
      bg = p ? p.color : 'rgba(255,255,255,.08)';
    }
    document.documentElement.style.setProperty('--logo-bg', bg);
  } else {
    // fully transparent but keep logos visible
    document.documentElement.style.setProperty('--logo-bg', 'transparent');
    document.documentElement.style.setProperty('--logo-border-enabled', 0);
  }
  $('#glowRing').style.display = state.glow ? 'block' : 'none';
}

function renderBar(triggerBounce) {
  setBarStyle();
  $('#deathCount').textContent = state.death;
  $('#trophyCount').textContent = `${state.trophyCur}/${state.trophyMax}`;

  $('#dInput').value = state.death;
  $('#tCurrent').value = state.trophyCur;
  $('#tMax').value = state.trophyMax;

  $('#deathGroup').style.display = state.showDeath ? 'flex' : 'none';
  $('#trophyGroup').style.display = state.showTrophy ? 'flex' : 'none';
  $('#divider').style.display = (state.showDeath && state.showTrophy) ? 'block' : 'none';

  const ep = enabledPlatforms();
  if (ep.length === 0) { $('#barUser').textContent = 'Selecione uma plataforma…'; return; }
  if (state.currentIndex >= ep.length) state.currentIndex = 0;
  const p = ep[state.currentIndex];
  $('#barUser').textContent = p.username || p.label || '@';

  const logoBox = $('#logoBox');
  if (p.iconUrl) { logoBox.innerHTML = `<img id="barLogo" alt="logo" src="${p.iconUrl}">`; }
  else if (p.iconKey) { const fa = PLATFORM_ICONS[p.iconKey] || 'fa-regular fa-circle'; logoBox.innerHTML = `<i id="barLogoFA" class="${fa} logo-fa" aria-hidden="true"></i>`; }
  else { logoBox.innerHTML = `<img id="barLogo" alt="logo" src="PLAY_JEGUE_LOGO_1x1.png">`; }

  const bar = $('#bar');
  bar.style.background = `${p.color}`; // `linear-gradient(90deg, ${p.color}, ${hexToRgb(p.color, 20)})`; 
  bar.style.opacity = parseFloat(state.barAlpha || 1);

  if (state.mainConsole === 'xbox') { $('#psTrophy').classList.add('hidden'); $('#xboxGem').classList.remove('hidden'); } else { $('#xboxGem').classList.add('hidden'); $('#psTrophy').classList.remove('hidden'); }

  const skull = $('#skullIcon'); const digits = String(state.death).length;
  skull.style.marginRight = 0;
  $('#deathCount').style.minWidth = (20 + digits * 8) + 'px';

  if (triggerBounce && state.iconAnim) { const elIcon = logoBox.firstElementChild; if (elIcon) { elIcon.classList.remove('bounce'); void elIcon.offsetWidth; elIcon.classList.add('bounce'); } }
}

function hexToRgb(hex, percent) {
  // Remove '#' if present
  let cleanHex = hex.startsWith("#") ? hex.slice(1) : hex;

  // Handle shorthand hex codes (e.g., "FFF" to "FFFFFF")
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }

  // Parse R, G, B values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}) ${percent}%`;
}

function renderPlatformLists() {
  const list = $('#platformList'); list.innerHTML = '';
  const activeSub = $('.sub-btn.active').dataset.sub;
  const filtered = state.platforms.filter(p => p.category === activeSub);
  filtered.forEach((p) => {
    const row = document.createElement('div'); row.className = 'plat-item';
    const icon = document.createElement('div'); icon.className = 'plat-logo';
    if (p.iconUrl) { icon.innerHTML = `<img src="${p.iconUrl}" style="width:28px;height:28px;object-fit:contain" />`; }
    else if (p.iconKey) { const fa = PLATFORM_ICONS[p.iconKey] || 'fa-regular fa-circle'; icon.innerHTML = `<i class="${fa}"></i>`; }
    else { icon.innerHTML = `<img src="PLAY_JEGUE_LOGO_1x1.png" style="width:28px;height:28px;object-fit:contain" />`; }
    const user = document.createElement('input'); user.type = 'text'; user.value = p.username || ''; user.placeholder = '@usuario'; user.addEventListener('change', e => { p.username = e.target.value.trim(); save(); renderBar(); });
    const color = document.createElement('input'); color.type = 'color'; color.value = p.color || '#ffffff'; color.addEventListener('change', e => { p.color = e.target.value; save(); renderBar(); });
    const toggle = document.createElement('div'); toggle.className = 'toggle ' + (p.enabled ? 'on' : ''); toggle.addEventListener('click', () => { toggle.classList.toggle('on'); p.enabled = toggle.classList.contains('on'); save(); renderBar(true); startRotation(); });
    row.appendChild(icon); row.appendChild(user); row.appendChild(color); row.appendChild(toggle);
    list.appendChild(row);
  });
}

function startRotation() { if (rotateTimer) clearInterval(rotateTimer); if (!state.rotate) return; const sec = Math.max(1, parseInt(state.transitionSec) || 5); rotateTimer = setInterval(() => { const ep = enabledPlatforms(); if (ep.length <= 1) return; state.currentIndex = (state.currentIndex + 1) % ep.length; save(); renderBar(true); }, sec * 1000); }

/* ====== Controls ====== */
function bindControls() {
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => { $$('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); $$('.tab').forEach(t => t.classList.remove('active')); $('#tab-' + btn.dataset.tab).classList.add('active'); state.currentTab = btn.dataset.tab; save(); }));
  $$('.sub-btn').forEach(btn => btn.addEventListener('click', () => { $$('.sub-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderPlatformLists(); }));
  $('#copySource').addEventListener('click', async () => { const id = await ensureIdAndSave(); const url = location.origin + location.pathname + '?id=' + id; navigator.clipboard.writeText(url).catch(() => { }); alert('URL copiada (Source) com ID: ' + id); });
  $('#copyDock').addEventListener('click', async () => { const id = await ensureIdAndSave(); const url = location.origin + location.pathname + '?dock=true&id=' + id; navigator.clipboard.writeText(url).catch(() => { }); alert('URL copiada (Dock) com ID: ' + id); });
  $('#refreshBtn').addEventListener('click', () => location.reload());
  $('#exportBtn').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'playjegue-widget-config.json'; a.click(); URL.revokeObjectURL(a.href); });
  $('#importBtn').addEventListener('click', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json'; inp.onchange = async () => { const file = inp.files[0]; if (!file) return; const txt = await file.text(); try { const cfg = JSON.parse(txt); Object.assign(state, cfg); save(); initAfterLoad(true); } catch (e) { alert('JSON inválido'); } }; inp.click(); });

  ['barW', 'barH', 'barR', 'barAlpha'].forEach(id => { $('#' + id).addEventListener('input', () => { const v = (id === 'barAlpha') ? parseFloat($('#' + id).value).toFixed(2) : $('#' + id).value; $('#' + id + 'Val').textContent = v; }); });
  $('#shadowAmt').addEventListener('input', () => { $('#shadowVal').textContent = $('#shadowAmt').value; });

  // Logo-box controls
  ['logoSize', 'logoBorderWidth', 'logoRadius'].forEach(id => { $('#' + id).addEventListener('input', () => { $('#' + id + 'Val').textContent = $('#' + id).value; }); });
  $('#logoToggle').addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); state.logoBox.enabled = e.currentTarget.classList.contains('on'); save(); renderBar(); });
  $('#logoColor').addEventListener('change', () => { state.logoBox.bgColor = $('#logoColor').value === 'auto' ? 'auto' : $('#logoBgPicker').value; save(); renderBar(); });
  $('#logoBgPicker').addEventListener('change', () => { if ($('#logoColor').value !== 'auto') { state.logoBox.bgColor = $('#logoBgPicker').value; save(); renderBar(); } });
  $('#logoBorderToggle').addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); state.logoBox.borderEnabled = e.currentTarget.classList.contains('on'); save(); renderBar(); });
  $('#logoSize').addEventListener('input', () => { state.logoBox.size = parseInt($('#logoSize').value, 10) || 65; save(); renderBar(); });
  $('#logoBorderWidth').addEventListener('input', () => { state.logoBox.borderWidth = parseInt($('#logoBorderWidth').value, 10) || 1; save(); renderBar(); });
  $('#logoBorderColor').addEventListener('change', () => { state.logoBox.borderColor = $('#logoBorderColor').value; save(); renderBar(); });
  $('#logoRadius').addEventListener('input', () => { state.logoBox.radius = parseInt($('#logoRadius').value, 10) || 999; save(); renderBar(); });

  $('#applyStyle').addEventListener('click', () => { state.barW = parseInt($('#barW').value, 10) || 450; state.barH = parseInt($('#barH').value, 10) || 50; state.barR = parseInt($('#barR').value, 10) || 50; state.barAlpha = parseFloat($('#barAlpha').value) || 0; state.glow = $('#toggleGlow').classList.contains('on'); state.glowColor = $('#glowColor').value; state.shadowAmt = parseFloat($('#shadowAmt').value) || 0.4; state.iconAnim = $('#toggleIconAnim')?.classList.contains('on'); save(); renderBar(); startRotation(); });
  $('#defaultStyle').addEventListener('click', () => {
    state.barW = 450; state.barH = 50; state.barR = 50; state.barAlpha = 0; state.glow = false; state.glowColor = '#cecece'; state.shadowAmt = 0.4; state.iconAnim = true;
    state.logoBox = { enabled: true, size: 65, bgColor: 'auto', borderEnabled: true, borderWidth: 1, borderColor: '#ffffff', radius: 999 };
    // reset UI
    $('#barW').value = 450; $('#barH').value = 50; $('#barR').value = 50; $('#barAlpha').value = 0;
    $('#barWVal').textContent = 450; $('#barHVal').textContent = 50; $('#barRVal').textContent = 50; $('#barAlphaVal').textContent = 0;
    $('#toggleGlow').classList.remove('on'); $('#glowColor').value = '#6c5ce7'; $('#shadowAmt').value = 0.4; $('#shadowVal').textContent = 0.4; $('#toggleIconAnim').classList.add('on');
    // logo ui
    $('#logoToggle').classList.add('on'); $('#logoSize').value = 65; $('#logoSizeVal').textContent = 65;
    $('#logoColor').value = 'auto'; $('#logoBgPicker').value = '#ffffff';
    $('#logoBorderToggle').classList.add('on'); $('#logoBorderWidth').value = 1; $('#logoBorderWidthVal').textContent = 1; $('#logoBorderColor').value = '#ffffff'; $('#logoRadius').value = 999; $('#logoRadiusVal').textContent = 999;
    save(); renderBar();
  });

  $('#toggleGlow').addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); state.glow = e.currentTarget.classList.contains('on'); save(); renderBar(); });
  $('#toggleIconAnim')?.addEventListener('click', (e) => { e.currentTarget.classList.toggle('on'); state.iconAnim = e.currentTarget.classList.contains('on'); save(); });

  $('#dPlus').addEventListener('click', () => { state.death = Math.min(9999, state.death + 1); save(); renderBar(); animateCounter($('#deathCount')); });
  $('#dMinus').addEventListener('click', () => { state.death = Math.max(0, state.death - 1); save(); renderBar(); animateCounter($('#deathCount')); });
  $('#dReset').addEventListener('click', () => { state.death = 0; save(); renderBar(); animateCounter($('#deathCount')); });
  $('#dInput').addEventListener('change', e => { state.death = Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)); save(); renderBar(); animateCounter($('#deathCount')); });

  $('#tPlus').addEventListener('click', () => { state.trophyCur = Math.min(99, state.trophyCur + 1); if (state.trophyCur > state.trophyMax) state.trophyCur = state.trophyMax; save(); renderBar(); animateCounter($('#trophyCount')); });
  $('#tMinus').addEventListener('click', () => { state.trophyCur = Math.max(0, state.trophyCur - 1); save(); renderBar(); animateCounter($('#trophyCount')); });
  $('#mPlus').addEventListener('click', () => { state.trophyMax = Math.min(99, state.trophyMax + 1); save(); renderBar(); animateCounter($('#trophyCount')); });
  $('#mMinus').addEventListener('click', () => { state.trophyMax = Math.max(1, state.trophyMax - 1); if (state.trophyCur > state.trophyMax) state.trophyCur = state.trophyMax; save(); renderBar(); animateCounter($('#trophyCount')); });
  $('#tReset').addEventListener('click', () => { state.trophyCur = 0; state.trophyMax = 1; save(); renderBar(); animateCounter($('#trophyCount')); });
  $('#tCurrent').addEventListener('change', e => { state.trophyCur = Math.max(0, Math.min(99, parseInt(e.target.value) || 0)); if (state.trophyCur > state.trophyMax) state.trophyCur = state.trophyMax; save(); renderBar(); animateCounter($('#trophyCount')); });
  $('#tMax').addEventListener('change', e => { state.trophyMax = Math.max(1, Math.min(99, parseInt(e.target.value) || 1)); if (state.trophyCur > state.trophyMax) state.trophyCur = state.trophyMax; save(); renderBar(); animateCounter($('#trophyCount')); });

  $('#toggleDeath').addEventListener('click', e => { e.currentTarget.classList.toggle('on'); state.showDeath = e.currentTarget.classList.contains('on'); save(); renderBar(); });
  $('#toggleTrophy').addEventListener('click', e => { e.currentTarget.classList.toggle('on'); state.showTrophy = e.currentTarget.classList.contains('on'); save(); renderBar(); });

  $('#mainConsole').addEventListener('change', (e) => { state.mainConsole = e.target.value; save(); renderBar(); });
  $('#language').addEventListener('change', (e) => { state.lang = e.target.value; save(); applyI18n(); });

  document.addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey)) return; if (e.shiftKey) { if (e.key === ']') { e.preventDefault(); state.death = Math.min(9999, state.death + 1); save(); renderBar(); } if (e.key === '\\') { e.preventDefault(); state.death = 0; save(); renderBar(); } } else { if (e.key === '[') { e.preventDefault(); state.trophyCur = Math.min(99, state.trophyCur + 1); if (state.trophyCur > state.trophyMax) state.trophyCur = state.trophyMax; save(); renderBar(); } if (e.key === ']') { e.preventDefault(); state.trophyMax = Math.min(99, state.trophyMax + 1); save(); renderBar(); } if (e.key === '\\') { e.preventDefault(); state.trophyCur = 0; state.trophyMax = 1; save(); renderBar(); } } });
}

function animateCounter(el) {
  if (!el) return;
  el.classList.remove('bounce-fade');
  void el.offsetWidth;
  el.classList.add('bounce-fade');
}

function updateIdField(){
  const el=document.getElementById('currentId');
  if(el) el.value=CURRENT_ID||'';
}

/* ====== i18n visuals ====== */
function applyI18n() { 
  const t = I18N[state.lang] || I18N['pt-BR']; 
  $('#lblLang').textContent = t.Idioma; 
  const map = { contadores: t.Contadores, plataformas: t.Plataformas, instrucoes: t.Instrucoes, geral: t.Geral, reset: t.Reset}; 
  $$('.tab-btn').forEach(b => b.textContent = map[b.dataset.tab]);
  $('#language').value = state.lang; }

function initAfterLoad(skipTabRestore) {
  // try load by id from DB when present
  if (CURRENT_ID) {
    dbGet(CURRENT_ID).then(dbState => { 
      if (dbState) { 
        state = Object.assign(state, dbState); 
        refreshUI(skipTabRestore); 
      } else { 
        refreshUI(skipTabRestore); 
      } 
    });
  } else {
    refreshUI(skipTabRestore);
  }
}

function refreshUI(skipTabRestore) {
  $('#barW').value = state.barW; $('#barH').value = state.barH; $('#barR').value = state.barR; $('#barAlpha').value = state.barAlpha;
  $('#barWVal').textContent = state.barW; $('#barHVal').textContent = state.barH; $('#barRVal').textContent = state.barR; $('#barAlphaVal').textContent = state.barAlpha;
  if (state.glow) $('#toggleGlow').classList.add('on'); else $('#toggleGlow').classList.remove('on');
  $('#glowColor').value = state.glowColor || '#6c5ce7';
  $('#shadowAmt').value = state.shadowAmt || 0.4;
  $('#shadowVal').textContent = state.shadowAmt || 0.4;
  if (state.iconAnim) $('#toggleIconAnim')?.classList.add('on'); else $('#toggleIconAnim')?.classList.remove('on');

  // logo UI
  if (state.logoBox.enabled) $('#logoToggle').classList.add('on'); else $('#logoToggle').classList.remove('on');
  $('#logoSize').value = state.logoBox.size || 65; $('#logoSizeVal').textContent = state.logoBox.size || 65;
  if (state.logoBox.bgColor === 'auto') { $('#logoColor').value = 'auto'; } else { $('#logoColor').value = 'custom'; $('#logoBgPicker').value = state.logoBox.bgColor || '#773f00ff'; }
  if (state.logoBox.borderEnabled) $('#logoBorderToggle').classList.add('on'); else $('#logoBorderToggle').classList.remove('on');
  $('#logoBorderWidth').value = state.logoBox.borderWidth || 1; $('#logoBorderWidthVal').textContent = state.logoBox.borderWidth || 1;
  $('#logoBorderColor').value = state.logoBox.borderColor || '#ffffff';
  $('#logoRadius').value = state.logoBox.radius || 999; $('#logoRadiusVal').textContent = state.logoBox.radius || 999;

  applyI18n();
  renderPlatformLists();
  renderBar();
  bindControls();
  startRotation();
  
  if (!skipTabRestore && state.currentTab) { 
    const btn = document.querySelector('.tab-btn[data-tab="' + state.currentTab + '"]'); 
    if (btn) btn.click(); 
  }
  
  let paramDock = new URLSearchParams(location.search).get('dock');
  let paramSource = new URLSearchParams(location.search).get('source');
  // Determine view mode based on URL parameter, not state
  const isDock = paramDock ? paramDock === 'true' ? true : false : false;
  const isSource = paramSource ? paramSource === 'true' ? true : false : false;
  
  // Set visibility based on mode
  if (isDock) { 
    document.querySelector('.wrap').style.display = 'none'; 
    document.getElementById('panel').style.display = 'block'; 
  } else if (isSource) { 
    document.querySelector('.wrap').style.display = 'block'; 
    document.getElementById('panel').style.display = 'none'; 
  } else {
    document.querySelector('.wrap').style.display = 'block'; 
    document.getElementById('panel').style.display = 'block';
  }
  
  document.getElementById('year').textContent = new Date().getFullYear();
  ensureIdAndSave();
}

/* ====== Icons ====== */
const PLATFORM_ICONS = { youtube: 'fa-brands fa-youtube', twitch: 'fa-brands fa-twitch', kick: 'fa-brands fa-kickstarter-k', instagram: 'fa-brands fa-instagram', tiktok: 'fa-brands fa-tiktok', discord: 'fa-brands fa-discord', playstation: 'fa-brands fa-playstation', xbox: 'fa-brands fa-xbox' };

/* ====== Start ====== */
document.addEventListener('DOMContentLoaded', async ()=>{
  // Initialize Supabase
  try {
    supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.error("Erro ao inicializar Supabase:", e);
  }

  try { 
    const raw = localStorage.getItem(STORAGE); 
    if(raw) Object.assign(state, JSON.parse(raw)); 
  } catch(e) {
    console.warn(e);
  }

  if(!Array.isArray(state.platforms) || state.platforms.length===0) 
    state.platforms = JSON.parse(JSON.stringify(DEFAULT_PLATFORMS));
  
  await ensureIdAndSave();
  initAfterLoad();
});