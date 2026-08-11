---
name: Merlin
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
  on-surface-variant: '#4d4637'
  inverse-surface: '#2e3134'
  inverse-on-surface: '#f0f0f5'
  outline: '#7e7665'
  outline-variant: '#d0c5b2'
  surface-tint: '#755b00'
  primary: '#755b00'
  on-primary: '#ffffff'
  primary-container: '#c9a84c'
  on-primary-container: '#503d00'
  inverse-primary: '#e6c364'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e2'
  on-secondary-container: '#646464'
  tertiary: '#605e58'
  on-tertiary: '#ffffff'
  tertiary-container: '#aeaba3'
  on-tertiary-container: '#414039'
  error: '#910022'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffe08f'
  primary-fixed-dim: '#e6c364'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#584400'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c6'
  on-secondary-fixed: '#1b1b1b'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#e6e2d9'
  tertiary-fixed-dim: '#c9c6be'
  on-tertiary-fixed: '#1c1c16'
  on-tertiary-fixed-variant: '#484741'
  background: '#f8f9fe'
  on-background: '#191c1f'
  surface-variant: '#e1e2e7'
  white: '#ffffff'
  text-main: '#1e1e1e'
  text-muted: '#606060'
  success: '#1b8959'
typography:
  header:
    fontFamily: Be Vietnam Pro
    fontSize: 48px
    fontWeight: '500'
    lineHeight: 52px
  header-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 36px
  title:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 32px
  subtitle:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  caption:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  margin-mobile: 1rem
  margin-desktop: 2.5rem
  gutter: 1rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style
The design system for Hondusport Athletics is anchored in a **Corporate / Modern** aesthetic with a strong emphasis on athletic prestige and premium performance. The brand personality is authoritative yet welcoming, reflecting the energy of sports through high-contrast visuals. 

The style utilizes a sophisticated color palette of gold and deep black against a neutralized cool-gray backdrop to ensure products remain the focal point. We employ clean lines, ample white space, and precise geometry to evoke a sense of high-end retail reliability and momentum.

## Colors
The color strategy prioritizes the "Gold Standard" of athletics. 
- **Primary Gold** is reserved for branding, thin-line iconography, and secondary CTAs to maintain an air of exclusivity. 
- **Black** serves as the high-impact Action color, used for primary buttons and critical UI triggers to ensure maximum conversion contrast. 
- **Background Gray** provides a low-strain canvas that differentiates from the **White** cards, creating a layered, organized shopping experience.
- Semantic colors (Error, Success, Warning) are slightly desaturated to align with the professional tone of the store.

## Typography
We use **Be Vietnam Pro** (selected for its contemporary, approachable, and athletic feel) across all levels to maintain brand consistency. 
- **Headers** use a medium weight to feel substantial without being overwhelming.
- **Captions** are set in bold with increased letter spacing to serve as clear metadata or category labels.
- For mobile devices, large headers scale down to 32px to ensure readability and prevent excessive line-breaking in product titles.
- All currency displays (Lempiras L.) should follow the `subtitle` or `body` weight but may use the Primary Gold color for emphasis in product listings.

## Layout & Spacing
This design system utilizes a **Fixed Grid** approach for desktop (1280px max-width) to maintain a premium boutique feel, transitioning to a **Fluid Grid** for mobile devices.

- **Grid:** 12-columns on desktop, 4-columns on mobile.
- **Rhythm:** A base 8px scale drives all spacing. 
- **Reflow:** Product cards should span 6 columns on mobile (2-up display) and 3 columns on desktop (4-up display) to optimize inventory browsing.
- **Margins:** Generous outer margins (40px+) on desktop help create the "Minimalist" breathing room essential for a high-end sportswear aesthetic.

## Elevation & Depth
Hierarchy is established through **Tonal Layers** and **Ambient Shadows**. 

- **Surface Strategy:** White cards sit atop the #dbdce1 gray background. This 1st-level elevation is reinforced by a very soft, tinted shadow (`rgba(18,30,108,0.08)`) which prevents the UI from feeling flat or "Brutalist."
- **Interactive Depth:** On hover, cards should slightly increase their shadow spread (moving from shadow-4 to shadow-8) to provide tactile feedback.
- **Overlays:** Modals and dropdowns use the highest elevation (shadow-12) and may include a subtle backdrop blur to focus the user's attention on the transactional task.

## Shapes
The shape language is "Rounded," striking a balance between the aggressive geometry of performance sports and the friendliness of modern retail.

- **Primary Buttons:** Use the `pill-shaped` (32px) radius to distinguish them as the most important interactive elements.
- **Cards:** Use a 16px radius (`rounded-lg`) to soften the large surface areas of product imagery.
- **Form Inputs:** Use a 12px radius to maintain a consistent look with smaller UI components like tags and chips.

## Components
- **Buttons:** Primary buttons are solid Black with White text. Secondary buttons are White with Gold text. Tertiary buttons use a faint Gold tint background (#faf6ed).
- **Icons:** Use thin-line iconography exclusively in Gold (#c9a84c). The stroke weight should remain consistent (approx 1.5px) across all sizes.
- **Input Fields:** Use the background gray (#dbdce1) for the field fill with a 12px radius. On focus, the border transitions to Gold.
- **Product Cards:** Must include a White background and 16px corner radius. The price (Lempiras) should be positioned at the bottom right in a bold subtitle style.
- **Chips/Tags:** Used for "New Arrival" or "Sale," these should use the `radius-full` (100px) and minimal padding to look like athletic badges.
- **Checkboxes/Radios:** Use Gold for the active state and a thin black border for the inactive state.