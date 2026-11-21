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

  function waitForFonts() {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      return document.fonts.ready.catch(function () {});
    }
    return Promise.resolve();
  }

  // 이미지를 목표 비율(targetW x targetH)로 중앙 크롭(object-fit: cover) + JPEG 압축하여
  // html2canvas 캡처 시 비율 찌그러짐과 localStorage 용량 초과를 동시에 방지
  function normalizeToCoverDataUrl(srcDataUrl, targetW, targetH, quality) {
    targetW = targetW || 888;
    targetH = targetH || 500;
    quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      if (!/^data:/i.test(srcDataUrl)) img.crossOrigin = 'anonymous';
      img.onerror = function () { reject(new Error('이미지 디코딩 실패')); };
      img.onload = function () {
        try {
          var iw = img.naturalWidth || targetW;
          var ih = img.naturalHeight || targetH;
          var c = document.createElement('canvas');
          c.width = targetW;
          c.height = targetH;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          var scale = Math.max(targetW / iw, targetH / ih);
          var sw = targetW / scale;
          var sh = targetH / scale;
          var sx = Math.max(0, (iw - sw) / 2);
          var sy = Math.max(0, (ih - sh) / 2);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
          var out = c.toDataURL('image/jpeg', quality);
          resolve(out);
        } catch (err) {
          reject(err);
        }
      };
      img.src = srcDataUrl;
    });
  }

  // 오프라인 또는 네트워크 차단 시에도 100% CORS 안전하고 텍스트 노이즈가 없는 고해상도 상업용 비주얼 캔버스 생성
  function generateCommercialVisualDataUrl(opts) {
    opts = opts || {};
    var w = opts.width || 888;
    var h = opts.height || 500;
    var primary = opts.primary || '#4F46E5';
    var secondary = opts.secondary || '#38BDF8';
    var variant = Number(opts.variant || 0) % 4;

    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');

    // 1. 스튜디오 배경 그라데이션
    var bg = ctx.createLinearGradient(0, 0, w, h);
    if (variant === 0) {
      bg.addColorStop(0, '#0F172A');
      bg.addColorStop(0.5, primary);
      bg.addColorStop(1, '#1E1B4B');
    } else if (variant === 1) {
      bg.addColorStop(0, '#0B132B');
      bg.addColorStop(0.55, '#1D4ED8');
      bg.addColorStop(1, '#0F766E');
    } else if (variant === 2) {
      bg.addColorStop(0, '#18181B');
      bg.addColorStop(0.5, '#312E81');
      bg.addColorStop(1, primary);
    } else {
      bg.addColorStop(0, '#111827');
      bg.addColorStop(0.55, '#4C1D95');
      bg.addColorStop(1, '#0369A1');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 2. 소프트 보케 조명 효과
    var lights = [
      { x: w * 0.82, y: h * 0.22, r: w * 0.34, col: 'rgba(253, 224, 71, 0.26)' },
      { x: w * 0.18, y: h * 0.82, r: w * 0.38, col: 'rgba(56, 189, 248, 0.24)' },
      { x: w * 0.52, y: h * 0.45, r: w * 0.3, col: 'rgba(255, 255, 255, 0.12)' }
    ];
    lights.forEach(function (l) {
      var rg = ctx.createRadialGradient(l.x, l.y, 10, l.x, l.y, l.r);
      rg.addColorStop(0, l.col);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. 입체 글래스모피즘 비주얼 카드/목업 오브젝트 (글자 없음)
    function roundRect(x, y, rw, rh, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + rw - rad, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + rad);
      ctx.lineTo(x + rw, y + rh - rad);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - rad, y + rh);
      ctx.lineTo(x + rad, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    }

    // 메인 중앙 비주얼 프레임
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 18;
    roundRect(w * 0.12, h * 0.13, w * 0.76, h * 0.74, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.stroke();
    ctx.restore();

    // 좌측 포커스 비주얼 카드
    ctx.save();
    roundRect(w * 0.17, h * 0.21, w * 0.32, h * 0.58, 22);
    var cg = ctx.createLinearGradient(w * 0.17, h * 0.21, w * 0.49, h * 0.79);
    cg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    cg.addColorStop(1, 'rgba(241, 245, 249, 0.88)');
    ctx.fillStyle = cg;
    ctx.fill();

    // 심볼 그래픽 (아이콘형 도형, 깨진 텍스트 제로)
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(w * 0.33, h * 0.42, Math.min(w, h) * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(w * 0.37, h * 0.37, Math.min(w, h) * 0.035, 0, Math.PI * 2);
    ctx.fill();

    // 깔끔한 시각적 바(Bar) 그래픽
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    roundRect(w * 0.22, h * 0.58, w * 0.22, 16, 8); ctx.fill();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.11)';
    roundRect(w * 0.24, h * 0.65, w * 0.18, 14, 7); ctx.fill();
    ctx.restore();

    // 우측 대시보드/상승 차트 그래픽
    ctx.save();
    var bars = [0.32, 0.48, 0.64, 0.86];
    bars.forEach(function (bh, idx) {
      var bx = w * 0.54 + idx * (w * 0.075);
      var by = h * 0.74 - (h * 0.42 * bh);
      var bw = w * 0.052;
      var barH = h * 0.42 * bh;
      roundRect(bx, by, bw, barH, 10);
      ctx.fillStyle = idx === 3 ? '#FDE047' : 'rgba(255, 255, 255, 0.78)';
      ctx.fill();
    });
    // 상승 곡선
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.56);
    ctx.quadraticCurveTo(w * 0.67, h * 0.48, w * 0.79, h * 0.27);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#38BDF8';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(w * 0.79, h * 0.27, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return c.toDataURL('image/jpeg', 0.88);
  }

  // 외부 URL 또는 Base64를 html2canvas CORS 오염 없는 안전한 DataURL(targetW x targetH)로 변환
  function urlToSafeDataUrl(url, options) {
    options = options || {};
    var targetW = options.width || 888;
    var targetH = options.height || 500;
    var quality = options.quality || 0.85;

    if (!url) {
      return Promise.resolve(generateCommercialVisualDataUrl(options));
    }
    if (/^data:image\//i.test(url)) {
      return normalizeToCoverDataUrl(url, targetW, targetH, quality).catch(function () {
        return url;
      });
    }
    // 1차: fetch -> Blob -> FileReader(DataURL) -> normalizeToCoverDataUrl
    return fetch(url, { mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onerror = function () { reject(new Error('FileReader error')); };
          reader.onload = function () { resolve(reader.result); };
          reader.readAsDataURL(blob);
        });
      })
      .then(function (rawDataUrl) {
        return normalizeToCoverDataUrl(rawDataUrl, targetW, targetH, quality);
      })
      .catch(function () {
        // 2차 폴백: crossOrigin="anonymous" Image 직접 캔버스 드로잉
        return normalizeToCoverDataUrl(url, targetW, targetH, quality);
      })
      .catch(function () {
        // 3차 폴백(오프라인/방화벽 환경): 고해상도 캔버스 아트워크 DataURL 즉시 합성
        return generateCommercialVisualDataUrl(options);
      });
  }

  // 캡처 직전 컨테이너 내부의 모든 <img>를 검사하여 CORS 안전한 DataURL로 보장
  function ensureSafeImagesInElement(el) {
    if (!el || !el.querySelectorAll) return Promise.resolve();
    var imgs = Array.prototype.slice.call(el.querySelectorAll('img'));
    return Promise.all(imgs.map(function (img) {
      var src = img.getAttribute('src') || '';
      if (!src || img.hidden) return Promise.resolve();
      img.crossOrigin = 'anonymous';
      var w = Number(img.getAttribute('data-w')) || img.clientWidth || 888;
      var h = Number(img.getAttribute('data-h')) || img.clientHeight || 500;
      if (/^data:image\//i.test(src)) {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(function (r) { img.onload = r; img.onerror = r; });
      }
      return urlToSafeDataUrl(src, { width: w, height: h }).then(function (safeUrl) {
        return new Promise(function (resolve) {
          img.onload = function () { resolve(); };
          img.onerror = function () { resolve(); };
          img.src = safeUrl;
        });
      });
    }));
  }

  function render(el, extra) {
    needH2C();
    var opt = {
      onclone: function (clonedDoc) {
        try {
          var srcStyle = document.documentElement.getAttribute('style');
          if (srcStyle) clonedDoc.documentElement.setAttribute('style', srcStyle);
          clonedDoc.body.className = document.body.className;
        } catch (e) {}
      }
    };
    Object.keys(H2C).forEach(function (k) { opt[k] = H2C[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { opt[k] = extra[k]; });
    return ensureSafeImagesInElement(el).then(function () {
      return waitForFonts();
    }).then(function () {
      return global.html2canvas(el, opt);
    });
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
  // campaignData: { channelName, thumbnail(dataUrl), landingImages:[{filename,dataUrl}], messageImages:[{filename,dataUrl}], masterJson, textSummary }
  function downloadAllAsZip(campaignData) {
    if (typeof global.JSZip === 'undefined') return Promise.reject(new Error('JSZip 라이브러리가 로드되지 않았습니다.'));
    campaignData = campaignData || {};
    var d = new Date();
    var ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var ch = String(campaignData.channelName || '채널명').replace(/[\\\/:*?"<>|\s]+/g, '_');
    var zipName = '[고마워톡_에셋]_' + ch + '_' + ds + '.zip';

    var zip = new global.JSZip();
    var fThumb = zip.folder('01_썸네일');
    var fLand = zip.folder('02_신청페이지');
    var fMsg = zip.folder('03_메시지배너');
    var fDoc = zip.folder('04_세팅텍스트_및_원본JSON');

    if (campaignData.thumbnail) fThumb.file('thumbnail_500x280.png', dataUrlToBlob(campaignData.thumbnail));
    (campaignData.landingImages || []).forEach(function (it) { fLand.file(it.filename, dataUrlToBlob(it.dataUrl)); });
    (campaignData.messageImages || []).forEach(function (it) { fMsg.file(it.filename, dataUrlToBlob(it.dataUrl)); });
    if (campaignData.textSummary) fDoc.file('고마워톡_어드민_세팅가이드.txt', campaignData.textSummary);
    if (campaignData.masterJson) {
      var jsonStr = typeof campaignData.masterJson === 'string' ? campaignData.masterJson : JSON.stringify(campaignData.masterJson, null, 2);
      fDoc.file('CampaignMaster.json', jsonStr);
    }

    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      downloadBlob(blob, zipName);
      return zipName;
    });
  }

  global.ImageCapturer = {
    compressImageToBase64: compressImageToBase64,
    normalizeToCoverDataUrl: normalizeToCoverDataUrl,
    generateCommercialVisualDataUrl: generateCommercialVisualDataUrl,
    urlToSafeDataUrl: urlToSafeDataUrl,
    captureThumbnail500x280: captureThumbnail500x280,
    captureLanding1000px: captureLanding1000px,
    captureFriendtalkJPG: captureFriendtalkJPG,
    captureCarouselCards: captureCarouselCards,
    downloadAllAsZip: downloadAllAsZip,
    // 보조 유틸 (외부 재사용 가능)
    utils: { dataUrlBytes: dataUrlBytes, dataUrlToBlob: dataUrlToBlob, downloadDataUrl: downloadDataUrl }
  };
})(typeof window !== 'undefined' ? window : this);
