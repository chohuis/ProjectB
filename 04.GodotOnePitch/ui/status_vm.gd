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

## ⚠ **복무 리그도 넣는다** (U-2b). 없으면 화면에 `LEAGUE_MILITARY`가
## 원문 그대로 뜬다 — 이름표를 한 겹 빠뜨리면 조용히 id가 샌다
const LEAGUE_SHORT: Dictionary = {
	"LEAGUE_HIGHSCHOOL": "고교", "LEAGUE_UNIVERSITY": "대학",
	"LEAGUE_INDEPENDENT": "독립", "LEAGUE_KBL": "KBL",
	"LEAGUE_ABL": "ABL", "LEAGUE_JBL": "JBL",
	"LEAGUE_MILITARY": "복무",
}

## 심각도 이름의 정본은 `Injury.SEVERITY_LABELS`다 — 화면에도 소식에도
## 같은 말이 떠야 하므로 여기 다시 적지 않는다


static func build(s: Dictionary) -> Dictionary:
	var p: Dictionary = s.get("protagonist", {})
	var league_id: String = p.get("league_id", "")

	var academics: Dictionary = AcademicsVm.build(s)

	var pitching: Array = []
	var q: Dictionary = p.get("pitching", {})
	for pair in PITCHING_LABELS:
		pitching.append({"name": pair[1], "value": float(q.get(pair[0], 0.0))})

	return {
		"team_name": team_name_of(p),
		"league_short": LEAGUE_SHORT.get(league_id, league_id),
		"injury": _injury(p.get("injury", null)),
		"injury_history": _injury_history(s),
		"military": military_of(p),
		"contract": s.get("contract", {}),
		"pitches": s.get("pitches", []),
		"pitching": pitching,
		"season_title": "%d년 시즌 누적" % int(s.get("season_year", 0)),
		"season_stats": season_stats_of(s, p.get("id", "")),
		"career": s.get("career", []),
		"tabs": _tabs(academics),
		"academics": academics,
		"finance": FinanceVm.build(s),
		"achievements": AchievementsVm.build(s),
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
	{"id": "achievements", "label": "업적"},
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
	d["severity_label"] = Injury.severity_label(sev)
	return d


## 소속 이름 — U-2b.
##
## ⚠ **복무 중엔 팀이 없다.** `Military.enlist`가 `team_id`를 비우는데
## `team_name`은 안 지운다 — 그래서 계약 카드가 **옛 소속(애월고)을 그대로**
## 띄웠다. `status-military` 캡처에서 나왔다.
##
## ⚠ **이름을 지우지 않고 여기서 가린다.** 상태에서 지우면 전역할 때
## 돌아갈 곳의 이름이 사라진다 — `military_hiatus_team_id`가 팀을 기억하지
## 이름까지 기억하진 않는다
static func team_name_of(p: Dictionary) -> String:
	if String(p.get("military_status", "")) == Military.STATUS_SERVING:
		return Military.unit_label(String(p.get("military_unit", "")))
	var name: String = String(p.get("team_name", ""))
	if not name.is_empty():
		return name
	# ⚠ **NPC 사전엔 `team_name`이 없다.** 주인공만 들고 있어서, 그대로
	# `team_id`로 떨어지면 선수 상세에 `TEAM_HS_AEWOL`이 뜬다 —
	# **실제로 그렇게 찍혔다.** 이름표를 한 겹 빠뜨리면 조용히 원문이 샌다
	var team_id: String = String(p.get("team_id", ""))
	return String(World.team_field({}, team_id, "name", team_id))


## 병역 — 입대·복무·전역이 보이는 유일한 자리. U-2.
##
## ⚠ **`sim/military.gd`가 매주 도는데 볼 자리가 하나도 없었다.**
## 02는 넷에서 보여줬다(병역 카드 · 상시 패널 · 사이드바 카운트다운 ·
## 우측 패널). 04는 넷 다 없어서 **입대하면 전역이 언제인지 알 길이 없었다.**
##
## ⚠ 02가 이 자리에서 크게 데었다 — 전역 분기가 도달할 수 없는 자리에 있어서
## **입대하면 영원히 군대에 있었다**(실측 700주 · 13.5년). 04는 그 결함을
## 고쳤지만 화면을 안 옮겼다. **같은 증상이 다시 나면 알아볼 방법이 없다.**
##
## ⚠ **총 기간을 여기 다시 적지 않는다.** `Military.SERVICE_WEEKS`가 정본이다.
##
## ⚠ **미필이면 빈 사전이다.** 대부분의 커리어에서 기본값이라 늘 띄우면
## 아무 뜻이 없는 줄이 하나 붙어 있는다
static func military_of(p: Dictionary) -> Dictionary:
	var status: String = String(p.get("military_status", Military.STATUS_UNSERVED))
	if status == Military.STATUS_UNSERVED:
		return {}
	var serving: bool = status == Military.STATUS_SERVING
	var served: int = int(p.get("military_service_weeks", 0))
	return {
		"status": status,
		"serving": serving,
		"unit_label": Military.unit_label(String(p.get(
			"military_unit" if serving else "military_served_unit", ""))),
		"enlist_year": int(p.get("military_enlist_year", 0)),
		"weeks_served": served,
		"weeks_total": Military.SERVICE_WEEKS,
		# 채우고도 안 넘어간 주가 있으면 음수가 된다 — 0에서 멈춘다
		"weeks_left": maxi(0, Military.SERVICE_WEEKS - served) if serving else 0,
	}


## 부상 이력 — **`body_log`가 정본이다.** U-1.
##
## ⚠ **예전엔 `s["injury_history"]`를 읽었는데 그 키를 아무도 안 채웠다.**
## 화면은 그 키로 카드를 만들고(`status_screen.gd:428-440`) 쓰는 곳은
## `Fixtures`뿐이라, **캡처에는 이력이 보이는데 진짜 게임에서는 카드가 아예
## 안 붙었다.** 읽는 쪽만 있고 채우는 쪽이 없는 자리였다(P-12와 같은 모양).
##
## ⚠ **경고는 이력이 아니다.** `body_log`엔 `warning`도 쌓이는데 그건 "다칠
## 뻔했다"이지 다친 게 아니다 — 섞으면 이력이 부풀어 오른다.
##
## ⚠ **최근 것이 위다.** 로그는 시간 순으로 쌓이므로 그대로 쓰면 제일 오래된
## 부상이 맨 위에 온다.
##
## ⚠ **해는 로그에 적힌 것을 쓴다.** 날짜는 시즌마다 1로 돌아가므로 지금
## 연도로 채우면 옛 부상이 전부 올해가 된다
static func _injury_history(s: Dictionary) -> Array:
	var out: Array = []
	for e in s.get("body_log", []):
		if String(e.get("kind", "")) != "healed":
			continue
		var sev: String = String(e.get("severity", ""))
		out.append({
			"year": int(e.get("year", 0)),
			"week": Calendar.week_of(int(e.get("day", 0))),
			"name": Injury.label_of(String(e.get("injury_type", ""))),
			"severity": sev,
			"severity_label": Injury.severity_label(sev),
			# 나은 게 곧 원래대로는 아니다 — 후유증이 남았는지가 요점이다
			"has_penalty": not (e.get("penalty", {}) as Dictionary).is_empty(),
		})
	out.reverse()
	return out


## ⚠ **기록이 없으면 빈 목록이다.** 0으로 채우면 안 뛴 선수가 0.00 방어율로
## 뜬다 — 02가 그랬고 신인이 리그 1위처럼 보였다
static func season_stats_of(s: Dictionary, player_id: String) -> Array:
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
