extends RefCounted
class_name AutoAdvanceVm

## 자동 진행이 무엇을 했나 — G-6 ③.
##
## 원본: `features/devtools/ui/AutoAdvancePanel.svelte` (414줄)
##
## ⚠ **04는 중지 사유 한 줄만 보여 줬다**(`main_screen.set_auto_stop`).
## 스무 해를 자동으로 넘겨도 그 사이에 누가 이적하고 누가 은퇴했는지
## 볼 자리가 없었다 — `EventLog`에 쌓이는데 읽는 곳이 없었다.
##
## ⚠ **화면이 계산을 갖지 않는다.** 카운터도 줄도 여기서 만든다.

## 02 `FILTER_OPTS` — "전체"가 앞에 오고 나머지는 `EventLog.TYPES` 차례.
## ⚠ **02는 `fa_result`를 여기서만 "FA이동"이라 부른다**(로그는 "FA결과").
## 화면이 고르는 이름이라 여기 둔다 — 로그 쪽 이름을 바꾸면 기록이 흔들린다
const FILTER_LABELS: Dictionary = {
	"fa_result": "FA이동",
	"enlist_sports": "체육부대",
	"enlist_general": "일반병",
	"adjustment": "조정",
}

## 02 `recentLog = log.slice(-10)`
const RECENT_LINES: int = 10

## 02 `filteredEvents.slice(-50).reverse()`
const MAX_EVENTS: int = 50

## 02 `ev.players.slice(0, 5)`
const MAX_PLAYERS_PER_EVENT: int = 5


## 패널 한 벌. `filter`가 `"all"`이면 안 거른다
static func build(stop_label: String = "", running: bool = false,
		filter: String = "all") -> Dictionary:
	var events: Array = EventLog.all()
	return {
		# 02 `visible = running || stopReason !== null`
		"show": running or not stop_label.is_empty(),
		"running": running,
		"stop_label": stop_label,
		"counts": _count_rows(),
		"filters": _filter_rows(filter),
		"filter": filter,
		"events": _event_rows(events, filter),
		"recent": _recent_lines(events),
		"total": events.size(),
	}


## 종류별 개수. **0인 것도 낸다** — 02가 카운터를 늘 열둘 보여 준다.
## 요약 행(0이면 감춘다)과 규칙이 다른 자리다 — 카운터는 자리가 고정이라
## 사라지면 눈이 헤맨다
static func _count_rows() -> Array:
	var counts: Dictionary = EventLog.counts()
	var out: Array = []
	for t in EventLog.TYPES:
		out.append({
			"id": t,
			"label": label_of(t),
			"value": int(counts.get(t, 0)),
		})
	return out


## 필터 단추 — 맨 앞이 "전체"다
static func _filter_rows(active: String) -> Array:
	var out: Array = [{"id": "all", "label": "전체", "on": active == "all"}]
	for t in EventLog.TYPES:
		out.append({"id": t, "label": label_of(t), "on": active == t})
	return out


## 화면에 쓸 이름 — 02는 필터에서만 다르게 부르는 종류가 있다
static func label_of(type: String) -> String:
	if FILTER_LABELS.has(type):
		return String(FILTER_LABELS[type])
	return EventLog.label_of(type)


## 최근 것이 위다 — 02 `.slice(-50).reverse()`
static func _event_rows(events: Array, filter: String) -> Array:
	var picked: Array = []
	for e in events:
		if filter != "all" and String(e["type"]) != filter:
			continue
		picked.append(e)
	if picked.size() > MAX_EVENTS:
		picked = picked.slice(picked.size() - MAX_EVENTS)

	var out: Array = []
	for i in range(picked.size() - 1, -1, -1):
		var e: Dictionary = picked[i]
		var lines: Array = EventLog.lines_of(e)
		# ⚠ **사람은 다섯까지만** — 02도 그렇다. 콜업 한 건에 스무 명이
		# 들어가는 해가 있는데 그러면 목록이 그 한 건으로 꽉 찬다
		var people: Array = []
		var players: Array = e.get("players", [])
		for j in mini(players.size(), MAX_PLAYERS_PER_EVENT):
			# `lines_of`가 만든 줄을 그대로 쓴다 — 두 벌이면 어긋난다
			people.append(String(lines[j + 1]).strip_edges())
		var more: int = players.size() - people.size()
		out.append({
			"head": String(lines[0]) if not lines.is_empty() else "",
			"people": people,
			"more": more,
			"more_label": "… 외 %d명" % more if more > 0 else "",
		})
	return out


## 최근 열 줄 — 02 `recentLog`. **머리줄만** 모은다
static func _recent_lines(events: Array) -> Array:
	var out: Array = []
	for i in range(events.size() - 1, -1, -1):
		var lines: Array = EventLog.lines_of(events[i])
		if lines.is_empty():
			continue
		out.append(String(lines[0]))
		if out.size() >= RECENT_LINES:
			break
	return out


## 내보낼 글 — 02 `exportLog`가 만드는 것과 같은 차례다.
## ⚠ **`lines_of`를 쓴다** — 화면과 파일이 두 벌이면 어긋난다
static func export_text() -> String:
	var out: PackedStringArray = []
	for e in EventLog.all():
		for l in EventLog.lines_of(e):
			out.append(String(l))
	return "\n".join(out)


## 파일로 — 02는 `.txt`를 내려받는다. 04는 `user://logs/`에 쓴다
## (이미 계측 로그가 거기 있다)
static func export_to_file() -> String:
	var dir: String = "user://logs"
	DirAccess.make_dir_recursive_absolute(dir)
	var path: String = "%s/auto-advance.txt" % dir
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		push_error("자동 진행 로그를 못 쓴다: %s" % path)
		return ""
	f.store_string(export_text())
	f.close()
	return ProjectSettings.globalize_path(path)
