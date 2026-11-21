/**
 * data/AlimtalkTemplates.js
 * [데이터 2] 고마워톡 어드민 '알림톡 템플릿 에디터' DB 규격 1:1 매칭 데이터 (샘플 10종)
 *
 * ✅ 개발팀장님으로부터 전달받는 전체 JSON 덤프 파일을 변환 없이 그대로 덮어쓰기 가능
 * ✅ 고마워톡 어드민 [알림톡 템플릿 에디터] 화면 입력 항목과 1:1 일치
 * ✅ 조종석 [📥 템플릿 JSON 업데이트] 모달을 통해 배열 통째 교체 가능
 *
 * 필드 설명:
 *   template_name     : 어드민 [템플릿 이름]
 *   template_id       : 어드민 [템플릿 아이디] (40자 해시코드)
 *   use_yn            : 어드민 [사용] — "O" 활성 | "X" 비활성 (O인 것만 조종석 로드)
 *   group_name        : 어드민 [그룹] (신청확인, 일정안내, 브랜드템플릿 등)
 *   sort_order        : 어드민 [순서]
 *   public_scope      : 어드민 [공개] — "전체채널" 공용 | "일부채널" 특정 파트너 전용
 *   allowed_channel_ids: 어드민 [일부채널 아이디 리스트] (예: "15, 22")
 *   header_type       : 프리뷰 렌더링 — "IMAGE" 샘플이미지 상단 | "TEXT_VAR" 강조타이틀형 | "NONE"
 *   body_text         : 어드민 [본문 작성] (#{변수명} 형식)
 *   variables         : 어드민 [변수 입력] (#{이름}은 카카오 자동치환 → 조종석에서 '비워두기')
 *   sample_image_url  : 어드민 [샘플 이미지]
 *   buttons           : 어드민 [버튼 추가] — btn_type: "WL" 웹링크 | "AL" 앱링크
 */

window.GOMAWARTALK_ALIMTALK_TEMPLATES = [

  // ═══════════════════════════════════════════════════════════════
  // 그룹: 신청확인_공용 (전체 채널 공용 — 모든 파트너 사용)
  // ═══════════════════════════════════════════════════════════════
  {
    "template_name": "신청 접수 및 안내자료 발송 완료",
    "template_id": "f5af8a838d06a71e678e565a513d34a61ffa7b1c",
    "use_yn": "O",
    "group_name": "신청확인_공용",
    "sort_order": 0,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "IMAGE",
    "body_text": "안녕하세요 #{이름}님!\n신청하신 [#{콘텐츠 제목}] 접수가 완료되었습니다.\n\n■ 상세 안내\n#{콘텐츠 소개}\n\n아래 버튼을 눌러 상세 내용을 확인해 주세요.\n\n※ 상단 노란색 [채널 추가]를 눌러두시면\n  다음 편 자료도 카카오로 받아보실 수 있습니다.",
    "variables": ["콘텐츠 제목", "콘텐츠 소개"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "상세 내용 확인하기", "btn_type": "WL" }
    ]
  },

  {
    "template_name": "신청 완료 — 등록번호 발급",
    "template_id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "use_yn": "O",
    "group_name": "신청확인_공용",
    "sort_order": 1,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "TEXT_VAR",
    "body_text": "안녕하세요 #{이름}님!\n[#{콘텐츠 제목}] 신청이 정상적으로 접수되었습니다.\n\n■ 등록번호: #{등록번호}\n■ 신청일시: #{신청일시}\n\n#{안내 사항}\n\n문의사항은 채널 채팅으로 연락해 주세요.",
    "variables": ["콘텐츠 제목", "등록번호", "신청일시", "안내 사항"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "신청 내역 확인", "btn_type": "WL" },
      { "btn_name": "채널 채팅 문의", "btn_type": "AL" }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 그룹: 일정안내_공용 (전체 채널 공용)
  // ═══════════════════════════════════════════════════════════════
  {
    "template_name": "행사·교육 일정 리마인드 (D-3)",
    "template_id": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
    "use_yn": "O",
    "group_name": "일정안내_공용",
    "sort_order": 0,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "NONE",
    "body_text": "안녕하세요 #{이름}님!\n신청하신 [#{행사명}]이 3일 뒤로 다가왔습니다.\n\n■ 일시: #{행사 일시}\n■ 장소: #{행사 장소}\n■ 준비물: #{준비물}\n\n일정을 미리 확인하시고, 편안하게 참석해 주세요!\n\n※ 취소·변경은 행사 전날까지 채널 채팅으로 연락해 주세요.",
    "variables": ["행사명", "행사 일시", "행사 장소", "준비물"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "행사 상세 안내 보기", "btn_type": "WL" }
    ]
  },

  {
    "template_name": "행사·교육 일정 리마인드 (D-1 / 전날)",
    "template_id": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
    "use_yn": "O",
    "group_name": "일정안내_공용",
    "sort_order": 1,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "NONE",
    "body_text": "안녕하세요 #{이름}님!\n[#{행사명}]이 내일입니다! 최종 안내를 전해드립니다.\n\n■ 일시: #{행사 일시}\n■ 장소: #{행사 장소}\n■ 체크포인트: #{체크포인트}\n\n내일 뵙겠습니다! 오시는 길 미리 확인해 주세요.",
    "variables": ["행사명", "행사 일시", "행사 장소", "체크포인트"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "오시는 길 확인", "btn_type": "WL" }
    ]
  },

  {
    "template_name": "당일 행사 최종 안내",
    "template_id": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3",
    "use_yn": "O",
    "group_name": "일정안내_공용",
    "sort_order": 2,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "NONE",
    "body_text": "안녕하세요 #{이름}님!\n오늘 [#{행사명}] 당일입니다.\n\n■ 시작 시간: #{시작 시간}\n■ 장소: #{행사 장소}\n■ 입장 안내: #{입장 안내}\n\n오늘 함께해 주셔서 감사합니다!",
    "variables": ["행사명", "시작 시간", "행사 장소", "입장 안내"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "현장 안내 확인", "btn_type": "WL" }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 그룹: 진단_상담_공용 (전체 채널 공용)
  // ═══════════════════════════════════════════════════════════════
  {
    "template_name": "상담·진단 예약 확인",
    "template_id": "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
    "use_yn": "O",
    "group_name": "진단_상담_공용",
    "sort_order": 0,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "NONE",
    "body_text": "안녕하세요 #{이름}님!\n[#{상담 유형}] 예약이 완료되었습니다.\n\n■ 예약 일시: #{예약 일시}\n■ 담당: #{담당자}\n■ 사전 준비: #{사전 준비 사항}\n\n예약 변경·취소는 방문 전날까지 채널 채팅으로 연락해 주세요.",
    "variables": ["상담 유형", "예약 일시", "담당자", "사전 준비 사항"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "예약 내역 확인", "btn_type": "WL" },
      { "btn_name": "오시는 길", "btn_type": "WL" }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 그룹: 멤버십_등록_공용 (전체 채널 공용)
  // ═══════════════════════════════════════════════════════════════
  {
    "template_name": "멤버십·모임 등록 완료",
    "template_id": "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5",
    "use_yn": "O",
    "group_name": "멤버십_등록_공용",
    "sort_order": 0,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "IMAGE",
    "body_text": "안녕하세요 #{이름}님!\n[#{모임·멤버십 명}] 등록을 환영합니다! 🎉\n\n#{환영 메시지}\n\n■ 혜택 안내: #{혜택 요약}\n\n채널을 추가하시면 정기 소식과 혜택을 카카오로 받아보실 수 있습니다.",
    "variables": ["모임·멤버십 명", "환영 메시지", "혜택 요약"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "멤버십 혜택 확인", "btn_type": "WL" }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 그룹: 프리오더_커머스_공용 (전체 채널 공용)
  // ═══════════════════════════════════════════════════════════════
  {
    "template_name": "프리오더·신상품 알림 신청 확인",
    "template_id": "a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6",
    "use_yn": "O",
    "group_name": "프리오더_커머스_공용",
    "sort_order": 0,
    "public_scope": "전체채널",
    "allowed_channel_ids": "",
    "header_type": "IMAGE",
    "body_text": "안녕하세요 #{이름}님!\n[#{상품명}] 사전 알림 신청이 완료되었습니다.\n\n■ 출시 예정일: #{출시 예정일}\n■ 사전 신청자 혜택: #{사전 혜택 안내}\n\n출시 시 카카오로 가장 먼저 안내해 드리겠습니다.",
    "variables": ["상품명", "출시 예정일", "사전 혜택 안내"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "상품 상세 보기", "btn_type": "WL" }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // 그룹: Pro_맞춤_일부채널 (특정 파트너 채널 전용 — Pro 플랜)
  // ═══════════════════════════════════════════════════════════════
  {
    "template_name": "[Pro 샘플] 장희지 수학학원 — 오답노트 자료집 접수 확인",
    "template_id": "b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7",
    "use_yn": "O",
    "group_name": "Pro_맞춤_일부채널",
    "sort_order": 0,
    "public_scope": "일부채널",
    "allowed_channel_ids": "15",
    "header_type": "IMAGE",
    "body_text": "안녕하세요 #{이름} 학부모님!\n장희지 수학학원 원장 직강 자료집 신청이 완료되었습니다. 📚\n\n■ 자료: #{콘텐츠 제목}\n■ 대상: #{@고객진단.학년} 학부모님 맞춤 자료\n\n아래 버튼을 눌러 1편 핵심 로드맵을 먼저 확인해 보세요!\n\n※ 상단 노란색 [채널 추가]를 눌러두시면\n  내일 오전 9시에 2편 심화 칼럼도 받아보실 수 있습니다.",
    "variables": ["콘텐츠 제목"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "1편 로드맵 바로보기", "btn_type": "WL" },
      { "btn_name": "원장님 1:1 진단 예약", "btn_type": "WL" }
    ]
  },

  {
    "template_name": "[Pro 샘플] 의원·클리닉 — 검진·상담 예약 확인 및 사전 안내",
    "template_id": "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
    "use_yn": "O",
    "group_name": "Pro_맞춤_일부채널",
    "sort_order": 1,
    "public_scope": "일부채널",
    "allowed_channel_ids": "22",
    "header_type": "IMAGE",
    "body_text": "안녕하세요 #{이름}님!\n#{병원명} 방문 예약이 완료되었습니다.\n\n■ 예약 일시: #{예약 일시}\n■ 진료 항목: #{진료 항목}\n■ 사전 주의사항:\n#{사전 주의사항}\n\n당일 10분 전까지 내원해 주시면 감사합니다.\n예약 변경 시 전날까지 채널 채팅으로 연락해 주세요.",
    "variables": ["병원명", "예약 일시", "진료 항목", "사전 주의사항"],
    "sample_image_url": "",
    "buttons": [
      { "btn_name": "오시는 길 확인", "btn_type": "WL" },
      { "btn_name": "예약 변경·취소 문의", "btn_type": "AL" }
    ]
  }
];
