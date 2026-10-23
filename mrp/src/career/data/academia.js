// 由 scripts/build_academia.mjs 从真实发布表生成，不要手改（重跑：node scripts/build_academia.mjs）。
// ACAD_REAL：各年开局前的真实开源最强（开局前没有开源发布时取表里第一款真实开源模型）。
// ACAD_START：学界起点表（M.3.7）：min(真实开源最强 − 4, 本局最弱开局档 4 个月内最好底座 − 3)。
export const ACAD_REAL = {
  "2023": {
    "ref": {
      "name": "LLaMA 65B",
      "day": "2023-02-24",
      "q": 39.6,
      "dims": {
        "knowledge": 59,
        "code": 36,
        "math": 30,
        "writing": 55,
        "safety": 35,
        "agent": 0
      }
    },
    "first": {
      "name": "LLaMA 65B",
      "day": "2023-02-24",
      "q": 39.6
    }
  },
  "2024": {
    "ref": {
      "name": "Qwen-72B",
      "day": "2023-11-30",
      "q": 57.5,
      "dims": {
        "knowledge": 74,
        "code": 58,
        "math": 55,
        "writing": 70,
        "safety": 62,
        "agent": 8
      }
    },
    "first": {
      "name": "LLaMA 65B",
      "day": "2023-02-24",
      "q": 39.6
    }
  },
  "2025": {
    "ref": {
      "name": "DeepSeek-V3",
      "day": "2024-12-26",
      "q": 74.3,
      "dims": {
        "knowledge": 84,
        "code": 79,
        "math": 72,
        "writing": 78,
        "safety": 64,
        "agent": 45
      }
    },
    "first": {
      "name": "LLaMA 65B",
      "day": "2023-02-24",
      "q": 39.6
    }
  }
};

export const ACAD_START = {
  "2023": {
    "small": 35.2,
    "specialist": 35.6,
    "major": 35.6
  },
  "2024": {
    "small": 42.9,
    "specialist": 47.5,
    "major": 53.5
  },
  "2025": {
    "small": 48.6,
    "specialist": 55.5,
    "major": 66
  }
};
