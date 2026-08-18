extends RefCounted
class_name TrainingReport

## 훈련 결과 소식 — 02 `messages/TrainingStatBars`(152줄).
##
## 🔴 **`training_log`에 쌓기만 하고 아무도 안 읽었다.**
## `week_runner.gd`와 `match_outcome.gd`가 쌓으면서 주석에
## *"소식이 `training_log`를 읽는다"*고 적어 뒀는데 **읽는 곳이 없었다** —
## 무엇이 얼마나 늘었는지 플레이어가 볼 자리가 없었다.
##
## ⚠ **이번 루프에서 같은 형태를 네 번째 만났다** — 소식 본문 · 월간 부상
## 리포트 · 다이제스트 · 부상 치료.
##
## ✅ **04도 02와 같은 모형이다** — `Growth.try_level_up`이 정수 레벨과
## `xp`를 가르고 `xp_threshold`가 다음 레벨까지의 양을 준다.
## 02의 진척 막대(`pct`)를 **지어내지 않고** 그걸로 낸다.

## 어느 능력치의 진척인지 — 투수·타자 양쪽을 본다
const STAT_SETS: Array[String] = ["pitching", "batting"]


## 그 주에 오른 것들. **그 주 것만** — 지난주까지 섞으면 매주 같은 줄이 쌓인다
static func gains_on(state: Dictionary, at_day: int) -> Array:
	var out: Array = []
	for e in state.get("training_log", []):
		if int(e.get("day", -1)) == at_day:
			out.append_array(e.get("gains", []))
	return out


## 능력치 하나의 다음 레벨까지 진척(%).
##
## ⚠ **문턱은 `Growth`가 정본이다** — 여기서 다시 세면 화면에 뜬 진척과
## 실제 레벨업 시점이 갈린다
static func progress_pct(value: float, xp: float) -> int:
	var need: float = Growth.xp_threshold(value)
	if need <= 0.0:
		return 0
	return clampi(int(roundf(xp / need * 100.0)), 0, 100)


## 오른 능력치의 지금 값과 진척 — `[{name, value, pct, up}, …]`
static func rows_of(p: Dictionary, gains: Array) -> Array:
	var out: Array = []
	for g in gains:
		var parts: PackedStringArray = String(g).split(" ")
		if parts.size() < 2:
			continue
		var name: String = parts[0]
		for set_key in STAT_SETS:
			var stats: Dictionary = p.get(set_key, {})
			if not stats.has(name):
				continue
			var xp: Dictionary = p.get("%s_xp" % set_key, {})
			out.append({
				"name": name,
				"value": float(stats[name]),
				"pct": progress_pct(float(stats[name]), float(xp.get(name, 0.0))),
				"up": parts[1],
			})
			break
	return out


## 소식 한 통. 담을 게 없으면 `{}`
static func message_of(state: Dictionary, at_day: int) -> Dictionary:
	var gains: Array = gains_on(state, at_day)
	if gains.is_empty():
		return {}

	var p: Dictionary = state.get("protagonist", {})
	var rows: Array = rows_of(p, gains)
	var lines: Array[String] = []
	for r in rows:
		# ⚠ **02는 막대로 그린다.** 04 소식은 글자라 숫자로 낸다 —
		# 없는 값을 지어내는 게 아니라 같은 값을 다르게 그리는 것이다
		lines.append("%s %s  현재 %d  다음까지 %d%%" % [r["name"], r["up"],
			int(r["value"]), int(r["pct"])])
	# 이름을 못 찾은 줄도 버리지 않는다 — 구종 개발 로그가 그렇다
	if rows.size() < gains.size():
		for g in gains:
			var nm: String = String(g).split(" ")[0]
			var known: bool = false
			for r in rows:
				if String(r["name"]) == nm:
					known = true
			if not known:
				lines.append(String(g))

	lines.append("")
	lines.append("컨디션 %d · 피로 %d · 사기 %d" % [
		int(p.get("condition", 0.0)), int(p.get("fatigue", 0.0)),
		int(p.get("morale", 0.0))])

	return {
		"id": "msg-training-%d-w%d" % [int(state.get("season_year", 0)),
			Calendar.week_of(at_day)],
		"category": "coach", "sender": "트레이닝 코치",
		"subject": "훈련 결과",
		"preview": "%d개 능력이 올랐습니다." % rows.size() if not rows.is_empty() \
			else String(gains[0]),
		"body": "\n".join(lines),
		"day": at_day, "read": false, "decision": null,
	}


## 소식함에 넣는다. **담을 게 없으면 아무 일도 안 한다**
static func send(state: Dictionary, at_day: int) -> bool:
	var m: Dictionary = message_of(state, at_day)
	if m.is_empty():
		return false
	var mailbox: Array = state.get("mailbox", [])
	for x in mailbox:
		if String(x.get("id", "")) == String(m["id"]):
			return false
	mailbox.append(m)
	state["mailbox"] = mailbox
	return true
