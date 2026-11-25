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
  var BANNED_RE = new RegExp('\\uB274\\uC2A4\\uB808\\uD130', 'g');
  var CACHED_DISCOVERED_MODELS = null;

  // ─────────────────────────────────────────────────────────────
  // 1. 공유 설정 & 브릿지 스토리지 (InterviewBot <-> LandingBuilder)
  // ─────────────────────────────────────────────────────────────
  function getConfig() {
    var apiKey = '', model = DEFAULT_MODEL, proxyUrl = '';
    try {
      apiKey = (localStorage.getItem(STORAGE_KEYS.API_KEY) || '').trim();
      var savedModel = (localStorage.getItem(STORAGE_KEYS.MODEL) || '').trim();
      // 구형 모델명이 localStorage에 남아 있으면 자동으로 gemini-3.8-flash로 마이그레이션
      if (!savedModel || /^gemini-[12]\./i.test(savedModel)) {
        model = DEFAULT_MODEL;
      } else {
        model = savedModel;
      }
      proxyUrl = (localStorage.getItem(STORAGE_KEYS.PROXY_URL) || localStorage.getItem(STORAGE_KEYS.LEGACY_PROXY) || '').trim();
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
  // 2. 금지어 정화 & JSON 안전 추출기
  // ─────────────────────────────────────────────────────────────
  function sanitizeText(str) {
    return String(str == null ? '' : str).replace(BANNED_RE, '정기 칼럼·소식');
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
      /알림톡\s*규정|친구톡\s*차이|뜰채|시트\s*변수|야간\s*제한|미친추|브랜드메시지/
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
        var text = parts.map(function (p) { return p.text || ''; }).join('');
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
      case 5: return ['핵심 요약 PDF 자료', '무료 체험·상담 초대', '체크리스트·워크시트', '할인 쿠폰'];
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
      '당신은 고마워톡 파트너(소상공인·강사·전문가) 대표님이 카카오 신청 캠페인을 만들 수 있도록 돕는 다정한 마케팅 도우미입니다.',
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
      '[파트너] ' + (ctx.partnerName || '대표님'),
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
    return fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script CORS 사전요청(preflight) 회피
      body: JSON.stringify(body)
    }).then(function (res) {
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
    });
  };

  // AI 호출 라우터: admin → 로컬 Gemini 키 직결 / partner → Backend_Proxy(파트너 토큰 필수)
  TOSS.callAI = function (o) {
    o = o || {};
    if (o.mode === 'admin') {
      var cfg = getConfig();
      if (!cfg.hasDirectKey) {
        var ne = new Error('NO_LOCAL_KEY'); ne.code = 'NO_LOCAL_KEY';
        return Promise.reject(ne);
      }
      return callGemini({
        apiKey: cfg.apiKey,
        systemInstruction: o.system,
        userText: o.user,
        responseMimeType: 'application/json',
        temperature: o.temperature !== undefined ? o.temperature : 0.4,
        maxOutputTokens: o.maxOutputTokens || 2048,
        thinkingBudget: 0
      });
    }
    return TOSS.postProxy(o.proxyUrl, {
      action: 'chat',
      partnerToken: o.token || '',
      systemPrompt: o.system,
      userText: o.user,
      temperature: o.temperature !== undefined ? o.temperature : 0.4,
      maxOutputTokens: o.maxOutputTokens || 2048
    }).then(function (d) { return sanitizeText(d.reply || d.text || ''); });
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
      '당신은 고마워톡 마케팅 도우미입니다. 대표님의 8가지 답변을 모바일에서 한눈에 보이는 기획 요약으로 정리하세요.',
      '각 항목은 40자 이내의 쉬운 일상 언어로 쓰고, 전문용어(' + ['1회차 알림톡', '미끼 자료', '뜰채 분기', '청사진', '제로베이스', '웹진 앵커', TOSS_BANNED_LIT].join(', ') + ')는 쓰지 마세요.',
      '출력 JSON: {"target":"","concept":"핵심 카피 컨셉 한 줄(60자 이내)","gift":"첫 무료 혜택","questions":["신청할 때 물어볼 질문1","질문2"],"flow":"카톡 소식 이어가는 흐름"}'
    ].join('\n');
    var user = '[대표님 답변]\n' + TOSS.formatAnswers(ctx.answers) +
      (ctx.notes && ctx.notes.length ? ('\n[추가 메모]\n' + ctx.notes.join('\n')) : '') +
      (ctx.prevSummary ? ('\n[이전 요약]\n' + JSON.stringify(ctx.prevSummary)) : '') +
      (revisionText ? ('\n[대표님 수정 요청 — 반드시 반영]\n' + revisionText) : '') + '\n\nJSON만 출력하세요.';
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
        { step: 1, timing: 'IMMEDIATE', template_type: 'ALIMTALK', condition_desc: '모두 (전체 신청자)', content_title: '신청 확인용 제목(광고어 금지)', content_intro: '접수 확인·첫 자료 안내(광고어 금지, 노란색 [채널 추가] 안내 포함)', btn_name: '첫 자료 확인하기' },
        { step: 2, timing: 'AFTER_1_DAY_0900', template_type: 'FREE_FRIENDTALK', condition_desc: '모두 (전체 신청자)', badge: '배지', headline: '배너 헤드라인', subtext: '배너 서브', body_text: '#{이름}님! 본문(시트 변수는 #{@시트명.필드명} 형식)', btn_name: '이어서 보기' },
        { step: 3, timing: 'AFTER_3_DAYS_0900', template_type: 'BRAND_CAROUSEL', condition_desc: '모두 (전체 신청자)', cards: [{ header_20chars: '카드1 제목', body_180chars: '본문', button_8chars: '자세히보기' }, { header_20chars: '카드2 제목', body_180chars: '본문', button_8chars: '신청하기' }] }
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
      '당신은 고마워톡 수석 카피라이터입니다. 대표님의 8가지 답변만을 재료로 캠페인 전체 문구를 100% 새로 작문하세요.',
      '규칙: 1) 어떤 업종 샘플 문구도 복사하지 말고 오직 이번 답변에서 출발하세요. 2) 금지어(' + TOSS_BANNED_LIT + ')는 쓰지 마세요.',
      '3) 알림톡(ALIMTALK)에는 할인/특가/이벤트/무료증정/쿠폰 같은 광고성 단어를 쓰지 마세요. 4) 시트 변수는 #{@시트명.필드명} 형식.',
      '5) 말투(Step 3)와 언어(예: 한국어+영어 병기)를 모든 문구에 일관되게 반영하세요. 6) 신청 질문(Step 7)은 고른 질문마다 보기 3~4개(각 30자 이내)를 만들고 tag/sheet_field/sheet_value를 채우세요(최대 2문항).',
      '7) 이후 카톡 소식(Step 8) 흐름에 맞춰 tab4_sequence를 3회차로 구성하고, 연재·챌린지·콘텐츠형이면 use_webzine=true, 쿠폰·행사 안내 위주면 false.',
      '8) imagePrompt는 반드시 영어, "no text, no letters" 포함, 해당 구간 장면을 구체적으로.',
      '출력은 아래 스키마와 동일한 키 구조의 JSON 객체 하나만.'
    ].join('\n');
    var user = '[대표님 답변]\n' + TOSS.formatAnswers(ctx.answers) +
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
        return { question_text: q, options: [
          { answer_text: '네, 해당돼요', tag: '질문' + (i + 1) + '_예', sheet_field: '고객진단.항목' + (i + 1), sheet_value: '예' },
          { answer_text: '아니요, 해당 안 돼요', tag: '질문' + (i + 1) + '_아니오', sheet_field: '고객진단.항목' + (i + 1), sheet_value: '아니오' },
          { answer_text: '잘 모르겠어요', tag: '질문' + (i + 1) + '_모름', sheet_field: '고객진단.항목' + (i + 1), sheet_value: '모름' }
        ] };
      }) },
      tab4_sequence: [
        { step: 1, timing: 'IMMEDIATE', template_type: 'ALIMTALK', condition_desc: '모두 (전체 신청자)', content_title: tFirst(topic, 20) + ' 신청 접수 확인', content_intro: '신청해 주셔서 감사합니다. 첫 자료 안내가 준비되었어요. (다음 소식 수신을 위해 상단 노란색 [채널 추가]를 꼭 눌러 주세요!)', btn_name: '첫 자료 확인하기' },
        { step: 2, timing: 'AFTER_1_DAY_0900', template_type: 'FREE_FRIENDTALK', condition_desc: '모두 (전체 신청자)', badge: tFirst(target || '채널 친구 전용', 14), headline: tFirst(topic, 30), subtext: tFirst(gift, 30), body_text: '#{이름}님! 어제 받아보신 내용에 이어 두 번째 소식을 보내드려요. ' + tFirst(flow, 60), btn_name: '이어서 보기' },
        { step: 3, timing: 'AFTER_3_DAYS_0900', template_type: 'BRAND_CAROUSEL', condition_desc: '모두 (전체 신청자)', cards: [{ header_20chars: tFirst(topic, 20), body_180chars: tFirst(gift, 120), button_8chars: '자세히보기' }, { header_20chars: '궁금한 점 안내', body_180chars: '궁금한 점은 언제든 채널로 문의해 주세요.', button_8chars: '신청하기' }] }
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

  TOSS.assembleCampaign = function (g, A, partner, extra) {
    g = (g && typeof g === 'object') ? g : {};
    extra = extra || {};
    partner = partner || {};
    var fb = TOSS.fallbackContent(A, partner);
    var now = new Date(), p2 = function (n) { return String(n).padStart(2, '0'); };
    var ymd = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate());
    var channel = partner.businessName || partner.channel_name || '맞춤 브랜드 채널';

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

    // 신청폼 질문 (최대 2문항, 보기 2개 이상인 것만 채택)
    var gq = g.tab3_application_form && g.tab3_application_form.questions;
    var rawQs = (Array.isArray(gq) ? gq : []).filter(function (q) { return q && q.question_text && Array.isArray(q.options) && q.options.length >= 2; }).slice(0, 2);
    if (!rawQs.length) rawQs = fb.tab3_application_form.questions;
    var firstSheet = '';
    var questions = rawQs.map(function (q, qi) {
      return {
        order: qi + 1, type: 'MULTIPLE_CHOICE', required: true, question_text: String(q.question_text),
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

    var baseUrl = 'https://gomawartalk.com/webzine/' + ymd + '.html';
    var gSeq = g.tab4_sequence;
    var rawSeq = (Array.isArray(gSeq) && gSeq.length >= 2) ? gSeq.slice(0, 5) : fb.tab4_sequence;
    var sequence = rawSeq.map(function (s, idx) {
      var tt = s.template_type || (idx === 0 ? 'ALIMTALK' : idx === 1 ? 'FREE_FRIENDTALK' : 'BRAND_CAROUSEL');
      var cards = (Array.isArray(s.cards) && s.cards.length >= 2 ? s.cards : fb.tab4_sequence[2].cards).slice(0, 6).map(function (c, ci) {
        return {
          card_index: ci + 1, header_20chars: tFirst(c.header_20chars || ('카드 ' + (ci + 1)), 20), body_180chars: tFirst(c.body_180chars || '', 180),
          button_8chars: tFirst(c.button_8chars || '자세히보기', 8), webzine_anchor: ci === 0 ? '#sec-1' : '#sec-cta', button_url: baseUrl + (ci === 0 ? '#sec-1' : '#sec-cta')
        };
      });
      var anchor = '#sec-' + Math.min(idx + 1, 3);
      return {
        step: idx + 1, timing: s.timing || (idx === 0 ? 'IMMEDIATE' : idx === 1 ? 'AFTER_1_DAY_0900' : 'AFTER_3_DAYS_0900'),
        template_type: tt, template_id: TOSS_TEMPLATE_ID,
        branches: [{
          priority: 1, condition_desc: s.condition_desc || '모두 (전체 신청자)', template_id: TOSS_TEMPLATE_ID,
          variables: { '콘텐츠 제목': tFirst(s.content_title || (th.headline + ' 신청 접수 확인'), 40), '콘텐츠 소개': s.content_intro || '신청하신 첫 자료 안내가 준비되었어요. (다음 소식 수신을 위해 상단 노란색 [채널 추가]를 꼭 눌러 주세요!)' },
          sheet_fallback_strings: fbSheet, image_ratio: '800x400',
          image_copy: { badge: s.badge || th.badge, headline: s.headline || th.headline, subtext: s.subtext || th.subtext },
          body_text_400chars: s.body_text || ('#{이름}님! #{@' + firstSheet + '} 맞춤 안내를 보내드려요.'),
          buttons: [{ name: tFirst(s.btn_name || '자세히 보기', 14), link_type: 'WL', webzine_anchor: anchor, url: baseUrl + anchor }],
          cards_800x600: cards
        }]
      };
    });

    var useWebzine = (typeof g.use_webzine === 'boolean') ? g.use_webzine : fb.use_webzine;
    var wz = (g.webzine_studio && Array.isArray(g.webzine_studio.sections) && g.webzine_studio.sections.length >= 2) ? g.webzine_studio : fb.webzine_studio;
    var gBa = g.brand_assets || {};
    var themeSeed = [A && A[1], A && A[2], A && A[5], channel, th.headline].filter(Boolean).join(' ');
    var smartTheme = detectSmartEditorialTheme(themeSeed);

    return sanitizeObject({
      meta: { schema_version: '2.0', campaign_id: ymd + '_' + String(channel).replace(/\s+/g, '') + '_01', created_at: now.toISOString(), mode: 'FULL_SET', use_webzine: !!useWebzine, webzine_base_url: baseUrl, source: 'partner_bot_toss8', auto_generate_visuals: true },
      partner_info: { owner_name: partner.ownerName || '', phone: partner.phone || '', email: partner.email || '', channel_name: channel, channel_id_num: '', current_plan: 'STARTER', pro_upgrade_requested: false, industry_code: 'custom_ai', track_id: '' },
      brand_assets: { primary_color: gBa.primary_color || smartTheme.primary, secondary_color: gBa.secondary_color || smartTheme.secondary, font_theme: gBa.font_theme || 'modern', logo_base64: null, block_images_base64: { block_1: null, block_2: null, block_3: null, block_4: null, block_5: null } },
      tab1_basic_settings: {
        thumbnail_500x280: th, title_30chars: tFirst(gT1.title_30chars || fT1.title_30chars, 30), description: gT1.description || fT1.description,
        apply_btn_text: gT1.apply_btn_text || fT1.apply_btn_text, cancel_btn_text: gT1.cancel_btn_text || fT1.cancel_btn_text,
        show_apply_btn: true, show_top_bar: true, form_only_mode: false, failure_notice_alimtalk: true, friendtalk_rescue_2times: true, marketing_consent_popup: true
      },
      tab2_landing_content: { output_mode: 'FULL', bg_color: smartTheme.secondary, use_shorts_landing: false, shorts_youtube_url: '', blocks_1000px: blocks, branch_links: ['', '', '', '', ''] },
      tab3_application_form: {
        is_active: true,
        form_title: (g.tab3_application_form && g.tab3_application_form.form_title) || fb.tab3_application_form.form_title,
        form_guide_text: (g.tab3_application_form && g.tab3_application_form.form_guide_text) || fb.tab3_application_form.form_guide_text,
        questions: questions
      },
      tab4_interval_messages: { quick_single_mode: false, exclude_days: ['SAT', 'SUN'], sequence: sequence },
      tab5_date_messages: [{ quick_single_mode: false, send_datetime: ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6, 8) + ' 10:00', title: tFirst(th.headline, 24) + ' — 일정 안내', template_type: 'BRAND_CAROUSEL', branches: [sequence[sequence.length - 1].branches[0]] }],
      webzine_studio: wz
    });
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
      n: 1, key: 'goal_topic', label: '캠페인 목표 & 핵심 주제',
      usageHint: '신청페이지 첫 화면(Hero) 헤드카피와 캠페인 전체 방향을 결정하는 핵심 재료예요.'
    },
    {
      n: 2, key: 'target_pain', label: '핵심 타겟 & 현실 고민',
      usageHint: '고객이 "어? 딱 내 얘기네!" 하며 고개를 끄덕이는 신청페이지 2단 공감 섹션에 들어가요.'
    },
    {
      n: 3, key: 'first_gift', label: '신청 직후 첫 무료 혜택',
      usageHint: '카카오 1초 신청을 망설임 없이 누르게 만드는 첫 카톡 선물과 3단 솔루션 섹션에 반영돼요.'
    },
    {
      n: 4, key: 'trust_proof', label: '대표님만의 경력·강점·성과',
      usageHint: '고객이 믿고 신청하게 만드는 4단 신뢰 증거 섹션에 실제 숫자·강점으로 멋지게 담겨요.'
    },
    {
      n: 5, key: 'form_and_tone', label: '신청 질문 & 후속 카톡 디테일',
      usageHint: '고객을 분류할 신청폼 객관식 질문과 이후 카톡 발송 주기·말투·언어 설정에 직결돼요.'
    }
  ];

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
      if (p && p.re && p.re.test(sub)) return { key: keys[i], pack: p };
    }
    return null;
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
      var raw = (pipe[i] && pipe[i].text) || (['간편 신청 체크', '즉시 첫 혜택 카톡', '후속 자동 카톡'][i]);
      return { icon: icons[i], text: CONSULT.cleanPartnerText(shortenPill(raw, 13)) };
    });
  };

  CONSULT.getBestFlowId = function (sectorId, subIndustry) {
    var sub = String(subIndustry || '').toLowerCase();
    if (/산부인과|병원|의원|치과|한의원|검진|설명회|세미나|웨비나|특강/.test(sub)) return 'FLOW_1';
    if (/세무|법무|변호사|노무|학원|수학|영어|패션|쇼핑몰|피부|필라테스/.test(sub)) return 'FLOW_4';
    if (/교회|협회|모임|커뮤니티|후원|비영리/.test(sub)) return 'FLOW_3';
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

  // 타 업종 용어 오염 0% 보장 — 세부 업종 전용 6대 플로우 로컬 생성기
  CONSULT.getFlowsForContext = function (sectorId, subIndustry) {
    var sub = String(subIndustry || '').trim();
    var sec = CONSULT.getSector(sectorId);
    var matched = CONSULT.matchSubDomainPack(sectorId, sub);
    var srcFlows = null;
    if (matched && matched.pack && Array.isArray(matched.pack.flows)) {
      srcFlows = matched.pack.flows;
    } else if (sec && Array.isArray(sec.flows)) {
      srcFlows = sec.flows;
    } else {
      return [];
    }
    var subLabel = sub || (sec ? sec.shortTitle : '우리 브랜드');
    return srcFlows.map(function (f) {
      var title = interpolateSub(f.title, subLabel);
      if (sectorId === 'other' && sub && title.indexOf(sub) === -1) {
        title = sub + ' ' + title;
      }
      var built = {
        id: f.id,
        trackId: f.trackId,
        icon: f.icon,
        badge: f.badge || '',
        title: CONSULT.cleanPartnerText(title),
        summary: CONSULT.cleanPartnerText(interpolateSub(f.summary, subLabel)),
        useWebzine: !!f.useWebzine,
        pipeline: (f.pipeline || []).map(function (p) {
          return {
            step: p.step,
            text: CONSULT.cleanPartnerText(interpolateSub(p.text, subLabel))
          };
        })
      };
      built.pills = CONSULT.buildFlowPills(built).map(function (x) { return x.text; });
      return built;
    });
  };

  // Step 2: 세부 업종 100% 맞춤형 6대 카톡 운영 플로우 실시간 AI 번역 생성 (오프라인 시 키워드 분리 폴백)
  CONSULT.generateSubIndustryFlows = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var sub = String(ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var localFlows = CONSULT.getFlowsForContext(ctx.sectorId, sub);

    // 세부 업종이 없거나 AI 미연결이면 즉시 오염 없는 로컬 6대 플로우 반환
    if (!sub || (ctx.mode === 'admin' && !getConfig().hasDirectKey) || (ctx.mode !== 'admin' && !String(ctx.proxyUrl || '').trim())) {
      return Promise.resolve({ flows: localFlows, source: 'local_clean' });
    }

    var baseRef = localFlows.map(function (f, i) {
      return (i + 1) + '. [' + f.id + '] ' + f.title;
    }).join('\n');

    var sys = [
      '당신은 고마워톡 수석 마케팅 컨설턴트입니다.',
      '파트너가 직접 입력한 [세부 업종]의 실전 언어와 고객 상황에만 100% 맞춘 6가지 카톡 운영 플로우를 JSON 배열로 작성하세요.',
      '절대 규칙:',
      '1) 타 업종 용어 오염 100% 금지! 예를 들어 세부 업종이 "산부인과"·"치과"·"한의원" 등 병의원이면 세무·절세·부가세·법인·기장 같은 타 업종 단어를 단 한 글자도 절대 넣지 마세요.',
      '2) 내부 시스템 용어(뜰채, 시트 정수 더하기, 1회차 알림톡, 트랙 번호, ' + TOSS_BANNED_LIT + ') 절대 금지.',
      '3) 6개 흐름은 반드시 FLOW_1(일정·예약 리마인드), FLOW_2(가이드·혜택 즉시 발급), FLOW_3(정기 칼럼·소식 연재), FLOW_4(자가진단 & 유형별 맞춤 분기), FLOW_5(열독·방문 포인트 적립 VIP), FLOW_6(현장 QR 체크인·통합 안내) 구조를 유지하되 이름과 내용을 100% 세부 업종 현장 용어로 번역하세요.',
      '4) 출력 JSON만: {"flows":[{"id":"FLOW_1","title":"...","badge":"짧은뱃지","pills":["10자내외키워드1","10자내외키워드2","10자내외키워드3"],"summary":"1줄 요약","pipeline":[{"step":"신청페이지","text":"..."},{"step":"즉시 첫 카톡","text":"..."},{"step":"후속 자동 카톡","text":"..."}]}]} (정확히 6개)'
    ].join('\n');

    var user = '[선택 분야] ' + (sec ? sec.title : '기타 업종') +
      '\n[세부 업종 — 모든 문구는 오직 이 업종에만 맞춰 작성] ' + sub +
      '\n[6개 슬롯 참고]\n' + baseRef +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, temperature: 0.35, maxOutputTokens: 2048
    }).then(function (raw) {
      var obj = extractJson(raw);
      var arr = obj && Array.isArray(obj.flows) ? obj.flows : null;
      if (!arr || arr.length < 6) {
        return { flows: localFlows, source: 'local_clean' };
      }
      var merged = localFlows.map(function (lf, idx) {
        var af = arr.find(function (x) { return x && x.id === lf.id; }) || arr[idx] || {};
        var pipe = (Array.isArray(af.pipeline) && af.pipeline.length === 3)
          ? af.pipeline.map(function (p, pi) {
              return {
                step: (lf.pipeline[pi] && lf.pipeline[pi].step) || p.step || '',
                text: CONSULT.cleanPartnerText(p.text || (lf.pipeline[pi] && lf.pipeline[pi].text) || '')
              };
            })
          : lf.pipeline;
        var built = {
          id: lf.id,
          trackId: lf.trackId,
          icon: lf.icon,
          badge: CONSULT.cleanPartnerText(af.badge || lf.badge || ''),
          title: CONSULT.cleanPartnerText(af.title || lf.title),
          summary: CONSULT.cleanPartnerText(af.summary || lf.summary),
          useWebzine: lf.useWebzine,
          pipeline: pipe,
          pills: (Array.isArray(af.pills) && af.pills.length === 3)
            ? af.pills.map(function (x) { return CONSULT.cleanPartnerText(tFirst(x, 14)); })
            : null
        };
        built.pills = CONSULT.buildFlowPills(built).map(function (x) { return x.text; });
        return built;
      });
      return { flows: merged, source: 'ai_realtime' };
    }).catch(function () {
      return { flows: localFlows, source: 'local_clean' };
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
  CONSULT.checkFeasibilityLocal = function (userText) {
    var txt = String(userText || '').trim();
    if (!txt) return { feasible: true };
    var rules = CONSULT.getFeasibilityRules();
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
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
    var sub = String(ctx.subIndustry || (sec ? sec.shortTitle : '비즈니스')).trim();
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, sub);
    var flowTitle = flow ? flow.title : '카카오 자동 운영 흐름';
    var A = ctx.answers || {};
    var owner = String(ctx.ownerName || '대표님').trim();
    var meta = CONSULT.Q_META[qNum - 1] || CONSULT.Q_META[0];
    var subPack = CONSULT.matchSubDomainPack(ctx.sectorId, sub);
    var rawChips = (subPack && subPack.pack && subPack.pack.examples && subPack.pack.examples[qNum])
      ? subPack.pack.examples[qNum].map(function (x) { return interpolateSub(x, sub); })
      : ((sec && sec.examples && sec.examples[qNum]) ? sec.examples[qNum].slice(0, 3) : []);

    var qText = '';
    var topicSnippet = tFirst(A[1] || sub, 28);
    var giftSnippet = tFirst(A[3] || '첫 무료 혜택', 24);

    if (qNum === 1) {
      qText = '**' + sub + '** 분야에 딱 맞는 **' + flowTitle + '**을 골라주셨네요!\n' +
        owner + ' 대표님, 이번 캠페인으로 **꼭 이루고 싶은 진짜 목표와 핵심 주제**를 편하게 들려주세요.';
    } else if (qNum === 2) {
      qText = '목표가 아주 선명해요! **"' + topicSnippet + '"**에 반응할 **가장 모으고 싶은 핵심 고객**은 어떤 분이고, 그분들이 평소 겪는 **단골 현실 고민**은 무엇인가요?';
    } else if (qNum === 3) {
      qText = '공감이 확 되는 고민이네요! **' + sub + '** 고객이 카카오로 1초 신청하자마자 **첫 카톡으로 바로 선물받을 무료 혜택·자료·안내**는 무엇으로 준비하면 좋을까요?';
    } else if (qNum === 4) {
      qText = '**"' + giftSnippet + '"** 구성이 매력적이에요! 이제 고객이 "여기 진짜 믿을 만하네!" 하고 바로 신청할 수 있게 **대표님만의 실제 경력·강점·성과 숫자**를 자랑해 주세요.';
    } else {
      qText = '마지막 질문이에요! **' + sub + '** 신청폼에서 고객을 분류할 **객관식 질문(예: 유형·고민)**과, 이후 카톡을 보낼 **주기·원하시는 말투(또는 언어)**를 알려주세요.';
    }

    return {
      qNum: qNum,
      label: meta.label,
      usageHint: meta.usageHint,
      questionText: CONSULT.cleanPartnerText(qText),
      exampleChips: rawChips.slice(0, 3).map(function (c) { return CONSULT.cleanPartnerText(c); })
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

  // Q1 시작 시에도 업종·세부업종·플로우 맥락에 맞춘 맞춤형 Q1 + 예시 칩 3개 제공
  CONSULT.getInitialQ1 = function (ctx) {
    var localPack = CONSULT.buildLocalQuestionPack(1, ctx);
    var sec = CONSULT.getSector(ctx.sectorId);
    var sub = String(ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, sub);
    // 세부 업종이 비어 있거나 AI 미연결이면 즉시 로컬 팩 반환 (0ms 쾌속 진입)
    if (ctx.mode === 'admin' && !getConfig().hasDirectKey) {
      return Promise.resolve(localPack);
    }
    if (ctx.mode !== 'admin' && !String(ctx.proxyUrl || '').trim()) {
      return Promise.resolve(localPack);
    }

    var sys = [
      '당신은 고마워톡 수석 마케팅 컨설턴트입니다.',
      '파트너가 방금 선택한 [분야], [세부 업종], [선택 운영 흐름]에 100% 맞춘 살아있는 첫 번째 질문(Q1: 캠페인 목표 & 핵심 주제)과',
      '파트너가 터치해 내 내용으로 고쳐 쓸 수 있는 현실적인 예시 문장 칩 3개를 JSON으로 작성하세요.',
      '절대 규칙:',
      '1) "어떤 클래스·상품·모임을 알리고 싶으신가요?" 같은 천편일률적 고정 문구 절대 금지. 반드시 세부 업종 언어를 녹여서 물어보세요.',
      '2) 내부 시스템 용어(뜰채, 시트 정수 더하기, 1회차 알림톡, 트랙 번호, ' + TOSS_BANNED_LIT + ') 절대 금지.',
      '3) questionText는 2문장 이내, 친근하고 전문적인 존댓말, 핵심 강조만 **굵게** 1~2곳.',
      '4) exampleChips는 정확히 3개, 각 35~75자 사이의 실제 대표님이 쓸 법한 완성된 1인칭("~하고 싶어요.") 문장.',
      '출력 JSON만: {"questionText":"...","exampleChips":["예시1","예시2","예시3"]}'
    ].join('\n');

    var user = '[대표자] ' + (ctx.ownerName || '대표님') +
      '\n[분야] ' + (sec ? sec.title : '') +
      '\n[세부 업종] ' + sub +
      '\n[선택 운영 흐름] ' + (flow ? (flow.title + ' — ' + flow.summary) : '') +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, temperature: 0.45, maxOutputTokens: 900
    }).then(function (raw) {
      var obj = extractJson(raw);
      if (!obj || !obj.questionText || !Array.isArray(obj.exampleChips) || obj.exampleChips.length < 2) {
        return localPack;
      }
      return {
        qNum: 1,
        label: localPack.label,
        usageHint: localPack.usageHint,
        questionText: CONSULT.cleanPartnerText(obj.questionText),
        exampleChips: obj.exampleChips.slice(0, 3).map(function (c) { return CONSULT.cleanPartnerText(c); })
      };
    }).catch(function () {
      return localPack;
    });
  };

  // 매 답변 제출 시: ① 고마워톡 매뉴얼 불가능 기능 검증(Feasibility Guardrail) ② 통과 시 다음 맥락 질문 + Tap-to-Edit 예시 칩 3개 생성
  CONSULT.evaluateAndAdvance = function (ctx) {
    ctx = ctx || {};
    var qNum = Number(ctx.qNum) || 1;
    var userText = String(ctx.userText || '').trim();
    var sec = CONSULT.getSector(ctx.sectorId);
    var sub = String(ctx.subIndustry || (sec ? sec.shortTitle : '')).trim();
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, sub);

    // ① 1차 하드 가드레일 (로컬 매뉴얼 정규식 즉시 검문 — 온라인/오프라인 무관 100% 차단)
    var localCheck = CONSULT.checkFeasibilityLocal(userText);
    if (!localCheck.feasible) {
      return Promise.resolve({
        feasible: false,
        guardrail: {
          ruleId: localCheck.ruleId,
          title: localCheck.title,
          reason: localCheck.reason,
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
    if ((ctx.mode === 'admin' && !getConfig().hasDirectKey) || (ctx.mode !== 'admin' && !String(ctx.proxyUrl || '').trim())) {
      return Promise.resolve({
        feasible: true,
        completedInterview: isLastQ,
        ackText: isLastQ ? '5가지 핵심 내용을 아주 잘 정리해 주셨어요! 이제 브랜드 로고와 컬러·사진을 담아볼까요?' : '',
        nextPack: localNext
      });
    }

    // ② 2차 AI 심층 매뉴얼 검문소 + 다음 맥락 질문 & 예시 칩 3개 동적 생성
    var nextMeta = CONSULT.Q_META[nextQNum - 1];
    var sys = [
      '당신은 고마워톡(카카오톡 자동화 플랫폼) 수석 컨설턴트입니다.',
      '지금은 파트너의 Q' + qNum + ' 답변을 검토하고, 1) 고마워톡 시스템에서 물리적으로 불가능한 기능이 포함됐는지 먼저 검문한 뒤, 2) 가능할 때만 다음 질문과 예시 칩 3개를 만듭니다.',
      '',
      '[절대 매뉴얼 검문 기준 — 아래 중 하나라도 파트너 답변에 요구되면 반드시 feasible=false로 차단하세요!]',
      CONSULT.buildGuardrailManualSummary(),
      '※ 위 목록 외라도 "실시간 맞춤 영상/음성/이미지 즉석 자동 제작 발송", "카톡방 내 실시간 AI 1:1 자유 채팅 상담", "채널 미추가 고객 광고성 친구톡 강제 발송", "알림톡 본문에 할인·특가·쿠폰 발송", "고마워톡 자체 카드결제창/장바구니 내장", "신청폼 내 사진·서류 파일 업로드", "야간(20:30~08:00) 친구톡 발송", "한 회차 6개 이상 다중 분기"가 포함되면 절대 통과시키지 마세요!',
      '※ 단, 파트너가 정상적인 목표·고민·무료 PDF/가이드/쿠폰(친구톡)/상담/예약/기존 링크 연결/객관식 분류 등을 적었다면 반드시 feasible=true로 통과시키세요.',
      '',
      '[응답 JSON 규격]',
      'A) 불가능한 기능 감지 시 (다음 질문으로 절대 넘어가지 않음):',
      '{"feasible":false,"title":"한 줄 요약","reason":"고마워톡에서 지원하지 않는 정확한 사유(대표님, 고마워톡에서는 [이 부분] 기능은 지원하지 않아요. 에 들어갈 명사구)","alternatives":[{"label":"대안1 제목","detail":"고마워톡 기능으로 구현하는 친절한 설명 1~2문장","draftText":"파트너가 아래 칸에 채워 바로 쓸 수 있는 1인칭 수정 문장"},{"label":"대안2 제목","detail":"대안2 설명 1~2문장","draftText":"대안2 1인칭 수정 문장"}]}',
      '',
      'B) 구현 가능 시 (feasible=true):',
      isLastQ
        ? '{"feasible":true,"completedInterview":true,"ackText":"5가지 답변을 바탕으로 브랜드 스타일 단계로 넘어가는 따뜻한 한 문장"}'
        : ('{"feasible":true,"completedInterview":false,"questionText":"직전 답변을 짧게 공감하며 자연스럽게 이어가는 Q' + nextQNum + '(' + nextMeta.label + ') 맞춤 질문 (2문장 이내, 핵심만 **굵게**, 내부 전문용어 및 ' + TOSS_BANNED_LIT + ' 절대 금지)","exampleChips":["이 업종·맥락에 100% 맞춘 현실적 1인칭 예시1 (40~80자)","예시2","예시3"]}')
    ].join('\n');

    var user = '[분야] ' + (sec ? sec.title : '') +
      '\n[세부 업종] ' + sub +
      '\n[선택 운영 흐름] ' + (flow ? (flow.title + ' — ' + flow.summary) : '') +
      '\n[지금까지 받은 답변]\n' + CONSULT.formatConsultAnswers(nextAnswers) +
      '\n\n[방금 검토할 Q' + qNum + ' 답변]\n' + userText +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, temperature: 0.35, maxOutputTokens: 1200
    }).then(function (raw) {
      var obj = extractJson(raw);
      if (!obj || typeof obj !== 'object') {
        return { feasible: true, completedInterview: isLastQ, ackText: '', nextPack: localNext };
      }
      if (obj.feasible === false && obj.reason) {
        var alts = Array.isArray(obj.alternatives) ? obj.alternatives.slice(0, 2).map(function (a) {
          return {
            label: CONSULT.cleanPartnerText(a.label || '고마워톡 맞춤 대안'),
            detail: CONSULT.cleanPartnerText(a.detail || ''),
            draftText: CONSULT.cleanPartnerText(a.draftText || a.detail || '')
          };
        }) : [];
        return {
          feasible: false,
          guardrail: {
            ruleId: 'ai_guardrail',
            title: CONSULT.cleanPartnerText(obj.title || '고마워톡 기능 지원 여부 확인'),
            reason: CONSULT.cleanPartnerText(obj.reason),
            alternatives: alts
          }
        };
      }
      if (isLastQ) {
        return {
          feasible: true,
          completedInterview: true,
          ackText: CONSULT.cleanPartnerText(obj.ackText || '모든 핵심 내용을 잘 들었어요! 이제 브랜드 스타일을 담아볼까요?'),
          nextPack: null
        };
      }
      var chips = (Array.isArray(obj.exampleChips) && obj.exampleChips.length >= 2)
        ? obj.exampleChips.slice(0, 3).map(function (c) { return CONSULT.cleanPartnerText(c); })
        : localNext.exampleChips;
      return {
        feasible: true,
        completedInterview: false,
        nextPack: {
          qNum: nextQNum,
          label: localNext.label,
          usageHint: localNext.usageHint,
          questionText: CONSULT.cleanPartnerText(obj.questionText || localNext.questionText),
          exampleChips: chips
        }
      };
    }).catch(function () {
      return { feasible: true, completedInterview: isLastQ, ackText: '', nextPack: localNext };
    });
  };

  // ── 4) 별도 분리된 [💬 고마워톡 기능 가능 여부 물어보기] Q&A 엔진
  CONSULT.askFeatureQA = function (questionText, ctx) {
    ctx = ctx || {};
    var q = String(questionText || '').trim();
    if (!q) return Promise.resolve('궁금한 고마워톡 기능이나 요금·규정을 편하게 적어 주세요!');

    var localGuard = CONSULT.checkFeasibilityLocal(q);
    var ragSnippet = searchKnowledge(q, global.GOMAWARTALK_MANUAL || global.GomawartalkManual || []);

    function localAnswer() {
      if (!localGuard.feasible) {
        var altLines = (localGuard.alternatives || []).map(function (a, i) {
          return (i + 1) + ') **' + a.label + '**: ' + a.detail;
        }).join('\n');
        return CONSULT.cleanPartnerText(
          '대표님, 고마워톡에서는 **' + localGuard.reason + '** 기능은 지원하지 않아요.\n\n대신 이런 방법으로 구현하시면 효과가 아주 좋아요:\n' + altLines
        );
      }
      if (ragSnippet) {
        return CONSULT.cleanPartnerText(ragSnippet.slice(0, 520));
      }
      return '고마워톡은 **카카오 1초 신청 ➔ 즉시 첫 카톡(알림톡) ➔ 채널 친구 대상 후속 자동 카톡(친구톡/캐러셀) 및 날짜 예약 발송**을 지원해요. 요금제(Starter 연 24만 / Pro 연 40만), 신청폼 분류, 모바일 웹진 연동 등 구체적인 기능을 물어보시면 바로 안내해 드릴게요!';
    }

    if ((ctx.mode === 'admin' && !getConfig().hasDirectKey) || (ctx.mode !== 'admin' && !String(ctx.proxyUrl || '').trim())) {
      return Promise.resolve(localAnswer());
    }

    var sys = [
      '당신은 고마워톡 공식 매뉴얼 기반 친절한 기능 상담원입니다.',
      '아래 [고마워톡 공식 매뉴얼]과 [지원 불가 및 대안 규칙]에만 근거하여 사실대로 정확히 답변하세요.',
      '불가능한 기능이면 먼저 "대표님, 고마워톡에서는 ~ 기능은 지원하지 않아요."라고 명확히 말한 뒤, 고마워톡에서 가능한 스마트 대안 2가지를 쉽게 알려주세요.',
      '내부 전문용어(뜰채, 시트 정수 더하기, ' + TOSS_BANNED_LIT + ')는 쉬운 일상 언어로 바꿔서 4~6문장 이내로 깔끔하게 답하세요.',
      '',
      '[지원 불가 및 대안 규칙]\n' + CONSULT.buildGuardrailManualSummary(),
      ragSnippet ? ('\n[관련 공식 매뉴얼 발췌]\n' + ragSnippet) : ''
    ].join('\n');

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: '파트너 질문: ' + q, temperature: 0.25, maxOutputTokens: 700
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

  // ── 5) Step 5: 최종 요약 카드 생성 (5대 답변 + 분야 + 흐름)
  CONSULT.localSummary = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, ctx.subIndustry);
    var A = ctx.answers || {};
    var flowTxt = String(A[5] || (flow ? flow.title : ''));
    return {
      sectorLine: (sec ? (sec.icon + ' ' + sec.title) : '') + (ctx.subIndustry ? (' · ' + ctx.subIndustry) : ''),
      flowTitle: flow ? flow.title : '맞춤 카카오 운영 흐름',
      goalTopic: tFirst(A[1] || ctx.subIndustry || '맞춤 캠페인', 75),
      targetPain: tFirst(A[2] || '핵심 타겟 고객 및 주요 고민', 80),
      firstGift: tFirst(A[3] || '신청 즉시 발송되는 첫 무료 혜택', 75),
      trustProof: tFirst(A[4] || '대표님만의 검증된 강점·성과', 75),
      formAndFlow: tFirst(flowTxt || '신청폼 분류 질문 및 자동 후속 카톡', 80),
      useWebzine: flow ? !!flow.useWebzine : /연재|칼럼|챌린지|웹진|주보/.test(flowTxt)
    };
  };

  CONSULT.summarize = function (ctx, revisionText) {
    var local = CONSULT.localSummary(ctx);
    if ((ctx.mode === 'admin' && !getConfig().hasDirectKey) || (ctx.mode !== 'admin' && !String(ctx.proxyUrl || '').trim())) {
      if (revisionText) {
        local.goalTopic = tFirst(local.goalTopic + ' · ' + revisionText, 85);
      }
      return Promise.resolve(local);
    }

    var sys = [
      '당신은 고마워톡 마케팅 컨설턴트입니다. 대표님의 분야·선택 흐름·5가지 심층 답변을 모바일 최종 확인 카드용으로 깔끔히 요약하세요.',
      '내부 전문용어(뜰채, 시트 정수 더하기, ' + TOSS_BANNED_LIT + ')는 절대 쓰지 말고 쉬운 일상 언어로 각 항목을 50~80자 이내로 정리하세요.',
      '출력 JSON만: {"goalTopic":"","targetPain":"","firstGift":"","trustProof":"","formAndFlow":"","useWebzine":true}'
    ].join('\n');

    var user = '[분야/세부업종] ' + local.sectorLine +
      '\n[선택 운영 흐름] ' + local.flowTitle +
      '\n[5대 심층 답변]\n' + CONSULT.formatConsultAnswers(ctx.answers) +
      (ctx.notes && ctx.notes.length ? ('\n[수정 메모]\n' + ctx.notes.join('\n')) : '') +
      (revisionText ? ('\n[방금 요청한 수정 사항 — 반드시 반영]\n' + revisionText) : '') +
      '\n\nJSON만 출력하세요.';

    return TOSS.callAI({
      mode: ctx.mode, proxyUrl: ctx.proxyUrl, token: ctx.token,
      system: sys, user: user, temperature: 0.3, maxOutputTokens: 1024
    }).then(function (raw) {
      var o = extractJson(raw);
      if (!o || !o.goalTopic) return local;
      return {
        sectorLine: local.sectorLine,
        flowTitle: local.flowTitle,
        goalTopic: CONSULT.cleanPartnerText(o.goalTopic),
        targetPain: CONSULT.cleanPartnerText(o.targetPain || local.targetPain),
        firstGift: CONSULT.cleanPartnerText(o.firstGift || local.firstGift),
        trustProof: CONSULT.cleanPartnerText(o.trustProof || local.trustProof),
        formAndFlow: CONSULT.cleanPartnerText(o.formAndFlow || local.formAndFlow),
        useWebzine: typeof o.useWebzine === 'boolean' ? o.useWebzine : local.useWebzine
      };
    }).catch(function () {
      return local;
    });
  };

  // ── 6) 100% 제로베이스 CampaignMaster.json V2.0 생성 + 브랜드 에셋(로고·컬러·실사 최대 3장) 우선 배치 연동
  CONSULT.assembleCampaign = function (aiJson, ctx) {
    ctx = ctx || {};
    var A = ctx.answers || {};
    var partner = ctx.partner || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, ctx.subIndustry);
    var brand = ctx.brandAssets || {};
    var photos = Array.isArray(brand.photos) ? brand.photos.filter(Boolean).slice(0, 3) : [];
    var photoMode = (brand.photoMode === 'ai_auto' || !photos.length) ? 'ai_auto' : 'uploaded';

    // 기존 TOSS.assembleCampaign의 탄탄한 구조 조립기를 재활용하되 5단계 컨설턴트 답변으로 매핑
    var mappedAnswers = {
      1: A[1] || ctx.subIndustry || (sec ? sec.title : '맞춤 캠페인'),
      2: A[2] || (ctx.subIndustry ? ctx.subIndustry + ' 핵심 고객' : '핵심 타겟 고객'),
      3: A[5] || '신뢰감 있고 친근한 존댓말',
      4: A[2] || '현실적인 핵심 고민',
      5: A[3] || '신청 즉시 발송되는 첫 무료 혜택',
      6: A[4] || '대표님만의 검증된 경력·성과',
      7: A[5] || '현재 어떤 상황이 가장 고민이신가요?',
      8: (flow ? flow.title + ' — ' : '') + (A[5] || '')
    };

    var master = TOSS.assembleCampaign(aiJson, mappedAnswers, partner);

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

    return sanitizeObject(master);
  };

  CONSULT.generateCampaign = function (ctx) {
    ctx = ctx || {};
    var sec = CONSULT.getSector(ctx.sectorId);
    var flow = CONSULT.getFlow(ctx.sectorId, ctx.flowId, ctx.customFlows, ctx.subIndustry);
    var A = ctx.answers || {};

    var mappedAnswers = {
      1: '[' + (sec ? sec.shortTitle : '') + ' · ' + (ctx.subIndustry || '') + '] ' + (A[1] || ''),
      2: A[2] || '',
      3: A[5] || '',
      4: A[2] || '',
      5: A[3] || '',
      6: A[4] || '',
      7: A[5] || '',
      8: (flow ? (flow.title + ' (' + flow.summary + ') — ') : '') + (A[5] || '')
    };

    var p = TOSS.buildGenerationPrompt({
      answers: mappedAnswers,
      notes: (ctx.notes || []).concat([
        '선택 분야: ' + (sec ? sec.title : '') + ' / 세부 업종: ' + (ctx.subIndustry || ''),
        '선택 운영 흐름: ' + (flow ? flow.title : '')
      ]),
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
  RagInterviewEngine.getConfig = getConfig;
  RagInterviewEngine.saveConfig = saveConfig;
  RagInterviewEngine.saveBridgeCampaign = saveBridgeCampaign;
  RagInterviewEngine.getBridgeCampaign = getBridgeCampaign;
  RagInterviewEngine.discoverActiveModels = discoverActiveModels;
  RagInterviewEngine.detectSmartEditorialTheme = detectSmartEditorialTheme;
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
