import { useRef, useState } from 'react';

export type MaximizedEditorWindow = 'workspace' | 'signals' | null;
export type MobileEditorTab = 'workspace' | 'palette' | 'inspector';

function beginPanelResize(
  e: React.PointerEvent<HTMLDivElement>,
  onDelta: (dx: number, dy: number) => void,
) {
  e.preventDefault();
  const handle = e.currentTarget;
  const pointerId = e.pointerId;
  const startX = e.clientX;
  const startY = e.clientY;

  try {
    handle.setPointerCapture?.(pointerId);
  } catch {
    // Ignore synthetic pointer events where capture is unavailable
  }

  const onMove = (ev: PointerEvent) => {
    onDelta(ev.clientX - startX, ev.clientY - startY);
  };

  const cleanup = () => {
    try {
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release errors when capture already ended
    }
    handle.removeEventListener('lostpointercapture', cleanup);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
  };

  handle.addEventListener('lostpointercapture', cleanup);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
}

export function useEditorPanels() {
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(256);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(312);
  const [signalPanelHeight, setSignalPanelHeight] = useState<number>(230);
  const [showLeftPanel, setShowLeftPanel] = useState<boolean>(true);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [showSignalPanel, setShowSignalPanel] = useState<boolean>(true);
  const [maximizedWindow, setMaximizedWindow] = useState<MaximizedEditorWindow>(null);
  const [mobilePanelTab, setMobilePanelTab] = useState<MobileEditorTab>('workspace');

  const editorBodyRef = useRef<HTMLDivElement>(null);
  const centerColumnRef = useRef<HTMLDivElement>(null);

  const startResizeLeft = (e: React.PointerEvent<HTMLDivElement>) => {
    const startWidth = showLeftPanel ? leftPanelWidth : 0;
    const maxW = Math.max(360, Math.round((editorBodyRef.current?.clientWidth ?? 1200) * 0.65));
    beginPanelResize(e, (dx) => {
      const next = startWidth + dx;
      if (next < 48) {
        setShowLeftPanel(false);
      } else {
        setShowLeftPanel(true);
        setLeftPanelWidth(Math.min(maxW, Math.max(140, next)));
      }
    });
  };

  const startResizeRight = (e: React.PointerEvent<HTMLDivElement>) => {
    const startWidth = showRightPanel ? rightPanelWidth : 0;
    const maxW = Math.max(360, Math.round((editorBodyRef.current?.clientWidth ?? 1200) * 0.65));
    beginPanelResize(e, (dx) => {
      const next = startWidth - dx;
      if (next < 48) {
        setShowRightPanel(false);
      } else {
        setShowRightPanel(true);
        setRightPanelWidth(Math.min(maxW, Math.max(190, next)));
      }
    });
  };

  const startResizeSignal = (e: React.PointerEvent<HTMLDivElement>) => {
    const initialTotalH = centerColumnRef.current?.clientHeight ?? 680;
    const startHeight =
      maximizedWindow === 'signals' ? initialTotalH : showSignalPanel ? signalPanelHeight : 0;
    beginPanelResize(e, (_dx, dy) => {
      const liveTotalH = centerColumnRef.current?.clientHeight || initialTotalH;
      const next = startHeight - dy;
      if (next < 48) {
        setMaximizedWindow(null);
        setShowSignalPanel(false);
      } else if (next > liveTotalH - 56) {
        setShowSignalPanel(true);
        setMaximizedWindow('signals');
      } else {
        setMaximizedWindow(null);
        setShowSignalPanel(true);
        setSignalPanelHeight(Math.max(88, next));
      }
    });
  };

  const toggleLeftPanel = () => {
    if (maximizedWindow === 'workspace') {
      setMaximizedWindow(null);
      setShowLeftPanel(true);
      return;
    }
    setShowLeftPanel((v) => !v);
  };

  const toggleRightPanel = () => {
    if (maximizedWindow === 'workspace') {
      setMaximizedWindow(null);
      setShowRightPanel(true);
      return;
    }
    setShowRightPanel((v) => !v);
  };

  const toggleSignalsPanel = () => {
    if (maximizedWindow === 'signals') {
      setMaximizedWindow(null);
      setShowSignalPanel(false);
    } else if (maximizedWindow === 'workspace' || !showSignalPanel) {
      setMaximizedWindow(null);
      setShowSignalPanel(true);
    } else {
      setShowSignalPanel(false);
    }
  };

  return {
    leftPanelWidth,
    rightPanelWidth,
    signalPanelHeight,
    showLeftPanel,
    setShowLeftPanel,
    showRightPanel,
    setShowRightPanel,
    showSignalPanel,
    setShowSignalPanel,
    maximizedWindow,
    setMaximizedWindow,
    mobilePanelTab,
    setMobilePanelTab,
    editorBodyRef,
    centerColumnRef,
    startResizeLeft,
    startResizeRight,
    startResizeSignal,
    toggleLeftPanel,
    toggleRightPanel,
    toggleSignalsPanel,
  };
}
