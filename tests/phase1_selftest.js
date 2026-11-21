/**
 * tests/phase1_selftest.js — LandingBuilder.html Phase 1 자가 점검 (개발용)
 * 사용: LandingBuilder.html?selftest 로 열면 자동 실행되고 결과가 <pre id="selftest-result"> 에 JSON으로 기록됩니다.
 * 헤드리스 크롬:  chrome --headless=new --virtual-time-budget=40000 --dump-dom "file:///.../LandingBuilder.html?selftest"
 */
(async function () {
  const R = [];
  const pre = document.createElement('pre'); pre.id = 'selftest-result'; document.body.appendChild(pre);
  let phase = 'start';
  const flush = done => { pre.textContent = JSON.stringify(R.concat(done ? [] : [{ name: 'RUNNING(미완료) 마지막 단계: ' + phase, ok: false, detail: '' }])); };
  const ok = (name, cond, detail) => { R.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) }); flush(false); };
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const imgDims = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => rej(new Error('img decode fail')); i.src = url; });
  const bytes = url => Math.floor((url.length - url.indexOf(',') - 1) * 0.75);
  const step = async (name, fn) => { phase = name; flush(false); try { await fn(); } catch (e) { ok(name + ' (예외)', false, e && e.message); } };

  await step('모듈', async () => {
    ok('window.ImageCapturer', !!window.ImageCapturer);
    ok('window.RagInterviewEngine', typeof window.RagInterviewEngine === 'function');
    ok('window.IndustryPresets(별칭)', !!window.IndustryPresets && window.IndustryPresets === window.GOMAWARTALK_INDUSTRY_PRESETS);
    ok('window.GomawartalkManual(별칭)', Array.isArray(window.GomawartalkManual));
    ok('window.AlimtalkTemplates(별칭)', Array.isArray(window.AlimtalkTemplates) && window.AlimtalkTemplates.length === 10, (window.AlimtalkTemplates || []).length);
    ok('html2canvas 로컬 로드', typeof window.html2canvas === 'function');
    ok('JSZip 로컬 로드', typeof window.JSZip === 'function');
    ok('업종 프리셋 6종', Object.keys(window.IndustryPresets).length === 6, Object.keys(window.IndustryPresets).join(','));
  });

  await step('금지어', async () => {
    const banned = '\uB274\uC2A4\uB808\uD130';
    const hay = document.documentElement.outerHTML + JSON.stringify(window.IndustryPresets) + JSON.stringify(window.GomawartalkManual) + JSON.stringify(window.AlimtalkTemplates);
    ok('금지어 단어 미사용', hay.indexOf(banned) === -1);
  });

  await step('URL 보정', async () => {
    const f = window.LB.fixUrlSpacing;
    ok('앞뒤 붙은 URL 보정', f('참고https://a.com입니다').text === '참고 https://a.com 입니다', f('참고https://a.com입니다').text);
    ok('이미 띄어쓴 URL 변경 없음', f('상세 https://a.com 참고').count === 0);
    ok('문장 끝 마침표 분리', f('보세요 https://a.com.').text === '보세요 https://a.com .', f('보세요 https://a.com.').text);
    ok('문두 URL은 앞 공백 미추가', f('https://a.com 입니다').text === 'https://a.com 입니다');
    ok('URL 없는 문장 불변', f('안녕하세요').text === '안녕하세요');
    const el = $('#form-guide'); el.focus(); el.textContent = '링크https://gomawartalk.com확인';
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    ok('안내문구 포커스아웃 자동보정', el.textContent === '링크 https://gomawartalk.com 확인', el.textContent);
    const t = $('#f-desc'); t.textContent = '설명https://a.com끝'; t.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    ok('다른 입력칸은 URL 보정 미적용', t.textContent === '설명https://a.com끝');
  });

  await step('탭/메뉴', async () => {
    ['tab1', 'tab2', 'tab3', 'tab4', 'tab5'].forEach(id => {
      window.LB.switchTab(id);
      ok('탭 전환 ' + id, $('#' + id).classList.contains('on') && document.querySelectorAll('#ws-admin .panel.on').length === 1);
    });
    window.LB.switchTab('tab1');
    window.LB.switchMenu('webzine');
    ok('대메뉴2 전환(웹진 스튜디오 표시/어드민 숨김)', !$('#ws-webzine').hidden && $('#ws-admin').hidden);
    window.LB.switchMenu('admin');
    ok('대메뉴1 복귀', $('#ws-webzine').hidden && !$('#ws-admin').hidden);
    window.LB.setWebzine(true);
    ok('웹진 ON 반영', document.body.classList.contains('wz-on') && $('#wz-toggle').checked && /ON/.test($('#nav-wz-text').textContent));
    window.LB.setWebzine(false);
    ok('웹진 OFF 반영', !document.body.classList.contains('wz-on') && !$('#wz-toggle').checked);
  });

  await step('프리셋', async () => {
    for (const code of Object.keys(window.IndustryPresets)) {
      const p = window.IndustryPresets[code];
      window.LB.loadPreset(code);
      const s = window.LB.state();
      const t3q = (p.tab3_form.questions || []).length;
      ok('프리셋 ' + code + ' → 탭1 타이틀', $('#f-title').textContent === p.tab1_basic_settings.title_30chars);
      ok('프리셋 ' + code + ' → 탭2 5단 + 1단 제목', s.t2.blocks.length === 5 && $('#lc .lb[data-block-step="1"] [data-f=title]').textContent === p.tab2_landing_blocks[0].title);
      ok('프리셋 ' + code + ' → 탭3 질문 수 ' + t3q, document.querySelectorAll('#q-container .q').length === t3q && $('#form-title').textContent === p.tab3_form.form_title);
    }
  });

  await step('탭3 편집', async () => {
    window.LB.loadPreset('academy');
    const before = document.querySelectorAll('#q-container .q').length;
    document.querySelector('[data-act=q-add][data-type=MULTIPLE_CHOICE]').click();
    ok('객관식 추가', document.querySelectorAll('#q-container .q').length === before + 1);
    const qi = before;
    const f = (o, k) => document.querySelector('#q-container input[data-q="' + qi + '"][data-o="' + o + '"][data-f="' + k + '"]');
    f(0, 'sheet_field').value = '잘못된형식'; f(0, 'sheet_field').dispatchEvent(new Event('input', { bubbles: true }));
    ok('시트명.필드명 형식 검증(오류 표시)', f(0, 'sheet_field').classList.contains('bad'));
    f(0, 'sheet_field').value = '고객진단.학년'; f(0, 'sheet_field').dispatchEvent(new Event('input', { bubbles: true }));
    f(0, 'sheet_value').value = '예비고1'; f(0, 'sheet_value').dispatchEvent(new Event('input', { bubbles: true }));
    ok('올바른 형식 → 오류 해제', !f(0, 'sheet_field').classList.contains('bad') && !f(0, 'sheet_value').classList.contains('bad'));
    const sel = document.querySelector('#q-container select[data-q="' + qi + '"][data-o="0"][data-f="sheet_op"]');
    sel.value = 'ADD'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    ok('[더하기]+문자열 조합 경고', document.querySelector('#q-container select[data-q="' + qi + '"][data-o="0"][data-f="sheet_type"]').classList.contains('bad'));
    ['SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE'].forEach(t => document.querySelector('[data-act=q-add][data-type=' + t + ']').click());
    ok('5대 질문 타입 모두 추가 가능', document.querySelectorAll('#q-container .q').length === before + 5);
    // 보기 5개 초과 경고
    for (let i = 0; i < 4; i++) document.querySelector('[data-act=o-add][data-q="' + qi + '"]').click();
    ok('보기 5개 초과 경고 배지', /5개 이하 권장/.test(document.querySelector('#q-container .q[data-q="' + qi + '"] .q-h').textContent));
    const cm = window.LB.toCampaignMaster().tab3_application_form.questions[qi];
    const a = cm.options[0].actions_after_save;
    ok('CampaignMaster 액션 직렬화(TAG/SHEET)', a.some(x => x.action_type === 'SHEET' && x.field_name === '고객진단.학년' && x.operation === 'ADD'), JSON.stringify(a));
  });

  await step('스위치 잠금', async () => {
    const lock = document.querySelector('input[data-lock]'); lock.checked = false; lock.dispatchEvent(new Event('change', { bubbles: true }));
    ok('강제 ON 스위치 해제 차단', lock.checked === true);
    const n = document.querySelectorAll('input[data-lock]').length;
    ok('강제 ON 스위치 4종(상단바·실패안내·재시도·마케팅동의)', n === 4, n);
  });

  await step('JSON 왕복', async () => {
    window.LB.loadPreset('medical');
    window.LB.setWebzine(true);
    const a = window.LB.toCampaignMaster(); delete a.meta.created_at;
    window.LB.openState(JSON.parse(JSON.stringify(a)));
    const b = window.LB.toCampaignMaster(); delete b.meta.created_at;
    const same = JSON.stringify(a) === JSON.stringify(b);
    ok('저장→불러오기→저장 결과 동일', same, same ? '' : 'diff');
    ok('스키마 필수 키', ['meta', 'partner_info', 'brand_assets', 'tab1_basic_settings', 'tab2_landing_content', 'tab3_application_form'].every(k => a[k]));
    ok('tab2 blocks_1000px 5단', a.tab2_landing_content.blocks_1000px.length === 5);
    window.LB.setWebzine(false);
    // 탭4/5 데이터 보존
    const extra = JSON.parse(JSON.stringify(a)); extra.tab4_interval_messages = { sequence: [1, 2, 3] }; extra.tab5_date_messages = [{ x: 1 }];
    window.LB.openState(extra);
    const c = window.LB.toCampaignMaster();
    ok('Phase2 데이터(tab4/tab5) 불러오기→저장 시 보존', JSON.stringify(c.tab4_interval_messages) === '{"sequence":[1,2,3]}' && c.tab5_date_messages.length === 1);
  });

  await step('이미지 압축', async () => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const x = c.getContext('2d'); const d = x.createImageData(c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    const blob = window.ImageCapturer.utils.dataUrlToBlob(c.toDataURL('image/png'));
    const file = new File([blob], 'noise.png', { type: 'image/png' });
    const url = await window.ImageCapturer.compressImageToBase64(file);
    const dim = await imgDims(url);
    ok('노이즈 대형 이미지 150KB 이하 압축', bytes(url) <= 150 * 1024, Math.round(bytes(url) / 1024) + 'KB (원본 ' + Math.round(file.size / 1024) + 'KB)');
    ok('가로 1200px 이하로 축소', dim.w <= 1200, dim.w + 'x' + dim.h);
    const bad = await window.ImageCapturer.compressImageToBase64(new File(['x'], 'a.txt', { type: 'text/plain' })).then(() => false, () => true);
    ok('이미지 아닌 파일 거부', bad);
    // 블록 사진 교체 흐름 (UI 경유)
    window.LB.switchTab('tab2');
    const input = document.querySelector('#lc input[data-act=block-img][data-step="1"]');
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(2500);
    const blk = document.querySelector('#lc .lb[data-block-step="1"]');
    ok('1단 사진 교체 UI 적용(배경+has-img)', blk.classList.contains('has-img') && /url\(/.test(blk.style.backgroundImage));
    ok('상태에 150KB 이하 base64 저장', window.LB.state().t2.blocks[0].image && bytes(window.LB.state().t2.blocks[0].image) <= 150 * 1024);
    document.querySelector('#lc [data-act=block-img-clear][data-step="1"]').click();
    ok('사진 제거', !document.querySelector('#lc .lb[data-block-step="1"]').classList.contains('has-img'));
  });

  await step('캡처', async () => {
    window.LB.loadPreset('academy');
    window.LB.switchTab('tab1'); await sleep(100);
    const IC = window.ImageCapturer;
    const th = await window.LB.withCapture(() => IC.captureThumbnail500x280('thumb', 't.png', { download: false }));
    const td = await imgDims(th);
    ok('썸네일 정확히 500x280 PNG', td.w === 500 && td.h === 280 && /^data:image\/png/.test(th), td.w + 'x' + td.h);
    const ta = document.createElement('textarea'); ta.id = 'cap-thumb'; ta.value = th; ta.hidden = true; document.body.appendChild(ta);

    window.LB.switchTab('tab2'); await sleep(100);
    const full = await window.LB.withCapture(() => IC.captureLanding1000px('lc', 'FULL', 'x', { download: false }));
    const fd = await imgDims(full[0].dataUrl);
    ok('통이미지 1장(가로 1000px×scale2=2000)', full.length === 1 && fd.w === 2000 && fd.h > 3000, fd.w + 'x' + fd.h);
    const tf = document.createElement('textarea'); tf.id = 'cap-full'; tf.value = full[0].dataUrl; tf.hidden = true; document.body.appendChild(tf);

    const split = await window.LB.withCapture(() => IC.captureLanding1000px('lc', 'SPLIT', 'x', { download: false }));
    const dims = []; for (const s of split) dims.push(await imgDims(s.dataUrl));
    ok('5분할 5장 출력(각 가로 2000)', split.length === 5 && dims.every(d => d.w === 2000), dims.map(d => d.w + 'x' + d.h).join(' | '));
    const sumH = dims.reduce((a, d) => a + d.h, 0);
    ok('5분할 높이 합 ≈ 통이미지 높이', Math.abs(sumH - fd.h) <= 10, sumH + ' vs ' + fd.h);
    const ts = document.createElement('textarea'); ts.id = 'cap-split1'; ts.value = split[4].dataUrl; ts.hidden = true; document.body.appendChild(ts);

    // 배율과 무관하게 캡처 크기 동일한지
    document.querySelector('input[name=zoom][value="0.5"]').checked = true; document.querySelector('input[name=zoom][value="0.5"]').dispatchEvent(new Event('change', { bubbles: true }));
    const full2 = await window.LB.withCapture(() => IC.captureLanding1000px('lc', 'FULL', 'x', { download: false }));
    const fd2 = await imgDims(full2[0].dataUrl);
    ok('보기 배율(50%)과 무관하게 동일 해상도 캡처', fd2.w === fd.w && fd2.h === fd.h, fd2.w + 'x' + fd2.h);

    // 친구톡/캐러셀 엔진 규격 (Phase 2 대비)
    const box = document.createElement('div'); box.id = 'ft'; box.style.cssText = 'width:800px;height:400px;background:linear-gradient(45deg,#f0f,#0ff)'; box.textContent = 'friendtalk'; document.body.appendChild(box);
    const ft = await IC.captureFriendtalkJPG('ft', '2:1', 'f.jpg', { download: false });
    const fdim = await imgDims(ft);
    ok('친구톡 800x400 JPG ≤500KB', fdim.w === 800 && fdim.h === 400 && /^data:image\/jpeg/.test(ft) && bytes(ft) <= 500 * 1024, fdim.w + 'x' + fdim.h + ' ' + Math.round(bytes(ft) / 1024) + 'KB');
    box.style.height = '533px'; const ft2 = await IC.captureFriendtalkJPG('ft', '1.5:1', 'f.jpg', { download: false }); const fd3 = await imgDims(ft2);
    ok('친구톡 800x533 JPG', fd3.w === 800 && fd3.h === 533, fd3.w + 'x' + fd3.h);
    box.remove();
    const z = new JSZip(); z.file('a.txt', 'x'); const zb = await z.generateAsync({ type: 'blob' });
    ok('JSZip 동작', zb.size > 0);
  });

  flush(true);
})();
