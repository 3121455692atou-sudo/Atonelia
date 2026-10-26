import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../src/career/css/post_plan.css', import.meta.url), 'utf8');
const feedback = fs.readFileSync(new URL('../../src/career/css/post_plan_feedback.css', import.meta.url), 'utf8');
test('whole-hand arrival effects cannot make scene lines show through card art and text', () => {
  for (const name of ['pp-hand-deal', 'pp-first-hand']) {
    const block = feedback.slice(feedback.indexOf(`@keyframes ${name} {`)).split('\n')[0];
    assert.match(block, /transform:/); assert.doesNotMatch(block, /opacity:/);
  }
  assert.match(css, /\.pp-hand \.pp-card \{[^}]*background:#fffff5;/);
});
test('saving, authorized auto and unaffordable states preserve opaque card contrast without removing disabled semantics', () => {
  assert.match(css, /\.post-plan \.pp-hand \.pp-card:disabled \{ opacity:1;/);
  assert.match(feedback, /\.pp-card\[aria-disabled="true"\] \{ opacity:1;cursor:help;/);
  assert.match(feedback, /\[aria-disabled="true"\] \.pp-card-art \{ filter:saturate\(/);
});
