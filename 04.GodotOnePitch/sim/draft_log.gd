extends RefCounted
class_name DraftLog

## 드래프트 기록 — 보드가 재생할 그 해의 지명. C-1 / B-10c.
##
## 원본: `usecases/runDraftBoardBackground.ts` · `features/career/ui/DraftBoardModal.svelte`
##
## ⚠ **보드가 자기 후보 풀을 따로 만들면 안 된다.** 02가 그랬다 — 관전
## 보드가 자체 풀(고교 3학년 상위 80% + 대학 30 + 독립 15)로 자체 시뮬을
## 돌려 DB에 직접 썼고, 시즌 종료의 실제 드래프트가 **다른 풀로 또 한 번**
## 돌았다. 거래기록이 두 벌 쌓이면서 **화면에서 본 지명과 실제 소속이
## 어긋났다.**
##
## 04는 드래프트가 `NpcDraft.run` 하나뿐이다. 여기는 **그 결과를 남기기만**
## 하고 보드는 그걸 재생한다.
##
## ⚠ **지명 당일의 값을 박아 둔다.** 선수는 그 뒤로 자라고 팀을 옮긴다 —
## 나중에 원본을 다시 읽으면 "3라운드에 뽑힌 OVR 82"처럼 그날과 다른 숫자가
## 뜬다. 보드는 그날의 이야기다.


## 상태에서 기록이 사는 자리 — 연도마다 한 벌
const KEY: String = "draft_log"


static func all_of(state: Dictionary) -> Dictionary:
	var d = state.get(KEY, {})
	return d if d is Dictionary else {}


## 그 해 기록. 없으면 빈 사전
static func of(state: Dictionary, year: int) -> Dictionary:
	return all_of(state).get(str(year), {})


## 그날의 선수 한 줄. **보드가 계산할 게 없게 여기서 다 편다**
static func snapshot_of(p: Dictionary) -> Dictionary:
	return {
		"id": String(p.get("id", "")),
		"name": String(p.get("name", p.get("id", ""))),
		"position": String(p.get("position", "")),
		"ovr": Contract.core_ovr(p),
		"age": int(p.get("age", 0)),
		"from_league_id": String(p.get("league_id", "")),
		"is_protagonist": bool(p.get("is_protagonist", false)),
	}


## 그 해 드래프트를 남긴다. 남긴 지명 수.
##
## `picks`는 `NpcDraft.run`이 준 그대로, `by_id`는 후보 사전
static func record(state: Dictionary, year: int, picks: Array,
		board: Array, undrafted_ids: Array, by_id: Dictionary) -> int:
	var rows: Array = []
	for p in picks:
		var who = by_id.get(String(p["npc_id"]), null)
		if who == null:
			continue
		var row: Dictionary = snapshot_of(who)
		row["round"] = int(p["round"])
		row["pick"] = int(p["pick"])
		row["team_id"] = String(p["team_id"])
		rows.append(row)

	# 보드에 올랐지만 안 뽑힌 사람 — **"몇 명 중 몇 명"이 보드의 뜻이다**
	var missed: Array = []
	for id in undrafted_ids:
		var who2 = by_id.get(String(id), null)
		if who2 != null and board.has(String(id)):
			missed.append(snapshot_of(who2))

	var all: Dictionary = all_of(state)
	all[str(year)] = {
		"year": year,
		"picks": rows,
		"board_size": board.size(),
		"missed": missed,
		"candidates": by_id.size(),
	}
	state[KEY] = all
	return rows.size()
