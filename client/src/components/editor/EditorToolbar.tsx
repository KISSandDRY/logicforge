import React from 'react';
import {
  Box,
  Download,
  Edit2,
  Lock,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  SkipForward,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Win95Dropdown, type Win95DropdownOption } from '../ui/Win95Dropdown';

export interface EditorToolbarProps {
  formId: string;
  activeCircuitId: string;
  circuitTitle: string;
  circuitDropdownOptions: Win95DropdownOption[];
  onSelectCircuit: (circuitId: string) => void;
  onOpenRename: () => void;
  isRunning: boolean;
  onToggleRun: () => void;
  onSingleStep: () => void;
  onResetSimulation: () => void;
  stepDeltaNs: number;
  onChangeStepDeltaNs: (nextNs: number) => void;
  simSpeed: number;
  onChangeSimSpeed: (nextSpeed: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canClearCanvas: boolean;
  onClearCanvas: () => void;
  showLeftPanel: boolean;
  onToggleLeftPanel: () => void;
  showSignalsActive: boolean;
  onToggleSignalsPanel: () => void;
  showRightPanel: boolean;
  onToggleRightPanel: () => void;
  onOpenTruthTable: () => void;
  isAuthenticated: boolean;
  onOpenCustomIc: () => void;
  onOpenJson: () => void;
  onOpenSaveRevision: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = React.memo(
  ({
    formId,
    activeCircuitId,
    circuitTitle,
    circuitDropdownOptions,
    onSelectCircuit,
    onOpenRename,
    isRunning,
    onToggleRun,
    onSingleStep,
    onResetSimulation,
    stepDeltaNs,
    onChangeStepDeltaNs,
    simSpeed,
    onChangeSimSpeed,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    canClearCanvas,
    onClearCanvas,
    showLeftPanel,
    onToggleLeftPanel,
    showSignalsActive,
    onToggleSignalsPanel,
    showRightPanel,
    onToggleRightPanel,
    onOpenTruthTable,
    isAuthenticated,
    onOpenCustomIc,
    onOpenJson,
    onOpenSaveRevision,
  }) => (
    <div
      data-testid="editor-toolbar"
      className="win95-outset flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full w-full lg:w-auto">
        <Win95Dropdown
          testId="editor-circuit-select"
          ariaLabel="Перемикач активної схеми"
          value={activeCircuitId}
          options={circuitDropdownOptions}
          placeholder={circuitTitle}
          onChange={onSelectCircuit}
          className="min-w-0 flex-1 sm:flex-none sm:w-64 max-w-full"
        />

        <Button
          data-testid="btn-rename-scheme"
          variant="secondary"
          size="xs"
          onClick={onOpenRename}
          aria-label="Перейменувати поточну схему"
          title="Перейменувати поточну схему"
          icon={<Edit2 className="h-3.5 w-3.5 text-win-navy" />}
        />

        <div className="hidden sm:block h-4 w-px bg-win-shadow" />

        <Button
          data-testid="btn-toggle-run"
          variant={isRunning ? 'danger' : 'success'}
          size="sm"
          onClick={onToggleRun}
          icon={isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        >
          {isRunning ? 'Пауза' : 'Старт'}
        </Button>

        <Button
          data-testid="btn-step"
          variant="secondary"
          size="sm"
          onClick={onSingleStep}
          title="Виконати наступний крок дискретно-подійної симуляції"
          icon={<SkipForward className="h-3.5 w-3.5" />}
        >
          Крок
        </Button>

        <Button
          data-testid="btn-reset"
          variant="outline"
          size="sm"
          onClick={onResetSimulation}
          title="Скинути моделювання до початкового стану"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
        >
          Скинути
        </Button>

        <label htmlFor={`${formId}-step-delta`} className="sr-only">
          Крок модельного часу на 1 тік (точність, нс)
        </label>
        <Win95Dropdown
          id={`${formId}-step-delta`}
          testId="editor-step-delta-select"
          ariaLabel="Крок модельного часу на 1 тік (точність, нс)"
          value={String(stepDeltaNs)}
          onChange={(nextVal) => onChangeStepDeltaNs(Number(nextVal))}
          options={[
            { value: '5', label: '5 нс/тік' },
            { value: '10', label: '10 нс/тік' },
            { value: '25', label: '25 нс/тік' },
            { value: '50', label: '50 нс/тік' },
            { value: '100', label: '100 нс/тік' },
          ]}
          className="w-28"
        />

        <Win95Dropdown
          testId="editor-speed-select"
          ariaLabel="Швидкість відтворення у реальному часі (FPS)"
          value={String(simSpeed)}
          onChange={(nextVal) => onChangeSimSpeed(Number(nextVal))}
          options={[
            { value: '0.5', label: 'Швидк.: 0.5x' },
            { value: '1', label: 'Швидк.: 1x' },
            { value: '2', label: 'Швидк.: 2x' },
            { value: '4', label: 'Швидк.: 4x' },
          ]}
          className="w-28"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          size="xs"
          disabled={!canUndo}
          onClick={onUndo}
          aria-label="Скасувати (Ctrl+Z)"
          title="Скасувати (Ctrl+Z)"
          icon={<Undo2 className="h-3.5 w-3.5" />}
        />
        <Button
          variant="secondary"
          size="xs"
          disabled={!canRedo}
          onClick={onRedo}
          aria-label="Повторити (Ctrl+Y)"
          title="Повторити (Ctrl+Y)"
          icon={<Redo2 className="h-3.5 w-3.5" />}
        />
        <Button
          data-testid="btn-clear-canvas"
          variant="outline"
          size="xs"
          disabled={!canClearCanvas}
          onClick={onClearCanvas}
          title="Очистити полотно схеми (Ctrl+Z для скасування)"
          icon={<Trash2 className="h-3.5 w-3.5" />}
        >
          Очистити
        </Button>

        <div className="hidden xl:block h-4 w-px bg-win-shadow" />

        <div className="hidden xl:flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleLeftPanel}
            title="Показати / сховати бібліотеку компонентів"
            className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
              showLeftPanel
                ? 'win95-button-pressed bg-win-surface text-win-ink'
                : 'win95-button text-win-ink'
            }`}
          >
            <PanelLeft className="h-3 w-3" aria-hidden="true" /> Бібліотека
          </button>
          <button
            type="button"
            onClick={onToggleSignalsPanel}
            title="Показати / сховати логічний аналізатор"
            className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
              showSignalsActive
                ? 'win95-button-pressed bg-win-surface text-win-ink'
                : 'win95-button text-win-ink'
            }`}
          >
            <PanelBottom className="h-3 w-3" aria-hidden="true" /> Сигнали
          </button>
          <button
            type="button"
            onClick={onToggleRightPanel}
            title="Показати / сховати інспектор властивостей"
            className={`inline-flex min-h-7 min-w-7 coarse:min-h-9 coarse:min-w-9 items-center gap-1 px-2 py-1 text-xs font-bold touch-manipulation focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
              showRightPanel
                ? 'win95-button-pressed bg-win-surface text-win-ink'
                : 'win95-button text-win-ink'
            }`}
          >
            <PanelRight className="h-3 w-3" aria-hidden="true" /> Інспектор
          </button>
        </div>

        <div className="h-4 w-px bg-win-shadow" />

        <Button
          data-testid="btn-truth-table"
          variant="outline"
          size="sm"
          onClick={onOpenTruthTable}
          icon={<Table2 className="h-3.5 w-3.5 text-win-navy" />}
        >
          Таблиця істинності
        </Button>

        <Button
          data-testid="btn-custom-ic"
          variant="outline"
          size="sm"
          title={
            isAuthenticated
              ? 'Упакувати поточну схему в окрему інтегральну мікросхему (ІМС)'
              : 'Доступно лише авторизованим користувачам'
          }
          onClick={onOpenCustomIc}
          icon={
            !isAuthenticated ? (
              <Lock className="h-3.5 w-3.5 text-win-muted" />
            ) : (
              <Box className="h-3.5 w-3.5 text-win-navy" />
            )
          }
        >
          Створити ІМС
        </Button>

        <Button
          data-testid="btn-json"
          variant="outline"
          size="sm"
          onClick={onOpenJson}
          icon={<Download className="h-3.5 w-3.5" />}
        >
          JSON
        </Button>

        <Button
          data-testid="btn-save-revision"
          variant="primary"
          size="sm"
          title={
            isAuthenticated
              ? 'Зберегти поточну версію як нову ревізію'
              : 'Доступно лише авторизованим користувачам'
          }
          onClick={onOpenSaveRevision}
          icon={
            !isAuthenticated ? (
              <Lock className="h-3.5 w-3.5 text-win-muted" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )
          }
        >
          Зберегти ревізію
        </Button>
      </div>
    </div>
  ),
);
