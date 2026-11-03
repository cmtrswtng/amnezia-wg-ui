# Third-party UI components

The local `src/components/react-bits/SpotlightCard.jsx` and `CountUp.jsx` are
minimal adaptations of React Bits by David Haz. `AnimatedContent.jsx` implements
the same entry-animation pattern using Motion instead of GSAP. The adaptations
omit unused effects and respect reduced-motion preferences. They are part of
this admin application, not a separately distributed component library.

- [React Bits source](https://github.com/DavidHDev/react-bits)
- [Spotlight Card](https://reactbits.dev/components/spotlight-card)
- [Count Up](https://reactbits.dev/text-animations/count-up)
- [Animated Content](https://reactbits.dev/animations/animated-content)
- License: MIT + Commons Clause, Copyright (c) 2026 David Haz. The full upstream
  notice is preserved in [react-bits.LICENSE.md](react-bits.LICENSE.md).

Motion and Lucide are used through their npm packages with their included
licenses. Typography uses platform system fonts without external font requests.
