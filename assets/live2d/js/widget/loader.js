/*
 * 库加载：本地优先，逐个源回退（本地 → CDN）。
 * 只负责把 window.OML2D 拿到手，不碰配置与 DOM。
 */

function loadScript(src) {
  return new Promise(function (resolve, reject) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = function () {
      resolve();
    };
    script.onerror = function () {
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('脚本请求失败'));
    };
    document.head.appendChild(script);
  });
}

/**
 * 依次尝试所有源，兑现 window.OML2D。
 * @param {string[]} sources 候选脚本地址（按优先级）
 * @param {number} index 当前尝试的下标
 */
export function loadOml2dLibrary(sources, index) {
  const at = index || 0;

  if (at >= sources.length) {
    console.warn('[Live2D] oh-my-live2d 所有源均加载失败');
    return Promise.reject(new Error('oh-my-live2d 所有源均加载失败'));
  }

  return loadScript(sources[at])
    .then(function () {
      if (window.OML2D) return window.OML2D;
      throw new Error('脚本已加载但没有取到 window.OML2D');
    })
    .catch(function (err) {
      console.warn('[Live2D] 加载失败，尝试下一个源：' + sources[at] + '（' + err.message + '）');
      return loadOml2dLibrary(sources, at + 1);
    });
}
