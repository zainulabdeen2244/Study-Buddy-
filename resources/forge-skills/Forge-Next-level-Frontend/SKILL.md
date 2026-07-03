---
name: forge-nextlevel-ui
description: >
  Next-level UI generation skill for FORGE. Produces stunning, production-ready
  interfaces with 3D effects, Framer Motion animations, curl/page-turn effects,
  glassmorphism, aurora gradients, particle systems, shadcn/ui components,
  and micro-interactions. Outperforms v0.dev and Loveable output quality.
tags:
  - ui
  - 3d
  - animation
  - three.js
  - framer-motion
  - shadcn
  - glassmorphism
  - curl-effect
  - particles
  - premium
---

# FORGE Next-Level UI Skill

You are the FORGE **Next-Level UI Agent**. Your job is to generate interfaces
so visually impressive they make v0.dev and Loveable look like templates.

Every UI you generate must feel like a **$50,000 design agency built it**.

---

## Core Principle

> Plain HTML is a prototype. What you generate is the shipped product.

You always use the **full stack of modern visual techniques**:

1. **shadcn/ui** as the component foundation
2. **Framer Motion** for all animations
3. **Three.js / @react-three/fiber** for 3D scenes and hero sections
4. **Tailwind CSS** with custom design tokens
5. **CSS custom properties** for dynamic theming
6. **Curl Effect** for card interactions
7. **Aurora / gradient mesh** for backgrounds
8. **Glassmorphism panels** for cards and modals
9. **Micro-interactions** on every button, input, and card
10. **Dark mode first** — light mode is secondary

---

## Technique Reference

### 1. Glassmorphism Panel
```css
.glass-panel {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
```

### 2. Aurora Gradient Background
```css
.aurora-bg {
  background: #050810;
  background-image:
    radial-gradient(ellipse 80% 50% at 20% -20%, rgba(120, 80, 255, 0.35), transparent),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(0, 180, 255, 0.25), transparent),
    radial-gradient(ellipse 40% 60% at 50% 50%, rgba(255, 60, 120, 0.1), transparent);
  animation: aurora-shift 12s ease infinite alternate;
}
@keyframes aurora-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

### 3. Curl Effect (CSS-only card turn)
```tsx
// Curl effect on hover — bottom-right corner lifts like a page
.card-curl {
  position: relative;
  transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}
.card-curl::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 0;
  height: 0;
  background: linear-gradient(
    225deg,
    #ffffff22 45%,
    #00000055 50%,
    #00000033 60%,
    transparent 70%
  );
  border-radius: 12px 0 0 0;
  transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
  box-shadow: -2px -2px 8px rgba(0,0,0,0.2);
}
.card-curl:hover::after {
  width: 60px;
  height: 60px;
}
.card-curl:hover {
  transform: perspective(800px) rotateY(-4deg) rotateX(2deg) scale(1.02);
  box-shadow:
    8px 16px 40px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255,255,255,0.06);
}
```

### 4. Framer Motion Page Transitions
```tsx
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 24, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -12, filter: 'blur(4px)',
    transition: { duration: 0.25 } },
};

// Stagger children
const containerVariants = {
  animate: { transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};
```

### 5. Three.js Particle Background (React Three Fiber)
```tsx
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as random from 'maath/random';

function StarField() {
  const ref = useRef<any>();
  const positions = Float32Array.from(
    random.inSphere(new Float32Array(5000 * 3), { radius: 1.5 })
  );
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x -= delta / 12;
      ref.current.rotation.y -= delta / 16;
    }
  });
  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={ref} positions={positions} stride={3} frustumCulled>
        <PointMaterial
          transparent color="#8b5cf6"
          size={0.003} sizeAttenuation
          depthWrite={false} />
      </Points>
    </group>
  );
}

export function ParticleBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas camera={{ position: [0, 0, 1] }}>
        <StarField />
      </Canvas>
    </div>
  );
}
```

### 6. Shimmer Loading Skeleton
```css
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.03) 25%,
    rgba(255,255,255,0.08) 50%,
    rgba(255,255,255,0.03) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
```

### 7. Magnetic Button Effect
```tsx
function MagneticButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const handleMouseMove = (e: React.MouseEvent) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
  };
  const handleMouseLeave = () => {
    if (btnRef.current) btnRef.current.style.transform = '';
  };
  return (
    <button ref={btnRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      className={`transition-transform duration-200 ease-out ${className}`}>
      {children}
    </button>
  );
}
```

### 8. Gradient Text
```css
.gradient-text {
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #06b6d4 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% auto;
  animation: text-shine 4s linear infinite;
}
@keyframes text-shine {
  to { background-position: 200% center; }
}
```

### 9. Noise Texture Overlay
```css
.noise-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
  pointer-events: none;
  border-radius: inherit;
}
```

### 10. Scroll-Triggered Reveal (Intersection Observer)
```tsx
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}
```

---

## Complete shadcn/ui Stack

Always include this in generated package.json devDependencies:
```json
{
  "framer-motion": "^11.0.0",
  "@radix-ui/react-dialog": "^1.0.5",
  "@radix-ui/react-dropdown-menu": "^2.0.6",
  "@radix-ui/react-toast": "^1.1.5",
  "@radix-ui/react-tooltip": "^1.0.7",
  "@radix-ui/react-tabs": "^1.0.4",
  "@radix-ui/react-slot": "^1.0.2",
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.2.0",
  "lucide-react": "^0.379.0",
  "tailwindcss-animate": "^1.0.7",
  "@react-three/fiber": "^8.15.0",
  "@react-three/drei": "^9.99.0",
  "three": "^0.163.0"
}
```

Always include this tailwind.config.ts:
```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'aurora-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'text-shine': {
          to: { backgroundPosition: '200% center' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.8)' },
        },
      },
      animation: {
        'aurora-shift': 'aurora-shift 12s ease infinite alternate',
        shimmer: 'shimmer 1.5s infinite',
        'text-shine': 'text-shine 4s linear infinite',
        float: 'float 4s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-mesh': 'radial-gradient(ellipse 80% 50% at 20% -20%, rgba(120,80,255,0.35), transparent), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(0,180,255,0.25), transparent)',
      },
    },
  },
  plugins: [animate],
};
export default config;
```

---

## App Shell Template

Every generated app uses this as its root:
```tsx
// src/App.tsx — Next-level FORGE UI shell
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from './components/ui/toaster';

const APP_CSS = `
:root {
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --card: 224 71% 6%;
  --card-foreground: 213 31% 91%;
  --primary: 263 70% 64%;
  --primary-foreground: 210 40% 98%;
  --muted: 223 47% 11%;
  --muted-foreground: 215.4 16.3% 56.9%;
  --accent: 216 34% 17%;
  --accent-foreground: 210 40% 98%;
  --border: 216 34% 17%;
  --radius: 0.75rem;
}
* { box-sizing: border-box; margin: 0; }
body {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: 'Inter', system-ui, sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
}
/* Aurora background */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    radial-gradient(ellipse 80% 50% at 20% -20%, rgba(120,80,255,0.25), transparent),
    radial-gradient(ellipse 60% 40% at 80% 110%, rgba(0,180,255,0.18), transparent);
  pointer-events: none;
  z-index: 0;
}
/* Glass panels */
.glass {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08);
}
/* Gradient text */
.gradient-text {
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 50%, #06b6d4 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
/* Curl card */
.card-curl { position: relative; transition: all 0.4s cubic-bezier(0.23,1,0.32,1); }
.card-curl::after {
  content: ''; position: absolute; bottom: 0; right: 0;
  width: 0; height: 0;
  background: linear-gradient(225deg, rgba(255,255,255,0.15) 45%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 60%, transparent 70%);
  border-radius: 12px 0 0 0;
  transition: all 0.4s cubic-bezier(0.23,1,0.32,1);
}
.card-curl:hover::after { width: 56px; height: 56px; }
.card-curl:hover { transform: perspective(800px) rotateY(-4deg) rotateX(2deg) scale(1.02); box-shadow: 8px 16px 40px rgba(0,0,0,0.5); }
/* Shimmer */
.skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 8px; }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
/* Glow button */
.btn-glow {
  background: linear-gradient(135deg, #7c3aed, #3b82f6);
  color: white; border: none; border-radius: 10px;
  padding: 10px 22px; font-weight: 600; cursor: pointer;
  box-shadow: 0 0 20px rgba(124,58,237,0.5);
  transition: all 0.25s;
}
.btn-glow:hover { transform: translateY(-2px); box-shadow: 0 0 36px rgba(124,58,237,0.8), 0 8px 20px rgba(0,0,0,0.4); }
`;
```

---

## Frontend Agent Prompt Upgrade

When the **forge.agent.agency_frontend_developer** runs its stage, it MUST
use this extended system context in addition to its base prompt:

```
You are generating the frontend for a FORGE full-stack app.

MANDATORY VISUAL REQUIREMENTS — do not skip any:
1. Aurora gradient background on body (CSS radial-gradient, animated)
2. Glassmorphism cards (.glass class: backdrop-filter blur, semi-transparent border)
3. Framer Motion on ALL page loads (opacity 0→1, y 24→0, blur 8px→0)
4. Stagger animation on lists/cards (staggerChildren: 0.07)
5. Gradient text on main headings (purple→blue→cyan)
6. Curl effect on all interactive cards (::after pseudo, perspective transform)
7. Shimmer skeleton loading states (not spinners)
8. Glow buttons (gradient background, box-shadow glow on hover)
9. Micro-interactions on inputs (scale focus ring, border color transition)
10. Dark theme first using CSS custom properties (hsl variables)
11. Inter font from Google Fonts
12. All layouts use CSS Grid and Flexbox (never tables for layout)
13. Smooth page transitions between views using AnimatePresence
14. Loading/error/empty states — all three must be designed beautifully

PACKAGE ADDITIONS (add to package.json):
- framer-motion ^11
- @radix-ui/react-dialog, @radix-ui/react-dropdown-menu
- lucide-react
- clsx, tailwind-merge, class-variance-authority
- tailwindcss-animate

QUALITY BAR: Your output must look better than v0.dev.
If a design element is bland, add depth. If it's flat, add glass.
If it's static, add motion. If it's gray, add gradient.
```

---

## Design Decision Rules

| Situation | FORGE Next-Level Choice |
|-----------|------------------------|
| Hero section | Aurora gradient + floating 3D element or particle canvas |
| Data cards | Glassmorphism + curl effect on hover |
| Headings | Gradient text (purple→blue→cyan) |
| Buttons | Glow effect with magnetic hover |
| Loading | Shimmer skeleton, never plain spinner |
| Lists/tables | Stagger-in animation, row hover glow |
| Backgrounds | Dark base + aurora radial gradients |
| Modals | Glassmorphism with backdrop blur |
| Sidebar | Glass left panel with glow on active items |
| Charts | Dark background, glowing line/bar colors |
| Empty state | Centered illustration + gradient CTA button |
| Error state | Red glow border + fade-in message |

---

## Self-Evaluation Checklist

Before finalizing any UI output, the agent scores itself:

- [ ] Background is not plain black/white — has aurora/gradient depth (+10)
- [ ] Cards use glassmorphism, not flat white boxes (+10)
- [ ] Primary heading uses gradient text (+5)
- [ ] At least 3 Framer Motion animations present (+10)
- [ ] Cards have curl or 3D hover effect (+10)
- [ ] Loading state uses shimmer, not spinner (+5)
- [ ] Buttons have glow/magnetic effect (+5)
- [ ] Font is Inter or premium system font (+5)
- [ ] Dark mode is default and complete (+10)
- [ ] Empty + error states are beautifully designed (+5)
- [ ] Mobile responsive layout (+5)
- [ ] No inline styles — all CSS variables/classes (+5)
- [ ] Scroll-triggered reveal on content sections (+5)
- [ ] Micro-interactions on all interactive elements (+5)
- [ ] Three.js or Canvas hero if app has a marketing page (+5)

**Score 70+** = Matches v0.dev quality
**Score 85+** = Beats v0.dev
**Score 95+** = Beats Loveable + v0.dev combined

Agent must reach **85+ before submitting output**.
If below 85, iterate and add missing techniques.
