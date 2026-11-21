# 🚀 고마워톡 AI 캠페인 빌더 — 5분 실전 배포 & 클라우드 연동 안내서

비개발자도 그대로 따라 하기만 하면 **구글 드라이브 저장 + 구글 시트 관제탑 + 구글 챗 즉시 알림 + GitHub Pages 웹 배포**까지 5분 만에 완성할 수 있는 가이드입니다.

---

## Step 1. 구글 드라이브 폴더 & 구글 시트 준비 (1분)

1. **구글 드라이브**에 접속해 새 폴더 **`파트너접수함`** 을 만듭니다.
   - 폴더에 들어간 뒤 브라우저 주소창의 `/folders/` 뒤 문자열이 **`DRIVE_FOLDER_ID`** 입니다.
   - *(생략해도 `Backend_Proxy.gs`가 자동으로 `파트너접수함` 폴더를 생성합니다.)*
2. **구글 시트**를 새로 만들고 제목을 **`고마워톡 캠페인 관제탑`** 으로 정합니다.
   - 주소창의 `/d/` 와 `/edit` 사이 문자열이 **`SPREADSHEET_ID`** 입니다.
   - *(시트 내부에서 Apps Script를 열면 자동 연결되므로 생략 가능합니다.)*

---

## Step 2. `Backend_Proxy.gs` 붙여넣기 & API 키 등록 (2분)

1. 방금 만든 구글 시트 상단 메뉴에서 **`[확장 프로그램]` → `[Apps Script]`** 를 클릭합니다.
2. 기본 `Code.gs` 내용을 모두 지우고, 로컬 폴더의 [`Backend_Proxy.gs`](Backend_Proxy.gs) 코드 전체를 복사해 붙여넣은 뒤 저장(`Ctrl + S`)합니다.
3. 좌측 톱니바퀴 **`[프로젝트 설정]`** → 맨 아래 **`[스크립트 속성]`** → **`[스크립트 속성 추가]`** 를 눌러 아래 키를 등록합니다.

| 속성 이름 (정확히 입력) | 입력할 값 | 필수 여부 |
| :--- | :--- | :---: |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey)에서 발급받은 Gemini API 키 | **필수** (AI 대화·핀셋 수정용) |
| `GOOGLE_CHAT_WEBHOOK_URL` | 대표님 구글 챗 스페이스 → `[앱 및 통합]` → `[웹훅 추가]` URL | 선택 (신규 접수 즉시 알림용) |
| `DRIVE_FOLDER_ID` | Step 1에서 복사한 `파트너접수함` 폴더 ID | 선택 (비우면 자동 생성) |
| `SPREADSHEET_ID` | Step 1에서 복사한 구글 시트 ID | 선택 (시트에서 열면 자동 인식) |
| `BUILDER_URL` | Step 4에서 배포한 `LandingBuilder.html` 주소 | 선택 (구글 챗 바로가기 링크) |

> 🔒 **보안 안내:** `GEMINI_API_KEY`는 오직 구글 서버(Apps Script 스크립트 속성)에만 보관되며, GitHub에 올라가는 `InterviewBot.html`과 `LandingBuilder.html`에는 절대 노출되지 않습니다.

---

## Step 3. Apps Script 웹앱 배포 & URL 복사 (1분)

1. Apps Script 우측 상단 **`[배포]` → `[새 배포]`** 클릭.
2. 유형 선택(톱니바퀴) → **`웹 앱`** 선택.
3. 설정 확인:
   - **다음 사용자 권한으로 실행:** `나`
   - **액세스 권한이 있는 사용자:** **`모든 사용자`** *(파트너 챗봇이 로그인 없이 제출할 수 있도록 필수 설정)*
4. **`[배포]`** 클릭 → 권한 승인 팝업이 뜨면 `[고급]` → `[안전하지 않은 페이지로 이동]` → `[허용]` 클릭.
5. 생성된 **웹 앱 URL**(`https://script.google.com/macros/s/.../exec`)을 복사해 둡니다.

---

## Step 4. GitHub Pages로 웹 배포하기 (1분)

1. [GitHub](https://github.com)에 로그인해 새 저장소(예: `gomawartalk-ai-builder`)를 생성합니다.
2. GitHub Desktop 또는 터미널로 현재 로컬 폴더(`C:\gomawartalk-ai-builder`)를 원격 저장소에 푸시(`git push`)합니다.
3. GitHub 저장소 상단 **`[Settings]` → 좌측 `[Pages]`**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `master` (또는 `main`) / `/ (root)` → **`[Save]`** 클릭.
4. 약 1분 뒤 아래 3개 URL이 즉시 활성화됩니다:
   - **파트너 배포용 챗봇:** `https://<아이디>.github.io/gomawartalk-ai-builder/InterviewBot.html`
   - **대표님 전용 조종석:** `https://<아이디>.github.io/gomawartalk-ai-builder/LandingBuilder.html`
   - **모바일 웹진 단독 에디터:** `https://<아이디>.github.io/gomawartalk-ai-builder/WebzineBuilder.html`

---

## Step 5. 연동 테스트 체크리스트

1. **조종석 연결:** `LandingBuilder.html` 좌측 `[📥 신규 접수 목록]` 입력칸에 Step 3의 **웹 앱 URL**을 붙여넣고 `[🔄 신규 접수 목록 새로고침]`을 클릭합니다. *(URL은 브라우저에 자동 기억됩니다.)*
2. **파트너 챗봇 연결:** `InterviewBot.html` 우측 상단 `[⚙️ 프록시 연동]`에 동일한 **웹 앱 URL**을 입력합니다.
3. **종단간 테스트:** `InterviewBot.html`에서 Step 0~5 인터뷰를 마친 뒤 `[🚀 제작 요청 제출하기]`를 누르면:
   - 구글 드라이브 `[파트너접수함]`에 `.json` 파일 자동 생성
   - 구글 시트 `파트너캠페인관제탑`에 접수 행 자동 기록
   - 대표님 구글 챗 방으로 `[🚀 신규 캠페인 접수]` 즉시 알림 도착
   - `LandingBuilder.html`에서 `[🔄 새로고침]` 클릭 → 원클릭으로 접수 건 즉시 로드!

---

## 💡 오프라인(로컬 PC) 테스트 팁

- 인터넷이나 Apps Script 연동 전에도 탐색기에서 `LandingBuilder.html`, `WebzineBuilder.html`, `InterviewBot.html`을 **더블클릭(`file://`)** 하면 CORS 오류 없이 모든 기능(이미지 150KB 압축, 썸네일/랜딩/친구톡/캐러셀 캡처, 전체 ZIP, 로컬 JSON 저장/불러오기, 오프라인 RAG 상담, 로컬 시뮬레이션 핀셋 AI)이 100% 작동합니다.
