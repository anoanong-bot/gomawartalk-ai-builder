# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-25 13:50 (KST · Phase V2.3-1 백엔드 확장 및 통합 관제탑 시트 스키마 구축 완료)
- **기준 버전:** Master PRD V2.3 (`PRD.md` V2.2 As-Built 100% 보존 + 9장 V2.3 확장 명세 동기화 완료)
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`
- **코드 기준 상태:** Phase V2.3-1 완료 (`Backend_Proxy.gs` 확장 + V8 구문/10대 단위 테스트 전원 통과, 프론트엔드 파일 미변경)

---

## 1. 완료된 기능 요약 (V2.2 As-Built + Phase V2.3-1 완료)

### ① Phase V2.3-1 완료 (`Backend_Proxy.gs`)
- **GAS 안전 문법 & V2.2 무결성 보존:** 백틱 0건(표준 큰따옴표 `"` + `+` 결합), 금지어 0건, 구형 모델명 0건, 기존 `gemini-3.8-flash` + `/v1beta/models` 동적 탐색 폴백, 중괄호(`{ ~ }`) 안전 JSON 추출, 드라이브 `[파트너접수함]` JSON 저장, `try-catch` 회로 차단기 100% 보존.
- **통합 관제탑 시트 자동 초기화 (`setupV23ControlTowerSheet`):** 상단 1~3행 모바일 리모컨 대시보드 + 4행 15컬럼 표준 헤더 + 5~1000행 텍스트 서식(`@`) 및 드롭다운(`등급`: 가망고객/Starter/Pro, `세팅확정상태`: 미확인/결제·세팅요청/세팅완료) 자동 세팅, 기존 V2.2 시트 안전 백업 지원.
- **카카오싱크 인증 & 등급별 서버단 횟수 강제 검증 (`verifyUserAndQuota`):** `KAKAO_REST_API_KEY` 기반 인가코드/액세스토큰 검증 + 서명 세션 토큰(`userToken`) 발급 + 로컬(`localhost`/`file://`/`?admin=1`) 프리패스 유지. 가망고객(누적 2회), Starter(월 2회, `YYYY-MM` 자동 리셋), Pro(월 10회, `YYYY-MM` 자동 리셋) 서버단 강제 차단 및 `LockService` 동시성 보호.
- **신규 API 3종 완비:**
  - `doGet(action=load_proposal&fileId=...)`: 드라이브 JSON 로드 후 고객 전화번호·이메일·식별자 등 민감 PII 제거 반환
  - `doGet(action=list_paid)` (및 `action=list&paidOnly=1` 호환): 시트 `등급`이 `Starter`/`Pro`인 유료 행만 필터링하여 `고객1회수정메모`와 함께 반환
  - `doPost(action=confirm_proposal)`: `Proposal.html` 무인 확정 폼 접수 ➔ `세팅확정상태="결제·세팅요청"` & 1회 수정 메모 기록 ➔ Google Chat `HUMAN_QA_READY` 즉시 알림 발송 + 3회 연속 오류 `CIRCUIT_BREAKER` 로그 기록

### ② V2.2 As-Built 구현 완료 (회귀 없음)
- **5단계 컨설턴트 파트너 봇 (`InterviewBot.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`)**
- **대표님 전용 조종석 (`LandingBuilder.html`, `WebzineBuilder.html`, `engines/ImageCapturer.js`, `data/*`)**

---

## 2. 다음 세션 최우선 작업 순서 (V2.3 잔여 단계 시공 & 실전 온라인 개통)

1. **Phase V2.3-1 — `Backend_Proxy.gs` & 통합 관제탑 시트 스키마 확장:** *(완료)*
   - [x] `setupV23ControlTowerSheet()` 15컬럼 통합 관제탑 시트·모바일 리모컨·드롭다운 자동 초기화
   - [x] `verifyUserAndQuota`: 카카오싱크(`kakao_user_id`, 실명, 전화번호) 검증 및 등급별 서버단 횟수 강제 카운트(`YYYY-MM` 월초 자동 리셋)
   - [x] `confirm_proposal` 액션(세팅확정상태·1회 수정메모 저장 + Google Chat `HUMAN_QA_READY` 웹훅) & 3회 연속 에러 `CIRCUIT_BREAKER` 로그
   - [x] `doGet(action=load_proposal)`(PII 제거) & `doGet(action=list_paid)`(`paidOnly=1` 호환) 유료 등급 전용 필터링 + 제안서 고유 URL 생성
2. **Phase V2.3-2 — `InterviewBot.html` 카카오싱크 & 등급/잔여 횟수 배지 연동:**
   - [ ] 카카오싱크 로그인 연동(`verifyUserAndQuota` 호출) 및 상단 등급·잔여 횟수 배지 표시, 한도 초과 시 도입 안내 & 결제 CTA 게이트 구현
   - [ ] 제출 완료 시 가망고객(제안서 링크 안내) vs 유료 파트너(조종석 직행 접수) 분기 UX 적용 (이미지 생성 보류 유지, 로컬 프리패스 100% 보존)
3. **Phase V2.3-3 — `Proposal.html` 모바일 세로형 4단 매출 시뮬레이션 제안서 신규 구축:**
   - [ ] `doGet?action=load_proposal&fileId=...` 드라이브 JSON 실시간 주입(추가 AI 호출 0원) + 모바일 풀스크린 세로형 4단 구성
   - [ ] 하단 무인 확정 폼(요금제 선택 + 그대로 세팅 vs 1칸 수정 메모 ➔ `confirm_proposal` 제출) 구현
4. **Phase V2.3-4 — `LandingBuilder.html` 유료 등급 필터링 & 수정메모 포스트잇 연동 + 실전 온라인 개통:**
   - [ ] `doGet?action=list_paid` 유료 등급(`Starter`/`Pro`) 전용 접수 목록 필터링 및 상단 `[🚩 레드플래그 요약 뷰 + 고객 수정메모 포스트잇]` 패널 연동
   - [ ] 구글 시트/드라이브·`Backend_Proxy.gs` 웹앱 배포(`setupV23ControlTowerSheet` 1회 실행 및 스크립트 속성 등록) ➔ 카카오 디벨로퍼스 도메인 등록 & GitHub Pages 실전 온라인 개통
