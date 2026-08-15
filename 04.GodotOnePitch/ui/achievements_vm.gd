extends RefCounted
class_name AchievementsVm

## 업적 화면 — C-5. "나" 탭의 하위 탭이다.
##
## 원본: `pages/achievements/AchievementsPage.svelte`
##
## ⚠ **화면이 달성 판정을 안 한다.** 판정은 주 경계에서 `Achievements.check`가
## 끝낸다 — 02는 이 화면이 `computeMetrics`를 직접 불러서, 화면을 안 열면
## 진행도가 낡은 채로 남았다.
##
## ⚠ **보상은 표시만 한다.** 02도 그랬다 — "명성 +1"은 태그일 뿐 어디에도
## 안 걸린다. 이주 중에 새로 걸지 않는다.

const CATEGORY_LABEL: Dictionary = {
	"baseball": "야구", "growth": "성장", "social": "관계", "hidden": "숨김",
}

## 표시 순서 — 야구가 먼저다. 이 게임이 무엇인지가 목록 위에 있어야 한다
const CATEGORY_ORDER: Array = ["baseball", "growth", "social", "hidden"]


static func build(state: Dictionary) -> Dictionary:
	var runtime: Dictionary = Achievements.of(state)

	var groups: Dictionary = {}
	var unlocked: int = 0
	var total: int = 0

	for d in Achievements.defs():
		var row: Dictionary = _row(d, runtime)
		# ⚠ **아직 못 만든 업적은 목록에서도 뺀다.** 영영 안 열리는 줄이
		# 섞여 있으면 "몇 개 중 몇 개"가 거짓말이 된다
		if not bool(row["available"]):
			continue
		var cat: String = String(d.get("category", ""))
		total += 1
		if bool(row["unlocked"]):
			unlocked += 1
		if not groups.has(cat):
			groups[cat] = []
		groups[cat].append(row)

	# ⚠ **`CATEGORY_ORDER`에 없는 갈래는 안 뜬다.** 표에 갈래를 추가하면
	# 여기도 같이 고쳐야 한다 — 검사가 그걸 못 박는다. 빠뜨린 갈래를
	# 뒤에 붙이는 갈래를 만들어 두면, 지금은 그게 영영 안 도는 코드다
	var out: Array = []
	for cat in CATEGORY_ORDER:
		if groups.has(cat):
			out.append({"id": cat, "label": String(CATEGORY_LABEL.get(cat, cat)),
				"rows": groups[cat]})

	return {
		"summary": "%d / %d 달성" % [unlocked, total],
		"unlocked": unlocked,
		"total": total,
		"empty": "아직 달성한 업적이 없습니다. 경기에 나가고 훈련하면 쌓입니다.",
		"groups": out,
	}


## ⚠ **숨김(`hidden`) 처리를 안 만들었다.** 지금 `active` 중에 숨김 업적이
## 하나도 없다 — 유일한 숨김이 `blocked`이라 목록에서 아예 빠진다. 만들면
## 영영 안 도는 갈래가 하나 남는다. 숨김 업적을 열 때 같이 만든다
static func _row(d: Dictionary, runtime: Dictionary) -> Dictionary:
	var id: String = String(d["id"])
	var row: Dictionary = runtime.get(id, {})
	var done: bool = not String(row.get("unlocked_at", "")).is_empty()
	var target: int = int(d["target"])
	var progress: int = mini(int(row.get("progress", 0)), target)

	return {
		"id": id,
		"title": String(d["title"]),
		"unlocked": done,
		"available": String(d.get("status", "")) == "active",
		"at": String(row.get("unlocked_at", "")),
		# 보상은 딴 뒤에만 보여준다 — 02도 그랬다
		"reward": String(d.get("reward", "")) if done else "",
		"progress": progress,
		"target": target,
		"ratio": 1.0 if done else (float(progress) / float(target) \
			if target > 0 else 0.0),
		"detail": String(row.get("unlocked_at", "")) if done \
			else "%d / %d" % [progress, target],
	}
