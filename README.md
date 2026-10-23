# Atonelia：《模型育成计划》v1.0 快照

《模型育成计划》是一个网页上的 AI 模型公司经营模拟：按天推进，有史实（2023–2026 按真实月份）、单人自洽（从零开局的虚构世界）、联机三种玩法。原生 HTML、CSS、JavaScript，没有构建步骤。

这个仓库是 v1.0 的一份快照，用来请人帮忙排查和校准，不是日常开发的主仓库。

- `mrp/`：游戏仓库的完整快照。游戏说明、怎么跑、代码地图见 `mrp/README.md`，版本历史见 `mrp/CHANGELOG.md`，规格见 `mrp/docs/spec/v1.0-spec.md`。
- `calib/`：平衡校准脚本、探针，以及当前代码的校准结果（`calib/results/`）。
- `README_PRO.md`：待解决的几道难题和约束。

快速开始：

```sh
cd mrp
npm test          # Node 自带的测试，约 1270 项
npm start         # 单机版，http://127.0.0.1:8765/
```
