# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-22 21:10 (KST · 오늘 개발 최종 마감 완료)
- **기준 버전:** Master PRD V2.2 As-Built (`PRD.md` 역방향 정식 동기화 완료)
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`
- **마감 전수 감사 결과:** 코드 파일 전체 금지어 0건 · 구형 모델(`gemini-1.5/2.0/2.5`) 0건 · API 키 하드코딩 0건 · `InterviewBot.html` & `LandingBuilder.html` 헤드리스 크롬 E2E 런타임 콘솔 에러 0건

---

## 1. 오늘(2026-11-22) 완료한 핵심 작업 요약

### ① 컨설턴트급 5단계 파트너 인터뷰 봇 최종 완성 (`InterviewBot.html`, `engines/RagInterviewEngine.js`, `data/GomawartalkManual.js`)
- **토스식 모바일 하단 고정 액션 바 (`#sticky-cta-bar`, `position: sticky; bottom: 0; z-index: 50`):**
  - 반투명 블러(`backdrop-filter: blur(12px)`), 아이폰 `env(safe-area-inset-bottom)` 대응, 본문 하단 가림 방지 `padding-bottom: 120px` 적용
  - Step 1~5 전 단계 하단 진행 버튼을 상시 노출 ➔ Step 2에서 1·2번 카드 선택 즉시 스크롤 없이 바로 진행 가능, **이미 선택된 카드 재터치(또는 카드 내 `[이 흐름으로 선택 →]` 클릭) 시 즉시 Step 3 직행**
- **Step 1 (6대 분야 + 7번째 기타 업종 직접 입력 탈출구 + 자동 스크롤):**
  - 6대 마스터 분야 카드 + 7번째 풀와이드 카드(`⑦ 기타 업종 직접 입력`) 추가
  - 카드 선택 시 세부 업종 1줄 입력란(`16px`)으로 부드럽게 `scrollIntoView` 자동 스크롤 및 포커스
- **Step 2 (세부 업종 100% 전용 6대 플로우 실시간 AI 번역 + 상단 AI 추천 배너):**
  - `Consult.generateSubIndustryFlows()` 및 `subDomainPacks` 구축으로 `산부인과`·`치과`·`법무사`·`기타 업종` 입력 시 타 업종(세무 등) 용어 오염 **0%** 보장 (온라인 AI 실시간 생성 + 오프라인 키워드 분리 폴백)
  - `[🤔 어떤 흐름이 좋을지 고민돼요 — 제 목표를 적고 AI 추천받기]` 배너를 **Step 2 상단 안내 문구 바로 아래(1번 카드 위)**로 끌어올려 가시성 극대화
- **Step 3 (중앙 집중형 Tap-to-Edit 주관식 워크스테이션 + 실시간 매뉴얼 검문소 + 기능 Q&A 분리):**
  - 하단 분리형 채팅창 폐기 ➔ 큼직한 멀티라인 주관식 `textarea`(`16px`) + 터치 시 전송 없이 초안만 채워지는 Tap-to-Edit 맞춤 예시 칩 3개
  - `GOMAWARTALK_FEASIBILITY_RULES` 직결 **실시간 불가 기능 검문소**(`고객 고민 맞춤 영상 즉석 제작`, `카톡방 AI 1:1 실시간 채팅`, `자체 결제창`, `미친추 광고 친구톡`, `신청폼 파일 첨부` 등 입력 시 통과 차단 + 대안 2종 역제안)
  - 우측 상단 `[💬 고마워톡 기능 가능 여부 물어보기]` 별도 모달로 기능 상담 완전 분리
- **Step 4 & Step 5 (브랜드 에셋 수집 & 조종석 직결):**
  - 로고(400px 리사이즈 Base64 + 대표 컬러 추출), 브랜드 컬러 5종/직접 선택, 랜딩 실사/참고 사진 최대 3장(Canvas `1,000px`, JPEG `0.82` 압축) 및 `[✨ 사진이 없어요 — 문구에 맞춰 AI 실사 자동 생성]` 선택 ➔ 최종 요약 컨펌 및 제출

### ② 대표님 전용 조종석 (`LandingBuilder.html`) 연동 & 탈(脫) AI 에디토리얼 규격 유지
- 파트너 첨부 로고를 탭 1 썸네일(`#t-logo`) + **탭 2 Hero 최상단(`.hero-brand-logo`)**에 이중 연동
- 파트너 선택 브랜드 컬러 자동 반영 및 첨부 실사(최대 3장) 최우선 슬롯 배치 ➔ **비어 있는 슬롯만 `autoGenerateCampaignVisuals(false)`가 문구 맞춤 AI 실사로 자동 생성**(생성 중 Shimmer 스켈레톤)
- 탭 2 회귀 잠금 100% 유지: 가로 `1,000px` · 내부 `888px` 1열 풀와이드 · 본문 `44px+` · 실측 최소 폰트 `38px` (`>= 36px`) · 좌측 보더(`[` 모양) 및 AI 클리셰 장식 0건

### ③ Master `PRD.md` V2.2 As-Built 역방향 정식 동기화 완료
- 핵심 철칙(1,000px 1열, 44px+/36px+ 하한, 금지어 배제, 카카오 파트너 선인증 게이트, `gemini-3.8-flash` 및 동적 모델 탐색 폴백) 100% 보존 + 오늘 확정된 탭 2 에디토리얼·자동 실사·5단계 컨설턴트 봇·Sticky CTA 규격 정식 명문화 완료

---

## 2. 다음 세션 최우선 작업 순서 (Priority Roadmap)

1. **① 5단계 인터뷰 봇(로고·사진 첨부 및 불가 기능 검문 포함) ➔ 조종석 연동 최종 클릭 검수:**
   - [ ] `InterviewBot.html` 로컬 실행 ➔ 관리자 프리패스 ➔ `산부인과` / `세무사` / `기타 업종` 각각 Step 1~5 실제 클릭 검수 (Sticky Bottom CTA, 더블탭 진행, 불가 기능 검문소 차단 & 대안 선택, 로고·컬러·실사 사진 1~3장 업로드)
   - [ ] 완료 후 `[🚀 조종석에서 바로 열기]` ➔ `LandingBuilder.html`에서 로고(탭 1·탭 2 Hero), 선택 컬러, 첨부 실사 최우선 배치 + 빈 슬롯 AI 실사 자동 생성 ➔ PNG/ZIP 다운로드 최종 확인
2. **② 구글 시트/드라이브 준비 및 `Backend_Proxy.gs` 웹앱 배포:**
   - [ ] 구글 스프레드시트 생성 후 `[승인파트너명단]` 탭(`상호명, 대표자명, 전화번호, 이메일, 승인상태`)에 테스트용 본인 전화번호·이메일 및 `승인상태 = Y` 등록
   - [ ] Apps Script 편집기에 `Backend_Proxy.gs` 코드 붙여넣기 후 `[스크립트 속성]`에 `GEMINI_API_KEY`, `SPREADSHEET_ID`, `GOOGLE_CHAT_WEBHOOK_URL`, `BUILDER_URL` 등록
   - [ ] `[배포] → [새 배포] → 웹 앱` (액세스 권한: `모든 사용자`) 배포 후 생성된 `/exec` URL 확보
3. **③ 카카오 디벨로퍼스 도메인 등록 및 GitHub Pages 실전 온라인 개통:**
   - [ ] 카카오 디벨로퍼스 콘솔에서 웹 플랫폼 도메인(GitHub Pages URL) 등록 및 동의 항목(`profile_nickname`, `account_email`, `phone_number`) 활성화
   - [ ] `InterviewBot.html` 상단 `PARTNER_BOT_CONFIG`의 `KAKAO_JS_KEY`, `BACKEND_PROXY_URL`에 실서비스 값 입력 후 커밋·푸시
   - [ ] GitHub 저장소 `Settings → Pages`에서 `master` 브랜치 배포 활성화 ➔ 실제 스마트폰에서 카카오 1초 인증 ➔ 5단계 제출 ➔ 드라이브 `[파트너접수함]` JSON 저장 & 구글 챗 알림 최종 개통 확인
