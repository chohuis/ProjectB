extends RefCounted
class_name MatchOutcome

## 경기 하나가 주인공에게 남기는 것 — F-9.
##
## 원본: `usecases/applyGameOutcome.ts:242-259`
##
## ⚠ **`GameGrowth`를 아무도 안 불렀다.** 능력·사기·명성·피로가 통째로
## 안 움직였다 — `grep GameGrowth`가 주석 두 줄만 줬다. 만들어 놓고 안 이은
## 자리 중 제일 크다.
##
## ⚠ **`Staff.mods_of`의 `morale`·`fame`도 같이 죽어 있었다.** 소비처가
## 여기뿐이라 감독 동기부여·구단주 홍보력이 아무 일도 안 했다.
##
## ⚠ **`GameGrowth.calc`는 순수 함수다** — 원본 사전을 안 바꾸고 새 값을
## 돌려준다. 상태에 반영하는 것이 여기 할 일이다.
##
## ⚠ **화면이 이 계산을 갖지 않는다.** `app_root._record_match`는
## `apply` 한 줄만 부른다 — 거기 식을 적으면 자동 진행 경로와 갈린다.

## 옮겨 담는 키. **`GameGrowth.calc`가 내는 이름 그대로다** —
## 여기서 이름을 바꾸면 한쪽이 조용히 안 옮겨진다
const PATCH_KEYS: Array[String] = [
	"pitching", "batting", "pitching_xp", "batting_xp",
	"fatigue", "condition", "morale",
]


## 그 경기에서 주인공 줄. 안 나왔으면 `{}`
static func line_of(result: Dictionary, player_id: String) -> Dictionary:
	for l in result.get("player_lines", []):
		if String(l.get("player_id", "")) == player_id:
			return l
	return {}


## 스태프 계수. **투수에겐 투수 코치가 정본이다**(`Staff.specialty_for`).
## 스태프가 없는 무대(고교)에서는 중립값으로 떨어진다
static func mods_for(state: Dictionary) -> Dictionary:
	var p: Dictionary = state.get("protagonist", {})
	var team_id: String = String(p.get("team_id", ""))
	if team_id.is_empty():
		return Staff.neutral_mods()
	return Staff.mods_of(state.get("world", {}), team_id,
		Staff.specialty_for(String(p.get("player_type", "pitcher"))))


## 경기 결과를 주인공에게 반영한다. **안 나온 경기면 `false`** —
## 팀이 이겼다고 벤치에 앉은 선수가 크면 안 된다
static func apply(state: Dictionary, result: Dictionary) -> bool:
	var p: Dictionary = state.get("protagonist", {})
	var me: String = String(p.get("id", ""))
	if me.is_empty():
		return false
	var line: Dictionary = line_of(result, me)
	if line.is_empty():
		return false

	# ⚠ **무승부는 승리가 아니다** — 02 `won = !isDraw && winnerId === myTeamId`.
	# 04 `to_match_result`는 무승부에 `loser_id`를 비우고 `winner_id`에 홈팀을
	# 넣는다. 그걸 그대로 읽으면 홈 무승부마다 사기가 오른다
	var my_team: String = String(p.get("team_id", ""))
	var draw: bool = String(result.get("loser_id", "")).is_empty()
	var won: bool = not draw and String(result.get("winner_id", "")) == my_team

	var mods: Dictionary = mods_for(state)
	var out: Dictionary = GameGrowth.calc(p, {
		"won": won,
		"score_diff": absi(int(result.get("home_score", 0))
			- int(result.get("away_score", 0))),
		# 타자 줄에도 `k`가 있지만 그건 삼진**당한** 수다 — 투수 줄만 쓴다
		"strikeouts": int(line.get("k", 0)) if String(line.get("role", "")) == "pitcher" else 0,
		"morale_mod": float(mods.get("morale", 1.0)),
		"fame_mod": float(mods.get("fame", 1.0)),
	})

	for k in PATCH_KEYS:
		p[k] = out[k]
	# ⚠ **명성은 델타로 온다** — 02도 `updateFame(growth.fameDelta)`로 따로 민다.
	# 다른 경로(캠퍼스·수상)도 같은 키에 더하므로 덮어쓰면 그쪽이 지워진다
	p["fame"] = maxf(float(p.get("fame", 0.0)) + float(out.get("fame_delta", 0)), 0.0)

	# ⚠ **훈련 성장과 같은 자리에 남긴다**(`week_runner.gd:212-215`).
	# 소식이 `training_log`를 읽으므로 따로 두면 경기로 큰 만큼만 안 보인다
	var logs: Array = out.get("logs", [])
	if not logs.is_empty():
		var log: Array = state.get("training_log", [])
		log.append({"day": int(state.get("day", 0)), "gains": logs})
		state["training_log"] = log
	return true
