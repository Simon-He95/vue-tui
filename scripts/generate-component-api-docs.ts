import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const execFileAsync = promisify(execFile);

type PropMeta = {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  description: string | null;
  deprecated: string | null;
  internalDocSkip: boolean;
};

type EventMeta = {
  name: string;
  payload: string | null;
  description: string | null;
  internalDocSkip: boolean;
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

const publicPropDescriptions: Record<string, string> = {
  x: "Left position in terminal cells.",
  y: "Top position in terminal cells.",
  w: "Width in terminal cells.",
  h: "Height in terminal cells.",
  zIndex: "Render and event ordering within the current plane.",
  modelValue: "Controlled component value.",
  value: "Text or scalar value rendered by the component.",
  tone: "Semantic color tone.",
  style: "Base terminal cell style override.",
  title: "Optional title text.",
  titleStyle: "Style override for title text.",
  label: "Visible label text.",
  name: "Field name used by form context.",
  labelStyle: "Style override for label text.",
  disabled: "Disables pointer and keyboard activation.",
  disabledStyle: "Style used for disabled content.",
  selectedStyle: "Style used for selected rows or nodes.",
  highlightStyle: "Style used for the highlighted row or match.",
  highlightMatchStyle: "Style used for highlighted text while the row is active.",
  matchStyle: "Style used for matched text.",
  emptyStyle: "Style used when rendering an empty state.",
  emptyText: "Text rendered when there are no rows or items.",
  clear: "Clears the component rectangle before drawing content.",
  wrap: "Wraps text to the available cell width.",
  border: "Draws a border around the component.",
  borderStyle: "Style override for border cells.",
  padding: "Inner padding in terminal cells.",
  scrollX: "Horizontal content offset in terminal cells.",
  scrollY: "Vertical content offset in terminal cells.",
  focusable: "Adds the component to keyboard focus navigation.",
  selectable: "Controls whether terminal text selection may start inside the component.",
  selectionScrollBy: "Scroll callback used while a pointer selection reaches the viewport edge.",
  autoFocus: "Requests focus when the component becomes visible.",
  cols: "Terminal column count.",
  rows: "Terminal row count or table row data, depending on component.",
  widthProvider: "Cell width provider used by the terminal buffer.",
  defaultStyle: "Default terminal cell style for descendants.",
  theme: "Theme token overrides for component defaults.",
  autoResize: "Resizes the terminal from the host element when enabled.",
  minCols: "Minimum column count used by auto resize.",
  minRows: "Minimum row count used by auto resize.",
  recordEvents: "Optional event recorder callback.",
  inputPlugins: "Input plugins provided to descendant text inputs.",
  pathPickerProvider: "Path provider injected into descendant path pickers.",
  linkOpener: "Host link opener used by components with host-owned activation.",
  debugIme: "Enables IME debugging output.",
  debugTrace: "Enables runtime trace logging.",
  domRendererOptions: "DOM renderer options used by TerminalProvider.",
  clipboard: "Clipboard implementation used for terminal selection copy.",
  selection: "Terminal cell selection configuration.",
  href: "Link target to render and activate.",
  hoverStyle: "Style applied while the pointer hovers the link.",
  focusStyle: "Style applied while the link has keyboard focus.",
  activeStyle: "Style used for the active item or enabled state.",
  visited: "Marks the link as already visited for styling.",
  openMode: "Link activation mode.",
  activationKeys: "Keyboard keys that activate the link.",
  modifierClick: "Pointer modifier required for click activation.",
  linkStyle: "Style applied to detected link segments.",
  protocols: "URL protocols accepted by linkification.",
  allowRelative: "Allows relative hrefs in detected link segments.",
  maxUrlLength: "Maximum detected URL length.",
  columns: "Table column definitions.",
  minWidth: "Minimum column width in terminal cells.",
  maxWidth: "Maximum column width in terminal cells.",
  flex: "Relative width share for auto-sized table columns.",
  contentStyle: "Style override for dialog or popover content cells.",
  rowKey: "Row key field or resolver.",
  selectedRowKey: "Controlled selected row key.",
  selectedRowKeys: "Controlled selected row keys for multi-select tables.",
  scrollTop: "Controlled top row offset.",
  header: "Shows the table header when enabled.",
  headerStyle: "Style override for table header cells.",
  headerFocusable: "Makes header cells keyboard focusable.",
  rowFocusable: "Makes body rows keyboard focusable.",
  sortable: "Enables sortable column header interactions.",
  sortBy: "Controlled sorted column key.",
  sortDirection: "Controlled sort direction.",
  manualSort: "Disables built-in sorting while keeping sort events controlled by the host.",
  sorter: "Custom row comparison function.",
  filter: "Controlled filter query.",
  filterable: "Enables built-in row filtering.",
  manualFilter: "Disables built-in filtering while keeping filter state host-owned.",
  filterPredicate: "Custom row filter predicate.",
  selectionMode: "Row selection mode.",
  selectedIndex: "Controlled active item index.",
  query: "Controlled search query.",
  items: "Items rendered by the component.",
  itemsProvider: "Async command provider called with the current query.",
  matcher: "Custom command matcher.",
  filterStrategy: "Built-in command matching strategy.",
  itemVersion: "External version key for item changes that keep array identity stable.",
  multiple: "Enables multi-select mode.",
  multipleEmit: "Payload shape used by multi-select change and confirm events.",
  closeOnBlur: "Emits close when focus leaves the component.",
  initialQuery: "Query used when the command palette opens.",
  showRowDetails: "Shows command detail text next to labels.",
  placeholder: "Placeholder text shown when the input is empty.",
  placeholderWhenFocused: "Placeholder text used while the input has focus.",
  noMatchesText: "Text rendered when filtering returns no commands.",
  loadingText: "Text rendered while async commands are loading.",
  errorText: "Text rendered when async commands fail to load.",
  debounce: "Delay before calling an async provider, in milliseconds.",
  minQueryLength: "Minimum query length before async loading runs.",
  maxVisibleItems: "Maximum number of command rows rendered at once.",
  closeOnSelect: "Closes the palette after a command is selected.",
  resetQueryOnClose: "Resets the query when the palette closes.",
  hint: "Footer hint text.",
  hintStyle: "Style override for hint text.",
  chromeStyle: "Style override for command palette chrome.",
  inputStyle: "Style override for the embedded input.",
  listStyle: "Style override for list rows.",
  bodyStyle: "Style override for dialog body cells.",
  dividerStyle: "Style override for dividers.",
  detailStyle: "Style override for detail text.",
  backdrop: "Renders a backdrop behind the dialog.",
  backdropStyle: "Style override for backdrop cells.",
  placement: "Dialog placement within the current layout.",
  offsetX: "Horizontal placement offset in cells.",
  offsetY: "Vertical placement offset in cells.",
  closeOnBackdrop: "Closes the dialog when the backdrop is clicked.",
  closeOnEsc: "Closes the dialog on Escape.",
  closeOnConfirm: "Closes the dialog after a footer button confirms.",
  teleport: "Mounts the dialog into the overlay runtime plane.",
  tabMode: "Keyboard Tab behavior inside the dialog.",
  buttons: "Dialog footer buttons.",
  checkedStyle: "Style used when the checkbox is checked.",
  options: "Options rendered by the control.",
  optionProvider: "Async option provider called with the current query.",
  valueMode: "Model value shape emitted by the select.",
  activeIndex: "Controlled active option index.",
  searchable: "Enables query updates from typed characters.",
  typeahead: "Enables keyboard typeahead navigation.",
  loading: "Shows the loading row.",
  maxVisible: "Maximum number of option rows rendered at once.",
  min: "Minimum numeric value.",
  max: "Maximum numeric value.",
  step: "Keyboard increment step.",
  help: "Help text rendered below the field.",
  helpStyle: "Style override for help text.",
  error: "Error text rendered below the field.",
  errorStyle: "Style override for error text.",
  required: "Marks the field label as required.",
  suggestions: "Autocomplete suggestions.",
  suggestionProvider: "Async suggestion provider called with the current input value.",
  open: "Controlled suggestion popup visibility.",
  highlightedIndex: "Controlled highlighted suggestion index.",
  minChars: "Minimum input length before suggestions are shown or loaded.",
  filterLocal: "Filters provided suggestions against the input value.",
  closeOnSelect: "Closes suggestions after a suggestion is selected.",
  suggestionStyle: "Style override for suggestion rows.",
  activeSuggestionStyle: "Style override for the active suggestion row.",
  nodes: "Tree nodes.",
  expandedIds: "Controlled expanded tree node ids.",
  selectedId: "Controlled selected tree node id.",
  indent: "Indent width per tree depth.",
  selectableParents: "Allows expandable parent tree nodes to be selected from their label.",
  cursorToEndOnExternalUpdate: "Moves the cursor to the end after external model updates.",
  cursorToEndOnFirstFocus: "Moves the cursor to the end on first focus.",
  cursorBlink: "Enables cursor blink rendering.",
  cursorShape: "Cursor glyph shape.",
  blinkInterval: "Cursor blink interval in milliseconds.",
  promptSuggestions: "Prompt popup suggestions.",
  promptTrigger: "Prompt popup trigger character.",
  promptTriggers: "Prompt popup trigger characters.",
  promptMaxItems: "Maximum prompt popup rows.",
  promptAlign: "Prompt popup alignment.",
  promptSelectedStyle: "Style override for the active prompt suggestion.",
  promptPopupStyle: "Style override for the prompt popup body.",
  promptPopupBorderStyle: "Style override for the prompt popup border.",
  promptPopupMatchStyle: "Style override for prompt match highlights.",
  skillTrigger: "Trigger used for skill suggestions.",
  skillSuggestions: "Skill suggestions shown in the prompt popup.",
  skillHighlightStyle: "Style override for highlighted skill chips.",
  mentionTrigger: "Trigger used for path or mention suggestions.",
  mentionWorkspace: "Workspace root used by mention providers.",
  mentionMode: "Mention provider mode.",
  mentionShowHidden: "Includes hidden paths in mention suggestions.",
  mentionSuggestions: "Mention suggestions supplied by the host.",
  mentionMaxItems: "Maximum mention rows.",
  mentionChipStyle: "Style override for mention chips.",
  multilineChipStyle: "Style override for multiline chips.",
  dedupeMentions: "Removes duplicate mention entries.",
  collectMentions: "Collects mention values from committed input.",
  mentions: "Controlled collected mention values.",
  collapseMultiline: "Collapses multiline pasted text into chips.",
  multilineTexts: "Controlled multiline chip text values.",
  secret: "Masks input text when enabled.",
  maskChar: "Character used to mask secret input.",
  submitOnEnter: "Emits change on Enter.",
  clearOnEscape: "Clears the input on Escape.",
  plugins: "Input plugins attached to this input.",
  pasteImageHandler: "Host handler for pasted images.",
  filePasteHandler: "Host handler for pasted files.",
};

const publicEventDescriptions: Record<string, string> = {
  "update:modelValue": "Emitted when the controlled model value changes.",
  "update:selectedIndex": "Emitted when the controlled active index changes.",
  "update:highlightedIndex": "Emitted when the active autocomplete suggestion changes.",
  "update:open": "Emitted when popup visibility changes.",
  "update:query": "Emitted when the controlled query changes.",
  "update:activeIndex": "Emitted when the active option index changes.",
  "update:selectedRowKey": "Emitted when the selected row key changes.",
  "update:selectedRowKeys": "Emitted when selected row keys change.",
  "update:scrollTop": "Emitted when the top visible row offset should change.",
  "update:sortBy": "Emitted when the sorted column key changes.",
  "update:sortDirection": "Emitted when the sort direction changes.",
  "update:expandedIds": "Emitted when expanded tree node ids change.",
  "update:selectedId": "Emitted when the selected tree node id changes.",
  "update:mentions": "Emitted when collected mentions change.",
  "update:multilineTexts": "Emitted when multiline chip text values change.",
  input: "Emitted for input edits.",
  change: "Emitted when the component commits a value change.",
  select: "Emitted when the active item is selected.",
  close: "Emitted when the component requests to close.",
  focus: "Emitted when the component receives focus.",
  blur: "Emitted when the component loses focus.",
  keydown: "Emitted for keydown events.",
  keyup: "Emitted for keyup events.",
  click: "Emitted for click events.",
  dblclick: "Emitted for double-click events.",
  pointerdown: "Emitted for pointer down events.",
  pointerup: "Emitted for pointer up events.",
  pointermove: "Emitted for pointer move events.",
  pointerenter: "Emitted when the pointer enters the component.",
  pointerleave: "Emitted when the pointer leaves the component.",
  wheel: "Emitted for wheel events.",
  confirm: "Emitted when a focused action is confirmed.",
  activate: "Emitted when the link is activated.",
  open: "Emitted when the host opener accepts a link open request.",
  invalidHref: "Emitted when a link href is rejected by the sanitizer.",
  scroll: "Emitted when the visible scroll offset changes.",
  sortChange: "Emitted when table sort state changes.",
  rowSelect: "Emitted when a data table row is selected.",
  rowClick: "Emitted when a table row is clicked or confirmed.",
  rowKeydown: "Emitted when a focused table row receives a keydown event.",
  headerClick: "Emitted when a table header is clicked or confirmed.",
  toggle: "Emitted when a tree node expands or collapses.",
  selectionCopy: "Emitted after terminal selection copy.",
  mentionClick: "Emitted when a rendered mention chip is clicked.",
  multilineClick: "Emitted when a multiline chip is clicked.",
  validationError: "Emitted when input validation rejects a host action.",
};

const publicEventPayloads: Record<string, string> = {
  focus: "void",
  blur: "void",
  close: "void",
  pointerenter: "TerminalPointerEvent",
  pointerleave: "TerminalPointerEvent",
  pointerdown: "TerminalPointerEvent",
  pointerup: "TerminalPointerEvent",
  pointermove: "TerminalPointerEvent",
  click: "TerminalPointerEvent",
  dblclick: "TerminalPointerEvent",
  wheel: "TerminalPointerEvent",
  keydown: "TerminalKeyboardEvent",
  keyup: "TerminalKeyboardEvent",
};

type ApiManifest = {
  packageVersion: string;
  entrypoints: Record<
    string,
    {
      maturity: ApiMaturity;
      runtime: EntrypointRuntime;
      exports: string[];
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
        deprecated?: string;
      }>;
      events: Array<{
        name: string;
        payload?: string;
        description?: string;
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
  const escaped = escapeHtml(text)
    .replaceAll("\n", "<br>")
    .replaceAll("|", "&#124;")
    .replaceAll("(_", "(\\_");
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
    const internalDocSkip = getJsDocTag(prop, "internalDocSkip") !== null;

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
        deprecated,
        internalDocSkip,
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
      deprecated,
      internalDocSkip,
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
): Map<string, Pick<EventMeta, "payload" | "description" | "internalDocSkip">> {
  const out = new Map<string, Pick<EventMeta, "payload" | "description" | "internalDocSkip">>();
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
      out.set(eventName, {
        payload: meta ? stringLiteralValue(getObjectPropertyValue(meta, "payload")) : null,
        description:
          (meta ? stringLiteralValue(getObjectPropertyValue(meta, "description")) : null) ??
          getJsDocDescription(prop),
        internalDocSkip: getJsDocTag(prop, "internalDocSkip") !== null,
      });
    }
  }
  return out;
}

function extractEvents(
  sourceFile: ts.SourceFile,
  emitsExpr: ts.Expression,
  printer: ts.Printer,
  docs: Map<string, Pick<EventMeta, "payload" | "description" | "internalDocSkip">>,
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
          description: meta?.description ?? null,
          internalDocSkip: meta?.internalDocSkip ?? false,
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
      const payload = meta?.payload ?? formatEventPayload(init, printer);

      events.push({
        name: eventName,
        payload,
        description: meta?.description ?? getJsDocDescription(prop),
        internalDocSkip: meta?.internalDocSkip ?? getJsDocTag(prop, "internalDocSkip") !== null,
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
      internalDocSkip: false,
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
  return name.replace(/Capture$/u, "").replace(/^update:/u, "update:");
}

function inferEventPayload(component: ComponentMeta, event: EventMeta): string | null {
  if (event.payload) return event.payload;
  if (event.name.startsWith("update:")) {
    const propName = event.name.slice("update:".length);
    return component.props.find((prop) => prop.name === propName)?.type ?? "unknown";
  }
  const byComponent = `${component.name}.${event.name}`;
  const componentPayloads: Record<string, string> = {
    "TAutocompleteInput.select": "TAutocompleteSelectPayload",
    "TCommandPalette.select": "TCommandPaletteSelectPayload",
    "TDataTable.rowSelect": "TDataTableRowSelectPayload",
    "TDataTable.sortChange": "TDataTableSortChangePayload",
    "TTable.rowKeydown": "TTableRowKeydownPayload",
    "TDialog.confirm": "DialogButton & { index: number }",
    "TInput.change": "string",
    "TInput.input": "string",
    "TInput.mentionClick": "(absPath: string, event: TerminalPointerEvent)",
    "TInput.multilineClick": "number",
    "TInput.validationError": "{ reason: string }",
    "TList.change": "{ index: number; value: string }",
    "TList.scroll": "number",
    "TPasswordInput.change": "string",
    "TPasswordInput.input": "string",
    "TSelect.change": "string | string[] | number[] | TSelectMultipleChangePayload | null",
    "TSelect.confirm": "string[] | number[] | TSelectMultipleChangePayload",
    "TTable.headerClick": "TTableHeaderClickPayload",
    "TTable.rowClick": "TTableRowClickPayload",
    "TTree.select": "TTreeSelectPayload",
    "TTree.toggle": "TTreeTogglePayload",
    "TerminalProvider.selectionCopy": "TerminalSelectionCopyPayload",
  };
  if (componentPayloads[byComponent]) return componentPayloads[byComponent];
  if (event.name === "change" || event.name === "input") {
    return component.props.find((prop) => prop.name === "modelValue")?.type ?? "unknown";
  }
  return publicEventPayloads[eventBaseName(event.name)] ?? "void";
}

function describeEvent(event: EventMeta): string | null {
  if (event.description) return event.description;
  const baseName = eventBaseName(event.name);
  if (baseName.endsWith("Capture")) return null;
  if (event.name.endsWith("Capture")) {
    const baseDescription = publicEventDescriptions[baseName];
    return baseDescription ? `${baseDescription} Runs during capture.` : null;
  }
  return publicEventDescriptions[baseName] ?? null;
}

function fillPublicDocDefaults(component: ComponentMeta): ComponentMeta {
  if (component.maturity !== "public") return component;
  return {
    ...component,
    props: component.props.map((prop) => ({
      ...prop,
      description: prop.description ?? publicPropDescriptions[prop.name] ?? null,
    })),
    events: component.events.map((event) => ({
      ...event,
      payload: inferEventPayload(component, event),
      description: describeEvent(event),
    })),
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
      const isComponentName = name.startsWith("T") || name === "TerminalProvider";
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

async function collectSourceValueExports(
  absPath: string,
  seen = new Set<string>(),
): Promise<Set<string>> {
  const resolved = path.resolve(absPath);
  if (seen.has(resolved)) return new Set();
  seen.add(resolved);

  const text = await fs.readFile(resolved, "utf8");
  const sourceFile = ts.createSourceFile(resolved, text, ts.ScriptTarget.Latest, true);
  const out = new Set<string>();

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        const declarationTypeOnly = stmt.isTypeOnly;
        for (const el of stmt.exportClause.elements) {
          if (declarationTypeOnly || el.isTypeOnly) continue;
          out.add(el.name.text);
        }
        continue;
      }
      if (!stmt.exportClause && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const child = resolveSourceSpecifier(resolved, stmt.moduleSpecifier.text);
        if (!child) continue;
        for (const name of await collectSourceValueExports(child, seen)) out.add(name);
      }
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
          if (ts.isIdentifier(decl.name)) out.add(decl.name.text);
        }
      } else if (stmt.name) {
        out.add(stmt.name.text);
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
    out[specifier] = {
      maturity: meta.maturity,
      runtime: meta.runtime,
      exports: [
        ...(await collectSourceValueExports(path.join(packageRoot, meta.sourceRelPath))),
      ].sort(),
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
            ...(prop.deprecated ? { deprecated: prop.deprecated } : {}),
          })),
          events: component.events.map((event) => ({
            name: event.name,
            ...(event.payload ? { payload: event.payload } : {}),
            ...(event.description ? { description: event.description } : {}),
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
