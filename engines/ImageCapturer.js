/**
 * engines/ImageCapturer.js
 * [범용 엔진 1] 150KB 이미지 압축 + 해상도 고정 캡처(통이미지/5단 분할 선택 등) + 전체 ZIP 다운로드
 *
 * - 타 프로젝트에서도 그대로 재활용 가능한 순수 기술 엔진 (고마워톡 전용 로직 없음)
 * - 일반 <script src> 로 로드 (ES Module 아님) → file:// 더블클릭 실행 호환, window.ImageCapturer 로 노출
 * - 의존 라이브러리: html2canvas, JSZip (둘 다 전역 객체로 사전 로드 필요)
 * - 캡처 고정값: windowWidth 1400 / scale 2 / useCORS true  (해상도 독립형)
 * - 모든 capture* 함수는 마지막 인자 options({download:true}) 로 '다운로드 없이 dataUrl만 반환' 가능
 *   (ZIP 일괄 패키징 시 개별 다운로드가 연쇄 발생하지 않도록)
 */
(function (global) {
  'use strict';

  var H2C = { windowWidth: 1400, scale: 2, useCORS: true, allowTaint: false, logging: false };
  var MAX_IMG_BYTES = 150 * 1024;        // 업로드 이미지 1장 상한 (150KB)
  var MAX_FRIENDTALK_BYTES = 500 * 1024; // 자유작성 친구톡 JPG 상한 (500KB)

  // ───────────── 내부 유틸 ─────────────
  function dataUrlBytes(dataUrl) {
    var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var pad = (b64.match(/=+$/) || [''])[0].length;
    return Math.floor(b64.length * 3 / 4) - pad;
  }

  function needH2C() {
    if (typeof global.html2canvas !== 'function') {
      throw new Error('html2canvas 라이브러리가 로드되지 않았습니다.');
    }
  }

  function getEl(id, fn) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) throw new Error('[' + fn + '] 요소를 찾을 수 없습니다: ' + id);
    return el;
  }

  function render(el, extra) {
    needH2C();
    var opt = {};
    Object.keys(H2C).forEach(function (k) { opt[k] = H2C[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { opt[k] = extra[k]; });
    return global.html2canvas(el, opt);
  }

  // 캔버스를 정확히 w x h 로 리샘플링
  function resample(src, w, h, bg) {
    var out = document.createElement('canvas');
    out.width = w; out.height = h;
    var ctx = out.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return out;
  }

  function downloadDataUrl(dataUrl, filename) {
    var a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    downloadDataUrl(url, filename);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function shouldDownload(options) { return !options || options.download !== false; }

  // ───────────── 1. 이미지 압축 (150KB 이하 보장) ─────────────
  function compressImageToBase64(file, maxWidth, quality) {
    maxWidth = maxWidth || 1200;
    quality = quality || 0.8;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('유효한 이미지 파일이 아닙니다.')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('파일 읽기에 실패했습니다.')); };
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () { reject(new Error('이미지 로드에 실패했습니다.')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }

          function encode(width, height, q) {
            var c = document.createElement('canvas');
            c.width = width; c.height = height;
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); // 투명 PNG → 흰 배경
            ctx.drawImage(img, 0, 0, width, height);
            var url = c.toDataURL('image/webp', q);
            if (url.indexOf('data:image/webp') !== 0) url = c.toDataURL('image/jpeg', q); // WebP 미지원 폴백
            return url;
          }

          var q = quality, url = encode(w, h, q);
          // 1단계: 품질을 단계적으로 낮춤 → 2단계: 해상도를 줄임 (반드시 150KB 이하로 수렴)
          var guard = 0;
          while (dataUrlBytes(url) > MAX_IMG_BYTES && guard++ < 30) {
            if (q > 0.35) { q = Math.max(0.35, q - 0.1); }
            else { w = Math.round(w * 0.85); h = Math.round(h * 0.85); if (w < 200) break; }
            url = encode(w, h, q);
          }
          resolve(url);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ───────────── 2. 탭1 썸네일 500x280 PNG ─────────────
  function captureThumbnail500x280(elementId, filename, options) {
    filename = filename || 'thumbnail_500x280.png';
    return new Promise(function (resolve) { resolve(getEl(elementId, 'captureThumbnail500x280')); })
      .then(function (el) { return render(el); })
      .then(function (canvas) {
        var out = resample(canvas, 500, 280, '#ffffff');
        var url = out.toDataURL('image/png');
        if (shouldDownload(options)) downloadDataUrl(url, filename);
        return url;
      });
  }

  // ───────────── 3. 탭2 1000px 랜딩 (FULL 통이미지 / SPLIT 5분할) ─────────────
  function captureLanding1000px(containerId, outputMode, filenamePrefix, options) {
    outputMode = outputMode || 'FULL';
    filenamePrefix = filenamePrefix || 'landing';
    var dl = shouldDownload(options);

    return new Promise(function (resolve) { resolve(getEl(containerId, 'captureLanding1000px')); })
      .then(function (container) {
        if (outputMode !== 'SPLIT') {
          return render(container).then(function (canvas) {
            var name = filenamePrefix + '_full_1000px.png';
            var url = canvas.toDataURL('image/png');
            if (dl) downloadDataUrl(url, name);
            return [{ mode: 'FULL', step: 0, filename: name, dataUrl: url }];
          });
        }
        var blocks = Array.prototype.slice.call(container.querySelectorAll('[data-block-step]'));
        if (!blocks.length) throw new Error('[captureLanding1000px] 분할할 [data-block-step] 블록이 없습니다.');
        var results = [];
        // 순차 캡처·순차 다운로드 (브라우저의 다중 다운로드 차단 완화)
        return blocks.reduce(function (chain, block, idx) {
          return chain.then(function () {
            return render(block).then(function (canvas) {
              var step = Number(block.getAttribute('data-block-step')) || (idx + 1);
              var name = filenamePrefix + '_block' + step + '.png';
              var url = canvas.toDataURL('image/png');
              results.push({ mode: 'SPLIT', step: step, filename: name, dataUrl: url });
              if (dl) { downloadDataUrl(url, name); return sleep(350); }
            });
          });
        }, Promise.resolve()).then(function () { return results; });
      });
  }

  // ───────────── 4. 자유작성 친구톡 JPG (800x400 / 800x533, 500KB 이하) ─────────────
  function captureFriendtalkJPG(elementId, ratio, filename, options) {
    filename = filename || 'friendtalk.jpg';
    var r = String(ratio || '2:1');
    var dim = (r === '1.5:1' || r === '800x533' || r === '3:2') ? { w: 800, h: 533 } : { w: 800, h: 400 };
    return new Promise(function (resolve) { resolve(getEl(elementId, 'captureFriendtalkJPG')); })
      .then(function (el) { return render(el); })
      .then(function (canvas) {
        var out = resample(canvas, dim.w, dim.h, '#ffffff');
        var q = 0.92, url = out.toDataURL('image/jpeg', q);
        while (dataUrlBytes(url) > MAX_FRIENDTALK_BYTES && q > 0.3) { q -= 0.07; url = out.toDataURL('image/jpeg', q); }
        if (shouldDownload(options)) downloadDataUrl(url, filename);
        return url;
      });
  }

  // ───────────── 5. 브랜드 캐러셀 카드 800x600 (2~6장) ─────────────
  function captureCarouselCards(cardElements, filenamePrefix, options) {
    filenamePrefix = filenamePrefix || 'carousel_card';
    var cards = cardElements ? Array.prototype.slice.call(cardElements) : [];
    if (!cards.length) return Promise.reject(new Error('[captureCarouselCards] 카드 요소가 없습니다.'));
    if (cards.length < 2 || cards.length > 6) {
      console.warn('[captureCarouselCards] 카카오 캐러셀은 카드 2~6장 규정입니다. 현재 ' + cards.length + '장');
    }
    var dl = shouldDownload(options), results = [];
    return cards.reduce(function (chain, card, idx) {
      return chain.then(function () {
        return render(card).then(function (canvas) {
          var out = resample(canvas, 800, 600, '#ffffff');
          var name = filenamePrefix + '_' + (idx + 1) + '.png';
          var url = out.toDataURL('image/png');
          results.push({ cardIndex: idx + 1, filename: name, dataUrl: url });
          if (dl) { downloadDataUrl(url, name); return sleep(350); }
        });
      });
    }, Promise.resolve()).then(function () { return results; });
  }

  // ───────────── 6. ZIP 일괄 패키징 ─────────────
  // campaignData: { channelName, thumbnail(dataUrl), landingImages:[{filename,dataUrl}], messageImages:[{filename,dataUrl}] }
  function downloadAllAsZip(campaignData) {
    if (typeof global.JSZip === 'undefined') return Promise.reject(new Error('JSZip 라이브러리가 로드되지 않았습니다.'));
    campaignData = campaignData || {};
    var d = new Date();
    var ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var ch = String(campaignData.channelName || '채널명').replace(/[\\\/:*?"<>|]/g, '_');
    var zipName = '[고마워톡_에셋]_' + ch + '_' + ds + '.zip';

    var zip = new global.JSZip();
    var fThumb = zip.folder('01_썸네일'), fLand = zip.folder('02_신청페이지'), fMsg = zip.folder('03_메시지배너');
    if (campaignData.thumbnail) fThumb.file('thumbnail_500x280.png', dataUrlToBlob(campaignData.thumbnail));
    (campaignData.landingImages || []).forEach(function (it) { fLand.file(it.filename, dataUrlToBlob(it.dataUrl)); });
    (campaignData.messageImages || []).forEach(function (it) { fMsg.file(it.filename, dataUrlToBlob(it.dataUrl)); });

    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      downloadBlob(blob, zipName);
      return zipName;
    });
  }

  global.ImageCapturer = {
    compressImageToBase64: compressImageToBase64,
    captureThumbnail500x280: captureThumbnail500x280,
    captureLanding1000px: captureLanding1000px,
    captureFriendtalkJPG: captureFriendtalkJPG,
    captureCarouselCards: captureCarouselCards,
    downloadAllAsZip: downloadAllAsZip,
    // 보조 유틸 (외부 재사용 가능)
    utils: { dataUrlBytes: dataUrlBytes, dataUrlToBlob: dataUrlToBlob, downloadDataUrl: downloadDataUrl }
  };
})(typeof window !== 'undefined' ? window : this);
