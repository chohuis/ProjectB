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
	var rows: Array = rows_of(s.get("world", {}), team_id, me)

	var pitchers: int = 0
	for r in rows:
		if r["is_pitcher"]:
			pitchers += 1

	var batters: int = rows.size() - pitchers
	return {
		"team_name": p.get("team_name", team_id),
		"rows": rows,
		"pitchers": pitchers,
		"batters": batters,
		# ⚠ **구성을 숫자로 보여준다.** 02에서 포수 0명·투수 미달이 반복해서
		# 나왔는데 화면에 안 보이면 아무도 모른다
		"summary": "%d명 · 투수 %d · 야수 %d" % [rows.size(), pitchers, batters],
		"staff": _staff_rows(s.get("world", {}), team_id),
	}


## 감독·코치 — G-3c. 02 `TeamPage`는 로스터 옆에 이들을 같이 보여 준다.
##
## 🔴 **04는 팀 화면에서 안 읽었다.** `Staff.of(world, team_id)`가 있고
## `people_vm`이 인물 탭에 쓰는데 **팀 탭에서는 아무도 안 봤다**(형태 ③).
## 그래서 "우리 팀 감독이 누구인가"를 팀 화면에서 알 수 없었다.
##
## ⚠ **구단주는 뺀다.** 02 `TeamPage`도 감독·코치만 싣는다 — 구단주는
## 재정 화면이 맡는다(`finance_vm`이 `budget` 계수를 읽는다).
## ⚠ **코치는 전문 분야를 같이 적는다** — 그게 없으면 코치 셋이 같은 줄이 된다
static func _staff_rows(world: Dictionary, team_id: String) -> Array:
	var out: Array = []
	for st in Staff.of(world, team_id):
		var role: String = String(st.get("role", ""))
		if role == Staff.ROLE_OWNER:
			continue
		var label: String = "감독" if role == Staff.ROLE_MANAGER else "코치"
		var detail: String = String(st.get("style", ""))
		if role == Staff.ROLE_COACH:
			detail = String(st.get("specialty", ""))
		out.append({
			"id": String(st.get("id", "")),
			"label": label,
			"name": String(st.get("name", "")),
			"detail": detail,
			# 감독이 먼저 온다 — 02도 감독·코치 차례다
			"_rank": 0 if role == Staff.ROLE_MANAGER else 1,
		})
	out.sort_custom(func(a, b) -> bool: return int(a["_rank"]) < int(b["_rank"]))
	return out


## 한 팀의 로스터 줄. **팀 탭과 팀 상세가 같은 것을 봐야 한다** (F-4b) —
## 두 벌로 두면 같은 팀이 두 화면에서 다르게 정렬되고 OVR도 갈린다
static func rows_of(world: Dictionary, team_id: String, me: String) -> Array:
	var roster: Array = World.roster_of(world, team_id)

	var rows: Array = []
	for x in roster:
		var pos: String = x.get("position", "")
		var pitcher: bool = PlayerGen.is_pitcher(pos)
		rows.append({
			"id": x.get("id", ""),
			"name": x.get("name", ""),
			"position": pos,
			"age": int(x.get("age", 0)),
			# ⚠ **투수는 투구 OVR, 야수는 타격 OVR.** 안 가르면 투수가 타격
			# 20으로 떠서 팀이 전부 약해 보인다
			"ovr": float(x.get("pitching", {}).get("ovr", 0.0)) if pitcher
				else float(x.get("batting", {}).get("ovr", 0.0)),
			"potential": float(x.get("potential_hidden", 0.0)),
			"is_pitcher": pitcher,
			"is_me": x.get("id", "") == me,
		})

	# ⚠ **투수 먼저, 그 안에서 능력치 순.** 안 정렬하면 생성 순서로 뜨고
	# 그건 아무 뜻이 없다
	rows.sort_custom(func(a, b) -> bool:
		if a["is_pitcher"] != b["is_pitcher"]:
			return a["is_pitcher"]
		return a["ovr"] > b["ovr"])
	return rows
