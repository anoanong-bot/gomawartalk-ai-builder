/**
 * engines/RagInterviewEngine.js
 * [범용 엔진 2] 지식 카트리지 교체형 'RAG Q&A' + 단계별 인터뷰 진행 상태 머신
 *
 * ✅ 타 프로젝트에도 100% 재활용 가능한 순수 기술 엔진 — 고마워톡 전용 로직 없음
 * ✅ 외부에서 주입된 knowledgeCartridge(지식 데이터)와 interviewSteps(단계 정의)로 작동
 * ✅ Intent Routing: 기능·활용법·요금 질문 ↔ 캠페인 기획 답변 실시간 분류 후 복귀
 * ✅ 본체 HTML에서 <script src="engines/RagInterviewEngine.js"></script>로 호출하여 사용
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // RagInterviewEngine 생성자
  // options: {
  //   knowledgeCartridge: [...],  // data/GomawartalkManual.js 등 외부 지식팩 배열
  //   interviewSteps: [...],       // 단계별 인터뷰 질문 정의 배열
  //   proxyUrl: '',                // Backend_Proxy.gs doPost 웹앱 URL
  //   onMessage: fn(role, text),   // 메시지 렌더링 콜백
  //   onStateChange: fn(state),    // 상태 변경 콜백
  //   onComplete: fn(answers),     // 인터뷰 완료 콜백 (최종 JSON 수집)
  // }
  // ─────────────────────────────────────────────────────────────
  function RagInterviewEngine(options) {
    this.knowledgeCartridge = options.knowledgeCartridge || [];
    this.interviewSteps = options.interviewSteps || [];
    this.proxyUrl = options.proxyUrl || '';
    this.onMessage = options.onMessage || function () {};
    this.onStateChange = options.onStateChange || function () {};
    this.onComplete = options.onComplete || function () {};

    // 상태 머신
    this.state = {
      phase: 'IDLE',       // IDLE → QA_MODE → INTERVIEW → COMPLETE
      stepIndex: 0,        // 현재 인터뷰 단계
      answers: {},         // 수집된 답변 { stepKey: value }
      pendingStepIndex: 0, // Q&A 중단 직전 복귀할 인터뷰 단계
      conversationHistory: [], // { role: 'user'|'model', parts: [{text}] }
      isProcessing: false,
    };

    // 시스템 프롬프트 캐시
    this._systemPrompt = null;
  }

  // ─────────────────────────────────────────────────────────────
  // init: 엔진 초기화 및 첫 번째 인터뷰 질문 출력
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype.init = function () {
    this.state.phase = 'INTERVIEW';
    this.state.stepIndex = 0;
    this.state.answers = {};
    this.state.conversationHistory = [];
    this._systemPrompt = this._buildSystemPrompt();
    this._askCurrentStep();
    this.onStateChange(this.state);
  };

  // ─────────────────────────────────────────────────────────────
  // sendUserMessage: 사용자 입력 처리 (Intent Routing → 답변 처리 or Q&A)
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype.sendUserMessage = function (userText) {
    if (this.state.isProcessing || !userText.trim()) return;

    this.state.isProcessing = true;
    this.onMessage('user', userText);
    this.state.conversationHistory.push({ role: 'user', parts: [{ text: userText }] });

    const self = this;

    // Intent 라우팅: 질문인가, 인터뷰 답변인가?
    const isQuestion = this._detectQuestionIntent(userText);

    if (isQuestion && this.state.phase === 'INTERVIEW') {
      // Q&A 모드 진입 — 현재 인터뷰 단계 보존
      this.state.pendingStepIndex = this.state.stepIndex;
      this.state.phase = 'QA_MODE';
      this.onStateChange(this.state);

      this._callProxy(userText, 'QA').then(function (answer) {
        self.onMessage('model', answer);
        self.state.conversationHistory.push({ role: 'model', parts: [{ text: answer }] });

        // 자연스럽게 인터뷰로 복귀
        setTimeout(function () {
          self.state.phase = 'INTERVIEW';
          self.state.stepIndex = self.state.pendingStepIndex;
          self.onStateChange(self.state);
          self._askCurrentStep();
          self.state.isProcessing = false;
        }, 500);
      }).catch(function (err) {
        self.onMessage('model', '죄송합니다, 답변 생성에 실패했습니다. 다시 시도해 주세요.\n(' + err.message + ')');
        self.state.isProcessing = false;
      });

    } else if (this.state.phase === 'INTERVIEW' || this.state.phase === 'QA_MODE') {
      // 인터뷰 답변 처리
      const currentStep = this.interviewSteps[this.state.stepIndex];
      if (currentStep) {
        this._processAnswer(currentStep, userText).then(function (aiReply) {
          if (aiReply) {
            self.onMessage('model', aiReply);
            self.state.conversationHistory.push({ role: 'model', parts: [{ text: aiReply }] });
          }

          // 다음 단계로 이동
          self.state.stepIndex++;

          if (self.state.stepIndex >= self.interviewSteps.length) {
            // 인터뷰 완료
            self.state.phase = 'COMPLETE';
            self.onStateChange(self.state);
            self.onComplete(self.state.answers);
          } else {
            self.state.phase = 'INTERVIEW';
            self.onStateChange(self.state);
            self._askCurrentStep();
          }
          self.state.isProcessing = false;
        }).catch(function (err) {
          self.onMessage('model', '입력 처리 중 오류가 발생했습니다: ' + err.message);
          self.state.isProcessing = false;
        });
      } else {
        this.state.isProcessing = false;
      }

    } else {
      this.state.isProcessing = false;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // _detectQuestionIntent: 사용자 입력이 Q&A 질문인지 판별
  //   - 기능·활용법·요금·방법·가능한지 등 질문 패턴 감지
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype._detectQuestionIntent = function (text) {
    const questionPatterns = [
      /\?/,                                   // 물음표
      /인가요|인지요|인지요|되나요|가능한가요|있나요/,
      /방법|어떻게|얼마|요금|가격|플랜|차이/,
      /기능|지원|사용|활용|설명|알려|궁금|뭔가요|뭐예요/,
      /몇 ?개|몇 ?장|몇 ?자|최대|제한|한도/,
      /할 수 있나|할 수 없나|되는 건가/,
    ];
    return questionPatterns.some((pattern) => pattern.test(text));
  };

  // ─────────────────────────────────────────────────────────────
  // _askCurrentStep: 현재 인터뷰 단계 질문 출력
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype._askCurrentStep = function () {
    const step = this.interviewSteps[this.state.stepIndex];
    if (!step) return;

    let message = step.question;

    // 선택지가 있으면 버튼/목록으로 보조
    if (step.options && step.options.length > 0) {
      message += '\n\n' + step.options.map((opt, i) => (i + 1) + ') ' + opt).join('\n');
    }

    this.onMessage('model', message, step.renderType || 'TEXT', step.options || []);
    this.state.conversationHistory.push({ role: 'model', parts: [{ text: message }] });
  };

  // ─────────────────────────────────────────────────────────────
  // _processAnswer: 인터뷰 단계 답변 처리 및 저장
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype._processAnswer = function (step, userText) {
    // 답변 저장
    this.state.answers[step.key] = userText;

    // 단계에 AI 검증/보완이 필요한 경우
    if (step.requiresAI) {
      return this._callProxy(userText, 'PROCESS_ANSWER', step);
    }

    // 즉각 확인 메시지가 있으면 반환
    if (step.confirmMessage) {
      const confirm = step.confirmMessage.replace('{{answer}}', userText);
      return Promise.resolve(confirm);
    }

    return Promise.resolve(null);
  };

  // ─────────────────────────────────────────────────────────────
  // _callProxy: Backend_Proxy.gs를 통해 Gemini API 호출
  // mode: 'QA' (지식 카트리지 기반 Q&A) | 'PROCESS_ANSWER' (답변 처리)
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype._callProxy = function (userText, mode, stepContext) {
    if (!this.proxyUrl) {
      return Promise.reject(new Error('proxyUrl이 설정되지 않았습니다.'));
    }

    const payload = {
      action: 'chat',
      mode: mode,
      userText: userText,
      systemPrompt: this._systemPrompt,
      conversationHistory: this.state.conversationHistory.slice(-10), // 최근 10턴
      stepContext: stepContext || null,
    };

    return fetch(this.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('프록시 서버 오류: HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        return data.reply || data.text || '';
      });
  };

  // ─────────────────────────────────────────────────────────────
  // _buildSystemPrompt: 지식 카트리지를 기반으로 시스템 프롬프트 생성
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype._buildSystemPrompt = function () {
    let knowledgeText = '';

    if (this.knowledgeCartridge && this.knowledgeCartridge.length > 0) {
      knowledgeText = this.knowledgeCartridge.map(function (item) {
        return '[' + (item.topic || item.category || '지식') + ']\n' + (item.content || JSON.stringify(item));
      }).join('\n\n');
    }

    return (
      '당신은 친절하고 전문적인 AI 상담 도우미입니다.\n' +
      '사용자의 질문에 아래 지식 베이스를 근거로 정확하고 실용적으로 답변하세요.\n' +
      '지식 베이스에 없는 내용은 "확인이 필요한 사항입니다"라고 명확히 안내하세요.\n' +
      '인터뷰 질문 중 사용자가 서비스 관련 질문을 하면, 질문에 먼저 답한 뒤\n' +
      '자연스럽게 "다시 돌아가서 이전 질문을 이어가겠습니다"라고 복귀해 주세요.\n\n' +
      '=== 지식 베이스 ===\n' +
      knowledgeText
    );
  };

  // ─────────────────────────────────────────────────────────────
  // reset: 엔진 초기화
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype.reset = function () {
    this.state = {
      phase: 'IDLE',
      stepIndex: 0,
      answers: {},
      pendingStepIndex: 0,
      conversationHistory: [],
      isProcessing: false,
    };
    this._systemPrompt = null;
    this.onStateChange(this.state);
  };

  // ─────────────────────────────────────────────────────────────
  // getAnswers: 현재까지 수집된 답변 반환
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype.getAnswers = function () {
    return Object.assign({}, this.state.answers);
  };

  // ─────────────────────────────────────────────────────────────
  // getProgress: 현재 진행률 반환 (0.0 ~ 1.0)
  // ─────────────────────────────────────────────────────────────
  RagInterviewEngine.prototype.getProgress = function () {
    if (!this.interviewSteps || this.interviewSteps.length === 0) return 0;
    return Math.min(this.state.stepIndex / this.interviewSteps.length, 1.0);
  };

  // ─────────────────────────────────────────────────────────────
  // Public API 노출 (window.RagInterviewEngine)
  // ─────────────────────────────────────────────────────────────
  global.RagInterviewEngine = RagInterviewEngine;
})(window);
