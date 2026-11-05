// Custom Blockly blocks + JavaScript generator for the Bot Builder.
// A bot = "1. Trade parameters" (market, duration, run-once init), "2. Purchase conditions"
// and "3. Restart trading conditions". The generator turns the workspace into an async
// function body executed by runtime.js with a `bot` API object.

import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import { javascriptGenerator, Order } from 'blockly/javascript';
import { MARKETS, CONTRACTS } from '../lib/markets.js';

Blockly.setLocale(En);

const MARKET_OPTIONS = MARKETS.map((m) => [m.label, m.value]);
const CONTRACT_OPTIONS = CONTRACTS.map((c) => [c.label, c.value]);
const ROOT = '#123a5e';
const TRADE = '#1f6f8b';
const ANALYSIS = '#7a4fb5';

Blockly.common.defineBlocksWithJsonArray([
  {
    type: 'th_trade_definition',
    message0: '1. Trade parameters',
    message1: 'Market %1',
    args1: [{ type: 'field_dropdown', name: 'MARKET', options: MARKET_OPTIONS }],
    message2: 'Duration %1 ticks',
    args2: [{ type: 'field_number', name: 'DURATION', value: 1, min: 1, max: 10, precision: 1 }],
    message3: 'Run once at start %1',
    args3: [{ type: 'input_statement', name: 'INIT' }],
    colour: ROOT,
    tooltip: 'Where and how long each contract runs, plus setup that runs once.',
  },
  {
    type: 'th_purchase_conditions',
    message0: '2. Purchase conditions %1',
    args0: [{ type: 'input_statement', name: 'BODY' }],
    colour: ROOT,
    tooltip: 'Runs before every trade. Must contain a Purchase block.',
  },
  {
    type: 'th_restart_conditions',
    message0: '3. Restart trading conditions %1',
    args0: [{ type: 'input_statement', name: 'BODY' }],
    colour: ROOT,
    tooltip: 'Runs after each contract settles. Use "Trade again" to continue.',
  },
  {
    type: 'th_purchase',
    message0: 'Purchase %1 prediction %2 stake %3',
    args0: [
      { type: 'field_dropdown', name: 'CONTRACT', options: CONTRACT_OPTIONS },
      { type: 'input_value', name: 'PREDICTION', check: 'Number' },
      { type: 'input_value', name: 'STAKE', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: TRADE,
    tooltip: 'Buys one contract and waits for it to settle. Prediction is used by Over/Under/Matches/Differs.',
  },
  {
    type: 'th_trade_again',
    message0: 'Trade again',
    previousStatement: null,
    colour: TRADE,
    tooltip: 'Starts the next round.',
  },
  {
    type: 'th_stop',
    message0: 'Stop the bot',
    previousStatement: null,
    colour: '#b42318',
  },
  {
    type: 'th_result_is',
    message0: 'Result is %1',
    args0: [{ type: 'field_dropdown', name: 'RESULT', options: [['Win', 'win'], ['Loss', 'loss']] }],
    output: 'Boolean',
    colour: TRADE,
  },
  {
    type: 'th_stat',
    message0: '%1',
    args0: [{
      type: 'field_dropdown',
      name: 'STAT',
      options: [['Last profit', 'lastProfit'], ['Total profit', 'totalProfit'], ['No. of runs', 'runs'],
        ['Balance', 'balance'], ['Last digit', 'lastDigit'], ['Last price', 'lastPrice'], ['Consecutive losses', 'lossStreak']],
    }],
    output: 'Number',
    colour: TRADE,
  },
  {
    type: 'th_digit_share',
    message0: '%% of last %1 digits that %2 %3',
    args0: [
      { type: 'field_number', name: 'N', value: 50, min: 5, max: 1000, precision: 1 },
      { type: 'field_dropdown', name: 'KIND', options: [['are even', 'even'], ['are odd', 'odd'], ['are over', 'over'], ['are under', 'under'], ['equal', 'equal']] },
      { type: 'field_number', name: 'X', value: 4, min: 0, max: 9, precision: 1 },
    ],
    output: 'Number',
    colour: ANALYSIS,
    tooltip: 'Share (0-100) of recent last digits matching the rule. X is ignored for even/odd.',
  },
  {
    type: 'th_extreme_digit',
    message0: '%1 frequent digit in last %2 ticks',
    args0: [
      { type: 'field_dropdown', name: 'WHICH', options: [['Most', 'most'], ['Least', 'least']] },
      { type: 'field_number', name: 'N', value: 100, min: 10, max: 1000, precision: 1 },
    ],
    output: 'Number',
    colour: ANALYSIS,
  },
  {
    type: 'th_rise_share',
    message0: '%% of rising ticks in last %1',
    args0: [{ type: 'field_number', name: 'N', value: 20, min: 2, max: 1000, precision: 1 }],
    output: 'Number',
    colour: ANALYSIS,
  },
  {
    type: 'th_wait_ticks',
    message0: 'Wait %1 ticks',
    args0: [{ type: 'field_number', name: 'N', value: 1, min: 1, max: 100, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: ANALYSIS,
  },
  {
    type: 'th_notify',
    message0: 'Notify %1',
    args0: [{ type: 'input_value', name: 'TEXT' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#5b6b7a',
  },
]);

// ---- generators ------------------------------------------------------------------------

const g = javascriptGenerator;
g.INFINITE_LOOP_TRAP = 'if (!bot.running) throw bot.STOPPED;\n';

g.forBlock.th_trade_definition = () => '';
g.forBlock.th_purchase_conditions = () => '';
g.forBlock.th_restart_conditions = () => '';

g.forBlock.th_purchase = (block) => {
  const contract = block.getFieldValue('CONTRACT');
  const prediction = g.valueToCode(block, 'PREDICTION', Order.NONE) || 'null';
  const stake = g.valueToCode(block, 'STAKE', Order.NONE) || '1';
  return `await bot.purchase(${JSON.stringify(contract)}, ${prediction}, ${stake});\n`;
};
g.forBlock.th_trade_again = () => 'bot.again = true;\n';
g.forBlock.th_stop = () => 'bot.stop("Stopped by strategy");\n';
g.forBlock.th_result_is = (b) => [`(bot.lastResult === ${JSON.stringify(b.getFieldValue('RESULT'))})`, Order.EQUALITY];
g.forBlock.th_stat = (b) => [`bot.stat(${JSON.stringify(b.getFieldValue('STAT'))})`, Order.FUNCTION_CALL];
g.forBlock.th_digit_share = (b) => [
  `bot.digitShare(${Number(b.getFieldValue('N'))}, ${JSON.stringify(b.getFieldValue('KIND'))}, ${Number(b.getFieldValue('X'))})`,
  Order.FUNCTION_CALL,
];
g.forBlock.th_extreme_digit = (b) => [
  `bot.extremeDigit(${JSON.stringify(b.getFieldValue('WHICH'))}, ${Number(b.getFieldValue('N'))})`,
  Order.FUNCTION_CALL,
];
g.forBlock.th_rise_share = (b) => [`bot.riseShare(${Number(b.getFieldValue('N'))})`, Order.FUNCTION_CALL];
g.forBlock.th_wait_ticks = (b) => `await bot.waitTicks(${Number(b.getFieldValue('N'))});\n`;
g.forBlock.th_notify = (b) => `bot.notify(${g.valueToCode(b, 'TEXT', Order.NONE) || '""'});\n`;

/** Compile a workspace into {settings, code}. Throws with a user-facing message if invalid. */
export function compileWorkspace(ws) {
  const def = ws.getBlocksByType('th_trade_definition', false)[0];
  const purchase = ws.getBlocksByType('th_purchase_conditions', false)[0];
  const restart = ws.getBlocksByType('th_restart_conditions', false)[0];
  if (!def || !purchase) throw new Error('The bot needs "1. Trade parameters" and "2. Purchase conditions" blocks.');
  if (!purchase.getDescendants(false).some((b) => b.type === 'th_purchase')) {
    throw new Error('Add a Purchase block inside "2. Purchase conditions".');
  }

  g.init(ws);
  const init = g.statementToCode(def, 'INIT');
  const buy = g.statementToCode(purchase, 'BODY');
  const after = restart ? g.statementToCode(restart, 'BODY') : '';
  const body = `${init}
while (bot.running) {
  bot.again = false;
${buy}
${after}
  if (!bot.again) break;
}
`;
  const code = g.finish(body);
  return {
    settings: { symbol: def.getFieldValue('MARKET'), duration: Number(def.getFieldValue('DURATION')) },
    code,
  };
}

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Trade', colour: TRADE, contents: [
      { kind: 'block', type: 'th_purchase', inputs: {
        PREDICTION: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
        STAKE: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
      } },
      { kind: 'block', type: 'th_trade_again' },
      { kind: 'block', type: 'th_stop' },
      { kind: 'block', type: 'th_result_is' },
      { kind: 'block', type: 'th_stat' },
    ] },
    { kind: 'category', name: 'Analysis', colour: ANALYSIS, contents: [
      { kind: 'block', type: 'th_digit_share' },
      { kind: 'block', type: 'th_extreme_digit' },
      { kind: 'block', type: 'th_rise_share' },
      { kind: 'block', type: 'th_wait_ticks' },
    ] },
    { kind: 'sep' },
    { kind: 'category', name: 'Logic', categorystyle: 'logic_category', contents: [
      { kind: 'block', type: 'controls_if' },
      { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
      { kind: 'block', type: 'logic_compare' },
      { kind: 'block', type: 'logic_operation' },
      { kind: 'block', type: 'logic_negate' },
      { kind: 'block', type: 'logic_boolean' },
    ] },
    { kind: 'category', name: 'Math', categorystyle: 'math_category', contents: [
      { kind: 'block', type: 'math_number' },
      { kind: 'block', type: 'math_arithmetic' },
      { kind: 'block', type: 'math_round' },
      { kind: 'block', type: 'math_modulo' },
      { kind: 'block', type: 'math_random_int' },
    ] },
    { kind: 'category', name: 'Text', categorystyle: 'text_category', contents: [
      { kind: 'block', type: 'text' },
      { kind: 'block', type: 'text_join' },
      { kind: 'block', type: 'th_notify' },
    ] },
    { kind: 'category', name: 'Variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
    { kind: 'category', name: 'Loops', categorystyle: 'loop_category', contents: [
      { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } },
      { kind: 'block', type: 'controls_whileUntil' },
    ] },
  ],
};

export { Blockly };
