import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {resolveAll} from '../helpers/career_bot.mjs';
import * as L from '../helpers/legacy_jobs.mjs';
for (const kind of ['research','idle']) test(`legacy ${kind} records explicit research even when initial display is research`,()=>{
  const s=E.createGame('rwkv','y2023',89);
  resolveAll(s);
  assert.equal(L.legacyFocus(s).kind,'research');
  assert.equal(Array.isArray(s.jobs.focusPause),false);
  L.decide(s,kind);
  assert.deepEqual(s.jobs.focusPause,[]);
  L.decide(s,kind);
  assert.deepEqual(s.jobs.focusPause,[]);
});
