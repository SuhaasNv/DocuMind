# Responsive & Device Optimization Summary

This document summarizes the frontend optimizations applied for iPhone, iPad, MacBook, laptops, and tablets, with Apple devices as first-class citizens.

---

## 1. Before vs After

| Area | Before | After |
|------|--------|--------|
| **Breakpoints** | Tailwind defaults only (sm/md/lg/xl/2xl) | Added `xs` (320px), `phone` (375px), `phone-lg` (430px); kept 640/768/1024/1280/1536 |
| **Sidebar (mobile)** | Always visible as narrow/collapsible aside | Below 768px: slide-in Sheet from left; hamburger in header opens it |
| **Sidebar (tablet)** | Collapsible 72/280px | Same; 768–1023px collapsible, 1024px+ persistent (always 280px) |
| **Touch targets** | Many buttons ~40px | Icon/primary actions use `min-h-touch` / `min-w-touch` (44px) on mobile |
| **Safe areas** | Not applied | `viewport-fit=cover`, `pt-safe` / `pb-safe` / `pl-safe` / `pr-safe` for notch, Dynamic Island, home indicator |
| **Typography** | Fixed sizes, Inter first | System stack first (`-apple-system`, `BlinkMacSystemFont`), `clamp()` base font, `text-mobile-safe` (≥14px on small screens) |
| **Horizontal scroll** | Possible on narrow viewports | `overflow-x: hidden` on html/body; `min-w-0` on flex children; no fixed widths that clip |
| **Animations** | 0.3–0.5s | 0.2s on mobile; `prefers-reduced-motion: reduce` disables animations |
| **Landing nav (mobile)** | Nav links hidden, no menu | Hamburger opens Sheet with nav links (touch-friendly) |

---

## 2. Device-Specific Notes

- **iPhone (SE, 13/14/15, Pro Max)**  
  - Sidebar is a left Sheet; header menu opens it.  
  - All primary actions and icon buttons meet 44px touch targets.  
  - Input area and chat input use `pb-safe` for home indicator.  
  - Font sizes use `clamp()` and `text-mobile-safe` so body text stays ≥14px.

- **iPad (Mini, 10th gen, Pro 11"/12.9")**  
  - Portrait (<768px): same as iPhone (Sheet + hamburger).  
  - Landscape (≥768px): sidebar visible as aside; 1024px+ it stays open (persistent).  
  - Split View / Stage Manager: layout uses flex + `min-w-0` and responsive padding so content doesn’t overflow.

- **MacBook / laptops**  
  - Persistent sidebar at 1024px+.  
  - Search in header at `lg` (1024px+).  
  - Hover and focus states unchanged; no hover-only critical actions on touch devices.

- **Android tablets / Chromebooks**  
  - Same breakpoints and behavior as iPad (Sheet &lt;768px, aside ≥768px, persistent ≥1024px).  
  - Safe-area utilities still help where supported.

---

## 3. What Was Removed or Simplified

- **No libraries added** – Only existing stack (Tailwind, Radix/shadcn, Framer Motion).
- **Animations** – Durations shortened to 0.2s where used on mobile; reduced-motion respected via CSS (no new JS logic).
- **Sidebar** – Logic split: `SidebarContent` reused in both the aside and the mobile Sheet; no duplicate nav markup.
- **Header** – Menu button below `md` (768px) opens the Sheet on mobile and toggles the aside on tablet; search only at `lg` (1024px+) to avoid crowding small headers.
- **Button sizes** – `default` and `sm` get `min-h-touch` on small screens only (`md:min-h-0`); `icon` gets `min-h-touch min-w-touch` with same reset at `md` so desktop stays compact.

---

## 4. Files Touched (Summary)

- **Config / global**  
  `tailwind.config.ts`, `index.html`, `src/index.css` – breakpoints, safe-area vars, typography, reduced-motion, overflow-x.
- **Hooks**  
  `src/hooks/use-mobile.tsx` – added `useIsDesktop()` (1024px).
- **Store**  
  `src/stores/useAppStore.ts` – `mobileMenuOpen` / `setMobileMenuOpen` for the app sidebar sheet.
- **Layout**  
  `src/components/app/AppLayout.tsx` – mobile Sheet with `SidebarContent`, desktop sidebar persistence.  
  `src/components/app/Sidebar.tsx` – conditional render (null on mobile), header + `SidebarContent`.  
  `src/components/app/SidebarContent.tsx` – **new** shared nav/upload/recent/logout for aside and Sheet.  
  `src/components/app/Header.tsx` – safe areas, 44px targets, menu opens Sheet on mobile.
- **Chat**  
  `src/pages/ChatPage.tsx`, `src/components/chat/ChatInput.tsx`, `src/components/chat/MessageBubble.tsx`, `src/components/chat/EmptyChat.tsx` – safe areas, touch targets, `text-mobile-safe`, no horizontal scroll.
- **Dashboard / docs**  
  `src/pages/Dashboard.tsx`, `src/components/app/DocumentCard.tsx`, `src/components/app/UploadArea.tsx` – padding, touch targets, mobile text.
- **Landing**  
  `src/components/landing/Navbar.tsx` – safe areas, mobile hamburger + Sheet for nav.  
  `src/components/landing/Hero.tsx` – responsive type, safe padding, `min-h-[100dvh]`, overflow hidden.
- **UI**  
  `src/components/ui/button.tsx` – touch size utilities for default/sm/icon.

---

## 5. QA Checklist (Covered)

- Works one-handed on iPhone (primary actions in thumb zone; sheet for nav).  
- Keyboard-only: focus rings and tab order unchanged.  
- Touch + trackpad: no hover-only actions; same layout from 768px up.  
- Rotation: breakpoints and flex layout adapt; no fixed heights that clip content.  
- Split View / Stage Manager: flex + `min-w-0` and responsive padding.  
- Browser zoom / larger font: `clamp()` and `text-mobile-safe` scale.  
- No intentional horizontal scroll; `overflow-x: hidden` and constrained widths.  
- Console: no errors on resize/rotation from these changes.
