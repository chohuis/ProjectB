extends RefCounted
class_name RosterMaintenance

## 리그 무관 로스터 정리 — 상한·승강 판정·충원할 자리. M6-3.
##
## 원본: `usecases/weekPhases/market.ts` · `engine-native/src/team_engine.rs`
##
## ⚠ **02에선 프로 운영이 KBL 전용이었다.** 승강·FA·트레이드가 전부
## `leagueId === "LEAGUE_KBL"`로 걸러져 있었고, `["LEAGUE_KBL", "LEAGUE_ABL",
## "LEAGUE_JBL"]`은 그러면서 여섯 군데에 적혀 있었다. 해외를 열자 ABL·JBL은
## **채우는 경로는 있는데 정리하는 경로가 없는 리그**가 됐다 — 실측에서
## 1군이 팀당 41·46명(상한 34·32)까지 부풀었다.
##
## 캡 자체는 멀쩡했다. 떼어 재보면 14 → 26으로 정확히 자른다. **누가 안
## 불렀을 뿐이다.**
##
## 우리는 해외까지 매일 풀 시뮬한다(사용자 결정 — `radiusGate` 안 옮김).
## 그래서 이 결함을 그대로 옮기면 안 된다: 리그 목록은 여기 한 곳이고,
## 운영 코드는 `active_pro_leagues()`를 거친다.


## 프로 1군 리그 — 승강·FA·트레이드가 도는 무대
const PRO_LEAGUES: Array[String] = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]

## 리그별 로스터 상한·하한. **규칙 파일이 정본이었고 값을 그대로 옮긴다.**
##
## ⚠ **모든 리그에 KBL 상한을 쓰면 안 된다.** JBL은 32인데 34로 재면
## 두 명이 영영 안 잘린다.
##
## ⚠ **해외 팜에 하한이 없어서 말랐다.** 1군이 매년 빨아들이기만 해서
## 실측 544 → 184가 됐다
const ROSTER_LIMITS: Dictionary = {
	"LEAGUE_KBL": {"min": 26, "max": 34},
	"LEAGUE_ABL": {"min": 26, "max": 34},
	"LEAGUE_JBL": {"min": 26, "max": 32},
	"LEAGUE_KBL_FARM": {"min": 26, "max": 34},
	"LEAGUE_ABL_FARM": {"min": 26, "max": 34},
	"LEAGUE_JBL_FARM": {"min": 26, "max": 34},
}
const ROSTER_MAX_FALLBACK: int = 34
const ROSTER_MIN_FALLBACK: int = 26

## 승강 판정 — **최근 성적 위주 + 능력치 보정** (사용자 확정)
##
## 가중 8은 리그 OVR 폭 30의 4분의 1이다 — **성적이 능력치를 뒤집되
## 완전히 무시하진 않는** 지점
const FORM_WEIGHT: float = 8.0
const FORM_SPAN: float = 1.0

## ERA 4.50이 0점.
##
## ⚠ **원본 주석("기준의 절반이면 +1.0")이 산식과 다르다.** 기준 대비
## **비율**이라 2.25는 +0.5고, +1.0은 자책점 0에서만 나온다. 주석을 믿고
## 옮겼으면 승강에서 성적 가중이 두 배가 될 뻔했다
const PITCHER_ERA_BASELINE: float = 4.50
const PITCHER_FULL_INNINGS: float = 40.0

## OPS 0.700이 0점. **0.910이면 +0.3**
const BATTER_OPS_BASELINE: float = 0.700
const BATTER_FULL_PA: float = 120.0

## 이 아래면 장기 부진 — 상시 콜업 트리거이자 교체 압력
const SLUMP_SCORE: float = -0.5

## 2군 구성 하한.
##
## ⚠ **1군에서 파생하면 안 된다.** `rosterMin × 보직비율 − 여유2`로 뽑으면
## 9/12가 나오는데, 12로 올렸더니 공백 충원이 막혀 **KBL 1군 최소 야수가
## 12 → 7이 됐다**. 2군은 1군에 공급하는 풀이라 잣대가 다르다.
##
## 근거는 "2군도 경기를 치른다" — 선발 5인 로테이션 + 불펜 3 = 8,
## 야수는 타순 한 바퀴 = 9
const FARM_MIN_PITCHERS: int = 8
const FARM_MIN_BATTERS: int = 9

## 1군 야수 하한. **생성값 16에서 부상·강등 여유 2를 뺀 선이다.**
##
## KBO 1군은 등록 28명에 야수 15~17명이다(선발 9 + 백업 포수 1 +
## 내야 백업 2~3 + 외야 백업 2 + 대타·대주자 1~2).
##
## ⚠ 02는 처음에 10으로 뒀다 — "타순 한 바퀴 + 여유 1"이라는 좁은 근거였고
## **생성 시점 값(16)과 현실(15~17)이 이미 맞는데 그걸 안 봤다**
const FIRST_TEAM_MIN_BATTERS: int = 14

## 1군 투수 하한 — 콜다운이 투수만 골라 내리는 것을 막는다.
##
## ⚠ **한쪽 하한만 걸면 정원 압력이 전부 반대쪽으로 흐른다.** 02가 야수
## 하한만 걸었더니 1군 투수가 9~11명 → **시즌 종료 5명**이 됐다.
##
## 야수와 같은 축이다: `rosterSize 30 × pitcherRatio 0.45` → 투수 14 / 야수 16.
## 거기서 같은 폭(2)을 뺀다. **둘의 합 26은 정원 30 안이라 교착이 아니다**
const FIRST_TEAM_MIN_PITCHERS: int = 12

## 1군 선발 하한 — **콜다운이 불펜만 골라 내리는 것을 막는다.**
##
## ⚠ 콜다운은 부류(투/야)만 보고 `rated()` 낮은 순으로 내린다. 불펜이 대체로
## 약해서 **RP부터 빠지고 SP만 쌓인다** — 02 실측 팀당 선발 9~12명(로테이션 5).
## 로테이션 밖 선발은 등판이 드물어 ERA가 능력치를 반영하지 못한다.
##
## 5인 로테이션 + 부상 여유 1
const FIRST_TEAM_MIN_STARTERS: int = 6

const PITCHER_POSITIONS: Array[String] = ["SP", "RP", "CP", "P"]

## 대체가 안 되는 자리. **2군에서도 마지막 한 명을 안 뺀다** — 콜업이 2군의
## 마지막 포수를 올려버려 2군이 포수 0명으로 한 해를 났다. 1루수·좌익수는
## 다른 야수가 대신 설 수 있지만 포수는 그렇지 않다
static func is_specialist_position(position: String) -> bool:
	return position == "C"


## 지금 실제로 도는 프로 1군 리그.
##
## ⚠ **운영 코드가 리그를 직접 적지 않는다.** 여기 한 곳을 거치게 하면
## 리그를 닫고 여는 스위치가 하나가 된다
static func active_pro_leagues(out_of_scope: Array = []) -> Array:
	var out: Array = []
	for lid in PRO_LEAGUES:
		if not out_of_scope.has(lid):
			out.append(lid)
	return out


## 프로 1군 + 그 팜. **승강은 짝으로 돈다**
static func active_pro_leagues_with_farm(out_of_scope: Array = []) -> Array:
	var out: Array = []
	for lid in active_pro_leagues(out_of_scope):
		out.append(lid)
		out.append(lid + "_FARM")
	return out


static func is_pro_league(league_id: String) -> bool:
	return PRO_LEAGUES.has(league_id)


static func roster_max_of(league_id: String) -> int:
	return int(ROSTER_LIMITS.get(league_id, {}).get("max", ROSTER_MAX_FALLBACK))


static func roster_min_of(league_id: String) -> int:
	return int(ROSTER_LIMITS.get(league_id, {}).get("min", ROSTER_MIN_FALLBACK))


static func is_pitcher(position: String) -> bool:
	return PITCHER_POSITIONS.has(position)


## 성적 점수 −1.0 ~ +1.0.
##
## ⚠ **표본이 적으면 그만큼 0쪽으로 당긴다.** 몇 경기 안 뛴 선수가 요행으로
## 1군에 올라오지 않게 하는 장치다 — 없으면 1이닝 무실점이 최고 성적이 된다.
##
## 기록이 아예 없으면 0이라 판정이 능력치만 보게 된다
static func form_score(perf: Dictionary, pitcher: bool) -> float:
	var raw: float = 0.0
	var sample: float = 0.0

	# ⚠ **기록이 없으면 표본이 0이라 점수도 0이 된다.** 원본은 여기에 이른
	# 반환을 하나 더 뒀는데 표본 항이 이미 같은 일을 한다 — 그래서 두지
	# 않는다. 대신 표본을 **0 아래로도 안 내려가게** 자른다: 안 그러면
	# 음수 이닝 같은 망가진 입력이 부호를 뒤집어 **못 던진 선수가 올라온다**
	if pitcher:
		# 자책점이 기준보다 낮으면 +. 기준 대비 비율이라 +1.0은 자책점 0
		raw = (PITCHER_ERA_BASELINE - float(perf.get("era", PITCHER_ERA_BASELINE))) \
			/ maxf(PITCHER_ERA_BASELINE, 0.01)
		sample = clampf(float(perf.get("innings", 0.0)) / maxf(PITCHER_FULL_INNINGS, 1.0),
			0.0, 1.0)
	else:
		# OPS는 기준 대비 비율. 0.700 기준에 0.910이면 +0.3
		raw = (float(perf.get("ops", BATTER_OPS_BASELINE)) - BATTER_OPS_BASELINE) \
			/ maxf(BATTER_OPS_BASELINE, 0.01)
		sample = clampf(float(perf.get("pa", 0)) / maxf(BATTER_FULL_PA, 1.0), 0.0, 1.0)

	# ⚠ **±1을 안 넘는다.** 안 자르면 ERA 0.00이 성적 하나로 OVR 30점어치를
	# 끌어올려 능력치를 통째로 덮는다
	return clampf(raw * sample, -FORM_SPAN, FORM_SPAN)


## 능력치 + 성적. **승강 판정이 비교하는 단일 값**이다
static func rated(p: Dictionary) -> float:
	var pitcher: bool = is_pitcher(p.get("position", ""))
	return float(p.get("ovr", 0.0)) + form_score(p.get("perf", {}), pitcher) * FORM_WEIGHT


static func is_slumping(score: float) -> bool:
	return score < SLUMP_SCORE


## 충원할 자리. **부족한 순서**로 준다.
##
## ⚠ **포지션 공백만 보면 야수 총원이 빈다.** 실측 고교 102팀 전부가 어느
## 해엔가 포지션 공백이었고 포수 0명이 31팀이었다.
##
## ⚠ **순서가 없으면 사전 순으로 채워서 포수 0명이 안 고쳐진다.** 한 명만
## 채울 수 있을 때 제일 빈 자리부터 채운다
static func needed_positions(roster: Array, mins: Dictionary) -> Array:
	var have: Dictionary = {}
	for p in roster:
		var pos: String = p.get("position", "")
		have[pos] = int(have.get(pos, 0)) + 1

	var gaps: Array = []
	for pos in mins:
		var short: int = int(mins[pos]) - int(have.get(pos, 0))
		if short > 0:
			gaps.append({"position": pos, "short": short})

	gaps.sort_custom(func(a, b) -> bool: return a["short"] > b["short"])

	var out: Array = []
	for g in gaps:
		out.append(g["position"])
	return out


## 이 자리를 팜에서 올려도 되나 — **하한을 깨면 안 된다**
static func farm_can_send_up(farm: Array, position: String) -> bool:
	var pitcher: bool = is_pitcher(position)
	var count: int = 0
	for p in farm:
		if is_pitcher(p.get("position", "")) == pitcher:
			count += 1
	return count > (FARM_MIN_PITCHERS if pitcher else FARM_MIN_BATTERS)


# ── 콜업 판정 ─────────────────────────────────────────────────
#
# 원본: `packages/engine-native/src/team_engine.rs:178` `eval_callup_candidates`

## 사유 — **화면·로그에서 "자리가 비었다"와 "투수가 모자라다"는 다른 일이다**
const REASON_POSITION_GAP: String = "position_gap"
const REASON_INJURY: String = "injury_replacement"
const REASON_SLUMP: String = "slump_replacement"
const REASON_DEVELOPMENT: String = "development_exposure"
const REASON_UPGRADE: String = "performance_upgrade"
const REASON_PITCHER_SHORT: String = "pitcher_short"

## 상시 콜업이 다루는 사유 — **빈 자리 메우기만.** 나머지는 정기의 몫이다
const URGENT_REASONS: Array[String] = [REASON_INJURY, REASON_SLUMP]

## 문턱은 성적 압박이 낮춘다 — `10 − winNowPressure × 0.05`
const CALLUP_THRESHOLD_BASE: float = 10.0
const CALLUP_THRESHOLD_PER_PRESSURE: float = 0.05

## 능력치 차가 점수로 얹히는 배수
const CALLUP_GAP_WEIGHT: float = 2.0
## 부상 대체
const CALLUP_INJURY_BONUS: float = 50.0
## 자리 공백. **부상 대체보다 세다** — 포수 0명은 경기가 성립하지 않는다
const CALLUP_GAP_BONUS: float = 60.0
## 장기 부진이 자리를 지키고 있으면 교체 압력이 오른다
const CALLUP_SLUMP_BONUS: float = 20.0
## 투수 하한 보충. **자리 공백보다 낮다** — 로테이션이 얇아도 경기는 된다
const CALLUP_PITCHER_SHORT_SCORE: float = 40.0

## 구단 성향이 미는 몫
const CALLUP_UNSTABLE_BONUS: float = 8.0
const CALLUP_STABLE_PENALTY: float = 5.0
const CALLUP_YOUNG_BONUS: float = 6.0
const CALLUP_PRESSURE_MULT: float = 1.5
const CALLUP_VETERAN_BONUS: float = 3.0

const CALLUP_UNSTABLE_BELOW: float = 40.0
const CALLUP_STABLE_ABOVE: float = 70.0
const CALLUP_DEVELOPMENT_ABOVE: float = 60.0
const CALLUP_YOUNG_AGE: int = 23
const CALLUP_PRESSURE_ABOVE: float = 70.0
const CALLUP_VETERAN_AGE: int = 28

## 감독의 승부처 판단이 성적을 얼마나 정확히 읽는가 — 낮은 감독은 이름값만 본다
const MOD_CLAMP_LO: float = 0.70
const MOD_CLAMP_HI: float = 1.30


static func _count_at(roster: Array, position: String) -> int:
	var n: int = 0
	for a in roster:
		if String(a.get("position", "")) == position:
			n += 1
	return n


static func _weakest(pool: Array, mod: float = 1.0) -> Dictionary:
	var best: Dictionary = {}
	var best_score: float = INF
	for p in pool:
		var s: float = _rated_with(p, mod)
		if s < best_score:
			best_score = s
			best = p
	return best


## `rated()`에 감독 보정을 건 값. **성적 몫에만 걸린다** — 점수 전체에
## 곱하면 능력치 차까지 감독이 흔든다
static func _rated_with(p: Dictionary, mod: float) -> float:
	var pitcher: bool = is_pitcher(String(p.get("position", "")))
	return float(p.get("ovr", 0.0)) \
		+ form_score(p.get("perf", {}), pitcher) * FORM_WEIGHT * mod


## 올릴 사람 · 내릴 사람 후보. **점수 높은 순**으로 준다.
##
## ⚠ **육성선수는 입단 연도에 1군에 못 올라간다**(KBO 5월 1일 이후).
## 여기서 빼는 건 **후보 자격뿐이다** — 정원 계산에는 그대로 센다. 아예
## 빼면 2군이 얇아 보여서 육성선수를 또 만들고, 그게 다음 해에 다시 못 올라간다.
##
## ⚠ **투수 하한 보충은 아래 별도 패스다.** 02는 이걸 `gap_fill`에 묶었다가
## 투수 12명 미만인 모든 팀에서 부진·부상 교체가 사라져 회귀 4건이 깨졌다
static func eval_callup(profile: Dictionary, farm: Array, active: Array,
		injured_ids: Array, callup_mod: float = 1.0) -> Array:
	var candidates: Array = []
	var threshold: float = CALLUP_THRESHOLD_BASE \
		- float(profile.get("win_now_pressure", 50.0)) \
			* CALLUP_THRESHOLD_PER_PRESSURE
	var mod: float = clampf(callup_mod, MOD_CLAMP_LO, MOD_CLAMP_HI)

	var pitchers_now: int = 0
	for a in active:
		if is_pitcher(String(a.get("position", ""))):
			pitchers_now += 1
	var pitcher_short: bool = pitchers_now < FIRST_TEAM_MIN_PITCHERS

	for f in farm:
		if not bool(f.get("registrable", true)):
			continue
		var pos: String = String(f.get("position", ""))

		# 외국인은 교체 대상에서 뺀다 — 내려가는 자리에 걸리면 1군 전용이 깨진다
		var at_pos: Array = []
		for a in active:
			if String(a.get("position", "")) == pos \
					and not bool(a.get("is_foreign", false)):
				at_pos.append(a)

		# ⚠ **자리가 비면 콜업으로는 영영 못 메운다.** 콜업은 같은 포지션 1:1
		# 교체라 포수가 0명이 되면 올릴 방법이 사라진다 — 02 실측에서 리그마다
		# 1~2팀이 포수 0명이었다. 비었으면 **같은 부류에서 남는 자리의 최약체**를
		# 내린다. 부류를 안 맞추면 야수 공백을 메우려고 투수를 내려 반대쪽이 깨진다
		var gap_fill: bool = at_pos.is_empty()

		# ⚠ **2군도 경기를 한다.** 1군 쪽은 마지막 한 명을 지키는데 2군 쪽에
		# 같은 보호가 없어서 02는 2군의 마지막 포수를 올려버렸다.
		# 다만 1군 그 자리가 비었으면 올린다 — **1군 포수 0명이 더 나쁘다**
		if not gap_fill and is_specialist_position(pos):
			if _count_at(farm, pos) <= 1:
				continue

		var pool: Array = at_pos
		if gap_fill:
			# ⚠ **공백 충원은 2군 구성을 바꾼다.** 일반 콜업은 1:1이라 자리가
			# 메워지지만 여기선 부류가 다를 수 있다 — 안 막았더니 02 실측에서
			# 2군 투수가 7명 → **0명**이 됐다
			if not farm_can_send_up(farm, pos):
				continue
			pool = []
			var cls: bool = is_pitcher(pos)
			for a in active:
				if bool(a.get("is_foreign", false)):
					continue
				if is_pitcher(String(a.get("position", ""))) != cls:
					continue
				if _count_at(active, String(a.get("position", ""))) >= 2:
					pool.append(a)
		if pool.is_empty():
			continue

		# **성적을 반영한 값으로 최약체를 고른다.** OVR만 보면 시즌 내내
		# 부진한 베테랑이 자리를 지킨다
		var weakest: Dictionary = _weakest(pool, mod)
		var is_injury: bool = injured_ids.has(String(weakest.get("id", "")))
		var score: float = (_rated_with(f, mod) - _rated_with(weakest, mod)) \
			* CALLUP_GAP_WEIGHT

		if is_injury:
			score += CALLUP_INJURY_BONUS
		if gap_fill:
			score += CALLUP_GAP_BONUS
		var stability: float = float(profile.get("stability", 50.0))
		if stability < CALLUP_UNSTABLE_BELOW:
			score += CALLUP_UNSTABLE_BONUS
		if stability > CALLUP_STABLE_ABOVE:
			score -= CALLUP_STABLE_PENALTY
		var development: float = float(profile.get("development_focus", 50.0))
		if development > CALLUP_DEVELOPMENT_ABOVE \
				and int(f.get("age", 25)) <= CALLUP_YOUNG_AGE:
			score += CALLUP_YOUNG_BONUS
		var pressure: float = float(profile.get("win_now_pressure", 50.0))
		if pressure > CALLUP_PRESSURE_ABOVE:
			score *= CALLUP_PRESSURE_MULT
			if int(f.get("age", 25)) > CALLUP_VETERAN_AGE:
				score += CALLUP_VETERAN_BONUS

		var slumping: bool = is_slumping(form_score(weakest.get("perf", {}),
			is_pitcher(String(weakest.get("position", "")))) * mod)
		if slumping:
			score += CALLUP_SLUMP_BONUS

		if score >= threshold:
			var reason: String = REASON_UPGRADE
			if gap_fill:
				reason = REASON_POSITION_GAP
			elif is_injury:
				reason = REASON_INJURY
			elif slumping:
				reason = REASON_SLUMP
			elif development > CALLUP_DEVELOPMENT_ABOVE:
				reason = REASON_DEVELOPMENT
			candidates.append({
				"player_id": String(f.get("id", "")),
				"replaces_player_id": String(weakest.get("id", "")),
				"priority_score": score, "reason": reason,
			})

	_append_pitcher_short(candidates, farm, active, pitcher_short, mod)

	candidates.sort_custom(func(a, b) -> bool:
		return float(a["priority_score"]) > float(b["priority_score"]))
	return candidates


## 투수 하한 보충 — **별도 패스다.**
##
## ⚠ 위 루프로는 못 고친다. 같은 자리 1:1 교체라 **투수를 올리고 투수를 내려
## 순증이 0**이고, `position_gap`은 포지션 단위라 SP·RP에 하나씩만 있어도
## 안 걸린다.
##
## ⚠ **위 판정에 끼워 넣으면 안 된다.** 02가 `gap_fill`에 묶었다가 투수 12명
## 미만인 모든 팀에서 부진·부상 교체가 사라졌다(회귀 4건). 하한은 **최후
## 수단**이지 우선순위가 아니다
static func _append_pitcher_short(candidates: Array, farm: Array,
		active: Array, pitcher_short: bool, mod: float) -> void:
	if not pitcher_short:
		return
	# 이미 투수가 올라가고 있으면 그걸로 족하다
	for c in candidates:
		for f in farm:
			if String(f.get("id", "")) == String(c["player_id"]) \
					and is_pitcher(String(f.get("position", ""))):
				return

	var batters_now: int = 0
	for a in active:
		if not is_pitcher(String(a.get("position", ""))):
			batters_now += 1
	var farm_pitchers: int = 0
	for f2 in farm:
		if is_pitcher(String(f2.get("position", ""))):
			farm_pitchers += 1

	# ⚠ 야수 하한 아래로는 안 내린다 — 이번엔 타순이 무너진다.
	# 2군 투수 하한도 본다 — 2군도 경기를 한다
	if batters_now <= FIRST_TEAM_MIN_BATTERS or farm_pitchers <= FARM_MIN_PITCHERS:
		return

	# 육성선수는 여기서도 뺀다 — 하한이 급해도 등록 자체가 안 된다.
	# `farm_pitchers` 정원 계산에는 위에서 그대로 셌다
	var up: Dictionary = {}
	var up_score: float = -INF
	for f3 in farm:
		if not bool(f3.get("registrable", true)):
			continue
		if not is_pitcher(String(f3.get("position", ""))):
			continue
		if _rated_with(f3, mod) > up_score:
			up_score = _rated_with(f3, mod)
			up = f3

	var down_pool: Array = []
	for a2 in active:
		if bool(a2.get("is_foreign", false)):
			continue
		if is_pitcher(String(a2.get("position", ""))):
			continue
		if _count_at(active, String(a2.get("position", ""))) >= 2:
			down_pool.append(a2)
	var down: Dictionary = _weakest(down_pool, mod)

	if up.is_empty() or down.is_empty():
		return
	candidates.append({
		"player_id": String(up["id"]),
		"replaces_player_id": String(down["id"]),
		"priority_score": CALLUP_PITCHER_SHORT_SCORE,
		"reason": REASON_PITCHER_SHORT,
	})


# ── 콜다운 판정 ───────────────────────────────────────────────
#
# 원본: `packages/engine-native/src/team_engine.rs:397` `eval_calldown_candidates`

## 이 값 아래인 만큼 강등 점수가 오른다
const CALLDOWN_RATED_BASE: float = 60.0
## 연봉이 점수로 바뀌는 나눔수
const CALLDOWN_SALARY_DIVISOR: float = 100000.0
const CALLDOWN_PRESSURE_BONUS: float = 10.0
const CALLDOWN_PRESSURE_ABOVE: float = 60.0
const CALLDOWN_PRESSURE_RATED_BELOW: float = 65.0
const CALLDOWN_OLD_BONUS: float = 8.0
const CALLDOWN_DEVELOPMENT_ABOVE: float = 60.0
const CALLDOWN_OLD_AGE: int = 32


## 내릴 사람 후보. **정원 초과분만** 준다.
##
## ⚠ 02는 `over.max(3)`이라 정원에 여유가 있어도 매번 셋을 내놨고, 호출측이
## 둘을 실제로 내렸다. 콜업은 1:1이라 정원을 안 늘리는데 콜다운만 매달 둘씩
## 나가서 **한 시즌에 1군이 30명 → 16명**으로 말랐다.
##
## ⚠ **외국인은 2군에 안 내린다.** 보유 한도(1군 3명)가 강등으로 새면 그 팀은
## 한 자리를 놀리고 2군에 외국인이 쌓여 한도 계산이 흐려진다 — 방출이 답이다.
##
## ⚠ **하한 둘 다 잠기면 강등을 멈추고 정원 초과를 감수한다.** 그 로스터는
## 강등으로 풀 문제가 아니다 — 어느 쪽을 내려도 라인업이나 등판이 무너진다
static func eval_calldown(profile: Dictionary, active: Array,
		roster_max: int, callup_mod: float = 1.0) -> Array:
	var over: int = maxi(active.size() - roster_max, 0)
	if over <= 0:
		return []

	var pitchers_now: int = 0
	var batters_now: int = 0
	var starters_now: int = 0
	for a in active:
		if is_pitcher(String(a.get("position", ""))):
			pitchers_now += 1
			if String(a.get("position", "")) == "SP":
				starters_now += 1
		else:
			batters_now += 1

	var batters_locked: bool = batters_now <= FIRST_TEAM_MIN_BATTERS
	var pitchers_locked: bool = pitchers_now <= FIRST_TEAM_MIN_PITCHERS
	var starters_locked: bool = starters_now <= FIRST_TEAM_MIN_STARTERS
	if batters_locked and pitchers_locked:
		return []

	var mod: float = clampf(callup_mod, MOD_CLAMP_LO, MOD_CLAMP_HI)
	var scored: Array = []
	for a in active:
		if bool(a.get("is_foreign", false)):
			continue
		var pit: bool = is_pitcher(String(a.get("position", "")))
		if batters_locked and not pit:
			continue
		if pitchers_locked and pit:
			continue
		# 선발이 하한이면 선발은 안 내린다 — 불펜·야수에서 고른다
		if starters_locked and String(a.get("position", "")) == "SP":
			continue

		# 성적을 반영한 값으로 본다 — 능력치만 보면 부진한 고연봉 베테랑이
		# 시즌 내내 1군을 지킨다
		var r: float = _rated_with(a, mod)
		var score: float = maxf(CALLDOWN_RATED_BASE - r, 0.0)
		score += float(a.get("salary", 0)) / CALLDOWN_SALARY_DIVISOR
		if float(profile.get("win_now_pressure", 50.0)) > CALLDOWN_PRESSURE_ABOVE \
				and r < CALLDOWN_PRESSURE_RATED_BELOW:
			score += CALLDOWN_PRESSURE_BONUS
		if float(profile.get("development_focus", 50.0)) \
				> CALLDOWN_DEVELOPMENT_ABOVE \
				and int(a.get("age", 25)) > CALLDOWN_OLD_AGE:
			score += CALLDOWN_OLD_BONUS
		scored.append({"player_id": String(a.get("id", "")),
			"priority_score": score})

	scored.sort_custom(func(x, y) -> bool:
		return float(x["priority_score"]) > float(y["priority_score"]))
	return scored.slice(0, over)
