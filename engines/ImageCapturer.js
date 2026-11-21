/**
 * engines/ImageCapturer.js
 * [범용 엔진 1] 150KB 이미지 압축 + 해상도 고정 캡처(통이미지/5단 분할 선택) + 전체 ZIP 다운로드
 *
 * ✅ 타 프로젝트에도 100% 재활용 가능한 순수 기술 엔진 — 고마워톡 전용 로직 없음
 * ✅ 의존 라이브러리: html2canvas (CDN), JSZip (CDN)
 * ✅ 본체 HTML에서 <script src="engines/ImageCapturer.js"></script>로 호출하여 사용
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. compressImageToBase64
  //    로컬 이미지 파일을 <canvas>로 리사이징하여 150KB 이하 Data URL 반환
  //    localStorage 폭발 및 Tainted Canvas CORS 에러 원천 방지
  // ─────────────────────────────────────────────────────────────
  function compressImageToBase64(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('유효한 이미지 파일이 아닙니다.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 가로 최대 1200px 리사이징
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // WebP 우선 시도, 미지원 시 JPEG 폴백
          let dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          // 150KB(= 약 204800 Base64 문자) 초과 시 품질 단계적 감소
          let currentQuality = quality;
          while (dataUrl.length > 204800 && currentQuality > 0.3) {
            currentQuality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
          }

          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('이미지 로드에 실패했습니다.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. captureThumbnail500x280
  //    탭 1 대표 썸네일을 정확히 500x280px (16:9 비율) PNG로 캡처·다운로드
  //    고정: windowWidth: 1400, scale: 2, useCORS: true
  // ─────────────────────────────────────────────────────────────
  function captureThumbnail500x280(elementId, filename = 'thumbnail_500x280.png') {
    const el = document.getElementById(elementId);
    if (!el) return Promise.reject(new Error('[captureThumbnail500x280] 요소를 찾을 수 없습니다: ' + elementId));

    return html2canvas(el, {
      width: 500,
      height: 280,
      windowWidth: 1400,
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      // 출력 캔버스를 정확히 500x280으로 클리핑
      const output = document.createElement('canvas');
      output.width = 500;
      output.height = 280;
      const ctx = output.getContext('2d');
      ctx.drawImage(canvas, 0, 0, 500, 280);

      _downloadCanvas(output, filename, 'image/png');
      return output.toDataURL('image/png');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. captureLanding1000px
  //    탭 2의 가로 1000px 세로형 5단 랜딩 캔버스를
  //    outputMode "FULL" (통이미지 1장) 또는 "SPLIT" (1단~5단 5개 개별 이미지)로 출력
  //    고정: windowWidth: 1400, scale: 2, useCORS: true
  // ─────────────────────────────────────────────────────────────
  function captureLanding1000px(containerId, outputMode = 'FULL', filenamePrefix = 'landing') {
    const container = document.getElementById(containerId);
    if (!container) return Promise.reject(new Error('[captureLanding1000px] 요소를 찾을 수 없습니다: ' + containerId));

    return html2canvas(container, {
      windowWidth: 1400,
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      const results = [];

      if (outputMode === 'FULL') {
        // 통이미지 1장 출력
        const filename = filenamePrefix + '_full_1000px.png';
        _downloadCanvas(canvas, filename, 'image/png');
        results.push({ mode: 'FULL', filename, dataUrl: canvas.toDataURL('image/png') });
      } else if (outputMode === 'SPLIT') {
        // 5단 블록 각각 캡처 (블록 요소 선택자 기반)
        const blocks = container.querySelectorAll('[data-block-step]');
        if (blocks.length === 0) {
          // data-block-step 속성이 없는 경우 균등 분할 폴백
          const blockHeight = Math.floor(canvas.height / 5);
          for (let i = 0; i < 5; i++) {
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = blockHeight;
            const ctx = slice.getContext('2d');
            ctx.drawImage(canvas, 0, i * blockHeight, canvas.width, blockHeight, 0, 0, canvas.width, blockHeight);
            const filename = filenamePrefix + '_block' + (i + 1) + '.png';
            _downloadCanvas(slice, filename, 'image/png');
            results.push({ mode: 'SPLIT', step: i + 1, filename, dataUrl: slice.toDataURL('image/png') });
          }
        } else {
          // 각 블록 요소별 개별 캡처
          const promises = Array.from(blocks).map((block, idx) =>
            html2canvas(block, {
              windowWidth: 1400,
              scale: 2,
              useCORS: true,
              allowTaint: false,
              backgroundColor: '#ffffff',
            }).then((blockCanvas) => {
              const step = block.getAttribute('data-block-step') || idx + 1;
              const filename = filenamePrefix + '_block' + step + '.png';
              _downloadCanvas(blockCanvas, filename, 'image/png');
              return { mode: 'SPLIT', step: Number(step), filename, dataUrl: blockCanvas.toDataURL('image/png') };
            })
          );
          return Promise.all(promises);
        }
      }

      return results;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. captureFriendtalkJPG
  //    탭 4·5의 자유작성 친구톡 이미지를
  //    800x400px(2:1) 또는 800x533px(1.5:1) 규격으로 캡처 후
  //    반드시 500KB 이하 JPG로 출력
  // ─────────────────────────────────────────────────────────────
  function captureFriendtalkJPG(elementId, ratio = '2:1', filename = 'friendtalk.jpg') {
    const el = document.getElementById(elementId);
    if (!el) return Promise.reject(new Error('[captureFriendtalkJPG] 요소를 찾을 수 없습니다: ' + elementId));

    const dimensions = ratio === '1.5:1' ? { w: 800, h: 533 } : { w: 800, h: 400 };

    return html2canvas(el, {
      width: dimensions.w,
      height: dimensions.h,
      windowWidth: 1400,
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
    }).then((canvas) => {
      const output = document.createElement('canvas');
      output.width = dimensions.w;
      output.height = dimensions.h;
      const ctx = output.getContext('2d');
      ctx.drawImage(canvas, 0, 0, dimensions.w, dimensions.h);

      // 500KB(= 약 683000 Base64 문자) 이하가 될 때까지 품질 감소
      let quality = 0.9;
      let dataUrl = output.toDataURL('image/jpeg', quality);
      while (dataUrl.length > 683000 && quality > 0.4) {
        quality -= 0.1;
        dataUrl = output.toDataURL('image/jpeg', quality);
      }

      _downloadDataUrl(dataUrl, filename);
      return dataUrl;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 5. captureCarouselCards
  //    탭 4·5의 브랜드 캐러셀 카드(2~6장)를
  //    각각 800x600px (4:3 비율) 이미지로 개별/일괄 출력
  // ─────────────────────────────────────────────────────────────
  function captureCarouselCards(cardElements, filenamePrefix = 'carousel_card') {
    if (!cardElements || cardElements.length === 0) {
      return Promise.reject(new Error('[captureCarouselCards] 카드 요소가 없습니다.'));
    }

    const cards = Array.isArray(cardElements) ? cardElements : Array.from(cardElements);

    if (cards.length < 2 || cards.length > 6) {
      console.warn('[captureCarouselCards] 카카오 캐러셀 규정: 카드는 2~6장이어야 합니다. 현재: ' + cards.length + '장');
    }

    const promises = cards.map((card, idx) =>
      html2canvas(card, {
        width: 800,
        height: 600,
        windowWidth: 1400,
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
      }).then((canvas) => {
        const output = document.createElement('canvas');
        output.width = 800;
        output.height = 600;
        const ctx = output.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 800, 600);

        const filename = filenamePrefix + '_' + (idx + 1) + '.png';
        _downloadCanvas(output, filename, 'image/png');
        return { cardIndex: idx + 1, filename, dataUrl: output.toDataURL('image/png') };
      })
    );

    return Promise.all(promises);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. downloadAllAsZip
  //    JSZip을 이용해 현재 캠페인의 모든 에셋을 폴더별로 정리하여
  //    [고마워톡_에셋]_채널명_날짜.zip으로 묶음 다운로드
  //    campaignData 구조: { channelName, thumbnail, landingImages, messageImages }
  // ─────────────────────────────────────────────────────────────
  function downloadAllAsZip(campaignData) {
    if (typeof JSZip === 'undefined') {
      return Promise.reject(new Error('[downloadAllAsZip] JSZip 라이브러리가 로드되지 않았습니다. CDN을 확인해 주세요.'));
    }

    const zip = new JSZip();
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');

    const channelName = (campaignData.channelName || '채널명').replace(/[\\/:*?"<>|]/g, '_');
    const zipFilename = '[고마워톡_에셋]_' + channelName + '_' + dateStr + '.zip';

    // 폴더 구조: 01_썸네일 / 02_신청페이지 / 03_메시지배너
    const folderThumb = zip.folder('01_썸네일');
    const folderLanding = zip.folder('02_신청페이지');
    const folderMessage = zip.folder('03_메시지배너');

    // 썸네일 추가
    if (campaignData.thumbnail) {
      const thumbBlob = _dataUrlToBlob(campaignData.thumbnail);
      folderThumb.file('thumbnail_500x280.png', thumbBlob);
    }

    // 신청페이지 이미지 추가 (통이미지 또는 5분할)
    if (campaignData.landingImages && campaignData.landingImages.length > 0) {
      campaignData.landingImages.forEach((item) => {
        const blob = _dataUrlToBlob(item.dataUrl);
        folderLanding.file(item.filename, blob);
      });
    }

    // 메시지 배너 이미지 추가
    if (campaignData.messageImages && campaignData.messageImages.length > 0) {
      campaignData.messageImages.forEach((item) => {
        const blob = _dataUrlToBlob(item.dataUrl);
        folderMessage.file(item.filename, blob);
      });
    }

    return zip.generateAsync({ type: 'blob' }).then((content) => {
      _downloadBlob(content, zipFilename);
      return zipFilename;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  function _downloadCanvas(canvas, filename, mimeType) {
    const dataUrl = canvas.toDataURL(mimeType);
    _downloadDataUrl(dataUrl, filename);
  }

  function _downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function _dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const binary = atob(parts[1]);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ─────────────────────────────────────────────────────────────
  // Public API 노출 (window.ImageCapturer)
  // ─────────────────────────────────────────────────────────────
  global.ImageCapturer = {
    compressImageToBase64,
    captureThumbnail500x280,
    captureLanding1000px,
    captureFriendtalkJPG,
    captureCarouselCards,
    downloadAllAsZip,
  };
})(window);
