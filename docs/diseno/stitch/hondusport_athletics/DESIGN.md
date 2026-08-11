---
name: Hondusport Athletics
colors:
  surface: '#f8f9fe'
  surface-dim: '#d9dadf'
  surface-bright: '#f8f9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3f8'
  surface-container: '#edeef3'
  surface-container-high: '#e7e8ed'
  surface-container-highest: '#e1e2e7'
  on-surface: '#191c1f'
  on-surface-variant: '#4c4546'
  inverse-surface: '#2e3134'
  inverse-on-surface: '#f0f0f5'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#755b00'
  on-secondary: '#ffffff'
  secondary-container: '#fed977'
  on-secondary-container: '#785d00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1a1c1c'
  on-tertiary-container: '#838484'
  error: '#910022'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#ffe08f'
  secondary-fixed-dim: '#e6c364'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#584400'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#f8f9fe'
  on-background: '#191c1f'
  surface-variant: '#e1e2e7'
  gold-hover: '#a58a3e'
  gold-light: '#faf6ed'
  text-main: '#1e1e1e'
  text-muted: '#606060'
  success: '#1b8959'
typography:
  display-metrics:
    fontFamily: beVietnamPro
    fontSize: 64px
    fontWeight: '700'
    lineHeight: 72px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: beVietnamPro
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
  headline-lg-mobile:
    fontFamily: beVietnamPro
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: beVietnamPro
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
  subtitle:
    fontFamily: beVietnamPro
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: beVietnamPro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: beVietnamPro
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  price-lg:
    fontFamily: beVietnamPro
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-margin: 24px
  gutter: 16px
  card-padding: 24px
  input-gap: 12px
---

## Brand & Style

The design system embodies a **Modern Premium** aesthetic tailored for the Honduran sportswear market. It balances high-energy athletic performance with a clean, sophisticated retail experience. The visual narrative is driven by sharp contrasts—deep blacks against soft technical grays—punctuated by a prestigious gold accent.

The style is **Corporate / Modern** with a focus on **Tactile** softness through generous rounding. It avoids the cluttered look of traditional discount sports retailers, opting instead for a spacious, organized layout that feels as functional for a high-end e-commerce shopper as it does for a fast-paced POS operator. The emotional response should be one of confidence, reliability, and local pride.

## Colors

The palette is anchored by **Black** for high-impact Primary CTAs and structural elements. **Gold (#c9a84c)** serves as the "energetic thread," used exclusively for icons, secondary accents, and interactive feedback. 

- **Primary:** Pure Black for core actions and critical brand presence.
- **Secondary:** Gold for distinction and premium categorization.
- **Background:** A soft, technical gray (#dbdce1) replaces pure white to reduce eye strain and provide a sophisticated "canvas" for cards.
- **Surface:** Pure White is reserved for cards and containers to create a "floating" elevation effect against the gray background.

## Typography

This design system utilizes **Be Vietnam Pro** (selected as the closest available match to Poppins' geometric and friendly nature) across all interfaces. 

A specific **Display Metrics** style is defined for internal Admin/POS dashboards to highlight key sales data and inventory counts. All price points should follow the `price-lg` or `subtitle` formatting, always prefixed with "L." (Lempiras). Headers should use a tighter letter spacing to maintain a bold, athletic look, while body text remains open for legibility in management tasks.

## Layout & Spacing

The system uses a **Fluid Grid** for the public e-commerce store and a **12-column Fixed Grid** (max-width 1440px) for the Admin/ERP panels to ensure data density remains manageable.

- **Desktop:** 12 columns, 24px margins, 16px gutters.
- **Tablet:** 8 columns, 16px margins, 16px gutters.
- **Mobile:** 4 columns, 16px margins, 12px gutters.

Spacing follows an 8px base unit. For ERP views, vertical density may be increased (4px increments) to allow more list items per screen, while the public storefront uses generous whitespace to highlight product photography.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Ambient Shadows**. 

1.  **Level 0 (Floor):** Soft gray (#dbdce1) background.
2.  **Level 1 (Cards):** Pure White containers with a soft, diffused shadow (8% opacity, blue-tinted) to create separation from the floor.
3.  **Level 2 (Modals/Overlays):** Elevated surfaces with a more pronounced 20px blur shadow.

Internal POS elements should use **Low-contrast outlines** (1px solid #dbdce1) instead of heavy shadows to maintain a clean, "app-like" feel that doesn't feel cluttered when many items are on screen.

## Shapes

The shape language is purposefully **Generous and Rounded**, softening the aggressive nature of the black and gold palette.

- **Inputs & Form Fields:** 12px radius.
- **Cards & Containers:** 16px radius.
- **Buttons:** 32px (Pill-shaped) for all primary and secondary actions to emphasize their interactive nature.
- **Chips/Tags:** Full-round (100px) for status indicators and category filters.

## Components

### Buttons
- **Primary:** Black background, white text. Pill-shaped (32px).
- **Secondary:** White background, black border/text. Used for secondary actions in ERP.
- **Tertiary:** Gold-light (#faf6ed) background, Gold (#c9a84c) text. Used for "Add to Cart" or "View Details."

### Inputs
Fields should have a 12px radius with the background set to the page background color (#dbdce1) when on a card, or white when on the page floor. The active state uses a 1px Gold border.

### Cards
All product displays and data containers use a 16px radius, white background, and the `--shadow-4` or `--shadow-8` token. Padding should be a consistent 24px.

### Icons
Use **Thin Line Icons** (1px or 1.5px stroke). All icons should be rendered in **Gold (#c9a84c)** to serve as a consistent visual anchor for navigation and functionality.

### Admin/POS Lists
Table rows in the ERP should have a subtle hover state (#f3f3f3) and use `body-md` for data, with `label-caps` for table headers. Distinctive gold icons should be used for "Edit" or "Action" triggers.