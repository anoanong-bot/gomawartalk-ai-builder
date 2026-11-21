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
      // QuotaExceededError 방어: 대용량 base64 이미지만 경량화하여 재저장
      try {
        var slim = JSON.parse(JSON.stringify(sanitizeObject(campaignObj)));
        if (slim && slim.brand_assets && slim.brand_assets.block_images_base64) {
          slim.brand_assets.block_images_base64 = {};
        }
        if (slim && slim.tab2_landing_content && Array.isArray(slim.tab2_landing_content.blocks_1000px)) {
          slim.tab2_landing_content.blocks_1000px.forEach(function (b) {
            if (b.visual_image && b.visual_image.length > 180000) b.visual_image = null;
          });
        }
        localStorage.setItem(STORAGE_KEYS.BRIDGE_CAMPAIGN, JSON.stringify({
          savedAt: new Date().toISOString(),
          campaign: slim
        }));
        return true;
      } catch (e2) {
        return false;
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

  TOSS.postProxy = function (url, body) {
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
      if (data && data.error) {
        var e = new Error(data.error);
        e.code = data.code || '';
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

  TOSS.submitCampaign = function (proxyUrl, token, master) {
    return TOSS.postProxy(proxyUrl, { action: 'submit_campaign', partnerToken: token, payload: master });
  };

  TOSS.verifyPartner = function (proxyUrl, payload) {
    return TOSS.postProxy(proxyUrl, Object.assign({ action: 'verifyPartner' }, payload || {}));
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

  global.RagInterviewEngine = RagInterviewEngine;
})(typeof window !== 'undefined' ? window : this);
