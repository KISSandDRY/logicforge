import type { LogicState } from './types';

/**
 * Функція розв'язання спільної шини (Multi-Driver Bus Resolution Function) R(S)
 * за стандартом тристабільної логіки IEEE 1164:
 * - Відсутність активних драйверів або всі у стані 'Z' -> 'Z'
 * - Наявність стану 'X' або одночасна присутність '0' і '1' -> 'X' (коротке замикання / конфлікт)
 * - Узгоджений стан активних драйверів -> '0' або '1'
 */
export function resolveBusSignals(driverStates: LogicState[]): {
  state: LogicState;
  conflict: boolean;
} {
  if (driverStates.length === 0) {
    return { state: 'Z', conflict: false };
  }

  let seenZero = false;
  let seenOne = false;
  let seenX = false;

  for (const sig of driverStates) {
    if (sig === 'X') {
      seenX = true;
    } else if (sig === '0') {
      seenZero = true;
    } else if (sig === '1') {
      seenOne = true;
    }
  }

  if (seenZero && seenOne) {
    return { state: 'X', conflict: true };
  }
  if (seenX) {
    return { state: 'X', conflict: true };
  }
  if (seenOne) {
    return { state: '1', conflict: false };
  }
  if (seenZero) {
    return { state: '0', conflict: false };
  }
  return { state: 'Z', conflict: false };
}

/**
 * Нормалізація вхідного сигналу КМОН-вентиля: непідключений вхід 'Z' у комбінаційній логіці
 * має невизначений потенціал ('X'), якщо не задано інше.
 */
export function normalizeGateInput(signal: LogicState): '0' | '1' | 'X' {
  if (signal === '0' || signal === '1') {
    return signal;
  }
  return 'X';
}

export function logicNot(a: LogicState): LogicState {
  const norm = normalizeGateInput(a);
  if (norm === '0') return '1';
  if (norm === '1') return '0';
  return 'X';
}

/**
 * Кон'юнкція в тризначній/чотиризначній алгебрі Кліні:
 * домінування нуля (0 AND X = 0, 0 AND Z = 0).
 */
export function logicAnd(inputs: LogicState[]): LogicState {
  if (inputs.length === 0) return 'Z';
  let hasUnknown = false;
  for (const raw of inputs) {
    const v = normalizeGateInput(raw);
    if (v === '0') return '0';
    if (v === 'X') hasUnknown = true;
  }
  return hasUnknown ? 'X' : '1';
}

/**
 * Диз'юнкція в алгебрі Кліні:
 * домінування одиниці (1 OR X = 1, 1 OR Z = 1).
 */
export function logicOr(inputs: LogicState[]): LogicState {
  if (inputs.length === 0) return 'Z';
  let hasUnknown = false;
  for (const raw of inputs) {
    const v = normalizeGateInput(raw);
    if (v === '1') return '1';
    if (v === 'X') hasUnknown = true;
  }
  return hasUnknown ? 'X' : '0';
}

export function logicNand(inputs: LogicState[]): LogicState {
  return logicNot(logicAnd(inputs));
}

export function logicNor(inputs: LogicState[]): LogicState {
  return logicNot(logicOr(inputs));
}

export function logicXor(inputs: LogicState[]): LogicState {
  if (inputs.length === 0) return 'Z';
  let onesCount = 0;
  for (const raw of inputs) {
    const v = normalizeGateInput(raw);
    if (v === 'X') return 'X';
    if (v === '1') onesCount += 1;
  }
  return onesCount % 2 === 1 ? '1' : '0';
}

export function logicXnor(inputs: LogicState[]): LogicState {
  return logicNot(logicXor(inputs));
}

export function logicTriStateBuffer(data: LogicState, enable: LogicState): LogicState {
  if (enable === '0' || enable === 'Z') {
    return 'Z';
  }
  if (enable === 'X') {
    return 'X';
  }
  if (data === 'Z') {
    return 'Z';
  }
  return data;
}

export function evaluateMux4To1(
  d: [LogicState, LogicState, LogicState, LogicState],
  s0: LogicState,
  s1: LogicState,
): LogicState {
  const b0 = normalizeGateInput(s0);
  const b1 = normalizeGateInput(s1);
  if (b0 === 'X' || b1 === 'X') {
    const first = normalizeGateInput(d[0]);
    if (first !== 'X' && d.every((x) => normalizeGateInput(x) === first)) {
      return first;
    }
    return 'X';
  }
  const idx = (b1 === '1' ? 2 : 0) + (b0 === '1' ? 1 : 0);
  const selected = d[idx];
  return selected === 'Z' ? 'Z' : normalizeGateInput(selected);
}

export function evaluateAluSlice(
  a0: LogicState,
  a1: LogicState,
  b0: LogicState,
  b1: LogicState,
  op0: LogicState,
  op1: LogicState,
): { f0: LogicState; f1: LogicState; carry: LogicState; zero: LogicState } {
  const bits = [a0, a1, b0, b1, op0, op1].map((s) => (s === 'Z' ? '0' : normalizeGateInput(s)));
  if (bits.some((b) => b === 'X')) {
    return { f0: 'X', f1: 'X', carry: 'X', zero: 'X' };
  }

  const aVal = (bits[1] === '1' ? 2 : 0) + (bits[0] === '1' ? 1 : 0);
  const bVal = (bits[3] === '1' ? 2 : 0) + (bits[2] === '1' ? 1 : 0);
  const opcode = (bits[5] === '1' ? 2 : 0) + (bits[4] === '1' ? 1 : 0);

  let result = 0;
  let carryBit = 0;

  switch (opcode) {
    case 0: {
      // ADD
      const sum = aVal + bVal;
      result = sum & 0b11;
      carryBit = sum > 3 ? 1 : 0;
      break;
    }
    case 1: {
      // SUB
      const diff = aVal - bVal;
      carryBit = diff < 0 ? 1 : 0;
      result = ((diff % 4) + 4) % 4;
      break;
    }
    case 2: {
      // AND
      result = aVal & bVal;
      carryBit = 0;
      break;
    }
    default: {
      // XOR
      result = aVal ^ bVal;
      carryBit = 0;
      break;
    }
  }

  const f0: LogicState = (result & 1) === 1 ? '1' : '0';
  const f1: LogicState = (result & 2) === 2 ? '1' : '0';
  const carry: LogicState = carryBit === 1 ? '1' : '0';
  const zero: LogicState = result === 0 ? '1' : '0';
  return { f0, f1, carry, zero };
}

/**
 * Декодування 4-бітного входу 7-сегментного індикатора у символ HEX та маску сегментів a..g.
 */
export function decodeSevenSegment(
  b0: LogicState,
  b1: LogicState,
  b2: LogicState,
  b3: LogicState,
): {
  hexChar: string;
  segments: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
} {
  const inputs = [b0, b1, b2, b3].map((s) => (s === 'Z' ? '0' : s));
  if (inputs.some((s) => s === 'X')) {
    return {
      hexChar: 'E',
      segments: [true, false, false, true, true, true, true],
    };
  }
  const value =
    (inputs[3] === '1' ? 8 : 0) +
    (inputs[2] === '1' ? 4 : 0) +
    (inputs[1] === '1' ? 2 : 0) +
    (inputs[0] === '1' ? 1 : 0);

  const table: Array<[boolean, boolean, boolean, boolean, boolean, boolean, boolean]> = [
    [true, true, true, true, true, true, false], // 0
    [false, true, true, false, false, false, false], // 1
    [true, true, false, true, true, false, true], // 2
    [true, true, true, true, false, false, true], // 3
    [false, true, true, false, false, true, true], // 4
    [true, false, true, true, false, true, true], // 5
    [true, false, true, true, true, true, true], // 6
    [true, true, true, false, false, false, false], // 7
    [true, true, true, true, true, true, true], // 8
    [true, true, true, true, false, true, true], // 9
    [true, true, true, false, true, true, true], // A
    [false, false, true, true, true, true, true], // b
    [true, false, false, true, true, true, false], // C
    [false, true, true, true, true, false, true], // d
    [true, false, false, true, true, true, true], // E
    [true, false, false, false, true, true, true], // F
  ];

  return {
    hexChar: value.toString(16).toUpperCase(),
    segments: table[value] ?? table[0],
  };
}

/**
 * Математична модель астабільного режиму ІМС таймера NE555:
 * t_HIGH = ln(2) * (R1 + R2) * C
 * t_LOW  = ln(2) * R2 * C
 * Масштабовано в модельні наносекунди для дискретно-подійної черги.
 */
export function computeTimer555Intervals(
  r1Ohms = 1000,
  r2Ohms = 2000,
  capacitanceUf = 0.02,
): {
  highNs: number;
  lowNs: number;
  periodMs: number;
  frequencyHz: number;
  dutyCyclePercent: number;
} {
  const safeR1 = Math.max(100, r1Ohms);
  const safeR2 = Math.max(100, r2Ohms);
  const safeC = Math.max(0.001, capacitanceUf) * 1e-6;

  const ln2 = Math.LN2;
  const highSec = ln2 * (safeR1 + safeR2) * safeC;
  const lowSec = ln2 * safeR2 * safeC;
  const periodSec = highSec + lowSec;

  // У модельному часі 1 мкрс фізичного RC масштабуємо до 1 нс симуляції з обмеженням [15..500] нс
  const highNs = Math.max(15, Math.min(500, Math.round(highSec * 1e6)));
  const lowNs = Math.max(15, Math.min(500, Math.round(lowSec * 1e6)));

  return {
    highNs,
    lowNs,
    periodMs: Number((periodSec * 1000).toFixed(4)),
    frequencyHz: Number((1 / periodSec).toFixed(2)),
    dutyCyclePercent: Number(((highSec / periodSec) * 100).toFixed(1)),
  };
}
