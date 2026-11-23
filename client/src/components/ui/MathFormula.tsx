import React from 'react';
import type { ComponentType } from '@logicforge/shared-types';

interface MathFormulaProps {
  type?: ComponentType;
  latex?: string;
  compact?: boolean;
  className?: string;
}

const MATH_SERIF_FONT =
  '"DejaVu Math TeX Gyre", "Times New Roman", "Liberation Serif", Georgia, serif';

/**
 * Компактне математичне позначення змінної з нижнім або верхнім індексом у стилі LaTeX (напр. t_{pd}, T_{crit}, f_{max}).
 */
export const MathVar: React.FC<{
  sym: string;
  sub?: string;
  sup?: string;
  className?: string;
}> = ({ sym, sub, sup, className = '' }) => {
  const isNumericBase = /^\d+$/.test(sym);
  return (
    <span
      style={{ fontFamily: MATH_SERIF_FONT }}
      className={`inline-flex items-baseline leading-none whitespace-nowrap ${className}`}
    >
      {isNumericBase ? <span className="not-italic">{sym}</span> : <i className="italic">{sym}</i>}
      {sub && (
        <sub
          style={{ fontSize: '0.72em', bottom: '-0.18em' }}
          className="relative font-normal not-italic leading-none"
        >
          {sub}
        </sub>
      )}
      {sup && (
        <sup
          style={{ fontSize: '0.72em', top: '-0.35em' }}
          className="relative font-normal italic leading-none"
        >
          {sup}
        </sup>
      )}
    </span>
  );
};

function renderLatexInlineTokens(raw: string): React.ReactNode[] {
  const normalized = raw
    .replace(/\\overline\{([^}]+)\}/g, '¬($1)')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\land/g, '∧')
    .replace(/\\lor/g, '∨')
    .replace(/\\oplus/g, '⊕')
    .replace(/\\cdot/g, '·')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\iff/g, '⇔')
    .replace(/\\equiv/g, '≡')
    .replace(/\\in/g, '∈')
    .replace(/\\bmod/g, ' mod ')
    .replace(/\\mid/g, ' | ')
    .replace(/\\quad/g, '  ')
    .replace(/\\;/g, ' ')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}');

  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /([A-Za-z])(?:_\{([^}]+)\}|_([A-Za-z0-9+-]+))(?:\^\{([^}]+)\}|\^([A-Za-z0-9+-]+))?|([A-Za-z0-9]+)\^\{([^}]+)\}|([A-Za-z0-9]+)\^([A-Za-z0-9+-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <React.Fragment key={`t_${k++}`}>
          {normalized.slice(lastIndex, match.index)}
        </React.Fragment>,
      );
    }
    if (match[1]) {
      const sym = match[1];
      const sub = match[2] ?? match[3];
      const sup = match[4] ?? match[5];
      nodes.push(<MathVar key={`m_${k++}`} sym={sym} sub={sub} sup={sup} />);
    } else if (match[6]) {
      nodes.push(<MathVar key={`m_${k++}`} sym={match[6]} sup={match[7]} />);
    } else if (match[8]) {
      nodes.push(<MathVar key={`m_${k++}`} sym={match[8]} sup={match[9]} />);
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    nodes.push(<React.Fragment key={`t_${k++}`}>{normalized.slice(lastIndex)}</React.Fragment>);
  }
  return nodes;
}

const Ov: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block border-t-[1.5px] border-current leading-none pt-[1.5px] px-[1px]">
    {children}
  </span>
);

function renderMathIdentifier(raw: string): React.ReactNode {
  const clean = raw.trim();
  const usIdx = clean.indexOf('_');
  if (usIdx > 0 && usIdx < clean.length - 1) {
    return <MathVar sym={clean.slice(0, usIdx)} sub={clean.slice(usIdx + 1)} />;
  }
  const trailingDigit = /^([A-Za-z]+?)(\d+)$/.exec(clean);
  if (trailingDigit) {
    return <MathVar sym={trailingDigit[1]} sub={trailingDigit[2]} />;
  }
  return <i className="italic">{clean}</i>;
}

/**
 * Рендерер булевого виразу канонічної ДДНФ у математичному стилі LaTeX:
 * замінює !VAR на верхню риску інверсії (overbar), форматує індекси змінних (IN_A, OUT_Y)
 * та вирівнює кон’юнкції й диз’юнкції академічною антиквою.
 */
export const BooleanSopFormula: React.FC<{
  outputName: string;
  expression: string;
  className?: string;
}> = ({ outputName, expression, className = '' }) => {
  const expr = expression.trim();
  const terms = expr === '0' || expr === '1' || expr === '' ? [] : expr.split(/\s*\+\s*/);

  return (
    <div
      data-testid="boolean-latex-formula"
      style={{ fontFamily: MATH_SERIF_FONT }}
      className={`flex flex-wrap items-baseline gap-y-1 text-[15px] leading-relaxed text-win-ink ${className}`}
    >
      <span className="font-bold text-win-navy">{renderMathIdentifier(outputName)}</span>
      <span className="mx-1.5 not-italic text-win-ink">=</span>
      {terms.length === 0 ? (
        <span className="not-italic font-bold text-win-ink">{expr || '0'}</span>
      ) : (
        terms.map((rawTerm, tIdx) => {
          const term = rawTerm.trim();
          const hasParens = term.startsWith('(') && term.endsWith(')');
          const inner = hasParens ? term.slice(1, -1) : term;
          const literals = inner
            .split(/\s*·\s*/)
            .map((s) => s.trim())
            .filter(Boolean);

          return (
            <React.Fragment key={`term_${tIdx}`}>
              {tIdx > 0 && <span className="mx-1.5 not-italic font-semibold text-win-ink">+</span>}
              <span className="inline-flex items-baseline whitespace-nowrap">
                {hasParens && <span className="not-italic text-win-muted mr-[1px]">(</span>}
                {literals.map((lit, lIdx) => {
                  const negated = lit.startsWith('!');
                  const ident = negated ? lit.slice(1) : lit;
                  const identNode = renderMathIdentifier(ident);
                  return (
                    <React.Fragment key={`lit_${tIdx}_${lIdx}`}>
                      {lIdx > 0 && <span className="mx-1 not-italic font-semibold">·</span>}
                      {negated ? <Ov>{identNode}</Ov> : identNode}
                    </React.Fragment>
                  );
                })}
                {hasParens && <span className="not-italic text-win-muted ml-[1px]">)</span>}
              </span>
            </React.Fragment>
          );
        })
      )}
    </div>
  );
};

/**
 * Рендерер математичних і булевих моделей елементів САПР у типографіці LaTeX без сирого ASCII.
 * Відображає риски інверсії (overbar), нижні/верхні індекси, дроби та логічні оператори.
 */
export const MathFormula: React.FC<MathFormulaProps> = ({
  type,
  latex,
  compact = false,
  className = '',
}) => {
  const renderByType = (): React.ReactNode | null => {
    switch (type) {
      case 'INPUT_SWITCH':
        return (
          <span>
            <i>Q</i> ∈ {'{'}0, 1, Z{'}'}
          </span>
        );
      case 'PUSH_BUTTON':
        return (
          <span>
            <i>P</i>(<i>t</i>) = 1 <span className="text-[11px] font-normal">(натиснуто)</span>, 0{' '}
            <span className="text-[11px] font-normal">(відпущено)</span>
          </span>
        );
      case 'DIP_SWITCH_4':
        return (
          <span>
            <b>Q</b> = (<i>Q</i>
            <sub>3</sub>, <i>Q</i>
            <sub>2</sub>, <i>Q</i>
            <sub>1</sub>, <i>Q</i>
            <sub>0</sub>) ∈ {'{'}0, 1{'}'}
            <sup>4</sup>
          </span>
        );
      case 'CLOCK':
        return (
          <span>
            <i>T</i> = 2 · <i>t</i>
            <sub>half</sub>, &nbsp; <i>f</i> = 1 / <i>T</i>
          </span>
        );
      case 'CONST_HIGH':
        return (
          <span>
            <i>Y</i> ≡ 1 <span className="text-[11px] font-normal">(+5 В / HIGH)</span>
          </span>
        );
      case 'CONST_LOW':
        return (
          <span>
            <i>Y</i> ≡ 0 <span className="text-[11px] font-normal">(0 В / GND)</span>
          </span>
        );
      case 'BUFFER':
        return (
          <span>
            <i>Y</i> = <i>A</i>
          </span>
        );
      case 'SCHMITT_INV':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>A</i>
            </Ov>
            <sub>hyst</sub> &nbsp;
            {!compact && (
              <span className="text-[11px] font-normal">(тригер Шмітта з гістерезисом ΔU)</span>
            )}
          </span>
        );
      case 'AND':
        return (
          <span>
            <i>Y</i> = <i>A</i> ∧ <i>B</i> = <i>A</i> · <i>B</i>
          </span>
        );
      case 'OR':
        return (
          <span>
            <i>Y</i> = <i>A</i> ∨ <i>B</i> = <i>A</i> + <i>B</i>
          </span>
        );
      case 'NOT':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>A</i>
            </Ov>
          </span>
        );
      case 'NAND':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>A</i> ∧ <i>B</i>
            </Ov>{' '}
            ={' '}
            <Ov>
              <i>A</i> · <i>B</i>
            </Ov>
          </span>
        );
      case 'NOR':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>A</i> ∨ <i>B</i>
            </Ov>{' '}
            ={' '}
            <Ov>
              <i>A</i> + <i>B</i>
            </Ov>
          </span>
        );
      case 'XOR':
        return (
          <span>
            <i>Y</i> = <i>A</i> ⊕ <i>B</i> ={' '}
            <Ov>
              <i>A</i>
            </Ov>
            <i>B</i> + <i>A</i>
            <Ov>
              <i>B</i>
            </Ov>
          </span>
        );
      case 'XNOR':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>A</i> ⊕ <i>B</i>
            </Ov>{' '}
            = <i>A</i>
            <i>B</i> +{' '}
            <Ov>
              <i>A</i>
            </Ov>
            ·
            <Ov>
              <i>B</i>
            </Ov>
          </span>
        );
      case 'TRI_BUFFER':
        return (
          <span>
            <i>Y</i> = <i>D</i> <span className="font-normal">при</span> <i>EN</i> = 1; &nbsp;{' '}
            <i>Y</i> = Z <span className="font-normal">при</span> <i>EN</i> = 0
          </span>
        );
      case 'PARITY_4BIT':
        return (
          <span>
            <i>ODD</i> = <i>D</i>
            <sub>0</sub> ⊕ <i>D</i>
            <sub>1</sub> ⊕ <i>D</i>
            <sub>2</sub> ⊕ <i>D</i>
            <sub>3</sub>, &nbsp; <i>EVEN</i> ={' '}
            <Ov>
              <i>ODD</i>
            </Ov>
          </span>
        );
      case 'SR_LATCH':
        return (
          <span>
            <i>Q</i>(<i>t</i>+1) = <i>S</i> +{' '}
            <Ov>
              <i>R</i>
            </Ov>
            ·<i>Q</i>(<i>t</i>), &nbsp; <i>S</i> · <i>R</i> = 0
          </span>
        );
      case 'D_LATCH':
        return (
          <span>
            <i>Q</i>(<i>t</i>+1) = <i>EN</i>·<i>D</i> +{' '}
            <Ov>
              <i>EN</i>
            </Ov>
            ·<i>Q</i>(<i>t</i>)
          </span>
        );
      case 'D_FLIPFLOP':
        return (
          <span>
            <i>Q</i>(<i>t</i>+1) = <i>D</i>(<i>t</i>) <span className="font-normal">при</span>{' '}
            <i>CLK</i>↑ &nbsp;(<i>CLR</i> = 0)
          </span>
        );
      case 'JK_FLIPFLOP':
        return (
          <span>
            <i>Q</i>(<i>t</i>+1) = <i>J</i>·
            <Ov>
              <i>Q</i>(<i>t</i>)
            </Ov>{' '}
            +{' '}
            <Ov>
              <i>K</i>
            </Ov>
            ·<i>Q</i>(<i>t</i>) <span className="font-normal">при</span> <i>CLK</i>↑
          </span>
        );
      case 'T_FLIPFLOP':
        return (
          <span>
            <i>Q</i>(<i>t</i>+1) = <i>Q</i>(<i>t</i>) ⊕ <i>T</i>(<i>t</i>){' '}
            <span className="font-normal">при</span> <i>CLK</i>↑
          </span>
        );
      case 'REGISTER_4BIT':
        return (
          <span>
            <i>Q</i>
            <sub>i</sub>(<i>t</i>+1) = <i>D</i>
            <sub>i</sub>(<i>t</i>) <span className="font-normal">при</span> <i>LD</i> = 1,{' '}
            <i>CLK</i>↑
          </span>
        );
      case 'SHIFT_REG_SIPO':
        return (
          <span>
            <i>Q</i>
            <sub>0</sub>(<i>t</i>+1) = <i>SER</i>, &nbsp; <i>Q</i>
            <sub>k</sub>(<i>t</i>+1) = <i>Q</i>
            <sub>k−1</sub>(<i>t</i>)
          </span>
        );
      case 'COUNTER_4BIT':
        return (
          <span>
            <i>N</i>(<i>t</i>+1) = (<i>N</i>(<i>t</i>) + <i>EN</i>) mod 16, &nbsp; <i>CO</i> = (
            <i>N</i> = 15) ∧ <i>EN</i>
          </span>
        );
      case 'TIMER_555':
        return (
          <span>
            <i>T</i> = 0.693·(<i>R</i>
            <sub>1</sub> + 2<i>R</i>
            <sub>2</sub>)·<i>C</i>, &nbsp; <i>f</i> = 1.44 / ((<i>R</i>
            <sub>1</sub> + 2<i>R</i>
            <sub>2</sub>)·<i>C</i>)
          </span>
        );
      case 'MUX_2TO1':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>S</i>
            </Ov>
            ·<i>D</i>
            <sub>0</sub> + <i>S</i>·<i>D</i>
            <sub>1</sub>
          </span>
        );
      case 'MUX_4TO1':
        return (
          <span>
            <i>Y</i> ={' '}
            <Ov>
              <i>S</i>
              <sub>1</sub>
            </Ov>
            <Ov>
              <i>S</i>
              <sub>0</sub>
            </Ov>
            <i>D</i>
            <sub>0</sub> +{' '}
            <Ov>
              <i>S</i>
              <sub>1</sub>
            </Ov>
            <i>S</i>
            <sub>0</sub>
            <i>D</i>
            <sub>1</sub> + <i>S</i>
            <sub>1</sub>
            <Ov>
              <i>S</i>
              <sub>0</sub>
            </Ov>
            <i>D</i>
            <sub>2</sub> + <i>S</i>
            <sub>1</sub>
            <i>S</i>
            <sub>0</sub>
            <i>D</i>
            <sub>3</sub>
          </span>
        );
      case 'DEMUX_1TO4':
        return (
          <span>
            <i>Y</i>
            <sub>k</sub> = <i>D</i> <span className="font-normal">при</span> 2<i>S</i>
            <sub>1</sub> + <i>S</i>
            <sub>0</sub> = <i>k</i>
          </span>
        );
      case 'DECODER_2TO4':
        return (
          <span>
            <i>Y</i>
            <sub>k</sub> = <i>EN</i> ∧ (2<i>A</i>
            <sub>1</sub> + <i>A</i>
            <sub>0</sub> = <i>k</i>), &nbsp; <i>k</i> ∈ {'{'}0..3{'}'}
          </span>
        );
      case 'ENCODER_4TO2':
        return (
          <span>
            (<i>A</i>
            <sub>1</sub>, <i>A</i>
            <sub>0</sub>) = max{'{'}
            <i>k</i> : <i>D</i>
            <sub>k</sub>=1{'}'}, &nbsp; <i>V</i> = ⋁<i>D</i>
            <sub>k</sub>
          </span>
        );
      case 'FULL_ADDER':
        return (
          <span>
            <i>SUM</i> = <i>A</i> ⊕ <i>B</i> ⊕ <i>C</i>
            <sub>in</sub>, &nbsp; <i>C</i>
            <sub>out</sub> = <i>AB</i> + <i>C</i>
            <sub>in</sub>(<i>A</i> ⊕ <i>B</i>)
          </span>
        );
      case 'COMPARATOR_2BIT':
        return (
          <span>
            <i>GT</i> = (<i>A</i> &gt; <i>B</i>), &nbsp; <i>EQ</i> = (<i>A</i> = <i>B</i>), &nbsp;{' '}
            <i>LT</i> = (<i>A</i> &lt; <i>B</i>)
          </span>
        );
      case 'ALU_4BIT':
        return (
          <span>
            <i>F</i> = <i>A</i>+<i>B</i> (00) | <i>A</i>−<i>B</i> (01) | <i>A</i>∧<i>B</i> (10) |{' '}
            <i>A</i>⊕<i>B</i> (11)
          </span>
        );
      case 'CUSTOM_IC':
        return (
          <span>
            <i>Y</i> = <i>f</i>
            <sub>IC</sub>(<i>X</i>
            <sub>1</sub>, …, <i>X</i>
            <sub>n</sub>)
          </span>
        );
      case 'LED':
        return (
          <span>
            <i>L</i> = 1 ⇔ <i>IN</i> = 1
          </span>
        );
      case 'PROBE':
        return (
          <span>
            <i>P</i>(<i>t</i>) ∈ {'{'}0, 1, Z, X{'}'}
          </span>
        );
      case 'SEVEN_SEGMENT':
        return (
          <span>
            <i>D</i>
            <sub>16</sub> = 8<i>B</i>
            <sub>3</sub> + 4<i>B</i>
            <sub>2</sub> + 2<i>B</i>
            <sub>1</sub> + <i>B</i>
            <sub>0</sub> ∈ {'{'}0..F{'}'}
          </span>
        );
      default:
        return null;
    }
  };

  const byType = renderByType();
  if (byType) {
    return (
      <span
        style={{ fontFamily: MATH_SERIF_FONT }}
        className={`inline-flex flex-wrap items-center gap-1 ${className}`}
      >
        {byType}
      </span>
    );
  }

  if (!latex) return null;

  return (
    <span
      style={{ fontFamily: MATH_SERIF_FONT }}
      className={`inline-flex flex-wrap items-baseline gap-0.5 ${className}`}
    >
      {renderLatexInlineTokens(latex)}
    </span>
  );
};
