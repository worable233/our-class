// 统一设计常量 — 所有教师后台页面共用
export const UI = {
  // 页面标题
  pageHeader: {
    style: 'font-size:24px;font-weight:700;letter-spacing:-0.02em;line-height:1.3',
    subtitleStyle: 'font-size:13px;color:var(--text-muted);margin-top:4px;display:block',
  },
  // 弹窗
  modal: {
    headerStyle: 'font-size:16px;font-weight:600',
    contentStyle: 'padding:16px 24px',
    footerStyle: 'padding:12px 24px',
  },
  // 间距
  spacing: {
    pageGap: '20px',
    sectionGap: '16px',
    headerMargin: '0 0 16px 0',
  },
  // 语义颜色
  colors: {
    success: '#18a058',
    error: '#d03050',
    warning: '#f0a020',
    accent: '#5E6AD2',
  },
  // 加载
  loading: {
    minHeight: '200px',
  },
} as const
