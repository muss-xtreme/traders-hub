import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniformityTest, winProbability } from '../src/lib/stats.js';

test('uniform counts give chi2 = 0 and p = 1', () => {
  const r = uniformityTest(Array(10).fill(50));
  assert.equal(r.chi2, 0);
  assert.ok(Math.abs(r.p - 1) < 1e-9);
});

test('chi-square p-value matches reference values (df = 9)', () => {
  // chi2 = 16.919 is the 5% critical value for 9 degrees of freedom.
  const counts = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
  const shift = Math.sqrt(16.919 * 50 / 2);
  counts[0] += shift; counts[1] -= shift;
  assert.ok(Math.abs(uniformityTest(counts).p - 0.05) < 0.001);
  // 21.666 is the 1% critical value.
  const c2 = Array(10).fill(50); const s2 = Math.sqrt(21.666 * 50 / 2);
  c2[0] += s2; c2[1] -= s2;
  assert.ok(Math.abs(uniformityTest(c2).p - 0.01) < 0.0005);
});

test('true win probabilities for digit contracts', () => {
  assert.equal(winProbability('DIGITMATCH', 7), 0.1);
  assert.equal(winProbability('DIGITDIFF', 7), 0.9);
  assert.equal(winProbability('DIGITOVER', 2), 0.7);
  assert.equal(winProbability('DIGITUNDER', 8), 0.8);
  assert.equal(winProbability('DIGITEVEN'), 0.5);
});
