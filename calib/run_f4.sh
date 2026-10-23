#!/bin/bash
# 用法：calib/run_f4.sh <输出目录> [种子数，默认 4]
# 机器人（playGame）、大按钮（playAdvised）各 3 片并行，每片 8 家公司 × 4 个剧本 × 种子数；跑完汇总 F4 全表到 <输出目录>/f4.txt。
# 种子 4 时共 384 + 384 局，8 核机器约 4 分钟。
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$1; SEEDS=${2:-4}; mkdir -p "$OUT"
export REPO=$(cd "$HERE/../mrp" && pwd)
A=qwen,deepseek,gemini,claude,gpt,kimi,glm,grok
B=seed,rwkv,ernie,mistral,minimax,perplexity,image2,llama
C=hunyuan,stepfun,novelai,midjourney,suno,elevenlabs,fable,jev
i=0
for L in $A $B $C; do
  node "$HERE/f4_metrics.mjs" --mode bot --seeds $SEEDS --only $L --out "$OUT/f4_bot_$i.jsonl" > "$OUT/log_bot_$i.txt" 2>&1 &
  node "$HERE/f4_metrics.mjs" --mode adv --seeds $SEEDS --only $L --out "$OUT/f4_adv_$i.jsonl" > "$OUT/log_adv_$i.txt" 2>&1 &
  i=$((i+1))
done
wait
node "$HERE/f4_agg.mjs" "$OUT" > "$OUT/f4.txt" 2>&1
echo done > "$OUT/DONE"
