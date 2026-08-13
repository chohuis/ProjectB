extends RefCounted
class_name MatchResult

## 투구 결과 — 분류·문구·색의 **단일 정본**.
##
## 원본: `02.SvelteElectron/apps/ui/src/shared/utils/matchResult.ts`
##
## ⚠ **원본은 같은 표가 네 군데에 따로 있었다** — 엔진 `get_result_comment`,
## 화면 `showResultOverlay`, 화면 `localComment`, Electron `AUTO_SIM_AB_LABEL`.
## 그래서 자동 시뮬은 "삼진"이라 하고 직접 던지면 "헛스윙 스트라이크"가
## 나왔다. 표를 두 번 적으면 반드시 어긋난다.
##
## ⚠ 인플레이 아웃은 `INPLAY_OUT` 하나였다가 넷으로 쪼개졌다. 엔진이 타구
## 종류를 처음부터 정해 놓고도 **결과 코드가 하나뿐이라 화면까지 못 갔다.**
## 코드를 늘릴 때 빠뜨리는 자리가 없도록 분류를 전부 여기 집합으로 판정한다.
##
## 타구 정보(`ball`)는 사전이다: `hit_type` · `zone` · `hardness`.


## `INPLAY_OUT`은 엔진의 중간값이라 정상 흐름에는 안 오지만, 옛 세이브나
## 폴백이 낼 수 있어 남겨 둔다
const OUT_IN_PLAY: Array[String] = [
	"INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY",
]

const HITS: Array[String] = ["HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"]

const STRIKES: Array[String] = ["STRIKE_SWING", "STRIKE_LOOK"]

## 수비 위치 → 사람이 부르는 이름
const POSITION_LABEL: Dictionary = {
	"P": "투수", "C": "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수",
	"SS": "유격수", "LF": "좌익수", "CF": "중견수", "RF": "우익수",
}

const HIT_TYPE_LABEL: Dictionary = {
	"groundBall": "땅볼", "flyBall": "뜬공", "lineDrive": "직선타",
	"popup": "뜬공", "bunt": "번트",
}

## 큰 글자용 — 1.4초 스쳐 지나가므로 짧게
const FLASH_LABEL: Dictionary = {
	"STRIKE_SWING": "헛스윙", "STRIKE_LOOK": "루킹", "BALL": "볼", "FOUL": "파울",
	"INPLAY_OUT": "아웃", "GROUND_OUT": "땅볼 아웃", "FLY_OUT": "뜬공 아웃",
	"LINE_OUT": "직선타 아웃", "DOUBLE_PLAY": "병살!",
	"FIELDING_ERROR": "실책", "WALK": "볼넷",
	"HIT_SINGLE": "안타", "HIT_DOUBLE": "2루타", "HIT_TRIPLE": "3루타",
	"HOME_RUN": "홈런", "GAME_OVER": "경기 종료",
}


# ── 분류 ───────────────────────────────────────────────────────────

static func is_out_in_play(code: String) -> bool:
	return OUT_IN_PLAY.has(code)


static func is_hit(code: String) -> bool:
	return HITS.has(code)


static func is_strike(code: String) -> bool:
	return STRIKES.has(code)


## 타석이 끝났나 — 다음 타자로 넘어가는 결과
static func is_at_bat_over(code: String) -> bool:
	return is_out_in_play(code) or is_hit(code) or code == "WALK" or code == "FIELDING_ERROR"


# ── 문구 ───────────────────────────────────────────────────────────

static func flash_label(code: String) -> String:
	return FLASH_LABEL.get(code, code)


## 로그 한 줄용. 타구 정보가 있으면 **누구 앞으로 갔는지까지** 쓴다.
##
## ⚠ **없는 정보를 지어내지 않는다** — `ball`이 비면 기본 문구 그대로다
static func log_label(code: String, ball: Dictionary = {}) -> String:
	var zone: String = ball.get("zone", "")
	var hit_type: String = ball.get("hit_type", "")
	var who: String = POSITION_LABEL.get(zone, "")

	if code == "DOUBLE_PLAY":
		# ⚠ **"병살타"는 땅볼에만 쓰는 말이다.** 엔진은 직선타에서도 병살을
		# 내는데(잡아서 주자를 묶는 경우) 그때 "중견수 병살타"라고 쓰면
		# 틀린 야구 용어가 된다 — 실제로 화면에 찍혔다
		if hit_type == "lineDrive":
			return "%s 직선타 병살" % who if not who.is_empty() else "직선타 병살"
		return "%s 병살타" % who if not who.is_empty() else "병살타"

	if is_out_in_play(code) and not ball.is_empty():
		var kind: String = HIT_TYPE_LABEL.get(hit_type, "")
		if not who.is_empty() and not kind.is_empty():
			return "%s %s 아웃" % [who, kind]

	# 2·3루타는 엔진이 낙구 지점을 안 준다 — 단타만 방향을 붙인다
	if code == "HIT_SINGLE" and not who.is_empty():
		return "%s 앞 안타" % who

	return FLASH_LABEL.get(code, code)


# ── 색 ─────────────────────────────────────────────────────────────
#
# ⚠ **색 자체는 `AppTheme`이 갖는다.** 여기서는 어느 코드가 어느 뜻인지만
# 고른다. 색을 여기 적으면 톤을 바꿀 때 두 곳을 고쳐야 하고 한 곳이 빠진다.

## 경기 내용 패널 한 줄 — 색과 굵기
static func log_style(code: String) -> Dictionary:
	if code == "HOME_RUN":
		return {"color": AppTheme.BAD, "bold": true}
	if is_hit(code):
		return {"color": AppTheme.BAD, "bold": false}
	if code == "WALK":
		return {"color": AppTheme.WARN, "bold": false}
	# 병살은 삼진보다 더 좋은 일이다 — 아웃 색이 아니라 제 색을 준다
	if code == "DOUBLE_PLAY":
		return {"color": AppTheme.OK, "bold": true}
	if is_strike(code):
		return {"color": AppTheme.OK, "bold": false}
	# 볼·파울은 아무 일도 안 일어난 줄이다 — 눈에 안 걸려야 한다
	if code == "FOUL" or code == "BALL":
		return {"color": AppTheme.TEXT_MUTE, "bold": false}
	if is_out_in_play(code) or code == "FIELDING_ERROR":
		return {"color": AppTheme.TEXT_DIM, "bold": false}
	return {"color": AppTheme.TEXT_DIM, "bold": false}


## 큰 글자 색
static func flash_color(code: String) -> Color:
	if code == "HOME_RUN":
		return AppTheme.FLASH_HOMERUN
	if code == "HIT_TRIPLE":
		return AppTheme.FLASH_TRIPLE
	if is_hit(code):
		return AppTheme.FLASH_HIT
	if code == "DOUBLE_PLAY":
		return AppTheme.FLASH_DP
	if is_strike(code):
		return AppTheme.FLASH_STRIKE
	if code == "FIELDING_ERROR":
		return AppTheme.FLASH_ERROR
	if is_out_in_play(code):
		return AppTheme.FLASH_OUT
	if code == "FOUL":
		return AppTheme.FLASH_HIT
	return AppTheme.FLASH_PLAIN
