import React, { useMemo } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import {
  CATEGORY_LABELS,
  STANDARD_COMPONENT_CATALOG,
  type ComponentCategory,
  type ComponentType,
  type CustomICDefinition,
} from '@logicforge/shared-types';
import { CatalogNodePreview } from '../circuit/CatalogNodePreview';
import { Win95Dropdown } from '../ui/Win95Dropdown';

export interface ComponentPaletteSidebarProps {
  formId: string;
  widthPx: number;
  isMobileActive: boolean;
  paletteSearch: string;
  onChangePaletteSearch: (value: string) => void;
  paletteCategory: ComponentCategory | 'ALL';
  onChangePaletteCategory: (category: ComponentCategory | 'ALL') => void;
  customIcs: CustomICDefinition[];
  onStartPaletteDrag: (item: { type: ComponentType; customIcId?: string } | null) => void;
  onAddComponent: (
    type: ComponentType,
    pos?: { x: number; y: number },
    customIcId?: string,
  ) => void;
  onClosePanel: () => void;
}

export const ComponentPaletteSidebar: React.FC<ComponentPaletteSidebarProps> = React.memo(
  ({
    formId,
    widthPx,
    isMobileActive,
    paletteSearch,
    onChangePaletteSearch,
    paletteCategory,
    onChangePaletteCategory,
    customIcs,
    onStartPaletteDrag,
    onAddComponent,
    onClosePanel,
  }) => {
    const filteredCatalog = useMemo(() => {
      const q = paletteSearch.trim().toLowerCase();
      return STANDARD_COMPONENT_CATALOG.filter((item) => {
        if (paletteCategory !== 'ALL' && item.category !== paletteCategory) return false;
        if (q) {
          const text =
            `${item.name} ${item.shortLabel} ${item.type} ${item.icCode ?? ''}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      });
    }, [paletteCategory, paletteSearch]);

    return (
      <aside
        style={{ width: `${widthPx}px` }}
        className={`win95-window shrink-0 flex-col overflow-hidden max-lg:!w-full [contain:layout_style_paint] ${
          isMobileActive ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="win95-titlebar flex items-center justify-between gap-1 px-2 py-1">
          <span className="truncate text-xs font-bold">БІБЛІОТЕКА КОМПОНЕНТІВ</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="bg-win-bg px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-win-ink">
              {STANDARD_COMPONENT_CATALOG.length}
            </span>
            <button
              type="button"
              onClick={onClosePanel}
              aria-label="Згорнути бібліотеку компонентів"
              title="Згорнути панель (або потягніть повзунок вліво)"
              className="hidden lg:inline-flex win95-button min-h-6 min-w-6 coarse:min-h-9 coarse:min-w-9 items-center justify-center text-win-ink"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="border-b border-win-shadow bg-win-bg p-2 space-y-1.5">
          <div className="relative">
            <label htmlFor={`${formId}-palette-search`} className="sr-only">
              Пошук компонента у бібліотеці
            </label>
            <input
              id={`${formId}-palette-search`}
              type="text"
              value={paletteSearch}
              onChange={(e) => onChangePaletteSearch(e.target.value)}
              placeholder="Пошук компонента..."
              className="win95-field w-full pl-2.5 pr-7 py-1 text-xs text-win-ink"
            />
            <Search className="pointer-events-none absolute right-2 top-1.5 h-3.5 w-3.5 text-win-muted" />
          </div>
          <label htmlFor={`${formId}-palette-cat`} className="sr-only">
            Категорія бібліотеки
          </label>
          <Win95Dropdown
            id={`${formId}-palette-cat`}
            testId="editor-palette-category-select"
            ariaLabel="Категорія бібліотеки"
            value={paletteCategory}
            onChange={(nextVal) => onChangePaletteCategory(nextVal as ComponentCategory | 'ALL')}
            options={[
              { value: 'ALL', label: `Усі розділи (${STANDARD_COMPONENT_CATALOG.length})` },
              ...(Object.keys(CATEGORY_LABELS) as ComponentCategory[]).map((cat) => ({
                value: cat,
                label: CATEGORY_LABELS[cat],
              })),
            ]}
            className="w-full"
          />
        </div>

        <div className="win95-inset flex-1 overflow-y-auto p-2 space-y-2 bg-win-surface [contain:strict]">
          {customIcs.length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-win-shadow">
              <div className="text-[10px] font-bold uppercase text-win-ink">
                Користувацькі ІМС ({customIcs.length})
              </div>
              {customIcs.map((ic) => (
                <button
                  key={ic.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/logicforge-type', 'CUSTOM_IC');
                    e.dataTransfer.setData('application/logicforge-custom-ic', ic.id);
                    onStartPaletteDrag({ type: 'CUSTOM_IC', customIcId: ic.id });
                  }}
                  onDragEnd={() => onStartPaletteDrag(null)}
                  onClick={() => onAddComponent('CUSTOM_IC', undefined, ic.id)}
                  className="win95-button flex w-full cursor-pointer items-center justify-between px-2.5 py-1.5 text-left text-xs focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px]"
                >
                  <div>
                    <div className="font-mono font-bold text-win-ink">{ic.code}</div>
                    <div className="text-[10px] text-win-muted truncate max-w-[165px]">
                      {ic.name}
                    </div>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-win-teal" />
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            {filteredCatalog.map((item) => (
              <button
                key={item.type}
                type="button"
                data-testid={`palette-item-${item.type}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/logicforge-type', item.type);
                  onStartPaletteDrag({ type: item.type });
                }}
                onDragEnd={() => onStartPaletteDrag(null)}
                onClick={() => onAddComponent(item.type)}
                title={`${item.name} (затримка: ${item.defaultDelayNs} нс)`}
                className="win95-button group flex w-full cursor-pointer flex-col items-center justify-between p-1.5 text-center focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-black focus-visible:outline-offset-[-4px]"
              >
                <div className="flex w-full items-center justify-between text-[11px] font-mono text-win-muted">
                  <span>{item.defaultPins.length}p</span>
                  <span>{item.defaultDelayNs}ns</span>
                </div>
                <div className="my-0.5 flex items-center justify-center w-full">
                  <CatalogNodePreview
                    type={item.type}
                    compact
                    className="h-11 w-full max-w-[92px]"
                  />
                </div>
                <div className="w-full truncate text-xs font-bold text-win-ink">
                  {item.shortLabel}
                </div>
                <div className="w-full truncate text-[11px] text-win-muted">{item.name}</div>
              </button>
            ))}
          </div>
        </div>
      </aside>
    );
  },
);
