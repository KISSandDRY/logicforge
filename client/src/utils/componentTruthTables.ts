import {
  decodeSevenSegment,
  evaluateComparator2Bit,
  evaluateDecoder2To4,
  evaluateDemux1To4,
  evaluateEncoder4To2,
  evaluateFullAdder,
  evaluateMux2To1,
  evaluateParity4Bit,
  logicAnd,
  logicBuffer,
  logicNand,
  logicNor,
  logicNot,
  logicOr,
  logicTriStateBuffer,
  logicXnor,
  logicXor,
  type ComponentType,
  type LogicState,
} from '@logicforge/shared-types';

export interface ComponentTruthTableRow {
  inputs: string[];
  outputs: string[];
  mode?: string;
}

export interface ComponentTruthTableSpec {
  title: string;
  inputHeaders: string[];
  outputHeaders: string[];
  rows: ComponentTruthTableRow[];
}

const SEVEN_SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

function generateBitCombinations(bitCount: number): LogicState[][] {
  const total = 1 << bitCount;
  const rows: LogicState[][] = [];
  for (let mask = 0; mask < total; mask++) {
    const bits: LogicState[] = [];
    for (let shift = bitCount - 1; shift >= 0; shift--) {
      bits.push(((mask >> shift) & 1) === 1 ? '1' : '0');
    }
    rows.push(bits);
  }
  return rows;
}

function toBinary4(value: number): string {
  return value.toString(2).padStart(4, '0');
}

function buildUnaryGateSpec(
  title: string,
  outputHeader: string,
  fn: (a: LogicState) => LogicState,
  modes: Record<LogicState, string>,
): ComponentTruthTableSpec {
  const states: LogicState[] = ['0', '1', 'Z', 'X'];
  return {
    title,
    inputHeaders: ['A'],
    outputHeaders: [outputHeader],
    rows: states.map((a) => ({
      inputs: [a],
      outputs: [fn(a)],
      mode: modes[a],
    })),
  };
}

function buildBinaryGateSpec(
  title: string,
  outputHeader: string,
  fn: (inputs: LogicState[]) => LogicState,
  binaryModes: [string, string, string, string],
  triStateRows: Array<{ a: LogicState; b: LogicState; mode: string }>,
): ComponentTruthTableSpec {
  const binaryPairs = generateBitCombinations(2);
  const rows: ComponentTruthTableRow[] = binaryPairs.map(([a, b], idx) => ({
    inputs: [a, b],
    outputs: [fn([a, b])],
    mode: binaryModes[idx],
  }));

  for (const extra of triStateRows) {
    rows.push({
      inputs: [extra.a, extra.b],
      outputs: [fn([extra.a, extra.b])],
      mode: extra.mode,
    });
  }

  return {
    title,
    inputHeaders: ['A', 'B'],
    outputHeaders: [outputHeader],
    rows,
  };
}

const TRUTH_TABLE_BUILDERS: Record<ComponentType, () => ComponentTruthTableSpec> = {
  CONST_HIGH: () => ({
    title: 'Таблиця вихідного стану джерела живлення VCC (+5 В)',
    inputHeaders: ['Живлення'],
    outputHeaders: ['OUT'],
    rows: [{ inputs: ['+5 В (VCC)'], outputs: ['1'], mode: 'Постійна логічна одиниця (HIGH)' }],
  }),

  CONST_LOW: () => ({
    title: 'Таблиця вихідного стану шини землі GND (0 В)',
    inputHeaders: ['Живлення'],
    outputHeaders: ['OUT'],
    rows: [{ inputs: ['0 В (GND)'], outputs: ['0'], mode: 'Постійний логічний нуль (LOW)' }],
  }),

  INPUT_SWITCH: () => ({
    title: 'Таблиця істинності',
    inputHeaders: ['Стан'],
    outputHeaders: ['Рівень на лінії'],
    rows: [
      { inputs: ['0'], outputs: ['0 (LOW)'], mode: 'Низький потенціал (0 В / GND)' },
      { inputs: ['1'], outputs: ['1 (HIGH)'], mode: 'Високий потенціал (+5 В / VCC)' },
      { inputs: ['Z'], outputs: ['Z (High-Z)'], mode: 'Високоімпедансний стан (відключено)' },
      { inputs: ['X'], outputs: ['X (Conflict)'], mode: 'Конфлікт драйверів або невизначеність' },
    ],
  }),

  PUSH_BUTTON: () => ({
    title: 'Таблиця станів тактової кнопки (BTN)',
    inputHeaders: ['Стан кнопки'],
    outputHeaders: ['OUT'],
    rows: [
      { inputs: ['Відпущена (0)'], outputs: ['0'], mode: 'Спокій: формує логічний 0' },
      { inputs: ['Натиснута (1)'], outputs: ['1'], mode: 'Активний імпульс: формує логічну 1' },
    ],
  }),

  DIP_SWITCH_4: () => ({
    title: 'Таблиця станів 4-бітного DIP-перемикача (2⁴ = 16 комбінацій)',
    inputHeaders: ['SW3', 'SW2', 'SW1', 'SW0'],
    outputHeaders: ['Q3', 'Q2', 'Q1', 'Q0', 'HEX'],
    rows: generateBitCombinations(4).map(([b3, b2, b1, b0], idx) => ({
      inputs: [b3, b2, b1, b0],
      outputs: [b3, b2, b1, b0, `0x${idx.toString(16).toUpperCase()}`],
      mode: `Код слова ${idx} (0x${idx.toString(16).toUpperCase()})`,
    })),
  }),

  CLOCK: () => ({
    title: 'Таблиця фаз періодичного тактового генератора (CLK)',
    inputHeaders: ['Фаза періоду T'],
    outputHeaders: ['OUT'],
    rows: [
      { inputs: ['0 .. T/2'], outputs: ['0'], mode: 'Низький півперіод тактового меандру' },
      { inputs: ['T/2 .. T'], outputs: ['1'], mode: 'Високий півперіод (передній фронт CLK↑)' },
    ],
  }),

  BUFFER: () =>
    buildUnaryGateSpec('Таблиця істинності буфера (74HC125)', 'Y = A', logicBuffer, {
      '0': 'Повторення низького рівня (0 → 0)',
      '1': 'Повторення високого рівня (1 → 1)',
      Z: 'Непідключений вхід (обрив лінії → X)',
      X: 'Поширення стану конфлікту X',
    }),

  NOT: () =>
    buildUnaryGateSpec('Таблиця істинності інвертора НЕ (74HC04)', 'Y = ¬A', logicNot, {
      '0': 'Логічна інверсія 0 → 1',
      '1': 'Логічна інверсія 1 → 0',
      Z: 'Невизначений стан при обриві входу',
      X: 'Поширення невизначеності X',
    }),

  SCHMITT_INV: () =>
    buildUnaryGateSpec(
      'Таблиця істинності інвертора з тригером Шмітта (74HC14)',
      'Y = ¬A',
      logicNot,
      {
        '0': 'Вхід нижче нижнього порога → вихід 1',
        '1': 'Вхід вище верхнього порога → вихід 0',
        Z: 'Невизначений стан при плаваючому вході',
        X: 'Поширення невизначеності X',
      },
    ),

  AND: () =>
    buildBinaryGateSpec(
      'Таблиця істинності вентиля І (AND • 74HC08)',
      'Y = A ∧ B',
      logicAnd,
      ['Обидва входи 0', 'Нуль B домінує', 'Нуль A домінує', 'Збіг одиниць (HIGH)'],
      [
        { a: '0', b: 'Z', mode: 'Домінування 0 у тризначній логіці Кліні' },
        { a: '1', b: 'Z', mode: 'Невизначеність при Z на другому вході' },
        { a: '0', b: 'X', mode: 'Домінування 0 у тризначній логіці Кліні' },
        { a: '1', b: 'X', mode: 'Невизначеність при X на другому вході' },
      ],
    ),

  OR: () =>
    buildBinaryGateSpec(
      'Таблиця істинності вентиля АБО (OR • 74HC32)',
      'Y = A ∨ B',
      logicOr,
      ['Обидва входи 0', 'Одиниця B домінує', 'Одиниця A домінує', 'Обидва входи 1'],
      [
        { a: '1', b: 'Z', mode: 'Домінування 1 у тризначній логіці Кліні' },
        { a: '0', b: 'Z', mode: 'Невизначеність при Z на другому вході' },
        { a: '1', b: 'X', mode: 'Домінування 1 у тризначній логіці Кліні' },
        { a: '0', b: 'X', mode: 'Невизначеність при X на другому вході' },
      ],
    ),

  NAND: () =>
    buildBinaryGateSpec(
      'Таблиця істинності вентиля І-НЕ (NAND • 74HC00)',
      'Y = ¬(A ∧ B)',
      logicNand,
      ['Інверсія 0 ∧ 0 → 1', 'Інверсія 0 ∧ 1 → 1', 'Інверсія 1 ∧ 0 → 1', 'Обидва активні → 0'],
      [
        { a: '0', b: 'Z', mode: 'Нуль A домінує (¬0 = 1)' },
        { a: '1', b: 'Z', mode: 'Невизначеність при Z на другому вході' },
      ],
    ),

  NOR: () =>
    buildBinaryGateSpec(
      'Таблиця істинності вентиля АБО-НЕ (NOR • 74HC02)',
      'Y = ¬(A ∨ B)',
      logicNor,
      ['Обидва входи 0 → 1', 'Активний B → 0', 'Активний A → 0', 'Обидва входи 1 → 0'],
      [
        { a: '1', b: 'Z', mode: 'Одиниця A домінує (¬1 = 0)' },
        { a: '0', b: 'Z', mode: 'Невизначеність при Z на другому вході' },
      ],
    ),

  XOR: () =>
    buildBinaryGateSpec(
      'Таблиця істинності вентиля Виключне АБО (XOR • 74HC86)',
      'Y = A ⊕ B',
      logicXor,
      ['Рівні входи 0,0 → 0', 'Різні входи 0,1 → 1', 'Різні входи 1,0 → 1', 'Рівні входи 1,1 → 0'],
      [
        { a: '0', b: 'Z', mode: 'Невизначеність при Z' },
        { a: '1', b: 'X', mode: 'Невизначеність при X' },
      ],
    ),

  XNOR: () =>
    buildBinaryGateSpec(
      'Таблиця істинності вентиля Еквівалентність (XNOR • 74HC266)',
      'Y = ¬(A ⊕ B)',
      logicXnor,
      ['Збіг нулів (A = B)', 'Нерівність входів', 'Нерівність входів', 'Збіг одиниць (A = B)'],
      [
        { a: '0', b: 'Z', mode: 'Невизначеність при Z' },
        { a: '1', b: 'X', mode: 'Невизначеність при X' },
      ],
    ),

  TRI_BUFFER: () => ({
    title: 'Таблиця істинності тристабільного буфера (74HC244)',
    inputHeaders: ['EN', 'D'],
    outputHeaders: ['Y'],
    rows: [
      ...generateBitCombinations(2).map(([en, d]) => ({
        inputs: [en, d],
        outputs: [logicTriStateBuffer(d, en)],
        mode: en === '0' ? 'Третій стан High-Z (відключено від шини)' : `Активна передача ${d}`,
      })),
      {
        inputs: ['Z', '0'],
        outputs: [logicTriStateBuffer('0', 'Z')],
        mode: 'Непідключений дозвіл EN → High-Z',
      },
      {
        inputs: ['X', '0'],
        outputs: [logicTriStateBuffer('0', 'X')],
        mode: 'Невизначений сигнал дозволу EN → X',
      },
    ],
  }),

  PARITY_4BIT: () => ({
    title: 'Повна таблиця істинності 4-бітного контролера парності (74HC280 • 2⁴ = 16)',
    inputHeaders: ['D3', 'D2', 'D1', 'D0'],
    outputHeaders: ['EVEN', 'ODD'],
    rows: generateBitCombinations(4).map(([d3, d2, d1, d0]) => {
      const res = evaluateParity4Bit(d0, d1, d2, d3);
      const ones = [d3, d2, d1, d0].filter((b) => b === '1').length;
      return {
        inputs: [d3, d2, d1, d0],
        outputs: [res.EVEN, res.ODD],
        mode: `${ones} од. — ${res.EVEN === '1' ? 'парна кількість (EVEN)' : 'непарна кількість (ODD)'}`,
      };
    }),
  }),

  SR_LATCH: () => ({
    title: 'Таблиця переходів асинхронного SR-тригера (74HC279 • 2² = 4)',
    inputHeaders: ['S', 'R'],
    outputHeaders: ['Q(t+1)', '!Q(t+1)'],
    rows: [
      { inputs: ['0', '0'], outputs: ['Q(t)', '!Q(t)'], mode: 'Збереження попереднього стану' },
      { inputs: ['0', '1'], outputs: ['0', '1'], mode: 'Скидання тригера (Reset)' },
      { inputs: ['1', '0'], outputs: ['1', '0'], mode: 'Встановлення тригера (Set)' },
      { inputs: ['1', '1'], outputs: ['X', 'X'], mode: 'Заборонена комбінація (невизначеність)' },
    ],
  }),

  D_LATCH: () => ({
    title: 'Таблиця переходів прозорої D-защіпки з дозволом EN (74HC75 • 2² = 4)',
    inputHeaders: ['EN', 'D'],
    outputHeaders: ['Q(t+1)', '!Q(t+1)'],
    rows: [
      {
        inputs: ['0', '0'],
        outputs: ['Q(t)', '!Q(t)'],
        mode: 'Фіксація (утримання защепленого біта)',
      },
      {
        inputs: ['0', '1'],
        outputs: ['Q(t)', '!Q(t)'],
        mode: 'Фіксація (утримання защепленого біта)',
      },
      { inputs: ['1', '0'], outputs: ['0', '1'], mode: 'Прозорий режим: передача 0' },
      { inputs: ['1', '1'], outputs: ['1', '0'], mode: 'Прозорий режим: передача 1' },
    ],
  }),

  D_FLIPFLOP: () => ({
    title: 'Таблиця переходів синхронного D-тригера (74HC74)',
    inputHeaders: ['CLR', 'CLK', 'D'],
    outputHeaders: ['Q(t+1)', '!Q(t+1)'],
    rows: [
      { inputs: ['1', 'X', 'X'], outputs: ['0', '1'], mode: 'Асинхронне скидання (Clear)' },
      { inputs: ['0', '↑', '0'], outputs: ['0', '1'], mode: 'Запис 0 за переднім фронтом CLK' },
      { inputs: ['0', '↑', '1'], outputs: ['1', '0'], mode: 'Запис 1 за переднім фронтом CLK' },
      { inputs: ['0', '0', 'X'], outputs: ['Q(t)', '!Q(t)'], mode: 'Збереження стану при CLK = 0' },
      { inputs: ['0', '1', 'X'], outputs: ['Q(t)', '!Q(t)'], mode: 'Збереження стану при CLK = 1' },
    ],
  }),

  JK_FLIPFLOP: () => ({
    title: 'Таблиця переходів універсального JK-тригера (74HC112)',
    inputHeaders: ['CLR', 'CLK', 'J', 'K'],
    outputHeaders: ['Q(t+1)', '!Q(t+1)'],
    rows: [
      { inputs: ['1', 'X', 'X', 'X'], outputs: ['0', '1'], mode: 'Асинхронне скидання (Clear)' },
      { inputs: ['0', '↑', '0', '0'], outputs: ['Q(t)', '!Q(t)'], mode: 'Збереження стану (Hold)' },
      { inputs: ['0', '↑', '0', '1'], outputs: ['0', '1'], mode: 'Скидання у 0 (Reset)' },
      { inputs: ['0', '↑', '1', '0'], outputs: ['1', '0'], mode: 'Встановлення в 1 (Set)' },
      {
        inputs: ['0', '↑', '1', '1'],
        outputs: ['!Q(t)', 'Q(t)'],
        mode: 'Інверсія / лічильний режим',
      },
      {
        inputs: ['0', '0 / 1', 'X', 'X'],
        outputs: ['Q(t)', '!Q(t)'],
        mode: 'Збереження між тактовими фронтами',
      },
    ],
  }),

  T_FLIPFLOP: () => ({
    title: 'Таблиця переходів синхронного T-тригера (74HC73)',
    inputHeaders: ['CLR', 'CLK', 'T'],
    outputHeaders: ['Q(t+1)', '!Q(t+1)'],
    rows: [
      { inputs: ['1', 'X', 'X'], outputs: ['0', '1'], mode: 'Асинхронне скидання (Clear)' },
      { inputs: ['0', '↑', '0'], outputs: ['Q(t)', '!Q(t)'], mode: 'Збереження стану (T = 0)' },
      {
        inputs: ['0', '↑', '1'],
        outputs: ['!Q(t)', 'Q(t)'],
        mode: 'Інверсія стану (Toggle, T = 1)',
      },
      {
        inputs: ['0', '0 / 1', 'X'],
        outputs: ['Q(t)', '!Q(t)'],
        mode: 'Утримання стану між тактовими фронтами',
      },
    ],
  }),

  REGISTER_4BIT: () => ({
    title: 'Таблиця режимів 4-бітного паралельного регістра (74HC173)',
    inputHeaders: ['CLR', 'LD', 'CLK', 'D3..D0'],
    outputHeaders: ['Q3..Q0'],
    rows: [
      { inputs: ['1', 'X', 'X', 'XXXX'], outputs: ['0000'], mode: 'Асинхронне очищення регістра' },
      {
        inputs: ['0', '1', '↑', 'D3..D0'],
        outputs: ['D3..D0'],
        mode: 'Паралельне завантаження слова',
      },
      { inputs: ['0', '0', '↑', 'XXXX'], outputs: ['Q(t)'], mode: 'Збереження поточного слова' },
      {
        inputs: ['0', 'X', '0 / 1', 'XXXX'],
        outputs: ['Q(t)'],
        mode: 'Утримання між передніми фронтами CLK',
      },
    ],
  }),

  SHIFT_REG_SIPO: () => ({
    title: 'Таблиця режимів 4-бітного зсувного регістра SIPO (74HC164)',
    inputHeaders: ['CLR', 'CLK', 'SER'],
    outputHeaders: ['Q0', 'Q1', 'Q2', 'Q3'],
    rows: [
      { inputs: ['1', 'X', 'X'], outputs: ['0', '0', '0', '0'], mode: 'Асинхронне скидання' },
      {
        inputs: ['0', '↑', '0'],
        outputs: ['0', 'Q0(t)', 'Q1(t)', 'Q2(t)'],
        mode: 'Зсув біта 0 праворуч',
      },
      {
        inputs: ['0', '↑', '1'],
        outputs: ['1', 'Q0(t)', 'Q1(t)', 'Q2(t)'],
        mode: 'Зсув біта 1 праворуч',
      },
      {
        inputs: ['0', '0 / 1', 'X'],
        outputs: ['Q0', 'Q1', 'Q2', 'Q3'],
        mode: 'Збереження розрядів між фронтами',
      },
    ],
  }),

  COUNTER_4BIT: () => ({
    title: 'Повна таблиця переходів 4-бітного синхронного лічильника (74HC161 • 0..15)',
    inputHeaders: ['RST', 'EN', 'CLK', 'N(t)'],
    outputHeaders: ['Q3..Q0', 'CO'],
    rows: [
      { inputs: ['1', 'X', 'X', 'XXXX'], outputs: ['0000', '0'], mode: 'Асинхронне скидання в 0' },
      { inputs: ['0', '0', '↑', 'N'], outputs: ['N(t)', '0'], mode: 'Пауза рахунку (EN = 0)' },
      ...Array.from({ length: 16 }, (_, n) => {
        const nextVal = (n + 1) & 0x0f;
        const co = n === 14 ? '1' : '0';
        return {
          inputs: ['0', '1', '↑', `${n} (${toBinary4(n)})`],
          outputs: [toBinary4(nextVal), co],
          mode:
            nextVal === 15
              ? `Крок ${n} → 15 (активний перенос CO = 1 на стані 1111)`
              : n === 15
                ? 'Переповнення 15 → 0 (новий цикл рахунку)'
                : `Інкремент ${n} → ${nextVal}`,
        };
      }),
    ],
  }),

  TIMER_555: () => ({
    title: 'Таблиця режимів роботи інтегрального таймера NE555',
    inputHeaders: ['!RST', 'TRIG', 'THRES'],
    outputHeaders: ['OUT', 'DISCH'],
    rows: [
      {
        inputs: ['0', 'X', 'X'],
        outputs: ['0', '0'],
        mode: 'Примусове скидання (!RST = 0): OUT=0, розряд DISCH=0',
      },
      {
        inputs: ['1', '0 (<1/3 Vcc)', '0'],
        outputs: ['1', 'Z'],
        mode: 'Запуск імпульсу: OUT=1, ключ DISCH розімкнено (Z)',
      },
      {
        inputs: ['1', '1', '1 (>2/3 Vcc)'],
        outputs: ['0', '0'],
        mode: 'Поріг перевищено: OUT=0, розряд конденсатора (DISCH=0)',
      },
      {
        inputs: ['1', '1', '0'],
        outputs: ['Q(t)', 'DISCH(t)'],
        mode: 'Утримання поточного стану між порогами',
      },
      {
        inputs: ['1', 'Авто (RC)', 'Авто'],
        outputs: ['0 ⇄ 1', '0 ⇄ Z'],
        mode: 'Астабільна автогенерація прямокутних імпульсів',
      },
    ],
  }),

  MUX_2TO1: () => ({
    title: 'Повна таблиця істинності мультиплексора 2-в-1 (74HC157 • 2³ = 8)',
    inputHeaders: ['S', 'D1', 'D0'],
    outputHeaders: ['Y'],
    rows: generateBitCombinations(3).map(([s, d1, d0]) => ({
      inputs: [s, d1, d0],
      outputs: [evaluateMux2To1(d0, d1, s)],
      mode: s === '0' ? `Вибрано канал D0 (${d0})` : `Вибрано канал D1 (${d1})`,
    })),
  }),

  MUX_4TO1: () => ({
    title: 'Таблиця істинності мультиплексора 4-в-1 (74HC153 • адресна комутація)',
    inputHeaders: ['S1', 'S0'],
    outputHeaders: ['Y (Вихід)'],
    rows: [
      { inputs: ['0', '0'], outputs: ['D0'], mode: 'Комутація каналу 0 (Y = D0)' },
      { inputs: ['0', '1'], outputs: ['D1'], mode: 'Комутація каналу 1 (Y = D1)' },
      { inputs: ['1', '0'], outputs: ['D2'], mode: 'Комутація каналу 2 (Y = D2)' },
      { inputs: ['1', '1'], outputs: ['D3'], mode: 'Комутація каналу 3 (Y = D3)' },
    ],
  }),

  DEMUX_1TO4: () => ({
    title: 'Повна таблиця істинності демультиплексора 1-в-4 (74HC139 • 2³ = 8)',
    inputHeaders: ['S1', 'S0', 'D'],
    outputHeaders: ['Y0', 'Y1', 'Y2', 'Y3'],
    rows: generateBitCombinations(3).map(([s1, s0, d]) => {
      const out = evaluateDemux1To4(d, s0, s1);
      const addr = (s1 === '1' ? 2 : 0) + (s0 === '1' ? 1 : 0);
      return {
        inputs: [s1, s0, d],
        outputs: [out.Y0, out.Y1, out.Y2, out.Y3],
        mode: `Маршрутизація D=${d} на вихід Y${addr}`,
      };
    }),
  }),

  DECODER_2TO4: () => ({
    title: 'Повна таблиця істинності дешифратора 2-в-4 (74HC139 • 2³ = 8)',
    inputHeaders: ['EN', 'A1', 'A0'],
    outputHeaders: ['Y0', 'Y1', 'Y2', 'Y3'],
    rows: generateBitCombinations(3).map(([en, a1, a0]) => {
      const out = evaluateDecoder2To4(a0, a1, en);
      const addr = (a1 === '1' ? 2 : 0) + (a0 === '1' ? 1 : 0);
      return {
        inputs: [en, a1, a0],
        outputs: [out.Y0, out.Y1, out.Y2, out.Y3],
        mode:
          en === '0'
            ? 'Дешифратор вимкнено (EN = 0)'
            : `Активний вихід Y${addr} (адреса ${a1}${a0})`,
      };
    }),
  }),

  ENCODER_4TO2: () => ({
    title: 'Повна таблиця істинності пріоритетного шифратора 4-в-2 (74HC148 • 2⁴ = 16)',
    inputHeaders: ['D3', 'D2', 'D1', 'D0'],
    outputHeaders: ['A1', 'A0', 'V'],
    rows: generateBitCombinations(4).map(([d3, d2, d1, d0]) => {
      const out = evaluateEncoder4To2(d0, d1, d2, d3);
      const highest =
        d3 === '1'
          ? 'пріоритет D3 (11)'
          : d2 === '1'
            ? 'пріоритет D2 (10)'
            : d1 === '1'
              ? 'пріоритет D1 (01)'
              : d0 === '1'
                ? 'вхід D0 (00)'
                : 'жоден вхід не активний';
      return {
        inputs: [d3, d2, d1, d0],
        outputs: [out.A1, out.A0, out.V],
        mode: out.V === '1' ? `Старший активний: ${highest}` : 'Немає активного входу (V = 0)',
      };
    }),
  }),

  COMPARATOR_2BIT: () => ({
    title: 'Повна таблиця істинності 2-бітного компаратора слів (74HC85 • 2⁴ = 16)',
    inputHeaders: ['A1', 'A0', 'B1', 'B0'],
    outputHeaders: ['GT (A>B)', 'EQ (A=B)', 'LT (A<B)'],
    rows: generateBitCombinations(4).map(([a1, a0, b1, b0]) => {
      const out = evaluateComparator2Bit(a0, a1, b0, b1);
      const aVal = (a1 === '1' ? 2 : 0) + (a0 === '1' ? 1 : 0);
      const bVal = (b1 === '1' ? 2 : 0) + (b0 === '1' ? 1 : 0);
      const rel = aVal > bVal ? '>' : aVal === bVal ? '=' : '<';
      return {
        inputs: [a1, a0, b1, b0],
        outputs: [out.GT, out.EQ, out.LT],
        mode: `A=${aVal} (${a1}${a0}) ${rel} B=${bVal} (${b1}${b0})`,
      };
    }),
  }),

  FULL_ADDER: () => ({
    title: 'Повна таблиця істинності однорозрядного повного суматора (74HC80 • 2³ = 8)',
    inputHeaders: ['A', 'B', 'CIN'],
    outputHeaders: ['SUM', 'COUT'],
    rows: generateBitCombinations(3).map(([a, b, cin]) => {
      const out = evaluateFullAdder(a, b, cin);
      const total = (a === '1' ? 1 : 0) + (b === '1' ? 1 : 0) + (cin === '1' ? 1 : 0);
      return {
        inputs: [a, b, cin],
        outputs: [out.SUM, out.COUT],
        mode: `${a} + ${b} + ${cin} = ${total} (${out.COUT}${out.SUM}₂)`,
      };
    }),
  }),

  ALU_4BIT: () => ({
    title: 'Таблиця кодів операцій мікропроцесорного АЛП (74HC181)',
    inputHeaders: ['OP1', 'OP0'],
    outputHeaders: ['F1..F0', 'CY', 'ZF'],
    rows: [
      {
        inputs: ['0', '0'],
        outputs: ['(A + B) mod 4', 'Перенос (>3)', 'F = 0'],
        mode: 'ADD — Арифметичне додавання беззнакових 2-бітних слів',
      },
      {
        inputs: ['0', '1'],
        outputs: ['(A − B) mod 4', 'Позика (A<B)', 'F = 0'],
        mode: 'SUB — Арифметичне віднімання з формуванням позики',
      },
      {
        inputs: ['1', '0'],
        outputs: ['A ∧ B', '0', 'F = 0'],
        mode: 'AND — Побітова логічна кон’юнкція',
      },
      {
        inputs: ['1', '1'],
        outputs: ['A ⊕ B', '0', 'F = 0'],
        mode: 'XOR — Побітове додавання за модулем 2',
      },
    ],
  }),

  CUSTOM_IC: () => ({
    title: 'Ієрархічна підсхема користувацької ІМС (Custom IC)',
    inputHeaders: ['IN0..INk'],
    outputHeaders: ['OUT0..OUTm'],
    rows: [
      {
        inputs: ['f_вхід(t)'],
        outputs: ['f_IC(X)'],
        mode: 'Виходи обчислюються вкладеним симулятором внутрішньої підсхеми (глибина до 8)',
      },
    ],
  }),

  LED: () => ({
    title: 'Таблиця індикації світлодіода (LED)',
    inputHeaders: ['IN'],
    outputHeaders: ['Світіння'],
    rows: [
      { inputs: ['0'], outputs: ['Вимкнено'], mode: 'Низький рівень (0 В) — діод не світиться' },
      { inputs: ['1'], outputs: ['Активне'], mode: 'Високий рівень (+5 В) — індикатор горить' },
      { inputs: ['Z'], outputs: ['High-Z (вимкн.)'], mode: 'Лінія у третьому стані відключена' },
      { inputs: ['X'], outputs: ['Аварія (X)'], mode: 'Червона індикація колізії шини' },
    ],
  }),

  PROBE: () => ({
    title: 'Таблиця вимірювання цифрового логічного пробника',
    inputHeaders: ['P (вхід)'],
    outputHeaders: ['Осцилограф'],
    rows: [
      { inputs: ['0'], outputs: ['LOW (0)'], mode: 'Нижній рівень логічного нуля' },
      { inputs: ['1'], outputs: ['HIGH (1)'], mode: 'Верхній рівень логічної одиниці' },
      { inputs: ['Z'], outputs: ['High-Z (Z)'], mode: 'Пунктирна середня лінія третього стану' },
      { inputs: ['X'], outputs: ['Conflict (X)'], mode: 'Аварійний стан короткого замикання' },
    ],
  }),

  SEVEN_SEGMENT: () => ({
    title: 'Повна таблиця дешифрації 7-сегментного HEX-індикатора (2⁴ = 16 кодів)',
    inputHeaders: ['B3', 'B2', 'B1', 'B0'],
    outputHeaders: ['HEX', 'Сегменти (a–g)'],
    rows: generateBitCombinations(4).map(([b3, b2, b1, b0], val) => {
      const decoded = decodeSevenSegment(b0, b1, b2, b3);
      const activeSegs = SEVEN_SEG_NAMES.filter((_, i) => decoded.segments[i]).join(',');
      return {
        inputs: [b3, b2, b1, b0],
        outputs: [`0x${decoded.hexChar}`, activeSegs],
        mode: `${val <= 9 ? 'Цифра' : 'Літера'} «${decoded.hexChar}» (код ${val})`,
      };
    }),
  }),
};

export function getComponentTruthTable(type: ComponentType): ComponentTruthTableSpec {
  return TRUTH_TABLE_BUILDERS[type]();
}
