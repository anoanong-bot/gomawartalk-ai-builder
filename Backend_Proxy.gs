/**
 * Backend_Proxy.gs
 * [클라우드 보안 배관] 고마워톡 AI 캠페인 빌더 Google Apps Script 웹앱 백엔드 (V2.3-1)
 *
 * 주요 기능:
 *   1) 통합 관제탑 시트 자동 초기화 (GAS 편집기에서 관리자 1회 실행)
 *      - setupV23ControlTowerSheet() : 상단 모바일 리모컨(1~3행) + 15컬럼 표준 헤더(4행) + 등급/확정상태 드롭다운 자동 세팅
 *
 *   2) doPost(e)
 *      - action === "verifyUserAndQuota" : 카카오싱크(인가코드/토큰) 검증 + 통합 관제탑 자동 기록 + 등급별 서버단 횟수 강제 검증 (로컬/관리자 프리패스 유지)
 *      - action === "verifyPartner"      : (V2.2 하위 호환) [승인파트너명단] 시트 선인증
 *      - action === "chat"               : 파트너 챗봇 AI 대화 프록시 (API 키 100% 서버 은닉, gemini-3.8-flash 기본 + 실시간 동적 모델 탐색 폴백)
 *      - action === "generate_image"     : 비주얼 슬롯 AI 이미지 생성 프록시 (imagen-4 / imagen-3 폴백)
 *      - action === "pinpoint_edit"      : 대표님 조종석(LandingBuilder.html) 탭별 핀셋 AI 수정 프록시
 *      - action === "submit_campaign"    : 서버단 횟수 검증 -> 드라이브 [파트너접수함] JSON 저장 -> 관제탑 시트 기록 & 횟수 차감 -> 제안서 고유 URL 생성 -> 구글 챗 알림
 *      - action === "confirm_proposal"   : Proposal.html 하단 무인 확정 폼 접수 (세팅확정상태="결제·세팅요청", 1회 수정메모 저장 + Google Chat HUMAN_QA_READY 즉시 알림)
 *      - action === "report_issue"       : 우측 하단 플로팅 위젯 1초 제보 접수 ([파트너제보함] 9컬럼 자동 기록 + 유형 1·2 구글 챗 즉시 알림)
 *      - action === "lookup_partner"     : (V2.2 하위 호환) 파트너 시트 간편 조회
 *
 *   3) doGet(e)
 *      - action === "ping"               : 서버 상태 헬스체크
 *      - action === "list"               : [파트너접수함] 최신 .json 목록 조회 (paidOnly=1 전달 시 유료 고객 전용 필터링)
 *      - action === "list_paid"          : 조종석(LandingBuilder.html) 전용 — 시트 등급이 Starter/Pro인 유료 고객 행만 필터링 + 고객1회수정메모 포함 반환
 *      - action === "load"               : fileId 기준 캠페인 JSON 원문 로드 (조종석용)
 *      - action === "load_proposal"      : Proposal.html 전용 — 드라이브 JSON 로드 후 전화번호/이메일/식별자 등 민감 개인정보 제거 후 반환
 *
 * 스크립트 속성(PropertiesService) 설정 키:
 *   - GEMINI_API_KEY          : (필수) Google AI Studio Gemini API 키
 *   - KAKAO_REST_API_KEY      : (필수) 고마워브라더 카카오싱크 REST API 키
 *   - KAKAO_CLIENT_SECRET     : (선택) 카카오 디벨로퍼스 Client Secret 사용 시 등록
 *   - KAKAO_REDIRECT_URI      : (선택) 카카오싱크 기본 Redirect URI 폴백
 *   - SPREADSHEET_ID          : (필수/권장) 통합 관제탑 구글 스프레드시트 ID (바인딩 스크립트면 자동 인식)
 *   - DRIVE_FOLDER_ID         : (선택) 구글 드라이브 [파트너접수함] 폴더 ID (미설정 시 자동 생성)
 *   - GOOGLE_CHAT_WEBHOOK_URL : (필수/권장) 대표님 구글 챗 스페이스 수신 웹훅 URL
 *   - BUILDER_URL             : (선택) GitHub Pages 배포된 LandingBuilder.html URL
 *   - PROPOSAL_URL            : (필수/권장) GitHub Pages 배포된 Proposal.html 베이스 URL
 *   - ALERT_ON_LEAD_SUBMIT    : (선택) 가망고객 무료 제출 시에도 구글 챗 알림 발송 여부 ("true" | 기본 "false" 침묵 원칙)
 *
 * 주의: Apps Script 구문 안전성을 위해 백틱 문자를 절대 사용하지 않으며, 표준 큰따옴표(")와 + 문자열 결합만 사용합니다.
 */

var FOLDER_NAME_DEFAULT = "파트너접수함";
var SHEET_NAME_CONTROL = "파트너캠페인관제탑";
var SHEET_NAME_HISTORY = "캠페인접수이력";
var SHEET_NAME_REPORTS = "파트너제보함";
var SHEET_NAME_APPROVED_PARTNERS = "승인파트너명단";
var SHEET_NAME_PARTNERS = "파트너목록";
var DEFAULT_GEMINI_MODEL = "models/gemini-3.8-flash";

var TIER_LEAD = "가망고객";
var TIER_STARTER = "Starter";
var TIER_PRO = "Pro";

var CONFIRM_UNCHECKED = "미확인";
var CONFIRM_REQUESTED = "결제·세팅요청";
var CONFIRM_DONE = "세팅완료";

var QUOTA_LIMIT_LEAD_TOTAL = 2;
var QUOTA_LIMIT_STARTER_MONTHLY = 2;
var QUOTA_LIMIT_PRO_MONTHLY = 10;

var CIRCUIT_BREAKER_THRESHOLD = 3;

var CONTROL_HEADERS_V23 = [
  "접수일시",
  "kakao_user_id",
  "실명",
  "전화번호",
  "업종",
  "등급",
  "누적사용횟수",
  "당월사용횟수",
  "최근사용월(YYYY-MM)",
  "제안서고유URL",
  "세팅확정상태",
  "고객1회수정메모",
  "드라이브JSON링크",
  "파일ID",
  "진행상태·회로차단로그",
  "연동플랫폼",
  "잔여크레딧",
  "외부매핑상태"
];

var REPORT_HEADERS_V25 = [
  "접수일시",
  "제보유형",
  "화면·단계",
  "파트너정보",
  "업종·컨텍스트요약",
  "한줄메모",
  "카톡인앱여부",
  "블랙박스JSON",
  "처리상태"
];

var HISTORY_HEADERS_V25 = [
  "접수일시",
  "kakao_user_id",
  "실명",
  "전화번호",
  "등급",
  "회차",
  "업종",
  "제안서고유URL",
  "드라이브JSON링크",
  "파일ID",
  "세팅확정상태",
  "고객수정메모"
];

var HCOL_CREATED_AT = 0;
var HCOL_KAKAO_ID = 1;
var HCOL_REAL_NAME = 2;
var HCOL_PHONE = 3;
var HCOL_TIER = 4;
var HCOL_ROUND = 5;
var HCOL_INDUSTRY = 6;
var HCOL_PROPOSAL_URL = 7;
var HCOL_DRIVE_LINK = 8;
var HCOL_FILE_ID = 9;
var HCOL_CONFIRM_STATUS = 10;
var HCOL_REVISION_MEMO = 11;

// 0-based 컬럼 인덱스 상수
var COL_CREATED_AT = 0;       // A: 접수일시
var COL_KAKAO_ID = 1;         // B: kakao_user_id
var COL_REAL_NAME = 2;        // C: 실명
var COL_PHONE = 3;            // D: 전화번호
var COL_INDUSTRY = 4;         // E: 업종
var COL_TIER = 5;             // F: 등급 (가망고객 / Starter / Pro)
var COL_TOTAL_USED = 6;       // G: 누적사용횟수
var COL_MONTHLY_USED = 7;     // H: 당월사용횟수
var COL_LAST_MONTH = 8;       // I: 최근사용월(YYYY-MM)
var COL_PROPOSAL_URL = 9;     // J: 제안서고유URL
var COL_CONFIRM_STATUS = 10;  // K: 세팅확정상태 (미확인 / 결제·세팅요청 / 세팅완료)
var COL_REVISION_MEMO = 11;   // L: 고객1회수정메모
var COL_DRIVE_LINK = 12;      // M: 드라이브JSON링크
var COL_FILE_ID = 13;         // N: 파일ID
var COL_STATUS_LOG = 14;      // O: 진행상태·회로차단로그
var COL_SOURCE_PLATFORM = 15; // P: 연동플랫폼 (NATIVE / GOOGLE_FORMS / CAFE24 / IMWEB 등)
var COL_CREDIT_BALANCE = 16;  // Q: 잔여크레딧 (본체 구독자 "-", 외부 종량제 앱 잔여 크레딧)
var COL_EXTERNAL_MAPPING = 17;// R: 외부매핑상태 (본체 구독자 "-", 외부 플랫폼 매핑 요약)

/* =========================================================================
 * 공통 유틸리티
 * ========================================================================= */
function getProp_(key, fallback) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  return (val !== null && val !== undefined && String(val).trim() !== "") ? String(val).trim() : (fallback || "");
}

function setProp_(key, val) {
  PropertiesService.getScriptProperties().setProperty(key, String(val));
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getCurrentYearMonth_() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM");
}

function getNowDisplay_() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
}

function getShortNowDisplay_() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm");
}

// 카카오 전화번호(+82 10-1234-5678 / +82 1012345678 / 010-1234-5678) -> 01012345678 정규화
function normalizePhone_(raw) {
  var s = String(raw === null || raw === undefined ? "" : raw).trim();
  var digits = s.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (/^\+?\s*82/.test(s) || digits.indexOf("8210") === 0) {
    digits = digits.replace(/^82/, "");
  }
  if (digits.charAt(0) !== "0") {
    digits = "0" + digits;
  }
  return digits;
}

// 시트 날짜 자동 변환 방지용 YYYY-MM 정규화
function normalizeYearMonth_(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, "Asia/Seoul", "yyyy-MM");
  }
  var s = String(val).trim();
  var m = s.match(/^(\d{4})[-\/\.](\d{1,2})/);
  if (m) {
    var mm = m[2].length === 1 ? ("0" + m[2]) : m[2];
    return m[1] + "-" + mm;
  }
  return s;
}

function normalizeTier_(raw) {
  var s = String(raw === null || raw === undefined ? "" : raw).trim().toLowerCase();
  if (s === "pro") return TIER_PRO;
  if (s === "starter") return TIER_STARTER;
  return TIER_LEAD;
}

function isPaidTier_(tier) {
  var t = normalizeTier_(tier);
  return (t === TIER_STARTER || t === TIER_PRO);
}

function tierRank_(tier) {
  var t = normalizeTier_(tier);
  if (t === TIER_PRO) return 3;
  if (t === TIER_STARTER) return 2;
  return 1;
}

function formatCellTimestamp_(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  }
  return String(val).trim();
}

function isLocalOrAdminBypass_(obj) {
  if (!obj) return false;
  if (obj.adminBypass === true || obj.isAdminBypass === true || obj.isLocalTest === true) {
    return true;
  }
  var adminFlag = String(obj.admin || "").trim().toLowerCase();
  if (adminFlag === "1" || adminFlag === "true") {
    return true;
  }
  var origin = String(obj.origin || obj.clientOrigin || obj.href || "").trim().toLowerCase();
  if (origin && (origin.indexOf("file://") === 0 || origin.indexOf("localhost") !== -1 || origin.indexOf("127.0.0.1") !== -1)) {
    if (obj.bypassAuth === true || obj.localBypass === true) {
      return true;
    }
  }
  return false;
}

function getTokenSigningSecret_() {
  return getProp_("USER_TOKEN_SECRET", "") ||
    getProp_("KAKAO_REST_API_KEY", "") ||
    getProp_("GEMINI_API_KEY", "") ||
    "GOMAWARTALK_V23_DEFAULT_SECRET";
}

function signUserToken_(kakaoUserId, name, phone) {
  var payloadObj = {
    uid: String(kakaoUserId || ""),
    name: String(name || ""),
    phone: normalizePhone_(phone || ""),
    ym: getCurrentYearMonth_()
  };
  var payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payloadObj));
  var sigBytes = Utilities.computeHmacSha256Signature(payloadB64, getTokenSigningSecret_());
  var sigB64 = Utilities.base64EncodeWebSafe(sigBytes);
  return payloadB64 + "." + sigB64;
}

function verifyUserToken_(tokenStr) {
  try {
    var s = String(tokenStr || "").trim();
    var dotIdx = s.indexOf(".");
    if (dotIdx <= 0) return null;
    var payloadB64 = s.slice(0, dotIdx);
    var sigB64 = s.slice(dotIdx + 1);
    var expectedBytes = Utilities.computeHmacSha256Signature(payloadB64, getTokenSigningSecret_());
    var expectedSig = Utilities.base64EncodeWebSafe(expectedBytes);
    if (sigB64 !== expectedSig) return null;
    var decodedBytes = Utilities.base64DecodeWebSafe(payloadB64);
    var jsonText = Utilities.newBlob(decodedBytes).getDataAsString("UTF-8");
    return JSON.parse(jsonText);
  } catch (e) {
    Logger.log("[verifyUserToken_ ERROR] " + e);
    return null;
  }
}

function buildProposalUrl_(fileId) {
  var base = getProp_("PROPOSAL_URL", "");
  if (!base) {
    var builderUrl = getProp_("BUILDER_URL", "");
    if (builderUrl && builderUrl.indexOf("LandingBuilder.html") !== -1) {
      base = builderUrl.replace("LandingBuilder.html", "Proposal.html");
    } else {
      base = "Proposal.html";
    }
  }
  var sep = (base.indexOf("?") === -1) ? "?" : "&";
  return base + sep + "fileId=" + encodeURIComponent(String(fileId || ""));
}

function appendLogEntry_(existingLog, entryText) {
  var prev = String(existingLog || "").trim();
  var line = "[" + getShortNowDisplay_() + "] " + String(entryText || "").trim();
  if (!prev) return line;
  var combined = prev + "\n" + line;
  if (combined.length > 2000) {
    combined = combined.slice(combined.length - 2000);
  }
  return combined;
}

/* =========================================================================
 * 0. 통합 관제탑 시트 스키마 자동 초기화 함수 (관리자 GAS 편집기 1회 실행)
 *    - 1~3행: 상단 모바일 리모컨 호환 대시보드
 *    - 4행: V2.3 표준 15컬럼 헤더
 *    - 5~1000행: 등급(가망고객/Starter/Pro) & 세팅확정상태(미확인/결제·세팅요청/세팅완료) 드롭다운
 * ========================================================================= */
function setupV23ControlTowerSheet() {
  var ss = getControlSpreadsheet_();
  if (!ss) {
    throw new Error("연결된 구글 스프레드시트를 찾을 수 없습니다. 스크립트 속성에 SPREADSHEET_ID를 설정하거나 시트에 바인딩된 스크립트에서 실행해 주세요.");
  }

  var sheet = ss.getSheetByName(SHEET_NAME_CONTROL);
  var isExistingV23 = false;

  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 4) {
      var r4Check = String(sheet.getRange(4, 2).getValue() || "").trim();
      if (r4Check === "kakao_user_id") {
        isExistingV23 = true;
      }
    }
    if (!isExistingV23 && lastRow >= 1) {
      var r1Col1 = String(sheet.getRange(1, 1).getValue() || "").trim();
      var r1Col2 = String(sheet.getRange(1, 2).getValue() || "").trim();
      if (r1Col1 !== "" && r1Col2 !== "kakao_user_id") {
        var backupName = SHEET_NAME_CONTROL + "_V22백업_" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmm");
        sheet.setName(backupName);
        sheet = ss.insertSheet(SHEET_NAME_CONTROL);
      }
    }
  } else {
    sheet = ss.insertSheet(SHEET_NAME_CONTROL);
  }

  var maxCols = CONTROL_HEADERS_V23.length; // 15
  if (sheet.getMaxColumns() < maxCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), maxCols - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < 1000) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 1000 - sheet.getMaxRows());
  }

  // 1~3행: 상단 모바일 리모컨 호환 구조 (스마트폰 요약 지표 + 운영 안내)
  var remoteRows = [
    [
      "고마워톡 AI 캠페인 통합 관제탑 (V2.3)",
      "총 유입",
      "=COUNTA(B5:B)",
      "가망고객",
      "=COUNTIF(F5:F,\"가망고객\")",
      "Starter",
      "=COUNTIF(F5:F,\"Starter\")",
      "Pro",
      "=COUNTIF(F5:F,\"Pro\")",
      "결제·세팅요청",
      "=COUNTIF(K5:K,\"결제·세팅요청\")",
      "세팅완료",
      "=COUNTIF(K5:K,\"세팅완료\")",
      "기준월",
      "=TEXT(TODAY(),\"yyyy-mm\")",
      "외부연동",
      "=COUNTIFS(P5:P,\"<>\",P5:P,\"<>NATIVE\")",
      ""
    ],
    [
      "모바일 리모컨 안내",
      "입금 확인 시 [F열 등급]을 Starter/Pro로 변경 -> 조종석 자동 노출",
      "",
      "세팅 완료 시 [K열 세팅확정상태]를 세팅완료로 변경",
      "",
      "당월 총 생성",
      "=SUMIF(I5:I,TEXT(TODAY(),\"yyyy-mm\"),H5:H)",
      "누적 총 생성",
      "=SUM(G5:G)",
      "회로차단 경고",
      "=COUNTIF(O5:O,\"*CIRCUIT_BREAKER*\")",
      "한도 기준",
      "가망:누적2 / Starter:월2 / Pro:월10",
      "버전",
      "V2.5-0",
      "외부소켓",
      "본체:NATIVE / 외부앱:연동코드",
      ""
    ],
    [
      "빠른 필터/메모 구역",
      "F열 드롭다운: 가망고객 / Starter / Pro",
      "",
      "K열 드롭다운: 미확인 / 결제·세팅요청 / 세팅완료",
      "",
      "주의: 4행 헤더 삭제 금지",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "P~R열: 외부 플랫폼 확장 소켓",
      "",
      ""
    ]
  ];

  sheet.getRange(1, 1, 3, maxCols).setValues(remoteRows);
  sheet.getRange(1, 1, 1, maxCols)
    .setBackground("#0F172A")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setVerticalAlignment("middle");
  sheet.getRange(2, 1, 1, maxCols)
    .setBackground("#EEF2FF")
    .setFontColor("#1E293B")
    .setFontSize(9)
    .setVerticalAlignment("middle");
  sheet.getRange(3, 1, 1, maxCols)
    .setBackground("#F8FAFC")
    .setFontColor("#475569")
    .setFontSize(9)
    .setVerticalAlignment("middle");

  // 4행: 필수 15컬럼 표준 헤더
  sheet.getRange(4, 1, 1, maxCols)
    .setValues([CONTROL_HEADERS_V23])
    .setBackground("#182232")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setRowHeight(1, 32);
  sheet.setRowHeight(2, 26);
  sheet.setRowHeight(3, 22);
  sheet.setRowHeight(4, 30);
  sheet.setFrozenRows(4);

  // 데이터 행(5~1000행) 서식 및 드롭다운 유효성 검사 적용
  var validationEndRow = Math.max(1000, sheet.getMaxRows());
  var dataRowCount = validationEndRow - 4;

  // 텍스트 서식 강제 (전화번호 앞자리 0 손실 방지, YYYY-MM 날짜 오변환 방지, kakao_user_id 지수표기 방지)
  sheet.getRange(5, COL_KAKAO_ID + 1, dataRowCount, 1).setNumberFormat("@");
  sheet.getRange(5, COL_PHONE + 1, dataRowCount, 1).setNumberFormat("@");
  sheet.getRange(5, COL_LAST_MONTH + 1, dataRowCount, 1).setNumberFormat("@");
  sheet.getRange(5, COL_TOTAL_USED + 1, dataRowCount, 2).setNumberFormat("0");

  // F열(등급) 드롭다운: 가망고객 / Starter / Pro
  var tierRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([TIER_LEAD, TIER_STARTER, TIER_PRO], true)
    .setAllowInvalid(false)
    .setHelpText("등급을 선택하세요: 가망고객 / Starter / Pro")
    .build();
  sheet.getRange(5, COL_TIER + 1, dataRowCount, 1).setDataValidation(tierRule);

  // K열(세팅확정상태) 드롭다운: 미확인 / 결제·세팅요청 / 세팅완료
  var confirmRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([CONFIRM_UNCHECKED, CONFIRM_REQUESTED, CONFIRM_DONE], true)
    .setAllowInvalid(false)
    .setHelpText("세팅 확정 상태를 선택하세요: 미확인 / 결제·세팅요청 / 세팅완료")
    .build();
  sheet.getRange(5, COL_CONFIRM_STATUS + 1, dataRowCount, 1).setDataValidation(confirmRule);

  // 컬럼 폭 및 줄바꿈 정리 (A~O 기존 유지 + P~R 외부 플랫폼 확장 3컬럼)
  var colWidths = [155, 130, 95, 125, 130, 100, 95, 95, 120, 220, 125, 260, 220, 200, 280, 120, 100, 140];
  for (var c = 0; c < colWidths.length; c++) {
    sheet.setColumnWidth(c + 1, colWidths[c]);
  }
  sheet.getRange(5, COL_REVISION_MEMO + 1, dataRowCount, 1).setWrap(true);
  sheet.getRange(5, COL_STATUS_LOG + 1, dataRowCount, 1).setWrap(true);

  Logger.log("[setupV23ControlTowerSheet] 통합 관제탑 시트 초기화 완료: " + sheet.getName());
  return {
    ok: true,
    sheetName: sheet.getName(),
    headerRow: 4,
    columns: CONTROL_HEADERS_V23.length,
    existingPreserved: isExistingV23
  };
}

function getControlSpreadsheet_() {
  var ssId = getProp_("SPREADSHEET_ID", "");
  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureControlExtraColumns_(sheet, headerRow) {
  if (!sheet) return;
  try {
    var targetCols = CONTROL_HEADERS_V23.length; // 18 (A~O 기존 15컬럼 + P~R 외부 소켓 3컬럼)
    if (sheet.getMaxColumns && sheet.getMaxColumns() < targetCols) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), targetCols - sheet.getMaxColumns());
    }
    var hRow = headerRow || 4;
    var pHeader = String(sheet.getRange(hRow, COL_SOURCE_PLATFORM + 1).getValue() || "").trim();
    if (!pHeader) {
      var extraHeaders = CONTROL_HEADERS_V23.slice(COL_SOURCE_PLATFORM, targetCols);
      sheet.getRange(hRow, COL_SOURCE_PLATFORM + 1, 1, extraHeaders.length)
        .setValues([extraHeaders])
        .setBackground("#182232")
        .setFontColor("#FFFFFF")
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setVerticalAlignment("middle");
    }
  } catch (e) {
    Logger.log("[ensureControlExtraColumns_ Warning] " + e);
  }
}

function getOrInitControlSheet_() {
  var ss = getControlSpreadsheet_();
  if (!ss) return null;
  var sheet = ss.getSheetByName(SHEET_NAME_CONTROL);
  if (!sheet) {
    setupV23ControlTowerSheet();
    sheet = ss.getSheetByName(SHEET_NAME_CONTROL);
  } else {
    ensureControlExtraColumns_(sheet, detectControlHeaderRow_(sheet));
  }
  return sheet;
}

function detectControlHeaderRow_(sheet) {
  if (!sheet) return 4;
  var lastRow = sheet.getLastRow();
  var scanLimit = Math.min(lastRow, 10);
  if (scanLimit < 1) return 4;
  var vals = sheet.getRange(1, 1, scanLimit, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    var colB = String(vals[i][1] || "").trim();
    if (colB === "kakao_user_id") {
      return i + 1;
    }
  }
  return 4;
}

function ensureRowDropdowns_(sheet, rowNumber) {
  var tierRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([TIER_LEAD, TIER_STARTER, TIER_PRO], true)
    .setAllowInvalid(false)
    .build();
  var confirmRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([CONFIRM_UNCHECKED, CONFIRM_REQUESTED, CONFIRM_DONE], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(rowNumber, COL_KAKAO_ID + 1).setNumberFormat("@");
  sheet.getRange(rowNumber, COL_PHONE + 1).setNumberFormat("@");
  sheet.getRange(rowNumber, COL_LAST_MONTH + 1).setNumberFormat("@");
  sheet.getRange(rowNumber, COL_TIER + 1).setDataValidation(tierRule);
  sheet.getRange(rowNumber, COL_CONFIRM_STATUS + 1).setDataValidation(confirmRule);
}

/* =========================================================================
 * doGet(e) — 조종석 직결 조회 / 유료 전용 목록 / 제안서 안전 로드 / 헬스체크
 * ========================================================================= */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(params.action || "ping").trim();

    if (action === "ping") {
      return jsonResponse_({
        ok: true,
        service: "Gomawartalk Backend_Proxy",
        version: "V2.6-0",
        defaultModel: DEFAULT_GEMINI_MODEL,
        currentMonth: getCurrentYearMonth_(),
        webhookConfigured: !!getGoogleChatWebhookUrl_(),
        timestamp: new Date().toISOString()
      });
    }

    if (action === "list_paid") {
      return jsonResponse_(listPaidCampaigns_());
    }

    if (action === "list") {
      var paidOnly = String(params.paidOnly || "").trim().toLowerCase();
      if (paidOnly === "1" || paidOnly === "true") {
        return jsonResponse_(listPaidCampaigns_());
      }
      return jsonResponse_(listCampaignFiles_());
    }

    if (action === "load") {
      var fileId = String(params.fileId || "").trim();
      if (!fileId) {
        return jsonResponse_({ ok: false, error: "fileId 파라미터가 필요합니다." });
      }
      var file = DriveApp.getFileById(fileId);
      var raw = file.getBlob().getDataAsString("UTF-8");
      return ContentService.createTextOutput(raw).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "load_proposal") {
      var propFileId = String(params.fileId || "").trim();
      if (!propFileId) {
        return jsonResponse_({ ok: false, error: "fileId 파라미터가 필요합니다." });
      }
      return jsonResponse_(handleLoadProposal_(propFileId));
    }

    return jsonResponse_({ ok: false, error: "지원하지 않는 GET action입니다: " + action });
  } catch (err) {
    Logger.log("[doGet ERROR] " + err);
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/* =========================================================================
 * doPost(e) — 카카오싱크 인증·횟수검증 / AI 프록시 / 캠페인 접수 / 무인 확정 폼
 * ========================================================================= */
function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var body = JSON.parse(rawBody);
    var action = String(body.action || "").trim();

    if (action === "verifyUserAndQuota" || action === "verify_user_and_quota" || action === "kakao_auth") {
      return jsonResponse_(verifyUserAndQuota(body));
    }

    if (action === "verifyPartner") {
      return jsonResponse_(handleVerifyPartner_(body));
    }

    if (action === "chat") {
      return jsonResponse_(handleChatProxy_(body));
    }

    if (action === "generate_image") {
      return jsonResponse_(handleGenerateImageProxy_(body));
    }

    if (action === "pinpoint_edit") {
      return jsonResponse_(handlePinpointEdit_(body));
    }

    if (action === "submit_campaign" || action === "save_intake") {
      return jsonResponse_(handleSubmitCampaign_(body));
    }

    if (action === "confirm_proposal") {
      return jsonResponse_(handleConfirmProposal_(body));
    }

    if (action === "report_issue") {
      return jsonResponse_(handleReportIssue_(body));
    }

    if (action === "lookup_partner") {
      return jsonResponse_(handleLookupPartner_(body));
    }

    return jsonResponse_({ ok: false, error: "지원하지 않는 POST action입니다: " + action });
  } catch (err) {
    Logger.log("[doPost ERROR] " + err);
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/* =========================================================================
 * 1. 카카오싱크(Kakao Sync) 인증 & 등급별 횟수 서버단 강제 검증
 * ========================================================================= */
function exchangeKakaoCodeForToken_(authCode, redirectUri) {
  var restApiKey = getProp_("KAKAO_REST_API_KEY", "");
  if (!restApiKey) {
    throw new Error("스크립트 속성에 KAKAO_REST_API_KEY가 설정되지 않았습니다.");
  }
  var resolvedRedirect = String(redirectUri || "").trim() || getProp_("KAKAO_REDIRECT_URI", "");
  if (!resolvedRedirect) {
    throw new Error("카카오싱크 인가 코드 교환에 필요한 redirectUri가 없습니다.");
  }

  var formPayload = {
    grant_type: "authorization_code",
    client_id: restApiKey,
    redirect_uri: resolvedRedirect,
    code: String(authCode || "").trim()
  };
  var clientSecret = getProp_("KAKAO_CLIENT_SECRET", "");
  if (clientSecret) {
    formPayload.client_secret = clientSecret;
  }

  var res = UrlFetchApp.fetch("https://kauth.kakao.com/oauth/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    payload: formPayload,
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    throw new Error("카카오 토큰 교환 실패 (HTTP " + code + "): " + text.slice(0, 200));
  }
  var parsed = JSON.parse(text);
  if (!parsed.access_token) {
    throw new Error("카카오 응답에 access_token이 없습니다.");
  }
  return String(parsed.access_token);
}

function fetchKakaoProfileByAccessToken_(accessToken) {
  var token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("카카오 accessToken이 비어 있습니다.");
  }
  var res = UrlFetchApp.fetch("https://kapi.kakao.com/v2/user/me", {
    method: "get",
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    throw new Error("카카오 사용자 정보 조회 실패 (HTTP " + code + "): " + text.slice(0, 200));
  }

  var data = JSON.parse(text);
  var account = data.kakao_account || {};
  var profile = account.profile || {};
  var props = data.properties || {};

  var kakaoUserId = String(data.id || "").trim();
  if (!kakaoUserId) {
    throw new Error("카카오 사용자 고유 ID(kakao_user_id)를 확인할 수 없습니다.");
  }

  var realName = String(account.name || profile.nickname || props.nickname || "").trim() || "고객님";
  var phone = normalizePhone_(account.phone_number || "");
  var email = String(account.email || "").trim().toLowerCase();

  return {
    kakao_user_id: kakaoUserId,
    name: realName,
    phone: phone,
    email: email
  };
}

function lookupLegacyApprovedTier_(phone, email) {
  try {
    var ss = getControlSpreadsheet_();
    if (!ss) return null;
    var sheet = ss.getSheetByName(SHEET_NAME_APPROVED_PARTNERS);
    if (!sheet) return null;
    var rows = sheet.getDataRange().getValues();
    var normPhone = normalizePhone_(phone || "");
    var normEmail = String(email || "").trim().toLowerCase();

    for (var i = 1; i < rows.length; i++) {
      var rPhone = normalizePhone_(rows[i][2] || "");
      var rEmail = String(rows[i][3] || "").trim().toLowerCase();
      var rStatus = String(rows[i][4] || "").trim().toUpperCase();
      var isApproved = (rStatus === "Y" || rStatus === "승인" || rStatus === "APPROVED" || rStatus === "O");
      if (!isApproved) continue;
      if ((normPhone && rPhone && normPhone === rPhone) || (normEmail && rEmail && normEmail === rEmail)) {
        var planCol = rows[i].length > 5 ? normalizeTier_(rows[i][5]) : TIER_STARTER;
        return (planCol === TIER_PRO) ? TIER_PRO : TIER_STARTER;
      }
    }
  } catch (err) {
    Logger.log("[lookupLegacyApprovedTier_ Warning] " + err);
  }
  return null;
}

function evaluateQuota_(tier, totalUsed, storedMonthlyUsed, lastUsedMonth, currentMonth) {
  var normTier = normalizeTier_(tier);
  var normTotal = parseInt(totalUsed, 10);
  if (isNaN(normTotal) || normTotal < 0) normTotal = 0;

  var normStoredMonthly = parseInt(storedMonthlyUsed, 10);
  if (isNaN(normStoredMonthly) || normStoredMonthly < 0) normStoredMonthly = 0;

  var normLastMonth = normalizeYearMonth_(lastUsedMonth);
  var monthResetApplied = (normLastMonth !== "" && normLastMonth !== currentMonth);
  var effectiveMonthly = (normLastMonth === currentMonth) ? normStoredMonthly : 0;

  var limit = QUOTA_LIMIT_LEAD_TOTAL;
  var used = normTotal;
  var quotaType = "TOTAL";
  var allowed = false;
  var remaining = 0;
  var blockMessage = "";
  var ctaType = "";

  if (normTier === TIER_PRO) {
    limit = QUOTA_LIMIT_PRO_MONTHLY;
    used = effectiveMonthly;
    quotaType = "MONTHLY";
    allowed = (effectiveMonthly < limit);
    remaining = Math.max(0, limit - effectiveMonthly);
    if (!allowed) {
      blockMessage = "이번 달(" + currentMonth + ") Pro 플랜 제작 한도(월 " + limit + "회)를 모두 사용하셨습니다. 다음 달 1일에 이용 횟수가 자동으로 초기화됩니다.";
      ctaType = "WAIT_NEXT_MONTH";
    }
  } else if (normTier === TIER_STARTER) {
    limit = QUOTA_LIMIT_STARTER_MONTHLY;
    used = effectiveMonthly;
    quotaType = "MONTHLY";
    allowed = (effectiveMonthly < limit);
    remaining = Math.max(0, limit - effectiveMonthly);
    if (!allowed) {
      blockMessage = "이번 달(" + currentMonth + ") Starter 플랜 제작 한도(월 " + limit + "회)를 모두 사용하셨습니다. Pro 플랜(월 10회 · 영업일 1일 패스트트랙)으로 업그레이드하거나 다음 달 1일에 이용해 주세요.";
      ctaType = "UPGRADE_TO_PRO";
    }
  } else {
    limit = QUOTA_LIMIT_LEAD_TOTAL;
    used = normTotal;
    quotaType = "TOTAL";
    allowed = (normTotal < limit);
    remaining = Math.max(0, limit - normTotal);
    if (!allowed) {
      blockMessage = "가망고객 무료 캠페인 설계 체험(누적 " + limit + "회)을 모두 사용하셨습니다. 고마워톡 Starter 또는 Pro 플랜을 도입하시면 매월 전문가 세팅을 이용하실 수 있습니다.";
      ctaType = "UPGRADE_FROM_LEAD";
    }
  }

  return {
    tier: normTier,
    quotaType: quotaType,
    limit: limit,
    used: used,
    remaining: remaining,
    allowed: allowed,
    totalUsed: normTotal,
    monthlyUsed: effectiveMonthly,
    lastUsedMonth: normLastMonth || currentMonth,
    currentMonth: currentMonth,
    monthResetApplied: monthResetApplied,
    message: allowed ? "이용 가능합니다." : blockMessage,
    ctaType: ctaType
  };
}

function isValidPhoneForMatch_(normPhone) {
  var p = normalizePhone_(normPhone || "");
  if (!p || p.length < 9) return false;
  if (p === "01000000000" || p === "00000000000" || /^0+$/.test(p)) return false;
  return true;
}

function getOrCreateHistorySheet_() {
  var ss = getControlSpreadsheet_();
  if (!ss) return null;
  var sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_HISTORY);
    var colCount = HISTORY_HEADERS_V25.length; // 12
    if (sheet.getMaxColumns && sheet.getMaxColumns() < colCount) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colCount - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, colCount)
      .setValues([HISTORY_HEADERS_V25])
      .setBackground("#182232")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    if (sheet.setFrozenRows) sheet.setFrozenRows(1);
    var widths = [155, 130, 95, 125, 95, 70, 140, 220, 220, 200, 125, 250];
    for (var i = 0; i < widths.length; i++) {
      if (sheet.setColumnWidth) sheet.setColumnWidth(i + 1, widths[i]);
    }
  }
  return sheet;
}

function appendCampaignHistoryRow_(entry) {
  try {
    var hSheet = getOrCreateHistorySheet_();
    if (!hSheet) return -1;
    var rowNum = Math.max(2, hSheet.getLastRow() + 1);
    var rowVals = [
      String(entry.createdAt || getNowDisplay_()),
      String(entry.kakaoUserId || ""),
      String(entry.realName || ""),
      String(entry.phone || ""),
      normalizeTier_(entry.tier),
      Number(entry.round) || 1,
      String(entry.industry || ""),
      String(entry.proposalUrl || ""),
      String(entry.driveLink || ""),
      String(entry.fileId || ""),
      String(entry.confirmStatus || CONFIRM_UNCHECKED),
      String(entry.revisionMemo || "")
    ];
    hSheet.getRange(rowNum, 1, 1, HISTORY_HEADERS_V25.length).setValues([rowVals]);
    try {
      hSheet.getRange(rowNum, HCOL_KAKAO_ID + 1).setNumberFormat("@");
      hSheet.getRange(rowNum, HCOL_PHONE + 1).setNumberFormat("@");
    } catch (fmtErr) {}
    return rowNum;
  } catch (err) {
    Logger.log("[appendCampaignHistoryRow_ Warning] " + err);
    return -1;
  }
}

/* =========================================================================
 * 기존 중복 행 자동 병합 정리 (1인 1행 Strict Upsert 보증)
 *  - 동일 kakao_user_id (또는 유효 전화번호) 중복 행들을 스캔
 *  - 최신 데이터 + 최고 등급(Pro>Starter>가망고객) + 실제 생성 횟수(단순 합산 금지) + 통합 로그로 1행 병합 후 중복 행 삭제
 * ========================================================================= */
function deduplicateControlTowerRows_(sheet, headerRow) {
  var result = { mergedGroups: 0, deletedRows: 0 };
  if (!sheet) return result;
  try {
    var hRow = headerRow || detectControlHeaderRow_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow <= hRow + 1) return result;

    var numRows = lastRow - hRow;
    var colCount = CONTROL_HEADERS_V23.length;
    var values = sheet.getRange(hRow + 1, 1, numRows, colCount).getValues();

    var groups = [];
    var uidToGroup = {};
    var phoneToGroup = {};

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rUid = String(row[COL_KAKAO_ID] || "").trim();
      var rPhone = normalizePhone_(row[COL_PHONE] || "");
      var hasValidPhone = isValidPhoneForMatch_(rPhone);
      if (!rUid && !hasValidPhone) continue;

      var gIdx = -1;
      if (rUid && uidToGroup.hasOwnProperty(rUid)) {
        gIdx = uidToGroup[rUid];
      } else if (hasValidPhone && phoneToGroup.hasOwnProperty(rPhone)) {
        gIdx = phoneToGroup[rPhone];
      }

      if (gIdx === -1) {
        gIdx = groups.length;
        groups.push({ items: [] });
      }
      groups[gIdx].items.push({ rowNum: hRow + 1 + i, row: row });
      if (rUid) uidToGroup[rUid] = gIdx;
      if (hasValidPhone) phoneToGroup[rPhone] = gIdx;
    }

    var rowsToDelete = [];

    for (var g = 0; g < groups.length; g++) {
      var items = groups[g].items;
      if (items.length <= 1) continue;

      result.mergedGroups++;
      var keepItem = items[0];
      var latestItem = items[items.length - 1];
      var merged = latestItem.row.slice(0, colCount);
      while (merged.length < colCount) merged.push("");

      var bestTier = TIER_LEAD;
      var maxTotal = 0;
      var latestMonth = "";
      var latestMonthly = 0;
      var distinctFiles = {};
      var distinctFileCount = 0;
      var bestUid = "";
      var bestName = "";
      var bestPhone = "";
      var bestIndustry = "";
      var bestProposalUrl = "";
      var bestDriveLink = "";
      var bestFileId = "";
      var bestPlatform = "NATIVE";
      var bestCredit = "-";
      var bestExtMap = "-";
      var combinedLogs = [];

      for (var k = 0; k < items.length; k++) {
        var r = items[k].row;
        var uid = String(r[COL_KAKAO_ID] || "").trim();
        var nm = String(r[COL_REAL_NAME] || "").trim();
        var ph = normalizePhone_(r[COL_PHONE] || "");
        var ind = String(r[COL_INDUSTRY] || "").trim();
        var tr = normalizeTier_(r[COL_TIER]);
        var tot = parseInt(r[COL_TOTAL_USED], 10);
        if (isNaN(tot) || tot < 0) tot = 0;
        var mon = normalizeYearMonth_(r[COL_LAST_MONTH]);
        var mUsed = parseInt(r[COL_MONTHLY_USED], 10);
        if (isNaN(mUsed) || mUsed < 0) mUsed = 0;
        var fid = String(r[COL_FILE_ID] || "").trim();
        var purl = String(r[COL_PROPOSAL_URL] || "").trim();
        var dlink = String(r[COL_DRIVE_LINK] || "").trim();
        var slog = String(r[COL_STATUS_LOG] || "").trim();
        var plat = String(r[COL_SOURCE_PLATFORM] || "").trim();
        var cred = r[COL_CREDIT_BALANCE];
        var extm = String(r[COL_EXTERNAL_MAPPING] || "").trim();

        if (uid && (!bestUid || uid.indexOf("LEGACY_") !== 0)) bestUid = uid;
        if (nm && nm !== "고객님" && nm !== "대표님") bestName = nm;
        else if (nm && !bestName) bestName = nm;
        if (isValidPhoneForMatch_(ph)) bestPhone = ph;
        else if (ph && !bestPhone) bestPhone = ph;
        if (ind) bestIndustry = ind;
        if (tierRank_(tr) > tierRank_(bestTier)) bestTier = tr;
        if (tot > maxTotal) maxTotal = tot;
        if (fid && !distinctFiles[fid]) {
          distinctFiles[fid] = true;
          distinctFileCount++;
        }
        if (fid) {
          bestFileId = fid;
          if (purl) bestProposalUrl = purl;
          if (dlink) bestDriveLink = dlink;
        }
        if (!latestMonth || mon > latestMonth) {
          latestMonth = mon;
          latestMonthly = mUsed;
        } else if (mon === latestMonth && mUsed > latestMonthly) {
          latestMonthly = mUsed;
        }
        if (plat && plat !== "NATIVE") bestPlatform = plat;
        if (cred !== "" && cred !== null && cred !== undefined && cred !== "-") bestCredit = cred;
        if (extm && extm !== "-") bestExtMap = extm;
        if (slog) combinedLogs.push(slog);
      }

      // 실제 생성 횟수: 기존 최대값과 고유 파일ID 수 중 큰 값 사용 (단순 합산 뻥튀기 원천 차단)
      var accurateTotal = Math.max(maxTotal, distinctFileCount);
      var accurateMonthly = Math.min(accurateTotal, Math.max(latestMonthly, (latestMonth === getCurrentYearMonth_() && distinctFileCount > 0 && latestMonthly === 0) ? 1 : latestMonthly));

      merged[COL_KAKAO_ID] = bestUid || merged[COL_KAKAO_ID];
      merged[COL_REAL_NAME] = bestName || merged[COL_REAL_NAME];
      merged[COL_PHONE] = bestPhone || merged[COL_PHONE];
      merged[COL_INDUSTRY] = bestIndustry || merged[COL_INDUSTRY];
      merged[COL_TIER] = bestTier;
      merged[COL_TOTAL_USED] = accurateTotal;
      merged[COL_MONTHLY_USED] = accurateMonthly;
      merged[COL_LAST_MONTH] = latestMonth || getCurrentYearMonth_();
      merged[COL_PROPOSAL_URL] = bestProposalUrl || merged[COL_PROPOSAL_URL];
      merged[COL_DRIVE_LINK] = bestDriveLink || merged[COL_DRIVE_LINK];
      merged[COL_FILE_ID] = bestFileId || merged[COL_FILE_ID];
      merged[COL_SOURCE_PLATFORM] = bestPlatform || "NATIVE";
      merged[COL_CREDIT_BALANCE] = bestCredit;
      merged[COL_EXTERNAL_MAPPING] = bestExtMap;

      var mergedLogText = combinedLogs.join("\n");
      if (mergedLogText.length > 1700) {
        mergedLogText = mergedLogText.slice(mergedLogText.length - 1700);
      }
      merged[COL_STATUS_LOG] = appendLogEntry_(
        mergedLogText,
        "자동정리: 동일인 중복 행 " + items.length + "건 1인1행 병합 완료 (등급:" + bestTier + " / 누적:" + accurateTotal + "회)"
      );

      sheet.getRange(keepItem.rowNum, 1, 1, colCount).setValues([merged]);
      ensureRowDropdowns_(sheet, keepItem.rowNum);

      for (var d = 1; d < items.length; d++) {
        rowsToDelete.push(items[d].rowNum);
      }
    }

    // 아래 행부터 역순 삭제하여 인덱스 밀림 방지
    rowsToDelete.sort(function (a, b) { return b - a; });
    for (var delIdx = 0; delIdx < rowsToDelete.length; delIdx++) {
      if (typeof sheet.deleteRow === "function") {
        sheet.deleteRow(rowsToDelete[delIdx]);
        result.deletedRows++;
      }
    }
  } catch (err) {
    Logger.log("[deduplicateControlTowerRows_ Warning] " + err);
  }
  return result;
}

function findUserRowsInControlSheet_(sheet, headerRow, kakaoUserId, normPhone) {
  var result = {
    matchedIndices: [],
    latestRowNumber: -1,
    openEmptyFileRowNumber: -1,
    bestTier: TIER_LEAD,
    maxTotalUsed: 0,
    latestMonthlyUsed: 0,
    latestLastMonth: "",
    latestRowValues: null
  };

  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) {
    return result;
  }

  var numRows = lastRow - headerRow;
  var values = sheet.getRange(headerRow + 1, 1, numRows, CONTROL_HEADERS_V23.length).getValues();
  var targetUid = String(kakaoUserId || "").trim();
  var targetPhone = normalizePhone_(normPhone || "");
  var targetPhoneValid = isValidPhoneForMatch_(targetPhone);

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rUid = String(row[COL_KAKAO_ID] || "").trim();
    var rPhone = normalizePhone_(row[COL_PHONE] || "");

    var uidMatch = (targetUid !== "" && rUid !== "" && rUid === targetUid);
    var phoneMatch = (targetPhoneValid && isValidPhoneForMatch_(rPhone) && rPhone === targetPhone);
    if (!uidMatch && !phoneMatch) continue;

    var sheetRowNum = headerRow + 1 + i;
    result.matchedIndices.push(sheetRowNum);
    result.latestRowNumber = sheetRowNum;
    result.latestRowValues = row;

    var rFileId = String(row[COL_FILE_ID] || "").trim();
    if (!rFileId && result.openEmptyFileRowNumber === -1) {
      result.openEmptyFileRowNumber = sheetRowNum;
    }

    var rTier = normalizeTier_(row[COL_TIER]);
    if (tierRank_(rTier) > tierRank_(result.bestTier)) {
      result.bestTier = rTier;
    }

    var rTotal = parseInt(row[COL_TOTAL_USED], 10);
    if (!isNaN(rTotal) && rTotal > result.maxTotalUsed) {
      result.maxTotalUsed = rTotal;
    }

    var rMonth = normalizeYearMonth_(row[COL_LAST_MONTH]);
    var rMonthly = parseInt(row[COL_MONTHLY_USED], 10);
    if (isNaN(rMonthly) || rMonthly < 0) rMonthly = 0;

    if (!result.latestLastMonth || rMonth > result.latestLastMonth) {
      result.latestLastMonth = rMonth;
      result.latestMonthlyUsed = rMonthly;
    } else if (rMonth === result.latestLastMonth && rMonthly > result.latestMonthlyUsed) {
      result.latestMonthlyUsed = rMonthly;
    }
  }

  return result;
}

/**
 * 카카오싱크 인증 & 등급별 횟수 서버단 강제 검증 엔트리포인트
 * 지원 입력:
 *  - 로컬/관리자 프리패스: adminBypass=true / isLocalTest=true / admin="1"
 *  - 카카오 인가 코드: code + redirectUri (KAKAO_REST_API_KEY로 토큰 교환 -> 사용자 조회)
 *  - 카카오 액세스 토큰: accessToken (kapi /v2/user/me 검증)
 *  - 기발급 서명 세션 토큰: userToken (재진입 시 한도 재조회)
 */
function verifyUserAndQuota(body) {
  var req = body || {};
  var currentMonth = getCurrentYearMonth_();

  // 1) 기존 로컬 테스트용 localhost / file:// / ?admin=1 프리패스 우회 유지
  if (isLocalOrAdminBypass_(req)) {
    var adminName = String(req.name || req.owner_name || "관리자(로컬테스트)").trim();
    var adminPhone = normalizePhone_(req.phone || "01000000000");
    var adminUid = "ADMIN_LOCAL_TEST";
    return {
      ok: true,
      verified: true,
      isAdminBypass: true,
      allowed: true,
      userToken: signUserToken_(adminUid, adminName, adminPhone),
      user: {
        kakao_user_id: adminUid,
        name: adminName,
        phone: adminPhone,
        email: ""
      },
      quota: {
        tier: TIER_PRO,
        quotaType: "MONTHLY",
        limit: 999,
        used: 0,
        remaining: 999,
        allowed: true,
        totalUsed: 0,
        monthlyUsed: 0,
        lastUsedMonth: currentMonth,
        currentMonth: currentMonth,
        monthResetApplied: false,
        message: "관리자/로컬 테스트 프리패스로 인증되었습니다.",
        ctaType: ""
      }
    };
  }

  // 2) 카카오싱크 인가 코드 / 액세스 토큰 / 서명 세션 토큰에서 사용자 신원 확보
  var profile = null;
  if (req.code) {
    var exchangedToken = exchangeKakaoCodeForToken_(req.code, req.redirectUri);
    profile = fetchKakaoProfileByAccessToken_(exchangedToken);
  } else if (req.accessToken) {
    profile = fetchKakaoProfileByAccessToken_(req.accessToken);
  } else if (req.userToken) {
    var decoded = verifyUserToken_(req.userToken);
    if (!decoded || !decoded.uid) {
      return {
        ok: false,
        verified: false,
        allowed: false,
        error: "세션 토큰이 유효하지 않습니다. 카카오싱크로 다시 로그인해 주세요."
      };
    }
    profile = {
      kakao_user_id: String(decoded.uid),
      name: String(decoded.name || "고객님"),
      phone: normalizePhone_(decoded.phone || ""),
      email: ""
    };
  } else {
    return {
      ok: false,
      verified: false,
      allowed: false,
      error: "카카오싱크 인증 정보(code 또는 accessToken)가 필요합니다."
    };
  }

  // 3) 통합 관제탑 시트 조회/자동 기록 및 서버단 횟수 계산
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(10000);
  try {
    var sheet = getOrInitControlSheet_();
    if (!sheet) {
      return {
        ok: false,
        verified: false,
        allowed: false,
        error: "통합 관제탑 구글 시트가 연결되지 않았습니다. SPREADSHEET_ID를 확인해 주세요."
      };
    }

    var headerRow = detectControlHeaderRow_(sheet);
    deduplicateControlTowerRows_(sheet, headerRow);
    var lookup = findUserRowsInControlSheet_(sheet, headerRow, profile.kakao_user_id, profile.phone);
    var nowStr = getNowDisplay_();
    var tier = TIER_LEAD;
    var totalUsed = 0;
    var monthlyUsed = 0;
    var lastMonth = currentMonth;

    if (lookup.matchedIndices.length === 0) {
      // 신규 유입자 -> 기존 [승인파트너명단] 이력이 있으면 해당 유료 등급 승계, 없으면 가망고객
      var legacyTier = lookupLegacyApprovedTier_(profile.phone, profile.email);
      tier = legacyTier || TIER_LEAD;
      var newRowNum = Math.max(headerRow + 1, sheet.getLastRow() + 1);
      var initialRow = [
        nowStr,
        profile.kakao_user_id,
        profile.name,
        profile.phone,
        String(req.industry || "").trim(),
        tier,
        0,
        0,
        currentMonth,
        "",
        CONFIRM_UNCHECKED,
        "",
        "",
        "",
        appendLogEntry_("", "카카오싱크 최초 인증 (" + tier + ")"),
        String(req.source_platform || "NATIVE").trim() || "NATIVE",
        "-",
        "-"
      ];
      sheet.getRange(newRowNum, 1, 1, CONTROL_HEADERS_V23.length).setValues([initialRow]);
      ensureRowDropdowns_(sheet, newRowNum);
    } else {
      tier = lookup.bestTier;
      totalUsed = lookup.maxTotalUsed;
      monthlyUsed = lookup.latestMonthlyUsed;
      lastMonth = lookup.latestLastMonth || currentMonth;

      // 실명/전화번호/kakao_user_id 보강 및 월 변경 시 당월사용횟수 0 자동 리셋 반영
      var targetRowNum = lookup.latestRowNumber;
      var latestRow = lookup.latestRowValues;
      if (!String(latestRow[COL_KAKAO_ID] || "").trim() && profile.kakao_user_id) {
        sheet.getRange(targetRowNum, COL_KAKAO_ID + 1).setNumberFormat("@").setValue(profile.kakao_user_id);
      }
      if (profile.name && (!String(latestRow[COL_REAL_NAME] || "").trim() || String(latestRow[COL_REAL_NAME]).trim() === "고객님")) {
        sheet.getRange(targetRowNum, COL_REAL_NAME + 1).setValue(profile.name);
      }
      if (profile.phone && !normalizePhone_(latestRow[COL_PHONE] || "")) {
        sheet.getRange(targetRowNum, COL_PHONE + 1).setNumberFormat("@").setValue(profile.phone);
      }

      if (lastMonth !== currentMonth && isPaidTier_(tier)) {
        for (var m = 0; m < lookup.matchedIndices.length; m++) {
          var rNum = lookup.matchedIndices[m];
          sheet.getRange(rNum, COL_MONTHLY_USED + 1).setValue(0);
          sheet.getRange(rNum, COL_LAST_MONTH + 1).setNumberFormat("@").setValue(currentMonth);
        }
        monthlyUsed = 0;
        lastMonth = currentMonth;
      }
    }

    var quota = evaluateQuota_(tier, totalUsed, monthlyUsed, lastMonth, currentMonth);
    var userToken = signUserToken_(profile.kakao_user_id, profile.name, profile.phone);

    return {
      ok: true,
      verified: true,
      isAdminBypass: false,
      allowed: quota.allowed,
      userToken: userToken,
      user: {
        kakao_user_id: profile.kakao_user_id,
        name: profile.name,
        phone: profile.phone,
        email: profile.email
      },
      quota: quota
    };
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

/* =========================================================================
 * 2. V2.2 하위 호환: [승인파트너명단] 시트 선인증 게이트
 * ========================================================================= */
function handleVerifyPartner_(body) {
  var normPhone = normalizePhone_(body.phone || "");
  var normEmail = String(body.email || "").trim().toLowerCase();
  var nickname = String(body.nickname || "").trim();

  var ss = getControlSpreadsheet_();
  if (!ss) {
    return {
      verified: false,
      message: "관제탑 구글 시트가 연결되지 않았습니다. 관리자에게 SPREADSHEET_ID 설정을 요청해 주세요."
    };
  }

  var sheet = ss.getSheetByName(SHEET_NAME_APPROVED_PARTNERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_APPROVED_PARTNERS);
    sheet.appendRow(["상호명", "대표자명", "전화번호", "이메일", "승인상태"]);
  }

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rBizName = String(rows[i][0] || "").trim();
    var rOwnerName = String(rows[i][1] || "").trim();
    var rPhone = normalizePhone_(rows[i][2] || "");
    var rEmail = String(rows[i][3] || "").trim().toLowerCase();
    var rStatus = String(rows[i][4] || "").trim().toUpperCase();

    var isApproved = (rStatus === "Y" || rStatus === "승인" || rStatus === "APPROVED" || rStatus === "O");
    if (!isApproved) continue;

    var phoneMatch = (normPhone !== "" && rPhone !== "" && normPhone === rPhone);
    var emailMatch = (normEmail !== "" && rEmail !== "" && normEmail === rEmail);

    if (phoneMatch || emailMatch) {
      var tokenRaw = (rPhone || rEmail) + "|" + rBizName + "|" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd");
      var token = Utilities.base64EncodeWebSafe(tokenRaw);
      return {
        verified: true,
        partnerToken: token,
        partnerInfo: {
          businessName: rBizName || (nickname ? nickname + " 채널" : "고마워톡 파트너"),
          ownerName: rOwnerName || nickname || "대표님",
          phone: rPhone || normPhone,
          email: rEmail || normEmail
        }
      };
    }
  }

  return {
    verified: false,
    message: "사전 승인된 고마워톡 파트너 전용 서비스입니다. 담당자에게 파트너 등록을 요청해 주세요."
  };
}

/* =========================================================================
 * 3. 드라이브 [파트너접수함] 폴더 확보 & 파일 목록 조회 (전체 / 유료 전용)
 * ========================================================================= */
function getOrCreateIntakeFolder_() {
  var folderId = getProp_("DRIVE_FOLDER_ID", "");
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log("[DRIVE_FOLDER_ID 조회 실패, 기본 폴더 탐색] " + e);
    }
  }
  var iter = DriveApp.getFoldersByName(FOLDER_NAME_DEFAULT);
  if (iter.hasNext()) {
    return iter.next();
  }
  return DriveApp.createFolder(FOLDER_NAME_DEFAULT);
}

function listCampaignFiles_() {
  var folder = getOrCreateIntakeFolder_();
  var files = folder.getFiles();
  var list = [];
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (name.slice(-5).toLowerCase() !== ".json") continue;
    var created = f.getDateCreated();
    list.push({
      id: f.getId(),
      fileId: f.getId(),
      name: name,
      createdTime: Utilities.formatDate(created, "Asia/Seoul", "yyyy-MM-dd HH:mm"),
      ts: created.getTime()
    });
  }
  list.sort(function (a, b) { return b.ts - a.ts; });
  return {
    ok: true,
    paidOnly: false,
    folderName: folder.getName(),
    files: list.slice(0, 50)
  };
}

/**
 * doGet(action=list_paid) 및 doGet(action=list&paidOnly=1)
 * 조종석(LandingBuilder.html) 전용: 시트에서 등급이 Starter 또는 Pro인 유료 고객 행만 필터링하여
 * 고객1회수정메모, 세팅확정상태, 등급 등과 함께 반환
 */
function listPaidCampaigns_() {
  var sheet = getOrInitControlSheet_();
  if (!sheet) {
    return {
      ok: false,
      paidOnly: true,
      error: "통합 관제탑 시트를 찾을 수 없습니다.",
      files: []
    };
  }

  var headerRow = detectControlHeaderRow_(sheet);
  deduplicateControlTowerRows_(sheet, headerRow);
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) {
    return {
      ok: true,
      paidOnly: true,
      count: 0,
      files: []
    };
  }

  // 드라이브 파일명/생성시각 매핑을 1회 패스로 구축 (N+1 조회 방지)
  var fileMetaMap = {};
  try {
    var folder = getOrCreateIntakeFolder_();
    var iter = folder.getFiles();
    while (iter.hasNext()) {
      var f = iter.next();
      var fId = f.getId();
      fileMetaMap[fId] = {
        name: f.getName(),
        ts: f.getDateCreated().getTime(),
        createdTime: Utilities.formatDate(f.getDateCreated(), "Asia/Seoul", "yyyy-MM-dd HH:mm")
      };
    }
  } catch (driveErr) {
    Logger.log("[listPaidCampaigns_ Drive Map Warning] " + driveErr);
  }

  var rows = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, CONTROL_HEADERS_V23.length).getValues();
  var paidList = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var tier = normalizeTier_(row[COL_TIER]);
    if (!isPaidTier_(tier)) continue;

    var fileId = String(row[COL_FILE_ID] || "").trim();
    if (!fileId) continue;

    var fMeta = fileMetaMap[fileId] || null;
    var realName = String(row[COL_REAL_NAME] || "").trim();
    var industry = String(row[COL_INDUSTRY] || "").trim();
    var createdDisplay = formatCellTimestamp_(row[COL_CREATED_AT]) || (fMeta ? fMeta.createdTime : "");
    var fallbackName = "[" + tier + "] " + (realName || "파트너") + (industry ? ("_" + industry) : "") + ".json";
    var tsVal = fMeta ? fMeta.ts : (new Date(createdDisplay.replace(" ", "T")).getTime() || (i + 1));

    paidList.push({
      id: fileId,
      fileId: fileId,
      name: fMeta ? fMeta.name : fallbackName,
      createdTime: createdDisplay,
      ts: tsVal,
      tier: tier,
      ownerName: realName,
      phone: normalizePhone_(row[COL_PHONE] || ""),
      industry: industry,
      totalUsed: parseInt(row[COL_TOTAL_USED], 10) || 0,
      monthlyUsed: parseInt(row[COL_MONTHLY_USED], 10) || 0,
      lastUsedMonth: normalizeYearMonth_(row[COL_LAST_MONTH]),
      proposalUrl: String(row[COL_PROPOSAL_URL] || "").trim(),
      confirmStatus: String(row[COL_CONFIRM_STATUS] || CONFIRM_UNCHECKED).trim(),
      revisionMemo: String(row[COL_REVISION_MEMO] || "").trim(),
      driveLink: String(row[COL_DRIVE_LINK] || "").trim(),
      statusLog: String(row[COL_STATUS_LOG] || "").trim(),
      sheetRow: headerRow + 1 + i
    });
  }

  paidList.sort(function (a, b) { return b.ts - a.ts; });

  return {
    ok: true,
    paidOnly: true,
    count: paidList.length,
    files: paidList.slice(0, 100)
  };
}

/* =========================================================================
 * 4. Proposal.html 전용 안전 로드 (doGet?action=load_proposal&fileId=...)
 *    드라이브 JSON에서 고객 전화번호/이메일/식별자 등 민감 개인정보 제거 후 반환
 * ========================================================================= */
function sanitizeProposalCampaignJson_(campaignObj) {
  var cloned = JSON.parse(JSON.stringify(campaignObj || {}));
  var piiKeys = [
    "phone", "phone_number", "phoneNumber", "mobile", "tel", "contact",
    "email", "kakao_user_id", "kakaoUserId", "userToken", "partnerToken"
  ];

  for (var i = 0; i < piiKeys.length; i++) {
    var k = piiKeys[i];
    if (cloned.hasOwnProperty(k)) {
      delete cloned[k];
    }
    if (cloned.partner_info && cloned.partner_info.hasOwnProperty(k)) {
      delete cloned.partner_info[k];
    }
    if (cloned.meta && cloned.meta.hasOwnProperty(k)) {
      delete cloned.meta[k];
    }
    if (cloned.auth && cloned.auth.hasOwnProperty(k)) {
      delete cloned.auth[k];
    }
  }

  if (cloned.auth) {
    delete cloned.auth;
  }

  return cloned;
}

function handleLoadProposal_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var rawText = file.getBlob().getDataAsString("UTF-8");
  var parsed = JSON.parse(rawText);
  var sanitized = sanitizeProposalCampaignJson_(parsed);

  // 시트에서 비민감 제안서 상태 메타데이터 보강
  var proposalMeta = {
    fileId: fileId,
    tier: TIER_LEAD,
    confirmStatus: CONFIRM_UNCHECKED,
    hasRevisionMemo: false,
    createdAt: Utilities.formatDate(file.getDateCreated(), "Asia/Seoul", "yyyy-MM-dd HH:mm")
  };

  try {
    var sheet = getOrInitControlSheet_();
    if (sheet) {
      var headerRow = detectControlHeaderRow_(sheet);
      var lastRow = sheet.getLastRow();
      if (lastRow > headerRow) {
        var rows = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, CONTROL_HEADERS_V23.length).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][COL_FILE_ID] || "").trim() === fileId) {
            proposalMeta.tier = normalizeTier_(rows[i][COL_TIER]);
            proposalMeta.confirmStatus = String(rows[i][COL_CONFIRM_STATUS] || CONFIRM_UNCHECKED).trim();
            proposalMeta.hasRevisionMemo = (String(rows[i][COL_REVISION_MEMO] || "").trim() !== "");
            proposalMeta.createdAt = formatCellTimestamp_(rows[i][COL_CREATED_AT]) || proposalMeta.createdAt;
            break;
          }
        }
      }
    }
    // 메인 관제탑에 없는 이전 회차 fileId인 경우 [캠페인접수이력] 보조 탭에서 조회
    var hSheetMeta = getControlSpreadsheet_() ? getControlSpreadsheet_().getSheetByName(SHEET_NAME_HISTORY) : null;
    if (hSheetMeta && hSheetMeta.getLastRow() > 1) {
      var hRows = hSheetMeta.getRange(2, 1, hSheetMeta.getLastRow() - 1, HISTORY_HEADERS_V25.length).getValues();
      for (var hi = hRows.length - 1; hi >= 0; hi--) {
        if (String(hRows[hi][HCOL_FILE_ID] || "").trim() === fileId) {
          proposalMeta.tier = normalizeTier_(hRows[hi][HCOL_TIER]);
          proposalMeta.confirmStatus = String(hRows[hi][HCOL_CONFIRM_STATUS] || CONFIRM_UNCHECKED).trim();
          proposalMeta.hasRevisionMemo = (String(hRows[hi][HCOL_REVISION_MEMO] || "").trim() !== "");
          proposalMeta.createdAt = formatCellTimestamp_(hRows[hi][HCOL_CREATED_AT]) || proposalMeta.createdAt;
          break;
        }
      }
    }
  } catch (metaErr) {
    Logger.log("[handleLoadProposal_ Meta Warning] " + metaErr);
  }

  return {
    ok: true,
    fileId: fileId,
    campaign: sanitized,
    proposalMeta: proposalMeta
  };
}

/* =========================================================================
 * 5. 캠페인 접수 처리: 서버단 횟수 강제 검증 -> 드라이브 저장 -> 시트 기록 -> 알림
 * ========================================================================= */
function handleSubmitCampaign_(body) {
  var req = body || {};
  var payload = req.payload ? req.payload : req;
  var partner = payload.partner_info || {};
  var meta = payload.meta || {};
  var authInfo = req.auth || payload.auth || {};

  var isAdminBypass = isLocalOrAdminBypass_(req) || isLocalOrAdminBypass_(payload) || isLocalOrAdminBypass_(authInfo);

  // 서명 토큰 또는 전달 필드에서 사용자 식별자 해석
  var kakaoUserId = String(req.kakao_user_id || authInfo.kakao_user_id || partner.kakao_user_id || "").trim();
  var ownerName = String(req.name || authInfo.name || partner.owner_name || "대표님").trim();
  var normPhone = normalizePhone_(req.phone || authInfo.phone || partner.phone || "");

  if (req.userToken || authInfo.userToken) {
    var decoded = verifyUserToken_(req.userToken || authInfo.userToken);
    if (decoded) {
      if (decoded.uid) kakaoUserId = String(decoded.uid);
      if (decoded.name && (!ownerName || ownerName === "대표님")) ownerName = String(decoded.name);
      if (decoded.phone && !normPhone) normPhone = normalizePhone_(decoded.phone);
      if (kakaoUserId === "ADMIN_LOCAL_TEST") {
        isAdminBypass = true;
      }
    }
  }

  if (!kakaoUserId && isAdminBypass) {
    kakaoUserId = "ADMIN_LOCAL_TEST";
  }

  var now = new Date();
  var tsFile = Utilities.formatDate(now, "Asia/Seoul", "yyyyMMdd_HHmmss");
  var tsDisplay = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  var currentMonth = getCurrentYearMonth_();

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(10000);
  var savedFile = null;
  var fileName = "";
  var proposalUrl = "";
  var driveUrl = "";
  var userTier = TIER_LEAD;
  var updatedQuota = null;

  try {
    var sheet = getOrInitControlSheet_();
    var headerRow = sheet ? detectControlHeaderRow_(sheet) : 4;
    if (sheet) {
      deduplicateControlTowerRows_(sheet, headerRow);
    }
    var lookup = (sheet && (kakaoUserId || normPhone))
      ? findUserRowsInControlSheet_(sheet, headerRow, kakaoUserId, normPhone)
      : null;

    var currentTotalUsed = lookup ? lookup.maxTotalUsed : 0;
    var currentMonthlyUsed = lookup ? lookup.latestMonthlyUsed : 0;
    var lastUsedMonth = lookup ? lookup.latestLastMonth : "";

    if (lookup && lookup.matchedIndices.length > 0) {
      userTier = lookup.bestTier;
    } else if (isAdminBypass) {
      userTier = TIER_PRO;
    } else {
      var legacyTier = lookupLegacyApprovedTier_(normPhone, partner.email || "");
      userTier = legacyTier || TIER_LEAD;
    }

    // (1) 서버단 등급별 횟수 강제 검증 (관리자 로컬 프리패스 제외)
    if (!isAdminBypass) {
      var preQuota = evaluateQuota_(userTier, currentTotalUsed, currentMonthlyUsed, lastUsedMonth, currentMonth);
      if (!preQuota.allowed) {
        return {
          ok: false,
          quotaExceeded: true,
          tier: preQuota.tier,
          quota: preQuota,
          error: preQuota.message,
          ctaType: preQuota.ctaType
        };
      }
    }

    // (2) 구글 드라이브 [파트너접수함]에 .json 파일 저장 (구글 시트 50,000자 셀 한계 우회)
    var chName = String(partner.channel_name || "미지정채널").replace(/[\\\/:*?"<>|\s]+/g, "_");
    var safeOwner = String(ownerName || "대표님").replace(/[\\\/:*?"<>|\s]+/g, "_");
    fileName = tsFile + "_" + chName + "_" + safeOwner + ".json";

    var folder = getOrCreateIntakeFolder_();
    var jsonStr = JSON.stringify(payload, null, 2);
    savedFile = folder.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
    var fileId = savedFile.getId();
    driveUrl = savedFile.getUrl();
    proposalUrl = buildProposalUrl_(fileId);

    // (3) 횟수 차감 및 통합 관제탑 15컬럼 시트 기록
    var nextTotalUsed = currentTotalUsed + 1;
    var effectivePrevMonthly = (normalizeYearMonth_(lastUsedMonth) === currentMonth) ? currentMonthlyUsed : 0;
    var nextMonthlyUsed = effectivePrevMonthly + 1;
    var industryDisplay = String(
      partner.sub_industry || partner.industry_label || partner.industry_code || ""
    ).trim();

    var writeRowNum = -1;
    if (sheet) {
      try {
        var logText = appendLogEntry_(
          "",
          "캠페인 JSON 저장 완료 (" + userTier + " / 누적 " + nextTotalUsed + "회 · 당월 " + nextMonthlyUsed + "회)"
        );

        var sourcePlatformVal = String(payload.source_platform || "NATIVE").trim() || "NATIVE";
        var creditBalanceVal = (payload.credit_balance !== null && payload.credit_balance !== undefined && String(payload.credit_balance).trim() !== "")
          ? payload.credit_balance
          : "-";
        var extMappingVal = (payload.external_mapping !== null && payload.external_mapping !== undefined && String(payload.external_mapping).trim() !== "")
          ? (typeof payload.external_mapping === "string" ? payload.external_mapping : JSON.stringify(payload.external_mapping))
          : "-";

        var resolvedUid = kakaoUserId || ("LEGACY_" + (normPhone || tsFile));
        var resolvedName = ownerName;
        var resolvedPhone = normPhone || String(partner.phone || "");

        var rowData = [
          tsDisplay,
          resolvedUid,
          resolvedName,
          resolvedPhone,
          industryDisplay,
          userTier,
          nextTotalUsed,
          nextMonthlyUsed,
          currentMonth,
          proposalUrl,
          CONFIRM_UNCHECKED,
          "",
          driveUrl,
          fileId,
          logText,
          sourcePlatformVal,
          creditBalanceVal,
          extMappingVal
        ];

        // 1인 1행 Strict Upsert: 기존 동일인 행이 있으면 무조건 제자리 업데이트 (등급 보존 + 이전 이력 로그 누적)
        if (lookup && lookup.matchedIndices.length > 0) {
          writeRowNum = lookup.matchedIndices[0];
          var prevRow = sheet.getRange(writeRowNum, 1, 1, CONTROL_HEADERS_V23.length).getValues()[0];
          var existingUid = String(prevRow[COL_KAKAO_ID] || "").trim();
          var existingName = String(prevRow[COL_REAL_NAME] || "").trim();
          var existingPhone = normalizePhone_(prevRow[COL_PHONE] || "");
          var existingTier = normalizeTier_(prevRow[COL_TIER]);
          var existingFileId = String(prevRow[COL_FILE_ID] || "").trim();
          var existingConfirm = String(prevRow[COL_CONFIRM_STATUS] || "").trim();
          var existingMemo = String(prevRow[COL_REVISION_MEMO] || "").trim();
          var existingLog = String(prevRow[COL_STATUS_LOG] || "");

          if (existingUid && (!kakaoUserId || kakaoUserId.indexOf("LEGACY_") === 0)) {
            rowData[COL_KAKAO_ID] = existingUid;
            resolvedUid = existingUid;
          }
          if (existingName && existingName !== "고객님" && existingName !== "대표님" && (!resolvedName || resolvedName === "대표님" || resolvedName === "고객님")) {
            rowData[COL_REAL_NAME] = existingName;
            resolvedName = existingName;
          }
          if (isValidPhoneForMatch_(existingPhone) && !isValidPhoneForMatch_(resolvedPhone)) {
            rowData[COL_PHONE] = existingPhone;
            resolvedPhone = existingPhone;
          }
          // 관리자가 지정한 기존 유료 등급은 절대 가망고객으로 초기화하지 않고 보존
          if (tierRank_(existingTier) > tierRank_(rowData[COL_TIER])) {
            rowData[COL_TIER] = existingTier;
            userTier = existingTier;
          }

          var logSummary = "캠페인 JSON 저장 완료 (" + userTier + " / 누적 " + nextTotalUsed + "회 · 당월 " + nextMonthlyUsed + "회 / fileId:" + fileId + ")";
          if (existingFileId && existingFileId !== fileId) {
            logSummary = "이전회차 아카이브(fileId:" + existingFileId + ", 상태:" + (existingConfirm || CONFIRM_UNCHECKED) + (existingMemo ? (", 메모:" + existingMemo.slice(0, 40)) : "") + ") -> " + logSummary;
          }
          rowData[COL_STATUS_LOG] = appendLogEntry_(existingLog, logSummary);
          sheet.getRange(writeRowNum, 1, 1, CONTROL_HEADERS_V23.length).setValues([rowData]);
        } else {
          writeRowNum = Math.max(headerRow + 1, sheet.getLastRow() + 1);
          sheet.getRange(writeRowNum, 1, 1, CONTROL_HEADERS_V23.length).setValues([rowData]);
        }
        ensureRowDropdowns_(sheet, writeRowNum);

        // 회차별 제안서·JSON 링크 보존용 보조 탭 [캠페인접수이력]에 건별 1행 기록
        appendCampaignHistoryRow_({
          createdAt: tsDisplay,
          kakaoUserId: resolvedUid,
          realName: resolvedName,
          phone: resolvedPhone,
          tier: userTier,
          round: nextTotalUsed,
          industry: industryDisplay,
          proposalUrl: proposalUrl,
          driveLink: driveUrl,
          fileId: fileId,
          confirmStatus: CONFIRM_UNCHECKED,
          revisionMemo: ""
        });
      } catch (sheetErr) {
        Logger.log("[Sheet Log Warning] " + sheetErr);
      }
    }

    updatedQuota = evaluateQuota_(userTier, nextTotalUsed, nextMonthlyUsed, currentMonth, currentMonth);
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }

  // (4) 구글 챗 즉시 알림 — 가망고객·Starter·Pro 등급 구분 없이 신규 인터뷰 접수 시 무조건 즉시 발송
  sendGoogleChatAlert_(partner, meta, fileName, savedFile.getId(), userTier, proposalUrl, writeRowNum);

  return {
    ok: true,
    fileId: savedFile.getId(),
    fileName: fileName,
    driveUrl: driveUrl,
    proposalUrl: proposalUrl,
    createdAt: tsDisplay,
    tier: userTier,
    isPaid: isPaidTier_(userTier),
    quota: updatedQuota
  };
}

/* =========================================================================
 * 6. Proposal.html 하단 무인 확정 폼 처리 (doPost action="confirm_proposal")
 *    - 시트 해당 행을 "결제·세팅요청"으로 업데이트 & 1회 수정 메모 저장
 *    - 침묵 원칙을 깨고 Google Chat 스페이스 웹훅(HUMAN_QA_READY) 즉시 알림 발송
 * ========================================================================= */
function handleConfirmProposal_(body) {
  var req = body || {};
  var fileId = String(req.fileId || "").trim();
  if (!fileId) {
    return { ok: false, error: "fileId가 필요합니다." };
  }

  var rawPlan = String(req.selectedPlan || req.plan || req.requestedPlan || TIER_STARTER).trim();
  var selectedPlan = (rawPlan.toLowerCase().indexOf("pro") !== -1) ? TIER_PRO : TIER_STARTER;

  var rawMode = String(req.settingMode || req.mode || "AS_IS").trim().toUpperCase();
  var memoInput = String(req.revisionMemo || req.memo || req.editMemo || "").trim();
  var isEditMode = (rawMode === "EDIT_ONCE" || rawMode === "EDIT" || rawMode === "MODIFY" || memoInput !== "");
  var modeLabel = isEditMode ? "1회 수정 메모 포함" : "제안서 시나리오 그대로 세팅";

  var storedMemo = isEditMode
    ? ("[희망플랜: " + selectedPlan + "] " + (memoInput || "일부 문구 수정 요청"))
    : ("[희망플랜: " + selectedPlan + "] 제안서 시나리오 그대로 세팅 요청");

  var customerName = String(req.name || req.ownerName || "").trim();
  var customerPhone = normalizePhone_(req.phone || "");
  var customerIndustry = String(req.industry || "").trim();
  var currentTier = TIER_LEAD;
  var proposalUrl = buildProposalUrl_(fileId);
  var driveLink = "";
  var matchedRowNum = -1;

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(10000);
  try {
    var sheet = getOrInitControlSheet_();
    if (!sheet) {
      return { ok: false, error: "통합 관제탑 시트를 찾을 수 없습니다." };
    }

    var headerRow = detectControlHeaderRow_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow > headerRow) {
      var rows = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, CONTROL_HEADERS_V23.length).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][COL_FILE_ID] || "").trim() === fileId) {
          matchedRowNum = headerRow + 1 + i;
          customerName = String(rows[i][COL_REAL_NAME] || "").trim() || customerName || "고객님";
          customerPhone = normalizePhone_(rows[i][COL_PHONE] || "") || customerPhone;
          customerIndustry = String(rows[i][COL_INDUSTRY] || "").trim() || customerIndustry;
          currentTier = normalizeTier_(rows[i][COL_TIER]);
          proposalUrl = String(rows[i][COL_PROPOSAL_URL] || "").trim() || proposalUrl;
          driveLink = String(rows[i][COL_DRIVE_LINK] || "").trim();

          var prevLog = String(rows[i][COL_STATUS_LOG] || "");
          var nextLog = appendLogEntry_(
            prevLog,
            "HUMAN_QA_READY 확정 접수 (" + selectedPlan + " / " + modeLabel + ")"
          );

          sheet.getRange(matchedRowNum, COL_CONFIRM_STATUS + 1).setValue(CONFIRM_REQUESTED);
          sheet.getRange(matchedRowNum, COL_REVISION_MEMO + 1).setValue(storedMemo);
          sheet.getRange(matchedRowNum, COL_STATUS_LOG + 1).setValue(nextLog);
          break;
        }
      }
    }

    var matchedHistoryRowNum = -1;
    var historyOwnerUid = "";
    var hSheet = getControlSpreadsheet_() ? getControlSpreadsheet_().getSheetByName(SHEET_NAME_HISTORY) : null;
    if (hSheet && hSheet.getLastRow() > 1) {
      var hVals = hSheet.getRange(2, 1, hSheet.getLastRow() - 1, HISTORY_HEADERS_V25.length).getValues();
      for (var hi = hVals.length - 1; hi >= 0; hi--) {
        if (String(hVals[hi][HCOL_FILE_ID] || "").trim() === fileId) {
          matchedHistoryRowNum = 2 + hi;
          historyOwnerUid = String(hVals[hi][HCOL_KAKAO_ID] || "").trim();
          if (matchedRowNum === -1) {
            customerName = String(hVals[hi][HCOL_REAL_NAME] || "").trim() || customerName || "고객님";
            customerPhone = normalizePhone_(hVals[hi][HCOL_PHONE] || "") || customerPhone;
            customerIndustry = String(hVals[hi][HCOL_INDUSTRY] || "").trim() || customerIndustry;
            currentTier = normalizeTier_(hVals[hi][HCOL_TIER]);
            proposalUrl = String(hVals[hi][HCOL_PROPOSAL_URL] || "").trim() || proposalUrl;
            driveLink = String(hVals[hi][HCOL_DRIVE_LINK] || "").trim() || driveLink;
          }
          hSheet.getRange(matchedHistoryRowNum, HCOL_CONFIRM_STATUS + 1).setValue(CONFIRM_REQUESTED);
          hSheet.getRange(matchedHistoryRowNum, HCOL_REVISION_MEMO + 1).setValue(storedMemo);
          break;
        }
      }
    }

    // 이전 회차 fileId가 [캠페인접수이력]에서 확정된 경우, 메인 관제탑 동일인 행 로그에도 누적 반영
    if (matchedRowNum === -1 && matchedHistoryRowNum !== -1 && historyOwnerUid) {
      var ownerLookup = findUserRowsInControlSheet_(sheet, headerRow, historyOwnerUid, customerPhone);
      if (ownerLookup && ownerLookup.matchedIndices.length > 0) {
        matchedRowNum = ownerLookup.matchedIndices[0];
        var ownerPrevLog = String(sheet.getRange(matchedRowNum, COL_STATUS_LOG + 1).getValue() || "");
        var ownerNextLog = appendLogEntry_(
          ownerPrevLog,
          "이전회차 HUMAN_QA_READY 확정 (fileId:" + fileId + " / " + selectedPlan + " / " + modeLabel + ")"
        );
        sheet.getRange(matchedRowNum, COL_CONFIRM_STATUS + 1).setValue(CONFIRM_REQUESTED);
        sheet.getRange(matchedRowNum, COL_REVISION_MEMO + 1).setValue(storedMemo);
        sheet.getRange(matchedRowNum, COL_STATUS_LOG + 1).setValue(ownerNextLog);
      }
    }

    if (matchedRowNum === -1 && matchedHistoryRowNum === -1) {
      return {
        ok: false,
        error: "해당 fileId(" + fileId + ")에 일치하는 관제탑 또는 접수이력 행을 찾을 수 없습니다."
      };
    }
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }

  // 침묵 원칙 해제 -> 대표님 Google Chat 스페이스 웹훅(HUMAN_QA_READY) 즉시 알림 발송
  var webhookResult = sendHumanQaReadyAlert_({
    fileId: fileId,
    sheetRow: matchedRowNum,
    customerName: customerName,
    customerPhone: customerPhone,
    industry: customerIndustry,
    currentTier: currentTier,
    selectedPlan: selectedPlan,
    modeLabel: modeLabel,
    revisionMemo: storedMemo,
    proposalUrl: proposalUrl,
    driveLink: driveLink
  });

  return {
    ok: true,
    fileId: fileId,
    confirmStatus: CONFIRM_REQUESTED,
    selectedPlan: selectedPlan,
    settingMode: isEditMode ? "EDIT_ONCE" : "AS_IS",
    revisionMemo: storedMemo,
    webhookNotified: webhookResult.ok
  };
}

/* =========================================================================
 * 7. Google Chat 웹훅 & 3회 연속 에러 회로 차단기 (Silent Circuit Breaker)
 *    웹훅 오류가 발생해도 시트/드라이브 저장은 100% 성공 처리
 * ========================================================================= */
function getGoogleChatWebhookUrl_() {
  var primary = String(getProp_("GOOGLE_CHAT_WEBHOOK_URL", "") || "").trim();
  if (primary) return primary;
  var alias1 = String(getProp_("GCHAT_WEBHOOK_URL", "") || "").trim();
  if (alias1) return alias1;
  var alias2 = String(getProp_("CHAT_WEBHOOK_URL", "") || "").trim();
  if (alias2) return alias2;
  return "";
}

function postGoogleChatWebhook_(textMessage, sheetRowForLog) {
  try {
    var webhookUrl = getGoogleChatWebhookUrl_();
    if (!webhookUrl) {
      var missingMsg = "[⚠️구글챗미발송: 스크립트속성 GOOGLE_CHAT_WEBHOOK_URL 미등록]";
      Logger.log("[GoogleChat] " + missingMsg);
      if (sheetRowForLog && sheetRowForLog > 0) {
        try {
          var sheet = getOrInitControlSheet_();
          if (sheet) {
            var prevCell = String(sheet.getRange(sheetRowForLog, COL_STATUS_LOG + 1).getValue() || "");
            sheet.getRange(sheetRowForLog, COL_STATUS_LOG + 1).setValue(appendLogEntry_(prevCell, missingMsg));
          }
        } catch (logErr) {
          Logger.log("[GoogleChat Missing Log Warning] " + logErr);
        }
      }
      return { ok: false, skipped: true, reason: "WEBHOOK_URL_MISSING" };
    }

    var res = UrlFetchApp.fetch(webhookUrl, {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      payload: JSON.stringify({ text: textMessage }),
      muteHttpExceptions: true
    });

    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      setProp_("WEBHOOK_CONSECUTIVE_ERRORS", "0");
      return { ok: true, code: code };
    }

    return recordCircuitBreakerError_("WEBHOOK", "HTTP " + code + " " + res.getContentText().slice(0, 120), sheetRowForLog);
  } catch (chatErr) {
    Logger.log("[GoogleChat Circuit Breaker] 웹훅 발송 실패(무시됨): " + chatErr);
    return recordCircuitBreakerError_("WEBHOOK", String(chatErr.message || chatErr), sheetRowForLog);
  }
}

function recordCircuitBreakerError_(channelName, errSummary, sheetRowForLog) {
  try {
    var propKey = channelName + "_CONSECUTIVE_ERRORS";
    var prevCount = parseInt(getProp_(propKey, "0"), 10);
    if (isNaN(prevCount) || prevCount < 0) prevCount = 0;
    var nextCount = prevCount + 1;
    setProp_(propKey, String(nextCount));

    var isTripped = (nextCount >= CIRCUIT_BREAKER_THRESHOLD);
    var logLabel = isTripped
      ? ("CIRCUIT_BREAKER [" + channelName + "] " + nextCount + "회 연속 오류: " + errSummary)
      : ("WARN [" + channelName + "] 오류(" + nextCount + "/" + CIRCUIT_BREAKER_THRESHOLD + "): " + errSummary);

    Logger.log("[" + channelName + " ERROR TRACKER] " + logLabel);

    if (sheetRowForLog && sheetRowForLog > 0) {
      var sheet = getOrInitControlSheet_();
      if (sheet) {
        var prevCell = String(sheet.getRange(sheetRowForLog, COL_STATUS_LOG + 1).getValue() || "");
        sheet.getRange(sheetRowForLog, COL_STATUS_LOG + 1).setValue(appendLogEntry_(prevCell, logLabel));
      }
    }

    return { ok: false, tripped: isTripped, consecutiveErrors: nextCount };
  } catch (trackerErr) {
    Logger.log("[recordCircuitBreakerError_ ERROR] " + trackerErr);
    return { ok: false, tripped: false };
  }
}

function sendGoogleChatAlert_(partner, meta, fileName, fileId, tier, proposalUrl, sheetRowForLog) {
  try {
    var builderUrl = getProp_("BUILDER_URL", "LandingBuilder.html");
    var ss = getControlSpreadsheet_();
    var sheetUrl = ss ? ss.getUrl() : "";
    var brandName = String((meta && meta.brand_name) || (partner && partner.channel_name) || "상호 미입력").trim();
    var industryText = String((partner && (partner.sub_industry || partner.sector_label || partner.industry_code)) || "-").trim();
    var flowText = String((partner && (partner.flow_title || partner.track_id)) || "").trim();
    var industryFlow = flowText ? (industryText + " / " + flowText) : industryText;

    var text =
      "🔔 [신규 인터뷰 접수 — 24시간 내 제안서 검토·발송 대기]\n" +
      "- 상호·브랜드명: " + brandName + "\n" +
      "- 파트너: " + ((partner && partner.owner_name) || "-") + " (" + ((partner && partner.phone) || "-") + ") · 등급: [" + (tier || TIER_LEAD) + "]\n" +
      "- 업종·선택 흐름: " + industryFlow + "\n" +
      "- 제안서 검수 링크: " + (proposalUrl || buildProposalUrl_(fileId)) + "\n" +
      "- 관제탑 시트 바로가기: " + (sheetUrl || "스프레드시트 직접 열기") + "\n" +
      "- 대표님 조종석: " + builderUrl + "\n" +
      "- 저장 파일: " + fileName + " (ID: " + fileId + ")";

    return postGoogleChatWebhook_(text, sheetRowForLog || -1);
  } catch (chatErr) {
    Logger.log("[sendGoogleChatAlert_ Circuit Breaker] " + chatErr);
    return { ok: false };
  }
}

function sendHumanQaReadyAlert_(info) {
  try {
    var builderUrl = getProp_("BUILDER_URL", "LandingBuilder.html");
    var ss = getControlSpreadsheet_();
    var sheetUrl = ss ? ss.getUrl() : "";

    var text =
      "🚀 [세팅 확정 신청 도착] [HUMAN_QA_READY]\n" +
      "- 고객명: " + (info.customerName || "-") + " (" + (info.customerPhone || "-") + ")\n" +
      "- 업종: " + (info.industry || "-") + "\n" +
      "- 현재 시트 등급: " + (info.currentTier || TIER_LEAD) + " -> 희망 요금제: " + (info.selectedPlan || TIER_STARTER) + "\n" +
      "- 세팅 방식: " + (info.modeLabel || "-") + "\n" +
      "- 고객 1회 수정 메모: " + (info.revisionMemo || "-") + "\n" +
      "- 제안서 URL: " + (info.proposalUrl || "-") + "\n" +
      "- 드라이브 JSON: " + (info.driveLink || info.fileId || "-") + "\n" +
      "- 조치 안내: 입금 확인 후 시트 " + info.sheetRow + "행 [등급]을 " + info.selectedPlan + "(으)로 변경하면 조종석에 즉시 노출됩니다.\n" +
      "- 관제탑 시트: " + (sheetUrl || "스프레드시트 직접 열기") + "\n" +
      "- 대표님 조종석: " + builderUrl;

    return postGoogleChatWebhook_(text, info.sheetRow);
  } catch (err) {
    Logger.log("[sendHumanQaReadyAlert_ Circuit Breaker] " + err);
    return { ok: false };
  }
}

/* =========================================================================
 * 7-B. 우측 하단 플로팅 위젯 1초 블랙박스 제보 수집 (doPost action="report_issue")
 *      - [파트너제보함] 시트 탭 미존재 시 9컬럼 헤더 자동 생성 후 1행 기록
 *      - 제보유형 1(AI 문구 불일치) / 2(버튼·화면 오류) 시 구글 챗 즉시 요약 푸시
 * ========================================================================= */
function getOrCreateReportSheet_() {
  var ss = getControlSpreadsheet_();
  if (!ss) return null;
  var sheet = ss.getSheetByName(SHEET_NAME_REPORTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_REPORTS);
    var colCount = REPORT_HEADERS_V25.length; // 9
    if (sheet.getMaxColumns && sheet.getMaxColumns() < colCount) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), colCount - sheet.getMaxColumns());
    }
    sheet.getRange(1, 1, 1, colCount)
      .setValues([REPORT_HEADERS_V25])
      .setBackground("#182232")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    if (sheet.setFrozenRows) sheet.setFrozenRows(1);
    var widths = [155, 165, 130, 150, 240, 240, 100, 320, 95];
    for (var i = 0; i < widths.length; i++) {
      if (sheet.setColumnWidth) sheet.setColumnWidth(i + 1, widths[i]);
    }
  }
  return sheet;
}

function handleReportIssue_(body) {
  body = body || {};
  var tsDisplay = getNowDisplay_();
  var reasonType = String(body.reasonType || body.reason_type || "general").trim();
  var reasonLabel = String(body.reasonLabel || body.reason_label || reasonType || "기타 제보").trim();
  var memo = String(body.memo || "").trim();

  var snapObj = body.blackbox_snapshot || body.blackboxSnapshot || {};
  if (typeof snapObj === "string") {
    try {
      snapObj = JSON.parse(snapObj);
    } catch (parseErr) {
      snapObj = { raw: snapObj };
    }
  }
  if (!snapObj || typeof snapObj !== "object") {
    snapObj = {};
  }

  var pageName = String(snapObj.page || body.page || "Unknown").trim();
  var stepVal = String(snapObj.step !== undefined && snapObj.step !== null ? snapObj.step : "").trim();
  var pageAndStep = stepVal ? (pageName + " / " + stepVal) : pageName;

  var pObj = snapObj.partner || {};
  var partnerParts = [];
  if (pObj.name) partnerParts.push(String(pObj.name));
  if (pObj.tier) partnerParts.push("[" + String(pObj.tier) + "]");
  if (pObj.kakao_user_id) partnerParts.push("id:" + String(pObj.kakao_user_id));
  var partnerInfo = partnerParts.join(" ") || "-";

  var ctxParts = [];
  if (snapObj.sector) ctxParts.push("분야:" + String(snapObj.sector));
  if (snapObj.rawSubIndustry) ctxParts.push("원문:" + String(snapObj.rawSubIndustry));
  if (snapObj.cleanLabel) ctxParts.push("정제:" + String(snapObj.cleanLabel));
  if (snapObj.selectedFlow) ctxParts.push("흐름:" + String(snapObj.selectedFlow));
  if (snapObj.currentQuestion) ctxParts.push("질문:" + String(snapObj.currentQuestion));
  if (snapObj.fileId) ctxParts.push("fileId:" + String(snapObj.fileId));
  if (snapObj.channelName) ctxParts.push("채널:" + String(snapObj.channelName));
  var contextSummary = ctxParts.join(" | ").slice(0, 500) || "-";

  var isInAppBool = !!(snapObj.isKakaoInApp || snapObj.kakaoInApp);
  var kakaoInAppLabel = isInAppBool ? "Y (카톡인앱)" : "N";
  var blackboxJsonStr = "";
  try {
    blackboxJsonStr = JSON.stringify(snapObj);
    if (blackboxJsonStr.length > 45000) {
      blackboxJsonStr = blackboxJsonStr.slice(0, 45000) + "...(truncated)";
    }
  } catch (serErr) {
    blackboxJsonStr = "{}";
  }

  var rowNumber = -1;
  var sheetSaved = false;
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(8000);
  try {
    var rSheet = getOrCreateReportSheet_();
    if (rSheet) {
      rowNumber = Math.max(2, rSheet.getLastRow() + 1);
      var rowValues = [
        tsDisplay,
        reasonLabel,
        pageAndStep,
        partnerInfo,
        contextSummary,
        memo || "(메모 없음)",
        kakaoInAppLabel,
        blackboxJsonStr,
        "접수"
      ];
      rSheet.getRange(rowNumber, 1, 1, REPORT_HEADERS_V25.length).setValues([rowValues]);
      sheetSaved = true;
    }
  } catch (sheetErr) {
    Logger.log("[handleReportIssue_ Sheet Warning] " + sheetErr);
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }

  var isUrgentType = (
    reasonType === "ai_mismatch" ||
    reasonType === "ui_bug" ||
    reasonType === "1" ||
    reasonType === "2" ||
    reasonLabel.indexOf("안 맞") !== -1 ||
    reasonLabel.indexOf("이상해") !== -1
  );
  var notified = false;
  if (isUrgentType) {
    try {
      var chatMsg =
        "🚨 [파트너 현장 제보] 파트너 현장 제보 도착\n" +
        "- 제보유형: " + reasonLabel + "\n" +
        "- 화면·단계: " + pageAndStep + "\n" +
        "- 파트너: " + partnerInfo + "\n" +
        "- 업종·컨텍스트: " + contextSummary + "\n" +
        "- 한줄메모: " + (memo || "(미입력)") + "\n" +
        "- 카톡인앱: " + kakaoInAppLabel + "\n" +
        "- 시트기록: " + SHEET_NAME_REPORTS + (rowNumber > 0 ? (" " + rowNumber + "행") : " (시트 미연결)");
      var hookRes = postGoogleChatWebhook_(chatMsg, -1);
      notified = !!(hookRes && hookRes.ok);
    } catch (notifyErr) {
      Logger.log("[handleReportIssue_ Notify Warning] " + notifyErr);
      notified = false;
    }
  }

  return {
    ok: true,
    sheetName: SHEET_NAME_REPORTS,
    sheetSaved: sheetSaved,
    rowNumber: rowNumber,
    notified: notified,
    reasonType: reasonType,
    createdAt: tsDisplay
  };
}

/* =========================================================================
 * 8. V2.2 하위 호환: 파트너 시트 간편 조회
 * ========================================================================= */
function handleLookupPartner_(body) {
  var name = String(body.owner_name || "").trim();
  var phone = normalizePhone_(body.phone || "");
  try {
    var ss = getControlSpreadsheet_();
    var sheet = ss ? (ss.getSheetByName(SHEET_NAME_APPROVED_PARTNERS) || ss.getSheetByName(SHEET_NAME_PARTNERS)) : null;
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var rPhone = normalizePhone_(rows[i][2] || rows[i][1] || "");
        if ((phone && rPhone === phone) || (name && String(rows[i][1] || rows[i][0]).trim() === name)) {
          return {
            ok: true,
            found: true,
            owner_name: rows[i][1] || rows[i][0],
            phone: rPhone,
            channel_name: rows[i][0] || rows[i][2],
            channel_id_num: String(rows[i][3] || ""),
            current_plan: "STARTER"
          };
        }
      }
    }
  } catch (err) {
    Logger.log("[lookup_partner] " + err);
  }
  return {
    ok: true,
    found: false,
    owner_name: name,
    phone: body.phone || "",
    channel_name: name ? (name + " 채널") : "신규 파트너 채널",
    channel_id_num: "",
    current_plan: "STARTER"
  };
}

/* =========================================================================
 * 9. Gemini API 프록시 (gemini-3.8-flash 기본 + 실시간 /v1beta/models 다중 폴백 & 캐시)
 * ========================================================================= */
function fetchAvailableGeminiModels_(apiKey) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    return [DEFAULT_GEMINI_MODEL];
  }
  var data = JSON.parse(res.getContentText());
  var models = data.models || [];
  var candidates = [];

  for (var i = 0; i < models.length; i++) {
    var mName = String(models[i].name || "");
    var methods = models[i].supportedGenerationMethods || [];
    if (mName.indexOf("gemini") === -1 || methods.indexOf("generateContent") === -1) continue;
    if (/embedding|aqa|tts|audio|robotics|computer-use|image|vision|veo|imagen|learnlm|live|nano/i.test(mName)) continue;
    candidates.push(mName);
  }

  candidates.sort(function (a, b) {
    var score = function (s) {
      var v = 0;
      if (s === DEFAULT_GEMINI_MODEL) v += 1000;
      if (/flash/i.test(s) && !/lite/i.test(s)) v += 140;
      else if (/flash/i.test(s)) v += 90;
      if (/pro/i.test(s)) v += 60;
      if (!/exp|preview|thinking/i.test(s)) v += 45;
      var m = s.match(/gemini-(\d+(?:\.\d+)?)/i);
      if (m) v += parseFloat(m[1]) * 20;
      return v;
    };
    return score(b) - score(a);
  });

  return candidates.length ? candidates : [DEFAULT_GEMINI_MODEL];
}

function fetchAvailableGeminiModel_(apiKey) {
  var list = fetchAvailableGeminiModels_(apiKey);
  return list.length ? list[0] : DEFAULT_GEMINI_MODEL;
}

function extractGeminiResponseText_(parsed) {
  var cand = parsed && parsed.candidates && parsed.candidates[0];
  var parts = (cand && cand.content && cand.content.parts) || [];
  var out = "";
  var allText = "";
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || !p.text) continue;
    allText += String(p.text);
    if (!p.thought) {
      out += String(p.text);
    }
  }
  return out || allText;
}

function invokeGeminiEndpoint_(apiKey, modelName, promptText, systemPrompt, temperature, maxTokens, responseMimeType, thinkingBudget) {
  var cleanName = modelName.indexOf("models/") === 0 ? modelName : ("models/" + modelName);
  var endpoint = "https://generativelanguage.googleapis.com/v1beta/" + cleanName + ":generateContent?key=" + encodeURIComponent(apiKey);
  var genConfig = {
    temperature: temperature !== undefined ? temperature : 0.4,
    maxOutputTokens: maxTokens || 4096
  };
  if (responseMimeType) {
    genConfig.responseMimeType = String(responseMimeType);
  }
  // Flash 계열 사고(thinking) 토큰으로 인한 출력 고갈/지연 방지 (명시적 0 전달 또는 JSON 응답 시 기본 0 적용)
  if (thinkingBudget !== undefined && thinkingBudget !== null && /flash/i.test(cleanName)) {
    genConfig.thinkingConfig = { thinkingBudget: Number(thinkingBudget) };
  }
  var payload = {
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: genConfig
  };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  return UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function callGemini_(promptText, systemPrompt, temperature, maxTokens, responseMimeType, thinkingBudget) {
  var apiKey = getProp_("GEMINI_API_KEY", "");
  if (!apiKey) {
    throw new Error("스크립트 속성에 GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  var resolvedMaxTokens = Math.max(Number(maxTokens) || 0, 2048);
  var resolvedThinking = (thinkingBudget !== undefined && thinkingBudget !== null) ? thinkingBudget : 0;

  var cache = null;
  var cachedModel = "";
  try {
    cache = CacheService.getScriptCache();
    cachedModel = String(cache.get("ACTIVE_GEMINI_MODEL_CACHE") || "").trim();
  } catch (cacheErr) {}

  var tried = {};
  var tryOrder = [];
  if (cachedModel) tryOrder.push(cachedModel);
  if (tryOrder.indexOf(DEFAULT_GEMINI_MODEL) === -1) tryOrder.push(DEFAULT_GEMINI_MODEL);

  var lastCode = 0;
  var lastText = "";

  function attemptModel_(modelName) {
    if (!modelName || tried[modelName]) return null;
    tried[modelName] = true;
    var curMime = responseMimeType || "";
    var curThinking = resolvedThinking;
    var res = invokeGeminiEndpoint_(apiKey, modelName, promptText, systemPrompt, temperature, resolvedMaxTokens, curMime, curThinking);
    var code = res.getResponseCode();
    var text = res.getContentText();
    // 일부 모델에서 thinkingConfig 또는 responseMimeType 미지원(400) 시 옵션 제거 후 1회 재시도
    if (code === 400 && (curMime || curThinking !== null)) {
      if (/thinking|budget/i.test(text)) curThinking = null;
      if (/responseMimeType|mime/i.test(text)) curMime = "";
      res = invokeGeminiEndpoint_(apiKey, modelName, promptText, systemPrompt, temperature, resolvedMaxTokens, curMime, curThinking);
      code = res.getResponseCode();
      text = res.getContentText();
    }
    lastCode = code;
    lastText = text;
    if (code === 200) {
      var parsed = JSON.parse(text);
      var extracted = extractGeminiResponseText_(parsed);
      if (extracted && String(extracted).trim() !== "") {
        try {
          if (cache) cache.put("ACTIVE_GEMINI_MODEL_CACHE", modelName, 600);
        } catch (ce) {}
        setProp_("GEMINI_CONSECUTIVE_ERRORS", "0");
        return extracted;
      }
    }
    return null;
  }

  for (var i = 0; i < tryOrder.length; i++) {
    var okText = attemptModel_(tryOrder[i]);
    if (okText !== null) return okText;
  }

  // 기본/캐시 모델 실패 시 실시간 /v1beta/models 탐색 후 상위 4개 후보 순차 시도
  var discovered = fetchAvailableGeminiModels_(apiKey);
  var attempts = 0;
  for (var j = 0; j < discovered.length && attempts < 4; j++) {
    var candModel = discovered[j];
    if (tried[candModel]) continue;
    attempts++;
    var fallbackText = attemptModel_(candModel);
    if (fallbackText !== null) return fallbackText;
  }

  var cb = recordCircuitBreakerError_("GEMINI", "HTTP " + lastCode + " " + String(lastText || "").slice(0, 120), -1);
  if (cb && cb.tripped) {
    postGoogleChatWebhook_(
      "🚨 [회로차단] [CIRCUIT_BREAKER] Gemini API 3회 연속 오류 감지!\n- HTTP " + lastCode + ": " + String(lastText || "").slice(0, 160),
      -1
    );
  }
  throw new Error("Gemini API 오류 (HTTP " + lastCode + "): " + String(lastText || "").slice(0, 200));
}

function handleGenerateImageProxy_(body) {
  var apiKey = getProp_("GEMINI_API_KEY", "");
  if (!apiKey) {
    return { ok: false, error: "스크립트 속성에 GEMINI_API_KEY가 설정되지 않았습니다." };
  }
  var promptText = String(body.prompt || "");
  var aspectRatio = String(body.aspectRatio || "16:9");
  var imagenModels = ["models/imagen-4.0-generate-001", "models/imagen-3.0-generate-002"];

  for (var i = 0; i < imagenModels.length; i++) {
    var ep = "https://generativelanguage.googleapis.com/v1beta/" + imagenModels[i] + ":predict?key=" + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(ep, {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      payload: JSON.stringify({
        instances: [{ prompt: promptText }],
        parameters: { sampleCount: 1, aspectRatio: aspectRatio }
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var d = JSON.parse(res.getContentText());
      var pred = (d.predictions && d.predictions[0]) || (d.generatedImages && d.generatedImages[0]);
      var b64 = pred && (pred.bytesBase64Encoded || (pred.image && (pred.image.bytesBase64Encoded || pred.image.imageBytes)));
      if (b64) {
        return { ok: true, dataUrl: "data:image/png;base64," + b64, engine: imagenModels[i] };
      }
    }
  }
  return { ok: false, error: "사용 가능한 이미지 생성 모델을 찾을 수 없습니다." };
}

function extractJsonSafe_(rawText) {
  var s = String(rawText || "");
  var start = s.indexOf("{");
  var end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function handleChatProxy_(body) {
  var userText = String(body.userText || "");
  var sys = String(body.systemPrompt || "당신은 고마워톡 전문 컨설턴트입니다. 카카오 알림톡 규정을 준수하여 친절하게 답변하세요.");
  var tb = (body.thinkingBudget !== undefined && body.thinkingBudget !== null) ? body.thinkingBudget : 0;
  var reply = callGemini_(userText, sys, body.temperature, body.maxOutputTokens || 4096, body.responseMimeType || "", tb);
  return { ok: true, reply: reply };
}

function handlePinpointEdit_(body) {
  var tabId = String(body.tabId || "tab1");
  var instruction = String(body.instruction || "");
  var currentTabJson = JSON.stringify(body.currentData || {});
  var sys = "당신은 고마워톡 캠페인 카피라이터입니다. 사용자의 수정 지시를 반영해 입력된 JSON과 동일한 구조의 JSON만 반환하세요. 알림톡 금지어(할인, 특가, 이벤트, 무료증정)는 알림톡 영역에 절대 넣지 마세요.";
  var prompt = "현재 탭(" + tabId + ") 데이터:\n" + currentTabJson + "\n\n수정 지시:\n" + instruction + "\n\n수정된 JSON만 중괄호로 감싸서 출력하세요.";
  var raw = callGemini_(prompt, sys, 0.4, 4096, "application/json");
  var updated = extractJsonSafe_(raw);
  if (!updated) {
    return { ok: false, error: "AI 응답에서 JSON을 추출하지 못했습니다.", raw: raw };
  }
  return { ok: true, updatedData: updated };
}

/* =========================================================================
 * 9. 대표님 구글 챗 웹훅 1초 진단 함수 (Apps Script 에디터에서 직접 실행)
 * ========================================================================= */
function testGoogleChatWebhook() {
  var webhookUrl = getGoogleChatWebhookUrl_();
  if (!webhookUrl) {
    var msg = "[testGoogleChatWebhook] 스크립트 속성에 GOOGLE_CHAT_WEBHOOK_URL(또는 GCHAT_WEBHOOK_URL / CHAT_WEBHOOK_URL)이 등록되어 있지 않습니다.";
    Logger.log(msg);
    return { ok: false, webhookConfigured: false, message: msg };
  }
  var nowStr = getNowDisplay_();
  var text =
    "🔔 [고마워톡 웹훅 진단 성공]\n" +
    "- 시각: " + nowStr + "\n" +
    "- 상태: GOOGLE_CHAT_WEBHOOK_URL 정상 연결 확인 완료\n" +
    "- 안내: 이제 인터뷰봇 신규 접수·세팅 확정·현장 제보 알림이 즉시 도착합니다.";
  var result = postGoogleChatWebhook_(text, -1);
  Logger.log("[testGoogleChatWebhook] 결과: " + JSON.stringify(result));
  return {
    ok: !!(result && result.ok),
    webhookConfigured: true,
    code: result && result.code ? result.code : 0,
    result: result
  };
}
