let activeFilters = new Set();
let _data = null;

async function init() {
  try {
    const res = await fetch('data/predictions.json');
    if (!res.ok) throw new Error(res.status);
    _data = await res.json();
  } catch (e) {
    document.querySelector('main').innerHTML =
      '<p style="padding:32px;color:#902020;font-family:\'JetBrains Mono\',monospace;font-size:12px">⚠ Could not load data. Open via an HTTP server, not file://</p>';
    return;
  }

  activeFilters = new Set(_data.players.map(p => p.id));

  const meta = document.getElementById('meta-stats');
  if (meta) meta.innerHTML = `${_data.players.length} players<br>${_data.matches.length} matches<br>+1 result · +3 exact`;

  setupTabs();
  renderFilterBar(_data);
  renderAll();
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

function renderFilterBar(data) {
  const bar = document.getElementById('filter-bar');
  let html = '<span class="filter-label">Show</span>';
  data.players.forEach(({ id }) => {
    html += `<button class="filter-chip active" data-player="${id}">${id}</button>`;
  });
  bar.innerHTML = html;

  bar.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.player;
      if (activeFilters.has(pid)) {
        if (activeFilters.size > 1) {
          activeFilters.delete(pid);
          btn.classList.remove('active');
        }
      } else {
        activeFilters.add(pid);
        btn.classList.add('active');
      }
      renderAll();
    });
  });
}

function renderAll() {
  renderLeaderboard(_data);
  renderMatches(_data);
  renderBonus(_data);
  renderPlayoffs(_data);
}

function visiblePlayers(data) {
  return data.players.filter(p => activeFilters.has(p.id));
}

/* ── Scoring ────────────────────────────────────────── */
function outcome(h, a) { return h > a ? 'H' : a > h ? 'A' : 'D'; }

function matchPts(match, pid) {
  const r = match.result;
  if (!r) return null;
  const p = match.predictions[pid];
  if (!p) return null;
  if (p[0] === r[0] && p[1] === r[1]) return 3;
  if (outcome(p[0], p[1]) === outcome(r[0], r[1])) return 1;
  return 0;
}

function calcTotals(data) {
  return Object.fromEntries(data.players.map(({ id }) => {
    let mp = 0;
    data.matches.forEach(m => { const pts = matchPts(m, id); if (pts !== null) mp += pts; });
    const bp = data.bonus.scores[id];
    return [id, { mp, bp, total: mp + (bp ?? 0) }];
  }));
}

/* ── Leaderboard ────────────────────────────────────── */
function renderLeaderboard(data) {
  const totals = calcTotals(data);
  const players = visiblePlayers(data);
  const sorted = [...players].sort((a, b) => totals[b.id].total - totals[a.id].total);
  const played = data.matches.filter(m => m.result).length;

  let html = `<table class="lb-table">
    <thead><tr>
      <th></th><th>Player</th>
      <th>Matches</th><th>Bonus</th><th style="text-align:right">Total</th>
    </tr></thead><tbody>`;

  sorted.forEach(({ id }, i) => {
    const { mp, bp, total } = totals[id];
    const bpStr = bp !== null && bp !== undefined ? bp : '—';
    const rank = String(i + 1).padStart(2, '0');
    html += `<tr>
      <td class="lb-rank">${rank}</td>
      <td class="lb-name">${id}</td>
      <td class="lb-sub">${mp} pts</td>
      <td class="lb-sub">${bpStr}</td>
      <td class="lb-total">${total}</td>
    </tr>`;
  });

  html += `</tbody></table>
    <p class="status-line">${played} of ${data.matches.length} matches played</p>`;
  document.getElementById('leaderboard').innerHTML = html;
}

/* ── Matches ────────────────────────────────────────── */
function renderMatches(data) {
  const players = visiblePlayers(data);
  const rounds = [...new Set(data.matches.map(m => m.round))].sort();

  const totals = Object.fromEntries(players.map(({ id }) => {
    let pts = 0;
    data.matches.forEach(m => { const p = matchPts(m, id); if (p !== null) pts += p; });
    return [id, pts];
  }));

  let html = `<div class="matches-pts-bar">`;
  players.forEach(({ id }) => {
    html += `<div class="mpts-cell">
      <div class="mpts-name">${id}</div>
      <div class="mpts-val">${totals[id]}</div>
    </div>`;
  });
  html += `</div>`;

  const matchBtn = document.querySelector('.tab-btn[data-tab="matches"]');
  const totalPts = players.reduce((s, { id }) => s + totals[id], 0);
  if (matchBtn) matchBtn.textContent = totalPts > 0 ? `Matches · ${totalPts}` : 'Matches';

  rounds.forEach(round => {
    const roundMatches = data.matches.filter(m => m.round === round);
    html += `<div class="round-header">Round ${round}</div>`;
    let idx = 0;

    roundMatches.forEach(match => {
      idx++;
      const r = match.result;
      const num = String(idx).padStart(2, '0');
      const scoreTxt = r ? `${r[0]} – ${r[1]}` : 'TBD';
      const scoreClass = r ? 'match-score' : 'match-score tbd';
      const home = data.teams[match.home] ?? match.home;
      const away = data.teams[match.away] ?? match.away;

      html += `<div class="match-row">
        <div class="match-num">${match.group}${num}</div>
        <div>
          <div class="match-header">
            <span class="team-name">${home}</span>
            <span class="match-vs">vs</span>
            <span class="team-name">${away}</span>
            <span class="${scoreClass}">${scoreTxt}</span>
          </div>
          <div class="preds-row">`;

      players.forEach(({ id }) => {
        const pred = match.predictions[id];
        if (!pred) {
          html += `<div class="pred-cell">
            <div class="pred-player">${id}</div>
            <div class="pred-val c-null">—</div>
          </div>`;
          return;
        }
        const pts = matchPts(match, id);
        let cls = 'c-pending', badge = '';
        if (pts === 3)      { cls = 'c-exact';   badge = `<div class="pred-pts pts-exact">+3</div>`; }
        else if (pts === 1) { cls = 'c-correct'; badge = `<div class="pred-pts pts-correct">+1</div>`; }
        else if (pts === 0) { cls = 'c-wrong';   badge = `<div class="pred-pts pts-wrong">+0</div>`; }

        html += `<div class="pred-cell">
          <div class="pred-player">${id}</div>
          <div class="pred-val ${cls}">${pred[0]}–${pred[1]}</div>
          ${badge}
        </div>`;
      });

      html += `</div></div></div>`;
    });
  });

  document.getElementById('matches').innerHTML = html;
}

/* ── Bonus ──────────────────────────────────────────── */
function renderBonus(data) {
  const players = visiblePlayers(data);
  let html = '';

  data.bonus.questions.forEach(({ id, label }, i) => {
    const num = String(i + 1).padStart(2, '0');
    html += `<div class="bonus-row">
      <div class="bonus-num">${num}</div>
      <div>
        <div class="bonus-q-label">${label}</div>
        <div class="bonus-answers">`;

    players.forEach(({ id: pid }) => {
      const ans = data.bonus.predictions[pid]?.[id];
      const val = ans != null
        ? `<span class="bonus-val">${ans}</span>`
        : `<span class="bonus-null">—</span>`;
      html += `<div class="bonus-ans">
        <div class="bonus-player">${pid}</div>
        ${val}
      </div>`;
    });

    html += `</div></div></div>`;
  });

  html += `<div class="bonus-scores-row">
    <div class="bonus-scores-title">Bonus scores</div>`;
  players.forEach(({ id }) => {
    const score = data.bonus.scores[id];
    const pts = score !== null && score !== undefined
      ? `<span class="bonus-score-pts">${score}</span>`
      : `<span class="bonus-score-na">TBD</span>`;
    html += `<div class="bonus-score-item"><span>${id}</span>${pts}</div>`;
  });
  html += '</div>';

  document.getElementById('bonus').innerHTML = html;
}

/* ── Playoffs ───────────────────────────────────────── */
function renderPlayoffs(data) {
  const po = data.playoffs;
  if (!po) return;

  const scoring = po.scoring;
  const results = po.results;
  const players = po.players;

  function isCorrect(pick, resultList) {
    if (!pick || !resultList || resultList.length === 0) return false;
    return resultList.includes(pick);
  }

  function isWrong(pick, resultList) {
    if (!pick) return false;
    if (!resultList || resultList.length === 0) return false;
    return !resultList.includes(pick);
  }

  function pickClass(pick, correctList, isChampion) {
    if (!pick) return 'po-null';
    if (!correctList || correctList.length === 0) return 'po-pending';
    if (isCorrect(pick, correctList)) return isChampion ? 'po-correct-champion' : 'po-correct';
    return 'po-wrong';
  }

  function calcPoPoints(pid) {
    const preds = po.predictions[pid];
    if (!preds) return 0;
    let pts = 0;

    if (results.champion && preds.champion === results.champion) pts += scoring.champion;
    if (results.runner_up && preds.runner_up === results.runner_up) pts += scoring.runner_up;

    const semis = results.semi_finalists || [];
    (preds.semi_finalists || []).forEach(t => { if (t && semis.includes(t)) pts += scoring.semi_finalist; });

    const qfs = results.quarter_finalists || [];
    (preds.quarter_finalists || []).forEach(t => { if (t && qfs.includes(t)) pts += scoring.quarter_finalist; });

    return pts;
  }

  function renderPick(pick, correctList, isChampion) {
    const cls = pickClass(pick, correctList, isChampion);
    const displayName = pick || 'TBD';
    const displayCls = pick ? cls : 'po-null';
    const displayText = pick ? pick : 'TBD';

    let badge = '';
    if (pick && correctList && correctList.length > 0) {
      if (isCorrect(pick, correctList)) {
        const amount = isChampion ? scoring.champion
          : correctList === [results.runner_up] ? scoring.runner_up
          : 0;
        badge = `<span class="po-pts-badge po-pts-green">✓</span>`;
      } else {
        badge = `<span class="po-pts-badge po-pts-muted">✗</span>`;
      }
    }

    if (isChampion) {
      return `<div class="po-pick po-pick-champion ${displayCls}">${displayText}${badge}</div>`;
    }
    return `<div class="po-pick ${displayCls}">${displayText}${badge}</div>`;
  }

  const champResult = results.champion ? [results.champion] : [];
  const runnerResult = results.runner_up ? [results.runner_up] : [];
  const semisResult = results.semi_finalists || [];
  const qfsResult = results.quarter_finalists || [];

  let html = `
    <div class="po-header">
      <div class="po-header-label">Knockout stage predictions</div>
      <h2 class="po-header-title">The <em>playoffs.</em></h2>
      <div class="po-header-sub">Oliver · Shaun · Dad · Claude &nbsp;·&nbsp; Max 48 pts per player</div>
      <div class="po-scoring-note">
        <div class="po-scoring-item"><strong>20</strong> Champion</div>
        <div class="po-scoring-item"><strong>10</strong> Runner-up</div>
        <div class="po-scoring-item"><strong>5</strong> Semi-finalist</div>
        <div class="po-scoring-item"><strong>2</strong> Quarter-finalist</div>
      </div>
    </div>
    <div class="po-grid">`;

  players.forEach(pid => {
    const preds = po.predictions[pid] || {};
    const pts = calcPoPoints(pid);

    const champPick = preds.champion || null;
    const runnerPick = preds.runner_up || null;
    const semiPicks = preds.semi_finalists || [null, null];
    const qfPicks = preds.quarter_finalists || [null, null, null, null];

    html += `<div class="po-col">
      <div class="po-col-head">
        <div class="po-col-name">${pid}</div>
        <div class="po-col-pts">${pts}</div>
      </div>

      <div class="po-section">
        <div class="po-section-label">Champion <span>+20</span></div>
        ${renderPick(champPick, champResult, true)}
      </div>

      <div class="po-section">
        <div class="po-section-label">Runner-up <span>+10</span></div>
        ${renderPick(runnerPick, runnerResult, false)}
      </div>

      <div class="po-section">
        <div class="po-section-label">Semi-finalists <span>+5 ea.</span></div>
        ${semiPicks.map(t => renderPick(t, semisResult, false)).join('')}
      </div>

      <div class="po-section">
        <div class="po-section-label">Quarter-finalists <span>+2 ea.</span></div>
        ${qfPicks.map(t => renderPick(t, qfsResult, false)).join('')}
      </div>
    </div>`;
  });

  html += `</div>`;

  // Render knockout round match tables
  if (po.rounds && po.rounds.length) {
    po.rounds.forEach(round => {
      html += `<div class="po-round-section">
        <div class="po-round-header">${round.label}</div>`;

      round.matches.forEach(match => {
        const home = data.teams[match.home] ?? match.home;
        const away = data.teams[match.away] ?? match.away;
        const r = match.result;
        const scoreTxt = r ? `${r[0]} – ${r[1]}` : 'TBD';
        const scoreClass = r ? 'po-match-result' : 'po-match-result tbd';

        html += `<div class="po-match-row">
          <div class="po-match-teams">
            <span class="po-team">${home}</span>
            <span class="po-vs">vs</span>
            <span class="po-team">${away}</span>
            <span class="${scoreClass}">${scoreTxt}</span>
          </div>
          <div class="po-match-preds">`;

        players.forEach(pid => {
          const pred = match.preds[pid];
          if (!pred) {
            html += `<div class="po-mpred">
              <div class="po-mpred-name">${pid}</div>
              <div class="po-mpred-val c-null">—</div>
            </div>`;
            return;
          }
          let cls = 'c-pending', badge = '';
          if (r) {
            const predWinner = pred[0] > pred[1] ? 'H' : pred[0] < pred[1] ? 'A' : 'D';
            const realWinner = r[0] > r[1] ? 'H' : r[0] < r[1] ? 'A' : 'D';
            if (pred[0] === r[0] && pred[1] === r[1]) {
              cls = 'c-exact'; badge = `<div class="pred-pts pts-exact">+3</div>`;
            } else if (predWinner === realWinner) {
              cls = 'c-correct'; badge = `<div class="pred-pts pts-correct">+1</div>`;
            } else {
              cls = 'c-wrong'; badge = `<div class="pred-pts pts-wrong">+0</div>`;
            }
          }
          html += `<div class="po-mpred">
            <div class="po-mpred-name">${pid}</div>
            <div class="po-mpred-val ${cls}">${pred[0]}–${pred[1]}</div>
            ${badge}
          </div>`;
        });

        html += `</div></div>`;
      });

      html += `</div>`;
    });
  }

  document.getElementById('playoffs').innerHTML = html;
}

init();
