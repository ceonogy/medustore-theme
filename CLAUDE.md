# CLAUDE.md

Astro-based storefront for Medusa v2

## Skills

Read these before writing storefront code:

- [Building Storefronts](.agents/skills/building-storefronts/SKILL.md) — SDK, React Query, Medusa API
- [Storefront Best Practices](.agents/skills/storefront-best-practices/SKILL.md) — UI/UX, components, backend integration

## Commands

Package manager: `yarn`

```bash
yarn dev           # Dev server (port 3001)
yarn build         # Production build
yarn test          # Unit tests (Node's built-in test runner)
```

Linting: ESLint v9 flat config. Formatting: Prettier with `prettier-plugin-astro`.

## Rules

- [Architecture & Constraints](.agents/rules/architecture.md) — rendering model, routing, Tailwind v4, Node runtime
- [Astro Conventions](.agents/rules/astro-conventions.md) — island hydration strategy, state management
