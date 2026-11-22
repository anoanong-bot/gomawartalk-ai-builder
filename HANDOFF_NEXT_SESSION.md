# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-22 21:40 (KST · Step 2·4·5 슬림 아코디언/화살표 UI 최종 마감 완료)
- **기준 버전:** Master PRD V2.2 As-Built (`PRD.md` 역방향 정식 동기화 완료)
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`
- **최종 전수 감사 결과:** 코드 파일 전체 금지어 0건 · 구형 모델(`gemini-1.5/2.0/2.5`) 0건 · API 키 하드코딩 0건 · `InterviewBot.html` & `LandingBuilder.html` 헤드리스 크롬 E2E 콘솔 런타임 에러 0건

---

## 1. 오늘(2026-11-22) 완료한 핵심 작업 요약

### ① 컨설턴트급 5단계 파트너 인터뷰 봇 UI·UX 최종 완성 (`InterviewBot.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`)
- **Step 1 (6대 분야 + 7번째 기타 업종 직접 입력 + 자동 포커스 스크롤 & 헤더 배지 동기화):**
  - 6대 마스터 분야 + 7번째 풀와이드 카드(`⑦ 기타 업종 직접 입력`), 카드 선택 즉시 세부 업종 입력란(`16px`) 자동 스크롤/포커스 및 상단 헤더 파트너 배지(`#partner-badge`) 실시간 동기화
- **Step 2 (3초 스캔 조합형 아코디언 + 1줄 화살표 Flow Pill + BEST 하이라이트 + 상단 AI 추천 배너):**
  - 기본 접힘 상태에서 `[아이콘 + 목표 중심 제목 + 1줄 3단 화살표 키워드 흐름도(📋 ➔ 💬 ➔ ⏰)]`만 슬림 표시(한 화면 4~5개 스캔) ➔ 터치해 선택한 카드만 3단계(`신청페이지` / `즉시 첫 카톡` / `후속 자동 카톡`) 상세 시나리오 펼침 + 하단 고정 `Sticky Bottom CTA` 활성화
  - 세부 업종 최적 플로우 1개에 `🔥 [세부업종] 가장 많이 선택!` BEST 배지 및 포인트 테두리 적용
  - `Consult.generateSubIndustryFlows()` + `subDomainPacks`로 `산부인과` 등 세부 업종 전용 6대 플로우 실시간 AI 번역 생성(타 업종 세무 용어 오염 0%) + 상단 AI 추천 배너(1번 카드 위) + 선택 카드 재터치 즉시 Step 3 직행
- **Step 3 (중앙 집중형 Tap-to-Edit 주관식 워크스테이션 + 실시간 불가 기능 검문소 + 기능 Q&A 분리):**
  - 하단 분리형 채팅바 폐기 ➔ 멀티라인 `textarea`(`16px`) + 터치 시 전송 없이 초안만 채워지는 Tap-to-Edit 맞춤 예시 칩 3개
  - `GOMAWARTALK_FEASIBILITY_RULES` 직결 실시간 불가 기능 검문소(즉석 맞춤 영상 생성, 카톡방 실시간 AI 1:1 채팅, 자체 결제창, 미친추 광고 친구톡, 신청폼 파일 첨부 등 차단 & 대안 2종 역제안) + 상단 우측 `[💬 고마워톡 기능 가능 여부 물어보기]` 별도 모달 분리
- **Step 4 (브랜드 에셋 수집 + `'로고 없어도 OK'` 안심 UX):**
  - 로고 업로드 하단에 안심 문구 + `[✨ 로고 파일 없음 (상호명 텍스트로 깔끔하게 표시)]` 선택 칩 및 라이브 텍스트 로고 프리뷰 제공
  - 추천 컬러 테마 5종/직접 선택/로고 톤 자동 맞춤, 랜딩 실사 최대 3장(Canvas `1,000px`, JPEG `0.82`) 또는 AI 실사 자동 생성
- **Step 5 (Step 2와 디자인 통일된 슬림 아코디언 요약 + 히어로 여정 카드 + 인라인 수정):**
  - 상단 `'내 캠페인 한눈에 보기'` 히어로 카드(업종 배지 + 헤드라인 + 1줄 화살표 카톡 여정 칩)
  - `Q1~Q5` 번호 대신 친근한 아이콘 라벨(`🎯 목표·주제`, `🙋 핵심 타겟`, `🎁 첫 카톡 혜택`, `🏆 대표님 강점`, `💬 후속 흐름`) 5줄 슬림 아코디언(접힘 기본 28자 요약 + 펼침 시 원문 확인 & `[✏️ 내용 수정]` 인라인 편집)
  - 브랜드 디자인 재료 요약 바: `✨ 상호명 텍스트 로고 적용` 긍정 배지 + 실제 원형 컬러 스와치(`●`) + 첨부 사진 미니 썸네일(미첨부 시 `✨ 문구 맞춤 AI 실사 자동 생성`)
- **공용 토스식 모바일 하단 고정 액션 바 (`#sticky-cta-bar`, `position: sticky; bottom: 0; z-index: 50`):** Step 1~5 전 단계 일관 적용(`backdrop-filter: blur(12px)`, `env(safe-area-inset-bottom)`, `padding-bottom: 120px`)

### ② 대표님 전용 조종석 (`LandingBuilder.html`) 연동 완성
- 로고 이미지 첨부 시 탭 1 썸네일(`#t-logo`) + 탭 2 Hero 최상단(`.hero-brand-logo`) 자동 배치, **로고 미첨부(`logo_mode: "text_auto"`) 시 상호명 기반 에디토리얼 타이포 텍스트 로고 배지(`#t-text-logo`, `.hero-text-logo` `38px`)** 자동 렌더링
- 파트너 선택 브랜드 컬러 자동 반영 + 첨부 실사(최대 3장) 최우선 슬롯 배치 + 빈 슬롯만 `autoGenerateCampaignVisuals(false)` AI 실사 자동 생성 (탭 2 회귀 잠금: `1,000px` 1열 풀와이드, 본문 `44px+`, 실측 최소 폰트 `38px` 유지)

---

## 2. 다음 세션 최우선 작업 순서 (온라인 개통 체크리스트)

1. **① 5단계 인터뷰 봇 ➔ 조종석 연동 최종 실전 클릭 검수:**
   - [ ] `InterviewBot.html` 로컬 실행 ➔ 관리자 프리패스 ➔ Step 1~5 전체 클릭 검수 (Step 2 아코디언/Flow Pill/BEST 배지/더블탭, Step 3 Tap-to-Edit & 불가 기능 검문소, Step 4 무로고 텍스트 로고 & 사진 업로드, Step 5 아코디언 인라인 수정)
   - [ ] `[🚀 조종석에서 바로 열기]` ➔ `LandingBuilder.html`에서 텍스트/이미지 로고, 브랜드 컬러, 실사 우선 배치 + 빈 슬롯 AI 생성 ➔ PNG/ZIP 다운로드 확인
2. **② 구글 시트/드라이브 준비 및 `Backend_Proxy.gs` 웹앱 배포:**
   - [ ] 구글 스프레드시트 생성 후 `[승인파트너명단]` 탭(`상호명, 대표자명, 전화번호, 이메일, 승인상태`)에 테스트용 본인 전화번호·이메일 및 `승인상태 = Y` 등록
   - [ ] Apps Script 편집기에 `Backend_Proxy.gs` 전체 코드 붙여넣기 ➔ `[스크립트 속성]`에 `GEMINI_API_KEY`, `SPREADSHEET_ID`, `GOOGLE_CHAT_WEBHOOK_URL`, `BUILDER_URL` 등록
   - [ ] `[배포] → [새 배포] → 웹 앱` (액세스 권한: `모든 사용자`) 배포 후 `/exec` URL 확보
3. **③ 카카오 디벨로퍼스 도메인 등록 및 GitHub Pages 실전 온라인 개통:**
   - [ ] 카카오 디벨로퍼스 콘솔에서 웹 플랫폼 도메인(GitHub Pages URL) 등록 및 동의 항목(`profile_nickname`, `account_email`, `phone_number`) 활성화
   - [ ] `InterviewBot.html` 상단 `PARTNER_BOT_CONFIG`의 `KAKAO_JS_KEY`, `BACKEND_PROXY_URL`에 실서비스 값 입력 후 커밋·푸시
   - [ ] GitHub 저장소 `Settings → Pages`에서 `master` 브랜치 배포 활성화 ➔ 실제 스마트폰에서 카카오 1초 인증 ➔ 5단계 제출 ➔ 구글 드라이브 `[파트너접수함]` JSON 저장 & 구글 챗 알림 최종 개통 확인
