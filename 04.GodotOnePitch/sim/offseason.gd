extends RefCounted
class_name Offseason

## 오프시즌 — 부상 회복 · 은퇴 판정. M9-2.
##
## 원본: `packages/engine-native/src/npc_sim.rs`의 `normalize_offseason_npcs`
##
## ⚠ **자리를 비우는 건 은퇴뿐이다.** 진급은 부상 중에도 돈다 —
## `Promotion` 머리말에 왜 그런지 적혀 있다.

const RETIRED_LEAGUE: String = Promotion.RETIRED_LEAGUE

## 은퇴 판정 시작 나이. **34세까지는 안 본다**
const RETIRE_FROM_AGE: int = 35
## 나이 한 살당 오르는 확률
const AGE_STEP: float = 0.06
## 이 아래면 능력치 벌점이 붙는다
const LOW_OVR: float = 55.0
const LOW_OVR_STEP: float = 0.01
## 한 해에 이 이상은 안 나간다 — 안 자르면 노장이 한꺼번에 사라진다
const RETIRE_CAP: float = 0.72


## 그 선수의 대표 능력치. **투수는 투구, 야수는 타격**
static func core_ovr(p: Dictionary) -> float:
	if p.get("player_type", "") == "pitcher":
		return float(p.get("pitching", {}).get("ovr", 0.0))
	return float(p.get("batting", {}).get("ovr", 0.0))


## 이 나이·능력이면 몇 할로 그만두나
static func retire_chance(age: int, ovr: float) -> float:
	if age < RETIRE_FROM_AGE:
		return 0.0
	var penalty: float = maxf(LOW_OVR - ovr, 0.0) * LOW_OVR_STEP
	return minf(AGE_STEP * float(age - (RETIRE_FROM_AGE - 1)) + penalty, RETIRE_CAP)


## 한 해 오프시즌. 선수 목록을 **제자리에서** 고치고 `{retired, healed}`를 준다.
##
## ⚠ **부상은 시즌이 끝나면 낫는다.** 02는 완치돼도 상태가 안 풀리는 결함이
## 있어서 시즌 중 고교의 47%가 injured였다
static func run(npcs: Array, season_year: int, rng) -> Dictionary:
	var retired: Array = []
	var healed: int = 0

	for npc in npcs:
		if npc.get("career_status", "") == "injured":
			npc["career_status"] = "active"
			healed += 1
			continue
		if npc.get("career_status", "") != "active":
			continue
		if npc.get("league_id", "") == RETIRED_LEAGUE:
			continue

		var age: int = int(npc.get("age", 0))
		if rng.randf() >= retire_chance(age, core_ovr(npc)):
			continue

		# ⚠ **소속을 비우기 전에 남긴다.** 어디서 은퇴했는지가 사라진다
		var from_team: String = String(npc.get("team_id", ""))
		var from_league: String = String(npc.get("league_id", ""))
		npc["career_history"] = Promotion.push_year_once(
			npc.get("career_history", []), {
				"year": season_year, "league_id": from_league,
				"team_id": from_team, "stat_line": "retired", "highlights": [],
			})
		# ⚠ **은퇴가 경력 사건으로 안 남고 있었다.** 02는 `retirement`가
		# 정의돼 있는데 쓰는 곳이 주인공 경로뿐이라 NPC는 경력 화면에
		# 은퇴가 안 떴다. 사건 집계로 세대교체를 볼 방법도 없어서
		# "나이 은퇴가 한 번도 없다"고 잘못 읽기까지 했다
		var events: Array = npc.get("career_events", [])
		events.append({
			"year": season_year, "type": "retirement",
			"from_team_id": from_team, "from_league_id": from_league,
			"detail": "%d세 은퇴" % age,
		})
		npc["career_events"] = events

		npc["career_status"] = "retired"
		npc["league_id"] = RETIRED_LEAGUE
		npc["team_id"] = ""
		retired.append(npc)

	return {"retired": retired, "healed": healed}
