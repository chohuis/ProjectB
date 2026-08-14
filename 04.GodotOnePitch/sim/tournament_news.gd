extends RefCounted
class_name TournamentNews

## 대회 소식 — 개막·라운드·우승. B-4b.
##
## 원본: `weekPhases/tournamentNews.ts`
##
## ⚠ **02는 대회가 데이터로만 돌았다.** 화면에도 소식에도 없어서
## `finishedTournaments()`를 부르는 곳이 0이었고 **우승해도 아무 말이
## 없었다.** 고교 시즌의 서사는 권역 리그가 아니라 대회다 — 진출·탈락·우승이
## 안 보이면 그 시즌에 무슨 일이 있었는지 알 수가 없다.
##
## ⚠ **여기서 새로 시뮬하지 않는다.** 이미 확정된 대진과 일정 결과만 읽는다.


## 라운드 이름은 **결승에서 거꾸로 센다.** 대회마다 라운드 수가 달라서
## 앞에서 세면 32팀 대회의 1라운드와 128팀 대회의 1라운드가 같은 이름이 된다
const ROUND_NAMES: Array[String] = ["결승", "4강", "8강", "16강", "32강"]


static func round_name(round: int, total_rounds: int) -> String:
	var from_end: int = total_rounds - round
	if from_end >= 0 and from_end < ROUND_NAMES.size():
		return ROUND_NAMES[from_end]
	return "%d라운드" % round


## 명단을 소식으로 보낼 만한 라운드인가.
##
## ⚠ **32강부터다** (사용자 확정). 그 앞은 팀이 너무 많아 명단이 소식이
## 안 된다 — 102팀 대회면 1회전만 51경기다
static func is_listable(round: int, total_rounds: int) -> bool:
	return total_rounds - round < ROUND_NAMES.size()


static func _sender(league_id: String) -> String:
	return "대학야구연맹" if league_id == "LEAGUE_UNIVERSITY" else "고교야구연맹"


static func _name_of(names: Dictionary, team_id: String) -> String:
	return String(names.get(team_id, team_id))


static func _round_matches(bracket: Dictionary, round: int) -> Array:
	var out: Array = []
	for m in bracket.get("matches", []):
		if int(m["round"]) == round and not bool(m["is_bye"]):
			out.append(m)
	return out


# ── 개막 ──────────────────────────────────────────────────────

## 개막 — **참가 규모와 내 팀이 나가는지**가 핵심이다
static func opening(tournament_def: Dictionary, entrant_ids: Array,
		my_team_id: String, day: int, season_year: int) -> Dictionary:
	var joined: bool = entrant_ids.has(my_team_id)
	return {
		# ⚠ **연도를 id에 넣는다.** 주차는 시즌마다 1로 돌아가서 해마다 겹친다
		"id": "msg-tour-open-%s-%d" % [tournament_def["id"], season_year],
		"category": "news", "sender": _sender(String(tournament_def["league_id"])),
		"subject": "%d %s 개막 — %d팀 참가"
			% [season_year, tournament_def["name"], entrant_ids.size()],
		"preview": "우리 팀도 출전한다." if joined else "우리 팀은 출전하지 못했다.",
		"body": "\n".join([
			"%s(%s) 대회가 시작됩니다." % [tournament_def["name"],
				tournament_def["flower"]],
			"",
			"■ 참가   %d팀" % entrant_ids.size(),
			"■ 기간   W%d ~ W%d" % [tournament_def["start_week"],
				tournament_def["end_week"]],
			"",
			"우리 팀이 출전 명단에 들었다." if joined
				else "우리 팀은 이번 대회 출전권을 얻지 못했다.",
		]),
		"day": day, "read": false, "decision": null,
	}


# ── 내 경기 ───────────────────────────────────────────────────

## 내 팀의 그 라운드 결과 — **이겼으면 다음 라운드, 지면 탈락.**
##
## 내 팀이 그 라운드에 없으면 `{}` (이미 탈락했거나 애초에 미출전)
static func my_round(tournament_def: Dictionary, bracket: Dictionary,
		round: int, my_team_id: String, names: Dictionary,
		day: int) -> Dictionary:
	# 주인공이 없으면 아래 훑기가 아무것도 못 찾는다 — 따로 막지 않는다
	var mine: Dictionary = {}
	for m in _round_matches(bracket, round):
		if String(m["home"]) == my_team_id or String(m["away"]) == my_team_id:
			mine = m
			break
	if mine.is_empty() or String(mine["winner"]).is_empty():
		return {}

	var opponent: String = String(mine["away"]) if String(mine["home"]) == my_team_id \
		else String(mine["home"])
	var won: bool = String(mine["winner"]) == my_team_id
	var total: int = int(bracket["total_rounds"])
	var rn: String = round_name(round, total)
	var is_final: bool = round == total

	# ⚠ **02는 여기서 대회 이름을 두 번 넣었다** — 제목이 `대회명 + head`인데
	# head에도 대회명을 넣어서 "개나리기 개나리기 우승"이 됐다
	var head: String
	if won:
		head = "우승" if is_final else "%s 통과" % rn
	else:
		head = "%s 탈락" % rn

	var tail: String
	if won:
		tail = "%s를 들어올렸다." % tournament_def["flower"] if is_final \
			else "%s에 오른다." % round_name(round + 1, total)
	else:
		tail = "여기서 대회를 마친다."

	return {
		"id": "msg-tour-my-%s-r%d-%d" % [tournament_def["id"], round,
			bracket["season_year"]],
		"category": "news", "sender": "대회 본부",
		"subject": "%s %s" % [tournament_def["name"], head],
		"preview": "%s전 %s" % [_name_of(names, opponent),
			"승리" if won else "패배"],
		"body": "\n".join([
			"%s %s" % [tournament_def["name"], rn],
			"",
			"상대   %s" % _name_of(names, opponent),
			"결과   %s" % ("승리" if won else "패배"),
			"",
			tail,
		]),
		"day": day, "read": false, "decision": null,
	}


# ── 라운드 명단 ───────────────────────────────────────────────

## 라운드가 끝날 때마다 **진출 팀 명단**을 알린다 — 내 팀이 없어도 온다.
##
## ⚠ **02는 내 경기와 우승만 보냈다.** 우리가 안 나간 대회는 개막·우승
## 두 통뿐이라 **누가 올라갔는지 알 수 없었고**, 우리가 나간 대회도 탈락한
## 뒤로는 깜깜했다.
##
## ⚠ **내 팀이 그 라운드에 있으면 `{}`다.** `my_round`가 이미 그 경기를
## 자세히 알린다 — 둘 다 보내면 같은 라운드가 두 통이 된다
static func round_progress(tournament_def: Dictionary, bracket: Dictionary,
		round: int, my_team_id: String, names: Dictionary, day: int,
		my_region_teams: Array = []) -> Dictionary:
	var total: int = int(bracket["total_rounds"])
	if not is_listable(round, total):
		return {}
	# 결승은 우승 소식이 맡는다
	if round == total:
		return {}

	var played: Array = _round_matches(bracket, round)
	if played.is_empty():
		return {}

	var winners: Array = []
	var fallen: Array = []
	for m in played:
		var w: String = String(m["winner"])
		if w.is_empty():
			return {}
		if String(m["home"]) == my_team_id or String(m["away"]) == my_team_id:
			return {}
		winners.append(w)
		var loser: String = String(m["away"]) if w == String(m["home"]) \
			else String(m["home"])
		if my_region_teams.has(loser):
			fallen.append(loser)

	var known: Array = []
	for w in winners:
		if my_region_teams.has(w):
			known.append(w)

	var next_name: String = round_name(round + 1, total)
	var lines: Array = ["%s %s 종료" % [tournament_def["name"],
		round_name(round, total)], "",
		"■ %s 진출 %d팀" % [next_name, winners.size()]]
	for w in winners:
		lines.append("   %s%s" % [_name_of(names, w),
			"   ← 우리 권역" if known.has(w) else ""])
	if not fallen.is_empty():
		var fallen_names: Array = []
		for f in fallen:
			fallen_names.append(_name_of(names, f))
		lines.append("")
		lines.append("■ 우리 권역 탈락   %s" % ", ".join(fallen_names))

	var preview: String
	if known.is_empty():
		preview = "%s 외 %d팀" % [_name_of(names, String(winners[0])),
			maxi(winners.size() - 1, 0)]
	else:
		var known_names: Array = []
		for k in known:
			known_names.append(_name_of(names, k))
		preview = "우리 권역 %s 진출" % ", ".join(known_names)

	return {
		"id": "msg-tour-round-%s-r%d-%d" % [tournament_def["id"], round,
			bracket["season_year"]],
		"category": "news", "sender": _sender(String(tournament_def["league_id"])),
		"subject": "%s %s 진출 %d팀" % [tournament_def["name"], next_name,
			winners.size()],
		"preview": preview, "body": "\n".join(lines),
		"day": day, "read": false, "decision": null,
	}


# ── 우승 ──────────────────────────────────────────────────────

## 우승 확정 — 내 팀이 아니어도 리그 소식으로 알린다.
##
## ⚠ **내 팀이 우승했으면 `my_round`가 이미 알렸다** — 두 번 안 보낸다
static func champion(tournament_def: Dictionary, bracket: Dictionary,
		my_team_id: String, names: Dictionary, day: int) -> Dictionary:
	var final_match: Dictionary = {}
	for m in bracket.get("matches", []):
		if int(m["round"]) == int(bracket["total_rounds"]):
			final_match = m
			break
	if final_match.is_empty() or String(final_match["winner"]).is_empty():
		return {}

	var champ: String = String(final_match["winner"])
	if champ == my_team_id:
		return {}
	var runner_up: String = String(final_match["away"]) \
		if champ == String(final_match["home"]) else String(final_match["home"])

	var lines: Array = [
		"%d %s(%s)이 막을 내렸습니다." % [bracket["season_year"],
			tournament_def["name"], tournament_def["flower"]],
		"",
		"🏆 우승    %s" % _name_of(names, champ)]
	if not runner_up.is_empty():
		lines.append("   준우승  %s" % _name_of(names, runner_up))

	return {
		"id": "msg-tour-champ-%s-%d" % [tournament_def["id"],
			bracket["season_year"]],
		"category": "news", "sender": _sender(String(tournament_def["league_id"])),
		"subject": "%s 우승 — %s" % [tournament_def["name"],
			_name_of(names, champ)],
		"preview": "준우승 %s" % _name_of(names, runner_up) \
			if not runner_up.is_empty() else "",
		"body": "\n".join(lines),
		"day": day, "read": false, "decision": null,
	}
