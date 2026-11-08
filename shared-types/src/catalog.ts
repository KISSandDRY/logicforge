import type {
  CircuitNodeData,
  ComponentCatalogItem,
  ComponentCategory,
  ComponentType,
  CustomICDefinition,
  LogicState,
  PinDefinition,
} from './types';

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  INPUTS: 'Джерела сигналів і тактування',
  GATES: 'Базові логічні вентилі',
  SEQUENTIAL: 'Тригери та лічильники',
  MICROPROCESSOR: 'ІМС, таймери та вузли МП',
  OUTPUTS: 'Індикація та вимірювання',
};

export const COMPONENT_CATALOG: ComponentCatalogItem[] = [
  {
    type: 'INPUT_SWITCH',
    name: 'Тристабільний перемикач (0 / 1 / Z)',
    shortLabel: 'SW',
    category: 'INPUTS',
    description:
      'Інтерактивне джерело вхідного сигналу з підтримкою логічного нуля (0), одиниці (1) та високоімпедансного стану (High-Z).',
    defaultWidth: 108,
    defaultHeight: 56,
    defaultDelayNs: 1,
    isSequential: false,
    defaultPins: [
      { id: 'OUT', name: 'Q', direction: 'OUTPUT', offset: { x: 108, y: 28, side: 'RIGHT' } },
    ],
  },
  {
    type: 'PUSH_BUTTON',
    name: 'Тактова кнопка імпульсу',
    shortLabel: 'BTN',
    category: 'INPUTS',
    description: 'Формувач короткочасного одиничного імпульсу при натисканні користувачем.',
    defaultWidth: 108,
    defaultHeight: 56,
    defaultDelayNs: 1,
    isSequential: false,
    defaultPins: [
      { id: 'OUT', name: 'P', direction: 'OUTPUT', offset: { x: 108, y: 28, side: 'RIGHT' } },
    ],
  },
  {
    type: 'CLOCK',
    name: 'Тактовий генератор (CLK)',
    shortLabel: 'CLK',
    category: 'INPUTS',
    description:
      'Генератор прямокутних синхроімпульсів із заданою частотою Гц та модельним напівперіодом у наносекундах.',
    defaultWidth: 116,
    defaultHeight: 60,
    defaultDelayNs: 0,
    isSequential: true,
    formulaLatex: 'T = 2 \\cdot t_{half}, \\quad f = \\frac{1}{T}',
    defaultPins: [
      { id: 'OUT', name: 'CLK', direction: 'OUTPUT', offset: { x: 116, y: 30, side: 'RIGHT' } },
    ],
  },
  {
    type: 'CONST_HIGH',
    name: 'Константа логічної 1 (VCC)',
    shortLabel: 'VCC',
    category: 'INPUTS',
    description: 'Джерело постійного високого логічного рівня (1 / +5V).',
    defaultWidth: 92,
    defaultHeight: 48,
    defaultDelayNs: 0,
    isSequential: false,
    defaultPins: [
      { id: 'OUT', name: '1', direction: 'OUTPUT', offset: { x: 92, y: 24, side: 'RIGHT' } },
    ],
  },
  {
    type: 'CONST_LOW',
    name: 'Константа логічного 0 (GND)',
    shortLabel: 'GND',
    category: 'INPUTS',
    description: 'Шина спільного проводу / постійного низького логічного рівня (0 / 0V).',
    defaultWidth: 92,
    defaultHeight: 48,
    defaultDelayNs: 0,
    isSequential: false,
    defaultPins: [
      { id: 'OUT', name: '0', direction: 'OUTPUT', offset: { x: 92, y: 24, side: 'RIGHT' } },
    ],
  },
  {
    type: 'AND',
    name: 'Елемент І (AND)',
    shortLabel: 'AND',
    category: 'GATES',
    description:
      'Логічна кон’юнкція у тристабільній алгебрі Кліні: вихід дорівнює 1 лише коли всі входи дорівнюють 1; нульовий вхід домінує над Z/X.',
    defaultWidth: 116,
    defaultHeight: 68,
    defaultDelayNs: 10,
    isSequential: false,
    formulaLatex: 'Y = A \\land B',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'B', name: 'B', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      { id: 'Y', name: 'Y', direction: 'OUTPUT', offset: { x: 116, y: 34, side: 'RIGHT' } },
    ],
  },
  {
    type: 'OR',
    name: 'Елемент АБО (OR)',
    shortLabel: 'OR',
    category: 'GATES',
    description:
      'Логічна диз’юнкція: вихід дорівнює 1, якщо хоча б один вхід має рівень 1; одиничний вхід домінує над Z/X.',
    defaultWidth: 116,
    defaultHeight: 68,
    defaultDelayNs: 10,
    isSequential: false,
    formulaLatex: 'Y = A \\lor B',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'B', name: 'B', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      { id: 'Y', name: 'Y', direction: 'OUTPUT', offset: { x: 116, y: 34, side: 'RIGHT' } },
    ],
  },
  {
    type: 'NOT',
    name: 'Інвертор НЕ (NOT)',
    shortLabel: 'NOT',
    category: 'GATES',
    description: 'Логічне заперечення: перетворює 0 у 1, 1 у 0, а невизначені входи Z/X у X.',
    defaultWidth: 108,
    defaultHeight: 56,
    defaultDelayNs: 5,
    isSequential: false,
    formulaLatex: 'Y = \\overline{A}',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 28, side: 'LEFT' } },
      {
        id: 'Y',
        name: 'Y',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 108, y: 28, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'NAND',
    name: 'Елемент І-НЕ (NAND)',
    shortLabel: 'NAND',
    category: 'GATES',
    description: 'Універсальний базисний елемент Шеффера (інверсна кон’юнкція).',
    defaultWidth: 116,
    defaultHeight: 68,
    defaultDelayNs: 8,
    isSequential: false,
    formulaLatex: 'Y = \\overline{A \\land B}',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'B', name: 'B', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      {
        id: 'Y',
        name: 'Y',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 116, y: 34, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'NOR',
    name: 'Елемент АБО-НЕ (NOR)',
    shortLabel: 'NOR',
    category: 'GATES',
    description: 'Універсальний базисний елемент Пірса (інверсна диз’юнкція).',
    defaultWidth: 116,
    defaultHeight: 68,
    defaultDelayNs: 8,
    isSequential: false,
    formulaLatex: 'Y = \\overline{A \\lor B}',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'B', name: 'B', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      {
        id: 'Y',
        name: 'Y',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 116, y: 34, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'XOR',
    name: 'Виключне АБО (XOR)',
    shortLabel: 'XOR',
    category: 'GATES',
    description: 'Додавання за модулем 2: вихід дорівнює 1 при різних значеннях входів A та B.',
    defaultWidth: 116,
    defaultHeight: 68,
    defaultDelayNs: 14,
    isSequential: false,
    formulaLatex: 'Y = A \\oplus B',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'B', name: 'B', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      { id: 'Y', name: 'Y', direction: 'OUTPUT', offset: { x: 116, y: 34, side: 'RIGHT' } },
    ],
  },
  {
    type: 'XNOR',
    name: 'Еквівалентність (XNOR)',
    shortLabel: 'XNOR',
    category: 'GATES',
    description: 'Елемент рівнозначності: видає 1 при збігу логічних рівнів входів A та B.',
    defaultWidth: 116,
    defaultHeight: 68,
    defaultDelayNs: 14,
    isSequential: false,
    formulaLatex: 'Y = \\overline{A \\oplus B}',
    defaultPins: [
      { id: 'A', name: 'A', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'B', name: 'B', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      {
        id: 'Y',
        name: 'Y',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 116, y: 34, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'TRI_BUFFER',
    name: 'Тристабільний шинний буфер',
    shortLabel: 'BUF3',
    category: 'GATES',
    description:
      'Шинний формувач із третім станом: при EN=1 передає вхід D на вихід Y, при EN=0 переводить вихід у стан High-Z (Z).',
    defaultWidth: 124,
    defaultHeight: 68,
    defaultDelayNs: 7,
    isSequential: false,
    formulaLatex: 'Y = \\begin{cases} D, & EN = 1 \\\\ Z, & EN = 0 \\end{cases}',
    defaultPins: [
      { id: 'D', name: 'D', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'EN', name: 'EN', direction: 'INPUT', offset: { x: 0, y: 48, side: 'LEFT' } },
      { id: 'Y', name: 'Y', direction: 'OUTPUT', offset: { x: 124, y: 34, side: 'RIGHT' } },
    ],
  },
  {
    type: 'SR_LATCH',
    name: 'Асинхронний SR-тригер',
    shortLabel: 'SR',
    category: 'SEQUENTIAL',
    description:
      'Бістабільна комірка пам’яті з входами встановлення S та скидання R. Комбінація S=1, R=1 є забороненою (стан X).',
    defaultWidth: 132,
    defaultHeight: 84,
    defaultDelayNs: 16,
    isSequential: true,
    defaultPins: [
      { id: 'S', name: 'S', direction: 'INPUT', offset: { x: 0, y: 24, side: 'LEFT' } },
      { id: 'R', name: 'R', direction: 'INPUT', offset: { x: 0, y: 60, side: 'LEFT' } },
      { id: 'Q', name: 'Q', direction: 'OUTPUT', offset: { x: 132, y: 24, side: 'RIGHT' } },
      {
        id: 'NQ',
        name: '!Q',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 132, y: 60, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'D_FLIPFLOP',
    name: 'Синхронний D-тригер',
    shortLabel: 'D-FF',
    category: 'SEQUENTIAL',
    description:
      'Динамічний D-тригер із записом за переднім фронтом синхроімпульсу CLK та асинхронним входом скидання CLR.',
    defaultWidth: 140,
    defaultHeight: 100,
    defaultDelayNs: 20,
    isSequential: true,
    formulaLatex: 'Q(t+1) = D(t) \\text{ при } CLK \\uparrow',
    defaultPins: [
      { id: 'D', name: 'D', direction: 'INPUT', offset: { x: 0, y: 24, side: 'LEFT' } },
      {
        id: 'CLK',
        name: 'CLK',
        direction: 'INPUT',
        clockEdge: true,
        offset: { x: 0, y: 52, side: 'LEFT' },
      },
      { id: 'CLR', name: 'CLR', direction: 'INPUT', offset: { x: 0, y: 80, side: 'LEFT' } },
      { id: 'Q', name: 'Q', direction: 'OUTPUT', offset: { x: 140, y: 32, side: 'RIGHT' } },
      {
        id: 'NQ',
        name: '!Q',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 140, y: 68, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'JK_FLIPFLOP',
    name: 'Універсальний JK-тригер',
    shortLabel: 'JK-FF',
    category: 'SEQUENTIAL',
    description:
      'Універсальний тригер за переднім фронтом CLK: J=0,K=0 — збереження; J=0,K=1 — скидання; J=1,K=0 — встановлення; J=1,K=1 — інверсія (лічильний режим).',
    defaultWidth: 144,
    defaultHeight: 116,
    defaultDelayNs: 22,
    isSequential: true,
    formulaLatex: 'Q(t+1) = J\\overline{Q(t)} + \\overline{K}Q(t)',
    defaultPins: [
      { id: 'J', name: 'J', direction: 'INPUT', offset: { x: 0, y: 22, side: 'LEFT' } },
      {
        id: 'CLK',
        name: 'CLK',
        direction: 'INPUT',
        clockEdge: true,
        offset: { x: 0, y: 48, side: 'LEFT' },
      },
      { id: 'K', name: 'K', direction: 'INPUT', offset: { x: 0, y: 74, side: 'LEFT' } },
      { id: 'CLR', name: 'CLR', direction: 'INPUT', offset: { x: 0, y: 98, side: 'LEFT' } },
      { id: 'Q', name: 'Q', direction: 'OUTPUT', offset: { x: 144, y: 36, side: 'RIGHT' } },
      {
        id: 'NQ',
        name: '!Q',
        direction: 'OUTPUT',
        inverted: true,
        offset: { x: 144, y: 80, side: 'RIGHT' },
      },
    ],
  },
  {
    type: 'COUNTER_4BIT',
    name: '4-бітний двійковий лічильник',
    shortLabel: 'CNT4',
    category: 'SEQUENTIAL',
    description:
      'Синхронний 4-розрядний двійковий лічильник (0..15) з дозволом рахунку EN, скиданням RST та виходом переносу CO.',
    defaultWidth: 152,
    defaultHeight: 132,
    defaultDelayNs: 24,
    isSequential: true,
    defaultPins: [
      {
        id: 'CLK',
        name: 'CLK',
        direction: 'INPUT',
        clockEdge: true,
        offset: { x: 0, y: 30, side: 'LEFT' },
      },
      { id: 'EN', name: 'EN', direction: 'INPUT', offset: { x: 0, y: 66, side: 'LEFT' } },
      { id: 'RST', name: 'RST', direction: 'INPUT', offset: { x: 0, y: 102, side: 'LEFT' } },
      { id: 'Q0', name: 'Q0', direction: 'OUTPUT', offset: { x: 152, y: 22, side: 'RIGHT' } },
      { id: 'Q1', name: 'Q1', direction: 'OUTPUT', offset: { x: 152, y: 46, side: 'RIGHT' } },
      { id: 'Q2', name: 'Q2', direction: 'OUTPUT', offset: { x: 152, y: 70, side: 'RIGHT' } },
      { id: 'Q3', name: 'Q3', direction: 'OUTPUT', offset: { x: 152, y: 94, side: 'RIGHT' } },
      { id: 'CO', name: 'CO', direction: 'OUTPUT', offset: { x: 152, y: 118, side: 'RIGHT' } },
    ],
  },
  {
    type: 'TIMER_555',
    name: 'Інтегральний таймер NE555',
    shortLabel: 'NE555',
    category: 'MICROPROCESSOR',
    description:
      'Модель ІМС таймера 555 з компараторами порогів TRIG/THRES, входом скидання !RST та астабільним RC-генератором імпульсів.',
    defaultWidth: 156,
    defaultHeight: 124,
    defaultDelayNs: 25,
    isSequential: true,
    formulaLatex: 'T = 0.693(R_1 + 2R_2)C, \\quad f = \\frac{1.44}{(R_1 + 2R_2)C}',
    defaultPins: [
      { id: 'TRIG', name: 'TRIG', direction: 'INPUT', offset: { x: 0, y: 28, side: 'LEFT' } },
      { id: 'THRES', name: 'THR', direction: 'INPUT', offset: { x: 0, y: 62, side: 'LEFT' } },
      {
        id: 'RESET',
        name: '!RST',
        direction: 'INPUT',
        inverted: true,
        offset: { x: 0, y: 96, side: 'LEFT' },
      },
      { id: 'OUT', name: 'OUT', direction: 'OUTPUT', offset: { x: 156, y: 42, side: 'RIGHT' } },
      { id: 'DISCH', name: 'DIS', direction: 'OUTPUT', offset: { x: 156, y: 84, side: 'RIGHT' } },
    ],
  },
  {
    type: 'MUX_4TO1',
    name: 'Мультиплексор 4-в-1 (MUX)',
    shortLabel: 'MUX4',
    category: 'MICROPROCESSOR',
    description:
      'Комутує один із чотирьох інформаційних входів D0..D3 на вихід Y залежно від двійкового коду керування S1,S0.',
    defaultWidth: 148,
    defaultHeight: 144,
    defaultDelayNs: 15,
    isSequential: false,
    defaultPins: [
      { id: 'D0', name: 'D0', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'D1', name: 'D1', direction: 'INPUT', offset: { x: 0, y: 42, side: 'LEFT' } },
      { id: 'D2', name: 'D2', direction: 'INPUT', offset: { x: 0, y: 64, side: 'LEFT' } },
      { id: 'D3', name: 'D3', direction: 'INPUT', offset: { x: 0, y: 86, side: 'LEFT' } },
      { id: 'S0', name: 'S0', direction: 'INPUT', offset: { x: 0, y: 110, side: 'LEFT' } },
      { id: 'S1', name: 'S1', direction: 'INPUT', offset: { x: 0, y: 130, side: 'LEFT' } },
      { id: 'Y', name: 'Y', direction: 'OUTPUT', offset: { x: 148, y: 72, side: 'RIGHT' } },
    ],
  },
  {
    type: 'ALU_4BIT',
    name: '4-бітний АЛП мікропроцесора (ALU)',
    shortLabel: 'ALU4',
    category: 'MICROPROCESSOR',
    description:
      'Арифметико-логічний пристрій мікропроцесора: виконує ADD (00), SUB (01), AND (10), XOR (11) над 2-бітними/4-бітними операндами з прапорцями ZERO та CARRY.',
    defaultWidth: 164,
    defaultHeight: 164,
    defaultDelayNs: 30,
    isSequential: false,
    defaultPins: [
      { id: 'A0', name: 'A0', direction: 'INPUT', offset: { x: 0, y: 20, side: 'LEFT' } },
      { id: 'A1', name: 'A1', direction: 'INPUT', offset: { x: 0, y: 42, side: 'LEFT' } },
      { id: 'B0', name: 'B0', direction: 'INPUT', offset: { x: 0, y: 68, side: 'LEFT' } },
      { id: 'B1', name: 'B1', direction: 'INPUT', offset: { x: 0, y: 90, side: 'LEFT' } },
      { id: 'OP0', name: 'OP0', direction: 'INPUT', offset: { x: 0, y: 120, side: 'LEFT' } },
      { id: 'OP1', name: 'OP1', direction: 'INPUT', offset: { x: 0, y: 144, side: 'LEFT' } },
      { id: 'F0', name: 'F0', direction: 'OUTPUT', offset: { x: 164, y: 34, side: 'RIGHT' } },
      { id: 'F1', name: 'F1', direction: 'OUTPUT', offset: { x: 164, y: 66, side: 'RIGHT' } },
      { id: 'CARRY', name: 'CY', direction: 'OUTPUT', offset: { x: 164, y: 102, side: 'RIGHT' } },
      { id: 'ZERO', name: 'ZF', direction: 'OUTPUT', offset: { x: 164, y: 134, side: 'RIGHT' } },
    ],
  },
  {
    type: 'CUSTOM_IC',
    name: 'Користувацька ІМС (Підсхема)',
    shortLabel: 'IC',
    category: 'MICROPROCESSOR',
    description:
      'Ієрархічно інкапсульований модуль користувача, що виконує вкладену цифрову підсхему.',
    defaultWidth: 148,
    defaultHeight: 96,
    defaultDelayNs: 18,
    isSequential: false,
    defaultPins: [
      { id: 'IN0', name: 'IN0', direction: 'INPUT', offset: { x: 0, y: 30, side: 'LEFT' } },
      { id: 'IN1', name: 'IN1', direction: 'INPUT', offset: { x: 0, y: 66, side: 'LEFT' } },
      { id: 'OUT0', name: 'OUT0', direction: 'OUTPUT', offset: { x: 148, y: 48, side: 'RIGHT' } },
    ],
  },
  {
    type: 'LED',
    name: 'Світлодіодний індикатор (LED)',
    shortLabel: 'LED',
    category: 'OUTPUTS',
    description:
      'Візуальний індикатор логічного рівня: світиться при подачі 1, сигналізує помилку при конфлікті X.',
    defaultWidth: 104,
    defaultHeight: 56,
    defaultDelayNs: 2,
    isSequential: false,
    defaultPins: [
      { id: 'IN', name: 'IN', direction: 'INPUT', offset: { x: 0, y: 28, side: 'LEFT' } },
    ],
  },
  {
    type: 'PROBE',
    name: 'Цифровий логічний пробник',
    shortLabel: 'PRB',
    category: 'OUTPUTS',
    description:
      'Контрольна точка вимірювання тристабільного стану (0, 1, Z, X) із записом осцилограми в логічний аналізатор.',
    defaultWidth: 108,
    defaultHeight: 56,
    defaultDelayNs: 0,
    isSequential: false,
    defaultPins: [
      { id: 'IN', name: 'P', direction: 'INPUT', offset: { x: 0, y: 28, side: 'LEFT' } },
    ],
  },
  {
    type: 'SEVEN_SEGMENT',
    name: '7-сегментний HEX-індикатор',
    shortLabel: 'HEX',
    category: 'OUTPUTS',
    description:
      'Дешифрує 4-бітний двійковий код (B0..B3) у шістнадцятковий символ 0..F на 7-сегментній матриці.',
    defaultWidth: 136,
    defaultHeight: 132,
    defaultDelayNs: 4,
    isSequential: false,
    defaultPins: [
      { id: 'B0', name: 'B0', direction: 'INPUT', offset: { x: 0, y: 26, side: 'LEFT' } },
      { id: 'B1', name: 'B1', direction: 'INPUT', offset: { x: 0, y: 54, side: 'LEFT' } },
      { id: 'B2', name: 'B2', direction: 'INPUT', offset: { x: 0, y: 82, side: 'LEFT' } },
      { id: 'B3', name: 'B3', direction: 'INPUT', offset: { x: 0, y: 110, side: 'LEFT' } },
    ],
  },
];

export function getCatalogItem(type: ComponentType): ComponentCatalogItem {
  const found = COMPONENT_CATALOG.find((item) => item.type === type);
  if (!found) {
    throw new Error(`Unknown component type: ${type}`);
  }
  return found;
}

export function createNodeFromCatalog(
  type: ComponentType,
  id: string,
  position: { x: number; y: number },
  customLabel?: string,
  customIc?: CustomICDefinition,
): CircuitNodeData {
  const meta = getCatalogItem(type);

  if (type === 'CUSTOM_IC' && customIc) {
    const pinCount = Math.max(customIc.inputPins.length, customIc.outputPins.length, 1);
    const height = Math.max(84, pinCount * 28 + 24);
    const width = 156;
    const pins: PinDefinition[] = [
      ...customIc.inputPins.map((p, idx) => ({
        id: p.id,
        name: p.name,
        direction: 'INPUT' as const,
        offset: { x: 0, y: 24 + idx * 28, side: 'LEFT' as const },
        state: 'Z' as LogicState,
      })),
      ...customIc.outputPins.map((p, idx) => ({
        id: p.id,
        name: p.name,
        direction: 'OUTPUT' as const,
        offset: { x: width, y: 24 + idx * 28, side: 'RIGHT' as const },
        state: '0' as LogicState,
      })),
    ];

    return {
      id,
      type,
      position,
      width,
      height,
      pins,
      properties: {
        label: customLabel ?? customIc.code,
        propagationDelayNs: customIc.propagationDelayNs,
        customIcId: customIc.id,
      },
    };
  }

  const initialPinState = (dir: 'INPUT' | 'OUTPUT'): LogicState => {
    if (type === 'CONST_HIGH' && dir === 'OUTPUT') return '1';
    if (type === 'CONST_LOW' && dir === 'OUTPUT') return '0';
    return dir === 'INPUT' ? 'Z' : '0';
  };

  return {
    id,
    type,
    position,
    width: meta.defaultWidth,
    height: meta.defaultHeight,
    pins: meta.defaultPins.map((pin) => ({
      ...pin,
      offset: { ...pin.offset },
      state: initialPinState(pin.direction),
    })),
    properties: {
      label: customLabel ?? meta.shortLabel,
      propagationDelayNs: meta.defaultDelayNs,
      ...(type === 'INPUT_SWITCH' ? { switchState: '0' as LogicState } : {}),
      ...(type === 'PUSH_BUTTON' ? { switchState: '0' as LogicState } : {}),
      ...(type === 'CLOCK' ? { frequencyHz: 2, halfPeriodNs: 50 } : {}),
      ...(type === 'TIMER_555'
        ? {
            resistanceR1Ohms: 1000,
            resistanceR2Ohms: 2000,
            capacitanceUf: 0.02,
            astableAutoTrigger: true,
          }
        : {}),
      ...(type === 'LED' ? { ledColor: 'emerald' as const } : {}),
    },
  };
}
