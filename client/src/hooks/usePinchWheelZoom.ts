import { useEffect, useRef } from 'react';

export interface PinchMetrics {
  dist: number;
  midX: number;
  midY: number;
}

export interface UsePinchWheelZoomOptions {
  targetRef: React.RefObject<HTMLElement | null>;
  active?: boolean;
  blockCtrlWheelOnly?: boolean;
  onWheel?: (e: WheelEvent, el: HTMLElement) => void;
  onPinchStart?: (metrics: PinchMetrics, el: HTMLElement) => void;
  onPinchMove?: (metrics: PinchMetrics, el: HTMLElement) => void;
  onPinchEnd?: () => void;
  onGesture?: (e: Event) => void;
}

function measurePinch(touches: TouchList): PinchMetrics {
  const t0 = touches[0];
  const t1 = touches[1];
  return {
    dist: Math.max(8, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)),
    midX: (t0.clientX + t1.clientX) / 2,
    midY: (t0.clientY + t1.clientY) / 2,
  };
}

/**
 * Уніфікований непасивний слухач жестів масштабування (ctrl+wheel / wheel / 2-finger pinch / Safari gesture*).
 */
export function usePinchWheelZoom({
  targetRef,
  active = true,
  blockCtrlWheelOnly = false,
  onWheel,
  onPinchStart,
  onPinchMove,
  onPinchEnd,
  onGesture,
}: UsePinchWheelZoomOptions): void {
  const handlersRef = useRef({
    blockCtrlWheelOnly,
    onWheel,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
    onGesture,
  });
  handlersRef.current = {
    blockCtrlWheelOnly,
    onWheel,
    onPinchStart,
    onPinchMove,
    onPinchEnd,
    onGesture,
  };

  useEffect(() => {
    if (!active) return;
    const el = targetRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const h = handlersRef.current;
      if (h.blockCtrlWheelOnly) {
        if (e.ctrlKey) {
          e.preventDefault();
        }
        return;
      }
      h.onWheel?.(e, el);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const h = handlersRef.current;
      if (e.touches.length >= 2 && h.onPinchStart) {
        e.preventDefault();
        e.stopPropagation();
        h.onPinchStart(measurePinch(e.touches), el);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const h = handlersRef.current;
      if (e.touches.length >= 2) {
        if (h.blockCtrlWheelOnly) {
          e.preventDefault();
          return;
        }
        if (h.onPinchMove) {
          e.preventDefault();
          e.stopPropagation();
          h.onPinchMove(measurePinch(e.touches), el);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        handlersRef.current.onPinchEnd?.();
      }
    };

    const blockGesture = (e: Event) => {
      const h = handlersRef.current;
      if (h.onGesture) {
        h.onGesture(e);
      } else {
        e.preventDefault();
        if (!h.blockCtrlWheelOnly) {
          e.stopPropagation();
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    if (handlersRef.current.onPinchStart) {
      el.addEventListener('touchstart', handleTouchStart, { passive: false });
    }
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    if (handlersRef.current.onPinchEnd || handlersRef.current.onPinchStart) {
      el.addEventListener('touchend', handleTouchEnd, { passive: true });
      el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    }
    el.addEventListener('gesturestart', blockGesture, { passive: false });
    el.addEventListener('gesturechange', blockGesture, { passive: false });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('gesturestart', blockGesture);
      el.removeEventListener('gesturechange', blockGesture);
    };
  }, [active, targetRef]);
}
