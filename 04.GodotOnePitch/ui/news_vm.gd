extends RefCounted
class_name NewsVm

## 소식 탭 ViewModel — M7-5.
##
## 원본: `pages/news/NewsPage.svelte` (540줄) · `utils/messageCategory.ts`
##
## ⚠ **분류 표를 화면에 두지 않는다.** 02에선 이 표가 화면 안에 있었고
## 화면이 늘 때마다 같은 표를 또 적게 됐다. 정본은 여기 하나다.


## 분류 이름표. **분류색은 팀 색이 아니다** — "코치가 보냈다"는 사실은
## 이적해도 안 변한다
const CATEGORY_LABEL: Dictionary = {
	"system": "시스템", "news": "뉴스", "coach": "코치", "manager": "감독",
}

## 거르기 묶음.
##
## ⚠ **분류 4종을 그대로 칩으로 깔면 한 줄에 안 들어간다.** 2단 레이아웃으로
## 바꾸면서 목록 폭이 좁아졌고 여섯 개가 두 줄로 깨졌다.
##
## ⚠ **묶는 기준은 "보낸 사람이 누구인가"다.** 코치와 감독은 둘 다 팀
## 사람이고 실측에서 각각 2건뿐이라(대부분이 뉴스 20 · 시스템 26) 따로
## 둘 값이 없다
const FILTER_GROUPS: Array[Dictionary] = [
	{"id": "staff", "label": "코치·감독", "cats": ["coach", "manager"]},
	{"id": "news", "label": "뉴스", "cats": ["news"]},
	{"id": "system", "label": "시스템", "cats": ["system"]},
]


static func _is_pending(m: Dictionary) -> bool:
	var d = m.get("decision", null)
	return d != null and d.get("selected", null) == null


static func _is_decided(m: Dictionary) -> bool:
	var d = m.get("decision", null)
	return d != null and d.get("selected", null) != null


## 화면이 그릴 선택지 — F-8b. 결정이 없으면 빈 사전.
##
## ⚠ **답한 소식은 고른 것을 보여준다.** 뭘 골랐는지 나중에 알 수 없으면
## 지난 결정을 되짚을 방법이 없다
static func _decision_of(m: Dictionary) -> Dictionary:
	var d = m.get("decision", null)
	if d == null:
		return {}
	var picked = d.get("selected", null)
	var label: String = ""
	if picked != null:
		for c in d.get("choices", []):
			if String(c.get("id", "")) == String(picked):
				label = String(c.get("label", ""))
	return {
		"prompt": String(d.get("prompt", "")),
		# ⚠ **답했으면 선택지를 안 준다.** 화면이 버튼을 또 그리면 두 번
		# 눌러 효과를 두 번 받는다 — `CoachReport.apply`가 막지만 화면에
		# 눌리는 버튼이 남아 있으면 "왜 안 되지"가 된다
		"choices": [] if picked != null else d.get("choices", []),
		"selected": picked,
		"selected_label": label,
	}


static func build(s: Dictionary) -> Dictionary:
	var year: int = s.get("season_year", 2026)
	var mailbox: Array = s.get("mailbox", [])
	var active: String = s.get("news_filter", "all")
	var oldest_first: bool = s.get("news_oldest_first", false)

	# ⚠ **겹친 id를 세어 밖으로 낸다.** 02에선 겹치면 세이브가 **아예 안
	# 열렸다** — 목록이 id를 키로 잡아서 죽었고 로드 화면에서 멈춘 채 단서가
	# 없었다. Godot은 안 죽지만 줄이 겹쳐 하나가 조용히 사라진다.
	# **지우지는 않는다** — 조용히 지우는 게 더 나쁘다
	var seen: Dictionary = {}
	var dupes: int = 0

	var pending: Array = []
	var rest: Array = []
	var markable: int = 0
	var counts: Dictionary = {"all": 0, "unread": 0}
	for g in FILTER_GROUPS:
		counts[g["id"]] = 0

	for m in mailbox:
		var id: String = String(m.get("id", ""))
		if seen.has(id):
			dupes += 1
		seen[id] = true

		var cat: String = String(m.get("category", ""))
		var unread: bool = not m.get("read", false)
		var is_pending: bool = _is_pending(m)

		counts["all"] += 1
		if unread:
			counts["unread"] += 1
		for g in FILTER_GROUPS:
			if g["cats"].has(cat):
				counts[g["id"]] += 1

		# ⚠ **답을 안 한 결정은 "모두 읽음"으로 안 지운다.** 지우면 그 결정이
		# 목록에서 조용히 사라져 진행이 영영 막힌다
		if unread and not is_pending:
			markable += 1

		if not _passes(m, active, unread, cat):
			continue

		var day: int = int(m.get("day", 0))
		var date: Dictionary = Calendar.date_of(year, maxi(day, 1))
		var row: Dictionary = {
			"id": id,
			"day": day,
			"date_label": "%d월 %d일" % [date["month"], date["day"]],
			"subject": m.get("subject", ""),
			"preview": m.get("preview", ""),
			# 🔴 **본문이 여기까지 안 왔다.** 그래서 `sim/` 여덟 파일
			# 열여섯 자리가 쓰는 여러 줄 본문이 **전부 묻혀 있었다**.
			# ⚠ 없으면 빈칸으로 둔다 — 미리보기로 때우면 "본문이 있다"와
			# "없다"를 못 가른다
			"body": m.get("body", ""),
			"sender": m.get("sender", ""),
			"category": cat,
			# 모르는 분류에 빈칸을 주지 않는다 — 분류가 늘었을 때 화면이
			# 조용히 비어 보이면 아무도 모른다
			"category_label": CATEGORY_LABEL.get(cat, cat),
			"unread": unread,
			"pending": is_pending,
			"decided": _is_decided(m),
		}
		# ⚠ **선택지를 같이 싣는다** (F-8b). `pending` 표시만으론 화면이
		# 그릴 게 없어서 **답할 방법이 없었다** — 코치 리포트는 날을 안
		# 막으므로 자동 진행도 안 답한다. 여기가 유일한 입구다
		row.merge(_decision_of(m), true)
		if is_pending:
			pending.append(row)
		else:
			rest.append(row)

	rest.sort_custom(func(a, b) -> bool:
		return a["day"] < b["day"] if oldest_first else a["day"] > b["day"])

	# ⚠ **뒤집어도 미결정은 위에 남는다.** 정렬이 그걸 밀어내면 결정이
	# 목록 아래로 사라져 진행이 왜 막혔는지 모른다
	var rows: Array = pending
	rows.append_array(rest)

	var filters: Array = [
		{"id": "all", "label": "전체", "count": counts["all"]},
		{"id": "unread", "label": "안읽음", "count": counts["unread"]},
	]
	for g in FILTER_GROUPS:
		filters.append({"id": g["id"], "label": g["label"], "count": counts[g["id"]]})

	return {
		"rows": rows,
		"filters": filters,
		"active_filter": active,
		"oldest_first": oldest_first,
		"markable_count": markable,
		"duplicate_ids": dupes,
		"detail": _detail(s, mailbox, year),
	}


## 열어 둔 소식 하나. 02 `NewsPage.svelte:236-258`.
##
## ⚠ **거른 목록이 아니라 소식함 전체에서 찾는다.** 거른 쪽에서 찾으면
## "뉴스"를 열어 둔 채 거르개를 "시스템"으로 바꾸는 순간 **읽던 글이 사라진다**.
##
## ⚠ **없는 id면 빈 상세를 띄우지 않는다** — 지워진 소식을 가리킨 채 남으면
## 화면이 빈 껍데기가 된다
static func _detail(s: Dictionary, mailbox: Array, year: int) -> Dictionary:
	var open_id: String = String(s.get("news_open_id", ""))
	if open_id.is_empty():
		return {}

	for m in mailbox:
		if String(m.get("id", "")) != open_id:
			continue
		var day: int = int(m.get("day", 0))
		var date: Dictionary = Calendar.date_of(year, maxi(day, 1))
		var cat: String = String(m.get("category", ""))
		var d: Dictionary = {
			"id": open_id,
			"subject": m.get("subject", ""),
			"sender": m.get("sender", ""),
			"category": cat,
			"category_label": CATEGORY_LABEL.get(cat, cat),
			"date_label": "%d월 %d일" % [date["month"], date["day"]],
			"body": m.get("body", ""),
			# 상세에서도 답할 수 있어야 한다 — 목록으로 나가야만 답할 수
			# 있으면 열어 본 사람이 길을 잃는다
			"pending": _is_pending(m),
			"decided": _is_decided(m),
		}
		d.merge(_decision_of(m), true)
		return d
	return {}


static func _passes(_m: Dictionary, active: String, unread: bool, cat: String) -> bool:
	if active == "all":
		return true
	if active == "unread":
		return unread
	for g in FILTER_GROUPS:
		if g["id"] == active:
			return g["cats"].has(cat)
	# 모르는 거르기는 전부 보여준다 — 빈 화면보다 낫다
	return true
