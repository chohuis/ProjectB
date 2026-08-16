extends RefCounted
class_name PitchMeasure

## 구종 습득을 **진짜 세계로** 굴려 본다 — F-1 계측.
##
## ⚠ **검사는 스무 주만 본다.** "커리어 하나를 다 굴리면 구종이 몇 개까지
## 가나"는 굴려야 보인다 — 문턱이 능력치를 보므로 성장과 얽혀 있고,
## 표만 읽어서는 몇 개가 열리는지 알 수 없다.
##
## ⚠ **여기서 고르는 건 계측이지 게임이 아니다.** 실제로는 사용자가 누른다.
## 여기서는 "고를 수 있는 것 중 문턱이 가장 낮은 것"을 잡는 사람을 가정한다.


const YEARS: int = 8
const WEEKS_PER_YEAR: int = 52


## 지금 고를 수 있는 것 중 하나. 없으면 빈 문자열.
##
## **가진 것을 다듬는 것보다 새 구종을 먼저 잡는다** — 그래야 "몇 개까지
## 열리나"가 보인다
static func _pick(p: Dictionary) -> String:
	var hone: String = ""
	for c in PitchDev.choices(p):
		if not bool(c["can_train"]):
			continue
		if not bool(c["owned"]):
			return String(c["id"])
		if hone.is_empty():
			hone = String(c["id"])
	return hone


func _one(seed_value: int) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["training_plan"] = {"primary": "TRN_PITCH_DEV"}
	var p: Dictionary = s["protagonist"]

	var learned: int = 0
	var first_week: int = 0
	for w in range(1, YEARS * WEEKS_PER_YEAR + 1):
		if (p.get("training_pitch_state", {}) as Dictionary).is_empty():
			var pick: String = _pick(p)
			if not pick.is_empty():
				PitchDev.start(p, pick)
		var before: int = (p.get("pitches", []) as Array).size()
		WeekRunner.run(s, w * 7)
		# ⚠ **주인공 참조가 깊은 복사로 끊긴다** — 매주 다시 잡는다
		p = s["protagonist"]
		if (p.get("pitches", []) as Array).size() > before:
			learned += 1
			if first_week == 0:
				first_week = w

	var grades: Array = []
	for e in p.get("pitches", []):
		grades.append(int(e.get("grade", 0)))
	return {"count": (p.get("pitches", []) as Array).size(),
		"learned": learned, "first_week": first_week, "grades": grades,
		"command": float(p.get("pitching", {}).get("command", 0.0))}


func run(log_line: Callable, _fail: Callable, careers: int = 12,
		seed_value: int = 20270101) -> int:
	log_line.call("구종 습득 계측 — %d커리어 · %d해 · 씨앗 %d" % [
		careers, YEARS, seed_value])
	log_line.call("")

	var counts: Array = []
	var firsts: Array = []
	var grade_hist: Dictionary = {}
	for i in range(careers):
		var out: Dictionary = _one(seed_value + i * 101)
		counts.append(int(out["count"]))
		if int(out["first_week"]) > 0:
			firsts.append(int(out["first_week"]))
		for g in out["grades"]:
			grade_hist[g] = int(grade_hist.get(g, 0)) + 1

	counts.sort()
	log_line.call("  보유 구종 수 — 최소 %d · 중앙 %d · 최대 %d" % [
		counts[0], counts[counts.size() / 2], counts[-1]])
	if firsts.is_empty():
		log_line.call("  ⚠ 첫 습득이 한 번도 없었다")
	else:
		firsts.sort()
		log_line.call("  첫 습득 주차 — 최소 %d · 중앙 %d · 최대 %d" % [
			firsts[0], firsts[firsts.size() / 2], firsts[-1]])

	var keys: Array = grade_hist.keys()
	keys.sort()
	var parts := PackedStringArray()
	for k in keys:
		parts.append("%d등급 %d개" % [k, grade_hist[k]])
	log_line.call("  숙련도 분포 — %s" % " · ".join(parts))
	return 0
