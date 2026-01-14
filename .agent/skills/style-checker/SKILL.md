---
name: style-checker
description: Validates and enforces the Research Agent's design system including warm tan color theme, Inter typography, and minimalist UI patterns. This skill should be used when building or reviewing UI components to ensure consistency with the established brand identity and design principles.
license: MIT
---

# Style Checker

## Overview

To maintain visual consistency across the application, use this skill to validate colors, typography, spacing, and component patterns against the established design system.

**Keywords**: style validation, design system, theme consistency, color palette, typography, UI patterns, brand identity, warm tan theme

---

## Design System

### Color Palette - Warm Tan Theme

**Backgrounds** :

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#faf8f5` | Page background |
| `--bg-secondary` | `#f5f3f0` | Cards, sidebar |
| `--bg-tertiary` | `#ebe9e6` | User messages, active states |
| `--bg-hover` | `#e6e4e1` | Hover states |
| `--bg-elevated` | `#ffffff` | Elevated cards, inputs |

**Text Colors**:

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#1a1a1a` | Headlines, body |
| `--text-secondary` | `#6b6b6b` | Secondary text |
| `--text-muted` | `#999999` | Placeholders, hints |

**Accent Colors**:

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#8b7355` | Primary accent (warm brown) |
| `--accent-soft` | `rgba(139, 115, 85, 0.1)` | Accent backgrounds |
| `--success` | `#5a9a6b` | Success states |

**Borders**:

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `#e6e4e1` | Default borders |
| `--border-hover` | `#d4cfc6` | Hover state borders |

---

### Typography

**Font Stack**:

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'SF Mono', 'Fira Code', monospace;
```

**Font Import** (required in HTML head):

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

**Typography Scale**:

- Body text: 14px, weight 400
- Labels: 13px, weight 500
- Headings: 24px+, weight 600, letter-spacing -0.02em

---

### Spacing & Radii

**Border Radii**:

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Buttons, small elements |
| `--radius-md` | `10px` | Cards, inputs |
| `--radius-lg` | `14px` | Modals, large containers |

**Shadows**:

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.08)` | Subtle elevation |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.12)` | Cards, dropdowns |

---

## Component Patterns

### Chat Input (Claude-style)

- Container: `bg-elevated`, `border: 1px solid var(--border)`, `border-radius: 20px`
- Toolbar: no top border, flex layout with plus button, mode dropdown, send button
- Send button: `bg: accent`, `border-radius: 10px`, contains ArrowUp icon

### Message Bubbles

- User messages: `bg-tertiary`, `padding: 8px 14px`, `border-radius: 14px`, inline-block
- Assistant messages: clean, no background, full width

### Sidebar

- Background: `bg-secondary`
- Separation: subtle shadow (`box-shadow: 2px 0 8px rgba(0,0,0,0.04)`), NO border-right
- Active items: `bg-tertiary` background only, NO left border

### Suggestion Chips

- Background: `bg-secondary`, border: `1px solid var(--border)`
- Padding: `8px 16px`, border-radius: `20px`
- Hover: `bg-tertiary`, `border-color: border-hover`

---

## Design Principles

1. **Refined Minimalism**: Clean layouts with purposeful whitespace
2. **Warm Aesthetics**: Cream/tan tones create approachable feel
3. **Subtle Depth**: Use shadows instead of hard borders
4. **Consistent Radii**: Match component sizes (sm/md/lg)
5. **Restrained Animation**: 0.15s transitions, no flashy effects

---

## Validation Checklist

When reviewing UI components, verify:

- [ ] Colors use CSS variables, not hardcoded values
- [ ] Inter font is loaded and applied
- [ ] Border-radius matches component size (sm/md/lg)
- [ ] No harsh borders on major containers (use shadows)
- [ ] Accent color (#8b7355) used for primary actions only
- [ ] Hover states use --bg-hover or --bg-tertiary
- [ ] Text hierarchy follows primary/secondary/muted pattern
