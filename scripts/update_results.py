#!/usr/bin/env python3
"""Fetch finished WC 2026 match results from football-data.org and update predictions.json."""
import json, os, sys, unicodedata
import urllib.request, urllib.error

API_KEY = os.environ.get('FOOTBALL_DATA_API_KEY', '')
API_URL = 'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED'

ALIASES = {
    # Countries with non-obvious API names
    "iran":                          "iran",
    "ir iran":                       "iran",
    "korea republic":                "south korea",
    "republic of korea":             "south korea",
    "united states":                 "usa",
    "united states of america":      "usa",
    "czechia":                       "czechia",
    "czech republic":                "czechia",
    "bosnia and herzegovina":        "bosnia",
    "bosnia & herzegovina":          "bosnia",
    "bosnia-herzegovina":            "bosnia",
    "bosnia herzegovina":            "bosnia",
    "dr congo":                      "dr congo",
    "congo dr":                      "dr congo",
    "congo, dr":                     "dr congo",
    "democratic republic of congo":  "dr congo",
    "democratic republic of the congo": "dr congo",
    "curacao":                       "curaçao",
    "curaçao":                       "curaçao",
    "turkey":                        "türkiye",
    "turkiye":                       "türkiye",
    "cape verde":                    "cape verde",
    "cape verde islands":            "cape verde",
    "cabo verde":                    "cape verde",
    "ivory coast":                   "ivory coast",
    "côte d'ivoire":                 "ivory coast",
    "cote d'ivoire":                 "ivory coast",
    "côte divoire":                  "ivory coast",
    "scotland":                      "scotland",
    "south africa":                  "south africa",
    "saudi arabia":                  "saudi arabia",
    "ksa":                           "saudi arabia",
    "new zealand":                   "new zealand",
    "zealand":                       "new zealand",
    "australia":                     "australia",
    "paraguay":                      "paraguay",
    "morocco":                       "morocco",
    "japan":                         "japan",
    "algeria":                       "algeria",
    "jordan":                        "jordan",
    "norway":                        "norway",
    "senegal":                       "senegal",
    "uzbekistan":                    "uzbekistan",
    "colombia":                      "colombia",
    "panama":                        "panama",
    "croatia":                       "croatia",
    "ghana":                         "ghana",
    "england":                       "england",
    "portugal":                      "portugal",
    "iraq":                          "iraq",
    "austria":                       "austria",
}

def strip_accents(s):
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

def norm(name):
    n = name.lower().strip()
    # strip accents for matching
    n_plain = strip_accents(n)
    return ALIASES.get(n, ALIASES.get(n_plain, n))

def main():
    if not API_KEY:
        print("No FOOTBALL_DATA_API_KEY — skipping auto-update")
        sys.exit(0)

    req = urllib.request.Request(API_URL, headers={'X-Auth-Token': API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            payload = json.loads(r.read())
            api_matches = payload['matches']
    except Exception as e:
        print(f"API fetch failed: {e}")
        sys.exit(0)

    print(f"API returned {len(api_matches)} finished matches")

    with open('data/predictions.json') as f:
        data = json.load(f)

    # Reverse map: normalised name → list of team codes
    name_to_codes = {}
    for code, name in data['teams'].items():
        key = norm(name)
        name_to_codes.setdefault(key, []).append(code)

    # Match lookup keyed by (home_code, away_code)
    match_lookup = {(m['home'], m['away']): m for m in data['matches']}

    # Playoff match lookup across all rounds
    po_match_lookup = {}
    for rnd in data.get('playoffs', {}).get('rounds', []):
        for m in rnd['matches']:
            po_match_lookup[(m['home'], m['away'])] = m

    changed = False
    unmatched = []

    for am in api_matches:
        if am.get('status') != 'FINISHED':
            continue
        ft = am.get('score', {}).get('fullTime', {})
        hg, ag = ft.get('home'), ft.get('away')
        if hg is None or ag is None:
            continue

        h_raw = am['homeTeam']['name']
        a_raw = am['awayTeam']['name']
        h_norm = norm(h_raw)
        a_norm = norm(a_raw)

        h_codes = name_to_codes.get(h_norm, [])
        a_codes = name_to_codes.get(a_norm, [])

        # Winner info (for knockout pens/ET)
        winner_raw = am.get('score', {}).get('winner', '')
        winner = 'home' if winner_raw == 'HOME_TEAM' else ('away' if winner_raw == 'AWAY_TEAM' else None)

        matched = False
        for hc in h_codes:
            if matched:
                break
            for ac in a_codes:
                if matched:
                    break
                if (hc, ac) in match_lookup:
                    m = match_lookup[(hc, ac)]
                    new = [hg, ag]
                    if m['result'] != new:
                        m['result'] = new
                        print(f"  Updated: {hc} {hg}–{ag} {ac}")
                        changed = True
                    matched = True
                elif (ac, hc) in match_lookup:
                    m = match_lookup[(ac, hc)]
                    new = [ag, hg]
                    if m['result'] != new:
                        m['result'] = new
                        print(f"  Updated (swapped): {ac} {ag}–{hg} {hc}")
                        changed = True
                    matched = True
                elif (hc, ac) in po_match_lookup:
                    m = po_match_lookup[(hc, ac)]
                    new = [hg, ag]
                    if m['result'] != new or m.get('winner') != winner:
                        m['result'] = new
                        if winner:
                            m['winner'] = winner
                        print(f"  PO Updated: {hc} {hg}–{ag} {ac} (winner: {winner})")
                        changed = True
                    matched = True
                elif (ac, hc) in po_match_lookup:
                    m = po_match_lookup[(ac, hc)]
                    new = [ag, hg]
                    flipped = 'away' if winner == 'home' else ('home' if winner == 'away' else None)
                    if m['result'] != new or m.get('winner') != flipped:
                        m['result'] = new
                        if flipped:
                            m['winner'] = flipped
                        print(f"  PO Updated (swapped): {ac} {ag}–{hg} {hc} (winner: {flipped})")
                        changed = True
                    matched = True

        if not matched:
            unmatched.append(f"{h_raw} ({h_norm}) vs {a_raw} ({a_norm})")

    if unmatched:
        print(f"Unmatched API matches ({len(unmatched)}):")
        for u in unmatched:
            print(f"  ? {u}")

    if changed:
        with open('data/predictions.json', 'w') as f:
            json.dump(data, f, indent=2)
        print("predictions.json updated")
    else:
        print("No new results")

if __name__ == '__main__':
    main()
