/**
 * engines/RagInterviewEngine.js
 * [범용 엔진 2] 지식 카트리지 교체형 'RAG Q&A' + 다회차 심층 상담 & Gemini REST/프록시 하이브리드 엔진
 *
 * - 타 프로젝트에도 100% 재활용 가능한 범용 대화/상담 엔진
 * - 일반 <script src="engines/RagInterviewEngine.js"> 로드 (file:// 더블클릭 100% 호환, window.RagInterviewEngine 노출)
 * - 로컬 테스트용 Gemini API Key 직결(gemini-3.8-flash 기본 + 실시간 동적 모델 탐색 폴백) + 배포용 Backend Proxy URL 자동 라우팅
 * - localStorage 공유 브릿지를 통해 InterviewBot.html <-> LandingBuilder.html 간 API 설정 및 생성 캠페인 즉시 공유
 */
(function (global) {
  'use strict';

  var STORAGE_KEYS = {
    API_KEY: 'gmt_gemini_api_key',
    MODEL: 'gmt_gemini_model',
    PROXY_URL: 'gmt_proxy_url',
    LEGACY_PROXY: 'gmt_bot_proxy',
    BRIDGE_CAMPAIGN: 'gmt_bridge_campaign'
  };

  var DEFAULT_MODEL = 'gemini-3.8-flash';
  var DEFAULT_PROXY_URL = 'https://script.google.com/macros/s/AKfycbz-XDsBzinTqayvknhpCbCvHDFUC86exY9rs6AuxUGWFGg-NPiLET5QiekTHL1XuY9Tlw/exec';
  var BANNED_RE = new RegExp('\\uB274\\uC2A4\\uB808\\uD130', 'g');
  var CACHED_DISCOVERED_MODELS = null;

  // ─────────────────────────────────────────────────────────────
  // 1. 공유 설정 & 브릿지 스토리지 (InterviewBot <-> LandingBuilder)
  // ─────────────────────────────────────────────────────────────
  function getConfig() {
    var apiKey = '', model = DEFAULT_MODEL, proxyUrl = DEFAULT_PROXY_URL;
    try {
      apiKey = (localStorage.getItem(STORAGE_KEYS.API_KEY) || '').trim();
      var savedModel = (localStorage.getItem(STORAGE_KEYS.MODEL) || '').trim();
      // 구형 모델명이 localStorage에 남아 있으면 자동으로 gemini-3.8-flash로 마이그레이션
      if (!savedModel || /^gemini-[12]\./i.test(savedModel)) {
        model = DEFAULT_MODEL;
      } else {
        model = savedModel;
      }
      var savedProxy = (localStorage.getItem(STORAGE_KEYS.PROXY_URL) || localStorage.getItem(STORAGE_KEYS.LEGACY_PROXY) || '').trim();
      proxyUrl = savedProxy || DEFAULT_PROXY_URL;
    } catch (e) {}
    return {
      apiKey: apiKey,
      model: model,
      proxyUrl: proxyUrl,
      hasDirectKey: apiKey.length >= 10,
      hasProxy: proxyUrl.length >= 8,
      isConnected: apiKey.length >= 10 || proxyUrl.length >= 8
    };
  }

  function saveConfig(cfg) {
    cfg = cfg || {};
    try {
      if (cfg.apiKey !== undefined) localStorage.setItem(STORAGE_KEYS.API_KEY, String(cfg.apiKey || '').trim());
      if (cfg.model !== undefined) localStorage.setItem(STORAGE_KEYS.MODEL, String(cfg.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL);
      if (cfg.proxyUrl !== undefined) {
        var p = String(cfg.proxyUrl || '').trim();
        localStorage.setItem(STORAGE_KEYS.PROXY_URL, p);
        localStorage.setItem(STORAGE_KEYS.LEGACY_PROXY, p);
      }
    } catch (e) {}
    return getConfig();
  }

  function saveBridgeCampaign(campaignObj) {
    try {
      var clean = sanitizeObject(campaignObj);
      localStorage.setItem(STORAGE_KEYS.BRIDGE_CAMPAIGN, JSON.stringify({
        savedAt: new Date().toISOString(),
        campaign: clean
      }));
      return true;
    } catch (e) {
      // QuotaExceededError 방어: 중복 저장된 이미지만 정리하여 파트너 첨부 실사/로고는 최대한 보존
      try {
        var slim = JSON.parse(JSON.stringify(sanitizeObject(campaignObj)));
        if (slim && slim.brand_assets && slim.brand_assets.block_images_base64) {
          slim.brand_assets.block_images_base64 = {};
        }
        // partner_photos가 blocks visual_image에 이미 매핑되어 있으면 중복 사본만 제거
        if (slim && slim.brand_assets && Array.isArray(slim.brand_assets.partner_photos) && slim.brand_assets.partner_photos.length) {
          slim.brand_assets.partner_photos = [];
        }
        localStorage.setItem(STORAGE_KEYS.BRIDGE_CAMPAIGN, JSON.stringify({
          savedAt: new Date().toISOString(),
          campaign: slim
        }));
        return true;
      } catch (e2) {
        try {
          var slim2 = JSON.parse(JSON.stringify(sanitizeObject(campaignObj)));
          if (slim2 && slim2.brand_assets) {
            slim2.brand_assets.block_images_base64 = {};
            slim2.brand_assets.partner_photos = [];
          }
          if (slim2 && slim2.tab2_landing_content && Array.isArray(slim2.tab2_landing_content.blocks_1000px)) {
            slim2.tab2_landing_content.blocks_1000px.forEach(function (b) {
              if (b.visual_image && b.visual_image.length > 350000) b.visual_image = null;
            });
          }
          localStorage.setItem(STORAGE_KEYS.BRIDGE_CAMPAIGN, JSON.stringify({
            savedAt: new Date().toISOString(),
            campaign: slim2
          }));
          return true;
        } catch (e3) {
          return false;
        }
      }
    }
  }

  function getBridgeCampaign(consume) {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.BRIDGE_CAMPAIGN);
      if (!raw) return null;
      if (consume) localStorage.removeItem(STORAGE_KEYS.BRIDGE_CAMPAIGN);
      var parsed = JSON.parse(raw);
      return parsed && parsed.campaign ? parsed.campaign : parsed;
    } catch (e) {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 금지어 정화 & 알림톡 채널추가 유도 문구 차단 & JSON 안전 추출기
  // ─────────────────────────────────────────────────────────────
  function sanitizeText(str) {
    return String(str == null ? '' : str).replace(BANNED_RE, '정기 칼럼·소식');
  }

  // 카카오 알림톡 심사 규정 준수: 알림톡 본문 내 '채널 추가 유도 문구' 100% 제거
  function stripAlimtalkChannelAddSolicitation(str) {
    var s = sanitizeText(str);
    if (!s) return '';
    // 괄호 안의 채널 추가 유도 문구 통째 제거
    s = s.replace(/\s*\([^)]*(?:채널\s*추가|채널을\s*추가|\[?\s*Ch\+?\s*채널\s*추가\s*\]?)[^)]*\)/gi, '');
    // 문장 단위 채널 추가 유도 표현 제거
    var lines = s.split(/\r?\n/);
    var filtered = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (/(?:채널\s*추가를\s*(?:꼭\s*)?(?:눌러|부탁|해주|해\s*주|클릭|완료)|채널\s*추가\s*(?:부탁|후|유도|하시면|를\s*눌러)|채널을\s*추가하시면|상단\s*(?:노란색\s*)?\[?\s*채널\s*추가\s*\]?)/i.test(ln)) {
        // 해당 문장만 문장 경계에서 도려내고 앞부분 정상 안내가 있으면 유지
        var cleanedLine = ln
          .replace(/(?:^|[.!?\n]\s*)[^.!?\n]*(?:채널\s*추가를\s*(?:꼭\s*)?(?:눌러|부탁|해주|해\s*주|클릭|완료)|채널\s*추가\s*(?:부탁|후|유도|하시면|를\s*눌러)|채널을\s*추가하시면|상단\s*(?:노란색\s*)?\[?\s*채널\s*추가\s*\]?)[^.!?\n]*[.!?]?/gi, '')
          .trim();
        if (cleanedLine) filtered.push(cleanedLine);
      } else {
        filtered.push(ln);
      }
    }
    return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ★ V3.1 카카오 알림톡 쿠폰·광고어 차단 (알림톡에는 쿠폰·할인권·특가·무료증정 절대 불가 ➔ 순수 정보성 접수 확인으로 정화)
  var ALIMTALK_PROMO_RE = /(?:할인\s*쿠폰|웰컴\s*쿠폰|감사\s*쿠폰|재방문\s*쿠폰|카톡\s*쿠폰|쿠폰|할인권|무료\s*증정권|무료\s*증정|사은품\s*증정|특가\s*할인|\d+\s*(?:%|원|천원|만원)\s*할인|1\+1\s*쿠폰|사이즈업\s*쿠폰|타임세일|프로모션\s*혜택)/gi;

  function stripAlimtalkPromoCopy(str, fallbackTopic) {
    var s = stripAlimtalkChannelAddSolicitation(str);
    if (!s) return '';
    if (!ALIMTALK_PROMO_RE.test(s)) {
      ALIMTALK_PROMO_RE.lastIndex = 0;
      return s;
    }
    ALIMTALK_PROMO_RE.lastIndex = 0;
    var topicLabel = String(fallbackTopic || '').replace(ALIMTALK_PROMO_RE, '').replace(/\s+/g, ' ').trim();
    ALIMTALK_PROMO_RE.lastIndex = 0;
    // 쿠폰·할인 문구가 포함된 문장만 제거하고 순수 정보성 접수 확인 문장으로 대체
    var cleanLines = s.split(/\r?\n/).map(function (ln) {
      if (!ALIMTALK_PROMO_RE.test(ln)) {
        ALIMTALK_PROMO_RE.lastIndex = 0;
        return ln;
      }
      ALIMTALK_PROMO_RE.lastIndex = 0;
      return '';
    }).filter(Boolean);
    if (cleanLines.length) {
      return cleanLines.join('\n').trim();
    }
    return (topicLabel ? (tFirst(topicLabel, 24) + ' ') : '') + '신청이 정상 접수되었습니다. 신청 내역과 상세 안내 사항은 아래 버튼에서 바로 확인하실 수 있습니다.';
  }

  function sanitizeQ3ExampleChip(str) {
    var s = stripAlimtalkChannelAddSolicitation(str);
    if (!s) return '';
    s = s
      .replace(/첫\s*방문\s*웰컴\s*쿠폰/g, '신청 내역 확인 안내')
      .replace(/웰컴\s*혜택\s*안내/g, '신청 내역 확인 링크')
      .replace(/(?:할인|웰컴|카톡|무료)?\s*(?:쿠폰|할인권|무료\s*증정권|무료\s*증정)/g, '신청 내역 확인 안내')
      .replace(/\d+\s*(?:%|원|천원|만원)\s*할인/g, '신청 접수 안내')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return s;
  }

  // 파트너가 Q1~Q5(특히 Q1/Q3)에 입력한 쿠폰·할인·핵심 혜택을 추출해 ④ 첫 번째 광고 메시지에 100% 반영
  function extractPromoOfferFromAnswers(answersObj) {
    var A = answersObj || {};
    var sources = [A[3], A[1], A[4], A[5], A[8]].filter(Boolean).map(function (v) { return String(v).trim(); });
    var couponRe = /([가-힣a-zA-Z0-9,\s·+\-%]{0,24}(?:쿠폰|할인권|무료\s*증정권|무료\s*증정|사이즈업|1\+1|\d+\s*(?:%|원|천원|만원)\s*할인|특가|체험권|우대권|사은품)[가-힣a-zA-Z0-9,\s·+\-%]{0,12})/;
    for (var i = 0; i < sources.length; i++) {
      var m = sources[i].match(couponRe);
      if (m && m[1]) {
        var phrase = m[1]
          .replace(/^(?:신청\s*즉시|가입\s*시|초대해서|드리는|보내드릴게요|발송할게요|을|를|은|는|이|가|과|와|및)\s+/g, '')
          .replace(/\s*(?:을|를|은|는|이|가)?\s*(?:바로\s*)?(?:보내|발송|드리|제공|지급|안내)(?:드릴게요|할게요|하고|해\s*드려요|해\s*드릴게요|합니다|해요).*$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (phrase.length >= 2) {
          var hasCouponWord = /쿠폰|할인권|무료\s*증정|할인|1\+1|사이즈업|체험권|우대권/.test(phrase);
          return {
            hasPromo: true,
            isCoupon: /쿠폰|할인권|할인/.test(phrase),
            phrase: tFirst(phrase, 34),
            rawSource: sources[i],
            buttonLabel: /쿠폰|할인권/.test(phrase)
              ? '할인 쿠폰 바로 받기'
              : (hasCouponWord ? '전용 혜택 바로 받기' : '특별 혜택 확인하기')
          };
        }
      }
    }
    return { hasPromo: false, isCoupon: false, phrase: '', rawSource: '', buttonLabel: '' };
  }

  function sanitizeObject(obj) {
    if (obj == null) return obj;
    try {
      return JSON.parse(sanitizeText(JSON.stringify(obj)));
    } catch (e) {
      return obj;
    }
  }

  function extractJson(rawText) {
    var s = sanitizeText(rawText).trim();
    if (!s) return null;
    // 마크다운 ```json ... ``` 제거
    var fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) s = fenced[1].trim();
    try { return JSON.parse(s); } catch (e) {}

    var firstBrace = s.indexOf('{');
    var lastBrace = s.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try { return JSON.parse(s.slice(firstBrace, lastBrace + 1)); } catch (e2) {}
    }
    var firstBracket = s.indexOf('[');
    var lastBracket = s.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try { return JSON.parse(s.slice(firstBracket, lastBracket + 1)); } catch (e3) {}
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 지식 카트리지 로컬 RAG 검색 & 질문 의도 감지
  // ─────────────────────────────────────────────────────────────
  function detectQuestionIntent(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    var questionPatterns = [
      /\?$/,
      /인가요|인지요|되나요|가능한가요|있나요|할까요\?/,
      /어떻게\s*(쓰|하|설정|연동|발송)/,
      /얼마|요금제|가격|플랜\s*차이|건당\s*몇\s*원/,
      /알림톡\s*규정|친구톡\s*차이|뜰채|시트\s*변수|야간\s*제한|채널\s*추가\s*전|채널\s*미추가|브랜드메시지/
    ];
    return questionPatterns.some(function (p) { return p.test(t); });
  }

  function searchKnowledge(query, cartridge) {
    var list = Array.isArray(cartridge) ? cartridge : (global.GomawartalkManual || global.GOMAWARTALK_MANUAL || []);
    var q = String(query || '').toLowerCase();
    var tokens = q.replace(/[^\uAC00-\uD7A3a-z0-9\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 2; });
    var scored = list.map(function (item) {
      var hay = ((item.topic || '') + ' ' + (item.content || '')).toLowerCase();
      var score = 0;
      tokens.forEach(function (tk) {
        if ((item.topic || '').toLowerCase().indexOf(tk) !== -1) score += 4;
        if (hay.indexOf(tk) !== -1) score += 2;
      });
      return { item: item, score: score };
    }).sort(function (a, b) { return b.score - a.score; });

    var top = scored.filter(function (x) { return x.score > 0; }).slice(0, 2);
    if (!top.length) return '';
    return top.map(function (t) {
      return '📌 ' + t.item.topic + '\n' + String(t.item.content || '').trim();
    }).join('\n\n────────────────\n\n');
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Gemini REST API 직결 (gemini-3.8-flash 기본 + 실시간 동적 모델 탐색 폴백) + Proxy 하이브리드 호출
  // ─────────────────────────────────────────────────────────────
  function discoverActiveModels(apiKey) {
    if (CACHED_DISCOVERED_MODELS && CACHED_DISCOVERED_MODELS.apiKey === apiKey) {
      return Promise.resolve(CACHED_DISCOVERED_MODELS);
    }
    var url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
    return fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var list = (data && data.models) || [];
        var textModels = [];
        var imagenModels = [];
        var geminiImageModels = [];

        list.forEach(function (m) {
          var id = String(m.name || '').replace(/^models\//, '');
          var methods = m.supportedGenerationMethods || [];
          var lower = id.toLowerCase();

          // ① Imagen 계열 (:predict)
          if (/^imagen-[34]/i.test(id) && (methods.indexOf('predict') !== -1 || methods.length === 0)) {
            if (imagenModels.indexOf(id) === -1) imagenModels.push(id);
          }

          // ② Gemini 계열 (:generateContent)
          if (/^gemini-/i.test(id) && methods.indexOf('generateContent') !== -1) {
            if (/image/i.test(lower)) {
              if (geminiImageModels.indexOf(id) === -1) geminiImageModels.push(id);
            }
            if (!/embedding|aqa|tts|audio|robotics|computer-use|image-generation/i.test(lower)) {
              if (textModels.indexOf(id) === -1) textModels.push(id);
            }
          }
        });

        // 최신 버전 및 flash 우선 정렬
        textModels.sort(function (a, b) {
          var score = function (s) {
            var v = 0;
            if (s === DEFAULT_MODEL) v += 1000;
            if (/flash/i.test(s) && !/lite/i.test(s)) v += 100;
            if (/pro/i.test(s)) v += 60;
            var m = s.match(/gemini-(\d+(?:\.\d+)?)/i);
            if (m) v += parseFloat(m[1]) * 20;
            return v;
          };
          return score(b) - score(a);
        });

        imagenModels.sort(function (a, b) {
          return (/imagen-4/i.test(b) ? 10 : 0) - (/imagen-4/i.test(a) ? 10 : 0);
        });

        // 텍스트 모델들 중 멀티모달 이미지 출력 후보도 후순위로 추가
        textModels.forEach(function (tm) {
          if (/flash/i.test(tm) && geminiImageModels.indexOf(tm) === -1) {
            geminiImageModels.push(tm);
          }
        });

        var result = {
          apiKey: apiKey,
          textModels: textModels,
          imagenModels: imagenModels,
          geminiImageModels: geminiImageModels
        };
        if (textModels.length || imagenModels.length) {
          CACHED_DISCOVERED_MODELS = result;
        }
        return result;
      })
      .catch(function () {
        return { apiKey: apiKey, textModels: [], imagenModels: [], geminiImageModels: [] };
      });
  }

  function callGeminiDirectModel(apiKey, modelName, opts) {
    var cleanModel = String(modelName || DEFAULT_MODEL).replace(/^models\//, '');
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cleanModel) + ':generateContent?key=' + encodeURIComponent(apiKey);
    var contents = opts.contents;
    if (!Array.isArray(contents) || !contents.length) {
      contents = [{ role: 'user', parts: [{ text: String(opts.userText || opts.prompt || '') }] }];
    }
    var genCfg = {
      temperature: opts.temperature !== undefined ? opts.temperature : 0.45,
      maxOutputTokens: opts.maxOutputTokens || 8192
    };
    if (opts.responseMimeType) genCfg.responseMimeType = opts.responseMimeType;
    if (opts.responseSchema) genCfg.responseSchema = opts.responseSchema;
    if (opts.thinkingBudget !== undefined && /flash/i.test(cleanModel)) genCfg.thinkingConfig = { thinkingBudget: opts.thinkingBudget };

    var body = {
      contents: contents,
      generationConfig: genCfg
    };
    if (opts.systemInstruction) {
      body.systemInstruction = { parts: [{ text: String(opts.systemInstruction) }] };
    }

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.error) {
          var msg = (data && data.error && data.error.message) ? data.error.message : ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        var cand = data.candidates && data.candidates[0];
        var parts = (cand && cand.content && cand.content.parts) || [];
        var nonThought = parts.filter(function (p) { return p && !p.thought && p.text; }).map(function (p) { return p.text; }).join('');
        var text = nonThought || parts.map(function (p) { return p.text || ''; }).join('');
        return sanitizeText(text);
      });
    });
  }

  function callGemini(opts) {
    opts = opts || {};
    var cfg = getConfig();
    var apiKey = (opts.apiKey || cfg.apiKey || '').trim();
    var model = (opts.model || cfg.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    var proxyUrl = (opts.proxyUrl || cfg.proxyUrl || '').trim();

    // ① 로컬 Gemini API 키가 있으면 gemini-3.8-flash 기본 호출 후, 404/종료 시 실시간 /v1beta/models 조회로 활성 모델 자동 폴백
    if (apiKey) {
      return callGeminiDirectModel(apiKey, model, opts).catch(function (err) {
        var shouldFallback = err.status === 404 || err.status === 400 || /not found|no longer available|not supported|deprecated|invalid/i.test(err.message || '');
        if (!shouldFallback) throw err;
        return discoverActiveModels(apiKey).then(function (disc) {
          var candidates = (disc.textModels || []).filter(function (m) { return m !== model; });
          if (!candidates.length) throw err;
          var idx = 0;
          function tryNext(lastErr) {
            if (idx >= candidates.length || idx >= 4) throw lastErr;
            var nextModel = candidates[idx++];
            return callGeminiDirectModel(apiKey, nextModel, opts).catch(function (e2) {
              return tryNext(e2);
            });
          }
          return tryNext(err);
        });
      });
    }

    // ② Backend Proxy URL이 있으면 프록시 경유
    if (proxyUrl) {
      var payload = opts.proxyPayload || {
        action: opts.action || 'chat',
        mode: opts.mode || 'CHAT',
        userText: opts.userText || opts.prompt || '',
        systemPrompt: opts.systemInstruction || '',
        conversationHistory: opts.contents || []
      };
      return fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('프록시 서버 응답 오류 (HTTP ' + res.status + ')');
        return res.json();
      }).then(function (data) {
        if (data.error) throw new Error(data.error);
        if (data.updatedData) return JSON.stringify(sanitizeObject(data.updatedData));
        return sanitizeText(data.reply || data.text || JSON.stringify(data));
      });
    }

    return Promise.reject(new Error('AI 엔진이 연결되지 않았습니다. 상단 우측 [🔑 AI 엔진 설정]에서 Gemini API Key(AIza...) 또는 Backend Proxy URL을 입력해 주세요.'));
  }

  // ─────────────────────────────────────────────────────────────
  // 4-B. AI 비주얼 이미지 생성 엔진 (Gemini 한글->영문 프롬프트 직결 + Imagen 3/4 & Gemini Image 폴백)
  // ─────────────────────────────────────────────────────────────
  var IMAGE_PROMPT_SUFFIX = '16:9 wide aspect ratio, shallow depth of field, clean commercial photography, no text, no letters, no watermark, high resolution';

  function ensureImagePromptSuffix(p) {
    var base = String(p || '').trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/,?\s*16:9 wide aspect ratio.*$/i, '')
      .replace(/,?\s*clean commercial photography.*$/i, '')
      .replace(/[,.\s]+$/, '');
    if (!base) base = 'Modern professional studio scene, warm natural lighting, premium commercial aesthetic';
    return base + ', ' + IMAGE_PROMPT_SUFFIX;
  }

  // [실제 Gemini API 직결] 사용자가 입력한 한글 장면 묘사를 100% 충실하게 상업 사진용 영문 프롬프트로 번역·구체화
  // (가짜 템플릿 폴백 절대 없음 — 실패 시 정확한 에러를 그대로 throw)
  function translateKoreanToImagePrompt(koreanText, opts) {
    opts = opts || {};
    var kor = String(koreanText || '').trim();
    if (!kor) {
      return Promise.reject(new Error('한글 장면 묘사를 입력해 주세요.'));
    }
    var cfg = getConfig();
    var apiKey = (opts.apiKey || cfg.apiKey || '').trim();
    var proxyUrl = (opts.proxyUrl || cfg.proxyUrl || '').trim();

    if (!apiKey && !proxyUrl) {
      return Promise.reject(new Error('Gemini API Key가 설정되지 않았습니다. 상단 우측 [🔑 AI 엔진 설정] 버튼을 눌러 Gemini API Key(AIza...)를 먼저 등록해 주세요.'));
    }

    var sysInstruction = [
      'You are a world-class commercial photography director and Imagen prompt engineer.',
      'Your task is to translate and expand the user\'s Korean scene description into a vivid, realistic, high-end commercial photography prompt in English (2 to 3 detailed sentences).',
      'STRICT RULES:',
      '1. Faithfully depict 100% of the exact scene, subjects, facial expressions, emotions, actions, lighting, and environment described by the user in Korean.',
      '2. NEVER mix in unrelated default templates (do NOT add random bright desks, tablets, or upward achievement graphs unless the user explicitly asked for them).',
      '3. When the user mentions Korean people or Korean students (e.g., 한국 학생들), explicitly specify "Korean students" or "Korean people" in an authentic Korean setting.',
      '4. Output ONLY the pure English scene description sentence(s) without quotes, markdown, explanations, or prefixes.'
    ].join('\n');

    return callGemini({
      apiKey: apiKey,
      proxyUrl: proxyUrl,
      temperature: 0.25,
      maxOutputTokens: 350,
      systemInstruction: sysInstruction,
      userText: '다음 한글 장면 지시를 영문 상업 사진 프롬프트로 정확히 번역·구체화해 주세요:\n' + kor
    }).then(function (engRaw) {
      var cleaned = String(engRaw || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\r?\n+/g, ' ').trim();
      if (!cleaned) {
        throw new Error('Gemini API로부터 빈 응답이 반환되었습니다.');
      }
      return ensureImagePromptSuffix(cleaned);
    });
  }

  // 캠페인 주제 맞춤형 에디토리얼 스마트 컬러 테마 자동 매칭
  function detectSmartEditorialTheme(text) {
    var hay = String(text || '').toLowerCase();
    // 1) 식품·농산물·유기농·자연·라이프스타일 → Deep Forest Green & Warm Ivory
    if (/상추|무농약|유기농|농산물|채소|야채|샐러드|과일|농장|산지|직송|새벽배송|식품|식탁|반찬|도시락|베이커리|건강식|자연|플라워|꽃|식물|원두|차|티|다이어트|로컬푸드/i.test(hay)) {
      return { key: 'forest', label: '딥 포레스트 그린 & 웜 아이보리', primary: '#1B3B2B', secondary: '#FAF8F5' };
    }
    // 2) 뷰티·클래스·감성 모임·패션·공방 → Warm Espresso & Soft Sand
    if (/뷰티|화장품|스킨케어|에스테틱|네일|헤어|향수|캔들|도예|공방|요가|필라테스|감성|모임|독서|와인|아트|드로잉|웨딩|패션|코디|쇼핑몰|카페|디저트|브런치/i.test(hay)) {
      return { key: 'espresso', label: '웜 에스프레소 & 소프트 샌드', primary: '#2C221E', secondary: '#FBF9F6' };
    }
    // 3) 강의·지식·비즈니스·금융·교육·의료 → Editorial Charcoal Navy & Pure Cool Gray
    return { key: 'charcoal', label: '에디토리얼 차콜 네이비 & 퓨어 쿨 그레이', primary: '#182232', secondary: '#F6F7F9' };
  }

  // 캠페인 초기 로드시 기본 영문 프롬프트 생성기 (초기 기본값 세팅 전용)
  function buildEnglishImagePrompt(ctx) {
    ctx = ctx || {};
    var raw = String(ctx.customInstruction || ctx.copyText || '').trim();
    var slotRole = String(ctx.slotRole || 'hero');
    var hay = (raw + ' ' + (ctx.channelName || '') + ' ' + (ctx.title || '')).toLowerCase();

    var subject = 'Modern editorial Korean lifestyle photography, warm natural sunlight, clean composition';
    if (/상추|무농약|유기농|샐러드|채소|야채|농산물|농장|산지|직송/i.test(hay)) {
      if (slotRole === 'slot2' || slotRole === 'solution') {
        subject = 'Fresh gourmet green lettuce salad bowl and crisp organic farm vegetables arranged on a warm sunlit linen dining table, editorial food photography';
      } else if (slotRole === 'slot3' || slotRole === 'trust') {
        subject = 'Warm authentic scene of freshly harvested dewy organic green lettuce in a clean wooden harvest basket at a bright Korean eco-friendly farm at sunrise';
      } else {
        subject = 'Freshly harvested dewy organic green lettuce leaves with natural morning water droplets on a warm wooden kitchen table in soft morning sunlight, Market Kurly editorial food photography';
      }
    } else if (/식품|과일|반찬|도시락|베이커리|건강식|빵|디저트/i.test(hay)) {
      subject = 'Artisan fresh Korean gourmet food plated beautifully on ceramic dishware over a warm linen table in soft natural daylight, editorial food photography';
    } else if (/k-pop|kpop|한국어|외국인|가사|korean/i.test(hay)) {
      subject = 'Diverse young international students smiling together in a bright modern studio while listening to K-pop music with headphones and holding a sleek study workbook';
    } else if (/수학|학원|오답노트|공부|성적|내신|입시|교육|학생/i.test(hay)) {
      subject = 'Bright modern private academy classroom desk with a neatly organized study planner and textbook in warm natural daylight';
    } else if (/유튜브|지식창업|웨비나|강의|크리에이터|코칭/i.test(hay)) {
      subject = 'Confident content creator and online instructor in a sleek home studio with laptop, condenser microphone, and soft editorial lighting';
    } else if (/세무|절세|법인|세법|회계|노무|법무|컨설팅/i.test(hay)) {
      subject = 'Professional financial consultant in a minimalist executive office with warm sunlight and clean architectural lines';
    } else if (/병원|건강검진|클리닉|의원|치과|한의원|진료/i.test(hay)) {
      subject = 'Friendly doctor in a bright minimalist medical clinic consulting room with warm reassuring natural lighting';
    } else if (/뷰티|화장품|스킨케어|향수|캔들|도예|공방|요가|필라테스/i.test(hay)) {
      subject = 'Minimalist luxury beauty and wellness editorial still life with natural stone textures, warm linen, and soft golden hour shadows';
    } else if (/카페|매장|식당|음료|쿠폰|멤버십|원두/i.test(hay)) {
      subject = 'Cozy specialty coffee shop counter with artisan latte art, warm ambient pendant lights, and natural wooden textures';
    } else if (/쇼핑몰|패션|신상|코디|옷장|라이프스타일|화보|커머스/i.test(hay)) {
      subject = 'Minimalist luxury fashion showroom with curated seasonal outfits on a sleek rack, soft studio lighting, editorial lookbook aesthetic';
    }

    var roleDesc = '';
    if (slotRole === 'thumb') {
      roleDesc = 'hero thumbnail key visual, strong focal point, rich editorial contrast';
    } else if (slotRole === 'slot1' || slotRole === 'hero') {
      roleDesc = 'wide hero banner photography, inspiring main subject';
    } else if (slotRole === 'slot2' || slotRole === 'solution') {
      roleDesc = 'tangible product and service editorial presentation, refined styling';
    } else if (slotRole === 'slot3' || slotRole === 'trust') {
      roleDesc = 'authentic positive lifestyle and trustworthy atmosphere';
    }

    if (raw && !/[\uAC00-\uD7A3]/.test(raw) && raw.length >= 15) {
      return ensureImagePromptSuffix(raw);
    }

    return ensureImagePromptSuffix(subject + (roleDesc ? ', ' + roleDesc : ''));
  }

  function callImagenEndpoint(apiKey, modelName, promptText, aspectRatio) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelName) + ':predict?key=' + encodeURIComponent(apiKey);
    var body = {
      instances: [{ prompt: promptText }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio || '16:9'
      }
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.error) {
          throw new Error((data && data.error && data.error.message) || (modelName + ' HTTP ' + res.status));
        }
        var pred = (data.predictions && data.predictions[0]) || (data.generatedImages && data.generatedImages[0]);
        var b64 = pred && (
          pred.bytesBase64Encoded ||
          (pred.image && (pred.image.bytesBase64Encoded || pred.image.imageBytes))
        );
        if (!b64) throw new Error(modelName + ' 응답에 이미지 데이터(bytesBase64Encoded)가 없습니다.');
        var mime = (pred && (pred.mimeType || (pred.image && pred.image.mimeType))) || 'image/png';
        return 'data:' + mime + ';base64,' + b64;
      });
    });
  }

  function callGeminiImageModel(apiKey, modelName, promptText) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelName) + ':generateContent?key=' + encodeURIComponent(apiKey);
    var body = {
      contents: [{
        parts: [{ text: 'Generate a high-resolution commercial photograph: ' + promptText }]
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE']
      }
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.error) {
          throw new Error((data && data.error && data.error.message) || (modelName + ' HTTP ' + res.status));
        }
        var cands = data.candidates || [];
        for (var c = 0; c < cands.length; c++) {
          var parts = (cands[c].content && cands[c].content.parts) || [];
          for (var i = 0; i < parts.length; i++) {
            var inl = parts[i].inlineData || parts[i].inline_data;
            if (inl && inl.data) {
              var mime = inl.mimeType || inl.mime_type || 'image/png';
              return 'data:' + mime + ';base64,' + inl.data;
            }
          }
        }
        throw new Error(modelName + ' 응답에 inlineData 이미지가 없습니다.');
      });
    });
  }

  function generateImage(promptOrInstruction, opts) {
    opts = opts || {};
    var cfg = getConfig();
    var apiKey = (opts.apiKey || cfg.apiKey || '').trim();
    var proxyUrl = (opts.proxyUrl || cfg.proxyUrl || '').trim();
    var targetW = opts.width || 888;
    var targetH = opts.height || 500;
    var aspectRatio = opts.aspectRatio || '16:9';

    if (!apiKey && !proxyUrl) {
      return Promise.reject(new Error('Gemini API Key가 설정되지 않았습니다. 상단 우측 [🔑 AI 엔진 설정]에서 API 키(AIza...)를 먼저 등록해 주세요.'));
    }

    var rawInput = String(promptOrInstruction || '').trim();
    var hasKorean = /[\uAC00-\uD7A3]/.test(rawInput);

    // 1단계: 한글 지시어가 포함되어 있으면 실제 Gemini API로 영문 프롬프트 변환을 먼저 수행
    var promptPromise = hasKorean
      ? translateKoreanToImagePrompt(rawInput, { apiKey: apiKey, proxyUrl: proxyUrl })
      : Promise.resolve(ensureImagePromptSuffix(rawInput));

    function finalizeDataUrl(rawDataUrl, usedPrompt, engineUsed) {
      if (global.ImageCapturer && typeof global.ImageCapturer.normalizeToCoverDataUrl === 'function') {
        return global.ImageCapturer.normalizeToCoverDataUrl(rawDataUrl, targetW, targetH, 0.85)
          .then(function (normUrl) {
            return { dataUrl: normUrl, prompt: usedPrompt, engine: engineUsed };
          })
          .catch(function () {
            return { dataUrl: rawDataUrl, prompt: usedPrompt, engine: engineUsed };
          });
      }
      return Promise.resolve({ dataUrl: rawDataUrl, prompt: usedPrompt, engine: engineUsed });
    }

    return promptPromise.then(function (finalPrompt) {
      if (typeof opts.onPromptResolved === 'function') {
        try { opts.onPromptResolved(finalPrompt); } catch (e) {}
      }
      if (apiKey) {
        var errors = [];
        // 1차: imagen-4.0-generate-001:predict -> 2차: imagen-3.0-generate-002:predict
        // 3차(종료/404 시): GET /v1beta/models 실시간 조회로 활성 imagen-4*, imagen-3*, 이미지 지원 gemini-* 모델 순차 탐색 호출
        return callImagenEndpoint(apiKey, 'imagen-4.0-generate-001', finalPrompt, aspectRatio)
          .then(function (dUrl) { return finalizeDataUrl(dUrl, finalPrompt, 'imagen-4.0-generate-001'); })
          .catch(function (e1) {
            errors.push('imagen-4.0-generate-001: ' + e1.message);
            return callImagenEndpoint(apiKey, 'imagen-3.0-generate-002', finalPrompt, aspectRatio)
              .then(function (dUrl) { return finalizeDataUrl(dUrl, finalPrompt, 'imagen-3.0-generate-002'); });
          })
          .catch(function (e2) {
            errors.push('imagen-3.0-generate-002: ' + e2.message);
            return discoverActiveModels(apiKey).then(function (disc) {
              var queue = [];
              (disc.imagenModels || []).forEach(function (m) {
                if (m !== 'imagen-4.0-generate-001' && m !== 'imagen-3.0-generate-002') {
                  queue.push({ type: 'imagen', id: m });
                }
              });
              (disc.geminiImageModels || []).forEach(function (m) {
                queue.push({ type: 'gemini', id: m });
              });
              if (!queue.length) {
                queue.push({ type: 'gemini', id: DEFAULT_MODEL });
              }
              var qIdx = 0;
              function nextCandidate() {
                if (qIdx >= queue.length || qIdx >= 5) {
                  throw new Error(errors.join(' | '));
                }
                var cand = queue[qIdx++];
                var p = cand.type === 'imagen'
                  ? callImagenEndpoint(apiKey, cand.id, finalPrompt, aspectRatio)
                  : callGeminiImageModel(apiKey, cand.id, finalPrompt);
                return p.then(function (dUrl) {
                  return finalizeDataUrl(dUrl, finalPrompt, cand.id);
                }).catch(function (errCand) {
                  errors.push(cand.id + ': ' + errCand.message);
                  return nextCandidate();
                });
              }
              return nextCandidate();
            });
          });
      }
      return fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_image', prompt: finalPrompt, aspectRatio: aspectRatio })
      }).then(function (res) {
        if (!res.ok) throw new Error('프록시 이미지 생성 오류 HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (!data || !data.dataUrl) throw new Error((data && data.error) || '프록시 이미지 응답 없음');
        return finalizeDataUrl(data.dataUrl, finalPrompt, 'backend-proxy');
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 5. 기존 RagInterviewEngine 클래스 (하위 호환 100% 유지)
  // ─────────────────────────────────────────────────────────────
  function RagInterviewEngine(options) {
    options = options || {};
    this.knowledgeCartridge = options.knowledgeCartridge || [];
    this.interviewSteps = options.interviewSteps || [];
    this.proxyUrl = options.proxyUrl || '';
    this.onMessage = options.onMessage || function () {};
    this.onStateChange = options.onStateChange || function () {};
    this.onComplete = options.onComplete || function () {};

    this.state = {
      phase: 'IDLE',
      stepIndex: 0,
      answers: {},
      pendingStepIndex: 0,
      conversationHistory: [],
      isProcessing: false
    };
    this._systemPrompt = null;
  }

  RagInterviewEngine.prototype.init = function () {
    this.state.phase = 'INTERVIEW';
    this.state.stepIndex = 0;
    this.state.answers = {};
    this.state.conversationHistory = [];
    this._systemPrompt = this._buildSystemPrompt();
    this._askCurrentStep();
    this.onStateChange(this.state);
  };

  RagInterviewEngine.prototype.sendUserMessage = function (userText) {
    if (this.state.isProcessing || !String(userText || '').trim()) return;
    this.state.isProcessing = true;
    this.onMessage('user', userText);
    this.state.conversationHistory.push({ role: 'user', parts: [{ text: userText }] });
    var self = this;

    if (this._detectQuestionIntent(userText) && this.state.phase === 'INTERVIEW') {
      this.state.pendingStepIndex = this.state.stepIndex;
      this.state.phase = 'QA_MODE';
      this.onStateChange(this.state);

      this._callProxy(userText, 'QA').then(function (answer) {
        self.onMessage('model', answer);
        self.state.conversationHistory.push({ role: 'model', parts: [{ text: answer }] });
        setTimeout(function () {
          self.state.phase = 'INTERVIEW';
          self.state.stepIndex = self.state.pendingStepIndex;
          self.onStateChange(self.state);
          self._askCurrentStep();
          self.state.isProcessing = false;
        }, 400);
      }).catch(function (err) {
        var fallback = searchKnowledge(userText, self.knowledgeCartridge);
        self.onMessage('model', fallback || ('답변 생성 중 안내: ' + err.message));
        self.state.phase = 'INTERVIEW';
        self.state.isProcessing = false;
      });
      return;
    }

    var currentStep = this.interviewSteps[this.state.stepIndex];
    if (currentStep) {
      this._processAnswer(currentStep, userText).then(function (aiReply) {
        if (aiReply) {
          self.onMessage('model', aiReply);
          self.state.conversationHistory.push({ role: 'model', parts: [{ text: aiReply }] });
        }
        self.state.stepIndex++;
        if (self.state.stepIndex >= self.interviewSteps.length) {
          self.state.phase = 'COMPLETE';
          self.onStateChange(self.state);
          self.onComplete(self.state.answers);
        } else {
          self.state.phase = 'INTERVIEW';
          self.onStateChange(self.state);
          self._askCurrentStep();
        }
        self.state.isProcessing = false;
      });
    } else {
      this.state.isProcessing = false;
    }
  };

  RagInterviewEngine.prototype._detectQuestionIntent = function (text) {
    return detectQuestionIntent(text);
  };

  RagInterviewEngine.prototype._askCurrentStep = function () {
    var step = this.interviewSteps[this.state.stepIndex];
    if (!step) return;
    var message = step.question;
    if (step.options && step.options.length > 0) {
      message += '\n\n' + step.options.map(function (opt, i) { return (i + 1) + ') ' + opt; }).join('\n');
    }
    this.onMessage('model', message, step.renderType || 'TEXT', step.options || []);
    this.state.conversationHistory.push({ role: 'model', parts: [{ text: message }] });
  };

  RagInterviewEngine.prototype._processAnswer = function (step, userText) {
    this.state.answers[step.key] = userText;
    if (step.requiresAI) return this._callProxy(userText, 'PROCESS_ANSWER', step);
    if (step.confirmMessage) return Promise.resolve(step.confirmMessage.replace('{{answer}}', userText));
    return Promise.resolve(null);
  };

  RagInterviewEngine.prototype._callProxy = function (userText, mode) {
    return callGemini({
      proxyUrl: this.proxyUrl,
      mode: mode,
      userText: userText,
      systemInstruction: this._systemPrompt,
      contents: this.state.conversationHistory.slice(-10)
    });
  };

  RagInterviewEngine.prototype._buildSystemPrompt = function () {
    var knowledgeText = (this.knowledgeCartridge || []).map(function (item) {
      return '[' + (item.topic || item.category || '지식') + ']\n' + (item.content || '');
    }).join('\n\n');
    return '당신은 고마워톡 전문 AI 마케팅 기획자이자 상담 컨설턴트입니다.\n=== 지식 베이스 ===\n' + knowledgeText;
  };

  RagInterviewEngine.prototype.reset = function () {
    this.state = { phase: 'IDLE', stepIndex: 0, answers: {}, pendingStepIndex: 0, conversationHistory: [], isProcessing: false };
    this._systemPrompt = null;
    this.onStateChange(this.state);
  };

  RagInterviewEngine.prototype.getAnswers = function () { return Object.assign({}, this.state.answers); };
  RagInterviewEngine.prototype.getProgress = function () {
    if (!this.interviewSteps || !this.interviewSteps.length) return 0;
    return Math.min(this.state.stepIndex / this.interviewSteps.length, 1.0);
  };

  // ─────────────────────────────────────────────────────────────
  // 6. 토스(Toss)식 '8단계 1문 1답 스무고개' 파트너 인터뷰 엔진 (모바일 파트너 챗봇 전용)
  //    - 응답 JSON: { replyText, currentStep, singleTopicOptions: [], isReadyForSummary }
  //    - 파트너 모드: Backend_Proxy.gs(action:"chat", 파트너 토큰 필수)만 사용 → API 키 서버 은닉
  //    - 관리자 모드: localStorage Gemini API Key 직결 (키 없으면 오프라인 시뮬레이션)
  // ─────────────────────────────────────────────────────────────
  var TOSS = {};
  var TOSS_TEMPLATE_ID = 'f5af8a838d06a71e678e565a513d34a61ffa7b1c';
  var TOSS_BANNED_LIT = '\uB274\uC2A4\uB808\uD130';

  TOSS.MAX_REPLY = 110;
  TOSS.MAX_OPTION = 22;
  TOSS.TOTAL_STEPS = 8;
  TOSS.STEPS = [
    { n: 1, key: 'topic',  label: '핵심 주제',     q: '이번에 어떤 클래스·상품·모임을 알리고 싶으신가요?' },
    { n: 2, key: 'target', label: '핵심 타겟',     q: '주로 어떤 분들이 신청하면 가장 좋을까요?' },
    { n: 3, key: 'tone',   label: '언어와 말투',   q: '안내 페이지와 카톡 문구는 어떤 언어·분위기로 적을까요?' },
    { n: 4, key: 'pain',   label: '고객 고민',     q: '그분들이 평소 가장 답답해하거나 고민하는 점은 무엇인가요?' },
    { n: 5, key: 'gift',   label: '첫 무료 혜택',  q: '카카오로 신청하면 첫 카톡으로 바로 보내드릴 무료 자료나 혜택은 무엇으로 할까요?' },
    { n: 6, key: 'proof',  label: '신뢰 강점',     q: '고객이 믿고 신청할 수 있게 자랑할 만한 경력이나 성과 숫자가 있나요?' },
    { n: 7, key: 'form',   label: '신청 질문',     q: '신청할 때 고객에게 꼭 물어보고 싶은 질문을 골라 주세요. (1~2개)' },
    { n: 8, key: 'flow',   label: '이후 카톡 소식', q: '첫 선물을 보낸 뒤에는 어떤 흐름으로 카톡 소식을 이어갈까요?' }
  ];

  // 내부 전문용어 → 일상 언어 치환 (파트너 화면 노출 전 최종 방어막)
  var TOSS_JARGON = [
    [/1\s*회차\s*알림톡/g, '첫 무료 선물 카톡'],
    [/미끼\s*(자료|상품|혜택)?/g, '첫 무료 선물'],
    [/뜰채\s*분기?/g, '맞춤 안내'],
    [/\d+\s*번\s*트랙/g, '맞춤 방식'],
    [/청사진/g, '기획 요약'],
    [/제로\s*베이스/g, '맞춤'],
    [/웹진\s*앵커/g, '소식 페이지 바로가기'],
    [/앵커/g, '바로가기'],
    [new RegExp(TOSS_BANNED_LIT, 'g'), '정기 소식']
  ];

  function tCp(s) { return Array.from(String(s == null ? '' : s)); }
  function tLen(s) { return tCp(s).length; }
  function tFirst(s, n) {
    var a = tCp(String(s == null ? '' : s).replace(/\s+/g, ' ').trim());
    return a.length > n ? a.slice(0, n).join('') : a.join('');
  }

  TOSS.cleanJargon = function (text) {
    var t = String(text == null ? '' : text);
    TOSS_JARGON.forEach(function (r) { t = t.replace(r[0], r[1]); });
    return t;
  };

  // 카카오 전화번호(+82 10-1234-5678 / +82 1012345678 / 010-1234-5678) → 숫자만 01012345678
  TOSS.normalizePhone = function (raw) {
    var s = String(raw == null ? '' : raw).trim();
    var d = s.replace(/[^0-9]/g, '');
    if (!d) return '';
    if (/^\+?\s*82/.test(s)) d = d.slice(2);
    if (d.charAt(0) !== '0') d = '0' + d;
    return d;
  };

  // **강조** 마크다운을 날것의 별표 없이 <strong> HTML로 안전 변환
  TOSS.toHtml = function (text) {
    var s = String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*+/g, '').replace(/`+/g, '').replace(/^#+\s*/gm, '');
    return s.replace(/\r?\n/g, '<br>');
  };

  // 공백 포함 110자 이내 강제 (문장 경계 우선 절단)
  TOSS.clampReply = function (text, max) {
    max = max || TOSS.MAX_REPLY;
    var t = TOSS.cleanJargon(String(text == null ? '' : text)).replace(/\r?\n{2,}/g, '\n').trim();
    if (tLen(t.replace(/\*\*/g, '')) <= max) return t;
    var plain = t.replace(/\*\*/g, '');
    var chars = tCp(plain);
    var cut = chars.slice(0, max).join('');
    var idx = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('요. '), cut.lastIndexOf('요? '));
    if (idx > max * 0.45) cut = cut.slice(0, idx + 1);
    else cut = tCp(cut).slice(0, max - 1).join('') + '…';
    return cut.trim();
  };

  TOSS.defaultOptions = function (step, answers) {
    answers = answers || {};
    var topic = String(answers[1] || '');
    var foreign = /외국인|k-?pop|케이팝|한국어|korean|유학/i.test(topic + ' ' + String(answers[2] || ''));
    switch (Number(step)) {
      case 1: return ['온라인 클래스·강의', '오프라인 모임·행사', '상품·서비스 소개', '무료 상담·진단'];
      case 2:
        if (foreign) return ['한국어 입문 외국인', 'K-POP 팬 학습자', '유학·취업 준비생', '한국 문화 관심자'];
        if (/학원|수학|영어|입시|학생|과외|공부/.test(topic)) return ['초등 학부모', '중·고등 학부모', '직접 공부할 학생', '성인 학습자'];
        return ['20~30대 직장인', '육아 중인 부모님', '창업을 준비하는 분', '자기계발에 관심 많은 분'];
      case 3:
        if (foreign || /외국인|영어/.test(String(answers[2] || ''))) return ['한국어와 영어 함께', '한국어로만', '영어 위주로', '일본어도 함께'];
        return ['친근하고 다정하게', '전문적이고 믿음직하게', '열정적이고 에너지 있게', '간결하고 담백하게'];
      case 4: return ['시간이 부족해요', '어디서 시작할지 몰라요', '혼자서는 꾸준히 못 해요', '비용이 부담돼요'];
      case 5: return ['핵심 요약 PDF 자료', '일정·오시는 길 안내', '체크리스트·워크시트', '신청 내역·안내 링크'];
      case 6: return ['경력 5년 이상', '누적 수강생·고객 수', '실제 후기·성과 사례', '자격증·수상 경력'];
      case 7: return ['현재 수준은 어느 정도세요?', '가장 궁금한 점은 뭔가요?', '신청 목적이 무엇인가요?', '선호하는 시간대는요?'];
      case 8: return ['정기 연재 (매주 소식)', '3~7일 챌린지', '행사 전 일정 안내', '쿠폰·혜택 발송'];
      default: return [];
    }
  };

  // 선택지: 3~4개, 각 22자 이내, 별표·전문용어 제거. 부족하면 단계별 기본 선택지로 보충
  TOSS.cleanOptions = function (arr, step, answers) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (o) {
      var s = (o && typeof o === 'object') ? (o.label || o.text || '') : o;
      s = TOSS.cleanJargon(String(s == null ? '' : s)).replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
      if (!s) return;
      if (tLen(s) > TOSS.MAX_OPTION) s = tCp(s).slice(0, TOSS.MAX_OPTION).join('');
      if (out.indexOf(s) === -1) out.push(s);
    });
    out = out.slice(0, 4);
    if (out.length < 3 && Number(step) >= 1 && Number(step) <= 8) {
      TOSS.defaultOptions(step, answers).forEach(function (d) {
        if (out.length < 4 && out.indexOf(d) === -1) out.push(d);
      });
    }
    return out.slice(0, 4);
  };

  TOSS.buildSystemPrompt = function () {
    var jargonList = ['1회차 알림톡', '미끼 자료', '뜰채 분기', '3번 트랙', '청사진', '제로베이스', '웹진 앵커', TOSS_BANNED_LIT].join(', ');
    return [
      '당신은 고마워톡 파트너님이 카카오 신청 캠페인을 만들 수 있도록 돕는 다정한 마케팅 도우미입니다.',
      '토스 앱처럼 "한 번에 질문 딱 하나"만 묻는 8단계 스무고개로 진행합니다.',
      '',
      '[절대 대화 수칙]',
      'A. replyText는 인사치레·앞선 답변 복창 없이 공백 포함 110자 이내(모바일 2~3줄)로 아주 짧고 다정한 존댓말로 쓰세요.',
      'B. 한 턴에는 오직 1개의 질문만 하세요. 두 가지를 한꺼번에 묻지 마세요. ("~와 ~는 어떻게 할까요?" 금지)',
      'C. 내부 전문용어(' + jargonList + ')를 파트너에게 절대 쓰지 마세요. "첫 무료 선물", "신청할 때 물어볼 질문", "이후 카톡 소식" 같은 일상 언어만 쓰세요.',
      'D. singleTopicOptions에는 "현재 질문 하나"에만 해당하는 짧고 직관적인 선택지 3~4개(각 22자 이내, 마침표·말줄임 없이)만 넣으세요. 다른 주제를 섞지 마세요.',
      'E. 마크다운 별표는 핵심 단어 강조용 **굵게**만 최소로 쓰고, 목록·제목 기호는 쓰지 마세요.',
      '',
      '[8단계 질문 순서]',
      'Step 1 핵심 주제: 이번에 어떤 클래스·상품·모임을 알리고 싶으신가요?',
      'Step 2 핵심 타겟: 주로 어떤 분들이 신청하면 가장 좋을까요? (Step 1 답변에 딱 맞는 타겟 3~4개를 선택지로)',
      'Step 3 언어와 말투: 안내 페이지와 카톡 문구는 어떤 언어·분위기로 적을까요? (외국인 대상이면 "한국어와 영어 함께" 등 언어 선택지, 내국인이면 친근함/전문성/열정 등 말투 선택지)',
      'Step 4 고객 고민: 그분들이 평소 가장 답답해하거나 고민하는 점은 무엇인가요? (주제·타겟에 맞춘 고민 선택지)',
      'Step 5 첫 무료 혜택: 카카오 1초 신청 직후 첫 카톡으로 바로 보내드릴 무료 자료나 혜택은 무엇으로 할까요?',
      'Step 6 신뢰 강점: 고객이 믿고 신청할 수 있게 자랑할 만한 경력·강점·성과 숫자가 있나요?',
      'Step 7 신청 질문: 신청할 때 고객에게 물어보고 싶은 객관식 질문을 골라 주세요. (1~2개 복수 선택 가능 — 선택지는 "물어볼 질문" 후보 3~4개)',
      'Step 8 이후 카톡 소식: 첫 선물 뒤에는 어떤 흐름(정기 연재 / 며칠 챌린지 / 행사 전 안내 / 쿠폰 발송 등)으로 카톡 소식을 이어갈까요?',
      '',
      '[매 턴 판단 규칙] 입력에는 pendingStep(P: 방금 물어본 질문 번호)과 파트너의 방금 메시지가 주어집니다.',
      '1) 메시지가 P번 질문에 대한 답이면: 짧게 받아주고 다음 질문(P+1)을 던지세요. currentStep=P+1. 단, P가 8이면 질문 대신 "정리해 드릴게요" 정도로 마무리하고 isReadyForSummary=true, currentStep=8, singleTopicOptions=[].',
      '2) 메시지가 고마워톡 기능·요금·규정에 대한 질문이면: [참고 지식]으로 1문장 이내로 쉽게 답한 뒤 같은 질문 P를 다시 짧게 묻고 currentStep=P.',
      '3) 메시지가 앞선 답을 고치는 말이면: 반영했다고 짧게 말하고 같은 질문 P를 다시 묻고 currentStep=P.',
      '4) 답이 모호하면: 같은 질문 P를 더 쉬운 말로 다시 묻고 currentStep=P.',
      '파트너가 선택지 버튼을 눌러 보낸 메시지(isButtonAnswer=true)는 반드시 규칙 1의 답으로 처리하세요.',
      '',
      '[출력] 아래 JSON 객체만 출력하세요. (설명·코드블록 금지)',
      '{"replyText":"110자 이내 말풍선","currentStep":1,"singleTopicOptions":["선택지1","선택지2","선택지3"],"isReadyForSummary":false}'
    ].join('\n');
  };

  TOSS.formatAnswers = function (answers) {
    return TOSS.STEPS.map(function (s) {
      return (answers && answers[s.n]) ? ('Step ' + s.n + ' ' + s.label + ': ' + answers[s.n]) : null;
    }).filter(Boolean).join('\n') || '(아직 받은 답 없음)';
  };

  TOSS.buildTurnPrompt = function (ctx) {
    var know = '';
    if (detectQuestionIntent(ctx.userText) || /알림톡|친구톡|캐러셀|요금|플랜|규정|고마워톡/.test(String(ctx.userText || ''))) {
      var k = searchKnowledge(ctx.userText, global.GomawartalkManual || global.GOMAWARTALK_MANUAL || []);
      if (k) know = String(k).slice(0, 700);
    }
    return [
      '[파트너] ' + (ctx.partnerName || '파트너님'),
      '[지금까지 받은 답]',
      TOSS.formatAnswers(ctx.answers),
      '',
      'pendingStep(P) = ' + ctx.pendingStep,
      'AI가 방금 한 질문: "' + String(ctx.lastQuestion || '') + '"',
      'isButtonAnswer = ' + (ctx.isButtonAnswer ? 'true' : 'false'),
      '[파트너의 방금 메시지]',
      String(ctx.userText || ''),
      know ? ('\n[참고 지식]\n' + know) : '',
      '\n위 규칙대로 JSON 객체만 출력하세요.'
    ].join('\n');
  };

  TOSS.postProxy = function (url, body, opts) {
    opts = opts || {};
    var u = String(url || '').trim();
    if (!u) return Promise.reject(new Error('서버 연결 주소(BACKEND_PROXY_URL)가 설정되지 않았어요.'));
    var timeoutMs = Number(opts.timeoutMs) || 24000;
    var controller = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs) : null;
    var fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script CORS 사전요청(preflight) 회피
      body: JSON.stringify(body)
    };
    if (controller) fetchOpts.signal = controller.signal;
    return fetch(u, fetchOpts).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('서버 응답 오류 (HTTP ' + res.status + ')');
      return res.json();
    }).then(function (data) {
      if (data && data.error && !opts.allowErrorPayload && !data.quotaExceeded) {
        var e = new Error(data.error);
        e.code = data.code || '';
        e.data = data;
        throw e;
      }
      return data;
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  };

  TOSS.reportIssue = function (proxyUrl, payload) {
    return TOSS.postProxy(proxyUrl, Object.assign({ action: 'report_issue' }, payload || {}), {
      allowErrorPayload: true,
      timeoutMs: 15000
    });
  };

  // AI 호출 라우터: admin → 로컬 Gemini 키 직결(없으면 Proxy 자동 폴백) / partner → Backend_Proxy 경유
  TOSS.callAI = function (o) {
    o = o || {};
    var cfg = getConfig();
    var proxyUrl = String(o.proxyUrl || cfg.proxyUrl || '').trim();
    var maxTokens = Math.max(Number(o.maxOutputTokens) || 0, 2048);
    if (o.mode === 'admin' && cfg.hasDirectKey) {
      return callGemini({
        apiKey: cfg.apiKey,
        systemInstruction: o.system,
        userText: o.user,
        responseMimeType: o.responseMimeType !== undefined ? o.responseMimeType : 'application/json',
        temperature: o.temperature !== undefined ? o.temperature : 0.4,
        maxOutputTokens: maxTokens,
        thinkingBudget: 0
      });
    }
    if (proxyUrl) {
      return TOSS.postProxy(proxyUrl, {
        action: 'chat',
        partnerToken: o.token || '',
        systemPrompt: o.system,
        userText: o.user,
        responseMimeType: o.responseMimeType !== undefined ? o.responseMimeType : 'application/json',
        temperature: o.temperature !== undefined ? o.temperature : 0.4,
        maxOutputTokens: maxTokens,
        thinkingBudget: 0
      }, { timeoutMs: o.timeoutMs || 24000 }).then(function (d) { return sanitizeText(d.reply || d.text || ''); });
    }
    var ne = new Error('NO_LOCAL_KEY'); ne.code = 'NO_LOCAL_KEY';
    return Promise.reject(ne);
  };

  // 오프라인 시뮬레이션 (관리자 로컬 테스트 + Gemini 키 미등록 시에만 사용)
  TOSS.offlineTurn = function (ctx) {
    var P = Number(ctx.pendingStep) || 1;
    var txt = String(ctx.userText || '');
    var isQ = !ctx.isButtonAnswer && /\?$|인가요|있나요|얼마|어떻게|차이/.test(txt) && txt.length < 60;
    if (isQ) {
      return {
        replyText: '그건 담당자가 자세히 안내해 드려요. 먼저 이 질문부터 가볍게 답해 주세요 🙂\n**' + TOSS.STEPS[P - 1].q + '**',
        currentStep: P, singleTopicOptions: TOSS.defaultOptions(P, ctx.answers), isReadyForSummary: false
      };
    }
    if (P >= 8) {
      return { replyText: '답변 감사해요! 지금까지 내용을 **한 장으로 정리**해 드릴게요.', currentStep: 8, singleTopicOptions: [], isReadyForSummary: true };
    }
    var next = P + 1;
    var ans = Object.assign({}, ctx.answers); ans[P] = txt;
    var lead = ['좋아요!', '알겠어요.', '좋은 방향이에요.', '네, 확인했어요.', '멋져요!', '좋아요.', '네, 알겠어요.'][P - 1] || '좋아요!';
    return {
      replyText: lead + ' ' + (next === 7 ? '이제 신청 때 물어볼 질문이에요.\n' : '') + '**' + TOSS.STEPS[next - 1].q + '**',
      currentStep: next,
      singleTopicOptions: TOSS.defaultOptions(next, ans),
      isReadyForSummary: false
    };
  };

  // 1턴 처리: AI 응답을 정규화(110자·1질문·선택지 규격·전문용어 방어)
  TOSS.runTurn = function (ctx) {
    var P = Number(ctx.pendingStep) || 1;
    var done = function (raw) {
      var obj = (typeof raw === 'string') ? extractJson(raw) : raw;
      if (!obj || typeof obj !== 'object' || !String(obj.replyText || '').trim()) {
        throw new Error('AI 응답을 이해하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      var cs = Number(obj.currentStep);
      if (!isFinite(cs)) cs = P;
      cs = Math.max(P, Math.min(P + 1, cs));
      var ready = (P === 8) && obj.isReadyForSummary === true;
      if (ctx.isButtonAnswer && P === 8) ready = true;
      var advanced = ready || cs > P;
      var step = ready ? 8 : cs;
      var opts = ready ? [] : TOSS.cleanOptions(obj.singleTopicOptions, step, ctx.answers);
      return {
        replyText: TOSS.clampReply(obj.replyText, TOSS.MAX_REPLY),
        currentStep: step,
        singleTopicOptions: opts,
        isReadyForSummary: ready,
        allowMultiple: !ready && step === 7,
        advanced: advanced
      };
    };
    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: TOSS.buildSystemPrompt(), user: TOSS.buildTurnPrompt(ctx),
      temperature: 0.45, maxOutputTokens: 1024
    }).then(done);
  };

  // ── 기획 요약 카드 (타겟 / 핵심 카피 컨셉 / 첫 혜택 / 신청 질문 / 카톡 발송 흐름)
  TOSS.localSummary = function (A) {
    var qs = String(A[7] || '').split(/\s*\/\s*|\n/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 2);
    return {
      target: tFirst(A[2] || '-', 40),
      concept: tFirst((A[4] ? ('"' + tFirst(A[4], 22) + '" 고민을 ') : '') + (A[1] || '핵심 주제') + '로 해결해 드려요', 60),
      gift: tFirst(A[5] || '-', 40),
      questions: qs.length ? qs : ['(신청 질문 미선택)'],
      flow: tFirst(A[8] || '-', 40)
    };
  };

  TOSS.summarize = function (ctx, revisionText) {
    var sys = [
      '당신은 고마워톡 마케팅 도우미입니다. 파트너님의 8가지 답변을 모바일에서 한눈에 보이는 기획 요약으로 정리하세요.',
      '각 항목은 40자 이내의 쉬운 일상 언어로 쓰고, 전문용어(' + ['1회차 알림톡', '미끼 자료', '뜰채 분기', '청사진', '제로베이스', '웹진 앵커', TOSS_BANNED_LIT].join(', ') + ')는 쓰지 마세요.',
      '출력 JSON: {"target":"","concept":"핵심 카피 컨셉 한 줄(60자 이내)","gift":"첫 무료 혜택","questions":["신청할 때 물어볼 질문1","질문2"],"flow":"카톡 소식 이어가는 흐름"}'
    ].join('\n');
    var user = '[파트너님 답변]\n' + TOSS.formatAnswers(ctx.answers) +
      (ctx.notes && ctx.notes.length ? ('\n[추가 메모]\n' + ctx.notes.join('\n')) : '') +
      (ctx.prevSummary ? ('\n[이전 요약]\n' + JSON.stringify(ctx.prevSummary)) : '') +
      (revisionText ? ('\n[파트너님 수정 요청 — 반드시 반영]\n' + revisionText) : '') + '\n\nJSON만 출력하세요.';
    return TOSS.callAI({ mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token, system: sys, user: user, temperature: 0.3, maxOutputTokens: 1024 })
      .then(function (raw) {
        var o = extractJson(raw);
        if (!o || !o.target) throw new Error('요약 파싱 실패');
        var qs = (Array.isArray(o.questions) ? o.questions : []).map(function (q) { return tFirst(TOSS.cleanJargon(q), 40); }).filter(Boolean).slice(0, 2);
        return {
          target: tFirst(TOSS.cleanJargon(o.target), 40),
          concept: tFirst(TOSS.cleanJargon(o.concept), 60),
          gift: tFirst(TOSS.cleanJargon(o.gift), 40),
          questions: qs.length ? qs : TOSS.localSummary(ctx.answers).questions,
          flow: tFirst(TOSS.cleanJargon(o.flow), 40)
        };
      });
  };

  // ── 최종 제작: 100% 제로베이스 CampaignMaster.json V2.0 (프리셋 문구 복사 0%)
  TOSS.buildGenerationPrompt = function (ctx) {
    var schema = {
      tab1_basic_settings: {
        thumbnail_500x280: { badge: '16자 이내 포인트 배지', headline: '썸네일 헤드카피(2줄 이내)', subtext: '보조 한 줄', imagePrompt: 'English commercial photo prompt, 16:9, no text' },
        title_30chars: '[신청] 30자 이내 타이틀', description: '1~2문장 설명', apply_btn_text: '신청하기 버튼명', cancel_btn_text: '소식 그만 받기 (신청취소)'
      },
      tab2_landing_content: { blocks_1000px: [
        { step: 1, type: 'HERO', tag: '타겟 배지', title: '메인 헤드카피', subtitle: '서브카피', spec_1: '핵심 혜택1', spec_2: '핵심 혜택2', spec_3: '핵심 혜택3', imagePrompt: 'English photo prompt for hero scene, no text' },
        { step: 2, type: 'PAIN_POINT', title: '공감 질문', lead: '리드 문구', items: ['고민1', '고민2', '고민3'], bottom_quote: '해결 연결 한 줄' },
        { step: 3, type: 'SOLUTION', title: '해결책 타이틀', points: ['1편. …', '2편. …', '3편. …'], imagePrompt: 'English photo prompt for guide/material mockup, no text' },
        { step: 4, type: 'TRUST_PROOF', title: '신뢰 타이틀', stat_highlight: '핵심 성과/강점 한 줄', rec1_title: '추천 대상 제목', rec1_body: '설명', rec2_title: '기대 효과 제목', rec2_body: '설명', imagePrompt: 'English photo prompt for trust/positive change scene, no text' },
        { step: 5, type: 'BOTTOM_CUE', sum_method: '신청 방식', sum_benefit: '제공 혜택', sum_timing: '발송 시점', sum_notice: '안내 사항', notice: '하단 안내', arrow_text: '아래 [신청하기] 버튼을 눌러 지금 바로 신청하세요' }
      ] },
      tab3_application_form: { form_title: '10초 설문 제목', form_guide_text: '안내 문구', questions: [
        { question_text: '파트너가 고른 질문1', options: [{ answer_text: '보기1', tag: '태그1', sheet_field: '고객진단.항목1', sheet_value: '값1' }, { answer_text: '보기2', tag: '태그2', sheet_field: '고객진단.항목1', sheet_value: '값2' }, { answer_text: '보기3', tag: '태그3', sheet_field: '고객진단.항목1', sheet_value: '값3' }] }
      ] },
      tab4_sequence: [
        { step: 1, timing: 'IMMEDIATE', template_type: 'ALIMTALK', has_spotlight_branch: false, condition_desc: '모두 (전체 신청자)', content_title: '신청 확인용 제목(광고어 금지)', content_intro: '순수 접수 확인·첫 자료 안내만 작성(광고어·채널 추가 유도 문구 절대 금지)', btn_name: '첫 자료 확인하기' },
        {
          step: 2, timing: 'AFTER_1_DAY_0900', template_type: 'FREE_FRIENDTALK', has_spotlight_branch: true,
          branch_pair: [
            { priority: 1, option_label: '선택지A(적극/숙련/핵심니즈)', tag: '태그A', badge: '선택지A 맞춤 배지', headline: '선택지A 눈높이에 맞춘 완전히 다른 헤드라인', subtext: '선택지A 보조문구', body_text: '#{이름}님! 선택지A 대상의 공감 첫 문장과 구체적 제공 가치 본문(기계식 치환 금지)', btn_name: '선택지A 전용 버튼' },
            { priority: 2, option_label: '선택지B(입문/고민중/나머지)', tag: '나머지모두', badge: '선택지B 맞춤 배지', headline: '선택지B 눈높이에 맞춘 완전히 다른 헤드라인', subtext: '선택지B 보조문구', body_text: '#{이름}님! 선택지B 대상의 공감 첫 문장과 완전히 다른 제공 가치 본문(기계식 치환 금지)', btn_name: '선택지B 전용 버튼' }
          ]
        },
        { step: 3, timing: 'AFTER_3_DAYS_0900', template_type: 'BRAND_CAROUSEL', has_spotlight_branch: false, condition_desc: '모두 (전체 신청자)', cards: [{ header_20chars: '카드1 제목', body_180chars: '본문', button_8chars: '자세히보기' }, { header_20chars: '카드2 제목', body_180chars: '본문', button_8chars: '신청하기' }] },
        { step: 4, timing: 'AFTER_7_DAYS_1000', template_type: 'FREE_FRIENDTALK', has_spotlight_branch: false, condition_desc: '모두 (전체 신청자)', badge: '광고 3회차 · 마감 혜택', headline: '최종 혜택 및 상담 안내', subtext: '보조문구', body_text: '#{이름}님! 마지막 혜택과 상담 일정을 확인해 보세요.', btn_name: '혜택 자세히 보기' }
      ],
      use_webzine: true,
      webzine_studio: { webzine_title: '매거진 타이틀', sections: [
        { anchor_id: 'sec-1', type: 'ARTICLE_CARD', badge: 'PART 01', title: '1. 제목', body: '본문 3~4문장' },
        { anchor_id: 'sec-2', type: 'MULTI_CATEGORY_TABS', badge: 'PART 02', title: '2. 유형별 안내', tabs: [{ label: '유형1', content: '내용' }, { label: '유형2', content: '내용' }, { label: '유형3', content: '내용' }] },
        { anchor_id: 'sec-3', type: 'STAT_AND_FAQ', badge: 'PART 03', title: '3. 성과 & 질문', stat_label: '지표명', stat_value: 98, stat_unit: '%', q: '자주 묻는 질문', a: '답변' },
        { anchor_id: 'sec-cta', type: 'FLOATING_CTA', button_text: 'CTA 버튼명', link: 'https://gomawartalk.com' }
      ] }
    };
    var sys = [
      '당신은 고마워톡 수석 카피라이터입니다. 파트너님의 8가지 답변만을 재료로 캠페인 전체 문구를 100% 새로 작문하세요.',
      '규칙: 1) 어떤 업종 샘플 문구도 복사하지 말고 오직 이번 답변에서 출발하세요. 2) 금지어(' + TOSS_BANNED_LIT + ')는 쓰지 마세요.',
      '3) 알림톡(ALIMTALK · 1회차)에는 쿠폰/할인권/할인/특가/이벤트/무료증정 같은 광고성 단어 및 "채널 추가를 눌러주세요", "채널 추가 부탁드려요" 같은 채널 추가 유도 문구를 본문에 절대 쓰지 마세요(카카오 심사 반려 사유). 만약 파트너가 쿠폰·할인 혜택을 언급했다면 알림톡은 순수 정보성 접수 확인으로 작성하고, 쿠폰·할인 내용은 반드시 2회차(④ 첫 번째 광고 메시지) 본문과 버튼에 100% 정확히 반영하세요. 4) 시트 변수는 #{@시트명.필드명} 형식.',
      '5) 말투(Step 3)와 언어(예: 한국어+영어 병기)를 모든 문구에 일관되게 반영하세요. 6) 신청 질문(Step 7)의 question_text는 반드시 "~할게요/~파악합니다/~질문해" 같은 파트너 시점 서술문이 아닌 실제 고객에게 묻는 정중한 1줄 질문(예: "선호하시는 사과 크기를 선택해 주세요.")으로 변환하고, 파트너가 따옴표(\'...\')·괄호·슬래시·"A와 B" 등으로 언급한 구체 선택지를 최우선 추출해 options에 그대로 넣으세요(최대 2문항).',
      '7) [원포인트 맞춤 분기 절대 원칙 — 단 1개 핵심 회차 × 2종 대비 원고] 캠페인 전체에서 딱 1개 핵심 메시지 회차(기본: tab4_sequence 2회차)에만 has_spotlight_branch=true와 극명하게 대비되는 2종의 맞춤 원고 branch_pair(1순위 핵심 태그 선택지A vs 2순위 나머지 모두 선택지B)를 작성하고, 나머지 모든 회차(1회차·3회차 등)는 has_spotlight_branch=false 공통 단일 원고 1개로 작성하세요.',
      '8) [기계식 단어 대입 100% 금지] "[예] 신청자 전용 가이드", "[모름] 집중 완성 로드맵", "선택하신 「예」 기준에 맞춰..."처럼 설문 보기 글자만 끼워 넣는 치환 문구를 절대 쓰지 마세요! 한국어 익숙도 "상"("한국어를 완벽히 마스터해 봅시다! 실전 고급 표현 3가지...") vs "하"("처음이어도 괜찮아요! 오늘 바로 써먹는 쉬운 기초 인사말부터...")처럼 대상 눈높이에 맞춰 카드 헤드라인·첫 문장 공감 화법·핵심 제공 가치·버튼명까지 완전히 다른 고품질 원고 2개를 작성하세요.',
      '9) [알림톡 1 : 광고 3 황금 비율] 카톡 채널 친구 수가 늘어나는 원리에 맞춰 신청 즉시 알림톡(1회) + 후속 광고 메시지(이미지형/캐러셀 3회) 1:3 비율로 구성하고, 연재·챌린지·콘텐츠형이면 use_webzine=true, 쿠폰·행사 안내 위주면 false.',
      '10) imagePrompt는 반드시 영어, "no text, no letters" 포함, 해당 구간 장면을 구체적으로.',
      '출력은 아래 스키마와 동일한 키 구조의 JSON 객체 하나만.'
    ].join('\n');
    var user = '[파트너님 답변]\n' + TOSS.formatAnswers(ctx.answers) +
      (ctx.notes && ctx.notes.length ? ('\n[추가 메모]\n' + ctx.notes.join('\n')) : '') +
      (ctx.summary ? ('\n[확정된 기획 요약]\n' + JSON.stringify(ctx.summary)) : '') +
      '\n\n[출력 스키마]\n' + JSON.stringify(schema);
    return { system: sys, user: user };
  };

  TOSS.fallbackContent = function (A, partner) {
    A = A || {};
    var topic = String(A[1] || '맞춤 캠페인'), target = String(A[2] || ''), pain = String(A[4] || ''), gift = String(A[5] || '핵심 자료');
    var proof = String(A[6] || ''), flow = String(A[8] || '');
    var painItems = pain.split(/\s*[\n,/·]\s*/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3);
    ['혼자서는 어디서부터 시작할지 막막해요', '시간과 노력을 들여도 결과가 아쉬워요'].forEach(function (g) { if (painItems.length < 3) painItems.push(g); });
    var qList = String(A[7] || '').split(/\s*\/\s*|\n/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 2);
    if (!qList.length) qList = ['신청 목적이 무엇인가요?'];
    var themeEn = Engine_buildPrompt(topic + ' ' + target);
    return {
      tab1_basic_settings: {
        thumbnail_500x280: { badge: tFirst(target || '신청 안내', 16), headline: tFirst(topic, 34), subtext: tFirst('카카오로 1초 신청 · ' + gift, 36), imagePrompt: themeEn },
        title_30chars: tFirst('[신청] ' + topic, 30), description: tFirst(topic + ' — 카카오로 신청하고 ' + gift + '을(를) 받아보세요.', 120),
        apply_btn_text: '1초 만에 신청하기', cancel_btn_text: '소식 그만 받기 (신청취소)'
      },
      tab2_landing_content: { blocks_1000px: [
        { step: 1, type: 'HERO', tag: tFirst(target || '신청 안내', 18), title: tFirst(topic, 40), subtitle: tFirst('카카오로 1초 신청하면 ' + gift + '을(를) 바로 보내드려요', 60), spec_1: tFirst(gift, 26), spec_2: '카카오톡 1초 신청 · 즉시 발송', spec_3: tFirst(flow || '이어지는 카톡 소식 제공', 26), imagePrompt: themeEn },
        { step: 2, type: 'PAIN_POINT', title: '혹시 이런 고민이 있으신가요?', lead: '하나라도 해당된다면 끝까지 확인해 보세요.', items: painItems, bottom_quote: tFirst(topic + ', 이렇게 도와드려요.', 50) },
        { step: 3, type: 'SOLUTION', title: tFirst(topic + ' 이렇게 도와드려요', 40), points: ['1편. ' + tFirst(gift, 30), '2편. 맞춤 안내를 카톡으로 이어서', '3편. 궁금한 점 1:1 안내'], imagePrompt: themeEn },
        { step: 4, type: 'TRUST_PROOF', title: '믿고 신청하셔도 좋은 이유', stat_highlight: tFirst(proof || '신청자 한 분 한 분께 꼼꼼히 안내합니다', 50), rec1_title: '이런 분께 추천해요', rec1_body: tFirst(target || topic, 60), rec2_title: '신청 즉시 받아보세요', rec2_body: tFirst(gift, 60), imagePrompt: themeEn },
        { step: 5, type: 'BOTTOM_CUE', sum_method: '카카오 원클릭 로그인 (10초 간편 접수)', sum_benefit: tFirst(gift, 40), sum_timing: '신청 완료 즉시 카카오톡 발송', sum_notice: '상단 노란색 [채널 추가] 클릭 시 후속 소식 수신', notice: '카카오 로그인 한 번으로 별도 입력 없이 즉시 접수됩니다', arrow_text: '아래 [신청하기] 버튼을 눌러 지금 바로 신청하세요' }
      ] },
      tab3_application_form: { form_title: '신청 전 10초 설문', form_guide_text: '정확한 맞춤 안내 발송을 위해 아래 항목을 선택해 주세요.', questions: qList.map(function (q, i) {
        return parseSurveyQuestionFromAnswer(q, topic + ' ' + target, i);
      }) },
      tab4_sequence: [
        { step: 1, timing: 'IMMEDIATE', template_type: 'ALIMTALK', condition_desc: '모두 (전체 신청자)', content_title: tFirst(topic, 20) + ' 신청 접수 확인', content_intro: stripAlimtalkPromoCopy(gift, topic) || '신청이 정상 접수되었습니다. 신청 내역과 상세 안내는 아래 버튼에서 바로 확인해 보세요.', btn_name: '신청 내역 확인하기' },
        { step: 2, timing: 'AFTER_1_DAY_0900', template_type: 'FREE_FRIENDTALK', condition_desc: '모두 (전체 신청자)', badge: tFirst(target || '채널 친구 전용', 14), headline: tFirst(topic, 30), subtext: tFirst(gift, 30), body_text: '#{이름}님! ' + tFirst(topic, 26) + ' 관련 두 번째 소식을 보내드려요. ' + tFirst(flow || gift, 70), btn_name: '자세히 보기' },
        { step: 3, timing: 'AFTER_3_DAYS_0900', template_type: 'BRAND_CAROUSEL', condition_desc: '모두 (전체 신청자)', cards: buildDomainCarouselCards(topic, gift, target) },
        { step: 4, timing: 'AFTER_7_DAYS_1000', template_type: 'FREE_FRIENDTALK', condition_desc: '모두 (전체 신청자)', badge: '마감 혜택 · 상담 안내', headline: tFirst(topic, 24) + ' 최종 안내', subtext: '채널 친구 전용 마지막 혜택', body_text: '#{이름}님! 보내드린 안내는 잘 살펴보셨나요? 놓치면 아쉬운 특별 혜택과 일정을 지금 확인해 보세요.', btn_name: '혜택 자세히 보기' }
      ],
      use_webzine: /연재|챌린지|칼럼|소식|정기/.test(flow),
      webzine_studio: { webzine_title: tFirst(topic, 24) + ' 매거진', sections: [
        { anchor_id: 'sec-1', type: 'ARTICLE_CARD', badge: 'PART 01', title: '1. ' + tFirst(topic, 24), body: tFirst(gift + ' — ' + (target || ''), 120) },
        { anchor_id: 'sec-2', type: 'MULTI_CATEGORY_TABS', badge: 'PART 02', title: '2. 이런 분께 안내해요', tabs: [{ label: '처음이에요', content: '처음 시작하는 분께 맞춘 안내입니다.' }, { label: '해봤어요', content: '경험이 있는 분께 맞춘 안내입니다.' }, { label: '고민 중', content: '고민 중인 분께 맞춘 안내입니다.' }] },
        { anchor_id: 'sec-3', type: 'STAT_AND_FAQ', badge: 'PART 03', title: '3. 자주 묻는 질문', stat_label: '신청자 안내 만족도', stat_value: 98, stat_unit: '%', q: '신청하면 무엇을 받나요?', a: tFirst(gift, 80) + '을(를) 첫 카톡으로 보내드려요.' },
        { anchor_id: 'sec-cta', type: 'FLOATING_CTA', button_text: '지금 신청하기', link: 'https://gomawartalk.com' }
      ] }
    };
  };

  // fallbackContent 내부에서 쓰는 영문 이미지 프롬프트 생성 도우미 (한글 주제 키워드 → 영어 장면)
  function Engine_buildPrompt(text) {
    return buildEnglishImagePrompt({ customInstruction: text, slotRole: 'slot1' });
  }

  // ★ V2.8.2 원포인트 맞춤 분기 엔진 (단 1개 핵심 회차 × 2종 진짜 맞춤 원고 · 기계식 단어 대입 100% 차단)
  var MECHANICAL_BRANCH_RE = /\[(?:예|아니오|모름)\]|선택하신\s*[「'"\[]?(?:예|아니오|모름|[^\s」'"\]]{1,12})[」'"\]]?\s*기준에\s*맞춰|신청자\s*전용\s*가이드|집중\s*완성\s*로드맵|물음에\s*맞춰\s*필요한\s*핵심\s*얘기만/i;

  function isMechanicalBranchCopy(text) {
    return MECHANICAL_BRANCH_RE.test(String(text == null ? '' : text));
  }

  function pickKoreanParticle(word, consonantParticle, vowelParticle) {
    var w = String(word || '').replace(/[\s"'‘’“”()\[\]?!.,]+$/g, '');
    if (!w) return vowelParticle;
    var code = w.charCodeAt(w.length - 1);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      return ((code - 0xAC00) % 28 !== 0) ? consonantParticle : vowelParticle;
    }
    return vowelParticle;
  }

  function buildDomainCarouselCards(topic, gift, target) {
    var cleanTopic = tFirst(String(topic || '맞춤 안내').replace(/^\[[^\]]+\]\s*/, ''), 18) || '핵심 안내';
    var cleanGift = tFirst(String(gift || '준비된 핵심 안내와 혜택을 확인해 보세요.'), 110);
    var hay = (cleanTopic + ' ' + cleanGift + ' ' + String(target || '')).toLowerCase();
    if (/사과|과일|나주배|신고배|배\s*(?:농원|농장|과수원|선물|직송|즙)|딸기|귤|감귤|복숭아|포도|농원|농장|과수원|산지|직송|농산물|채소|상추|반찬|식품|한우|수산/i.test(hay)) {
      return [
        { header_20chars: tFirst(cleanTopic + ' 산지 소식', 20), body_180chars: '#{이름}님! 산지에서 갓 수확해 가장 신선한 시기에 보내드리는 ' + cleanTopic + ' 구성과 특징을 한눈에 확인해 보세요.', button_8chars: '구성살펴보기' },
        { header_20chars: '실제 구매 고객 후기', body_180chars: '아삭한 식감과 진한 당도로 재주문율이 가장 높은 인기 구성을 생생한 후기와 함께 모았습니다.', button_8chars: '후기확인하기' },
        { header_20chars: '채널 친구 전용 혜택', body_180chars: tFirst(cleanGift || '이번 시즌 한정으로 준비한 산지 직송 혜택과 주문 안내를 지금 바로 확인해 보세요.', 140), button_8chars: '혜택받기' }
      ];
    }
    return [
      { header_20chars: tFirst(cleanTopic + ' 핵심 안내', 20), body_180chars: tFirst('#{이름}님! ' + cleanGift, 140), button_8chars: '자세히보기' },
      { header_20chars: '실제 이용 고객 후기', body_180chars: '먼저 경험하신 고객님들의 생생한 후기와 만족 포인트를 카드 한 장으로 정리했습니다.', button_8chars: '후기보기' },
      { header_20chars: '전용 혜택·상담 안내', body_180chars: '궁금한 점이나 예약·주문 안내가 필요하시면 아래 버튼에서 바로 이어가실 수 있어요.', button_8chars: '혜택확인' }
    ];
  }

  // ★ V3.1 Q2 신청질문 보기 최우선 추출기 (따옴표 '...' / "..." / 「...」 ➔ 괄호 (A/B) ➔ 'A와 B'·슬래시·쉼표)
  function extractSurveyOptionsFromText(rawText) {
    var q = String(rawText || '').trim();
    if (!q) return [];
    var out = [];
    var pushOpt = function (raw) {
      var s = String(raw || '')
        .replace(/^[\s"'‘’“”「」『』\[\]·\-•]+|[\s"'‘’“”「」『』\[\]·\-•]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      // 짝이 맞지 않는 외곽 괄호만 제거하고 '(상)'·'(하)' 같은 정상 괄호 표기는 보존
      if (s.charAt(0) === '(' && s.indexOf(')') === -1) s = s.slice(1).trim();
      if (s.charAt(s.length - 1) === ')' && s.indexOf('(') === -1) s = s.slice(0, -1).trim();
      if (!s || s.length < 2 || s.length > 32) return;
      if (/^(?:필수|선택|질문|보기|객관식|옵션|예시|참고)$/.test(s)) return;
      if (out.indexOf(s) === -1) out.push(s);
    };

    // 1) 작은따옴표('...'), 큰따옴표("..."), 둥근따옴표(‘...’ / “...”), 낫표(「...」) 최우선 추출
    var quoteRe = /(?:'([^'\n]{2,32})'|"([^"\n]{2,32})"|‘([^’\n]{2,32})’|“([^”\n]{2,32})”|「([^」\n]{2,32})」|『([^』\n]{2,32})』)/g;
    var qm;
    while ((qm = quoteRe.exec(q)) !== null) {
      pushOpt(qm[1] || qm[2] || qm[3] || qm[4] || qm[5] || qm[6]);
    }
    if (out.length >= 2) return out.slice(0, 5);

    // 2) 최외곽 괄호 안의 구분자 보기 (중첩 괄호 '(어느 정도 익숙해요 (상) / 기초 (하))' 완벽 지원)
    var firstOpen = q.indexOf('(');
    var lastClose = q.lastIndexOf(')');
    if (firstOpen !== -1 && lastClose > firstOpen + 3 && (lastClose - firstOpen) <= 120) {
      var parenInner = q.slice(firstOpen + 1, lastClose).trim();
      if (/[\/·,|]/.test(parenInner)) {
        parenInner.split(/\s*[\/·,|]\s*/).forEach(pushOpt);
        if (out.length >= 2) return out.slice(0, 5);
      }
    }

    // 3) 본문 내 슬래시(/) 또는 'A와 B로' / 'A 또는 B' 패턴 추출
    if (q.indexOf('/') !== -1) {
      var slashClause = q.replace(/^[^:：?？]*[:：?？]\s*/, '');
      var sParts = slashClause.split(/\s*\/\s*/);
      if (sParts.length >= 2 && sParts.length <= 5) {
        sParts.forEach(function (p) {
          var cleaned = p.replace(/\s*(?:중|사이|로|으로)\s*(?:선택|고르|파악|나눠|분류|구분).*$/, '').trim();
          pushOpt(cleaned);
        });
        if (out.length >= 2) return out.slice(0, 5);
      }
    }

    var abMatch = q.match(/([가-힣a-zA-Z0-9\s·]{2,22}?)(?:와|과|또는|혹은|vs)\s+([가-힣a-zA-Z0-9\s·]{2,22}?)(?:로|으로|중|사이|를|을|에|의|\s*(?:취향|유형|구분|나눠|분류|파악|선택|비교))/);
    if (abMatch && abMatch[1] && abMatch[2]) {
      var leftA = abMatch[1].replace(/^.*(?:질문해|물어봐|물어보고|선택해|골라|중에서)\s*/, '').trim();
      var rightB = abMatch[2].trim();
      pushOpt(leftA);
      pushOpt(rightB);
      if (out.length >= 2) return out.slice(0, 5);
    }

    return [];
  }

  // ★ V3.1 파트너 시점 서술형 문장(~할게요/~파악합니다/~물어보고 싶어요) → 고객에게 묻는 자연스러운 1줄 질문 변환
  function isPartnerNarrativeQuestion(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    return /(?:할게요|할께요|합니다|해요|하고\s*싶어요|하고\s*싶습니다|파악할|파악하려|물어보고\s*싶|물어볼게요|여쭤볼게요|질문해\s|질문해서|나눌게요|분류할게요|구분할게요|받으려고|받겠습니다|취향을\s*파악)/i.test(s);
  }

  function convertPartnerNarrativeToCustomerQuestion(rawText, extractedOpts, topicSeed) {
    var s = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!s) return '관심 있는 항목을 선택해 주세요.';

    // 이미 고객에게 묻는 깨끗한 질문이고 파트너 서술어가 없는 경우 최외곽 괄호 보기만 정리
    if (!isPartnerNarrativeQuestion(s)) {
      var cleanDirect = s;
      var pOpen = cleanDirect.indexOf('(');
      var pClose = cleanDirect.lastIndexOf(')');
      if (pOpen > 1 && pClose > pOpen + 3 && /[\/·,|]/.test(cleanDirect.slice(pOpen + 1, pClose))) {
        cleanDirect = (cleanDirect.slice(0, pOpen) + ' ' + cleanDirect.slice(pClose + 1)).replace(/\s+/g, ' ').trim();
      } else {
        cleanDirect = cleanDirect.replace(/\s*\([^)]{3,95}\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (cleanDirect && cleanDirect.length >= 4 && !/['"‘’“”]/.test(cleanDirect)) {
        if (!/[?.!요]$/.test(cleanDirect)) cleanDirect += pickKoreanParticle(cleanDirect, '을', '를') + ' 선택해 주세요.';
        return cleanDirect;
      }
    }

    // 1) "선호하는 사과 크기를 질문해 '...'와 '...'로 취향을 파악할게요." → 핵심 명사구 추출
    var subj = '';
    var beforeVerb = s.match(/^(.{2,34}?)(?:을|를)\s*(?:질문해|질문해서|질문하고|물어봐|물어보고|물어보며|여쭤봐|여쭤보고|확인해|파악해|조사해|선택받아|고르게)/);
    if (beforeVerb && beforeVerb[1]) {
      subj = beforeVerb[1].trim();
    } else {
      // 따옴표 및 뒤쪽 서술 절 제거 후 핵심 주어/목적어 추출
      subj = s
        .replace(/(?:'[^'\n]*'|"[^"\n]*"|‘[^’\n]*’|“[^”\n]*”|「[^」\n]*」)/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/(?:을|를)?\s*(?:질문해|질문해서|질문하고|물어보고|물어볼|여쭤볼|확인해|파악할|파악합니다|취향을\s*파악|구분할|나눌|분류할|받으려).*$/g, '')
        .replace(/\s*(?:와|과|로|으로)\s*$/g, '')
        .replace(/^(?:고객에게|고객님께|신청할\s*때|신청\s*시|신청자에게)\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (subj && subj.length >= 2) {
      subj = subj
        .replace(/^(?:고객에게|고객님께|신청할\s*때|신청\s*시|신청자에게|주로|평소)\s*/g, '')
        .replace(/^선호하는\s+/, '선호하시는 ')
        .replace(/^원하는\s+/, '원하시는 ')
        .replace(/^희망하는\s+/, '희망하시는 ')
        .replace(/^관심\s*있는\s+/, '관심 있으신 ')
        .replace(/^기대하는\s+/, '기대하시는 ')
        .replace(/^고민하는\s+/, '고민 중이신 ')
        .replace(/^찾는\s+/, '찾으시는 ')
        .replace(/(?:을|를|이|가|은|는)$/, '')
        .trim();
      if (subj && subj.length >= 2 && subj.length <= 28) {
        var part = pickKoreanParticle(subj, '을', '를');
        return subj + part + ' 선택해 주세요.';
      }
    }

    // 2) 추출된 보기가 있으면 보기 성격에 맞춰 고객 질문 생성
    var optsJoined = (Array.isArray(extractedOpts) ? extractedOpts.join(' ') : '') + ' ' + String(topicSeed || '');
    if (/중소과|대과|크기|사이즈/i.test(optsJoined)) return '선호하시는 크기를 선택해 주세요.';
    if (/선물|가정용|실속/i.test(optsJoined)) return '구매 용도를 선택해 주세요.';
    if (/학년|초등|중등|고등|수능/i.test(optsJoined)) return '현재 자녀분의 학년을 선택해 주세요.';
    if (/시간|오전|오후|저녁|주말/i.test(optsJoined)) return '선호하시는 시간대를 선택해 주세요.';
    if (/수준|입문|기초|고급|회화/i.test(optsJoined)) return '현재 수준을 선택해 주세요.';
    return '가장 관심 있는 항목을 선택해 주세요.';
  }

  function inferSmartSurveyOptions(qText, topicSeed, qIdx) {
    var qi = Number(qIdx) || 0;
    var q = String(qText || '');
    var hay = (q + ' ' + String(topicSeed || '')).toLowerCase();
    var fieldName = '고객진단.유형' + (qi > 0 ? (qi + 1) : '');

    // 1) 질문/답변 텍스트 안에 명시된 구체 선택지(따옴표·괄호·슬래시·A와 B) 최우선 추출
    var explicit = extractSurveyOptionsFromText(q);
    if (explicit.length >= 2) {
      return explicit.slice(0, 5).map(function (p, oi) {
        var cleanTag = p.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 12) || ('유형' + (oi + 1));
        return { answer_text: p, tag: cleanTag, sheet_field: fieldName, sheet_value: p };
      });
    }

    // 2) 업종·상품 맥락별 현실적인 선택지 (타 업종 기계적 폴백 '실전 전략/기초 안내' 영구 폐기!)
    if (/사과|과일|나주배|신고배|배\s*(?:농원|농장|과수원|선물|직송|즙)|딸기|귤|감귤|복숭아|포도|농원|농장|과수원|산지|직송|농산물|농수산/i.test(hay)) {
      if (/크기|사이즈|중소과|대과/i.test(hay)) {
        return [
          { answer_text: '한 손에 쏙 들어오는 중소과', tag: '중소과선호', sheet_field: '고객취향.크기', sheet_value: '중소과' },
          { answer_text: '묵직하고 큼직한 대과', tag: '대과선호', sheet_field: '고객취향.크기', sheet_value: '대과' }
        ];
      }
      return [
        { answer_text: '집에서 편하게 먹는 가정용 실속 구성', tag: '가정용실속', sheet_field: '고객취향.용도', sheet_value: '가정용 실속' },
        { answer_text: '정성 담아 보내는 선물용 프리미엄 구성', tag: '선물용프리미엄', sheet_field: '고객취향.용도', sheet_value: '선물용 프리미엄' }
      ];
    }
    if (/한국어|k-?pop|외국인|영어|일본어|중국어|회화|어학|토익|korean/i.test(hay)) {
      return [
        { answer_text: '어느 정도 익숙해요 (상)', tag: '실전고급', sheet_field: '고객진단.수준', sheet_value: '실전 고급' },
        { answer_text: '기초 회화는 가능해요 (중)', tag: '중급회화', sheet_field: '고객진단.수준', sheet_value: '중급 회화' },
        { answer_text: '처음이라 기초부터 배우고 싶어요 (하)', tag: '기초입문', sheet_field: '고객진단.수준', sheet_value: '기초 입문' }
      ];
    }
    if (/학원|수학|입시|내신|수능|성적|과외|공부|학생|초등|중등|고등/i.test(hay)) {
      return [
        { answer_text: '내신·상위권 심화 대비', tag: '심화내신', sheet_field: '고객진단.목표', sheet_value: '심화 내신' },
        { answer_text: '기초 개념부터 차근차근 완성', tag: '기초개념', sheet_field: '고객진단.목표', sheet_value: '기초 개념' }
      ];
    }
    if (/정치|선거|후보|시장|의원|공약|유권자|개소식|캠프/i.test(hay)) {
      return [
        { answer_text: '광역교통·출퇴근 환경 개선', tag: '광역교통', sheet_field: '시민관심.현안', sheet_value: '광역교통' },
        { answer_text: '돌봄·교육·생활 복지 확충', tag: '생활복지', sheet_field: '시민관심.현안', sheet_value: '생활복지' }
      ];
    }
    if (/병원|치과|임플란트|한의원|검진|진료|클리닉|의원|통증|피부/i.test(hay)) {
      return [
        { answer_text: '빠른 정밀 진단·치료 상담 희망', tag: '정밀진단', sheet_field: '진료상담.유형', sheet_value: '정밀 진단' },
        { answer_text: '먼저 예방·관리 정보부터 알고 싶어요', tag: '예방관리', sheet_field: '진료상담.유형', sheet_value: '예방 관리' }
      ];
    }
    if (/교회|기독교|집회|부흥회|수련회|협회|동호회|커뮤니티|독서|러닝|모임/i.test(hay)) {
      return [
        { answer_text: '처음 참여해요 (신규 안내 희망)', tag: '신규참여', sheet_field: '참여유형.구분', sheet_value: '처음 참여' },
        { answer_text: '기존 참여자예요 (일정·소식 수신)', tag: '기존참여', sheet_field: '참여유형.구분', sheet_value: '기존 참여' }
      ];
    }
    if (/카페|매장|식당|음료|빵|베이커리|쇼핑몰|패션|뷰티|식품|상추|반찬|원두|한우|수산|커머스|마켓|스토어/i.test(hay)) {
      return [
        { answer_text: '대표 인기 구성 바로 이용', tag: '인기구성', sheet_field: '고객취향.선택', sheet_value: '인기 구성' },
        { answer_text: '처음이신 분을 위한 추천 구성', tag: '추천구성', sheet_field: '고객취향.선택', sheet_value: '추천 구성' }
      ];
    }
    return [
      { answer_text: '구체적인 1:1 맞춤 안내·상담 희망', tag: '맞춤상담', sheet_field: fieldName, sheet_value: '1:1 맞춤 상담' },
      { answer_text: '핵심 정보·소식부터 가볍게 받아보기', tag: '정보수신', sheet_field: fieldName, sheet_value: '핵심 정보 수신' }
    ];
  }

  function parseSurveyQuestionFromAnswer(rawText, topicSeed, qIdx) {
    var options = inferSmartSurveyOptions(rawText, topicSeed, qIdx);
    var extractedLabels = extractSurveyOptionsFromText(rawText);
    var questionText = convertPartnerNarrativeToCustomerQuestion(rawText, extractedLabels.length ? extractedLabels : options.map(function (o) { return o.answer_text; }), topicSeed);
    return {
      question_text: questionText,
      options: options,
      hasExplicitOptions: extractedLabels.length >= 2
    };
  }

  function extractFormOptionPair(questions) {
    var qs = Array.isArray(questions) ? questions : [];
    var mc = null;
    for (var i = 0; i < qs.length; i++) {
      if (qs[i] && Array.isArray(qs[i].options) && qs[i].options.length >= 2) {
        mc = qs[i];
        break;
      }
    }
    if (!mc) return null;
    var normOpt = function (op, idx) {
      var ans = String((op && (op.answer_text || op.text)) || ('선택지 ' + (idx + 1))).trim();
      var tag = '';
      var sheetVal = ans;
      if (op && Array.isArray(op.actions_after_save)) {
        op.actions_after_save.forEach(function (a) {
          if (a && a.action_type === 'TAG' && a.target) tag = String(a.target).trim();
          if (a && a.action_type === 'SHEET' && a.value != null && String(a.value).trim()) sheetVal = String(a.value).trim();
        });
      }
      if (!tag) tag = String((op && op.tag) || ans.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 12) || ('유형' + (idx + 1)));
      return { answer_text: ans, tag: tag, sheet_value: sheetVal };
    };
    var opts = mc.options.map(normOpt);
    var optA = opts[0];
    var optB = opts.length >= 3 ? opts[opts.length - 1] : opts[1];
    return {
      question_text: String(mc.question_text || '관심 항목을 선택해 주세요.'),
      optA: optA,
      optB: optB
    };
  }

  function isBeginnerOptionLabel(txt) {
    return /초보|입문|기초|처음|고민|모르|모름|아니오|없음|아직|예방|천천히|\(하\)|^하$|하급|중등\s*기초|중1|생활\s*복지/i.test(String(txt || ''));
  }

  function isAdvancedOptionLabel(txt) {
    return /고급|심화|실전|숙련|마스터|상위권|수능|고등|고3|바로|즉시|적극|\(상\)|^상$|상급|^예$|^네$|있음|정밀\s*진단|광역\s*교통/i.test(String(txt || ''));
  }

  function buildSpotlightBranchPair(ctx) {
    ctx = ctx || {};
    var optA = ctx.optA || { answer_text: '맞춤 안내·상담 희망', tag: '맞춤상담', sheet_value: '맞춤 상담' };
    var optB = ctx.optB || { answer_text: '핵심 정보부터 받아보기', tag: '정보수신', sheet_value: '정보 수신' };
    var topic = String(ctx.topic || ctx.channel || '맞춤 캠페인').trim();
    var channel = String(ctx.channel || '맞춤 브랜드').trim();
    var baseUrl = String(ctx.baseUrl || 'https://gomawartalk.com');
    var firstSheet = String(ctx.firstSheet || '고객진단.유형');
    var templateType = String(ctx.templateType || 'FREE_FRIENDTALK');
    var videoInfo = ctx.videoInfo || { isVideo: false, badge: '▶ YOUTUBE', defaultUrl: 'https://www.youtube.com/watch?v=gomawartalk' };
    var promoOffer = ctx.promoOffer || { hasPromo: false, phrase: '', buttonLabel: '' };
    var aiPair = Array.isArray(ctx.aiPair) ? ctx.aiPair : null;

    var hay = [topic, channel, ctx.questionText || '', optA.answer_text, optB.answer_text].join(' ');
    var fbA = {}; fbA[firstSheet] = optA.sheet_value || optA.answer_text;
    var fbB = {}; fbB[firstSheet] = optB.sheet_value || optB.answer_text;
    var promoSuffix = (promoOffer && promoOffer.hasPromo && promoOffer.phrase && templateType !== 'ALIMTALK')
      ? ('\n🎁 채널 친구 전용 혜택: ' + promoOffer.phrase + '도 아래 버튼에서 바로 챙겨가세요!')
      : '';
    var promoBtnOverride = (promoOffer && promoOffer.hasPromo && promoOffer.buttonLabel && templateType !== 'ALIMTALK')
      ? promoOffer.buttonLabel
      : '';

    // 1) AI가 기계식 치환 없이 진짜로 대비되는 2종 원고를 줬으면 그대로 채택
    if (aiPair && aiPair.length >= 2) {
      var a0 = aiPair[0] || {};
      var a1 = aiPair[1] || {};
      var h0 = String(a0.headline || (a0.image_copy && a0.image_copy.headline) || (a0.variables && a0.variables['콘텐츠 제목']) || '').trim();
      var h1 = String(a1.headline || (a1.image_copy && a1.image_copy.headline) || (a1.variables && a1.variables['콘텐츠 제목']) || '').trim();
      var b0 = String(a0.body_text || a0.body_text_400chars || (a0.variables && a0.variables['콘텐츠 소개']) || '').trim();
      var b1 = String(a1.body_text || a1.body_text_400chars || (a1.variables && a1.variables['콘텐츠 소개']) || '').trim();
      var btn0 = String(a0.btn_name || (a0.buttons && a0.buttons[0] && a0.buttons[0].name) || '').trim();
      var btn1 = String(a1.btn_name || (a1.buttons && a1.buttons[0] && a1.buttons[0].name) || '').trim();
      var validAi = h0 && h1 && b0 && b1 && h0 !== h1 && b0 !== b1 &&
        !isMechanicalBranchCopy(h0 + ' ' + b0 + ' ' + btn0) &&
        !isMechanicalBranchCopy(h1 + ' ' + b1 + ' ' + btn1);
      if (validAi) {
        if (promoSuffix && b0.indexOf(promoOffer.phrase) === -1) b0 = b0 + promoSuffix;
        if (promoSuffix && b1.indexOf(promoOffer.phrase) === -1) b1 = b1 + promoSuffix;
        var safeB0 = templateType === 'ALIMTALK' ? stripAlimtalkPromoCopy(b0, topic) : b0;
        var safeB1 = templateType === 'ALIMTALK' ? stripAlimtalkPromoCopy(b1, topic) : b1;
        return [
          {
            priority: 1,
            spotlight_slot: 'A',
            persona_name: '김민지',
            persona_icon: '🙋‍♀️',
            option_label: optA.answer_text,
            tag: optA.tag,
            condition_desc: '태그 = ' + optA.tag,
            template_id: TOSS_TEMPLATE_ID,
            variables: { '콘텐츠 제목': tFirst(h0, 40), '콘텐츠 소개': safeB0 },
            sheet_fallback_strings: fbA,
            image_ratio: '800x400',
            image_copy: { badge: tFirst(a0.badge || (a0.image_copy && a0.image_copy.badge) || '1순위 핵심 맞춤', 20), headline: tFirst(h0, 34), subtext: tFirst(a0.subtext || (a0.image_copy && a0.image_copy.subtext) || (channel + ' 맞춤 안내'), 32) },
            media_preview: videoInfo.isVideo ? { type: 'YOUTUBE', badge: videoInfo.badge, duration: '04:15', title: tFirst(h0, 36), url: videoInfo.defaultUrl } : null,
            body_text_400chars: safeB0,
            buttons: [{ name: tFirst(promoBtnOverride || btn0 || '맞춤 안내 보기', 14), link_type: 'WL', webzine_anchor: '#sec-1', url: baseUrl + '#sec-1' }],
            cards_800x600: Array.isArray(ctx.defaultCards) ? ctx.defaultCards : []
          },
          {
            priority: 2,
            spotlight_slot: 'B',
            persona_name: '박준호',
            persona_icon: '🙋‍♂️',
            option_label: optB.answer_text,
            tag: optB.tag,
            condition_desc: '나머지 모두 (' + optB.answer_text + ')',
            template_id: TOSS_TEMPLATE_ID,
            variables: { '콘텐츠 제목': tFirst(h1, 40), '콘텐츠 소개': safeB1 },
            sheet_fallback_strings: fbB,
            image_ratio: '800x400',
            image_copy: { badge: tFirst(a1.badge || (a1.image_copy && a1.image_copy.badge) || '2순위 맞춤 안내', 20), headline: tFirst(h1, 34), subtext: tFirst(a1.subtext || (a1.image_copy && a1.image_copy.subtext) || (channel + ' 맞춤 안내'), 32) },
            media_preview: videoInfo.isVideo ? { type: 'YOUTUBE', badge: videoInfo.badge, duration: '05:20', title: tFirst(h1, 36), url: videoInfo.defaultUrl } : null,
            body_text_400chars: safeB1,
            buttons: [{ name: tFirst(promoBtnOverride || btn1 || '맞춤 구성 보기', 14), link_type: 'WL', webzine_anchor: '#sec-2', url: baseUrl + '#sec-2' }],
            cards_800x600: Array.isArray(ctx.defaultCards) ? ctx.defaultCards : []
          }
        ];
      }
    }

    // 2) 도메인·상품·눈높이별 극명하게 대비되는 고품질 2종 맞춤 원고 생성 (기계식 치환 0%)
    var pair;
    var directOptionOrder = false;
    if (/사과|과일|나주배|신고배|배\s*(?:농원|농장|과수원|선물|직송|즙)|딸기|귤|감귤|복숭아|포도|농원|농장|과수원|산지|직송|농산물|농수산/i.test(hay)) {
      directOptionOrder = true;
      var lblA = optA.answer_text;
      var lblB = optB.answer_text;
      pair = {
        adv: {
          badge: tFirst(channel + ' · 맞춤 추천', 22),
          headline: tFirst(lblA + ' 딱 맞게 골라 담았습니다', 32),
          subtext: '산지 직송 당도 선별 구성',
          body: '#{이름}님! 고르신 "' + lblA + '" 취향에 맞춰 껍질째 아삭하게 드시기 좋은 당도 선별 수확 물량만 골라 안내해 드려요. 집에서 매일 신선하게 즐기는 알뜰 구성과 보관 팁을 확인해 보세요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 산지 수확 영상 보기' : '맞춤 구성 바로 보기')
        },
        beg: {
          badge: tFirst(channel + ' · 프리미엄 추천', 22),
          headline: tFirst(lblB + ' 최상급 선별 안내', 32),
          subtext: '과즙 가득 큼직한 특품 구성',
          body: '#{이름}님! 고르신 "' + lblB + '" 취향에 맞춰 크기와 때깔, 당도까지 깐깐하게 고른 최상급 수확 구성만 따로 모았습니다. 소중한 분께 선물하시거나 풍성하게 드시기 좋은 구성을 지금 만나보세요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 프리미엄 선별 영상 보기' : '프리미엄 구성 보기')
        }
      };
    } else if (/한국어|k-?pop|외국인|영어|일본어|중국어|회화|어학|토익|korean/i.test(hay)) {
      pair = {
        adv: {
          badge: '실전 고급 표현 마스터',
          headline: '한국어를 완벽히 마스터해 봅시다!',
          subtext: '현지인처럼 자연스러운 실전 고급 편',
          body: '#{이름}님! 기본 표현은 이미 탄탄하시니, 오늘은 현지인이 실제 대화에서 매일 쓰는 실전 고급 표현 3가지와 미묘한 뉘앙스 비교 노트를 보내드려요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 고급 표현 영상 보기' : '고급 표현 3가지 보기')
        },
        beg: {
          badge: '처음이어도 쉬운 첫걸음',
          headline: '처음이어도 괜찮아요! 기초 인사말부터',
          subtext: '오늘 바로 써먹는 쉬운 입문 편',
          body: '#{이름}님, 처음 시작할 땐 누구나 막막해요. 복잡한 문법 대신 오늘 바로 소리 내어 써먹을 수 있는 쉬운 기초 인사말 5문장과 발음 포인트부터 함께 익혀봐요!' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 기초 5문장 영상 보기' : '기초 5문장 따라하기')
        }
      };
    } else if (/학원|수학|입시|내신|수능|성적|과외|공부|학생|초등|중등|고등/i.test(hay)) {
      pair = {
        adv: {
          badge: '1등급 킬러 돌파 전략',
          headline: '시험 시간 15분 줄이는 실전 오답 공식',
          subtext: '상위권·수능 고난도 집중 대비',
          body: '#{이름}님! 상위권 도약은 아는 문제를 빨리 넘기고 4점·킬러 문항의 함정을 끊어내는 데서 갈립니다. 실전 기출 오답 패턴 정리본과 집중반 로드맵을 확인해 보세요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 킬러 문항 해설 보기' : '킬러 오답 공식 보기')
        },
        beg: {
          badge: '개념 탄탄 기초 루틴',
          headline: '아는 문제 실수부터 잡는 4주 개념 습관',
          subtext: '기초 개념·연산 안정화 처방',
          body: '#{이름}님! 기초 개념이 조금만 흔들려도 시험장에서 실수가 반복돼요. 무리한 선행 대신 연산 실수를 80% 줄이는 핵심 단원 체크표와 4주 기초 습관표부터 시작해 보세요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 기초 개념 특강 보기' : '기초 개념 체크표 받기')
        }
      };
    } else if (/정치|선거|후보|시장|의원|공약|유권자|개소식|캠프/i.test(hay)) {
      pair = {
        adv: {
          badge: '광역교통·핵심 현안 공약',
          headline: '막힌 출퇴근길부터 뚫는 교통 실행 계획',
          subtext: '단계별 노선 확충·예산 로드맵',
          body: '#{이름}님! 매일 아침 출퇴근 정체로 겪으시는 불편을 가장 먼저 해결하겠습니다. 광역교통 확충 일정과 권역별 추진 계획을 투명하게 정리해 보내드립니다.',
          btn: videoInfo.isVideo ? '▶ 교통 공약 영상 보기' : '교통 공약 세부안 보기'
        },
        beg: {
          badge: '우리 동네 생활·복지 공약',
          headline: '아이 키우기 좋고 안전한 동네 실행안',
          subtext: '돌봄·교육·생활 SOC 밀착 개선',
          body: '#{이름}님! 거창한 구호보다 당장 가족과 이웃이 피부로 느끼는 돌봄·주차·생활 안전부터 바꾸겠습니다. 우리 동네 생활 밀착 공약 카드를 편하게 살펴보세요.',
          btn: videoInfo.isVideo ? '▶ 생활 공약 영상 보기' : '생활·복지 계획 보기'
        }
      };
    } else if (/병원|치과|임플란트|한의원|검진|진료|클리닉|의원|통증|피부/i.test(hay)) {
      pair = {
        adv: {
          badge: '정밀 진단·안심 치료 안내',
          headline: '통증 부담 낮추는 단계별 정밀 진료 과정',
          subtext: '전문의 책임 진료·투명한 치료 순서',
          body: '#{이름}님! 막연한 걱정 때문에 진료 시기를 미루면 회복 기간과 부담이 커져요. 실제 정밀 검사부터 통증 완화 시술 과정까지 알기 쉽게 정리한 안내서를 보내드립니다.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 진료 과정 영상 보기' : '진료 과정 자세히 보기')
        },
        beg: {
          badge: '방문 전 3분 자가 점검',
          headline: '당장 내원하지 않아도 먼저 확인해 보세요',
          subtext: '집에서 체크하는 사전 예방 관리법',
          body: '#{이름}님, 아직 당장 치료를 결정하기 부담스러우시죠? 먼저 집에서 3분 만에 현재 상태를 가늠해 볼 수 있는 자가 점검표와 일상 관리 팁부터 편하게 받아보세요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 예방 관리 영상 보기' : '3분 자가 점검표 보기')
        }
      };
    } else if (/카페|매장|식당|음료|빵|베이커리|쇼핑몰|패션|뷰티|식품|상추|반찬|원두|커머스|마켓|스토어/i.test(hay)) {
      directOptionOrder = true;
      pair = {
        adv: {
          badge: tFirst(optA.answer_text + ' 맞춤 추천', 22),
          headline: '단골이 가장 먼저 찾는 베스트 구성',
          subtext: '만족도 1위 시그니처 셀렉션',
          body: '#{이름}님! 선택하신 "' + optA.answer_text + '" 취향에 맞춰 재이용률이 가장 높은 시그니처 구성과 알뜰 이용 팁만 쏙 골라 모았습니다.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 인기 구성 영상 보기' : '인기 구성 바로 보기')
        },
        beg: {
          badge: tFirst(optB.answer_text + ' 맞춤 추천', 22),
          headline: '실패 없이 만족하는 맞춤 추천 3가지',
          subtext: '부담 없이 고르는 맞춤 셀렉션',
          body: '#{이름}님! 선택하신 "' + optB.answer_text + '" 취향에 딱 맞는 추천 구성 3가지와 실패 없는 선택 요령을 깔끔하게 정리해 드려요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 맞춤 추천 영상 보기' : '맞춤 추천 보기')
        }
      };
    } else {
      directOptionOrder = true;
      pair = {
        adv: {
          badge: tFirst(channel + ' · 맞춤 안내 A', 22),
          headline: tFirst(optA.answer_text + ' 맞춤 핵심 안내', 32),
          subtext: '선택하신 조건에 꼭 맞춘 구성',
          body: '#{이름}님! "' + optA.answer_text + '" 항목을 선택해 주셔서 꼭 필요한 핵심 안내와 맞춤 진행 방법만 한눈에 정리해 보내드립니다.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 맞춤 안내 영상 보기' : '맞춤 안내 바로 보기')
        },
        beg: {
          badge: tFirst(channel + ' · 맞춤 안내 B', 22),
          headline: tFirst(optB.answer_text + ' 맞춤 핵심 안내', 32),
          subtext: '부담 없이 살펴보는 핵심 요약',
          body: '#{이름}님! "' + optB.answer_text + '" 항목에 맞춰 가장 많이 궁금해하시는 핵심 포인트와 실제 사례를 읽기 쉽게 정리해 보내드려요.' + promoSuffix,
          btn: promoBtnOverride || (videoInfo.isVideo ? '▶ 핵심 안내 영상 보기' : '핵심 안내 자세히 보기')
        }
      };
    }

    // 선택지 A와 B의 눈높이 성향(기초/입문 vs 심화/실전)에 맞춰 정확히 배정
    var aLooksBeginner = !directOptionOrder && isBeginnerOptionLabel(optA.answer_text) && !isAdvancedOptionLabel(optA.answer_text);
    var bLooksAdvanced = !directOptionOrder && isAdvancedOptionLabel(optB.answer_text) && !isBeginnerOptionLabel(optB.answer_text);
    var swapPolarity = aLooksBeginner || (bLooksAdvanced && !isAdvancedOptionLabel(optA.answer_text));
    var specA = swapPolarity ? pair.beg : pair.adv;
    var specB = swapPolarity ? pair.adv : pair.beg;

    var makeBranch = function (slot, priority, personaName, personaIcon, opt, condDesc, spec, fbObj, anchor, dur) {
      var body = templateType === 'ALIMTALK' ? stripAlimtalkPromoCopy(spec.body, topic) : spec.body;
      var mp = videoInfo.isVideo
        ? { type: 'YOUTUBE', badge: videoInfo.badge, duration: dur, title: tFirst(spec.headline, 36), url: videoInfo.defaultUrl }
        : null;
      var btns = videoInfo.isVideo
        ? [
            { name: videoInfo.buttonLabel || '▶ 유튜브에서 영상 바로 보기', link_type: 'WL', youtube_app: true, webzine_anchor: anchor, url: videoInfo.defaultUrl },
            { name: tFirst(spec.btn.replace(/^▶\s*/, ''), 14), link_type: 'WL', webzine_anchor: anchor, url: baseUrl + anchor }
          ]
        : [{ name: tFirst(spec.btn, 14), link_type: 'WL', webzine_anchor: anchor, url: baseUrl + anchor }];
      return {
        priority: priority,
        spotlight_slot: slot,
        persona_name: personaName,
        persona_icon: personaIcon,
        option_label: opt.answer_text,
        tag: opt.tag,
        condition_desc: condDesc,
        template_id: TOSS_TEMPLATE_ID,
        variables: { '콘텐츠 제목': tFirst(spec.headline, 40), '콘텐츠 소개': body },
        sheet_fallback_strings: fbObj,
        image_ratio: '800x400',
        image_copy: { badge: spec.badge, headline: spec.headline, subtext: spec.subtext },
        media_preview: mp,
        body_text_400chars: body,
        buttons: btns,
        cards_800x600: Array.isArray(ctx.defaultCards) ? ctx.defaultCards : []
      };
    };

    return [
      makeBranch('A', 1, '김민지', '🙋‍♀️', optA, '태그 = ' + optA.tag, specA, fbA, '#sec-1', '04:15'),
      makeBranch('B', 2, '박준호', '🙋‍♂️', optB, '나머지 모두 (' + optB.answer_text + ')', specB, fbB, '#sec-2', '05:20')
    ];
  }

  // ★ 캠페인 전체에서 정확히 단 1개 핵심 회차에만 has_spotlight_branch=true + 2종 맞춤 원고 적용
  function applyOnePointSpotlightBranch(master, opts) {
    if (!master || typeof master !== 'object') return master;
    opts = opts || {};
    var t3 = master.tab3_application_form || {};
    var skipQ = !!(t3.skip_custom_question || (master.meta && master.meta.schedule_config && master.meta.schedule_config.skip_form_question));
    var formPair = skipQ ? null : extractFormOptionPair(t3.questions);

    var seq = (master.tab4_interval_messages && Array.isArray(master.tab4_interval_messages.sequence)) ? master.tab4_interval_messages.sequence : [];
    var t5 = Array.isArray(master.tab5_date_messages) ? master.tab5_date_messages : [];
    var intervalEnabled = !(master.tab4_interval_messages && master.tab4_interval_messages.enabled === false) &&
      !(master.meta && master.meta.schedule_config && master.meta.schedule_config.interval_config && master.meta.schedule_config.interval_config.enabled === false);

    // 먼저 모든 회차를 공통 단일 원고(has_spotlight_branch: false, branches 1개)로 초기화
    var resetToCommon = function (stepObj, defaultCond) {
      if (!stepObj) return;
      stepObj.has_spotlight_branch = false;
      stepObj.branch_pair = null;
      stepObj.spotlight_meta = null;
      if (Array.isArray(stepObj.branches) && stepObj.branches.length > 0) {
        var b0 = Object.assign({}, stepObj.branches[0], {
          priority: 1,
          condition_desc: defaultCond || '모두 (전체 신청자)'
        });
        stepObj.branches = [b0];
      }
    };
    seq.forEach(function (st) { resetToCommon(st, '모두 (전체 신청자)'); });
    t5.forEach(function (st) { resetToCommon(st, '전체 신청자 동시 발송'); });

    if (!formPair) {
      if (master.meta) {
        master.meta.spotlight_branch = { active: false, target_scope: null, sim_step: null };
      }
      return master;
    }

    // 스포트라이트 대상 딱 1곳 선정: 기본 ④ 간격발송 첫 핵심 회차(seq[1]) -> 없으면 ⑤ 날짜발송(t5[0]) -> 없으면 ③ 첫카톡(seq[0])
    var targetStep = null;
    var targetScope = null;
    var simStep = null;
    if (intervalEnabled && seq.length >= 2) {
      targetStep = seq[1];
      targetScope = 'tab4_step2';
      simStep = 4;
    } else if (t5.length > 0) {
      targetStep = t5[0];
      targetScope = 'tab5_slot1';
      simStep = 5;
    } else if (seq.length >= 1) {
      targetStep = seq[0];
      targetScope = 'tab4_step1';
      simStep = 3;
    }

    if (!targetStep) {
      if (master.meta) master.meta.spotlight_branch = { active: false, target_scope: null, sim_step: null };
      return master;
    }

    var channel = (master.meta && master.meta.brand_name) || (master.partner_info && master.partner_info.channel_name) || '맞춤 브랜드';
    var topic = opts.topic || (master.tab1_basic_settings && master.tab1_basic_settings.thumbnail_500x280 && master.tab1_basic_settings.thumbnail_500x280.headline) || channel;
    var baseUrl = (master.meta && master.meta.webzine_base_url) || 'https://gomawartalk.com';
    var firstSheet = opts.firstSheet || '고객진단.유형';
    var videoInfo = opts.videoInfo || { isVideo: !!(master.tab4_interval_messages && master.tab4_interval_messages.has_video_media), badge: '▶ YOUTUBE', defaultUrl: 'https://www.youtube.com/watch?v=gomawartalk' };
    var aiPair = opts.aiPair || (Array.isArray(targetStep._rawAiPair) ? targetStep._rawAiPair : null);
    var defaultCards = (targetStep.branches && targetStep.branches[0] && Array.isArray(targetStep.branches[0].cards_800x600)) ? targetStep.branches[0].cards_800x600 : [];

    var pair = buildSpotlightBranchPair({
      optA: formPair.optA,
      optB: formPair.optB,
      questionText: formPair.question_text,
      topic: topic,
      channel: channel,
      baseUrl: baseUrl,
      firstSheet: firstSheet,
      templateType: targetStep.template_type || 'FREE_FRIENDTALK',
      videoInfo: videoInfo,
      promoOffer: opts.promoOffer || null,
      aiPair: aiPair,
      defaultCards: defaultCards
    });

    targetStep.has_spotlight_branch = true;
    targetStep.branch_pair = pair;
    targetStep.branches = pair.slice();
    targetStep.spotlight_meta = {
      question_text: formPair.question_text,
      optionA: { label: formPair.optA.answer_text, tag: formPair.optA.tag, persona: '김민지', icon: '🙋‍♀️' },
      optionB: { label: formPair.optB.answer_text, tag: formPair.optB.tag, persona: '박준호', icon: '🙋‍♂️' }
    };
    delete targetStep._rawAiPair;

    if (master.meta) {
      master.meta.spotlight_branch = {
        active: true,
        target_scope: targetScope,
        sim_step: simStep,
        optionA: formPair.optA.answer_text,
        optionB: formPair.optB.answer_text
      };
    }
    return master;
  }

  // ★ V2.6 동적 발송 주기 판별기 (+1일/+3일 하드코딩 폐지: 월간/주간/행사 D-Day/단기 자동 분기)
  function detectCampaignCadence(seedText) {
    var s = String(seedText || '');
    if (/매월|월간|한\s*달|달마다|정기\s*인터뷰|월간지|매달|AFTER_1_MONTH/i.test(s)) {
      return {
        type: 'MONTHLY',
        label: '월간 정기 연재',
        step1: {
          timing: 'IMMEDIATE',
          shortLabel: '신청 즉시',
          chatDateOffsetDays: 0,
          sendTimeLabel: '방금 전'
        },
        step2: {
          timing: 'AFTER_1_MONTH_1000',
          shortLabel: '+1개월 뒤',
          badge: '🗓️ 한 달이 지났습니다 · 월간 1호 정기 발송',
          sub: '약속한 다음 달 정기 소식이 자동으로 도착합니다',
          chatDateOffsetDays: 30,
          sendTimeLabel: '오전 10:00'
        },
        step3: {
          timing: 'AFTER_2_MONTHS_1000',
          shortLabel: '+2개월 뒤',
          badge: '🗓️ 두 달째 · 월간 2호 정기 연재',
          sub: '매월 거르지 않고 관계가 깊어지는 정기 발송',
          chatDateOffsetDays: 60,
          sendTimeLabel: '오전 10:00'
        },
        step4: {
          timing: 'AFTER_3_MONTHS_1000',
          shortLabel: '+3개월 뒤',
          badge: '🗓️ 세 달째 · 월간 3호 정기 연재',
          sub: '세 번째 월간 광고 메시지로 단골 팬덤을 완성합니다',
          chatDateOffsetDays: 90,
          sendTimeLabel: '오전 10:00'
        }
      };
    }
    if (/매주|주간|주보|챌린지|일주일|주\s*1회|AFTER_7_DAYS/i.test(s)) {
      return {
        type: 'WEEKLY',
        label: '주간 정기 소통',
        step1: {
          timing: 'IMMEDIATE',
          shortLabel: '신청 즉시',
          chatDateOffsetDays: 0,
          sendTimeLabel: '방금 전'
        },
        step2: {
          timing: 'AFTER_7_DAYS_0900',
          shortLabel: '다음 주(2회)',
          badge: '📅 일주일이 지났습니다 · 주간 2회차 발송',
          sub: '매주 정해진 시간에 다음 편 소식이 도착합니다',
          chatDateOffsetDays: 7,
          sendTimeLabel: '오전 09:00'
        },
        step3: {
          timing: 'AFTER_14_DAYS_0900',
          shortLabel: '2주 뒤(3회)',
          badge: '📅 2주째 · 주간 3회차 정기 발송',
          sub: '꾸준한 주간 소통으로 신뢰가 자연스럽게 쌓입니다',
          chatDateOffsetDays: 14,
          sendTimeLabel: '오전 09:00'
        },
        step4: {
          timing: 'AFTER_21_DAYS_0900',
          shortLabel: '3주 뒤(4회)',
          badge: '📅 3주째 · 주간 4회차 전환 안내',
          sub: '3주간 쌓인 신뢰를 실제 참여·신청으로 이어갑니다',
          chatDateOffsetDays: 21,
          sendTimeLabel: '오전 09:00'
        }
      };
    }
    if (/개소식|세미나|설명회|집회|부흥회|행사|출판기념회|강연|포럼|콘서트|D-3|당일\s*안내|EVENT_D_MINUS/i.test(s)) {
      return {
        type: 'EVENT',
        label: '행사 D-Day 리마인드',
        step1: {
          timing: 'IMMEDIATE',
          shortLabel: '접수 확인',
          chatDateOffsetDays: 0,
          sendTimeLabel: '방금 전'
        },
        step2: {
          timing: 'EVENT_D_MINUS_3_0900',
          shortLabel: '행사 3일 전',
          badge: '⏰ 행사 3일 전입니다 · 사전 리마인드',
          sub: '참석 일정과 오시는 길 안내가 자동 발송됩니다',
          chatDateOffsetDays: 4,
          sendTimeLabel: '오전 09:00'
        },
        step3: {
          timing: 'EVENT_DAY_MORNING_0830',
          shortLabel: '행사 당일',
          badge: '🔔 행사 당일 오전 · 현장 입장 안내',
          sub: '놓치지 않도록 당일 최종 안내가 도착합니다',
          chatDateOffsetDays: 7,
          sendTimeLabel: '오전 08:30'
        },
        step4: {
          timing: 'EVENT_AFTER_1_DAY_1000',
          shortLabel: '행사 다음 날',
          badge: '💌 행사 다음 날 · 감사 및 후속 안내',
          sub: '참석 감사 인사와 함께 후속 자료·상담을 안내합니다',
          chatDateOffsetDays: 8,
          sendTimeLabel: '오전 10:00'
        }
      };
    }
    return {
      type: 'SHORT',
      label: '단기 집중 안내',
      step1: {
        timing: 'IMMEDIATE',
        shortLabel: '즉시 알림톡',
        chatDateOffsetDays: 0,
        sendTimeLabel: '방금 전'
      },
      step2: {
        timing: 'AFTER_1_DAY_0900',
        shortLabel: '+1일 뒤',
        badge: '🌙 하루가 지났습니다 · D+1 오전 09:00',
        sub: '선택하신 답변에 맞춘 광고 메시지가 자동 발송됩니다',
        chatDateOffsetDays: 1,
        sendTimeLabel: '오전 09:00'
      },
      step3: {
        timing: 'AFTER_3_DAYS_0900',
        shortLabel: '+3일 뒤',
        badge: '🌅 3일이 지났습니다 · D+3 오전 10:00',
        sub: '핵심 사례·커리큘럼 카드가 자동 도착합니다',
        chatDateOffsetDays: 3,
        sendTimeLabel: '오전 10:00'
      },
      step4: {
        timing: 'AFTER_7_DAYS_0900',
        shortLabel: '+7일 뒤',
        badge: '✨ 일주일 뒤 · D+7 마감 혜택 안내',
        sub: '채널 친구 전용 최종 혜택·상담 안내가 자동 발송됩니다',
        chatDateOffsetDays: 7,
        sendTimeLabel: '오전 10:00'
      }
    };
  }

  // ★ V2.6 영상·유튜브 콘텐츠 감지 (인터뷰 영상 / 유튜브 / 쇼츠 캠페인 시 16:9 유튜브 카드 & 앱 연결 버튼 자동 주입)
  function detectVideoMedia(seedText) {
    var s = String(seedText || '');
    var isVideo = /영상|유튜브|youtube|쇼츠|shorts|인터뷰\s*영상|강의\s*영상|동영상|비디오/i.test(s);
    return {
      isVideo: isVideo,
      badge: '▶ YOUTUBE',
      buttonLabel: '▶ 유튜브에서 영상 바로 보기',
      defaultUrl: 'https://www.youtube.com/watch?v=gomawartalk'
    };
  }

  TOSS.assembleCampaign = function (g, A, partner, extra) {
    g = (g && typeof g === 'object') ? g : {};
    extra = extra || {};
    partner = partner || {};
    var fb = TOSS.fallbackContent(A, partner);
    var now = new Date(), p2 = function (n) { return String(n).padStart(2, '0'); };
    var ymd = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate());
    var rawBrand = String(extra.brandName || partner.brandName || partner.businessName || partner.channel_name || '').trim();
    if (/(?:\uB300\uD45C\uB2D8|\uC0AC\uC7A5\uB2D8|\uD30C\uD2B8\uB108\uB2D8)\s*$/.test(rawBrand)) rawBrand = '';
    var channel = rawBrand || '맞춤 브랜드 채널';

    var gT1 = g.tab1_basic_settings || {}, fT1 = fb.tab1_basic_settings;
    var th = Object.assign({}, fT1.thumbnail_500x280, gT1.thumbnail_500x280 || {});
    var gBlocks = g.tab2_landing_content && g.tab2_landing_content.blocks_1000px;
    var blocks = (Array.isArray(gBlocks) && gBlocks.length === 5) ? gBlocks : fb.tab2_landing_content.blocks_1000px;
    blocks = blocks.map(function (b, i) {
      var f = fb.tab2_landing_content.blocks_1000px[i];
      var o = Object.assign({}, f, b);
      o.step = i + 1;
      if (o.step === 1 || o.step === 3 || o.step === 4) {
        o.show_visual = true;
        o.imagePrompt = ensureImagePromptSuffix(o.imagePrompt || f.imagePrompt);
      }
      if (o.step === 5) o.arrow_text = String(o.arrow_text || f.arrow_text).replace(/\uBCF4\uB77C\uC0C9\s*/g, '');
      return o;
    });
    th.imagePrompt = ensureImagePromptSuffix(th.imagePrompt || fT1.thumbnail_500x280.imagePrompt);

    // 신청폼 질문 (최대 2문항, 보기 2개 이상인 것만 채택 · 파트너 서술문 자동 고객질문화 & 명시 선택지 최우선 보존)
    var gq = g.tab3_application_form && g.tab3_application_form.questions;
    var rawQs = (Array.isArray(gq) ? gq : []).filter(function (q) { return q && q.question_text && Array.isArray(q.options) && q.options.length >= 2; }).slice(0, 2);
    if (!rawQs.length) rawQs = fb.tab3_application_form.questions;
    var rawQ2Source = String((A && A[7]) || '').trim();
    var parsedQ2Source = rawQ2Source ? parseSurveyQuestionFromAnswer(rawQ2Source, [A && A[1], channel].filter(Boolean).join(' '), 0) : null;
    if (parsedQ2Source && rawQs.length > 0) {
      if (parsedQ2Source.hasExplicitOptions) {
        // 파트너가 따옴표/괄호 등으로 직접 적은 선택지가 있으면 AI/폴백보다 최우선 반영!
        rawQs[0] = Object.assign({}, rawQs[0], {
          question_text: isPartnerNarrativeQuestion(rawQs[0].question_text) || rawQs[0].question_text === rawQ2Source
            ? parsedQ2Source.question_text
            : convertPartnerNarrativeToCustomerQuestion(rawQs[0].question_text, parsedQ2Source.options.map(function (o) { return o.answer_text; }), channel),
          options: parsedQ2Source.options
        });
      } else if (isPartnerNarrativeQuestion(rawQs[0].question_text)) {
        rawQs[0] = Object.assign({}, rawQs[0], {
          question_text: convertPartnerNarrativeToCustomerQuestion(rawQs[0].question_text, rawQs[0].options.map(function (o) { return o.answer_text; }), channel)
        });
      }
    }
    var firstSheet = '';
    var questions = rawQs.map(function (q, qi) {
      var cleanQText = convertPartnerNarrativeToCustomerQuestion(String(q.question_text), (q.options || []).map(function (o) { return o && o.answer_text; }), channel);
      return {
        order: qi + 1, type: 'MULTIPLE_CHOICE', required: true, question_text: cleanQText,
        options: q.options.slice(0, 5).map(function (op, oi) {
          var sf = String(op.sheet_field || ('고객진단.항목' + (qi + 1)));
          if (sf.indexOf('.') === -1) sf = '고객진단.' + sf;
          if (!firstSheet) firstSheet = sf;
          return {
            answer_text: String(op.answer_text || ('선택지 ' + (oi + 1))),
            actions_after_save: [
              { action_type: 'TAG', operation: 'ATTACH', target: String(op.tag || ('태그_' + (qi + 1) + '_' + (oi + 1))) },
              { action_type: 'SHEET', data_type: 'STRING', operation: 'ATTACH', field_name: sf, value: String(op.sheet_value || ('값' + (oi + 1))) }
            ]
          };
        })
      };
    });
    var fbSheet = {}; fbSheet[firstSheet] = '고객님';

    var promoOffer = extra.promoOffer || extractPromoOfferFromAnswers(A);
    var baseUrl = 'https://gomawartalk.com/webzine/' + ymd + '.html';
    var gSeq = g.tab4_sequence;
    var rawSeq = (Array.isArray(gSeq) && gSeq.length >= 2) ? gSeq.slice(0, 5) : fb.tab4_sequence.slice();
    // V3.0 황금 비율(알림톡 1 : 광고 3) 보장: AI가 3단계까지만 생성한 경우 4번째 광고 스텝 자동 보강
    while (rawSeq.length < 4) {
      rawSeq.push(fb.tab4_sequence[rawSeq.length] || fb.tab4_sequence[3]);
    }

    var cadenceSeed = [
      extra.cadenceSeed,
      A && A[1], A && A[2], A && A[5], A && A[8],
      channel, th.headline,
      rawSeq.map(function (s) { return (s && (s.timing || '') + ' ' + (s.body_text || '') + ' ' + (s.content_intro || '') + ' ' + (s.headline || '')) || ''; }).join(' ')
    ].filter(Boolean).join(' ');
    var cadence = detectCampaignCadence(cadenceSeed);
    var videoInfo = detectVideoMedia(cadenceSeed);

    var sequence = rawSeq.map(function (s, idx) {
      var cadStep = idx === 0 ? cadence.step1 : (idx === 1 ? cadence.step2 : (idx === 2 ? cadence.step3 : (cadence.step4 || cadence.step3)));
      var tt = s.template_type || (idx === 0 ? 'ALIMTALK' : idx === 1 ? 'FREE_FRIENDTALK' : idx === 2 ? 'BRAND_CAROUSEL' : 'FREE_FRIENDTALK');
      var cards = (Array.isArray(s.cards) && s.cards.length >= 2 ? s.cards : fb.tab4_sequence[2].cards).slice(0, 6).map(function (c, ci) {
        return {
          card_index: ci + 1, header_20chars: tFirst(c.header_20chars || ('카드 ' + (ci + 1)), 20), body_180chars: tFirst(c.body_180chars || '', 180),
          button_8chars: tFirst(c.button_8chars || '자세히보기', 8), webzine_anchor: ci === 0 ? '#sec-1' : '#sec-cta', button_url: baseUrl + (ci === 0 ? '#sec-1' : '#sec-cta')
        };
      });
      var anchor = '#sec-' + Math.min(idx + 1, 3);
      var rawTiming = String(s.timing || '').trim();
      var resolvedTiming = cadStep.timing;
      if (cadence.type === 'SHORT' && rawTiming) resolvedTiming = rawTiming;

      var mediaPreview = null;
      var stepButtons = [{ name: tFirst(s.btn_name || '자세히 보기', 14), link_type: 'WL', webzine_anchor: anchor, url: baseUrl + anchor }];
      var bodyText = s.body_text || ('#{이름}님! #{@' + firstSheet + '} 맞춤 안내를 보내드려요.');

      if (videoInfo.isVideo && idx >= 1) {
        var epTitle = idx === 1
          ? (cadence.type === 'MONTHLY' ? ('[월간 1호 인터뷰] ' + tFirst(th.headline, 22)) : ('[핵심 인터뷰 영상] ' + tFirst(th.headline, 22)))
          : (cadence.type === 'MONTHLY' ? ('[월간 2호 인터뷰] ' + tFirst(th.headline, 22)) : ('[후속 인터뷰 영상] ' + tFirst(th.headline, 22)));
        mediaPreview = {
          type: 'YOUTUBE',
          badge: videoInfo.badge,
          duration: idx === 1 ? '04:32' : '06:18',
          title: tFirst(epTitle, 38),
          url: videoInfo.defaultUrl
        };
        stepButtons = [{
          name: videoInfo.buttonLabel,
          link_type: 'WL',
          youtube_app: true,
          webzine_anchor: anchor,
          url: videoInfo.defaultUrl
        }];
        if (cadence.type === 'MONTHLY' && (!s.body_text || /어제 받아보신/.test(s.body_text))) {
          bodyText = idx === 1
            ? ('#{이름}님, 이번 달 정기 인터뷰 영상이 공개되었습니다.\n▶ 맞춤 안내 : #{@' + firstSheet + '} 주제로 선정한 실전 사례 인터뷰와 핵심 체크포인트')
            : ('#{이름}님, 두 번째 월간 인터뷰 영상이 도착했습니다.\n▶ 맞춤 안내 : #{@' + firstSheet + '} 심화 Q&A와 현장 노하우를 유튜브에서 바로 확인해 보세요.');
        }
      } else if (cadence.type === 'MONTHLY' && idx >= 1 && (!s.body_text || /어제 받아보신/.test(s.body_text))) {
        bodyText = idx === 1
          ? ('#{이름}님, 이번 달 정기 브리핑이 도착했습니다.\n▶ 맞춤 안내 : #{@' + firstSheet + '} 고객을 위한 실전 체크리스트와 이달의 핵심 요약')
          : ('#{이름}님, 두 번째 달 정기 브리핑을 보내드립니다.\n▶ 맞춤 안내 : #{@' + firstSheet + '} 후속 실천 가이드와 주요 일정을 확인해 보세요.');
      }

      var rawIntro = s.content_intro || '신청이 정상 접수되었습니다. 신청 내역과 상세 안내는 아래 버튼에서 바로 확인해 보세요.';
      var safeIntro = (tt === 'ALIMTALK') ? stripAlimtalkPromoCopy(rawIntro, channel || th.headline) : rawIntro;
      var safeBody = (tt === 'ALIMTALK') ? stripAlimtalkPromoCopy(bodyText, channel || th.headline) : bodyText;
      var safeTitle = (tt === 'ALIMTALK')
        ? tFirst((s.content_title || (th.headline + ' 신청 접수 확인')).replace(ALIMTALK_PROMO_RE, '').replace(/\s{2,}/g, ' ').trim() || (channel + ' 신청 접수 확인'), 40)
        : tFirst(s.content_title || (th.headline + ' 안내'), 40);
      if (tt === 'ALIMTALK') { ALIMTALK_PROMO_RE.lastIndex = 0; }

      // ★ V3.1 파트너가 Q1/Q3/Q4에 쿠폰·할인 혜택을 입력한 경우 ④ 첫 번째 광고 메시지(idx === 1) 본문과 버튼에 100% 반영!
      if (idx === 1 && tt !== 'ALIMTALK' && promoOffer && promoOffer.hasPromo && promoOffer.phrase) {
        if (safeBody.indexOf(promoOffer.phrase) === -1) {
          safeBody = safeBody + '\n🎁 ' + promoOffer.phrase + ' 혜택을 아래 버튼에서 바로 받아가세요!';
        }
        if (promoOffer.buttonLabel) {
          stepButtons = [{ name: tFirst(promoOffer.buttonLabel, 14), link_type: 'WL', webzine_anchor: anchor, url: baseUrl + anchor }];
        }
      }

      return {
        step: idx + 1,
        timing: resolvedTiming,
        step_short_label: cadStep.shortLabel,
        timewarp_badge: cadStep.badge || '',
        timewarp_sub: cadStep.sub || '',
        chat_date_offset_days: cadStep.chatDateOffsetDays,
        send_time_label: cadStep.sendTimeLabel,
        media_preview: mediaPreview,
        template_type: tt, template_id: TOSS_TEMPLATE_ID,
        has_spotlight_branch: false,
        branch_pair: null,
        _rawAiPair: Array.isArray(s.branch_pair) && s.branch_pair.length >= 2 ? s.branch_pair : null,
        branches: [{
          priority: 1, condition_desc: '모두 (전체 신청자)', template_id: TOSS_TEMPLATE_ID,
          variables: { '콘텐츠 제목': safeTitle, '콘텐츠 소개': safeIntro || '신청이 정상 접수되었습니다. 신청 내역과 상세 안내는 아래 버튼에서 바로 확인해 보세요.' },
          sheet_fallback_strings: fbSheet, image_ratio: '800x400',
          image_copy: { badge: (idx === 1 && promoOffer && promoOffer.hasPromo) ? tFirst(promoOffer.phrase, 20) : (s.badge || th.badge), headline: s.headline || th.headline, subtext: s.subtext || th.subtext },
          media_preview: mediaPreview,
          body_text_400chars: safeBody,
          buttons: stepButtons,
          cards_800x600: cards
        }]
      };
    });

    var useWebzine = (typeof g.use_webzine === 'boolean') ? g.use_webzine : fb.use_webzine;
    var wz = (g.webzine_studio && Array.isArray(g.webzine_studio.sections) && g.webzine_studio.sections.length >= 2) ? g.webzine_studio : fb.webzine_studio;
    var gBa = g.brand_assets || {};
    var themeSeed = [A && A[1], A && A[2], A && A[5], channel, th.headline].filter(Boolean).join(' ');
    var smartTheme = detectSmartEditorialTheme(themeSeed);

    var builtMaster = {
      source_platform: 'NATIVE',
      credit_balance: null,
      external_mapping: null,
      meta: { schema_version: '2.0', brand_name: channel, campaign_id: ymd + '_' + String(channel).replace(/\s+/g, '') + '_01', created_at: now.toISOString(), mode: 'FULL_SET', use_webzine: !!useWebzine, webzine_base_url: baseUrl, source: 'partner_bot_toss8', auto_generate_visuals: true, message_ratio: { alimtalk: 1, ad: 3, label: '알림톡 1 : 광고 3' } },
      partner_info: { owner_name: partner.ownerName || '', phone: partner.phone || '', email: partner.email || '', channel_name: channel, channel_id_num: '', current_plan: 'STARTER', pro_upgrade_requested: false, industry_code: 'custom_ai', track_id: '' },
      brand_assets: { primary_color: gBa.primary_color || smartTheme.primary, secondary_color: gBa.secondary_color || smartTheme.secondary, font_theme: gBa.font_theme || 'modern', logo_base64: null, block_images_base64: { block_1: null, block_2: null, block_3: null, block_4: null, block_5: null } },
      tab1_basic_settings: {
        channel_name: channel,
        thumbnail_500x280: th, title_30chars: tFirst(gT1.title_30chars || fT1.title_30chars, 30), description: gT1.description || fT1.description,
        apply_btn_text: gT1.apply_btn_text || fT1.apply_btn_text, cancel_btn_text: gT1.cancel_btn_text || fT1.cancel_btn_text,
        video_preview: videoInfo.isVideo ? { enabled: true, badge: videoInfo.badge, title: tFirst(th.headline + ' 소개 영상', 34), duration: '03:20', url: videoInfo.defaultUrl } : null,
        show_apply_btn: true, show_top_bar: true, form_only_mode: false, failure_notice_alimtalk: true, friendtalk_rescue_2times: true, marketing_consent_popup: true
      },
      tab2_landing_content: { output_mode: 'FULL', bg_color: smartTheme.secondary, use_shorts_landing: !!videoInfo.isVideo, shorts_youtube_url: videoInfo.isVideo ? videoInfo.defaultUrl : '', blocks_1000px: blocks, branch_links: ['', '', '', '', ''] },
      tab3_application_form: {
        is_active: true,
        form_title: (g.tab3_application_form && g.tab3_application_form.form_title) || fb.tab3_application_form.form_title,
        form_guide_text: (g.tab3_application_form && g.tab3_application_form.form_guide_text) || fb.tab3_application_form.form_guide_text,
        questions: questions
      },
      tab4_interval_messages: {
        quick_single_mode: false,
        exclude_days: ['SAT', 'SUN'],
        cadence_type: cadence.type,
        cadence_label: cadence.label,
        has_video_media: !!videoInfo.isVideo,
        sequence: sequence
      },
      tab5_date_messages: [{ quick_single_mode: false, send_datetime: ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8) + ' 10:00', title: tFirst(th.headline, 24) + ' — 일정 안내', template_type: 'BRAND_CAROUSEL', has_spotlight_branch: false, branch_pair: null, branches: [Object.assign({}, sequence[sequence.length - 1].branches[0], { priority: 1, condition_desc: '전체 신청자 동시 발송' })] }],
      webzine_studio: wz
    };
    applyOnePointSpotlightBranch(builtMaster, {
      topic: (A && A[1]) || th.headline,
      firstSheet: firstSheet,
      videoInfo: videoInfo,
      promoOffer: promoOffer
    });
    return sanitizeObject(builtMaster);
  };

  TOSS.generateCampaign = function (ctx) {
    var p = TOSS.buildGenerationPrompt(ctx);
    return TOSS.callAI({ mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token, system: p.system, user: p.user, temperature: 0.55, maxOutputTokens: 8192 })
      .then(function (raw) {
        var obj = extractJson(raw);
        if (!obj) throw new Error('AI 제작 결과를 읽지 못했어요. 다시 시도해 주세요.');
        return TOSS.assembleCampaign(obj, ctx.answers, ctx.partner);
      });
  };

  TOSS.submitCampaign = function (proxyUrl, tokenOrOpts, master) {
    var opts = (tokenOrOpts && typeof tokenOrOpts === 'object')
      ? tokenOrOpts
      : { partnerToken: String(tokenOrOpts || '') };
    var payloadBody = {
      action: 'submit_campaign',
      partnerToken: opts.partnerToken || opts.userToken || '',
      userToken: opts.userToken || '',
      kakao_user_id: opts.kakao_user_id || '',
      name: opts.name || '',
      phone: opts.phone || '',
      adminBypass: !!opts.adminBypass,
      skip_image_gen: opts.skip_image_gen !== false,
      auth: {
        kakao_user_id: opts.kakao_user_id || '',
        name: opts.name || '',
        phone: opts.phone || '',
        userToken: opts.userToken || '',
        adminBypass: !!opts.adminBypass
      },
      payload: master
    };
    return TOSS.postProxy(proxyUrl, payloadBody, { allowErrorPayload: true });
  };

  TOSS.verifyUserAndQuota = function (proxyUrl, payload) {
    return TOSS.postProxy(proxyUrl, Object.assign({ action: 'verifyUserAndQuota' }, payload || {}), { allowErrorPayload: true });
  };

  TOSS.verifyPartner = function (proxyUrl, payload) {
    return TOSS.postProxy(proxyUrl, Object.assign({ action: 'verifyPartner' }, payload || {}));
  };

  // ─────────────────────────────────────────────────────────────
  // 7. 5단계 컨설턴트 인터뷰 엔진 (RagInterviewEngine.Consult)
  //    - Step 1: 6대 마스터 분야 + 1줄 세부 업종
  //    - Step 2: 선택 분야 언어로 번역된 6대 운영 플로우 미리보기 + AI 흐름 추천
  //    - Step 3: Tap-to-Edit 주관식 5단계 심층 인터뷰 + 실시간 매뉴얼 검문소(Feasibility Guardrail) + 분리된 기능 Q&A
  //    - Step 4: 브랜드 에셋 수집(로고 · 컬러 5종/직접선택 · 실사 사진 최대 3장 또는 AI 자동 생성)
  //    - Step 5: 최종 요약 컨펌 -> 100% 제로베이스 CampaignMaster.json 생성 & 조종석 직결
  // ─────────────────────────────────────────────────────────────
  var CONSULT = {};
  CONSULT.TOTAL_Q = 5;
  CONSULT.Q_META = [
    {
      n: 1,
      key: 'landing_screen',
      courseLabel: '① 신청화면',
      label: '① 신청화면',
      tabRef: '탭 2 · 신청페이지',
      nextCta: '다음: ② 신청 질문 고르기 →',
      analogyBadge: '',
      usageHint: '신청페이지 첫 화면(탭 2)에 들어갈 초대 대상과 핵심 안내·혜택을 정하는 단계예요.'
    },
    {
      n: 2,
      key: 'form_question',
      courseLabel: '② 신청질문',
      label: '② 신청질문',
      tabRef: '탭 3 · 신청폼',
      nextCta: '다음: ③ 첫 카톡 내용 정하기 →',
      analogyBadge: '',
      usageHint: '신청할 때 고객이 클릭해서 고를 객관식 질문(탭 3)을 정해요. 없으면 원터치로 건너뛸 수 있어요.'
    },
    {
      n: 3,
      key: 'first_kakao',
      courseLabel: '③ 첫카톡',
      label: '③ 첫카톡',
      tabRef: '탭 4 · 즉시 확인 알림톡',
      nextCta: '다음: ④ 며칠 뒤 자동 카톡 →',
      analogyBadge: '',
      usageHint: '신청 버튼을 누르자마자 1초 만에 도착할 환영·접수확인 첫 카톡(알림톡) 내용을 담아요.'
    },
    {
      n: 4,
      key: 'interval_auto',
      courseLabel: '④ 며칠뒤 자동',
      label: '④ 며칠뒤 자동',
      tabRef: '탭 4 · 간격발송',
      nextCta: '다음: ⑤ 날짜·시간 지정 카톡 →',
      analogyBadge: '🌱 오늘 신청한 분에겐 내일, 모레 신청한 분에겐 글피! 사람마다 신청한 날부터 순서대로 챙겨줘요.',
      usageHint: '신청한 날을 기준으로 며칠 간격으로 보낼 자동 안부·정보 카톡(탭 4 간격발송)을 정해요.'
    },
    {
      n: 5,
      key: 'date_reserve',
      courseLabel: '⑤ 날짜지정',
      label: '⑤ 날짜지정',
      tabRef: '탭 5 · 날짜지정 예약',
      nextCta: '완료 · 브랜드 스타일 입력하기 →',
      analogyBadge: '🗓️ 언제 신청했든 상관없이, 지정하신 정확한 날짜와 시각에 다 같이 발송돼요.',
      usageHint: '달력의 특정 날짜와 시각에 신청자 전원에게 동시 발송할 예약 카톡(탭 5)을 설정해요.'
    }
  ];

  // ── V2.7 스마트 자동 토스(Auto-Toss) 날짜·시각·간격 파서 ──
  CONSULT.formatTime24ToKo = function (time24) {
    var m = String(time24 || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '오전 9:00';
    var h = parseInt(m[1], 10);
    var min = m[2];
    if (!isFinite(h) || h < 0 || h > 23) h = 9;
    var isPm = h >= 12;
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return (isPm ? '오후 ' : '오전 ') + h12 + ':' + min;
  };

  CONSULT.toTime24 = function (ampm, hour12, minute) {
    var h = parseInt(hour12, 10);
    var m = parseInt(minute, 10);
    if (!isFinite(h) || h < 1 || h > 12) h = 9;
    if (!isFinite(m) || m < 0 || m > 59) m = 0;
    var isPm = String(ampm || 'AM').toUpperCase() === 'PM' || ampm === '오후';
    var h24 = isPm ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
    return String(h24).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  };

  CONSULT.splitTime24 = function (time24) {
    var m = String(time24 || '09:00').match(/^(\d{1,2}):(\d{2})$/);
    var h24 = m ? parseInt(m[1], 10) : 9;
    var min = m ? parseInt(m[2], 10) : 0;
    if (!isFinite(h24) || h24 < 0 || h24 > 23) h24 = 9;
    if (!isFinite(min) || min < 0 || min > 59) min = 0;
    var ampm = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return {
      ampm: ampm,
      hour12: h12,
      minute: min,
      time24: String(h24).padStart(2, '0') + ':' + String(min).padStart(2, '0'),
      timeKo: (ampm === 'PM' ? '오후 ' : '오전 ') + h12 + ':' + String(min).padStart(2, '0')
    };
  };

  function parseKoreanTimeFromText(text, defaultTime24) {
    var s = String(text || '');
    var def = CONSULT.splitTime24(defaultTime24 || '09:00');
    var m = s.match(/(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/);
    if (m) {
      var mer = m[1] || '';
      var h = parseInt(m[2], 10);
      var min = m[3] ? parseInt(m[3], 10) : (m[4] ? 30 : 0);
      if (isFinite(h) && h >= 0 && h <= 23 && isFinite(min) && min >= 0 && min <= 59) {
        if (/오후|저녁|밤/.test(mer)) {
          if (h < 12) h += 12;
        } else if (/오전|아침|새벽/.test(mer)) {
          if (h === 12) h = 0;
        } else if (h >= 1 && h <= 6) {
          h += 12;
        }
        return Object.assign(CONSULT.splitTime24(String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')), { matched: true, matchedText: m[0] });
      }
    }
    var m2 = s.match(/(오전|오후)?\s*(\d{1,2}):(\d{2})/);
    if (m2) {
      var mer2 = m2[1] || '';
      var h2 = parseInt(m2[2], 10);
      var min2 = parseInt(m2[3], 10);
      if (isFinite(h2) && h2 >= 0 && h2 <= 23 && isFinite(min2) && min2 >= 0 && min2 <= 59) {
        if (mer2 === '오후' && h2 < 12) h2 += 12;
        if (mer2 === '오전' && h2 === 12) h2 = 0;
        return Object.assign(CONSULT.splitTime24(String(h2).padStart(2, '0') + ':' + String(min2).padStart(2, '0')), { matched: true, matchedText: m2[0] });
      }
    }
    return Object.assign(def, { matched: false, matchedText: '' });
  }

  function cleanScheduleMessageHint(raw, matchedParts) {
    var s = String(raw || '').trim();
    (matchedParts || []).forEach(function (part) {
      if (part) s = s.replace(part, ' ');
    });
    s = s
      .replace(/^[\s,.\-·:에의로부터까지]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s || String(raw || '').trim();
  }

  // ── V3.0 카카오 메시지 성격 자동 분류(알림톡 vs 광고) & 야간 규정(20:00~08:00) 검증 ──
  CONSULT.stripAlimtalkChannelAddSolicitation = stripAlimtalkChannelAddSolicitation;
  TOSS.stripAlimtalkChannelAddSolicitation = stripAlimtalkChannelAddSolicitation;

  var PROMO_MESSAGE_RE = /할인|특가|쿠폰|이벤트|무료\s*증정|프로모션|광고|홍보|모집|결제|구매|오픈런|공구|세일|타임세일|칼럼|연재|영상|유튜브|youtube|쇼츠|후기|레시피|소식|브리핑|매거진|혜택|체험권|우대|정규반|얼리버드|신메뉴|신상|인터뷰|주보|묵상|카드뉴스/i;
  var INFO_ALIMTALK_RE = /예약\s*(확인|안내|확정|알림)|신청\s*(확인|완료|접수)|참석\s*(확인|안내|리마인드)|일정\s*(안내|리마인드|알림)|오시는\s*길|주차\s*안내|입장\s*안내|준비물|주의사항|금식|복약|서류\s*준비|접속\s*링크|리마인드|휴진|당일\s*안내|개강\s*안내|반\s*배정|출석\s*확인|등록\s*확인|알림톡/i;

  CONSULT.classifyKakaoMessageType = function (qNum, text) {
    var n = Number(qNum) || 0;
    var s = String(text || '').trim();
    if (n === 3) {
      var hasCouponInQ3 = /쿠폰|할인권|할인|특가|무료\s*증정/.test(s);
      var b3 = hasCouponInQ3
        ? '🔵 알림톡 (정보성 · 쿠폰·할인 내용은 ④ 광고 메시지에 자동 배치돼요)'
        : '🔵 알림톡 (정보성 · 24시간 즉시 발송)';
      return {
        type: 'INFO_ALIMTALK',
        badge: b3,
        badgeText: b3,
        shortLabel: '알림톡',
        allowNight: true,
        isPromo: false
      };
    }
    if (n === 4 || n === 5) {
      var hasPromo = PROMO_MESSAGE_RE.test(s);
      var hasInfo = INFO_ALIMTALK_RE.test(s);
      if (hasPromo) {
        var bp = '🟡 광고 (오후 8시~오전 8시 발송 제한)';
        return {
          type: 'PROMO_FRIENDTALK',
          badge: bp,
          badgeText: bp,
          shortLabel: '광고',
          allowNight: false,
          isPromo: true
        };
      }
      if (hasInfo || n === 5) {
        var bi = '🔵 알림톡 (정보성 · 24시간 발송 가능)';
        return {
          type: 'INFO_ALIMTALK',
          badge: bi,
          badgeText: bi,
          shortLabel: '알림톡',
          allowNight: true,
          isPromo: false
        };
      }
      var bp2 = '🟡 광고 (오후 8시~오전 8시 발송 제한)';
      return {
        type: 'PROMO_FRIENDTALK',
        badge: bp2,
        badgeText: bp2,
        shortLabel: '광고',
        allowNight: false,
        isPromo: true
      };
    }
    return null;
  };

  CONSULT.isNightRestrictedTime = function (time24) {
    var m = String(time24 || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return false;
    var h = parseInt(m[1], 10);
    if (!isFinite(h) || h < 0 || h > 23) return false;
    // 카카오 공식 규정: 오후 8시(20:00) ~ 다음 날 오전 8시(07:59)
    return (h >= 20 || h < 8);
  };

  CONSULT.checkNightPolicyForMessage = function (qNum, text, time24List) {
    var msgType = CONSULT.classifyKakaoMessageType(qNum, text);
    if (!msgType || msgType.allowNight) {
      return { blocked: false, msgType: msgType };
    }
    var times = Array.isArray(time24List) ? time24List.filter(Boolean) : [];
    var parsedT = parseKoreanTimeFromText(text, '');
    if (parsedT && parsedT.matched && parsedT.time24) {
      times.push(parsedT.time24);
    }
    var hasNightTime = times.some(function (t) { return CONSULT.isNightRestrictedTime(t); });
    var hasNightWord = /(야간|새벽|심야|자정|밤\s*\d{1,2}시|20시|20:00|21시|22시|23시|오후\s*8시|저녁\s*8시|오후\s*9시|오후\s*10시|오후\s*11시|오전\s*[1-7]시)/i.test(String(text || ''));
    if (!hasNightTime && !hasNightWord) {
      return { blocked: false, msgType: msgType };
    }
    var exactMsg = '이 내용은 광고 메시지라 카카오 정책상 오후 8시~오전 8시에는 발송되지 않아요. 오후 7:30 이전이나 오전 8:00 이후로 맞춰보세요!';
    var safeText = String(text || '').trim();
    var eveningDraft = safeText
      .replace(/(오후\s*8시|저녁\s*8시|20시|20:00|오후\s*9시|오후\s*10시|오후\s*11시|21시|22시|23시|밤\s*\d{1,2}시|새벽\s*\d{1,2}시|오전\s*[1-7]시|야간|심야|새벽)/g, '오후 7시 30분');
    if (eveningDraft === safeText) eveningDraft = '오후 7:30에 ' + safeText;
    var morningDraft = safeText
      .replace(/(오후\s*8시|저녁\s*8시|20시|20:00|오후\s*9시|오후\s*10시|오후\s*11시|21시|22시|23시|밤\s*\d{1,2}시|새벽\s*\d{1,2}시|오전\s*[1-7]시|야간|심야|새벽)/g, '오전 8시');
    if (morningDraft === safeText) morningDraft = '오전 8:00에 ' + safeText;

    return {
      blocked: true,
      message: exactMsg,
      msgType: msgType,
      guardrail: {
        ruleId: 'night_friendtalk',
        title: '광고 메시지 야간 발송 제한 (오후 8시~오전 8시)',
        reason: exactMsg,
        exactMessage: exactMsg,
        alternatives: [
          {
            label: '오후 7:30(19:30)으로 발송 시각 맞추기',
            detail: '카카오 광고 메시지 마감(오후 8시) 직전인 오후 7:30에 안전하게 발송되도록 맞춰드려요.',
            suggestedTime24: '19:30',
            draftText: eveningDraft
          },
          {
            label: '오전 8:00(08:00) 이후로 발송 시각 맞추기',
            detail: '아침 열람률이 높은 오전 8:00 이후로 맞춰 카카오 규정 위반 없이 발송해 드려요.',
            suggestedTime24: '08:00',
            draftText: morningDraft
          }
        ]
      }
    };
  };

  // Q1~Q3 자유 답변에서 미래 특정 날짜·시각(Q5 최대 3슬롯) 또는 간격 주기(Q4)를 감지해 자동 토스 데이터 생성 (RECURRING 모드 완전 폐지)
  CONSULT.autoTossScheduleHints = function (text, opts) {
    opts = opts || {};
    var s = String(text || '').trim();
    if (!s) return { hasAny: false, interval: null, dateReservation: null };

    var refDate = opts.refDate instanceof Date ? opts.refDate : new Date();
    var refYear = refDate.getFullYear();
    var refMonth = refDate.getMonth() + 1;
    var refDay = refDate.getDate();

    var dateReservation = null;
    var interval = null;

    // 1) 특정 날짜 최대 3개 추출 (YYYY-MM-DD / YYYY.MM.DD / YYYY년 M월 D일 / M월 D일) -> Q5 SLOTS (ONCE)
    var dateRe = /(?:(\d{4})[-./년]\s*)?(\d{1,2})\s*(?:[-./]\s*(\d{1,2})(?!\s*시)|월\s*(\d{1,2})\s*일?)/g;
    var foundSlots = [];
    var matchedDateTokens = [];
    var m;
    while ((m = dateRe.exec(s)) !== null && foundSlots.length < 3) {
      var hasYear = !!m[1];
      var yr = hasYear ? parseInt(m[1], 10) : refYear;
      var mo = parseInt(m[2], 10);
      var dy = parseInt(m[3] || m[4], 10);
      if (!isFinite(mo) || !isFinite(dy) || mo < 1 || mo > 12 || dy < 1 || dy > 31) continue;
      if (!hasYear && (mo < refMonth || (mo === refMonth && dy < refDay))) {
        yr = refYear + 1;
      }
      var dateStr = yr + '-' + String(mo).padStart(2, '0') + '-' + String(dy).padStart(2, '0');
      var afterCtx = s.slice(m.index, Math.min(s.length, m.index + m[0].length + 22));
      var tInfo = parseKoreanTimeFromText(afterCtx, '');
      if (!tInfo.matched) tInfo = parseKoreanTimeFromText(s, '09:00');
      matchedDateTokens.push(m[0]);
      if (tInfo.matchedText) matchedDateTokens.push(tInfo.matchedText);
      var slotMsg = cleanScheduleMessageHint(s, [m[0], tInfo.matchedText]);
      foundSlots.push({
        date: dateStr,
        time24: tInfo.time24,
        timeKo: tInfo.timeKo,
        ampm: tInfo.ampm,
        hour12: tInfo.hour12,
        minute: tInfo.minute,
        displayLabel: mo + '월 ' + dy + '일 ' + tInfo.timeKo,
        message: slotMsg,
        message_hint: slotMsg,
        autoTossed: true
      });
    }

    if (foundSlots.length > 0) {
      var first = foundSlots[0];
      var cleanMsgAll = cleanScheduleMessageHint(s, matchedDateTokens);
      dateReservation = {
        mode: 'ONCE',
        date: first.date,
        time24: first.time24,
        timeKo: first.timeKo,
        ampm: first.ampm,
        hour12: first.hour12,
        minute: first.minute,
        displayLabel: foundSlots.length === 1 ? first.displayLabel : (first.displayLabel + ' 외 ' + (foundSlots.length - 1) + '건'),
        message_hint: cleanMsgAll || first.message_hint,
        draftText: cleanMsgAll || first.message_hint,
        slots: foundSlots,
        autoTossed: true
      };
    }

    // 2) 신청일 기준 에버그린 간격 (N일 뒤/간격/마다, 일주일마다, 한 달 간격, 매월/매주 정기 연재 -> 모두 Q4 간격발송으로 매핑)
    var monthIntM = s.match(/(한\s*달\s*(마다|간격|뒤|후)|30일\s*(마다|간격|뒤|후)|월\s*1\s*회|달마다|(?:매월|매달)(?:\s*(?:말일|마지막\s*날|\d{1,2}\s*일))?)/);
    var weekIntM = !monthIntM ? s.match(/(일주일\s*(마다|간격|뒤|후)|7일\s*(마다|간격|뒤|후)|주\s*1\s*회|(?:매주|주마다)(?:\s*[월화수목금토일](?:요일)?)?)/) : null;
    var dayIntM = (!monthIntM && !weekIntM) ? s.match(/(\d{1,2})\s*일\s*(뒤|후|간격|마다)|(?:이틀|사흘)\s*(뒤|후|간격|마다)|격일/) : null;

    if (monthIntM) {
      var mHint = cleanScheduleMessageHint(s, [monthIntM[0]]);
      interval = {
        enabled: true,
        preset: 'MONTHLY_30D',
        cadenceType: 'MONTHLY',
        label: '한 달(30일)마다 정기 발송',
        days: [30, 60],
        displayLabel: '한 달(30일)마다 정기 발송',
        message_hint: mHint,
        draftText: '한 달(30일)마다 정기 발송 — ' + mHint,
        autoTossed: true
      };
    } else if (weekIntM) {
      var wHint = cleanScheduleMessageHint(s, [weekIntM[0]]);
      interval = {
        enabled: true,
        preset: 'WEEKLY_7D',
        cadenceType: 'WEEKLY',
        label: '일주일(7일)마다 정기 발송',
        days: [7, 14],
        displayLabel: '일주일(7일)마다 정기 발송',
        message_hint: wHint,
        draftText: '일주일(7일)마다 정기 발송 — ' + wHint,
        autoTossed: true
      };
    } else if (dayIntM) {
      var nDays = dayIntM[1] ? parseInt(dayIntM[1], 10) : (/사흘/.test(dayIntM[0]) ? 3 : 2);
      var dPreset = nDays >= 25 ? 'MONTHLY_30D' : (nDays >= 6 && nDays <= 8 ? 'WEEKLY_7D' : 'D1_D3');
      var dCadence = dPreset === 'MONTHLY_30D' ? 'MONTHLY' : (dPreset === 'WEEKLY_7D' ? 'WEEKLY' : 'SHORT');
      var dLabel = dPreset === 'MONTHLY_30D' ? '한 달(30일)마다 정기 발송' : (dPreset === 'WEEKLY_7D' ? '일주일(7일)마다 정기 발송' : '1일 · 3일 뒤 연속 챙기기');
      var dHint = cleanScheduleMessageHint(s, [dayIntM[0]]);
      var dispInt = dayIntM[0].trim();
      interval = {
        enabled: true,
        preset: dPreset,
        cadenceType: dCadence,
        label: dLabel,
        days: dPreset === 'D1_D3' ? [nDays, Math.max(nDays * 2, 3)] : (dPreset === 'WEEKLY_7D' ? [7, 14] : [30, 60]),
        displayLabel: dispInt,
        message_hint: dHint,
        draftText: dispInt + '으로 ' + dHint,
        autoTossed: true
      };
    }

    return {
      hasAny: !!(interval || dateReservation),
      interval: interval,
      dateReservation: dateReservation
    };
  };

  // 추가 내부 용어 필터링 (시트 정수 더하기 등 절대 미노출)
  var CONSULT_JARGON = [
    [/시트\s*정수\s*더하기/g, '포인트 자동 적립'],
    [/시트\s*액션/g, '고객 맞춤 기록'],
    [/뜰채\s*조건?\s*분기?/g, '유형별 맞춤 자동 발송'],
    [/1\s*회차\s*알림톡/g, '신청 즉시 첫 카톡'],
    [/미끼\s*(자료|상품|혜택)?/g, '첫 무료 혜택'],
    [/\d+\s*번\s*트랙/g, '선택하신 운영 흐름'],
    [/청사진/g, '캠페인 기획안'],
    [/제로\s*베이스/g, '맞춤 제작'],
    [/웹진\s*앵커/g, '모바일 페이지 바로가기'],
    [new RegExp(TOSS_BANNED_LIT, 'g'), '정기 칼럼·소식']
  ];

  CONSULT.cleanPartnerText = function (text) {
    var t = TOSS.cleanJargon(String(text == null ? '' : text));
    CONSULT_JARGON.forEach(function (r) { t = t.replace(r[0], r[1]); });
    return sanitizeText(t);
  };

  CONSULT.getCatalog = function () {
    return global.GOMAWARTALK_CONSULT_CATALOG || global.GomawartalkConsultCatalog || { colorThemes: [], sectors: [] };
  };

  CONSULT.getFeasibilityRules = function () {
    return global.GOMAWARTALK_FEASIBILITY_RULES || global.GomawartalkFeasibilityRules || [];
  };

  CONSULT.getSector = function (sectorId) {
    var cat = CONSULT.getCatalog();
    var list = cat.sectors || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === sectorId) return list[i];
    }
    return list[0] || null;
  };

  CONSULT.matchSubDomainPack = function (sectorId, subIndustry) {
    var cat = CONSULT.getCatalog();
    var packs = cat.subDomainPacks || {};
    var sub = String(subIndustry || '').trim();
    if (!sub) return null;
    var keys = Object.keys(packs);
    for (var i = 0; i < keys.length; i++) {
      var p = packs[keys[i]];
      if (!p || !p.re) continue;
      if (p.excludeRe && p.excludeRe.test(sub)) continue;
      if (p.re.test(sub)) return { key: keys[i], pack: p };
    }
    return null;
  };

  CONSULT.isPoliticsDomain = function (text) {
    var s = String(text || '').trim();
    if (!s) return false;
    var matched = CONSULT.matchSubDomainPack('', s);
    if (matched && matched.key === 'politics_public') return true;
    var polRe = /(정치|선거|후보|구청장|군수|도지사|국회의원|시의원|도의원|구의원|지자체|선거\s*캠프|출마|당선|정당|공약|유권자|의정|개소식|출판기념회|선거사무소)|((?:^|[\s·,])(?:[가-힣]{2,4}\s*)?시장(?=\s|$|님|후보|선거|출마|당선|캠프))|((?:^|[\s·,])의원(?=\s|$|실|후보|활동))/i;
    var exRe = /전통시장|재래시장|주식시장|부동산\s*시장|시장\s*조사|마케팅\s*시장|한의원|치과의원|산부인과의원|여성의원|피부과의원|내과의원|정형외과의원|안과의원|소아과의원/i;
    return !exRe.test(s) && polRe.test(s);
  };

  // 정치·선거·공공 도메인 금기 상업어 정화 (공직선거법 오해 방지)
  var POLITICS_COMMERCIAL_FIX = [
    [/첫\s*혜택\s*즉시\s*발급/g, '핵심 공약 요약 안내'],
    [/혜택\s*즉시\s*발급/g, '핵심 정책 자료 안내'],
    [/무료\s*사은품|사은품|무료\s*증정/g, '정책 요약 안내서'],
    [/할인\s*쿠폰|쿠폰/g, '정책 안내 카드'],
    [/구매\s*유도|결제\s*유도/g, '유권자 소통·참여'],
    [/매출\s*전환|매출\s*극대화|매출/g, '유권자 공감·지지'],
    [/브랜드\s*팬덤/g, '지역 지지자 소통'],
    [/첫\s*이용\s*고객\s*전용\s*우대\s*혜택|특별\s*혜택|첫\s*혜택|무료\s*혜택/g, '핵심 공약·의정 자료'],
    [/할인|특가|프로모션/g, '정책 소식']
  ];

  CONSULT.cleanPoliticsText = function (text) {
    var t = CONSULT.cleanPartnerText(text);
    POLITICS_COMMERCIAL_FIX.forEach(function (r) { t = t.replace(r[0], r[1]); });
    return t;
  };

  // 사용자 자유 입력문 스마트 정제 & [핵심 업종 명사(최대 12자) / 캠페인 목표] 분리 엔진
  CONSULT.sanitizeSubIndustryLabel = function (rawInput, sectorId) {
    var raw = String(rawInput == null ? '' : rawInput).replace(/\s+/g, ' ').trim();
    var sec = CONSULT.getSector(sectorId);
    var fallbackShort = (sec && sec.shortTitle && sec.id !== 'other') ? sec.shortTitle : '맞춤 캠페인';
    if (!raw) {
      return { cleanLabel: fallbackShort, extractedGoal: '', isConversational: false, isPolitics: false };
    }

    var isPolitics = CONSULT.isPoliticsDomain(raw);
    var convRe = /(목표(야|예요|이에요|입니다)?|하고\s*싶(어|어요|습니다|다)?|모으고\s*싶|늘리고\s*싶|알리고\s*싶|운영\s*(중|하고|해요|합니다)|하는데|하고\s*있|준비\s*(중|하고)|당선|출마|입니다$|이에요$|예요$|거야$|이야$|어요$|아요$|해요$|야$|해$)/;
    var isConv = convRe.test(raw) || raw.length > 14;

    var extractedGoal = '';
    if (isConv) {
      extractedGoal = raw
        .replace(/^(정치인|사업가|자영업자|대표|원장)\s+/g, '')
        .replace(/\s*목표야$/g, '을 목표로 캠페인을 진행하고 싶어요.')
        .replace(/\s*목표예요$/g, '을 목표로 캠페인을 진행하고 싶어요.')
        .replace(/\s*목표입니다$/g, '을 목표로 캠페인을 진행하고 싶어요.')
        .replace(/하고\s*싶어$/g, '하고 싶어요.')
        .replace(/모으고\s*싶어$/g, '모으고 싶어요.')
        .replace(/야$/g, '를 알리고 소통하고 싶어요.')
        .trim();
      if (extractedGoal && !/[.?!요다]$/.test(extractedGoal)) {
        extractedGoal = extractedGoal + ' 목표로 캠페인을 진행하고 싶어요.';
      }
    }

    var label = raw;
    // 1) 목표·서술 구절 뒤쪽 잘라내기
    label = label
      .replace(/\s*(당선|출마|홍보|모집|확보|유치|증대|달성|구축)?\s*목표(야|예요|이에요|입니다|로|임)?.*$/g, '')
      .replace(/\s*(단골|고객|회원|수강생|유권자|지지자|참석자|문의|예약)?\s*(을|를)?\s*(모으고|늘리고|알리고|홍보하고|만들고|하고)\s*싶.*$/g, '')
      .replace(/\s*(운영\s*(중|하고|해요|합니다)|하는데|하고\s*있(어|어요|습니다)|준비\s*중).*$/g, '')
      .replace(/(입니다|이에요|예요|거야|이야|어요|아요|해요|할래요|할래|야|해)\s*[.!?]*$/g, '')
      .trim();

    // 2) 불필요한 수식어·조사 정리 ("남양주에서 작은 카페" -> "남양주 카페")
    label = label
      .replace(/([가-힣]{2,6})에서\s+/g, '$1 ')
      .replace(/(?:^|\s)(작은|조그만|우리|저희|이번에|새로|현재|지금|혼자|직접|열심히)\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 3) 정치/선거 도메인 명사 정제 ("정치인 남양주 시장" -> "남양주 시장 후보")
    if (isPolitics) {
      label = label.replace(/^정치인\s+/g, '').trim();
      if (/(시장|구청장|군수|도지사|국회의원|시의원|도의원|구의원|의원)$/.test(label) && !/(후보|캠프|의원실)$/.test(label)) {
        label = label + ' 후보';
      }
      if (!label || label === '정치' || label === '선거') {
        label = '선거·의정 캠프';
      }
    }

    // 4) 끝 조사 제거 & 최대 12자 깔끔 절단
    label = label.replace(/\s*(을|를|이|가|은|는|의|에|로|으로|와|과|도)$/g, '').trim();
    if (!label) label = fallbackShort;
    var chars = Array.from(label);
    if (chars.length > 12) {
      var words = label.split(/\s+/);
      var built = '';
      for (var w = 0; w < words.length; w++) {
        var next = built ? (built + ' ' + words[w]) : words[w];
        if (Array.from(next).length <= 12) built = next;
        else break;
      }
      label = built || chars.slice(0, 12).join('');
    }
    label = label.replace(/\s*(을|를|이|가|은|는|의|에|로|와|과)$/g, '').trim() || fallbackShort;

    return {
      cleanLabel: label,
      extractedGoal: extractedGoal,
      isConversational: isConv,
      isPolitics: isPolitics
    };
  };

  function interpolateSub(str, subLabel) {
    return String(str == null ? '' : str).replace(/\{SUB\}/g, subLabel || '우리 브랜드');
  }

  function shortenPill(text, maxChars) {
    maxChars = maxChars || 13;
    var s = String(text == null ? '' : text)
      .replace(/\(.*?\)/g, '')
      .replace(/카카오\s*1초\s*/g, '')
      .replace(/신청\s*즉시\s*/g, '즉시 ')
      .replace(/자동\s*발송|발송$/g, '')
      .replace(/안내\s*&.*/g, '안내')
      .replace(/\s+/g, ' ')
      .trim();
    // 앞 핵심 구절 우선 추출
    var cut = s.split(/\s*[+➔→·]\s*/)[0] || s;
    if (tLen(cut) < 5 && s.length > cut.length) cut = s;
    return tFirst(cut, maxChars);
  }

  CONSULT.buildFlowPills = function (flow) {
    var icons = ['📋', '💬', '⏰'];
    if (flow && Array.isArray(flow.pills) && flow.pills.length === 3) {
      return flow.pills.map(function (p, i) {
        return { icon: icons[i], text: CONSULT.cleanPartnerText(tFirst(p, 15)) };
      });
    }
    var pipe = (flow && Array.isArray(flow.pipeline)) ? flow.pipeline : [];
    return [0, 1, 2].map(function (i) {
      var raw = (pipe[i] && pipe[i].text) || (['간편 신청 체크', '즉시 첫 안내 카톡', '후속 자동 카톡'][i]);
      return { icon: icons[i], text: CONSULT.cleanPartnerText(shortenPill(raw, 13)) };
    });
  };

  CONSULT.getBestFlowId = function (sectorId, subIndustry) {
    var sub = String(subIndustry || '').toLowerCase();
    if (CONSULT.isPoliticsDomain(sub)) return 'FLOW_4';
    if (/산부인과|병원|의원|치과|한의원|검진|설명회|세미나|웨비나|특강/.test(sub)) return 'FLOW_1';
    if (/세무|법무|변호사|노무|학원|수학|영어|패션|쇼핑몰|피부|필라테스/.test(sub)) return 'FLOW_4';
    if (/교회|기독교|집회|부흥회|수련회|협회|모임|커뮤니티|후원|비영리/.test(sub)) return 'FLOW_3';
    if (/카페|식당|매장|네일|헤어|베이커리|유치원|호텔|스튜디오|인테리어/.test(sub)) return 'FLOW_2';
    var map = {
      online_edu: 'FLOW_2',
      academy: 'FLOW_4',
      professional: 'FLOW_4',
      local_store: 'FLOW_2',
      commerce: 'FLOW_4',
      community: 'FLOW_3',
      other: 'FLOW_2'
    };
    return map[sectorId] || 'FLOW_2';
  };

  // 타 업종 용어 오염 0% 보장 — 세부 업종 전용 6대 플로우 로컬 생성기 (구어체 원문 접두사 결합 완전 금지!)
  CONSULT.getFlowsForContext = function (sectorId, subIndustry) {
    var rawSub = String(subIndustry || '').trim();
    var sec = CONSULT.getSector(sectorId);
    var parsed = CONSULT.sanitizeSubIndustryLabel(rawSub, sectorId);
    var matched = CONSULT.matchSubDomainPack(sectorId, rawSub) || CONSULT.matchSubDomainPack(sectorId, parsed.cleanLabel);
    var srcFlows = null;
    if (matched && matched.pack && Array.isArray(matched.pack.flows)) {
      srcFlows = matched.pack.flows;
    } else if (sec && Array.isArray(sec.flows)) {
      srcFlows = sec.flows;
    } else {
      return [];
    }
    var subLabel = parsed.cleanLabel || (sec ? sec.shortTitle : '우리 브랜드');
    var cleanFn = parsed.isPolitics ? CONSULT.cleanPoliticsText : CONSULT.cleanPartnerText;

    return srcFlows.map(function (f) {
      var title = interpolateSub(f.title, subLabel);
      var built = {
        id: f.id,
        trackId: f.trackId,
        icon: f.icon,
        badge: cleanFn(f.badge || ''),
        title: cleanFn(title),
        summary: cleanFn(interpolateSub(f.summary, subLabel)),
        useWebzine: !!f.useWebzine,
        pipeline: (f.pipeline || []).map(function (p) {
          return {
            step: p.step,
            text: cleanFn(interpolateSub(p.text, subLabel))
          };
        })
      };
      built.pills = CONSULT.buildFlowPills(built).map(function (x) { return cleanFn(x.text); });
      return built;
    });
  };

  CONSULT.hasAiAvailable = function (ctx) {
    ctx = ctx || {};
    var cfg = getConfig();
    var pUrl = String(ctx.proxyUrl || cfg.proxyUrl || '').trim();
    if (ctx.mode === 'admin') {
      return !!(cfg.hasDirectKey || pUrl.length >= 8);
    }
    return pUrl.length >= 8;
  };

  // Step 2: 사용자 자유 입력문 스마트 정제({cleanIndustryLabel, extractedGoal}) + 세부 업종 100% 맞춤형 6대 플로우 실시간 AI 생성
  CONSULT.generateSubIndustryFlows = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var rawSub = String(ctx.rawSubIndustry || ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var parsed = CONSULT.sanitizeSubIndustryLabel(rawSub, ctx.sectorId);
    var isPolitics = parsed.isPolitics;
    var cleanFn = isPolitics ? CONSULT.cleanPoliticsText : CONSULT.cleanPartnerText;
    var localFlows = CONSULT.getFlowsForContext(ctx.sectorId, rawSub);

    // 세부 업종이 없거나 AI 미연결이면 즉시 정제 라벨 + 오염 없는 로컬 6대 플로우 반환
    if (!rawSub || !CONSULT.hasAiAvailable(ctx)) {
      return Promise.resolve({
        cleanIndustryLabel: parsed.cleanLabel,
        extractedGoal: parsed.extractedGoal,
        flows: localFlows,
        source: 'local_clean'
      });
    }

    var baseRef = localFlows.map(function (f, i) {
      return (i + 1) + '. [' + f.id + '] ' + f.title;
    }).join('\n');

    var politicsRule = isPolitics
      ? [
          '★ [정치·선거·공공 도메인 특별 가드레일 — 공직선거법 준수 필수]',
          '- 상업 용어("첫 혜택 즉시 발급", "할인 쿠폰", "무료 사은품", "구매 유도", "매출 전환", "브랜드 팬덤", "결제 유도", "특가")를 단 한 글자도 절대 쓰지 마세요!',
          '- 고마워톡 실제 기능(신청페이지 1초 연동, 신청폼 객관식 지역/현안 태그 분기, 간격발송 쇼츠·카드뉴스 연재, 날짜발송 행사 리마인드)에 맞춘 선거·의정 맞춤 6대 흐름으로 구성하세요:',
          '  FLOW_4(지역구·관심 현안별 맞춤 공약 분기형), FLOW_1(개소식·출판기념회·간담회 참석 리마인드형), FLOW_3(주간 현장 행보·유튜브 쇼츠 소식 연재형), FLOW_2(시민 정책 제안·우리 동네 민원 접수형), FLOW_5(자원봉사·서포터즈 참여 안내형), FLOW_6(주요 의정활동·팩트체크 알림형)'
        ].join('\n')
      : '3) 6개 흐름은 FLOW_1(일정·예약 리마인드), FLOW_2(가이드·핵심 자료 발급), FLOW_3(정기 칼럼·소식 연재), FLOW_4(유형 진단 & 맞춤 분기), FLOW_5(열독·참여 포인트 격려), FLOW_6(현장 QR 체크인·통합 안내) 구조를 유지하되 이름과 내용을 100% 해당 업종 현장 용어로 자연스럽게 작성하세요.';

    var sys = [
      '당신은 고마워톡 수석 마케팅·소통 컨설턴트입니다.',
      '사용자가 자유롭게 적은 [원본 입력문]에서 1) 깔끔한 명사형 업종/캠페인 라벨(cleanIndustryLabel, 공백 포함 12자 이내, 서술어·구어체 어미 절대 금지 예: "남양주 시장 후보 캠프", "남양주 카페"), 2) 입력문에 담긴 목표(extractedGoal, 없으면 빈 문자열), 3) 해당 도메인 100% 전용 6가지 카톡 운영 흐름(flows)을 JSON으로 작성하세요.',
      '절대 규칙:',
      '1) 사용자의 구어체 문장("~야", "~목표야", "~하고 싶어")을 카드 제목이나 배지에 기계적으로 이어붙이지 마세요!',
      '2) 타 업종 용어 오염 및 내부 시스템 용어(뜰채, 시트 정수 더하기, 1회차 알림톡, 트랙 번호, ' + TOSS_BANNED_LIT + ') 절대 금지.',
      politicsRule,
      '4) 출력 JSON만: {"cleanIndustryLabel":"12자이내명사","extractedGoal":"목표한문장또는빈문자","flows":[{"id":"FLOW_1","title":"자연스러운한국어제목","badge":"짧은뱃지","pills":["10자내외1","10자내외2","10자내외3"],"summary":"1줄 요약","pipeline":[{"step":"신청페이지","text":"..."},{"step":"즉시 첫 카톡","text":"..."},{"step":"후속 자동 카톡","text":"..."}]}]} (정확히 6개)'
    ].join('\n');

    var user = '[선택 분야] ' + (sec ? sec.title : '기타 업종') +
      '\n[사용자 원본 입력문] ' + rawSub +
      '\n[1차 정제 명사 라벨 참고] ' + parsed.cleanLabel +
      '\n[6개 슬롯 참고]\n' + baseRef +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, responseMimeType: 'application/json',
      temperature: 0.35, maxOutputTokens: 4096
    }).then(function (raw) {
      var obj = extractJson(raw);
      var arr = obj && Array.isArray(obj.flows) ? obj.flows : null;
      var aiLabelRaw = (obj && obj.cleanIndustryLabel) ? String(obj.cleanIndustryLabel).trim() : '';
      var cleanLabel = aiLabelRaw ? CONSULT.sanitizeSubIndustryLabel(aiLabelRaw, ctx.sectorId).cleanLabel : parsed.cleanLabel;
      var extractedGoal = (obj && obj.extractedGoal && String(obj.extractedGoal).trim())
        ? cleanFn(String(obj.extractedGoal).trim())
        : parsed.extractedGoal;

      if (!arr || arr.length < 6) {
        return { cleanIndustryLabel: cleanLabel, extractedGoal: extractedGoal, flows: localFlows, source: 'local_clean' };
      }
      var merged = localFlows.map(function (lf, idx) {
        var af = arr.find(function (x) { return x && x.id === lf.id; }) || arr[idx] || {};
        var pipe = (Array.isArray(af.pipeline) && af.pipeline.length === 3)
          ? af.pipeline.map(function (p, pi) {
              return {
                step: (lf.pipeline[pi] && lf.pipeline[pi].step) || p.step || '',
                text: cleanFn(p.text || (lf.pipeline[pi] && lf.pipeline[pi].text) || '')
              };
            })
          : lf.pipeline;
        var built = {
          id: lf.id,
          trackId: lf.trackId,
          icon: lf.icon,
          badge: cleanFn(af.badge || lf.badge || ''),
          title: cleanFn(af.title || lf.title),
          summary: cleanFn(af.summary || lf.summary),
          useWebzine: lf.useWebzine,
          pipeline: pipe,
          pills: (Array.isArray(af.pills) && af.pills.length === 3)
            ? af.pills.map(function (x) { return cleanFn(tFirst(x, 14)); })
            : null
        };
        built.pills = CONSULT.buildFlowPills(built).map(function (x) { return cleanFn(x.text); });
        return built;
      });
      return {
        cleanIndustryLabel: cleanLabel,
        extractedGoal: extractedGoal,
        flows: merged,
        source: 'ai_realtime'
      };
    }).catch(function () {
      return {
        cleanIndustryLabel: parsed.cleanLabel,
        extractedGoal: parsed.extractedGoal,
        flows: localFlows,
        source: 'local_clean'
      };
    });
  };

  CONSULT.getFlow = function (sectorId, flowId, customFlows, subIndustry) {
    var flows = (Array.isArray(customFlows) && customFlows.length)
      ? customFlows
      : CONSULT.getFlowsForContext(sectorId, subIndustry);
    for (var i = 0; i < flows.length; i++) {
      if (flows[i].id === flowId) return flows[i];
    }
    return flows[0] || null;
  };

  CONSULT.getDefaultColorForSector = function (sectorId, subIndustry) {
    var cat = CONSULT.getCatalog();
    var themes = cat.colorThemes || [];
    var hay = String(subIndustry || '').toLowerCase();
    // 세부 업종 키워드 우선 반영
    if (/산부인과|산후|여성의원|상추|무농약|유기농|농장|채소|과일|산지|식품|건강|교회|봉사|힐링/.test(hay)) {
      return themes.find(function (t) { return t.id === 'forest'; }) || themes[0];
    }
    if (/뷰티|피부|네일|헤어|카페|베이커리|공방|필라테스|요가|디저트|웨딩|스튜디오/.test(hay)) {
      return themes.find(function (t) { return t.id === 'espresso'; }) || themes[2];
    }
    if (/패션|쇼핑몰|의류|코디|코스메틱|리빙|라이프스타일/.test(hay)) {
      return themes.find(function (t) { return t.id === 'burgundy'; }) || themes[4];
    }
    var sec = CONSULT.getSector(sectorId);
    var defId = (sec && sec.defaultColorId) || 'charcoal';
    return themes.find(function (t) { return t.id === defId; }) || themes[0];
  };

  // ── 1) 실시간 고마워톡 매뉴얼 검문소 (로컬 즉시 1차 방어막 — 오프라인/온라인 100% 작동)
  CONSULT.checkFeasibilityLocal = function (userText, opts) {
    opts = opts || {};
    var txt = String(userText || '').trim();
    if (!txt) return { feasible: true };

    // V3.0: Q4/Q5 야간 발송 정책 정밀 검증 (정보성 알림톡은 24시간 허용, 광고 메시지만 20:00~08:00 차단)
    var qNum = Number(opts.qNum) || 0;
    if (qNum === 4 || qNum === 5) {
      var nightCheck = CONSULT.checkNightPolicyForMessage(qNum, txt, opts.time24List);
      if (nightCheck.blocked && nightCheck.guardrail) {
        return {
          feasible: false,
          ruleId: nightCheck.guardrail.ruleId,
          title: nightCheck.guardrail.title,
          reason: nightCheck.guardrail.reason,
          exactMessage: nightCheck.guardrail.exactMessage,
          alternatives: nightCheck.guardrail.alternatives
        };
      }
    }

    var rules = CONSULT.getFeasibilityRules();
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      // 정보성 알림톡은 24시간 발송 가능하므로 night_friendtalk 규칙 적용 제외
      if (rule.id === 'night_friendtalk') {
        var cls = CONSULT.classifyKakaoMessageType(qNum || 4, txt);
        if (cls && cls.allowNight) continue;
      }
      var pats = rule.patterns || [];
      for (var j = 0; j < pats.length; j++) {
        if (pats[j].test(txt)) {
          return {
            feasible: false,
            ruleId: rule.id,
            title: rule.title,
            reason: rule.reason,
            alternatives: (rule.alternatives || []).slice(0, 2)
          };
        }
      }
    }
    return { feasible: true };
  };

  // ── 2) Step 2: AI 최적 운영 플로우 추천 (목표 입력 ➔ 6개 중 1개 + 이유)
  CONSULT.recommendFlow = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var sub = String(ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var flows = (Array.isArray(ctx.customFlows) && ctx.customFlows.length)
      ? ctx.customFlows
      : CONSULT.getFlowsForContext(ctx.sectorId, sub);
    var goal = String(ctx.goalText || '').trim();

    function localPick() {
      var g = goal.toLowerCase();
      var pickId = 'FLOW_2';
      var reason = '신규 고객이 가장 부담 없이 1초 만에 신청하고 바로 혜택을 받아볼 수 있어 첫 캠페인으로 전환율이 가장 높아요.';
      if (/설명회|세미나|웨비나|특강|일정|마감|신고|예약|리마인드|노쇼|행사|오픈런|공구|프리오더|진료|검진/.test(g)) {
        pickId = 'FLOW_1';
        reason = '일정·예약·방문 시점에 맞춰 D-3·D-1 자동 리마인드를 보내면 노쇼를 크게 줄이고 참석·내원율을 끌어올릴 수 있어요.';
      } else if (/진단|유형|분기|맞춤|학년|성향|스타일|취향|증상|사업자|소그룹|분과|체크/.test(g)) {
        pickId = 'FLOW_4';
        reason = '신청할 때 고객의 상황·유형을 객관식으로 먼저 분류해 각자에게 딱 맞는 맞춤 안내를 보내면 상담·예약 전환율이 훨씬 높아져요.';
      } else if (/연재|칼럼|매주|정기|주보|챌린지|팬덤|구독|레시피|소식/.test(g)) {
        pickId = 'FLOW_3';
        reason = '단발성 안내에 그치지 않고 주기적으로 유익한 칼럼·소식을 카톡으로 보내며 신뢰와 단골 팬덤을 차곡차곡 쌓는 데 최적이에요.';
      } else if (/스탬프|적립|포인트|vip|단골|출석|완주|개근|재방문/.test(g)) {
        pickId = 'FLOW_5';
        reason = '열람·방문·참여 횟수를 자동으로 쌓아 열성 고객(VIP)을 선별하고 특별 보상을 주면 재방문과 고가 전환이 자연스럽게 일어나요.';
      } else if (/qr|현장|테이블|로비|택배|박스|체크인|오프라인|대기실/.test(g)) {
        pickId = 'FLOW_6';
        reason = '현장이나 대기실·택배 상자의 QR을 찍는 순간 3초 만에 DB로 모으고 안내서·후속 혜택까지 자동 발송할 수 있어 현장 효율이 가장 좋아요.';
      }
      var found = CONSULT.getFlow(ctx.sectorId, pickId, flows, sub) || flows[0];
      return { flowId: found.id, flowTitle: found.title, reason: reason };
    }

    var flowSummaryList = flows.map(function (f, idx) {
      return (idx + 1) + '. [' + f.id + '] ' + f.title + ' — ' + f.summary;
    }).join('\n');

    var sys = [
      '당신은 고마워톡 수석 마케팅 컨설턴트입니다.',
      '파트너의 분야·세부업종과 목표를 보고 아래 6가지 카톡 운영 흐름 중 가장 잘 맞는 1개를 추천하세요.',
      '내부 전문용어(뜰채, 시트 정수 더하기, 트랙 번호, ' + TOSS_BANNED_LIT + ')는 절대 쓰지 말고 쉬운 일상 언어로 2문장 이내 이유를 쓰세요.',
      '출력 JSON만: {"flowId":"FLOW_1~FLOW_6 중 하나","reason":"친절한 추천 이유 1~2문장"}'
    ].join('\n');

    var user = '[분야] ' + (sec ? sec.title : '') + ' / [세부 업종] ' + sub +
      '\n[파트너 목표] ' + goal +
      '\n\n[6가지 운영 흐름 목록]\n' + flowSummaryList +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, temperature: 0.3, maxOutputTokens: 512
    }).then(function (raw) {
      var obj = extractJson(raw);
      if (!obj || !obj.flowId) return localPick();
      var matched = flows.find(function (f) { return f.id === obj.flowId; });
      if (!matched) return localPick();
      return {
        flowId: matched.id,
        flowTitle: matched.title,
        reason: CONSULT.cleanPartnerText(obj.reason || localPick().reason)
      };
    }).catch(function () {
      return localPick();
    });
  };

  // ── 3) Step 3: 업종·플로우·이전 답변 맥락에 100% 맞춘 살아있는 질문 & Tap-to-Edit 예시 칩 3개 생성
  CONSULT.buildLocalQuestionPack = function (qNum, ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var rawSub = String(ctx.rawSubIndustry || ctx.subIndustry || (sec ? sec.shortTitle : '비즈니스')).trim();
    var parsed = CONSULT.sanitizeSubIndustryLabel(rawSub, ctx.sectorId);
    var sub = String(ctx.subIndustry ? CONSULT.sanitizeSubIndustryLabel(ctx.subIndustry, ctx.sectorId).cleanLabel : parsed.cleanLabel).trim();
    var isPolitics = parsed.isPolitics || CONSULT.isPoliticsDomain(sub);
    var cleanFn = isPolitics ? CONSULT.cleanPoliticsText : CONSULT.cleanPartnerText;

    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, rawSub);
    var flowTitle = flow ? flow.title : '카카오 자동 운영 흐름';
    var A = ctx.answers || {};
    var owner = String(ctx.ownerName || '파트너님').trim();
    var meta = CONSULT.Q_META[qNum - 1] || CONSULT.Q_META[0];
    var subPack = CONSULT.matchSubDomainPack(ctx.sectorId, rawSub) || CONSULT.matchSubDomainPack(ctx.sectorId, sub);
    var batchMap = ctx.customExamplesMap || null;
    var batchChips = (batchMap && Array.isArray(batchMap[qNum]) && batchMap[qNum].length >= 2) ? batchMap[qNum] : null;
    var rawChips = batchChips
      ? batchChips.slice(0, 3)
      : ((subPack && subPack.pack && subPack.pack.examples && subPack.pack.examples[qNum])
        ? subPack.pack.examples[qNum].map(function (x) { return interpolateSub(x, sub); })
        : ((sec && sec.examples && sec.examples[qNum]) ? sec.examples[qNum].slice(0, 3) : []));

    var qText = '';
    var labelText = meta.label;
    var hintText = meta.usageHint;

    if (qNum === 1) {
      qText = (ctx.customQ1Text && String(ctx.customQ1Text).trim())
        ? String(ctx.customQ1Text).trim()
        : (isPolitics
          ? '어떤 지역 유권자를 초대해서 어떤 핵심 공약·소식을 전하는 신청화면을 만들까요?'
          : '누구를 초대해서 어떤 핵심 안내·혜택을 드리는 신청화면을 만들까요?');
    } else if (qNum === 2) {
      qText = isPolitics
        ? '신청할 때 유권자가 클릭해서 고르게 할 질문이 있나요?'
        : '신청할 때 고객이 클릭해서 고르게 할 질문이 있나요?';
    } else if (qNum === 3) {
      qText = '신청 버튼을 누르자마자 1초 만에 도착할 환영·접수확인 카톡에는 어떤 내용을 담을까요?';
    } else if (qNum === 4) {
      qText = '신청한 날을 기준으로, 며칠 간격으로 자동 안부·정보 카톡을 챙겨드릴까요?';
    } else {
      qText = '달력의 특정 날짜와 시간을 콕 찍어 신청자 전원에게 동시에 보낼 카톡이 있나요?';
    }

    return {
      qNum: qNum,
      courseLabel: meta.courseLabel,
      label: labelText,
      tabRef: meta.tabRef || '',
      nextCta: meta.nextCta || '',
      analogyBadge: meta.analogyBadge || '',
      usageHint: hintText,
      questionText: cleanFn(qText),
      exampleChips: rawChips.slice(0, 3).map(function (c) {
        var cleaned = cleanFn(c);
        return qNum === 3 ? sanitizeQ3ExampleChip(cleaned) : cleaned;
      })
    };
  };

  CONSULT.formatConsultAnswers = function (answers) {
    return CONSULT.Q_META.map(function (m) {
      return (answers && answers[m.n]) ? ('Q' + m.n + ' [' + m.label + ']: ' + answers[m.n]) : null;
    }).filter(Boolean).join('\n') || '(아직 입력된 답변 없음)';
  };

  CONSULT.buildGuardrailManualSummary = function () {
    var rules = CONSULT.getFeasibilityRules();
    return rules.map(function (r, idx) {
      return (idx + 1) + ') [불가] ' + r.title + ' → 사유: ' + r.reason +
        ' / 대안: ' + (r.alternatives || []).map(function (a) { return a.label; }).join(' 또는 ');
    }).join('\n');
  };

  // STEP 2 -> STEP 3 전환 시 1회 JSON 호출로 Q1~Q5 전체 맞춤 예시(각 3개, 총 15개) + Q1 질문을 한 번에 동적 생성
  CONSULT.generateConsultExamplesBatch = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var rawSub = String(ctx.rawSubIndustry || ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var parsed = CONSULT.sanitizeSubIndustryLabel(rawSub, ctx.sectorId);
    var sub = String(ctx.subIndustry ? CONSULT.sanitizeSubIndustryLabel(ctx.subIndustry, ctx.sectorId).cleanLabel : parsed.cleanLabel).trim();
    var isPolitics = parsed.isPolitics || CONSULT.isPoliticsDomain(sub);
    var cleanFn = isPolitics ? CONSULT.cleanPoliticsText : CONSULT.cleanPartnerText;
    var extractedGoal = String(ctx.extractedGoal || parsed.extractedGoal || '').trim();
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, rawSub);
    var localMap = {};
    for (var n = 1; n <= CONSULT.TOTAL_Q; n++) {
      localMap[n] = CONSULT.buildLocalQuestionPack(n, ctx).exampleChips;
    }
    var localQ1Text = CONSULT.buildLocalQuestionPack(1, ctx).questionText;

    if (!sub || !CONSULT.hasAiAvailable(ctx)) {
      return Promise.resolve({
        q1QuestionText: localQ1Text,
        examplesMap: localMap,
        source: 'local_clean'
      });
    }

    var politicsRule = isPolitics
      ? [
          '★ [정치·선거·공공 도메인 금기어 규칙 — 공직선거법 준수]',
          '- 상업적 용어("첫 혜택 즉시 발급", "할인 쿠폰", "무료 사은품", "구매 유도", "매출 전환", "브랜드 팬덤", "특가", "할인")는 단 한 글자도 절대 쓰지 마세요.',
          '- q3는 반드시 "핵심 공약 요약집, 개소식·간담회 안내, 의정 보고서, 현안 팩트체크 카드, 비전 쇼츠 영상 링크" 등 합법적 정책·소통 자료로만 작성하세요.'
        ].join('\n')
      : '';

    var sys = [
      '당신은 고마워톡 수석 마케팅·소통 컨설턴트입니다.',
      '사용자가 입력한 [세부 업종]과 [선택 운영 흐름]에 100% 전용으로 맞춘 Q1~Q5 심층 인터뷰 예시 문장 세트(각 질문당 정확히 3개, 총 15개)와 Q1 맞춤 질문 문장을 JSON 하나로 작성하세요.',
      '',
      '[절대 규칙]',
      '1) 타 업종 혼입 100% 절대 금지! 오직 사용자가 입력한 [세부 업종] 현장 용어와 실제 상황만 사용하세요.',
      '2) 내부 시스템 용어(뜰채, 시트 정수 더하기, 1회차 알림톡, 트랙 번호, ' + TOSS_BANNED_LIT + ') 절대 금지.',
      politicsRule,
      '3) 각 예시 문장은 실제 운영자/담당자가 그대로 터치해 약간만 고쳐 쓸 수 있는 현실적인 1인칭 존댓말 문장(35~80자)으로, 3개가 서로 다른 구체적 각도를 제시하도록 쓰세요.',
      '4) 질문별 내용 (고마워톡 5대 탭 1:1 매칭):',
      isPolitics
        ? '   - q1 (① 신청화면): 어떤 지역 유권자를 초대해 어떤 핵심 공약·소식을 전할지'
        : '   - q1 (① 신청화면): 누구를 초대해 어떤 핵심 안내·혜택을 드릴지',
      '   - q2 (② 신청질문): 신청할 때 클릭해서 고르게 할 객관식 질문 1개와 보기 3~4개',
      isPolitics
        ? '   - q3 (③ 첫카톡): 등록 직후 1초 만에 도착할 환영·접수확인 알림톡(핵심 공약 요약·행사 안내·의정 자료, 광고성 단어 및 채널 추가 유도 문구 절대 금지)'
        : '   - q3 (③ 첫카톡): 신청 직후 1초 만에 도착할 순수 정보성 접수확인 알림톡(신청 접수 확인, 일정·장소 안내, 신청 내역 확인 링크 등). 카카오 규정상 "쿠폰", "할인권", "무료 증정권", "할인", "특가", "이벤트" 등 광고성 단어 및 "채널 추가 유도 문구"를 100% 절대 금지! 쿠폰·할인 혜택 예시는 반드시 q4 또는 q5에만 작성하세요.',
      '   - q4 (④ 며칠뒤 자동 · 광고): 신청한 날 기준으로 며칠 간격(1일·3일 / 일주일 / 한 달) 자동 안부·정보·쿠폰/혜택 광고 카톡 내용',
      '   - q5 (⑤ 날짜지정 · 광고): 달력의 특정 날짜·시각(예: 12월 24일 오전 9:30)에 신청자 전원에게 동시 예약 발송할 일정 안내 또는 쿠폰·혜택 광고 내용 (매월·매주 자동 반복 표현 절대 금지)',
      '5) q1QuestionText는 1문장, 친근하고 직관적인 존댓말.',
      '6) 출력은 아래 JSON 객체만 출력하세요:',
      '{"q1QuestionText":"...","q1":["예시1","예시2","예시3"],"q2":["예시1","예시2","예시3"],"q3":["예시1","예시2","예시3"],"q4":["예시1","예시2","예시3"],"q5":["예시1","예시2","예시3"]}'
    ].filter(Boolean).join('\n');

    var user = '[파트너/담당자] ' + (ctx.ownerName || '파트너님') +
      '\n[대분류 분야] ' + (sec ? sec.title : '기타 업종') +
      '\n[정제된 세부 업종 — 15개 예시 전부 오직 이 도메인에만 맞춰 작성] ' + sub +
      (extractedGoal ? ('\n[사용자가 STEP 1에서 밝힌 목표] ' + extractedGoal) : '') +
      '\n[선택 운영 흐름] ' + (flow ? (flow.title + ' — ' + flow.summary) : '') +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, responseMimeType: 'application/json',
      temperature: 0.4, maxOutputTokens: 4096
    }).then(function (raw) {
      var obj = extractJson(raw);
      if (!obj || typeof obj !== 'object') {
        return { q1QuestionText: localQ1Text, examplesMap: localMap, source: 'local_clean' };
      }
      var mergedMap = {};
      var aiFilledCount = 0;
      for (var q = 1; q <= CONSULT.TOTAL_Q; q++) {
        var arr = obj['q' + q] || (obj.examples && (obj.examples[q] || obj.examples[String(q)]));
        if (Array.isArray(arr) && arr.length >= 3) {
          var cleaned = arr.slice(0, 3).map(function (c) {
            var s = cleanFn(String(c || '').trim());
            return q === 3 ? sanitizeQ3ExampleChip(s) : s;
          }).filter(Boolean);
          if (cleaned.length === 3) {
            mergedMap[q] = cleaned;
            aiFilledCount++;
            continue;
          }
        }
        mergedMap[q] = localMap[q];
      }
      return {
        q1QuestionText: obj.q1QuestionText ? cleanFn(obj.q1QuestionText) : localQ1Text,
        examplesMap: mergedMap,
        source: aiFilledCount >= 3 ? 'ai_batch' : 'local_clean'
      };
    }).catch(function () {
      return { q1QuestionText: localQ1Text, examplesMap: localMap, source: 'local_clean' };
    });
  };

  // Q1 시작 시: 미리 받아둔 Q1~Q5 배치가 있으면 즉시 반환, 없으면 1회 배치 호출로 Q1~Q5 전체 생성 후 Q1 반환
  CONSULT.getInitialQ1 = function (ctx) {
    ctx = ctx || {};
    if (ctx.customExamplesMap && Array.isArray(ctx.customExamplesMap[1]) && ctx.customExamplesMap[1].length >= 2) {
      var readyPack = CONSULT.buildLocalQuestionPack(1, ctx);
      readyPack.examplesMap = ctx.customExamplesMap;
      readyPack.source = 'ai_prefetched';
      return Promise.resolve(readyPack);
    }

    return CONSULT.generateConsultExamplesBatch(ctx).then(function (batch) {
      var pack = CONSULT.buildLocalQuestionPack(1, Object.assign({}, ctx, {
        customExamplesMap: batch.examplesMap,
        customQ1Text: batch.q1QuestionText
      }));
      pack.examplesMap = batch.examplesMap;
      pack.q1QuestionText = batch.q1QuestionText;
      pack.source = batch.source;
      return pack;
    });
  };

  // 매 답변 제출 시: ① 고마워톡 매뉴얼 불가능 기능 검증(Feasibility Guardrail) ② 통과 시 다음 맥락 질문 + Tap-to-Edit 예시 칩 3개 생성
  CONSULT.evaluateAndAdvance = function (ctx) {
    ctx = ctx || {};
    var qNum = Number(ctx.qNum) || 1;
    var userText = String(ctx.userText || '').trim();
    var sec = CONSULT.getSector(ctx.sectorId);
    var rawSub = String(ctx.rawSubIndustry || ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var parsed = CONSULT.sanitizeSubIndustryLabel(rawSub, ctx.sectorId);
    var sub = String(ctx.subIndustry ? CONSULT.sanitizeSubIndustryLabel(ctx.subIndustry, ctx.sectorId).cleanLabel : parsed.cleanLabel).trim();
    var isPolitics = parsed.isPolitics || CONSULT.isPoliticsDomain(sub);
    var cleanFn = isPolitics ? CONSULT.cleanPoliticsText : CONSULT.cleanPartnerText;
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, rawSub);

    // ① 1차 하드 가드레일 (로컬 매뉴얼 정규식 + 카카오 야간 20:00~08:00 정밀 검문 — 온라인/오프라인 무관 100% 차단)
    var localCheck = CONSULT.checkFeasibilityLocal(userText, { qNum: qNum, time24List: ctx.time24List });
    if (!localCheck.feasible) {
      return Promise.resolve({
        feasible: false,
        guardrail: {
          ruleId: localCheck.ruleId,
          title: localCheck.title,
          reason: localCheck.reason,
          exactMessage: localCheck.exactMessage || '',
          alternatives: localCheck.alternatives
        }
      });
    }

    var nextAnswers = Object.assign({}, ctx.answers || {});
    nextAnswers[qNum] = userText;
    var isLastQ = qNum >= CONSULT.TOTAL_Q;
    var nextQNum = isLastQ ? CONSULT.TOTAL_Q : (qNum + 1);
    var localNext = isLastQ ? null : CONSULT.buildLocalQuestionPack(nextQNum, Object.assign({}, ctx, { answers: nextAnswers }));

    // 오프라인(키/프록시 미설정) 즉시 진행
    if (!CONSULT.hasAiAvailable(ctx)) {
      return Promise.resolve({
        feasible: true,
        completedInterview: isLastQ,
        ackText: isLastQ ? '5가지 핵심 내용을 아주 잘 정리해 주셨어요! 이제 브랜드 로고와 컬러·사진을 담아볼까요?' : '',
        nextPack: localNext
      });
    }

    // ② 2차 AI 심층 매뉴얼 검문소 + 다음 맥락 질문 & 예시 칩 3개 동적 생성
    var nextMeta = CONSULT.Q_META[nextQNum - 1];
    var politicsLine = isPolitics
      ? '※ [정치·선거 도메인] 상업 용어("첫 혜택 즉시 발급", "할인 쿠폰", "무료 사은품", "구매 유도", "매출 전환", "브랜드 팬덤") 사용을 전면 금지합니다.'
      : '';
    var sys = [
      '당신은 고마워톡(카카오톡 자동화 플랫폼) 수석 컨설턴트입니다.',
      '지금은 파트너의 Q' + qNum + ' 답변을 검토하고, 1) 고마워톡 시스템에서 물리적으로 불가능한 기능이 포함됐는지 먼저 검문한 뒤, 2) 가능할 때만 다음 질문과 예시 칩 3개를 만듭니다.',
      '',
      '[절대 매뉴얼 검문 기준 — 아래 중 하나라도 파트너 답변에 요구되면 반드시 feasible=false로 차단하세요!]',
      CONSULT.buildGuardrailManualSummary(),
      '※ 위 목록 외라도 "실시간 맞춤 영상/음성/이미지 즉석 자동 제작 발송", "카톡방 내 실시간 AI 1:1 자유 채팅 상담", "채널 추가 전 고객 광고 메시지 강제 발송", "알림톡 본문에 할인·특가·쿠폰 또는 채널 추가 유도 문구 기재", "고마워톡 자체 카드결제창/장바구니 내장", "신청폼 내 사진·서류 파일 업로드", "야간(20:00~08:00) 광고 메시지 발송", "한 회차 6개 이상 다중 분기"가 포함되면 절대 통과시키지 마세요!',
      '※ 단, 예약·신청 확인·일정 리마인드 같은 정보성 알림톡은 야간 20시 이후 포함 24시간 언제든 발송 가능하므로 야간 시간이라도 절대 차단하지 마세요!',
      '※ 단, 파트너가 정상적인 목표·고민·자료·안내·상담·예약·기존 링크 연결·객관식 분류 등을 적었다면 반드시 feasible=true로 통과시키세요.',
      '※ exampleChips 3개는 반드시 사용자가 입력한 [세부 업종](' + sub + ')과 직전 답변 맥락에만 100% 맞춰 작성하고, 다른 업종 예시를 단 한 글자도 절대 섞지 마세요.',
      politicsLine,
      '',
      '[응답 JSON 규격]',
      'A) 불가능한 기능 감지 시 (다음 질문으로 절대 넘어가지 않음):',
      '{"feasible":false,"title":"한 줄 요약","reason":"고마워톡에서 지원하지 않는 정확한 사유(파트너님, 고마워톡에서는 [이 부분] 기능은 지원하지 않아요. 에 들어갈 명사구)","alternatives":[{"label":"대안1 제목","detail":"고마워톡 기능으로 구현하는 친절한 설명 1~2문장","draftText":"파트너가 아래 칸에 채워 바로 쓸 수 있는 1인칭 수정 문장"},{"label":"대안2 제목","detail":"대안2 설명 1~2문장","draftText":"대안2 1인칭 수정 문장"}]}',
      '',
      'B) 구현 가능 시 (feasible=true):',
      isLastQ
        ? '{"feasible":true,"completedInterview":true,"ackText":"5가지 답변을 바탕으로 브랜드 스타일 단계로 넘어가는 따뜻한 한 문장"}'
        : ('{"feasible":true,"completedInterview":false,"questionText":"직전 답변을 짧게 공감하며 자연스럽게 이어가는 Q' + nextQNum + '(' + nextMeta.label + ') 맞춤 질문 (2문장 이내, 핵심만 **굵게**, 내부 전문용어 및 ' + TOSS_BANNED_LIT + ' 절대 금지)","exampleChips":["[' + sub + '] 전용 현실적 1인칭 예시1 (40~80자)","[' + sub + '] 전용 예시2","[' + sub + '] 전용 예시3"]}')
    ].filter(Boolean).join('\n');

    var user = '[분야] ' + (sec ? sec.title : '') +
      '\n[세부 업종 — 타 업종 혼입 절대 금지] ' + sub +
      '\n[선택 운영 흐름] ' + (flow ? (flow.title + ' — ' + flow.summary) : '') +
      '\n[지금까지 받은 답변]\n' + CONSULT.formatConsultAnswers(nextAnswers) +
      '\n\n[방금 검토할 Q' + qNum + ' 답변]\n' + userText +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, responseMimeType: 'application/json',
      temperature: 0.35, maxOutputTokens: 3072
    }).then(function (raw) {
      var obj = extractJson(raw);
      if (!obj || typeof obj !== 'object') {
        return { feasible: true, completedInterview: isLastQ, ackText: '', nextPack: localNext };
      }
      if (obj.feasible === false && obj.reason) {
        var alts = Array.isArray(obj.alternatives) ? obj.alternatives.slice(0, 2).map(function (a) {
          return {
            label: cleanFn(a.label || '고마워톡 맞춤 대안'),
            detail: cleanFn(a.detail || ''),
            draftText: cleanFn(a.draftText || a.detail || '')
          };
        }) : [];
        return {
          feasible: false,
          guardrail: {
            ruleId: 'ai_guardrail',
            title: cleanFn(obj.title || '고마워톡 기능 지원 여부 확인'),
            reason: cleanFn(obj.reason),
            alternatives: alts
          }
        };
      }
      if (isLastQ) {
        return {
          feasible: true,
          completedInterview: true,
          ackText: cleanFn(obj.ackText || '모든 핵심 내용을 잘 들었어요! 이제 브랜드 스타일을 담아볼까요?'),
          nextPack: null
        };
      }
      var chips = (Array.isArray(obj.exampleChips) && obj.exampleChips.length >= 3)
        ? obj.exampleChips.slice(0, 3).map(function (c) {
            var s = cleanFn(c);
            return nextQNum === 3 ? sanitizeQ3ExampleChip(s) : s;
          })
        : localNext.exampleChips;
      return {
        feasible: true,
        completedInterview: false,
        nextPack: {
          qNum: nextQNum,
          courseLabel: localNext.courseLabel,
          label: localNext.label,
          tabRef: localNext.tabRef,
          nextCta: localNext.nextCta,
          analogyBadge: localNext.analogyBadge,
          usageHint: localNext.usageHint,
          questionText: localNext.questionText,
          exampleChips: chips
        }
      };
    }).catch(function () {
      return { feasible: true, completedInterview: isLastQ, ackText: '', nextPack: localNext };
    });
  };

  var VIP_CUSTOM_QUOTE_ANSWER = '기본 요금제(Starter · Pro)는 빠른 오픈과 경제적 운영을 위해 핵심 1회차 맞춤 분기와 표준 세팅을 제공합니다. 만약 ① 전 구간 다중 조건 분기(최대 5순위 풀파워 퍼널), ② 고객 선택값에 따라 자동 계산되는 맞춤 견적·진단 프로그램 제작 및 카톡 연동, ③ 자사몰·CRM·외부 DB API 연동 등 고전환 맞춤 개발이 필요하시다면 전문가 별도 견적 프로젝트(300만 원 이상)로 의뢰하실 수 있습니다.';

  function isVipCustomQuoteQuestion(q) {
    return /견적\s*프로그램|API\s*연동|외부\s*DB|자사몰|CRM|풀파워|모든\s*카톡.*다르게|답변별로\s*모든|전\s*구간.*분기|맞춤\s*구축|맞춤구축|별도\s*견적|300만/i.test(String(q || ''));
  }

  // ── 4) 별도 분리된 [💬 고마워톡 기능 가능 여부 물어보기] Q&A 엔진
  CONSULT.VIP_CUSTOM_QUOTE_ANSWER = VIP_CUSTOM_QUOTE_ANSWER;
  CONSULT.isVipCustomQuoteQuestion = isVipCustomQuoteQuestion;

  CONSULT.askFeatureQA = function (questionText, ctx) {
    ctx = ctx || {};
    var q = String(questionText || '').trim();
    if (!q) return Promise.resolve('궁금한 고마워톡 기능이나 요금·규정을 편하게 적어 주세요!');

    if (isVipCustomQuoteQuestion(q)) {
      return Promise.resolve(VIP_CUSTOM_QUOTE_ANSWER);
    }

    var localGuard = CONSULT.checkFeasibilityLocal(q);
    var ragSnippet = searchKnowledge(q, global.GOMAWARTALK_MANUAL || global.GomawartalkManual || []);

    function localAnswer() {
      if (!localGuard.feasible) {
        var altLines = (localGuard.alternatives || []).map(function (a, i) {
          return (i + 1) + ') **' + a.label + '**: ' + a.detail;
        }).join('\n');
        return CONSULT.cleanPartnerText(
          '파트너님, 고마워톡에서는 **' + localGuard.reason + '** 기능은 지원하지 않아요.\n\n대신 이런 방법으로 구현하시면 효과가 아주 좋아요:\n' + altLines
        );
      }
      if (ragSnippet) {
        return CONSULT.cleanPartnerText(ragSnippet.slice(0, 520));
      }
      return '고마워톡은 **카카오 1초 신청 ➔ 즉시 알림톡(1회) ➔ 채널 친구 대상 후속 광고 메시지(이미지형/캐러셀 3회) 및 날짜 예약 발송**을 지원해요. 요금제(Starter 연 24만 / Pro 연 40만), 맞춤 구축, 신청폼 분류, 모바일 웹진 연동 등 궁금한 기능을 물어보시면 바로 안내해 드릴게요!';
    }

    if (!CONSULT.hasAiAvailable(ctx)) {
      return Promise.resolve(localAnswer());
    }

    var sys = [
      '당신은 고마워톡 공식 매뉴얼 기반 친절한 기능 상담원입니다.',
      '아래 [고마워톡 공식 매뉴얼]과 [지원 불가 및 대안 규칙]에만 근거하여 사실대로 정확히 답변하세요.',
      '불가능한 기능이면 먼저 "파트너님, 고마워톡에서는 ~ 기능은 지원하지 않아요."라고 명확히 말한 뒤, 고마워톡에서 가능한 스마트 대안 2가지를 쉽게 알려주세요.',
      '전 구간 다중 분기(풀파워 퍼널), 자동 견적·진단 프로그램 제작, 자사몰·CRM·외부 DB API 연동 문의 시에는 반드시 "전문가 별도 견적 프로젝트(300만 원 이상)" 기준을 안내하세요.',
      '내부 전문용어(뜰채, 시트 정수 더하기, ' + TOSS_BANNED_LIT + ')는 쉬운 일상 언어로 바꿔서 4~6문장 이내로 깔끔하게 답하세요.',
      '',
      '[지원 불가 및 대안 규칙]\n' + CONSULT.buildGuardrailManualSummary(),
      ragSnippet ? ('\n[관련 공식 매뉴얼 발췌]\n' + ragSnippet) : ''
    ].join('\n');

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: '파트너 질문: ' + q, responseMimeType: '',
      temperature: 0.25, maxOutputTokens: 700
    }).then(function (raw) {
      var s = String(raw || '').trim();
      // 혹시 JSON으로 오면 텍스트 추출
      if (s.charAt(0) === '{') {
        var j = extractJson(s);
        s = (j && (j.answer || j.reply || j.text)) || s;
      }
      return CONSULT.cleanPartnerText(s || localAnswer());
    }).catch(function () {
      return localAnswer();
    });
  };

  // ── 5) Step 5: 최종 요약 카드 생성 (고마워톡 5대 탭 1:1 요약)
  CONSULT.localSummary = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, ctx.subIndustry);
    var A = ctx.answers || {};
    var intCfg = ctx.intervalConfig || null;
    var dateRes = ctx.dateReservation || null;
    var q2Txt = String(A[2] || '추가 질문 없이 이름·연락처만 간단히 받기');
    var q4Txt = String(A[4] || (intCfg && intCfg.enabled === false ? '며칠 뒤 자동 카톡은 안 보냄 (건너뛰기)' : (intCfg && intCfg.label ? intCfg.label : '1일 · 3일 뒤 자동 후속 안부 카톡')));
    var dateSlots = (dateRes && Array.isArray(dateRes.slots)) ? dateRes.slots.filter(function (sl) { return sl && sl.date; }).slice(0, 3) : [];
    var q5Fallback = '날짜 지정 카톡은 안 보냄 (건너뛰기)';
    if (dateRes && dateRes.mode !== 'SKIP') {
      if (dateSlots.length > 0) {
        q5Fallback = dateSlots.map(function (sl, idx) {
          var tKo = sl.timeKo || CONSULT.formatTime24ToKo(sl.time24 || '09:00');
          return (idx + 1) + '차: ' + sl.date + ' ' + tKo + (sl.message || sl.message_hint ? (' — ' + (sl.message || sl.message_hint)) : '');
        }).join(' / ');
      } else if (dateRes.date) {
        q5Fallback = dateRes.date + ' ' + (dateRes.timeKo || dateRes.time24 || '') + (dateRes.message_hint ? (' — ' + dateRes.message_hint) : '');
      }
    }
    var q5Txt = String(A[5] || q5Fallback);
    var flowTxt = [q4Txt, q5Txt].filter(Boolean).join(' / ');
    return {
      sectorLine: (sec ? (sec.icon + ' ' + sec.title) : '') + (ctx.subIndustry ? (' · ' + ctx.subIndustry) : ''),
      flowTitle: flow ? flow.title : '맞춤 카카오 운영 흐름',
      goalTopic: tFirst(A[1] || ctx.subIndustry || '맞춤 신청화면', 75),
      formQ: tFirst(q2Txt, 80),
      targetPain: tFirst(q2Txt, 80),
      firstGift: tFirst(A[3] || '신청 즉시 발송되는 환영·접수확인 카톡', 75),
      intervalAuto: tFirst(q4Txt, 80),
      trustProof: tFirst(q4Txt, 80),
      dateReserve: tFirst(q5Txt, 80),
      formAndFlow: tFirst(flowTxt, 80),
      useWebzine: flow ? !!flow.useWebzine : /연재|칼럼|챌린지|웹진|주보/.test(flowTxt)
    };
  };

  CONSULT.summarize = function (ctx, revisionText) {
    var local = CONSULT.localSummary(ctx);
    if (!CONSULT.hasAiAvailable(ctx)) {
      if (revisionText) {
        local.goalTopic = tFirst(local.goalTopic + ' · ' + revisionText, 85);
      }
      return Promise.resolve(local);
    }

    var sys = [
      '당신은 고마워톡 마케팅 컨설턴트입니다. 파트너님의 분야·선택 흐름·5단계 답변(① 신청화면 ② 신청질문 ③ 첫카톡 ④ 며칠뒤 자동 ⑤ 날짜지정)을 모바일 최종 확인 카드용으로 깔끔히 요약하세요.',
      '내부 전문용어(뜰채, 시트 정수 더하기, ' + TOSS_BANNED_LIT + ')는 절대 쓰지 말고 쉬운 일상 언어로 각 항목을 50~80자 이내로 정리하세요.',
      '출력 JSON만: {"goalTopic":"① 신청화면 요약","formQ":"② 신청질문 요약","firstGift":"③ 첫카톡 요약","intervalAuto":"④ 며칠뒤 자동 요약","dateReserve":"⑤ 날짜지정 요약","useWebzine":true}'
    ].join('\n');

    var user = '[분야/세부업종] ' + local.sectorLine +
      '\n[선택 운영 흐름] ' + local.flowTitle +
      '\n[5단계 답변]\n' + CONSULT.formatConsultAnswers(ctx.answers) +
      (ctx.notes && ctx.notes.length ? ('\n[수정 메모]\n' + ctx.notes.join('\n')) : '') +
      (revisionText ? ('\n[방금 요청한 수정 사항 — 반드시 반영]\n' + revisionText) : '') +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, temperature: 0.3, maxOutputTokens: 1024
    }).then(function (raw) {
      var o = extractJson(raw);
      if (!o || !o.goalTopic) return local;
      var formQVal = CONSULT.cleanPartnerText(o.formQ || o.targetPain || local.formQ);
      var intVal = CONSULT.cleanPartnerText(o.intervalAuto || o.trustProof || local.intervalAuto);
      var dateVal = CONSULT.cleanPartnerText(o.dateReserve || o.formAndFlow || local.dateReserve);
      return {
        sectorLine: local.sectorLine,
        flowTitle: local.flowTitle,
        goalTopic: CONSULT.cleanPartnerText(o.goalTopic),
        formQ: formQVal,
        targetPain: formQVal,
        firstGift: CONSULT.cleanPartnerText(o.firstGift || local.firstGift),
        intervalAuto: intVal,
        trustProof: intVal,
        dateReserve: dateVal,
        formAndFlow: dateVal,
        useWebzine: typeof o.useWebzine === 'boolean' ? o.useWebzine : local.useWebzine
      };
    }).catch(function () {
      return local;
    });
  };

  // ── 6) 100% 제로베이스 CampaignMaster.json V2.0 생성 + 5대 탭 스케줄(간격·날짜지정) & 브랜드 에셋 연동
  CONSULT.assembleCampaign = function (aiJson, ctx) {
    ctx = ctx || {};
    var A = ctx.answers || {};
    var partner = ctx.partner || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, ctx.subIndustry);
    var brand = ctx.brandAssets || {};
    var photos = Array.isArray(brand.photos) ? brand.photos.filter(Boolean).slice(0, 3) : [];
    var photoMode = (brand.photoMode === 'ai_auto' || !photos.length) ? 'ai_auto' : 'uploaded';

    // Q4(간격발송) / Q5(날짜지정) 구조화 데이터 정규화 (미전달 시 답변 텍스트에서 스마트 추론)
    var rawInt = ctx.intervalConfig || null;
    var rawDate = ctx.dateReservation || null;
    var q2Skipped = !!(ctx.skipFormQuestion || /추가\s*질문\s*없이|이름[·,\s]*연락처만/.test(String(A[2] || '')));

    var q4SkipText = /안\s*보냄|건너뛰기|없어요|미사용/.test(String(A[4] || ''));
    var intervalConfig = rawInt ? Object.assign({}, rawInt) : null;
    if (!intervalConfig) {
      var parsed4 = CONSULT.autoTossScheduleHints(String(A[4] || ''));
      if (q4SkipText) {
        intervalConfig = { enabled: false, preset: 'SKIP', label: '건너뛰기 (안 보냄)', days: [], message_hint: '' };
      } else if (parsed4.interval) {
        intervalConfig = {
          enabled: true,
          preset: parsed4.interval.preset,
          label: parsed4.interval.label,
          days: parsed4.interval.days,
          message_hint: String(A[4] || parsed4.interval.message_hint || '')
        };
      } else {
        intervalConfig = {
          enabled: true,
          preset: 'D1_D3',
          label: '1일 · 3일 뒤 연속 챙기기',
          days: [1, 3],
          message_hint: String(A[4] || '')
        };
      }
    }

    var q5SkipText = /없어요|건너뛰기|안\s*보냄|미사용/.test(String(A[5] || ''));
    var dateReservation = rawDate ? Object.assign({}, rawDate) : null;
    if (!dateReservation) {
      var parsed5 = CONSULT.autoTossScheduleHints(String(A[5] || ''));
      if (q5SkipText) {
        dateReservation = { mode: 'SKIP', date: '', time24: '', timeKo: '', message_hint: '', slots: [] };
      } else if (parsed5.dateReservation) {
        dateReservation = Object.assign({}, parsed5.dateReservation);
      } else {
        dateReservation = { mode: 'SKIP', date: '', time24: '', timeKo: '', message_hint: '', slots: [] };
      }
    }
    var normalizedSlots = [];
    if (dateReservation.mode !== 'SKIP') {
      if (Array.isArray(dateReservation.slots) && dateReservation.slots.length > 0) {
        normalizedSlots = dateReservation.slots.filter(function (sl) { return sl && sl.date; }).slice(0, 3).map(function (sl) {
          var t24 = sl.time24 || '09:00';
          var tKo = sl.timeKo || CONSULT.formatTime24ToKo(t24);
          var msg = String(sl.message || sl.message_hint || dateReservation.message_hint || '').trim();
          return {
            date: String(sl.date),
            time24: t24,
            timeKo: tKo,
            message: msg,
            message_hint: msg
          };
        });
      } else if (dateReservation.date) {
        var singleT24 = dateReservation.time24 || '09:00';
        var singleTKo = dateReservation.timeKo || CONSULT.formatTime24ToKo(singleT24);
        var singleMsg = String(dateReservation.message_hint || '').trim();
        normalizedSlots = [{
          date: String(dateReservation.date),
          time24: singleT24,
          timeKo: singleTKo,
          message: singleMsg,
          message_hint: singleMsg
        }];
      }
    }
    if (normalizedSlots.length > 0) {
      dateReservation.mode = 'ONCE';
      dateReservation.date = normalizedSlots[0].date;
      dateReservation.time24 = normalizedSlots[0].time24;
      dateReservation.timeKo = normalizedSlots[0].timeKo;
      dateReservation.message_hint = normalizedSlots[0].message_hint || dateReservation.message_hint || '';
      dateReservation.slots = normalizedSlots;
    } else {
      dateReservation.mode = 'SKIP';
      dateReservation.date = '';
      dateReservation.time24 = '';
      dateReservation.timeKo = '';
      dateReservation.slots = [];
    }

    // 기존 TOSS.assembleCampaign의 탄탄한 구조 조립기를 재활용하되 5대 탭 답변으로 매핑
    var mappedAnswers = {
      1: A[1] || ctx.subIndustry || (sec ? sec.title : '맞춤 캠페인'),
      2: A[1] || (ctx.subIndustry ? ctx.subIndustry + ' 핵심 고객' : '핵심 타겟 고객'),
      3: '신뢰감 있고 친근한 존댓말',
      4: A[1] || '현실적인 핵심 고민',
      5: A[3] || '신청 즉시 발송되는 환영·접수확인 카톡',
      6: ctx.subIndustry || '검증된 전문성 및 신뢰 안내',
      7: q2Skipped ? '' : (A[2] || '현재 어떤 항목이 가장 궁금하신가요?'),
      8: [flow ? flow.title : '', A[4], A[5]].filter(Boolean).join(' — ')
    };

    var resolvedBrandName = String(ctx.brandName || brand.brandName || partner.businessName || partner.channel_name || '').trim();
    if (/(?:\uB300\uD45C\uB2D8|\uC0AC\uC7A5\uB2D8|\uD30C\uD2B8\uB108\uB2D8)\s*$/.test(resolvedBrandName)) resolvedBrandName = '';
    var presetCadenceHint = intervalConfig.preset === 'MONTHLY_30D'
      ? 'AFTER_1_MONTH 매월 정기 발송'
      : (intervalConfig.preset === 'WEEKLY_7D' ? 'AFTER_7_DAYS 매주 정기 발송' : '');
    var cadenceSeed = [
      presetCadenceHint,
      ctx.subIndustry,
      flow ? flow.title : '',
      flow ? flow.summary : '',
      A[1], A[2], A[3], A[4], A[5]
    ].filter(Boolean).join(' ');
    var consultPromoOffer = extractPromoOfferFromAnswers(A);
    var master = TOSS.assembleCampaign(aiJson, mappedAnswers, partner, {
      brandName: resolvedBrandName || ctx.subIndustry || '',
      cadenceSeed: cadenceSeed,
      promoOffer: consultPromoOffer
    });

    // 입력된 상호명·브랜드명 최우선 바인딩 (meta.brand_name, partner_info.channel_name, tab1_basic_settings.channel_name)
    var finalBrand = resolvedBrandName || ctx.subIndustry || master.partner_info.channel_name || '맞춤 브랜드';
    master.meta.brand_name = finalBrand;
    master.partner_info.channel_name = finalBrand;
    if (master.tab1_basic_settings) {
      master.tab1_basic_settings.channel_name = finalBrand;
    }

    // V2.7: Q2(신청질문 건너뛰기) & Q4(간격발송) & Q5(날짜지정) 구조화 데이터 저장
    master.meta.schedule_config = {
      skip_form_question: q2Skipped,
      interval_config: {
        enabled: intervalConfig.enabled !== false && intervalConfig.preset !== 'SKIP',
        preset: intervalConfig.preset || 'D1_D3',
        label: intervalConfig.label || '',
        days: Array.isArray(intervalConfig.days) ? intervalConfig.days.slice() : [],
        message_hint: String(intervalConfig.message_hint || '')
      },
      date_reservation: {
        mode: dateReservation.mode || 'SKIP',
        date: String(dateReservation.date || ''),
        time24: String(dateReservation.time24 || ''),
        timeKo: String(dateReservation.timeKo || ''),
        message_hint: String(dateReservation.message_hint || ''),
        slots: Array.isArray(dateReservation.slots) ? dateReservation.slots.slice(0, 3) : []
      }
    };

    if (master.tab3_application_form) {
      master.tab3_application_form.skip_custom_question = q2Skipped;
    }

    if (master.tab4_interval_messages) {
      master.tab4_interval_messages.enabled = master.meta.schedule_config.interval_config.enabled;
      master.tab4_interval_messages.interval_config = master.meta.schedule_config.interval_config;
      if (intervalConfig.preset === 'MONTHLY_30D') {
        master.tab4_interval_messages.cadence_type = 'MONTHLY';
        master.tab4_interval_messages.cadence_label = '한 달(30일)마다 정기 발송';
      } else if (intervalConfig.preset === 'WEEKLY_7D') {
        master.tab4_interval_messages.cadence_type = 'WEEKLY';
        master.tab4_interval_messages.cadence_label = '일주일(7일)마다 정기 발송';
      }
    }

    var dr = master.meta.schedule_config.date_reservation;
    if (dr.mode === 'ONCE' && Array.isArray(dr.slots) && dr.slots.length > 0) {
      var seqLastBranch = (master.tab4_interval_messages && master.tab4_interval_messages.sequence && master.tab4_interval_messages.sequence.length)
        ? master.tab4_interval_messages.sequence[master.tab4_interval_messages.sequence.length - 1].branches[0]
        : {};
      master.tab5_date_messages = dr.slots.slice(0, 3).map(function (sl, sIdx) {
        var slTime24 = sl.time24 || '09:00';
        var slTimeKo = sl.timeKo || CONSULT.formatTime24ToKo(slTime24);
        var slHint = sl.message || sl.message_hint || (finalBrand + ' 지정 일정 안내');
        var slClass = CONSULT.classifyKakaoMessageType(5, slHint);
        var slTemplateType = (slClass && slClass.type === 'ALIMTALK_INFO') ? 'ALIMTALK' : 'FREE_FRIENDTALK';
        var slBody = slTemplateType === 'ALIMTALK'
          ? stripAlimtalkChannelAddSolicitation('#{이름}님, 안내드린 일정이 다가왔습니다.\n' + slHint)
          : ('#{이름}님, 안내드린 일정이 다가왔습니다! ' + slHint);
        var slBranch = Object.assign({}, seqLastBranch, {
          condition_desc: '전체 신청자 동시 발송',
          body_text_400chars: slBody,
          image_copy: {
            badge: sl.date + ' ' + slTimeKo + ' 정각 예약',
            headline: tFirst(slHint, 30),
            subtext: finalBrand + ' 공식 안내'
          }
        });
        return {
          quick_single_mode: false,
          slot_index: sIdx + 1,
          mode: 'ONCE',
          send_date: sl.date,
          send_time: slTime24,
          send_time_ko: slTimeKo,
          send_datetime: sl.date + ' ' + slTime24,
          title: tFirst(slHint, 28),
          message_hint: slHint,
          template_type: slTemplateType,
          message_category: slClass ? slClass.type : 'ALIMTALK_INFO',
          branches: [slBranch]
        };
      });
    } else if (rawDate && rawDate.mode === 'SKIP') {
      master.tab5_date_messages = [];
    }

    // V3.0 알림톡 1 : 광고 3 황금 비율 보장 (Q5 생략 시에도 후속 광고 3회차 자동 보강)
    var seqArr = (master.tab4_interval_messages && Array.isArray(master.tab4_interval_messages.sequence))
      ? master.tab4_interval_messages.sequence
      : [];
    var hasDateAds = Array.isArray(master.tab5_date_messages) && master.tab5_date_messages.length > 0;
    if (master.meta.schedule_config.interval_config.enabled && !hasDateAds && seqArr.length === 3) {
      var cadFor4 = detectCampaignCadence(cadenceSeed);
      var cad4 = cadFor4.step4 || cadFor4.step3;
      var vid4 = detectVideoMedia(cadenceSeed);
      var prevAd = seqArr[1] && seqArr[1].branches && seqArr[1].branches[0] ? seqArr[1].branches[0] : {};
      var baseUrl4 = (master.meta && master.meta.webzine_base_url) || 'https://gomawartalk.com';
      seqArr.push({
        step: 4,
        timing: cad4.timing,
        step_short_label: cad4.shortLabel,
        timewarp_badge: cad4.badge || '',
        timewarp_sub: cad4.sub || '',
        chat_date_offset_days: cad4.chatDateOffsetDays,
        send_time_label: cad4.sendTimeLabel,
        media_preview: vid4.isVideo ? { type: 'YOUTUBE', badge: vid4.badge, duration: '05:10', title: tFirst(finalBrand + ' 후속 안내 영상', 34), url: vid4.defaultUrl } : null,
        template_type: 'FREE_FRIENDTALK',
        template_id: TOSS_TEMPLATE_ID,
        has_spotlight_branch: false,
        branch_pair: null,
        branches: [{
          priority: 1,
          condition_desc: '모두 (전체 신청자)',
          template_id: TOSS_TEMPLATE_ID,
          variables: prevAd.variables || { '콘텐츠 제목': finalBrand + ' 최종 안내', '콘텐츠 소개': '' },
          sheet_fallback_strings: prevAd.sheet_fallback_strings || {},
          image_ratio: '800x400',
          image_copy: {
            badge: cad4.shortLabel + ' · 채널 친구 전용',
            headline: tFirst(finalBrand + ' 최종 혜택 · 상담 안내', 30),
            subtext: '놓치기 전 바로 확인해 보세요'
          },
          media_preview: vid4.isVideo ? { type: 'YOUTUBE', badge: vid4.badge, duration: '05:10', title: tFirst(finalBrand + ' 후속 안내 영상', 34), url: vid4.defaultUrl } : null,
          body_text_400chars: '#{이름}님! ' + finalBrand + '에서 준비한 채널 친구 전용 마지막 안내를 보내드려요. 궁금하신 점이나 예약·상담이 필요하시면 아래 버튼으로 편하게 이어가세요.',
          buttons: vid4.isVideo
            ? [{ name: vid4.buttonLabel, link_type: 'WL', youtube_app: true, webzine_anchor: '#sec-cta', url: vid4.defaultUrl }]
            : [{ name: '최종 혜택 확인하기', link_type: 'WL', webzine_anchor: '#sec-cta', url: baseUrl4 + '#sec-cta' }],
          cards_800x600: prevAd.cards_800x600 || []
        }]
      });
    }
    var adCountTotal = seqArr.filter(function (s, i) { return i > 0 && s && s.template_type !== 'ALIMTALK'; }).length +
      (Array.isArray(master.tab5_date_messages) ? master.tab5_date_messages.length : 0);
    master.meta.message_ratio = {
      alimtalk: 1,
      ad: 3,
      total_ads: Math.max(3, adCountTotal),
      label: '알림톡 1 : 광고 3'
    };

    // Part 2: 모선(Mother-Hub) 외부 플랫폼 확장 소켓 3종 (기본 본체 NATIVE)
    master.source_platform = (ctx.sourcePlatform && String(ctx.sourcePlatform).trim()) || 'NATIVE';
    master.credit_balance = (ctx.creditBalance !== undefined) ? ctx.creditBalance : null;
    master.external_mapping = (ctx.externalMapping !== undefined) ? ctx.externalMapping : null;

    // Part 1: Q&A 대화 중 파트너가 [📌 이번 설계에 반영]으로 고정한 요청 기록
    master.pinned_consult_notes = Array.isArray(ctx.pinnedConsultNotes)
      ? ctx.pinnedConsultNotes.map(function (item) {
          return typeof item === 'string' ? item.trim() : (item && item.text ? String(item.text).trim() : '');
        }).filter(Boolean)
      : [];

    // 메타 & 파트너 정보 강화 (V2.3: 텍스트 5대 탭 JSON 전용 생성 — 인터뷰 단계 이미지 생성 보류)
    var skipImageGen = ctx.skipImageGen !== false;
    master.meta.source = 'partner_bot_consult5';
    master.meta.skip_image_gen = skipImageGen;
    master.meta.generation_mode = skipImageGen ? 'TEXT_ONLY_5TABS' : 'FULL_WITH_VISUALS';
    master.meta.auto_generate_visuals = !skipImageGen;
    if (ctx.summary && typeof ctx.summary.useWebzine === 'boolean') {
      master.meta.use_webzine = ctx.summary.useWebzine;
    } else if (flow && typeof flow.useWebzine === 'boolean') {
      master.meta.use_webzine = flow.useWebzine;
    }

    master.partner_info.kakao_user_id = partner.kakao_user_id || '';
    master.partner_info.tier = partner.tier || '가망고객';
    master.partner_info.current_plan = (partner.tier === 'Pro') ? 'PRO' : (partner.tier === 'Starter' ? 'STARTER' : 'LEAD');
    master.partner_info.sector_id = ctx.sectorId || '';
    master.partner_info.sector_label = sec ? sec.title : '';
    master.partner_info.sub_industry = ctx.subIndustry || '';
    master.partner_info.flow_id = flow ? flow.id : '';
    master.partner_info.flow_title = flow ? flow.title : '';
    master.partner_info.track_id = flow ? flow.trackId : '';
    master.partner_info.industry_code = 'custom_ai';

    // Step 4 브랜드 컬러 / 로고 / 실사 사진 정확히 주입
    var defColor = CONSULT.getDefaultColorForSector(ctx.sectorId, ctx.subIndustry || A[1]);
    var primary = brand.primaryColor || (defColor && defColor.primary) || '#182232';
    var secondary = brand.secondaryColor || (defColor && defColor.secondary) || '#F6F7F9';

    master.brand_assets.primary_color = primary;
    master.brand_assets.secondary_color = secondary;
    master.brand_assets.color_theme_id = brand.colorThemeId || (defColor && defColor.id) || 'charcoal';
    master.brand_assets.color_theme_label = brand.colorThemeLabel || (defColor && defColor.label) || '';
    master.brand_assets.logo_base64 = brand.logoBase64 || null;
    master.brand_assets.logo_mode = brand.logoBase64 ? 'image' : (brand.logoMode || 'text_auto');
    master.brand_assets.photo_mode = photoMode;
    master.brand_assets.partner_photos = photos.slice();
    master.tab2_landing_content.bg_color = secondary;

    // ★ 파트너 첨부 실사 우선 배치 규칙:
    //   사진 1 -> 1단 Hero 비주얼 슬롯(및 탭 1 썸네일 비주얼)
    //   사진 2 -> 3단 Solution 비주얼 슬롯
    //   사진 3 -> 4단 Trust 비주얼 슬롯
    //   비어 있는 슬롯(또는 ai_auto 선택 시)은 visual_image = null로 두어 조종석에서 AI 자동 생성!
    var blocks = master.tab2_landing_content.blocks_1000px || [];
    if (photoMode === 'uploaded' && photos.length > 0) {
      if (photos[0]) {
        master.tab1_basic_settings.thumbnail_500x280.visual_image = photos[0];
        master.tab1_basic_settings.thumbnail_500x280.visual_source = 'partner_upload';
        if (blocks[0]) { blocks[0].visual_image = photos[0]; blocks[0].visual_source = 'partner_upload'; }
      }
      if (photos[1] && blocks[2]) {
        blocks[2].visual_image = photos[1];
        blocks[2].visual_source = 'partner_upload';
      }
      if (photos[2] && blocks[3]) {
        blocks[3].visual_image = photos[2];
        blocks[3].visual_source = 'partner_upload';
      }
    } else {
      master.tab1_basic_settings.thumbnail_500x280.visual_image = null;
      [0, 2, 3].forEach(function (idx) {
        if (blocks[idx]) blocks[idx].visual_image = null;
      });
    }

    // V2.8.2/V3.1: 최종 Q2(설문 유무) · Q4(간격발송 활성) · Q5(날짜지정 슬롯) 기준으로 캠페인당 단 1개 핵심 회차에만 원포인트 맞춤 분기 적용 + 쿠폰/혜택 100% 반영
    applyOnePointSpotlightBranch(master, {
      topic: A[1] || ctx.subIndustry || finalBrand,
      videoInfo: detectVideoMedia(cadenceSeed),
      promoOffer: consultPromoOffer
    });

    return sanitizeObject(master);
  };

  CONSULT.generateCampaign = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, ctx.subIndustry);
    var A = ctx.answers || {};

    var mappedAnswers = {
      1: '[' + (sec ? sec.shortTitle : '') + ' · ' + (ctx.subIndustry || '') + '] ' + (A[1] || ''),
      2: A[1] || '',
      3: '신뢰감 있고 친근한 존댓말',
      4: A[1] || '',
      5: A[3] || '',
      6: ctx.subIndustry || '',
      7: ctx.skipFormQuestion ? '' : (A[2] || ''),
      8: [flow ? (flow.title + ' (' + flow.summary + ')') : '', A[4], A[5]].filter(Boolean).join(' — ')
    };

    var pinnedList = Array.isArray(ctx.pinnedConsultNotes)
      ? ctx.pinnedConsultNotes.map(function (item) {
          return typeof item === 'string' ? item.trim() : (item && item.text ? String(item.text).trim() : '');
        }).filter(Boolean)
      : [];

    var genNotes = (ctx.notes || []).concat([
      '선택 분야: ' + (sec ? sec.title : '') + ' / 세부 업종: ' + (ctx.subIndustry || ''),
      '선택 운영 흐름: ' + (flow ? flow.title : '')
    ]);
    if (pinnedList.length) {
      genNotes.push('📌 파트너가 Q&A에서 이번 설계에 반영해 달라고 고정한 요청: ' + pinnedList.join(' / '));
    }

    var p = TOSS.buildGenerationPrompt({
      answers: mappedAnswers,
      notes: genNotes,
      summary: ctx.summary
    });

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: p.system, user: p.user, temperature: 0.55, maxOutputTokens: 8192
    }).then(function (raw) {
      var obj = extractJson(raw);
      if (!obj) throw new Error('AI 제작 결과를 읽지 못했어요.');
      return CONSULT.assembleCampaign(obj, ctx);
    });
  };

  // 정적 헬퍼 노출
  RagInterviewEngine.DEFAULT_MODEL = DEFAULT_MODEL;
  RagInterviewEngine.DEFAULT_PROXY_URL = DEFAULT_PROXY_URL;
  RagInterviewEngine.getConfig = getConfig;
  RagInterviewEngine.saveConfig = saveConfig;
  RagInterviewEngine.saveBridgeCampaign = saveBridgeCampaign;
  RagInterviewEngine.getBridgeCampaign = getBridgeCampaign;
  RagInterviewEngine.discoverActiveModels = discoverActiveModels;
  RagInterviewEngine.detectSmartEditorialTheme = detectSmartEditorialTheme;
  RagInterviewEngine.detectCampaignCadence = detectCampaignCadence;
  RagInterviewEngine.detectVideoMedia = detectVideoMedia;
  RagInterviewEngine.isMechanicalBranchCopy = isMechanicalBranchCopy;
  RagInterviewEngine.buildSpotlightBranchPair = buildSpotlightBranchPair;
  RagInterviewEngine.applyOnePointSpotlightBranch = applyOnePointSpotlightBranch;
  RagInterviewEngine.parseSurveyQuestionFromAnswer = parseSurveyQuestionFromAnswer;
  RagInterviewEngine.extractSurveyOptionsFromText = extractSurveyOptionsFromText;
  RagInterviewEngine.convertPartnerNarrativeToCustomerQuestion = convertPartnerNarrativeToCustomerQuestion;
  RagInterviewEngine.extractPromoOfferFromAnswers = extractPromoOfferFromAnswers;
  RagInterviewEngine.stripAlimtalkPromoCopy = stripAlimtalkPromoCopy;
  RagInterviewEngine.sanitizeQ3ExampleChip = sanitizeQ3ExampleChip;
  RagInterviewEngine.autoTossScheduleHints = CONSULT.autoTossScheduleHints;
  RagInterviewEngine.callGemini = callGemini;
  RagInterviewEngine.generateImage = generateImage;
  RagInterviewEngine.translateKoreanToImagePrompt = translateKoreanToImagePrompt;
  RagInterviewEngine.buildEnglishImagePrompt = buildEnglishImagePrompt;
  RagInterviewEngine.ensureImagePromptSuffix = ensureImagePromptSuffix;
  RagInterviewEngine.extractJson = extractJson;
  RagInterviewEngine.sanitizeText = sanitizeText;
  RagInterviewEngine.sanitizeObject = sanitizeObject;
  RagInterviewEngine.detectQuestionIntent = detectQuestionIntent;
  RagInterviewEngine.searchKnowledge = searchKnowledge;
  RagInterviewEngine.normalizePhone = TOSS.normalizePhone;
  RagInterviewEngine.Toss = TOSS;
  RagInterviewEngine.Consult = CONSULT;

  global.RagInterviewEngine = RagInterviewEngine;
})(typeof window !== 'undefined' ? window : this);
