[Common_Personnel 폴더 안내]

목적
- 감독/코치/선수 등 모든 인물 데이터가 공유하는 능력치 구조를 정의한다.
- Stage(고교/대학/독립/프로 등)에 관계없이 동일한 템플릿을 사용하며, 차이는 수치/태그 값으로 표현한다.

구조
- Manager_Template.txt : 감독/코치 공통 양식
- Player_Template.txt  : 선수 공통 양식(기본 Physical/Mental + 포지션 세부능력)
- Attribute_Guide.txt  : 공통 능력치 카테고리/태그 정의
- (선택) Stage_* 폴더 : 각 Stage에서 템플릿을 인스턴스화할 때 사용하는 샘플/목록

가시 능력 vs 히든 능력
- 템플릿 상단의 Physical/Mental/Technical 항목은 사용자에게 노출될 수 있는 가시 능력이다.
- 각 템플릿 하단의 Hidden Attributes 섹션에는 Professionalism, Ambition 등 내부 판정용 값을 기록하며, 기본적으로 UI에 노출하지 않는다.
- Hidden 값은 1~100 점수로 입력하고, 내러티브/AI 판단/이벤트 조건에 활용한다.

작성 원칙
1) 기본 능력치(Basic Attributes)는 모든 인물에 공통 적용
   - Physical Core : 체력, 근력, 회복력 등 신체 지표 요약
   - Mental Core   : 멘탈, 집중력, 전술 이해, 리더십 등 정의
2) 역할/포지션별 세부 능력치는 공통 분류를 재사용
   - 예) Manager → Strategy / Development / Motivation / Discipline
   - 예) Pitcher → Velocity / Command / Movement / Stamina / Arsenal
3) Stage별 특성은 템플릿 하단의 “Stage Modifiers” 섹션에서 태그로 표현하고, 구체 내용은 해당 Stage 문서에 링크한다.
4) 수치 시스템(등급/포인트)은 별도 밸런스 문서를 통해 정의하되, 이 폴더에는 서술형 + 태그형 기록을 우선 채운다.

추천 워크플로우
1) Common_Personnel에서 템플릿을 복사해 Stage 전용 폴더(예: Stage_Rules/HighSchool/Personnel_Instances) 등에 둔다.
2) 학교/팀/연도 단위로 인물 데이터를 채울 때도 공통 필드 구조를 유지한다.
3) 새로운 능력치가 필요하면 Attribute_Guide를 먼저 업데이트한 뒤 템플릿에 반영한다.
