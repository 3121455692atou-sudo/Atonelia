// Sole executable entry in index.html. Engine/UI modules are evaluated only after
// practice isolation succeeds. Keep the canonical app URL (no query suffix).
import { bootWithPractice, exitPractice } from './practice_context.js';

bootWithPractice({ loadApp: async () => { const app = await import('./app.js'); await app.bootReady; return app; } }).catch(error => {
  // Fail closed: never fall back to loading the ordinary app in this document.
  const host = document.getElementById('app');
  if (!host) return;
  host.replaceChildren();
  const message = document.createElement('p');
  message.textContent = error?.message || '无法安全开启练习';
  const back = document.createElement('button');
  back.className = 'btn';
  back.textContent = '返回游戏';
  back.addEventListener('click', () => exitPractice());
  host.append(message, back);
});
