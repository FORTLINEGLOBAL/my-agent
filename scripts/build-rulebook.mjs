// Copies RULEBOOK.md into a module the chat function can import,
// so the deployed assistant always follows the current rule book.
import { readFileSync, writeFileSync } from "node:fs"

const text = readFileSync(new URL("../RULEBOOK.md", import.meta.url), "utf8")
writeFileSync(
  new URL("../netlify/functions/lib/rulebook.mjs", import.meta.url),
  `// Generated from RULEBOOK.md by scripts/build-rulebook.mjs. Do not edit by hand.\nexport default ${JSON.stringify(text)}\n`,
)
console.log("rulebook.mjs written")
