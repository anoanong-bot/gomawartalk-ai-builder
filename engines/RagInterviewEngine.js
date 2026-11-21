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
      return false;
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
  RagInterviewEngine.extractJson = extractJson;
  RagInterviewEngine.sanitizeText = sanitizeText;
  RagInterviewEngine.sanitizeObject = sanitizeObject;
  RagInterviewEngine.detectQuestionIntent = detectQuestionIntent;
  RagInterviewEngine.searchKnowledge = searchKnowledge;

  global.RagInterviewEngine = RagInterviewEngine;
})(typeof window !== 'undefined' ? window : this);
