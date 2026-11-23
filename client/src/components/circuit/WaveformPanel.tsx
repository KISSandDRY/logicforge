import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Activity, Lock, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import type { LogicState, WaveformSample } from '@logicforge/shared-types';
import { usePinchWheelZoom } from '../../hooks/usePinchWheelZoom';
import { LogicBadge } from '../ui/LogicBadge';

const clampWaveZoom = (z: number) => Math.min(6, Math.max(0.5, Number(z.toFixed(2))));

interface WaveformPanelProps {
  samples: WaveformSample[];
  currentTimeNs: number;
  isRunning?: boolean;
  compact?: boolean;
}

export interface WaveformTick {
  index: number;
  x: number;
  timeNs: number;
  showLabel: boolean;
  anchor: 'start' | 'end';
  labelX: number;
}

const NICE_TIME_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/**
 * Обчислює рівномірну апаратну сітку часових поділок осцилографа у фізичних наносекундах
 * (круглі значення кратні 1/2/5/10/25/50/100 нс) без нерівномірних стрибків на лінійці.
 */
export function computeEvenTimeTicks(
  startNs: number,
  endNs: number,
  totalWidth: number,
  minLabelGapPx = 74,
): Array<{
  key: string;
  x: number;
  timeNs: number;
  isMajor: boolean;
  anchor: 'start' | 'middle' | 'end';
  labelX: number;
}> {
  const span = Math.max(1, endNs - startNs);
  if (totalWidth <= 0) return [];

  let majorStep = NICE_TIME_STEPS[NICE_TIME_STEPS.length - 1];
  for (const candidate of NICE_TIME_STEPS) {
    if ((candidate / span) * totalWidth >= minLabelGapPx) {
      majorStep = candidate;
      break;
    }
  }

  let minorStep = majorStep;
  if (majorStep >= 25 && (majorStep / 5 / span) * totalWidth >= 14) {
    minorStep = majorStep / 5;
  } else if (majorStep >= 2 && (majorStep / 2 / span) * totalWidth >= 14) {
    minorStep = majorStep / 2;
  }

  const firstMinor = Math.ceil(startNs / minorStep) * minorStep;
  const ticks: Array<{
    key: string;
    x: number;
    timeNs: number;
    isMajor: boolean;
    anchor: 'start' | 'middle' | 'end';
    labelX: number;
  }> = [];

  for (let t = firstMinor; t <= endNs + minorStep * 0.001; t += minorStep) {
    const cleanT = Math.round(t * 1000) / 1000;
    if (cleanT > endNs) break;
    const x = Number((((cleanT - startNs) / span) * totalWidth).toFixed(1));
    const isMajor = Math.abs(cleanT % majorStep) < 1e-6 || cleanT === startNs;
    const nearLeft = x < 24;
    const nearRight = totalWidth - x < 34;
    ticks.push({
      key: `t_${cleanT}`,
      x,
      timeNs: cleanT,
      isMajor,
      anchor: nearLeft ? 'start' : nearRight ? 'end' : 'middle',
      labelX: nearLeft ? Math.max(4, x + 2) : nearRight ? Math.min(totalWidth - 4, x) : x,
    });
  }

  return ticks;
}

/**
 * Обчислює адаптивну сітку часових міток осцилограми без перекриття сусідніх підписів
 * (зокрема крайнього правого підпису часу на вузьких та широких вьюпортах).
 */
export function computeVisibleWaveformTicks(
  timesNs: number[],
  totalWidth: number,
  minLabelGapPx = 68,
): WaveformTick[] {
  const count = timesNs.length;
  if (count === 0) return [];
  if (count === 1) {
    return [
      {
        index: 0,
        x: 0,
        timeNs: timesNs[0],
        showLabel: true,
        anchor: 'start',
        labelX: 4,
      },
    ];
  }

  const estimateLabelW = (t: number) => Math.max(32, `${t} нс`.length * 7.2);
  const stepX = totalWidth / (count - 1);
  const lastIdx = count - 1;
  const lastLabelX = Math.max(4, totalWidth - 4);
  const lastLabelW = estimateLabelW(timesNs[lastIdx]);
  const lastLabelStart = lastLabelX - lastLabelW;
  const firstLabelW = estimateLabelW(timesNs[0]);
  const labelIndices = new Set<number>([0]);

  const maxEstW = Math.max(firstLabelW, lastLabelW);
  const adaptiveGap = Math.max(minLabelGapPx, maxEstW + 18);
  const majorEvery = Math.max(1, Math.ceil(adaptiveGap / Math.max(1, stepX)));
  const minClearance = 14;

  let prevLabelEnd = 4 + firstLabelW;
  const showLast = totalWidth >= 90 && lastLabelStart - prevLabelEnd >= minClearance;
  const rightBoundary = showLast ? lastLabelStart - minClearance : totalWidth - 4;

  for (let i = majorEvery; i < lastIdx; i += majorEvery) {
    const x = i * stepX;
    const labelStart = Math.max(4, x + 3);
    const labelEnd = labelStart + estimateLabelW(timesNs[i]);
    if (labelStart - prevLabelEnd >= minClearance && labelEnd <= rightBoundary) {
      labelIndices.add(i);
      prevLabelEnd = labelEnd;
    }
  }

  if (showLast) {
    labelIndices.add(lastIdx);
  }

  return timesNs.map((timeNs, idx) => {
    const x = Number((idx * stepX).toFixed(1));
    const isLast = idx === lastIdx;
    return {
      index: idx,
      x,
      timeNs,
      showLabel: labelIndices.has(idx),
      anchor: isLast ? 'end' : 'start',
      labelX: isLast ? lastLabelX : Math.max(4, x + 3),
    };
  });
}

export const WaveformPanel: React.FC<WaveformPanelProps> = React.memo(
  ({ samples, currentTimeNs, isRunning = false, compact = false }) => {
    const [timeZoom, setTimeZoom] = useState<number>(1);
    const [followSignal, setFollowSignal] = useState<boolean>(true);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const programmaticScrollRef = useRef<boolean>(false);
    const prevRunningRef = useRef<boolean>(isRunning);
    const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
      width: 680,
      height: 180,
    });

    useEffect(() => {
      if (isRunning && !prevRunningRef.current) {
        setFollowSignal(true);
      }
      prevRunningRef.current = isRunning;
    }, [isRunning]);

    useEffect(() => {
      if (samples.length === 0) {
        setFollowSignal(true);
        setHoverIdx(null);
      }
    }, [samples.length]);

    const latest = samples[samples.length - 1];
    const channelNames = useMemo(() => {
      if (!latest) return [];
      return Object.keys(latest.signals).slice(0, compact ? 5 : 12);
    }, [latest, compact]);

    useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;
      const syncSize = () => {
        setViewportSize({
          width: el.clientWidth || 680,
          height: el.clientHeight || 180,
        });
      };
      syncSize();
      const rafId = window.requestAnimationFrame(syncSize);
      window.addEventListener('resize', syncSize);
      if (typeof ResizeObserver === 'undefined') {
        return () => {
          window.cancelAnimationFrame(rafId);
          window.removeEventListener('resize', syncSize);
        };
      }
      const obs = new ResizeObserver(syncSize);
      obs.observe(el);
      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', syncSize);
        obs.disconnect();
      };
    }, [channelNames.length, samples.length]);

    const effectiveSamples = samples;
    const isEmpty = samples.length === 0 || channelNames.length === 0;
    const startNs = effectiveSamples.length > 0 ? effectiveSamples[0].timeNs : 0;
    const endNs =
      effectiveSamples.length > 0 ? effectiveSamples[effectiveSamples.length - 1].timeNs : 0;
    const spanNs = Math.max(10, endNs - startNs);
    const basePxPerNs = compact ? 1.8 : 2.6;
    const rawScaledWidth = Math.round(spanNs * basePxPerNs * timeZoom);
    const width = Math.max(viewportSize.width, rawScaledWidth);

    const zoomAnchorRef = useRef<{ ratio: number; clientOffsetX: number } | null>(null);
    const timeZoomRef = useRef(timeZoom);
    timeZoomRef.current = timeZoom;
    const wavePinchRef = useRef<{ startDist: number; baseZoom: number } | null>(null);

    usePinchWheelZoom({
      targetRef: viewportRef,
      active: !compact && !isEmpty,
      onWheel: (e, el) => {
        if (e.shiftKey) {
          if (el.scrollWidth > el.clientWidth) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
          }
          return;
        }
        const canScrollVertical = el.scrollHeight > el.clientHeight + 4;
        if (e.ctrlKey || (!canScrollVertical && Math.abs(e.deltaY) >= Math.abs(e.deltaX))) {
          e.preventDefault();
          e.stopPropagation();
          const rect = el.getBoundingClientRect();
          const relX = Math.max(0, Math.min(el.clientWidth, e.clientX - rect.left));
          zoomAnchorRef.current = {
            ratio: (el.scrollLeft + relX) / Math.max(1, el.scrollWidth),
            clientOffsetX: relX,
          };
          const factor = e.ctrlKey
            ? Math.min(1.25, Math.max(0.8, Math.exp(-e.deltaY * 0.012)))
            : e.deltaY < 0
              ? 1.25
              : 0.8;
          setTimeZoom((prev) => clampWaveZoom(prev * factor));
        }
      },
      onPinchStart: ({ dist }) => {
        wavePinchRef.current = { startDist: dist, baseZoom: timeZoomRef.current };
      },
      onPinchMove: ({ dist, midX }, el) => {
        if (!wavePinchRef.current) {
          wavePinchRef.current = { startDist: dist, baseZoom: timeZoomRef.current };
          return;
        }
        const rect = el.getBoundingClientRect();
        const relX = Math.max(0, Math.min(el.clientWidth, midX - rect.left));
        zoomAnchorRef.current = {
          ratio: (el.scrollLeft + relX) / Math.max(1, el.scrollWidth),
          clientOffsetX: relX,
        };
        setTimeZoom(
          clampWaveZoom(wavePinchRef.current.baseZoom * (dist / wavePinchRef.current.startDist)),
        );
      },
      onPinchEnd: () => {
        wavePinchRef.current = null;
      },
    });

    useLayoutEffect(() => {
      if (isEmpty) return;
      const el = viewportRef.current;
      if (!el) return;

      if (zoomAnchorRef.current) {
        const { ratio, clientOffsetX } = zoomAnchorRef.current;
        zoomAnchorRef.current = null;
        const targetScrollLeft = Math.max(
          0,
          Math.min(el.scrollWidth - el.clientWidth, Math.round(ratio * width - clientOffsetX)),
        );
        programmaticScrollRef.current = true;
        el.scrollLeft = targetScrollLeft;
        window.requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
        return;
      }

      if (!followSignal) return;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (Math.abs(el.scrollLeft - maxScroll) > 1) {
        programmaticScrollRef.current = true;
        el.scrollLeft = maxScroll;
        window.requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }
    }, [isEmpty, followSignal, samples.length, width]);

    const handleViewportScroll = () => {
      if (programmaticScrollRef.current) return;
      const el = viewportRef.current;
      if (!el) return;
      const distFromEnd = el.scrollWidth - el.clientWidth - el.scrollLeft;
      if (distFromEnd > 20 && followSignal) {
        setFollowSignal(false);
      } else if (distFromEnd <= 4 && !followSignal && isRunning) {
        setFollowSignal(true);
      }
    };

    if (isEmpty) {
      return (
        <div
          data-testid="waveform-empty-state"
          className="win95-inset flex h-full items-center justify-center bg-win-canvas p-3 text-center text-xs font-bold text-win-muted"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.045) 1px, transparent 1px)',
            backgroundSize: '40px 32px',
          }}
        >
          {samples.length === 0
            ? 'Логічний аналізатор порожній (t = 0 нс). Натисніть «Старт» або «Крок» для відображення сигналу.'
            : 'Додайте перемикачі, тактовий генератор або світлодіоди для побудови часової осцилограми.'}
        </div>
      );
    }

    const rulerHeight = 24;
    const availableBodyH = Math.max(0, viewportSize.height - rulerHeight);
    const minRowH = compact ? 26 : 30;
    const dynamicRowH = Math.floor(availableBodyH / Math.max(1, channelNames.length));
    const rowHeight = Math.max(minRowH, Math.min(54, dynamicRowH || minRowH));

    const contentHeight = channelNames.length * rowHeight + rulerHeight;
    const svgHeight = Math.max(Math.max(120, viewportSize.height - 2), contentHeight);

    const yOffsetForState = (state: LogicState, top: number): number => {
      if (state === '1') return top + 6;
      if (state === '0') return top + rowHeight - 7;
      return top + Math.round(rowHeight / 2);
    };

    const inspectedSample =
      hoverIdx !== null && effectiveSamples[hoverIdx]
        ? effectiveSamples[hoverIdx]
        : effectiveSamples[effectiveSamples.length - 1];

    const timeToX = (t: number): number =>
      Number((((t - startNs) / Math.max(1, spanNs)) * width).toFixed(1));
    const evenTicks = computeEvenTimeTicks(startNs, startNs + spanNs, width);

    const updateCursorFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = Math.max(0, Math.min(width, e.clientX - rect.left));
      const targetTime = startNs + (relX / Math.max(1, width)) * spanNs;
      let foundIdx = 0;
      for (let i = 0; i < effectiveSamples.length; i++) {
        if (effectiveSamples[i].timeNs <= targetTime) {
          foundIdx = i;
        } else {
          if (
            i > 0 &&
            Math.abs(effectiveSamples[i].timeNs - targetTime) <
              Math.abs(targetTime - effectiveSamples[i - 1].timeNs)
          ) {
            foundIdx = i;
          }
          break;
        }
      }
      setHoverIdx(foundIdx);
    };

    return (
      <div className="flex h-full flex-col overflow-hidden bg-win-bg select-none">
        {!compact && (
          <div className="win95-outset flex flex-wrap items-center justify-between gap-2 px-2 py-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-win-ink">
              <span className="win95-statusbar-cell inline-flex items-center gap-1.5 px-2 py-0.5">
                <Activity className="h-3.5 w-3.5 text-win-navy" aria-hidden="true" />
                <span>
                  Каналів: <strong>{channelNames.length}</strong>
                </span>
              </span>
              <span className="win95-statusbar-cell px-2 py-0.5 font-mono">
                Курсор t ={' '}
                <strong className="text-win-navy">
                  {inspectedSample?.timeNs ?? currentTimeNs} нс
                </strong>
              </span>
              <span className="win95-statusbar-cell px-2 py-0.5 font-mono">
                Відліків: <strong>{effectiveSamples.length}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="waveform-follow-toggle"
                aria-pressed={followSignal}
                onClick={() => setFollowSignal((v) => !v)}
                className={`${
                  followSignal ? 'win95-button-pressed font-bold' : 'win95-button font-bold'
                } mr-2 inline-flex min-h-7 coarse:min-h-9 items-center gap-1 px-2 py-0.5 text-xs touch-manipulation text-win-ink`}
                title={
                  followSignal
                    ? 'Слідкування за сигналом увімкнено (клік або прокрутка вліво — пауза фіксації)'
                    : 'Слідкування вимкнено (натисніть для переходу до нових відліків)'
                }
              >
                {followSignal ? (
                  <Lock className="h-3 w-3 text-win-navy" aria-hidden="true" />
                ) : (
                  <Unlock className="h-3 w-3 text-win-muted" aria-hidden="true" />
                )}
                <span>{followSignal ? 'Слідкувати' : 'Вільно'}</span>
              </button>

              <span className="text-xs font-bold uppercase text-win-ink mr-1">Масштаб:</span>
              <button
                type="button"
                aria-label="Зменшити масштаб часової осі"
                onClick={() => setTimeZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center p-1 touch-manipulation text-win-ink"
                title="Зменшити масштаб часової осі (або колесо миші)"
              >
                <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="win95-statusbar-cell inline-flex min-h-7 coarse:min-h-9 w-12 items-center justify-center font-mono text-xs font-bold text-win-ink">
                {Math.round(timeZoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Збільшити масштаб часової осі"
                onClick={() => setTimeZoom((z) => Math.min(6, Number((z + 0.25).toFixed(2))))}
                className="win95-button inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center justify-center p-1 touch-manipulation text-win-ink"
                title="Збільшити масштаб часової осі (або колесо миші)"
              >
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <div className="win95-inset flex flex-1 min-h-0 overflow-hidden bg-win-bg">
          {/* Ліва колонка: Назви каналів та стани у точці курсора у стилі Win95 */}
          <div
            className={`${
              compact ? 'w-32' : 'w-40 sm:w-52'
            } shrink-0 border-r-2 border-win-shadow bg-win-bg flex flex-col overflow-y-auto`}
          >
            <div
              style={{ height: `${rulerHeight}px` }}
              className="win95-outset shrink-0 flex items-center justify-between px-2 text-xs font-bold uppercase text-win-ink"
            >
              <span>Канал / Вузол</span>
              <span>Рівень</span>
            </div>

            <div className="divide-y divide-win-shadow border-b border-win-shadow">
              {channelNames.map((ch) => (
                <div
                  key={ch}
                  style={{ height: `${rowHeight}px` }}
                  className="flex items-center justify-between gap-1.5 px-2 text-xs bg-win-surface"
                >
                  <span className="truncate font-mono text-xs font-bold text-win-ink" title={ch}>
                    {ch}
                  </span>
                  <LogicBadge state={inspectedSample?.signals[ch] ?? 'Z'} compact />
                </div>
              ))}
            </div>
            <div className="flex-1 bg-win-bg" />
          </div>

          {/* Права частина: Повнорозмірне синхронне осцилографічне полотно у білій темі Saleae + Win95 */}
          <div
            ref={viewportRef}
            onScroll={handleViewportScroll}
            className="flex-1 min-w-0 h-full overflow-x-auto overflow-y-auto overscroll-contain bg-win-canvas"
            onPointerLeave={() => setHoverIdx(null)}
          >
            <svg
              data-testid="waveform-svg"
              width={width}
              height={svgHeight}
              viewBox={`0 0 ${width} ${svgHeight}`}
              className="block min-w-full touch-pan-x touch-pan-y"
              onPointerDown={updateCursorFromPointer}
              onPointerMove={updateCursorFromPointer}
            >
              {/* Світла область сигналів (біла тема Saleae) */}
              <rect
                x={0}
                y={rulerHeight}
                width={width}
                height={Math.max(0, svgHeight - rulerHeight)}
                fill="#ffffff"
              />
              {channelNames.map((ch, rowIdx) => (
                <rect
                  key={`bg_${ch}`}
                  x={0}
                  y={rulerHeight + rowIdx * rowHeight}
                  width={width}
                  height={rowHeight}
                  fill={rowIdx % 2 === 0 ? '#ffffff' : '#f5f7fa'}
                />
              ))}

              {/* Верхня часова шкала (лінійка наносекунд у стилі панелі заголовка Win95) */}
              <rect x={0} y={0} width={width} height={rulerHeight} fill="var(--win-bg)" />
              <line
                x1={0}
                y1={0.5}
                x2={width}
                y2={0.5}
                stroke="var(--win-highlight)"
                strokeWidth={1}
              />
              <line
                x1={0}
                y1={rulerHeight - 1}
                x2={width}
                y2={rulerHeight - 1}
                stroke="var(--win-shadow-dark)"
                strokeWidth={1}
              />
              <line
                x1={0}
                y1={rulerHeight}
                x2={width}
                y2={rulerHeight}
                stroke="var(--win-shadow-darker)"
                strokeWidth={1}
              />

              {evenTicks.map((tick) => {
                const showLabel = tick.isMajor;

                return (
                  <g key={tick.key}>
                    <line
                      x1={tick.x}
                      y1={rulerHeight}
                      x2={tick.x}
                      y2={svgHeight}
                      stroke={showLabel ? '#d5dbe5' : '#ebeff5'}
                      strokeOpacity={showLabel ? 0.95 : 0.85}
                      strokeWidth={1}
                    />
                    <line
                      x1={tick.x}
                      y1={showLabel ? 15 : 19}
                      x2={tick.x}
                      y2={rulerHeight - 1}
                      stroke="var(--win-ink)"
                      strokeWidth={1}
                    />
                    {showLabel && (
                      <text
                        x={tick.labelX}
                        y={12}
                        textAnchor={tick.anchor}
                        fill="var(--win-ink)"
                        fontSize={10.5}
                        fontWeight={700}
                        fontFamily="Courier New, Fixedsys, Consolas, monospace"
                      >
                        {tick.timeNs} нс
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Доріжки цифрових сигналів у лінійному фізичному часі */}
              {channelNames.map((ch, rowIdx) => {
                const top = rulerHeight + rowIdx * rowHeight;
                const yLow = top + rowHeight - 7;
                const yHigh = top + 6;

                const points: string[] = [];
                const highFillRects: Array<{ x: number; w: number }> = [];
                if (effectiveSamples.length === 1) {
                  const st = effectiveSamples[0].signals[ch] ?? 'Z';
                  const y = yOffsetForState(st, top);
                  points.push(`M 0 ${y} L ${width} ${y}`);
                  if (st === '1') {
                    highFillRects.push({ x: 0, w: width });
                  }
                } else {
                  const s0 = effectiveSamples[0];
                  const x0 = timeToX(s0.timeNs);
                  const st0 = s0.signals[ch] ?? 'Z';
                  points.push(`M ${x0} ${yOffsetForState(st0, top)}`);

                  for (let idx = 1; idx < effectiveSamples.length; idx++) {
                    const prev = effectiveSamples[idx - 1];
                    const cur = effectiveSamples[idx];
                    const prevSt = prev.signals[ch] ?? 'Z';
                    const curSt = cur.signals[ch] ?? 'Z';
                    const prevX = timeToX(prev.timeNs);
                    const curX = timeToX(cur.timeNs);
                    const prevY = yOffsetForState(prevSt, top);
                    const curY = yOffsetForState(curSt, top);

                    if (prevSt === '1' && curX > prevX) {
                      highFillRects.push({ x: prevX, w: curX - prevX });
                    }
                    if (curX !== prevX) {
                      points.push(`L ${curX} ${prevY}`);
                    }
                    if (curY !== prevY) {
                      points.push(`L ${curX} ${curY}`);
                    }
                  }

                  const lastSample = effectiveSamples[effectiveSamples.length - 1];
                  const lastX = timeToX(lastSample.timeNs);
                  const lastSt = lastSample.signals[ch] ?? 'Z';
                  if (lastX < width) {
                    points.push(`L ${width} ${yOffsetForState(lastSt, top)}`);
                    if (lastSt === '1') {
                      highFillRects.push({ x: lastX, w: width - lastX });
                    }
                  }
                }

                const lastSt = effectiveSamples[effectiveSamples.length - 1]?.signals[ch] ?? '0';
                const stroke = '#000000';

                return (
                  <g key={ch}>
                    <line
                      x1={0}
                      y1={top + rowHeight}
                      x2={width}
                      y2={top + rowHeight}
                      stroke="#cfd6e0"
                      strokeWidth={1}
                    />
                    <line
                      x1={0}
                      y1={yHigh}
                      x2={width}
                      y2={yHigh}
                      stroke="#e3e8f0"
                      strokeDasharray="3 3"
                      strokeWidth={0.8}
                    />
                    <line
                      x1={0}
                      y1={yLow}
                      x2={width}
                      y2={yLow}
                      stroke="#dce2ec"
                      strokeWidth={0.8}
                    />

                    {highFillRects.map((rect, rIdx) => (
                      <rect
                        key={`${ch}_hi_${rIdx}`}
                        x={rect.x}
                        y={yHigh}
                        width={rect.w}
                        height={Math.max(2, yLow - yHigh)}
                        fill="#000000"
                        fillOpacity={0.055}
                        className="pointer-events-none"
                      />
                    ))}

                    <path
                      d={points.join(' ')}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={2}
                      strokeDasharray={lastSt === 'Z' ? '5 3' : undefined}
                      strokeLinejoin="miter"
                    />
                  </g>
                );
              })}

              {hoverIdx !== null && effectiveSamples[hoverIdx] && (
                <g>
                  <line
                    x1={timeToX(effectiveSamples[hoverIdx].timeNs)}
                    y1={0}
                    x2={timeToX(effectiveSamples[hoverIdx].timeNs)}
                    y2={svgHeight}
                    stroke="#000080"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    );
  },
);
