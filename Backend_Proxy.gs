/**
 * Backend_Proxy.gs
 * [클라우드 보안 배관] 고마워톡 AI 캠페인 빌더 Google Apps Script 웹앱 백엔드
 *
 * 주요 기능:
 *   1) doPost(e)
 *      - action === "verifyPartner"  : 카카오 로그인 파트너 선인증 ([승인파트너명단] 시트 대조 및 비인증자 AI 토큰 차단)
 *      - action === "chat"           : 파트너 챗봇 AI 대화 프록시 (API 키 100% 서버 은닉, gemini-3.8-flash 기본 + 실시간 동적 모델 탐색 폴백)
 *      - action === "generate_image" : 비주얼 슬롯 AI 이미지 생성 프록시 (imagen-4 / imagen-3 / 이미지 지원 gemini 동적 폴백)
 *      - action === "pinpoint_edit"  : 대표님 조종석(LandingBuilder.html) 탭별 핀셋 AI 수정 프록시
 *      - action === "submit_campaign": 구글 드라이브 [파트너접수함] JSON 저장 + 구글 시트 관제탑 기록 + 구글 챗 즉시 알림 (침묵형 회로 차단기 적용)
 *      - action === "lookup_partner" : 파트너 시트 매칭 (성함 + 휴대폰 번호 → 채널명/채널ID/플랜 조회)
 *   2) doGet(e)
 *      - action === "list"           : [파트너접수함] 최신 .json 목록 조회
 *      - action === "load"           : fileId 기준 캠페인 JSON 본문 즉시 로드
 *      - action === "ping"           : 서버 상태 헬스체크
 *
 * 설정 방법:
 *   Apps Script 좌측 [프로젝트 설정] -> [스크립트 속성]에 아래 키를 등록하세요.
 *   - GEMINI_API_KEY          : Google AI Studio에서 발급받은 Gemini API 키
 *   - DRIVE_FOLDER_ID         : (선택) 구글 드라이브 [파트너접수함] 폴더 ID (비워두면 자동 생성)
 *   - SPREADSHEET_ID          : (선택) 구글 시트 관제탑 스프레드시트 ID (바인딩 스크립트면 자동 인식)
 *   - GOOGLE_CHAT_WEBHOOK_URL : (선택) 대표님 구글 챗 스페이스 수신 웹훅 URL
 *   - BUILDER_URL             : (선택) GitHub Pages로 배포된 LandingBuilder.html 주소
 *
 * 주의: Apps Script 구문 안전성을 위해 백틱 문자 없이 일반 문자열 결합만 사용합니다.
 */

var FOLDER_NAME_DEFAULT = '파트너접수함';
var SHEET_NAME_CONTROL = '파트너캠페인관제탑';
var SHEET_NAME_APPROVED_PARTNERS = '승인파트너명단';
var SHEET_NAME_PARTNERS = '파트너목록';
var DEFAULT_GEMINI_MODEL = 'models/gemini-3.8-flash';

function getProp_(key, fallback) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  return (val !== null && val !== undefined && String(val).trim() !== '') ? String(val).trim() : (fallback || '');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 카카오 전화번호(+82 10-1234-5678 / +82 1012345678 / 010-1234-5678) → 01012345678 정규화
function normalizePhone_(raw) {
  var s = String(raw === null || raw === undefined ? '' : raw).trim();
  var digits = s.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (/^\+?\s*82/.test(s) || digits.indexOf('8210') === 0) {
    digits = digits.replace(/^82/, '');
  }
  if (digits.charAt(0) !== '0') {
    digits = '0' + digits;
  }
  return digits;
}

/* =========================================================================
 * doGet(e) — 대표님 조종석 클라우드 직결 조회 (목록 / 파일 본문 / 핑)
 * ========================================================================= */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || 'ping';

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        service: 'Gomawartalk Backend_Proxy',
        defaultModel: DEFAULT_GEMINI_MODEL,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'list') {
      return jsonResponse_(listCampaignFiles_());
    }

    if (action === 'load') {
      var fileId = params.fileId || '';
      if (!fileId) {
        return jsonResponse_({ error: 'fileId 파라미터가 필요합니다.' });
      }
      var file = DriveApp.getFileById(fileId);
      var raw = file.getBlob().getDataAsString('UTF-8');
      return ContentService.createTextOutput(raw).setMimeType(ContentService.MimeType.JSON);
    }

    return jsonResponse_({ error: '지원하지 않는 GET action입니다: ' + action });
  } catch (err) {
    Logger.log('[doGet ERROR] ' + err);
    return jsonResponse_({ error: String(err.message || err) });
  }
}

/* =========================================================================
 * doPost(e) — 파트너 선인증 / AI 프록시 / 핀셋 수정 / 캠페인 접수 & 구글 챗 알림
 * ========================================================================= */
function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(rawBody);
    var action = body.action || '';

    if (action === 'verifyPartner') {
      return jsonResponse_(handleVerifyPartner_(body));
    }

    if (action === 'chat') {
      return jsonResponse_(handleChatProxy_(body));
    }

    if (action === 'generate_image') {
      return jsonResponse_(handleGenerateImageProxy_(body));
    }

    if (action === 'pinpoint_edit') {
      return jsonResponse_(handlePinpointEdit_(body));
    }

    if (action === 'submit_campaign') {
      return jsonResponse_(handleSubmitCampaign_(body.payload || body));
    }

    if (action === 'lookup_partner') {
      return jsonResponse_(handleLookupPartner_(body));
    }

    return jsonResponse_({ error: '지원하지 않는 POST action입니다: ' + action });
  } catch (err) {
    Logger.log('[doPost ERROR] ' + err);
    return jsonResponse_({ error: String(err.message || err) });
  }
}

/* =========================================================================
 * 0. 선(先) 파트너 인증 게이트: [승인파트너명단] 시트 대조 (비인증자 AI 토큰 차단)
 *    컬럼 규격: [상호명, 대표자명, 전화번호, 이메일, 승인상태]
 * ========================================================================= */
function handleVerifyPartner_(body) {
  var normPhone = normalizePhone_(body.phone || '');
  var normEmail = String(body.email || '').trim().toLowerCase();
  var nickname = String(body.nickname || '').trim();

  var ss = getControlSpreadsheet_();
  if (!ss) {
    return {
      verified: false,
      message: '관제탑 구글 시트가 연결되지 않았습니다. 관리자에게 SPREADSHEET_ID 설정을 요청해 주세요.'
    };
  }

  var sheet = ss.getSheetByName(SHEET_NAME_APPROVED_PARTNERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_APPROVED_PARTNERS);
    sheet.appendRow(['상호명', '대표자명', '전화번호', '이메일', '승인상태']);
  }

  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var rBizName = String(rows[i][0] || '').trim();
    var rOwnerName = String(rows[i][1] || '').trim();
    var rPhone = normalizePhone_(rows[i][2] || '');
    var rEmail = String(rows[i][3] || '').trim().toLowerCase();
    var rStatus = String(rows[i][4] || '').trim().toUpperCase();

    var isApproved = (rStatus === 'Y' || rStatus === '승인' || rStatus === 'APPROVED' || rStatus === 'O');
    if (!isApproved) continue;

    var phoneMatch = (normPhone !== '' && rPhone !== '' && normPhone === rPhone);
    var emailMatch = (normEmail !== '' && rEmail !== '' && normEmail === rEmail);

    if (phoneMatch || emailMatch) {
      var tokenRaw = (rPhone || rEmail) + '|' + rBizName + '|' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
      var token = Utilities.base64EncodeWebSafe(tokenRaw);
      return {
        verified: true,
        partnerToken: token,
        partnerInfo: {
          businessName: rBizName || (nickname ? nickname + ' 채널' : '고마워톡 파트너'),
          ownerName: rOwnerName || nickname || '대표님',
          phone: rPhone || normPhone,
          email: rEmail || normEmail
        }
      };
    }
  }

  return {
    verified: false,
    message: '사전 승인된 고마워톡 파트너 전용 서비스입니다. 담당자에게 파트너 등록을 요청해 주세요.'
  };
}

/* =========================================================================
 * 1. 드라이브 [파트너접수함] 폴더 확보 & 파일 목록 조회
 * ========================================================================= */
function getOrCreateIntakeFolder_() {
  var folderId = getProp_('DRIVE_FOLDER_ID', '');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('[DRIVE_FOLDER_ID 조회 실패, 기본 폴더 탐색] ' + e);
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
    if (name.slice(-5).toLowerCase() !== '.json') continue;
    var created = f.getDateCreated();
    list.push({
      id: f.getId(),
      fileId: f.getId(),
      name: name,
      createdTime: Utilities.formatDate(created, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      ts: created.getTime()
    });
  }
  list.sort(function (a, b) { return b.ts - a.ts; });
  return {
    ok: true,
    folderName: folder.getName(),
    files: list.slice(0, 50)
  };
}

/* =========================================================================
 * 2. 캠페인 접수 처리: 드라이브 JSON 저장 + 시트 기록 + 구글 챗 즉시 알림
 * ========================================================================= */
function handleSubmitCampaign_(payload) {
  var partner = payload.partner_info || {};
  var meta = payload.meta || {};
  var now = new Date();
  var tsFile = Utilities.formatDate(now, 'Asia/Seoul', 'yyyyMMdd_HHmmss');
  var tsDisplay = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  var chName = String(partner.channel_name || '미지정채널').replace(/[\\\/:*?"<>|\s]+/g, '_');
  var owner = String(partner.owner_name || '대표님').replace(/[\\\/:*?"<>|\s]+/g, '_');
  var fileName = tsFile + '_' + chName + '_' + owner + '.json';

  // (1) 구글 드라이브 [파트너접수함]에 .json 파일 저장
  var folder = getOrCreateIntakeFolder_();
  var jsonStr = JSON.stringify(payload, null, 2);
  var savedFile = folder.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);

  // (2) 구글 시트 [파트너캠페인관제탑]에 요약 행 기록
  try {
    appendControlSheetRow_([
      tsDisplay,
      partner.channel_name || '',
      partner.owner_name || '',
      partner.phone || '',
      partner.current_plan || 'STARTER',
      partner.pro_upgrade_requested ? 'PRO 신청' : '유지',
      partner.industry_code || '',
      partner.track_id || '',
      meta.use_webzine ? '웹진 ON' : '웹진 OFF',
      savedFile.getId(),
      fileName,
      '접수완료'
    ]);
  } catch (sheetErr) {
    Logger.log('[Sheet Log Warning] ' + sheetErr);
  }

  // (3) 구글 챗(Google Chat) 즉시 알림 — 독립 try-catch 침묵형 회로 차단기 적용
  sendGoogleChatAlert_(partner, meta, fileName, savedFile.getId());

  return {
    ok: true,
    fileId: savedFile.getId(),
    fileName: fileName,
    createdAt: tsDisplay
  };
}

function getControlSpreadsheet_() {
  var ssId = getProp_('SPREADSHEET_ID', '');
  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function appendControlSheetRow_(rowValues) {
  var ss = getControlSpreadsheet_();
  if (!ss) return;
  var sheet = ss.getSheetByName(SHEET_NAME_CONTROL);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_CONTROL);
    sheet.appendRow([
      '접수일시', '채널명', '대표자명', '연락처', '현재플랜',
      'Pro업그레이드', '업종코드', '트랙ID', '웹진여부', '드라이브FileID', '파일명', '상태'
    ]);
  }
  sheet.appendRow(rowValues);
}

/* 침묵형 회로 차단기(Silent Circuit Breaker): 웹훅 오류가 나도 캠페인 저장은 100% 성공 */
function sendGoogleChatAlert_(partner, meta, fileName, fileId) {
  try {
    var webhookUrl = getProp_('GOOGLE_CHAT_WEBHOOK_URL', '');
    if (!webhookUrl) {
      Logger.log('[GoogleChat] GOOGLE_CHAT_WEBHOOK_URL 미설정 — 알림 생략');
      return;
    }
    var builderUrl = getProp_('BUILDER_URL', 'LandingBuilder.html');
    var planBadge = partner.pro_upgrade_requested
      ? (String(partner.current_plan || 'STARTER') + ' -> PRO 업그레이드 신청!')
      : String(partner.current_plan || 'STARTER');

    var text =
      '🚀 [신규 캠페인 접수] ' + (partner.channel_name || '채널명 미입력') + '\n' +
      '• 대표자: ' + (partner.owner_name || '-') + ' (' + (partner.phone || '-') + ')\n' +
      '• 플랜: ' + planBadge + '\n' +
      '• 업종 / 트랙: ' + (partner.industry_code || '-') + ' / ' + (partner.track_id || '-') + '\n' +
      '• 모바일 웹진: ' + (meta.use_webzine ? '함께 제작 (ON)' : '미사용 (OFF)') + '\n' +
      '• 저장 파일: ' + fileName + ' (ID: ' + fileId + ')\n' +
      '👉 조종석 바로가기: ' + builderUrl;

    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (chatErr) {
    Logger.log('[GoogleChat Circuit Breaker] 웹훅 발송 실패(무시됨): ' + chatErr);
  }
}

/* =========================================================================
 * 3. 파트너 시트 간편 조회
 * ========================================================================= */
function handleLookupPartner_(body) {
  var name = String(body.owner_name || '').trim();
  var phone = normalizePhone_(body.phone || '');
  try {
    var ss = getControlSpreadsheet_();
    var sheet = ss ? (ss.getSheetByName(SHEET_NAME_APPROVED_PARTNERS) || ss.getSheetByName(SHEET_NAME_PARTNERS)) : null;
    if (sheet) {
      var rows = sheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        var rPhone = normalizePhone_(rows[i][2] || rows[i][1] || '');
        if ((phone && rPhone === phone) || (name && String(rows[i][1] || rows[i][0]).trim() === name)) {
          return {
            ok: true,
            found: true,
            owner_name: rows[i][1] || rows[i][0],
            phone: rPhone,
            channel_name: rows[i][0] || rows[i][2],
            channel_id_num: String(rows[i][3] || ''),
            current_plan: 'STARTER'
          };
        }
      }
    }
  } catch (err) {
    Logger.log('[lookup_partner] ' + err);
  }
  return {
    ok: true,
    found: false,
    owner_name: name,
    phone: body.phone || '',
    channel_name: name ? (name + ' 채널') : '신규 파트너 채널',
    channel_id_num: '',
    current_plan: 'STARTER'
  };
}

/* =========================================================================
 * 4. Gemini API 프록시 (gemini-3.8-flash 기본 + 실시간 /v1beta/models 동적 탐색 폴백)
 * ========================================================================= */
function fetchAvailableGeminiModel_(apiKey) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    return DEFAULT_GEMINI_MODEL;
  }
  var data = JSON.parse(res.getContentText());
  var models = data.models || [];
  var candidates = [];

  for (var i = 0; i < models.length; i++) {
    var mName = String(models[i].name || '');
    var methods = models[i].supportedGenerationMethods || [];
    if (mName.indexOf('gemini') === -1 || methods.indexOf('generateContent') === -1) continue;
    if (/embedding|aqa|tts|audio|robotics|image-generation/i.test(mName)) continue;
    candidates.push(mName);
  }

  candidates.sort(function (a, b) {
    var score = function (s) {
      var v = 0;
      if (s === DEFAULT_GEMINI_MODEL) v += 1000;
      if (/flash/i.test(s) && !/lite/i.test(s)) v += 100;
      if (/pro/i.test(s)) v += 60;
      var m = s.match(/gemini-(\d+(?:\.\d+)?)/i);
      if (m) v += parseFloat(m[1]) * 20;
      return v;
    };
    return score(b) - score(a);
  });

  return candidates.length ? candidates[0] : DEFAULT_GEMINI_MODEL;
}

function invokeGeminiEndpoint_(apiKey, modelName, promptText, systemPrompt, temperature, maxTokens) {
  var cleanName = modelName.indexOf('models/') === 0 ? modelName : ('models/' + modelName);
  var endpoint = 'https://generativelanguage.googleapis.com/v1beta/' + cleanName + ':generateContent?key=' + encodeURIComponent(apiKey);
  var payload = {
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: temperature !== undefined ? temperature : 0.4,
      maxOutputTokens: maxTokens || 2048
    }
  };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  return UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function callGemini_(promptText, systemPrompt, temperature, maxTokens) {
  var apiKey = getProp_('GEMINI_API_KEY', '');
  if (!apiKey) {
    throw new Error('스크립트 속성에 GEMINI_API_KEY가 설정되지 않았습니다.');
  }
  // 1차: gemini-3.8-flash 기본 호출 -> 404/미지원 시 실시간 /v1beta/models 조회로 활성 모델 자동 폴백
  var res = invokeGeminiEndpoint_(apiKey, DEFAULT_GEMINI_MODEL, promptText, systemPrompt, temperature, maxTokens);
  if (res.getResponseCode() !== 200) {
    var fallbackModel = fetchAvailableGeminiModel_(apiKey);
    res = invokeGeminiEndpoint_(apiKey, fallbackModel, promptText, systemPrompt, temperature, maxTokens);
  }
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    throw new Error('Gemini API 오류 (HTTP ' + code + '): ' + text.slice(0, 200));
  }
  var parsed = JSON.parse(text);
  var cand = parsed.candidates && parsed.candidates[0];
  var part = cand && cand.content && cand.content.parts && cand.content.parts[0];
  return part ? String(part.text || '') : '';
}

function handleGenerateImageProxy_(body) {
  var apiKey = getProp_('GEMINI_API_KEY', '');
  if (!apiKey) {
    return { ok: false, error: '스크립트 속성에 GEMINI_API_KEY가 설정되지 않았습니다.' };
  }
  var promptText = String(body.prompt || '');
  var aspectRatio = String(body.aspectRatio || '16:9');
  var imagenModels = ['models/imagen-4.0-generate-001', 'models/imagen-3.0-generate-002'];

  for (var i = 0; i < imagenModels.length; i++) {
    var ep = 'https://generativelanguage.googleapis.com/v1beta/' + imagenModels[i] + ':predict?key=' + encodeURIComponent(apiKey);
    var res = UrlFetchApp.fetch(ep, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
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
        return { ok: true, dataUrl: 'data:image/png;base64,' + b64, engine: imagenModels[i] };
      }
    }
  }
  return { ok: false, error: '사용 가능한 이미지 생성 모델을 찾을 수 없습니다.' };
}

function extractJsonSafe_(rawText) {
  var s = String(rawText || '');
  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function handleChatProxy_(body) {
  var userText = String(body.userText || '');
  var sys = String(body.systemPrompt || '당신은 고마워톡 전문 컨설턴트입니다. 카카오 알림톡 규정을 준수하여 친절하게 답변하세요.');
  var reply = callGemini_(userText, sys, body.temperature, body.maxOutputTokens);
  return { ok: true, reply: reply };
}

function handlePinpointEdit_(body) {
  var tabId = String(body.tabId || 'tab1');
  var instruction = String(body.instruction || '');
  var currentTabJson = JSON.stringify(body.currentData || {});
  var sys = '당신은 고마워톡 캠페인 카피라이터입니다. 사용자의 수정 지시를 반영해 입력된 JSON과 동일한 구조의 JSON만 반환하세요. 알림톡 금지어(할인, 특가, 이벤트, 무료증정)는 알림톡 영역에 절대 넣지 마세요.';
  var prompt = '현재 탭(' + tabId + ') 데이터:\n' + currentTabJson + '\n\n수정 지시:\n' + instruction + '\n\n수정된 JSON만 중괄호로 감싸서 출력하세요.';
  var raw = callGemini_(prompt, sys, 0.4, 4096);
  var updated = extractJsonSafe_(raw);
  if (!updated) {
    return { ok: false, error: 'AI 응답에서 JSON을 추출하지 못했습니다.', raw: raw };
  }
  return { ok: true, updatedData: updated };
}
