// 密码计算使用 libuv 的异步工作池，不能占用世界 worker；队列与来源表都设硬上限。
import crypto from 'node:crypto';
export class Admission {
  constructor({ concurrency = 2, queueMax = 8, sourceMax = 4096, now = Date.now } = {}) {
    Object.assign(this, { concurrency, queueMax, sourceMax, now });
    this.active = 0; this.queue = []; this.nextSweep = 0; this.sources = new Map(); this.rooms = new Map(); this.global = [];
  }
  limited(source, room) {
    const now = this.now(), recent = a => (a || []).filter(t => t > now - 1000);
    // 清理不依赖新 IP；攻击结束后定时调用也能释放所有旧键。
    if (now >= this.nextSweep) this.sweep(now);
    const a = recent(this.sources.get(source)), b = recent(this.rooms.get(room));
    this.global = recent(this.global);
    if ((!this.sources.has(source) && this.sources.size >= this.sourceMax) || a.length >= 8 || b.length >= 16 || this.global.length >= 64) return true;
    a.push(now); b.push(now); this.global.push(now);
    this.sources.set(source, a); this.rooms.set(room, b); return false;
  }
  sweep(now = this.now()) {
    this.nextSweep = now + 1000;
    for (const map of [this.sources, this.rooms]) for (const [k, a] of map) if (!a.length || a.at(-1) <= now - 1000) map.delete(k);
    this.global = this.global.filter(t => t > now - 1000);
  }
  hash(password, salt, cancelled = () => false) {
    if (this.active >= this.concurrency && this.queue.length >= this.queueMax) return Promise.reject(Object.assign(new Error('密码校验繁忙'), { status: 429 }));
    return new Promise((resolve, reject) => { this.queue.push({ password, salt, cancelled, resolve, reject }); this.pump(); });
  }
  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift();
      if (job.cancelled()) { job.reject(new Error('请求已关闭')); continue; }
      this.active++;
      crypto.scrypt(job.password, job.salt, 32, (error, hash) => {
        this.active--; if (error) job.reject(error); else job.resolve(hash); this.pump();
      });
    }
  }
}
