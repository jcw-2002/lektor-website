/*
 * oh-my-live2d 的初始化参数。
 *
 * 只描述「模型长什么样、菜单有哪些」，不涉及任何 DOM 操作与事件细节，
 * 聊天按钮通过 onChatToggle 回调交给上层装配。
 */

import { CHAT_ICON_ID } from '../ui/icons.js';

/* 状态条默认相对视口、菜单默认相对舞台，统一成同一个 bottom 才能对齐 */
const BOTTOM = '150px';

const IDLE_TIPS = {
  idleTips: { wordTheDay: true },
  welcomeTips: {
    message: {
      daybreak: '清晨好呀！大肥鱼还在打哈欠~',
      morning: '早上好，今天也要元气满满！',
      noon: '中午啦，记得吃午饭哦！',
      afternoon: '下午摸鱼时间到，来杯咖啡吧！',
      evening: '晚上好，今天过得充实吗？',
      night: '夜深了，注意休息别熬夜啦~'
    }
  }
};

function buildMenuItems(defaultItems, { aboutUrl, onChatToggle }) {
  return defaultItems
    // 只有一个模型、也没有换装，这两个入口没有意义
    .filter((item) => item.id !== 'SwitchModelClothes' && item.id !== 'SwitchModel')
    .map((item) => {
      if (item.id === 'Rest') return { ...item, title: '让大肥鱼休息一会' };
      if (item.id === 'About') {
        return {
          ...item,
          title: '关于本站',
          onClick: function () {
            window.open(aboutUrl, '_blank');
          }
        };
      }
      return item;
    })
    .concat([{
      id: 'Chat',
      icon: CHAT_ICON_ID,
      title: '和大肥鱼聊天 🐳',
      onClick: function () {
        onChatToggle();
      }
    }]);
}

export function buildModelOptions({ wrapper, config, onChatToggle }) {
  const { desktop, mobile } = config;

  return {
    parentElement: wrapper,
    mobileDisplay: mobile.display,
    models: [{
      path: config.modelUrl,
      scale: desktop.scale,
      position: desktop.position,
      stageStyle: { width: desktop.stage.width, height: desktop.stage.height },
      // 窄屏用更小的尺寸和缩放，避免占掉半个屏幕
      mobileScale: mobile.scale,
      mobilePosition: mobile.position,
      mobileStageStyle: { width: mobile.stage.width, height: mobile.stage.height }
    }],
    statusBar: {
      style: { bottom: BOTTOM }
    },
    tips: IDLE_TIPS,
    menus: {
      style: { bottom: BOTTOM },
      items: function (defaultItems) {
        return buildMenuItems(defaultItems, {
          aboutUrl: config.aboutUrl,
          onChatToggle
        });
      }
    }
  };
}
