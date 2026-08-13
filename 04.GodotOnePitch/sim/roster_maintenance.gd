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

const PITCHER_POSITIONS: Array[String] = ["SP", "RP", "CP", "P"]


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
