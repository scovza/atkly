
const state = {
    players: [],
    attacks: [],
    selectedAttacker: null,
    selectedSetter: null,
    setterGeneric: false,
    rotation: null,
    firstTouch: null,
    setSpeed: null,
    attackType: null,
    blocked: false,
    block_out: false,
    kill: false,
    out: false,
    notes: '',
    videoUrl: '',
    videoTimestamp: 0,
    // Settings
    firstTouchEnabled: true,
    approachEnabled: true,
};

const ALL_STEPS = ['reception', 'set', 'approach', 'contact', 'trajectory'];
const ALL_STEP_LABELS = (typeof LABELS !== 'undefined' && LABELS.steps) ? LABELS.steps : ['Touch', 'Set', 'Approach', 'Contact', 'Trajectory'];

// Locale helper — safe fallback if LABELS is not defined
const L = (typeof LABELS !== 'undefined') ? LABELS : {};

function activeSteps() {
    return ALL_STEPS.filter(s => {
        if (s === 'reception' && !state.firstTouchEnabled) return false;
        if (s === 'approach' && !state.approachEnabled) return false;
        return true;
    });
}

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

document.addEventListener('DOMContentLoaded', async () => {
    Court.init($('court-svg'), {
        onStepChange: (stepIdx, stepName) => updateModeBar(),
        onComplete: (pts) => { /* all points placed */ },
    });

    await loadPlayers();
    await loadAttacks();
    bindTagButtons();
    bindRotationButtons();
    bindVideoControls();
    bindSaveButton();
    bindPlayerModal();
    bindSettings();
    bindGenericSetter();
    buildEditModal();
    applyActiveSteps();
});

function updateModeBar() {
    const steps = activeSteps();
    const curStep = Court.getStep();
    $$('.mode-step').forEach(el => el.remove());
    const bar = $('mode-bar');
    if (!bar) return;
    steps.forEach((s, i) => {
        const label = ALL_STEP_LABELS[ALL_STEPS.indexOf(s)];
        const span = document.createElement('span');
        span.className = 'mode-step';
        span.dataset.step = i;
        const num = ['①','②','③','④','⑤'][i];
        span.textContent = `${num} ${label}`;
        if (i === curStep) span.classList.add('active');
        else if (i < curStep) span.classList.add('done');
        bar.appendChild(span);
    });
}

function applyActiveSteps() {
    Court.setActiveSteps(activeSteps());
    updateModeBar();
}

async function loadPlayers() {
    const res = await fetch('/players/');
    state.players = await res.json();
    renderPlayerList();
    renderSetterSelect();
}

function renderPlayerList() {
    const list = $('player-list');
    list.innerHTML = '';

    const attackers = state.players.filter(p => p.role !== 'Setter');
    if (!attackers.length) {
        list.innerHTML = `<div style="padding:10px 12px;color:var(--text-muted);font-size:12px;">${L.js_no_players || 'No players added yet'}</div>`;
        return;
    }

    attackers.forEach(p => {
        const el = document.createElement('div');
        el.className = 'player-item' + (state.selectedAttacker?.id === p.id ? ' selected' : '');
        el.dataset.id = p.id;

        const roleCode = {
            'Schiacciatore': 'OH', 'Opposto': 'OP', 'Centrale': 'MB', 'Alzatore': 'S',
            'Outside Hitter': 'OH', 'Opposite': 'OP', 'Middle Blocker': 'MB', 'Setter': 'S'
        }[p.role] || p.role.substring(0, 2).toUpperCase();

        el.innerHTML = `
      <span class="player-num">#${p.number}</span>
      <div class="player-info">
        <div class="player-name">${p.surname} ${p.name}</div>
        <div class="player-role-text">${p.role}</div>
      </div>
      <span class="role-badge role-${roleCode}">${roleCode}</span>
    `;
        el.addEventListener('click', () => selectAttacker(p));
        list.appendChild(el);
    });
}

function selectAttacker(player) {
    state.selectedAttacker = player;
    $$('#player-list .player-item').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.id) === player.id);
    });
}

function renderSetterSelect() {
    const sel = $('setter-select');
    sel.innerHTML = `<option value="">${L.js_no_setter || '— No setter —'}</option>`;
    state.players.filter(p => p.role === 'Setter').forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `#${p.number} ${p.surname}`;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
        state.selectedSetter = parseInt(sel.value) || null;
    });
}

function bindGenericSetter() {
    const btn = $('btn-generic-setter');
    if (!btn) return;
    btn.addEventListener('click', () => {
        state.setterGeneric = !state.setterGeneric;
        btn.classList.toggle('selected', state.setterGeneric);
        const sel = $('setter-select');
        if (sel) sel.disabled = state.setterGeneric;
        if (state.setterGeneric) {
            state.selectedSetter = null;
            if (sel) sel.value = '';
        }
    });
}

function bindSettings() {
    const ftToggle = $('setting-first-touch');
    const apToggle = $('setting-approach');

    if (ftToggle) {
        ftToggle.addEventListener('change', () => {
            state.firstTouchEnabled = ftToggle.checked;
            applyActiveSteps();
        });
    }
    if (apToggle) {
        apToggle.addEventListener('change', () => {
            state.approachEnabled = apToggle.checked;
            applyActiveSteps();
        });
    }
}

function bindTagButtons() {
    $$('[data-ft]').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('[data-ft]').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
            state.firstTouch = btn.dataset.ft;
        } else {
            state.firstTouch = null;
        }
    }));

    $$('[data-speed]').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('[data-speed]').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
            state.setSpeed = btn.dataset.speed;
        } else {
            state.setSpeed = null;
        }
    }));

    $$('[data-atype]').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('[data-atype]').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
            state.attackType = btn.dataset.atype;
        } else {
            state.attackType = null;
        }
    }));

    const resultBtns = {
        'btn-kill':      'kill',
        'btn-blocked':   'blocked',
        'btn-block-out': 'block_out',
        'btn-out':       'out',
    };
    Object.entries(resultBtns).forEach(([id, key]) => {
        const btn = $(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const wasActive = state[key];
            state.kill = false; state.blocked = false; state.block_out = false; state.out = false;
            Object.keys(resultBtns).forEach(bid => $(bid)?.classList.remove('selected'));
            if (!wasActive) {
                state[key] = true;
                btn.classList.add('selected');
            }
        });
    });
}

function bindRotationButtons() {
    $$('.rot-btn').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('.rot-btn').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
            state.rotation = parseInt(btn.dataset.rot);
        } else {
            state.rotation = null;
        }
    }));
}

// YouTube IFrame API player instance
let _ytPlayer = null;
let _ytReady = false;

// Called by YouTube IFrame API when ready
window.onYouTubeIframeAPIReady = function() {
    _ytReady = true;
    // If a video is already queued, load it
    if (state.videoUrl) _createYTPlayer(extractYouTubeId(state.videoUrl), 0);
};

function _loadYouTubeAPI() {
    if (document.getElementById('yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

let _autoStopTimer = null;

function _createYTPlayer(videoId, startSec, autoStop = false) {
    const embedDiv = $('video-embed');
    if (!embedDiv) return;

    const adjustedStart = Math.max(0, Math.floor(startSec) - 2);

    embedDiv.innerHTML = '<div id="yt-player-div"></div>';
    embedDiv.classList.add('active');

    if (!_ytReady) return;

    if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }

    _ytPlayer = new YT.Player('yt-player-div', {
        videoId: videoId,
        playerVars: { start: adjustedStart, rel: 0, modestbranding: 1, enablejsapi: 1, autoplay: 1 },
        width: '100%',
        height: '100%',
        events: {
            onReady: (e) => {
                e.target.playVideo();
                const badge = $('video-active-badge');
                if (badge) badge.classList.add('visible');
                _updateTsDisplay();
                if (autoStop) {
                    _autoStopTimer = setTimeout(() => {
                        if (_ytPlayer && typeof _ytPlayer.pauseVideo === 'function') {
                            _ytPlayer.pauseVideo();
                        }
                    }, 4000);
                }
            },
            onStateChange: () => _updateTsDisplay(),
        },
    });
}

function _updateTsDisplay() {
    const disp = $('video-ts-display');
    if (!disp || !_ytPlayer || typeof _ytPlayer.getCurrentTime !== 'function') return;
    const sec = Math.floor(_ytPlayer.getCurrentTime() || 0);
    disp.textContent = '⏱ ' + _formatTs(sec);
    disp.classList.add('visible');
    state.videoTimestamp = sec;
}

function _formatTs(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function bindVideoControls() {
    _loadYouTubeAPI();

    const urlInput = $('video-url-input');
    const loadBtn = $('video-load-btn');

    if (loadBtn) loadBtn.addEventListener('click', () => {
        const url = urlInput?.value.trim();
        if (!url) return;
        const videoId = extractYouTubeId(url);
        if (!videoId) { showToast('Invalid YouTube URL', 'error'); return; }
        state.videoUrl = url;
        state.videoTimestamp = 0;
        _ytPlayer = null;
        _createYTPlayer(videoId, 0);
    });

    // Poll timestamp while page is open (updates state.videoTimestamp live)
    setInterval(() => {
        if (_ytPlayer && typeof _ytPlayer.getCurrentTime === 'function') {
            const sec = Math.floor(_ytPlayer.getCurrentTime() || 0);
            state.videoTimestamp = sec;
            const disp = $('video-ts-display');
            if (disp && disp.classList.contains('visible')) {
                disp.textContent = '⏱ ' + _formatTs(sec);
            }
        }
    }, 500);
}

function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?]+)/,
        /youtube\.com\/embed\/([^&\n?]+)/,
    ];
    for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
    return null;
}

function bindSaveButton() {
    const saveBtn = $('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveAttack);
    const clearBtn = $('clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearCurrent);
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.target.matches('input,textarea,select')) saveAttack();
        if (e.key === 'Escape') clearCurrent();
    });
}

function buildPayload(overrides = {}) {
    const pts = Court.getPoints();
    const steps = activeSteps();
    const ftEnabled = steps.includes('reception');
    const apEnabled = steps.includes('approach');

    // Snapshot current YT position if player is active
    let currentTs = state.videoTimestamp || null;
    if (_ytPlayer && typeof _ytPlayer.getCurrentTime === 'function') {
        currentTs = Math.floor(_ytPlayer.getCurrentTime()) || currentTs;
    }

    return {
        attacker_id: (overrides.attacker_id !== undefined ? overrides.attacker_id : state.selectedAttacker?.id) || null,
        setter_id: overrides.setter_id !== undefined ? overrides.setter_id : (state.selectedSetter || null),
        setter_generic: overrides.setter_generic !== undefined ? overrides.setter_generic : state.setterGeneric,
        rotation: overrides.rotation !== undefined ? overrides.rotation : state.rotation,
        first_touch_type: overrides.first_touch_type !== undefined ? overrides.first_touch_type : (state.firstTouch || null),
        first_touch_generic: overrides.first_touch_generic !== undefined ? overrides.first_touch_generic : (!ftEnabled && !state.firstTouch),
        approach_generic: overrides.approach_generic !== undefined ? overrides.approach_generic : !apEnabled,
        set_speed: overrides.set_speed !== undefined ? overrides.set_speed : state.setSpeed,
        attack_type: overrides.attack_type !== undefined ? overrides.attack_type : state.attackType,
        blocked: overrides.blocked !== undefined ? overrides.blocked : state.blocked,
        block_out: overrides.block_out !== undefined ? overrides.block_out : state.block_out,
        kill: overrides.kill !== undefined ? overrides.kill : state.kill,
        out: overrides.out !== undefined ? overrides.out : state.out,
        notes: overrides.notes !== undefined ? overrides.notes : ($('notes-input')?.value || ''),
        video_url: overrides.video_url !== undefined ? overrides.video_url : (state.videoUrl || null),
        video_timestamp: overrides.video_timestamp !== undefined ? overrides.video_timestamp : currentTs,
        reception_x: overrides.reception_x !== undefined ? overrides.reception_x : pts.reception?.x,
        reception_y: overrides.reception_y !== undefined ? overrides.reception_y : pts.reception?.y,
        set_x: overrides.set_x !== undefined ? overrides.set_x : pts.set?.x,
        set_y: overrides.set_y !== undefined ? overrides.set_y : pts.set?.y,
        approach_start_x: overrides.approach_start_x !== undefined ? overrides.approach_start_x : pts.approach?.x,
        approach_start_y: overrides.approach_start_y !== undefined ? overrides.approach_start_y : pts.approach?.y,
        contact_x: overrides.contact_x !== undefined ? overrides.contact_x : pts.contact?.x,
        contact_y: overrides.contact_y !== undefined ? overrides.contact_y : pts.contact?.y,
        trajectory_end_x: overrides.trajectory_end_x !== undefined ? overrides.trajectory_end_x : pts.trajectory?.x,
        trajectory_end_y: overrides.trajectory_end_y !== undefined ? overrides.trajectory_end_y : pts.trajectory?.y,
    };
}

async function saveAttack() {
    if (!state.selectedAttacker) {
        showToast(L.js_select_attacker || 'Select an attacker first', 'error');
        return;
    }
    const payload = buildPayload();
    const res = await fetch('/attacks/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
    });
    if (res.ok) {
        const attack = await res.json();
        state.attacks.unshift(attack);
        renderActionLog();
        clearCurrent();
        showToast(L.js_attack_saved || 'Attack saved ✓', 'success');
    } else {
        showToast(L.js_save_failed || 'Save failed', 'error');
    }
}

function clearCurrent() {
    Court.reset();
    state.firstTouch = null;
    state.setSpeed = null;
    state.attackType = null;
    state.blocked = false;
    state.block_out = false;
    state.kill = false;
    state.out = false;
    $$('[data-ft],[data-speed],[data-atype]').forEach(b => b.classList.remove('selected'));
    ['btn-kill','btn-blocked','btn-block-out','btn-out'].forEach(id => $(id)?.classList.remove('selected'));
    if ($('notes-input')) $('notes-input').value = '';
}

async function loadAttacks() {
    const res = await fetch('/attacks/');
    state.attacks = await res.json();
    renderActionLog();
}

function resultClass(a) {
    if (a.kill) return 'kill-yes';
    if (a.blocked) return 'a-blocked';
    if (a.block_out) return 'a-block-out';
    if (a.out) return 'a-out';
    return 'a-play';
}

function resultBadgeHtml(a) {
    const res = L.js_result || {kill:'Kill', blocked:'Blocked', 'block-out':'Block Out', out:'Out', play:'Play'};
    if (a.kill) return `<span class="ai-result kill">${res.kill}</span>`;
    if (a.blocked) return `<span class="ai-result blocked">${res.blocked}</span>`;
    if (a.block_out) return `<span class="ai-result block-out">${res['block-out']}</span>`;
    if (a.out) return `<span class="ai-result out">${res.out}</span>`;
    return `<span class="ai-result play">${res.play}</span>`;
}

function renderActionLog() {
    const log = $('action-log');
    if (!log) return;
    log.innerHTML = '';

    if (!state.attacks.length) {
        log.innerHTML = `<div style="padding:12px;color:var(--text-muted);font-size:12px;text-align:center;">${L.js_no_actions || 'No actions recorded'}</div>`;
        return;
    }

    state.attacks.slice(0, 80).forEach(a => {
        const item = document.createElement('div');
        item.className = `action-item ${resultClass(a)}`;
        item.dataset.id = a.id;

        const metaTags = [];
        if (a.attack_type) metaTags.push(`<span class="ai-tag">${a.attack_type}</span>`);
        if (a.set_speed) metaTags.push(`<span class="ai-tag">${a.set_speed}</span>`);
        if (a.first_touch_type && a.first_touch_type !== 'generic')
            metaTags.push(`<span class="ai-tag">${a.first_touch_type}</span>`);
        if (a.rotation) metaTags.push(`<span class="ai-tag">R${a.rotation}</span>`);

        const setterHtml = a.setter_name
            ? `<span class="ai-sep">›</span><span class="ai-setter">${a.setter_name}</span>`
            : '';

        const videoHtml = a.video_url && a.video_timestamp != null
            ? (() => {
                const sec = Math.floor(a.video_timestamp);
                const adjustedSec = Math.max(0, sec - 2);
                const m = Math.floor(sec / 60), s = sec % 60;
                const ts = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                const videoId = extractYouTubeId(a.video_url);
                const href = videoId
                    ? `https://youtube.com/watch?v=${videoId}&t=${adjustedSec}s`
                    : a.video_url;
                return `<a class="ai-video-ts" href="${href}" target="_blank" rel="noopener" title="Open at ${ts}" onclick="event.stopPropagation()">▶ ${ts}</a>`;
              })()
            : '';

        item.innerHTML = `
      <div class="ai-body">
        <div class="ai-top">
          <span class="ai-name">${a.attacker_name || '?'}</span>
          ${a.attack_zone ? `<span class="ai-zone">Z${a.attack_zone}</span>` : ''}
          ${resultBadgeHtml(a)}
          ${videoHtml}
        </div>
        <div class="ai-meta">
          ${metaTags.join('')}${setterHtml}
        </div>
      </div>
      <div class="ai-delete-confirm">
        <button class="ai-confirm-yes">Del</button>
        <button class="ai-confirm-no">No</button>
      </div>
      <button class="ai-edit" title="Edit">✎</button>
      <button class="ai-delete" title="Delete">✕</button>
    `;

        item.querySelector('.ai-body').addEventListener('click', () => reviewAttack(a));
        item.querySelector('.ai-edit').addEventListener('click', e => {
            e.stopPropagation();
            openEditModal(a);
        });
        item.querySelector('.ai-delete').addEventListener('click', e => {
            e.stopPropagation();
            item.classList.add('confirming');
            item.querySelector('.ai-edit').style.visibility = 'hidden';
        });
        item.querySelector('.ai-confirm-yes').addEventListener('click', e => {
            e.stopPropagation();
            deleteAttack(a.id, item);
        });
        item.querySelector('.ai-confirm-no').addEventListener('click', e => {
            e.stopPropagation();
            item.classList.remove('confirming');
            item.querySelector('.ai-edit').style.visibility = '';
        });

        log.appendChild(item);
    });
}

async function deleteAttack(id, itemEl) {
    const res = await fetch(`/attacks/${id}`, {method: 'DELETE'});
    if (res.ok) {
        state.attacks = state.attacks.filter(a => a.id !== id);
        itemEl.style.transition = 'opacity 0.2s, height 0.2s';
        itemEl.style.opacity = '0';
        itemEl.style.height = itemEl.offsetHeight + 'px';
        requestAnimationFrame(() => { itemEl.style.height = '0'; itemEl.style.overflow = 'hidden'; });
        setTimeout(() => renderActionLog(), 220);
        showToast(L.js_deleted || 'Deleted', 'error');
    } else {
        showToast(L.js_delete_failed || 'Delete failed', 'error');
    }
}

function reviewAttack(attack) {
    if (attack.video_url && attack.video_timestamp != null) {
        const urlInput = $('video-url-input');
        if (urlInput) urlInput.value = attack.video_url;

        const videoId = extractYouTubeId(attack.video_url);
        const adjustedStart = Math.max(0, Math.floor(attack.video_timestamp) - 2);

        if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }

        if (videoId && _ytPlayer && typeof _ytPlayer.seekTo === 'function' && state.videoUrl === attack.video_url) {
            // Same video already loaded — just seek and play
            _ytPlayer.seekTo(adjustedStart, true);
            _ytPlayer.playVideo();
            _autoStopTimer = setTimeout(() => {
                if (_ytPlayer && typeof _ytPlayer.pauseVideo === 'function') _ytPlayer.pauseVideo();
            }, 4000);
        } else if (videoId) {
            _ytPlayer = null;
            _createYTPlayer(videoId, attack.video_timestamp, true);
        }

        state.videoUrl = attack.video_url;
        state.videoTimestamp = attack.video_timestamp;
    }
    Court.renderAttackOverlay([attack]);
}

function buildEditModal() {
    if ($('edit-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'edit-modal-overlay';
    overlay.className = 'modal-overlay hidden';
    const ft    = L.ft     || {perfect:'#', positive:'+', exclamative:'!', negative:'-'};
    const spd   = L.speed  || {quick:'Quick', medium:'Medium', high:'High'};
    const at    = L.atype  || {power:'Power', tip:'Tip', 'roll-shot':'Roll-Shot', push:'Push'};
    const res   = L.result || {kill:'Kill', blocked:'Blocked', 'block-out':'Block Out', out:'Out', play:'Play'};

    overlay.innerHTML = `
<div class="modal" style="max-width:520px;width:95%;">
  <h3>Edit Attack</h3>
  <div class="edit-modal-body">

    <div class="form-row">
      <label>${L.attacker || L.js_attacker || 'Attacker'}</label>
      <select id="em-attacker" class="form-select"></select>
    </div>

    <div class="form-row">
      <label>${L.setter || L.js_setter || 'Setter'}</label>
      <select id="em-setter" class="form-select"></select>
    </div>
    <div class="form-row">
      <label></label>
      <label class="toggle-label">
        <input type="checkbox" id="em-setter-generic"> ${L.js_generic || 'Generic'}
      </label>
    </div>

    <div class="form-row">
      <label>${L.js_rotation || 'Rotation'}</label>
      <div class="rotation-grid" id="em-rotation-grid">
        ${[1,6,5,4,3,2].map(r=>`<button class="rot-btn em-rot-btn" data-rot="${r}">${r}</button>`).join('')}
      </div>
    </div>

    <div class="form-row">
      <label>${L.js_firstTouch || 'First Touch'}</label>
      <div class="tag-row">
        <button class="tag-btn em-ft" data-ft="perfect">${ft.perfect}</button>
        <button class="tag-btn em-ft" data-ft="positive">${ft.positive}</button>
        <button class="tag-btn em-ft" data-ft="exclamative">${ft.exclamative}</button>
        <button class="tag-btn em-ft" data-ft="negative">${ft.negative}</button>
      </div>
      <label class="toggle-label" style="margin-top:4px;">
        <input type="checkbox" id="em-ft-generic"> ${L.js_generic || 'Generic'}
      </label>
    </div>

    <div class="form-row">
      <label>${L.js_setSpeed || 'Set Speed'}</label>
      <div class="tag-row">
        <button class="tag-btn em-speed" data-speed="quick">${spd.quick}</button>
        <button class="tag-btn em-speed" data-speed="medium">${spd.medium}</button>
        <button class="tag-btn em-speed" data-speed="high">${spd.high}</button>
      </div>
    </div>

    <div class="form-row">
      <label>${L.js_attackType || 'Attack Type'}</label>
      <div class="tag-row">
        <button class="tag-btn em-atype" data-atype="power">${at.power}</button>
        <button class="tag-btn em-atype" data-atype="tip">${at.tip}</button>
        <button class="tag-btn em-atype" data-atype="roll-shot">${at['roll-shot']}</button>
        <button class="tag-btn em-atype" data-atype="push">${at.push}</button>
      </div>
    </div>

    <div class="form-row">
      <label>${L.result_label || 'Result'}</label>
      <div class="tag-row">
        <button class="tag-btn em-result" id="em-kill">${res.kill}</button>
        <button class="tag-btn em-result" id="em-blocked">${res.blocked}</button>
        <button class="tag-btn em-result" id="em-block-out">${res['block-out']}</button>
        <button class="tag-btn em-result" id="em-out">${res.out}</button>
        <button class="tag-btn em-result" id="em-play">${res.play}</button>
      </div>
    </div>

    <div class="form-row">
      <label>${L.js_notes || 'Notes'}</label>
      <textarea id="em-notes" class="notes-input" rows="2"></textarea>
    </div>

  </div>
  <div class="modal-actions">
    <button type="button" id="em-cancel" class="btn-secondary">${L.js_cancel || 'Cancel'}</button>
    <button type="button" id="em-save" class="btn-primary">${L.js_save || 'Save'}</button>
  </div>
</div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) closeEditModal(); });
    $('em-cancel').addEventListener('click', closeEditModal);

    $$('.em-rot-btn').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('.em-rot-btn').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) btn.classList.add('selected');
    }));

    $('em-setter-generic').addEventListener('change', e => {
        $('em-setter').disabled = e.target.checked;
    });

    $('em-ft-generic').addEventListener('change', e => {
        $$('.em-ft').forEach(b => { b.disabled = e.target.checked; b.classList.remove('selected'); });
    });

    $$('.em-ft').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('.em-ft').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) {
            btn.classList.add('selected');
            $('em-ft-generic').checked = false;
        }
    }));

    $$('.em-speed').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('.em-speed').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) btn.classList.add('selected');
    }));

    $$('.em-atype').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('.em-atype').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) btn.classList.add('selected');
    }));

    $$('.em-result').forEach(btn => btn.addEventListener('click', () => {
        const wasSelected = btn.classList.contains('selected');
        $$('.em-result').forEach(b => b.classList.remove('selected'));
        if (!wasSelected) btn.classList.add('selected');
    }));

    $('em-save').addEventListener('click', saveEditModal);
}

let _editingAttackId = null;

function openEditModal(attack) {
    _editingAttackId = attack.id;
    buildEditModal();

    const atkSel = $('em-attacker');
    atkSel.innerHTML = '';
    state.players.filter(p => p.role !== 'Setter').forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `#${p.number} ${p.surname}`;
        atkSel.appendChild(opt);
    });
    atkSel.value = attack.attacker_id;

    const setSel = $('em-setter');
    setSel.innerHTML = `<option value="">${L.js_no_setter || '— No setter —'}</option>`;
    state.players.filter(p => p.role === 'Setter').forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `#${p.number} ${p.surname}`;
        setSel.appendChild(opt);
    });
    setSel.value = attack.setter_id || '';
    $('em-setter-generic').checked = !!attack.setter_generic;
    setSel.disabled = !!attack.setter_generic;

    $$('.em-rot-btn').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.rot) === attack.rotation));

    $('em-ft-generic').checked = !!attack.first_touch_generic;
    $$('.em-ft').forEach(b => {
        b.classList.toggle('selected', b.dataset.ft === attack.first_touch_type && !attack.first_touch_generic);
        b.disabled = !!attack.first_touch_generic;
    });

    $$('.em-speed').forEach(b => b.classList.toggle('selected', b.dataset.speed === attack.set_speed));
    $$('.em-atype').forEach(b => b.classList.toggle('selected', b.dataset.atype === attack.attack_type));

    $$('.em-result').forEach(b => b.classList.remove('selected'));
    if (attack.kill) $('em-kill')?.classList.add('selected');
    else if (attack.blocked) $('em-blocked')?.classList.add('selected');
    else if (attack.block_out) $('em-block-out')?.classList.add('selected');
    else if (attack.out) $('em-out')?.classList.add('selected');
    else $('em-play')?.classList.add('selected');

    $('em-notes').value = attack.notes || '';

    $('edit-modal-overlay').classList.remove('hidden');
}

function closeEditModal() {
    $('edit-modal-overlay')?.classList.add('hidden');
    _editingAttackId = null;
}

async function saveEditModal() {
    if (!_editingAttackId) return;

    const attackerSel = $('em-attacker');
    const setterSel = $('em-setter');
    const setterGeneric = $('em-setter-generic').checked;
    const ftGeneric = $('em-ft-generic').checked;
    const rotBtn = document.querySelector('.em-rot-btn.selected');
    const ftBtn = document.querySelector('.em-ft.selected');
    const speedBtn = document.querySelector('.em-speed.selected');
    const atypeBtn = document.querySelector('.em-atype.selected');
    const resultBtn = document.querySelector('.em-result.selected');

    const resultId = resultBtn?.id || 'em-play';
    const kill = resultId === 'em-kill';
    const blocked = resultId === 'em-blocked';
    const block_out = resultId === 'em-block-out';
    const out = resultId === 'em-out';

    const existing = state.attacks.find(a => a.id === _editingAttackId) || {};

    const payload = {
        attacker_id: parseInt(attackerSel.value),
        setter_id: setterGeneric ? null : (parseInt(setterSel.value) || null),
        setter_generic: setterGeneric,
        rotation: rotBtn ? parseInt(rotBtn.dataset.rot) : (existing.rotation || null),
        first_touch_type: ftGeneric ? 'generic' : (ftBtn?.dataset.ft || null),
        first_touch_generic: ftGeneric,
        approach_generic: existing.approach_generic || false,
        set_speed: speedBtn?.dataset.speed || null,
        attack_type: atypeBtn?.dataset.atype || null,
        kill, blocked, block_out, out,
        notes: $('em-notes').value,
        video_url: existing.video_url || null,
        video_timestamp: existing.video_timestamp || null,
        reception_x: existing.reception_x, reception_y: existing.reception_y,
        set_x: existing.set_x, set_y: existing.set_y,
        approach_start_x: existing.approach_start_x, approach_start_y: existing.approach_start_y,
        contact_x: existing.contact_x, contact_y: existing.contact_y,
        trajectory_end_x: existing.trajectory_end_x, trajectory_end_y: existing.trajectory_end_y,
    };

    const res = await fetch(`/attacks/${_editingAttackId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
    });

    if (res.ok) {
        const updated = await res.json();
        const idx = state.attacks.findIndex(a => a.id === _editingAttackId);
        if (idx !== -1) state.attacks[idx] = updated;
        renderActionLog();
        closeEditModal();
        showToast(L.js_attack_updated || 'Attack updated ✓', 'success');
    } else {
        showToast(L.js_update_failed || 'Update failed', 'error');
    }
}

function bindPlayerModal() {
    const openBtn = $('open-player-modal');
    const overlay = $('player-modal-overlay');
    const closeBtn = $('modal-close-btn');
    const form = $('player-form');

    if (openBtn) openBtn.addEventListener('click', () => overlay?.classList.remove('hidden'));
    if (closeBtn) closeBtn.addEventListener('click', () => overlay?.classList.add('hidden'));
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });

    if (form) form.addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
            number: parseInt($('f-number').value),
            surname: $('f-surname').value.trim(),
            name: $('f-name').value.trim(),
            role: $('f-role').value,
            height: parseInt($('f-height').value) || null,
        };
        const res = await fetch('/players/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data),
        });
        if (res.ok) {
            await loadPlayers();
            overlay?.classList.add('hidden');
            form.reset();
            showToast(L.js_player_added || 'Player added ✓', 'success');
        }
    });
}

function showToast(msg, type = '') {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}