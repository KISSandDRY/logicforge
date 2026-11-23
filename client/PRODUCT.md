# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineering students, digital electronics instructors, and hardware designers modeling, simulating, and verifying digital logic and microprocessor circuits in a browser-based Electronic Design Automation (EDA) workbench.

## Product Purpose

LogicForge Studio enables interactive schematic capture, discrete-event simulation in four-valued IEEE 1164 logic (`0`, `1`, `Z`, `X`), static timing analysis, truth-table and canonical Sum-of-Products (SOP / ДДНФ) synthesis, revision control, and Bill of Materials (BOM) / Netlist report generation.

## Positioning

Combines an interactive schematic editor and multi-channel digital logic analyzer with formal graph analysis (Union-Find netlist extraction, Kahn topological critical-path timing, Tarjan feedback cycle detection, and a Min-Heap discrete-event queue) plus reusable custom IC subcircuit encapsulation.

## Operating Context

Used during laboratory coursework, circuit debugging, and engineering specification preparation across desktop workstations, laptops, tablets, and mobile browsers, with `@media print` output for engineering documentation.

## Capabilities and Constraints

- Four-valued IEEE 1164 simulation engine (`0`, `1`, `Z`, `X`) with bus conflict detection (`BUS_CONFLICT`) and oscillation guards.
- 31 built-in catalog components (logic gates, flip-flops, registers, counters, NE555 astable timer, 4-bit microprocessor ALU, 7-segment decoder) plus user-encapsulated `CUSTOM_IC` modules.
- Seven verified preset circuits and full PostgreSQL / local workspace revision history.
- All Ukrainian engineering terminology, `data-testid` attributes, and mathematical models must be preserved.

## Brand Commitments

- Authentic Windows 95 classic desktop EDA software aesthetic inspired by 1990s Electronics Workbench and CircuitMaker.
- Classic Win95 3D beveled chrome (`#c0c0c0` background, `#dfdfdf` surface, `#ffffff` highlight, `#808080` / `#000000` shadows, `#000080` to `#1084d0` navy gradient titlebars) paired with high-contrast IEEE 1164 signal colors (`1` emerald green, `0` dark charcoal, `Z` amber, `X` crimson) on sunken schematic and waveform viewports.
- System UI typography (`Tahoma, "MS Sans Serif", "Segoe UI", sans-serif`) for desktop chrome and `JetBrains Mono / "Courier New"` for netlists, truth tables, pinouts, and boolean formulas.

## Evidence on Hand

- Live discrete-event simulator and graph analyzer in `@logicforge/shared-types`.
- Seven complete preset schematics (`preset-ne555-jk`, `preset-full-adder`, `preset-counter-hex`, `preset-mp-alu`, `preset-tristate-bus`, `preset-shift-register`, `preset-decoder-comparator`).
- 31 component truth tables and mathematical transfer formulas.

## Product Principles

- **Immediate Circuit Truth:** Every schematic view and oscilloscope trace reflects real discrete-event simulation state rather than decorative mockups.
- **Tactile Instrument Chrome:** Beveled Windows 95 window frames, recessed status-bar cells, and raised toolbar buttons clearly separate application controls from sunken schematic drafting viewports.
- **Unambiguous Signal Legibility:** IEEE 1164 logic states (`1`, `0`, `Z`, `X`) maintain high-contrast visual encoding across wires, pins, badges, and waveform channels.
- **Zero Data Loss:** Projects, revisions, and custom ICs persist seamlessly across PostgreSQL and local browser storage.

## Accessibility & Inclusion

WCAG 2.2 AA contrast ratios, WAI-ARIA modal dialog focus trapping, full keyboard navigation for catalog/palette/revision items, programmatic form label associations, unified Pointer Events for mouse and touch interaction, and `prefers-reduced-motion` support.
