extends RefCounted
class_name BodyReport

## 내 몸 월간 리포트 — C-6.
##
## 원본: `usecases/weekPhases/myBodyReport.ts`
##
## ⚠ **NPC 부상은 월간인데 내 몸만 낱개로 왔다.** 경고 한 통, 부상 결장
## 한 통, 컨디션 결장 한 통이 따로 떴다 — 그 비대칭을 없앤다.
##
## ⚠ **부상 발생은 여기 안 담는다.** 다치는 순간은 사건이라 즉시 보낸다
## (`InjuryRunner`가 그때 보낸다). 여기 모으는 것은 **경고·완치**이고,
## 월말 시점의 부상 상태는 요약으로만 싣는다.
##
## ⚠ **04는 `body_log`를 쌓기만 했다.** 읽는 곳이 진로 판정 하나뿐이라
## 경고도 완치도 플레이어에게는 한 번도 안 보였다.


## 한 달치를 담는다. 담을 게 없으면 `{}` — **빈 리포트를 매달 보내지 않는다**
## ("왔는데 아무것도 없다"가 된다)
static func build(state: Dictionary, at_day: int) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	if p.is_empty():
		return {}

	# NPC 부상 소식과 **같은 주기로** 묶는다 — 내 몸만 낱개로 오던 비대칭을
	# 없애는 게 이 리포트의 뜻이다
	var since: int = at_day - Injury.news_period() * Calendar.DAYS_PER_WEEK
	var warnings: int = 0
	var healed: Array = []
	for e in state.get("body_log", []):
		if int(e.get("day", 0)) <= since:
			continue
		match String(e.get("kind", "")):
			"warning":
				warnings += 1
			"healed":
				healed.append(e)

	var now: Dictionary = InjuryRunner.of(state, String(p.get("id", "")))
	var hurt: bool = not now.is_empty() and int(now.get("weeks_left", 0)) > 0

	if warnings == 0 and healed.is_empty() and not hurt:
		return {}

	return {
		"day": at_day,
		"warnings": warnings,
		"healed": _healed_rows(healed),
		"injury": _injury_row(now) if hurt else {},
		"lines": _lines(warnings, healed, now if hurt else {}),
	}


## ⚠ **부상 이름을 id로 두지 않는다.** 02는 `injuryType`을 그대로 본문에
## 넣어 화면에 **`SHOULDER_INFLAM`이 그대로 떴다** — 이름으로 바꾸는 층을
## 한 겹 빠뜨리면 조용히 원문이 샌다
static func _healed_rows(healed: Array) -> Array:
	var out: Array = []
	for e in healed:
		out.append({
			"name": Injury.label_of(String(e.get("injury_type", ""))),
			"severity": String(e.get("severity", "")),
			"severity_label": Injury.severity_label(String(e.get("severity", ""))),
			# 후유증이 남았는지 — 나은 게 곧 원래대로는 아니다
			"has_penalty": not (e.get("penalty", {}) as Dictionary).is_empty(),
		})
	return out


static func _injury_row(now: Dictionary) -> Dictionary:
	return {
		"name": Injury.label_of(String(now.get("type", ""))),
		"severity": String(now.get("severity", "")),
		"severity_label": Injury.severity_label(String(now.get("severity", ""))),
		"weeks_left": int(now.get("weeks_left", 0)),
	}


## 소식 본문. **한 달 동안 내 몸에 무슨 일이 있었나**
static func _lines(warnings: int, healed: Array, now: Dictionary) -> Array:
	var out: Array = []
	if warnings > 0:
		out.append("피로 경고 %d회 — 이대로면 다칩니다." % warnings)
	for e in healed:
		var name: String = Injury.label_of(String(e.get("injury_type", "")))
		if not (e.get("penalty", {}) as Dictionary).is_empty():
			out.append("%s에서 복귀했습니다. 후유증이 남았습니다." % name)
		else:
			out.append("%s에서 복귀했습니다." % name)
	if not now.is_empty():
		out.append("%s — %s · %d주 남았습니다." % [
			Injury.label_of(String(now.get("type", ""))),
			Injury.severity_label(String(now.get("severity", ""))),
			int(now.get("weeks_left", 0))])
	return out


## 소식함에 넣을 한 통. 담을 게 없으면 `{}`
##
## ⚠ **id에 연도를 넣는다.** 주차는 시즌마다 1로 돌아가므로 연도가 없으면
## 해마다 겹친다 — 02는 그 중복 하나로 세이브가 안 열렸다
static func message_of(state: Dictionary, at_day: int) -> Dictionary:
	var r: Dictionary = build(state, at_day)
	if r.is_empty():
		return {}
	var year: int = int(state.get("season_year", 0))
	var lines: Array = r["lines"]
	return {
		"id": "msg-body-%d-w%d" % [year, Calendar.week_of(at_day)],
		"category": "injury", "sender": "트레이너",
		"subject": "몸 상태",
		"preview": String(lines[0]) if not lines.is_empty() else "",
		"body": "\n".join(lines),
		"day": at_day, "read": false, "decision": null,
	}
