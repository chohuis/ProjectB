extends RefCounted
class_name Digest

## 월 1회 야구계 소식 — **커리어 전 구간에서 소식을 담는 하나뿐인 그릇이다.**
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/usecases/weekPhases/digest.ts`
##      · 같은 폴더 `standingsNews.ts` (내 순위 계산·승률 표기)
##      · `utils/tournament.ts`의 `regionRankings`
##
## ⚠ 원본에서 같은 성격의 소식이 네 갈래로 갈라져 각자 주기를 들고 있었다
## (실측 6시즌):
##
##   이웃 소식   고교 매주        시즌당 50.3통
##   내 순위     고교 월 1회      시즌당 10.0통
##   고교 다이제스트 2~3학년       시즌당  2.0통
##   프로 순위표 4주마다           시즌당 28.0통
##
## 고교 시즌당 62.3통 · 프로 28.0통이 **월 1통(연 13통)** 으로 합쳐진다.
##
## ⚠ **제일 잘 만든 형식이 고교 2~3학년에만 있었다.** 프로가 되면 리그당 한
## 통씩 다시 쪼개져 내가 안 속한 리그가 전체 표로 오고 **정작 내 리그는 안
## 왔다.** 거꾸로 돼 있던 것을 바로잡은 게 이 모듈이다.


## 다이제스트를 보내는 주 — **주기의 정본이다.**
##
## ⚠ 프로 정규시즌은 W51까지 간다. W44에서 끊으면 마지막 두 달이 통째로 빈다
const DIGEST_WEEKS: Array[int] = [5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48]

const LEAGUE_NAMES: Dictionary = {
	"LEAGUE_HIGHSCHOOL": "고교 리그",
	"LEAGUE_KBL": "KBL",
	"LEAGUE_ABL": "ABL",
	"LEAGUE_JBL": "JBL",
	"LEAGUE_UNIVERSITY": "대학 리그",
	"LEAGUE_INDEPENDENT": "독립 리그",
}

## `[다른 무대]`에 실을 리그. **내 리그는 호출부가 아니라 조립기가 뺀다** —
## 원본의 월간 순위표는 건너뛰기만 해서 정작 내 리그 순위표가 아무 데도
## 안 나왔다
const OTHER_STAGE_LEAGUES: Array[String] = [
	"LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
]

const OTHER_STAGE_SHORT: Dictionary = {
	"LEAGUE_KBL": "KBL", "LEAGUE_ABL": "ABL", "LEAGUE_JBL": "JBL",
	"LEAGUE_UNIVERSITY": "대학", "LEAGUE_INDEPENDENT": "독립",
}

## 어느 구간에서 어느 섹션을 켜는가 — **정본은 이 표 하나다.**
##
## ⚠ 조건을 조립 코드 여기저기에 흩으면 "고교엔 나오는데 대학엔 안 나온다"가
## 어디서 갈렸는지 추적이 안 된다. 이 저장소가 반복해 겪은 형태다.
##
##   mine   [내 자리]     내 순위 — 고교는 권역+전국, 그 외는 리그 안 순위
##   stage  [내 무대]     내가 뛰는 판의 순위표
##   others [다른 무대]   타 리그 선두 한 줄씩
##   scout  [나를 보는 눈] 스카우트 관심 구단
const SECTIONS: Dictionary = {
	# 고교 1학년에게 프로 순위표는 잡음이다 — 진로가 아직 안 걸렸다
	"hs1": {"mine": true, "stage": true, "others": false, "scout": false},
	"hs23": {"mine": true, "stage": true, "others": true, "scout": true},
	"amateur": {"mine": true, "stage": true, "others": true, "scout": true},
	# 프로에게 스카우트 관심 구단은 의미가 없다 — 이미 소속이 있다
	"pro": {"mine": true, "stage": true, "others": true, "scout": false},
}


## 진로 단계(+고교 학년)를 구간으로 접는다
static func tier_of(career_stage: String, hs_grade: int = 0) -> String:
	if career_stage == "highschool":
		return "hs23" if hs_grade >= 2 else "hs1"
	if career_stage == "university" or career_stage == "independent":
		return "amateur"
	return "pro"


# ── 표기 ───────────────────────────────────────────────────────────

## 승률 — `.526` 형식. **1.000은 앞자리를 살린다.**
##
## ⚠ 원본은 이 함수가 두 벌이었고 한쪽이 자릿수가 밀려 `.1000`을 냈다.
## 표에서 열이 통째로 밀린다
static func pct_str(v: float) -> String:
	if v >= 1.0:
		return "1.000"
	return "." + str(roundi(v * 1000.0)).pad_zeros(3)


static func _record_of(s: Dictionary) -> String:
	if s.is_empty():
		return "-"
	var draws: int = s.get("draws", 0)
	var draw_part: String = (" %d무" % draws) if draws > 0 else ""
	return "%d승 %d패%s %s" % [s.get("wins", 0), s.get("losses", 0), draw_part,
		pct_str(s.get("win_pct", 0.0))]


static func _team_name(input: Dictionary, team_id: String) -> String:
	return input.get("team_names", {}).get(team_id, team_id.trim_prefix("TEAM_"))


## ⚠ **손으로 표를 만들지 않는다.** 원본에서 구장ID→지역명 맵을 적었다가
## 8개 중 하나를 빠뜨려 화면에 `YEONGSAN권역`이 그대로 찍혔다. 이름은
## 호출부가 넘긴다 — 이 모듈이 데이터 저장소를 직접 보면 순수 함수가 아니게
## 되고 회귀에서 못 쓴다
static func _region_name(input: Dictionary, stadium_id: String) -> String:
	return input.get("region_names", {}).get(stadium_id, stadium_id.trim_prefix("STADIUM_"))


# ── 순위 계산 ──────────────────────────────────────────────────────

## 권역별 순위. 정렬은 승률 → 득점 → 실점 → ID다.
##
## ⚠ **전국 순위와 같은 기준을 쓴다.** 다르면 "권역 1위인데 전국 30위" 같은
## 설명 불가능한 조합이 나온다
static func _cmp_key(by_team: Dictionary, a: String, b: String) -> bool:
	var sa: Dictionary = by_team.get(a, {})
	var sb: Dictionary = by_team.get(b, {})
	var pa: float = sa.get("win_pct", 0.0)
	var pb: float = sb.get("win_pct", 0.0)
	if not is_equal_approx(pa, pb):
		return pa > pb
	var fa: int = sa.get("runs_for", 0)
	var fb: int = sb.get("runs_for", 0)
	if fa != fb:
		return fa > fb
	var aa: int = sa.get("runs_against", 0)
	var ab: int = sb.get("runs_against", 0)
	if aa != ab:
		return aa < ab
	return a < b


static func region_rankings(standings: Array, regions: Dictionary) -> Array:
	var by_team: Dictionary = {}
	for s in standings:
		by_team[s.get("team_id", "")] = s

	var region_ids: Array = regions.keys()
	region_ids.sort()

	var out: Array = []
	for rid in region_ids:
		var teams: Array = Array(regions[rid]).duplicate()
		teams.sort_custom(func(a, b) -> bool: return _cmp_key(by_team, a, b))
		out.append({"region_id": rid, "ranked_teams": teams})
	return out


## 내 팀이 권역에서 몇 위, 전국에서 몇 위인가. 없으면 빈 사전.
##
## ⚠ 전국 순위는 **권역과 무관하게 승률로 줄 세운 것**이다. 권역마다 팀 수가
## 달라(제주 2팀 ~ 충청 12팀) 권역 순위만으로는 전국 위치를 알 수 없다
static func calc_my_rank(standings: Array, my_team_id: String, regions: Dictionary) -> Dictionary:
	if my_team_id.is_empty() or standings.is_empty():
		return {}

	var mine: Dictionary = {}
	for r in region_rankings(standings, regions):
		if r["ranked_teams"].has(my_team_id):
			mine = r
			break
	if mine.is_empty():
		return {}

	var by_team: Dictionary = {}
	var ids: Array = []
	for s in standings:
		by_team[s.get("team_id", "")] = s
		ids.append(s.get("team_id", ""))
	ids.sort_custom(func(a, b) -> bool: return _cmp_key(by_team, a, b))

	var n_idx: int = ids.find(my_team_id)
	if n_idx < 0:
		return {}

	return {
		"region_id": mine["region_id"],
		"region_rank": mine["ranked_teams"].find(my_team_id) + 1,
		"region_total": mine["ranked_teams"].size(),
		"national_rank": n_idx + 1,
		"national_total": ids.size(),
	}


## 경기를 한 번이라도 치른 리그인가 — 시즌 초엔 전부 0-0이라 소식이 안 된다.
## 그때 "선두 ○○ (.000)"을 내보내면 거짓 정보다
static func _has_played(rows: Array) -> bool:
	for s in rows:
		if s.get("wins", 0) + s.get("losses", 0) + s.get("draws", 0) > 0:
			return true
	return false


## 순위·승률 기반 한 줄 코멘트
static func _team_comment(rank: int, total: int, win_pct: float) -> String:
	if rank == 1:
		return "압도적 선두 — 드래프트 투자 여력 충분" if win_pct >= 0.65 else "선두 경쟁 중 — 전력 보강에 적극적"
	if rank == total:
		return "재건 모드 — 젊은 자원 선호" if win_pct < 0.35 else "최하위권 고전 — 마운드 보강 시급"
	if win_pct >= 0.55:
		return "상위권 경쟁 — 포스트시즌 진출 의지"
	if win_pct <= 0.40:
		return "하위권 — 내년 재건 준비 중"
	return "중위권 경쟁 중"


# ── 조립 ───────────────────────────────────────────────────────────

## 월 1회 야구계 소식. **담을 게 하나도 없으면 빈 사전을 낸다** — 빈 껍데기를
## 보내면 "소식이 왔는데 아무것도 없다"가 된다.
##
## 입력 사전:
##   week_num · season_year · month_label · career_stage · hs_grade
##   my_team_id · my_league_id · my_standings · league_state
##   regions · team_names · region_names · scout_score
##   active_leagues  (있으면 그 리그만 [다른 무대]에 싣는다)
##
## ⚠ **`my_standings`는 `league_state[my_league_id]`가 아니다.** `league_state`엔
## *내가 안 뛰는* 리그만 들어 있고 내 리그 순위표는 시즌 상태 최상위에 있다.
## 원본에서 이걸 `league_state`에서 읽었다가 **프로 다이제스트의 [내 자리]와
## [내 무대]가 통째로 사라졌다** — 고치겠다던 결함을 그대로 재현했다
static func build(input: Dictionary) -> Dictionary:
	var tier: String = tier_of(input.get("career_stage", ""), input.get("hs_grade", 0))
	var on: Dictionary = SECTIONS[tier]
	var is_hs: bool = input.get("career_stage", "") == "highschool"
	var regions: Dictionary = input.get("regions", {})
	var my_team: String = input.get("my_team_id", "")
	var my_league: String = input.get("my_league_id", "")
	var my_standings: Array = input.get("my_standings", [])
	var league_label: String = LEAGUE_NAMES.get(my_league, my_league)

	var sections: Array[String] = []
	var headline: String = ""

	# ── [내 자리] ────────────────────────────────────────────────
	if on["mine"]:
		if is_hs and not my_standings.is_empty():
			var r: Dictionary = calc_my_rank(my_standings, my_team, regions)
			if not r.is_empty():
				var mine_row: Dictionary = {}
				for s in my_standings:
					if s.get("team_id", "") == my_team:
						mine_row = s
						break
				var top_pct: int = roundi(float(r["national_rank"]) / float(r["national_total"]) * 100.0)
				var rname: String = _region_name(input, r["region_id"])
				headline = "%s %d위 · 전국 %d위" % [rname, r["region_rank"], r["national_rank"]]
				sections.append("[내 자리]\n  %s\n  %s   %d위 / %d팀\n  전국          %d위 / %d팀  (상위 %d%%)\n  성적          %s" % [
					_team_name(input, my_team), rname, r["region_rank"], r["region_total"],
					r["national_rank"], r["national_total"], top_pct, _record_of(mine_row),
				])
		else:
			var rows: Array = Standings.sorted(my_standings)
			var idx: int = -1
			for i in rows.size():
				if rows[i].get("team_id", "") == my_team:
					idx = i
					break
			if idx >= 0:
				headline = "%s %d위" % [league_label, idx + 1]
				sections.append("[내 자리]\n  %s\n  %s   %d위 / %d팀\n  성적          %s" % [
					_team_name(input, my_team), league_label, idx + 1, rows.size(),
					_record_of(rows[idx]),
				])

	# ── [내 무대] ────────────────────────────────────────────────
	#
	# ⚠ 고교는 **권역 순위표**를 낸다. 102팀 전국 표를 통째로 넣으면 본문이
	# 100줄이 되고, 그건 읽히지 않는다
	if on["stage"]:
		if is_hs:
			var mine_reg: Dictionary = {}
			for r in region_rankings(my_standings, regions):
				if r["ranked_teams"].has(my_team):
					mine_reg = r
					break
			if not mine_reg.is_empty() and _has_played(my_standings):
				var by_team: Dictionary = {}
				for s in my_standings:
					by_team[s.get("team_id", "")] = s
				var lines: Array[String] = []
				var ranked: Array = mine_reg["ranked_teams"]
				for i in ranked.size():
					var tid: String = ranked[i]
					var mark: String = "  ← 우리" if tid == my_team else ""
					lines.append("  %d위  %s  %s%s" % [i + 1, _team_name(input, tid),
						_record_of(by_team.get(tid, {})), mark])
				sections.append("[내 무대] %s\n%s" % [
					_region_name(input, mine_reg["region_id"]), "\n".join(lines)])
		else:
			var rows: Array = Standings.sorted(my_standings)
			if not rows.is_empty() and _has_played(rows):
				var lines: Array[String] = []
				for i in rows.size():
					var s: Dictionary = rows[i]
					var mark: String = "  ← 우리" if s.get("team_id", "") == my_team else ""
					lines.append("  %d위  %s  %s  %s%s" % [i + 1,
						_team_name(input, s.get("team_id", "")), _record_of(s),
						s.get("streak", ""), mark])
				sections.append("[내 무대] %s\n%s" % [league_label, "\n".join(lines)])

	# ── [다른 무대] ──────────────────────────────────────────────
	# 리그마다 한 줄. 원본은 리그당 **한 통씩** 전체 표가 왔다
	if on["others"]:
		var lines: Array[String] = []
		for lid in OTHER_STAGE_LEAGUES:
			if lid == my_league:
				continue
			# ⚠ **이 게이트를 없애면 겨울에도 순위표가 온다**
			if input.has("active_leagues") and not input["active_leagues"].has(lid):
				continue
			var rows: Array = Standings.sorted(input.get("league_state", {}).get(lid, {}).get("standings", []))
			if rows.is_empty() or not _has_played(rows):
				continue
			var top: Dictionary = rows[0]
			lines.append("  %s  %s 선두 (%s)" % [
				String(OTHER_STAGE_SHORT.get(lid, lid)).rpad(4),
				_team_name(input, top.get("team_id", "")), pct_str(top.get("win_pct", 0.0))])
		if not lines.is_empty():
			sections.append("[다른 무대]\n%s" % "\n".join(lines))

	# ── [나를 보는 눈] ───────────────────────────────────────────
	if on["scout"]:
		var kbl: Array = Standings.sorted(input.get("league_state", {}).get("LEAGUE_KBL", {}).get("standings", []))
		if _has_played(kbl):
			var score: int = input.get("scout_score", 0)
			var count: int = 4 if score >= 80 else (3 if score >= 60 else (2 if score >= 40 else 1))
			var lines: Array[String] = []
			for i in mini(count, kbl.size()):
				var s: Dictionary = kbl[i]
				lines.append("  %s   \"%s\"" % [_team_name(input, s.get("team_id", "")),
					_team_comment(i + 1, kbl.size(), s.get("win_pct", 0.0))])
			if not lines.is_empty():
				sections.append("[나를 보는 눈]\n%s\n  ※ 스카우트 평가 %d" % ["\n".join(lines), score])

	if sections.is_empty():
		return {}

	var week: int = input.get("week_num", 0)
	var month: String = input.get("month_label", "")
	return {
		# ⚠ **연도를 반드시 넣는다.** `week_num`은 시즌마다 1로 리셋되므로
		# `msg-digest-w13`은 해마다 다시 생긴다. 소식 목록이 id를 키로 잡기
		# 때문에 중복이 생기는 순간 **세이브를 아예 못 연다** — 원본에서
		# 3시즌째에 실제로 발생했다.
		#
		# ⚠ **표시용 라벨(월 이름)은 넣지 않는다.** `msg-digest-3월-w13`으로
		# 뒀더니 종류 키가 달마다 쪼개져 계측에서 한 종류가 11갈래로 흩어졌다
		"id": "msg-digest-%d-w%d" % [input.get("season_year", 0), week],
		"category": "system",
		"sender": "리그 사무국",
		"subject": "야구계 소식 — %s" % month,
		# ⚠ 미리보기는 **내 위치**여야 한다. 원본은 첫 섹션을 그대로 써서
		# 남의 리그가 먼저 떴다 — 목록에서 열어볼 이유가 안 보였다
		"preview": headline if not headline.is_empty() else sections[0].split("\n")[0],
		"body": "[야구계 소식 — %s]\n\n%s\n\n→ 세부 순위는 [기록] 탭" % [month, "\n\n".join(sections)],
		"created_at": "W%d" % week,
		"read_at": "",
	}
