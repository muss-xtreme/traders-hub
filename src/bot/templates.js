// Original strategy templates, expressed as Blockly JSON workspaces so they open in the
// Bot Builder as fully editable block programs. Also used by the scanner's "Load bot".

let uid = 0;
const id = (p) => `${p}_${(uid += 1)}`;

// ---- tiny block DSL ----------------------------------------------------------------------

const num = (n) => ({ type: 'math_number', fields: { NUM: n } });
const text = (t) => ({ type: 'text', fields: { TEXT: t } });
const shadowNum = (n) => ({ shadow: num(n) });

function chain(blocks) {
  const list = blocks.filter(Boolean);
  for (let i = list.length - 2; i >= 0; i--) list[i] = { ...list[i], next: { block: list[i + 1] } };
  return list[0];
}

function vars(names) {
  const map = Object.fromEntries(names.map((n) => [n, id('v')]));
  return {
    defs: names.map((n) => ({ name: n, id: map[n] })),
    get: (n) => ({ type: 'variables_get', fields: { VAR: { id: map[n] } } }),
    set: (n, value) => ({ type: 'variables_set', fields: { VAR: { id: map[n] } }, inputs: { VALUE: { block: value } } }),
  };
}

const arith = (op, a, b) => ({ type: 'math_arithmetic', fields: { OP: op }, inputs: { A: { block: a }, B: { block: b } } });
const compare = (op, a, b) => ({ type: 'logic_compare', fields: { OP: op }, inputs: { A: { block: a }, B: { block: b } } });
const stat = (s) => ({ type: 'th_stat', fields: { STAT: s } });
const resultIs = (r) => ({ type: 'th_result_is', fields: { RESULT: r } });
const notify = (t) => ({ type: 'th_notify', inputs: { TEXT: { block: text(t) } } });

function ifChain(branches, elseBody) {
  const block = { type: 'controls_if', extraState: {}, inputs: {} };
  if (branches.length > 1) block.extraState.elseIfCount = branches.length - 1;
  if (elseBody) block.extraState.hasElse = true;
  branches.forEach(([cond, body], i) => {
    block.inputs[`IF${i}`] = { block: cond };
    const b = chain(body);
    if (b) block.inputs[`DO${i}`] = { block: b };
  });
  if (elseBody) block.inputs.ELSE = { block: chain(elseBody) };
  return block;
}

const purchase = (contract, prediction, stakeBlock) => ({
  type: 'th_purchase',
  fields: { CONTRACT: contract },
  inputs: {
    PREDICTION: prediction ?? shadowNum(0),
    STAKE: { block: stakeBlock },
  },
});

/**
 * Generic money-management skeleton shared by every template:
 * reset stake on win, multiply on loss, optional prediction switch after a loss,
 * stop at take-profit / stop-loss.
 */
function strategy({ symbol, duration = 1, stake = 1, martingale = 2, takeProfit = 10, stopLoss = 20,
  buy, predictionBefore, predictionAfter }) {
  const extra = predictionBefore !== undefined ? ['prediction'] : [];
  const v = vars(['stake', 'initialStake', 'martingale', 'lossCount', ...extra]);
  const usesPrediction = extra.length > 0;

  const init = chain([
    v.set('initialStake', num(stake)),
    v.set('stake', v.get('initialStake')),
    v.set('martingale', num(martingale)),
    v.set('lossCount', num(0)),
    usesPrediction && v.set('prediction', num(predictionBefore)),
  ]);

  const purchaseBody = buy(v);

  const restart = chain([
    ifChain([[resultIs('win'), [
      v.set('stake', v.get('initialStake')),
      v.set('lossCount', num(0)),
      usesPrediction && v.set('prediction', num(predictionBefore)),
    ]]], [
      v.set('stake', { type: 'math_round', fields: { OP: 'ROUND' }, inputs: { NUM: { block: arith('MULTIPLY', v.get('stake'), v.get('martingale')) } } }),
      v.set('lossCount', arith('ADD', v.get('lossCount'), num(1))),
      usesPrediction && v.set('prediction', num(predictionAfter)),
    ]),
    ifChain([
      [compare('GTE', stat('totalProfit'), num(takeProfit)), [notify(`Take profit ${takeProfit} reached`), { type: 'th_stop' }]],
      [compare('LTE', stat('totalProfit'), num(-Math.abs(stopLoss))), [notify(`Stop loss ${stopLoss} reached`), { type: 'th_stop' }]],
    ], [{ type: 'th_trade_again' }]),
  ]);

  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: 'th_trade_definition', x: 20, y: 20, fields: { MARKET: symbol, DURATION: duration },
          inputs: { INIT: { block: init } } },
        { type: 'th_purchase_conditions', x: 20, y: 330, inputs: { BODY: { block: purchaseBody } } },
        { type: 'th_restart_conditions', x: 520, y: 20, inputs: { BODY: { block: restart } } },
      ],
    },
    variables: v.defs,
  };
}

// math_round with a 2-decimal stake would need a custom block; round to cents via *100/100.
function cents(block) {
  return arith('DIVIDE', { type: 'math_round', fields: { OP: 'ROUND' }, inputs: { NUM: { block: arith('MULTIPLY', block, num(100)) } } }, num(100));
}

function fixStakeRounding(ws) {
  // Replace whole-unit rounding of the martingale stake with cent rounding.
  const walk = (b) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'variables_set' && b.inputs?.VALUE?.block?.type === 'math_round') {
      b.inputs.VALUE.block = cents(b.inputs.VALUE.block.inputs.NUM.block);
    }
    Object.values(b.inputs ?? {}).forEach((i) => walk(i.block));
    walk(b.next?.block);
  };
  ws.blocks.blocks.forEach(walk);
  return ws;
}

// ---- catalogue -----------------------------------------------------------------------------

export const TEMPLATES = [
  {
    id: 'even-odd-reversion',
    name: 'Parity Reversion',
    tag: 'EVEN / ODD',
    accent: '#c2410c',
    description: 'Trades against the dominant parity of the last 50 digits, martingale 2.1 on loss.',
    build: (o = {}) => strategy({
      symbol: o.symbol ?? 'R_75', stake: o.stake ?? 1, martingale: o.martingale ?? 2.1,
      takeProfit: o.takeProfit ?? 10, stopLoss: o.stopLoss ?? 25,
      buy: (v) => ifChain(
        [[compare('GT', { type: 'th_digit_share', fields: { N: 50, KIND: 'even', X: 0 } }, num(50)),
          [purchase('DIGITODD', null, v.get('stake'))]]],
        [purchase('DIGITEVEN', null, v.get('stake'))],
      ),
    }),
  },
  {
    id: 'over-recovery',
    name: 'Threshold Recovery',
    tag: 'OVER / UNDER',
    accent: '#047857',
    description: 'Over 2 until a loss, then Over 3 with a raised stake until the next win.',
    build: (o = {}) => strategy({
      symbol: o.symbol ?? 'R_100', stake: o.stake ?? 1, martingale: o.martingale ?? 2.5,
      takeProfit: o.takeProfit ?? 8, stopLoss: o.stopLoss ?? 20,
      predictionBefore: o.predictionBefore ?? 2, predictionAfter: o.predictionAfter ?? 3,
      buy: (v) => purchase(o.contract ?? 'DIGITOVER', { block: v.get('prediction') }, v.get('stake')),
    }),
  },
  {
    id: 'cold-digit-differs',
    name: 'Cold Digit Differs',
    tag: 'MATCHES / DIFFERS',
    accent: '#be123c',
    description: 'Differs on the least frequent digit of the last 100 ticks; flat stake.',
    build: (o = {}) => strategy({
      symbol: o.symbol ?? 'R_50', stake: o.stake ?? 2, martingale: o.martingale ?? 1,
      takeProfit: o.takeProfit ?? 5, stopLoss: o.stopLoss ?? 20,
      buy: (v) => purchase('DIGITDIFF', { block: { type: 'th_extreme_digit', fields: { WHICH: 'least', N: 100 } } }, v.get('stake')),
    }),
  },
  {
    id: 'momentum',
    name: 'Tick Momentum',
    tag: 'RISE / FALL',
    accent: '#1d4ed8',
    description: 'Follows the direction of the last 10 ticks on 5-tick Rise/Fall contracts.',
    build: (o = {}) => strategy({
      symbol: o.symbol ?? '1HZ100V', duration: 5, stake: o.stake ?? 1, martingale: o.martingale ?? 2,
      takeProfit: o.takeProfit ?? 10, stopLoss: o.stopLoss ?? 20,
      buy: (v) => ifChain(
        [[compare('GTE', { type: 'th_rise_share', fields: { N: 10 } }, num(50)), [purchase('CALL', null, v.get('stake'))]]],
        [purchase('PUT', null, v.get('stake'))],
      ),
    }),
  },
];

export const buildTemplate = (templateId, opts) => fixStakeRounding(TEMPLATES.find((t) => t.id === templateId).build(opts));

/** Workspace for a scanner result: fixed contract on the winning market. */
export function workspaceFromScan(result, money) {
  const base = { symbol: result.symbol, stake: money.stake, martingale: money.martingale,
    takeProfit: money.takeProfit, stopLoss: money.stopLoss };
  if (result.contract === 'DIGITEVEN' || result.contract === 'DIGITODD') {
    return fixStakeRounding(strategy({ ...base, buy: (v) => purchase(result.contract, null, v.get('stake')) }));
  }
  return fixStakeRounding(strategy({
    ...base,
    predictionBefore: result.barrier ?? 5,
    predictionAfter: result.recoveryBarrier ?? result.barrier ?? 5,
    buy: (v) => purchase(result.contract, { block: v.get('prediction') }, v.get('stake')),
  }));
}

export const emptyWorkspace = () => ({
  blocks: { languageVersion: 0, blocks: [
    { type: 'th_trade_definition', x: 20, y: 20, fields: { MARKET: 'R_10', DURATION: 1 } },
    { type: 'th_purchase_conditions', x: 20, y: 230, inputs: { BODY: { block: purchase('CALL', null, num(1)) } } },
    { type: 'th_restart_conditions', x: 480, y: 20, inputs: { BODY: { block: { type: 'th_trade_again' } } } },
  ] },
});
