# OnePitch 시드(182팀) → SvelteElectron master 포맷 변환 (Phase 5-1)
#
# 국내 팀만 교체한다. 해외(ABL·JBL)는 현행 refs를 그대로 승계 —
# 진출 전까지 드리프트만 도는 영역이라 이번 스코프 밖.
#
# ID 규약 (현행 유지):
#   league:hs        → LEAGUE_HIGHSCHOOL   TEAM_HS_<SLUG>
#   league:univ      → LEAGUE_UNIVERSITY   TEAM_UNIV_<SLUG>
#   league:independent → LEAGUE_INDEPENDENT TEAM_IND_<SLUG>
#   league:pro       → LEAGUE_KBL          TEAM_KBL_<SLUG>_1
#   league:pro_farm  → LEAGUE_KBL          TEAM_KBL_<SLUG>_2   (팜 = _1→_2 접미사 규칙)
import csv, io, os, json, collections

ROOT = r"c:\Users\user\Desktop\Work\00_Work\00_Personal\Personal\Planning"
SEED = os.path.join(ROOT, "02.SvelteElectron", "resource", "data", "seeds", "onepitch")
MASTER = os.path.join(ROOT, "02.SvelteElectron", "resource", "data", "master")

rd = lambda n: list(csv.DictReader(io.open(os.path.join(SEED, n), encoding="utf-8")))

teams    = rd("teams.csv")
schools  = {r["id"]: r for r in rd("schools.csv")}
stadiums = {r["id"]: r for r in rd("stadiums.csv")}
traits   = {r["team_id"]: r for r in rd("team_traits.csv")}
org      = {r["team_id"]: r for r in rd("team_org.csv")}
power    = {r["team_id"]: r for r in rd("team_power.csv")}
colors   = {r["team_id"]: r for r in rd("team_colors.csv")}
# team_rivals.csv는 (team_a, team_b, description) 양방향 페어 — 양쪽에 다 넣는다
rivals   = collections.defaultdict(list)
for r in rd("team_rivals.csv"):
    rivals[r["team_a"]].append({"other": r["team_b"], "desc": r.get("description", "")})
    rivals[r["team_b"]].append({"other": r["team_a"], "desc": r.get("description", "")})
ranks = collections.defaultdict(dict)
for r in rd("team_season_ranks.csv"):
    ranks[r["team_id"]][r["season"]] = int(r["rank"])
titles = collections.defaultdict(list)
for r in rd("team_titles.csv"):
    titles[r["team_id"]].append(r)

LEAGUE = {
    "league:hs": "LEAGUE_HIGHSCHOOL", "league:univ": "LEAGUE_UNIVERSITY",
    "league:independent": "LEAGUE_INDEPENDENT",
    "league:pro": "LEAGUE_KBL", "league:pro_farm": "LEAGUE_KBL",
}
PREFIX = {
    "league:hs": "TEAM_HS_", "league:univ": "TEAM_UNIV_",
    "league:independent": "TEAM_IND_", "league:pro": "TEAM_KBL_", "league:pro_farm": "TEAM_KBL_",
}

def slug(team_id, league_id):
    s = team_id.replace("team:", "")
    for suf in ("_hs", "_univ", "_farm"):
        if s.endswith(suf):
            s = s[: -len(suf)]
    return s.upper()

def team_key(t):
    lg = t["league_id"]
    s = slug(t["id"], lg)
    if lg == "league:pro":      return f"TEAM_KBL_{s}_1"
    if lg == "league:pro_farm": return f"TEAM_KBL_{s}_2"
    return PREFIX[lg] + s

ID = {t["id"]: team_key(t) for t in teams}

def school_key(sid, league_id):
    if not sid or sid not in schools:
        return ""
    tag = "HS" if league_id == "league:hs" else "UNIV"
    s = sid.replace("school:", "").replace("_univ", "").upper()
    return f"SCHOOL_{tag}_{s}"

def stadium_key(sid):
    return f"STADIUM_{sid.replace('stadium:', '').upper()}" if sid else ""

# ── 팀 레코드 조립 ────────────────────────────────────────────────
out_teams, out_schools, seen_school = [], [], set()
for t in teams:
    lg, tid = t["league_id"], ID[t["id"]]
    tr, o = traits.get(t["id"], {}), org.get(t["id"], {})
    sk = school_key(t.get("school_id", ""), lg)

    if sk and sk not in seen_school:
        seen_school.add(sk)
        sc = schools[t["school_id"]]
        out_schools.append({"id": sk, "name": sc["name"], "nameEn": "", "region": sc.get("region", "")})

    rk = ranks.get(t["id"], {})
    out_teams.append({
        "id": tid,
        "name": t["name"],
        "nameEn": "",
        "leagueId": LEAGUE[lg],
        "clubId": tid,
        "schoolId": sk,
        "city": t.get("region", ""),
        "stadium": stadium_key(t.get("stadium_id", "")),
        "colors": [colors.get(t["id"], {}).get("hex", "#888888")],
        "colorLabel": colors.get(t["id"], {}).get("label", ""),
        "capacity": 0,
        "power": int(power[t["id"]]["stars"]) if t["id"] in power else None,
        "traits": {"philosophy": tr.get("philosophy", ""), "resource": tr.get("resource", ""),
                   "status": tr.get("status", "")},
        "profile": {"style": tr.get("philosophy", ""), "desc": ""},
        "history": {
            "foundedYear": int(o["founded_year"]) if o.get("founded_year") else None,
            "budget": int(o["budget"]) if o.get("budget") else None,
            "seasonRanks": [{"season": s, "rank": rk[s]} for s in sorted(rk)],
            "titles": [{"season": x["season"], "competition": x["competition"],
                        "result": x.get("result", "")} for x in titles.get(t["id"], [])],
            "rivals": [{"with": ID.get(x["other"], x["other"]), "desc": x["desc"]}
                       for x in rivals.get(t["id"], [])],
        },
    })

out_stadiums = [{"id": stadium_key(s["id"]), "name": s["name"], "parkFactor": s["park_factor"]}
                for s in stadiums.values()]

# ── 해외 승계 ─────────────────────────────────────────────────────
old = json.load(io.open(os.path.join(MASTER, "entities", "refs.json"), encoding="utf-8"))
FOREIGN = {"LEAGUE_ABL", "LEAGUE_JBL"}
foreign_teams = [t for t in old["teams"] if t["leagueId"] in FOREIGN]

refs = {
    "version": (old.get("version", 1) or 1) + 1,
    "leagues": old["leagues"],
    "schools": [{"id": "SCHOOL_NONE", "name": "해당 없음", "nameEn": "N/A"}] + sorted(out_schools, key=lambda s: s["id"]),
    "stadiums": sorted(out_stadiums, key=lambda s: s["id"]),
    "clubs": old.get("clubs", []),
    "teams": sorted(out_teams, key=lambda t: t["id"]) + foreign_teams,
}

# ── 검증 ──────────────────────────────────────────────────────────
ids = [t["id"] for t in refs["teams"]]
by_league = collections.Counter(t["leagueId"] for t in refs["teams"])
school_ids = {s["id"] for s in refs["schools"]}
stadium_ids = {s["id"] for s in refs["stadiums"]}
team_ids = set(ids)

print(f"팀 {len(ids)} (고유 {len(team_ids)}), 학교 {len(refs['schools'])}, 구장 {len(refs['stadiums'])}")
print("리그별:", dict(by_league))

errs = []
if len(ids) != len(team_ids): errs.append("팀 ID 중복")
for t in out_teams:
    if t["schoolId"] and t["schoolId"] not in school_ids: errs.append(f"{t['id']}: 미지의 학교 {t['schoolId']}")
    if t["stadium"] and t["stadium"] not in stadium_ids: errs.append(f"{t['id']}: 미지의 구장 {t['stadium']}")
    for r in t["history"]["rivals"]:
        if r["with"] not in team_ids: errs.append(f"{t['id']}: 미지의 라이벌 {r['with']}")
    if t["power"] is None: errs.append(f"{t['id']}: 전력★ 없음")

# 팜 규칙: 모든 _1에 대응하는 _2가 있는가
ones = [i for i in ids if i.endswith("_1")]
for o1 in ones:
    if o1[:-2] + "_2" not in team_ids: errs.append(f"팜 누락: {o1}")

print("\n검증 오류:", len(errs))
for e in errs[:10]: print("  ", e)

out = os.path.join(MASTER, "entities", "refs.v2.json")
io.open(out, "w", encoding="utf-8").write(json.dumps(refs, ensure_ascii=False, indent=2) + "\n")
print(f"\n→ {out}")
