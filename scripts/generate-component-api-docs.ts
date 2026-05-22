import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  ambiguousPublicPropNames,
  componentEventPayloads,
  componentPublicEventDescriptions,
  componentPublicPropDescriptions,
  publicEventDescriptions,
  publicEventPayloads,
  sharedPublicPropDescriptions,
} from "./api-doc-metadata.js";

const execFileAsync = promisify(execFile);

type DescriptionSource = "jsdoc" | "component-default" | "shared-default" | "missing";
type PayloadSource =
  | "emits-signature"
  | "component-default"
  | "shared-default"
  | "update-prop"
  | "missing";

type PropMeta = {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string | null;
  descriptionSource: DescriptionSource;
  deprecated: string | null;
};

type EventMeta = {
  name: string;
  payload: string | null;
  payloadSource: PayloadSource;
  description: string | null;
  descriptionSource: DescriptionSource;
};

type ApiMaturity = "public" | "advanced" | "experimental";
type EntrypointRuntime = "browser-safe" | "node-only" | "mixed";

type ComponentMeta = {
  name: string;
  sourceRelPath: string;
  maturity: ApiMaturity;
  entrypoint: string;
  props: PropMeta[];
  events: EventMeta[];
};

type ApiManifest = {
  packageVersion: string;
  entrypoints: Record<
    string,
    {
      maturity: ApiMaturity;
      runtime: EntrypointRuntime;
      valueExports: string[];
      typeExports: string[];
    }
  >;
  components: Record<
    string,
    {
      entrypoint: string;
      maturity: ApiMaturity;
      props: Array<{
        name: string;
        type: string;
        required: boolean;
        defaultValue?: string;
        description?: string;
        descriptionSource?: DescriptionSource;
        deprecated?: string;
      }>;
      events: Array<{
        name: string;
        payload?: string;
        payloadSource?: PayloadSource;
        description?: string;
        descriptionSource?: DescriptionSource;
      }>;
      slots?: Array<{ name: string; props?: string; description?: string }>;
      exposed?: Array<{ name: string; type: string; description?: string }>;
    }
  >;
};

function unwrapExpression(expr: ts.Expression): ts.Expression {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (ts.isParenthesizedExpression(expr)) {
      expr = expr.expression;
      continue;
    }
    if (ts.isAsExpression(expr)) {
      expr = expr.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(expr)) {
      expr = expr.expression;
      continue;
    }
    return expr;
  }
}

function unwrapParens(expr: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  return expr;
}

function escapeTableText(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMaybeCode(text: string | null): string {
  if (!text) return "—";
  // Markdown tables split columns by `|` even inside inline code spans.
  // Use HTML <code> + entity to keep union types/payloads (A | B) intact.
  const escaped = escapeHtml(text).replaceAll("\n", "<br>").replaceAll("|", "&#124;");
  return `<code>${escaped}</code>`;
}

function formatTextCell(text: string | null): string {
  if (!text) return "—";
  return escapeTableText(text);
}

function markdownCellWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    width +=
      cp >= 0x1100 &&
      (cp <= 0x115f ||
        cp === 0x2329 ||
        cp === 0x232a ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe10 && cp <= 0xfe19) ||
        (cp >= 0xfe30 && cp <= 0xfe6f) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6))
        ? 2
        : 1;
  }
  return width;
}

function padMarkdownCell(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - markdownCellWidth(text)))}`;
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const widths = headers.map((header, index) =>
    Math.max(
      3,
      markdownCellWidth(header),
      ...rows.map((row) => markdownCellWidth(row[index] ?? "")),
    ),
  );
  const out: string[] = [];
  out.push(
    `| ${headers.map((cell, index) => padMarkdownCell(cell, widths[index]!)).join(" | ")} |`,
  );
  out.push(`| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`);
  for (const row of rows) {
    out.push(`| ${row.map((cell, index) => padMarkdownCell(cell, widths[index]!)).join(" | ")} |`);
  }
  return out;
}

function isPropTypeRef(typeNode: ts.TypeNode): typeNode is ts.TypeReferenceNode {
  if (!ts.isTypeReferenceNode(typeNode)) return false;
  const name = typeNode.typeName;
  return ts.isIdentifier(name) && name.text === "PropType";
}

function formatPropType(expr: ts.Expression, printer: ts.Printer): string {
  expr = unwrapParens(expr);

  if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
    const assertedType = ts.isAsExpression(expr) ? expr.type : expr.type;
    if (isPropTypeRef(assertedType) && assertedType.typeArguments?.[0]) {
      return printer.printNode(
        ts.EmitHint.Unspecified,
        assertedType.typeArguments[0],
        assertedType.getSourceFile(),
      );
    }
    return formatPropType(expr.expression, printer);
  }

  if (ts.isIdentifier(expr)) {
    if (expr.text === "String") return "string";
    if (expr.text === "Number") return "number";
    if (expr.text === "Boolean") return "boolean";
    if (expr.text === "Function") return "Function";
    if (expr.text === "Array") return "unknown[]";
    if (expr.text === "Object") return "Record<string, unknown>";
    return expr.text;
  }

  if (ts.isArrayLiteralExpression(expr)) {
    const parts = expr.elements.map((el) => {
      const inner = ts.isSpreadElement(el) ? el.expression : el;
      return formatPropType(inner, printer);
    });
    return parts.join(" | ");
  }

  if (expr.kind === ts.SyntaxKind.NullKeyword) return "unknown";

  return printer.printNode(ts.EmitHint.Expression, expr, expr.getSourceFile());
}

function formatDefaultValue(expr: ts.Expression, printer: ts.Printer): string {
  expr = unwrapExpression(expr);
  if (ts.isIdentifier(expr) && expr.text === "undefined") return "undefined";
  const printed = printer.printNode(ts.EmitHint.Expression, expr, expr.getSourceFile());
  if (printed.length <= 80) return printed;
  return `${printed.slice(0, 77)}...`;
}

function getJsDocDescription(node: ts.Node): string | null {
  const jsDocs = (node as any).jsDoc as ts.JSDoc[] | undefined;
  if (!jsDocs?.length) return null;
  const doc = jsDocs[jsDocs.length - 1];
  const comment = doc.comment;
  if (!comment) return null;
  if (typeof comment === "string") return comment.trim() || null;
  // Rare case: comment is an array of JSDocComment nodes.
  const text = comment.map((c: any) => (typeof c.text === "string" ? c.text : "")).join("");
  return text.trim() || null;
}

function getJsDocTag(node: ts.Node, name: string): string | null {
  const jsDocs = (node as any).jsDoc as ts.JSDoc[] | undefined;
  if (!jsDocs?.length) return null;
  for (let i = jsDocs.length - 1; i >= 0; i--) {
    const doc = jsDocs[i]!;
    const tag = doc.tags?.find((candidate) => candidate.tagName.getText() === name);
    if (!tag) continue;
    const comment = tag.comment;
    if (typeof comment === "string") return comment.trim() || "";
    if (Array.isArray(comment)) {
      return comment
        .map((part: any) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }
    return "";
  }
  return null;
}

function getTopLevelInitializerByName(
  sourceFile: ts.SourceFile,
  name: string,
): ts.Expression | null {
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (decl.name.text !== name) continue;
      if (!decl.initializer) continue;
      return decl.initializer;
    }
  }
  return null;
}

function resolveToObjectLiteral(
  sourceFile: ts.SourceFile,
  expr: ts.Expression,
): ts.ObjectLiteralExpression | null {
  expr = unwrapExpression(expr);
  if (ts.isObjectLiteralExpression(expr)) return expr;
  if (ts.isIdentifier(expr)) {
    const init = getTopLevelInitializerByName(sourceFile, expr.text);
    if (!init) return null;
    return resolveToObjectLiteral(sourceFile, init);
  }
  return null;
}

function resolveToArrayLiteral(
  sourceFile: ts.SourceFile,
  expr: ts.Expression,
): ts.ArrayLiteralExpression | null {
  expr = unwrapExpression(expr);
  if (ts.isArrayLiteralExpression(expr)) return expr;
  if (ts.isIdentifier(expr)) {
    const init = getTopLevelInitializerByName(sourceFile, expr.text);
    if (!init) return null;
    return resolveToArrayLiteral(sourceFile, init);
  }
  return null;
}

function propertyNameText(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : null;
}

function getObjectPropertyValue(
  obj: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const text = propertyNameText(prop.name);
    if (text !== key) continue;
    return prop.initializer;
  }
  return null;
}

function stringLiteralValue(expr: ts.Expression | null): string | null {
  if (!expr) return null;
  const unwrapped = unwrapExpression(expr);
  return ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)
    ? unwrapped.text
    : null;
}

function extractProps(
  sourceFile: ts.SourceFile,
  propsExpr: ts.Expression,
  printer: ts.Printer,
): PropMeta[] {
  const propsObj = resolveToObjectLiteral(sourceFile, propsExpr);
  if (!propsObj) return [];

  const out: PropMeta[] = [];

  for (const prop of propsObj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const propNameNode = prop.name;
    const propName = ts.isIdentifier(propNameNode)
      ? propNameNode.text
      : ts.isStringLiteral(propNameNode)
        ? propNameNode.text
        : null;
    if (!propName) continue;

    const description = getJsDocDescription(prop);
    const deprecated = getJsDocTag(prop, "deprecated");
    const init = unwrapExpression(prop.initializer);
    if (ts.isObjectLiteralExpression(init)) {
      const typeExpr = getObjectPropertyValue(init, "type");
      const requiredExpr = getObjectPropertyValue(init, "required");
      const defaultExpr = getObjectPropertyValue(init, "default");

      const type = typeExpr ? formatPropType(typeExpr, printer) : "unknown";
      const required = !!(requiredExpr && requiredExpr.kind === ts.SyntaxKind.TrueKeyword);
      const defaultValue = defaultExpr ? formatDefaultValue(defaultExpr, printer) : null;

      out.push({
        name: propName,
        type,
        required,
        defaultValue,
        description,
        descriptionSource: description ? "jsdoc" : "missing",
        deprecated,
      });
      continue;
    }

    // Shorthand: foo: String / foo: Boolean / foo: Object as PropType<T>
    const type = formatPropType(init, printer);
    out.push({
      name: propName,
      type,
      required: false,
      defaultValue: null,
      description,
      descriptionSource: description ? "jsdoc" : "missing",
      deprecated,
    });
  }

  return out;
}

function formatEventPayload(init: ts.Expression, printer: ts.Printer): string | null {
  const expr = unwrapExpression(init);
  if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr)) return null;
  if (!expr.parameters.length) return null;
  if (expr.parameters.length === 1) {
    const param = expr.parameters[0]!;
    if (param.type) {
      return printer.printNode(ts.EmitHint.Unspecified, param.type, param.type.getSourceFile());
    }
    return "unknown";
  }
  return `(${expr.parameters
    .map((param) => {
      const name = param.name.getText();
      const type = param.type
        ? printer.printNode(ts.EmitHint.Unspecified, param.type, param.type.getSourceFile())
        : "unknown";
      return `${name}: ${type}`;
    })
    .join(", ")})`;
}

function extractEventDocs(
  sourceFile: ts.SourceFile,
  componentName: string,
): Map<string, Pick<EventMeta, "payload" | "payloadSource" | "description" | "descriptionSource">> {
  const out = new Map<
    string,
    Pick<EventMeta, "payload" | "payloadSource" | "description" | "descriptionSource">
  >();
  for (const docsName of [`${componentName}Events`, `${componentName}EventDocs`]) {
    const init = getTopLevelInitializerByName(sourceFile, docsName);
    if (!init) continue;
    const obj = resolveToObjectLiteral(sourceFile, init);
    if (!obj) continue;
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const eventName = propertyNameText(prop.name);
      if (!eventName) continue;
      const meta = resolveToObjectLiteral(sourceFile, prop.initializer);
      const payload = meta ? stringLiteralValue(getObjectPropertyValue(meta, "payload")) : null;
      const description =
        (meta ? stringLiteralValue(getObjectPropertyValue(meta, "description")) : null) ??
        getJsDocDescription(prop);
      out.set(eventName, {
        payload,
        payloadSource: payload ? "component-default" : "missing",
        description,
        descriptionSource: description ? "component-default" : "missing",
      });
    }
  }
  return out;
}

function extractEvents(
  sourceFile: ts.SourceFile,
  emitsExpr: ts.Expression,
  printer: ts.Printer,
  docs: Map<
    string,
    Pick<EventMeta, "payload" | "payloadSource" | "description" | "descriptionSource">
  >,
): EventMeta[] {
  const arr = resolveToArrayLiteral(sourceFile, emitsExpr);
  if (arr) {
    const names: EventMeta[] = [];
    for (const el of arr.elements) {
      const expr = ts.isExpression(el) ? unwrapExpression(el) : null;
      if (expr && ts.isStringLiteral(expr)) {
        const meta = docs.get(expr.text);
        names.push({
          name: expr.text,
          payload: meta?.payload ?? null,
          payloadSource: meta?.payloadSource ?? "missing",
          description: meta?.description ?? null,
          descriptionSource: meta?.descriptionSource ?? "missing",
        });
      }
    }
    return names;
  }

  const obj = resolveToObjectLiteral(sourceFile, emitsExpr);
  if (obj) {
    const events: EventMeta[] = [];
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const eventName = propertyNameText(prop.name);
      if (!eventName) continue;

      const init = unwrapExpression(prop.initializer);
      const meta = docs.get(eventName);
      const signaturePayload = formatEventPayload(init, printer);
      const payload = meta?.payload ?? signaturePayload;
      const jsDocDescription = getJsDocDescription(prop);
      const description = meta?.description ?? jsDocDescription;

      events.push({
        name: eventName,
        payload,
        payloadSource: meta?.payload
          ? meta.payloadSource
          : signaturePayload
            ? "emits-signature"
            : "missing",
        description,
        descriptionSource: meta?.description
          ? meta.descriptionSource
          : jsDocDescription
            ? "jsdoc"
            : "missing",
      });
    }
    return events;
  }

  // Unknown form
  return [
    {
      name: printer.printNode(ts.EmitHint.Expression, emitsExpr, emitsExpr.getSourceFile()),
      payload: null,
      payloadSource: "missing",
      description: null,
      descriptionSource: "missing",
    },
  ];
}

function extractComponentMeta(
  componentName: string,
  absPath: string,
  packageRoot: string,
  maturity: ApiMaturity,
  entrypoint: string,
): ComponentMeta {
  const text = ts.sys.readFile(absPath, "utf8") ?? "";
  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: false });

  let componentOptions: ts.ObjectLiteralExpression | null = null;

  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (decl.name.text !== componentName) continue;
      if (!decl.initializer) continue;
      const init = unwrapExpression(decl.initializer);
      if (!ts.isCallExpression(init)) continue;
      if (!ts.isIdentifier(init.expression)) continue;
      if (init.expression.text !== "defineComponent") continue;
      const firstArg = init.arguments[0];
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        componentOptions = firstArg;
      }
    }
  }

  // Fallback: first defineComponent(...) in file
  if (!componentOptions) {
    const visit = (node: ts.Node) => {
      if (componentOptions) return;
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isIdentifier(expr) && expr.text === "defineComponent") {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isObjectLiteralExpression(firstArg)) componentOptions = firstArg;
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  const rel = path.relative(packageRoot, absPath).split(path.sep).join("/");

  if (!componentOptions) {
    return { name: componentName, sourceRelPath: rel, maturity, entrypoint, props: [], events: [] };
  }

  const propsExpr = getObjectPropertyValue(componentOptions, "props");
  const emitsExpr = getObjectPropertyValue(componentOptions, "emits");

  const props = propsExpr ? extractProps(sourceFile, propsExpr, printer) : [];
  const eventDocs = extractEventDocs(sourceFile, componentName);
  const events = emitsExpr ? extractEvents(sourceFile, emitsExpr, printer, eventDocs) : [];

  return { name: componentName, sourceRelPath: rel, maturity, entrypoint, props, events };
}

function maturityLabel(maturity: ApiMaturity): string {
  if (maturity === "public") return "Public";
  if (maturity === "advanced") return "Advanced";
  return "Experimental";
}

function eventBaseName(name: string): string {
  return name.endsWith("Capture") ? name.slice(0, -"Capture".length) : name;
}

type DescriptionResult = { description: string | null; source: DescriptionSource };
type PayloadResult = { payload: string | null; source: PayloadSource };

function inferEventPayload(component: ComponentMeta, event: EventMeta): PayloadResult {
  if (event.payload) return { payload: event.payload, source: event.payloadSource };
  if (event.name.startsWith("update:")) {
    const propName = event.name.slice("update:".length);
    return {
      payload: component.props.find((prop) => prop.name === propName)?.type ?? "unknown",
      source: "update-prop",
    };
  }
  const byComponent = `${component.name}.${event.name}`;
  if (componentEventPayloads[byComponent]) {
    return { payload: componentEventPayloads[byComponent], source: "component-default" };
  }
  if (event.name === "change" || event.name === "input") {
    return {
      payload: component.props.find((prop) => prop.name === "modelValue")?.type ?? "unknown",
      source: "update-prop",
    };
  }
  return {
    payload: publicEventPayloads[eventBaseName(event.name)] ?? "void",
    source: "shared-default",
  };
}

function describeEvent(component: ComponentMeta, event: EventMeta): DescriptionResult {
  if (event.description) {
    return { description: event.description, source: event.descriptionSource };
  }
  const componentDescription = componentPublicEventDescriptions[`${component.name}.${event.name}`];
  if (componentDescription) {
    return { description: componentDescription, source: "component-default" };
  }
  const baseName = eventBaseName(event.name);
  if (event.name.endsWith("Capture")) {
    const baseDescription = publicEventDescriptions[baseName];
    return baseDescription
      ? { description: `${baseDescription} Runs during capture.`, source: "shared-default" }
      : { description: null, source: "missing" };
  }
  const description = publicEventDescriptions[baseName] ?? null;
  return { description, source: description ? "shared-default" : "missing" };
}

function describePublicProp(componentName: string, prop: PropMeta): DescriptionResult {
  if (prop.description) {
    return { description: prop.description, source: prop.descriptionSource };
  }
  const componentDescription = componentPublicPropDescriptions[componentName]?.[prop.name];
  if (componentDescription) {
    return { description: componentDescription, source: "component-default" };
  }
  if (ambiguousPublicPropNames.has(prop.name)) return { description: null, source: "missing" };
  const sharedDescription = sharedPublicPropDescriptions[prop.name] ?? null;
  return {
    description: sharedDescription,
    source: sharedDescription ? "shared-default" : "missing",
  };
}

function fillPublicDocDefaults(component: ComponentMeta): ComponentMeta {
  if (component.maturity !== "public") return component;
  return {
    ...component,
    props: component.props.map((prop) => {
      const { description, source } = describePublicProp(component.name, prop);
      return { ...prop, description, descriptionSource: source };
    }),
    events: component.events.map((event) => {
      const payload = inferEventPayload(component, event);
      const description = describeEvent(component, event);
      return {
        ...event,
        payload: payload.payload,
        payloadSource: payload.source,
        description: description.description,
        descriptionSource: description.source,
      };
    }),
  };
}

async function listExportedComponents(
  vueIndexAbsPath: string,
  maturity: ApiMaturity,
  entrypoint: string,
): Promise<
  Array<{
    name: string;
    absPath: string;
    maturity: ApiMaturity;
    entrypoint: string;
  }>
> {
  const text = await fs.readFile(vueIndexAbsPath, "utf8");
  const sourceFile = ts.createSourceFile(vueIndexAbsPath, text, ts.ScriptTarget.Latest, true);

  const out: Array<{
    name: string;
    absPath: string;
    maturity: ApiMaturity;
    entrypoint: string;
  }> = [];
  const vueDir = path.dirname(vueIndexAbsPath);

  for (const stmt of sourceFile.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    if (!stmt.moduleSpecifier) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.isTypeOnly) continue;
    if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;

    const spec = stmt.moduleSpecifier.text;
    const isComponentModule = spec.includes("/components/") || spec.includes("/router/");
    if (!isComponentModule) continue;

    for (const el of stmt.exportClause.elements) {
      const name = el.name.text;
      const isComponentName =
        (name.startsWith("T") || name === "TerminalProvider") && !name.endsWith("ContextKey");
      if (!isComponentName) continue;
      const tsPath = spec.replace(/\.js$/u, ".ts");
      const absPath = path.resolve(vueDir, tsPath);
      out.push({ name, absPath, maturity, entrypoint });
    }
  }

  // Stable ordering
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function listRootComponentExports(rootIndexAbsPath: string): Promise<Set<string>> {
  const components = await listExportedComponents(rootIndexAbsPath, "public", "@simon_he/vue-tui");
  return new Set(components.map((c) => c.name));
}

function resolveSourceSpecifier(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [base.replace(/\.js$/u, ".ts"), `${base}.ts`, path.join(base, "index.ts")];
  return candidates.find((candidate) => ts.sys.fileExists(candidate)) ?? null;
}

type SourceExports = {
  valueExports: Set<string>;
  typeExports: Set<string>;
};

function emptySourceExports(): SourceExports {
  return { valueExports: new Set(), typeExports: new Set() };
}

function mergeSourceExports(target: SourceExports, source: SourceExports): void {
  for (const name of source.valueExports) target.valueExports.add(name);
  for (const name of source.typeExports) target.typeExports.add(name);
}

async function collectSourceExports(
  absPath: string,
  seen = new Set<string>(),
): Promise<SourceExports> {
  const resolved = path.resolve(absPath);
  if (seen.has(resolved)) return emptySourceExports();
  seen.add(resolved);

  const text = await fs.readFile(resolved, "utf8");
  const sourceFile = ts.createSourceFile(resolved, text, ts.ScriptTarget.Latest, true);
  const out = emptySourceExports();

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        const declarationTypeOnly = stmt.isTypeOnly;
        for (const el of stmt.exportClause.elements) {
          if (declarationTypeOnly || el.isTypeOnly) out.typeExports.add(el.name.text);
          else out.valueExports.add(el.name.text);
        }
        continue;
      }
      if (!stmt.exportClause && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const child = resolveSourceSpecifier(resolved, stmt.moduleSpecifier.text);
        if (!child) continue;
        const childExports = await collectSourceExports(child, seen);
        if (stmt.isTypeOnly) {
          for (const name of childExports.typeExports) out.typeExports.add(name);
        } else {
          mergeSourceExports(out, childExports);
        }
      }
      continue;
    }

    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt)) {
      if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      out.typeExports.add(stmt.name.text);
      continue;
    }

    if (
      ts.isVariableStatement(stmt) ||
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt)
    ) {
      if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) out.valueExports.add(decl.name.text);
        }
      } else if (stmt.name) {
        out.valueExports.add(stmt.name.text);
      }
    }
  }

  return out;
}

function entrypointMeta(specifier: string): {
  maturity: ApiMaturity;
  runtime: EntrypointRuntime;
  sourceRelPath: string;
} {
  const sourceRelPath =
    specifier === "@simon_he/vue-tui"
      ? "src/index.ts"
      : specifier === "@simon_he/vue-tui/renderer/dom"
        ? "src/renderer-dom.ts"
        : `src/${specifier.slice("@simon_he/vue-tui/".length)}.ts`;
  const maturity: ApiMaturity =
    specifier === "@simon_he/vue-tui/vue" ||
    specifier === "@simon_he/vue-tui/runtime" ||
    specifier === "@simon_he/vue-tui/observability"
      ? "advanced"
      : specifier === "@simon_he/vue-tui/experimental" || specifier === "@simon_he/vue-tui/agent"
        ? "experimental"
        : "public";
  const runtime: EntrypointRuntime =
    specifier === "@simon_he/vue-tui/cli"
      ? "node-only"
      : specifier === "@simon_he/vue-tui/runtime"
        ? "mixed"
        : "browser-safe";
  return { maturity, runtime, sourceRelPath };
}

async function collectManifestEntrypoints(
  packageRoot: string,
): Promise<ApiManifest["entrypoints"]> {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as {
    exports: Record<string, unknown>;
  };
  const out: ApiManifest["entrypoints"] = {};
  for (const raw of Object.keys(packageJson.exports)) {
    if (raw === "./package.json") continue;
    const specifier = raw === "." ? "@simon_he/vue-tui" : `@simon_he/vue-tui/${raw.slice(2)}`;
    const meta = entrypointMeta(specifier);
    const sourceExports = await collectSourceExports(path.join(packageRoot, meta.sourceRelPath));
    out[specifier] = {
      maturity: meta.maturity,
      runtime: meta.runtime,
      valueExports: [...sourceExports.valueExports].sort(),
      typeExports: [...sourceExports.typeExports].sort(),
    };
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function renderMarkdown(components: ComponentMeta[]): string {
  const lines: string[] = [];
  lines.push("# 组件 Props / Events（自动生成）");
  lines.push("");
  lines.push("> 此文件由 `scripts/generate-component-api-docs.ts` 自动生成，请勿手改。");
  lines.push("");
  lines.push("## 目录");
  lines.push("");
  for (const c of components) {
    lines.push(`- [${c.name}](#${c.name.toLowerCase()})`);
  }
  lines.push("");

  for (const c of components) {
    lines.push(`## ${c.name}`);
    lines.push("");
    lines.push(`源码：\`${c.sourceRelPath}\``);
    lines.push("");
    lines.push(`API maturity: **${maturityLabel(c.maturity)}**`);
    lines.push("");
    lines.push(`Import: \`${c.entrypoint}\``);
    lines.push("");

    lines.push("### Props");
    lines.push("");
    if (!c.props.length) {
      lines.push("—");
      lines.push("");
    } else {
      lines.push(
        ...renderTable(
          ["名称", "类型", "默认值", "必填", "说明"],
          c.props.map((p) => [
            formatMaybeCode(p.name),
            formatMaybeCode(p.type),
            formatMaybeCode(p.defaultValue),
            p.required ? "是" : "否",
            formatTextCell(p.description),
          ]),
        ),
      );
      lines.push("");
    }

    lines.push("### Events");
    lines.push("");
    if (!c.events.length) {
      lines.push("—");
      lines.push("");
    } else {
      lines.push(
        ...renderTable(
          ["名称", "Payload", "说明"],
          c.events.map((e) => [
            formatMaybeCode(e.name),
            formatMaybeCode(e.payload),
            formatTextCell(e.description),
          ]),
        ),
      );
      lines.push("");
    }
  }

  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

function renderManifest(
  packageVersion: string,
  entrypoints: ApiManifest["entrypoints"],
  components: ComponentMeta[],
): ApiManifest {
  return {
    packageVersion,
    entrypoints,
    components: Object.fromEntries(
      components.map((component) => [
        component.name,
        {
          entrypoint: component.entrypoint,
          maturity: component.maturity,
          props: component.props.map((prop) => ({
            name: prop.name,
            type: prop.type,
            required: prop.required,
            ...(prop.defaultValue ? { defaultValue: prop.defaultValue } : {}),
            ...(prop.description ? { description: prop.description } : {}),
            ...(component.maturity === "public"
              ? { descriptionSource: prop.descriptionSource }
              : {}),
            ...(prop.deprecated ? { deprecated: prop.deprecated } : {}),
          })),
          events: component.events.map((event) => ({
            name: event.name,
            ...(event.payload ? { payload: event.payload } : {}),
            ...(component.maturity === "public" ? { payloadSource: event.payloadSource } : {}),
            ...(event.description ? { description: event.description } : {}),
            ...(component.maturity === "public"
              ? { descriptionSource: event.descriptionSource }
              : {}),
          })),
        },
      ]),
    ),
  };
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(here, "..");
  const rootIndex = path.join(packageRoot, "src/index.ts");
  const vueIndex = path.join(packageRoot, "src/vue/index.ts");
  const markdownIndex = path.join(packageRoot, "src/markdown.ts");
  const experimentalIndex = path.join(packageRoot, "src/experimental.ts");

  const rootComponentExports = await listRootComponentExports(rootIndex);
  const vueComponents = await listExportedComponents(vueIndex, "advanced", "@simon_he/vue-tui/vue");
  for (const component of vueComponents) {
    if (rootComponentExports.has(component.name)) {
      component.maturity = "public";
      component.entrypoint = "@simon_he/vue-tui";
    }
  }

  const components = [
    ...vueComponents,
    ...(await listExportedComponents(markdownIndex, "public", "@simon_he/vue-tui/markdown")),
    ...(await listExportedComponents(
      experimentalIndex,
      "experimental",
      "@simon_he/vue-tui/experimental",
    )),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const metas = components
    .map((c) => extractComponentMeta(c.name, c.absPath, packageRoot, c.maturity, c.entrypoint))
    .map(fillPublicDocDefaults);
  const packageJson = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as {
    version: string;
  };
  const entrypoints = await collectManifestEntrypoints(packageRoot);

  const outPath = path.join(packageRoot, "docs/generated/components-api.md");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, renderMarkdown(metas), "utf8");
  const manifestPath = path.join(packageRoot, "docs/generated/api-manifest.json");
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(renderManifest(packageJson.version, entrypoints, metas), null, 2)}\n`,
    "utf8",
  );
  await execFileAsync("pnpm", ["exec", "oxfmt", "--write", manifestPath], { cwd: packageRoot });
}

await main();
