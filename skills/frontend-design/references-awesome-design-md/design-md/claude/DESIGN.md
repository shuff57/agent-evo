# Design System Inspired by Claude (Anthropic)

> Category: AI & LLM
> Anthropic's AI assistant. Warm terracotta accent, clean editorial layout.

## 1. Visual Theme & Atmosphere

Claude's interface is a literary salon reimagined as a product page — warm, unhurried, and quietly intellectual. The entire experience is built on a parchment-toned canvas (`#f5f4ed`) that deliberately evokes the feeling of high-quality paper rather than a digital surface. Where most AI product pages lean into cold, futuristic aesthetics, Claude's design radiates human warmth, as if the AI itself has good taste in interior design.

The signature move is the custom Anthropic Serif typeface — a medium-weight serif with generous proportions that gives every headline the gravitas of a book title. Combined with organic, hand-drawn-feeling illustrations in terracotta (`#c96442`), black, and muted green, the visual language says "thoughtful companion" rather than "powerful tool." The serif headlines breathe at tight-but-comfortable line-heights (1.10–1.30), creating a cadence that feels more like reading an essay than scanning a product page.

What makes Claude's design truly distinctive is its warm neutral palette. Every gray has a yellow-brown undertone (`#5e5d59`, `#87867f`, `#4d4c48`) — there are no cool blue-grays anywhere. Borders are cream-tinted (`#f0eee6`, `#e8e6dc`), shadows use warm transparent blacks, and even the darkest surfaces (`#141413`, `#30302e`) carry a barely perceptible olive warmth. This chromatic consistency creates a space that feels lived-in and trustworthy.

**Key Characteristics:**
- Warm parchment canvas (`#f5f4ed`) evoking premium paper, not screens
- Custom Anthropic type family: Serif for headlines, Sans for UI, Mono for code
- Terracotta brand accent (`#c96442`) — warm, earthy, deliberately un-tech
- Exclusively warm-toned neutrals — every gray has a yellow-brown undertone
- Organic, editorial illustrations replacing typical tech iconography
- Ring-based shadow system (`0px 0px 0px 1px`) creating border-like depth without visible borders
- Magazine-like pacing with generous section spacing and serif-driven hierarchy

## 2. Color Palette & Roles

### Primary
- **Anthropic Near Black** (`#141413`): The primary text color and dark-theme surface.
- **Terracotta Brand** (`#c96442`): The core brand color — primary CTA buttons.
- **Coral Accent** (`#d97757`): A lighter, warmer variant — text accents, links on dark surfaces.

### Secondary & Accent
- **Error Crimson** (`#b53333`): Deep, warm red for error states.
- **Focus Blue** (`#3898ec`): Standard blue for input focus rings — the only cool color in the system.

### Surface & Background
- **Parchment** (`#f5f4ed`): Primary page background.
- **Ivory** (`#faf9f5`): Lightest surface — cards and elevated containers.
- **Pure White** (`#ffffff`): Reserved for specific button surfaces.
- **Warm Sand** (`#e8e6dc`): Button backgrounds.
- **Dark Surface** (`#30302e`): Dark-theme containers, nav borders.
- **Deep Dark** (`#141413`): Dark-theme page background.

### Neutrals & Text
- **Charcoal Warm** (`#4d4c48`): Button text on light warm surfaces.
- **Olive Gray** (`#5e5d59`): Secondary body text.
- **Stone Gray** (`#87867f`): Tertiary text, footnotes.
- **Dark Warm** (`#3d3d3a`): Dark text links and emphasized secondary text.
- **Warm Silver** (`#b0aea5`): Text on dark surfaces.

### Semantic & Accent
- **Border Cream** (`#f0eee6`): Standard light-theme border.
- **Border Warm** (`#e8e6dc`): Prominent borders, section dividers.
- **Border Dark** (`#30302e`): Standard border on dark surfaces.
- **Ring Warm** (`#d1cfc5`): Shadow ring color for hover/focus.
- **Ring Deep** (`#c2c0b6`): Deeper ring for active/pressed states.

### Gradient System
- Claude's design is **gradient-free** in the traditional sense. Depth comes from the interplay of warm surface tones and light/dark section alternation.

## 3. Typography Rules

### Font Family
- **Headline**: `Anthropic Serif`, fallback: `Georgia`
- **Body / UI**: `Anthropic Sans`, fallback: `Arial`
- **Code**: `Anthropic Mono`, fallback: `Arial`

### Hierarchy
| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Display / Hero | Serif | 64px | 500 | 1.10 | normal |
| Section Heading | Serif | 52px | 500 | 1.20 | normal |
| Sub-heading Large | Serif | 36px | 500 | 1.30 | normal |
| Sub-heading | Serif | 32px | 500 | 1.10 | normal |
| Sub-heading Small | Serif | 25px | 500 | 1.20 | normal |
| Feature Title | Serif | 21px | 500 | 1.20 | normal |
| Body Serif | Serif | 17px | 400 | 1.60 | normal |
| Body Large | Sans | 20px | 400 | 1.60 | normal |
| Body / Nav | Sans | 17px | 400–500 | 1.00–1.60 | normal |
| Body Standard | Sans | 16px | 400–500 | 1.25–1.60 | normal |
| Body Small | Sans | 15px | 400–500 | 1.00–1.60 | normal |
| Caption | Sans | 14px | 400 | 1.43 | normal |
| Label | Sans | 12px | 400–500 | 1.25–1.60 | 0.12px |
| Overline | Sans | 10px | 400 | 1.60 | 0.5px |
| Code | Mono | 15px | 400 | 1.60 | -0.32px |

### Principles
- Serif for authority, sans for utility.
- Single weight (500) for serifs.
- Relaxed body line-height (1.60).
- Tight-but-not-compressed headings (1.10–1.30).

## 4. Component Stylings

### Buttons
- **Brand Terracotta** (primary CTA): bg `#c96442`, text Ivory, ring shadow.
- **Warm Sand** (secondary): bg `#e8e6dc`, text `#4d4c48`, ring shadow.
- **White Surface** (light): bg white, text near-black, 12px radius.
- **Dark Charcoal** (inverted): bg `#30302e`, text Ivory.

### Cards
- Background: Ivory or White on light; Dark Surface on dark.
- Border: 1px solid Border Cream on light; 1px solid Dark Surface on dark.
- Radius: 8px standard, 16px featured, 32px hero/media.
- Shadow: whisper-soft `rgba(0,0,0,0.05) 0px 4px 24px`.

### Navigation
- Sticky top, warm background.
- Logo in Near Black; links in Near Black/Olive Gray/Dark Warm.
- Nav border: `1px solid #f0eee6` (light) or `#30302e` (dark).
- CTA: Terracotta or White Surface.

## 5. Layout Principles
- Base unit: 8px. Scale: 3, 4, 6, 8, 10, 12, 16, 20, 24, 30.
- Max container: ~1200px, centered.
- Section spacing: generous (80–120px between major sections).
- Border radius scale: 4 (sharp) / 6–8 (subtle) / 12 (generous) / 16 (very) / 24 (highly) / 32 (max).

## 6. Depth & Elevation
- **Flat (L0)**: no shadow.
- **Contained (L1)**: `1px solid` warm border.
- **Ring (L2)**: `0px 0px 0px 1px <ring-color>` — signature.
- **Whisper (L3)**: `rgba(0,0,0,0.05) 0px 4px 24px`.
- **Inset (L4)**: `inset 0px 0px 0px 1px` 15% opacity.

Light/dark alternation between Parchment and Near Black sections is the most dramatic depth move.

## 7. Do's and Don'ts

### Do
- Use Parchment (`#f5f4ed`) as the primary light background.
- Use Anthropic Serif at weight 500 for all headlines.
- Use Terracotta only for primary CTAs.
- Keep all neutrals warm-toned.
- Use ring shadows for interactive states.
- Generous body line-height (1.60).
- Alternate light/dark sections.
- Generous border-radius (12–32px).

### Don't
- Don't use cool blue-grays anywhere.
- Don't use bold (700+) on Anthropic Serif.
- Don't introduce saturated colors beyond Terracotta.
- Don't use sharp corners (<6px) on buttons or cards.
- Don't apply heavy drop shadows.
- Don't use pure white as a page background.
- Don't reduce body line-height below 1.40.
- Don't mix in sans-serif for headlines.

## 8. Responsive Behavior
| Name | Width | Key Changes |
|------|-------|-------------|
| Small Mobile | <479px | Stacked, compact typography |
| Mobile | 479–640px | Single column, hamburger nav |
| Large Mobile | 640–767px | Slightly wider content |
| Tablet | 768–991px | 2-column grids begin |
| Desktop | 992px+ | Full multi-column, max hero (64px) |

Hero text scales: 64px → 36px → 25px.

---

**Source:** [nexu-io/open-design — design-systems/claude/DESIGN.md](https://github.com/nexu-io/open-design/blob/main/design-systems/claude/DESIGN.md). Anthropic, Claude, the Anthropic Serif/Sans/Mono typefaces, and claude.ai design assets are property of Anthropic. This file describes publicly observable design tokens for derivative work.
