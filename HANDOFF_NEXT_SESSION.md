# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-27 (KST · V3.4 실서버 8대 완성도 패치 완료 — `Proposal.html` 업종별 13종 풀스크린 실사 블러 랜딩 · 중복 내비 삭제/5.0초 컬러 게이지/스크롤 비간섭 전자동 고객 커서 시연 ➔ 클릭 시 수동 체험 · 풀스크린 「하루가 지났습니다」 미수신 재발송 전환 · 하단 통합 컨트롤 도크(`#sim-action-dock`) 3층 일원화 + `InterviewBot.html`/`RagInterviewEngine.js`/`GomawartalkManual.js` STEP 2 주관식 AI 추천 직행 및 원문 보존 · 전환 팝업 실제 입력값 전용 리마인드 & 카카오 단일 심플 연결 화면 · `'첫카톡'`/`'신청화면'` 0건 전수 통일 · `① 신청페이지` vs `② 신청질문` 목적·예시 완전 분리)
- **기준 버전:** Master PRD V3.4 / `InterviewBot.html` V3.4 / `Proposal.html` V3.4 / `LandingBuilder.html` V3.0 / `engines/RagInterviewEngine.js` V3.4 / `data/GomawartalkManual.js` V3.4 / `Backend_Proxy.gs` V2.9-1 (V2.2~V3.3 As-Built 100% 무손실 보존)
- **본체 프로젝트 완공 목표일:** **2026년 11월 30일(월)** *(개발 팀장님 본체 어드민 내 구글 폼·시트 연동 마감일 **12월 7일**과 별도 구분)*
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`
- **실서버 배포 URL:** `https://anoanong-bot.github.io/gomawartalk-ai-builder/`
- **코드 검증 상태:** 전 파일(10/10) V8 구문 · 보안(비밀키 0건, 금지어 0건, 구형 모델 0건, `대표님`/`사장님` 0건, `홍보톡`/`홍보·소식` 0건, `미친추`/`미친구` 0건, `Starter 파트너` 0건, `200만 원`/`300만` 0건, `첫카톡` 0건, `신청화면` 0건, 가짜 로딩 필러 0건, 구형 `20:30` 0건, 타 업종 엉뚱한 폴백 0건, `③ 첫 알림톡` 쿠폰 예시 0건, 본문 내부 `(광고)` 중복 0건, 혜택 앞글자 잘림 0건, 외부 텍스트 캡슐 0건, GAS 백틱 0건, 가짜 기능 0건) · `test_v25_widget_sockets.js`(264/264) · `test_subindustry_examples.js` · `test_proposal_sim.js` · `test_v23_3.js` · `test_v23_full_e2e.js` **전원 PASS**

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
10. **V2.5-2 모바일 실서버 UI 깨짐 · 상호명 필수 입력 · 플로팅 런처 보정 *(2026-11-26 완료, `Backend_Proxy.gs` 변경 없음)*:**
   - **2단계 흐름 카드 제목 세로 꺾임 해결 (`InterviewBot.html`):** 배지 문구를 `🔥 인기 1순위 · 가장 많이 선택`으로 간결화하고 `.flow-eyebrow` 상단 줄로 분리해 아래 카드 제목(`19.5px`)이 가로 폭 100% 사용.
   - **4단계 상호명·브랜드명 직접 입력칸 신설 & `'OOO 대표님'` 폴백 제거 (`InterviewBot.html`, `RagInterviewEngine.js`, `Proposal.html`, `LandingBuilder.html`):** 4단계 최상단 1번 항목(`#brand-name-input`, `18px`, 필수 가드·텍스트 로고 실시간 미리보기, 기존 1~3번 ➔ 2~4번) 신설 및 `meta.brand_name`·`partner_info.channel_name`·`tab1_basic_settings.channel_name`·`Proposal.html` 채널명 최우선 바인딩.
   - **단계 전환 상단 잘림 & 플로팅 런처 간섭 보정 (`InterviewBot.html`):** `goStage()` 즉시 `window.scrollTo(0, 0)` + `padding-top: 26px`, 플로팅 런처 `bottom: calc(124px + env(safe-area-inset-bottom, 0px))` 및 `질문·오류제보` 캡슐 3.5초 후·스크롤 시 자동 접힘.
11. **V2.6 구글 챗 즉시 알림 복구 · 플래그십 슬림 목업 · 순정 카톡 100% 복원 · 동적 발송 주기 & 월간 인터뷰 영상 시뮬레이터 *(2026-11-26 완료)*:**
   - **`Backend_Proxy.gs` (`V2.6-0`):** `handleSubmitCampaign_`(`save_intake` / `submit_campaign`) 시 등급 필터 없이 **전 등급(가망고객 포함) 즉시 `🔔 [신규 인터뷰 접수 — 24시간 내 제안서 검토·발송 대기]` 구글 챗 발송** 복구. 4종 알림 헤더 명확 구분, `getGoogleChatWebhookUrl_()` 다중 속성명(`GOOGLE_CHAT_WEBHOOK_URL` / `GCHAT_WEBHOOK_URL` / `CHAT_WEBHOOK_URL`) 지원, 미등록 시 시트 `O열 로그` 경고 기록, `doGet(action=ping)` `webhookConfigured` 불리언 진단 및 Apps Script 에디터 원클릭 `testGoogleChatWebhook()` 진단 함수 추가(백틱 0건).
   - **`Proposal.html` 플래그십 슬림 목업 & 100% 순정 카카오톡 복원:** 외곽 `332px` 슬림 고정폭(`border-radius: 44px`, 다크 티타늄 메탈릭 더블 베젤 · Dynamic Island · SVG 상태바 · Home Indicator, 내부 `598px` 세로 비율) 적용. 폰 화면 내부에서 상단 고객 태그 바·플라잉 태그·`맞춤 반영` 하이라이트·채팅방 내 조작 버튼 100% 제거, 순정 카톡 헤더·한국어 전체 날짜 캡슐·순정 말풍선·하단 `메시지 입력` 바(`.kk-input-bar`) 100% 복원.
   - **`Proposal.html` 외부 리모컨 · 외부 내비 · 독립 부가 기능 섹션 분리:** 폰 위 `[🎛️ 시뮬레이터 체험 리모컨]`(Step 1 방문자 전환 / Steps 3~5 고객 설문 자연어 버튼 `#ext-branch-pills`, `#태그` 코드 제거), 폰 아래 `[◀ 이전 장면]` / `[다음 발송 장면 보기 ▶]`(손가락 코치마크는 폰 내부 신청/설문 또는 외부 다음 버튼만 지목), 독립 섹션 `#sec-extra-features`(① 미친추 2회 자동 구제 다이어그램 ② 공용 vs Pro 내 로고 알림톡 좌우 비교 + Pro 확정 이동) 분리. 기존 14개 확정 폼 DOM ID 100% 보존.
   - **동적 발송 주기 & 16:9 유튜브 영상 카드 (`engines/RagInterviewEngine.js` & `Proposal.html`):** `+1일/+3일` 하드코딩 폐지, `MONTHLY`(`+1개월 뒤`/`+2개월 뒤`)·`WEEKLY`·`EVENT`·`SHORT` 4대 주기를 스텝 바·타임워프·카톡 날짜 캡슐·타임라인 카드에 동적 반영. 영상·유튜브·월간 인터뷰 캠페인 감지 시 Step 1 16:9 영상 프리뷰 및 Steps 4·5 16:9 유튜브 썸네일 카드 + `[▶ 유튜브에서 영상 바로 보기]` 버튼 자동 렌더링.
12. **V2.7 인터뷰봇 「5단 오픈 코스 UI + 간격/날짜 스마트 선택기 + AI 자동 토스」 및 `Proposal.html` 정각 예약 연동 *(2026-11-26 완료)*:**
    - **고마워톡 실제 5대 탭 1:1 매칭 질문 재설계 (`InterviewBot.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`):** Q1(`① 신청화면`: 대상+핵심 안내·혜택 통합) ➔ Q2(`② 신청질문`: 객관식 질문 + 원터치 패스 칩 `[⏭️ 추가 질문 없이 이름·연락처만 간단히 받기]`) ➔ Q3(`③ 첫카톡`: 1초 환영·접수확인 알림톡) ➔ Q4(`④ 며칠뒤 자동`: 일상 비유 배지 + 간격 프리셋 4종 `1일·3일` / `7일` / `30일` / `건너뛰기`) ➔ Q5(`⑤ 날짜지정`: 일상 비유 배지 + 3대 선택 카드 `1회 예약`/`매월·매주 정기`/`건너뛰기` + `18px` 고대비 달력·시각 픽커). 전 7대 분야 + 6대 세부 업종 팩 정적 폴백 15예시·AI 생성 프롬프트 100% 동기화.
    - **토스식 오픈 캔버스 · 5단 한글 코스 바 · 예고편 버튼 (`InterviewBot.html`):** STEP 3 상단에 추가 면적 소모 없이 **`[① 신청화면] ─ [② 신청질문] ─ [③ 첫카톡] ─ [④ 며칠뒤 자동] ─ [⑤ 날짜지정]`** 5단 한글 코스 바(`✓`/`●`/자유 점프) 탑재, 화이트 오픈 캔버스 + 입력창 상단 우선(Input-First) + 하단 예시 3종(`👇 막막하시면 예시를 눌러 바로 채워보세요`) + 예고편 CTA 버튼(`다음: ② 신청 질문 고르기 →` … `완료 · 브랜드 스타일 입력하기 →`) 구현.
    - **스마트 자동 토스(Auto-Toss) 엔진 (`RagInterviewEngine.js` & `InterviewBot.html`):** Q1~Q3 입력에서 미래 날짜·시각(`"12월 24일 오전 9시 30분..."`), 정기 날짜(`"매달 1일..."`), 간격(`"3일 간격..."`)을 `Consult.autoTossScheduleHints()`로 자동 감지해 Q4/Q5 픽커·초안을 미리 세팅하고 도착 시 안내 배지 노출(사용자 직접 수정 문항은 덮어쓰지 않음).
    - **`Proposal.html` 정각 날짜·시각 100% 동기화:** `meta.schedule_config`(`interval_config`, `date_reservation`) 및 `tab4_interval_messages`·`tab5_date_messages` 저장·연동. Q5 `ONCE`(`2026-12-24 09:30`) / `RECURRING`(`매월 1일 오전 10:00`) 설정 시 스텝 바 라벨(`12/24(목) 09:30 예약` / `매월 1일 10:00`), 타임워프(`🗓️ 지정하신 2026년 12월 24일 오전 9:30 정각 동시 발송`), 순정 카톡 날짜 캡슐(`2026년 12월 24일 목요일`), 말풍선 우측 하단 시각(`오전 9:30`) 100% 일치 렌더링(Q4 건너뛰기+Q5 지정 시 4스텝 직결 지원). 5종 테스트 스위트 전원 PASS.
13. **V2.8 통합 개편 — 고마워톡 실제 기능·카카오 심사 규정·시니어 친화 UI 100% 정렬 *(2026-11-26 완료)*:**
    - **인터뷰봇 4대 교정 (`InterviewBot.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`, `data/AlimtalkTemplates.js`, `data/IndustryPresets.js`):**
      - ① 생동감 있는 모션 로딩 모달(`.loading-motion-stage`) + 윗줄 `「상호명 또는 업종명」` 컬러 캡슐 배지(`#loading-subject-badge`)와 아랫줄 `맞춤 카톡 흐름을 설계하고 있어요` 줄 분리.
      - ② 카카오 야간 발송 제한 정확 교정(`20:30` 전면 제거 ➔ `20:00 ~ 08:00`, 정보성 알림톡 24시간 허용) + 입력 자동 분류 배지(`③ 첫카톡`: 24시간 정보성 알림톡 고정, `④ 며칠뒤 자동`·`⑤ 날짜지정`: 정보성 알림톡 비차단 vs 홍보·소식 카톡 `20:00~07:59` 선택 시에만 전용 대안 카드·원클릭 시각 보정).
      - ③ 알림톡 본문 내 `'채널 추가 유도 문구'` 전수 삭제 및 `stripAlimtalkChannelAddSolicitation` 후처리·AI 프롬프트 차단(카카오 심사 규정 엄수).
      - ④ `⑤ 날짜지정` 미지원 `매월/매주 반복`(`RECURRING`) 전면 삭제 + 기본 1개 `📅 1차 발송 날짜·시각 선택` 카드·`[+ 발송 날짜 하나 더 추가하기]`(초기 최대 3개 슬롯)·건너뛰기·무제한 추가 안심 배지(`#q5-unlimited-notice`) 구현(정기 연재 표현은 `④ 며칠뒤 자동`으로 자동 토스).
    - **제안서 5대 개편 & 관제탑 등급 실시간 연동 (`Proposal.html`, `Backend_Proxy.gs` `V2.8-0`):**
      - ① 밝은 실버·플래티넘 메탈릭 폰 목업(`332px` 슬림 유지) 적용 및 Step 1 `[처음/이미 신청한 고객]` 투머치 토글 완전 삭제.
      - ② 실제 카카오톡 알림톡 UI 100% 재현(노란 `알림톡 도착` 바 + 우상단 원형 `kakao` 배지 + 미친추 시스템 회색 안내 + 최상단 노란 `[Ch+ 채널 추가]` 버튼; 공용 감사 일러스트 배너+1버튼 vs Pro 브랜드 로고 락업 배너+전용 다중 버튼 2~3개).
      - ③ 설문 분기 체감도 극대화: 기계적 반복 문구 퇴출, 보기(A/B/C)별 구체적으로 달라지는 제목·`▶ 맞춤 안내`·버튼 + 상단 리모컨(`🎯 신청폼 선택에 따라 도착하는 카톡이 달라집니다` + 1줄 요약 배지) + 말풍선 포커스 전환 애니메이션.
      - ④ 하단 `#sec-extra-features` 제거로 산만함 해소, 시뮬레이터 `[🛡️ 미친추 고객이면 어떻게 되나요? (자동 구제 체험)]` 폰 내부 3단계 시연 신설, Q&A 상단 칩에 `👑 공용 알림톡 vs Pro 내 로고 맞춤 알림톡 차이`·`문자·일반 카톡과 무엇이 다른가요?` 및 시각적 미니 비교 카드 통합.
      - ⑤ `Backend_Proxy.gs` `handleLoadProposal_` 실시간 `F열 등급`(`liveTier`) 최우선 반환(이전 회차 `fileId` 포함) + `Proposal.html` 14개 DOM ID 보존 3단 분기(`가망고객` 요금 선택 / `Starter` 가입비 숨김+Pro 1줄 업그레이드 토글 / `Pro` 가격·결제·업그레이드 0%+Pro 맞춤 알림톡 자동 적용+전용 2버튼). 5종 테스트 스위트 전원 PASS(144/144 포함).
14. **V2.8.2 원포인트 맞춤 분기 & 용어·레이아웃 정돈 패치 *(2026-11-26 완료)*:**
    - **「단 1개 핵심 회차 × 2종 진짜 맞춤 원고」 (`engines/RagInterviewEngine.js` · `LandingBuilder.html`):**
      - `applyOnePointSpotlightBranch()`로 캠페인당 정확히 단 1개 핵심 단계(기본 `④ 간격발송 2회차`, ④ 미사용 시 `⑤ 날짜발송` 또는 `③ 첫카톡` 1곳)에만 `has_spotlight_branch: true` + `branch_pair: [원고A, 원고B]` 생성, 나머지 모든 회차는 `has_spotlight_branch: false` 공통 단일 원고 1개로 정리(Q2 설문 생략 시 0곳).
      - `[예]`/`[모름]`/`선택하신 「...」 기준에 맞춰`/`신청자 전용 가이드`/`집중 완성 로드맵` 기계식 단어 치환 100% 폐기(`isMechanicalBranchCopy` 가드 + `buildSpotlightBranchPair` 도메인·눈높이별 대비 원고 생성 + AI 프롬프트 강화).
      - `LandingBuilder.html` 조종석에서 공통 회차는 `💬 공통 단일 원고` + `[📋 복사]` 1개, 원포인트 분기 1개 회차에는 **`1순위 [태그: 선택지A] 맞춤 원고 복사`** ↔ **`2순위 [나머지 모두 (선택지B)] 맞춤 원고 복사`** 2칸 나란히 초고속 복붙 카드(`.spotlight-copy-grid`) 배치.
    - **`Proposal.html` 스포트라이트 A↔B 전환 연출 & 비분기 단계 완전 숨김:**
      - 공통 단계(①·② 및 분기 없는 ③·⑤ 등)에서 `#sim-remote-panel`을 `hidden` + `display: none`으로 완전 숨김.
      - 오직 분기되는 단 1개 스텝에만 상단 **`⚡맞춤분기`** 배지 표시 + 진입 시 **`⚡ 고마워톡 핵심 무기 · 신청폼 답변에 따라 전혀 다른 카톡이 자동 발송됩니다`** 스포트라이트 카드 오픈 + **`[🙋‍♀️ '선택지A' 고른 김민지 님 카톡]` ↔ `[🙋‍♂️ '선택지B' 고른 박준호 님 카톡]`** 스위치 + 첫 진입 1.2초 후 1회 자동 전환 시연 + 1.5초 슬라이드·포커스 광채(`bubbleFocusSwap 1.5s`) 연출(폰 액정 내부 100% 순정 카톡 유지).
    - **표준 용어 통일 & 우하단 비간섭 레이아웃 (`Proposal.html` · `LandingBuilder.html` · `RagInterviewEngine.js` · `GomawartalkManual.js`):**
      - 전체 코드·UI·매뉴얼에서 `미친추`·`미친구` 0건 퇴출 ➔ **`채널 추가 전`** / **`채널 추가 전 고객 2회 자동 안내`** / 시뮬레이터 버튼 **`🛡️ 채널 추가 안 한 고객은 어떻게 받나요?`** 통일 + 잔존 `20:30` 오기 0건 해소.
      - `Proposal.html` 우하단 `#flt-pill-label` 2.5초 후·스크롤 시 `0px` 자동 접힘(`collapseFloatingPill`) + 슬림 FAB(`48px`) + `.sim-ext-nav` `332px` 정렬 + `#btn-sim-next` 코치마크(`👆`) 좌측 중앙(`0.32`) 배치로 버튼 간섭 완전 해소. 5종 테스트 스위트 전원 PASS(`152/152` 포함).
15. **V2.9 최종 폴리싱 패치 — 50대+ 빅폰트·미니멀 클린 UI · 순수 챗봇·물음표 원형 아이콘(`300만 원+` VIP 맞춤구축 견적 통합) · 스포트라이트 분기 & 표준 용어 완성 *(2026-11-26 완료)*:**
    - **50대+ 시니어 친화 빅폰트 & 미니멀 클린 UI (`InterviewBot.html` · `Proposal.html`):**
      - 메인 질문·섹션 헤드라인 `24px~26px`(`font-weight: 800`, `line-height: 1.38`, `letter-spacing: -0.025em`), 본문·선택 카드·입력창·폼 라벨 `18px~19px`(`line-height: 1.55`), 상단 스텝 칩·탭 버튼·배지·도움말 최소 `16px~17px` 전면 상향(외부 UI `11~13.5px` 0건, `332px` 폰 액정 내부 순정 카톡만 실제 비율 유지), 메인 CTA `58px~60px` / `18.5px~19.5px` + 전 구간 `word-break: keep-all` & 중첩 테두리 제거.
    - **우측 하단 순수 챗봇·물음표 원형 아이콘(`52px`) & 하단 버튼 비간섭 + 3탭 모달 (`InterviewBot.html` · `Proposal.html`):**
      - 바깥 흰색 텍스트 캡슐(`#flt-pill-label` / `질문·오류제보`) 완전 삭제(`#flt-launcher` 외부 텍스트 0건), **챗봇+물음표(`?`) SVG 아이콘** `52px × 52px` 정원형 버튼 적용(로그인 전/로딩 중 숨김 유지). `Proposal.html` 하단 내비게이션 `.sim-ext-nav-wrap` `margin-bottom: 72px` 안전 여백 확보로 버튼·코치마크(`👆`) 간섭 0%.
      - 모달(`#flt-sheet`) 헤더 **`💬 무엇을 도와드릴까요?`**(`22px`) + **`궁금한 점 확인 · 맞춤 구축(300만 원+) 견적 · 화면 오류 제보`**(`16.5px`) 및 3개 탭(`자주 묻는 질문` / `맞춤구축 견적(300만+)` / `화면 오류제보`) 완성.
    - **`300만 원 이상` VIP 고급 구축 별도 견적 파이프라인 (`Proposal.html` · `InterviewBot.html` · `GomawartalkManual.js` · `RagInterviewEngine.js` · `Backend_Proxy.gs` `V2.9-0`):**
      - `300만 원 이상` 기준선 통일(`200만 원` 0건). FAQ 최상단 2대 VIP 칩(`💎 견적 프로그램 제작 · API 연동 · 풀파워 분기 의뢰`, `설문 답변별로 모든 카톡을 다 다르게 보낼 수 있나요?`) 답변 하단 **`[💎 맞춤 구축(300만 원+) 상담 신청하기 →]`** 버튼 ➔ 탭 2 즉시 이동.
      - 탭 2 폼(희망 4항목 체크 + 요청 내용 + 성함/연락처 자동 채움 + `300만 원 이상` 기준 확인 체크) 제출 ➔ `Backend_Proxy.gs`(`V2.9-0`, 백틱 0건) `report_issue`(`issueType: 'VIP_CUSTOM_QUOTE'`)에서 `파트너제보함` 시트 기록 + 대표님 구글챗 **`💎 [VIP 고액 맞춤구축·견적프로그램 문의 도착! (300만 원+)]`** 즉시 알림 발송.
    - **단 1회차 스포트라이트 분기 최종 정돈 & 5종 테스트 스위트 전원 PASS:**
      - `Proposal.html` 상단 스텝 칩 **`⚡맞춤`**(`16px`), 스포트라이트 헤더 **`⚡ 신청폼 선택에 따라 전혀 다른 맞춤 카톡이 발송됩니다`**, 스위치 **`[🙋‍♀️ '선택지A' 고른 김민지 님]` ↔ `[🙋‍♂️ '선택지B' 고른 박준호 님]`** 정돈, 이진 `(예 / 모름)` 설문 포함 기계식 치환 0건 및 전 파일 `미친추`·`미친구` 0건 확인. 5종 테스트 스위트 전원 PASS(`test_v25_widget_sockets.js` 188/188 포함).
16. **V3.0 최종 마감 폴리싱(9대 항목) — 공식 용어 4대 통일 · 실제 발송 메커니즘 · 시니어 타이포 강약 · 실제 랜딩 상하단 바 & 커튼 티저 *(2026-11-26 완료, `Backend_Proxy.gs` 변경 없음)*:**
    - **전 구간 공식 용어 4대 통일 (`InterviewBot.html`, `Proposal.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`, `data/IndustryPresets.js`, `LandingBuilder.html`):**
      - `대표님`·`사장님` 0건 ➔ **`파트너님`**, `홍보톡`·`홍보·소식 카톡`·화면 배지용 `브랜드메시지` 0건 ➔ **`알림톡`** vs **`광고`**, `미친추`/`미친구` 0건 ➔ **`채널 추가 전`** / **`채널 추가 안 한 고객`**, 확정 CTA ➔ 이모지·`Starter 파트너` 없는 깔끔한 1줄 **`세팅 확정 신청하기`**.
    - **인터뷰봇 4대 UX 폴리싱 & 땡큐 페이지 안심 안내 (`InterviewBot.html`):**
      - 3중 복합 로딩 제거 ➔ 단일 연필 드로잉 SVG(`#loading-svg-pencil`) / 최종 전달용 단일 종이비행기 SVG(`#loading-svg-plane`).
      - STEP 3 5단 코스 바 자동 중앙 스크롤(`centerActiveCourseChip` + `scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })`), 타이틀 `700~800 #0F172A` vs 본문·예시 `400 #334155/#475569` 타이포 강약 분리(`Proposal.html` 동일 적용).
      - 예시 카드 3종 기본 접힘 1줄 아코디언(`💡 요약 타이틀` + `▾` ➔ 클릭 시 전체 문장 + **`[이 내용 선택]`**), 하단 내비 아이콘형 `←`(`52px × 56px`) + 1줄 고정 CTA(`56px`, `white-space: nowrap`), 완료(땡큐) 페이지 **`초기 초안 안내 · 관리자 페이지 직접 수정 가능`** 박스(`#ty-reassure-box`) 추가.
    - **3D 글로시 입체 챗봇 아이콘(`52px`) & `300만+` 문구 절제 (`InterviewBot.html`, `Proposal.html`):**
      - 입체 3D 스피어 + 하이라이트 광택 + 입체 말풍선 오브제 SVG 교체(외부 텍스트 0건). 팝업 헤더 서브·탭 2(`맞춤구축 견적`)·기본 인사말에서 `300만+` 문구 제거, 탭 2 내부 및 VIP Q&A 본문에서만 차분히 안내.
    - **제안서 실제 고마워톡 랜딩 상·하단 바 · `① 신청페이지` 프로스티드 커튼 티저 · `알림톡 1 : 광고 3` & 3단 미수신 재발송 체험 · 화살표 플로우 카드 · 확정 폼 대청소 (`Proposal.html`, `RagInterviewEngine.js`):**
      - 상단 고정 바(`56px`, `#FFFFFF`, `1px solid #EEF2F6`): 좌 `[로고] 브랜드명` + 우 `34px` 원형 카톡 아이콘(`#btn-share-link`, `'설계안'`·`'🔗 링크 복사'`·중복 브랜드 캡슐 제거). 하단 고정 바: 좌 `48px` 원형 맨위로(`⌃`) + 우 1줄 `세팅 확정 신청하기`.
      - 핸드폰 액정 `① 신청페이지`: 실제 상단 바 + 하단 바(`⌃` + 신청 버튼 + 우상단 노란 `💬 카카오 로그인` 미니 배지) + 중앙 **프로스티드 커튼 티저**(`[✨ 터치해서 신청페이지 세팅 안내 열기]` ➔ `〈전문가 검수 초기 세팅 안내〉` + 핵심 3줄 요약).
      - **`알림톡 1 : 광고 3`** 6단계 시뮬레이터 확정 및 `[🛡️ 채널 추가 안 한 고객은 어떻게 받나요?]` 버튼을 **`광고` 단계(`④`~`⑥`)에서만 노출**(`③ 알림톡` 숨김), 클릭 시 **1단계 `미수신 안내 알림톡` + `[Ch+ 채널 추가]` 클릭 하이라이트** ➔ **2단계 `💛 고객이 [Ch+ 채널 추가] 클릭 완료`** ➔ **3단계 `다음 날 · 오전 09:00 자동 발송 성공` + `(광고)` 도착** 3단 정확 시연.
      - 말줄임표 박스 폐기 ➔ 인과 화살표(`▼ 신청하기 클릭` / `▼ 제출 즉시` / `▼ 약속한 간격 뒤` / `▼ 지정 시각 정각`) 독립 플로우 카드(`.flow-step-card`) + 하단 확정 폼(14개 DOM ID 보존, 중복 배지 제거, 100% 풀와이드 Starter Pro 체크박스 카드 `☐ 내 로고 · 전용 버튼 알림톡으로 변경 (Pro)`, `설계안 그대로 세팅` / `전문가가 검수 후 위 흐름대로 초기 세팅을 진행합니다.`). 5종 테스트 스위트 전원 PASS(`test_v25_widget_sockets.js` 199/199 포함).
17. **V3.1 최종 마감 패치(파싱·정책·스크롤 버그 4건 + 제안서·위젯 UI/UX 업그레이드 7건 = 총 11개 항목) *(2026-11-26 완료, `Backend_Proxy.gs` 변경 없음)*:**
    - **신청폼 객관식 파싱 버그 수정 & 엉뚱한 폴백 영구 제거 (`engines/RagInterviewEngine.js` · `Proposal.html`):** `extractSurveyOptionsFromText()`로 따옴표(`'...'`/`"..."`)·중첩 괄호·슬래시·`A와 B` 선택지 최우선 추출, `convertPartnerNarrativeToCustomerQuestion()`으로 파트너 서술문(`~할게요`/`~파악합니다`)을 실제 고객용 1줄 질문으로 변환, 기존 타 업종 폴백(`바로 적용할 실전 전략 희망`/`처음이라 쉬운 기초 안내부터`) 0건 영구 폐기.
    - **카카오 쿠폰 정책(`알림톡 쿠폰 불가 · 광고 전용`) 엄수 & 인터뷰 선택 내용 100% 반영 (`data/GomawartalkManual.js` · `engines/RagInterviewEngine.js` · `InterviewBot.html`):** 전 업종 `③ 첫카톡` 예시에서 `쿠폰`/`할인권`/`무료 증정` 100% 제거(쿠폰·혜택 예시는 `④`/`⑤` 광고로 이동), 파트너가 Q1/Q3에 쿠폰·할인을 직접 입력해도 `③ 알림톡`은 순수 정보성 접수 확인으로 정제(`stripAlimtalkPromoCopy`)하고 `extractPromoOfferFromAnswers()`로 추출한 쿠폰·혜택을 **`④ 첫 번째 광고 메시지` 본문·배지·버튼에 100% 자동 반영**.
    - **상단 회색 프로필 아이콘 · 불필요 커버 배지 제거 · `'캐로셀'` 명시 & 멀티카드 스와이프 (`Proposal.html` · `RagInterviewEngine.js`):** 상단 바(`34px`)·폰 상단 바(`24px`) 노란 카톡 아이콘 ➔ 연회색 원형(`#F1F5F9`) 회색 사람 프로필 실루엣 SVG(`#94A3B8`) 교체, 상단 여백 확보, `#cover-industry-chip`·`#cover-ratio-chip` 삭제, Step ⑤ 스텝·흐름 카드 배지 **`캐로셀`** 명시 + 우측 2·3번 카드가 살짝 보이는 실제 좌우 스와이프 카카오톡 멀티카드 캐로셀(`.kk-carousel-track`) 구현.
    - **`① 신청페이지` 빨간 벨벳 무대 커튼 티저 & 블러 랜딩 위 전문가 검수 글래스 카드 (`Proposal.html`):** 좌·우 입체 주름 크림슨-버건디 벨벳 무대 커튼 + 상단 스포트라이트 + `[🎭 터치해서 신청페이지 커튼 열기]` ➔ `0.65s` 양옆 오픈 ➔ 브랜드 컬러 블러 랜딩(`filter: blur(7px)`) 위 화이트 글래스 카드(`✨ 전담 전문가 초기 세팅 지원` · `세팅 확정 시 전문가 검수 후 맞춤 이미지·문구가 세팅됩니다` · `[다음: ② 신청폼 화면 보기 →]` · `커튼 닫기`).
    - **맞춤 분기 스크롤 0mm 토스식 1줄 세그먼트 스위치 (`Proposal.html`):** 부피 큰 보라색 박스·가짜 인명(`김민지 님`/`박준호 님`)·중복 요약 박스 제거, 분기 핵심 1단계 핸드폰 바로 위(`margin-bottom: 10px`)에 `⚡ 신청폼 선택에 따라 카톡 내용이 달라집니다 (눌러서 비교)` + `48px` 슬림 2분할 `●`/`○` 세그먼트 탭 배치(말줄임 없음).
    - **흐름 1줄 아코디언 & 비교 카드 가로 스와이프 (`Proposal.html`):** `#sec-summary` 보라색 `✓` 제거 + 기본 접힘 1줄 아코디언(클릭 시 70자 이내 요약 + `[위 핸드폰에서 화면 보기 ▶]`), `#sec-4` 보라색 `4` 제거 + `flex: 0 0 84%` 가로 스냅 스와이프 카드(`.diff-carousel-track`) + 동기화 인디케이터 점(`.diff-dots`).
    - **클릭 포인터 `48px` 확대 & `position: absolute` 버튼 내부 직부착 (`Proposal.html`):** `position: fixed`/`getBoundingClientRect()` 폐기, `#sim-coachmark`를 대상 버튼 내부에 직접 마운트(`z-index: 25`)해 스크롤 시 이탈·상하단 바 침범 0% 달성.
    - **슬림 토스식 AI 도우미 채팅 모달 (`Proposal.html` · `InterviewBot.html`):** `54px` 1줄 헤더(`💬 고마워톡 AI 도우미` + `[견적·오류접수]` + `[✕]`), 75~80% 채팅 스트림, 1줄 인사말, 입력창 위 1줄 가로 스크롤 FAQ 미니 칩(첫 질문 후 자동 접힘), 비절단 플레이스홀더(`궁금한 점을 편하게 물어보세요`, `17px`), `[견적·오류접수]` 2탭 전환(VIP 300만+ 견적·오류 제보 배관 100% 보존). 5종 테스트 스위트 전원 PASS.
18. **V3.2 폴리싱 패치 — 로딩 모달 2줄 리마인드 롤링 · `① 신청페이지` 풀스크린 블러 포스터 · 실제 카톡 `(광고)` 위치 고증 & 블러 이미지 프레임 · 혜택 단어 잘림 수정 · 땡큐 페이지 핵심 안심 카드 주인공화 *(2026-11-27 완료, `Backend_Proxy.gs` 변경 없음)*:**
    - **로딩 모달 「내 선택 2줄 리마인드 롤링(Context Echo Ticker)」 (`InterviewBot.html`):** 기존 단일 모션(`pencil`/`plane`)·`「상호명」` 캡슐·10px 게이지 바 유지 + 진행률별 3단계 타이틀 전환 + 높이 `68px` 소프트 페이드 슬롯(`#loading-echo-viewport`)에서 진행률(`18% → 42% → 66% → 88%`)에 맞춰 `✓` 완료 항목(`#64748B`) + `●` 진행 항목(`#0F172A`, `font-weight: 600`) 2줄 상향 슬라이드. `extractLoadingEchoKeyword()`·`buildLoadingEchoSteps()`로 핵심 키워드만 1줄 요약하고 건너뛴 단계(`②`/`④`/`⑤`)는 자동 생략해 브랜드 컬러 테마 적용 단계 노출.
    - **`① 신청페이지` 커튼 오픈 화면 개편 (`Proposal.html`):** 빨간 벨벳 무대 커튼(`0.65s`) 유지 + 뒷면 흰 여백 `0px` 100% 풀스크린 브랜드 컬러 모바일 포스터(`filter: blur(8px) saturate(1.15); transform: scale(1.08)`) + 중앙 화이트 글래스 카드 텍스트 대청소(상단 배지·중복 보조 문구 삭제, **`세팅 확정 시 전문가가 검수 후 실제 세팅해 드려요`** + **`[② 신청폼 보기 →]`** + 우상단 `커튼 닫기`만 집중).
    - **실제 카카오톡 `(광고)` 위치 100% 고증 · 블러 이미지 배지 · 상호 중복 & 앞글자 잘림 버그 수정 (`Proposal.html` · `engines/RagInterviewEngine.js`):** 모든 광고/캐로셀/미수신 재발송 3단계 익일 09:00 도착 광고의 발신자 헤더(`.kk-sender-row.ad-sender`)에 **`(광고) 채널명` + `✓` + 원형 채널홈 배지(`🏠`)** 배치 및 말풍선 본문 내부 중복 `(광고)`(`.kk-ad-badge`) 100% 삭제. `4:3` 밝은 브랜드 컬러 블러 썸네일 + **`🖼️ 세팅 시 맞춤 이미지 적용`** 글래스 캡슐 + 1줄 핵심 카피 적용. `extractPromoOfferFromAnswers()` 어절 경계 안전 추출로 `'단골'` ➔ `'골'` 잘림 버그 완전 수정 및 `stripDuplicateChannelCopy()`로 상호 3중 중복 정리.
    - **땡큐 페이지 2곳 핵심 안심 카드 주인공화 (`InterviewBot.html` · `Proposal.html`):** `InterviewBot.html`(`#ty-reassure-box`) 및 `Proposal.html`(`#done-assurance-card`) 양쪽에 **`초기 세팅 후 파트너님만의 캠페인으로 완성하세요`** / **`지금 보신 설계안은 빠른 시작을 돕는 초안입니다. 전문가가 검수해 초기 세팅을 마친 뒤, 고마워톡 파트너센터에서 문구와 이미지를 언제든 수정·보완해 파트너님만의 완전한 캠페인을 만드실 수 있습니다.`** 토스식 안심 카드 배치, 하단 확정 폼 보조 문구 1줄(`전문가가 검수 후 초기 세팅을 바로 도와드려요.`) 정돈(14개 DOM ID·3대 모선 소켓 100% 보존). 5종 테스트 스위트 전원 PASS(`test_v25_widget_sockets.js` 226/226 포함).
19. **V3.3 6대 UX 완성 및 공식 푸터 통합 패치 *(2026-11-27 완료, `Backend_Proxy.gs` V2.9-1 포함)*:**
    - **`'첫카톡'` ➔ `'첫 알림톡'` 직관적 용어 통일 (`InterviewBot.html` · `Proposal.html` · `engines/RagInterviewEngine.js`):** 5단 코스 칩(`③ 첫 알림톡`), 하단 1줄 진행 버튼(`다음: ③ 첫 알림톡 →`), 질문 안내·로딩 리마인드·제안서 단계 라벨 일괄 변경(`첫카톡` 0건) 및 `white-space: nowrap` 1줄 레이아웃 엄수.
    - **`Proposal.html` `[Ch+ 채널 추가]` 직접 클릭 인터랙티브 체험:** 초기 상태(`before_click`)는 미수신 안내 알림톡 + 펄스·`👆 직접 눌러보세요` 포인터가 달린 `[Ch+ 채널 추가]` 버튼만 노출(익일 광고 `hidden`) ➔ 클릭 즉시 `✓ 채널 추가 완료` + **`🎉 +1 구독(채널 친구)이 발생했습니다!`** 팝업 ➔ **`🌙 하루가 지나고... ➔ ☀️ 다음 날 오전 09:00`** 타임슬립(`~1.0s`) ➔ 익일 `(광고) 채널명` 카드 슬라이드 업 도착 + **`✨ 발송 실패했던 광고 메시지 자동 발송 성공!`** 배지 & **`[↻ 다시 체험하기]`** 리셋 버튼 구현.
    - **맞춤 구축 상담 신뢰 우선 개편 (`Proposal.html` · `InterviewBot.html` · `data/GomawartalkManual.js` · `engines/RagInterviewEngine.js` · `Backend_Proxy.gs`):** 전 파일 `300만` 0건, Q&A 본문·연결 버튼(`🛠️ 전문가 맞춤 제작 · 연동 상담 신청 →`) 가격 숫자 전면 제거, `[견적·오류접수]` > `맞춤구축 상담` 탭 4종 칩(`🧮 맞춤 견적 프로그램 제작·연동`, `🎟️ 우리 매장 스탬프·적립 프로그램`, `🔗 외부 결제·DB·API 연동`, `⚡ 정밀 다중 분기 설계`) 및 가격 확인 체크박스 제거, 오직 최종 버튼에만 **`전문가 전화 인터뷰 신청 (최소 견적 100만 원+)`** 표기. `Backend_Proxy.gs` 구글챗 알림 `100만 원+ · 전화인터뷰 요청` 동기화(백틱 0건).
    - **완료 화면 요청 요약 타이틀 아코디언 (`Proposal.html`):** `#done-summary-box`(`📋 내가 신청한 세팅 요청 내역 보기 ▾`) 기본 접힘(`#done-meta-box[hidden]`) 적용, 펼쳤을 때 `접수 상태: 전문가 검수 대기 (접수 완료)` 안심 표현 & 유료 파트너 연 요금 비강조 정리(14개 DOM ID 100% 보존).
    - **GPTers 핸드폰 상단 배치 + 하단 5.5초 컬러 게이지 단계 카드 (`Proposal.html`):** 상단 타이틀 간결화 ➔ 밝은 실버 핸드폰 목업 상단 중앙 + 프레임 위 1줄 장면 캡션 바(`#sim-scene-caption`) ➔ 하단 원형 숫자 없는 게이지 차오름(`stepGaugeFill 5.5s`) 단계 카드 배치 + 카드 클릭·폰 터치·커튼·분기 스위치·미수신 체험·캐로셀 스와이프 등 조작 시 즉시 Smart Pause.
    - **고마워톡 공식 웹페이지 접이식 푸터 공통 적용 (`Proposal.html` · `InterviewBot.html`):** 기본 접힘 1줄 바(`호스팅서비스 제공 : 고마워브라더(주)` · `서비스 약관` · `개인정보처리방침` · `사업자정보 ⌄`) ➔ 클릭 시 `사업자정보 ⌃` + 공식 중개자 고지·고객센터·운영시간·이메일·사업자정보·우하단 `카카오톡 1:1 상담` 펼침(하단 고정 CTA·3D 플로팅 아이콘 비간섭 여백 확보). 5종 테스트 스위트 전원 PASS.
20. **V3.4 실서버 8대 완성도 패치 (`Proposal` 4대 이슈 + `InterviewBot` 4대 버그·UX 해결) *(2026-11-27 완료, `Backend_Proxy.gs` 변경 없음)*:**
    - **`Proposal.html` `① 신청페이지` 업종별 13종 풀스크린 실사 블러 랜딩:** `LANDING_POSTER_THEMES`(12+ 업종 & 기본 테마, 고해상도 Unsplash URL + 오프라인 리치 CSS 그라데이션 백업, `resolveLandingPosterTheme()`) 적용. 핸드폰 상·하단 바 사이 전체 풀스크린(`filter: blur(6px) brightness(0.92) saturate(1.1); transform: scale(1.08)`, 흰 여백 0%) + 중앙 핵심 1문장 글래스 카드(`세팅 확정 시 전문가가 검수 후 실제 세팅해 드려요` + `[② 신청폼 보기 →]` + `커튼 닫기`) 구성.
    - **`Proposal.html` 중복 내비 삭제 · 5.0초 게이지 강조 · 스크롤 비간섭 전자동 고객 커서 시연 ➔ 클릭 수동 체험:** 중복 `[◀ 이전 장면]`/`[다음 장면 ▶]`(`#btn-sim-prev`/`#btn-sim-next`) 완전 삭제, 정확히 `5.0s`(`5000ms`) 컬러 채움 대비 강화 + 하단 `4px` 프로그레스 라인(`.step-gauge-line`) 및 활성 카드 중앙 자동 정렬. 핸드폰 위 터치/스크롤로 자동 시연이 멈추지 않도록 수정하고, `48px` 가상 고객 커서(`👆`)가 Step 1(1.1s 커튼 오픈)·Step 2(1.1s 2번 라디오 선택)·Step 3(버튼 포커스)·Step 4(1.8s 분기 A➔B 전환)·Step 5(1.6s 캐로셀 2번 카드 자동 슬라이드)를 자동 시연하며, 명시 조작 클릭 시에만 수동 모드 전환 및 `[▶ 자동시연]`(`#btn-sim-resume-auto`) 토글 표시.
    - **`Proposal.html` 풀스크린 「하루가 지났습니다」 미수신 재발송 전환:** 초기 상태(`before_click`)는 오직 `[미수신 안내 알림톡]` + 펄스 `[Ch+ 채널 추가]`만 노출 ➔ 클릭 시 Step A(`0.7s`, `✓ 채널 추가 완료` + 상단 `🎉 +1 구독(채널 친구)이 발생했습니다!`) ➔ Step B(`1.35s`, 핸드폰 액정 전체를 덮는 풀스크린 `#timewarp-overlay.rescue-sunrise` `🌙 하루가 지났습니다 ➔ ☀️ 다음 날 오전 09:00`) ➔ Step C(깨끗하게 갱신된 익일 09:00 카톡 화면 상단 정중앙에 본래 `(광고) 채널명` 전체 + `[↻ 미수신 알림톡부터 다시 체험]` 리셋 버튼).
    - **`Proposal.html` 3층 수직 배치 일원화:** 핸드폰 위 `#sim-scene-caption`·`#sim-remote-panel` 100% 제거 ➔ **1층 핸드폰 목업(`#sim-phone-shell`) ➔ 2층 5.0초 게이지 바(`#sim-steps-bar`) ➔ 3층 통합 컨트롤 도크(`#sim-action-dock`: `#sim-remote-panel` 분기 스위치 & `#btn-sim-rescue-toggle` 미수신 체험 버튼, `margin-bottom: 76px`)**로 핸드폰 상단 위치 고정.
    - **`InterviewBot.html` · `RagInterviewEngine.js` STEP 2 주관식 AI 추천 직행 및 원문 보존:** `Consult.recommendFlow()`가 주관식 입력(`customScenarioInput`) 기반 `CUSTOM_AI_FLOW`(`customScenarioData`)를 반환하고, `#flow-ai-result` 내 단일 직행 CTA `[이 흐름으로 바로 시작하기 →]` 클릭 즉시 STEP 3 진입(정형 6대 객관식으로 튀는 버그·중복 버튼 제거). `buildCustomScenarioExamples()`·`generateConsultExamplesBatch()`·`assembleCampaign()`·`generateCampaign()` 전 구간에서 파트너 주관식 목표 최우선 보존(엉뚱한 `거북목·골반 교정` 혼입 0%).
    - **`InterviewBot.html` 전환 팝업 실제 입력값 전용 리마인드 & 카카오 단일 심플 연결 화면:** `buildLoadingEchoSteps()`에서 6대 가짜/시스템 필러 문구 100% 삭제, 직전 단계 실제 입력·선택값만 리마인드. 카카오 로그인 클릭 시 버튼 자체만 `카카오 연결 중...`으로 변경하고 `?code=...` 복귀 시에만 연필·퍼센트 바 없는 단일 심플 카드(`#kakao-auth-overlay`: 단순 스피너 + `카카오 계정을 연결하고 있어요`) 표시.
    - **전역 용어 통일(`첫카톡` 0건, `신청화면` 0건) & `① 신청페이지` vs `② 신청질문` 목적·예시 완전 분리 (`InterviewBot.html` · `RagInterviewEngine.js` · `GomawartalkManual.js`):** 전 파일 `첫 알림톡`·`신청페이지` 100% 통일, `#q-purpose-guide` 1줄 목적 가이드 신설, Q1(고민·목표 랜딩 주제) vs Q2(`질문 — '선택지1' / '선택지2' / '선택지3'` 객관식 맞춤 분기) 질문·플레이스홀더·전 업종 예시 전면 분리. 5종 전수 테스트 전원 PASS(`test_v25_widget_sockets.js` 264/264 포함).

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
3. **[P1 · 배포 반영] 로컬 커밋 원격 Push & GAS 웹 앱 V2.9-0 재배포:**
   - [ ] GitHub Desktop에서 로컬 커밋을 `origin/master`로 Push (`InterviewBot.html`, `Proposal.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`, `Backend_Proxy.gs`, `PRD.md`, `HANDOFF_NEXT_SESSION.md` 실서버 반영)
   - [ ] Google Apps Script 편집기에 갱신된 `Backend_Proxy.gs` (`V2.9-0`) 반영 후 `[배포 > 배포 관리 > 새 버전]` 배포 + 에디터에서 `testGoogleChatWebhook()` 1회 실행해 구글 챗 수신 확인 (`GOOGLE_CHAT_WEBHOOK_URL` 스크립트 속성 등록 여부 점검)
4. **[P1 · 11/30 본체 완공 마감] 모바일 카톡 인앱 E2E 최종 검수:**
   - [ ] **11월 30일(월) 완공 목표:** 실전 스마트폰 카톡 인앱 브라우저에서 `카카오싱크 로그인(실제 전화번호 정상 기록)` ➔ `인터뷰봇 무료 체험 + 플로팅 위젯 Q&A 설계 핀·1초 제보` ➔ `파트너캠페인관제탑(18컬럼)·파트너제보함(9컬럼) 기록` ➔ `Proposal.html V2.5 시뮬레이터 & 1회 수정메모 연동·확정 제출` ➔ `Google Chat 알림 수신` ➔ `LandingBuilder.html 유료 조종석 포스트잇·AI 이미지 채우기`까지 전 구간 E2E 최종 검수 완료
5. **[Post 11/30 · Wave 1 착수] 독자 외부 스토어 공식 앱 (Track B):**
   - [ ] 본체 완공 직후 대표님 보유 소스로 **Wave 1 구글 폼·시트 공식 부가기능(건당 50원 선불 크레딧)** 착수 — 본체 탭 4·5 시나리오 생성 모듈 및 모선 3대 소켓(`source_platform: "GOOGLE_FORMS"`) 그대로 연결
