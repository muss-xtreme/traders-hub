// Honest statistics for digit analysis: true contract win probabilities and a
// chi-square test of whether observed last digits deviate from a fair 0-9 distribution.

/** Probability that a fair last digit wins the contract (Deriv digits are uniform 0-9). */
export function winProbability(contract, barrier) {
  const b = Number(barrier);
  switch (contract) {
    case 'DIGITEVEN':
    case 'DIGITODD': return 0.5;
    case 'DIGITMATCH': return 0.1;
    case 'DIGITDIFF': return 0.9;
    case 'DIGITOVER': return Math.max(0, (9 - b) / 10);
    case 'DIGITUNDER': return Math.max(0, b / 10);
    default: return null;
  }
}

// ln Γ(x) — Lanczos approximation.
function lnGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Regularized upper incomplete gamma Q(a, x).
function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a; let term = sum;
    for (let n = 1; n < 200; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-12) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a; let c = 1e300; let d = 1 / b; let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Chi-square goodness-of-fit of digit counts against uniform. Returns {chi2, df, p}. */
export function uniformityTest(counts) {
  const n = counts.reduce((a, c) => a + c, 0);
  if (!n) return { chi2: 0, df: 9, p: 1 };
  const e = n / 10;
  const chi2 = counts.reduce((a, c) => a + ((c - e) ** 2) / e, 0);
  return { chi2, df: 9, p: gammaQ(4.5, chi2 / 2) };
}

export const describeP = (p) => (
  p < 0.01 ? 'unusually uneven (p < 0.01) — still expected occasionally by chance across many markets'
    : p < 0.05 ? 'mildly uneven (p < 0.05) — common by chance'
      : 'consistent with a fair random generator'
);
