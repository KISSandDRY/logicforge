import React, { useEffect, useId, useState } from 'react';
import { PRESET_CIRCUITS } from '@logicforge/shared-types';
import { AlertCircle, FilePlus2, Layers } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Win95Dropdown } from '../ui/Win95Dropdown';
import { useWorkspace } from '../../context/WorkspaceContext';

import { getSchemeCategoryOptions } from '../../constants/schemeCategories';

export interface NewSchemeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (circuitId: string) => void;
}

export const NewSchemeModal: React.FC<NewSchemeModalProps> = ({ open, onClose, onCreated }) => {
  const formId = useId();
  const { createNewCircuit } = useWorkspace();

  const [mode, setMode] = useState<'empty' | 'template'>('empty');
  const [templateId, setTemplateId] = useState<string>(
    PRESET_CIRCUITS[0]?.id ?? 'preset-full-adder',
  );
  const [title, setTitle] = useState<string>('Нова цифрова схема');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<string>('Комбінаційні схеми');
  const [nameTouched, setNameTouched] = useState<boolean>(false);
  const [descTouched, setDescTouched] = useState<boolean>(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('empty');
      setTemplateId(PRESET_CIRCUITS[0]?.id ?? 'preset-full-adder');
      setTitle('Нова цифрова схема');
      setDescription('');
      setCategory('Комбінаційні схеми');
      setNameTouched(false);
      setDescTouched(false);
      setTitleError(null);
    }
  }, [open]);

  const handleSelectMode = (nextMode: 'empty' | 'template') => {
    setMode(nextMode);
    const tpl = PRESET_CIRCUITS.find((p) => p.id === templateId);
    if (!nameTouched) {
      setTitleError(null);
      if (nextMode === 'empty') {
        setTitle('Нова цифрова схема');
      } else {
        setTitle(tpl ? `${tpl.document.metadata.title} (Копія)` : 'Схема за шаблоном');
      }
    }
    if (!descTouched) {
      if (nextMode === 'empty') {
        setDescription('');
      } else if (tpl) {
        setDescription(tpl.document.metadata.description);
        setCategory(tpl.document.metadata.category);
      }
    }
  };

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = PRESET_CIRCUITS.find((p) => p.id === id);
    if (!tpl) return;
    if (!nameTouched) {
      setTitleError(null);
      setTitle(`${tpl.document.metadata.title} (Копія)`);
    }
    if (!descTouched) {
      setDescription(tpl.document.metadata.description);
    }
    setCategory(tpl.document.metadata.category);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      setTitleError('Введіть назву схеми (щонайменше 2 символи).');
      return;
    }
    setTitleError(null);
    const created = createNewCircuit({
      mode,
      templateId: mode === 'template' ? templateId : undefined,
      title: trimmed,
      description: description.trim() || undefined,
      category,
    });
    onClose();
    onCreated(created.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Створення нової цифрової схеми"
      subtitle="Оберіть чистий аркуш або готовий інженерний шаблон та задайте назву й опис проєкту."
      maxWidthClass="max-w-lg"
      footer={
        <Button
          data-testid="btn-confirm-create-scheme"
          variant="primary"
          size="sm"
          onClick={() => handleSubmit()}
        >
          Створити схему
        </Button>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-3 text-xs text-win-ink">
        <div role="radiogroup" aria-label="Тип нової схеми" className="grid grid-cols-2 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'empty'}
            data-testid="new-scheme-mode-empty"
            onClick={() => handleSelectMode('empty')}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 px-3 py-1.5 font-bold touch-manipulation ${
              mode === 'empty'
                ? 'win95-button-pressed bg-win-navy text-win-highlight'
                : 'win95-button text-win-ink'
            }`}
          >
            <FilePlus2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Порожня схема</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={mode === 'template'}
            data-testid="new-scheme-mode-template"
            onClick={() => handleSelectMode('template')}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 px-3 py-1.5 font-bold touch-manipulation ${
              mode === 'template'
                ? 'win95-button-pressed bg-win-navy text-win-highlight'
                : 'win95-button text-win-ink'
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>На основі шаблону</span>
          </button>
        </div>

        <div>
          <label htmlFor={`${formId}-scheme-name`} className="mb-1 block font-bold text-win-ink">
            Назва схеми
          </label>
          <div className="relative">
            <input
              id={`${formId}-scheme-name`}
              data-testid="new-scheme-name-input"
              type="text"
              aria-invalid={Boolean(titleError)}
              value={title}
              onChange={(e) => {
                setNameTouched(true);
                setTitle(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  setTitleError(null);
                }
              }}
              placeholder="Введіть назву цифрової схеми..."
              className={`${
                titleError ? 'win95-field-error pr-8' : 'win95-field px-2.5'
              } min-h-8 w-full pl-2.5 py-1.5 font-normal text-win-ink`}
            />
            {titleError && (
              <AlertCircle
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-logic-x"
              />
            )}
          </div>
          {titleError && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-logic-x">
              <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{titleError}</span>
            </p>
          )}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-scheme-cat`} className="mb-1 block font-bold text-win-ink">
              Категорія схеми
            </label>
            <Win95Dropdown
              id={`${formId}-scheme-cat`}
              testId="new-scheme-category-select"
              ariaLabel="Категорія схеми"
              value={category}
              onChange={setCategory}
              options={getSchemeCategoryOptions(category)}
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-scheme-desc`} className="mb-1 block font-bold text-win-ink">
              Опис схеми (необов’язково)
            </label>
            <input
              id={`${formId}-scheme-desc`}
              data-testid="new-scheme-description-input"
              type="text"
              value={description}
              onChange={(e) => {
                setDescTouched(true);
                setDescription(e.target.value);
              }}
              placeholder="Призначення вузла (напр. 2-бітний дешифратор)..."
              className="win95-field min-h-8 w-full px-2.5 py-1.5 font-normal text-win-ink"
            />
          </div>
        </div>

        {mode === 'template' ? (
          <div className="space-y-1.5">
            <div className="font-bold text-win-ink">Оберіть шаблон ({PRESET_CIRCUITS.length}):</div>
            <div className="win95-inset max-h-56 overflow-y-auto bg-win-highlight p-1 space-y-0.5">
              {PRESET_CIRCUITS.map((tpl) => {
                const selected = tpl.id === templateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    data-testid={`new-scheme-tpl-${tpl.id}`}
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`w-full px-2.5 py-1.5 text-left transition-none focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black ${
                      selected
                        ? 'bg-win-navy text-win-highlight'
                        : 'bg-win-highlight text-win-ink hover:bg-win-navy hover:text-win-highlight'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="truncate">{tpl.document.metadata.title}</span>
                      <span className="shrink-0 font-mono text-[10px]">
                        {tpl.document.nodes.length} ел. • {tpl.document.edges.length} ліній
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 truncate text-[11px] ${
                        selected ? 'text-win-surface' : 'text-win-muted'
                      }`}
                    >
                      {tpl.document.metadata.category}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="win95-statusbar-cell px-2.5 py-2 text-[11px] text-win-muted">
            Буде відкрито чисте полотно (0 елементів, сітка 16×16) для перетягування компонентів із
            бібліотеки.
          </div>
        )}
      </form>
    </Modal>
  );
};
