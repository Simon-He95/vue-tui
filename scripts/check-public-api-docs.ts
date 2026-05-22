import { readFileSync } from "node:fs";

type ApiManifest = {
  components: Record<
    string,
    {
      maturity: "public" | "advanced" | "experimental";
      props: Array<{ name: string; description?: string }>;
      events: Array<{ name: string; payload?: string; description?: string }>;
    }
  >;
};

const manifest = JSON.parse(
  readFileSync("docs/generated/api-manifest.json", "utf8"),
) as ApiManifest;
const componentsDocs = readFileSync("docs/components.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const errors: string[] = [];
const requiredPropDescriptions: Record<string, RegExp> = {
  "TCommandPalette.closeOnSelect": /command palette/u,
  "TDataTable.selectable": /row selection/u,
};

for (const [name, component] of Object.entries(manifest.components)) {
  if (component.maturity !== "public") continue;

  if (!componentsDocs.includes(`## ${name}`)) {
    errors.push(`${name} is Public but has no docs/components.md section`);
  }

  for (const prop of component.props) {
    if (!prop.description) errors.push(`${name}.${prop.name} prop is missing description`);
    const required = requiredPropDescriptions[`${name}.${prop.name}`];
    if (required && !required.test(prop.description ?? "")) {
      errors.push(`${name}.${prop.name} prop description has the wrong semantics`);
    }
  }

  for (const event of component.events) {
    if (!event.payload) errors.push(`${name}.${event.name} event is missing payload`);
    if (!event.description) errors.push(`${name}.${event.name} event is missing description`);
  }
}

if (!readme.includes("docs/generated/api-manifest.json")) {
  errors.push("README.md must point API automation at docs/generated/api-manifest.json");
}

if (errors.length) {
  console.error("Public API docs check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
