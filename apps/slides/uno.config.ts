// The ledger palette, ported from apps/web/src/app/globals.css. The utilities and
// the canvas backdrop read the same eight values.
const ledger = {
  paper: "#000",
  ink: "#ededed",
  line: "#222",
  dim: "#8a8a8a",
  ghost: "#555",
  brand: "#3569fa",
  warn: "#d6a640",
  err: "#e5484d",
};

export default {
  theme: { colors: ledger },
  preflights: [
    {
      getCSS: () =>
        `:root{${Object.entries(ledger)
          .map(([name, value]) => `--${name}:${value}`)
          .join(";")}}`,
    },
  ],
};
