extends RefCounted
class_name NationalRunner

## 국가대표 배선 — 발탁 · 차출 · 결과 · 면제. B-8.
##
## 원본: `usecases/nationalTeam.ts`의 `runNationalTeamWeek`
##
## ```
## 개막 주            발탁 → 소속팀에서 이탈
## 개막 + duration    결과 산출 → 메달·면제 → 복귀
## ```
##
## ⚠ **02는 7-3에서 대회를 로그로만 냈다.** 자동진행 로그는 개발용이라
## 플레이어는 **발탁도 메달도 병역 면제도 못 봤다** — 세계에서 제일 큰
## 사건이 화면에 없었다. 소식이 여기 붙는 이유다.


## 차출 중인 대회가 사는 자리
const KEY: String = "national_duty"

const EXEMPT_STATUS: String = "면제"
const SERVING_STATUS: String = "현역"


static func duty_of(state: Dictionary) -> Dictionary:
	var d = state.get(KEY, {})
	return d if d is Dictionary else {}


## 지금 차출돼 있나 — 승강·로스터가 이걸 보고 자리를 메운다
static func is_called_up(state: Dictionary, player_id: String) -> bool:
	return duty_of(state).get("squad", []).has(player_id)


## 한 주. `{opened, result}`
static func run(state: Dictionary, at_day: int) -> Dictionary:
	var week: int = Calendar.week_of(at_day)
	var year: int = int(state.get("season_year", 0))
	var duty: Dictionary = duty_of(state)

	if not duty.is_empty():
		if week < int(duty.get("end_week", 0)):
			return {}
		return {"result": _close(state, duty, at_day, year)}

	var t: Dictionary = NationalTeam.tournament_of(year)
	if t.is_empty() or week != int(t.get("week", -1)):
		return {}
	return {"opened": _open(state, t, at_day, year)}


# ── 발탁 ──────────────────────────────────────────────────────

static func _open(state: Dictionary, t: Dictionary, at_day: int,
		year: int) -> Dictionary:
	var picked: Dictionary = NationalTeam.select_squad(candidates(state), year)
	if picked["squad"].is_empty():
		return {}

	state[KEY] = {
		"tournament": t,
		"squad": picked["squad"],
		"squad_strength": float(picked["squad_strength"]),
		"protagonist_selected": bool(picked["protagonist_selected"]),
		# ⚠ **끝나는 주를 여기서 못 박는다.** 매주 다시 세면 규칙이 바뀔 때
		# 진행 중인 대회가 늘어나거나 줄어든다
		"end_week": int(t.get("week", 0)) + maxi(int(t.get("duration_weeks", 1)), 1),
	}
	_send(state, _squad_news(state, t, picked, at_day, year))
	return picked


## 대표 후보. **국내 프로 한국인 현역만이다**
##
## ⚠ **국적을 봐야 한다.** 02는 `병역 != 현역`만 걸렀는데 외국인은 병역이
## "면제"라 그 조건을 그냥 통과한다 — **KBL 외국인이 한국 대표로 뽑혔다.**
## 국적이 없는 옛 세이브는 한국인으로 읽는다
static func candidates(state: Dictionary) -> Array:
	var world: Dictionary = state.get("world", {})
	var me: String = String(state.get("protagonist", {}).get("id", ""))
	var stats: Dictionary = state.get("season_stats", {})
	var out: Array = []

	for team_id in world.get("rosters", {}):
		for p in world["rosters"][team_id]:
			if not NationalTeam.POOL_LEAGUES.has(String(p.get("league_id", ""))):
				continue
			if String(p.get("career_status", "active")) != "active":
				continue
			if String(p.get("military_status", "미필")) == SERVING_STATUS:
				continue
			if String(p.get("nationality", "KOR")) != "KOR":
				continue
			var id: String = String(p.get("id", ""))
			out.append({
				"id": id, "name": String(p.get("name", id)),
				"team_id": String(p.get("team_id", team_id)),
				"position": String(p.get("position", "")),
				"ovr": Contract.core_ovr(p),
				"age": int(p.get("age", 25)),
				"form": NationalTeam.form_of(stats.get(id, {})),
				"is_protagonist": id == me and not me.is_empty(),
			})
	return out


# ── 결과 ──────────────────────────────────────────────────────

static func _close(state: Dictionary, duty: Dictionary, at_day: int,
		year: int) -> Dictionary:
	var t: Dictionary = duty.get("tournament", {})
	var rng := RandomNumberGenerator.new()
	rng.seed = Rng.mix(["national", int(state.get("seed", 0)), year,
		String(t.get("id", ""))])
	var res: Dictionary = NationalTeam.simulate(t,
		float(duty.get("squad_strength", 0.0)), rng)

	var squad: Array = duty.get("squad", [])
	if bool(res["exemption"]):
		grant_exemption(state, squad, year, String(t.get("name", "")))

	_send(state, _result_news(t, res, squad.size(),
		bool(duty.get("protagonist_selected", false)), at_day, year))
	# ⚠ **차출을 반드시 푼다.** 안 풀면 대표팀이 소속팀 경기에 영영 안 나온다
	state[KEY] = {}
	return res


## 병역 면제 — **대표팀 전원에게 준다.** 실제 규정과 같다
static func grant_exemption(state: Dictionary, squad: Array, year: int,
		tournament_name: String) -> int:
	var n: int = 0
	for p in _people_of(state, squad):
		# 이미 다녀온 사람은 그대로 둔다 — 면제가 군필을 덮으면 기록이 뒤집힌다
		if String(p.get("military_status", "미필")) != "미필":
			continue
		p["military_status"] = EXEMPT_STATUS
		var events: Array = p.get("career_events", [])
		events.append({"year": year, "type": "military_exemption",
			"detail": "%s 입상 — 병역 특례" % tournament_name})
		p["career_events"] = events
		n += 1
	return n


## 그 id들의 실제 사전 — 주인공과 NPC 양쪽에서 찾는다
static func _people_of(state: Dictionary, ids: Array) -> Array:
	var want: Dictionary = {}
	for id in ids:
		want[String(id)] = true

	var out: Array = []
	var me: Dictionary = state.get("protagonist", {})
	if want.has(String(me.get("id", ""))):
		out.append(me)
	for team_id in state.get("world", {}).get("rosters", {}):
		for p in state["world"]["rosters"][team_id]:
			if want.has(String(p.get("id", ""))):
				out.append(p)
	return out


# ── 소식 ──────────────────────────────────────────────────────

const SENDER: String = "대한야구협회"

## 명단에 이름만 나열하면 안 읽힌다 — 몇 명까지 적나
const ROSTER_SHOWN: int = 20


static func _squad_news(state: Dictionary, t: Dictionary, picked: Dictionary,
		at_day: int, year: int) -> Dictionary:
	var squad: Array = picked["squad"]
	var names: Dictionary = state.get("team_names", {})
	var by_id: Dictionary = {}
	for c in candidates(state):
		by_id[String(c["id"])] = c

	var lines: Array = []
	for i in range(mini(squad.size(), ROSTER_SHOWN)):
		var c: Dictionary = by_id.get(String(squad[i]), {})
		var team: String = String(c.get("team_id", ""))
		lines.append("  %2d. %s (%s)" % [i + 1, c.get("name", squad[i]),
			names.get(team, team)])
	if squad.size() > ROSTER_SHOWN:
		lines.append("  … 외 %d명" % (squad.size() - ROSTER_SHOWN))

	var exemption_rank: int = int(t.get("exemption_rank", 0))
	var mine: bool = bool(picked["protagonist_selected"])
	return {
		"id": "msg-natl-squad-%s-%d" % [t.get("id", ""), year],
		"category": "news", "sender": SENDER,
		"subject": "%d %s 국가대표 명단 발표" % [year, t.get("name", "")],
		"preview": "%d명 차출%s" % [squad.size(),
			" · 나도 포함됐다" if mine else ""],
		"body": "\n".join([
			"%d %s에 나설 국가대표 %d명이 발표됐습니다."
				% [year, t.get("name", ""), squad.size()],
			"",
			"명단에 내 이름이 있었다." if mine else "이번에는 명단에 들지 못했다.",
			"",
			"\n".join(lines),
			"",
			"%d위 이내 입상 시 병역 특례가 주어집니다." % exemption_rank
				if exemption_rank > 0
				else "이 대회에는 병역 특례가 걸려 있지 않습니다.",
			"",
			"대회 기간 동안 차출된 선수는 소속팀 경기에 나서지 않습니다.",
		]),
		"day": at_day, "read": false, "decision": null,
	}


static func _result_news(t: Dictionary, res: Dictionary, squad_size: int,
		was_selected: bool, at_day: int, year: int) -> Dictionary:
	var medal: String = String(res["medal"])
	var rank: int = int(res["rank"])
	var field: int = int(res["field_size"])
	var head: String = "%s메달 — %d위 / %d개국" % [medal, rank, field] \
		if not medal.is_empty() else "%d위 / %d개국" % [rank, field]

	# 같은 순위라도 읽히는 감정이 다르다 — 메달·중위권·부진을 나눠 쓴다
	var lead: String
	if rank == 1:
		lead = "우승했습니다."
	elif not medal.is_empty():
		lead = "%s메달을 따냈습니다." % medal
	elif rank <= int(ceilf(float(field) / 2.0)):
		lead = "아쉽게 시상대에는 오르지 못했습니다."
	else:
		lead = "기대에 미치지 못한 결과였습니다."

	var exemption_rank: int = int(t.get("exemption_rank", 0))
	var exemption_line: String = ""
	if bool(res["exemption"]):
		exemption_line = "입상 기준(%d위 이내)을 충족해 대표팀 %d명 전원에게 병역 특례가 주어집니다." \
			% [exemption_rank, squad_size]
	elif exemption_rank > 0:
		exemption_line = "병역 특례 기준(%d위 이내)에는 닿지 못했습니다." % exemption_rank

	var mine: String
	if was_selected:
		mine = "대표팀의 일원으로 그 자리에 있었다."
		if bool(res["exemption"]):
			mine += " 병역 문제가 해결됐다."
	else:
		mine = "이번 대회는 지켜보는 쪽이었다."

	return {
		"id": "msg-natl-result-%s-%d" % [t.get("id", ""), year],
		"category": "news", "sender": SENDER,
		"subject": "%d %s — %s" % [year, t.get("name", ""), head],
		"preview": lead + (" · 병역 특례 확정" if bool(res["exemption"]) else ""),
		"body": "\n".join([
			"%d %s이 막을 내렸습니다." % [year, t.get("name", "")],
			"",
			"최종 성적: %s" % head,
			lead,
			exemption_line,
			"",
			mine,
			"",
			"차출됐던 선수들이 소속팀으로 복귀합니다.",
		]),
		"day": at_day, "read": false, "decision": null,
	}


## 소식함에 넣는다. **같은 id는 안 넣는다**
static func _send(state: Dictionary, message: Dictionary) -> bool:
	if message.is_empty():
		return false
	var mailbox: Array = state.get("mailbox", [])
	for m in mailbox:
		if String(m.get("id", "")) == String(message["id"]):
			return false
	mailbox.append(message)
	state["mailbox"] = mailbox
	return true
