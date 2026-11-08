import { createNodeFromCatalog } from './catalog';
import type { CircuitDocument, CircuitEdgeData, CircuitNodeData } from './types';

function edge(
  id: string,
  sourceNodeId: string,
  sourcePinId: string,
  targetNodeId: string,
  targetPinId: string,
): CircuitEdgeData {
  return {
    id,
    sourceNodeId,
    sourcePinId,
    targetNodeId,
    targetPinId,
    signalState: '0',
  };
}

export interface PresetCircuitTemplate {
  id: string;
  slug: string;
  document: CircuitDocument;
}

export function buildFullAdderPreset(): CircuitDocument {
  const swA = createNodeFromCatalog('INPUT_SWITCH', 'n_sw_a', { x: 80, y: 80 }, 'A');
  swA.properties.switchState = '1';
  const swB = createNodeFromCatalog('INPUT_SWITCH', 'n_sw_b', { x: 80, y: 180 }, 'B');
  swB.properties.switchState = '1';
  const swCin = createNodeFromCatalog('INPUT_SWITCH', 'n_sw_cin', { x: 80, y: 290 }, 'Cin');
  swCin.properties.switchState = '0';

  const xor1 = createNodeFromCatalog('XOR', 'n_xor_1', { x: 280, y: 110 }, 'XOR1');
  const xor2 = createNodeFromCatalog('XOR', 'n_xor_2', { x: 480, y: 150 }, 'XOR2');
  const and1 = createNodeFromCatalog('AND', 'n_and_1', { x: 280, y: 240 }, 'AND1');
  const and2 = createNodeFromCatalog('AND', 'n_and_2', { x: 480, y: 270 }, 'AND2');
  const or1 = createNodeFromCatalog('OR', 'n_or_1', { x: 660, y: 255 }, 'OR_COUT');

  const ledSum = createNodeFromCatalog('LED', 'n_led_sum', { x: 830, y: 155 }, 'SUM');
  ledSum.properties.ledColor = 'emerald';
  const ledCout = createNodeFromCatalog('LED', 'n_led_cout', { x: 830, y: 260 }, 'COUT');
  ledCout.properties.ledColor = 'cyan';

  const nodes: CircuitNodeData[] = [swA, swB, swCin, xor1, xor2, and1, and2, or1, ledSum, ledCout];

  const edges: CircuitEdgeData[] = [
    edge('e1', 'n_sw_a', 'OUT', 'n_xor_1', 'A'),
    edge('e2', 'n_sw_b', 'OUT', 'n_xor_1', 'B'),
    edge('e3', 'n_xor_1', 'Y', 'n_xor_2', 'A'),
    edge('e4', 'n_sw_cin', 'OUT', 'n_xor_2', 'B'),
    edge('e5', 'n_sw_a', 'OUT', 'n_and_1', 'A'),
    edge('e6', 'n_sw_b', 'OUT', 'n_and_1', 'B'),
    edge('e7', 'n_xor_1', 'Y', 'n_and_2', 'A'),
    edge('e8', 'n_sw_cin', 'OUT', 'n_and_2', 'B'),
    edge('e9', 'n_and_1', 'Y', 'n_or_1', 'A'),
    edge('e10', 'n_and_2', 'Y', 'n_or_1', 'B'),
    edge('e11', 'n_xor_2', 'Y', 'n_led_sum', 'IN'),
    edge('e12', 'n_or_1', 'Y', 'n_led_cout', 'IN'),
  ];

  return {
    metadata: {
      schemaVersion: '1.0.0',
      title: '1-бітний повний двійковий суматор (Full Adder)',
      description:
        'Класичний комбінаційний вузол АЛП на двох елементах XOR, двох AND та елементі OR для формування суми SUM та переносу COUT.',
      category: 'Комбінаційні схеми',
      tags: ['суматор', 'АЛП', 'XOR', 'комбінаційна логіка'],
      createdAt: '2026-10-15T10:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    },
    viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
    nodes,
    edges,
  };
}

export function buildTriStateBusPreset(): CircuitDocument {
  const d0 = createNodeFromCatalog('INPUT_SWITCH', 'n_d0', { x: 70, y: 70 }, 'DATA_A');
  d0.properties.switchState = '1';
  const en0 = createNodeFromCatalog('INPUT_SWITCH', 'n_en0', { x: 70, y: 150 }, 'EN_A');
  en0.properties.switchState = '1';

  const d1 = createNodeFromCatalog('INPUT_SWITCH', 'n_d1', { x: 70, y: 260 }, 'DATA_B');
  d1.properties.switchState = '0';
  const en1 = createNodeFromCatalog('INPUT_SWITCH', 'n_en1', { x: 70, y: 340 }, 'EN_B');
  en1.properties.switchState = '0';

  const bufA = createNodeFromCatalog('TRI_BUFFER', 'n_buf_a', { x: 290, y: 95 }, 'DRV_A');
  const bufB = createNodeFromCatalog('TRI_BUFFER', 'n_buf_b', { x: 290, y: 285 }, 'DRV_B');

  const busProbe = createNodeFromCatalog('PROBE', 'n_probe_bus', { x: 540, y: 145 }, 'SHARED_BUS');
  const busLed = createNodeFromCatalog('LED', 'n_led_bus', { x: 540, y: 245 }, 'BUS_LED');
  busLed.properties.ledColor = 'amber';

  return {
    metadata: {
      schemaVersion: '1.0.0',
      title: 'Тристабільна спільна магістраль даних (High-Z та детектор колізій)',
      description:
        'Демонстрація роботи шини мікропроцесора з двома тристабільними буферами: при EN_A=0, EN_B=0 лінія перебуває у стані High-Z (Z), а при одночасному ввімкненні з різними рівнями виникає конфлікт шини (X).',
      category: 'Мікропроцесорні шини',
      tags: ['High-Z', 'Tri-State', 'шина даних', 'конфлікт'],
      createdAt: '2026-10-16T09:00:00.000Z',
      updatedAt: '2026-11-02T14:00:00.000Z',
    },
    viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
    nodes: [d0, en0, d1, en1, bufA, bufB, busProbe, busLed],
    edges: [
      edge('eb1', 'n_d0', 'OUT', 'n_buf_a', 'D'),
      edge('eb2', 'n_en0', 'OUT', 'n_buf_a', 'EN'),
      edge('eb3', 'n_d1', 'OUT', 'n_buf_b', 'D'),
      edge('eb4', 'n_en1', 'OUT', 'n_buf_b', 'EN'),
      edge('eb5', 'n_buf_a', 'Y', 'n_probe_bus', 'IN'),
      edge('eb6', 'n_buf_b', 'Y', 'n_probe_bus', 'IN'),
      edge('eb7', 'n_buf_a', 'Y', 'n_led_bus', 'IN'),
    ],
  };
}

export function buildCounterHexPreset(): CircuitDocument {
  const clk = createNodeFromCatalog('CLOCK', 'n_clk', { x: 80, y: 90 }, 'SYS_CLK');
  clk.properties.frequencyHz = 2;
  clk.properties.halfPeriodNs = 40;

  const en = createNodeFromCatalog('INPUT_SWITCH', 'n_en', { x: 80, y: 195 }, 'COUNT_EN');
  en.properties.switchState = '1';

  const rst = createNodeFromCatalog('INPUT_SWITCH', 'n_rst', { x: 80, y: 290 }, 'RESET');
  rst.properties.switchState = '0';

  const cnt = createNodeFromCatalog('COUNTER_4BIT', 'n_cnt', { x: 310, y: 140 }, 'CNT_4BIT');
  const hex = createNodeFromCatalog('SEVEN_SEGMENT', 'n_hex', { x: 580, y: 115 }, 'HEX_DISP');
  const carryLed = createNodeFromCatalog('LED', 'n_led_co', { x: 580, y: 285 }, 'OVERFLOW');
  carryLed.properties.ledColor = 'red';

  return {
    metadata: {
      schemaVersion: '1.0.0',
      title: 'Синхронний 4-розрядний лічильник із 7-сегментним HEX-дешифратором',
      description:
        'Послідовнісна схема відліку тактових імпульсів 0..F із відображенням коду на семисегментному індикаторі та прапорцем переповнення CO.',
      category: 'Тригери та лічильники',
      tags: ['лічильник', 'CLK', '7-сегментний індикатор', 'послідовнісна логіка'],
      createdAt: '2026-10-18T11:30:00.000Z',
      updatedAt: '2026-11-03T16:15:00.000Z',
    },
    viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
    nodes: [clk, en, rst, cnt, hex, carryLed],
    edges: [
      edge('ec1', 'n_clk', 'OUT', 'n_cnt', 'CLK'),
      edge('ec2', 'n_en', 'OUT', 'n_cnt', 'EN'),
      edge('ec3', 'n_rst', 'OUT', 'n_cnt', 'RST'),
      edge('ec4', 'n_cnt', 'Q0', 'n_hex', 'B0'),
      edge('ec5', 'n_cnt', 'Q1', 'n_hex', 'B1'),
      edge('ec6', 'n_cnt', 'Q2', 'n_hex', 'B2'),
      edge('ec7', 'n_cnt', 'Q3', 'n_hex', 'B3'),
      edge('ec8', 'n_cnt', 'CO', 'n_led_co', 'IN'),
    ],
  };
}

export function buildTimer555JkDividerPreset(): CircuitDocument {
  const rstSw = createNodeFromCatalog('INPUT_SWITCH', 'n_555_en', { x: 70, y: 165 }, 'RUN_555');
  rstSw.properties.switchState = '1';

  const vcc = createNodeFromCatalog('CONST_HIGH', 'n_vcc', { x: 280, y: 290 }, 'VCC');
  const gnd = createNodeFromCatalog('CONST_LOW', 'n_gnd', { x: 280, y: 365 }, 'GND');

  const ne555 = createNodeFromCatalog('TIMER_555', 'n_555', { x: 250, y: 110 }, 'NE555_GEN');
  ne555.properties.resistanceR1Ohms = 1200;
  ne555.properties.resistanceR2Ohms = 1800;
  ne555.properties.capacitanceUf = 0.02;

  const jk = createNodeFromCatalog('JK_FLIPFLOP', 'n_jk', { x: 500, y: 150 }, 'JK_DIV2');
  const ledPulse = createNodeFromCatalog('LED', 'n_led_555', { x: 730, y: 85 }, 'PULSE_555');
  ledPulse.properties.ledColor = 'amber';
  const ledDiv = createNodeFromCatalog('LED', 'n_led_div2', { x: 730, y: 175 }, 'DIV_BY_2');
  ledDiv.properties.ledColor = 'emerald';
  const probeDis = createNodeFromCatalog('PROBE', 'n_prb_dis', { x: 495, y: 55 }, 'DISCH_Z');

  return {
    metadata: {
      schemaVersion: '1.0.0',
      title: 'Астабільний генератор на таймері NE555 із подільником частоти на JK-тригері',
      description:
        'ІМС NE555 генерує тактові імпульси з розрахунком RC-інтервалів і відкритим колектором DISCH (0/High-Z), а JK-тригер при J=1, K=1 ділить частоту навпіл.',
      category: 'ІМС та генератори',
      tags: ['NE555', 'JK-тригер', 'подільник частоти', 'RC-генератор'],
      createdAt: '2026-10-20T08:00:00.000Z',
      updatedAt: '2026-11-04T09:45:00.000Z',
    },
    viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
    nodes: [rstSw, vcc, gnd, ne555, jk, ledPulse, ledDiv, probeDis],
    edges: [
      edge('et1', 'n_555_en', 'OUT', 'n_555', 'RESET'),
      edge('et2', 'n_555', 'OUT', 'n_led_555', 'IN'),
      edge('et3', 'n_555', 'DISCH', 'n_prb_dis', 'IN'),
      edge('et4', 'n_555', 'OUT', 'n_jk', 'CLK'),
      edge('et5', 'n_vcc', 'OUT', 'n_jk', 'J'),
      edge('et6', 'n_vcc', 'OUT', 'n_jk', 'K'),
      edge('et7', 'n_gnd', 'OUT', 'n_jk', 'CLR'),
      edge('et8', 'n_jk', 'Q', 'n_led_div2', 'IN'),
    ],
  };
}

export function buildMicroprocessorAluPreset(): CircuitDocument {
  const a0 = createNodeFromCatalog('INPUT_SWITCH', 'n_a0', { x: 70, y: 50 }, 'A0');
  a0.properties.switchState = '1';
  const a1 = createNodeFromCatalog('INPUT_SWITCH', 'n_a1', { x: 70, y: 115 }, 'A1');
  a1.properties.switchState = '1';
  const b0 = createNodeFromCatalog('INPUT_SWITCH', 'n_b0', { x: 70, y: 185 }, 'B0');
  b0.properties.switchState = '1';
  const b1 = createNodeFromCatalog('INPUT_SWITCH', 'n_b1', { x: 70, y: 250 }, 'B1');
  b1.properties.switchState = '0';
  const op0 = createNodeFromCatalog('INPUT_SWITCH', 'n_op0', { x: 70, y: 325 }, 'OP0');
  op0.properties.switchState = '0';
  const op1 = createNodeFromCatalog('INPUT_SWITCH', 'n_op1', { x: 70, y: 390 }, 'OP1');
  op1.properties.switchState = '0';

  const alu = createNodeFromCatalog('ALU_4BIT', 'n_alu', { x: 330, y: 140 }, 'MP_ALU');

  const f0 = createNodeFromCatalog('LED', 'n_f0', { x: 610, y: 110 }, 'RES_F0');
  const f1 = createNodeFromCatalog('LED', 'n_f1', { x: 610, y: 180 }, 'RES_F1');
  const cy = createNodeFromCatalog('LED', 'n_cy', { x: 610, y: 255 }, 'FLAG_CY');
  cy.properties.ledColor = 'amber';
  const zf = createNodeFromCatalog('LED', 'n_zf', { x: 610, y: 330 }, 'FLAG_ZERO');
  zf.properties.ledColor = 'cyan';

  return {
    metadata: {
      schemaVersion: '1.0.0',
      title: 'Арифметико-логічний вузол мікропроцесора (ALU Slice)',
      description:
        'Модель виконавчого блоку мікропроцесорного пристрою з кодами операцій ADD (00), SUB (01), AND (10), XOR (11) та регістром прапорців CARRY і ZERO.',
      category: 'Мікропроцесорні пристрої',
      tags: ['мікропроцесор', 'АЛП', 'прапорці', 'тема 103'],
      createdAt: '2026-10-22T14:20:00.000Z',
      updatedAt: '2026-11-05T18:10:00.000Z',
    },
    viewport: { panX: 20, panY: 10, zoom: 0.95, gridSnap: true },
    nodes: [a0, a1, b0, b1, op0, op1, alu, f0, f1, cy, zf],
    edges: [
      edge('ea1', 'n_a0', 'OUT', 'n_alu', 'A0'),
      edge('ea2', 'n_a1', 'OUT', 'n_alu', 'A1'),
      edge('ea3', 'n_b0', 'OUT', 'n_alu', 'B0'),
      edge('ea4', 'n_b1', 'OUT', 'n_alu', 'B1'),
      edge('ea5', 'n_op0', 'OUT', 'n_alu', 'OP0'),
      edge('ea6', 'n_op1', 'OUT', 'n_alu', 'OP1'),
      edge('ea7', 'n_alu', 'F0', 'n_f0', 'IN'),
      edge('ea8', 'n_alu', 'F1', 'n_f1', 'IN'),
      edge('ea9', 'n_alu', 'CARRY', 'n_cy', 'IN'),
      edge('ea10', 'n_alu', 'ZERO', 'n_zf', 'IN'),
    ],
  };
}

export function buildShiftRegisterPreset(): CircuitDocument {
  const dataIn = createNodeFromCatalog('INPUT_SWITCH', 'n_din', { x: 70, y: 95 }, 'SERIAL_IN');
  dataIn.properties.switchState = '1';
  const clk = createNodeFromCatalog('CLOCK', 'n_sclk', { x: 70, y: 195 }, 'SHIFT_CLK');
  clk.properties.halfPeriodNs = 45;
  const clr = createNodeFromCatalog('INPUT_SWITCH', 'n_sclr', { x: 70, y: 295 }, 'CLEAR');
  clr.properties.switchState = '0';

  const dff0 = createNodeFromCatalog('D_FLIPFLOP', 'n_dff0', { x: 290, y: 130 }, 'DFF_STAGE0');
  const dff1 = createNodeFromCatalog('D_FLIPFLOP', 'n_dff1', { x: 520, y: 130 }, 'DFF_STAGE1');

  const q0Led = createNodeFromCatalog('LED', 'n_q0', { x: 480, y: 40 }, 'BIT_Q0');
  q0Led.properties.ledColor = 'cyan';
  const q1Led = createNodeFromCatalog('LED', 'n_q1', { x: 740, y: 135 }, 'BIT_Q1');
  q1Led.properties.ledColor = 'violet';

  return {
    metadata: {
      schemaVersion: '1.0.0',
      title: 'Двокаскадний зсувний регістр на синхронних D-тригерах',
      description:
        'Послідовний зсув бітів за переднім фронтом тактового сигналу SHIFT_CLK через каскад D-тригерів.',
      category: 'Тригери та лічильники',
      tags: ['D-тригер', 'зсувний регістр', 'пам’ять'],
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-11-06T11:20:00.000Z',
    },
    viewport: { panX: 20, panY: 20, zoom: 1, gridSnap: true },
    nodes: [dataIn, clk, clr, dff0, dff1, q0Led, q1Led],
    edges: [
      edge('es1', 'n_din', 'OUT', 'n_dff0', 'D'),
      edge('es2', 'n_sclk', 'OUT', 'n_dff0', 'CLK'),
      edge('es3', 'n_sclr', 'OUT', 'n_dff0', 'CLR'),
      edge('es4', 'n_dff0', 'Q', 'n_q0', 'IN'),
      edge('es5', 'n_dff0', 'Q', 'n_dff1', 'D'),
      edge('es6', 'n_sclk', 'OUT', 'n_dff1', 'CLK'),
      edge('es7', 'n_sclr', 'OUT', 'n_dff1', 'CLR'),
      edge('es8', 'n_dff1', 'Q', 'n_q1', 'IN'),
    ],
  };
}

export const PRESET_CIRCUITS: PresetCircuitTemplate[] = [
  {
    id: 'preset-full-adder',
    slug: 'full-adder-1bit',
    document: buildFullAdderPreset(),
  },
  {
    id: 'preset-tristate-bus',
    slug: 'tristate-shared-bus',
    document: buildTriStateBusPreset(),
  },
  {
    id: 'preset-counter-hex',
    slug: 'counter-4bit-hex',
    document: buildCounterHexPreset(),
  },
  {
    id: 'preset-ne555-jk',
    slug: 'ne555-astable-jk-divider',
    document: buildTimer555JkDividerPreset(),
  },
  {
    id: 'preset-mp-alu',
    slug: 'microprocessor-alu-slice',
    document: buildMicroprocessorAluPreset(),
  },
  {
    id: 'preset-shift-register',
    slug: 'dff-shift-register',
    document: buildShiftRegisterPreset(),
  },
];
