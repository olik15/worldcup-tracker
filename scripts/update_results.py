#!/usr/bin/env python3
"""Fetch finished WC 2026 match results from football-data.org and update predictions.json."""
import json, os, sys
import urllib.request, urllib.error

API_KEY = os.environ.get('FOOTBALL_DATA_API_KEY', '')
API_URL = 'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED'

# Normalise names that differ between the API and our teams dict
ALIASES = {
    "iran":                          "iran",
    "korea republic":                "south korea",
    "republic of korea":             "south korea",
    "united states":                 "usa",
    "czechia":                       "czechia",
    "czech republic":                "czechia",
    "bosnia and herzegovina":        "bosnia",
    "bosnia & herzegovina":          "bosnia",
    "dr congo":                      "dr congo",
    "congo dr":                      "dr congo",
    "democratic republic of congo":  "dr congo",
    "curacao":                       "curaçao",
    "turkey":                        "türkiye",
    "cape verde islands":            "cape verde",
    "ivory coast":                   "ivory coast",
    "côte d'ivoire":                 "ivory coast",
    "cote d'ivoire":                 "ivory coast",
}

def norm(name):
    n = name.lower().strip()
    return ALIASES.get(n, n)

def main():
    if not API_KEY:
        print("No FOOTBALL_DATA_API_KEY — skipping auto-update")
        sys.exit(0)

    req = urllib.request.Request(API_URL, headers={'X-Auth-Token': API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            api_matches = json.loads(r.read())['matches']
    except Exception as e:
        print(f"API fetch failed: {e}")
        sys.exit(0)

    with open('data/predictions.json') as f:
        data = json.load(f)

    # Reverse map: normalised name → list of team codes (some names map to two codes e.g. Spain)
    name_to_codes = {}
    for code, name in data['teams'].items():
        name_to_codes.setdefault(norm(name), []).append(code)

    # Match lookup keyed by (home_code, away_code)
    match_lookup = {(m['home'], m['away']): m for m in data['matches']}

    changed = False
    for am in api_matches:
        if am.get('status') != 'FINISHED':
            continue
        ft = am.get('score', {}).get('fullTime', {})
        hg, ag = ft.get('home'), ft.get('away')
        if hg is None or ag is None:
            continue

        h_norm = norm(am['homeTeam']['name'])
        a_norm = norm(am['awayTeam']['name'])

        for hc in name_to_codes.get(h_norm, []):
            for ac in name_to_codes.get(a_norm, []):
                if (hc, ac) in match_lookup:
                    m = match_lookup[(hc, ac)]
                    new = [hg, ag]
                    if m['result'] != new:
                        m['result'] = new
                        print(f"  {hc} {hg}–{ag} {ac}")
                        changed = True

    if changed:
        with open('data/predictions.json', 'w') as f:
            json.dump(data, f, indent=2)
        print("predictions.json updated")
    else:
        print("No new results")

if __name__ == '__main__':
    main()
