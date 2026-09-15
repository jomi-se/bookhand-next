import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const mcp = JSON.parse(await read(".mcp.json"));
for (const server of ["playwright", "devpost"]) {
  if (!mcp.mcpServers?.[server]) throw new Error(`Missing ${server} MCP server`);
}

const claude = JSON.parse(await read(".claude/settings.json"));
if (claude.hooks) throw new Error("Claude hooks must remain disabled");
for (const server of ["playwright", "devpost"]) {
  if (!claude.enabledMcpjsonServers?.includes(server)) {
    throw new Error(`Claude does not enable ${server}`);
  }
}

if (!(await read("CLAUDE.md")).includes("@AGENTS.md")) {
  throw new Error("CLAUDE.md must import AGENTS.md");
}

for (const harness of [".codex", ".claude"]) {
  for (const skill of ["agent-browser", "engineering-mission-playbook", "impeccable"]) {
    const entry = await lstat(resolve(root, harness, "skills", skill));
    if (!entry.isSymbolicLink()) throw new Error(`${harness}/${skill} is not shared`);
  }
}

for (const path of [
  "docs/product-north-star.md",
  "docs/mission.md",
  "docs/scope-inventory.md",
  "docs/architecture/overview.md",
  "docs/plan/current-work.md",
]) {
  await lstat(resolve(root, path));
}

for (const path of [".mcp.json", ".codex/config.toml", "AGENTS.md", "CLAUDE.md"]) {
  if (/\/(?:home|Users)\/[^/]+\/agent-connect(?:\/|\b)/.test(await read(path))) {
    throw new Error(`${path} contains a machine-specific Agent Connect path`);
  }
}

console.log("agent setup verified");
