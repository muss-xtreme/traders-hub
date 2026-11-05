import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitTable, entropy, evaluate, scanMarkets, clampTicks } from '../src/lib/scanner.js';
import { TickBuffer, lastDigit } from '../src/lib/markets.js';

const repeat = (pattern, n) => Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);

test('lastDigit keeps trailing zeros at market precision', () => {
  assert.equal(lastDigit(524.9, 2), 0);
  assert.equal(lastDigit(1234.567, 3), 7);
});

test('digitTable z-scores are zero for a uniform sample', () => {
  const t = digitTable(repeat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 100));
  t.forEach((r) => { assert.equal(r.count, 10); assert.equal(r.z, 0); });
  assert.ok(Math.abs(entropy(repeat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 100)) - 1) < 1e-9);
});

test('even/odd reversion trades the minority side above 55%', () => {
  const digits = repeat([0, 2, 4, 6, 1, 8, 3], 70); // ~71% even
  const s = evaluate(digits, 'even_odd_reversion');
  assert.equal(s.contract, 'DIGITODD');
  assert.ok(s.confidence > 55);
  assert.equal(evaluate(repeat([0, 1], 60), 'even_odd_reversion'), null);
});

test('over2_under8 picks Over 2 with recovery 3 when high digits dominate', () => {
  const s = evaluate(repeat([5, 6, 7, 8, 9, 3, 4, 1], 80), 'over2_under8');
  assert.deepEqual([s.contract, s.barrier, s.recoveryBarrier], ['DIGITOVER', 2, 3]);
});

test('too little history yields no signal', () => {
  assert.equal(evaluate([1, 2, 3], 'over2_under8'), null);
});

test('clampTicks bounds input to 100..5000', () => {
  assert.equal(clampTicks(10), 100);
  assert.equal(clampTicks(99999), 5000);
  assert.equal(clampTicks('abc'), 500);
});

test('TickBuffer evicts oldest ticks and keeps counters consistent', () => {
  const b = new TickBuffer(5);
  [1, 2, 3, 4, 5, 6, 7].forEach((q, i) => b.push(i, q, q % 10));
  assert.equal(b.length, 5);
  assert.equal(b.counts.reduce((a, c) => a + c, 0), 5);
  assert.equal(b.rises, 4);
  assert.equal(b.even, 2); // 4, 6
});

test('scanMarkets returns the highest-confidence market and never throws on partial failures', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const client = {
    async ticksHistory(symbol) {
      if (symbol === 'R_25') throw new Error('boom');
      const evenHeavy = symbol === 'R_75' ? [0, 2, 4, 6, 8, 2, 4, 1] : [0, 2, 4, 6, 1, 3, 5, 7, 9, 8];
      return { prices: repeat(evenHeavy, 200).map((d) => 100 + d / 100), pipSize: 2 };
    },
  };
  const r = await scanMarkets(client, { mode: 'smart', ticks: 200 });
  assert.equal(r.best.symbol, 'R_75');
  assert.equal(r.best.contract, 'DIGITODD');
  assert.equal(r.errors.length, 1);
});
