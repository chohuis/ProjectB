extends RefCounted
class_name TeamVm

## 팀 탭 ViewModel — M7-6b.
##
## 원본: `pages/team/TeamPage.svelte`
##
## ⚠ **로스터를 화면이 정렬하지 않는다.** 02 결함의 뿌리가 화면이 자기
## 목록을 만들던 것이다.


static func build(s: Dictionary) -> Dictionary:
	var p: Dictionary = s.get("protagonist", {})
	var team_id: String = p.get("team_id", "")
	var me: String = p.get("id", "")
	var roster: Array = World.roster_of(s.get("world", {}), team_id)

	var rows: Array = []
	var pitchers: int = 0
	for x in roster:
		var pos: String = x.get("position", "")
		var pitcher: bool = PlayerGen.is_pitcher(pos)
		if pitcher:
			pitchers += 1
		rows.append({
			"id": x.get("id", ""),
			"name": x.get("name", ""),
			"position": pos,
			"age": int(x.get("age", 0)),
			# ⚠ **투수는 투구 OVR, 야수는 타격 OVR.** 안 가르면 투수가 타격
			# 20으로 떠서 팀이 전부 약해 보인다
			"ovr": float(x.get("pitching", {}).get("ovr", 0.0)) if pitcher
				else float(x.get("batting", {}).get("ovr", 0.0)),
			"potential": float(x.get("potential", 0.0)),
			"is_pitcher": pitcher,
			"is_me": x.get("id", "") == me,
		})

	# ⚠ **투수 먼저, 그 안에서 능력치 순.** 안 정렬하면 생성 순서로 뜨고
	# 그건 아무 뜻이 없다
	rows.sort_custom(func(a, b) -> bool:
		if a["is_pitcher"] != b["is_pitcher"]:
			return a["is_pitcher"]
		return a["ovr"] > b["ovr"])

	var batters: int = rows.size() - pitchers
	return {
		"team_name": p.get("team_name", team_id),
		"rows": rows,
		"pitchers": pitchers,
		"batters": batters,
		# ⚠ **구성을 숫자로 보여준다.** 02에서 포수 0명·투수 미달이 반복해서
		# 나왔는데 화면에 안 보이면 아무도 모른다
		"summary": "%d명 · 투수 %d · 야수 %d" % [rows.size(), pitchers, batters],
	}
