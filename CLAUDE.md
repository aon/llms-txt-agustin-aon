# llms-txt-agustin-aon

Monorepo for the llms.txt generator: pnpm + Turbo, TypeScript, Node 24, Biome.
Run `pnpm check` from the root before committing; CI runs `pnpm check:ci` and tests.

## Code conventions

- Top-down files: exported class or main function first, helpers below; in a class, public methods first, private last.
- No return types where TypeScript infers them. State them only when implementing an outside interface.
- Derive types from their source (`z.output<typeof schema>`, `typeof value`); never hand-write a type that mirrors one.
- Comments are rare, one line, and explain why, never what; delete any comment that restates the code, including section markers.
