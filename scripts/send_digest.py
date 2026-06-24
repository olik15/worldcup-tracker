#!/usr/bin/env python3
"""Send daily life dashboard digest email via Resend API."""
import json, os, re, sys, urllib.request, urllib.error
from datetime import date, timedelta

RESEND_API_KEY    = os.environ['RESEND_API_KEY']
DIGEST_TO_EMAIL   = os.environ['DIGEST_TO_EMAIL']
DIGEST_FROM_EMAIL = os.environ.get('DIGEST_FROM_EMAIL', 'onboarding@resend.dev')

DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'data', 'items.json')

ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
AREA_LABELS = {'school': 'School', 'work': 'Work', 'personal': 'Personal', 'event': 'Event'}
URGENCY_COLORS = {'overdue': '#902020', 'today': '#b85c00', 'this-week': '#7a6200'}


def classify(item, today):
    if item.get('done'):
        return 'done'
    due = item.get('due')
    if not due or not ISO_RE.match(due):
        return 'no-date'
    try:
        due_date = date.fromisoformat(due)
    except ValueError:
        return 'no-date'
    if due_date < today:     return 'overdue'
    if due_date == today:    return 'today'
    if due_date < today + timedelta(days=7): return 'this-week'
    return 'upcoming'


def delta_label(item, urgency, today):
    if urgency == 'today':
        return 'Today'
    due = item.get('due')
    if not due:
        return ''
    try:
        due_date = date.fromisoformat(due)
    except ValueError:
        return ''
    diff = (due_date - today).days
    if diff < 0:
        n = abs(diff)
        return f"{n} day{'s' if n != 1 else ''} ago"
    return f"in {diff} day{'s' if diff != 1 else ''}"


def format_due(due_str):
    try:
        return date.fromisoformat(due_str).strftime('%a %d %b')
    except ValueError:
        return due_str


def card_html(item, urgency, today, color):
    area  = AREA_LABELS.get(item.get('area', ''), (item.get('area') or '').title())
    delta = delta_label(item, urgency, today)
    due   = format_due(item['due']) if item.get('due') else ''
    notes = item.get('notes', '')

    right = ''
    if due:
        right = (
            f'<td align="right" valign="top" style="font-family:monospace;font-size:11px;'
            f'color:#666;white-space:nowrap;padding-left:16px">'
            f'{due}<br>'
            f'<span style="color:{color}">{delta}</span>'
            f'</td>'
        )

    notes_part = f'<br><span style="font-size:12px;color:#666">{notes}</span>' if notes else ''

    return (
        f'<tr><td style="padding:14px 0;border-bottom:1px solid rgba(0,0,0,0.07)">'
        f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td valign="top">'
        f'<span style="font-family:monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;'
        f'background:rgba(0,0,0,0.07);padding:2px 8px;border-radius:10px;color:#333">{area}</span>'
        f'<span style="display:block;margin-top:6px;font-size:16px;font-weight:300;color:#0d1824">'
        f'{item["title"]}{notes_part}</span>'
        f'</td>{right}</tr></table></td></tr>'
    )


def section_html(label, items, urgency, today, color):
    if not items:
        return ''
    cards = ''.join(card_html(item, urgency, today, color) for item in items)
    return (
        f'<table width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin-bottom:24px;border-left:4px solid {color};padding-left:16px">'
        f'<tr><td style="padding-bottom:8px;font-family:monospace;font-size:10px;'
        f'letter-spacing:1.4px;text-transform:uppercase;color:{color}">'
        f'{label} ({len(items)})</td></tr>'
        f'{cards}</table>'
    )


def main():
    today = date.today()

    with open(DATA_PATH) as f:
        data = json.load(f)

    groups = {'overdue': [], 'today': [], 'this-week': [], 'upcoming': [], 'no-date': []}
    for item in data['items']:
        urg = classify(item, today)
        if urg in groups:
            groups[urg].append(item)

    for key in groups:
        groups[key].sort(key=lambda x: x.get('due') or '')

    date_str = today.strftime('%a %d %b')
    parts = []
    if groups['overdue']: parts.append(f"{len(groups['overdue'])} overdue")
    if groups['today']:   parts.append(f"{len(groups['today'])} due today")
    subject = f"Dashboard · {date_str}" + (' — ' + ', '.join(parts) if parts else '')

    body = (
        section_html('Overdue',   groups['overdue'],    'overdue',    today, '#902020') +
        section_html('Due Today', groups['today'],      'today',      today, '#b85c00') +
        section_html('This Week', groups['this-week'],  'this-week',  today, '#7a6200') +
        section_html('Upcoming',  groups['upcoming'],   'upcoming',   today, '#2a6e38') +
        section_html('No Date',   groups['no-date'],    'no-date',    today, '#888888')
    )

    html = (
        '<!DOCTYPE html><html><body style="margin:0;padding:0;'
        'font-family:Inter Tight,-apple-system,system-ui,sans-serif;'
        'background:#e8e4db;-webkit-font-smoothing:antialiased">'
        '<div style="max-width:600px;margin:0 auto;padding:40px 24px">'
        '<div style="margin-bottom:32px">'
        '<span style="font-family:monospace;font-size:18px;letter-spacing:-0.5px">'
        'life<span style="color:#3A7CA8">.</span>dash</span>'
        f'<span style="display:block;margin-top:8px;font-family:monospace;font-size:10px;'
        f'letter-spacing:1.2px;text-transform:uppercase;color:#666">{date_str}</span>'
        '</div>'
        f'{body}'
        '<div style="margin-top:32px;font-family:monospace;font-size:9px;'
        'letter-spacing:1px;text-transform:uppercase;color:#999">'
        'Edit deadlines in dashboard/data/items.json</div>'
        '</div></body></html>'
    )

    payload = json.dumps({
        'from':    DIGEST_FROM_EMAIL,
        'to':      [DIGEST_TO_EMAIL],
        'subject': subject,
        'html':    html,
    }).encode()

    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=payload,
        headers={
            'Authorization': f'Bearer {RESEND_API_KEY}',
            'Content-Type':  'application/json',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f'Digest sent: HTTP {r.status} — {subject}')
    except urllib.error.HTTPError as e:
        print(f'Resend API error {e.code}: {e.read().decode()}')
        sys.exit(1)


if __name__ == '__main__':
    main()
