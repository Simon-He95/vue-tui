import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

type PropMeta = {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string | null;
};

type EventMeta = {
  name: string;
  payload: string | null;
  description: string | null;
};

type ComponentMeta = {
  name: string;
  sourceRelPath: string;
  props: PropMeta[];
  events: EventMeta[];
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
  // oxfmt escapes underscores in markdown files, so match that behavior to avoid format/diff conflicts.
  const escaped = escapeHtml(text).replaceAll("\n", "<br>").replaceAll("|", "&#124;").replaceAll("_", "\\_");
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

function getObjectPropertyValue(
  obj: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | null {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name;
    const text = ts.isIdentifier(name) ? name.text : ts.isStringLiteral(name) ? name.text : null;
    if (text !== key) continue;
    return prop.initializer;
  }
  return null;
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

    const init = unwrapExpression(prop.initializer);
    if (ts.isObjectLiteralExpression(init)) {
      const typeExpr = getObjectPropertyValue(init, "type");
      const requiredExpr = getObjectPropertyValue(init, "required");
      const defaultExpr = getObjectPropertyValue(init, "default");

      const type = typeExpr ? formatPropType(typeExpr, printer) : "unknown";
      const required = !!(
        requiredExpr &&
        ts.isBooleanLiteral(requiredExpr) &&
        requiredExpr.kind === ts.SyntaxKind.TrueKeyword
      );
      const defaultValue = defaultExpr ? formatDefaultValue(defaultExpr, printer) : null;

      out.push({ name: propName, type, required, defaultValue, description });
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
    });
  }

  return out;
}

function extractEvents(
  sourceFile: ts.SourceFile,
  emitsExpr: ts.Expression,
  printer: ts.Printer,
): EventMeta[] {
  const arr = resolveToArrayLiteral(sourceFile, emitsExpr);
  if (arr) {
    const names: EventMeta[] = [];
    for (const el of arr.elements) {
      const expr = ts.isExpression(el) ? unwrapExpression(el) : null;
      if (expr && ts.isStringLiteral(expr)) {
        names.push({ name: expr.text, payload: null, description: null });
      }
    }
    return names;
  }

  const obj = resolveToObjectLiteral(sourceFile, emitsExpr);
  if (obj) {
    const events: EventMeta[] = [];
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const nameNode = prop.name;
      const eventName = ts.isIdentifier(nameNode)
        ? nameNode.text
        : ts.isStringLiteral(nameNode)
          ? nameNode.text
          : null;
      if (!eventName) continue;

      const init = unwrapExpression(prop.initializer);
      const payload =
        ts.isArrowFunction(init) || ts.isFunctionExpression(init)
          ? printer.printNode(ts.EmitHint.Expression, init, init.getSourceFile())
          : null;

      events.push({
        name: eventName,
        payload,
        description: getJsDocDescription(prop),
      });
    }
    return events;
  }

  // Unknown form
  return [
    {
      name: printer.printNode(ts.EmitHint.Expression, emitsExpr, emitsExpr.getSourceFile()),
      payload: null,
      description: null,
    },
  ];
}

function extractComponentMeta(
  componentName: string,
  absPath: string,
  packageRoot: string,
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
    return { name: componentName, sourceRelPath: rel, props: [], events: [] };
  }

  const propsExpr = getObjectPropertyValue(componentOptions, "props");
  const emitsExpr = getObjectPropertyValue(componentOptions, "emits");

  const props = propsExpr ? extractProps(sourceFile, propsExpr, printer) : [];
  const events = emitsExpr ? extractEvents(sourceFile, emitsExpr, printer) : [];

  return { name: componentName, sourceRelPath: rel, props, events };
}

async function listExportedComponents(vueIndexAbsPath: string): Promise<
  Array<{
    name: string;
    absPath: string;
  }>
> {
  const text = await fs.readFile(vueIndexAbsPath, "utf8");
  const sourceFile = ts.createSourceFile(vueIndexAbsPath, text, ts.ScriptTarget.Latest, true);

  const out: Array<{ name: string; absPath: string }> = [];
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
      const isComponentName = name.startsWith("T") || name === "TerminalProvider";
      if (!isComponentName) continue;
      const tsPath = spec.replace(/\.js$/u, ".ts");
      const absPath = path.resolve(vueDir, tsPath);
      out.push({ name, absPath });
    }
  }

  // Stable ordering
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function renderMarkdown(components: ComponentMeta[]): string {
  const lines: string[] = [];
  lines.push("# 组件 Props / Events（自动生成）");
  lines.push("");
  lines.push(
    "> 此文件由 `packages/tui/scripts/generate-component-api-docs.ts` 自动生成，请勿手改。",
  );
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
    if (c.name === "TVirtualList" || c.name === "TLogView") {
      lines.push("> Experimental import: `@simon_he/vue-tui/experimental`");
      lines.push("");
    }

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

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(here, "..");
  const vueIndex = path.join(packageRoot, "src/vue/index.ts");
  const experimentalIndex = path.join(packageRoot, "src/experimental.ts");

  const components = [
    ...(await listExportedComponents(vueIndex)),
    ...(await listExportedComponents(experimentalIndex)),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const metas = components.map((c) => extractComponentMeta(c.name, c.absPath, packageRoot));

  const outPath = path.join(packageRoot, "docs/generated/components-api.md");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, renderMarkdown(metas), "utf8");
}

await main();
