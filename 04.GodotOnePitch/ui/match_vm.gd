extends RefCounted
class_name MatchVm

## 경기 화면 ViewModel — M7-6e1.
##
## 원본: `pages/match/MatchPage.svelte` (3,220줄)
##
## ⚠ **3,220줄이 된 이유가 화면이 계산을 가져서다.** 이닝·아웃·주자·이름을
## 전부 화면이 직접 읽고 만들었다. 여기서는 사전 하나로 내보낸다.
##
## ⚠ **한 번에 안 옮긴다.** ① 뼈대(여기) ② 스트라이크존·구종 ③ 구장 그림.


const HALF_LABEL: Dictionary = {"top": "초", "bottom": "말"}

## 투구 결과 이름표. **코드를 그대로 찍으면 `HIT_DOUBLE`이 화면에 뜬다.**
##
## ⚠ **엔진이 내는 코드만 적는다.** 처음에 `ERROR`·`POP_OUT`·`SAC_FLY`·`HBP`를
## 넣었는데 엔진은 그런 코드를 안 낸다 — 있는 줄 알고 나중에 그걸 기준으로
## 뭔가를 만들게 된다. 실제 이름은 `FIELDING_ERROR`다.
##
## ⚠ **`MatchResult`의 목록이 정본이다.** 검사가 그 목록을 훑어 이름표가
## 다 있는지 본다 — 하나라도 빠지면 그 순간 화면에 영문 코드가 뜬다
const CODE_LABEL: Dictionary = {
	"STRIKE_SWING": "헛스윙", "STRIKE_LOOK": "루킹", "BALL": "볼",
	"FOUL": "파울", "WALK": "볼넷",
	"HIT_SINGLE": "안타", "HIT_DOUBLE": "2루타", "HIT_TRIPLE": "3루타",
	"HOME_RUN": "홈런",
	# `INPLAY_OUT`은 엔진의 중간값이라 정상 흐름엔 안 오지만, 옛 세이브나
	# 폴백이 낼 수 있어 이름표를 둔다
	"INPLAY_OUT": "인플레이 아웃",
	"GROUND_OUT": "땅볼", "FLY_OUT": "뜬공", "LINE_OUT": "직선타",
	"DOUBLE_PLAY": "병살",
	"FIELDING_ERROR": "실책", "GAME_OVER": "경기 종료",
}


## 모르는 코드도 빈칸이 아니다 — 새 코드가 붙은 걸 알아야 한다
static func code_label(code: String) -> String:
	return CODE_LABEL.get(code, code)


## 아웃 수를 야구식 이닝 표기로. **20아웃은 6.67이 아니라 6.2다**
static func innings_label(outs: int) -> String:
	return "%d.%d" % [outs / 3, outs % 3]


## `ctx`는 화면이 모르는 바깥 정보 — 팀 이름·선수 이름·로그
static func build(s: Dictionary, ctx: Dictionary = {}) -> Dictionary:
	var names: Dictionary = ctx.get("names", {})
	var score: Dictionary = s.get("score", {})
	var count: Dictionary = s.get("count", {})
	var runners: Dictionary = s.get("runners", {})
	# ⚠ **투수 줄이 팀별로 나뉘어 있다.** `pitcher_line` 하나를 읽으면
	# 24구를 던져도 0으로 뜬다 — 실제로 화면에서 그렇게 나왔다.
	# 내 팀이 어느 쪽인지는 `ctx`가 알려준다
	var side: String = ctx.get("my_side", "home")
	var line: Dictionary = _my_line(s, side, String(ctx.get("my_id", "")))

	var home: int = int(score.get("home", 0))
	var away: int = int(score.get("away", 0))
	var finished: bool = s.get("is_finished", false)
	var home_name: String = ctx.get("home_name", "홈")
	var away_name: String = ctx.get("away_name", "원정")

	# ⚠ **빈 사전이 주자 없음이다.** 02는 `null`과 `{}`를 섞어 써서
	# 한쪽만 보면 주자가 사라졌다
	var on1: bool = not _empty(runners.get("first", {}))
	var on2: bool = not _empty(runners.get("second", {}))
	var on3: bool = not _empty(runners.get("third", {}))

	var outs: int = int(line.get("outs", 0))
	var inning: int = int(s.get("inning", 1))
	var balls: int = int(count.get("balls", 0))
	var strikes: int = int(count.get("strikes", 0))

	return {
		"home_name": home_name, "away_name": away_name,
		"home_score": home, "away_score": away,

		# ⚠ **연장은 상한을 넘는다.** 상한으로 자르면 10회가 9회로 뜬다
		"inning": inning,
		"inning_label": "%d회%s" % [inning, HALF_LABEL.get(s.get("half", "top"), "초")],

		"balls": balls,
		"strikes": strikes,
		"count_label": "%d-%d" % [balls, strikes],
		"outs": int(s.get("outs", 0)),

		"on_first": on1, "on_second": on2, "on_third": on3,
		"bases_label": _bases(on1, on2, on3),

		# ⚠ **이름을 화면이 찾지 않는다.** id만 주면 화면이 로스터를 뒤져야
		# 하고, 그게 02에서 화면이 계산을 갖게 된 경로다
		"batter_name": _name_of(names, s.get("batter", {})),
		"pitcher_name": _name_of(names, s.get("pitcher", {})),

		"pitcher_ip": innings_label(outs),
		"pitcher_k": int(line.get("k", 0)),
		"pitcher_bb": int(line.get("bb", 0)),
		"pitcher_h": int(line.get("h", 0)),
		"pitcher_er": int(line.get("er", 0)),
		"pitcher_pc": int(line.get("pc", 0)),
		"pitcher_line_label": "%s이닝 %dK %dBB %dH %d자책" % [innings_label(outs),
			int(line.get("k", 0)), int(line.get("bb", 0)),
			int(line.get("h", 0)), int(line.get("er", 0))],

		"is_finished": finished,
		# ⚠ **끝난 경기에 던지면 기록이 계속 쌓인다**
		"can_pitch": not finished,

		# ⚠ **주인공이 마운드에 있을 때만 공을 고른다.** 상대가 던질 땐
		# 고를 게 없는데 선택 화면이 뜨면 내가 던지는 줄 안다
		"is_my_pitch": not finished and not String(ctx.get("my_id", "")).is_empty() \
			and String(s.get("pitcher", {}).get("id", "")) == String(ctx.get("my_id", "")),
		"pitch": PitchVm.build(ctx.get("me", {}), ctx.get("selection", {})),

		"result_label": "" if not finished else "%s %d : %d %s" % [
			home_name, home, away, away_name],

		# ⚠ **구장은 홈 팀이 정한다.** 02는 프로 구장 하나가 하드코딩이라
		# 고교 경기도 대학 경기도 전부 프로 구장에서 열렸다
		"park": ParkVm.build(String(ctx.get("stadium_id", ""))),

		# ⚠ **누구를 상대하는지 첫 공 전에 보여준다** (F-5). 04는 "지금 무슨
		# 일이 벌어지는가"는 다 보여주는데 상대 타자가 이름 한 줄이라
		# 승부처인지 아닌지를 알 수가 없었다. 던지기 시작하면 사라진다
		"briefing": BriefingVm.build(s, ctx),

		"log": ctx.get("log", []),
	}


static func _name_of(names: Dictionary, player: Dictionary) -> String:
	var id: String = player.get("id", "")
	return names.get(id, id)


static func _empty(v) -> bool:
	return v == null or not (v is Dictionary) or (v as Dictionary).is_empty()


## `2·3루`처럼 붙여 쓴다 — 02와 같은 표기
static func _bases(on1: bool, on2: bool, on3: bool) -> String:
	if on1 and on2 and on3:
		return "만루"
	var nums: Array = []
	if on1:
		nums.append("1")
	if on2:
		nums.append("2")
	if on3:
		nums.append("3")
	if nums.is_empty():
		return "주자 없음"
	return "·".join(PackedStringArray(nums)) + "루"


## 화면에 보일 투수 줄.
##
## ⚠ **교체가 붙은 뒤로 줄이 큐 안에 있다.** 팀 줄(`home_pitcher_line`)만
## 읽으면 40구를 던져도 0으로 뜬다 — 실제로 그렇게 나왔다.
##
## ⚠ **내 줄을 우선한다.** 내가 던진 뒤 교체됐어도 화면엔 내 성적이 남아야
## 한다 — 지금 마운드에 선 사람 줄을 보여주면 내 기록이 사라진다
static func _my_line(state: Dictionary, side: String, my_id: String) -> Dictionary:
	var q: Dictionary = state.get("%s_queue" % side, {})
	var lines: Array = q.get("lines", [])

	if not my_id.is_empty():
		for l in lines:
			if String(l.get("player_id", "")) == my_id:
				return l

	# 내가 안 던졌으면 지금 마운드에 선 사람 것
	var i: int = int(q.get("current", 0))
	if i < lines.size():
		return lines[i]

	# 큐가 없으면 예전 경로 — 조각 검사가 그대로 돈다
	return state.get("%s_pitcher_line" % side, state.get("pitcher_line", {}))
