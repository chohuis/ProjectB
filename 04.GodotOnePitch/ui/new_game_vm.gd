extends RefCounted
class_name NewGameVm

## 새 게임 화면 ViewModel — M7-6d.
##
## 원본: `pages/new-game/NewGamePage.svelte`
##
## ⚠ **02는 여기서 `Math.random()`을 썼다** (주인공 잠재력·성장률).
## 그래서 같은 씨앗을 넣어도 주인공이 매번 달랐다 — 시드 기반 조사를
## 한다면서 절반만 그랬다. 여기서는 씨앗 하나가 주인공까지 정한다.


## 고를 수 있는 시작 지점. **고교 하나뿐이다** — 02도 그랬다
const START_LEAGUE := "LEAGUE_HIGHSCHOOL"

const DEFAULT_NAME := "김한결"


static func build(s: Dictionary = {}) -> Dictionary:
	var teams: Array = []
	for t in World.teams_of(START_LEAGUE):
		teams.append({"id": t["id"], "name": t["name"]})
	# ⚠ **이름 순으로 준다.** 데이터 순서는 아무 뜻이 없고, 102팀에서
	# 자기 학교를 찾으려면 순서가 있어야 한다
	teams.sort_custom(func(a, b) -> bool: return a["name"] < b["name"])

	var name: String = s.get("name", DEFAULT_NAME)
	var team_id: String = s.get("team_id", teams[0]["id"] if not teams.is_empty() else "")

	return {
		"name": name,
		"team_id": team_id,
		"teams": teams,
		"seed": int(s.get("seed", 0)),
		# ⚠ **이름이 비면 시작할 수 없다.** 빈 이름으로 만들면 화면 곳곳이
		# 빈칸이 되고 원인을 못 찾는다
		"can_start": not name.strip_edges().is_empty() and not team_id.is_empty(),
	}


## 새 게임을 만든다. **씨앗을 안 주면 시각으로 뽑는다** —
## 매번 다른 세계가 나와야 하지만, 그 씨앗은 세이브에 남아 재현된다
static func start(p: Dictionary) -> Dictionary:
	var seed_value: int = int(p.get("seed", 0))
	if seed_value == 0:
		seed_value = int(Time.get_unix_time_from_system()) & 0x7FFFFFFF

	return World.new_game({
		"seed": seed_value,
		"season_year": int(p.get("season_year", 2027)),
		"name": String(p.get("name", DEFAULT_NAME)).strip_edges(),
		"team_id": p.get("team_id", ""),
		"league_id": START_LEAGUE,
	})
