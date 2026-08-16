extends RefCounted
class_name BriefingVm

## 경기 전 브리핑 — 상대 선발과 타선. F-5.
##
## 원본: `features/pre-game-briefing/ui/PreGameBriefingModal.svelte`
##
## ⚠ **04는 "누구를 상대하는가"를 못 보여줬다.** 점수·이닝·카운트·주자는 다
## 뜨는데 **상대 타자가 이름 한 줄**이라 승부처인지 아닌지를 알 수가 없었다.
##
## ⚠ **여기서 타순을 새로 만들지 않는다.** `MatchDay._make_state`가 이미
## 짜 놨다 — 화면이 자기 목록을 따로 만들면 그게 두 번째 정본이 되고,
## 브리핑에 뜬 타자와 실제로 나오는 타자가 갈린다(02 드래프트 보드가 그랬다).
##
## ⚠ **날씨·구장은 안 싣는다.** 02는 조언 문구까지 뒀지만 04는
## `match_day.gd:269`가 `sunny`/`neutral`로 고정이라 **늘 같은 줄이 하나
## 붙어 있게 된다** — 죽은 줄을 만들지 않는다. 날씨가 실제로 변하게 되면
## 그때 붙인다.

## 주의사항 문턱 — **02 `threatLevel` 그대로다.** 여기 숫자를 04에서 새로
## 정하면 "누가 무서운 타자인가"가 02와 다른 게임이 된다
const THREAT_POWER_HIGH: float = 68.0
const THREAT_CLUTCH_HIGH: float = 66.0
const THREAT_POWER_MID: float = 62.0
const THREAT_EYE_LOW: float = 40.0
const THREAT_DISCIPLINE_LOW: float = 40.0
const THREAT_PLATOON_LOW: float = 42.0


## 0 = 보통 · 1 = 조심 · 2 = 위험
static func threat_of(b: Dictionary) -> int:
	if float(b.get("power", 50.0)) >= THREAT_POWER_HIGH \
			or float(b.get("batting_clutch", 50.0)) >= THREAT_CLUTCH_HIGH:
		return 2
	if float(b.get("power", 50.0)) >= THREAT_POWER_MID \
			or float(b.get("eye", 50.0)) <= THREAT_EYE_LOW \
			or float(b.get("discipline", 50.0)) <= THREAT_DISCIPLINE_LOW \
			or float(b.get("platoon", 50.0)) <= THREAT_PLATOON_LOW:
		return 1
	return 0


## **무엇이 무서운지를 말한다.** 등급만 있으면 "왜 빨간색인지" 모른다
static func _note_of(b: Dictionary, threat: int) -> String:
	if threat == 0:
		return ""
	var parts := PackedStringArray()
	if float(b.get("power", 50.0)) >= THREAT_POWER_HIGH:
		parts.append("장타")
	elif float(b.get("power", 50.0)) >= THREAT_POWER_MID:
		parts.append("한 방 있음")
	if float(b.get("batting_clutch", 50.0)) >= THREAT_CLUTCH_HIGH:
		parts.append("승부처에 강함")
	if float(b.get("eye", 50.0)) <= THREAT_EYE_LOW \
			or float(b.get("discipline", 50.0)) <= THREAT_DISCIPLINE_LOW:
		parts.append("유인구에 약함")
	if float(b.get("platoon", 50.0)) <= THREAT_PLATOON_LOW:
		parts.append("좌우 편차")
	return " · ".join(parts)


## 첫 공을 던지기 전이면 `{starter, lineup}`, 아니면 `{}`.
##
## ⚠ **첫 공을 던지면 사라진다.** 경기 중에 계속 떠 있으면 지금 벌어지는
## 일을 가린다 — 02도 경기 전에만 띄웠다
static func build(state: Dictionary, ctx: Dictionary) -> Dictionary:
	if state.is_empty():
		return {}
	if int(state.get("pitch_count", 0)) > 0:
		return {}

	# 내가 홈이면 상대는 원정이다 — 뒤집히면 자기 팀을 스카우팅한다
	var mine: String = String(ctx.get("my_side", "home"))
	var opp_pitcher: Dictionary = state.get(
		"away_pitcher" if mine == "home" else "home_pitcher", {})
	var opp_lineup: Array = state.get(
		"away_lineup" if mine == "home" else "home_lineup", [])
	if opp_pitcher.is_empty() and opp_lineup.is_empty():
		return {}

	# ⚠ **이름은 `ctx`가 갖고 있다.** 경기 상태의 타자 사전엔 `id`만 있어서
	# 그대로 쓰면 화면에 `GEN_TEAM_HS_YUSEONG_777_Y2027_030`이 뜬다 —
	# 실제로 그렇게 찍혔다. **이름표를 한 겹 빠뜨리면 조용히 원문이 샌다**
	# (`body_report.gd:55-57`이 같은 결함을 적어 뒀다)
	var names: Dictionary = ctx.get("names", {})

	var rows: Array = []
	for i in opp_lineup.size():
		var b: Dictionary = opp_lineup[i]
		var threat: int = threat_of(b)
		rows.append({
			"order": i + 1,
			"name": _name_of(names, b),
			"position": String(b.get("position", "")),
			"ovr": int(roundf(float(b.get("ovr", 0.0)))),
			"threat": threat,
			"note": _note_of(b, threat),
		})

	return {
		"starter": {
			"name": _name_of(names, opp_pitcher),
			"position": String(opp_pitcher.get("position", "SP")),
			"ovr": int(roundf(float(opp_pitcher.get("ovr", 0.0)))),
			"velocity": int(roundf(float(opp_pitcher.get("velocity", 0.0)))),
			"movement": int(roundf(float(opp_pitcher.get("movement", 0.0)))),
			"command": int(roundf(float(opp_pitcher.get("command", 0.0)))),
		},
		"lineup": rows,
	}


## 사람이 읽는 이름. **`ctx["names"]`가 정본이다** — 없으면 사전의 `name`,
## 그것도 없으면 id다(그러면 화면에 원문이 새는 것이므로 검사가 잡는다)
static func _name_of(names: Dictionary, p: Dictionary) -> String:
	var id: String = String(p.get("id", ""))
	if names.has(id):
		return String(names[id])
	return String(p.get("name", id))
