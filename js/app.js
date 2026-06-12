async function init() {
  let data;
  try {
    const res = await fetch('data/predictions.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    document.querySelector('main').innerHTML =
      '<p style="padding:32px;color:#902020;font-family:\'JetBrains Mono\',monospace;font-size:12px">⚠ Could not load data. Open via an HTTP server, not file://</p>';
    return;
  }

  setupTabs();
  renderLeaderboard(data);
  renderMatches(data);
  renderBonus(data);
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

function outcome(h, a) {
  return h > a ? 'H' : a > h ? 'A' : 'D';
}

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
  const sorted = [...data.players].sort((a, b) => totals[b.id].total - totals[a.id].total);
  const medals = ['01', '02', '03', '04', '05'];
  const played = data.matches.filter(m => m.result).length;

  let html = `<table class="lb-table">
    <thead><tr>
      <th></th><th>Player</th>
      <th>Matches</th><th>Bonus</th><th style="text-align:right">Total</th>
    </tr></thead><tbody>`;

  sorted.forEach(({ id }, i) => {
    const { mp, bp, total } = totals[id];
    const bpStr = bp !== null && bp !== undefined ? bp : '—';
    html += `<tr>
      <td class="lb-rank">${medals[i]}</td>
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
  let html = '';
  let idx = 0;

  data.matches.forEach(match => {
    idx++;
    const r = match.result;
    const num = String(idx).padStart(2, '0');
    const scoreTxt = r ? `${r[0]} – ${r[1]}` : 'TBD';
    const scoreClass = r ? 'match-score' : 'match-score tbd';
    const home = data.teams[match.home] ?? match.home;
    const away = data.teams[match.away] ?? match.away;

    html += `<div class="match-row">
      <div class="match-num">G${match.group}<br>${num}</div>
      <div>
        <div class="match-header">
          <span class="team-name">${home}</span>
          <span class="match-vs">vs</span>
          <span class="team-name">${away}</span>
          <span class="${scoreClass}">${scoreTxt}</span>
        </div>
        <div class="preds-row">`;

    data.players.forEach(({ id }) => {
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

  document.getElementById('matches').innerHTML = html;
}

/* ── Bonus ──────────────────────────────────────────── */
function renderBonus(data) {
  let html = '';

  data.bonus.questions.forEach(({ id, label }, i) => {
    const num = String(i + 1).padStart(2, '0');
    html += `<div class="bonus-row">
      <div class="bonus-num">${num}</div>
      <div>
        <div class="bonus-q-label">${label}</div>
        <div class="bonus-answers">`;

    data.players.forEach(({ id: pid }) => {
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

  // Bonus scores section
  html += `<div class="bonus-scores-row">
    <div class="bonus-scores-title">Bonus scores</div>`;
  data.players.forEach(({ id }) => {
    const score = data.bonus.scores[id];
    const pts = score !== null && score !== undefined
      ? `<span class="bonus-score-pts">${score}</span>`
      : `<span class="bonus-score-na">TBD</span>`;
    html += `<div class="bonus-score-item"><span>${id}</span>${pts}</div>`;
  });
  html += '</div>';

  document.getElementById('bonus').innerHTML = html;
}

init();
