/**
 * data/IndustryPresets.js
 * [데이터 3] 확정된 6대 주력 업종 완성형 샘플 캠페인 JSON
 *
 * ✅ PRD §2-5 명세 기반 — 6대 주력 업종 완성형 프리셋
 * ✅ CampaignMaster.json V2.0 스키마 완벽 준수
 * ✅ '비영리·교회' 통합 단일 프리셋 (pro_ngo_church)
 *
 * ⚠️  전체 파일에서 '뉴스레터'라는 단어는 절대 사용하지 않음 (카카오 알림톡 규정 준수)
 * ⚠️  카카오 알림톡 광고성 금지어(할인, 특가, 이벤트, 무료증정) 본문에 미사용
 */

window.GOMAWARTALK_INDUSTRY_PRESETS = {

  // ═══════════════════════════════════════════════════════════════
  // 1. 온라인 강사 / 유튜버 / 지식창업·코칭
  // ═══════════════════════════════════════════════════════════════
  online_edu: {
    meta: {
      industry_code: "online_edu",
      industry_label: "🎓 온라인 강사 / 유튜버 / 지식창업·코칭",
      description: "무료 특강·웨비나 모집 → 신청 확인 알림톡 → 핵심 요약 칼럼 및 수강 혜택 안내 (친구톡/캐러셀)",
      recommended_track: "TRACK_2",
      recommended_track_label: "쿠폰·자료 발급형",
    },
    tab1_basic_settings: {
      thumbnail_500x280: {
        badge: "무료 웨비나 한정 모집",
        headline: "유튜브 10만 구독자가 직접 알려주는\n지식창업 수익화 로드맵",
        subtext: "라이브 웨비나 참가 신청 → 핵심 자료집 즉시 발송",
      },
      title_30chars: "[신청] 지식창업 수익화 웨비나 무료 참가",
      description: "1시간 만에 지식을 상품화하는 실전 로드맵을 카카오로 받아보세요.",
      apply_btn_text: "무료 웨비나 신청하기",
      cancel_btn_text: "소식 그만 받기",
      show_top_bar: true,
      form_only_mode: false,
      friendtalk_rescue_2times: true,
      marketing_consent_popup: true,
    },
    tab2_landing_blocks: [
      { step: 1, type: "HERO", tag: "지식창업·유튜버 필독", title: "조회수 없이도 월 1,000만 원?\n'지식 패키지' 판매의 비밀", subtitle: "구독자 10만 채널 운영자가 처음 공개하는 수익화 공식" },
      { step: 2, type: "PAIN_POINT", title: "이런 고민, 혹시 나만의 이야기인가요?", items: ["열심히 콘텐츠를 올리는데 수익이 나지 않아요", "강의를 만들고 싶은데 어떤 주제로 시작해야 할지 모르겠어요", "온라인 강의 플랫폼에 올려봤는데 판매가 안 돼요"] },
      { step: 3, type: "SOLUTION", title: "1시간 웨비나에서 이 모든 답을 드립니다", points: ["1부: 수익 나는 지식 주제 선정법 (내 강점 발굴 워크시트 제공)", "2부: 클릭을 부르는 강의 패키지 구성 공식", "3부: 첫 100명 수강생 모으는 카카오 채널 활용 전략"] },
      { step: 4, type: "TRUST_PROOF", title: "이미 500명이 이 방법으로 첫 수익을 냈습니다", stat_highlight: "웨비나 참가자 평균 첫 판매까지 21일 / 수강 전환율 68%" },
      { step: 5, type: "BOTTOM_CUE", notice: "카카오 로그인 한 번으로 별도 입력 없이 즉시 신청됩니다", arrow_text: "아래 보라색 [신청하기] 버튼을 눌러 무료 참가 신청하세요" },
    ],
    tab3_form: {
      form_title: "맞춤 자료 발송을 위한 10초 설문",
      questions: [
        {
          order: 1, type: "MULTIPLE_CHOICE", required: true,
          question_text: "현재 지식창업 단계가 어떻게 되시나요?",
          options: [
            { answer_text: "아직 아무것도 없어요 (완전 초보)", tag: "초보_지식창업", sheet_field: "창업단계", sheet_value: "초보" },
            { answer_text: "SNS·유튜브 채널은 있어요 (채널 운영 중)", tag: "채널운영중", sheet_field: "창업단계", sheet_value: "채널운영" },
            { answer_text: "강의나 전자책을 만들어봤어요 (경험 있음)", tag: "경험자", sheet_field: "창업단계", sheet_value: "경험자" },
          ],
        },
      ],
    },
    tab4_interval_sequence: [
      {
        step: 1, timing: "IMMEDIATE", template_type: "ALIMTALK",
        body_preview: "웨비나 신청이 완료되었습니다. 당일 참가 링크를 보내드릴게요!",
        note: "알림톡 공용 템플릿 사용 — 광고성 문구 없는 순수 접수 확인",
      },
      {
        step: 2, timing: "AFTER_1_DAY_0900", template_type: "FREE_FRIENDTALK",
        body_preview: "#{이름}님, 어제 웨비나 핵심 내용 요약 칼럼과 워크시트를 보내드립니다.",
        image_ratio: "800x400",
        note: "친구톡 — 채널 추가 완료 고객 대상, 칼럼·자료 발송",
      },
      {
        step: 3, timing: "AFTER_3_DAYS_0900", template_type: "BRAND_CAROUSEL",
        body_preview: "#{@창업단계} 단계별 맞춤 수익화 로드맵 3단계를 공개합니다.",
        note: "캐러셀 — 단계별 맞춤 콘텐츠 (뜰채 조건 분기 활용)",
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 2. 학원 / 교습소 / 교육기관
  // ═══════════════════════════════════════════════════════════════
  academy: {
    meta: {
      industry_code: "academy",
      industry_label: "🏫 학원 / 교습소 / 교육기관",
      description: "입시·방학 설명회 예약 리마인드 → 자녀 학년별 맞춤 학습 로드맵 처방 (뜰채 분기)",
      recommended_track: "TRACK_4",
      recommended_track_label: "설문 진단 & 맞춤 분기형",
    },
    tab1_basic_settings: {
      thumbnail_500x280: {
        badge: "겨울방학 한정 무료배포",
        headline: "중3 겨울방학, 고등수학 1등급 결정짓는\n오답노트 비법",
        subtext: "장희지 수학학원 원장 직강 시크릿 자료집",
      },
      title_30chars: "[신청] 고등수학 1등급 오답노트 자료집 & 학습진단",
      description: "우리 아이 학년에 딱 맞는 겨울방학 수학 학습 로드맵과 오답노트 양식을 카카오로 받아보세요.",
      apply_btn_text: "1초 만에 자료집 & 맞춤 진단 신청하기",
      cancel_btn_text: "소식 그만 받기 (신청취소)",
      show_top_bar: true,
      form_only_mode: false,
      friendtalk_rescue_2times: true,
      marketing_consent_popup: true,
    },
    tab2_landing_blocks: [
      { step: 1, type: "HERO", tag: "예비 중3·고1 학부모님 필독", title: "학원을 다녀도 수학 점수가 그대로라면?\n원인은 '오답노트'에 있습니다", subtitle: "학년별 맞춤 수학 공부법 & 오답노트 양식 신청 즉시 발송" },
      { step: 2, type: "PAIN_POINT", title: "혹시 우리 아이도 이런 상태인가요?", items: ["문제집은 많이 푸는데 시험만 보면 아는 문제를 틀려요", "오답노트를 쓰라고 해도 베껴 적기만 하고 다시 안 봐요", "이번 겨울방학에 선행을 해야 할지 복습을 해야 할지 막막해요"] },
      { step: 3, type: "SOLUTION", title: "장희지 원장이 10년간 검증한\n학년별 맞춤 수학 처방전을 드립니다", points: ["1편. 우리 아이 학년별 겨울방학 필수 단원 체크리스트", "2편. 시험 시간 15분 단축하는 실전 오답노트 작성 공식", "3편. 중하위권에서 1등급 도약한 학생들의 실제 노트 공개"] },
      { step: 4, type: "TRUST_PROOF", title: "이미 300명의 학부모님이 경험하고\n성적 향상으로 증명했습니다", stat_highlight: "수강생 평균 +24점 상승 / 내신 1등급 배출률 82%" },
      { step: 5, type: "BOTTOM_CUE", notice: "카카오 로그인 한 번으로 별도 입력 없이 즉시 접수됩니다", arrow_text: "아래 보라색 [신청하기] 버튼을 눌러 지금 바로 신청하세요" },
    ],
    tab3_form: {
      form_title: "우리 아이 학년별 맞춤 자료 발송을 위한 10초 설문",
      questions: [
        {
          order: 1, type: "MULTIPLE_CHOICE", required: true,
          question_text: "현재 자녀분의 학년은 어떻게 되나요?",
          options: [
            { answer_text: "중학교 1~2학년 (기초 다지기)", tag: "중1_2학부모", sheet_field: "고객진단.학년", sheet_value: "중1~2학년" },
            { answer_text: "중학교 3학년 (예비 고1 집중 대비)", tag: "예비고1학부모", sheet_field: "고객진단.학년", sheet_value: "예비고1" },
            { answer_text: "고등학교 1~2학년 (내신·수능 병행)", tag: "고1_2학부모", sheet_field: "고객진단.학년", sheet_value: "고1~2학년" },
          ],
        },
        {
          order: 2, type: "PHONE", required: false,
          question_text: "원장님의 1:1 학습 진단 해피콜을 받으실 연락처를 남겨주세요. (선택)",
        },
      ],
    },
    tab4_interval_sequence: [
      { step: 1, timing: "IMMEDIATE", template_type: "ALIMTALK", note: "알림톡 공용 — 신청 접수 확인 + 1편 로드맵 링크 + 채널 추가 유도" },
      { step: 2, timing: "AFTER_1_DAY_0900", template_type: "FREE_FRIENDTALK", branch_condition: "태그 = 예비고1학부모", note: "친구톡 — 예비 고1 맞춤 킬러 단원 칼럼" },
      { step: 3, timing: "AFTER_3_DAYS_0900", template_type: "BRAND_CAROUSEL", note: "캐러셀 — 학년별 겨울방학 커리큘럼 소개 2~3장" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 3. 세무·법무·노무·컨설팅 & 비영리단체·교회·후원재단 (통합)
  // ═══════════════════════════════════════════════════════════════
  pro_ngo_church: {
    meta: {
      industry_code: "pro_ngo_church",
      industry_label: "💼 세무·법무·노무·컨설팅 & 🏛️ 비영리단체·교회·후원재단",
      description: "회원·교인·후원 모임 등록 → 신청 확인 알림톡 → 채널 친구 대상 전문 칼럼·주보·후원 현장 이야기 정기 발송 (친구톡/브랜드메시지) → 주요 일정·긴급 공지 (날짜발송)",
      recommended_track: "TRACK_3",
      recommended_track_label: "정기 칼럼·정보 연재형 (회원 등록 후 채널 친구 대상 발송)",
    },
    tab1_basic_settings: {
      thumbnail_500x280: {
        badge: "2026년 세법 개정 핵심 정리",
        headline: "소상공인·1인 법인 대표가 꼭 알아야 할\n절세 포인트 5가지",
        subtext: "세무사 직강 실전 가이드 카카오로 받아보기",
      },
      title_30chars: "[신청] 소상공인 절세 핵심 가이드 발송 신청",
      description: "2026 세법 개정 핵심 절세 포인트를 카카오로 받아보세요. 월 1회 세무 칼럼도 함께 발송됩니다.",
      apply_btn_text: "절세 가이드 신청하기",
      cancel_btn_text: "소식 그만 받기",
      show_top_bar: true,
      form_only_mode: false,
      friendtalk_rescue_2times: true,
      marketing_consent_popup: true,
    },
    tab2_landing_blocks: [
      { step: 1, type: "HERO", tag: "소상공인·1인 법인 대표님 필독", title: "2026 세법 개정, 나에게 유리한 항목은?\n대표님만 모르면 손해입니다", subtitle: "세무사가 직접 정리한 절세 포인트 5가지 무료 발송" },
      { step: 2, type: "PAIN_POINT", title: "이런 상황이 익숙하신가요?", items: ["세금 신고 시즌마다 얼마를 내야 할지 몰라 불안해요", "세무사에게 물어보고 싶은데 어디서부터 시작해야 할지 막막해요", "절세할 수 있는 방법이 있는 것 같은데 아무도 알려주지 않아요"] },
      { step: 3, type: "SOLUTION", title: "10년 경력 세무사가\n핵심만 압축해 전달해 드립니다", points: ["1편. 2026 세법 개정으로 달라지는 소득세·법인세 핵심 정리", "2편. 소상공인이 놓치기 쉬운 경비 처리 항목 TOP 10", "3편. 1인 법인 전환 시 절세 효과 시뮬레이션"] },
      { step: 4, type: "TRUST_PROOF", title: "현재 350개 사업체의 세무 파트너입니다", stat_highlight: "고객사 평균 절세액 연 480만 원 / 세무 조사 대응 성공률 100%" },
      { step: 5, type: "BOTTOM_CUE", notice: "카카오 로그인 한 번으로 별도 입력 없이 즉시 신청됩니다", arrow_text: "아래 보라색 [신청하기] 버튼을 눌러 절세 가이드를 받아보세요" },
    ],
    tab3_form: {
      form_title: "맞춤 자료 발송을 위한 간단 설문",
      questions: [
        {
          order: 1, type: "MULTIPLE_CHOICE", required: true,
          question_text: "어떤 사업 형태로 운영 중이신가요?",
          options: [
            { answer_text: "개인사업자 (일반·간이과세자)", tag: "개인사업자", sheet_field: "고객정보.사업유형", sheet_value: "개인사업자" },
            { answer_text: "법인 대표 (1인 법인 포함)", tag: "법인대표", sheet_field: "고객정보.사업유형", sheet_value: "법인" },
            { answer_text: "비영리단체·교회·후원재단 관계자", tag: "비영리", sheet_field: "고객정보.사업유형", sheet_value: "비영리" },
          ],
        },
      ],
    },
    tab4_interval_sequence: [
      { step: 1, timing: "IMMEDIATE", template_type: "ALIMTALK", note: "알림톡 공용 — 가이드 접수 확인 + 1편 세법 칼럼 링크" },
      { step: 2, timing: "AFTER_7_DAYS_0900", template_type: "FREE_FRIENDTALK", note: "친구톡 — 2편 경비처리 항목 칼럼 (채널 친구 대상)" },
      { step: 3, timing: "AFTER_14_DAYS_0900", template_type: "BRAND_CAROUSEL", note: "캐러셀 — 1인 법인 전환 절세 시뮬레이션 카드 2~3장" },
    ],
    tab5_date_messages_note: "주요 세무 신고 기한 D-7·D-1 날짜발송 추가 권장 (부가세 신고, 종합소득세 신고 등)",
  },

  // ═══════════════════════════════════════════════════════════════
  // 4. 병원 / 의원 / 치과 / 한의원 / 약국
  // ═══════════════════════════════════════════════════════════════
  medical: {
    meta: {
      industry_code: "medical",
      industry_label: "🏥 병원 / 의원 / 치과 / 한의원 / 약국",
      description: "검진·상담 신청 확인 및 사전 주의사항 안내 (알림톡) → 계절별 건강 칼럼 및 내원 혜택 안내 (친구톡)",
      recommended_track: "TRACK_1",
      recommended_track_label: "일정·행사 리마인드형",
    },
    tab1_basic_settings: {
      thumbnail_500x280: {
        badge: "12월 한정 — 무료 건강검진 상담",
        headline: "우리 가족 건강을 지키는\n맞춤 건강검진 패키지 신청",
        subtext: "예약 확인 즉시 사전 준비 안내 카카오 발송",
      },
      title_30chars: "[신청] 맞춤 건강검진 무료 상담 예약",
      description: "연령별·증상별 맞춤 건강검진 패키지를 추천해 드립니다. 예약 완료 즉시 사전 준비 안내를 카카오로 보내드립니다.",
      apply_btn_text: "건강검진 상담 예약하기",
      cancel_btn_text: "소식 그만 받기",
      show_top_bar: true,
      form_only_mode: false,
      friendtalk_rescue_2times: true,
      marketing_consent_popup: true,
    },
    tab2_landing_blocks: [
      { step: 1, type: "HERO", tag: "30~50대 직장인·주부 필독", title: "1년에 한 번, 내 몸 상태를\n정확히 아는 것이 최고의 예방입니다", subtitle: "연령·성별 맞춤 건강검진 패키지 — 예약 즉시 사전 가이드 발송" },
      { step: 2, type: "PAIN_POINT", title: "건강검진, 이런 고민이 있으신가요?", items: ["어떤 항목을 받아야 할지 모르겠어요", "예전에 받았는데 결과 해석을 못 했어요", "시간이 없어서 계속 미루고 있어요"] },
      { step: 3, type: "SOLUTION", title: "담당 의사가 직접 맞춤 패키지를 추천해 드립니다", points: ["연령·성별에 맞는 필수 검사 항목 추천", "검진 결과 1:1 상담 (궁금한 점 모두 해소)", "당일 검진 가능 — 대기 시간 최소화 예약제 운영"] },
      { step: 4, type: "TRUST_PROOF", title: "지역 1위 건강검진 센터, 10년 신뢰", stat_highlight: "연간 검진 인원 5,000명 / 고객 만족도 98.3%" },
      { step: 5, type: "BOTTOM_CUE", notice: "카카오 로그인 한 번으로 예약이 완료됩니다", arrow_text: "아래 보라색 [예약하기] 버튼을 눌러 지금 바로 예약하세요" },
    ],
    tab3_form: {
      form_title: "맞춤 검진 추천을 위한 간단 설문",
      questions: [
        {
          order: 1, type: "MULTIPLE_CHOICE", required: true,
          question_text: "건강검진을 원하시는 주된 이유가 무엇인가요?",
          options: [
            { answer_text: "정기 검진 (1~2년에 한 번 루틴 관리)", tag: "정기검진", sheet_field: "검진목적", sheet_value: "정기" },
            { answer_text: "특정 증상 확인 (최근 불편한 증상 있음)", tag: "증상확인", sheet_field: "검진목적", sheet_value: "증상" },
            { answer_text: "가족력 확인 (부모님 질환 이력 있음)", tag: "가족력", sheet_field: "검진목적", sheet_value: "가족력" },
          ],
        },
        {
          order: 2, type: "PHONE", required: false,
          question_text: "예약 확인 해피콜을 받으실 연락처를 남겨주세요. (선택)",
        },
      ],
    },
    tab4_interval_sequence: [
      { step: 1, timing: "IMMEDIATE", template_type: "ALIMTALK", note: "알림톡 공용 — 검진 예약 확인 + 사전 주의사항 안내" },
      { step: 2, timing: "AFTER_3_DAYS_0900", template_type: "ALIMTALK", note: "알림톡 — D-1 최종 안내 (검진 전날 발송 — 날짜발송 연계 권장)" },
      { step: 3, timing: "AFTER_14_DAYS_0900", template_type: "FREE_FRIENDTALK", note: "친구톡 — 계절별 건강 관리 칼럼 발송 (채널 친구 대상)" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 5. 오프라인 매장 — 카페 / 식당 / 뷰티·네일 / 피트니스
  // ═══════════════════════════════════════════════════════════════
  local_store: {
    meta: {
      industry_code: "local_store",
      industry_label: "☕ 오프라인 매장 — 카페 / 식당 / 뷰티·네일 / 피트니스",
      description: "멤버십 등록 확인 (알림톡) → 첫 방문 혜택 카톡 쿠폰 (자유작성 친구톡) → 방문 스탬프 점수 누적",
      recommended_track: "TRACK_5",
      recommended_track_label: "스탬프·열독 점수 누적형",
    },
    tab1_basic_settings: {
      thumbnail_500x280: {
        badge: "첫 등록 혜택 — 카카오로 쿠폰 발송",
        headline: "우리 카페 단골이 되면\n이런 혜택이 쏟아집니다",
        subtext: "멤버십 등록 → 첫 방문 쿠폰 카카오 즉시 발송",
      },
      title_30chars: "[신청] 단골 멤버십 등록 & 첫 방문 쿠폰",
      description: "멤버십 등록 즉시 첫 방문 혜택 쿠폰을 카카오로 받아보세요. 방문할 때마다 스탬프가 쌓입니다.",
      apply_btn_text: "멤버십 등록 & 쿠폰 받기",
      cancel_btn_text: "소식 그만 받기",
      show_top_bar: true,
      form_only_mode: false,
      friendtalk_rescue_2times: true,
      marketing_consent_popup: true,
    },
    tab2_landing_blocks: [
      { step: 1, type: "HERO", tag: "우리 동네 단골 모집", title: "자주 오는 분에게\n더 특별한 혜택을 드립니다", subtitle: "멤버십 등록 즉시 첫 방문 쿠폰 카카오 발송" },
      { step: 2, type: "PAIN_POINT", title: "이런 경험 있으신가요?", items: ["자주 가는 카페인데 아무 혜택이 없어요", "쿠폰 종이를 맨날 집에 두고 와서 못 써요", "단골인데 신규 고객이랑 똑같이 취급받는 느낌"] },
      { step: 3, type: "SOLUTION", title: "카카오 멤버십으로 모든 혜택이 자동화됩니다", points: ["방문 스탬프 10개 적립 → 무료 음료 1잔 자동 쿠폰 발송", "생일 달 → 특별 혜택 카카오 자동 발송", "시즌 한정 메뉴 출시 → 단골 멤버 먼저 카카오 알림"] },
      { step: 4, type: "TRUST_PROOF", title: "현재 820명의 단골 멤버와 함께하고 있습니다", stat_highlight: "멤버 재방문율 76% / 평균 월 4.2회 방문" },
      { step: 5, type: "BOTTOM_CUE", notice: "카카오 로그인 한 번으로 멤버십 등록이 완료됩니다", arrow_text: "아래 보라색 [등록하기] 버튼을 눌러 지금 바로 단골 멤버가 되세요" },
    ],
    tab3_form: {
      form_title: "멤버십 맞춤 혜택 설정을 위한 간단 설문",
      questions: [
        {
          order: 1, type: "MULTIPLE_CHOICE", required: true,
          question_text: "주로 어떤 시간대에 방문하시나요?",
          options: [
            { answer_text: "오전 (출근 전·브런치 타임)", tag: "오전방문", sheet_field: "방문패턴", sheet_value: "오전" },
            { answer_text: "점심·오후 (11시~17시)", tag: "오후방문", sheet_field: "방문패턴", sheet_value: "오후" },
            { answer_text: "저녁·야간 (17시 이후)", tag: "저녁방문", sheet_field: "방문패턴", sheet_value: "저녁" },
          ],
        },
      ],
    },
    tab4_interval_sequence: [
      { step: 1, timing: "IMMEDIATE", template_type: "ALIMTALK", note: "알림톡 공용 — 멤버십 등록 확인 + 첫 방문 쿠폰 안내" },
      { step: 2, timing: "AFTER_1_DAY_0900", template_type: "FREE_FRIENDTALK", note: "친구톡 — 첫 방문 쿠폰 발송 (카카오 쿠폰 링크 직결 — 자유작성 친구톡만 가능)", kakao_coupon_button: true },
      { step: 3, timing: "AFTER_7_DAYS_0900", template_type: "FREE_FRIENDTALK", note: "친구톡 — 스탬프 현황 안내 + 10개 달성 임박 고객 맞춤 메시지", stamp_score_branch: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 6. 쇼핑몰 / 브랜드 커머스
  // ═══════════════════════════════════════════════════════════════
  commerce: {
    meta: {
      industry_code: "commerce",
      industry_label: "🛒 쇼핑몰 / 브랜드 커머스",
      description: "프리오더·신상 알림 신청 확인 (알림톡) → 고객 선호 스타일별 맞춤 코디 캐러셀 화보 → 재구매 혜택 발송",
      recommended_track: "TRACK_4",
      recommended_track_label: "설문 진단 & 맞춤 분기형",
    },
    tab1_basic_settings: {
      thumbnail_500x280: {
        badge: "2026 FW 신상 — 사전 알림 신청",
        headline: "내 스타일에 딱 맞는 신상품\n출시 즉시 카카오로 받아보세요",
        subtext: "스타일 취향 선택 → 맞춤 코디 화보 발송",
      },
      title_30chars: "[신청] 신상품 출시 알림 & 맞춤 코디 추천",
      description: "내 스타일 취향을 알려주시면 출시 즉시 맞춤 코디 화보를 카카오로 보내드립니다.",
      apply_btn_text: "내 스타일 등록하고 알림 받기",
      cancel_btn_text: "알림 그만 받기",
      show_top_bar: true,
      form_only_mode: false,
      friendtalk_rescue_2times: true,
      marketing_consent_popup: true,
    },
    tab2_landing_blocks: [
      { step: 1, type: "HERO", tag: "패션·라이프스타일 쇼핑몰 고객님", title: "수백 개 신상품 중\n내 옷장에 딱 맞는 아이템만 골라 드립니다", subtitle: "스타일 취향 등록 → 출시 즉시 맞춤 코디 화보 카카오 발송" },
      { step: 2, type: "PAIN_POINT", title: "쇼핑할 때 이런 불편함 느끼셨나요?", items: ["신상품이 쏟아지는데 내 스타일에 맞는 걸 찾기 힘들어요", "좋아하는 브랜드 신상이 언제 나오는지 놓칠까봐 걱정돼요", "세일이 끝난 후에야 알게 되어 아쉬웠던 경험이 있어요"] },
      { step: 3, type: "SOLUTION", title: "AI 스타일 매칭으로 나만의 큐레이션을 제공합니다", points: ["취향 선택 한 번 → 출시마다 맞춤 코디 화보 자동 발송", "시즌 첫 출시 → 단독 사전 열람 기회 제공", "재구매 고객 → 추가 적립·혜택 자동 발송"] },
      { step: 4, type: "TRUST_PROOF", title: "12,000명의 고객이 맞춤 코디를 받고 있습니다", stat_highlight: "알림 신청 고객 재구매율 2.4배 / 평균 구매 단가 38% 상승" },
      { step: 5, type: "BOTTOM_CUE", notice: "카카오 로그인 한 번으로 취향 등록이 완료됩니다", arrow_text: "아래 보라색 [등록하기] 버튼을 눌러 맞춤 코디 알림을 신청하세요" },
    ],
    tab3_form: {
      form_title: "맞춤 코디 추천을 위한 스타일 취향 설문",
      questions: [
        {
          order: 1, type: "MULTIPLE_CHOICE", required: true,
          question_text: "평소 선호하는 스타일은 무엇인가요?",
          options: [
            { answer_text: "미니멀·베이직 (무채색·깔끔한 실루엣)", tag: "스타일_미니멀", sheet_field: "스타일취향", sheet_value: "미니멀" },
            { answer_text: "캐주얼·스트리트 (편하고 트렌디한)", tag: "스타일_캐주얼", sheet_field: "스타일취향", sheet_value: "캐주얼" },
            { answer_text: "페미닌·로맨틱 (꽃·레이스·파스텔)", tag: "스타일_페미닌", sheet_field: "스타일취향", sheet_value: "페미닌" },
            { answer_text: "오피스·비즈니스 캐주얼", tag: "스타일_오피스", sheet_field: "스타일취향", sheet_value: "오피스" },
          ],
        },
      ],
    },
    tab4_interval_sequence: [
      { step: 1, timing: "IMMEDIATE", template_type: "ALIMTALK", note: "알림톡 공용 — 프리오더 신청 확인 + 출시 예정일 안내" },
      { step: 2, timing: "AFTER_1_DAY_0900", template_type: "BRAND_CAROUSEL", note: "캐러셀 — 취향별 맞춤 코디 화보 2~4장 (뜰채 스타일 분기)", style_branch: true },
      { step: 3, timing: "AFTER_7_DAYS_0900", template_type: "FREE_FRIENDTALK", note: "친구톡 — 재구매 혜택 쿠폰 (카카오 쿠폰 링크 직결)", kakao_coupon_button: true },
    ],
  },
};
