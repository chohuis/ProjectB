extends RefCounted
class_name TeamDetailVm

## 팀 상세 — F-4b · F-3b.
##
## 원본: `features/team/ui/TeamDetailModal.svelte` (979줄)
##
## ⚠ **02의 "팀 평가"는 이걸로 못 옮긴다.** 02는 `team.profile`의
## `prestige`(문자열 등급) · `fanBase` · `facilityLevel` · `atmosphere`를
## 보여주는데, **04엔 그 데이터가 없다**(`teams.json`은 id·이름·도시·색·
## 구장·전력★·재정 등급뿐). 대신 **F-3에서 살린 `TeamProfile` 열두 축**을
## 보여준다 — 그게 04에서 실제로 게임을 움직이는 값이고(FA 입찰·트레이드·
## 승강·방출), 지금 어디에서도 볼 방법이 없다.
##
## ⚠ **로스터를 여기서 다시 만들지 않는다.** `TeamVm.rows_of`가 정본이다 —
## 두 벌로 두면 팀 탭과 팀 상세가 같은 팀을 다르게 정렬하고 OVR도 갈린다.

## 화면에 띄우는 성향 축. **순서가 곧 읽는 순서다** — 구단이 어떤 곳인지를
## 위에서부터 말한다(돈 → 방향 → 조급함 → 사람 → 시설)
const AXES: Array[Array] = [
	["prestige", "명성"],
	["owner_spending_willingness", "지갑"],
	["market_appeal", "시장"],
	["development_focus", "육성"],
	["win_now_pressure", "성적 압박"],
	["owner_patience", "구단주 인내"],
	["scouting_quality", "스카우팅"],
	["medical_quality", "의료"],
	["farm_investment", "2군 투자"],
	["clubhouse_culture", "클럽하우스"],
	["discipline", "규율"],
	["stability", "안정"],
]


## 팀 하나. 못 찾으면 `{}`
static func build(state: Dictionary, team_id: String) -> Dictionary:
	if team_id.is_empty():
		return {}
	var name: String = String(World.team_field({}, team_id, "name", ""))
	if name.is_empty():
		return {}

	var world: Dictionary = state.get("world", {})
	var me: String = String(state.get("protagonist", {}).get("id", ""))
	var league_id: String = String(World.team_field({}, team_id, "league_id", ""))

	return {
		"id": team_id,
		"name": name,
		"city": String(World.team_field({}, team_id, "city", "")),
		"stadium": ParkVm.name_of(String(World.team_field({}, team_id, "stadium", ""))),
		# 구장 성향 — F-4d. **표시용이다**(02도 엔진엔 안 먹인다)
		"park_factor": ParkVm.factor_of(
			String(World.team_field({}, team_id, "stadium", ""))),
		"league_label": String(StatusVm.LEAGUE_SHORT.get(league_id, league_id)),
		# 내 팀이면 그렇다고 말한다 — 리그 표에서 눌러 들어오면 헷갈린다
		"is_mine": team_id == String(state.get("protagonist", {}).get("team_id", "")),
		"standing": _standing(state, team_id, league_id),
		"profile": _profile(world, team_id),
		"roster": TeamVm.rows_of(world, team_id, me),
	}


## 이번 시즌 성적. **`Standings`가 정본이다** — 화면이 일정에서 다시 세면
## 리그 표와 갈린다
## ⚠ **여기서 다시 정렬하지 않는다.** `from_schedule`이 이미 `sorted`를
## 거쳐 `rank`까지 붙여 준다(`standings.gd:172-174`) — 한 번 더 부르고
## 자리 번호를 다시 매기면 그게 두 번째 정본이 되고, 정렬 규칙이 갈리는
## 순간 리그 표와 팀 상세가 다른 순위를 말한다. **변이로 잡았다**
static func _standing(state: Dictionary, team_id: String,
		league_id: String) -> Dictionary:
	var rows: Array = Standings.from_schedule(state.get("schedule", []), league_id)
	for r in rows:
		if String(r.get("team_id", "")) != team_id:
			continue
		return {
			"wins": int(r.get("wins", 0)),
			"losses": int(r.get("losses", 0)),
			"draws": int(r.get("draws", 0)),
			"win_pct": float(r.get("win_pct", 0.0)),
			"rank": int(r.get("rank", 0)),
			"total": rows.size(),
		}
	# ⚠ **한 경기도 안 치렀으면 빈 사전이다.** 0승 0패 1위로 뜨면
	# 시즌이 시작된 것처럼 보인다
	return {}


## 구단 성향 열두 축 — F-3에서 살린 것.
##
## ⚠ **전부 50이면 안 보여준다.** F-3 전에는 아홉 축이 중립으로 굳어
## 있었는데, 그걸 막대로 그리면 **모든 팀이 똑같은 그림**이 되어
## "이 팀은 특징이 없다"가 아니라 "화면이 고장났다"로 읽힌다
static func _profile(world: Dictionary, team_id: String) -> Array:
	if not world.get(TeamProfile.KEY, {}).has(team_id):
		return []
	var p: Dictionary = TeamProfile.of(world, team_id)
	var out: Array = []
	for pair in AXES:
		out.append({"name": String(pair[1]), "value": float(p.get(pair[0], 50.0))})
	return out
