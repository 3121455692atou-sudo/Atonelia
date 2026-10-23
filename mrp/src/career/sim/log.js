// 公司日志：按天记一条，最多留 200 条。

export function log(s, text) { s.log.push({ date: s.day || s.date, text }); if (s.log.length > 200) s.log.shift(); }
