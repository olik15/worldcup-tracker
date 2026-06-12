async function init() {
  let data;
  try {
    const res = await fetch('data/predictions.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    document.querySelector('main').innerHTML =
      '<p style="color:#f85149;padding:32px;text-align:center">⚠️ Could not load data. Open via an HTTP server, not file://</p>';
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

/* ── Leaderboard ─────────────────────────────────────── */
function renderLeaderboard(data) {
  const totals = calcTotals(data);
  const sorted = [...data.players].sort((a, b) => totals[b.id].total - totals[a.id].total);
  const medals = ['🥇', '🥈', '🥉'];
  const played = data.matches.filter(m => m.result).length;

  let html = `<table class="lb-table">
    <thead><tr>
      <th>#</th><th>Player</th>
      <th>Match Pts</th><th>Bonus Pts</th><th>Total</th>
    </tr></thead><tbody>`;

  sorted.forEach(({ id }, i) => {
    const { mp, bp, total } = totals[id];
    const rank = i + 1;
    const medal = medals[i] ?? rank;
    const bpDisplay = bp !== null && bp !== undefined ? bp : '—';
    html += `<tr>
      <td class="lb-rank">${medal}</td>
      <td class="lb-name">${id}</td>
      <td>${mp}</td>
      <td class="lb-sub">${bpDisplay}</td>
      <td class="lb-total">${total}</td>
    </tr>`;
  });

  html += `</tbody></table>
    <p class="status-line">${played} / ${data.matches.length} matches played</p>`;
  document.getElementById('leaderboard').innerHTML = html;
}

/* ── Matches ─────────────────────────────────────────── */
function renderMatches(data) {
  const groups = [...new Set(data.matches.map(m => m.group))];
  let html = '';

  groups.forEach(g => {
    html += `<div class="group-section"><div class="group-label">Group ${g}</div>`;
    data.matches.filter(m => m.group === g).forEach(match => {
      const r = match.result;
      const scoreTxt = r ? `${r[0]} – ${r[1]}` : 'TBD';
      const scoreClass = r ? 'match-score' : 'match-score tbd';
      const homeName = data.teams[match.home] ?? match.home;
      const awayName = data.teams[match.away] ?? match.away;

      html += `<div class="match-card">
        <div class="match-header">
          <div class="team-home">
            <div class="team-name">${homeName}</div>
            <div class="team-code">${match.home}</div>
          </div>
          <div class="${scoreClass}">${scoreTxt}</div>
          <div class="team-away">
            <div class="team-name">${awayName}</div>
            <div class="team-code">${match.away}</div>
          </div>
        </div>
        <div class="preds-row">`;

      data.players.forEach(({ id }) => {
        const pred = match.predictions[id];
        if (!pred) {
          html += `<div class="pred-cell">
            <div class="pred-player">${id}</div>
            <div class="pred-val c-null">TBD</div>
          </div>`;
          return;
        }
        const pts = matchPts(match, id);
        let cls = 'c-pending', badge = '';
        if (pts === 3) { cls = 'c-exact';   badge = `<div class="pred-pts c-exact">+3 ⭐</div>`; }
        else if (pts === 1) { cls = 'c-correct'; badge = `<div class="pred-pts c-correct">+1 ✓</div>`; }
        else if (pts === 0) { cls = 'c-wrong';   badge = `<div class="pred-pts c-wrong">+0 ✗</div>`; }

        html += `<div class="pred-cell">
          <div class="pred-player">${id}</div>
          <div class="pred-val ${cls}">${pred[0]}–${pred[1]}</div>
          ${badge}
        </div>`;
      });

      html += `</div></div>`;
    });
    html += '</div>';
  });

  document.getElementById('matches').innerHTML = html;
}

/* ── Bonus ───────────────────────────────────────────── */
function renderBonus(data) {
  let html = '<div class="bonus-grid">';

  data.bonus.questions.forEach(({ id, label }) => {
    html += `<div class="bonus-card">
      <div class="bonus-q">${label}</div>
      <div class="bonus-answers">`;
    data.players.forEach(({ id: pid }) => {
      const ans = data.bonus.predictions[pid]?.[id];
      const val = ans != null
        ? `<span class="bonus-val">${ans}</span>`
        : `<span class="bonus-null">TBD</span>`;
      html += `<div class="bonus-ans">
        <div class="bonus-player">${pid}</div>
        ${val}
      </div>`;
    });
    html += `</div></div>`;
  });

  html += '</div>';

  html += `<div class="bonus-scores">
    <div class="bonus-scores-header">Bonus Scores (awarded manually)</div>`;
  data.players.forEach(({ id }) => {
    const score = data.bonus.scores[id];
    const display = score !== null && score !== undefined
      ? `<span class="bonus-score-pts">${score} pts</span>`
      : `<span class="bonus-score-na">—</span>`;
    html += `<div class="bonus-score-row"><span>${id}</span>${display}</div>`;
  });
  html += '</div>';

  document.getElementById('bonus').innerHTML = html;
}

init();
