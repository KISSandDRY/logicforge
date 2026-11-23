import React from 'react';
import { Download, Upload } from 'lucide-react';
import {
  CircuitImportValidationError,
  sanitizeAndValidateCircuitDocument,
  type CircuitDocument,
  type CustomICDefinition,
  type TruthTableResult,
} from '@logicforge/shared-types';
import { getSchemeCategoryOptions } from '../../constants/schemeCategories';
import { AuthGateModal } from '../ui/AuthGateModal';
import { Button } from '../ui/Button';
import { LogicBadge } from '../ui/LogicBadge';
import { BooleanSopFormula, MathFormula } from '../ui/MathFormula';
import { Modal } from '../ui/Modal';
import { Win95Dropdown } from '../ui/Win95Dropdown';
import { Win95NumberInput } from '../ui/Win95NumberInput';

export interface DetectedCustomIcPins {
  inputs: Array<{ id: string; name: string; mappedNodeId: string }>;
  outputs: Array<{ id: string; name: string; mappedNodeId: string }>;
}

export interface EditorModalsProps {
  formId: string;
  doc: CircuitDocument;
  onUpdateMetadata: (
    patch: Partial<CircuitDocument['metadata']>,
    persist?: 'debounced' | 'immediate',
  ) => void;
  onImportDocument: (nextDoc: CircuitDocument) => void;
  onToast: (message: string) => void;

  saveModalOpen: boolean;
  onCloseSaveModal: () => void;
  commitMessage: string;
  onChangeCommitMessage: (value: string) => void;
  saving: boolean;
  onSaveCircuit: () => void;

  truthModalOpen: boolean;
  onCloseTruthModal: () => void;
  truthTable: TruthTableResult | null;

  jsonModalOpen: boolean;
  onCloseJsonModal: () => void;
  jsonText: string;
  onChangeJsonText: (value: string) => void;

  customIcModalOpen: boolean;
  onCloseCustomIcModal: () => void;
  sourceCustomIc: CustomICDefinition | null;
  detectedCustomIcPins: DetectedCustomIcPins;
  icName: string;
  onChangeIcName: (value: string) => void;
  icCode: string;
  onChangeIcCode: (value: string) => void;
  icDelay: number;
  onChangeIcDelay: (value: number) => void;
  customIcSubmitted: boolean;
  onCreateCustomIc: (updateExistingId?: string) => void;

  renameModalOpen: boolean;
  onCloseRenameModal: () => void;

  authGateFeature: string | null;
  onCloseAuthGate: () => void;
}

export const EditorModals: React.FC<EditorModalsProps> = ({
  formId,
  doc,
  onUpdateMetadata,
  onImportDocument,
  onToast,
  saveModalOpen,
  onCloseSaveModal,
  commitMessage,
  onChangeCommitMessage,
  saving,
  onSaveCircuit,
  truthModalOpen,
  onCloseTruthModal,
  truthTable,
  jsonModalOpen,
  onCloseJsonModal,
  jsonText,
  onChangeJsonText,
  customIcModalOpen,
  onCloseCustomIcModal,
  sourceCustomIc,
  detectedCustomIcPins,
  icName,
  onChangeIcName,
  icCode,
  onChangeIcCode,
  icDelay,
  onChangeIcDelay,
  customIcSubmitted,
  onCreateCustomIc,
  renameModalOpen,
  onCloseRenameModal,
  authGateFeature,
  onCloseAuthGate,
}) => (
  <>
    {/* Модальне вікно 1: Збереження схеми та створення ревізії */}
    <Modal
      open={saveModalOpen}
      onClose={onCloseSaveModal}
      title="Збереження схеми та фіксація нової ревізії"
      subtitle="Кожне збереження створює окрему версію проєкту з можливістю повернення до попередніх знімків."
      maxWidthClass="max-w-lg"
      footer={
        <Button variant="primary" size="sm" loading={saving} onClick={onSaveCircuit}>
          Зберегти ревізію
        </Button>
      }
    >
      <div className="space-y-3 text-xs">
        <div>
          <label htmlFor={`${formId}-save-title`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Назва проєкту</span>
          </label>
          <input
            id={`${formId}-save-title`}
            type="text"
            value={doc.metadata.title}
            onChange={(e) => onUpdateMetadata({ title: e.target.value })}
            className="win95-field w-full px-3 py-2 font-normal text-win-ink"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-save-cat`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Категорія</span>
          </label>
          <input
            id={`${formId}-save-cat`}
            type="text"
            value={doc.metadata.category}
            onChange={(e) => onUpdateMetadata({ category: e.target.value })}
            className="win95-field w-full px-3 py-2 font-normal text-win-ink"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-save-desc`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Опис схеми</span>
          </label>
          <textarea
            id={`${formId}-save-desc`}
            rows={3}
            value={doc.metadata.description}
            onChange={(e) => onUpdateMetadata({ description: e.target.value })}
            className="win95-field w-full px-3 py-2 font-normal text-win-ink"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-save-commit`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Коментар до ревізії (що змінено)</span>
          </label>
          <input
            id={`${formId}-save-commit`}
            type="text"
            value={commitMessage}
            onChange={(e) => onChangeCommitMessage(e.target.value)}
            className="win95-field w-full px-3 py-2 font-normal text-win-ink"
          />
        </div>
      </div>
    </Modal>

    {/* Модальне вікно 2: Автоматична таблиця істинності та ДДНФ */}
    <Modal
      open={truthModalOpen}
      onClose={onCloseTruthModal}
      title="Автоматичний синтез таблиці істинності та канонічної ДДНФ"
      subtitle={
        <>
          Повна перевірка всіх <MathFormula latex="2^n" /> комбінацій вхідних сигналів із синтезом
          булевої формули ДДНФ.
        </>
      }
      maxWidthClass="max-w-3xl"
    >
      {!truthTable || truthTable.rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-win-muted">
          Для побудови таблиці істинності додайте до схеми щонайменше один вхідний перемикач або
          кнопку імпульсу та один вихідний індикатор (світлодіод LED або пробник).
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="win95-inset space-y-2 bg-win-highlight p-3">
            <div className="text-xs font-bold text-win-navy">
              Синтезовані булеві вирази (ДДНФ / Canonical SOP):
            </div>
            <div className="space-y-1.5 border-t border-win-surface pt-1.5">
              {Object.entries(truthTable.canonicalSopExpressions).map(([outName, expr]) => (
                <BooleanSopFormula key={outName} outputName={outName} expression={expr} />
              ))}
            </div>
          </div>

          <div className="win95-inset overflow-x-auto bg-win-highlight">
            <table className="w-full text-left text-xs">
              <thead className="bg-win-bg text-win-ink font-mono border-b border-win-shadow">
                <tr>
                  {truthTable.inputLabels.map((inp) => (
                    <th key={inp.nodeId} className="px-3 py-2 font-bold">
                      {inp.label}
                    </th>
                  ))}
                  {truthTable.outputLabels.map((out) => (
                    <th
                      key={out.nodeId}
                      className="border-l border-win-shadow bg-win-bg px-3 py-2 font-bold text-win-ink"
                    >
                      {out.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-win-surface bg-win-highlight">
                {truthTable.rows.map((row, idx) => (
                  <tr key={idx}>
                    {truthTable.inputLabels.map((inp) => (
                      <td key={inp.nodeId} className="px-3 py-1.5 font-mono">
                        <LogicBadge state={row.inputs[inp.label] ?? '0'} compact />
                      </td>
                    ))}
                    {truthTable.outputLabels.map((out) => (
                      <td
                        key={out.nodeId}
                        className="border-l border-win-surface bg-win-canvas px-3 py-1.5 font-mono"
                      >
                        <LogicBadge state={row.outputs[out.label] ?? 'Z'} compact />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>

    {/* Модальне вікно 3: Специфікація JSON (Імпорт / Експорт) */}
    <Modal
      open={jsonModalOpen}
      onClose={onCloseJsonModal}
      title="Експорт та імпорт схеми у форматі JSON"
      subtitle="Містить компоненти схеми, з’єднання між виводами, параметри елементів і стани сигналів."
      maxWidthClass="max-w-3xl"
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const blob = new Blob([jsonText], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${doc.metadata.title.replace(/\s+/g, '_').toLowerCase()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Завантажити .json
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Upload className="h-3.5 w-3.5" />}
            onClick={() => {
              try {
                const sanitized = sanitizeAndValidateCircuitDocument(jsonText, {
                  strictPinRefs: true,
                });
                onImportDocument(sanitized);
                onCloseJsonModal();
                onToast('Схему успішно імпортовано з JSON!');
              } catch (err) {
                const msg =
                  err instanceof CircuitImportValidationError
                    ? err.message
                    : 'Некоректний формат JSON. Перевірте структуру файлу.';
                onToast(msg);
              }
            }}
          >
            Застосувати JSON до полотна
          </Button>
        </>
      }
    >
      <div>
        <label htmlFor={`${formId}-json-spec`} className="sr-only">
          JSON специфікація схеми
        </label>
        <textarea
          id={`${formId}-json-spec`}
          rows={16}
          value={jsonText}
          onChange={(e) => onChangeJsonText(e.target.value)}
          className="win95-field w-full p-3 font-mono text-xs text-win-ink"
        />
      </div>
    </Modal>

    {/* Модальне вікно 4: Інкапсуляція поточної схеми у користувацьку ІМС */}
    <Modal
      open={customIcModalOpen}
      onClose={onCloseCustomIcModal}
      title="Збереження схеми як власної мікросхеми (ІМС)"
      subtitle="Усі вхідні перемикачі й кнопки стануть вхідними пінами корпусу, а світлодіоди й пробники — вихідними."
      maxWidthClass="max-w-md"
      footer={
        sourceCustomIc ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onCreateCustomIc()}>
              Зберегти як нову
            </Button>
            <Button variant="primary" size="sm" onClick={() => onCreateCustomIc(sourceCustomIc.id)}>
              Оновити «{sourceCustomIc.code}»
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="sm" onClick={() => onCreateCustomIc()}>
            Створити мікросхему
          </Button>
        )
      }
    >
      <div className="space-y-3 text-xs">
        <div className="win95-statusbar-cell bg-win-bg px-2.5 py-2 space-y-1.5 text-[11px] text-win-ink">
          <div>
            <strong>Як визначаються виводи:</strong> кожен перемикач (
            <span className="font-mono">SW</span>) або кнопка (
            <span className="font-mono">BTN</span>) на полотні автоматично стають{' '}
            <strong>входами</strong> корпусу, а світлодіоди (<span className="font-mono">LED</span>)
            чи пробники (<span className="font-mono">PROBE</span>) — <strong>виходами</strong>{' '}
            (згори донизу).
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            <span className="font-bold">Входи ({detectedCustomIcPins.inputs.length}):</span>
            {detectedCustomIcPins.inputs.length === 0 ? (
              <span className="text-logic-x font-bold">додайте SW або BTN на полотно</span>
            ) : (
              detectedCustomIcPins.inputs.map((p) => (
                <span
                  key={p.id}
                  className="win95-outset bg-win-highlight px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {p.name} → {p.id}
                </span>
              ))
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="font-bold">Виходи ({detectedCustomIcPins.outputs.length}):</span>
            {detectedCustomIcPins.outputs.length === 0 ? (
              <span className="text-logic-x font-bold">додайте LED або PROBE на полотно</span>
            ) : (
              detectedCustomIcPins.outputs.map((p) => (
                <span
                  key={p.id}
                  className="win95-outset bg-win-highlight px-1.5 py-0.5 font-mono text-[10px] text-win-navy"
                >
                  {p.name} → {p.id}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <label htmlFor={`${formId}-ic-name`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Повна назва мікросхеми</span>
          </label>
          <input
            id={`${formId}-ic-name`}
            type="text"
            value={icName}
            onChange={(e) => onChangeIcName(e.target.value)}
            className={`win95-field w-full px-3 py-2 font-normal text-win-ink ${
              customIcSubmitted && icName.trim().length < 2 ? 'win95-field-error' : ''
            }`}
          />
          {customIcSubmitted && icName.trim().length < 2 && (
            <p className="mt-1 text-[11px] font-bold text-logic-x">
              Вкажіть назву мікросхеми (мінімум 2 символи).
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${formId}-ic-code`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Кодове маркування</span>
            </label>
            <input
              id={`${formId}-ic-code`}
              type="text"
              value={icCode}
              onChange={(e) => onChangeIcCode(e.target.value)}
              className={`win95-field w-full px-3 py-2 font-mono font-normal text-win-ink ${
                customIcSubmitted && icCode.trim().length < 2 ? 'win95-field-error' : ''
              }`}
            />
            {customIcSubmitted && icCode.trim().length < 2 && (
              <p className="mt-1 text-[11px] font-bold text-logic-x">Мінімум 2 символи.</p>
            )}
          </div>
          <div>
            <label htmlFor={`${formId}-ic-delay`} className="block font-bold text-win-ink">
              <span className="mb-1 block">Затримка корпусу (нс)</span>
            </label>
            <Win95NumberInput
              id={`${formId}-ic-delay`}
              min={1}
              max={500}
              step={1}
              value={icDelay}
              onChange={(val) => onChangeIcDelay(Math.max(1, Math.round(val) || 15))}
            />
          </div>
        </div>
      </div>
    </Modal>

    {/* Модальне вікно 5: Назва, опис та категорія поточної схеми */}
    <Modal
      open={renameModalOpen}
      onClose={onCloseRenameModal}
      title="Властивості та опис цифрової схеми"
      maxWidthClass="max-w-md"
      footer={
        <Button variant="primary" size="sm" onClick={onCloseRenameModal}>
          Застосувати зміни
        </Button>
      }
    >
      <div className="space-y-3 text-xs">
        <div>
          <label htmlFor={`${formId}-rename-input`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Назва цифрової схеми</span>
          </label>
          <input
            id={`${formId}-rename-input`}
            data-testid="editor-rename-input"
            type="text"
            value={doc.metadata.title}
            onChange={(e) => onUpdateMetadata({ title: e.target.value }, 'immediate')}
            className="win95-field w-full px-2.5 py-1.5 font-normal text-win-ink"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-rename-cat`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Категорія проєкту</span>
          </label>
          <Win95Dropdown
            id={`${formId}-rename-cat`}
            testId="editor-scheme-category-select"
            ariaLabel="Категорія проєкту"
            value={doc.metadata.category}
            onChange={(nextCat) => onUpdateMetadata({ category: nextCat }, 'immediate')}
            options={getSchemeCategoryOptions(doc.metadata.category)}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor={`${formId}-rename-desc`} className="block font-bold text-win-ink">
            <span className="mb-1 block">Опис схеми (відображається в «Моїх схемах»)</span>
          </label>
          <textarea
            id={`${formId}-rename-desc`}
            data-testid="editor-description-input"
            rows={3}
            value={doc.metadata.description}
            onChange={(e) => onUpdateMetadata({ description: e.target.value }, 'immediate')}
            placeholder="Коротко опишіть призначення та роботу схеми..."
            className="win95-field w-full px-2.5 py-1.5 font-normal text-win-ink"
          />
        </div>
      </div>
    </Modal>

    {/* Модальне вікно 6: Обмеження гостьового доступу (потрібна авторизація) */}
    <AuthGateModal
      featureName={authGateFeature}
      onClose={onCloseAuthGate}
      testId="editor-auth-gate-dialog"
      extraNote="Поточна топологія на полотні буде збережена у вашому браузері."
    />
  </>
);
