# ProjectB 콘텐츠 생성 프롬프트 모음

각 작업 목적에 맞는 프롬프트 파일을 열어서 코드 블록 전체를 Claude/ChatGPT에 붙여넣으세요.

---

## 프롬프트 파일 목록

| 파일 | 용도 |
|---|---|
| [PROMPT_CHARACTERS.md](PROMPT_CHARACTERS.md) | 캐릭터 · 아크 · 메신저 스크립트 · NPC 선수/스태프 · 팀 목록 |
| [PROMPT_ACHIEVEMENTS.md](PROMPT_ACHIEVEMENTS.md) | 업적 생성 |
| [PROMPT_EVENTS.md](PROMPT_EVENTS.md) | 이벤트 · 메시지 템플릿 · 결정 템플릿 |

---

## 콘텐츠 배포 방법

JSON 파일을 `resource/data/staging/` 폴더에 넣은 뒤:

```bash
npm run deploy
```

자동으로 올바른 위치에 배포 + 매니페스트 갱신 + staging 폴더 정리까지 완료됩니다.

개발 서버(`npm run dev`) 실행 중이면 파일 변경 시 자동 감지됩니다.

---

## 빠른 참조 — 주요 enum 값

```
careerStage:  "highschool" | "university" | "pro" | "pro_kbl" | "pro_abl"
category:     "team" | "school" | "personal" | "rival"
eventType:    "mandatory" | "conditional" | "random"
msgCategory:  "system" | "coach" | "manager" | "news"
achCategory:  "baseball" | "growth" | "social" | "hidden"
poolId:       "POOL_SOCIAL_DAILY" | "POOL_MEDIA_WEEKLY" | "POOL_TEAMLIFE_DAILY"
oncePolicy:   "once_ever" | "once_per_season" | "repeatable"
```
