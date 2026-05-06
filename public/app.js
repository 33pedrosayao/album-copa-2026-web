'use strict';

// ─────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────
const state = {
  // cache separado por contexto — evita reloads ao trocar de aba
  albumGlobal: null,  // aba Álbum (colada compartilhado, repetidas ignoradas na UI)
  albumPedro: null,   // aba Pedro (repetidas do Pedro)
  albumAna: null,     // aba Ana   (repetidas da Ana)
  tab: 'album',
  trocas: null,
  stats: null,
  pessoa: localStorage.getItem('pessoa') || null, // contexto de trocas/stats
  searchQuery: '',    // busca ativa nas abas de figurinhas
};

// mapa codigo → objeto figurinha do album ativo (referência direta)
let stickerMap = new Map();

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────
const $ = sel => document.querySelector(sel);

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na API');
  return data;
}

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Retorna o album ativo com base na aba atual
function activeAlbum() {
  if (state.tab === 'pedro') return state.albumPedro;
  if (state.tab === 'ana')   return state.albumAna;
  return state.albumGlobal;
}

function setContent(html) {
  const el = $('#content');
  if (el) el.innerHTML = html;
}

function setPessoaTheme(pessoa) {
  const r = document.documentElement;
  if (pessoa === 'ana') {
    r.style.setProperty('--pessoa-color', '#AD1457');
    r.style.setProperty('--pessoa-dark',  '#880E4F');
    r.style.setProperty('--pessoa-light', '#FCE4EC');
  } else if (pessoa === 'pedro') {
    r.style.setProperty('--pessoa-color', '#1565C0');
    r.style.setProperty('--pessoa-dark',  '#0D47A1');
    r.style.setProperty('--pessoa-light', '#E3F2FD');
  } else {
    // Copa azul escuro — aba Álbum sem persona
    r.style.setProperty('--pessoa-color', '#1a3a5c');
    r.style.setProperty('--pessoa-dark',  '#0D47A1');
    r.style.setProperty('--pessoa-light', '#E3F2FD');
  }
}

function buildStickerMap() {
  stickerMap = new Map();
  const album = activeAlbum();
  if (!album) return;
  for (const sec of album.secoes) {
    for (const fig of sec.figurinhas) stickerMap.set(fig.codigo, fig);
  }
}

// ─────────────────────────────────────────────
// CICLO DE VIDA
// ─────────────────────────────────────────────
function init() {
  setupDelegation();
  setPessoaTheme(null); // Copa azul para aba Álbum
  renderApp();
  loadAlbum('global');
}

// ─────────────────────────────────────────────
// CARREGAMENTO
// ─────────────────────────────────────────────
async function loadAlbum(cacheKey) {
  // cacheKey: 'global' | 'pedro' | 'ana'
  const pessoaParam = cacheKey === 'global'
    ? (state.pessoa || 'pedro')   // colada é compartilhado, qualquer pessoa serve
    : cacheKey;

  setContent('<div class="loading">Carregando figurinhas…</div>');
  try {
    const data = await api('GET', `/api/figurinhas?pessoa=${pessoaParam}`);
    state[`album${cacheKey.charAt(0).toUpperCase() + cacheKey.slice(1)}`] = data;
    buildStickerMap();
    updateProgressBar();
    renderCurrentTabContent();
  } catch (e) {
    setContent(`<div class="loading">Erro ao carregar: ${esc(e.message)}</div>`);
  }
}

async function loadTrocas() {
  if (!state.pessoa) { renderSemPessoa(); return; }
  setContent('<div class="loading">Carregando trocas…</div>');
  try {
    state.trocas = await api('GET', `/api/trocas?pessoa=${state.pessoa}`);
    renderTrocasContent();
  } catch (e) {
    setContent(`<div class="loading">Erro: ${esc(e.message)}</div>`);
  }
}

async function loadStats() {
  if (!state.pessoa) { renderSemPessoa(); return; }
  setContent('<div class="loading">Calculando estatísticas…</div>');
  try {
    state.stats = await api('GET', `/api/stats?pessoa=${state.pessoa}`);
    renderStatsContent();
  } catch (e) {
    setContent(`<div class="loading">Erro: ${esc(e.message)}</div>`);
  }
}

// ─────────────────────────────────────────────
// RENDER — ESTRUTURA PRINCIPAL
// ─────────────────────────────────────────────
function renderApp() {
  $('#app').innerHTML = `
    <div class="header">
      <div class="header-top">
        <span class="header-title">🏆 Copa 2026</span>
        <a class="btn-export" href="/api/export" download title="Baixar backup JSON">⬇ backup</a>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-info">
          <span id="progress-text">—</span>
          <span id="progress-pct"></span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill" style="width:0%"></div>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn active"  data-action="switchTab" data-tab="album">Álbum</button>
        <button class="tab-btn pedro-tab" data-action="switchTab" data-tab="pedro">Pedro</button>
        <button class="tab-btn ana-tab"   data-action="switchTab" data-tab="ana">Ana</button>
        <button class="tab-btn"          data-action="switchTab" data-tab="trocas">Trocas</button>
        <button class="tab-btn"          data-action="switchTab" data-tab="estatisticas">Estat.</button>
      </div>
    </div>
    <div class="main-content"><div id="content"></div></div>`;
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );

  state.searchQuery = ''; // limpa busca ao trocar de aba

  if (tab === 'pedro') {
    state.pessoa = 'pedro';
    localStorage.setItem('pessoa', 'pedro');
    setPessoaTheme('pedro');
    if (state.albumPedro) { buildStickerMap(); renderCurrentTabContent(); }
    else loadAlbum('pedro');
  } else if (tab === 'ana') {
    state.pessoa = 'ana';
    localStorage.setItem('pessoa', 'ana');
    setPessoaTheme('ana');
    if (state.albumAna) { buildStickerMap(); renderCurrentTabContent(); }
    else loadAlbum('ana');
  } else if (tab === 'album') {
    setPessoaTheme(null);
    if (state.albumGlobal) { buildStickerMap(); renderCurrentTabContent(); }
    else loadAlbum('global');
  } else if (tab === 'trocas') {
    loadTrocas();
  } else if (tab === 'estatisticas') {
    loadStats();
  }
}

function renderCurrentTabContent() {
  if (state.tab === 'album')        renderAlbumContent();
  else if (state.tab === 'pedro')   renderPessoaContent('pedro');
  else if (state.tab === 'ana')     renderPessoaContent('ana');
  else if (state.tab === 'trocas')  renderTrocasContent();
  else if (state.tab === 'estatisticas') renderStatsContent();
}

function updateProgressBar() {
  const album = activeAlbum();
  if (!album) return;
  let total = 0, coladas = 0;
  for (const sec of album.secoes) {
    total += sec.figurinhas.length;
    coladas += sec.figurinhas.filter(f => f.colada).length;
  }
  const pct = total > 0 ? ((coladas / total) * 100).toFixed(1) : '0.0';
  const fill  = $('#progress-fill');
  const txt   = $('#progress-text');
  const pctEl = $('#progress-pct');
  if (fill)  fill.style.width  = pct + '%';
  if (txt)   txt.textContent   = `${coladas} / ${total} coladas`;
  if (pctEl) pctEl.textContent = `${pct}%`;
}

// ─────────────────────────────────────────────
// BUSCA
// ─────────────────────────────────────────────
function searchHtml() {
  const q = state.searchQuery;
  return `
    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
      </svg>
      <input class="search-input" type="search"
             placeholder="Buscar sigla ou país (BRA, ARG…)"
             autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
             value="${esc(q)}" />
      <button class="search-clear" data-action="clearSearch"
              style="${q ? '' : 'display:none'}">×</button>
    </div>`;
}

function filterSections(query) {
  state.searchQuery = query;
  const q = query.toLowerCase().trim();
  const sections = document.querySelectorAll('.section');
  let visibleCount = 0;
  let lastVisible  = null;

  sections.forEach(sec => {
    const sigla = (sec.dataset.sigla || '').toLowerCase();
    const nome  = (sec.dataset.nome  || '').toLowerCase();
    const match = !q || sigla.startsWith(q) || sigla.includes(q) || nome.includes(q);
    sec.style.display = match ? '' : 'none';
    if (match) { visibleCount++; lastVisible = sec; }
  });

  // auto-expande quando só uma seção bate
  if (visibleCount === 1 && lastVisible) lastVisible.classList.add('expanded');
}

// ─────────────────────────────────────────────
// RENDER — ABA ÁLBUM (global, toggle colada, sem repetidas)
// ─────────────────────────────────────────────
function renderAlbumContent() {
  const album = activeAlbum();
  if (!album) return;

  const sections = album.secoes.map(sec => {
    const total   = sec.figurinhas.length;
    const coladas = sec.figurinhas.filter(f => f.colada).length;
    const cards   = sec.figurinhas.map(fig => `
      <div class="sticker-card${fig.colada ? ' colada' : ' faltando'}"
           data-action="toggleColada" data-codigo="${esc(fig.codigo)}">
        <span class="sticker-codigo">${esc(fig.codigo)}</span>
      </div>`).join('');
    return sectionHtml(sec, coladas, total, `album-grid`, cards);
  }).join('');

  setContent(searchHtml() + sections);
  if (state.searchQuery) filterSections(state.searchQuery);
}

// ─────────────────────────────────────────────
// RENDER — ABAS PEDRO / ANA (repetidas, sem toggle colada)
// ─────────────────────────────────────────────
function renderPessoaContent() {
  const album = activeAlbum();
  if (!album) return;

  const sections = album.secoes.map(sec => {
    const total   = sec.figurinhas.length;
    const coladas = sec.figurinhas.filter(f => f.colada).length;
    const cards   = sec.figurinhas.map(fig => {
      const rep = fig.repetidas || 0;
      return `
        <div class="sticker-card${fig.colada ? ' colada' : ' faltando'} pessoa-card"
             data-codigo="${esc(fig.codigo)}">
          <span class="sticker-codigo">${esc(fig.codigo)}</span>
          <div class="repetidas-row">
            <button class="rep-btn" data-action="updateRepetida" data-codigo="${esc(fig.codigo)}" data-delta="-1">−</button>
            <span class="rep-count${rep === 0 ? ' zero' : ''}" id="rep-${esc(fig.codigo)}">${rep}</span>
            <button class="rep-btn" data-action="updateRepetida" data-codigo="${esc(fig.codigo)}" data-delta="1">+</button>
          </div>
        </div>`;
    }).join('');
    return sectionHtml(sec, coladas, total, ``, cards);
  }).join('');

  setContent(searchHtml() + sections);
  if (state.searchQuery) filterSections(state.searchQuery);
}

// helper: markup de uma seção em acordeão
function sectionHtml(sec, coladas, total, gridClass, cardsHtml) {
  return `
    <div class="section" data-sigla="${esc(sec.sigla)}" data-nome="${esc(sec.nome)}">
      <div class="section-header" data-action="toggleSection">
        <span class="section-sigla">${esc(sec.sigla)}</span>
        <span class="section-name">${esc(sec.nome)}</span>
        <span class="section-progress" id="prog-${esc(sec.sigla)}">${coladas}/${total}</span>
        <span class="section-chevron">▼</span>
      </div>
      <div class="section-body">
        <div class="sticker-grid ${gridClass}">${cardsHtml}</div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// RENDER — TROCAS
// ─────────────────────────────────────────────
function renderSemPessoa() {
  setContent(`
    <div class="sem-pessoa">
      <p>Escolha uma pessoa para ver os dados:</p>
      <div class="sem-pessoa-btns">
        <button class="btn-ps btn-pedro-sm" data-action="switchTab" data-tab="pedro">Pedro</button>
        <button class="btn-ps btn-ana-sm"   data-action="switchTab" data-tab="ana">Ana</button>
      </div>
    </div>`);
}

function renderTrocasContent() {
  if (!state.trocas) return;
  const { minhasRepetidas, precisoColar } = state.trocas;
  const nome = state.pessoa === 'pedro' ? 'Pedro' : 'Ana';

  const listaRep = minhasRepetidas.length === 0
    ? '<div class="empty-state">Nenhuma repetida ainda ✨</div>'
    : minhasRepetidas.map(r =>
        `<div class="trocas-item">
          <span class="codigo-badge">${esc(r.codigo)}</span>
          <span class="qtd-badge">×${r.quantidade}</span>
        </div>`).join('');

  const listaFaltam = precisoColar.length === 0
    ? '<div class="empty-state">Álbum completo! 🏆</div>'
    : precisoColar.map(c =>
        `<div class="trocas-item"><span class="codigo-badge">${esc(c)}</span></div>`
      ).join('');

  setContent(`
    ${pessoaToggleHtml()}
    <div class="trocas-container">
      <div class="trocas-card">
        <div class="trocas-card-header">
          <h3>Repetidas de ${nome}</h3>
          <button class="btn-copiar" data-action="copiarRepetidas">Copiar</button>
        </div>
        <div class="trocas-list">${listaRep}</div>
      </div>
      <div class="trocas-card">
        <div class="trocas-card-header">
          <h3>Falta no álbum</h3>
          <button class="btn-copiar" data-action="copiarFaltam">Copiar</button>
        </div>
        <div class="trocas-list">${listaFaltam}</div>
      </div>
    </div>`);
}

function copiarRepetidas() {
  if (!state.trocas) return;
  const txt = state.trocas.minhasRepetidas.length
    ? state.trocas.minhasRepetidas.map(r => `${r.codigo} (×${r.quantidade})`).join(', ')
    : 'Sem repetidas';
  navigator.clipboard.writeText(txt).then(() => showToast('Lista copiada! 📋'));
}

function copiarFaltam() {
  if (!state.trocas) return;
  const txt = state.trocas.precisoColar.length
    ? state.trocas.precisoColar.join(', ')
    : 'Álbum completo!';
  navigator.clipboard.writeText(txt).then(() => showToast('Lista copiada! 📋'));
}

// ─────────────────────────────────────────────
// RENDER — ESTATÍSTICAS
// ─────────────────────────────────────────────
function pessoaToggleHtml() {
  return `
    <div class="pessoa-toggle">
      <button class="btn-ps${state.pessoa === 'pedro' ? ' active' : ''}"
              data-action="selectPessoa" data-pessoa="pedro">Pedro</button>
      <button class="btn-ps${state.pessoa === 'ana' ? ' active' : ''}"
              data-action="selectPessoa" data-pessoa="ana">Ana</button>
    </div>`;
}

function renderStatsContent() {
  if (!state.stats) return;
  const s = state.stats;
  const sorted = [...s.porSecao].sort((a, b) =>
    (b.coladas / b.total) - (a.coladas / a.total)
  );

  const secoesList = sorted.map(sec => {
    const pct      = sec.total > 0 ? ((sec.coladas / sec.total) * 100).toFixed(0) : 0;
    const completa = sec.coladas === sec.total;
    return `
      <div class="secao-stat-item">
        <div class="secao-stat-row">
          <span class="secao-stat-nome">${esc(sec.nome)}${completa ? ' ✅' : ''}</span>
          <span class="secao-stat-count${completa ? ' completa' : ''}">${sec.coladas}/${sec.total}</span>
        </div>
        <div class="mini-progress">
          <div class="mini-progress-fill${completa ? ' completa' : ''}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  setContent(`
    ${pessoaToggleHtml()}
    <div class="stats-container">
      <div class="stats-hero">
        <div class="stats-pct">${s.percentual}%</div>
        <div class="stats-pct-label">do álbum completo</div>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${s.coladas}</div><div class="stat-label">coladas</div></div>
        <div class="stat-card"><div class="stat-value">${s.faltam}</div><div class="stat-label">faltam</div></div>
        <div class="stat-card"><div class="stat-value">${s.minhasRepetidasTotal}</div><div class="stat-label">repetidas totais</div></div>
        <div class="stat-card"><div class="stat-value">${s.minhasRepetidasUnicas}</div><div class="stat-label">únicas repetidas</div></div>
      </div>
      <div class="secoes-stats">
        <h3>Seleções — por progresso</h3>
        ${secoesList}
      </div>
    </div>`);
}

async function selectPessoa(pessoa) {
  state.pessoa = pessoa;
  localStorage.setItem('pessoa', pessoa);
  if (state.tab === 'trocas') loadTrocas();
  else if (state.tab === 'estatisticas') loadStats();
}

// ─────────────────────────────────────────────
// AÇÕES DO ÁLBUM — optimistic updates
// ─────────────────────────────────────────────
async function toggleColada(codigo) {
  const fig = stickerMap.get(codigo);
  if (!fig) return;

  const prev   = fig.colada;
  const newVal = !fig.colada;

  // Atualiza os três caches para manter consistência ao trocar de aba
  for (const key of ['albumGlobal', 'albumPedro', 'albumAna']) {
    if (!state[key]) continue;
    for (const sec of state[key].secoes) {
      const f = sec.figurinhas.find(x => x.codigo === codigo);
      if (f) f.colada = newVal;
    }
  }

  const card = document.querySelector(`.sticker-card[data-codigo="${codigo}"]`);
  if (card) { card.classList.toggle('colada', newVal); card.classList.toggle('faltando', !newVal); }

  updateProgressBar();
  updateSectionProgress(fig);

  try {
    await api('POST', `/api/figurinhas/${encodeURIComponent(codigo)}/colar`);
  } catch {
    for (const key of ['albumGlobal', 'albumPedro', 'albumAna']) {
      if (!state[key]) continue;
      for (const sec of state[key].secoes) {
        const f = sec.figurinhas.find(x => x.codigo === codigo);
        if (f) f.colada = prev;
      }
    }
    if (card) { card.classList.toggle('colada', prev); card.classList.toggle('faltando', !prev); }
    updateProgressBar();
    updateSectionProgress(fig);
    showToast('Erro ao salvar. Tente novamente.');
  }
}

async function updateRepetida(codigo, delta) {
  const fig = stickerMap.get(codigo);
  if (!fig) return;

  const prev    = fig.repetidas || 0;
  const novoVal = Math.max(0, prev + delta);
  if (novoVal === prev) return;

  fig.repetidas = novoVal;

  const countEl = document.getElementById(`rep-${codigo}`);
  if (countEl) {
    countEl.textContent = novoVal;
    countEl.classList.toggle('zero', novoVal === 0);
    countEl.classList.remove('bump');
    void countEl.offsetWidth;
    countEl.classList.add('bump');
  }

  try {
    await api('POST', `/api/repetidas/${encodeURIComponent(codigo)}`, {
      pessoa: state.pessoa,
      delta,
    });
  } catch {
    fig.repetidas = prev;
    if (countEl) { countEl.textContent = prev; countEl.classList.toggle('zero', prev === 0); }
    showToast('Erro ao salvar repetida.');
  }
}

function updateSectionProgress(fig) {
  const album = activeAlbum();
  if (!album) return;
  const sec = album.secoes.find(s => s.figurinhas.includes(fig));
  if (!sec) return;
  const coladas = sec.figurinhas.filter(f => f.colada).length;
  const el = document.getElementById(`prog-${sec.sigla}`);
  if (el) el.textContent = `${coladas}/${sec.figurinhas.length}`;
}

// ─────────────────────────────────────────────
// DELEGAÇÃO GLOBAL DE EVENTOS
// ─────────────────────────────────────────────
function setupDelegation() {
  document.addEventListener('input', e => {
    if (!e.target.matches('.search-input')) return;
    const q = e.target.value;
    filterSections(q);
    const clearBtn = e.target.nextElementSibling;
    if (clearBtn) clearBtn.style.display = q ? '' : 'none';
  });

  document.addEventListener('click', e => {
    // rep-btn antes de sticker-card (está dentro dele)
    const repBtn = e.target.closest('[data-action="updateRepetida"]');
    if (repBtn) {
      updateRepetida(repBtn.dataset.codigo, parseInt(repBtn.dataset.delta, 10));
      return;
    }

    const target = e.target.closest('[data-action]');
    if (!target) return;

    switch (target.dataset.action) {
      case 'switchTab':     switchTab(target.dataset.tab);          break;
      case 'selectPessoa':  selectPessoa(target.dataset.pessoa);    break;
      case 'toggleSection': {
        const sec = target.closest('.section');
        if (sec) sec.classList.toggle('expanded');
        break;
      }
      case 'toggleColada': {
        const card = target.closest('.sticker-card');
        if (card) toggleColada(card.dataset.codigo);
        break;
      }
      case 'copiarRepetidas': copiarRepetidas(); break;
      case 'copiarFaltam':    copiarFaltam();    break;
      case 'clearSearch': {
        const input = document.querySelector('.search-input');
        if (input) { input.value = ''; input.focus(); }
        filterSections('');
        target.style.display = 'none';
        break;
      }
    }
  });
}

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
