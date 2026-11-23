import type { ComponentType } from '@logicforge/shared-types';

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

export function getComponentTruthTable(type: ComponentType): ComponentTruthTableSpec {
  switch (type) {
    case 'BUFFER':
      return {
        title: 'Таблиця істинності буфера (74HC125)',
        inputHeaders: ['A'],
        outputHeaders: ['Y'],
        rows: [
          { inputs: ['0'], outputs: ['0'], mode: 'Низький рівень (LOW)' },
          { inputs: ['1'], outputs: ['1'], mode: 'Високий рівень (HIGH)' },
          { inputs: ['Z'], outputs: ['X'], mode: 'Непідключений вхід' },
        ],
      };

    case 'NOT':
    case 'SCHMITT_INV':
      return {
        title:
          type === 'SCHMITT_INV'
            ? 'Таблиця істинності інвертора з тригером Шмітта (74HC14)'
            : 'Таблиця істинності інвертора НЕ (74HC04)',
        inputHeaders: ['A'],
        outputHeaders: ['Y = ¬A'],
        rows: [
          {
            inputs: ['0'],
            outputs: ['1'],
            mode:
              type === 'SCHMITT_INV'
                ? 'Вхід нижче нижнього порога → вихід 1'
                : 'Логічна інверсія 0 → 1',
          },
          {
            inputs: ['1'],
            outputs: ['0'],
            mode:
              type === 'SCHMITT_INV'
                ? 'Вхід вище верхнього порога → вихід 0'
                : 'Логічна інверсія 1 → 0',
          },
          { inputs: ['Z'], outputs: ['X'], mode: 'Невизначений стан при обриві входу' },
        ],
      };

    case 'AND':
      return {
        title: 'Таблиця істинності вентиля І (AND • 74HC08)',
        inputHeaders: ['A', 'B'],
        outputHeaders: ['Y = A ∧ B'],
        rows: [
          { inputs: ['0', '0'], outputs: ['0'], mode: 'Нуль домінує' },
          { inputs: ['0', '1'], outputs: ['0'], mode: 'Нуль домінує' },
          { inputs: ['1', '0'], outputs: ['0'], mode: 'Нуль домінує' },
          { inputs: ['1', '1'], outputs: ['1'], mode: 'Збіг одиниць (HIGH)' },
          { inputs: ['0', 'Z'], outputs: ['0'], mode: 'Домінування 0 у логіці Кліні' },
          { inputs: ['1', 'Z'], outputs: ['X'], mode: 'Невизначеність при Z' },
        ],
      };

    case 'OR':
      return {
        title: 'Таблиця істинності вентиля АБО (OR • 74HC32)',
        inputHeaders: ['A', 'B'],
        outputHeaders: ['Y = A ∨ B'],
        rows: [
          { inputs: ['0', '0'], outputs: ['0'], mode: 'Обидва входи 0' },
          { inputs: ['0', '1'], outputs: ['1'], mode: 'Одиниця домінує' },
          { inputs: ['1', '0'], outputs: ['1'], mode: 'Одиниця домінує' },
          { inputs: ['1', '1'], outputs: ['1'], mode: 'Одиниця домінує' },
          { inputs: ['1', 'Z'], outputs: ['1'], mode: 'Домінування 1 у логіці Кліні' },
          { inputs: ['0', 'Z'], outputs: ['X'], mode: 'Невизначеність при Z' },
        ],
      };

    case 'NAND':
      return {
        title: 'Таблиця істинності вентиля І-НЕ (NAND • 74HC00)',
        inputHeaders: ['A', 'B'],
        outputHeaders: ['Y = ¬(A ∧ B)'],
        rows: [
          { inputs: ['0', '0'], outputs: ['1'], mode: 'Інверсія кон’юнкції' },
          { inputs: ['0', '1'], outputs: ['1'], mode: 'Інверсія кон’юнкції' },
          { inputs: ['1', '0'], outputs: ['1'], mode: 'Інверсія кон’юнкції' },
          { inputs: ['1', '1'], outputs: ['0'], mode: 'Обидва входи активні' },
        ],
      };

    case 'NOR':
      return {
        title: 'Таблиця істинності вентиля АБО-НЕ (NOR • 74HC02)',
        inputHeaders: ['A', 'B'],
        outputHeaders: ['Y = ¬(A ∨ B)'],
        rows: [
          { inputs: ['0', '0'], outputs: ['1'], mode: 'Обидва входи 0 → вихід 1' },
          { inputs: ['0', '1'], outputs: ['0'], mode: 'Активний вхід B' },
          { inputs: ['1', '0'], outputs: ['0'], mode: 'Активний вхід A' },
          { inputs: ['1', '1'], outputs: ['0'], mode: 'Обидва входи 1' },
        ],
      };

    case 'XOR':
      return {
        title: 'Таблиця істинності вентиля Виключне АБО (XOR • 74HC86)',
        inputHeaders: ['A', 'B'],
        outputHeaders: ['Y = A ⊕ B'],
        rows: [
          { inputs: ['0', '0'], outputs: ['0'], mode: 'Рівні входи (парність)' },
          { inputs: ['0', '1'], outputs: ['1'], mode: 'Різні входи (сума mod 2)' },
          { inputs: ['1', '0'], outputs: ['1'], mode: 'Різні входи (сума mod 2)' },
          { inputs: ['1', '1'], outputs: ['0'], mode: 'Рівні входи (парність)' },
        ],
      };

    case 'XNOR':
      return {
        title: 'Таблиця істинності вентиля Еквівалентність (XNOR • 74HC266)',
        inputHeaders: ['A', 'B'],
        outputHeaders: ['Y = ¬(A ⊕ B)'],
        rows: [
          { inputs: ['0', '0'], outputs: ['1'], mode: 'Збіг нулів (A = B)' },
          { inputs: ['0', '1'], outputs: ['0'], mode: 'Нерівність входів' },
          { inputs: ['1', '0'], outputs: ['0'], mode: 'Нерівність входів' },
          { inputs: ['1', '1'], outputs: ['1'], mode: 'Збіг одиниць (A = B)' },
        ],
      };

    case 'TRI_BUFFER':
      return {
        title: 'Таблиця істинності тристабільного буфера (74HC244)',
        inputHeaders: ['EN', 'D'],
        outputHeaders: ['Y'],
        rows: [
          { inputs: ['0', '0'], outputs: ['Z'], mode: 'Третій стан High-Z (відключено від шини)' },
          { inputs: ['0', '1'], outputs: ['Z'], mode: 'Третій стан High-Z (відключено від шини)' },
          { inputs: ['1', '0'], outputs: ['0'], mode: 'Активна передача 0 на шину' },
          { inputs: ['1', '1'], outputs: ['1'], mode: 'Активна передача 1 на шину' },
        ],
      };

    case 'PARITY_4BIT':
      return {
        title: 'Таблиця істинності 4-бітного контролера парності (74HC280)',
        inputHeaders: ['Кількість 1 у (D3..D0)'],
        outputHeaders: ['EVEN (Парна)', 'ODD (Непарна)'],
        rows: [
          { inputs: ['0 одиниць (0000)'], outputs: ['1', '0'], mode: 'Парна кількість одиниць' },
          { inputs: ['1 одиниця'], outputs: ['0', '1'], mode: 'Непарна кількість одиниць' },
          { inputs: ['2 одиниці'], outputs: ['1', '0'], mode: 'Парна кількість одиниць' },
          { inputs: ['3 одиниці'], outputs: ['0', '1'], mode: 'Непарна кількість одиниць' },
          { inputs: ['4 одиниці (1111)'], outputs: ['1', '0'], mode: 'Парна кількість одиниць' },
        ],
      };

    case 'SR_LATCH':
      return {
        title: 'Таблиця переходів асинхронного SR-тригера (74HC279)',
        inputHeaders: ['S', 'R'],
        outputHeaders: ['Q(t+1)', '!Q(t+1)'],
        rows: [
          { inputs: ['0', '0'], outputs: ['Q(t)', '!Q(t)'], mode: 'Збереження попереднього стану' },
          { inputs: ['0', '1'], outputs: ['0', '1'], mode: 'Скидання тригера (Reset)' },
          { inputs: ['1', '0'], outputs: ['1', '0'], mode: 'Встановлення тригера (Set)' },
          {
            inputs: ['1', '1'],
            outputs: ['X', 'X'],
            mode: 'Заборонена комбінація (невизначеність)',
          },
        ],
      };

    case 'D_LATCH':
      return {
        title: 'Таблиця переходів прозорої D-защіпки з дозволом EN (74HC75)',
        inputHeaders: ['EN', 'D'],
        outputHeaders: ['Q(t+1)', '!Q(t+1)'],
        rows: [
          {
            inputs: ['0', 'X'],
            outputs: ['Q(t)', '!Q(t)'],
            mode: 'Режим фіксації (утримання защепленого біта)',
          },
          { inputs: ['1', '0'], outputs: ['0', '1'], mode: 'Прозорий режим: передача 0' },
          { inputs: ['1', '1'], outputs: ['1', '0'], mode: 'Прозорий режим: передача 1' },
        ],
      };

    case 'D_FLIPFLOP':
      return {
        title: 'Таблиця переходів синхронного D-тригера (74HC74)',
        inputHeaders: ['CLR', 'CLK', 'D'],
        outputHeaders: ['Q(t+1)', '!Q(t+1)'],
        rows: [
          { inputs: ['1', 'X', 'X'], outputs: ['0', '1'], mode: 'Асинхронне скидання (Clear)' },
          { inputs: ['0', '↑', '0'], outputs: ['0', '1'], mode: 'Запис 0 за переднім фронтом CLK' },
          { inputs: ['0', '↑', '1'], outputs: ['1', '0'], mode: 'Запис 1 за переднім фронтом CLK' },
          {
            inputs: ['0', '0 / 1', 'X'],
            outputs: ['Q(t)', '!Q(t)'],
            mode: 'Збереження стану між фронтами',
          },
        ],
      };

    case 'JK_FLIPFLOP':
      return {
        title: 'Таблиця переходів універсального JK-тригера (74HC112)',
        inputHeaders: ['CLR', 'CLK', 'J', 'K'],
        outputHeaders: ['Q(t+1)', '!Q(t+1)'],
        rows: [
          {
            inputs: ['1', 'X', 'X', 'X'],
            outputs: ['0', '1'],
            mode: 'Асинхронне скидання (Clear)',
          },
          {
            inputs: ['0', '↑', '0', '0'],
            outputs: ['Q(t)', '!Q(t)'],
            mode: 'Збереження стану (Hold)',
          },
          { inputs: ['0', '↑', '0', '1'], outputs: ['0', '1'], mode: 'Скидання у 0 (Reset)' },
          { inputs: ['0', '↑', '1', '0'], outputs: ['1', '0'], mode: 'Встановлення в 1 (Set)' },
          {
            inputs: ['0', '↑', '1', '1'],
            outputs: ['!Q(t)', 'Q(t)'],
            mode: 'Інверсія / лічильний режим (Toggle)',
          },
        ],
      };

    case 'T_FLIPFLOP':
      return {
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
        ],
      };

    case 'REGISTER_4BIT':
      return {
        title: 'Таблиця режимів 4-бітного паралельного регістра (74HC173)',
        inputHeaders: ['CLR', 'LD', 'CLK', 'D3..D0'],
        outputHeaders: ['Q3..Q0'],
        rows: [
          {
            inputs: ['1', 'X', 'X', 'XXXX'],
            outputs: ['0000'],
            mode: 'Асинхронне очищення регістра',
          },
          {
            inputs: ['0', '1', '↑', 'D3..D0'],
            outputs: ['D3..D0'],
            mode: 'Паралельне завантаження слова',
          },
          {
            inputs: ['0', '0', '↑', 'XXXX'],
            outputs: ['Q(t)'],
            mode: 'Збереження поточного слова',
          },
        ],
      };

    case 'SHIFT_REG_SIPO':
      return {
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
            inputs: ['0', '0/1', 'X'],
            outputs: ['Q0', 'Q1', 'Q2', 'Q3'],
            mode: 'Збереження розрядів',
          },
        ],
      };

    case 'COUNTER_4BIT':
      return {
        title: 'Таблиця режимів 4-бітного синхронного лічильника (74HC161)',
        inputHeaders: ['RST', 'EN', 'CLK'],
        outputHeaders: ['Q3..Q0', 'CO'],
        rows: [
          { inputs: ['1', 'X', 'X'], outputs: ['0000', '0'], mode: 'Скидання лічильника в 0' },
          { inputs: ['0', '0', '↑'], outputs: ['N(t)', '0'], mode: 'Зупинка рахунку (Hold)' },
          {
            inputs: ['0', '1', '↑'],
            outputs: ['(N+1) mod 16', '0'],
            mode: 'Інкремент (+1 за фронтом CLK)',
          },
          {
            inputs: ['0', '1', 'N=15'],
            outputs: ['1111', '1'],
            mode: 'Переповнення (Carry Out = 1)',
          },
        ],
      };

    case 'TIMER_555':
      return {
        title: 'Таблиця режимів роботи інтегрального таймера NE555',
        inputHeaders: ['!RST', 'TRIG', 'THRES'],
        outputHeaders: ['OUT', 'DISCH'],
        rows: [
          {
            inputs: ['0', 'X', 'X'],
            outputs: ['0', '1'],
            mode: 'Примусове скидання таймера (!RST = 0)',
          },
          {
            inputs: ['1', '0 (<1/3 Vcc)', '0'],
            outputs: ['1', '0'],
            mode: 'Запуск імпульсу (заряджання C через R1+R2)',
          },
          {
            inputs: ['1', '1', '1 (>2/3 Vcc)'],
            outputs: ['0', '1'],
            mode: 'Поріг досягнуто (розряджання C через R2)',
          },
          {
            inputs: ['1', 'Авто (RC)', 'Авто'],
            outputs: ['0 ⇄ 1', '1 ⇄ 0'],
            mode: 'Астабільна автогенерація прямокутних імпульсів',
          },
        ],
      };

    case 'MUX_2TO1':
      return {
        title: 'Таблиця істинності мультиплексора 2-в-1 (74HC157)',
        inputHeaders: ['S', 'D1', 'D0'],
        outputHeaders: ['Y'],
        rows: [
          { inputs: ['0', 'X', '0'], outputs: ['0'], mode: 'Обрано канал D0 (= 0)' },
          { inputs: ['0', 'X', '1'], outputs: ['1'], mode: 'Обрано канал D0 (= 1)' },
          { inputs: ['1', '0', 'X'], outputs: ['0'], mode: 'Обрано канал D1 (= 0)' },
          { inputs: ['1', '1', 'X'], outputs: ['1'], mode: 'Обрано канал D1 (= 1)' },
        ],
      };

    case 'MUX_4TO1':
      return {
        title: 'Таблиця істинності мультиплексора 4-в-1 (74HC153)',
        inputHeaders: ['S1', 'S0'],
        outputHeaders: ['Y (Вихід)'],
        rows: [
          { inputs: ['0', '0'], outputs: ['D0'], mode: 'Комутація каналу 0 (Y = D0)' },
          { inputs: ['0', '1'], outputs: ['D1'], mode: 'Комутація каналу 1 (Y = D1)' },
          { inputs: ['1', '0'], outputs: ['D2'], mode: 'Комутація каналу 2 (Y = D2)' },
          { inputs: ['1', '1'], outputs: ['D3'], mode: 'Комутація каналу 3 (Y = D3)' },
        ],
      };

    case 'DEMUX_1TO4':
      return {
        title: 'Таблиця істинності демультиплексора 1-в-4 (74HC139)',
        inputHeaders: ['S1', 'S0', 'D'],
        outputHeaders: ['Y0', 'Y1', 'Y2', 'Y3'],
        rows: [
          { inputs: ['0', '0', 'D'], outputs: ['D', '0', '0', '0'], mode: 'Маршрут на вихід Y0' },
          { inputs: ['0', '1', 'D'], outputs: ['0', 'D', '0', '0'], mode: 'Маршрут на вихід Y1' },
          { inputs: ['1', '0', 'D'], outputs: ['0', '0', 'D', '0'], mode: 'Маршрут на вихід Y2' },
          { inputs: ['1', '1', 'D'], outputs: ['0', '0', '0', 'D'], mode: 'Маршрут на вихід Y3' },
        ],
      };

    case 'DECODER_2TO4':
      return {
        title: 'Таблиця істинності дешифратора 2-в-4 (74HC139)',
        inputHeaders: ['EN', 'A1', 'A0'],
        outputHeaders: ['Y0', 'Y1', 'Y2', 'Y3'],
        rows: [
          {
            inputs: ['0', 'X', 'X'],
            outputs: ['0', '0', '0', '0'],
            mode: 'Дешифратор вимкнено (EN = 0)',
          },
          {
            inputs: ['1', '0', '0'],
            outputs: ['1', '0', '0', '0'],
            mode: 'Вибір лінії 0 (адреса 00)',
          },
          {
            inputs: ['1', '0', '1'],
            outputs: ['0', '1', '0', '0'],
            mode: 'Вибір лінії 1 (адреса 01)',
          },
          {
            inputs: ['1', '1', '0'],
            outputs: ['0', '0', '1', '0'],
            mode: 'Вибір лінії 2 (адреса 10)',
          },
          {
            inputs: ['1', '1', '1'],
            outputs: ['0', '0', '0', '1'],
            mode: 'Вибір лінії 3 (адреса 11)',
          },
        ],
      };

    case 'ENCODER_4TO2':
      return {
        title: 'Таблиця істинності пріоритетного шифратора 4-в-2 (74HC148)',
        inputHeaders: ['D3', 'D2', 'D1', 'D0'],
        outputHeaders: ['A1', 'A0', 'V'],
        rows: [
          { inputs: ['0', '0', '0', '0'], outputs: ['0', '0', '0'], mode: 'Немає активного входу' },
          { inputs: ['0', '0', '0', '1'], outputs: ['0', '0', '1'], mode: 'Активний вхід D0 (00)' },
          { inputs: ['0', '0', '1', 'X'], outputs: ['0', '1', '1'], mode: 'Пріоритет D1 (01)' },
          { inputs: ['0', '1', 'X', 'X'], outputs: ['1', '0', '1'], mode: 'Пріоритет D2 (10)' },
          {
            inputs: ['1', 'X', 'X', 'X'],
            outputs: ['1', '1', '1'],
            mode: 'Найвищий пріоритет D3 (11)',
          },
        ],
      };

    case 'FULL_ADDER':
      return {
        title: 'Таблиця істинності однорозрядного повного суматора (74HC80)',
        inputHeaders: ['A', 'B', 'CIN'],
        outputHeaders: ['SUM', 'COUT'],
        rows: [
          { inputs: ['0', '0', '0'], outputs: ['0', '0'], mode: '0 + 0 + 0 = 0' },
          { inputs: ['0', '0', '1'], outputs: ['1', '0'], mode: '0 + 0 + 1 = 1' },
          { inputs: ['0', '1', '0'], outputs: ['1', '0'], mode: '0 + 1 + 0 = 1' },
          { inputs: ['0', '1', '1'], outputs: ['0', '1'], mode: '0 + 1 + 1 = 10₂' },
          { inputs: ['1', '0', '0'], outputs: ['1', '0'], mode: '1 + 0 + 0 = 1' },
          { inputs: ['1', '0', '1'], outputs: ['0', '1'], mode: '1 + 0 + 1 = 10₂' },
          { inputs: ['1', '1', '0'], outputs: ['0', '1'], mode: '1 + 1 + 0 = 10₂' },
          { inputs: ['1', '1', '1'], outputs: ['1', '1'], mode: '1 + 1 + 1 = 11₂' },
        ],
      };

    case 'COMPARATOR_2BIT':
      return {
        title: 'Таблиця істинності 2-бітного компаратора слів (74HC85)',
        inputHeaders: ['Співвідношення A та B'],
        outputHeaders: ['GT (A>B)', 'EQ (A=B)', 'LT (A<B)'],
        rows: [
          { inputs: ['A1A0 > B1B0'], outputs: ['1', '0', '0'], mode: 'Слово A більше за B' },
          { inputs: ['A1A0 = B1B0'], outputs: ['0', '1', '0'], mode: 'Слова A та B рівні' },
          { inputs: ['A1A0 < B1B0'], outputs: ['0', '0', '1'], mode: 'Слово A менше за B' },
        ],
      };

    case 'ALU_4BIT':
      return {
        title: 'Таблиця кодів операцій мікропроцесорного АЛП (74HC181)',
        inputHeaders: ['OP1', 'OP0'],
        outputHeaders: ['F1..F0', 'CY', 'ZF'],
        rows: [
          {
            inputs: ['0', '0'],
            outputs: ['A + B', 'Перенос', 'F = 0'],
            mode: 'ADD — Арифметичне додавання',
          },
          {
            inputs: ['0', '1'],
            outputs: ['A − B', 'Позика', 'F = 0'],
            mode: 'SUB — Арифметичне віднімання',
          },
          {
            inputs: ['1', '0'],
            outputs: ['A ∧ B', '0', 'F = 0'],
            mode: 'AND — Побітова кон’юнкція',
          },
          {
            inputs: ['1', '1'],
            outputs: ['A ⊕ B', '0', 'F = 0'],
            mode: 'XOR — Додавання за модулем 2',
          },
        ],
      };

    case 'SEVEN_SEGMENT':
      return {
        title: 'Таблиця дешифрації 7-сегментного HEX-індикатора',
        inputHeaders: ['B3', 'B2', 'B1', 'B0'],
        outputHeaders: ['Символ HEX'],
        rows: [
          { inputs: ['0', '0', '0', '0'], outputs: ['0'], mode: 'Цифра 0 (0x0)' },
          { inputs: ['0', '0', '0', '1'], outputs: ['1'], mode: 'Цифра 1 (0x1)' },
          { inputs: ['0', '1', '0', '1'], outputs: ['5'], mode: 'Цифра 5 (0x5)' },
          { inputs: ['1', '0', '0', '1'], outputs: ['9'], mode: 'Цифра 9 (0x9)' },
          { inputs: ['1', '0', '1', '0'], outputs: ['A'], mode: 'Символ A (10)' },
          { inputs: ['1', '1', '1', '1'], outputs: ['F'], mode: 'Символ F (15)' },
        ],
      };

    case 'INPUT_SWITCH':
    case 'PUSH_BUTTON':
    case 'DIP_SWITCH_4':
    case 'CLOCK':
    case 'CONST_HIGH':
    case 'CONST_LOW':
    case 'LED':
    case 'PROBE':
    default:
      return {
        title: 'Таблиця істинності',
        inputHeaders: ['Стан'],
        outputHeaders: ['Рівень на лінії'],
        rows: [
          { inputs: ['0'], outputs: ['0 (LOW)'], mode: 'Низький потенціал (0 В / GND)' },
          { inputs: ['1'], outputs: ['1 (HIGH)'], mode: 'Високий потенціал (+5 В / VCC)' },
          { inputs: ['Z'], outputs: ['Z (High-Z)'], mode: 'Високоімпедансний стан (відключено)' },
          {
            inputs: ['X'],
            outputs: ['X (Conflict)'],
            mode: 'Конфлікт драйверів або невизначеність',
          },
        ],
      };
  }
}
