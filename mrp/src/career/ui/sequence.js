// Independent high-entropy connection ranges, not wall-clock identities.
// 52 random bits leave at least 2^52 safe increments. This makes accidental
// cross-tab collisions extremely unlikely, not mathematically impossible.
export function createCommandSequence(random = globalThis.crypto) {
  if(typeof random?.getRandomValues !== 'function')throw new Error('无法安全初始化联机命令编号：浏览器缺少安全随机数，请更换或更新浏览器');
  const words=new Uint32Array(2);
  try{random.getRandomValues(words);}catch{throw new Error('无法安全初始化联机命令编号：安全随机数生成失败，请重新连接');}
  return (words[0]&0xfffff)*0x100000000+words[1];
}
export function nextCommandSequence(connection) {
  if(!Number.isSafeInteger(connection?.seq)||connection.seq<0||connection.seq>=Number.MAX_SAFE_INTEGER){
    throw new Error('联机命令编号已用尽或损坏，请重新连接；结果未知的旧请求请先核验，不会自动重发');
  }
  return ++connection.seq;
}
