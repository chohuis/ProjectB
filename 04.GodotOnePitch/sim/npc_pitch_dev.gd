extends RefCounted
class_name NpcPitchDev

## NPC 구종 성장 — D-3.
##
## 원본: `npc_sim.rs`의 `npc_pitch_target`(2813) · `pitch_progress_per_week`
##       (2822) · `decide_pitch_training`(2833) · 주간 루프(3112-3155)
##
## 🔴 **04의 NPC는 `pitches`가 없어 마운드에서 늘 포심만 던졌다.**
## `PitchAi.pick_from_arsenal`이 빈 배열에 `"fastball"`을 돌려주고, 그래서
## `pitch_pattern_modifier`(같은 구종 반복 벌점)가 **NPC 경기 내내** 걸렸다.
##
## ⚠ **초기 생성이 문제가 아니었다.** 02의 NPC도 `pitches`가 빈 채로 시작한다
## — 04와 같다. **갈리는 건 주간 성장**이고, 04엔 그 자리가 통째로 없었다.
##
## ⚠ **주인공과 같은 표를 쓴다**(`AutoTraining.pitch_target`). 두 벌로 두면
## 언젠가 갈리고, 그 격차가 그대로 성적이 된다 — 그래서 여기서 위임한다.
##
## ⚠ **NPC는 사전이다.** `NpcStore`의 열 배열이 아니라 로스터 사전을
## 제자리에서 고친다(`save_game.gd`가 통째로 저장한다) — 열을 안 늘려도 된다.

## 숙련도 상한 — 02 `grade.min(5)` · 04 `PitchDev.MAX_GRADE`와 같다
const MAX_GRADE: int = 5

## 가질 수 있는 구종 수의 하드 상한 — 02 `pitches.len() < 5`
const MAX_PITCHES: int = 5

## 이 나이부터는 아무것도 안 배운다 — 02 `age >= 33`
const LEARN_AGE_MAX: int = 33

## 이 나이부터는 **새 구종을 못 얻는다.** 있는 것만 올린다 — 02 `age < 29`
const NEW_PITCH_AGE_MAX: int = 29

## 잠재력 대비 이만큼은 채워야 구종을 늘린다 — 02 `ovr / potential < 0.70`
const READY_RATIO: float = 0.70

## 숙련도별 주당 진행 — 02 `pitch_progress_per_week`.
## **잘 익힌 구종일수록 느리다**. 칸은 `[발견→1, 1→2, 2→3, 3→4, 4→5]` 주
const WEEKS_PER_GRADE: Array[float] = [8.0, 8.0, 12.0, 24.0, 36.0]


## 그 보직·구속이 몇 개를 목표하나. **주인공 표에 위임한다** — 02도 같은 표다
static func target_of(role: String, velocity: float) -> int:
	return AutoTraining.pitch_target(role, velocity)


## 이번 주 얼마나 나아가나. 숙련도 5는 끝이라 0이다
static func progress_per_week(grade: int) -> float:
	if grade < 0 or grade >= WEEKS_PER_GRADE.size():
		return 0.0
	return 100.0 / WEEKS_PER_GRADE[grade]


static func _grade_of(pitches: Array, pitch_id: String) -> int:
	for e in pitches:
		if String(e.get("id", "")) == pitch_id:
			return int(e.get("grade", 0))
	return 0


## 다음에 무엇을 훈련하나. `{pitch_id, progress, is_new}` — 없으면 빈 사전.
##
## ⚠ **02의 자격 셋을 그대로 옮겼다.** 33세 이상은 안 배우고, 잠재력 대비
## 70%를 못 채웠으면 구종보다 능력치가 먼저고, 새 구종은 29세 미만만 얻는다
static func decide(npc: Dictionary, catalog_ids: Array) -> Dictionary:
	var age: int = int(npc.get("age", 25))
	if age >= LEARN_AGE_MAX:
		return {}

	var pitching: Dictionary = npc.get("pitching", {})
	var potential: float = float(npc.get("potential_hidden", 0.0))
	if potential > 0.0 \
			and float(pitching.get("ovr", 0.0)) / potential < READY_RATIO:
		return {}

	var pitches: Array = npc.get("pitches", [])
	var target: int = target_of(String(npc.get("position", "")),
		float(pitching.get("velocity", 50.0)))

	# 목표에 못 미치고 아직 젊으면 **새 구종을 발견한다**
	if pitches.size() < target and age < NEW_PITCH_AGE_MAX \
			and not catalog_ids.is_empty():
		var known: Dictionary = {}
		for e in pitches:
			known[String(e.get("id", ""))] = true
		var candidates: Array = []
		for id in catalog_ids:
			if not known.has(String(id)):
				candidates.append(String(id))
		if not candidates.is_empty():
			# ⚠ **`randf()`를 안 쓴다.** 사람 id와 가진 구종 수로 뽑으므로
			# 호출 순서와 무관하고, 같은 세이브면 같은 것을 고른다.
			# 02도 `npc_id` 해시 + `pitches.len()`으로 씨앗을 만든다
			var roll: float = Rng.new(0).value_for(
				["npc_pitch", String(npc.get("id", "")), pitches.size()])
			var idx: int = mini(int(roll * candidates.size()),
				candidates.size() - 1)
			return {"pitch_id": candidates[idx], "progress": 0.0,
				"is_new": true}

	# 목표를 채웠으면 **제일 낮은 숙련도**를 올린다
	var lowest: Dictionary = {}
	for e in pitches:
		if int(e.get("grade", 0)) >= MAX_GRADE:
			continue
		if lowest.is_empty() or int(e.get("grade", 0)) < int(lowest["grade"]):
			lowest = e
	if lowest.is_empty():
		return {}
	return {"pitch_id": String(lowest["id"]), "progress": 0.0, "is_new": false}


## 진행 중인 훈련을 한 주 굴린다. **제자리에서 고친다.**
##
## ⚠ **지금 숙련도로 속도가 정해진다** — 새 구종은 0칸(8주)에서 시작하고,
## 올리는 것은 그 구종의 지금 숙련도를 본다
static func advance_week(npc: Dictionary) -> void:
	var tr: Dictionary = npc.get("pitch_training", {})
	if tr.is_empty():
		return

	var pitches: Array = npc.get("pitches", [])
	var pitch_id: String = String(tr.get("pitch_id", ""))
	var cur_grade: int = 0 if bool(tr.get("is_new", false)) \
		else _grade_of(pitches, pitch_id)

	var progress: float = float(tr.get("progress", 0.0)) \
		+ progress_per_week(cur_grade)
	if progress < 100.0:
		tr["progress"] = progress
		return

	# 끝났다 — **자리를 비운다.** 안 비우면 같은 구종을 영원히 배운다
	npc["pitch_training"] = {}
	if bool(tr.get("is_new", false)):
		# ⚠ **상한을 넘겨 담지 않는다.** 02도 여기서 한 번 더 본다 —
		# 대상을 정할 때와 끝날 때 사이에 다른 경로로 늘었을 수 있다
		if pitches.size() < MAX_PITCHES:
			pitches.append({"id": pitch_id, "grade": 1})
			npc["pitches"] = pitches
		return

	for e in pitches:
		if String(e.get("id", "")) == pitch_id:
			e["grade"] = mini(int(e.get("grade", 0)) + 1, MAX_GRADE)
			return
