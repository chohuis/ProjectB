extends RefCounted
class_name OffseasonMeasure

## 시즌 종료를 **진짜 세계로** 여러 해 돌려 본다 — M9-4 계측.
##
## ⚠ **검사는 한 해만 본다.** 세대교체가 실제로 도는지는 여러 해를 굴려야
## 보인다 — 02에서 "나이 은퇴가 한 번도 없다"를 잘못 읽은 자리가 그런
## 종류였다.


func run(log_line: Callable, _fail: Callable, years: int = 5,
		seed_value: int = 20270101) -> int:
	var s: Dictionary = World.new_game({"seed": seed_value, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})

	log_line.call("시즌 종료 계측 — %d해 · 씨앗 %d" % [years, seed_value])
	log_line.call("선수 %d명으로 시작" % SeasonRunner.all_players(s).size())
	log_line.call("")
	log_line.call("  해   졸업   지명  미지명  강등  방출   은퇴  독립  포기   FA  미계약    총원")

	var year: int = 2027
	for i in years:
		s["season_year"] = year
		var t0: int = Time.get_ticks_usec()
		var out: Dictionary = SeasonRunner.run(s)
		var ms: float = float(Time.get_ticks_usec() - t0) / 1000.0
		var m: Dictionary = out["summary"]
		log_line.call("%6d %6d %6d %7d %5d %5d %6d %5d %5d %4d %6d %7d  (%.0fms)" % [
			year, m["graduated"], m["drafted"], m["undrafted"],
			m.get("demoted", 0), m.get("released", 0), m["retired"],
			m.get("placed", 0), m.get("gave_up", 0),
			m.get("fa_signed", 0), m.get("fa_unsigned", 0),
			SeasonRunner.all_players(s).size(), ms,
		])
		year += 1

	log_line.call("")
	_awards_table(log_line, s)
	log_line.call("")
	_age_table(log_line, s)
	_grade_table(log_line, s)
	return 0


## 나이 분포. **세대교체가 도는지가 여기 보인다** — 노장만 쌓이면 은퇴가
## 안 도는 것이고, 젊은 선수만 있으면 너무 많이 나가는 것이다
func _age_table(log_line: Callable, s: Dictionary) -> void:
	var by_bucket: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		var b: int = int(p.get("age", 0)) / 5 * 5
		by_bucket[b] = int(by_bucket.get(b, 0)) + 1

	var keys: Array = by_bucket.keys()
	keys.sort()
	log_line.call("나이 분포")
	for k in keys:
		log_line.call("  %2d~%2d  %5d" % [k, k + 4, by_bucket[k]])


## 고교 학년 분포. **전원 1학년이면 3년간 졸업생이 0명이다**
func _grade_table(log_line: Callable, s: Dictionary) -> void:
	var by_grade: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		if p.get("league_id", "") != "LEAGUE_HIGHSCHOOL":
			continue
		var g = p.get("grade", null)
		var key: String = "없음" if g == null else str(int(g))
		by_grade[key] = int(by_grade.get(key, 0)) + 1

	log_line.call("")
	log_line.call("고교 학년 분포")
	var keys: Array = by_grade.keys()
	keys.sort()
	for k in keys:
		log_line.call("  %s학년  %5d" % [k, by_grade[k]])


## 수상이 실제로 나오나. **리그마다 나와야 한다** — 합쳐 뽑으면
## 프로 MVP와 고교 MVP가 같은 저울에 올라간다
func _awards_table(log_line: Callable, s: Dictionary) -> void:
	log_line.call("수상 (마지막 해)")
	var years: Array = s.get("season_awards", {}).keys()
	if years.is_empty():
		log_line.call("  없음 — 시즌 성적이 안 쌓였다")
		return
	years.sort()
	var last: Dictionary = s["season_awards"][years[-1]]
	for lid in last:
		var mvp: Array = last[lid].get("mvp", [])
		log_line.call("  %-20s 부문 %2d개 · MVP %d명"
			% [lid, last[lid].get("awards", []).size(), mvp.size()])
