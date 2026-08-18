extends RefCounted
class_name ProspectRunner

## 고교 유망주 TOP 10 배선 — 02 `advanceWeek.ts:591-635`.
##
## 🔴 **04엔 이 소식도 이 효과도 통째로 없었다.** 02는 고교 시절 4주마다
## 랭킹을 보내고 그 순위가 **인기·스카우트 점수·사기에 실제로 닿는다**
## (`rankEffect`). 04는 고교 3년 내내 자기 위치를 알 방법이 없었다.
##
## ⚠ **고교일 때만 돈다.** 02도 `careerStage === "highschool"`로 막는다.


## 얼마나 올리나 — **상한을 둔다.** 02는 안 두는데, 04는 고교가 3년이라
## 4주마다 최대 10씩 12번이면 인기가 120이 된다. 축이 0~100이다
const CAP: float = 100.0


static func _bump(p: Dictionary, key: String, delta: float) -> void:
	if delta <= 0.0:
		return
	p[key] = minf(float(p.get(key, 0.0)) + delta, CAP)


## 이 주에 도나 — 02 `weekInYear % 4 === 0 && weekInYear >= 4`
static func is_ranking_week(week: int) -> bool:
	return week >= ProspectTop10.FIRST_WEEK \
		and week % ProspectTop10.EVERY_WEEKS == 0


## 소식 한 통. **본문에 명단을 적는다.**
##
## ⚠ **02는 본문에 아무것도 안 담는다**(`body: subject`) — 내용이 전부
## `metadata`에 있어 패널이 없으면 빈 소식이다. 04는 본문 상세가 있으니
## 거기 적는다.
##
## ⚠ **id를 해·주차로 짓는다.** 02는 `Date.now()`를 써서 같은 주를 두 번
## 굴리면 두 통이 된다 — 04 규칙(재현 가능)에도 어긋난다
static func _append_rows(lines: Array[String], rows: Array,
		names: Dictionary) -> void:
	for r in rows:
		lines.append("%2d위  %s  %s  %.1f%s" % [int(r["rank"]), r.get("name", ""),
			names.get(r.get("team_id", ""), r.get("team_id", "")),
			float(r["score"]), "  ← 나" if bool(r.get("is_me", false)) else ""])


## ⚠ **성적을 여기서 다시 읽지 않는다.** 학년 칸이 따로 읽으면 통합 칸과
## **갈린다** — 실제로 통합이 성적을 잃어도 학년 칸이 가려서 변이가 안 잡혔다
static func message_of(state: Dictionary, rows: Array, at_day: int,
		stats: Dictionary = {}) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var year: int = int(state.get("season_year", 0))
	var week: int = Calendar.week_of(at_day)
	var kind: String = "투수" if String(p.get("player_type", "pitcher")) == "pitcher" \
		else "타자"
	var rank: int = ProspectTop10.my_rank(rows)
	var month: int = int(Calendar.date_of(year, maxi(at_day, 1))["month"])

	var names: Dictionary = state.get("team_names", {})
	var lines: Array[String] = ["[통합]"]
	_append_rows(lines, rows, names)

	# 🔴 **학년 칸이 없으면 1학년은 자기 위치를 영영 못 본다.**
	# 실측에서 3,061명 중 통합 10위에 못 들었다 — **02가 학년별 칸을
	# 따로 내는 이유가 그것이다**(`buildTop10Metadata`의 네 칸).
	#
	# ⚠ **02는 네 칸(통합·3·2·1학년)을 다 낸다.** 04는 본문이 글자라
	# 40줄이면 안 읽힌다 — **통합 + 내 학년** 둘만 낸다
	var my_grade: int = int(p.get("grade", 0))
	if my_grade > 0:
		var mine: Array = ProspectTop10.ranking(state, stats, my_grade, week)
		lines.append("")
		lines.append("[%d학년]" % my_grade)
		_append_rows(lines, mine, names)
		if ProspectTop10.my_rank(mine) == 0:
			lines.append("  — 학년 명단에도 들지 못했다.")

	if rank == 0:
		lines.append("")
		lines.append("통합 명단에는 들지 못했다.")

	return {
		"id": "msg-top10-%d-w%d" % [year, week],
		"category": "news", "sender": "스포츠 매체",
		"subject": "[%d월] 고교 %s 유망주 %s" % [month, kind,
			"%d위" % rank if rank > 0 else "월간 랭킹"],
		"preview": "통합 %d위" % rank if rank > 0 else "이번 달 명단 밖",
		"body": "\n".join(lines),
		"day": at_day, "read": false, "decision": null,
	}


## 한 주. 돌면 **소식 + 효과** 둘 다 건다.
##
## ⚠ **효과를 안 걸면 순위가 장식이 된다.** 02는 `rankEffect`를 실제로
## 더한다 — 그게 고교 시절 스카우트 점수가 오르는 주된 길이다
static func run(state: Dictionary, at_day: int = -1) -> Dictionary:
	var day: int = at_day if at_day > 0 else int(state.get("day", 1))
	var p: Dictionary = state.get("protagonist", {})
	if CareerPath.stage_of(p) != "highschool":
		return {}
	if not is_ranking_week(Calendar.week_of(day)):
		return {}

	var id: String = String(p.get("id", ""))
	var stats: Dictionary = state.get("season_stats", {}).get(id, {})
	var rows: Array = ProspectTop10.ranking(state, stats, 0, Calendar.week_of(day))
	if rows.is_empty():
		return {}

	var msg: Dictionary = message_of(state, rows, day, stats)
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == String(msg["id"]):
			return {}
	mailbox.append(msg)
	state["mailbox"] = mailbox

	var rank: int = ProspectTop10.my_rank(rows)
	if rank > 0:
		var ef: Dictionary = ProspectTop10.rank_effect(rank)
		_bump(p, "popularity", float(ef["popularity"]))
		_bump(p, "scout_score", float(ef["scout_score"]))
		_bump(p, "morale", float(ef["morale"]))
	return msg
