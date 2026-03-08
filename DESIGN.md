# Design System: Bloomberg DeFi Options Terminal

**Project Name:** DeFi Options Terminal

## 1. Visual Theme & Atmosphere
The terminal must feel like a high-end, institutional-grade financial tool (think Bloomberg Terminal or specialized prop-trading software).
- **Atmosphere:** Dense, utilitarian, data-heavy, professional, high-contrast.
- **Vibe:** "Everything at a glance." Minimal whitespace. Information density is prioritized over breathing room.
- **Theme:** Strict Dark Mode. No light themes.

## 2. Color Palette & Roles
- **Background Deep (Page/Canvas):** Near-black space (`#080c14`) - Used for the absolute backdrop.
- **Surface Dark (Panels):** Midnight charcoal (`#111622`) - Used for primary component containers (e.g., Options Chain Grid, Inspector).
- **Surface Elevated (Hover/Active):** Muted slate (`#1e2532`) - Used for row hovers or active tab states.
- **Border/Divider:** Faint midnight (`#2a3547`) - Used to separate columns and rows cleanly.
- **Text Primary:** Sharp Ice White (`#e2e8f0`) - Used for crucial data points and active text.
- **Text Secondary:** Muted Slate Gray (`#8b9bab`) - Used for column headers, inactive tabs, and metadata.
- **Positive/Calls Action:** Electric Teal Green (`#00e676`) - Used to highlight Call options, positive changes, or "Buy" actions.
- **Negative/Puts Action:** Neon Crimson (`#ff3b3b`) - Used to highlight Put options, negative changes, or "Sell" actions.

## 3. Typography Rules
- **Headers & Labels:** Crisp sans-serif (Inter, Roboto, or System UI). Bold (`font-weight: 600` or `700`), very tight letter spacing. All-caps for section headers (e.g., `CALLS`, `PUTS`, `INSPECTOR`).
- **Data & Numbers:** Strict Monospace (JetBrains Mono, Roboto Mono, Fira Code, or `font-mono`). Tabular numerals are mandatory so columns align perfectly.
- **Sizing:** Small to very small. Base text is typically 12px-13px, headers 14px, secondary labels 10px-11px. No large fonts unless it's the absolute primary metric (e.g., current underlying price).

## 4. Component Stylings
- **Buttons / Actions:**
  - **Shape:** Squared-off edges (`rounded-sm` or `rounded-none`). No pills or large border radii.
  - **Style:** Subtle 1px borders, slightly raised on hover, deep dark backgrounds. No massive, fluffy drop shadows.
- **Cards/Containers/Panels:**
  - **Shape:** Hard edges or 2px corner radius max (`rounded-sm`).
  - **Borders:** Explicit 1px borders (`#2a3547`) wrapping the container.
  - **Shadows:** Flat. Rely on borders and subtle background color differences for depth, not shadows.
- **Badges / Tags:**
  - **Shape:** Small, tight padding.
  - **Style:** Colored text with a faint, low-opacity colored background (e.g., 10% opacity green background with green text).

## 5. Layout Principles
- **Grid / Alignment:** Strict grid adherence. Data must align in perfect vertical columns. Right-align all numbers. Left-align text labels.
- **Spacing:** Extremely tight. Padding between elements should be 4px to 8px max. The screen should feel packed but highly organized.
- **Borders over Whitespace:** Use explicit 1px borders to separate sections rather than relying on whitespace. Expand components to fill available frame space.

