extends RefCounted
class_name Schedule

## 일정 — 실제 리그 일정으로 날짜에 경기를 배정한다. D2.
##
## 원본: `packages/engine-native/src/schedule_engine.rs` · `leagueScheduler.ts`
##
## ⚠ **팀별 경기 수는 02 그대로다.** 기간만 실제 리그에 맞게 압축한다.
## 경기 수가 바뀌면 밸런스가 조용히 바뀌고, 02 실측값(리그 ERA 4점대 ·
## 수상 자격선 · 드래프트 앵커)과 대조가 안 된다.
##
## ⚠ **일정을 압축하지 않는다** (사용자 결정). 02처럼 프로를 1~50주에 편다
## (주 2.9경기). 실제 KBO는 24주에 몰아서 주 6경기지만, 그건 별개 문제다:
##
## "한 주 누르면 여러 경기가 한꺼번에 끝난다"는 **일 단위 진행이 푼다.**
## 02 설계 문서도 원래 그렇게 적혀 있었다 — "1시즌 = 52주. 경기일·이벤트·
## 선택 발생 시 진행 정지 → 유저 처리 → 재개"(DESIGN.md §209). 구현이
## 주 단위였을 뿐이다.
##
## 압축은 밀도(등판 간격 11일 → 5일)와 **28주짜리 진짜 오프시즌**을 주지만,
## 성장 주기 비율을 50:2 → 24:28로 뒤집고 그 오프시즌을 채울 콘텐츠가
## 필요하다. 둘 다 확인 전이라 미룬다 — 되돌리려면 이 표의 기간만 바꾼다.
##
## 요일: 0 = 일 … 6 = 토


## 화~일 (월요일 휴식) — KBO·NPB·MLB가 그렇다
const WEEKDAYS_PRO: Array[int] = [2, 3, 4, 5, 6, 0]
const WEEKDAYS_WEEKEND: Array[int] = [6, 0]
const WEEKDAYS_UNIV: Array[int] = [2, 3, 4, 5]
const WEEKDAYS_IND: Array[int] = [2, 5]

## 리그 정의. `start_day`·`end_day`는 시즌 일차(1 = 3월 1일)다.
##
## ⚠ **기간은 경기 수를 담을 만큼 넓어야 한다.** 모자라면 경기가 잘려나가고
## 팀별 경기 수가 어긋난다 — 검사가 그걸 먼저 본다
## 프로는 1~50주 = 시즌 1~350일차 (02 그대로).
## 월요일만 쉰다 — 기간이 넓으므로 경기는 그 안에 저절로 성기게 퍼진다
const LEAGUES: Dictionary = {
	"LEAGUE_KBL": {
		"games_per_team": 144, "start_day": 1, "end_day": 350, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_ABL": {
		"games_per_team": 135, "start_day": 1, "end_day": 350, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_JBL": {
		"games_per_team": 110, "start_day": 1, "end_day": 350, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_KBL_FARM": {
		"games_per_team": 99, "start_day": 1, "end_day": 350, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_ABL_FARM": {
		"games_per_team": 165, "start_day": 1, "end_day": 350, "weekdays": WEEKDAYS_PRO,
	},
	"LEAGUE_JBL_FARM": {
		"games_per_team": 121, "start_day": 1, "end_day": 350, "weekdays": WEEKDAYS_PRO,
	},
	# 고교 주말리그 — 10~29주
	"LEAGUE_HIGHSCHOOL": {
		"games_per_team": 20, "start_day": 64, "end_day": 204, "weekdays": WEEKDAYS_WEEKEND,
	},
	# 대학 — 1~10주, 권역별 화~금 (02의 `UNIV_REGULAR_*_WEEK`)
	"LEAGUE_UNIVERSITY": {
		"games_per_team": 9, "start_day": 1, "end_day": 70, "weekdays": WEEKDAYS_UNIV,
	},
	# 독립 — 10~25주 생존 리그 (02의 `SURVIVAL_STAGES`)
	"LEAGUE_INDEPENDENT": {
		"games_per_team": 30, "start_day": 64, "end_day": 175, "weekdays": WEEKDAYS_IND,
	},
}

## 리그별 팀 수 — 하루 부하를 재는 데 쓴다. 팀 목록 정본은 데이터 쪽이다
const TEAM_COUNTS: Dictionary = {
	"LEAGUE_KBL": 10, "LEAGUE_KBL_FARM": 10,
	"LEAGUE_ABL": 16, "LEAGUE_ABL_FARM": 16,
	"LEAGUE_JBL": 12, "LEAGUE_JBL_FARM": 12,
	"LEAGUE_HIGHSCHOOL": 102, "LEAGUE_UNIVERSITY": 50, "LEAGUE_INDEPENDENT": 10,
}


## 그 기간에서 경기를 치를 수 있는 날들 (시즌 일차)
static func playable_days(season_year: int, start_day: int, end_day: int, weekdays: Array) -> Array:
	var out: Array = []
	for d in range(start_day, end_day + 1):
		if weekdays.has(Calendar.weekday(season_year, d)):
			out.append(d)
	return out


## 라운드 로빈 — 한 바퀴에 모든 짝이 정확히 한 번 만난다.
##
## 한 라운드는 모든 팀이 한 경기씩 하는 묶음이다.
##
## ⚠ **홀수면 매 라운드 한 팀이 쉰다.** 억지로 짝지으면 자기 자신과 붙는다
static func round_robin(teams: Array) -> Array:
	var list: Array = teams.duplicate()
	# 홀수면 허수 하나를 넣고, 그와 짝지어진 팀은 그 라운드를 쉰다
	var has_bye: bool = list.size() % 2 == 1
	if has_bye:
		list.append("")
	var n: int = list.size()
	if n < 2:
		return []

	var fixed: String = list[n - 1]
	var rot: Array = list.slice(0, n - 1)
	var rounds: Array = []

	for r in n - 1:
		var pairs: Array = []
		# 허수는 늘 고정 자리에 있다(끝에 붙였다). 그 자리와 짝지어진 팀이
		# 그 라운드를 쉰다 — 안쪽 짝들은 전부 실제 팀이다
		var a: String = rot[r % rot.size()]
		if not fixed.is_empty():
			pairs.append([a, fixed])
		for i in range(1, n / 2):
			pairs.append([rot[(r + i) % rot.size()],
				rot[(r - i + rot.size() * 2) % rot.size()]])
		rounds.append(pairs)
	return rounds


## 한 리그의 시즌 일정. `[{league_id, day, home, away}]`
##
## ⚠ **기간이 모자라면 빈 배열을 낸다.** 조용히 잘라내면 팀별 경기 수가
## 어긋나고 그게 밸런스를 바꾼다
static func build(p: Dictionary) -> Array:
	var teams: Array = p.get("teams", [])
	var target: int = p.get("games_per_team", 0)
	if teams.size() < 2 or target <= 0:
		return []

	var days: Array = playable_days(p.get("season_year", 2026),
		p.get("start_day", 1), p.get("end_day", 1), p.get("weekdays", []))
	# 한 라운드가 하루다 — 한 팀이 하루에 두 경기를 하면 피로가 두 배로 쌓이고
	# 로테이션이 어긋난다
	if days.size() < target:
		push_error("[%s] 기간이 모자라다 — 경기일 %d < 목표 %d"
			% [p.get("league_id", ""), days.size(), target])
		return []

	var base: Array = round_robin(teams)
	if base.is_empty():
		return []

	var out: Array = []
	# 팀별 홈 경기 수 — 적은 쪽에 홈을 준다
	var home_count: Dictionary = {}
	# 상대별 홈 경기 수 — "저 팀 구장에서만 16번"을 막는다
	var pair_home: Dictionary = {}
	for r in target:
		var round_pairs: Array = base[r % base.size()]
		# 한 바퀴 돌 때마다 같은 상대와의 홈·원정을 바꾼다
		var flip: bool = (r / base.size()) % 2 == 1
		# 라운드를 기간 전체에 고르게 편다
		var day: int = days[r * days.size() / target]
		for pi in round_pairs.size():
			var pair: Array = round_pairs[pi]
			# ⚠ **홈이 적은 쪽에 준다.** 원형 배치의 자리로 정하면 특정 팀이
			# 늘 같은 쪽에 서고, 뒤집기를 걸어도 인덱스 주기가 맞물려 어긋난다.
			#
			# 실측: 뒤집기가 **바퀴 수로만** 걸려 있을 때 고교 **55팀이 홈 0경기 ·
			# 20팀이 홈 20경기**였다 — 20경기를 전부 남의 구장에서 치렀다.
			# 라운드 홀짝을 겹쳐 걸어 봤더니 이번엔 KBL이 80/48/64로 갈렸다
			# (라운드 수 9와 홀짝 2가 맞물린다).
			#
			# ⚠ **KBL만 보면 이 결함이 안 보인다** — 144경기라 16바퀴를 돌아
			# 원래 식으로도 정확히 반반이었다. 짧은 리그에서만 드러난다.
			#
			# 세는 쪽이 산수보다 확실하다. **보는 순서가 있다:**
			#
			# ⚠ ① **이 상대와의 홈 균형이 먼저다.** 팀 총합만 보면 총합은
			#    49~51%로 맞는데 **상대별로는 16:0**이 된다 — "저 팀 구장에서만
			#    16번 진다". 총합 검사로는 안 보인다.
			# ⚠ ② 팀 전체 홈 균형.
			# ⚠ ③ **동률이 남는다.** 늘 첫 자리를 홈으로 주면 원형 배치의
			#    편향이 그대로 남아서 대학(9경기)이 홈 6 · 원정 3까지 갔다.
			#    라운드와 쌍 번호로 갈라야 고르게 퍼진다
			var x: String = pair[0]
			var y: String = pair[1]
			var kx: String = x + "|" + y
			var ky: String = y + "|" + x
			var px: int = int(pair_home.get(kx, 0))
			var py: int = int(pair_home.get(ky, 0))
			var hx: int = int(home_count.get(x, 0))
			var hy: int = int(home_count.get(y, 0))

			var x_is_home: bool
			if px != py:
				x_is_home = px < py
			elif hx != hy:
				x_is_home = hx < hy
			else:
				x_is_home = ((r + pi) % 2 == 0) != flip

			var h: String = x if x_is_home else y
			var a: String = y if x_is_home else x
			home_count[h] = int(home_count.get(h, 0)) + 1
			pair_home[kx if x_is_home else ky] = (px if x_is_home else py) + 1
			out.append({
				"league_id": p.get("league_id", ""),
				"day": day,
				"home": h,
				"away": a,
			})
	return out


## 리그 정의표대로 짠다. `teams`는 호출부가 넘긴다
static func build_league(league_id: String, teams: Array, season_year: int) -> Array:
	if not LEAGUES.has(league_id):
		push_error("모르는 리그: %s" % league_id)
		return []
	var d: Dictionary = LEAGUES[league_id]
	return build({
		"league_id": league_id, "teams": teams, "season_year": season_year,
		"games_per_team": d["games_per_team"],
		"start_day": d["start_day"], "end_day": d["end_day"], "weekdays": d["weekdays"],
	})
