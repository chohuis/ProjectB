extends RefCounted
class_name StatusVm

## 나 탭 ViewModel — M7-6c.
##
## 원본: `pages/status/StatusPage.svelte` (1,004줄)
##
## ⚠ **`StatusScreen`은 P1에서 이미 만들었고 여기서 안 고친다.** 그때는 손으로
## 만든 사전을 받았는데, 이제 실제 상태에서 같은 모양을 만든다 —
## 그게 "화면이 사전 하나만 받는다"가 값을 하는 지점이다.
##
## ⚠ **이름표를 화면에 두지 않는다.** 02에선 화면이 `TRN_CTRL_CMD` 같은
## 원문을 그대로 띄웠다.


## 투구 능력치 이름표. **순서가 화면 순서다**
const PITCHING_LABELS: Array[Array] = [
	["velocity", "구위"], ["command", "커맨드"], ["control", "제구"],
	["movement", "무브먼트"], ["stamina", "스태미나"], ["mentality", "멘탈"],
	["recovery", "회복"], ["clutch", "위기관리"], ["hold_runners", "주자견제"],
]

const LEAGUE_SHORT: Dictionary = {
	"LEAGUE_HIGHSCHOOL": "고교", "LEAGUE_UNIVERSITY": "대학",
	"LEAGUE_INDEPENDENT": "독립", "LEAGUE_KBL": "KBL",
	"LEAGUE_ABL": "ABL", "LEAGUE_JBL": "JBL",
}

const SEVERITY_LABELS: Dictionary = {
	"light": "경상", "moderate": "중등도", "severe": "중상", "surgery": "수술",
}


static func build(s: Dictionary) -> Dictionary:
	var p: Dictionary = s.get("protagonist", {})
	var league_id: String = p.get("league_id", "")

	var academics: Dictionary = AcademicsVm.build(s)

	var pitching: Array = []
	var q: Dictionary = p.get("pitching", {})
	for pair in PITCHING_LABELS:
		pitching.append({"name": pair[1], "value": float(q.get(pair[0], 0.0))})

	return {
		"team_name": p.get("team_name", p.get("team_id", "")),
		"league_short": LEAGUE_SHORT.get(league_id, league_id),
		"injury": _injury(p.get("injury", null)),
		"injury_history": s.get("injury_history", []),
		"contract": s.get("contract", {}),
		"pitches": s.get("pitches", []),
		"pitching": pitching,
		"season_title": "%d년 시즌 누적" % int(s.get("season_year", 0)),
		"season_stats": _season_stats(s, p.get("id", "")),
		"career": s.get("career", []),
		"tabs": _tabs(academics),
		"academics": academics,
		"finance": FinanceVm.build(s),
	}


## "나" 탭의 하위 탭. **화면이 목록을 갖지 않는다** — 무대에 따라 달라지므로.
##
## ⚠ **재정은 아마추어도 연다.** 02가 그랬다 — 스폰서가 안 붙는 것과
## 용돈·구독은 별개 축이고, 화면이 "학생에겐 스폰서가 안 붙습니다"를
## 직접 말한다. 숨기면 왜 없는지를 알 길이 없다
const TABS: Array[Dictionary] = [
	{"id": "attributes", "label": "능력치"},
	{"id": "season", "label": "기록"},
	{"id": "career", "label": "커리어"},
	{"id": "finance", "label": "재정"},
]


## ⚠ **학업은 학교에 다닐 때만 뜬다.** 02도 그랬다(`navVisibility.academics`)
## — 프로에게 학점 탭을 띄우면 은퇴할 때까지 빈 화면이 하나 붙어 있는다.
##
## ⚠ **"학교에 다니나"를 여기서 다시 판정하지 않는다.** `AcademicsVm`이
## 이미 답을 냈다 — 두 곳이 각자 판정하면 언젠가 갈리고, 그때 탭은 있는데
## 안이 비어 있는 상태가 된다
static func _tabs(academics: Dictionary) -> Array:
	var out: Array = []
	for t in TABS:
		out.append(t.duplicate())
	if bool(academics.get("at_school", false)):
		out.append({"id": "academics", "label": "학업"})
	return out


static func _injury(inj) -> Dictionary:
	if inj == null or not (inj is Dictionary) or (inj as Dictionary).is_empty():
		return {}
	var d: Dictionary = (inj as Dictionary).duplicate()
	var sev: String = String(d.get("severity", ""))
	# 모르는 심각도를 빈칸으로 두지 않는다 — 새 등급이 붙은 걸 아무도 모른다
	d["severity_label"] = SEVERITY_LABELS.get(sev, sev)
	return d


## ⚠ **기록이 없으면 빈 목록이다.** 0으로 채우면 안 뛴 선수가 0.00 방어율로
## 뜬다 — 02가 그랬고 신인이 리그 1위처럼 보였다
static func _season_stats(s: Dictionary, player_id: String) -> Array:
	var all: Dictionary = s.get("season_stats", {})
	if not all.has(player_id):
		return []
	var x: Dictionary = all[player_id]
	return [
		{"name": "등판", "value": "%d경기" % int(x.get("g", 0))},
		{"name": "이닝", "value": "%.1f" % float(x.get("ip", 0.0))},
		{"name": "평균자책", "value": "%.2f" % float(x.get("era", 0.0))},
		{"name": "탈삼진", "value": "%d" % int(x.get("k", 0))},
		{"name": "볼넷", "value": "%d" % int(x.get("bb", 0))},
		{"name": "승-패", "value": "%d승 %d패" % [int(x.get("w", 0)), int(x.get("l", 0))]},
	]
