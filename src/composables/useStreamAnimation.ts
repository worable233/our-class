/**
 * AI 聊天逐字输出动画配置
 *
 * 所有参数集中在此，方便调试迭代。
 * 浏览器中打开 DevTools → Console 可直接覆盖：
 *   window.__STREAM_CONFIG = { ... }
 */
export const STREAM_CONFIG = {
  /** 每次 tick 追加的字符数 */
  CHARS_PER_TICK: 4,
  /** tick 间隔（ms） */
  TICK_INTERVAL_MS: 60,
  /** 单字符不透明度 从 60%→100% 的时长（ms） */
  ANIMATION_DURATION_MS: 500,
  /** 辉光从亮→灭 的时长（ms），比 opacity 动画长，形成拖尾感 */
  GLOW_DURATION_MS: 800,
  /** 非线性缓动函数 */
  ANIMATION_EASING: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  /** 字符刚出现时的不透明度（0-1） */
  INITIAL_OPACITY: 0.6,
}

/**
 * 根据当前主题返回辉光的 RGB 颜色值
 * 深色模式：白色辉光；浅色模式：蓝色辉光
 */
export function getGlowRgb(): string {
  return document.documentElement.classList.contains('dark')
    ? '255,255,255'
    : '60,120,255'
}

/**
 * 生成 .stream-char 动画用 CSS 字符串（注入到组件 style 或全局）
 */
export function buildStreamAnimationCSS(config = STREAM_CONFIG): string {
  const dur = `${config.ANIMATION_DURATION_MS}ms`
  const easing = config.ANIMATION_EASING
  const opacity = config.INITIAL_OPACITY
  const glow1 = `${config.GLOW_COLOR} 0 0 ${config.GLOW_BLUR}`
  const glow2 = `${config.GLOW_COLOR_2} 0 0 ${config.GLOW_SPREAD}`
  return `
@keyframes charGlow {
  0%   { opacity: ${opacity}; text-shadow: ${glow1}, ${glow2}; }
  100% { opacity: 1;          text-shadow: none; }
}
.stream-char {
  animation: charGlow ${dur} ${easing} forwards;
}`
}
