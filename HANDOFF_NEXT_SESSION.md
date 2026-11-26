# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-26 (KST · V2.5-1 Git 충돌 무손실 정렬 + `파트너캠페인관제탑` 1인1행 Strict Upsert·`캠페인접수이력`·중복행 자동병합 + 플로팅 위젯 로그인 연동 + 24시간 전문가 검토 땡큐 페이지 + STEP 5 제출 4중 방어선 완료)
- **기준 버전:** Master PRD V2.5 / `Proposal.html` V2.5 / `Backend_Proxy.gs` V2.5-0 (V2.2~V2.4 As-Built 100% 무손실 보존)
- **본체 프로젝트 완공 목표일:** **2026년 11월 30일(월)** *(개발 팀장님 본체 어드민 내 구글 폼·시트 연동 마감일 **12월 7일**과 별도 구분)*
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`
- **실서버 배포 URL:** `https://anoanong-bot.github.io/gomawartalk-ai-builder/`
- **코드 검증 상태:** 전 파일(10/10) V8 구문 · 보안(비밀키 0건, 금지어 0건, 구형 모델 0건, GAS 백틱 0건, 가짜 기능 0건) · `test_v25_widget_sockets.js` · `test_subindustry_examples.js` · `test_proposal_sim.js` · `test_v23_3.js` · `test_v23_full_e2e.js` **전원 PASS**

---

## 1. 오늘(2026-11-25) 완료된 전체 마일스톤

1. **Phase V2.3-1 — `Backend_Proxy.gs` & 구글 시트 통합 관제탑 구축 *(완료)*:**
   - `setupV23ControlTowerSheet()` 15컬럼 통합 관제탑 시트(`파트너캠페인관제탑`)·상단 모바일 리모컨(1~3행)·드롭다운(`등급`, `세팅확정상태`) 자동 초기화
   - `verifyUserAndQuota`: 카카오싱크 검증, 시트 자동 기록, 등급별 서버단 횟수 강제 카운트(가망고객 누적 2회 / Starter 월 2회 / Pro 월 10회, `YYYY-MM` 월초 자동 리셋)
   - `doGet(action=load_proposal)`(PII 제거), `doGet(action=list_paid)`(`paidOnly=1` 호환, 유료 등급 전용 필터), `doPost(action=confirm_proposal)`(`결제·세팅요청` + 1회 수정메모 + Google Chat `HUMAN_QA_READY` 즉시 알림 + 3회 연속 오류 `CIRCUIT_BREAKER` 로그)
2. **Phase V2.3-2 — `InterviewBot.html` & `engines/RagInterviewEngine.js` *(완료)*:**
   - 카카오싱크 OAuth `?code=` 콜백 자동 감지 & 상단 등급·잔여 횟수 배지(`🎯 무료 체험` / `⭐ Starter` / `👑 Pro`) + 잔여 `0`회 한도 초과 차단 게이트
   - `skip_image_gen: true` 텍스트 5대 탭 전용 생성(이미지 생성 비용 0원) + 등급별 듀얼 트랙 완료 화면 분기
3. **Phase V2.3-4 — `LandingBuilder.html` 유료 전용 필터링 & 수정메모 포스트잇 *(완료)*:**
   - `doGet(action=list_paid&paidOnly=1)` 유료 등급(`Starter`/`Pro`) 전용 필터링 + 상단 `[🚩 95:5 검수 요약 & 고객 1회 수정메모 포스트잇]` 배너 탑재
   - 텍스트 전용 JSON 무오류 로드 + 원클릭 `[🎨 AI 실사 이미지 자동 채우기]` 연결 + 로컬 E2E 브릿지 완결 (V2.2 조종석 코어 100% 보존)
4. **GitHub Pages 실서버 배포 & 카카오 디벨로퍼스·카카오싱크 실전 정렬 *(완료)*:**
   - `https://anoanong-bot.github.io/gomawartalk-ai-builder/` 실서버 배포 완료 및 프론트엔드 GAS 웹 앱 URL·카카오 JS 키 연결, GAS 스크립트 속성 3종(`PROPOSAL_URL`, `BUILDER_URL`, `KAKAO_REDIRECT_URI`) 실서버 반영 완료
   - 카카오 디벨로퍼스 JS SDK Web 도메인·Redirect URI 등록 완료(`starplatform.co.kr` 미사용 레거시 2건 정리)
   - 기존 가입자 재동의 방지 및 `KOE205` 해결을 위해 `account_email` 완전 제거, 활성 필수 동의 5종(`profile_nickname,profile_image,name,phone_number,plusfriends`) 100% 일치화
   - REST API 호출 허용 IP(`220.88.183.131`, `210.95.241.214`) 등록 완료
5. **모바일 인터랙티브 제안서 `Proposal.html` V2.4 최종 고도화 *(완료)*:**
   - **설명 제로 · 고마워톡 순정 신청폼 모달 UI (Step 2):** 흰 모달, `✕`, 굵은 타이틀·안내, 빨간 `* 표시는 필수 질문임`, 구분선, 순수 원형 라디오(`#태그`/`@시트` 문구 배제), 약관 동의 박스(`☑ 모두 동의` / `☑ [필수] 개인정보 수집 및 이용동의 >`), 2열 `취소`/`#9945FF 제출하기` 버튼
   - **플라잉 꼬리표 스탬프 & 컬러 동기화:** Step 2~5 상단 다크 캡슐 고객 상태 바(`👤 체험고객 김민지 님`) + 설문 선택 시 고유 컬러 꼬리표(`🏷️ #꼬리표명`) 비행 부착 애니메이션 + Step 3·4·5 카톡 말풍선 동일 컬러 `🏷️ 맞춤 반영` 하이라이트 + Step 4 전체 설문 꼬리표 칩 0.2초 모핑 즉시 비교
   - **모드 버튼 제거 & 손가락 코치마크(`👆` + 동심원 파동):** `[▶ 자동 시연 / ⏸ 일시정지]` 버튼 제거(스텝 바 우측 아이콘형 `↻`만 유지), 실제 타겟 위 깜빡이는 `👆` 코치마크 스마트 하이브리드 유도(미조작 시 자동 진행 ➔ 터치 즉시 타이머 해제 후 다음 타겟 가이드만 유지)
   - **가드레일 100% 보존:** `?fileId=...` 드라이브 JSON 조회·`?demo=1` 폴백, 하단 `세팅 확정 신청하기` 폼(`confirm_proposal`, 14개 DOM ID, `EDIT_ONCE` 메모, 잠금 배너, `gmt_proposal_confirm` 브릿지), V2.7 실존 기능만 탑재
6. **STEP 3 Q1~Q5 세부 업종 100% 전용 예시 동적 생성 & GAS Gemini 프록시 안정화 *(완료)*:**
   - `InterviewBot.html` & `engines/RagInterviewEngine.js`: STEP 2 흐름 선택 시 `Consult.generateConsultExamplesBatch()`로 Q1~Q5 15개 맞춤 예시를 1회 JSON 프리패치, STEP 3 진입·질문 점프·다음 문항 전환 전체에 타 업종 혼입 0% 보장(로컬 키 없는 환경에서도 `Backend_Proxy.gs` 자동 라우팅)
   - `Backend_Proxy.gs`: `fetchAvailableGeminiModels_()` 비텍스트 모델(`image|vision|audio|tts|live|nano` 등) 제외 + `callGemini_()` 최대 4후보 순차 폴백 + `CacheService` 10분 활성 모델 캐시 + thinking 파트(`!p.thought`) 필터링 + `responseMimeType` 지원
   - `data/GomawartalkManual.js`: `subDomainPacks`에 `church_gathering` / `association_org` / `hobby_club` 3종 완전 분리 (`기독교 집회`·`협회`·`독서/러닝 모임` 폴백 혼입 원천 차단)
7. **자유 입력문 스마트 정제 · 정치/선거 도메인 가드레일 & 모바일 실서버 GAS 빈 응답 근본 해결 *(2026-11-26 완료)*:**
   - `engines/RagInterviewEngine.js` & `InterviewBot.html`: `sanitizeSubIndustryLabel()`(구어체 어미·목표 구절 제거 → 12자 이내 명사 라벨 + `extractedGoal` 분리), 구어체 원문 접두사 결합(`other` 섹터 `sub + ' ' + title`) 완전 제거, AI `{cleanIndustryLabel, extractedGoal, flows}` 파싱 및 STEP 3 Q1 목표 초안 칩 연동
   - `data/GomawartalkManual.js`: `politics_public` 도메인 전용 6대 카톡 흐름(① 지역구·관심 현안별 맞춤 공약 분기형 ② 개소식·출판기념회·간담회 리마인드형 ③ 주간 현장 행보·유튜브 쇼츠 연재형 ④ 시민 정책 제안·우리 동네 민원 접수형 ⑤ 자원봉사·서포터즈 참여 안내형 ⑥ 주요 의정활동·팩트체크 알림형) + 공직선거법 상업 금기어 차단(`cleanPoliticsText`, `전통시장`/`여성의원` 오탐 제외)
   - `Backend_Proxy.gs` (`V2.4-1`): 실서버 `{"ok":true,"reply":""}` 빈 응답 원인(Flash 모델 기본 thinking 토큰 출력 고갈 + 구버전 `parts[0]` 단일 추출) 규명 및 `thinkingConfig: { thinkingBudget: 0 }` 기본 적용 + `maxOutputTokens: 4096` 상향으로 응답 속도 단축 및 JSON 성공률 100% 확보
8. **V2.5 채널톡형 플로팅 위젯 & 모선(Mother-Hub) 3대 외부 플랫폼 소켓 완성 *(2026-11-26 완료)*:**
   - **우측 하단 플로팅 위젯 (`InterviewBot.html` & `Proposal.html`):** 하단 고정 CTA와 비충돌 위치(`bottom: calc(88px + env(safe-area-inset-bottom, 0px)); z-index: 950;`), 2-Tab 바텀시트(`💬 무엇이든 물어보기` / `🚨 1초 화면·문구 제보`) 탑재. `InterviewBot.html` STEP 3 기존 인라인 `#btn-open-qa` 제거 + AI 답변 `[📌 이 내용을 이번 설계에 반영]` 토글 ➔ STEP 5 칩·프롬프트·`pinned_consult_notes` 직결. `Proposal.html` `[✏️ 1회 수정 메모에 담기]` ➔ 하단 14개 확정 폼 DOM ID 무손실 보존 상태로 `EDIT_ONCE` 전환 및 `#confirm-memo-input` 자동 입력.
   - **블랙박스 1초 제보 배관 (`Backend_Proxy.gs` `V2.5-0`):** `action: "report_issue"` 추가. `파트너제보함` 시트 탭 9컬럼 자동 생성·기록 + 사유 1·2(AI 문구 불일치·버튼/화면 오류) 시 `[🚨파트너 현장 제보 도착]` 구글 챗 즉시 푸시(`try-catch`, 백틱 0건).
   - **모선 3대 외부 플랫폼 소켓 (`RagInterviewEngine.js` / `Backend_Proxy.gs` / `LandingBuilder.html`):**
     - Campaign JSON 최상위 슬롯 3종(`source_platform: "NATIVE"`, `credit_balance: null`, `external_mapping: null`) 기본 직렬화 및 레거시 JSON 자동 `"NATIVE"` 폴백.
     - `파트너캠페인관제탑` 시트 A~O 15컬럼·수식·드롭다운 무손실 유지 + 우측 P~R 3컬럼(`연동플랫폼`, `잔여크레딧`, `외부매핑상태`) 자동 확장(`ensureControlExtraColumns_`).
     - `LandingBuilder.html` 외부 플랫폼 어댑터 가드(`source_platform !== "NATIVE"` 시 상단 전용 배너 + 탭 4 자동 활성화, `"NATIVE"` 시 기존 5대 탭 100% 동일).
   - **Part 4 — `InterviewBot.html` 50대+ 시니어 친화 빅폰트 · 텍스트 대청소 · 전면 블러 로딩 전환 개편:**
     - **전면 블러 로딩 오버레이 (`#global-loading-overlay`, `blur(8px)`, `z-index: 2000`):** 카카오 로그인·인증 확인, STEP 1→2 흐름 생성, STEP 2→3 Q1~Q5 준비, STEP 5 제안서 생성 등 모든 전환 구간에서 뒷화면 터치를 잠그고 대형 스피너 + `21px` 제목 + `10px` 실시간 게이지 바(`0%→92%→100%`) 표시 후 완전 준비 시점에만 해제.
     - **상단 1줄 슬림 헤더 & 첫 화면 인트로 개편:** `텍스트 5대 탭 무료 설계` 내부 용어 및 중복 배지·영어 `STEP N/5` 제거, `[← 이전]` | 정제 업종명(`16px`) | `[처음부터]` + 한글 대형 위치(`질문 1 / 5` 등) + `8px` 진행 바 압축, 첫 화면 `'AI'` 표현 제거(`💬 고마워톡 맞춤 캠페인 설계`) 및 `60px`/`19.5px` 카카오 버튼 확대.
     - **50대+ 빅폰트 & 군더더기 해설 제거:** 질문 `22px`, 흐름 제목 `19.5px`(태그 2개 단순화), 예시 카드 `17.5px` + `[이 내용 채우기]` 버튼(`15.5px`), 입력창 `18px`, 하단 CTA `60px`/`19px` 확대 및 `#q-usage-hint` 기획자 해설 비노출 처리.
9. **V2.5-1 관제탑 1인 1행 무결성 · 위젯 로그인 노출 제어 · 24시간 검토 땡큐 페이지 · STEP 5 제출 4중 방어선 *(2026-11-26 완료)*:**
   - **Git 충돌 무손실 정렬:** 로컬 Part 1~4 코드 100% 보존 상태로 `origin/master` 분기 병합 완료(충돌 마커 0건, 이후 `--amend` 금지 및 일반 신규 커밋 원칙 적용).
   - **`Backend_Proxy.gs` 1인 1행 Strict Upsert & 아카이빙:** `파트너캠페인관제탑`에서 `kakao_user_id`(보조: `01000000000` 제외 유효 전화번호) 기준 무조건 1인 1행 제자리 업데이트(관리자 지정 `F열 등급` 절대 초기화 금지), 회차별 제안서·JSON 링크는 12컬럼 보조 탭 `캠페인접수이력`에 건별 기록(`confirm_proposal`·`load_proposal` 양쪽 탭 완벽 지원), `deduplicateControlTowerRows_()`로 기존 중복 행 자동 병합 정리(최고 등급·실제 횟수·통합 로그, GAS 백틱 0건).
   - **`InterviewBot.html` 플로팅 위젯 로그인 연동:** 로그인 전 첫 화면·한도 차단 화면·전면 블러 로딩 중에는 `#flt-launcher`/`#flt-sheet-backdrop`을 `display: none !important`로 완전 숨김, 로그인 완료 후 본 컨설팅(STEP 1~5·땡큐 페이지)에서만 노출(`syncFloatingWidgetVisibility()`).
   - **`InterviewBot.html` 24시간 전문가 검토 땡큐 페이지:** 고객 완료 화면에서 `[제안서 바로 보기]` 및 `Proposal.html` 링크 100% 제거(어드민 시트/드라이브/구글챗 배관은 유지), 첫 화면 3번 요약 `전문가 검토 후 24시간 내 카톡 발송` 교체, 3단계 로딩 연출 ➔ 3단계 시각 프로세스 바(2단계 펄스 강조) + `18.5px` 발송 안내 + `[처음 화면으로 돌아가기]` 버튼 완성.
   - **`InterviewBot.html` STEP 5 제출 4중 방어선:** 요약 완료 전 버튼 잠금(`ST.isSummaryLoading`), 중복 실행 차단 & `ST.summaryPromise` 직렬 대기(`ST.isSubmitting`/`ST.isSubmitted`), 시퀀스 번호(`ST.genSeq`) 기반 지연 콜백 덮어쓰기 차단, 통신 오류 시 로딩 해제 및 `'🔄 다시 제출하기'` 100% 복구.

---

## 2. 투트랙(Two-Track) 사업 포지셔닝 & 일정 기준

- **본체 완공 목표일:** **2026년 11월 30일(월)** *(개발 팀장님의 고마워톡 본체 어드민 내 구글 폼·시트 기본 연동 마감일 **12월 7일**과 명확히 구분)*
- **Track A (고마워톡 본체 정식 구독):** 연 24만 원(Starter) / 연 40만 원(Pro) + 알림톡 6.5~8.5원 도매 단가, 어드민 내 구글 폼·시트 기본 연동 포함 전 기능 제공.
- **Track B (독자 외부 스토어 공식 앱 — 선불 크레딧 종량제):** 가입비 0원 + 건당 50원 선불 크레딧, 비구독 체험·소량 수요층 전용. 11/30 본체 완공 직후 대표님 보유 소스로 **Wave 1 구글 폼·시트 공식 부가기능**부터 착수하며 본체 탭 4·5 시나리오 생성 모듈과 조종석 3대 소켓을 100% 재사용.

---

## 3. 11/27~11/30 본체 최종 완공 백로그 (Next Priority Checklist)

1. **[P0 · 긴급 해결] 카카오 로그인 `phone_number` `01000000000` 폴백 케이스 정밀 파싱:**
   - [ ] `Backend_Proxy.gs`에서 카카오 사용자 정보 응답(`kakao_account.phone_number` 국제번호/하이픈 포맷 및 권한 미반환 케이스) 파싱 로직과 시트 기록 과정을 정밀 진단해 `01000000000` 폴백 발생 원인 완전 해소
2. **[P0 · 인프라 영구 해결] 모바일 접속 시 카카오 REST API 호출 서버 유동 IP(`-401`) 영구 해결:**
   - [ ] Google Apps Script(`UrlFetchApp`) 아웃바운드 유동 IP 특성으로 인해 모바일 접속 시 카카오 REST API `-401` 차단이 발생하는 이슈의 영구 해결책 적용(허용 IP 정책 정리 또는 고정 프록시/인증 흐름 확정)
3. **[P1 · 배포 반영] 로컬 커밋 원격 Push & GAS 웹 앱 V2.5-0 재배포:**
   - [ ] GitHub Desktop에서 로컬 커밋을 `origin/master`로 Push (`InterviewBot.html`, `Proposal.html`, `LandingBuilder.html`, `engines/RagInterviewEngine.js`, `PRD.md`, `HANDOFF_NEXT_SESSION.md` 실서버 반영)
   - [ ] Google Apps Script 편집기에 갱신된 `Backend_Proxy.gs` (`V2.5-0`) 반영 후 `[배포 > 배포 관리 > 새 버전]` 배포 (`report_issue` `파트너제보함` + `파트너캠페인관제탑` P~R 3컬럼 소켓 실서버 적용)
4. **[P1 · 11/30 본체 완공 마감] 모바일 카톡 인앱 E2E 최종 검수:**
   - [ ] **11월 30일(월) 완공 목표:** 실전 스마트폰 카톡 인앱 브라우저에서 `카카오싱크 로그인(실제 전화번호 정상 기록)` ➔ `인터뷰봇 무료 체험 + 플로팅 위젯 Q&A 설계 핀·1초 제보` ➔ `파트너캠페인관제탑(18컬럼)·파트너제보함(9컬럼) 기록` ➔ `Proposal.html V2.5 시뮬레이터 & 1회 수정메모 연동·확정 제출` ➔ `Google Chat 알림 수신` ➔ `LandingBuilder.html 유료 조종석 포스트잇·AI 이미지 채우기`까지 전 구간 E2E 최종 검수 완료
5. **[Post 11/30 · Wave 1 착수] 독자 외부 스토어 공식 앱 (Track B):**
   - [ ] 본체 완공 직후 대표님 보유 소스로 **Wave 1 구글 폼·시트 공식 부가기능(건당 50원 선불 크레딧)** 착수 — 본체 탭 4·5 시나리오 생성 모듈 및 모선 3대 소켓(`source_platform: "GOOGLE_FORMS"`) 그대로 연결
