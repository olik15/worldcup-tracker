const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const URGENCY_ORDER  = ['overdue', 'today', 'this-week', 'upcoming', 'no-date', 'done'];
const URGENCY_LABELS = {
  overdue:    'Overdue',
  today:      'Due Today',
  'this-week': 'This Week',
  upcoming:   'Upcoming',
  'no-date':  'No Date',
  done:       'Done',
};
const AREA_LABELS = { school: 'School', work: 'Work', personal: 'Personal', event: 'Event' };

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function classifyItem(item, today) {
  if (item.done) return 'done';
  const due = item.due;
  if (!due || !ISO_RE.test(due)) return 'no-date';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due < addDays(today, 7)) return 'this-week';
  return 'upcoming';
}

function daysDiff(dueStr, todayStr) {
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [dy, dm, dd] = dueStr.split('-').map(Number);
  return Math.round((new Date(dy, dm - 1, dd) - new Date(ty, tm - 1, td)) / 86400000);
}

function formatDue(dueStr) {
  const [y, m, d] = dueStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function deltaLabel(item, urgency, today) {
  if (urgency === 'today') return 'Today';
  if (!item.due || urgency === 'no-date' || urgency === 'done') return '';
  const diff = daysDiff(item.due, today);
  const abs = Math.abs(diff);
  if (diff < 0) return `${abs} day${abs !== 1 ? 's' : ''} ago`;
  return `in ${diff} day${diff !== 1 ? 's' : ''}`;
}

function groupByUrgency(items, today) {
  const groups = Object.fromEntries(URGENCY_ORDER.map(k => [k, []]));
  items.forEach(item => groups[classifyItem(item, today)].push(item));
  URGENCY_ORDER.forEach(k => {
    groups[k].sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });
  });
  return groups;
}

function renderGroup(key, items, today) {
  if (!items.length) return '';
  const cards = items.map(item => {
    const area    = AREA_LABELS[item.area] ?? item.area;
    const due     = item.due ? formatDue(item.due) : '';
    const delta   = deltaLabel(item, key, today);
    const notes   = item.notes ? `<span class="item-notes">${item.notes}</span>` : '';
    const duePart = due   ? `<span class="item-due-date">${due}</span>` : '';
    const dltPart = delta ? `<span class="item-delta">${delta}</span>` : '';
    return `<div class="item-card urgency-${key}">
      <div class="item-main">
        <span class="area-tag area-${item.area}">${area}</span>
        <span class="item-title">${item.title}</span>
        ${notes}
      </div>
      <div class="item-meta">${duePart}${dltPart}</div>
    </div>`;
  }).join('');
  return `<section class="urgency-group group-${key}">
    <div class="group-header">
      <span class="group-label">${URGENCY_LABELS[key]}</span>
      <span class="group-count">${items.length}</span>
    </div>
    <div class="items-list">${cards}</div>
  </section>`;
}

async function init() {
  const today = todayLocal();

  const crumb = document.getElementById('today-crumb');
  if (crumb) crumb.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let data;
  try {
    const res = await fetch('data/items.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    document.getElementById('board').innerHTML =
      '<p class="error-msg">Could not load data. Open via an HTTP server, not file://</p>';
    return;
  }

  const groups = groupByUrgency(data.items, today);

  const meta = document.getElementById('meta-stats');
  if (meta) {
    const parts = [];
    if (groups.overdue.length)      parts.push(`${groups.overdue.length} overdue`);
    if (groups.today.length)        parts.push(`${groups.today.length} due today`);
    if (groups['this-week'].length) parts.push(`${groups['this-week'].length} this week`);
    meta.innerHTML = parts.length ? parts.join('<br>') : 'nothing urgent';
  }

  const board = document.getElementById('board');
  const html = URGENCY_ORDER.map(k => renderGroup(k, groups[k], today)).join('');
  board.innerHTML = html || '<p class="empty-msg">No items yet — add some to dashboard/data/items.json</p>';
}

init();
