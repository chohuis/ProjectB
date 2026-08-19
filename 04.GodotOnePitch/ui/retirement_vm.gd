extends RefCounted
class_name RetirementVm

## 은퇴 결정 · 인생 기록 — C-6.
##
## 원본: `features/retirement/ui/RetirementAskModal.svelte` ·
##       `CareerEndScreen.svelte` (설계 `05_히스토리_엔딩` §3)
##
## ⚠ **`retirement_ask`를 밀어넣는 코드는 있는데 받는 화면이 없었다.**
## 02가 그랬고 04도 그대로다 — 대기줄에 올라간 채 아무도 안 받아서
## 자동 진행이 "은퇴 여부 결정"에서 멈춘 채 안 풀린다. `Retirement.retire`도
## 호출부가 없어 **커리어가 끝나지 않는다.**
##
## ⚠ **사유에 따라 선택지가 다르다.** 부상(재기 불가)은 거절이 없다 —
## 설계가 "부상 강제"로 정했다. 노쇠·계약 불발은 한 해 더 기다릴 수 있다.
##
## ⚠ **"결산을 봤는가" 플래그를 세이브에 안 만든다.** 은퇴하는 그 순간이
## 곧 첫 관람이고, 다시 보는 건 "나" 탭에서 누를 때다.


## 복귀 가능성이 거의 없다고 말하는 문턱. 02 그대로
const HOPELESS: float = 0.7


static func ask_of(state: Dictionary) -> Dictionary:
	for a in Pending.all(state):
		if String(a.get("type", "")) == "retirement_ask":
			return a
	return {}


static func is_asking(state: Dictionary) -> bool:
	return not ask_of(state).is_empty()


## 은퇴를 물어보는 화면.
static func build_ask(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var ask: Dictionary = ask_of(state)
	var reason: String = String(ask.get("reason", Retirement.REASON_DECLINE))
	var forced: bool = reason == Retirement.REASON_INJURY
	var seasons: int = _seasons(p)

	return {
		"asking": not ask.is_empty(),
		"reason": reason,
		"forced": forced,
		"title": "재기 불가 판정" if forced else "은퇴 권고",
		"body": _ask_body(state, p, forced, seasons),
		"retire_label": "은퇴한다",
		# ⚠ **부상 강제에는 거절 버튼을 안 만든다** — 누를 수 없는 버튼을
		# 띄우면 "왜 안 눌리지"가 된다
		"can_decline": not forced,
		"decline_label": "한 해 더 뛴다",
	}


static func _ask_body(state: Dictionary, p: Dictionary, forced: bool,
		seasons: int) -> String:
	var age: int = int(p.get("age", 0))
	if forced:
		return "\n".join([
			"의료진이 선수 생활 지속이 어렵다고 판단했습니다.",
			"%d세, 통산 %d시즌." % [age, seasons],
		])
	# 얼마나 급한지는 압박 판정이 안다 — 화면이 다시 재지 않는다
	var urgency: float = float(Retirement.pressure_of(state).get("urgency", 0.0))
	return "\n".join([
		"계약이 끝났고 어느 구단도 다시 부르지 않습니다.",
		"%d세, 통산 %d시즌." % [age, seasons],
		"",
		"복귀 가능성은 거의 없어 보입니다." if urgency >= HOPELESS \
			else "무소속으로 한 해 더 기다려 볼 수는 있습니다.",
	])


## ⚠ **연도 기록이 통산의 정본이다.** `career_records`는 진로 판정이 쓰는
## 다른 배열이라 시즌 수가 거기 있으면 두 곳이 된다
static func _seasons(p: Dictionary) -> int:
	var years: Dictionary = {}
	for h in p.get("career_history", []):
		years[int(h.get("year", 0))] = true
	return years.size()


# ── 인생 기록 ─────────────────────────────────────────────────

## 커리어 결산. **은퇴한 뒤에도, 은퇴 전에도 같은 사전을 만든다** —
## "나" 탭에서 다시 볼 수 있어야 하기 때문이다
static func build_summary(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var totals: Dictionary = Achievements.career_totals(state)
	var r: Dictionary = p.get("retirement", {})

	return {
		"name": String(p.get("name", "")),
		"title": "인생 기록",
		"retired": Retirement.is_retired(p),
		"closing": _closing(p, r),
		"totals": [
			{"label": "통산 시즌", "value": "%d시즌" % _seasons(p)},
			{"label": "출전", "value": "%d경기" % int(totals["g"])},
			{"label": "승", "value": "%d승" % int(totals["w"])},
			{"label": "세이브", "value": "%d세이브" % int(totals["sv"])},
			{"label": "탈삼진", "value": "%dK" % int(totals["k"])},
		],
		"stints": _stints(p, state.get("team_names", {})),
		"years": _years(p),
		"events": _events(p),
		"awards": _awards(p),
		"empty": "아직 남은 기록이 없습니다.",
	}


static func _closing(p: Dictionary, r: Dictionary) -> String:
	if r.is_empty():
		return "%d세, 아직 현역입니다." % int(p.get("age", 0))
	return "%d년, %d세에 %s로 선수 생활을 마쳤습니다." % [
		int(r.get("year", 0)), int(p.get("age", 0)),
		String(r.get("label", ""))]


## 거쳐온 팀 — G-2. 02 `CareerEndScreen:175`의 "소속" 절.
##
## 🔴 **엔진은 진작 있었다.** `CareerSummary.team_stints_of`가 02
## `teamStintsOf`와 글자 그대로 같고 검사도 다섯인데 **부르는 곳이 없었다** —
## 형태 ①(엔진만 있고 호출 0). 그래서 은퇴 화면에 **어디서 뛰었는지가
## 없었다**. "해마다"는 성적만 적는다.
##
## ⚠ **오래된 순이다**(02와 같다). 소속 이력은 시간순으로 읽는 것이고,
## "해마다"처럼 뒤집으면 커리어가 거꾸로 흐른다.
## ⚠ **한 해짜리는 범위를 안 적는다** — "2030–2030"은 읽기 나쁘다(02도 그렇다)
static func _stints(p: Dictionary, names: Dictionary) -> Array:
	var out: Array = []
	for st in CareerSummary.team_stints_of(p.get("career_history", [])):
		var team: String = String(st["team_id"])
		var from_y: int = int(st["from_year"])
		var to_y: int = int(st["to_year"])
		var span: String = ("%d" % from_y) if from_y == to_y \
			else ("%d–%d" % [from_y, to_y])
		out.append({
			"label": String(names.get(team, team)),
			"value": "%s · %d시즌" % [span, int(st["seasons"])],
		})
	return out


## 해마다 한 줄. **최근이 위다**
static func _years(p: Dictionary) -> Array:
	var out: Array = []
	for h in p.get("career_history", []):
		out.push_front({
			"year": int(h.get("year", 0)),
			"team": String(h.get("team_id", "")),
			"stat_line": String(h.get("stat_line", "")),
			"highlights": h.get("highlights", []),
		})
	return out


## 커리어를 가른 사건 — 지명·이적·은퇴. **최근이 위다**
static func _events(p: Dictionary) -> Array:
	var out: Array = []
	for e in p.get("career_events", []):
		out.push_front({
			"year": int(e.get("year", 0)),
			"type": String(e.get("type", "")),
			"detail": String(e.get("detail", "")),
		})
	return out


## 받은 상. 연도 기록의 `highlights`에 얹혀 있다
static func _awards(p: Dictionary) -> Array:
	var out: Array = []
	for h in p.get("career_history", []):
		for a in h.get("highlights", []):
			out.push_front({"year": int(h.get("year", 0)), "name": String(a)})
	return out
