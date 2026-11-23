---
name: LogicForge Studio (Win95 EDA Edition)
description: Класична настільна дизайн-система САПР у стилі Windows 95 (Electronics Workbench / CircuitMaker) для моделювання цифрових схем IEEE 1164.
colors:
  win-bg: '#c0c0c0'
  win-surface: '#dfdfdf'
  win-highlight: '#ffffff'
  win-shadow-dark: '#808080'
  win-shadow-darker: '#000000'
  win-titlebar-start: '#000080'
  win-titlebar-end: '#0b67a8'
  win-teal: '#008080'
  win-titlebar-inactive: '#595959'
  win-canvas: '#ffffff'
  win-ink-muted: '#3b3b3b'
  logic-1: '#008000'
  logic-1-wire: '#009900'
  logic-1-bg: '#ffffff'
  logic-1-border: '#008000'
  logic-0: '#1a1a1a'
  logic-0-bg: '#efefef'
  logic-z: '#806000'
  logic-z-bg: '#f8f6ee'
  logic-x: '#cc0000'
  logic-x-bg: '#fff2f2'
typography:
  display:
    fontFamily: "Tahoma, 'MS Sans Serif', 'Microsoft Sans Serif', Arial, sans-serif"
    fontSize: '1.25rem'
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "Tahoma, 'MS Sans Serif', 'Microsoft Sans Serif', Arial, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Tahoma, 'MS Sans Serif', 'Microsoft Sans Serif', Arial, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 700
    lineHeight: 1.3
  field-touch:
    fontFamily: "Tahoma, 'MS Sans Serif', 'Microsoft Sans Serif', Arial, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: "Tahoma, 'MS Sans Serif', 'Microsoft Sans Serif', Arial, sans-serif"
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: "'Courier New', Fixedsys, Consolas, monospace"
    fontSize: '11px'
    fontWeight: 700
    lineHeight: 1.2
  caption:
    fontFamily: "'Courier New', Fixedsys, Consolas, monospace"
    fontSize: '10px'
    fontWeight: 700
    lineHeight: 1.2
  micro:
    fontFamily: "'Courier New', Fixedsys, Consolas, monospace"
    fontSize: '9.5px'
    fontWeight: 700
    lineHeight: 1.15
rounded:
  none: '0px'
  xs: '1px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
components:
  button-win95:
    backgroundColor: '{colors.win-bg}'
    textColor: '{colors.win-shadow-darker}'
    rounded: '{rounded.none}'
    padding: '6px 12px'
  window-titlebar:
    backgroundColor: '{colors.win-titlebar-start}'
    textColor: '{colors.win-highlight}'
    rounded: '{rounded.none}'
    padding: '4px 10px'
---

# Design System: LogicForge Studio (Win95 EDA Edition)

## Overview

**Creative North Star: "The 1995 Electronics Workbench Station"**

LogicForge Studio adopts the tactile geometry of 1990s Windows 95 Electronic Design Automation tools (Electronics Workbench 5 and CircuitMaker): 2px 3D beveled gray chrome (`#c0c0c0` and `#dfdfdf`), active navy titlebars (`#000080` to `#1084d0`), sunken drafting viewports (`.win95-inset`), and recessed status-bar cells (`.win95-statusbar-cell`).

**Key Characteristics:**

- **Authentic 2px Win95 Bevels:** Multi-layer inset box-shadows define `.win95-outset`, `.win95-inset`, and `.win95-statusbar-cell` in `src/index.css`.
- **Navy Window Titlebars:** Active panels and modal dialogs carry the `#000080 → #1084d0` gradient with bold white Tahoma titles.
- **IEEE 1164 Signal Encoding:** Emerald green (`1`), dark charcoal (`0`), amber (`Z`), and crimson (`X`) encode four-valued logic states.

## Colors

### Primary

- **Active Titlebar Navy** (`#000080`) & **Titlebar Cobalt** (`#1084d0`): Active window titlebar gradient and primary link/focus accents.

### Secondary

- **Logic High Emerald** (`#166534`, `#dcfce7`): IEEE 1164 state `1 (HIGH)`.
- **High-Z Amber** (`#b45309`, `#fef3c7`): IEEE 1164 state `Z (High-Z)`.
- **Bus Conflict Crimson** (`#b91c1c`, `#fee2e2`): IEEE 1164 state `X (Конфлікт)`.

### Neutral

- **Win95 Chrome Silver** (`#c0c0c0`) & **Bevel Light Silver** (`#dfdfdf`): Desktop background and raised button/panel surfaces.
- **Bevel Highlight White** (`#ffffff`) & **Drafting Sheet White** (`#fbfcfd`): Top-left specular edge, inputs, and schematic canvas.
- **Shadow Gray** (`#808080`), **Inactive Titlebar** (`#595959`), **Outer Edge Black** (`#000000`), **Muted Gray** (`#3b3b3b`), & **Logic Low Charcoal** (`#1e293b`, `#e2e8f0`): Bevel shadows, grid dots, ink, and state `0 (LOW)`.

### Named Rules

**The Bevel-Over-Border Rule.** Depth comes from 2px directional light/shadow bevels, never from blurred drop-shadows or rounded pill borders.

**The Signal Purity Rule.** Saturated emerald, amber, and crimson appear only on IEEE 1164 signal states and simulation transport controls.

## Typography

**Display & Body Font:** Tahoma (with "MS Sans Serif", "Segoe UI", sans-serif fallback)
**Label/Mono Font:** JetBrains Mono (with "Courier New", monospace fallback)

### Hierarchy

- **Display** (700, 1.25rem) & **Headline** (700, 1.125rem): Metric counters, brand title, and page headers.
- **Title** (700, 0.875rem) & **Body** (400–700, 0.75rem): Section headings, window titles, buttons, and descriptions.
- **Label** (700, 11px / 10px / 9.5px, JetBrains Mono): Status cells, pin designators, timing readouts, and `LogicBadge`.

### Named Rules

**The Real-Math Rule.** Render all boolean equations through `MathFormula` with proper CSS overbars and subscripts.

## Layout

Desktop screens use a `1680px` max-width container and a 4-panel resizable workbench in `/editor/:id` with 8px pointer-draggable splitters. Below `1024px`, the editor switches to full-width Win95 tabbed views.

## Elevation & Depth

Depth is orthographic via `.win95-window`, `.win95-outset`, `.win95-inset`, and `.win95-statusbar-cell` in `src/index.css`.

## Shapes

Zero border-radius (`0px`) across all windows, buttons, inputs, and status cells; `1px` radius on SVG IC packages.

## Components

### Buttons & Dialogs

- **`.win95-button`:** `0px` radius, 2px raised bevel (`min-h-6 min-w-6`), inverting to `.win95-button-pressed` on active press.
- **`Modal.tsx`:** `.win95-window` frame with `.win95-titlebar` navy header, beveled `[X]` close button, WAI-ARIA `role="dialog"`, and focus trap.

### Schematic Canvas & Logic Analyzer

- **`CircuitCanvas`:** Sunken `.win95-inset cad-grid-bg` SVG surface with Pointer Events and recessed `.win95-statusbar-cell` bottom panels.
- **`WaveformPanel`:** Sunken `.win95-inset` multi-channel oscilloscope with raised `.win95-button` zoom controls.

## Do's and Don'ts

### Do:

- **Do** frame every panel as a `.win95-window` with a `.win95-titlebar` header and sunken `.win95-inset` data viewport.
- **Do** use semantic CSS variables (`var(--win-*)`, `var(--logic-*)`) and Tailwind `win-*` / `logic-*` tokens.

### Don't:

- **Don't** use rounded SaaS cards, blurred drop shadows, or gradient text.
- **Don't** place uppercase eyebrow/kicker labels directly above headings.
