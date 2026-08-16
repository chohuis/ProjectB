extends RefCounted
class_name DayEngine

## D3 진행기 — 하루 진행 · 정지 조건 · 주 경계. M6-1.
##
## 원본: `usecases/advanceWeek.ts`의 진행 골격
##
## ⚠ **진행 단위가 주 → 일로 바뀌었다** (사용자 결정). 프로는 경기가 거의
## 매일 있는데 주 단위로 진행하면 **한 번에 여러 경기가 한꺼번에 끝나서**
## 자기 등판을 골라 볼 수 없다. 02 설계 문서도 원래 "경기일·이벤트 발생 시
## 진행 정지"였다(DESIGN.md §209) — 구현만 주 단위였다.
##
## ⚠ **시간 축만 일 단위다.** 성장·훈련·재정·관계는 7일마다 그대로 돈다 —
## 밸런스를 안 건드려야 02 실측값과 대조할 수 있다. 그래서 이 모듈이
## **주 경계를 몇 번 넘었는지**를 세서 알려준다.
##
## 여기는 **뼈대**다. 경기를 직접 돌리지 않고 "오늘 돌릴 경기 목록"과
## "넘은 주 경계 수"를 돌려준다 — 실제 시뮬은 `GameLoop`, 주기 처리는
## `TrainingGrowth`·`Aging`이 한다. 화면과 시뮬 사이에 계산을 두지 않는다.


## 컨디션 문턱 셋. **35 미만은 묻지 않고 회피, 55 미만은 묻는다.**
##
## ⚠ **두 값이 붙으면 물어보는 구간이 사라지고, 벌어지면 답이 뻔한 경기까지
## 창을 띄운다.** 사용자가 고를 게 있는 구간만 멈춘다
const COND_AUTO_SKIP: float = 35.0
const COND_ASK: float = 55.0


## 오늘 등판을 어떻게 하나. `play` · `ask` · `skip_*`
##
## ⚠ **순서가 있다.** 학사 경고 → 부상 → 컨디션. 학사 경고를 뒤로 미루면
## 그 판정 자리에서 부르는 해제(`clear_eligibility_block`)를 못 해서 다음
## 경기에도 남는다
static func appearance_gate(p: Dictionary) -> String:
	if p.get("eligibility_blocked", false):
		return "skip_academic"
	if p.get("injury", null) != null:
		return "skip_injury"

	var cond: float = p.get("condition", 100.0)
	if cond < COND_AUTO_SKIP:
		return "skip_condition"
	if cond < COND_ASK:
		return "ask"
	return "play"


## 오늘 멈춰야 하나. 멈출 이유(사전) 또는 `null`.
##
## ⚠ **순서가 곧 우선순위다.** 이미 쌓인 pending → 은퇴 → 시즌 끝 →
## 미결정 메시지 → 주인공 경기.
##
## 미결정 메시지가 경기보다 **먼저**인 게 중요하다 — 답을 안 한 결정이
## 남았는데 경기로 넘어가면 그 결정은 영영 못 한다
static func stop_reason(s: Dictionary):
	# ⚠ **대기줄은 `Pending`이 정본이다.** 여기서 키를 직접 읽으면 넣는 쪽과
	# 읽는 쪽이 갈릴 수 있다 — 갈리면 물어보지 않은 결정이 조용히 남는다
	var head: Dictionary = Pending.next(s)
	if not head.is_empty():
		return head

	var p: Dictionary = s.get("protagonist", {})
	if p.get("retired", false):
		return {"type": "retired"}

	var day: int = s.get("day", 0)
	if day >= int(s.get("season_days", 0)):
		return {"type": "season_end"}

	for m in s.get("mailbox", []):
		var d = m.get("decision", null)
		# ⚠ `decision`이 없는 소식은 결정할 게 없는 소식이다 — `null`인
		# `selected`와 헷갈리면 일반 소식마다 멈춘다
		if d == null or d.get("selected", null) != null:
			continue
		# ⚠ **모든 선택지가 날을 막지는 않는다.** 코치 리포트(F-8)는 답을
		# 안 해도 다음 주가 온다 — 02도 그렇다(`pendingAction`을 안 민다).
		# 막게 두면 **같은 28일이 22일과 29일로 갈린다**: 04는 주간 처리가
		# 진행이 끝난 뒤 몰려 돌아서, 한 번에 가면 리포트가 나중에 생기고
		# 하루씩 가면 도중에 생긴다
		if not bool(d.get("blocking", true)):
			continue
		return {"type": "message", "message_id": m.get("id", "")}

	for g in s.get("schedule", []):
		if int(g.get("day", -1)) != day:
			continue
		if not g.get("is_protagonist_game", false):
			continue
		# ⚠ **이미 치른 경기는 다시 안 멈춘다.** 안 그러면 경기 화면을 닫아도
		# 같은 날에 도로 멈춰서 무한 루프다
		if g.get("result", null) != null:
			continue
		return {"type": "game", "schedule_id": g.get("id", "")}

	return null


## 다음에 멈추는 날. 없으면 시즌 마지막 날.
##
## "다음 이벤트 전날까지 진행"이 사용자가 정한 방식이라 화면이 이걸 묻는다
static func next_stop_day(s: Dictionary) -> int:
	var day: int = s.get("day", 0)
	var season_days: int = s.get("season_days", 0)
	var best: int = season_days

	for g in s.get("schedule", []):
		var d: int = int(g.get("day", -1))
		if d < day or d > best:
			continue
		if not g.get("is_protagonist_game", false):
			continue
		if g.get("result", null) != null:
			continue
		best = d

	return best


## `from_day`에서 `to_day`로 옮길 때 주기 처리를 몇 번 돌리나.
##
## ⚠ **`Calendar`가 정본이고 여기는 구간만 옮긴다.** 두 군데서 각자 세면
## 한쪽만 고쳤을 때 조용히 갈라진다 — 성장이 2배가 되거나 0이 되는데
## 오류도 로그도 안 난다.
##
## ⚠ **구간이 다르다.** `Calendar.week_ends_between(a, b)`는 **a와 b를 다
## 포함**한다("a일부터 b일까지 처리하는데 그 안에 주말이 몇 번인가"). 진행기는
## `day`가 **아직 안 산 오늘**이라 `to_day`로 옮기며 실제로 사는 날은
## `from_day .. to_day - 1`이다.
##
## 이 한 칸을 안 옮기면 **주 경계에서 쪼갤 때마다 한 번씩 더 센다** —
## 하루씩 간 합이 한 번에 간 것보다 커진다
static func week_boundaries_crossed(from_day: int, to_day: int) -> int:
	return Calendar.week_ends_between(from_day, to_day - 1)


## 넘은 주 경계가 **각각 며칠이었나** — 이른 순서로.
##
## ⚠ **주기 처리가 "몇 번"만으로는 부족하다.** 여러 날을 한 번에 진행하면
## 주 경계를 N번 넘는데, 그때마다 도착한 날짜를 쓰면 **같은 주를 N번 사는
## 것**이 된다 — NPC가 같은 난수·같은 성적 창을 N번 받아서 **하루씩 간 것과
## 결과가 달라진다.** 그 어긋남은 조용하다.
##
## `to_day`는 **아직 안 산 오늘**이다(`advance_to`가 그렇게 준다)
static func week_end_days(to_day: int, weeks: int) -> PackedInt32Array:
	# 0번·음수를 따로 막지 않는다 — 아래 `for`가 안 돈다
	var out := PackedInt32Array()
	# 마지막으로 지난 주 경계 — `to_day - 1`까지 살았다
	var last: int = (to_day - 1) / Calendar.DAYS_PER_WEEK * Calendar.DAYS_PER_WEEK
	for i in weeks:
		out.append(last - (weeks - 1 - i) * Calendar.DAYS_PER_WEEK)
	return out


## 하루 진행. 돌려주는 사전이 곧 다음 상태다.
##
## ⚠ **정지한 날엔 안 넘어간다.** 넘어가면 그 경기를 못 치른 채 지나간다.
## `games_today`는 **오늘 돌릴 NPC 경기**다 — 주인공 경기는 정지가 되므로
## 여기 안 들어온다
static func advance_day(s: Dictionary) -> Dictionary:
	var out: Dictionary = s.duplicate(true)
	# ⚠ **깊은 복사가 주인공 참조를 끊는다.** 안 이으면 로스터 쪽만 자란다
	World.relink_protagonist(out)
	var day: int = out.get("day", 0)

	var stop = stop_reason(out)
	if stop != null:
		out["stopped_by"] = stop
		out["games_today"] = []
		out["weeks_crossed"] = 0
		return out

	# 대회 — **오늘 경기를 모으기 전이다.** 오늘 열리는 대회의 1라운드가
	# 오늘 날짜로 꽂히므로, 뒤로 미루면 그 경기가 하루 늦게 잡힌다.
	#
	# ⚠ **여기 한 곳에서만 부른다.** `DayRunner`가 따로 부르면 두 경로가
	# 갈리고, 그때는 어느 쪽이 맞는지 알 방법이 없다
	TournamentRunner.run(out, day)
	# 독립 생존리그 — 단계를 열고, 끝난 단계를 자르고, 사다리를 세운다.
	# 대회와 같은 이유로 날마다 본다
	SurvivalRunner.run(out, day)

	var games: Array = []
	for g in out.get("schedule", []):
		if int(g.get("day", -1)) == day and g.get("result", null) == null:
			games.append(g)

	out["day"] = day + 1
	out["games_today"] = games
	out["weeks_crossed"] = week_boundaries_crossed(day, day + 1)
	out["stopped_by"] = null
	return out


## 여러 날 진행. 멈출 이유가 나오면 거기서 선다.
##
## ⚠ **하루씩 부른 것과 결과가 같아야 한다.** 특히 `weeks_crossed`는
## **멈춘 날까지만** 센다 — 안 산 날의 성장이 붙으면 조용히 앞서간다
static func advance_to(s: Dictionary, days: int) -> Dictionary:
	var out: Dictionary = s.duplicate(true)
	# ⚠ **깊은 복사가 주인공 참조를 끊는다.** 안 이으면 로스터 쪽만 자란다
	World.relink_protagonist(out)
	var start: int = out.get("day", 0)
	# 음수 일수를 따로 막지 않는다 — 목표가 지금보다 앞이면 루프가 안 돈다
	var target: int = start + days
	var all_games: Array = []
	var stop = null

	while out["day"] < target:
		var before: int = out["day"]
		var step: Dictionary = advance_day(out)
		if step["day"] == before:
			# 멈췄다 — 하루도 안 나아갔다
			out = step
			stop = step["stopped_by"]
			break
		out = step
		all_games.append_array(step["games_today"])

	out["games_today"] = all_games
	out["weeks_crossed"] = week_boundaries_crossed(start, out["day"])
	out["stopped_by"] = stop if stop != null else stop_reason(out)
	return out
