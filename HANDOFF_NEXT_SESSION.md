# 🤝 다음 세션 인수인계서 (`HANDOFF_NEXT_SESSION.md`)

- **최종 갱신일시:** 2026-11-21 23:45 (KST)
- **기준 버전:** Master PRD V2.1 (`PRD.md` 역방향 동기화 완료)
- **핵심 워크스페이스:** `c:\gomawartalk-ai-builder`

---

## 1. 완료된 기능 (100% 구현 및 브라우저 검증 완료)

### ① 대표님 전용 조종석 (`LandingBuilder.html`)
- **어드민 5대 탭 1:1 미러링 + 상단 별도 대메뉴 `[✨ 모바일 웹진 스튜디오]` (`WebzineBuilder.html` 연동)** 완료
- **`[탭 2]` 마켓컬리·29CM·토스 에디토리얼 리디자인 + 1열 풀와이드(`888px`) & `44px+` 타이포그래피 확정:**
  - **"AI가 짠 촌스러운 디자인(AI 클리셰)" 100% 제거:** 좌측 두꺼운 컬러 세로줄(`border-left`, `[` 모양), 테두리 알약 배지(`.sec-badge`), Hero 타이틀 밑줄(`.hero-accent-line`), 원형/사각형 체크·번호 박스(`.hero-check-icon`, `.pain-icon`, `.sol-num`), 섹션 3 첫 카드 보라 그라데이션 완전 삭제 → 소프트 톤온톤 카드(`#F7F8FA`/`#FFFFFF`, `border-radius: 28px`), 포인트 아이브로우 텍스트(`.sec-eyebrow-txt`, `38px`), 미니멀 체크(`.ed-check`, `44px`), 에디토리얼 넘버링(`.sol-num-typo`, `48px`)으로 전면 리모델링
  - **업종·주제 스마트 에디토리얼 컬러 자동 매칭 (`detectSmartEditorialTheme`):** 식품·유기농(`#1B3B2B`/`#FAF8F5`), 교육·비즈니스(`#182232`/`#F6F7F9`), 뷰티·클래스(`#2C221E`/`#FBF9F6`) 자동 적용 + 좌측 사이드바 3대 에디토리얼 팔레트 원클릭 버튼 추가
  - 2열·3열·4칸 다단 레이아웃 100% 제거, 하단 `'보라색'` 고정 단어 완전 제거, `#lc` 전수 실측 최소 `36px` 유지 (위반 0건)
  - 명품 한글 웹폰트 4종(`GmarketSans`, `S-Core Dream`, `MaruBuri`, `SUITE`) 실시간 전환 & `[📱 모바일 실물(375px)]` 배율에서도 원본 `1,000px` 선명 캡처 복원
- **`[탭 1·2]` 문구-사진 100% 일치 자동 AI 이미지 생성 & Shimmer 로딩 UI:**
  - 커스텀/브릿지 캠페인 로드 즉시 `autoGenerateCampaignVisuals()`가 탭 1 썸네일 + 탭 2 3대 비주얼 슬롯(`888×500`, `888×500`, `888×460`)에 대해 각 섹션 실제 한글 카피 기반 AI 실사 이미지를 백그라운드 자동 생성 (생성 중 Shimmer 로딩 박스 `.vslot-shimmer` / `#t-visual-shimmer` 표시, `data-html2canvas-ignore="true"`)
  - API 키 미연결 시에도 엉뚱한 학원 책상 스톡 대신 캠페인 주제 키워드 매칭 에디토리얼 스톡 풀(`TOPIC_KEYWORD_STOCKS`) 자동 적용
  - `[🎨 AI 이미지 생성]` 모달: 한글 장면 지시 → 실제 `gemini-3.8-flash:generateContent` 영문 상업 사진 프롬프트 직결 변환(가짜 템플릿 폴백 제거, 실패 시 빨간색 실제 에러 표시) + 한글 미반영 상태에서 바로 생성 클릭 시 자동 변환 안전장치 + `[🎨 전체 비주얼 AI 일괄 생성 (3장)]`
  - `[📁 내 사진 업로드]`(자동 비율 크롭 & 압축), `[🔄 추천 스톡 교체]`(`fetch → Blob → DataURL` 변환으로 `html2canvas` CORS 오염/하얀 빈칸 100% 차단)
- **양방향 State 보존:** `contenteditable` 전 항목 `data-f` 양방향 동기화 및 `localStorage` 브릿지 `QuotaExceededError` 방어 완료

### ② 모바일 파트너 인터뷰 봇 (`InterviewBot.html`) & 백엔드 보안 배관 (`Backend_Proxy.gs`)
- **선(先) 파트너 인증 게이트 (`#auth-gate`):**
  - 카카오 공식 JS SDK v2.7.2 연동 + 전화번호 정규화(`+82 10-1234-5678` → `01012345678`) → `Backend_Proxy.gs` `action: "verifyPartner"`로 `[승인파트너명단]` 시트 대조 (비인증자 AI 토큰 소모 100% 차단)
  - 로컬 PC(`file://`, `localhost`) 또는 `?admin=1` 접속 시에만 `[🛠️ 관리자 로컬 테스트 프리패스]` 및 `[🚀 조종석에서 바로 열기]` 노출 (일반 파트너 실배포 시 완전 숨김)
- **모바일 앱 전용 미니멀 UI (`max-width: 480px`, `100dvh`) & 토스식 8단계 1문 1답 스무고개:**
  - 상단 슬림 `질문 N / 8` 진행률 바, 마크다운 `**` 날것 노출 금지(`<strong>` 렌더링)
  - AI 말풍선 110자 이내, 1턴 = 1질문, 내부 전문용어 노출 금지, 단품 선택지 3~4개(22자 이내, Q7 복수 선택 지원)
  - 8단계 완료 → 모바일 요약 카드 확인/채팅 수정 → `[✅ 이대로 제작 요청 제출하기]` 클릭 시 100% 제로베이스 `CampaignMaster.json`(비주얼 슬롯 3종 `imagePrompt` 포함) 생성 & 백엔드 제출

### ③ AI 모델 업그레이드 (`gemini-3.8-flash` & 동적 탐색 폴백)
- 전체 코드베이스(`.html`, `.js`, `.gs`)에서 구형 `gemini-1.5-*`, `gemini-2.0-*`, `gemini-2.5-*` 문자열 0건으로 전면 정리
- 기본 모델 `gemini-3.8-flash` 적용 + 404/모델 종료 시 `GET https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}` 실시간 조회로 최신 텍스트/이미지 생성 모델(`imagen-4*`, `imagen-3*`, 이미지 지원 `gemini-*`) 자동 폴백 완료

---

## 2. 다음 세션 바로 진행할 실전 테스트 및 온라인 개통 체크리스트

1. **Google Apps Script (`Backend_Proxy.gs`) 온라인 배포:**
   - [ ] 구글 스프레드시트 생성 후 `[승인파트너명단]` 탭(`상호명, 대표자명, 전화번호, 이메일, 승인상태`)에 테스트용 본인 전화번호·이메일과 `승인상태 = Y` 등록
   - [ ] Apps Script 편집기에 `Backend_Proxy.gs` 전체 코드 붙여넣기
   - [ ] `[프로젝트 설정] → [스크립트 속성]`에 `GEMINI_API_KEY`, `SPREADSHEET_ID`, `GOOGLE_CHAT_WEBHOOK_URL`, `BUILDER_URL` 등록
   - [ ] `[배포] → [새 배포] → 웹 앱` (액세스 권한: `모든 사용자`) 배포 후 생성된 `https://script.google.com/macros/s/.../exec` URL 확보
2. **카카오 디벨로퍼스 앱 설정 & `InterviewBot.html` 실키 연결:**
   - [ ] 카카오 디벨로퍼스 콘솔에서 웹 플랫폼 도메인(GitHub Pages URL) 등록 및 동의 항목(`profile_nickname`, `account_email`, `phone_number`) 활성화
   - [ ] `InterviewBot.html` 상단 `PARTNER_BOT_CONFIG`의 `KAKAO_JS_KEY`와 `BACKEND_PROXY_URL`에 실서비스 값 입력 후 커밋·푸시
3. **GitHub Pages 배포 및 스마트폰 실기 최종 점검:**
   - [ ] GitHub 저장소 `Settings → Pages`에서 `master` 브랜치 배포 활성화
   - [ ] 실제 스마트폰에서 배포된 `InterviewBot.html` URL 접속 → 카카오 1초 인증(승인/미승인 케이스 각각 확인) → 8단계 스무고개 답변 → 제출 후 구글 드라이브 `[파트너접수함]` JSON 생성 & 구글 챗 알림 수신 확인
   - [ ] 대표님 조종석 `LandingBuilder.html`에서 `[🔄 신규 접수 목록 새로고침]`으로 방금 제출된 캠페인 로드 → `[🎨 전체 비주얼 AI 일괄 생성]` → PNG/ZIP 다운로드 최종 검수
