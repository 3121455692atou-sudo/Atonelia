// 真实年代经营模式（v0.7）：算力与出口管制。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { END, GPUS, gpuAvailable, gpuRentable, gpuMarkup } from '../../src/career/data/core.js';
import { resolveAll, advance } from '../helpers/career_bot.mjs';

describe('算力与出口管制', () => {
  it('H200 2026 年 2 月起可以进口到中国但要多付 25%，B 系列和 Rubin 一直禁售', () => {
    assert.equal(gpuAvailable('H200', '2026-01', 'CN'), false);
    assert.equal(gpuAvailable('H200', '2026-02', 'CN'), true);
    assert.equal(gpuMarkup('H200', '2026-03', 'CN'), 1.25);
    assert.equal(gpuMarkup('H200', '2026-03', 'US'), 1);
    for (const g of ['B200', 'B300', 'Rubin']) assert.equal(gpuAvailable(g, END, 'CN'), false, g);
    assert.equal(gpuAvailable('Ascend950', '2026-05', 'US'), false);
  });
  it('海外子公司只能租、不能买', () => {
    assert.equal(gpuRentable('H100', '2025-01', 'CN', false), false);
    assert.equal(gpuRentable('H100', '2025-01', 'CN', true), true);
    const s = E.createGame('qwen', 'y2025', 4);
    resolveAll(s);
    assert.throws(() => E.buyGpu(s, 'H100', 64));
    s.flags.overseasRent = true;
    E.buyGpu(s, 'H100', 64, true);
    assert.ok(!s.gpus.rented.H100, '租卡要过几天才开通');
    advance(s, 12);
    assert.equal(s.gpus.rented.H100, 64);
    assert.throws(() => E.buyGpu(s, 'H100', 64));
  });
  it('每款卡的数据齐全', () => {
    for (const [id, g] of Object.entries(GPUS)) assert.ok(g.label && g.from && g.flops > 0 && g.infer > 0 && g.price > 0 && g.rent > 0, id);
  });
});
