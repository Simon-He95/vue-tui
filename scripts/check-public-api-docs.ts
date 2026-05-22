import { readFileSync } from "node:fs";

type DescriptionSource = "jsdoc" | "component-default" | "shared-default" | "missing";
type PayloadSource =
  | "emits-signature"
  | "component-default"
  | "shared-default"
  | "update-prop"
  | "missing";

type ApiManifest = {
  components: Record<
    string,
    {
      maturity: "public" | "advanced" | "experimental";
      props: Array<{ name: string; description?: string; descriptionSource?: DescriptionSource }>;
      events: Array<{
        name: string;
        payload?: string;
        payloadSource?: PayloadSource;
        description?: string;
        descriptionSource?: DescriptionSource;
      }>;
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
const allowedSharedPropDescriptions = new Set([
  "x",
  "y",
  "w",
  "h",
  "zIndex",
  "style",
  "title",
  "titleStyle",
  "label",
  "labelStyle",
  "disabled",
  "disabledStyle",
  "activeStyle",
  "selectedStyle",
  "highlightStyle",
  "highlightMatchStyle",
  "matchStyle",
  "emptyStyle",
  "emptyText",
  "loadingText",
  "errorText",
  "placeholder",
  "placeholderWhenFocused",
  "autoFocus",
  "closeOnBlur",
  "border",
  "borderStyle",
  "padding",
  "clear",
  "wrap",
  "scrollX",
  "scrollY",
  "focusable",
  "selectionScrollBy",
  "contentStyle",
  "backdropStyle",
  "headerStyle",
  "checkedStyle",
  "hoverStyle",
  "focusStyle",
  "linkStyle",
  "suggestionStyle",
  "activeSuggestionStyle",
  "hintStyle",
  "chromeStyle",
  "inputStyle",
  "listStyle",
  "bodyStyle",
  "dividerStyle",
  "detailStyle",
  "helpStyle",
  "errorStyle",
]);
const allowedSharedPayloadEvents = new Set([
  "close",
  "focus",
  "blur",
  "click",
  "dblclick",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerenter",
  "pointerleave",
  "wheel",
  "keydown",
  "keyup",
]);

function baseEventName(name: string): string {
  return name.endsWith("Capture") ? name.slice(0, -"Capture".length) : name;
}

for (const [name, component] of Object.entries(manifest.components)) {
  if (component.maturity !== "public") continue;

  if (!componentsDocs.includes(`## ${name}`)) {
    errors.push(`${name} is Public but has no docs/components.md section`);
  }

  for (const prop of component.props) {
    if (!prop.description) errors.push(`${name}.${prop.name} prop is missing description`);
    if (!prop.descriptionSource || prop.descriptionSource === "missing") {
      errors.push(`${name}.${prop.name} prop is missing description source`);
    }
    if (
      prop.descriptionSource === "shared-default" &&
      !allowedSharedPropDescriptions.has(prop.name)
    ) {
      errors.push(
        `${name}.${prop.name} prop must use JSDoc or component-default documentation, not shared-default`,
      );
    }
    const required = requiredPropDescriptions[`${name}.${prop.name}`];
    if (required && !required.test(prop.description ?? "")) {
      errors.push(`${name}.${prop.name} prop description has the wrong semantics`);
    }
  }

  for (const event of component.events) {
    if (!event.payload) errors.push(`${name}.${event.name} event is missing payload`);
    if (!event.payloadSource || event.payloadSource === "missing") {
      errors.push(`${name}.${event.name} event is missing payload source`);
    }
    if (
      event.payloadSource === "shared-default" &&
      !allowedSharedPayloadEvents.has(baseEventName(event.name))
    ) {
      errors.push(
        `${name}.${event.name} event payload must use emits metadata or component-default documentation, not shared-default`,
      );
    }
    if (!event.description) errors.push(`${name}.${event.name} event is missing description`);
    if (!event.descriptionSource || event.descriptionSource === "missing") {
      errors.push(`${name}.${event.name} event is missing description source`);
    }
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
