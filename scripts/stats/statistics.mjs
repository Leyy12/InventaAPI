// Plain statistics helpers for load-test results. No dependencies.

export function mean(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Sample variance (n - 1).
export function variance(values) {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

export const stdDev = values => Math.sqrt(variance(values));

// Linear-interpolated percentile, p in [0, 100].
export function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export const median = values => percentile(values, 50);

// Two-sided Student t critical value for 95% confidence.
const T95 = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 15: 2.131, 20: 2.086, 30: 2.042, 60: 2.0, 120: 1.98 };
export function tCritical95(df) {
  if (df >= 120) return 1.96;
  const keys = Object.keys(T95).map(Number).sort((a, b) => a - b);
  const key = keys.filter(k => k <= df).pop() ?? 1;
  return T95[key];
}

export function confidenceInterval95(values) {
  const m = mean(values);
  const margin = tCritical95(values.length - 1) * stdDev(values) / Math.sqrt(values.length);
  return { lower: m - margin, upper: m + margin, margin };
}

// Regularized incomplete beta, used for the t-distribution p-value.
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const coef of c) ser += coef / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betaContinuedFraction(a, b, x) {
  let c = 1; let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
function incompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? front * betaContinuedFraction(a, b, x) / a
    : 1 - front * betaContinuedFraction(b, a, 1 - x) / b;
}
export function tTestPValueTwoSided(t, df) {
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

// Welch's t-test: are the means of two independent samples different?
export function welchTTest(a, b) {
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  const t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const p = tTestPValueTwoSided(t, df);
  return { t, df, p, significant: p < 0.05 };
}

export function describe(values) {
  const ci = confidenceInterval95(values);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: mean(values),
    median: median(values),
    stdDev: stdDev(values),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    ci95Lower: ci.lower,
    ci95Upper: ci.upper,
    coefficientOfVariation: stdDev(values) / mean(values),
  };
}
