// ─────────────────────────────────────────────────────────────────────────
// Daily neuron budget guard for Cloudflare Workers AI translation.
//
// Goal: NEVER incur paid usage. The cap is a configurable fraction (default
// 70%) of the daily free neuron allowance; once reached, translation stops
// calling Workers AI and falls back to English for the rest of the day.
//
// All three knobs are env-configurable. If Cloudflare lowers the free
// allowance, change only AI_DAILY_FREE_NEURONS and the 70% cap scales with it:
//   AI_DAILY_FREE_NEURONS  free neurons/day      (default 10000)
//   AI_SAFETY_FRACTION     cap as fraction       (default 0.85 → stop at 85%)
//   AI_NEURONS_PER_CALL    est. neurons / title  (default 80)
//
// On AI_NEURONS_PER_CALL: m2m100-1.2b on a short headline costs only a few
// dozen neurons, so 80 is a safe-but-not-paranoid estimate. Setting it too
// HIGH was the bug behind "titles revert to English" — the soft counter
// believed the budget was spent and stopped translating long before the real
// free allowance was anywhere near used. With 80, the 85% cap (8500 neurons)
// allows ~106 fresh translations/day, far more than the ~30-40 unique daily
// headlines, while the Free-plan backstop still guarantees zero billing.
//
// NOTE: this counter lives in worker memory (per-isolate), so it is a best
// effort estimate. The hard guarantee against any charge is the Workers FREE
// plan, on which over-allowance requests ERROR (and we fall back to English)
// rather than being billed. The counter keeps us well clear of that wall and
// powers the on-screen usage badge.
// ─────────────────────────────────────────────────────────────────────────

function num(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const DAILY_FREE_NEURONS = num(process.env.AI_DAILY_FREE_NEURONS, 10_000)
const SAFETY_FRACTION = Math.min(1, num(process.env.AI_SAFETY_FRACTION, 0.85))
const NEURONS_PER_CALL = num(process.env.AI_NEURONS_PER_CALL, 80) || 1
const BUDGET_NEURONS = Math.floor(DAILY_FREE_NEURONS * SAFETY_FRACTION)

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

let state = { day: today(), neurons: 0, calls: 0, blocked: 0 }

function roll() {
  const d = today()
  if (state.day !== d) state = { day: d, neurons: 0, calls: 0, blocked: 0 }
}

// True while there is headroom for one more translation call under the cap.
export function canSpend(): boolean {
  roll()
  if (BUDGET_NEURONS <= 0) return false
  return state.neurons + NEURONS_PER_CALL <= BUDGET_NEURONS
}

// Count a Workers AI call against the daily budget (conservative: counted on
// every attempt that passes the gate, whether or not it ultimately succeeds).
export function recordSpend() {
  roll()
  state.neurons += NEURONS_PER_CALL
  state.calls += 1
}

// Count a translation we deliberately skipped because the cap was reached.
export function recordBlocked() {
  roll()
  state.blocked += 1
}

export interface BudgetSnapshot {
  day: string
  dailyFreeNeurons: number
  safetyFraction: number
  budgetNeurons: number
  neuronsPerCall: number
  neuronsUsed: number
  calls: number
  blocked: number
  pctOfBudget: number // 0..100, 100 = 70%-of-free cap reached
  pctOfFree: number    // 0..100 of the full free allowance
  capReached: boolean
}

export function budgetSnapshot(): BudgetSnapshot {
  roll()
  return {
    day: state.day,
    dailyFreeNeurons: DAILY_FREE_NEURONS,
    safetyFraction: SAFETY_FRACTION,
    budgetNeurons: BUDGET_NEURONS,
    neuronsPerCall: NEURONS_PER_CALL,
    neuronsUsed: state.neurons,
    calls: state.calls,
    blocked: state.blocked,
    pctOfBudget: BUDGET_NEURONS > 0 ? Math.round((state.neurons / BUDGET_NEURONS) * 100) : 100,
    pctOfFree: DAILY_FREE_NEURONS > 0 ? Math.round((state.neurons / DAILY_FREE_NEURONS) * 100) : 100,
    capReached: !canSpend(),
  }
}
