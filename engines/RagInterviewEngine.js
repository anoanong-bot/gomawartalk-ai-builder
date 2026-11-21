/**
 * engines/RagInterviewEngine.js
 * [범용 엔진 2] 지식 카트리지 교체형 'RAG Q&A' + 다회차 심층 상담 & Gemini REST/프록시 하이브리드 엔진
 *
 * - 타 프로젝트에도 100% 재활용 가능한 범용 대화/상담 엔진
 * - 일반 <script src="engines/RagInterviewEngine.js"> 로드 (file:// 더블클릭 100% 호환, window.RagInterviewEngine 노출)
 * - 로컬 테스트용 Gemini API Key 직결(gemini-2.5-flash 기본) + 배포용 Backend Proxy URL 자동 라우팅
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

  var DEFAULT_MODEL = 'gemini-2.5-flash';
  var BANNED_RE = new RegExp('\\uB274\\uC2A4\\uB808\\uD130', 'g');

  // ─────────────────────────────────────────────────────────────
  // 1. 공유 설정 & 브릿지 스토리지 (InterviewBot <-> LandingBuilder)
  // ─────────────────────────────────────────────────────────────
  function getConfig() {
    var apiKey = '', model = DEFAULT_MODEL, proxyUrl = '';
    try {
      apiKey = (localStorage.getItem(STORAGE_KEYS.API_KEY) || '').trim();
      model = (localStorage.getItem(STORAGE_KEYS.MODEL) || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
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
  // 4. Gemini REST API 직결 (gemini-2.5-flash 기본) + Proxy 하이브리드 호출
  // ─────────────────────────────────────────────────────────────
  function callGeminiDirectModel(apiKey, modelName, opts) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelName) + ':generateContent?key=' + encodeURIComponent(apiKey);
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

    // ① 로컬 Gemini API 키가 있으면 gemini-2.5-flash 직접 호출 (404/미지원 시 gemini-2.0-flash 자동 폴백)
    if (apiKey) {
      return callGeminiDirectModel(apiKey, model, opts).catch(function (err) {
        if (model !== 'gemini-2.0-flash' && (err.status === 404 || /not found|not supported/i.test(err.message))) {
          return callGeminiDirectModel(apiKey, 'gemini-2.0-flash', opts);
        }
        throw err;
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
  // 4-B. AI 비주얼 이미지 생성 엔진 (Imagen 3 + Gemini Multimodal Image 자동 폴백)
  // ─────────────────────────────────────────────────────────────
  var IMAGE_PROMPT_SUFFIX = 'clean commercial photography, no text, no letters, no watermark, high resolution';

  function ensureImagePromptSuffix(p) {
    var base = String(p || '').trim().replace(/[,.\s]+$/, '');
    if (!base) base = 'Modern professional studio scene, warm natural lighting, premium commercial aesthetic';
    if (base.toLowerCase().indexOf('no text') === -1) {
      base += ', ' + IMAGE_PROMPT_SUFFIX;
    }
    return base;
  }

  // 캠페인 컨텍스트 또는 한글 지시문으로부터 최적의 영문 이미지 프롬프트 자동 구성
  function buildEnglishImagePrompt(ctx) {
    ctx = ctx || {};
    var raw = String(ctx.customInstruction || ctx.copyText || '').trim();
    var slotRole = String(ctx.slotRole || 'hero');
    var hay = (raw + ' ' + (ctx.channelName || '') + ' ' + (ctx.title || '')).toLowerCase();

    var subject = 'Modern professional Korean lifestyle and business studio photography, bright welcoming atmosphere';
    if (/k-pop|kpop|한국어|외국인|가사|korean/i.test(hay)) {
      subject = 'Diverse young international students smiling together in a bright modern studio while listening to K-pop music with headphones and holding a sleek study workbook';
    } else if (/수학|학원|오답노트|공부|성적|내신|입시|교육|학생/i.test(hay)) {
      subject = 'Bright modern private academy classroom desk with a neatly organized study planner, tablet showing upward achievement graph, warm encouraging lighting';
    } else if (/유튜브|지식창업|웨비나|강의|크리에이터|코칭/i.test(hay)) {
      subject = 'Confident content creator and online instructor in a sleek home studio with laptop, condenser microphone, and soft key lighting';
    } else if (/세무|절세|법인|세법|회계|노무|법무|컨설팅/i.test(hay)) {
      subject = 'Professional financial consultant in a modern executive office with a tablet showing clean financial growth charts and warm sunlight';
    } else if (/병원|건강검진|클리닉|의원|치과|한의원|진료/i.test(hay)) {
      subject = 'Friendly doctor in a bright premium medical clinic consulting room with modern diagnostic tablet and reassuring warm atmosphere';
    } else if (/카페|매장|식당|음료|쿠폰|멤버십|뷰티|네일|피트니스/i.test(hay)) {
      subject = 'Cozy specialty coffee shop counter with artisan latte art, warm ambient pendant lights, and happy customer holding a smartphone';
    } else if (/쇼핑몰|패션|신상|코디|옷장|라이프스타일|화보|커머스/i.test(hay)) {
      subject = 'Minimalist luxury fashion showroom with curated seasonal outfits on a sleek rack, soft studio lighting, editorial lookbook aesthetic';
    }

    var roleDesc = '';
    if (slotRole === 'thumb') {
      roleDesc = '16:9 hero thumbnail key visual, strong focal point, vibrant contrast';
    } else if (slotRole === 'slot1' || slotRole === 'hero') {
      roleDesc = '16:9 wide hero banner photography, inspiring main subject, shallow depth of field';
    } else if (slotRole === 'slot2' || slotRole === 'solution') {
      roleDesc = 'Premium product and digital guidebook mockup presentation on a clean desk, tangible service value';
    } else if (slotRole === 'slot3' || slotRole === 'trust') {
      roleDesc = 'Authentic positive transformation and customer satisfaction scene, trustworthy professional environment';
    }

    // 사용자가 이미 영문 프롬프트를 입력한 경우 그대로 보존
    if (raw && !/[\uAC00-\uD7A3]/.test(raw) && raw.length >= 15) {
      return ensureImagePromptSuffix(raw);
    }

    return ensureImagePromptSuffix(subject + (roleDesc ? ', ' + roleDesc : ''));
  }

  function callImagen3Endpoint(apiKey, promptText, aspectRatio) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=' + encodeURIComponent(apiKey);
    var body = {
      instances: [{ prompt: promptText }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio || '16:9',
        personGeneration: 'ALLOW_ADULT'
      }
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.error) {
          throw new Error((data && data.error && data.error.message) || ('Imagen 3 HTTP ' + res.status));
        }
        var pred = data.predictions && data.predictions[0];
        var b64 = pred && (pred.bytesBase64Encoded || (pred.image && pred.image.bytesBase64Encoded));
        if (!b64) throw new Error('Imagen 3 응답에 이미지 데이터가 없습니다.');
        var mime = (pred && pred.mimeType) || 'image/png';
        return 'data:' + mime + ';base64,' + b64;
      });
    });
  }

  function callGeminiImageModel(apiKey, modelName, promptText) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelName) + ':generateContent?key=' + encodeURIComponent(apiKey);
    var body = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Generate a single high-resolution commercial photograph matching this description: ' + promptText }]
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
        var cand = data.candidates && data.candidates[0];
        var parts = (cand && cand.content && cand.content.parts) || [];
        for (var i = 0; i < parts.length; i++) {
          var inl = parts[i].inlineData || parts[i].inline_data;
          if (inl && inl.data) {
            var mime = inl.mimeType || inl.mime_type || 'image/png';
            return 'data:' + mime + ';base64,' + inl.data;
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

    var rawInput = String(promptOrInstruction || '').trim();
    var hasKorean = /[\uAC00-\uD7A3]/.test(rawInput);

    // 1단계: 한글 지시어가 포함되어 있고 API 키가 있으면 영문 프롬프트로 먼저 정교하게 변환
    var promptPromise;
    if (hasKorean && apiKey) {
      promptPromise = callGemini({
        apiKey: apiKey,
        temperature: 0.3,
        maxOutputTokens: 300,
        systemInstruction: 'You are an expert commercial photography prompt engineer for Imagen 3. Translate the Korean visual instruction into one vivid, detailed English photography prompt (max 55 words). Output ONLY the English prompt sentence without quotes.',
        userText: rawInput
      }).then(function (engText) {
        return ensureImagePromptSuffix(engText);
      }).catch(function () {
        return buildEnglishImagePrompt({ customInstruction: rawInput, slotRole: opts.slotRole });
      });
    } else if (hasKorean) {
      promptPromise = Promise.resolve(buildEnglishImagePrompt({ customInstruction: rawInput, slotRole: opts.slotRole }));
    } else {
      promptPromise = Promise.resolve(ensureImagePromptSuffix(rawInput));
    }

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
      if (apiKey) {
        // 순차 폴백 체인: ① imagen-3.0-generate-002:predict -> ② gemini-2.0-flash-exp-image-generation -> ③ gemini-2.5-flash-image-preview -> ④ gemini-2.0-flash-preview-image-generation
        return callImagen3Endpoint(apiKey, finalPrompt, aspectRatio)
          .then(function (dUrl) { return finalizeDataUrl(dUrl, finalPrompt, 'imagen-3.0-generate-002'); })
          .catch(function () {
            return callGeminiImageModel(apiKey, 'gemini-2.0-flash-exp-image-generation', finalPrompt)
              .then(function (dUrl) { return finalizeDataUrl(dUrl, finalPrompt, 'gemini-2.0-flash-exp-image-generation'); });
          })
          .catch(function () {
            return callGeminiImageModel(apiKey, 'gemini-2.5-flash-image-preview', finalPrompt)
              .then(function (dUrl) { return finalizeDataUrl(dUrl, finalPrompt, 'gemini-2.5-flash-image-preview'); });
          })
          .catch(function () {
            return callGeminiImageModel(apiKey, 'gemini-2.0-flash-preview-image-generation', finalPrompt)
              .then(function (dUrl) { return finalizeDataUrl(dUrl, finalPrompt, 'gemini-2.0-flash-preview-image-generation'); });
          });
      }
      if (proxyUrl) {
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
      }
      return Promise.reject(new Error('NO_API_KEY'));
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

  // 정적 헬퍼 노출
  RagInterviewEngine.getConfig = getConfig;
  RagInterviewEngine.saveConfig = saveConfig;
  RagInterviewEngine.saveBridgeCampaign = saveBridgeCampaign;
  RagInterviewEngine.getBridgeCampaign = getBridgeCampaign;
  RagInterviewEngine.callGemini = callGemini;
  RagInterviewEngine.generateImage = generateImage;
  RagInterviewEngine.buildEnglishImagePrompt = buildEnglishImagePrompt;
  RagInterviewEngine.ensureImagePromptSuffix = ensureImagePromptSuffix;
  RagInterviewEngine.extractJson = extractJson;
  RagInterviewEngine.sanitizeText = sanitizeText;
  RagInterviewEngine.sanitizeObject = sanitizeObject;
  RagInterviewEngine.detectQuestionIntent = detectQuestionIntent;
  RagInterviewEngine.searchKnowledge = searchKnowledge;

  global.RagInterviewEngine = RagInterviewEngine;
})(typeof window !== 'undefined' ? window : this);
