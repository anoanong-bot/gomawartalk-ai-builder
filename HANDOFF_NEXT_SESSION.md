# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-25 10:50 (KST · Master PRD V2.3 확장 명세 문서화 완료)
- **기준 버전:** Master PRD V2.3 (`PRD.md` V2.2 As-Built 100% 보존 + 9장 V2.3 카카오싱크 퍼널 & 모바일 제안서 명세 확정)
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`
- **코드 기준 상태:** V2.2 As-Built 완료 (`dead160`), 본 커밋은 문서(`PRD.md`, `HANDOFF_NEXT_SESSION.md`) 전용 업데이트

---

## 1. 완료된 기능 요약 (V2.2 As-Built 코드 + V2.3 마스터 설계 확정)

### ① V2.2 As-Built 구현 완료 (검증 통과 · 콘솔 에러 0건)
- **5단계 컨설턴트 파트너 봇 (`InterviewBot.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`):**
  - Step 1(6대 분야 + 7번째 기타 업종 + 자동 스크롤 & 헤더 배지 동기화) ➔ Step 2(세부 업종 전용 6대 플로우 AI 번역/키워드 분리 폴백 + 3초 스캔 아코디언 + 1줄 화살표 Flow Pill + BEST 배지 + 상단 AI 추천 배너 + 재터치 즉시 진행) ➔ Step 3(중앙 집중형 Tap-to-Edit 주관식 + 실시간 불가 기능 검문소 + 분리된 기능 Q&A 모달) ➔ Step 4(무로고 안심 UX + 로고/컬러/실사 최대 3장) ➔ Step 5(히어로 여정 카드 + 5줄 슬림 아코디언 인라인 수정 + 긍정 브랜드 요약 바) + 전 단계 공용 `Sticky Bottom CTA`
- **대표님 전용 조종석 (`LandingBuilder.html`):**
  - 탭 2 탈(脫) AI 에디토리얼 디자인(`1,000px` 1열 풀와이드 `888px`, `44px+`/`36px+` 하한선), 로고 이미지 + 무로고 타이포 텍스트 로고(`38px`) 이중 연동, 파트너 첨부 실사 최우선 배치 + 빈 슬롯 AI 실사 자동 생성(Shimmer 로딩)
- **AI 모델 정책:** `gemini-3.8-flash` 기본 + `/v1beta/models` 실시간 동적 탐색 폴백 (구형 모델·금지어·API 키 하드코딩 0건)

### ② V2.3 확장 명세 문서화 완료 (`PRD.md` 제9장)
- **5대 핵심 축 정식 명문화:** ① 고마워브라더 카카오싱크 인증 일원화 & 등급별 횟수 제한(`가망고객` 누적 2회 / `Starter` 월 2회 / `Pro` 월 10회) ② 원소스 멀티뷰 & API 원가 낭비 제로(제출 시 텍스트 5대 탭 JSON만 생성, 이미지 생성 보류) ③ `Proposal.html` 모바일 세로형 4단 매출 시뮬레이션 제안서(고마워톡 자체 영업 채널 알림톡 발송) ④ 채팅 응대 0초 무인 확정 폼(1칸 수정 메모 + Google Chat `HUMAN_QA_READY` / `CIRCUIT_BREAKER`) & 유료 파트너 사후 수정 방어 규정 ⑤ Phase V2.3-1 ~ V2.3-4 단계별 시공 로드맵

---

## 2. 다음 세션 최우선 작업 순서 (V2.3 단계별 시공 & 온라인 개통 로드맵)

1. **Phase V2.3-1 — `Backend_Proxy.gs` & 통합 관제탑 시트 스키마 확장:**
   - [ ] 카카오싱크(`kakao_user_id`, 실명, 전화번호) 검증 및 시트 1행 통합 기록(상단 2~3행 모바일 리모컨 호환)
   - [ ] `tier`(`가망고객`/`Starter`/`Pro`) 기반 서버단 횟수 강제 카운트(가망고객 누적 2회, Starter 월 2회, Pro 월 10회, 매월 1일 자동 초기화)
   - [ ] `confirm_proposal` 액션(세팅확정상태·1회 수정메모 저장 + Google Chat `HUMAN_QA_READY` 웹훅) 및 3회 연속 에러 `CIRCUIT_BREAKER` 로그 구현
   - [ ] 조종석용 `doGet?action=list&paidOnly=1` 유료 등급 전용 필터링 및 `제안서 고유URL` 자동 생성
2. **Phase V2.3-2 — `InterviewBot.html` 카카오싱크 & 등급/잔여 횟수 배지 연동:**
   - [ ] 카카오싱크 로그인 연동 및 상단 등급·잔여 횟수 배지 표시, 한도 초과 시 도입 안내 & 결제 CTA 게이트 구현
   - [ ] 제출 완료 시 가망고객(제안서 안내) vs 유료 파트너(조종석 직행 접수) 분기 UX 적용 (이미지 생성 보류 유지)
3. **Phase V2.3-3 — `Proposal.html` 모바일 세로형 4단 매출 시뮬레이션 제안서 신규 구축:**
   - [ ] 드라이브 JSON 실시간 주입(추가 AI 호출 0원) + 모바일 풀스크린 세로형 4단 구성(1단 신청페이지·태그 자동화 / 2단 카톡 말풍선 간격발송 시뮬레이션 / 3단 날짜발송 핀셋 타격·독점 가치 / 4단 이미지 블러·전문가 세팅 배지)
   - [ ] 하단 무인 확정 폼(요금제 선택 + 그대로 세팅 vs 1칸 수정 메모 ➔ `confirm_proposal` 제출) 구현
4. **Phase V2.3-4 — `LandingBuilder.html` 유료 등급 필터링 & 수정메모 포스트잇 연동 + 실전 온라인 개통:**
   - [ ] 유료 등급(`Starter`/`Pro`) 전용 접수 목록 필터링 및 상단 `[🚩 레드플래그 요약 뷰 + 고객 수정메모 포스트잇]` 패널 연동
   - [ ] 구글 시트/드라이브·`Backend_Proxy.gs` 웹앱 배포 ➔ 카카오 디벨로퍼스 도메인 등록 & GitHub Pages 실전 온라인 개통
