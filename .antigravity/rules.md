# Antigravity Workspace Rules — 고마워톡 AI 캠페인 빌더

## 영구 자동 동기화 규칙
1. **커밋 전 `HANDOFF_NEXT_SESSION.md` 자동 갱신:** 모든 `git commit` 실행 전 `HANDOFF_NEXT_SESSION.md`에 최신 완료 내역과 다음 체크리스트를 반영해 함께 커밋한다.
2. **설계 변경 시 `PRD.md` 즉시 핀셋 동기화:** 레이아웃, JSON 스키마, 인증 게이트, AI 모델/프롬프트 정책이 변경되면 `PRD.md`의 해당 섹션을 즉시 최신화한다.
3. **`"마감"` 트리거:** 사용자가 `"마감"`을 입력하면 (1) 전수 QA 점검(문법·금지어·구형 모델명 0건) → (2) `PRD.md` 전체 역방향 동기화 → (3) `HANDOFF_NEXT_SESSION.md` 갱신 → (4) 마감 Git 커밋을 자동 수행한다.

## 핵심 불변식
- 로컬 PC 탐색기(`file://`) 더블클릭 실행 100% 호환 유지 (`window.*` 전역 모듈).
- 알림톡 금지어(`\uB274\uC2A4\uB808\uD130`) 및 구형 모델명(`gemini-1.5-*`, `gemini-2.0-*`, `gemini-2.5-*`) 사용 금지 (`gemini-3.8-flash` + `/v1beta/models` 동적 폴백 유지).
- `LandingBuilder.html` 탭 2의 1열 풀와이드(`888px`) 및 `44px+` 본문 / `36px+` 하한선, 가짜 헤더·하단 버튼 금지 규격 절대 보존.
- `InterviewBot.html`의 선(先) 카카오 파트너 인증 게이트(`verifyPartner`) 및 실배포 시 관리자 버튼 숨김 원칙 준수.
