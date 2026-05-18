import { isAbsolutePath, normalizePath, resolvePath, resolveUserPath, suggestPaths } from "./path-suggest-D3HXe7-5.js";
import process from "node:process";
import { TBox, TDialog, TInput, TPathPicker, TRouterView, TSelect, TText, TView, charCellWidth, createTerminalRouter, normalizeNewlines, padEndByCells, parseAnsiSgr, resolveUserPath as resolveUserPath$1, sliceByCells, spaces, textCellWidth, useLayout, useRoute, useRouter, useTerminal, wrapByCells } from "@simon_he/vue-tui";
import { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, provide, reactive, ref, shallowReactive, vShow, watch, watchEffect } from "vue";
import { createCachedTokenCounter } from "goatchain";

//#region ../../src/vue/utils/wheel-scroll.ts
const LINE_UNIT_THRESHOLD = 3;
const PIXELS_PER_LINE = .75;
const ACCEL_WINDOW_MS = 120;
const MAX_ACCEL = 26;
const EDGE_BOUNCE_MS = 120;
const MIN_TICK_INTERVAL_MS = 6;
function clamp$10(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function isLineUnitDelta(deltaY, mode = "auto") {
	if (mode === "line") return true;
	if (mode === "pixel") return false;
	const abs = Math.abs(deltaY);
	return abs > 0 && abs <= LINE_UNIT_THRESHOLD && Number.isInteger(deltaY);
}
function normalizeDelta(deltaY, mode = "auto") {
	if (mode === "line") return deltaY;
	if (mode === "pixel") return deltaY / PIXELS_PER_LINE;
	const abs = Math.abs(deltaY);
	if (abs <= LINE_UNIT_THRESHOLD && Number.isInteger(deltaY)) return deltaY;
	return deltaY / PIXELS_PER_LINE;
}
function accelFactor(now, lastAt) {
	const dt = now - lastAt;
	if (!Number.isFinite(dt) || dt <= 0 || dt > ACCEL_WINDOW_MS) return 1;
	const t = 1 - dt / ACCEL_WINDOW_MS;
	return 1 + t * (MAX_ACCEL - 1);
}
function createWheelScrollState() {
	return {
		accumulator: 0,
		lastAt: 0,
		lastEdgeDir: 0,
		lastEdgeAt: 0
	};
}
function applyWheelScroll(state, deltaY, scrollTop, maxTop, now = Date.now(), deltaMode = "auto") {
	if (!Number.isFinite(deltaY) || deltaY === 0 || maxTop <= 0) {
		if (maxTop <= 0) {
			state.accumulator = 0;
			state.lastEdgeDir = 0;
			state.lastEdgeAt = 0;
		}
		return {
			nextTop: scrollTop,
			dir: 0,
			lines: 0
		};
	}
	const dt = state.lastAt ? now - state.lastAt : Infinity;
	const lineUnits = isLineUnitDelta(deltaY, deltaMode);
	if (lineUnits && dt !== Infinity && dt >= 0 && dt < MIN_TICK_INTERVAL_MS) return {
		nextTop: scrollTop,
		dir: 0,
		lines: 0
	};
	const accel = lineUnits ? 1 : state.lastAt ? accelFactor(now, state.lastAt) : 1;
	state.lastAt = now;
	state.accumulator += normalizeDelta(deltaY, deltaMode) * accel;
	const lines = Math.trunc(state.accumulator);
	if (lines === 0) return {
		nextTop: scrollTop,
		dir: 0,
		lines: 0
	};
	state.accumulator -= lines;
	const dir = lines > 0 ? 1 : -1;
	const atTop = scrollTop <= 0;
	const atBottom = scrollTop >= maxTop;
	if (dir < 0 && atTop || dir > 0 && atBottom) {
		state.lastEdgeDir = dir;
		state.lastEdgeAt = now;
		state.accumulator = 0;
		return {
			nextTop: scrollTop,
			dir: 0,
			lines: 0
		};
	}
	if (state.lastEdgeDir !== 0 && now - state.lastEdgeAt < EDGE_BOUNCE_MS && dir === -state.lastEdgeDir && (atTop || atBottom)) return {
		nextTop: scrollTop,
		dir: 0,
		lines: 0
	};
	const unclamped = scrollTop + lines;
	const nextTop = clamp$10(unclamped, 0, maxTop);
	if (nextTop === scrollTop) {
		state.accumulator = 0;
		return {
			nextTop: scrollTop,
			dir: 0,
			lines: 0
		};
	}
	if (nextTop !== unclamped) state.accumulator = 0;
	state.lastEdgeDir = 0;
	return {
		nextTop,
		dir: nextTop > scrollTop ? 1 : -1,
		lines: nextTop - scrollTop
	};
}

//#endregion
//#region src/core/model.ts
const MessageRoles = [
	"user",
	"assistant",
	"tool"
];
const AssistantContentPartTypes = [
	"status",
	"markdown",
	"tool_call",
	"tool_result",
	"approve",
	"todo",
	"plan"
];

//#endregion
//#region src/core/message-types.ts
const GoatChainMessageTypes = [...MessageRoles, ...AssistantContentPartTypes];

//#endregion
//#region src/core/theme.ts
const AnsiColorNames = [
	"black",
	"red",
	"green",
	"yellow",
	"blue",
	"magenta",
	"cyan",
	"white",
	"blackBright",
	"redBright",
	"greenBright",
	"yellowBright",
	"blueBright",
	"magentaBright",
	"cyanBright",
	"whiteBright"
];
function makeBase(fg, bg) {
	const out = {};
	for (const t of GoatChainMessageTypes) out[t] = {
		fg,
		bg
	};
	return out;
}
const ThemePresets = Object.freeze({
	goatchain: {
		...makeBase("white", "black"),
		user: {
			fg: "whiteBright",
			bg: "blackBright"
		},
		assistant: {
			fg: "white",
			bg: "black"
		},
		tool: {
			fg: "white",
			bg: "black"
		},
		markdown: {
			fg: "white",
			bg: "black"
		},
		status: {
			fg: "white",
			bg: "black"
		},
		tool_call: {
			fg: "white",
			bg: "black"
		},
		tool_result: {
			fg: "white",
			bg: "black"
		},
		approve: {
			fg: "white",
			bg: "black"
		},
		todo: {
			fg: "whiteBright",
			bg: "black"
		},
		plan: {
			fg: "whiteBright",
			bg: "black"
		}
	},
	mono: {
		...makeBase("white", "black"),
		user: {
			fg: "white",
			bg: "black"
		},
		assistant: {
			fg: "white",
			bg: "black"
		},
		tool: {
			fg: "white",
			bg: "black"
		}
	},
	contrast: {
		...makeBase("whiteBright", "black"),
		user: {
			fg: "whiteBright",
			bg: "blackBright"
		},
		assistant: {
			fg: "whiteBright",
			bg: "black"
		},
		tool: {
			fg: "whiteBright",
			bg: "black"
		},
		tool_call: {
			fg: "yellowBright",
			bg: "black"
		},
		tool_result: {
			fg: "cyanBright",
			bg: "black"
		},
		todo: {
			fg: "greenBright",
			bg: "black"
		},
		plan: {
			fg: "magentaBright",
			bg: "black"
		}
	}
});
function resolveMessageTypeColors(theme, type) {
	const preset = ThemePresets[theme.preset] ?? ThemePresets.goatchain;
	const base = preset[type] ?? preset.assistant ?? {
		fg: "white",
		bg: "black"
	};
	const override = theme.overrides?.[type] ?? {};
	return {
		...base,
		...override
	};
}

//#endregion
//#region src/keys.ts
const GoatChainBridgeKey = Symbol("GoatChainBridge");

//#endregion
//#region src/core/markdown.ts
function stripAnsi(s) {
	const ESC = "\x1B";
	let out = "";
	for (let i = 0; i < s.length; i++) {
		if (s[i] !== ESC || s[i + 1] !== "[") {
			out += s[i];
			continue;
		}
		let j = i + 2;
		while (j < s.length) {
			const c = s.charCodeAt(j);
			if (c >= 48 && c <= 57 || c === 59) {
				j++;
				continue;
			}
			break;
		}
		if (j < s.length && s[j] === "m") {
			i = j;
			continue;
		}
		out += s[i];
	}
	return out;
}
function sanitize(s) {
	s = stripAnsi(s);
	let out = "";
	for (const ch of s) {
		const cp = ch.codePointAt(0);
		if (cp <= 31 && cp !== 10 && cp !== 9 || cp === 127) continue;
		out += ch;
	}
	return out;
}
function textCellWidth$3(text) {
	let cells = 0;
	for (const ch of text) cells += charCellWidth(ch);
	return cells;
}
function takeByCells(text, maxCells) {
	maxCells = Math.max(0, Math.floor(maxCells));
	if (maxCells <= 0) return {
		chunk: "",
		rest: text
	};
	let cells = 0;
	let i = 0;
	for (; i < text.length;) {
		const cp = text.codePointAt(i) ?? 0;
		const seg = String.fromCodePoint(cp);
		const w = charCellWidth(seg);
		if (cells + w > maxCells) break;
		cells += w;
		i += seg.length;
		if (cells >= maxCells) break;
	}
	return {
		chunk: text.slice(0, i),
		rest: text.slice(i)
	};
}
function sliceByCells$2(text, maxCells) {
	return takeByCells(text, maxCells).chunk;
}
function padEndByCells$3(text, width) {
	width = Math.max(0, Math.floor(width));
	const cells = textCellWidth$3(text);
	if (cells >= width) return sliceByCells$2(text, width);
	return `${text}${" ".repeat(width - cells)}`;
}
function wrapLineByCells(text, width) {
	width = Math.max(1, Math.floor(width));
	if (!text) return [""];
	const out = [];
	let remaining = text;
	while (true) {
		const { chunk, rest } = takeByCells(remaining, width);
		out.push(chunk);
		if (!rest) break;
		remaining = rest;
	}
	return out;
}
function parseInline(text) {
	const out = [];
	let buf = "";
	let i = 0;
	function flushText() {
		if (!buf) return;
		out.push({
			kind: "text",
			text: buf
		});
		buf = "";
	}
	while (i < text.length) {
		const ch = text[i];
		if (ch === "`") {
			const end = text.indexOf("`", i + 1);
			if (end > i + 1) {
				flushText();
				out.push({
					kind: "code",
					text: text.slice(i + 1, end)
				});
				i = end + 1;
				continue;
			}
		}
		if (ch === "*" && text[i + 1] === "*") {
			const end = text.indexOf("**", i + 2);
			if (end > i + 2) {
				flushText();
				out.push({
					kind: "bold",
					text: text.slice(i + 2, end)
				});
				i = end + 2;
				continue;
			}
		}
		buf += ch;
		i++;
	}
	flushText();
	return out;
}
function wrapSpans(spans, width) {
	if (width <= 0) return [[{
		kind: "text",
		text: ""
	}]];
	function tokenizeSpan(span) {
		const out$1 = [];
		const re = /\s+/g;
		let last = 0;
		for (let m = re.exec(span.text); m; m = re.exec(span.text)) {
			if (m.index > last) out$1.push({
				kind: span.kind,
				text: span.text.slice(last, m.index)
			});
			out$1.push({
				kind: span.kind,
				text: m[0]
			});
			last = m.index + m[0].length;
		}
		if (last < span.text.length) out$1.push({
			kind: span.kind,
			text: span.text.slice(last)
		});
		return out$1;
	}
	const out = [];
	let line = [];
	let col = 0;
	function spanCells(span) {
		if (!span.text) return 0;
		if (/^\s+$/.test(span.text)) return span.text.length;
		return textCellWidth$3(span.text);
	}
	function pushSpan(span) {
		const prev = line[line.length - 1];
		if (prev && prev.kind === span.kind) {
			prev.text += span.text;
			return;
		}
		line.push({ ...span });
	}
	function pushLine() {
		out.push(line);
		line = [];
		col = 0;
	}
	for (const span of spans) for (const token of tokenizeSpan(span)) {
		if (!token.text) continue;
		if (/^\s+$/.test(token.text) && col === 0) continue;
		const tokenW = spanCells(token);
		if (tokenW <= width - col) {
			pushSpan(token);
			col += tokenW;
			continue;
		}
		if (!/^\s+$/.test(token.text) && col > 0 && tokenW <= width) {
			pushLine();
			pushSpan(token);
			col += tokenW;
			continue;
		}
		let remaining = token.text;
		while (remaining) {
			const available = width - col;
			if (available <= 0) {
				pushLine();
				continue;
			}
			if (/^\s+$/.test(remaining)) {
				pushLine();
				remaining = "";
				continue;
			}
			const taken = takeByCells(remaining, available);
			const chunk = taken.chunk;
			remaining = taken.rest;
			pushSpan({
				kind: token.kind,
				text: chunk
			});
			col += textCellWidth$3(chunk);
			if (col >= width) pushLine();
		}
	}
	if (line.length === 0) return out.length ? out : [[{
		kind: "text",
		text: ""
	}]];
	out.push(line);
	return out;
}
function markdownToLines(markdown, width) {
	const lines = sanitize(markdown).split("\n");
	const out = [];
	let inCode = false;
	let codeLang = "";
	let codeLineNo = 0;
	let codeLineNoWidth = 2;
	function clampWidth(n) {
		return Math.max(0, Math.floor(n));
	}
	function padLine(text, w) {
		if (w <= 0) return "";
		return padEndByCells$3(text, w);
	}
	function codeTop(label, w) {
		w = clampWidth(w);
		if (w <= 0) return "";
		if (w === 1) return "┌";
		const innerW = Math.max(0, w - 2);
		const txt = (label || "code").trim();
		const labelTxt = ` ${txt} `;
		if (innerW === 0) return "┌┐";
		const clipped = sliceByCells$2(labelTxt, innerW);
		const pad = "─".repeat(Math.max(0, innerW - textCellWidth$3(clipped)));
		return `┌${clipped}${pad}┐`.slice(0, w);
	}
	function codeBottom(w) {
		w = clampWidth(w);
		if (w <= 0) return "";
		if (w === 1) return "└";
		return `└${"─".repeat(Math.max(0, w - 2))}┘`.slice(0, w);
	}
	function codeContentLine(content, lineNo, w) {
		w = clampWidth(w);
		if (w <= 0) return "";
		if (w < 4) return sliceByCells$2(content, w);
		const innerW = Math.max(0, w - 2);
		const noPrefix = innerW < 6;
		const prefix = noPrefix ? "" : `${lineNo} │ `;
		const inside = padLine(`${prefix}${content}`, innerW);
		return `│${inside}│`.slice(0, w);
	}
	for (const raw of lines) {
		const line = raw.replace(/\r/g, "");
		if (line.startsWith("```")) {
			if (!inCode) {
				inCode = true;
				codeLang = line.slice(3).trim();
				codeLineNo = 0;
				codeLineNoWidth = 2;
				out.push({
					kind: "code",
					spans: [{
						kind: "text",
						text: codeTop(codeLang || "code", width)
					}]
				});
			} else {
				inCode = false;
				out.push({
					kind: "code",
					spans: [{
						kind: "text",
						text: codeBottom(width)
					}]
				});
			}
			continue;
		}
		if (inCode) {
			codeLineNo += 1;
			const n = String(codeLineNo).padStart(codeLineNoWidth, " ");
			const innerW = Math.max(0, clampWidth(width) - 2);
			const prefixLen = innerW < 6 ? 0 : codeLineNoWidth + 3;
			const contentW = Math.max(1, innerW - prefixLen);
			const segs = wrapLineByCells(line, contentW);
			for (const [i, seg] of segs.entries()) {
				const ln = i === 0 ? n : " ".repeat(codeLineNoWidth);
				out.push({
					kind: "code",
					spans: [{
						kind: "text",
						text: codeContentLine(seg, ln, width)
					}]
				});
			}
			continue;
		}
		if (/^#{1,6}\s+/.test(line)) {
			const title = line.replace(/^#{1,6}\s+/, "");
			const spans$1 = parseInline(title);
			for (const wrapped of wrapSpans(spans$1, width)) out.push({
				kind: "heading",
				spans: wrapped
			});
			continue;
		}
		if (line.startsWith("> ")) {
			const q = line.slice(2);
			const spans$1 = parseInline(q);
			for (const wrapped of wrapSpans(spans$1, Math.max(1, width - 2))) out.push({
				kind: "quote",
				spans: [{
					kind: "text",
					text: "│ "
				}, ...wrapped]
			});
			continue;
		}
		let liI = 0;
		while (liI < line.length && line[liI] === " ") liI++;
		const hasWs = (idx) => line[idx] === " " || line[idx] === "	";
		const skipWs = (idx) => {
			let j = idx;
			while (j < line.length && hasWs(j)) j++;
			return j;
		};
		let isList = false;
		let marker = "";
		let item = "";
		let indentLevel = 0;
		const ulMarker = line[liI];
		if (ulMarker === "-" || ulMarker === "*" || ulMarker === "+") {
			const afterMarker = liI + 1;
			if (hasWs(afterMarker)) {
				const start = skipWs(afterMarker);
				if (start < line.length) {
					isList = true;
					indentLevel = Math.floor(liI / 2);
					marker = "•";
					item = line.slice(start);
				}
			}
		}
		if (!isList) {
			let j = liI;
			while (j < line.length) {
				const c = line.charCodeAt(j);
				if (c < 48 || c > 57) break;
				j++;
			}
			if (j > liI && line[j] === "." && hasWs(j + 1)) {
				const start = skipWs(j + 1);
				if (start < line.length) {
					isList = true;
					indentLevel = Math.floor(liI / 2);
					marker = `${line.slice(liI, j)}.`;
					item = line.slice(start);
				}
			}
		}
		if (isList) {
			const indent = " ".repeat(indentLevel * 2);
			const prefixFirst = `${indent}${marker} `;
			const prefixCells = textCellWidth$3(prefixFirst);
			const prefixNext = " ".repeat(prefixCells);
			const spans$1 = parseInline(item);
			const wrappedLines = wrapSpans(spans$1, Math.max(1, width - prefixCells));
			for (const [i, wrapped] of wrappedLines.entries()) out.push({
				kind: "list",
				spans: [{
					kind: "text",
					text: i === 0 ? prefixFirst : prefixNext
				}, ...wrapped]
			});
			continue;
		}
		if (!line.trim()) {
			out.push({
				kind: "text",
				spans: [{
					kind: "text",
					text: ""
				}]
			});
			continue;
		}
		const spans = parseInline(line);
		for (const wrapped of wrapSpans(spans, width)) out.push({
			kind: "text",
			spans: wrapped
		});
	}
	return out;
}

//#endregion
//#region src/ui/chat/renderers.ts
function styleForType(theme, type, extra) {
	const c = resolveMessageTypeColors(theme, type);
	return {
		fg: c.fg,
		bg: c.bg,
		...extra ?? {}
	};
}
function parseFileReferences(text) {
	const regex = /\[?@((?:\/|\.\.?\/)[^\s[\](){}'"`,;:!?]+)\]*/g;
	const segments = [];
	let displayText = "";
	let lastIndex = 0;
	let match;
	match = regex.exec(text);
	while (match !== null) {
		const fullMatch = match[0];
		const absPath = match[1];
		const matchStart = match.index;
		displayText += text.slice(lastIndex, matchStart);
		const cleanPath = absPath.replace(/[\])'"`,;:!?]+$/, "").replace(/[.-]+$/, "");
		const filename = cleanPath.split("/").pop() || cleanPath;
		const displayName = `[${filename}]`;
		const segmentStart = displayText.length;
		displayText += displayName;
		const segmentEnd = displayText.length;
		segments.push({
			start: segmentStart,
			end: segmentEnd,
			absPath: cleanPath
		});
		lastIndex = matchStart + fullMatch.length;
		match = regex.exec(text);
	}
	displayText += text.slice(lastIndex);
	return {
		displayText,
		segments
	};
}
function wrapTextByWidthWithOffsets(text, width) {
	width = Math.max(1, Math.floor(width));
	const out = [];
	let i = 0;
	let lineStart = 0;
	let lineText = "";
	let cells = 0;
	const pushLine = (end) => {
		out.push({
			text: lineText,
			start: lineStart,
			end
		});
		lineText = "";
		cells = 0;
	};
	while (i < text.length) {
		const cp = text.codePointAt(i) ?? 0;
		const ch = String.fromCodePoint(cp);
		if (ch === "\n") {
			pushLine(i);
			i += ch.length;
			lineStart = i;
			continue;
		}
		const w = charCellWidth(ch);
		if (cells + w > width) {
			if (cells === 0) {
				lineText = ch;
				i += ch.length;
				pushLine(i);
				lineStart = i;
				continue;
			}
			pushLine(i);
			lineStart = i;
			continue;
		}
		lineText += ch;
		cells += w;
		i += ch.length;
	}
	out.push({
		text: lineText,
		start: lineStart,
		end: text.length
	});
	return out;
}
function truncateByCells(text, maxCells) {
	const limit = Math.max(0, Math.floor(maxCells));
	if (!limit) return {
		text: "",
		truncated: text.length > 0
	};
	let out = "";
	let cells = 0;
	let i = 0;
	while (i < text.length) {
		const cp = text.codePointAt(i) ?? 0;
		const ch = String.fromCodePoint(cp);
		const w = charCellWidth(ch);
		if (cells + w > limit) break;
		out += ch;
		cells += w;
		i += ch.length;
	}
	return {
		text: out,
		truncated: i < text.length
	};
}
function makePushers(out, contentIndent) {
	const pushLine = (text, style, action) => {
		out.push({
			text: `  ${text}`,
			style,
			segments: [],
			action
		});
	};
	const pushLineWithSegments = (text, style, segments, action) => {
		out.push({
			text: `  ${text}`,
			style,
			segments,
			action
		});
	};
	const pushSpans = (spans, base) => {
		let x = contentIndent;
		const segments = [];
		for (const span of spans) {
			const segStyle = span.kind === "bold" ? {
				...base ?? {},
				bold: true
			} : span.kind === "code" ? {
				...base ?? {},
				fg: "yellowBright"
			} : base;
			const w = textCellWidth(span.text);
			if (span.kind !== "text") segments.push({
				x,
				w,
				text: span.text,
				style: segStyle
			});
			x += w;
		}
		const text = spans.map((s) => s.text).join("");
		out.push({
			text: `  ${text}`,
			style: base,
			segments: segments.map((seg) => ({
				...seg,
				x: seg.x
			}))
		});
	};
	return {
		pushLine,
		pushLineWithSegments,
		pushSpans
	};
}
function renderUserMessageLines(opts) {
	const out = [];
	const { pushLine } = makePushers(out, opts.contentIndent);
	const userStyle = styleForType(opts.theme, "user", { fg: resolveMessageTypeColors(opts.theme, "user").fg ?? "whiteBright" });
	const text = opts.message.content.replace(/\r/g, "");
	const userWidth = Math.max(1, opts.width - opts.contentIndent);
	const parsed = parseFileReferences(text);
	let displayText = parsed.displayText;
	let fileRefs = parsed.segments;
	const focusFiles = (opts.message.focusFiles ?? []).map((f) => String(f ?? "")).filter(Boolean);
	if (focusFiles.length > 0) {
		let prefix = "";
		const prefixRefs = [];
		for (const absPath of focusFiles) {
			const name = absPath.split(/[/\\]/).filter(Boolean).pop() ?? absPath;
			const label = `[${name}]`;
			const sep$1 = prefix.length ? " " : "";
			const start = prefix.length + sep$1.length;
			prefix += `${sep$1}${label}`;
			const end = prefix.length;
			prefixRefs.push({
				start,
				end,
				absPath
			});
		}
		const sep = displayText.startsWith("\n") ? "" : displayText ? " " : "";
		const offset = prefix.length + sep.length;
		displayText = `${prefix}${sep}${displayText}`;
		fileRefs = [...prefixRefs, ...fileRefs.map((s) => ({
			...s,
			start: s.start + offset,
			end: s.end + offset
		}))];
	}
	for (const wrapped of wrapTextByWidthWithOffsets(displayText, userWidth)) {
		const wrappedLine = wrapped.text;
		const lineStart = wrapped.start;
		const lineEnd = wrapped.end;
		const lineFileSegments = [];
		for (const fref of fileRefs) if (fref.end > lineStart && fref.start < lineEnd) {
			const segStartInText = Math.max(lineStart, fref.start);
			const segEndInText = Math.min(lineEnd, fref.end);
			const segText = displayText.slice(segStartInText, segEndInText);
			const before = displayText.slice(lineStart, segStartInText);
			const xCells = opts.contentIndent + textCellWidth(before);
			lineFileSegments.push({
				x: xCells,
				w: textCellWidth(segText),
				text: segText,
				style: {
					fg: "cyanBright",
					bold: true
				},
				action: {
					type: "openFile",
					absPath: fref.absPath
				}
			});
		}
		if (lineFileSegments.length > 0) out.push({
			text: `  ${wrappedLine}`,
			style: userStyle,
			segments: lineFileSegments
		});
		else pushLine(wrappedLine, userStyle);
	}
	return out;
}
const assistantPartRenderers = {
	status(ctx, part) {},
	markdown(ctx, part) {
		const base = styleForType(ctx.theme, "markdown");
		for (const l of markdownToLines(part.markdown, ctx.width - ctx.contentIndent)) {
			const style = l.kind === "heading" ? {
				...base,
				bold: true
			} : l.kind === "quote" ? {
				...base,
				dim: true
			} : l.kind === "code" ? {
				...base,
				fg: "yellowBright"
			} : base;
			ctx.pushSpans(l.spans, style);
		}
	},
	tool_call(ctx, part) {
		const sel = ctx.selectedToolCallId === part.call.id;
		const marker = sel ? "▾" : "▸";
		const base = styleForType(ctx.theme, "tool_call");
		const toolResult = ctx.toolResultById.get(part.call.id);
		let toolNameStyle = sel ? {
			...base,
			bold: true
		} : {
			...base,
			dim: true
		};
		if (toolResult?.status === "success") toolNameStyle = {
			...toolNameStyle,
			fg: "green"
		};
		else if (toolResult?.status === "error") toolNameStyle = {
			...toolNameStyle,
			fg: "red"
		};
		const args = part.call.arguments;
		const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
		const argsObj = isPlainObject(args) ? args : null;
		const rawPreview = (() => {
			if (sel) return "";
			if (argsObj && Object.keys(argsObj).length > 0) return JSON.stringify(argsObj);
			return part.call.argumentsText ?? "";
		})();
		const previewText = rawPreview.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
		const prefix = `${marker} tool_call: `;
		const previewPrefix = previewText ? " · " : "";
		const prefixCells = textCellWidth(`  ${prefix}${part.call.name}${previewPrefix}`);
		const maxPreviewCells = Math.max(0, ctx.width - prefixCells);
		const preview = (() => {
			if (!previewText) return "";
			if (maxPreviewCells <= 0) return "…";
			const first = truncateByCells(previewText, Math.max(0, maxPreviewCells - 1));
			if (!first.truncated) return previewText;
			return `${first.text}…`;
		})();
		ctx.pushLineWithSegments(`${prefix}${part.call.name}${preview ? ` · ${preview}` : ""}`, sel ? {
			...base,
			bold: true
		} : {
			...base,
			dim: true
		}, [{
			x: textCellWidth(`  ${prefix}`),
			w: textCellWidth(part.call.name),
			text: part.call.name,
			style: toolNameStyle
		}], {
			type: "selectToolCall",
			callId: part.call.id
		});
		if (sel) {
			const detailStyle = {
				...base,
				dim: true
			};
			ctx.pushLine(`  id: ${part.call.id}`, detailStyle);
			const w = Math.max(10, ctx.width - ctx.contentIndent - 2);
			const pushDetail = (label, value) => {
				const v = typeof value === "string" ? value : JSON.stringify(value);
				if (!v || !String(v).trim()) return;
				const detail = `${label}: ${String(v)}`;
				for (const line of wrapTextByWidthWithOffsets(detail, w)) ctx.pushLine(`  ${line.text}`, detailStyle);
			};
			if (argsObj && Object.keys(argsObj).length > 0) {
				const skip = new Set();
				if (String(part.call.name ?? "").toLowerCase() === "bash") {
					const commandText = typeof argsObj.command === "string" ? String(argsObj.command) : "";
					if (commandText.trim()) {
						skip.add("command");
						ctx.pushLine("  command:", detailStyle);
						const codeStyle = {
							...detailStyle,
							fg: "yellowBright"
						};
						const lines = commandText.replace(/\r/g, "").split("\n");
						let isFirst = true;
						for (const rawLine of lines) {
							const prefix$1 = isFirst ? "$ " : "| ";
							const innerW = Math.max(5, w - textCellWidth(prefix$1));
							const wrapped = wrapTextByWidthWithOffsets(rawLine, innerW);
							if (wrapped.length === 0) {
								ctx.pushLine(`  ${prefix$1}`, codeStyle);
								isFirst = false;
								continue;
							}
							for (const seg of wrapped) {
								const p = isFirst ? "$ " : "| ";
								ctx.pushLine(`  ${p}${seg.text}`, codeStyle);
								isFirst = false;
							}
						}
					}
				}
				for (const k of [
					"command",
					"description",
					"pattern",
					"query"
				]) {
					if (skip.has(k)) continue;
					const v = argsObj[k];
					if (v != null) pushDetail(k, v);
					skip.add(k);
				}
				for (const [k, v] of Object.entries(argsObj)) {
					if (skip.has(k)) continue;
					if (v == null) continue;
					pushDetail(k, v);
				}
			}
		}
	},
	tool_result(ctx, part) {
		const expanded = ctx.selectedToolCallId === part.result.id;
		if (!expanded) return;
		const statusIcon = part.result.status === "success" ? "✓" : "✗";
		const base = styleForType(ctx.theme, "tool_result", { dim: true });
		ctx.pushLine(`${statusIcon} ${part.result.status}`, base);
		const ansi = part.result.outputAnsi;
		const useAnsi = typeof ansi === "string" && ansi.trim().length > 0;
		const maxLines = 24;
		const outputLines = part.result.output.split("\n");
		const renderLines = (useAnsi ? ansi : part.result.output).split("\n");
		const prefix = "  ";
		const prefixCells = textCellWidth(prefix);
		for (const seg of renderLines.slice(0, maxLines)) {
			if (seg === "") {
				ctx.pushLine(prefix, base);
				continue;
			}
			if (useAnsi) {
				const parsed = parseAnsiSgr(seg, {});
				const text = parsed.map((p) => p.text).join("");
				let x = ctx.contentIndent + prefixCells;
				const segments = [];
				for (const p of parsed) {
					const w = textCellWidth(p.text);
					if (w > 0 && Object.keys(p.style ?? {}).length > 0) segments.push({
						x,
						w,
						text: p.text,
						style: p.style
					});
					x += w;
				}
				ctx.pushLineWithSegments(`${prefix}${text}`, base, segments);
				continue;
			}
			ctx.pushLine(`${prefix}${seg}`, base);
		}
		if (outputLines.length > maxLines) ctx.pushLine("  …", base);
	},
	approve(ctx, part) {
		const s = part.request.status;
		const statusIcon = s === "pending" ? "!" : s === "approved" ? "✓" : "✗";
		const base = styleForType(ctx.theme, "approve");
		const dim = {
			...base,
			dim: true
		};
		ctx.pushLine(`${statusIcon} ${part.request.tool} — ${part.request.permission}`, s === "pending" ? {
			...base,
			bold: true
		} : dim, s === "pending" ? { type: "openApproval" } : { type: "none" });
		if (s === "pending") ctx.pushLine(`  ${part.request.reason}`, dim);
	},
	todo(ctx, part) {
		const icon = part.collapsed ? "▸" : "▾";
		const base = styleForType(ctx.theme, "todo");
		const dim = {
			...base,
			dim: true
		};
		ctx.pushLine(`${icon} ${part.title}`, {
			...base,
			bold: true
		}, {
			type: "toggleCollapse",
			messageId: ctx.messageId,
			part: part.type,
			partIndex: ctx.partIndex
		});
		if (!part.collapsed) {
			const isToolDerived = Boolean(part?.toolCallId);
			for (const it of part.items) {
				const box = it.done ? "☑" : "☐";
				ctx.pushLine(`  ${box} ${it.text}`, dim, isToolDerived ? { type: "none" } : {
					type: "toggleItem",
					messageId: ctx.messageId,
					part: part.type,
					itemId: it.id
				});
			}
		}
	},
	plan(ctx, part) {
		const icon = part.collapsed ? "▸" : "▾";
		const base = styleForType(ctx.theme, "plan");
		const dim = {
			...base,
			dim: true
		};
		ctx.pushLine(`${icon} ${part.title}`, {
			...base,
			bold: true
		}, {
			type: "toggleCollapse",
			messageId: ctx.messageId,
			part: part.type,
			partIndex: ctx.partIndex
		});
		if (!part.collapsed) for (const it of part.items) {
			const box = it.done ? "☑" : "☐";
			ctx.pushLine(`  ${box} ${it.text}`, dim, {
				type: "toggleItem",
				messageId: ctx.messageId,
				part: part.type,
				itemId: it.id
			});
		}
	}
};
function renderAssistantMessageLines(opts) {
	const out = [];
	const { pushLine, pushLineWithSegments, pushSpans } = makePushers(out, opts.contentIndent);
	const toolResultById = new Map();
	for (const p of opts.message.parts) if (p.type === "tool_result") toolResultById.set(p.result.id, p.result);
	const baseCtx = {
		messageId: opts.message.id,
		width: opts.width,
		contentIndent: opts.contentIndent,
		selectedToolCallId: opts.selectedToolCallId,
		toolResultById,
		pushLine,
		pushLineWithSegments,
		pushSpans,
		theme: opts.theme
	};
	for (let partIndex = 0; partIndex < opts.message.parts.length; partIndex++) {
		const part = opts.message.parts[partIndex];
		const render = assistantPartRenderers[part.type];
		const ctx = {
			...baseCtx,
			partIndex
		};
		render(ctx, part);
	}
	return out;
}

//#endregion
//#region src/ui/chat/layout-model.ts
function themeSignature(theme) {
	const preset = theme?.preset ?? "goatchain";
	const o = theme?.overrides ?? {};
	const keys = Object.keys(o).sort();
	if (keys.length === 0) return String(preset);
	const parts = keys.map((k) => {
		const v = o[k] ?? {};
		return `${k}:${String(v.fg ?? "")},${String(v.bg ?? "")}`;
	});
	return `${preset}|${parts.join("|")}`;
}
function fingerprintMessage(m) {
	if (m.role === "user") {
		const content = String(m.content ?? "");
		const focusLen = m?.focusFiles?.length ?? 0;
		return `u:${content.length}:${focusLen}`;
	}
	if (m.role === "assistant") {
		const parts = m.parts ?? [];
		let sig = `a:${parts.length}`;
		for (const p of parts) {
			const t = String(p?.type ?? "");
			if (t === "status") sig += `|s:${String(p?.text ?? "").length}`;
			else if (t === "markdown") sig += `|m:${String(p?.markdown ?? "").length}`;
			else if (t === "tool_call") {
				const call = p?.call ?? {};
				const argsText = call?.argumentsText;
				const argsLen = typeof argsText === "string" ? argsText.length : (() => {
					try {
						return JSON.stringify(call?.arguments ?? {}).length;
					} catch {
						return 0;
					}
				})();
				sig += `|tc:${String(call?.id ?? "")}:${argsLen}`;
			} else if (t === "tool_result") {
				const r$1 = p?.result ?? {};
				sig += `|tr:${String(r$1?.id ?? "")}:${String(r$1?.status ?? "")}:${String(r$1?.output ?? "").length}:${String(r$1?.outputAnsi ?? "").length}`;
			} else if (t === "approve") {
				const r$1 = p?.request ?? {};
				sig += `|ap:${String(r$1?.id ?? "")}:${String(r$1?.status ?? "")}`;
			} else if (t === "todo" || t === "plan") {
				const items = p?.items ?? [];
				let done = 0;
				for (const it of items) if (it?.done) done++;
				sig += `|${t}:${String(p?.title ?? "").length}:${p?.collapsed ? 1 : 0}:${items.length}:${done}`;
			} else sig += `|${t}`;
		}
		return sig;
	}
	const r = m?.result ?? {};
	return `t:${String(r?.id ?? "")}:${String(r?.status ?? "")}:${String(r?.output ?? "").length}`;
}
function renderMessageBlock(m, width, selectedToolCallId, theme) {
	const contentIndent = 2;
	if (m.role === "user") return {
		role: m.role,
		messageId: m.id,
		lines: renderUserMessageLines({
			message: m,
			width,
			contentIndent,
			theme
		})
	};
	if (m.role === "tool") return null;
	return {
		role: m.role,
		messageId: m.id,
		lines: renderAssistantMessageLines({
			message: m,
			width,
			contentIndent,
			selectedToolCallId,
			theme
		})
	};
}
function decorateBlock(block, theme) {
	const out = [];
	const assistantBase = resolveMessageTypeColors(theme, "assistant");
	const userBase = resolveMessageTypeColors(theme, "user");
	const assistantBg = assistantBase.bg ?? "black";
	const userBg = userBase.bg ?? "blackBright";
	const spacerBg = assistantBg;
	out.push({
		text: "",
		style: { bg: spacerBg },
		segments: [],
		hasBackground: false
	});
	const isUser = block.role === "user";
	const blockBg = isUser ? userBg : assistantBg;
	const accentStyle = {
		fg: "blueBright",
		bg: blockBg
	};
	if (isUser) out.push({
		text: "┃",
		style: { bg: userBg },
		segments: [{
			x: 0,
			w: 1,
			text: "┃",
			style: accentStyle
		}],
		hasBackground: true,
		messageId: block.messageId
	});
	for (const line of block.lines) if (isUser) {
		const segments = [{
			x: 0,
			w: 1,
			text: "┃",
			style: accentStyle
		}, ...line.segments.map((seg) => ({
			...seg,
			style: {
				...seg.style ?? {},
				bg: userBg
			}
		}))];
		out.push({
			text: `┃${line.text}`,
			style: {
				...line.style,
				bg: userBg
			},
			segments,
			action: line.action,
			hasBackground: true,
			messageId: block.messageId
		});
	} else {
		const lineBg = line.style?.bg ?? assistantBg;
		out.push({
			text: line.text,
			style: {
				...line.style,
				bg: lineBg
			},
			segments: line.segments.map((seg) => ({
				...seg,
				style: {
					...seg.style ?? {},
					bg: lineBg
				}
			})),
			action: line.action,
			hasBackground: false,
			messageId: block.messageId
		});
	}
	if (isUser) out.push({
		text: "┃",
		style: { bg: userBg },
		segments: [{
			x: 0,
			w: 1,
			text: "┃",
			style: accentStyle
		}],
		hasBackground: true,
		messageId: block.messageId
	});
	return out;
}
function createChatLayoutModelBuilder() {
	let lastWidth = -1;
	let lastSelectedToolCallId = null;
	let lastThemeSig = "";
	let lastDirtySeq = -1;
	let lines = [];
	let toolLineById = new Map();
	const messageIds = [];
	const messageRanges = new Map();
	const messageFingerprints = new Map();
	function scanToolLines(blockLines, offset) {
		for (let i = 0; i < blockLines.length; i++) {
			const a = blockLines[i]?.action;
			if (a?.type === "selectToolCall") toolLineById.set(a.callId, offset + i);
		}
	}
	function fullRebuild(opts) {
		lines = [];
		toolLineById = new Map();
		messageIds.length = 0;
		messageRanges.clear();
		messageFingerprints.clear();
		const width = Math.max(0, opts.width);
		for (const m of opts.messages) {
			const block = renderMessageBlock(m, width, opts.selectedToolCallId, opts.theme);
			if (!block) continue;
			const fp = fingerprintMessage(m);
			const decorated = decorateBlock(block, opts.theme);
			const start = lines.length;
			lines.push(...decorated);
			const end = lines.length;
			messageIds.push(block.messageId);
			messageRanges.set(block.messageId, {
				start,
				end
			});
			messageFingerprints.set(block.messageId, fp);
			scanToolLines(decorated, start);
		}
	}
	function replaceMessageAt(index, m, fp, opts) {
		const id$1 = m.id;
		const range = messageRanges.get(id$1);
		if (!range) return;
		const oldStart = range.start;
		const oldEnd = range.end;
		const oldLen = oldEnd - oldStart;
		const block = renderMessageBlock(m, opts.width, opts.selectedToolCallId, opts.theme);
		if (!block) return;
		const decorated = decorateBlock(block, opts.theme);
		lines.splice(oldStart, oldLen, ...decorated);
		const delta = decorated.length - oldLen;
		const newEnd = oldStart + decorated.length;
		messageRanges.set(id$1, {
			start: oldStart,
			end: newEnd
		});
		messageFingerprints.set(id$1, fp);
		if (delta !== 0) for (let j = index + 1; j < messageIds.length; j++) {
			const nextId$1 = messageIds[j];
			const r = messageRanges.get(nextId$1);
			if (!r) continue;
			messageRanges.set(nextId$1, {
				start: r.start + delta,
				end: r.end + delta
			});
		}
		const nextTool = new Map();
		for (const [callId, lineIdx] of toolLineById.entries()) {
			if (lineIdx < oldStart) {
				nextTool.set(callId, lineIdx);
				continue;
			}
			if (lineIdx >= oldEnd) {
				nextTool.set(callId, lineIdx + delta);
				continue;
			}
		}
		toolLineById = nextTool;
		scanToolLines(decorated, oldStart);
	}
	return (opts) => {
		const width = Math.max(0, opts.width);
		const selectedToolCallId = opts.selectedToolCallId ?? null;
		const themeSig = themeSignature(opts.theme);
		const mustRebuildAll = width !== lastWidth || selectedToolCallId !== lastSelectedToolCallId || themeSig !== lastThemeSig;
		if (mustRebuildAll) {
			fullRebuild(opts);
			lastWidth = width;
			lastSelectedToolCallId = selectedToolCallId;
			lastThemeSig = themeSig;
			return {
				lines,
				toolLineById
			};
		}
		const renderable = [];
		for (const m of opts.messages) {
			if (m.role === "tool") continue;
			renderable.push(m);
		}
		if (renderable.length < messageIds.length) {
			fullRebuild(opts);
			return {
				lines,
				toolLineById
			};
		}
		for (let i = 0; i < messageIds.length; i++) if (renderable[i]?.id !== messageIds[i]) {
			fullRebuild(opts);
			return {
				lines,
				toolLineById
			};
		}
		for (let i = messageIds.length; i < renderable.length; i++) {
			const m = renderable[i];
			const block = renderMessageBlock(m, width, selectedToolCallId, opts.theme);
			if (!block) continue;
			const fp = fingerprintMessage(m);
			const decorated = decorateBlock(block, opts.theme);
			const start = lines.length;
			lines.push(...decorated);
			const end = lines.length;
			messageIds.push(block.messageId);
			messageRanges.set(block.messageId, {
				start,
				end
			});
			messageFingerprints.set(block.messageId, fp);
			scanToolLines(decorated, start);
		}
		if (typeof opts.dirtySeq === "number" && opts.dirtySeq !== lastDirtySeq) {
			lastDirtySeq = opts.dirtySeq;
			const dirtyId = String(opts.dirtyMessageId ?? "").trim();
			if (dirtyId) {
				const idx = messageIds.indexOf(dirtyId);
				const m = idx >= 0 ? renderable[idx] : null;
				if (m) {
					const fp = fingerprintMessage(m);
					const prev = messageFingerprints.get(dirtyId);
					if (fp !== prev) replaceMessageAt(idx, m, fp, {
						width,
						selectedToolCallId,
						theme: opts.theme
					});
				}
			}
		}
		const tail = 10;
		const startIdx = Math.max(0, renderable.length - tail);
		for (let i = startIdx; i < renderable.length; i++) {
			const m = renderable[i];
			const id$1 = m.id;
			const fp = fingerprintMessage(m);
			const prev = messageFingerprints.get(id$1);
			if (fp !== prev) replaceMessageAt(i, m, fp, {
				width,
				selectedToolCallId,
				theme: opts.theme
			});
		}
		return {
			lines,
			toolLineById
		};
	};
}

//#endregion
//#region ../../src/utils/newlines.ts
function normalizeNewlines$1(text) {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

//#endregion
//#region ../../src/cli/path-provider.ts
async function loadFsPromises() {
	return import("node:fs/promises");
}
function createNodePathPickerProvider() {
	const provider = {
		async listDir(absDir) {
			const fs = await loadFsPromises();
			const list = await fs.readdir(absDir, { withFileTypes: true });
			return list.map((d) => {
				const kind = d.isDirectory() ? "directory" : d.isFile() ? "file" : "other";
				return {
					name: d.name,
					kind
				};
			});
		},
		async stat(absPath) {
			const fs = await loadFsPromises();
			try {
				const s = await fs.lstat(absPath);
				const kind = s.isDirectory() ? "directory" : s.isFile() ? "file" : "other";
				return {
					exists: true,
					kind
				};
			} catch {
				return {
					exists: false,
					kind: "other"
				};
			}
		},
		async suggest(info) {
			const { suggestPaths: suggestPaths$1 } = await import("./path-suggest-BI5PUnJd.js");
			return suggestPaths$1({
				...info,
				listDir: provider.listDir
			});
		},
		async resolvePath(workspaceAbs, input) {
			const { resolveUserPath: resolveUserPath$2 } = await import("./path-suggest-BI5PUnJd.js");
			return resolveUserPath$2(workspaceAbs, input);
		}
	};
	return provider;
}

//#endregion
//#region ../../src/core/buffer/width.ts
const fullWidthRanges = [
	[4352, 4447],
	[9001, 9002],
	[11904, 42191],
	[44032, 55203],
	[63744, 64255],
	[65040, 65049],
	[65072, 65135],
	[65280, 65376],
	[65504, 65510]
];
function isFullWidthCodePoint(codePoint) {
	if (codePoint < 4352 || codePoint > 65510) return false;
	for (const [start, end] of fullWidthRanges) {
		if (codePoint < start) return false;
		if (codePoint <= end) return true;
	}
	return false;
}
function isEmojiLike(codePoint) {
	return codePoint >= 127744 && codePoint <= 129791 || codePoint >= 127462 && codePoint <= 127487;
}
let extendedPictographicRe = null;
try {
	extendedPictographicRe = new RegExp("\\p{Extended_Pictographic}", "u");
} catch {
	extendedPictographicRe = null;
}
let emojiPresentationRe = null;
try {
	emojiPresentationRe = new RegExp("\\p{Emoji_Presentation}", "u");
} catch {
	emojiPresentationRe = null;
}
let emojiRe = null;
try {
	emojiRe = new RegExp("\\p{Emoji}", "u");
} catch {
	emojiRe = null;
}
function charCellWidth$1(text) {
	if (!text) return 1;
	if (text.length === 1) {
		const code = text.charCodeAt(0);
		if (code < 4352) return 1;
	}
	const codePoint = text.codePointAt(0);
	if (codePoint == null) return 1;
	const hasVs16 = text.includes("️");
	if (isFullWidthCodePoint(codePoint)) return 2;
	if (isEmojiLike(codePoint)) return 2;
	if (emojiPresentationRe?.test(text)) return 2;
	if (text.includes("⃣")) return 2;
	if (hasVs16 && emojiRe?.test(text)) return 2;
	if (extendedPictographicRe?.test(text)) {
		if (codePoint <= 65535) return hasVs16 ? 2 : 1;
		return 2;
	}
	return 1;
}

//#endregion
//#region ../../src/vue/components/input/host.ts
function isAbsoluteRawPath(path) {
	const value = String(path ?? "").trim();
	if (!value) return false;
	if (value.startsWith("/") || value.startsWith("\\\\")) return true;
	return /^[A-Z]:[\\/]/i.test(value);
}
function joinPreservingBackslashes(base, next) {
	const left = String(base ?? "");
	const right = String(next ?? "");
	if (!left) return right;
	if (!right) return left;
	if (isAbsoluteRawPath(right)) return right;
	if (left.endsWith("/") || left.endsWith("\\")) return `${left}${right}`;
	return `${left}/${right}`;
}
function resolveDefaultTInputPath(info) {
	const workspaceAbs = normalizePath(String(info.workspace ?? ""));
	const raw = String(info.input ?? "").replace(/\r/g, "").trim();
	if (!raw) return resolvePath(workspaceAbs, ".");
	const homeMatch = raw.match(/^~(?:[\\/](.*))?$/);
	if (homeMatch && info.homeDir) {
		const rest = homeMatch[1] ?? "";
		if (info.preserveBackslash) return joinPreservingBackslashes(info.homeDir, rest);
		return resolvePath(normalizePath(info.homeDir), rest);
	}
	if (info.preserveBackslash) {
		if (isAbsoluteRawPath(raw)) return raw;
		return joinPreservingBackslashes(workspaceAbs, raw);
	}
	const normalized = raw.replace(/\\/g, "/");
	if (isAbsolutePath(normalized)) return normalizePath(normalized);
	return resolvePath(workspaceAbs, normalized);
}
function fileUrlToPathLike(input) {
	try {
		const url = new URL(String(input ?? ""));
		if (url.protocol !== "file:") return null;
		let pathname = decodeURIComponent(url.pathname || "");
		if (/^\/[A-Z]:\//i.test(pathname)) pathname = pathname.slice(1);
		if (url.host) return `//${url.host}${pathname}`;
		return pathname || "/";
	} catch {
		return null;
	}
}
function pathToTerminalFileHref(pathLike) {
	const raw = String(pathLike ?? "").trim();
	if (!raw) return void 0;
	if (raw.startsWith("file://")) return raw;
	const normalizedRaw = raw.replace(/\\/g, "/");
	const normalized = normalizePath(normalizedRaw);
	if (!isAbsolutePath(normalized)) return void 0;
	try {
		if (/^[A-Z]:\//i.test(normalized)) return new URL(`file:///${normalized}`).toString();
		return new URL(`file://${normalized}`).toString();
	} catch {
		return void 0;
	}
}

//#endregion
//#region ../../src/vue/context.ts
const TerminalContextKey = Symbol("TerminalContext");
const LayoutContextKey = Symbol("LayoutContext");
const VisibilityContextKey = Symbol("VisibilityContext");
const EventZIndexContextKey = Symbol("EventZIndex");
const RenderPlaneContextKey = Symbol("RenderPlane");
const ImeAnchorContextKey = Symbol("ImeAnchor");
const TInputPluginsContextKey = Symbol("TInputPlugins");
const TPathPickerProviderContextKey = Symbol("TPathPickerProvider");
const DialogContextKey = Symbol("DialogContext");

//#endregion
//#region ../../src/vue/render/context.ts
const RenderStackKey = Symbol("RenderStack");

//#endregion
//#region ../../src/vue/utils/text.ts
let renderPassDepth = 0;
const renderPassTextWidthCache = new Map();
function isAscii$1(text) {
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return false;
	return true;
}
function needsGraphemeSegmentation(text) {
	for (const ch of text) {
		const cp = ch.codePointAt(0);
		if (cp === 8205) return true;
		if (cp >= 65024 && cp <= 65039 || cp >= 917760 && cp <= 917999) return true;
		if (cp >= 768 && cp <= 879 || cp >= 6832 && cp <= 6911 || cp >= 7616 && cp <= 7679 || cp >= 8400 && cp <= 8447 || cp >= 65056 && cp <= 65071) return true;
		if (cp >= 127995 && cp <= 127999) return true;
		if (cp >= 127462 && cp <= 127487) return true;
	}
	return false;
}
let graphemeSegmenter = null;
try {
	graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
} catch {
	graphemeSegmenter = null;
}
function forEachGrapheme(text, cb) {
	if (!text) return;
	const seg = graphemeSegmenter;
	if (!seg || !needsGraphemeSegmentation(text)) {
		for (const ch of text) {
			const r = cb(ch);
			if (r === false) return;
		}
		return;
	}
	for (const part of seg.segment(text)) {
		const r = cb(part.segment);
		if (r === false) return;
	}
}
function graphemeRangeAt(text, index) {
	if (!text) return null;
	const len = text.length;
	if (index < 0 || index >= len) return null;
	if (isAscii$1(text)) return {
		start: index,
		end: index + 1
	};
	const seg = graphemeSegmenter;
	if (seg && needsGraphemeSegmentation(text)) {
		let pos$1 = 0;
		for (const part of seg.segment(text)) {
			const start = pos$1;
			const end = start + part.segment.length;
			if (index >= start && index < end) return {
				start,
				end
			};
			pos$1 = end;
		}
		return null;
	}
	let pos = 0;
	for (const ch of text) {
		const start = pos;
		const end = start + ch.length;
		if (index >= start && index < end) return {
			start,
			end
		};
		pos = end;
	}
	return null;
}
function sanitizeInlineText(text) {
	if (!text) return "";
	if (!/[\n\r\t]/.test(text)) return text;
	return text.replace(/[\n\r\t]/g, " ");
}
function sanitizeTextBlock(text) {
	if (!text) return "";
	if (!/[\t\x00-\x08\x0B-\x1F\x7F]/.test(text)) return text;
	const out = [];
	out.length = 0;
	for (const ch of text) {
		const cp = ch.codePointAt(0);
		if (cp === 13) continue;
		if (cp === 9) {
			out.push(" ");
			continue;
		}
		if (cp <= 31 && cp !== 10 || cp === 127) continue;
		out.push(ch);
	}
	return out.join("");
}
function textCellWidth$2(text) {
	if (!text) return 0;
	if (isAscii$1(text)) return text.length;
	if (renderPassDepth > 0) {
		const cached$1 = renderPassTextWidthCache.get(text);
		if (cached$1 != null) return cached$1;
	}
	const cached = textWidthCacheGet(text);
	if (cached != null) return cached;
	let cells = 0;
	forEachGrapheme(text, (g) => {
		cells += charCellWidth$1(g);
	});
	if (renderPassDepth > 0) renderPassTextWidthCache.set(text, cells);
	textWidthCacheSet(text, cells);
	return cells;
}
const spaceCache = new Map();
const MAX_CACHED_SPACES = 256;
function spaces$1(count) {
	count = Math.max(0, Math.floor(count));
	if (count === 0) return "";
	const cached = spaceCache.get(count);
	if (cached) return cached;
	const v = " ".repeat(count);
	if (spaceCache.size >= MAX_CACHED_SPACES) spaceCache.clear();
	spaceCache.set(count, v);
	return v;
}
const repeatCharCache = new Map();
const MAX_REPEAT_CHAR_KEYS = 8;
const MAX_CACHED_REPEAT_CHAR = 256;
function repeatChar(ch, count) {
	count = Math.max(0, Math.floor(count));
	if (count === 0) return "";
	if (!ch) return "";
	let bucket = repeatCharCache.get(ch);
	if (!bucket) {
		if (repeatCharCache.size >= MAX_REPEAT_CHAR_KEYS) repeatCharCache.clear();
		bucket = new Map();
		repeatCharCache.set(ch, bucket);
	}
	const cached = bucket.get(count);
	if (cached) return cached;
	const v = ch.repeat(count);
	if (bucket.size >= MAX_CACHED_REPEAT_CHAR) bucket.clear();
	bucket.set(count, v);
	return v;
}
function sliceByCells$1(text, maxCells) {
	maxCells = Math.max(0, Math.floor(maxCells));
	if (maxCells <= 0) return "";
	if (text && isAscii$1(text)) return text.slice(0, maxCells);
	const out = [];
	let cells = 0;
	forEachGrapheme(text, (g) => {
		const w = charCellWidth$1(g);
		if (cells + w > maxCells) return false;
		out.push(g);
		cells += w;
		return void 0;
	});
	return out.length ? out.join("") : "";
}
function sliceByCellsRange(text, startCells, endCells) {
	startCells = Math.max(0, Math.floor(startCells));
	endCells = Math.max(0, Math.floor(endCells));
	if (endCells <= startCells) return "";
	if (!text) return "";
	if (isAscii$1(text)) return text.slice(startCells, endCells);
	const out = [];
	let cells = 0;
	forEachGrapheme(text, (g) => {
		const w = charCellWidth$1(g);
		const next = cells + w;
		if (cells >= endCells) return false;
		if (next <= startCells) {
			cells = next;
			return void 0;
		}
		if (cells < startCells && next > startCells) {
			cells = next;
			return void 0;
		}
		if (next > endCells) return false;
		out.push(g);
		cells = next;
		return void 0;
	});
	return out.length ? out.join("") : "";
}
function padEndByCells$2(text, width) {
	width = Math.max(0, Math.floor(width));
	const cells = text && isAscii$1(text) ? text.length : textCellWidth$2(text);
	if (cells >= width) return text;
	return `${text}${spaces$1(width - cells)}`;
}
const wrapCacheByWidth = new Map();
const MAX_WRAP_CACHE_BUCKETS = 32;
const MAX_WRAP_CACHE_PER_WIDTH = 256;
function getWrapBucket(width) {
	let bucket = wrapCacheByWidth.get(width);
	if (bucket) return bucket;
	if (wrapCacheByWidth.size >= MAX_WRAP_CACHE_BUCKETS) wrapCacheByWidth.clear();
	bucket = new Map();
	wrapCacheByWidth.set(width, bucket);
	return bucket;
}
const textWidthCache = new Map();
const MAX_TEXT_WIDTH_CACHE = 1024;
function textWidthCacheGet(text) {
	const cached = textWidthCache.get(text);
	if (cached == null) return null;
	textWidthCache.delete(text);
	textWidthCache.set(text, cached);
	return cached;
}
function textWidthCacheSet(text, cells) {
	textWidthCache.set(text, cells);
	if (textWidthCache.size > MAX_TEXT_WIDTH_CACHE) {
		const firstKey = textWidthCache.keys().next().value;
		if (firstKey != null) textWidthCache.delete(firstKey);
	}
}
function wrapByCells$1(text, width) {
	width = Math.max(1, Math.floor(width));
	const bucket = getWrapBucket(width);
	if (text && isAscii$1(text)) {
		const cached$1 = bucket.get(text);
		if (cached$1) return cached$1;
		const out$1 = [];
		for (const rawLine of text.replace(/\r/g, "").split("\n")) {
			if (rawLine.length === 0) {
				out$1.push("");
				continue;
			}
			for (let i = 0; i < rawLine.length; i += width) out$1.push(rawLine.slice(i, i + width));
		}
		if (bucket.size >= MAX_WRAP_CACHE_PER_WIDTH) bucket.clear();
		bucket.set(text, out$1);
		return out$1;
	}
	const cached = bucket.get(text);
	if (cached) return cached;
	const out = [];
	for (const rawLine of text.replace(/\r/g, "").split("\n")) {
		if (rawLine.length === 0) {
			out.push("");
			continue;
		}
		const seg = graphemeSegmenter;
		if (seg && needsGraphemeSegmentation(rawLine)) {
			let lineStart = 0;
			let cells = 0;
			for (const part of seg.segment(rawLine)) {
				const g = part.segment;
				const gIdx = part.index;
				const w = charCellWidth$1(g);
				if (cells > 0 && cells + w > width) {
					out.push(rawLine.slice(lineStart, gIdx));
					lineStart = gIdx;
					cells = 0;
				}
				cells += w;
				if (cells >= width) {
					const end = gIdx + g.length;
					out.push(rawLine.slice(lineStart, end));
					lineStart = end;
					cells = 0;
				}
			}
			if (lineStart < rawLine.length) out.push(rawLine.slice(lineStart));
		} else {
			let lineStart = 0;
			let pos = 0;
			let cells = 0;
			for (const ch of rawLine) {
				const w = charCellWidth$1(ch);
				if (cells > 0 && cells + w > width) {
					out.push(rawLine.slice(lineStart, pos));
					lineStart = pos;
					cells = 0;
				}
				pos += ch.length;
				cells += w;
				if (cells >= width) {
					out.push(rawLine.slice(lineStart, pos));
					lineStart = pos;
					cells = 0;
				}
			}
			if (lineStart < rawLine.length) out.push(rawLine.slice(lineStart));
		}
	}
	const res = out.length ? out : [""];
	if (bucket.size >= MAX_WRAP_CACHE_PER_WIDTH) bucket.clear();
	bucket.set(text, res);
	return res;
}

//#endregion
//#region ../../src/vue/components/input/plugins/nodeMentionPathProvider.ts
function createNodeMentionPathProvider() {
	const provider = createNodePathPickerProvider();
	return {
		async stat(absPath) {
			const stat = await provider.stat(absPath);
			return stat.exists ? stat.kind : null;
		},
		async suggest(info) {
			const res = await suggestPaths({
				workspaceAbs: info.workspaceAbs,
				input: info.input,
				mode: info.mode,
				max: info.max,
				showHidden: info.showHidden,
				listDir: provider.listDir,
				maxDepth: info.maxDepth
			});
			return res.suggestions;
		}
	};
}

//#endregion
//#region ../../src/vue/composables/use-render-stack.ts
function useRenderStack() {
	const stack = inject(RenderStackKey, null);
	if (!stack) throw new Error("RenderStack is missing");
	return stack;
}

//#endregion
//#region ../../src/vue/composables/use-terminal.ts
function useTerminal$1() {
	const ctx = inject(TerminalContextKey, null);
	if (!ctx) throw new Error("TerminalProvider is missing");
	return ctx;
}

//#endregion
//#region ../../src/vue/composables/use-render-node.ts
const pendingInvalidateByScheduler = new WeakMap();
function mergePriority(prev, next) {
	if (prev === "high" || next === "high") return "high";
	if (prev === "normal" || next === "normal") return "normal";
	return "low";
}
function requestBatchedInvalidate(scheduler, plane, priority) {
	let state = pendingInvalidateByScheduler.get(scheduler);
	if (!state) {
		state = {
			queued: false,
			plane: null,
			priority: "low"
		};
		pendingInvalidateByScheduler.set(scheduler, state);
	}
	if (state.queued) {
		state.plane = state.plane == null || state.plane === plane ? plane : null;
		state.priority = mergePriority(state.priority, priority);
		return;
	}
	state.plane = plane;
	state.priority = priority;
	state.queued = true;
	queueMicrotask(() => {
		state.queued = false;
		const queuedPlane = state.plane;
		const queuedPriority = state.priority;
		state.plane = null;
		state.priority = "low";
		scheduler.invalidate(queuedPlane || queuedPriority !== "normal" ? {
			plane: queuedPlane ?? void 0,
			priority: queuedPriority
		} : void 0);
	});
}
function useRenderNode(getOptions) {
	const { scheduler, render } = useTerminal$1();
	const parentStack = useRenderStack();
	const plane = inject(RenderPlaneContextKey, ref("default"));
	const id$1 = ref(null);
	const lastPlane = ref(plane.value);
	const options = computed(() => getOptions());
	const stop = watchEffect(() => {
		const opt = options.value;
		opt.deps;
		const stack = opt.stack ?? parentStack.value;
		lastPlane.value = plane.value;
		if (!stack) return;
		if (!id$1.value) {
			const node = render.register({
				stack,
				zIndex: opt.zIndex,
				rect: opt.rect,
				plane: plane.value,
				paint: opt.paint
			});
			id$1.value = node.id;
			requestBatchedInvalidate(scheduler, plane.value, opt.priority ?? "normal");
			return;
		}
		render.update(id$1.value, {
			stack,
			zIndex: opt.zIndex ?? 0,
			rect: opt.rect ?? null,
			dirtyRowsHint: opt.dirtyRowsHint,
			plane: plane.value,
			paint: opt.paint
		});
		requestBatchedInvalidate(scheduler, plane.value, opt.priority ?? "normal");
	});
	onBeforeUnmount(() => {
		stop();
		if (id$1.value) {
			render.unregister(id$1.value);
			requestBatchedInvalidate(scheduler, lastPlane.value, "normal");
		}
	});
	return { id: id$1 };
}

//#endregion
//#region ../../src/vue/composables/use-terminal-node.ts
function useTerminalNode(getOptions) {
	const { events } = useTerminal$1();
	const id$1 = ref(null);
	const options = computed(() => getOptions());
	const stop = watchEffect(() => {
		const manager = events.value;
		if (!manager) return;
		const opt = options.value;
		if (!id$1.value) {
			const node = manager.register({
				rect: opt.rect,
				zIndex: opt.zIndex ?? 0,
				visible: opt.visible,
				focusable: opt.focusable,
				selectable: opt.selectable,
				handlers: opt.handlers ?? {}
			});
			id$1.value = node.id;
			return;
		}
		manager.update(id$1.value, {
			rect: opt.rect,
			zIndex: opt.zIndex ?? 0,
			visible: opt.visible,
			focusable: opt.focusable,
			selectable: opt.selectable,
			handlers: opt.handlers ?? {}
		});
	});
	onBeforeUnmount(() => {
		stop();
		const manager = events.value;
		if (manager && id$1.value) manager.unregister(id$1.value);
	});
	return { id: id$1 };
}

//#endregion
//#region ../../src/vue/components/input/plugins/mentionUtils.ts
const PASTE_IMAGE_PLACEHOLDER_PREFIX = "__paste_image_pending__:";
const COMMIT_MENTION_PREFIX = "git:commit:";
const COMMIT_ID_RE = /^[0-9a-f]{7,40}$/i;
function isCommitMention(value) {
	return Boolean(getCommitIdFromMention(value));
}
function getCommitIdFromMention(value) {
	const raw = String(value || "");
	if (!raw.startsWith(COMMIT_MENTION_PREFIX)) return null;
	const sha = raw.slice(COMMIT_MENTION_PREFIX.length).trim();
	if (!COMMIT_ID_RE.test(sha)) return null;
	return sha;
}
function createPasteImagePlaceholderPath(id$1) {
	return `${PASTE_IMAGE_PLACEHOLDER_PREFIX}${id$1}`;
}
function isPasteImagePlaceholderPath(absPath) {
	return String(absPath || "").startsWith(PASTE_IMAGE_PLACEHOLDER_PREFIX);
}
function pasteImagePlaceholderLabel() {
	return "[Pasting image...]";
}
function basenameFromPath(path) {
	const p = String(path || "");
	const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	const name = idx >= 0 ? p.slice(idx + 1) : p;
	return name || p;
}
function getFileExtension(path) {
	const lastDotIndex = path.lastIndexOf(".");
	if (lastDotIndex === -1) return "";
	return path.slice(lastDotIndex + 1).toLowerCase();
}
function isImageFile(extension) {
	return [
		"png",
		"jpg",
		"jpeg",
		"gif",
		"svg",
		"webp",
		"bmp",
		"ico"
	].includes(extension);
}
function isCachedPasteImage(absPath) {
	const p = String(absPath || "").replace(/\\/g, "/");
	const inBlobAttachments = /\/blob-cache\/[^/]+\/attachments\/[^/]+$/.test(p);
	const inLegacyImageCache = /\/image-cache\/[^/]+\/[^/]+$/.test(p) && !p.includes("/blobs/") && !p.includes("/meta/");
	if (!inBlobAttachments && !inLegacyImageCache) return false;
	const name = basenameFromPath(p);
	const extension = getFileExtension(name);
	return isImageFile(extension);
}
function mentionLabelFromAbsPath(absPath, opts) {
	if (!absPath) return "[file]";
	const commitId = getCommitIdFromMention(absPath);
	if (commitId) return `[${sanitizeInlineText(commitId)}]`;
	if (isPasteImagePlaceholderPath(absPath)) return pasteImagePlaceholderLabel();
	if (isCachedPasteImage(absPath) && typeof opts?.index === "number" && opts.index >= 0) return `[Image #${opts.index + 1}]`;
	const name = basenameFromPath(absPath);
	return `[${sanitizeInlineText(name)}]`;
}
function mentionChipStyle(baseStyle, _absPath, _fsKind) {
	return {
		...baseStyle,
		fg: "cyanBright",
		underline: true,
		bold: true
	};
}

//#endregion
//#region ../../src/vue/components/input/utils/inlineText.ts
function clamp$9(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function isAscii(text) {
	for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) return false;
	return true;
}
const textCellWidth$1 = textCellWidth$2;
function padEndByCells$1(text, width) {
	const cells = textCellWidth$1(text);
	if (cells >= width) return text;
	return text + spaces$1(width - cells);
}
function sliceByCellsWindow(text, startCell, width) {
	startCell = Math.max(0, Math.floor(startCell));
	width = Math.max(0, Math.floor(width));
	if (width <= 0) return "";
	if (!text) return "";
	if (isAscii(text)) return text.slice(startCell, startCell + width);
	let out = "";
	let skipped = 0;
	let used = 0;
	for (let i = 0; i < text.length;) {
		const code = text.charCodeAt(i);
		if (code <= 127) {
			if (skipped < startCell) {
				skipped++;
				i++;
				continue;
			}
			if (used >= width) break;
			out += text[i];
			used++;
			i++;
			continue;
		}
		const cp = text.codePointAt(i) ?? 0;
		const seg = String.fromCodePoint(cp);
		const w = charCellWidth$1(seg);
		if (skipped + w <= startCell) {
			skipped += w;
			i += seg.length;
			continue;
		}
		if (used + w > width) break;
		out += seg;
		used += w;
		i += seg.length;
	}
	return out;
}
function computeLines$1(value) {
	const lines = [];
	let start = 0;
	for (let i = 0; i <= value.length; i++) if (i === value.length || value[i] === "\n") {
		lines.push({
			start,
			end: i
		});
		start = i + 1;
	}
	return lines.length ? lines : [{
		start: 0,
		end: 0
	}];
}
function tokenLabelAt(multilineTexts, tokenIndex) {
	const text = String(multilineTexts?.[tokenIndex] ?? "");
	const lineCount = (text.match(/\n/g) || []).length + 1;
	return `[... ${lineCount} lines]`;
}
function mentionLabelAt(mentions, mentionIndex) {
	const absPath = String(mentions?.[mentionIndex] ?? "");
	return mentionLabelFromAbsPath(absPath, { index: mentionIndex });
}
function countTokens(value, token, endIndex = value.length) {
	let count = 0;
	const limit = clamp$9(endIndex, 0, value.length);
	for (let i = 0; i < limit; i++) if (value[i] === token) count++;
	return count;
}
function countMultilineTokens$1(value, multilineToken, endIndex = value.length) {
	return countTokens(value, multilineToken, endIndex);
}
function countMentionTokens$2(value, mentionToken, endIndex = value.length) {
	return countTokens(value, mentionToken, endIndex);
}
function tokenIndexAt$1(value, multilineToken, index) {
	return countMultilineTokens$1(value, multilineToken, index);
}
function mentionIndexAt$2(value, mentionToken, index) {
	return countMentionTokens$2(value, mentionToken, index);
}
function textCellWidthInline(value, multilineToken, mentionToken, multilineTexts, mentions, start, end) {
	const safeStart = clamp$9(start, 0, value.length);
	const safeEnd = clamp$9(end, safeStart, value.length);
	let cells = 0;
	let tokenIndex = 0;
	let mentionIndex = 0;
	for (let i = 0; i < safeEnd;) {
		const ch = value[i];
		if (ch === multilineToken) {
			if (i >= safeStart) {
				const label = tokenLabelAt(multilineTexts, tokenIndex);
				cells += textCellWidth$2(label);
			}
			tokenIndex++;
			i += 1;
			continue;
		}
		if (ch === mentionToken) {
			if (i >= safeStart) {
				const label = mentionLabelAt(mentions, mentionIndex);
				cells += textCellWidth$2(label);
			}
			mentionIndex++;
			i += 1;
			continue;
		}
		const code = value.charCodeAt(i);
		if (code <= 127) {
			if (i >= safeStart) cells += 1;
			i += 1;
			continue;
		}
		const cp = value.codePointAt(i) ?? 0;
		const seg = String.fromCodePoint(cp);
		if (i >= safeStart) cells += charCellWidth$1(seg);
		i += seg.length;
	}
	return cells;
}
function wrapToLinesInline(value, multilineToken, mentionToken, multilineTexts, mentions, width) {
	width = Math.max(1, Math.floor(width));
	const out = [];
	let start = 0;
	let cells = 0;
	let tokenIndex = 0;
	let mentionIndex = 0;
	for (let i = 0; i < value.length;) {
		const ch = value[i];
		if (ch === "\n") {
			out.push({
				start,
				end: i
			});
			i += 1;
			start = i;
			cells = 0;
			continue;
		}
		let segLen = 0;
		let w = 0;
		if (ch === multilineToken) {
			const label = tokenLabelAt(multilineTexts, tokenIndex);
			w = textCellWidth$2(label);
			segLen = 1;
			tokenIndex++;
		} else if (ch === mentionToken) {
			const label = mentionLabelAt(mentions, mentionIndex);
			w = textCellWidth$2(label);
			segLen = 1;
			mentionIndex++;
		} else {
			const code = value.charCodeAt(i);
			if (code <= 127) {
				segLen = 1;
				w = 1;
			} else {
				const cp = value.codePointAt(i) ?? 0;
				const seg = String.fromCodePoint(cp);
				segLen = seg.length;
				w = charCellWidth$1(seg);
			}
		}
		if (cells > 0 && cells + w > width) {
			out.push({
				start,
				end: i
			});
			start = i;
			cells = 0;
		}
		cells += w;
		i += segLen;
		if (cells >= width) {
			out.push({
				start,
				end: i
			});
			start = i;
			cells = 0;
		}
	}
	out.push({
		start,
		end: value.length
	});
	return out.length ? out : [{
		start: 0,
		end: 0
	}];
}
function wrapToLinesFirstWidthInline$1(value, multilineToken, mentionToken, multilineTexts, mentions, firstWidth, width) {
	firstWidth = Math.max(1, Math.floor(firstWidth));
	width = Math.max(1, Math.floor(width));
	if (firstWidth >= width) return wrapToLinesInline(value, multilineToken, mentionToken, multilineTexts, mentions, width);
	const out = [];
	let start = 0;
	let cells = 0;
	let currentWidth = firstWidth;
	let isFirstLine = true;
	let tokenIndex = 0;
	let mentionIndex = 0;
	for (let i = 0; i < value.length;) {
		const ch = value[i];
		if (ch === "\n") {
			out.push({
				start,
				end: i
			});
			i += 1;
			start = i;
			cells = 0;
			isFirstLine = false;
			currentWidth = width;
			continue;
		}
		let segLen = 0;
		let w = 0;
		if (ch === multilineToken) {
			const label = tokenLabelAt(multilineTexts, tokenIndex);
			w = textCellWidth$2(label);
			segLen = 1;
			tokenIndex++;
		} else if (ch === mentionToken) {
			const label = mentionLabelAt(mentions, mentionIndex);
			w = textCellWidth$2(label);
			segLen = 1;
			mentionIndex++;
		} else {
			const code = value.charCodeAt(i);
			if (code <= 127) {
				segLen = 1;
				w = 1;
			} else {
				const cp = value.codePointAt(i) ?? 0;
				const seg = String.fromCodePoint(cp);
				segLen = seg.length;
				w = charCellWidth$1(seg);
			}
		}
		if (cells > 0 && cells + w > currentWidth) {
			out.push({
				start,
				end: i
			});
			start = i;
			cells = 0;
			if (isFirstLine) {
				isFirstLine = false;
				currentWidth = width;
			}
			continue;
		}
		cells += w;
		i += segLen;
		if (cells >= currentWidth) {
			out.push({
				start,
				end: i
			});
			start = i;
			cells = 0;
			if (isFirstLine) {
				isFirstLine = false;
				currentWidth = width;
			}
		}
	}
	out.push({
		start,
		end: value.length
	});
	return out.length ? out : [{
		start: 0,
		end: 0
	}];
}
function indexToWrappedCellColFirstWidthInline$1(value, multilineToken, mentionToken, multilineTexts, mentions, index, firstWidth, width) {
	const safe = clamp$9(index, 0, value.length);
	const lines = wrapToLinesFirstWidthInline$1(value, multilineToken, mentionToken, multilineTexts, mentions, firstWidth, width);
	for (let i = 0; i < lines.length; i++) {
		const info = lines[i];
		if (safe <= info.end) {
			const col = textCellWidthInline(value, multilineToken, mentionToken, multilineTexts, mentions, info.start, safe);
			return {
				line: i,
				col,
				lines
			};
		}
	}
	const last = lines[lines.length - 1];
	return {
		line: lines.length - 1,
		col: textCellWidthInline(value, multilineToken, mentionToken, multilineTexts, mentions, last.start, last.end),
		lines
	};
}
function indexToLineCellColInline$1(value, multilineToken, mentionToken, multilineTexts, mentions, index) {
	const safe = clamp$9(index, 0, value.length);
	const lines = computeLines$1(value);
	for (let i = 0; i < lines.length; i++) {
		const info = lines[i];
		if (safe <= info.end) {
			const col = textCellWidthInline(value, multilineToken, mentionToken, multilineTexts, mentions, info.start, safe);
			return {
				line: i,
				col,
				lines
			};
		}
	}
	const last = lines[lines.length - 1];
	return {
		line: lines.length - 1,
		col: textCellWidthInline(value, multilineToken, mentionToken, multilineTexts, mentions, last.start, last.end),
		lines
	};
}
function lineCellColToIndexInline$1(value, multilineToken, mentionToken, multilineTexts, mentions, lineStart, lineEnd, col) {
	const target = Math.max(0, Math.floor(col));
	let cells = 0;
	let tokenIndex = countMultilineTokens$1(value, multilineToken, lineStart);
	let mentionIndex = countMentionTokens$2(value, mentionToken, lineStart);
	for (let i = lineStart; i < lineEnd;) {
		const ch = value[i];
		if (ch === multilineToken) {
			const label = tokenLabelAt(multilineTexts, tokenIndex);
			const w$1 = textCellWidth$2(label);
			if (cells + w$1 > target) return {
				index: i,
				hit: {
					kind: "multiline",
					index: tokenIndex
				}
			};
			cells += w$1;
			if (cells >= target) return {
				index: i + 1,
				hit: null
			};
			tokenIndex++;
			i += 1;
			continue;
		}
		if (ch === mentionToken) {
			const label = mentionLabelAt(mentions, mentionIndex);
			const w$1 = textCellWidth$2(label);
			if (cells + w$1 > target) return {
				index: i,
				hit: {
					kind: "mention",
					index: mentionIndex
				}
			};
			cells += w$1;
			if (cells >= target) return {
				index: i + 1,
				hit: null
			};
			mentionIndex++;
			i += 1;
			continue;
		}
		const code = value.charCodeAt(i);
		if (code <= 127) {
			if (cells + 1 > target) return {
				index: i,
				hit: null
			};
			cells += 1;
			i += 1;
			if (cells >= target) return {
				index: i,
				hit: null
			};
			continue;
		}
		const cp = value.codePointAt(i) ?? 0;
		const seg = String.fromCodePoint(cp);
		const w = charCellWidth$1(seg);
		if (cells + w > target) return {
			index: i,
			hit: null
		};
		cells += w;
		i += seg.length;
		if (cells >= target) return {
			index: i,
			hit: null
		};
	}
	return {
		index: lineEnd,
		hit: null
	};
}
function buildInlineRow$1(value, displayValue, multilineToken, mentionToken, multilineTexts, mentions, lineStart, lineEnd, rowTextW, offX) {
	const windowStart = Math.max(0, Math.floor(offX));
	const windowEnd = windowStart + Math.max(0, Math.floor(rowTextW));
	let cells = 0;
	let tokenIndex = countMultilineTokens$1(value, multilineToken, lineStart);
	let mentionIndex = countMentionTokens$2(value, mentionToken, lineStart);
	let out = "";
	let outCells = 0;
	const chips = [];
	for (let i = lineStart; i < lineEnd;) {
		const ch = value[i];
		if (ch === "\n") {
			i += 1;
			continue;
		}
		let seg = "";
		let w = 0;
		let segLen = 0;
		let isToken = false;
		let tokenKind = null;
		let token = 0;
		let tokenAbsPath;
		if (ch === multilineToken) {
			seg = tokenLabelAt(multilineTexts, tokenIndex);
			w = textCellWidth$2(seg);
			segLen = 1;
			tokenKind = "multiline";
			token = tokenIndex;
			tokenIndex++;
			isToken = true;
		} else if (ch === mentionToken) {
			seg = mentionLabelAt(mentions, mentionIndex);
			w = textCellWidth$2(seg);
			segLen = 1;
			tokenKind = "mention";
			token = mentionIndex;
			tokenAbsPath = String(mentions?.[mentionIndex] ?? "");
			mentionIndex++;
			isToken = true;
		} else {
			const code = value.charCodeAt(i);
			if (code <= 127) {
				seg = displayValue[i] ?? value[i];
				segLen = 1;
				w = 1;
			} else {
				const cp = value.codePointAt(i) ?? 0;
				const rawSeg = String.fromCodePoint(cp);
				seg = displayValue.slice(i, i + rawSeg.length);
				segLen = rawSeg.length;
				w = charCellWidth$1(seg);
			}
		}
		const unitStart = cells;
		const unitEnd = cells + w;
		if (unitEnd <= windowStart) {
			cells = unitEnd;
			i += segLen;
			continue;
		}
		if (unitStart >= windowEnd) break;
		const visibleStart = Math.max(0, windowStart - unitStart);
		const visibleCells = Math.min(unitEnd, windowEnd) - Math.max(unitStart, windowStart);
		if (visibleCells > 0) {
			let visibleText = sliceByCellsWindow(seg, visibleStart, visibleCells);
			if (!visibleText && w > 1 && visibleStart > 0 && w <= rowTextW) visibleText = seg;
			out += visibleText;
			if (visibleText === seg) outCells += w;
			else outCells += visibleCells;
			if (isToken) {
				const chipStart = Math.max(unitStart, windowStart) - windowStart;
				chips.push({
					startCell: chipStart,
					label: visibleText,
					kind: tokenKind,
					index: token,
					...tokenAbsPath ? { absPath: tokenAbsPath } : {}
				});
			}
		}
		cells = unitEnd;
		i += segLen;
	}
	if (outCells < rowTextW) out += spaces$1(rowTextW - outCells);
	return {
		text: out,
		chips
	};
}
function buildInlineSelectionSegments$1(value, displayValue, multilineToken, mentionToken, multilineTexts, mentions, lineStart, lineEnd, selection, rowTextW, offX) {
	const windowStart = Math.max(0, Math.floor(offX));
	const windowEnd = windowStart + Math.max(0, Math.floor(rowTextW));
	let cells = 0;
	let tokenIndex = countMultilineTokens$1(value, multilineToken, lineStart);
	let mentionIndex = countMentionTokens$2(value, mentionToken, lineStart);
	const segments = [];
	for (let i = lineStart; i < lineEnd;) {
		const ch = value[i];
		if (ch === "\n") {
			i += 1;
			continue;
		}
		let seg = "";
		let w = 0;
		let segLen = 0;
		if (ch === multilineToken) {
			seg = tokenLabelAt(multilineTexts, tokenIndex);
			w = textCellWidth$1(seg);
			segLen = 1;
			tokenIndex++;
		} else if (ch === mentionToken) {
			seg = mentionLabelAt(mentions, mentionIndex);
			w = textCellWidth$1(seg);
			segLen = 1;
			mentionIndex++;
		} else {
			const cp = value.codePointAt(i) ?? 0;
			const rawSeg = String.fromCodePoint(cp);
			seg = displayValue.slice(i, i + rawSeg.length);
			segLen = rawSeg.length;
			w = charCellWidth$1(seg);
		}
		if (i >= selection.end || i + segLen <= selection.start) {
			cells += w;
			i += segLen;
			continue;
		}
		const unitStart = cells;
		const unitEnd = cells + w;
		const visibleStart = Math.max(0, windowStart - unitStart);
		const visibleCells = Math.min(unitEnd, windowEnd) - Math.max(unitStart, windowStart);
		const inWindow = unitEnd > windowStart && unitStart < windowEnd;
		if (inWindow && visibleCells > 0) {
			const visibleText = sliceByCellsWindow(seg, visibleStart, visibleCells);
			const segStartCell = Math.max(unitStart, windowStart) - windowStart;
			if (visibleText) segments.push({
				startCell: segStartCell,
				text: visibleText
			});
		}
		cells = unitEnd;
		i += segLen;
	}
	return segments;
}

//#endregion
//#region ../../src/vue/components/input/utils/primitives.ts
function clamp$8(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function isWhitespace(ch) {
	return ch === " " || ch === "	" || ch === "\n" || ch === "\r";
}
function isWordChar(ch) {
	return /^[\p{L}\p{N}_]$/u.test(ch);
}

//#endregion
//#region ../../src/vue/components/input/plugins/promptMentionState.ts
const MENTION_SUGGEST_DEBOUNCE_MS = 80;
function fuzzyScore(query, candidate) {
	const q = query.trim().toLowerCase();
	const c = candidate.toLowerCase();
	if (!q) return 0;
	if (c === q) return 1e4;
	let score = 0;
	if (c.startsWith(q)) score += 1e3;
	let qi = 0;
	let streak = 0;
	for (let ci = 0; ci < c.length && qi < q.length; ci++) if (c[ci] === q[qi]) {
		qi++;
		streak++;
		score += 10 + streak * 5;
	} else streak = 0;
	if (qi < q.length) return null;
	score += Math.max(0, 40 - c.length);
	return score;
}
function isMentionBoundary(ch, multilineToken, mentionToken) {
	if (ch === multilineToken || ch === mentionToken) return true;
	if (isWhitespace(ch)) return true;
	return /[,;:!?，。！？、()[\]{}<>]/.test(ch);
}
function isMentionStart(text, index, trigger, multilineToken, mentionToken) {
	if (!trigger || text[index] !== trigger) return false;
	if (index <= 0) return true;
	const prev = text[index - 1];
	return isMentionBoundary(prev, multilineToken, mentionToken) || !/\w/.test(prev);
}
function isMentionChar(ch) {
	return /^[\p{L}\p{M}\p{N}_./~\\:-]$/u.test(ch);
}
function computePromptContext(value, cursorIndex, triggers) {
	if (!triggers.length) return null;
	const idx = clamp$8(cursorIndex, 0, value.length);
	const lineStart = value.lastIndexOf("\n", Math.max(0, idx - 1)) + 1;
	let matchedTrigger = null;
	for (const t of triggers) if (t && value.slice(lineStart, lineStart + t.length) === t) {
		matchedTrigger = t;
		break;
	}
	if (!matchedTrigger) return null;
	let tokenEnd = value.length;
	for (let i = lineStart; i < value.length; i++) if (isWhitespace(value[i])) {
		tokenEnd = i;
		break;
	}
	if (idx < lineStart || idx > tokenEnd) return null;
	const tokenText = value.slice(lineStart, tokenEnd);
	const query = tokenText.slice(matchedTrigger.length);
	const key = `${lineStart}:${tokenText}`;
	return {
		tokenStart: lineStart,
		tokenEnd,
		tokenText,
		query,
		key,
		trigger: matchedTrigger
	};
}
function computeMentionContext(value, cursorIndex, trigger, multilineToken, mentionToken) {
	if (!trigger) return null;
	const idx = clamp$8(cursorIndex, 0, value.length);
	let start = -1;
	for (let i = idx - 1; i >= 0; i--) {
		const ch = value[i];
		if (isMentionStart(value, i, trigger, multilineToken, mentionToken)) {
			start = i;
			break;
		}
		if (isMentionBoundary(ch, multilineToken, mentionToken)) break;
	}
	if (start < 0) return null;
	let end = start + trigger.length;
	const next = value[end];
	if (next === "\"" || next === "'") {
		const quote = next;
		end += 1;
		while (end < value.length && value[end] !== quote) end++;
		if (end < value.length && value[end] === quote) end++;
	} else while (end < value.length && isMentionChar(value[end])) end++;
	if (idx < start || idx > end) return null;
	const tokenText = value.slice(start, end);
	const queryEnd = clamp$8(idx, start + trigger.length, end);
	const query = value.slice(start + trigger.length, queryEnd);
	const key = `${start}:${tokenText}`;
	return {
		tokenStart: start,
		tokenEnd: end,
		tokenText,
		query,
		key,
		trigger
	};
}
function usePromptMentionState(options) {
	const { props, mentionSuggestionProviders, mentionPathProvider, focused, cursor, getValue, rawAbsRect, terminal, scheduler, multilineToken, mentionToken } = options;
	const promptActive = ref(0);
	const promptSuppressedKey = ref(null);
	const providerList = mentionSuggestionProviders ?? [];
	const mentionKindVersion = ref(0);
	const mentionKindByPath = new Map();
	let mentionKindSeq = 0;
	function clearMentionKinds() {
		if (mentionKindByPath.size === 0) return;
		mentionKindByPath.clear();
		mentionKindVersion.value++;
		scheduler.invalidate();
	}
	watchEffect(() => {
		const list = (props.mentions ?? []).map((p) => String(p ?? "")).filter(Boolean).filter((p) => !isCommitMention(p));
		const statPath = mentionPathProvider?.stat;
		if (!statPath || list.length === 0) {
			clearMentionKinds();
			return;
		}
		const seq = ++mentionKindSeq;
		Promise.allSettled(list.map(async (absPath) => {
			const kind = await Promise.resolve(statPath(absPath));
			return {
				absPath,
				kind
			};
		})).then((results) => {
			if (seq !== mentionKindSeq) return;
			mentionKindByPath.clear();
			for (const r of results) {
				if (r.status !== "fulfilled") continue;
				if (!r.value.kind) continue;
				mentionKindByPath.set(r.value.absPath, r.value.kind);
			}
			mentionKindVersion.value++;
			scheduler.invalidate();
		}).catch(() => {
			if (seq !== mentionKindSeq) return;
			clearMentionKinds();
		});
	});
	const promptContext = computed(() => {
		if (!focused.value) return null;
		if (!props.promptSuggestions?.length) return null;
		const triggers = props.promptTriggers?.length ? props.promptTriggers : [props.promptTrigger || "/"];
		return computePromptContext(getValue(), cursor.value, triggers);
	});
	const mentionContext = computed(() => {
		if (!focused.value) return null;
		const hasStatic = props.mentionSuggestions?.length > 0;
		const hasDynamic = providerList.length > 0 || Boolean(mentionPathProvider?.suggest);
		if (!hasStatic && !hasDynamic) return null;
		return computeMentionContext(getValue(), cursor.value, props.mentionTrigger || "@", multilineToken, mentionToken);
	});
	const skillContext = computed(() => {
		if (!focused.value) return null;
		const trigger = props.skillTrigger;
		if (!trigger || !props.skillSuggestions?.length) return null;
		return computeMentionContext(getValue(), cursor.value, trigger, multilineToken, mentionToken);
	});
	const activeContext = computed(() => mentionContext.value ?? skillContext.value ?? promptContext.value);
	watch(() => activeContext.value?.key ?? null, (next, prev) => {
		if (prev && next !== prev) promptSuppressedKey.value = null;
	});
	const mentionPathItems = ref([]);
	let mentionSeq = 0;
	watchEffect((onCleanup) => {
		const ctx = mentionContext.value;
		const suggestPathsForMention = mentionPathProvider?.suggest;
		if (!ctx || !suggestPathsForMention) {
			mentionPathItems.value = [];
			return;
		}
		const seq = ++mentionSeq;
		const max = Math.max(0, Math.floor(props.mentionMaxItems));
		const q = ctx.query.trim();
		const maxDepth = q.length <= 1 ? 2 : q.length === 2 ? 4 : 8;
		let done = false;
		const timer = setTimeout(() => {
			Promise.resolve(suggestPathsForMention({
				workspaceAbs: props.mentionWorkspace,
				input: ctx.query,
				mode: props.mentionMode,
				max,
				showHidden: props.mentionShowHidden,
				maxDepth
			})).then((res) => {
				if (done || seq !== mentionSeq) return;
				mentionPathItems.value = (res ?? []).map((s) => ({
					value: `${props.mentionTrigger}${s.completion}`,
					insert: `${props.mentionTrigger}${s.completion} `,
					detail: s.kind,
					mentionValue: s.absPath
				}));
				scheduler.invalidate();
			}).catch(() => {
				if (done || seq !== mentionSeq) return;
				mentionPathItems.value = [];
				scheduler.invalidate();
			});
		}, MENTION_SUGGEST_DEBOUNCE_MS);
		onCleanup(() => {
			done = true;
			clearTimeout(timer);
		});
	});
	const mentionProviderItems = ref([]);
	let mentionProviderSeq = 0;
	watchEffect((onCleanup) => {
		const ctx = mentionContext.value;
		if (!ctx || providerList.length === 0) {
			mentionProviderItems.value = [];
			return;
		}
		const seq = ++mentionProviderSeq;
		const max = Math.max(0, Math.floor(props.mentionMaxItems));
		const trigger = props.mentionTrigger || "@";
		let done = false;
		const timer = setTimeout(() => {
			Promise.all(providerList.map((provider) => Promise.resolve(provider({
				query: ctx.query,
				tokenText: ctx.tokenText,
				trigger,
				workspace: props.mentionWorkspace,
				maxItems: max
			})).catch(() => []))).then((results) => {
				if (done || seq !== mentionProviderSeq) return;
				const merged = [];
				for (const list of results) {
					if (!list?.length) continue;
					merged.push(...list);
				}
				mentionProviderItems.value = merged;
				scheduler.invalidate();
			}).catch(() => {
				if (done || seq !== mentionProviderSeq) return;
				mentionProviderItems.value = [];
				scheduler.invalidate();
			});
		}, MENTION_SUGGEST_DEBOUNCE_MS);
		onCleanup(() => {
			done = true;
			clearTimeout(timer);
		});
	});
	const promptMatches = computed(() => {
		const ctx = activeContext.value;
		if (!ctx) return [];
		const mentionTrigger = props.mentionTrigger || "@";
		const skillTrigger = props.skillTrigger || "";
		const isMention = ctx.tokenText.startsWith(mentionTrigger);
		const isSkill = !isMention && Boolean(skillTrigger && ctx.tokenText.startsWith(skillTrigger));
		const trigger = isMention ? mentionTrigger : isSkill ? skillTrigger : ctx.trigger;
		const pathItems = isMention ? mentionPathItems.value : [];
		const candidates = isMention ? [...props.mentionSuggestions ?? [], ...mentionProviderItems.value] : isSkill ? props.skillSuggestions ?? [] : props.promptSuggestions ?? [];
		const q = ctx.query.trim();
		const pathMatches = [];
		for (let i = 0; i < pathItems.length; i++) {
			const s = pathItems[i];
			const value = s.value || "";
			if (!value.startsWith(trigger)) continue;
			pathMatches.push({
				item: s,
				score: 0,
				order: i
			});
		}
		const otherMatches = [];
		for (let i = 0; i < candidates.length; i++) {
			const s = candidates[i];
			const value = s.value || "";
			if (!value.startsWith(trigger)) continue;
			if (!q) {
				otherMatches.push({
					item: s,
					score: 0,
					order: i
				});
				continue;
			}
			const commandText = value.slice(trigger.length);
			const valueScore = fuzzyScore(q, commandText);
			if (valueScore != null) {
				otherMatches.push({
					item: s,
					score: valueScore + 1e3,
					order: i
				});
				continue;
			}
			if (!/[^\u0000-\u007F]/.test(q)) continue;
			const metaText = [
				s.label ?? "",
				s.detail ?? "",
				...s.keywords ?? []
			].join(" ");
			const metaScore = fuzzyScore(q, metaText);
			if (metaScore != null) otherMatches.push({
				item: s,
				score: metaScore,
				order: i
			});
		}
		if (!q) return [...pathMatches, ...otherMatches];
		otherMatches.sort((a, b) => b.score - a.score || a.order - b.order);
		return [...pathMatches, ...otherMatches];
	});
	watch(() => promptMatches.value.length, (len) => {
		promptActive.value = clamp$8(promptActive.value, 0, Math.max(0, len - 1));
	});
	const promptMaxVisible = computed(() => {
		const ctx = activeContext.value;
		if (!ctx) return 0;
		const mentionTrigger = props.mentionTrigger || "@";
		const isMention = ctx.tokenText.startsWith(mentionTrigger);
		return Math.max(0, Math.floor(isMention ? props.mentionMaxItems : props.promptMaxItems));
	});
	const promptWindowStart = computed(() => {
		const total = promptMatches.value.length;
		const maxVisible = promptMaxVisible.value;
		if (total <= 0 || maxVisible <= 0) return 0;
		const visible = Math.min(maxVisible, total);
		const maxStart = Math.max(0, total - visible);
		return clamp$8(promptActive.value - (visible - 1), 0, maxStart);
	});
	const promptMatchesVisible = computed(() => {
		const total = promptMatches.value.length;
		const maxVisible = promptMaxVisible.value;
		if (total <= 0 || maxVisible <= 0) return [];
		const visible = Math.min(maxVisible, total);
		const start = promptWindowStart.value;
		return promptMatches.value.slice(start, start + visible);
	});
	const promptActiveVisible = computed(() => {
		const start = promptWindowStart.value;
		const rel = promptActive.value - start;
		return clamp$8(rel, 0, Math.max(0, promptMatchesVisible.value.length - 1));
	});
	const promptVisible = computed(() => {
		const ctx = activeContext.value;
		if (!ctx) return false;
		if (promptSuppressedKey.value && promptSuppressedKey.value === ctx.key) return false;
		return true;
	});
	const promptRect = computed(() => {
		const base = rawAbsRect.value;
		const s = terminal.size();
		const clip = {
			x: 0,
			y: 0,
			w: s.cols,
			h: s.rows
		};
		const listH = Math.max(1, promptMatchesVisible.value.length || 1);
		const h$1 = clamp$8(2 + listH, 3, Math.max(3, Math.floor(clip.h)));
		const w = clamp$8(Math.floor(base.w), 0, Math.max(0, Math.floor(clip.w)));
		const preferAboveY = Math.floor(base.y) - h$1;
		const preferBelowY = Math.floor(base.y) + Math.floor(base.h);
		const aboveFits = preferAboveY >= Math.floor(clip.y);
		const belowFits = preferBelowY + h$1 <= Math.floor(clip.y) + Math.floor(clip.h);
		const yPref = aboveFits ? preferAboveY : belowFits ? preferBelowY : preferAboveY;
		const y = clamp$8(yPref, Math.floor(clip.y), Math.floor(clip.y) + Math.floor(clip.h) - h$1);
		const align = props.promptAlign || "input";
		const baseX = Math.floor(base.x);
		const centeredX = Math.floor(Math.floor(clip.x) + Math.floor((Math.floor(clip.w) - w) / 2));
		const preferX = align === "center" ? centeredX : baseX;
		const x = clamp$8(preferX, Math.floor(clip.x), Math.floor(clip.x) + Math.floor(clip.w) - w);
		return {
			x,
			y,
			w,
			h: h$1
		};
	});
	return {
		promptActive,
		promptSuppressedKey,
		mentionKindByPath,
		mentionKindVersion,
		promptContext,
		mentionContext,
		activeContext,
		promptMatches,
		promptMatchesVisible,
		promptWindowStart,
		promptActiveVisible,
		promptVisible,
		promptRect
	};
}

//#endregion
//#region ../../src/vue/components/input/plugins/promptMentionPlugin.ts
function computeHighlightRanges(text, query) {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const t = text.toLowerCase();
	const idx = t.indexOf(q);
	if (idx >= 0) return [{
		start: idx,
		end: idx + q.length
	}];
	const positions = [];
	let qi = 0;
	for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) {
		positions.push(i);
		qi++;
	}
	if (qi < q.length) return [];
	const ranges = [];
	let start = positions[0];
	let prev = positions[0];
	for (let i = 1; i < positions.length; i++) {
		const pos = positions[i];
		if (pos === prev + 1) {
			prev = pos;
			continue;
		}
		ranges.push({
			start,
			end: prev + 1
		});
		start = pos;
		prev = pos;
	}
	ranges.push({
		start,
		end: prev + 1
	});
	return ranges;
}
function writeHighlightedText(opts) {
	const { text, ranges, x, y, maxCells, baseStyle, highlightStyle, terminal } = opts;
	const safeMax = Math.max(0, Math.floor(maxCells));
	if (!text || safeMax <= 0) return 0;
	let rangeIndex = 0;
	let activeRange = ranges[rangeIndex];
	let cellPos = 0;
	let cursorX = x;
	let buffer = "";
	let currentStyle = baseStyle;
	const flush = () => {
		if (!buffer) return;
		terminal.write(buffer, {
			x: cursorX,
			y,
			style: currentStyle
		});
		cursorX += textCellWidth$1(buffer);
		buffer = "";
	};
	for (let i = 0; i < text.length && cellPos < safeMax;) {
		const code = text.charCodeAt(i);
		const seg = code <= 127 ? text[i] : String.fromCodePoint(text.codePointAt(i) ?? 0);
		const segLen = seg.length;
		const segWidth = charCellWidth$1(seg);
		if (cellPos + segWidth > safeMax) break;
		while (activeRange && activeRange.end <= i) {
			rangeIndex++;
			activeRange = ranges[rangeIndex];
		}
		const isHighlighted = Boolean(activeRange && i < activeRange.end && i + segLen > activeRange.start);
		const nextStyle = isHighlighted ? highlightStyle : baseStyle;
		if (nextStyle !== currentStyle) {
			flush();
			currentStyle = nextStyle;
		}
		buffer += seg;
		cellPos += segWidth;
		i += segLen;
	}
	flush();
	return cellPos;
}
function buildPromptMatchHighlightStyle(baseStyle) {
	return {
		...baseStyle,
		fg: "yellow",
		bold: true,
		dim: false
	};
}
function countMentionTokens$1(value, mentionToken, endIndex = value.length) {
	let count = 0;
	const limit = clamp$8(endIndex, 0, value.length);
	for (let i = 0; i < limit; i++) if (value[i] === mentionToken) count++;
	return count;
}
function mentionIndexAt$1(value, mentionToken, index) {
	return countMentionTokens$1(value, mentionToken, index);
}
function createPromptMentionPlugin(options = {}) {
	return {
		name: "promptMention",
		install: (ctx) => {
			const getProps = () => ctx.getProps();
			const promptOverlayStack = ctx.render.createStack(ctx.render.rootStack, 1e4);
			let lastTopClampedRect = null;
			let lastPromptRect = null;
			const derivedStyleCache = new WeakMap();
			const reactiveProps = reactive({
				promptSuggestions: getProps().promptSuggestions,
				promptTrigger: getProps().promptTrigger,
				promptTriggers: getProps().promptTriggers,
				promptMaxItems: getProps().promptMaxItems,
				promptAlign: getProps().promptAlign,
				mentionTrigger: getProps().mentionTrigger,
				mentionWorkspace: getProps().mentionWorkspace,
				mentionMode: getProps().mentionMode,
				mentionShowHidden: getProps().mentionShowHidden,
				mentionSuggestions: getProps().mentionSuggestions,
				mentionMaxItems: getProps().mentionMaxItems,
				mentions: getProps().mentions,
				skillTrigger: getProps().skillTrigger,
				skillSuggestions: getProps().skillSuggestions
			});
			watchEffect(() => {
				const p = getProps();
				reactiveProps.promptSuggestions = p.promptSuggestions;
				reactiveProps.promptTrigger = p.promptTrigger;
				reactiveProps.promptTriggers = p.promptTriggers;
				reactiveProps.promptMaxItems = p.promptMaxItems;
				reactiveProps.promptAlign = p.promptAlign;
				reactiveProps.mentionTrigger = p.mentionTrigger;
				reactiveProps.mentionWorkspace = p.mentionWorkspace;
				reactiveProps.mentionMode = p.mentionMode;
				reactiveProps.mentionShowHidden = p.mentionShowHidden;
				reactiveProps.mentionSuggestions = p.mentionSuggestions;
				reactiveProps.mentionMaxItems = p.mentionMaxItems;
				reactiveProps.mentions = p.mentions;
				reactiveProps.skillTrigger = p.skillTrigger;
				reactiveProps.skillSuggestions = p.skillSuggestions;
			});
			const promptMention = usePromptMentionState({
				props: reactiveProps,
				mentionSuggestionProviders: options.mentionSuggestionProviders,
				mentionPathProvider: options.mentionPathProvider,
				focused: ctx.focused,
				cursor: ctx.cursor,
				getValue: ctx.getValue,
				rawAbsRect: ctx.rawAbsRect,
				terminal: ctx.terminal,
				scheduler: ctx.scheduler,
				multilineToken: "￼",
				mentionToken: ctx.mentionToken
			});
			watch(() => promptMention.promptVisible.value, (visible, prevVisible) => {
				if (prevVisible && !visible) {
					ctx.render.invalidatePlane("default");
					ctx.scheduler.invalidate();
				}
			});
			ctx.registerChipStyleProvider({
				getStyle: (baseStyle, chip) => {
					if (chip.kind !== "mention") return null;
					const absPath = String(chip.absPath ?? "");
					if (!absPath) return null;
					const fsKind = promptMention.mentionKindByPath.get(absPath);
					return mentionChipStyle(baseStyle, absPath, fsKind);
				},
				version: promptMention.mentionKindVersion
			});
			function replaceMentionInContext(absPath, tokenStart, tokenEnd) {
				const cleaned = String(absPath || "").trim();
				if (!cleaned) return;
				const value = ctx.getValue();
				const start = clamp$8(tokenStart, 0, value.length);
				const end = clamp$8(tokenEnd, start, value.length);
				const currentMentions = getProps().mentions ?? [];
				const nextMentions = [...currentMentions];
				let before = value.slice(0, start);
				let after = value.slice(end);
				const closeMatch = after.match(/^[\s\u200B]*\]+/u);
				if (closeMatch) {
					after = after.slice(closeMatch[0].length);
					let i = before.length - 1;
					while (i >= 0 && /[\s\u200B]/u.test(before[i])) i--;
					if (i >= 0 && before[i] === "[") before = before.slice(0, i) + before.slice(i + 1);
				}
				const insertIndex = mentionIndexAt$1(value, ctx.mentionToken, start);
				nextMentions.splice(insertIndex, 0, cleaned);
				ctx.emit("update:mentions", nextMentions);
				let nextAfter = after;
				if (nextAfter.startsWith(" ")) nextAfter = nextAfter.slice(1);
				const nextValue = `${before}${ctx.mentionToken} ${nextAfter}`;
				const nextCursor = before.length + 2;
				ctx.pushUndoSnapshot(nextValue);
				ctx.applyEdit(nextValue, nextCursor);
			}
			function acceptPrompt(index) {
				const ctx0 = promptMention.activeContext.value;
				if (!ctx0) return;
				const list = promptMention.promptMatches.value;
				const match = list[clamp$8(index, 0, Math.max(0, list.length - 1))];
				if (!match) return;
				const suggestion = match.item;
				const mentionTrigger = getProps().mentionTrigger || "@";
				const isMention = ctx0.tokenText.startsWith(mentionTrigger);
				if (isMention) {
					if (!getProps().collectMentions || suggestion.mentionBehavior === "inline") {
						const insert$1 = suggestion.insert ?? (suggestion.value.endsWith(" ") ? suggestion.value : `${suggestion.value} `);
						const before$1 = ctx.getValue().slice(0, ctx0.tokenStart);
						let after$1 = ctx.getValue().slice(ctx0.tokenEnd);
						if (insert$1.endsWith(" ") && after$1.startsWith(" ")) after$1 = after$1.slice(1);
						const nextValue$1 = `${before$1}${insert$1}${after$1}`;
						const nextCursor$1 = ctx0.tokenStart + insert$1.length;
						promptMention.promptSuppressedKey.value = null;
						ctx.pushUndoSnapshot(nextValue$1);
						ctx.applyEdit(nextValue$1, nextCursor$1);
						return;
					}
					const mentionValue = typeof suggestion.mentionValue === "string" ? String(suggestion.mentionValue) : "";
					const raw = mentionValue || (String(suggestion.value || "").startsWith(mentionTrigger) ? String(suggestion.value).slice(mentionTrigger.length) : String(suggestion.value));
					const absPath = mentionValue ? raw : getProps().mentionWorkspace ? ctx.resolvePath(raw) : raw;
					if (!absPath) {
						promptMention.promptSuppressedKey.value = null;
						return;
					}
					replaceMentionInContext(absPath, ctx0.tokenStart, ctx0.tokenEnd);
					promptMention.promptSuppressedKey.value = null;
					ctx.scheduler.invalidate();
					return;
				}
				if (typeof suggestion.onSelect === "function") {
					const handled = suggestion.onSelect({
						value: suggestion.value,
						query: ctx0.query
					});
					if (handled !== false) {
						promptMention.promptSuppressedKey.value = ctx0.key;
						ctx.scheduler.invalidate();
						return;
					}
				}
				const insert = suggestion.insert ?? (suggestion.value.endsWith(" ") ? suggestion.value : `${suggestion.value} `);
				const before = ctx.getValue().slice(0, ctx0.tokenStart);
				let after = ctx.getValue().slice(ctx0.tokenEnd);
				if (insert.endsWith(" ") && after.startsWith(" ")) after = after.slice(1);
				const nextValue = `${before}${insert}${after}`;
				const nextCursor = ctx0.tokenStart + insert.length;
				promptMention.promptSuppressedKey.value = null;
				ctx.pushUndoSnapshot(nextValue);
				ctx.applyEdit(nextValue, nextCursor);
			}
			function completeMentionDirectory(suggestion, ctx0) {
				const mentionTrigger = getProps().mentionTrigger || "@";
				if (!ctx0.tokenText.startsWith(mentionTrigger)) return false;
				if (String(suggestion.detail ?? "") !== "directory") return false;
				let insert = String(suggestion.value ?? "");
				if (!insert.startsWith(mentionTrigger)) return false;
				if (!insert.endsWith("/") && !insert.endsWith("\\")) insert = `${insert}/`;
				const value = ctx.getValue();
				const before = value.slice(0, clamp$8(ctx0.tokenStart, 0, value.length));
				const after = value.slice(clamp$8(ctx0.tokenEnd, 0, value.length));
				const nextValue = `${before}${insert}${after}`;
				const nextCursor = before.length + insert.length;
				promptMention.promptSuppressedKey.value = null;
				promptMention.promptActive.value = 0;
				ctx.pushUndoSnapshot(nextValue);
				ctx.applyEdit(nextValue, nextCursor);
				ctx.scheduler.invalidate();
				return true;
			}
			function handlePromptKeydown(e) {
				if (!promptMention.promptVisible.value) return false;
				const len = promptMention.promptMatches.value.length;
				if (e.key === "ArrowDown") {
					e.preventDefault();
					if (len <= 0) promptMention.promptActive.value = 0;
					else if (promptMention.promptActive.value >= len - 1) promptMention.promptActive.value = 0;
					else promptMention.promptActive.value = clamp$8(promptMention.promptActive.value + 1, 0, len - 1);
					ctx.scheduler.invalidate();
					return true;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					if (len <= 0) promptMention.promptActive.value = 0;
					else if (promptMention.promptActive.value <= 0) promptMention.promptActive.value = len - 1;
					else promptMention.promptActive.value = clamp$8(promptMention.promptActive.value - 1, 0, len - 1);
					ctx.scheduler.invalidate();
					return true;
				}
				if (e.key === "Tab" || e.key === "Enter" && !e.shiftKey) {
					const ctx0 = promptMention.activeContext.value;
					const mentionTrigger = getProps().mentionTrigger || "@";
					const skillTrigger = getProps().skillTrigger || "";
					const isMention = Boolean(ctx0?.tokenText?.startsWith(mentionTrigger));
					const isSkill = Boolean(skillTrigger && ctx0?.tokenText?.startsWith(skillTrigger) && !isMention);
					if (e.key === "Enter" && !e.shiftKey && !isMention && !isSkill) {
						if (len === 0) return false;
						const match = promptMention.promptMatches.value[clamp$8(promptMention.promptActive.value, 0, Math.max(0, promptMention.promptMatches.value.length - 1))];
						const typed = String(ctx0?.tokenText ?? "");
						const candidate = String(match?.item?.value ?? "");
						if (!typed || !candidate.startsWith(typed)) return false;
						e.preventDefault();
						acceptPrompt(promptMention.promptActive.value);
						return true;
					}
					if (e.key === "Tab" && (isMention || isSkill)) {
						e.preventDefault();
						if (len === 0) return true;
						const list = promptMention.promptMatches.value;
						const match = list[clamp$8(promptMention.promptActive.value, 0, Math.max(0, list.length - 1))];
						if (isMention && match && ctx0 && completeMentionDirectory(match.item, ctx0)) return true;
						acceptPrompt(promptMention.promptActive.value);
						return true;
					}
					if (len === 0) return false;
					e.preventDefault();
					acceptPrompt(promptMention.promptActive.value);
					return true;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					promptMention.promptSuppressedKey.value = promptMention.activeContext.value?.key ?? null;
					ctx.scheduler.invalidate();
					return true;
				}
				return false;
			}
			ctx.registerKeydownInterceptor(handlePromptKeydown);
			useRenderNode(() => ({
				zIndex: getProps().zIndex + 5,
				stack: promptOverlayStack,
				dirtyRowsHint: (() => {
					const currentRect = ctx.visible.value && promptMention.promptVisible.value ? {
						y: Math.floor(promptMention.promptRect.value.y),
						h: Math.max(0, Math.floor(promptMention.promptRect.value.h))
					} : null;
					const rects = [lastPromptRect, currentRect].filter(Boolean);
					if (!rects.length) return void 0;
					const maxRows = ctx.terminal.size().rows;
					const start = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - 1);
					const end = Math.min(maxRows, Math.max(...rects.map((rect) => rect.y + rect.h)) + 1);
					if (end <= start) return void 0;
					return Array.from({ length: end - start }, (_, index) => start + index);
				})(),
				priority: "high",
				rect: ctx.visible.value && promptMention.promptVisible.value ? promptMention.promptRect.value : {
					x: 0,
					y: 0,
					w: 0,
					h: 0
				},
				deps: [
					ctx.visible.value,
					promptMention.promptVisible.value,
					promptMention.promptRect.value,
					promptMention.promptMatches.value,
					promptMention.promptMatchesVisible.value,
					promptMention.promptWindowStart.value,
					promptMention.promptActive.value,
					promptMention.promptActiveVisible.value,
					getProps().style,
					getProps().promptSelectedStyle,
					getProps().zIndex,
					ctx.defaultStyle.value,
					promptMention.mentionKindVersion.value
				],
				paint: () => {
					if (!ctx.visible.value || !promptMention.promptVisible.value) return;
					const r = promptMention.promptRect.value;
					if (r.w < 3 || r.h < 3) return;
					lastPromptRect = {
						y: Math.floor(r.y),
						h: Math.max(0, Math.floor(r.h))
					};
					const base = getProps().style ?? ctx.defaultStyle.value;
					const selectedOverride = { bg: "blue" };
					const styleKey = base && typeof base === "object" ? base : null;
					const cacheKey = selectedOverride ? null : styleKey;
					let derived = cacheKey ? derivedStyleCache.get(cacheKey) : null;
					if (!derived) {
						const borderStyle$1 = {
							...base,
							dim: true
						};
						const itemStyle = { ...base };
						const selectedStyle = selectedOverride ? {
							...base,
							...selectedOverride
						} : {
							...base,
							bg: "blackBright"
						};
						const detailStyle = {
							...base,
							dim: true
						};
						const selectedDetailStyle = selectedOverride ? { ...selectedStyle } : {
							...selectedStyle,
							dim: true
						};
						const emptyStyle = {
							...base,
							dim: true
						};
						derived = {
							borderStyle: borderStyle$1,
							itemStyle,
							selectedStyle,
							detailStyle,
							selectedDetailStyle,
							emptyStyle
						};
						if (cacheKey) derivedStyleCache.set(cacheKey, derived);
					}
					const x0 = Math.floor(r.x);
					const y0 = Math.floor(r.y);
					const w = Math.max(0, Math.floor(r.w));
					const h$1 = Math.max(0, Math.floor(r.h));
					const innerW = Math.max(0, w - 2);
					const sidePad = innerW >= 4 ? 1 : 0;
					const contentW = Math.max(0, innerW - sidePad * 2);
					const contentX = x0 + 1 + sidePad;
					const borderStyle = derived.borderStyle;
					if (lastTopClampedRect && y0 > 0) {
						ctx.terminal.write(spaces$1(lastTopClampedRect.w), {
							x: lastTopClampedRect.x,
							y: 0,
							style: getProps().style ?? ctx.defaultStyle.value
						});
						lastTopClampedRect = null;
					}
					if (y0 === 0) lastTopClampedRect = {
						x: x0,
						w
					};
					else lastTopClampedRect = null;
					ctx.terminal.write(`┌${repeatChar("─", innerW)}┐`, {
						x: x0,
						y: y0,
						style: borderStyle
					});
					ctx.terminal.write(`└${repeatChar("─", innerW)}┘`, {
						x: x0,
						y: y0 + h$1 - 1,
						style: borderStyle
					});
					const totalList = promptMention.promptMatches.value;
					const start = promptMention.promptWindowStart.value;
					const list = promptMention.promptMatchesVisible.value;
					const query = promptMention.activeContext.value?.query ?? "";
					const total = totalList.length;
					const visible = list.length;
					const hasAbove = start > 0;
					const hasBelow = start + visible < total;
					const contentH = Math.max(0, h$1 - 2);
					for (let row = 0; row < contentH; row++) {
						const y = y0 + 1 + row;
						ctx.terminal.put(x0, y, "│", borderStyle);
						const rightBorderChar = row === 0 && hasAbove ? "▲" : row === contentH - 1 && hasBelow ? "▼" : "│";
						ctx.terminal.put(x0 + w - 1, y, rightBorderChar, borderStyle);
						if (row >= list.length) {
							ctx.terminal.write(spaces$1(innerW), {
								x: x0 + 1,
								y,
								style: borderStyle
							});
							continue;
						}
						const match = list[row];
						const isSelected = row === promptMention.promptActiveVisible.value;
						const rawValue = sanitizeInlineText(match.item.value);
						const rawDetail = match.item.detail ? sanitizeInlineText(match.item.detail) : "";
						const highlightRanges = query ? computeHighlightRanges(rawValue, query) : [];
						const valueCells = textCellWidth$1(rawValue);
						const detailCells = rawDetail ? textCellWidth$1(rawDetail) : 0;
						const minGap = 2;
						const availableForDetail = contentW - valueCells - minGap;
						if (rawDetail && availableForDetail >= 4) {
							const valueStyle = isSelected ? derived.selectedStyle : derived.itemStyle;
							const highlightStyle = buildPromptMatchHighlightStyle(valueStyle);
							const rowStyle = valueStyle;
							if (sidePad > 0) ctx.terminal.write(spaces$1(sidePad), {
								x: x0 + 1,
								y,
								style: rowStyle
							});
							writeHighlightedText({
								text: rawValue,
								ranges: highlightRanges,
								x: contentX,
								y,
								maxCells: valueCells,
								baseStyle: valueStyle,
								highlightStyle,
								terminal: ctx.terminal
							});
							const gapWidth = contentW - valueCells - Math.min(detailCells, availableForDetail);
							const gapStyle = isSelected ? derived.selectedStyle : derived.itemStyle;
							ctx.terminal.write(spaces$1(gapWidth), {
								x: contentX + valueCells,
								y,
								style: gapStyle
							});
							const detailText = sliceByCellsWindow(rawDetail, 0, availableForDetail);
							const dStyle = isSelected ? derived.selectedDetailStyle : derived.detailStyle;
							ctx.terminal.write(detailText, {
								x: contentX + valueCells + gapWidth,
								y,
								style: dStyle
							});
							if (sidePad > 0) ctx.terminal.write(spaces$1(sidePad), {
								x: contentX + contentW,
								y,
								style: rowStyle
							});
						} else {
							const style = isSelected ? derived.selectedStyle : derived.itemStyle;
							const highlightStyle = buildPromptMatchHighlightStyle(style);
							if (sidePad > 0) ctx.terminal.write(spaces$1(sidePad), {
								x: x0 + 1,
								y,
								style
							});
							const clippedValue = sliceByCellsWindow(rawValue, 0, contentW);
							const usedCells = writeHighlightedText({
								text: clippedValue,
								ranges: highlightRanges,
								x: contentX,
								y,
								maxCells: contentW,
								baseStyle: style,
								highlightStyle,
								terminal: ctx.terminal
							});
							if (usedCells < contentW) ctx.terminal.write(spaces$1(contentW - usedCells), {
								x: contentX + usedCells,
								y,
								style
							});
							if (sidePad > 0) ctx.terminal.write(spaces$1(sidePad), {
								x: contentX + contentW,
								y,
								style
							});
						}
					}
					if (list.length === 0 && contentH > 0) {
						const y = y0 + 1;
						ctx.terminal.put(x0, y, "│", borderStyle);
						ctx.terminal.put(x0 + w - 1, y, "│", borderStyle);
						const msg = padEndByCells$1(sliceByCellsWindow("(no matches)", 0, contentW), contentW);
						if (sidePad > 0) ctx.terminal.write(spaces$1(sidePad), {
							x: x0 + 1,
							y,
							style: derived.emptyStyle
						});
						ctx.terminal.write(msg, {
							x: contentX,
							y,
							style: derived.emptyStyle
						});
						if (sidePad > 0) ctx.terminal.write(spaces$1(sidePad), {
							x: contentX + contentW,
							y,
							style: derived.emptyStyle
						});
					}
				}
			}));
			useTerminalNode(() => ({
				rect: promptMention.promptVisible.value ? promptMention.promptRect.value : {
					x: 0,
					y: 0,
					w: 0,
					h: 0
				},
				zIndex: ctx.eventZ.value + 1e4,
				visible: ctx.visible.value && promptMention.promptVisible.value,
				focusable: false,
				handlers: { click: (e) => {
					const r = promptMention.promptRect.value;
					const y = e.cellY - r.y;
					if (y <= 0 || y >= r.h - 1) return;
					const idx = y - 1;
					const start = promptMention.promptWindowStart.value;
					const globalIdx = start + idx;
					promptMention.promptActive.value = clamp$8(globalIdx, 0, Math.max(0, promptMention.promptMatches.value.length - 1));
					acceptPrompt(promptMention.promptActive.value);
				} }
			}));
			watchEffect(() => {
				getProps().mentions;
				promptMention.mentionKindVersion.value;
			});
		}
	};
}

//#endregion
//#region ../../src/vue/composables/use-layout.ts
function useLayout$1() {
	const ctx = inject(LayoutContextKey, null);
	if (!ctx) throw new Error("LayoutContext is missing (TerminalProvider/TView)");
	return ctx;
}

//#endregion
//#region ../../src/vue/composables/use-visibility.ts
const VUE_TERMINAL_SHOW_CB = "__vueTerminalOnShow";
let vShowPatched = false;
function patchVShow() {
	if (vShowPatched) return;
	vShowPatched = true;
	const dir = vShow;
	const origBeforeMount = dir.beforeMount;
	const origUpdated = dir.updated;
	const origBeforeUnmount = dir.beforeUnmount;
	const notify = (el, value) => {
		if (!el || typeof el !== "object") return;
		const cb = el[VUE_TERMINAL_SHOW_CB];
		cb?.(Boolean(value));
	};
	if (typeof origBeforeMount === "function") dir.beforeMount = (el, binding, vnode) => {
		origBeforeMount(el, binding, vnode);
		notify(el, binding?.value);
	};
	if (typeof origUpdated === "function") dir.updated = (el, binding, vnode) => {
		origUpdated(el, binding, vnode);
		notify(el, binding?.value);
	};
	if (typeof origBeforeUnmount === "function") dir.beforeUnmount = (el, binding, vnode) => {
		origBeforeUnmount(el, binding, vnode);
		notify(el, binding?.value);
	};
}
const PLACEHOLDER_STYLE = Object.freeze({
	position: "absolute",
	left: "-9999px",
	top: "0",
	width: "0",
	height: "0",
	overflow: "hidden"
});
function useVisibility(options) {
	patchVShow();
	const { scheduler } = useTerminal$1();
	const parentVisible = inject(VisibilityContextKey, ref(true));
	const localVisible = ref(true);
	const visible = computed(() => parentVisible.value && localVisible.value);
	if (options?.provide) provide(VisibilityContextKey, visible);
	const onShow = (value) => {
		localVisible.value = value;
		scheduler.invalidate();
	};
	const rootProps = {
		style: PLACEHOLDER_STYLE,
		onVnodeBeforeMount: (vnode) => {
			const el = vnode.el;
			if (el && typeof el === "object") el[VUE_TERMINAL_SHOW_CB] = onShow;
		},
		onVnodeBeforeUnmount: (vnode) => {
			const el = vnode.el;
			if (el && typeof el === "object" && el[VUE_TERMINAL_SHOW_CB] === onShow) delete el[VUE_TERMINAL_SHOW_CB];
		}
	};
	return {
		visible,
		rootProps
	};
}

//#endregion
//#region ../../src/vue/utils/rect.ts
function intersectRect(a, b) {
	const x0 = Math.max(a.x, b.x);
	const y0 = Math.max(a.y, b.y);
	const x1 = Math.min(a.x + a.w, b.x + b.w);
	const y1 = Math.min(a.y + a.h, b.y + b.h);
	if (x1 <= x0 || y1 <= y0) return null;
	return {
		x: x0,
		y: y0,
		w: x1 - x0,
		h: y1 - y0
	};
}
function translateRect(rect, dx, dy) {
	return {
		x: rect.x + dx,
		y: rect.y + dy,
		w: rect.w,
		h: rect.h
	};
}

//#endregion
//#region ../../src/vue/components/TText.ts
function fitText(text, max) {
	if (max <= 0) return "";
	text = sanitizeInlineText(text);
	return sliceByCells$1(text, max);
}
function splitLines(text) {
	return sanitizeTextBlock(text).split("\n");
}
function computeDefaultWidth(text) {
	const lines = splitLines(text);
	let max = 0;
	for (const line of lines) max = Math.max(max, textCellWidth$2(line));
	return max;
}
const TText$1 = defineComponent({
	name: "TText",
	props: {
		x: {
			type: Number,
			required: true
		},
		y: {
			type: Number,
			required: true
		},
		zIndex: {
			type: Number,
			default: 0
		},
		value: {
			type: String,
			required: true
		},
		w: {
			type: Number,
			default: void 0
		},
		h: {
			type: Number,
			default: void 0
		},
		style: {
			type: Object,
			default: void 0
		},
		clear: {
			type: Boolean,
			default: true
		},
		wrap: {
			type: Boolean,
			default: false
		},
		depsKey: {
			type: null,
			default: void 0
		}
	},
	setup(props) {
		const { terminal, defaultStyle } = useTerminal$1();
		const layout = useLayout$1();
		const { visible, rootProps } = useVisibility();
		const defaultWidth = computed(() => computeDefaultWidth(props.value));
		const lines = computed(() => {
			const w = props.w ?? defaultWidth.value;
			if (w <= 0) return [""];
			if (!props.wrap) return splitLines(props.value).map((l) => fitText(l, w));
			const safe = sanitizeTextBlock(props.value);
			return wrapByCells$1(safe, w).map((l) => fitText(l, w));
		});
		const absRect = computed(() => {
			const width = props.w ?? defaultWidth.value;
			const height = props.h ?? (props.wrap ? lines.value.length || 1 : lines.value.length || 1);
			const raw = {
				x: props.x,
				y: props.y,
				w: width,
				h: height
			};
			const translated = translateRect(raw, layout.originX, layout.originY);
			if (!layout.clipRect) return translated;
			return intersectRect(translated, layout.clipRect) ?? {
				x: 0,
				y: 0,
				w: 0,
				h: 0
			};
		});
		const fullRect = computed(() => {
			const width = props.w ?? defaultWidth.value;
			const height = props.h ?? (props.wrap ? lines.value.length || 1 : lines.value.length || 1);
			return translateRect({
				x: props.x,
				y: props.y,
				w: width,
				h: height
			}, layout.originX, layout.originY);
		});
		useRenderNode(() => ({
			zIndex: props.zIndex,
			rect: visible.value ? absRect.value : {
				x: 0,
				y: 0,
				w: 0,
				h: 0
			},
			deps: [
				visible.value,
				absRect.value,
				fullRect.value,
				props.value,
				props.w,
				props.h,
				props.wrap,
				props.style,
				defaultStyle.value,
				props.depsKey
			],
			paint: (dirtyRows) => {
				if (!visible.value) return;
				const r = absRect.value;
				if (r.w <= 0 || r.h <= 0) return;
				const full = fullRect.value;
				const style = props.style ?? defaultStyle.value;
				const blank = props.clear ? spaces$1(r.w) : "";
				const out = lines.value;
				const dx = Math.max(0, Math.floor(r.x - full.x));
				const fullY = Math.floor(full.y);
				const paintRow = (y) => {
					const relY = y - r.y;
					if (relY < 0 || relY >= r.h) return;
					const i = y - fullY;
					if (i < 0 || i >= out.length) {
						if (props.clear) terminal.write(blank, {
							x: r.x,
							y,
							style
						});
						return;
					}
					const src = out[i] ?? "";
					const clipped = dx > 0 ? sliceByCellsRange(src, dx, dx + r.w) : sliceByCells$1(src, r.w);
					terminal.write(padEndByCells$2(clipped, r.w), {
						x: r.x,
						y,
						style
					});
				};
				if (!dirtyRows) {
					for (let i = 0; i < r.h; i++) paintRow(r.y + i);
					return;
				}
				for (const y of dirtyRows) paintRow(y);
			}
		}));
		return () => h("span", rootProps);
	}
});

//#endregion
//#region ../../src/vue/components/TView.ts
const EMPTY_RECT = Object.freeze({
	x: 0,
	y: 0,
	w: 0,
	h: 0
});
const TView$1 = defineComponent({
	name: "TView",
	props: {
		x: {
			type: Number,
			required: true
		},
		y: {
			type: Number,
			required: true
		},
		w: {
			type: Number,
			required: true
		},
		h: {
			type: Number,
			required: true
		},
		zIndex: {
			type: Number,
			default: 0
		},
		scrollX: {
			type: Number,
			default: 0
		},
		scrollY: {
			type: Number,
			default: 0
		},
		focusable: {
			type: Boolean,
			default: false
		},
		selectable: {
			type: Boolean,
			default: void 0
		},
		autoFocus: {
			type: Boolean,
			default: false
		}
	},
	emits: [
		"clickCapture",
		"click",
		"dblclickCapture",
		"dblclick",
		"pointerdownCapture",
		"pointerdown",
		"pointerupCapture",
		"pointerup",
		"pointermoveCapture",
		"pointermove",
		"pointerenterCapture",
		"pointerenter",
		"pointerleaveCapture",
		"pointerleave",
		"wheelCapture",
		"wheel",
		"keydownCapture",
		"keydown",
		"keyupCapture",
		"keyup",
		"focusCapture",
		"focus",
		"blurCapture",
		"blur"
	],
	setup(props, { emit, slots }) {
		const parent = useLayout$1();
		const { render, events } = useTerminal$1();
		const parentStack = useRenderStack();
		const { visible, rootProps } = useVisibility({ provide: true });
		const parentEventZ = inject(EventZIndexContextKey, computed(() => 0));
		const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
		const rawRect = computed(() => translateRect({
			x: props.x,
			y: props.y,
			w: props.w,
			h: props.h
		}, parent.originX, parent.originY));
		const rect = computed(() => {
			const translated = rawRect.value;
			if (!parent.clipRect) return translated;
			return intersectRect(translated, parent.clipRect) ?? EMPTY_RECT;
		});
		const { id: id$1 } = useTerminalNode(() => ({
			rect: rect.value,
			zIndex: eventZ.value,
			visible: visible.value,
			focusable: props.focusable,
			selectable: props.selectable,
			handlers: {
				clickCapture: (e) => emit("clickCapture", e),
				click: (e) => emit("click", e),
				dblclickCapture: (e) => emit("dblclickCapture", e),
				dblclick: (e) => emit("dblclick", e),
				pointerdownCapture: (e) => emit("pointerdownCapture", e),
				pointerdown: (e) => emit("pointerdown", e),
				pointerupCapture: (e) => emit("pointerupCapture", e),
				pointerup: (e) => emit("pointerup", e),
				pointermoveCapture: (e) => emit("pointermoveCapture", e),
				pointermove: (e) => emit("pointermove", e),
				pointerenterCapture: (e) => emit("pointerenterCapture", e),
				pointerenter: (e) => emit("pointerenter", e),
				pointerleaveCapture: (e) => emit("pointerleaveCapture", e),
				pointerleave: (e) => emit("pointerleave", e),
				wheelCapture: (e) => emit("wheelCapture", e),
				wheel: (e) => emit("wheel", e),
				keydownCapture: (e) => emit("keydownCapture", e),
				keydown: (e) => emit("keydown", e),
				keyupCapture: (e) => emit("keyupCapture", e),
				keyup: (e) => emit("keyup", e),
				focusCapture: (e) => emit("focusCapture", e),
				focus: (e) => emit("focus", e),
				blurCapture: (e) => emit("blurCapture", e),
				blur: (e) => emit("blur", e)
			}
		}));
		watchEffect(() => {
			if (!props.autoFocus) return;
			if (!visible.value) return;
			const manager = events.value;
			const nodeId = id$1.value;
			if (!manager || !nodeId) return;
			if (manager.getFocused() === nodeId) return;
			manager.focus(nodeId);
		});
		const childLayout = shallowReactive({
			originX: 0,
			originY: 0,
			clipRect: null
		});
		const childStack = computed(() => render.createStack(parentStack.value, props.zIndex));
		watchEffect(() => {
			const translated = rawRect.value;
			childLayout.originX = translated.x - Math.floor(props.scrollX);
			childLayout.originY = translated.y - Math.floor(props.scrollY);
			childLayout.clipRect = rect.value;
		});
		provide(LayoutContextKey, childLayout);
		provide(RenderStackKey, childStack);
		provide(EventZIndexContextKey, eventZ);
		return () => h("div", rootProps, slots.default?.());
	}
});

//#endregion
//#region ../../src/vue/components/input/utils/inlineTextTokens.ts
const MULTILINE_TOKEN = "￼";
const MENTION_TOKEN = "￹";
function isMultilineToken(value, index) {
	return value[index] === MULTILINE_TOKEN;
}
function isMentionToken(value, index) {
	return value[index] === MENTION_TOKEN;
}
function countMultilineTokens(value, endIndex = value.length) {
	return countMultilineTokens$1(value, MULTILINE_TOKEN, endIndex);
}
function countMentionTokens(value, endIndex = value.length) {
	return countMentionTokens$2(value, MENTION_TOKEN, endIndex);
}
function tokenIndexAt(value, index) {
	return tokenIndexAt$1(value, MULTILINE_TOKEN, index);
}
function mentionIndexAt(value, index) {
	return mentionIndexAt$2(value, MENTION_TOKEN, index);
}
function wrapToLinesFirstWidthInline(value, multilineTexts, mentions, firstWidth, width) {
	return wrapToLinesFirstWidthInline$1(value, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, firstWidth, width);
}
function indexToWrappedCellColFirstWidthInline(value, multilineTexts, mentions, index, firstWidth, width) {
	return indexToWrappedCellColFirstWidthInline$1(value, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, index, firstWidth, width);
}
function indexToLineCellColInline(value, multilineTexts, mentions, index) {
	return indexToLineCellColInline$1(value, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, index);
}
function lineCellColToIndexInline(value, multilineTexts, mentions, lineStart, lineEnd, col) {
	return lineCellColToIndexInline$1(value, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, lineStart, lineEnd, col);
}
function wrappedCellColToIndexInline(value, multilineTexts, mentions, info, col) {
	return lineCellColToIndexInline$1(value, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, info.start, info.end, col);
}
function buildInlineRow(value, displayValue, multilineTexts, mentions, lineStart, lineEnd, rowTextW, offX) {
	return buildInlineRow$1(value, displayValue, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, lineStart, lineEnd, rowTextW, offX);
}
function buildInlineSelectionSegments(value, displayValue, multilineTexts, mentions, lineStart, lineEnd, selection, rowTextW, offX) {
	return buildInlineSelectionSegments$1(value, displayValue, MULTILINE_TOKEN, MENTION_TOKEN, multilineTexts, mentions, lineStart, lineEnd, selection, rowTextW, offX);
}

//#endregion
//#region ../../src/vue/components/input/utils/wordNavigation.ts
function findWordLeft(text, index) {
	let i = clamp$8(index, 0, text.length);
	if (i === 0) return 0;
	while (i > 0 && isWhitespace(text[i - 1])) i--;
	if (i === 0) return 0;
	const kindWord = isWordChar(text[i - 1]);
	while (i > 0) {
		const ch = text[i - 1];
		if (isWhitespace(ch)) break;
		if (isWordChar(ch) !== kindWord) break;
		i--;
	}
	return i;
}
function findWordRight(text, index) {
	let i = clamp$8(index, 0, text.length);
	if (i >= text.length) return text.length;
	while (i < text.length && isWhitespace(text[i])) i++;
	if (i >= text.length) return text.length;
	const kindWord = isWordChar(text[i]);
	while (i < text.length) {
		const ch = text[i];
		if (isWhitespace(ch)) break;
		if (isWordChar(ch) !== kindWord) break;
		i++;
	}
	return i;
}
function tokenRangeAt(value, index) {
	if (!value) return null;
	let i = clamp$8(index, 0, value.length);
	if (i === value.length) i = value.length - 1;
	if (i < 0) return null;
	const ch0 = value[i];
	if (!ch0) return null;
	let start = i;
	let end = i + 1;
	if (isWhitespace(ch0)) {
		while (start > 0 && isWhitespace(value[start - 1])) start--;
		while (end < value.length && isWhitespace(value[end])) end++;
		return {
			start,
			end
		};
	}
	const kindWord = isWordChar(ch0);
	while (start > 0) {
		const ch = value[start - 1];
		if (isWhitespace(ch)) break;
		if (isWordChar(ch) !== kindWord) break;
		start--;
	}
	while (end < value.length) {
		const ch = value[end];
		if (isWhitespace(ch)) break;
		if (isWordChar(ch) !== kindWord) break;
		end++;
	}
	return {
		start,
		end
	};
}

//#endregion
//#region ../../src/vue/components/TInput.ts
function isPrintableKey(e) {
	if (e.ctrlKey || e.metaKey || e.altKey) return false;
	return e.key.length === 1;
}
function computeLines(value) {
	return computeLines$1(value);
}
function indexToLineCellCol(value, index) {
	const safe = clamp$8(index, 0, value.length);
	const lines = computeLines(value);
	for (let i = 0; i < lines.length; i++) {
		const info = lines[i];
		if (safe <= info.end) {
			const prefix = value.slice(info.start, safe);
			return {
				line: i,
				col: textCellWidth$1(prefix),
				lines
			};
		}
	}
	const last = lines[lines.length - 1];
	return {
		line: lines.length - 1,
		col: textCellWidth$1(value.slice(last.start, last.end)),
		lines
	};
}
function normalizeMacHfsPath(input) {
	const raw = String(input ?? "").trim();
	if (!raw) return null;
	if (raw.includes("/") || raw.includes("\\")) return null;
	if (!raw.includes(":")) return null;
	const parts = raw.split(":");
	if (parts.length < 3) return null;
	if (parts.some((part) => !part.trim())) return null;
	const volume = parts[0].trim();
	if (!volume || /^\d+$/.test(volume)) return null;
	const firstNested = String(parts[1] ?? "").trim();
	if (/^\d+\s/u.test(firstNested)) return null;
	const rest = parts.slice(1).map((part) => part.trim()).filter(Boolean);
	if (!rest.length) return null;
	if (volume === "Macintosh HD") return `/${rest.join("/")}`;
	return `/Volumes/${volume}/${rest.join("/")}`;
}
let nextImeOwnerId = 0;
let nextPasteImageId = 0;
const TInput$1 = defineComponent({
	name: "TInput",
	props: {
		x: {
			type: Number,
			required: true
		},
		y: {
			type: Number,
			required: true
		},
		w: {
			type: Number,
			required: true
		},
		h: {
			type: Number,
			default: 1
		},
		zIndex: {
			type: Number,
			default: 0
		},
		modelValue: {
			type: String,
			required: true
		},
		cursorToEndOnExternalUpdate: {
			type: Boolean,
			default: false
		},
		cursorToEndOnFirstFocus: {
			type: Boolean,
			default: false
		},
		placeholder: {
			type: String,
			default: ""
		},
		placeholderWhenFocused: {
			type: Boolean,
			default: false
		},
		style: {
			type: Object,
			default: void 0
		},
		autoFocus: {
			type: Boolean,
			default: false
		},
		cursorBlink: {
			type: Boolean,
			default: true
		},
		cursorShape: {
			type: String,
			default: "block"
		},
		blinkInterval: {
			type: Number,
			default: 500
		},
		promptSuggestions: {
			type: Array,
			default: () => []
		},
		promptTrigger: {
			type: String,
			default: "/"
		},
		promptTriggers: {
			type: Array,
			default: void 0
		},
		promptMaxItems: {
			type: Number,
			default: 6
		},
		promptAlign: {
			type: String,
			default: "input"
		},
		promptSelectedStyle: {
			type: Object,
			default: void 0
		},
		skillTrigger: {
			type: String,
			default: ""
		},
		skillSuggestions: {
			type: Array,
			default: void 0
		},
		skillHighlightStyle: {
			type: Object,
			default: void 0
		},
		mentionTrigger: {
			type: String,
			default: "@"
		},
		mentionWorkspace: {
			type: String,
			default: ""
		},
		mentionMode: {
			type: String,
			default: "file"
		},
		mentionShowHidden: {
			type: Boolean,
			default: false
		},
		mentionSuggestions: {
			type: Array,
			default: () => []
		},
		mentionMaxItems: {
			type: Number,
			default: 8
		},
		dedupeMentions: {
			type: Boolean,
			default: true
		},
		collectMentions: {
			type: Boolean,
			default: false
		},
		mentions: {
			type: Array,
			default: () => []
		},
		collapseMultiline: {
			type: Boolean,
			default: false
		},
		multilineTexts: {
			type: Array,
			default: () => []
		},
		secret: {
			type: Boolean,
			default: false
		},
		maskChar: {
			type: String,
			default: "•"
		},
		submitOnEnter: {
			type: Boolean,
			default: true
		},
		clearOnEscape: {
			type: Boolean,
			default: false
		},
		plugins: {
			type: Array,
			default: () => []
		},
		pasteImageHandler: {
			type: Function,
			default: void 0
		},
		filePasteHandler: {
			type: Function,
			default: void 0
		}
	},
	emits: [
		"update:modelValue",
		"input",
		"change",
		"keydown",
		"focus",
		"blur",
		"pointerenter",
		"pointerleave",
		"update:mentions",
		"mentionClick",
		"update:multilineTexts",
		"multilineClick",
		"validationError"
	],
	setup(props, { emit }) {
		const { terminal, scheduler, defaultStyle, events, render } = useTerminal$1();
		const layout = useLayout$1();
		const { visible, rootProps } = useVisibility();
		const injectedPlugins = inject(TInputPluginsContextKey, null);
		const imeAnchor = inject(ImeAnchorContextKey, null);
		const inDialog = inject(DialogContextKey, false);
		const imeOwnerId = `TInput:${nextImeOwnerId++}`;
		const parentEventZ = inject(EventZIndexContextKey, computed(() => 0));
		const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
		const installedPlugins = [...injectedPlugins?.value ?? [], ...props.plugins ?? []];
		let hostAdapter = {};
		const PADDING_X = 1;
		function measureContent(r) {
			const wAll = Math.max(0, Math.floor(r.w));
			const hAll = Math.max(0, Math.floor(r.h));
			const padX = clamp$8(PADDING_X, 0, Math.floor(wAll / 2));
			const w = Math.max(0, wAll - padX * 2);
			return {
				wAll,
				hAll,
				padX,
				w
			};
		}
		const focused = ref(false);
		const cursor = ref(0);
		const anchor = ref(null);
		const hasFocusedOnce = ref(false);
		const skipCursorToEndOnNextFocus = ref(false);
		const scrollX = ref(0);
		const scrollY = ref(0);
		const composing = ref(false);
		const compositionText = ref("");
		const compositionBlocked = ref(false);
		let suppressEnterUntil = 0;
		const skipNextInput = ref(false);
		const blinkOn = ref(true);
		let blinkTimer = null;
		const desiredCol = ref(null);
		let mouseDownCell = null;
		let mouseDownShift = false;
		let mouseDragSelecting = false;
		let suppressNextClick = false;
		let lastClick = null;
		const DOUBLE_CLICK_MS = 450;
		const pendingValue = ref(null);
		const pendingMentions = ref(null);
		function getValue() {
			return pendingValue.value ?? props.modelValue;
		}
		const MAX_HISTORY = 200;
		const undoStack = [];
		const redoStack = [];
		let applyingHistory = false;
		function pushUndoSnapshot(nextValue) {
			if (applyingHistory) return;
			const current = {
				value: getValue(),
				cursor: cursor.value
			};
			if (current.value === nextValue) return;
			const last = undoStack[undoStack.length - 1];
			if (last && last.value === current.value && last.cursor === current.cursor) return;
			undoStack.push(current);
			if (undoStack.length > MAX_HISTORY) undoStack.splice(0, undoStack.length - MAX_HISTORY);
			redoStack.length = 0;
		}
		function applyHistory(entry) {
			applyingHistory = true;
			try {
				applyEdit(entry.value, entry.cursor);
			} finally {
				applyingHistory = false;
			}
		}
		function undo() {
			const prev = undoStack.pop();
			if (!prev) return;
			const cur = {
				value: getValue(),
				cursor: cursor.value
			};
			redoStack.push(cur);
			applyHistory(prev);
		}
		function redo() {
			const next = redoStack.pop();
			if (!next) return;
			const cur = {
				value: getValue(),
				cursor: cursor.value
			};
			undoStack.push(cur);
			applyHistory(next);
		}
		const wrapMode = computed(() => Math.max(1, Math.floor(props.h)) > 1);
		const rawAbsRect = computed(() => {
			const raw = {
				x: props.x,
				y: props.y,
				w: props.w,
				h: Math.max(1, Math.floor(props.h))
			};
			return translateRect(raw, layout.originX, layout.originY);
		});
		watch(() => props.modelValue, (next, prev) => {
			const wasInternal = pendingValue.value != null;
			pendingValue.value = null;
			if (!wasInternal) {
				undoStack.length = 0;
				redoStack.length = 0;
			}
			const nextLen = next.length;
			if (!wasInternal && props.cursorToEndOnExternalUpdate && !composing.value) {
				cursor.value = nextLen;
				anchor.value = null;
			} else {
				cursor.value = clamp$8(cursor.value, 0, nextLen);
				if (anchor.value != null) anchor.value = clamp$8(anchor.value, 0, nextLen);
			}
			if (composing.value && next !== prev) {
				compositionBlocked.value = true;
				composing.value = false;
				compositionText.value = "";
			}
			const tokenCount = countMultilineTokens(next);
			const currentMultiline = props.multilineTexts ?? [];
			if (currentMultiline.length > tokenCount) emit("update:multilineTexts", currentMultiline.slice(0, tokenCount));
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		});
		const keydownInterceptors = [];
		function registerKeydownInterceptor(fn) {
			keydownInterceptors.push(fn);
		}
		const textFilters = [];
		function registerTextFilter(fn) {
			textFilters.push(fn);
		}
		const chipStyleProvider = ref(null);
		function registerChipStyleProvider(provider) {
			chipStyleProvider.value = provider;
		}
		function registerHostAdapter(adapter) {
			if (!adapter) return;
			hostAdapter = {
				...hostAdapter,
				...adapter
			};
		}
		function isTerminalHost() {
			return Boolean(hostAdapter.isTerminalLike);
		}
		function resolveInputPath(input, opts) {
			if (hostAdapter.resolvePath) return hostAdapter.resolvePath({
				workspace: props.mentionWorkspace,
				input,
				preserveBackslash: opts?.preserveBackslash
			});
			return resolveDefaultTInputPath({
				workspace: props.mentionWorkspace,
				input,
				preserveBackslash: opts?.preserveBackslash
			});
		}
		function toTerminalHref(pathLike) {
			return hostAdapter.pathToHref?.(pathLike) ?? pathToTerminalFileHref(pathLike);
		}
		function maskText(text) {
			const ch = String(props.maskChar || "•");
			return ch.repeat(Math.max(0, text.length));
		}
		function stopBlink() {
			if (blinkTimer != null) {
				clearInterval(blinkTimer);
				blinkTimer = null;
			}
			blinkOn.value = true;
		}
		function startBlink() {
			stopBlink();
			if (!props.cursorBlink) return;
			const interval = Math.max(120, Math.floor(props.blinkInterval));
			blinkTimer = globalThis.setInterval(() => {
				blinkOn.value = !blinkOn.value;
				scheduler.invalidate();
			}, interval);
		}
		const absRect = computed(() => {
			const raw = {
				x: props.x,
				y: props.y,
				w: props.w,
				h: Math.max(1, Math.floor(props.h))
			};
			const translated = translateRect(raw, layout.originX, layout.originY);
			if (!layout.clipRect) return translated;
			return intersectRect(translated, layout.clipRect) ?? {
				x: 0,
				y: 0,
				w: 0,
				h: 0
			};
		});
		const selection = computed(() => {
			if (anchor.value == null || anchor.value === cursor.value) return null;
			const start = Math.min(anchor.value, cursor.value);
			const end = Math.max(anchor.value, cursor.value);
			return {
				start,
				end
			};
		});
		function selectTokenAtCursor() {
			const value = getValue();
			const range = tokenRangeAt(value, cursor.value);
			if (!range) return;
			anchor.value = range.start;
			cursor.value = range.end;
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		}
		function selectAll() {
			const value = getValue();
			anchor.value = 0;
			cursor.value = value.length;
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		}
		const shouldShowPlaceholder = computed(() => {
			if (getValue()) return false;
			if (!props.placeholder) return false;
			if (focused.value && composing.value && compositionText.value) return false;
			return !focused.value || props.placeholderWhenFocused;
		});
		const useCompositionEnd = typeof document !== "undefined";
		function getComposedTextAndCursor(value) {
			const baseCursor = clamp$8(cursor.value, 0, value.length);
			if (composing.value && compositionText.value) {
				const text = `${value.slice(0, baseCursor)}${compositionText.value}${value.slice(baseCursor)}`;
				const cursorIndex = useCompositionEnd ? clamp$8(baseCursor + compositionText.value.length, 0, text.length) : baseCursor;
				return {
					text,
					cursor: cursorIndex
				};
			}
			return {
				text: value,
				cursor: baseCursor
			};
		}
		function ensureCursorVisible() {
			const r = absRect.value;
			const { hAll, w: contentW } = measureContent(r);
			const width = Math.max(1, contentW);
			const height = Math.max(1, hAll);
			const value = getValue();
			const composed = getComposedTextAndCursor(value);
			const wrap = wrapMode.value;
			const firstWidth = width;
			const { line, col, lines } = wrap ? indexToWrappedCellColFirstWidthInline(composed.text, props.multilineTexts, props.mentions, composed.cursor, firstWidth, width) : indexToLineCellColInline(composed.text, props.multilineTexts, props.mentions, composed.cursor);
			if (wrap) scrollX.value = 0;
			else if (width <= 0) scrollX.value = 0;
			else {
				const viewW = line === 0 ? firstWidth : width;
				if (col < scrollX.value) scrollX.value = col;
				else if (col > scrollX.value + viewW - 1) scrollX.value = Math.max(0, col - (viewW - 1));
			}
			const maxTop = Math.max(0, lines.length - height);
			scrollY.value = clamp$8(scrollY.value, 0, maxTop);
			if (line < scrollY.value) scrollY.value = line;
			else if (line > scrollY.value + height - 1) scrollY.value = clamp$8(line - (height - 1), 0, maxTop);
		}
		function computeImeAnchorCell() {
			if (!visible.value) return null;
			const r = absRect.value;
			if (r.w <= 0 || r.h <= 0) return null;
			const placeholderVisible = shouldShowPlaceholder.value;
			const offX = placeholderVisible ? 0 : scrollX.value;
			const offY = placeholderVisible ? 0 : scrollY.value;
			const wrap = wrapMode.value && !placeholderVisible;
			const valueTextRaw = getValue();
			const composed = getComposedTextAndCursor(valueTextRaw);
			const cursorTextRaw = placeholderVisible ? "" : composed.text;
			const cursorText = props.secret && !placeholderVisible ? maskText(cursorTextRaw) : cursorTextRaw;
			const { padX, w: contentW } = measureContent(r);
			const width = Math.max(1, contentW);
			const firstWidth = width;
			const pos = wrap ? indexToWrappedCellColFirstWidthInline(cursorText, props.multilineTexts, props.mentions, composed.cursor, firstWidth, width) : indexToLineCellColInline(cursorText, props.multilineTexts, props.mentions, composed.cursor);
			const cx0 = pos.col - offX;
			const cy = pos.line - offY;
			const cx = clamp$8(cx0, 0, Math.max(0, width - 1));
			const cyClamped = clamp$8(cy, 0, Math.max(0, r.h - 1));
			return {
				cellX: r.x + padX + cx,
				cellY: r.y + cyClamped
			};
		}
		function syncImeAnchorNow() {
			if (useCompositionEnd) return;
			if (!imeAnchor) return;
			if (!focused.value) {
				if (imeAnchor.value?.ownerId === imeOwnerId) imeAnchor.value = null;
				return;
			}
			const next = computeImeAnchorCell();
			if (!next) return;
			const prev = imeAnchor.value;
			if (prev && prev.ownerId === imeOwnerId && prev.cellX === next.cellX && prev.cellY === next.cellY) return;
			imeAnchor.value = {
				...next,
				ownerId: imeOwnerId
			};
		}
		function setCursorByCell2D(cellX, cellY, extendSelection = false, e, allowInlineAction = true) {
			const r = absRect.value;
			const { w: contentW, padX } = measureContent(r);
			const width = Math.max(1, contentW);
			const localX = clamp$8(cellX - (r.x + padX), 0, Math.max(0, contentW - 1));
			const localY = clamp$8(cellY - r.y, 0, Math.max(0, r.h - 1));
			const value = getValue();
			const wrap = wrapMode.value;
			const xText = localX;
			const firstWidth = width;
			let next = 0;
			let hit = null;
			if (wrap) {
				const lines = wrapToLinesFirstWidthInline(value, props.multilineTexts, props.mentions, firstWidth, width);
				const line = clamp$8(scrollY.value + localY, 0, lines.length - 1);
				const col = xText;
				const hit2 = wrappedCellColToIndexInline(value, props.multilineTexts, props.mentions, lines[line], col);
				next = hit2.index;
				hit = hit2.hit;
			} else {
				const lines = computeLines(value);
				const line = clamp$8(scrollY.value + localY, 0, lines.length - 1);
				const col = scrollX.value + xText;
				const info = lines[line];
				const hit2 = lineCellColToIndexInline(value, props.multilineTexts, props.mentions, info.start, info.end, col);
				next = hit2.index;
				hit = hit2.hit;
			}
			if (hit && allowInlineAction && !extendSelection) {
				cursor.value = next;
				anchor.value = null;
				ensureCursorVisible();
				if (hit.kind === "multiline") emit("multilineClick", hit.index);
				else {
					const absPath = String(props.mentions?.[hit.index] ?? "");
					if (absPath) emit("mentionClick", absPath, e);
				}
				e?.preventDefault?.();
				scheduler.invalidate();
				return;
			}
			if (!extendSelection) anchor.value = null;
			else if (anchor.value == null) anchor.value = cursor.value;
			cursor.value = next;
			desiredCol.value = wrap ? indexToWrappedCellColFirstWidthInline(value, props.multilineTexts, props.mentions, cursor.value, firstWidth, width).col : indexToLineCellColInline(value, props.multilineTexts, props.mentions, cursor.value).col;
			ensureCursorVisible();
			syncImeAnchorNow();
		}
		function applyEdit(nextValue, nextCursor, commit = false) {
			const c = clamp$8(nextCursor, 0, nextValue.length);
			cursor.value = c;
			anchor.value = null;
			composing.value = false;
			compositionText.value = "";
			pendingValue.value = nextValue;
			if (wrapMode.value) {
				const { w: contentW } = measureContent(absRect.value);
				const w = Math.max(1, contentW);
				const firstW = w;
				desiredCol.value = indexToWrappedCellColFirstWidthInline(nextValue, props.multilineTexts, props.mentions, c, firstW, w).col;
			} else desiredCol.value = indexToLineCellColInline(nextValue, props.multilineTexts, props.mentions, c).col;
			ensureCursorVisible();
			syncImeAnchorNow();
			emit("update:modelValue", nextValue);
			emit("input", nextValue);
			if (commit) emit("change", nextValue);
			scheduler.flushNow();
			nextTick(() => {
				scheduler.flushNow();
			});
		}
		function applyMove(nextCursor, extend) {
			const prev = cursor.value;
			const value = getValue();
			if (extend) {
				if (anchor.value == null) anchor.value = prev;
			} else anchor.value = null;
			cursor.value = clamp$8(nextCursor, 0, value.length);
			if (wrapMode.value) {
				const { w: contentW } = measureContent(absRect.value);
				const w = Math.max(1, contentW);
				const firstW = w;
				desiredCol.value = indexToWrappedCellColFirstWidthInline(value, props.multilineTexts, props.mentions, cursor.value, firstW, w).col;
			} else desiredCol.value = indexToLineCellColInline(value, props.multilineTexts, props.mentions, cursor.value).col;
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		}
		watch([
			() => absRect.value.w,
			() => absRect.value.h,
			() => wrapMode.value
		], () => {
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		});
		watch([() => props.mentions, () => props.multilineTexts], () => {
			pendingMentions.value = props.mentions ?? [];
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		});
		function emitMentions(nextMentions) {
			pendingMentions.value = nextMentions;
			emit("update:mentions", nextMentions);
		}
		function clearAll() {
			const value = getValue();
			const hasValue = value.length > 0;
			const hasMentions = (props.mentions?.length ?? 0) > 0;
			const hasMultiline = (props.multilineTexts?.length ?? 0) > 0;
			if (!hasValue && !hasMentions && !hasMultiline) return;
			anchor.value = null;
			if (hasMentions) emitMentions([]);
			if (hasMultiline) emit("update:multilineTexts", []);
			if (hasValue || cursor.value !== 0) {
				pushUndoSnapshot("");
				applyEdit("", 0);
			} else {
				ensureCursorVisible();
				syncImeAnchorNow();
				scheduler.invalidate();
			}
		}
		function deleteSelectionIfAny(value) {
			const sel = selection.value;
			if (!sel) return {
				value,
				cursor: cursor.value,
				deleted: false
			};
			const tokenStart = countMultilineTokens(value, sel.start);
			const tokenEnd = countMultilineTokens(value, sel.end);
			if (tokenEnd > tokenStart) {
				const current = props.multilineTexts ?? [];
				const nextMultiline = [...current.slice(0, tokenStart), ...current.slice(tokenEnd)];
				emit("update:multilineTexts", nextMultiline);
			}
			const mentionStart = countMentionTokens(value, sel.start);
			const mentionEnd = countMentionTokens(value, sel.end);
			if (mentionEnd > mentionStart) {
				const current = pendingMentions.value ?? props.mentions ?? [];
				const nextMentions = [...current.slice(0, mentionStart), ...current.slice(mentionEnd)];
				emitMentions(nextMentions);
			}
			const next = value.slice(0, sel.start) + value.slice(sel.end);
			return {
				value: next,
				cursor: sel.start,
				deleted: true
			};
		}
		function insertText(rawText) {
			let text = rawText || "";
			if (!text) return;
			const valueForFilter = getValue();
			const selectionForFilter = selection.value;
			for (const filter of textFilters) {
				try {
					text = filter({
						text,
						value: valueForFilter,
						cursor: cursor.value,
						selection: selectionForFilter
					});
				} catch {}
				if (!text) return;
			}
			const value = getValue();
			const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
			const baseValue = deleted ? afterDelete : value;
			const baseCursor = deleted ? nextCursor : cursor.value;
			const next = baseValue.slice(0, baseCursor) + text + baseValue.slice(baseCursor);
			pushUndoSnapshot(next);
			applyEdit(next, baseCursor + text.length);
			if (text.length === 1 && (text === "'" || text === "\"")) tryConvertQuotedPathAfterInsert(next, baseCursor + text.length, text);
		}
		for (const plugin of installedPlugins) try {
			plugin.install({
				getProps: () => ({
					zIndex: props.zIndex,
					style: props.style,
					promptSuggestions: props.promptSuggestions,
					promptTrigger: props.promptTrigger,
					promptTriggers: props.promptTriggers,
					skillTrigger: props.skillTrigger,
					skillSuggestions: props.skillSuggestions,
					promptMaxItems: props.promptMaxItems,
					promptAlign: props.promptAlign,
					promptSelectedStyle: props.promptSelectedStyle,
					mentionTrigger: props.mentionTrigger,
					mentionWorkspace: props.mentionWorkspace,
					mentionMode: props.mentionMode,
					mentionShowHidden: props.mentionShowHidden,
					mentionSuggestions: props.mentionSuggestions,
					mentionMaxItems: props.mentionMaxItems,
					collectMentions: props.collectMentions,
					mentions: props.mentions
				}),
				emit,
				terminal,
				scheduler,
				defaultStyle,
				render: {
					rootStack: render.rootStack,
					createStack: render.createStack,
					invalidatePlane: render.invalidatePlane
				},
				visible,
				rawAbsRect,
				eventZ,
				focused,
				cursor,
				getValue,
				insertText,
				pushUndoSnapshot,
				applyEdit: (nextValue, nextCursor) => applyEdit(nextValue, nextCursor),
				registerKeydownInterceptor,
				registerTextFilter,
				registerChipStyleProvider,
				registerHostAdapter,
				resolvePath: resolveInputPath,
				mentionToken: MENTION_TOKEN
			});
		} catch {}
		function insertMultilineToken(text) {
			const value = getValue();
			const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
			const baseValue = deleted ? afterDelete : value;
			const baseCursor = deleted ? nextCursor : cursor.value;
			const insertIndex = tokenIndexAt(baseValue, baseCursor);
			const current = props.multilineTexts ?? [];
			const nextMultiline = [
				...current.slice(0, insertIndex),
				text,
				...current.slice(insertIndex)
			];
			emit("update:multilineTexts", nextMultiline);
			const nextValue = `${baseValue.slice(0, baseCursor)}${MULTILINE_TOKEN}${baseValue.slice(baseCursor)}`;
			applyEdit(nextValue, baseCursor + 1);
		}
		function removeMentionTokenByIndex(value, mentionIdx) {
			const target = Math.max(0, Math.floor(mentionIdx));
			let seen = 0;
			for (let i = 0; i < value.length; i++) {
				if (value[i] !== MENTION_TOKEN) continue;
				if (seen === target) return {
					value: value.slice(0, i) + value.slice(i + 1),
					removedCharIndex: i
				};
				seen++;
			}
			return {
				value,
				removedCharIndex: null
			};
		}
		function insertMentionToken(absPath) {
			const cleaned = String(absPath || "").trim();
			if (!cleaned) return;
			if (!props.collectMentions) {
				const mentionTrigger = props.mentionTrigger || "@";
				insertText(`${mentionTrigger}${cleaned} `);
				return;
			}
			const value = getValue();
			const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
			let baseValue = deleted ? afterDelete : value;
			let baseCursor = deleted ? nextCursor : cursor.value;
			const currentMentions = pendingMentions.value ?? props.mentions ?? [];
			const nextMentions = [...currentMentions];
			if (props.dedupeMentions) {
				const existingIdx = nextMentions.indexOf(cleaned);
				if (existingIdx >= 0) {
					const removed = removeMentionTokenByIndex(baseValue, existingIdx);
					if (removed.removedCharIndex != null && removed.removedCharIndex < baseCursor) baseCursor = Math.max(0, baseCursor - 1);
					baseValue = removed.value;
					nextMentions.splice(existingIdx, 1);
				}
			}
			const insertIndex = mentionIndexAt(baseValue, baseCursor);
			nextMentions.splice(insertIndex, 0, cleaned);
			emitMentions(nextMentions);
			let after = baseValue.slice(baseCursor);
			if (after.startsWith(" ")) after = after.slice(1);
			const nextValue = `${baseValue.slice(0, baseCursor)}${MENTION_TOKEN} ${after}`;
			pushUndoSnapshot(nextValue);
			applyEdit(nextValue, baseCursor + 2);
		}
		function getCurrentMentions() {
			return pendingMentions.value ?? props.mentions ?? [];
		}
		function hasPendingPasteImages() {
			return getCurrentMentions().some((mention) => isPasteImagePlaceholderPath(mention));
		}
		function replacePendingPasteImage(placeholderPath, resolvedPath) {
			const current = getCurrentMentions();
			const idx = current.indexOf(placeholderPath);
			if (idx < 0) return;
			const nextMentions = [...current];
			nextMentions[idx] = resolvedPath;
			emitMentions(nextMentions);
			ensureCursorVisible();
			syncImeAnchorNow();
			scheduler.invalidate();
		}
		function removePendingPasteImage(placeholderPath) {
			const current = getCurrentMentions();
			const idx = current.indexOf(placeholderPath);
			if (idx < 0) return;
			const nextMentions = [...current.slice(0, idx), ...current.slice(idx + 1)];
			const value = getValue();
			const removed = removeMentionTokenByIndex(value, idx);
			emitMentions(nextMentions);
			if (removed.removedCharIndex != null) {
				let nextCursor = cursor.value;
				if (removed.removedCharIndex < nextCursor) nextCursor = Math.max(0, nextCursor - 1);
				applyEdit(removed.value, nextCursor);
			} else {
				ensureCursorVisible();
				syncImeAnchorNow();
				scheduler.invalidate();
			}
		}
		function normalizePastedFilePath(rawText, opts) {
			let value = String(rawText ?? "").trim();
			if (!value) return null;
			if (value.includes("\n")) return null;
			if (value.includes("\0")) return null;
			if (/[;&|`]/.test(value)) return null;
			if (value.startsWith("\"") && value.endsWith("\"") || value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
			if (!value) return null;
			if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !value.startsWith("file://")) return null;
			if (value.startsWith("file://")) {
				const filePath = fileUrlToPathLike(value);
				if (!filePath) return null;
				value = filePath;
			}
			if (!value.includes("/") && !value.includes("\\")) {
				const hfs = normalizeMacHfsPath(value);
				if (hfs) value = hfs;
			}
			const hasSeparator = value.includes("/") || value.includes("\\");
			if (!hasSeparator) return null;
			const workspace = props.mentionWorkspace;
			if (workspace) return resolveInputPath(value, opts);
			return value;
		}
		function normalizedPathCandidates(rawText) {
			const out = [];
			const add = (candidate) => {
				if (!candidate) return;
				if (!out.includes(candidate)) out.push(candidate);
			};
			const addVariants = (candidate) => {
				add(normalizePastedFilePath(candidate));
				if (candidate.includes("\\")) add(normalizePastedFilePath(candidate, { preserveBackslash: true }));
			};
			const unescapeShellLikePath = (value) => value.replace(/\\([\\ ])/g, "$1");
			const base = String(rawText ?? "").trim();
			if (!base) return out;
			addVariants(base);
			const isWindowsLike = /^[A-Z]:[\\/]/i.test(base) || base.startsWith("\\\\");
			const isPosixLike = base.startsWith("/") || base.startsWith("~/");
			if (isPosixLike && !isWindowsLike && base.includes("\\")) {
				const unescaped = unescapeShellLikePath(base);
				if (unescaped !== base) addVariants(unescaped);
			}
			return out;
		}
		function isPromiseLike(value) {
			return !!value && typeof value.then === "function";
		}
		function looksLikeAbsolutePath(value) {
			const v = String(value ?? "").trim();
			if (!v) return false;
			if (v.startsWith("file://")) return true;
			if (v === "~" || v.startsWith("~/")) return true;
			if (v.startsWith("/") || v.startsWith("\\\\")) return true;
			return /^[A-Z]:[\\/]/i.test(v);
		}
		function findQuotedPathRange(value, cursorIndex, quoteChar) {
			if (!value || cursorIndex <= 0) return null;
			if (value[cursorIndex - 1] !== quoteChar) return null;
			const start = value.lastIndexOf(quoteChar, cursorIndex - 2);
			if (start < 0) return null;
			const inner = value.slice(start + 1, cursorIndex - 1);
			if (!inner) return null;
			if (inner.includes("\n") || inner.includes("\r")) return null;
			return {
				start,
				end: cursorIndex,
				inner,
				quoted: value.slice(start, cursorIndex)
			};
		}
		async function tryConvertQuotedPathAfterInsert(snapshotValue, snapshotCursor, quoteChar) {
			if (!props.collectMentions || typeof props.filePasteHandler !== "function") return;
			const range = findQuotedPathRange(snapshotValue, snapshotCursor, quoteChar);
			if (!range) return;
			if (!looksLikeAbsolutePath(range.inner)) return;
			const normalizedPath = normalizePastedFilePath(range.inner);
			if (!normalizedPath) return;
			let handled = null;
			try {
				handled = await props.filePasteHandler(normalizedPath);
			} catch {
				return;
			}
			if (!handled) return;
			const current = getValue();
			const currentIndex = current.lastIndexOf(range.quoted);
			if (currentIndex < 0) return;
			const endIndex = currentIndex + range.quoted.length;
			const nextValue = current.slice(0, currentIndex) + current.slice(endIndex);
			applyEdit(nextValue, currentIndex);
			insertMentionToken(handled);
		}
		function splitAbsolutePathRuns(value) {
			const starts = [];
			const re = /(^|\s)(~\/|\/|\\\\|[A-Z]:[\\/])/gi;
			let match = re.exec(value);
			while (match) {
				const lead = match[1] ?? "";
				starts.push(match.index + lead.length);
				match = re.exec(value);
			}
			if (starts.length <= 1) return null;
			const out = [];
			for (let i = 0; i < starts.length; i++) {
				const start = starts[i] ?? 0;
				const end = starts[i + 1] ?? value.length;
				const chunk = value.slice(start, end).trim();
				if (chunk) out.push(chunk);
			}
			return out.length ? out : null;
		}
		function extractPastedFilePaths(rawText) {
			const value = String(rawText ?? "").trim();
			if (!value) return [];
			if (/[\r\n]/.test(value)) {
				const out = [];
				for (const line of value.split(/\r?\n/)) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					out.push(...extractPastedFilePaths(trimmed));
				}
				return out;
			}
			const quoted = [];
			const quoteRe = /"([^"]+)"|'([^']+)'/g;
			let match = quoteRe.exec(value);
			while (match) {
				const inner = match[1] ?? match[2] ?? "";
				if (inner) quoted.push(inner);
				match = quoteRe.exec(value);
			}
			if (quoted.length) return quoted;
			const fileUrls = value.match(/file:\/\/[^\s'"]+/g) ?? [];
			if (fileUrls.length) return fileUrls;
			if (normalizeMacHfsPath(value)) return [value];
			if (/\s/.test(value)) {
				const absRuns = splitAbsolutePathRuns(value);
				if (absRuns?.length) return absRuns;
				if (value.includes("/") || value.includes("\\")) return [value];
				return value.split(/\s+/).filter(Boolean);
			}
			return [value];
		}
		async function handlePasteText(rawText) {
			const normalized = normalizeNewlines$1(rawText || "");
			if (!normalized) return;
			const cleanText = sanitizeTextBlock(normalized);
			const text = cleanText || normalized;
			const trimmed = normalized.trim();
			const mentionTrigger = props.mentionTrigger || "@";
			const looksLikeFilePath = trimmed.startsWith(mentionTrigger) && !/\s/.test(trimmed) && (trimmed.slice(mentionTrigger.length).includes("/") || trimmed.slice(mentionTrigger.length).includes("\\"));
			if (looksLikeFilePath && props.collectMentions) {
				const normalizedPath = trimmed.slice(mentionTrigger.length).trim();
				const absPath = props.mentionWorkspace ? resolveInputPath(normalizedPath) : normalizedPath;
				if (absPath) insertMentionToken(absPath);
				return;
			}
			if (props.collectMentions && typeof props.filePasteHandler === "function") {
				const looksLikeSinglePathCandidate = (candidate) => {
					const v = String(candidate ?? "").trim();
					if (!v) return false;
					if (v.includes("\0")) return false;
					if (/[;&|`]/.test(v)) return false;
					if (normalizePastedFilePath(v)) return true;
					if (v.startsWith("file://")) return true;
					if (looksLikeAbsolutePath(v)) return true;
					if (v.startsWith("\"") && v.endsWith("\"") || v.startsWith("'") && v.endsWith("'")) {
						const inner = v.slice(1, -1).trim();
						return looksLikeAbsolutePath(inner);
					}
					const absRuns = splitAbsolutePathRuns(v);
					return Boolean(absRuns?.length);
				};
				const candidateLines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
				const looksLikeFilePaste = (() => {
					if (!trimmed) return false;
					if (candidateLines.length > 1) return candidateLines.every(looksLikeSinglePathCandidate);
					return looksLikeSinglePathCandidate(trimmed);
				})();
				const candidates = looksLikeFilePaste ? extractPastedFilePaths(trimmed) : [];
				const requiresCompleteMatch = candidateLines.length > 1 || candidates.length > 1;
				const handledPaths = [];
				let handledAll = candidates.length > 0;
				for (const candidate of candidates) {
					const normalizedPaths = normalizedPathCandidates(candidate);
					if (!normalizedPaths.length) {
						handledAll = false;
						if (requiresCompleteMatch) break;
						continue;
					}
					let handledPath = null;
					for (const normalizedPath of normalizedPaths) try {
						const maybeHandled = props.filePasteHandler(normalizedPath);
						if (isPromiseLike(maybeHandled)) {
							const handled = await maybeHandled;
							if (handled) {
								handledPath = handled;
								break;
							}
						} else if (maybeHandled) {
							handledPath = maybeHandled;
							break;
						}
					} catch {}
					if (!handledPath) {
						handledAll = false;
						if (requiresCompleteMatch) break;
						continue;
					}
					handledPaths.push(handledPath);
				}
				if (handledAll && handledPaths.length > 0) {
					for (const handledPath of handledPaths) insertMentionToken(handledPath);
					return;
				}
			}
			if (props.collapseMultiline) {
				const lineCount = (text.match(/\n/g) || []).length + 1;
				if (lineCount > 3 || text.length > 200) {
					insertMultilineToken(text);
					return;
				}
			}
			insertText(normalized);
		}
		async function tryPasteImageFromHandler() {
			if (!props.collectMentions || typeof props.pasteImageHandler !== "function") return;
			const placeholderPath = createPasteImagePlaceholderPath(nextPasteImageId++);
			insertMentionToken(placeholderPath);
			scheduler.invalidate();
			try {
				const imagePath = await props.pasteImageHandler();
				const cleaned = String(imagePath ?? "").trim();
				if (cleaned) replacePendingPasteImage(placeholderPath, cleaned);
				else removePendingPasteImage(placeholderPath);
			} catch {
				removePendingPasteImage(placeholderPath);
			}
		}
		function readEventText(e) {
			if (typeof e.text === "string") return e.text;
			if (typeof e.data === "string" && e.data) return e.data;
			const ne = e.nativeEvent;
			const clipboard = ne?.clipboardData;
			if (clipboard?.getData) {
				const v = clipboard.getData("text/plain") || clipboard.getData("text");
				if (typeof v === "string" && v) return v;
			}
			const target = ne?.target;
			if (target && typeof target.value === "string" && target.value) return target.value;
			return "";
		}
		const readClipboardText = async () => {
			try {
				return await hostAdapter.readClipboardText?.() ?? "";
			} catch {
				return "";
			}
		};
		const copyText = async (text) => {
			if (!text) return false;
			if (hostAdapter.writeClipboardText) try {
				if (await hostAdapter.writeClipboardText(text)) return true;
			} catch {}
			const nav = globalThis.navigator;
			if (nav?.clipboard?.writeText) try {
				await nav.clipboard.writeText(text);
				return true;
			} catch {}
			const doc = globalThis.document;
			if (!doc?.createElement || !doc?.body?.appendChild || typeof doc.execCommand !== "function") return false;
			try {
				const prevActive = doc.activeElement;
				const ta = doc.createElement("textarea");
				ta.value = text;
				ta.setAttribute("readonly", "true");
				ta.setAttribute("aria-hidden", "true");
				ta.style.position = "fixed";
				ta.style.left = "-9999px";
				ta.style.top = "-9999px";
				ta.style.opacity = "0";
				doc.body.appendChild(ta);
				ta.focus();
				ta.select();
				ta.setSelectionRange(0, ta.value.length);
				const ok = Boolean(doc.execCommand("copy"));
				ta.remove();
				try {
					prevActive?.focus?.({ preventScroll: true });
				} catch {
					prevActive?.focus?.();
				}
				return ok;
			} catch {
				return false;
			}
		};
		function copySelectionText(text) {
			copyText(text).then((ok) => {
				if (!isTerminalHost()) return;
				hostAdapter.showToast?.(ok ? "Copied" : "Copy failed");
			}).catch(() => {
				if (!isTerminalHost()) return;
				hostAdapter.showToast?.("Copy failed");
			});
		}
		function onKeydown(e) {
			if (e.key === "Enter") {
				const ts = typeof e.timeStamp === "number" ? e.timeStamp : Date.now();
				if (ts <= suppressEnterUntil) {
					suppressEnterUntil = 0;
					e.preventDefault();
					e.stopPropagation();
					return;
				}
			}
			if (composing.value) {
				emit("keydown", e);
				return;
			}
			for (const interceptor of keydownInterceptors) if (interceptor(e)) {
				emit("keydown", e);
				return;
			}
			emit("keydown", e);
			if (e.defaultPrevented) return;
			const value = getValue();
			const extend = Boolean(e.shiftKey);
			const byWord = Boolean(e.altKey || e.ctrlKey && !e.metaKey && !e.altKey);
			const toBoundaryArrows = Boolean(e.metaKey);
			const toBoundaryHomeEnd = Boolean(e.metaKey || e.ctrlKey && !e.altKey);
			const isClipboardShortcut = Boolean((e.metaKey || e.ctrlKey) && !e.altKey);
			const isC = e.key === "c" || e.key === "C";
			const isX = e.key === "x" || e.key === "X";
			const isA = e.key === "a" || e.key === "A";
			const isE = e.key === "e" || e.key === "E";
			const isV = e.key === "v" || e.key === "V";
			const isZ = e.key === "z" || e.key === "Z";
			const isY = e.key === "y" || e.key === "Y";
			const sel = selection.value;
			const terminalLike = isTerminalHost();
			if (terminalLike && isC && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
				const hasValue = value.length > 0;
				const hasMentions = (props.mentions?.length ?? 0) > 0;
				const hasMultiline = (props.multilineTexts?.length ?? 0) > 0;
				if (hasValue || hasMentions || hasMultiline) {
					e.preventDefault();
					e.stopPropagation();
					clearAll();
					return;
				}
			}
			if (isClipboardShortcut && isZ) {
				e.preventDefault();
				e.stopPropagation();
				if (e.shiftKey) redo();
				else undo();
				return;
			}
			if (isClipboardShortcut && isY) {
				e.preventDefault();
				e.stopPropagation();
				redo();
				return;
			}
			if (terminalLike && e.ctrlKey && !e.metaKey && !e.altKey && (isA || isE)) {
				e.preventDefault();
				const { line, lines } = indexToLineCellCol(value, cursor.value);
				const next = isA ? lines[line].start : lines[line].end;
				applyMove(next, extend);
				return;
			}
			if (terminalLike && e.altKey && !e.ctrlKey && !e.metaKey) {
				const isB = e.key === "b" || e.key === "B";
				const isF = e.key === "f" || e.key === "F";
				if (isB || isF) {
					e.preventDefault();
					const next = isB ? findWordLeft(value, cursor.value) : findWordRight(value, cursor.value);
					applyMove(next, extend);
					return;
				}
			}
			if (isClipboardShortcut && isA) {
				e.preventDefault();
				e.stopPropagation();
				anchor.value = 0;
				cursor.value = value.length;
				ensureCursorVisible();
				scheduler.invalidate();
				return;
			}
			if (!terminalLike && isClipboardShortcut && (isC || isX) && sel) {
				e.preventDefault();
				e.stopPropagation();
				const text = value.slice(sel.start, sel.end);
				copySelectionText(text);
				if (isX) {
					const next = value.slice(0, sel.start) + value.slice(sel.end);
					pushUndoSnapshot(next);
					applyEdit(next, sel.start);
				}
				return;
			}
			if (terminalLike && isClipboardShortcut && isV) {
				e.preventDefault();
				e.stopPropagation();
				readClipboardText().then(async (text) => {
					if (text) {
						await handlePasteText(text);
						return;
					}
					await tryPasteImageFromHandler();
				});
				return;
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				const next = toBoundaryArrows ? 0 : byWord ? findWordLeft(value, cursor.value) : (() => {
					if (cursor.value <= 0) return 0;
					const range = graphemeRangeAt(value, cursor.value - 1);
					return range ? range.start : cursor.value - 1;
				})();
				applyMove(next, extend);
				return;
			}
			if (e.key === "ArrowRight") {
				e.preventDefault();
				const next = toBoundaryArrows ? value.length : byWord ? findWordRight(value, cursor.value) : (() => {
					if (cursor.value >= value.length) return value.length;
					const range = graphemeRangeAt(value, cursor.value);
					return range ? range.end : cursor.value + 1;
				})();
				applyMove(next, extend);
				return;
			}
			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				e.preventDefault();
				const wrap = wrapMode.value;
				const { w: contentW } = measureContent(absRect.value);
				const width = Math.max(1, contentW);
				const firstW = width;
				const { line, col, lines } = wrap ? indexToWrappedCellColFirstWidthInline(value, props.multilineTexts, props.mentions, cursor.value, firstW, width) : indexToLineCellColInline(value, props.multilineTexts, props.mentions, cursor.value);
				const targetLine = e.key === "ArrowUp" ? line - 1 : line + 1;
				if (targetLine < 0) {
					const next$1 = lines[line].start;
					applyMove(next$1, extend);
					return;
				}
				if (targetLine >= lines.length) {
					const next$1 = lines[line].end;
					applyMove(next$1, extend);
					return;
				}
				const nextLine = targetLine;
				const wantCol = desiredCol.value ?? col;
				const next = wrap ? wrappedCellColToIndexInline(value, props.multilineTexts, props.mentions, lines[nextLine], wantCol).index : lineCellColToIndexInline(value, props.multilineTexts, props.mentions, lines[nextLine].start, lines[nextLine].end, wantCol).index;
				applyMove(next, extend);
				desiredCol.value = wantCol;
				return;
			}
			if (e.key === "Home") {
				e.preventDefault();
				if (toBoundaryHomeEnd) applyMove(0, extend);
				else {
					const { line, lines } = indexToLineCellCol(value, cursor.value);
					const next = lines[line].start;
					applyMove(next, extend);
				}
				return;
			}
			if (e.key === "End") {
				e.preventDefault();
				if (toBoundaryHomeEnd) applyMove(value.length, extend);
				else {
					const { line, lines } = indexToLineCellCol(value, cursor.value);
					const next = lines[line].end;
					applyMove(next, extend);
				}
				return;
			}
			const clearWithDeleteOrBackspace = Boolean(!e.altKey && (e.ctrlKey && !e.metaKey || e.metaKey && !e.ctrlKey));
			if (e.key === "Delete" && clearWithDeleteOrBackspace) {
				e.preventDefault();
				e.stopPropagation();
				clearAll();
				return;
			}
			if (e.key === "Backspace" && clearWithDeleteOrBackspace) {
				e.preventDefault();
				e.stopPropagation();
				clearAll();
				return;
			}
			if ((e.key === "u" || e.key === "U") && e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				clearAll();
				return;
			}
			if ((e.key === "w" || e.key === "W") && e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				clearAll();
				return;
			}
			if (e.key === "Backspace") {
				const mentions = props.mentions ?? [];
				if (!value && cursor.value <= 0 && mentions.length > 0) {
					e.preventDefault();
					emit("update:mentions", mentions.slice(0, -1));
					scheduler.invalidate();
					return;
				}
				e.preventDefault();
				const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
				if (deleted) {
					pushUndoSnapshot(afterDelete);
					applyEdit(afterDelete, nextCursor);
					return;
				}
				if (cursor.value <= 0) return;
				if (cursor.value >= 2 && value[cursor.value - 1] === " " && isMentionToken(value, cursor.value - 2)) {
					const mentionIdx = mentionIndexAt(value, cursor.value - 2);
					const current = props.mentions ?? [];
					if (mentionIdx >= 0 && mentionIdx < current.length) {
						const nextMentions = [...current.slice(0, mentionIdx), ...current.slice(mentionIdx + 1)];
						emit("update:mentions", nextMentions);
					}
					const next$1 = value.slice(0, cursor.value - 2) + value.slice(cursor.value);
					pushUndoSnapshot(next$1);
					applyEdit(next$1, cursor.value - 2);
					return;
				}
				if (isMentionToken(value, cursor.value - 1)) {
					const mentionIdx = mentionIndexAt(value, cursor.value - 1);
					const current = props.mentions ?? [];
					if (mentionIdx >= 0 && mentionIdx < current.length) {
						const nextMentions = [...current.slice(0, mentionIdx), ...current.slice(mentionIdx + 1)];
						emit("update:mentions", nextMentions);
					}
					const next$1 = value.slice(0, cursor.value - 1) + value.slice(cursor.value);
					pushUndoSnapshot(next$1);
					applyEdit(next$1, cursor.value - 1);
					return;
				}
				if (isMultilineToken(value, cursor.value - 1)) {
					const tokenIdx = tokenIndexAt(value, cursor.value - 1);
					const current = props.multilineTexts ?? [];
					if (tokenIdx >= 0 && tokenIdx < current.length) {
						const nextMultiline = [...current.slice(0, tokenIdx), ...current.slice(tokenIdx + 1)];
						emit("update:multilineTexts", nextMultiline);
					}
				}
				const range = graphemeRangeAt(value, cursor.value - 1);
				if (!range) return;
				const next = value.slice(0, range.start) + value.slice(range.end);
				pushUndoSnapshot(next);
				applyEdit(next, range.start);
				return;
			}
			if (e.key === "Delete") {
				e.preventDefault();
				const { value: afterDelete, cursor: nextCursor, deleted } = deleteSelectionIfAny(value);
				if (deleted) {
					pushUndoSnapshot(afterDelete);
					applyEdit(afterDelete, nextCursor);
					return;
				}
				if (cursor.value >= value.length) return;
				if (isMentionToken(value, cursor.value) && value[cursor.value + 1] === " ") {
					const mentionIdx = mentionIndexAt(value, cursor.value);
					const current = props.mentions ?? [];
					if (mentionIdx >= 0 && mentionIdx < current.length) {
						const nextMentions = [...current.slice(0, mentionIdx), ...current.slice(mentionIdx + 1)];
						emit("update:mentions", nextMentions);
					}
					const next$1 = value.slice(0, cursor.value) + value.slice(cursor.value + 2);
					pushUndoSnapshot(next$1);
					applyEdit(next$1, cursor.value);
					return;
				}
				if (isMentionToken(value, cursor.value)) {
					const mentionIdx = mentionIndexAt(value, cursor.value);
					const current = props.mentions ?? [];
					if (mentionIdx >= 0 && mentionIdx < current.length) {
						const nextMentions = [...current.slice(0, mentionIdx), ...current.slice(mentionIdx + 1)];
						emit("update:mentions", nextMentions);
					}
					const next$1 = value.slice(0, cursor.value) + value.slice(cursor.value + 1);
					pushUndoSnapshot(next$1);
					applyEdit(next$1, cursor.value);
					return;
				}
				if (isMultilineToken(value, cursor.value)) {
					const tokenIdx = tokenIndexAt(value, cursor.value);
					const current = props.multilineTexts ?? [];
					if (tokenIdx >= 0 && tokenIdx < current.length) {
						const nextMultiline = [...current.slice(0, tokenIdx), ...current.slice(tokenIdx + 1)];
						emit("update:multilineTexts", nextMultiline);
					}
				}
				const range = graphemeRangeAt(value, cursor.value);
				if (!range) return;
				const next = value.slice(0, range.start) + value.slice(range.end);
				pushUndoSnapshot(next);
				applyEdit(next, range.start);
				return;
			}
			if (e.key === "Enter") {
				const submitOnEnter = props.submitOnEnter !== false;
				const isSubmitEnter = submitOnEnter && !e.shiftKey;
				if (isSubmitEnter && hasPendingPasteImages()) {
					e.preventDefault();
					e.stopPropagation();
					emit("validationError", { reason: "paste_image_pending" });
					return;
				}
				e.preventDefault();
				if (!submitOnEnter || e.shiftKey) insertText("\n");
				else {
					if (inDialog) e.__tuiDialogConfirm = !e.ctrlKey && !e.metaKey && !e.altKey;
					emit("change", value);
				}
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				if (props.clearOnEscape) {
					clearAll();
					return;
				}
				const manager = events.value;
				if (manager && manager.getFocused()) {
					manager.focus(null);
					return;
				}
				applyBlur();
				return;
			}
			if (isPrintableKey(e)) {
				e.preventDefault();
				insertText(e.key);
			}
		}
		function applyFocus() {
			focused.value = true;
			emit("focus");
			const valueLen = getValue().length;
			const shouldCursorToEnd = props.cursorToEndOnFirstFocus && !hasFocusedOnce.value && !skipCursorToEndOnNextFocus.value;
			skipCursorToEndOnNextFocus.value = false;
			if (shouldCursorToEnd) {
				cursor.value = valueLen;
				anchor.value = null;
			}
			hasFocusedOnce.value = true;
			cursor.value = clamp$8(cursor.value, 0, valueLen);
			ensureCursorVisible();
			syncImeAnchorNow();
			startBlink();
			scheduler.invalidate();
		}
		function applyBlur() {
			focused.value = false;
			anchor.value = null;
			compositionBlocked.value = false;
			composing.value = false;
			compositionText.value = "";
			if (imeAnchor?.value?.ownerId === imeOwnerId) imeAnchor.value = null;
			stopBlink();
			emit("blur");
			scheduler.invalidate();
		}
		const { id: id$1 } = useTerminalNode(() => ({
			rect: absRect.value,
			zIndex: eventZ.value,
			visible: visible.value,
			focusable: true,
			handlers: {
				pointerenter: (e) => {
					emit("pointerenter", e);
				},
				pointerleave: (e) => {
					emit("pointerleave", e);
				},
				pointerdown: (e) => {
					if (e.button !== 0) return;
					mouseDownCell = {
						cellX: e.cellX,
						cellY: e.cellY
					};
					mouseDownShift = Boolean(e.shiftKey);
					mouseDragSelecting = false;
					suppressNextClick = false;
				},
				pointermove: (e) => {
					if (!mouseDownCell) return;
					const moved = mouseDownCell.cellX !== e.cellX || mouseDownCell.cellY !== e.cellY;
					if (!mouseDragSelecting && !moved) return;
					if (!mouseDragSelecting) {
						mouseDragSelecting = true;
						suppressNextClick = true;
						if (mouseDownShift) {
							setCursorByCell2D(e.cellX, e.cellY, true, e, false);
							scheduler.invalidate();
							return;
						}
						setCursorByCell2D(mouseDownCell.cellX, mouseDownCell.cellY, false, e, false);
						if (e.defaultPrevented) return;
						anchor.value = cursor.value;
					}
					setCursorByCell2D(e.cellX, e.cellY, true, e, false);
					scheduler.invalidate();
				},
				pointerup: () => {
					if (isTerminalHost() && mouseDragSelecting) {
						const sel = selection.value;
						if (sel) {
							const value = getValue();
							const text = value.slice(sel.start, sel.end);
							if (text) copySelectionText(text);
						}
					}
					if (mouseDragSelecting) suppressNextClick = true;
					mouseDownCell = null;
					mouseDownShift = false;
					mouseDragSelecting = false;
				},
				beforeinput: (e) => {
					if (compositionBlocked.value) return;
					if (e.isComposing || e.inputType === "insertCompositionText") {
						composing.value = true;
						compositionText.value = readEventText(e);
						ensureCursorVisible();
						scheduler.invalidate();
					}
				},
				click: (e) => {
					if (suppressNextClick) {
						suppressNextClick = false;
						return;
					}
					const t = typeof e.timeStamp === "number" ? e.timeStamp : Date.now();
					const sameSpot = Boolean(lastClick && lastClick.cellX === e.cellX && lastClick.cellY === e.cellY);
					const withinWindow = Boolean(lastClick && t - lastClick.time <= DOUBLE_CLICK_MS);
					const count = sameSpot && withinWindow ? lastClick.count + 1 : 1;
					const isDoubleClick = count === 2;
					const isTripleClick = count >= 3;
					lastClick = {
						time: t,
						cellX: e.cellX,
						cellY: e.cellY,
						count
					};
					focused.value = true;
					skipCursorToEndOnNextFocus.value = true;
					const manager = events.value;
					if (manager && id$1.value) manager.focus(id$1.value);
					emit("focus");
					const extend = !isDoubleClick && !isTripleClick && Boolean(e.shiftKey);
					setCursorByCell2D(e.cellX, e.cellY, extend, e, true);
					if (e.defaultPrevented) return;
					if (isTripleClick) {
						selectAll();
						lastClick = null;
						return;
					}
					if (isDoubleClick) selectTokenAtCursor();
					scheduler.invalidate();
				},
				paste: (e) => {
					e.preventDefault();
					const text = readEventText(e);
					if (text) {
						handlePasteText(text);
						return;
					}
					tryPasteImageFromHandler();
				},
				compositionstart: (e) => {
					compositionBlocked.value = false;
					composing.value = true;
					compositionText.value = readEventText(e);
					ensureCursorVisible();
					scheduler.invalidate();
				},
				compositionupdate: (e) => {
					if (compositionBlocked.value) return;
					composing.value = true;
					compositionText.value = readEventText(e);
					ensureCursorVisible();
					scheduler.invalidate();
				},
				compositionend: (e) => {
					if (compositionBlocked.value) return;
					const text = readEventText(e) || compositionText.value;
					composing.value = false;
					compositionText.value = "";
					compositionBlocked.value = false;
					if (text) {
						suppressEnterUntil = (typeof e.timeStamp === "number" ? e.timeStamp : Date.now()) + 32;
						insertText(text);
					}
					skipNextInput.value = true;
					queueMicrotask(() => {
						skipNextInput.value = false;
					});
					scheduler.invalidate();
				},
				input: (e) => {
					if (skipNextInput.value) return;
					if (compositionBlocked.value) return;
					if (e.isComposing) {
						composing.value = true;
						compositionText.value = readEventText(e);
						ensureCursorVisible();
						scheduler.invalidate();
						return;
					}
					if (composing.value) {
						const text$1 = readEventText(e) || compositionText.value;
						composing.value = false;
						compositionText.value = "";
						if (text$1) {
							suppressEnterUntil = (typeof e.timeStamp === "number" ? e.timeStamp : Date.now()) + 32;
							insertText(text$1);
						}
						scheduler.invalidate();
						return;
					}
					const text = readEventText(e);
					if (text) insertText(text);
				},
				focus: () => {
					applyFocus();
				},
				blur: () => {
					applyBlur();
				},
				keydown: onKeydown
			}
		}));
		const autoFocusArmed = ref(true);
		watchEffect(() => {
			if (!props.autoFocus || !visible.value) {
				autoFocusArmed.value = true;
				return;
			}
			const manager = events.value;
			const nodeId = id$1.value;
			if (!manager || !nodeId) return;
			if (manager.getFocused() === nodeId) {
				autoFocusArmed.value = false;
				return;
			}
			if (!autoFocusArmed.value) return;
			manager.focus(nodeId);
			autoFocusArmed.value = false;
		});
		watchEffect(() => {
			const manager = events.value;
			const nodeId = id$1.value;
			if (!manager || !nodeId) return;
			const isFocused = manager.getFocused() === nodeId;
			if (isFocused && !focused.value) {
				applyFocus();
				return;
			}
			if (!isFocused && focused.value) applyBlur();
		});
		useRenderNode(() => ({
			zIndex: props.zIndex,
			priority: pendingValue.value != null ? "high" : "normal",
			rect: visible.value ? absRect.value : {
				x: 0,
				y: 0,
				w: 0,
				h: 0
			},
			deps: [
				visible.value,
				absRect.value,
				props.w,
				props.h,
				props.zIndex,
				props.modelValue,
				props.mentions,
				props.multilineTexts,
				props.placeholder,
				props.placeholderWhenFocused,
				props.style,
				props.autoFocus,
				props.cursorBlink,
				props.cursorShape,
				props.blinkInterval,
				focused.value,
				cursor.value,
				anchor.value,
				scrollX.value,
				scrollY.value,
				composing.value,
				compositionText.value,
				blinkOn.value,
				defaultStyle.value,
				chipStyleProvider.value?.version.value ?? 0,
				pendingValue.value,
				props.skillHighlightStyle,
				props.skillTrigger
			],
			paint: () => {
				if (!visible.value) return;
				const r = absRect.value;
				if (r.w <= 0 || r.h <= 0) return;
				const style = props.style ?? defaultStyle.value;
				const placeholderVisible = shouldShowPlaceholder.value;
				const offX = placeholderVisible ? 0 : scrollX.value;
				const offY = placeholderVisible ? 0 : scrollY.value;
				const wrap = wrapMode.value && !placeholderVisible;
				const valueTextRaw = getValue();
				const composed = getComposedTextAndCursor(valueTextRaw);
				const textRaw = placeholderVisible ? props.placeholderWhenFocused ? ` ${props.placeholder}` : props.placeholder : composed.text;
				const text = props.secret && !placeholderVisible ? maskText(textRaw) : textRaw;
				const baseStyle = placeholderVisible ? {
					...style,
					fg: style.fg ?? "white",
					dim: true,
					bold: false
				} : style;
				const { wAll, padX, w: contentW } = measureContent(r);
				const x0 = r.x + padX;
				const width = Math.max(1, contentW);
				const firstWidth = width;
				const lines = wrap ? wrapToLinesFirstWidthInline(text, props.multilineTexts, props.mentions, firstWidth, width) : computeLines(text);
				for (let row = 0; row < r.h; row++) {
					const lineIndex = offY + row;
					const info = lines[lineIndex];
					const rowTextW = width;
					const rowRender = info ? buildInlineRow(textRaw, text, props.multilineTexts, props.mentions, info.start, info.end, rowTextW, wrap ? 0 : offX) : {
						text: spaces$1(rowTextW),
						chips: []
					};
					const visible$1 = rowRender.text;
					terminal.write(spaces$1(wAll), {
						x: r.x,
						y: r.y + row,
						style: baseStyle
					});
					if (contentW <= 0) continue;
					const textX = x0;
					terminal.write(visible$1, {
						x: textX,
						y: r.y + row,
						style: baseStyle
					});
					if (rowRender.chips.length > 0) for (const chip of rowRender.chips) {
						let chipStyle;
						if (chip.kind === "multiline") chipStyle = {
							...style,
							fg: "cyanBright",
							underline: true,
							bold: true
						};
						else {
							const absPath = String(chip.absPath ?? "");
							chipStyle = chipStyleProvider.value?.getStyle(style, {
								kind: "mention",
								absPath
							}) ?? mentionChipStyle(style, absPath);
							const href = toTerminalHref(absPath);
							if (href) chipStyle = {
								...chipStyle,
								href
							};
						}
						terminal.write(chip.label, {
							x: textX + chip.startCell,
							y: r.y + row,
							style: chipStyle
						});
					}
					const shlStyle = props.skillHighlightStyle;
					if (shlStyle && props.skillTrigger && !placeholderVisible) {
						const trigger = props.skillTrigger;
						const vis = visible$1;
						let searchFrom = 0;
						while (searchFrom < vis.length) {
							const idx = vis.indexOf(trigger, searchFrom);
							if (idx < 0) break;
							let end = idx + trigger.length;
							while (end < vis.length && vis[end] !== " " && vis[end] !== "\n") end++;
							if (end > idx + trigger.length) {
								const label = vis.slice(idx, end);
								const cellStart = textCellWidth$1(vis.slice(0, idx));
								terminal.write(label, {
									x: textX + cellStart,
									y: r.y + row,
									style: {
										...style,
										...shlStyle
									}
								});
							}
							searchFrom = end;
						}
					}
				}
				const sel = selection.value;
				if (sel && !placeholderVisible) {
					const bg = "blueBright";
					const fg = "black";
					for (let row = 0; row < r.h; row++) {
						const lineIndex = offY + row;
						const info = lines[lineIndex];
						if (!info) continue;
						const rowTextW = width;
						const xBase = x0;
						const y = r.y + row;
						const rowOffX = wrap ? 0 : offX;
						const segments = buildInlineSelectionSegments(composed.text, text, props.multilineTexts, props.mentions, info.start, info.end, sel, rowTextW, rowOffX);
						for (const seg of segments) {
							if (!seg.text) continue;
							terminal.write(seg.text, {
								x: xBase + seg.startCell,
								y,
								style: {
									...style,
									fg,
									bg
								}
							});
						}
					}
				}
				if (focused.value && blinkOn.value && !(selection.value && !placeholderVisible)) {
					const wAll$1 = width;
					const firstW = wAll$1;
					const cursorTextRaw = placeholderVisible ? "" : composed.text;
					const cursorText = props.secret && !placeholderVisible ? maskText(cursorTextRaw) : cursorTextRaw;
					const pos = wrap ? indexToWrappedCellColFirstWidthInline(cursorText, props.multilineTexts, props.mentions, composed.cursor, firstW, wAll$1) : indexToLineCellColInline(cursorText, props.multilineTexts, props.mentions, composed.cursor);
					const cx0 = pos.col - offX;
					const cy = pos.line - offY;
					if (imeAnchor && focused.value) {
						const cx = clamp$8(cx0, 0, Math.max(0, width - 1));
						const cyClamped = clamp$8(cy, 0, Math.max(0, r.h - 1));
						imeAnchor.value = {
							cellX: r.x + padX + cx,
							cellY: r.y + cyClamped,
							ownerId: imeOwnerId
						};
					}
					if (cx0 >= 0 && cx0 < width && cy >= 0 && cy < r.h) {
						const y = r.y + cy;
						let x = x0 + cx0;
						let cell = null;
						try {
							cell = terminal.getCell(x, y);
							if (cell.continuation && x > 0) {
								x -= 1;
								cell = terminal.getCell(x, y);
							}
						} catch {
							cell = null;
						}
						const fallbackFg = style.fg ?? defaultStyle.value.fg ?? "whiteBright";
						const fallbackBg = style.bg ?? defaultStyle.value.bg ?? "black";
						const cellStyle = cell?.style ?? style;
						const baseCursorStyle = {
							...cellStyle,
							fg: cellStyle.fg ?? fallbackFg,
							bg: cellStyle.bg ?? fallbackBg,
							dim: false
						};
						const ch = cell && !cell.continuation ? cell.ch || " " : " ";
						if (props.cursorShape === "underline") terminal.put(x, y, ch, {
							...baseCursorStyle,
							underline: true
						});
						else if (props.cursorShape === "bar") if (ch === " ") terminal.put(x, y, "│", {
							...baseCursorStyle,
							fg: baseCursorStyle.fg ?? fallbackFg
						});
						else terminal.put(x, y, ch, {
							...baseCursorStyle,
							inverse: true
						});
						else terminal.put(x, y, ch, {
							...baseCursorStyle,
							inverse: true
						});
					}
				}
			}
		}));
		onBeforeUnmount(() => {
			stopBlink();
		});
		return () => h("span", rootProps);
	}
});

//#endregion
//#region ../../src/vue/router/context.ts
const TerminalRouterKey = Symbol("TerminalRouter");
const TerminalRouteKey = Symbol("TerminalRoute");

//#endregion
//#region ../../src/vue/router/composables.ts
function useRouter$1() {
	const r = inject(TerminalRouterKey, null);
	if (!r) throw new Error("TerminalRouter is missing");
	return r;
}

//#endregion
//#region src/pages/ChatPage/context.ts
const ChatPageContextKey = Symbol("GoatChainChatPageContext");

//#endregion
//#region src/pages/ChatPage/styles.ts
const CHROME_STYLE = {
	fg: "whiteBright",
	bg: "black"
};
const PANEL_BORDER_STYLE = {
	fg: "white",
	dim: true,
	bg: "blackBright"
};
const PANEL_FILL_STYLE = {
	fg: "whiteBright",
	bg: "blackBright"
};
const INPUT_STYLE = {
	fg: "whiteBright",
	bg: "blackBright"
};
const MUTED_STYLE = {
	fg: "white",
	dim: true,
	bg: "black"
};

//#endregion
//#region src/pages/ChatPage/components/ChatBottomPanel.ts
const GoatChainChatBottomPanel = defineComponent({
	name: "GoatChainChatBottomPanel",
	setup() {
		const injected = inject(ChatPageContextKey);
		if (!injected) throw new Error("GoatChainChatBottomPanel missing ChatPageContext");
		const ctx = injected;
		const promptMentionPlugin = createPromptMentionPlugin(ctx.nodeLike ? { mentionPathProvider: createNodeMentionPathProvider() } : {});
		return () => {
			const innerW = ctx.panelW.value - 2;
			const innerH = ctx.panelH.value;
			const topBorder = `╭${"─".repeat(Math.max(0, innerW))}╮`;
			const bottomBorder = `╰${"─".repeat(Math.max(0, innerW))}╯`;
			const sideBorderLeft = Array.from({ length: innerH }, () => "│").join("\n");
			const sideBorderRight = Array.from({ length: innerH }, () => "│").join("\n");
			const nodes = [
				h(TText$1, {
					key: "panel-top-border",
					x: ctx.panelX.value,
					y: ctx.panelTopY.value - 1,
					w: ctx.panelW.value,
					value: topBorder,
					style: PANEL_BORDER_STYLE,
					zIndex: -20
				}),
				h(TText$1, {
					key: "panel-fill",
					x: ctx.panelX.value + 1,
					y: ctx.panelTopY.value,
					w: Math.max(0, ctx.panelW.value - 2),
					h: ctx.panelH.value,
					value: "",
					style: PANEL_FILL_STYLE,
					zIndex: -20
				}),
				h(TText$1, {
					key: "panel-left-border",
					x: ctx.panelX.value,
					y: ctx.panelTopY.value,
					w: 1,
					h: innerH,
					value: sideBorderLeft,
					style: PANEL_BORDER_STYLE,
					zIndex: -19
				}),
				h(TText$1, {
					key: "panel-right-border",
					x: ctx.panelX.value + ctx.panelW.value - 1,
					y: ctx.panelTopY.value,
					w: 1,
					h: innerH,
					value: sideBorderRight,
					style: PANEL_BORDER_STYLE,
					zIndex: -19
				}),
				h(TText$1, {
					key: "panel-bottom-border",
					x: ctx.panelX.value,
					y: ctx.panelTopY.value + ctx.panelH.value,
					w: ctx.panelW.value,
					value: bottomBorder,
					style: PANEL_BORDER_STYLE,
					zIndex: -20
				}),
				h(TInput$1, {
					"key": "chat-input",
					"x": ctx.inputX.value,
					"y": ctx.panelTopY.value,
					"w": ctx.inputInnerW.value,
					"h": ctx.inputLines.value,
					"modelValue": ctx.input.value,
					"onUpdate:modelValue": (v) => ctx.input.value = v,
					"autoFocus": ctx.focusMode.value === "input" && !ctx.showCommands.value && !ctx.showTheme.value && !ctx.showSessions.value && !ctx.showMessageActions.value && !ctx.showRedoConfirm.value && !ctx.showConfig.value && !ctx.showApproval.value && !ctx.showPathPicker.value,
					"cursorShape": "bar",
					"cursorBlink": false,
					"placeholder": "Ask anything...",
					"placeholderWhenFocused": true,
					"style": INPUT_STYLE,
					"plugins": [promptMentionPlugin],
					"promptSuggestions": ctx.promptSuggestions,
					"mentionWorkspace": ctx.nodeLike ? ctx.pickerWorkspace.value : "",
					"mentionMode": "any",
					"collectMentions": true,
					"mentions": ctx.focusFiles.value,
					"onUpdate:mentions": (v) => ctx.focusFiles.value = [...v],
					"onMentionClick": (absPath) => {
						if (!ctx.nodeLike) return;
						ctx.showPathPicker.value = true;
						ctx.pathPickerMode.value = "file";
						ctx.pathPickerQuery.value = absPath;
						ctx.pathPickerError.value = null;
					},
					"onChange": (v) => ctx.send(v),
					"onKeydown": ctx.onInputKeydown,
					"onFocus": () => ctx.focusMode.value = "input",
					"zIndex": -10
				})
			];
			const rowY = ctx.panelTopY.value + ctx.inputLines.value + ctx.modelRowGap.value;
			const ctxText = ctx.ctxPctChip.value;
			const chip = ctx.modelInfo.value.build;
			const label = ctx.modelInfo.value.label;
			const ctxW = textCellWidth$2(ctxText);
			const chipW = textCellWidth$2(chip);
			const labelW = textCellWidth$2(label);
			const ctxGap = 2;
			const totalW = ctxW + ctxGap + chipW + 1 + labelW;
			const startX = ctx.inputX.value + Math.max(0, ctx.inputInnerW.value - totalW);
			const statusW = Math.max(0, startX - ctx.inputX.value - 1);
			if (statusW > 0) {
				const mode = ctx.modeLabel.value;
				const modeTag = ` ${mode.toUpperCase()} `;
				const modeBg = mode === "chat" ? "blueBright" : mode === "plan" ? "magentaBright" : "greenBright";
				const modeW = Math.min(statusW, textCellWidth$2(modeTag));
				nodes.push(h(TText$1, {
					key: "panel-mode",
					x: ctx.inputX.value,
					y: rowY,
					w: modeW,
					value: modeTag,
					style: {
						fg: "black",
						bg: modeBg,
						bold: true
					},
					zIndex: -18
				}));
				const statusX = ctx.inputX.value + modeW + 1;
				const statusAvail = Math.max(0, statusW - modeW - 1);
				if (ctx.assistantStatusDisplay.value && statusAvail > 0) nodes.push(h(TText$1, {
					key: "panel-status",
					x: statusX,
					y: rowY,
					w: statusAvail,
					value: ctx.assistantStatusDisplay.value,
					style: ctx.assistantStatusStyle.value,
					zIndex: -18
				}));
			}
			nodes.push(h(TText$1, {
				key: "ctx-pct",
				x: startX,
				y: rowY,
				value: ctxText,
				style: {
					fg: "white",
					dim: true,
					bg: "blackBright"
				},
				zIndex: -18
			}));
			nodes.push(h(TText$1, {
				key: "model-chip",
				x: startX + ctxW + ctxGap,
				y: rowY,
				value: chip,
				style: {
					fg: "blueBright",
					bold: true,
					bg: "blackBright"
				},
				zIndex: -18
			}));
			nodes.push(h(TText$1, {
				key: "model-label",
				x: startX + ctxW + ctxGap + chipW + 1,
				y: rowY,
				w: Math.max(0, ctx.inputX.value + ctx.inputInnerW.value - (startX + ctxW + ctxGap + chipW + 1)),
				value: label,
				style: {
					fg: "white",
					dim: true,
					bg: "blackBright"
				},
				zIndex: -18
			}));
			return nodes;
		};
	}
});

//#endregion
//#region src/pages/ChatPage/components/ChatFooter.ts
const GoatChainChatFooter = defineComponent({
	name: "GoatChainChatFooter",
	setup() {
		const injected = inject(ChatPageContextKey);
		if (!injected) throw new Error("GoatChainChatFooter missing ChatPageContext");
		const ctx = injected;
		return () => {
			const footerY = Math.max(0, ctx.rows.value - ctx.footerH);
			const selectionHint = "drag to select";
			return [
				ctx.rows.value > 0 ? h(TText, {
					key: "footer-bg",
					x: 0,
					y: footerY,
					w: ctx.cols.value,
					value: "",
					style: CHROME_STYLE,
					zIndex: 4
				}) : null,
				ctx.isLoading.value ? [
					h(TText, {
						key: "footer-dots",
						x: 2,
						y: footerY,
						value: ctx.loadingDots.value,
						style: {
							fg: "white",
							dim: true,
							bg: "black"
						},
						zIndex: 5
					}),
					h(TText, {
						key: "footer-esc",
						x: 2 + ctx.loadingDots.value.length + 2,
						y: footerY,
						value: "esc",
						style: {
							fg: "blackBright",
							bg: "black"
						},
						zIndex: 5
					}),
					h(TText, {
						key: "footer-interrupt",
						x: 2 + ctx.loadingDots.value.length + 2 + 4,
						y: footerY,
						value: "interrupt",
						style: {
							fg: "white",
							dim: true,
							bg: "black"
						},
						zIndex: 5
					})
				] : null,
				!ctx.isLoading.value ? h(TText, {
					key: "footer-left-hint",
					x: 2,
					y: footerY,
					value: selectionHint,
					style: MUTED_STYLE,
					zIndex: 5
				}) : null,
				h(TText, {
					key: "footer-right",
					x: Math.max(0, ctx.contentW.value - 2 - textCellWidth(ctx.footerRight.value)),
					y: footerY,
					value: ctx.footerRight.value,
					style: MUTED_STYLE,
					zIndex: 5
				})
			];
		};
	}
});

//#endregion
//#region src/pages/ChatPage/text.ts
function ellipsisByCells$1(text, maxCells) {
	maxCells = Math.max(0, Math.floor(maxCells));
	const s = String(text ?? "").replace(/\s+/g, " ").trim();
	if (!s || maxCells <= 0) return "";
	if (textCellWidth(s) <= maxCells) return s;
	if (maxCells <= 1) return sliceByCells(s, maxCells);
	return `${sliceByCells(s, maxCells - 1)}…`;
}

//#endregion
//#region src/pages/ChatPage/components/ChatHeader.ts
const GoatChainChatHeader = defineComponent({
	name: "GoatChainChatHeader",
	setup() {
		const injected = inject(ChatPageContextKey);
		if (!injected) throw new Error("GoatChainChatHeader missing ChatPageContext");
		const ctx = injected;
		return () => {
			const stats = ctx.headerStatsDisplay.value;
			const statsW = textCellWidth(stats);
			const statsX = Math.max(0, ctx.contentW.value - 2 - statsW);
			const env = ctx.store.state.context?.env ?? {};
			const version = String(env.DIMCODE_VERSION || env.VUE_TERMINAL_VERSION || "").trim();
			const workspace = String(ctx.pickerWorkspace.value ?? "").trim();
			const rightMetaRaw = [version ? `v${version}` : "", workspace].filter(Boolean).join(" · ");
			const rowW = Math.max(0, ctx.contentW.value - 4);
			const minTitleW = 12;
			const titleGap = 2;
			const rightMetaMaxW = rightMetaRaw ? Math.max(0, rowW - minTitleW - titleGap) : 0;
			const rightMeta = rightMetaRaw ? ellipsisByCells$1(rightMetaRaw, rightMetaMaxW) : "";
			const rightMetaW = rightMeta ? textCellWidth(rightMeta) : 0;
			const rightMetaX = rightMeta ? Math.max(0, ctx.contentW.value - 2 - rightMetaW) : 0;
			const titleX = 2;
			const titleAvailW = rightMetaW ? Math.max(0, rowW - rightMetaW - titleGap) : rowW;
			const title = ellipsisByCells$1(ctx.sessionHeaderTitle.value, titleAvailW);
			const summaryX = 2;
			const summaryGap = 2;
			const summaryW = Math.max(0, statsX - summaryX - summaryGap);
			const nodes = [h(TText, {
				key: "page-title",
				x: 2,
				y: 0,
				w: rowW,
				value: "GoatChain",
				style: MUTED_STYLE
			}), h(TText, {
				key: "session-title",
				x: titleX,
				y: 1,
				w: titleAvailW,
				value: title,
				style: {
					fg: "blueBright",
					bold: true,
					bg: "black"
				}
			})];
			if (rightMeta) nodes.push(h(TText, {
				key: "header-meta",
				x: rightMetaX,
				y: 1,
				value: rightMeta,
				style: MUTED_STYLE
			}));
			nodes.push(h(TText, {
				key: "header-stats",
				x: statsX,
				y: 2,
				value: stats,
				style: MUTED_STYLE
			}));
			if (summaryW > 0) nodes.push(h(TText, {
				key: "header-summary",
				x: summaryX,
				y: 2,
				w: summaryW,
				value: ellipsisByCells$1(ctx.sessionHeaderSummary.value, summaryW),
				style: MUTED_STYLE
			}));
			return nodes;
		};
	}
});

//#endregion
//#region src/pages/ChatPage/components/ChatMessages.ts
function selectionRange(selStart, selEnd) {
	const active = Boolean(selStart && selEnd && (selStart.row !== selEnd.row || selStart.col !== selEnd.col));
	if (!active) return {
		active: false,
		startRow: -1,
		endRow: -1,
		startCol: 0,
		endCol: 0
	};
	const startRow = Math.min(selStart.row, selEnd.row);
	const endRow = Math.max(selStart.row, selEnd.row);
	const startCol = selStart.row < selEnd.row ? selStart.col : selStart.row > selEnd.row ? selEnd.col : Math.min(selStart.col, selEnd.col);
	const endCol = selStart.row < selEnd.row ? selEnd.col : selStart.row > selEnd.row ? selStart.col : Math.max(selStart.col, selEnd.col);
	return {
		active: true,
		startRow,
		endRow,
		startCol,
		endCol
	};
}
const GoatChainChatMessages = defineComponent({
	name: "GoatChainChatMessages",
	setup() {
		const injected = inject(ChatPageContextKey);
		if (!injected) throw new Error("GoatChainChatMessages missing ChatPageContext");
		const ctx = injected;
		const selection = computed(() => selectionRange(ctx.messageSelectStart.value, ctx.messageSelectEnd.value));
		function renderMessageLine(line, viewportRow) {
			const lineW = Math.max(0, ctx.mainW.value - 4);
			const actualRow = ctx.scrollTop.value + viewportRow;
			const lineBg = line.style?.bg ?? (line.hasBackground ? "blackBright" : "black");
			const range = selection.value;
			const lineHasSelection = range.active && actualRow >= range.startRow && actualRow <= range.endRow;
			let lineSelStart = 0;
			let lineSelEnd = 0;
			if (lineHasSelection) if (range.startRow === range.endRow) {
				lineSelStart = range.startCol;
				lineSelEnd = range.endCol;
			} else if (actualRow === range.startRow) {
				lineSelStart = range.startCol;
				lineSelEnd = lineW;
			} else if (actualRow === range.endRow) {
				lineSelStart = 0;
				lineSelEnd = range.endCol;
			} else {
				lineSelStart = 0;
				lineSelEnd = lineW;
			}
			const scrollTop = ctx.scrollTop.value;
			const parts = [];
			parts.push(h(TText, {
				key: `${scrollTop}_${viewportRow}_bg`,
				x: 0,
				y: viewportRow,
				w: lineW,
				value: spaces(lineW),
				style: { bg: lineBg },
				zIndex: 0
			}));
			parts.push(h(TText, {
				key: `${scrollTop}_${viewportRow}_base`,
				x: 0,
				y: viewportRow,
				w: lineW,
				value: line.text,
				style: {
					...line.style,
					bg: lineBg
				},
				zIndex: 1
			}));
			for (const seg of line.segments) {
				const segW = Math.max(0, Math.min(lineW - seg.x, seg.w));
				if (segW <= 0) continue;
				parts.push(h(TText, {
					key: `${scrollTop}_${viewportRow}_${seg.x}`,
					x: seg.x,
					y: viewportRow,
					w: segW,
					value: seg.text,
					style: {
						...seg.style,
						bg: lineBg
					},
					zIndex: 2
				}));
				if (seg.action?.type !== "openFile") continue;
				parts.push(h(TView, {
					key: `${scrollTop}_${viewportRow}_${seg.x}_hit`,
					x: seg.x,
					y: viewportRow,
					w: segW,
					h: 1,
					zIndex: 11,
					focusable: false,
					onClick: async (e) => {
						if (!ctx.nodeLike) return;
						const absPath = seg.action.absPath;
						if (e?.metaKey || e?.ctrlKey) try {
							const { exec } = await import("node:child_process");
							const platform = String(process.platform || "");
							const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
							exec(`${cmd} "${absPath}"`);
						} catch {}
					}
				}));
			}
			if (lineHasSelection && lineSelEnd > lineSelStart) {
				const selW = Math.min(lineSelEnd - lineSelStart, lineW - lineSelStart);
				const selText = (line.text.slice(lineSelStart, lineSelStart + selW) || "").padEnd(selW, " ");
				parts.push(h(TText, {
					key: `${scrollTop}_${viewportRow}_sel`,
					x: lineSelStart,
					y: viewportRow,
					w: selW,
					value: selText,
					style: {
						fg: "whiteBright",
						bg: "blueBright"
					},
					zIndex: 3
				}));
			}
			if (!line.action) return parts;
			parts.push(h(TView, {
				key: `${scrollTop}_${viewportRow}_hit`,
				x: 0,
				y: viewportRow,
				w: lineW,
				h: 1,
				zIndex: 10,
				focusable: true,
				onFocusCapture: () => ctx.focusMode.value = "messages",
				onKeydown: ctx.onSelectionKeydown,
				onClick: () => ctx.onLineClick(line.action)
			}));
			return parts;
		}
		const GoatChainUserMessageBlock = defineComponent({
			name: "GoatChainUserMessageBlock",
			props: {
				startRow: {
					type: Number,
					required: true
				},
				lines: {
					type: Array,
					required: true
				}
			},
			setup(props) {
				return () => props.lines.flatMap((line, i) => renderMessageLine(line, props.startRow + i));
			}
		});
		const GoatChainAssistantMessageBlock = defineComponent({
			name: "GoatChainAssistantMessageBlock",
			props: {
				startRow: {
					type: Number,
					required: true
				},
				lines: {
					type: Array,
					required: true
				}
			},
			setup(props) {
				return () => props.lines.flatMap((line, i) => renderMessageLine(line, props.startRow + i));
			}
		});
		return () => h(TView, {
			x: 2,
			y: ctx.mainY,
			w: Math.max(0, ctx.mainW.value - 4),
			h: ctx.mainH.value,
			zIndex: 1,
			selectable: true,
			focusable: true,
			onFocusCapture: () => ctx.focusMode.value = "messages",
			onWheel: ctx.onWheel,
			onKeydown: ctx.onSelectionKeydown,
			onClickCapture: ctx.onMessageClick,
			onPointerdownCapture: ctx.onMessagePointerDown,
			onPointermoveCapture: ctx.onMessagePointerMove,
			onPointerupCapture: ctx.onMessagePointerUp,
			onContextmenuCapture: ctx.onMessageContextMenu
		}, () => {
			const roleById = ctx.messageRoleById.value;
			const visibleLines = ctx.visibleLines.value;
			const out = [];
			let pendingKind = null;
			let pendingMessageId = "";
			let pendingStartRow = 0;
			let pendingLines = [];
			function flushPending() {
				if (!pendingKind) return;
				if (pendingKind === "user") out.push(h(GoatChainUserMessageBlock, {
					key: `u_${pendingMessageId}_${pendingStartRow}`,
					startRow: pendingStartRow,
					lines: pendingLines
				}));
				else out.push(h(GoatChainAssistantMessageBlock, {
					key: `a_${pendingMessageId}_${pendingStartRow}`,
					startRow: pendingStartRow,
					lines: pendingLines
				}));
				pendingKind = null;
				pendingMessageId = "";
				pendingLines = [];
			}
			for (let i = 0; i < visibleLines.length; i++) {
				const line = visibleLines[i];
				const messageId = String(line?.messageId ?? "").trim();
				if (!messageId) {
					flushPending();
					out.push(...renderMessageLine(line, i));
					continue;
				}
				const kind = roleById.get(messageId) === "user" ? "user" : "assistant";
				if (pendingKind && pendingMessageId === messageId && pendingKind === kind) {
					pendingLines.push(line);
					continue;
				}
				flushPending();
				pendingKind = kind;
				pendingMessageId = messageId;
				pendingStartRow = i;
				pendingLines = [line];
			}
			flushPending();
			return out;
		});
	}
});

//#endregion
//#region src/core/utils.ts
function safeJson(v) {
	try {
		return JSON.stringify(v);
	} catch {
		return "\"[unserializable]\"";
	}
}
function normalizeText(s) {
	return s.replace(/\r/g, "").trimEnd();
}

//#endregion
//#region src/ui/components/ApprovalDialog.ts
function clamp$7(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function extractBashPreview(call) {
	if (!call) return null;
	const args = call.arguments;
	const command = typeof args?.command === "string" ? args.command : void 0;
	const description = typeof args?.description === "string" ? args.description : void 0;
	if (!command && !description) return null;
	return {
		command,
		description
	};
}
const GoatChainApprovalDialog = defineComponent({
	name: "GoatChainApprovalDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		request: {
			type: Object,
			required: true
		},
		call: {
			type: Object,
			required: false,
			default: null
		},
		w: {
			type: Number,
			required: true
		},
		h: {
			type: Number,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"approve": () => true,
		"deny": () => true
	},
	setup(props, { emit }) {
		return () => {
			if (!props.modelValue) return null;
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"onKeydownCapture": (e) => {
					if (typeof e?.key === "string" && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
						e.preventDefault?.();
						e.stopPropagation?.();
					}
				},
				"w": props.w,
				"h": props.h,
				"title": "Approve Tool Permission",
				"placement": "center",
				"backdrop": false,
				"padding": 1,
				"style": {
					fg: "yellowBright",
					bg: "black"
				},
				"buttons": [
					{
						label: "Approve",
						value: "approve",
						kind: "primary",
						default: true
					},
					{
						label: "Deny",
						value: "deny"
					},
					{
						label: "Later",
						value: "later"
					}
				],
				"onConfirm": (btn) => {
					if (btn?.value === "approve") emit("approve");
					else if (btn?.value === "deny") emit("deny");
					emit("update:modelValue", false);
				},
				"onClose": () => emit("update:modelValue", false)
			}, () => {
				const req = props.request;
				const bash = extractBashPreview(props.call);
				const w = Math.max(0, props.w - 4);
				const innerH = Math.max(0, props.h - 4);
				const footerGap = 2;
				const contentH = Math.max(0, innerH - footerGap);
				const nodes = [
					h(TText, {
						x: 0,
						y: 0,
						w,
						h: innerH,
						value: "",
						style: { bg: "blackBright" }
					}),
					h(TText, {
						x: 0,
						y: 0,
						w,
						value: `Tool: ${req.tool}`,
						style: {
							fg: "whiteBright",
							bold: true,
							bg: "blackBright"
						}
					}),
					h(TText, {
						x: 0,
						y: 1,
						w,
						value: `Permission: ${req.permission}`,
						style: {
							fg: "cyanBright",
							bg: "blackBright"
						}
					})
				];
				let y = 2;
				if (y < contentH) y += 1;
				if (y < contentH) {
					const maxReasonH = Math.max(1, contentH - y);
					const reasonH = clamp$7(3, 1, maxReasonH);
					nodes.push(h(TText, {
						x: 0,
						y,
						w,
						h: reasonH,
						wrap: true,
						value: req.reason,
						style: {
							fg: "white",
							dim: true,
							bg: "blackBright"
						}
					}));
					y += reasonH;
				}
				if (bash && y < contentH) {
					if (bash.description && y < contentH) {
						const maxDescH = Math.max(1, contentH - y);
						const descH = clamp$7(2, 1, maxDescH);
						nodes.push(h(TText, {
							x: 0,
							y,
							w,
							h: descH,
							wrap: true,
							value: `Description: ${normalizeText(bash.description)}`,
							style: {
								fg: "white",
								dim: true,
								bg: "blackBright"
							}
						}));
						y += descH;
					}
					if (bash.command && y < contentH) {
						nodes.push(h(TText, {
							x: 0,
							y,
							w,
							value: "Command:",
							style: {
								fg: "yellowBright",
								bg: "blackBright",
								bold: true
							}
						}));
						y += 1;
						if (y < contentH) {
							const maxCmdH = Math.max(1, contentH - y);
							const cmdH = clamp$7(3, 1, maxCmdH);
							nodes.push(h(TText, {
								x: 0,
								y,
								w,
								h: cmdH,
								wrap: true,
								value: normalizeText(bash.command),
								style: {
									fg: "whiteBright",
									bg: "blackBright"
								}
							}));
							y += cmdH;
						}
					}
				} else if (props.call && y < contentH) {
					const argsText = props.call.argumentsText?.trim() ? props.call.argumentsText.trim() : safeJson(props.call.arguments);
					nodes.push(h(TText, {
						x: 0,
						y,
						w,
						value: "Arguments:",
						style: {
							fg: "yellowBright",
							bg: "blackBright",
							bold: true
						}
					}));
					y += 1;
					if (y < contentH) {
						const maxArgsH = Math.max(1, contentH - y);
						const argsH = clamp$7(3, 1, maxArgsH);
						nodes.push(h(TText, {
							x: 0,
							y,
							w,
							h: argsH,
							wrap: true,
							value: normalizeText(argsText),
							style: {
								fg: "whiteBright",
								bg: "blackBright"
							}
						}));
						y += argsH;
					}
				}
				if (y < contentH) nodes.push(h(TText, {
					x: 0,
					y,
					w,
					value: `ID: ${req.toolCallId}`,
					style: {
						fg: "white",
						dim: true,
						bg: "blackBright"
					}
				}));
				return nodes;
			});
		};
	}
});

//#endregion
//#region src/ui/components/AskUserDialog.ts
function clamp$6(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
const GoatChainAskUserDialog = defineComponent({
	name: "GoatChainAskUserDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		toolCallId: {
			type: String,
			required: true
		},
		questions: {
			type: Array,
			required: true
		},
		w: {
			type: Number,
			required: true
		},
		h: {
			type: Number,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"submit": (_answers) => true,
		"cancel": () => true
	},
	setup(props, { emit }) {
		const answers = ref({});
		watch(() => [props.toolCallId, props.questions.length], () => {
			const next = {};
			for (let i = 0; i < props.questions.length; i++) next[String(i)] = "";
			answers.value = next;
		}, { immediate: true });
		return () => {
			if (!props.modelValue) return null;
			const w = Math.max(0, props.w - 4);
			const contentH = Math.max(0, props.h - 5);
			const maxQuestions = clamp$6(Math.floor(contentH / 3), 1, Math.max(1, props.questions.length));
			const shown = props.questions.slice(0, maxQuestions);
			const overflow = props.questions.length - shown.length;
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"w": props.w,
				"h": props.h,
				"title": "Provide Answers",
				"placement": "center",
				"backdrop": false,
				"padding": 1,
				"style": {
					fg: "cyanBright",
					bg: "black"
				},
				"buttons": [{
					label: "Submit",
					value: "submit",
					kind: "primary",
					default: true
				}, {
					label: "Cancel",
					value: "cancel"
				}],
				"onConfirm": (btn) => {
					if (btn?.value === "submit") emit("submit", { ...answers.value });
					else emit("cancel");
					emit("update:modelValue", false);
				},
				"onClose": () => {
					emit("cancel");
					emit("update:modelValue", false);
				}
			}, () => {
				let y = 0;
				const nodes = [];
				nodes.push(h(TText, {
					x: 0,
					y: y++,
					w,
					value: `tool_call_id: ${props.toolCallId}`,
					style: {
						fg: "white",
						dim: true
					}
				}));
				y++;
				for (let i = 0; i < shown.length; i++) {
					const q = shown[i];
					const key = String(i);
					nodes.push(h(TText, {
						x: 0,
						y: y++,
						w,
						value: `[Q${i + 1}] ${q.header || "Question"}`,
						style: {
							fg: "whiteBright",
							bold: true
						}
					}));
					nodes.push(h(TText, {
						x: 0,
						y: y++,
						w,
						wrap: true,
						value: q.question || "",
						style: {
							fg: "white",
							dim: true
						}
					}));
					nodes.push(h(TInput, {
						"x": 0,
						"y": y++,
						"w": w,
						"modelValue": String(answers.value[key] ?? ""),
						"onUpdate:modelValue": (v) => {
							answers.value = {
								...answers.value,
								[key]: v
							};
						},
						"placeholder": q.multiSelect ? "Comma-separated (multi)" : "Type your answer…",
						"style": {
							fg: "whiteBright",
							bg: "blackBright"
						},
						"autoFocus": i === 0
					}));
				}
				if (overflow > 0) nodes.push(h(TText, {
					x: 0,
					y: Math.min(y, contentH - 1),
					w,
					value: `…and ${overflow} more question(s)`,
					style: {
						fg: "white",
						dim: true
					}
				}));
				return nodes;
			});
		};
	}
});

//#endregion
//#region src/ui/components/CommandPalette.ts
function clamp$5(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function scoreMatch(candidate, query) {
	const c = candidate.toLowerCase();
	const q = query.toLowerCase().trim();
	if (!q) return 0;
	if (c === q) return 1e4;
	if (c.startsWith(q)) return 5e3 - c.length;
	const idx = c.indexOf(q);
	if (idx >= 0) return 2e3 - idx;
	let qi = 0;
	let score = 0;
	let streak = 0;
	for (let i = 0; i < c.length && qi < q.length; i++) if (c[i] === q[qi]) {
		qi++;
		streak++;
		score += 10 + streak * 5;
	} else streak = 0;
	if (qi < q.length) return null;
	return score;
}
const GoatChainCommandPalette = defineComponent({
	name: "GoatChainCommandPalette",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		title: {
			type: String,
			default: "Commands"
		},
		options: {
			type: Array,
			required: true
		},
		selectedIndex: {
			type: Number,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"update:selectedIndex": (_v) => true,
		"select": (_label) => true,
		"close": () => true
	},
	setup(props, { emit }) {
		const layout = useLayout();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const query = ref("");
		watch(() => props.modelValue, (open) => {
			if (open) query.value = "";
		});
		function close() {
			emit("update:modelValue", false);
			emit("close");
		}
		const filtered = computed(() => {
			const q = query.value.trim();
			const out = [];
			for (let i = 0; i < props.options.length; i++) {
				const opt = props.options[i];
				const hay = `${opt.label} ${opt.detail ?? ""}`.trim();
				const score = scoreMatch(hay, q);
				if (score == null) continue;
				out.push({
					idx: i,
					opt,
					score
				});
			}
			out.sort((a, b) => b.score - a.score || a.idx - b.idx);
			return out;
		});
		const selectedFilteredIndex = computed(() => {
			const idx = filtered.value.findIndex((x) => x.idx === props.selectedIndex);
			return idx >= 0 ? idx : 0;
		});
		function moveSelection(delta) {
			const list = filtered.value;
			if (!list.length) return;
			const cur = selectedFilteredIndex.value;
			const next = clamp$5(cur + delta, 0, list.length - 1);
			const idx = list[next]?.idx;
			if (idx != null) emit("update:selectedIndex", idx);
		}
		function selectCurrent() {
			const list = filtered.value;
			const cur = list[selectedFilteredIndex.value];
			emit("select", cur?.opt?.label ?? null);
		}
		return () => {
			if (!props.modelValue) return null;
			const maxW = Math.max(0, Math.floor(cols.value));
			const maxH = Math.max(0, Math.floor(rows.value));
			const w = maxW <= 0 ? 0 : clamp$5(Math.floor(maxW * .78), Math.min(44, maxW), maxW);
			const hgt = maxH <= 0 ? 0 : clamp$5(12, 10, Math.max(10, Math.min(18, maxH)));
			const x = Math.max(0, Math.floor((cols.value - w) / 2));
			const y = clamp$5(Math.floor(rows.value * .25), 1, Math.max(1, rows.value - hgt - 1));
			const innerW = Math.max(0, w - 2);
			const innerH = Math.max(0, hgt - 2);
			const contentW = Math.max(0, innerW - 2);
			const contentH = Math.max(0, innerH - 2);
			const list = filtered.value;
			const dividerY = 1;
			const listY = 2;
			const hintY = Math.max(listY, contentH - 1);
			const detailY = Math.max(listY, hintY - 2);
			const listH = clamp$5(list.length, 1, Math.max(1, detailY - listY));
			const active = list[selectedFilteredIndex.value]?.opt;
			const detailText = active?.detail ? String(active.detail) : "";
			const detailLines = detailText ? wrapByCells(detailText, Math.max(1, contentW)).slice(0, 2) : [];
			return h(TView, {
				x: 0,
				y: 0,
				w: cols.value,
				h: rows.value,
				zIndex: 100,
				focusable: true,
				onClick: close,
				onKeydownCapture: (e) => {
					if (e?.key === "Escape") {
						e?.preventDefault?.();
						e?.stopPropagation?.();
						close();
					}
				}
			}, () => h(TBox, {
				x,
				y,
				w,
				h: hgt,
				border: true,
				title: props.title,
				padding: 1,
				style: {
					fg: "blueBright",
					bg: "black"
				},
				zIndex: 110
			}, () => [
				h(TText, {
					x: 0,
					y: 0,
					w: contentW,
					h: contentH,
					value: "",
					style: { bg: "black" }
				}),
				h(TInput, {
					"x": 0,
					"y": 0,
					"w": contentW,
					"modelValue": query.value,
					"onUpdate:modelValue": (v) => query.value = v,
					"placeholder": "Search…",
					"placeholderWhenFocused": true,
					"autoFocus": true,
					"style": {
						fg: "whiteBright",
						bg: "blackBright"
					},
					"onKeydown": (e) => {
						if (e?.key === "ArrowDown") {
							e.preventDefault?.();
							moveSelection(1);
						} else if (e?.key === "ArrowUp") {
							e.preventDefault?.();
							moveSelection(-1);
						} else if (e?.key === "Enter") {
							e.preventDefault?.();
							selectCurrent();
						}
					}
				}),
				contentW > 0 ? h(TText, {
					x: 0,
					y: dividerY,
					w: contentW,
					value: "─".repeat(contentW),
					style: {
						fg: "white",
						dim: true,
						bg: "black"
					}
				}) : null,
				h(TSelect, {
					"x": 0,
					"y": listY,
					"w": contentW,
					"h": listH,
					"options": list.map((x$1) => ({ label: x$1.opt.label })),
					"modelValue": selectedFilteredIndex.value,
					"onUpdate:modelValue": (v) => {
						const picked = list[clamp$5(v, 0, Math.max(0, list.length - 1))];
						if (picked) emit("update:selectedIndex", picked.idx);
					},
					"style": {
						fg: "whiteBright",
						bg: "blackBright"
					},
					"highlightStyle": {
						fg: "black",
						bg: "blueBright",
						bold: true
					},
					"autoFocus": false,
					"closeOnBlur": false,
					"onChange": () => selectCurrent(),
					"onClose": close
				}),
				detailLines.length ? detailLines.map((line, i) => h(TText, {
					key: `detail-${i}`,
					x: 0,
					y: detailY + i,
					w: contentW,
					value: line,
					style: {
						fg: "white",
						dim: true,
						bg: "black"
					}
				})) : h(TText, {
					x: 0,
					y: detailY,
					w: contentW,
					h: 2,
					value: "",
					style: { bg: "black" }
				}),
				h(TText, {
					x: 0,
					y: hintY,
					w: contentW,
					value: "Type to filter • Enter: open • Esc: close",
					style: {
						fg: "white",
						dim: true,
						bg: "black"
					}
				}),
				contentW > 0 ? h(TText, {
					x: Math.max(0, contentW - 1),
					y: hintY,
					w: 1,
					value: " ",
					style: { bg: "black" }
				}) : null
			]));
		};
	}
});

//#endregion
//#region src/ui/components/ConfigDialog.ts
const GoatChainConfigDialog = defineComponent({
	name: "GoatChainConfigDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		w: {
			type: Number,
			default: 74
		},
		h: {
			type: Number,
			default: 24
		},
		modelId: {
			type: String,
			required: true
		},
		temperature: {
			type: String,
			required: true
		},
		baseUrl: {
			type: String,
			required: true
		},
		apiKeyDraft: {
			type: String,
			required: true
		},
		apiKeyMasked: {
			type: String,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"update:modelId": (_v) => true,
		"update:temperature": (_v) => true,
		"update:baseUrl": (_v) => true,
		"update:apiKeyDraft": (_v) => true,
		"apply": () => true,
		"cancel": () => true
	},
	setup(props, { emit }) {
		return () => {
			if (!props.modelValue) return null;
			const dialogW = Math.max(44, Math.floor(props.w));
			const dialogH = Math.max(18, Math.floor(props.h));
			const innerW = Math.max(0, dialogW - 4);
			const innerH = Math.max(0, dialogH - 4);
			const contentH = Math.max(0, innerH - 1);
			const hintStyle = {
				fg: "white",
				dim: true
			};
			const boxStyle = {
				fg: "white",
				bg: "black",
				dim: true
			};
			const fieldStyle = {
				fg: "whiteBright",
				bg: "blackBright"
			};
			const compact = contentH <= 14;
			const gapY = 0;
			const fieldBoxH = compact ? 3 : 4;
			const inputH = Math.max(1, fieldBoxH - 2);
			const showHint = !compact;
			const topHintNode = showHint ? h(TText, {
				x: 0,
				y: 0,
				w: innerW,
				value: "Tab/Shift+Tab switch field  •  Enter Apply  •  Esc Cancel",
				style: hintStyle
			}) : null;
			let y = showHint ? 1 + gapY : 0;
			const modelY = y;
			y += fieldBoxH + gapY;
			const samplingY = y;
			y += fieldBoxH + gapY;
			const baseUrlY = y;
			y += fieldBoxH + gapY;
			const currentLineH = 1;
			const wantCurrentLine = Boolean(props.apiKeyMasked) && !compact;
			const canShowCurrentLine = wantCurrentLine && y + currentLineH + fieldBoxH <= contentH;
			const apiKeyHintY = y;
			if (canShowCurrentLine) y += currentLineH;
			const apiKeyY = y;
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"onKeydownCapture": (e) => {
					if (e?.key !== "Escape") return;
					e.preventDefault?.();
					e.stopPropagation?.();
					emit("cancel");
					emit("update:modelValue", false);
				},
				"w": dialogW,
				"h": dialogH,
				"title": "Settings",
				"placement": "center",
				"padding": 1,
				"style": {
					fg: "blueBright",
					bg: "black"
				},
				"buttons": [{
					label: "Apply",
					value: "apply",
					kind: "primary",
					default: true
				}, {
					label: "Cancel",
					value: "cancel"
				}],
				"onConfirm": (btn) => {
					if (btn?.value === "apply") emit("apply");
					else emit("cancel");
				},
				"onClose": () => emit("cancel")
			}, () => [
				topHintNode,
				h(TBox, {
					x: 0,
					y: modelY,
					w: innerW,
					h: fieldBoxH,
					border: true,
					title: "Model",
					padding: 0,
					style: boxStyle,
					clear: true
				}, () => h(TInput, {
					"x": 0,
					"y": 0,
					"w": Math.max(0, innerW - 2),
					"h": inputH,
					"modelValue": props.modelId,
					"onUpdate:modelValue": (v) => emit("update:modelId", v),
					"placeholder": "deepseek-v3.1",
					"autoFocus": true,
					"style": fieldStyle,
					"zIndex": 1002
				})),
				h(TBox, {
					x: 0,
					y: samplingY,
					w: innerW,
					h: fieldBoxH,
					border: true,
					title: "Temperature",
					padding: 0,
					style: boxStyle,
					clear: true
				}, () => h(TInput, {
					"x": 0,
					"y": 0,
					"w": Math.max(0, innerW - 2),
					"h": inputH,
					"modelValue": props.temperature,
					"onUpdate:modelValue": (v) => emit("update:temperature", v),
					"placeholder": "0.2",
					"style": fieldStyle,
					"zIndex": 1002
				})),
				h(TBox, {
					x: 0,
					y: baseUrlY,
					w: innerW,
					h: fieldBoxH,
					border: true,
					title: "Base URL (OpenAI-compatible)",
					padding: 0,
					style: boxStyle,
					clear: true
				}, () => h(TInput, {
					"x": 0,
					"y": 0,
					"w": Math.max(0, innerW - 2),
					"h": inputH,
					"modelValue": props.baseUrl,
					"onUpdate:modelValue": (v) => emit("update:baseUrl", v),
					"placeholder": "https://api.openai.com/v1",
					"style": fieldStyle,
					"zIndex": 1002
				})),
				canShowCurrentLine ? h(TText, {
					x: 0,
					y: apiKeyHintY,
					w: innerW,
					value: props.apiKeyMasked ? `Current: ${props.apiKeyMasked}` : "Current: (not set)",
					style: hintStyle
				}) : null,
				h(TBox, {
					x: 0,
					y: apiKeyY,
					w: innerW,
					h: fieldBoxH,
					border: true,
					title: "API Key",
					padding: 0,
					style: boxStyle,
					clear: true
				}, () => h(TInput, {
					"x": 0,
					"y": 0,
					"w": Math.max(0, innerW - 2),
					"h": inputH,
					"modelValue": props.apiKeyDraft,
					"onUpdate:modelValue": (v) => emit("update:apiKeyDraft", v),
					"placeholder": "Paste a new key to update (leave empty to keep)",
					"secret": true,
					"style": fieldStyle,
					"zIndex": 1002
				}))
			]);
		};
	}
});

//#endregion
//#region src/ui/components/MessageActionsDialog.ts
const GoatChainMessageActionsDialog = defineComponent({
	name: "GoatChainMessageActionsDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		selectedIndex: {
			type: Number,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"update:selectedIndex": (_v) => true,
		"action": (_v) => true
	},
	setup(props, { emit }) {
		const labels = [
			"Revert undo messages and file changes",
			"Copy message text to clipboard",
			"Fork create a new session"
		];
		function close() {
			emit("update:modelValue", false);
			emit("update:selectedIndex", 0);
		}
		function onKeydown(e) {
			if (e.defaultPrevented) return;
			if (e.key === "ArrowUp") {
				e.preventDefault?.();
				e.stopPropagation?.();
				emit("update:selectedIndex", Math.max(0, props.selectedIndex - 1));
			} else if (e.key === "ArrowDown") {
				e.preventDefault?.();
				e.stopPropagation?.();
				emit("update:selectedIndex", Math.min(2, props.selectedIndex + 1));
			} else if (e.key === "Enter") {
				e.preventDefault?.();
				e.stopPropagation?.();
				const idx = props.selectedIndex;
				emit("action", idx === 0 ? "revert" : idx === 1 ? "copy" : "fork");
			} else if (e.key === "Escape") {
				e.preventDefault?.();
				e.stopPropagation?.();
				close();
			}
		}
		return () => {
			if (!props.modelValue) return null;
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => {
					emit("update:modelValue", v);
					if (!v) emit("update:selectedIndex", 0);
				},
				"onKeydownCapture": (e) => {
					if (typeof e?.key === "string" && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
						e.preventDefault?.();
						e.stopPropagation?.();
					}
				},
				"w": 48,
				"h": 7,
				"title": "Message Actions",
				"placement": "center",
				"padding": 1,
				"style": {
					fg: "blueBright",
					bg: "black"
				},
				"onClose": close
			}, () => h(TView, {
				x: 0,
				y: 0,
				w: 44,
				h: 3,
				focusable: true,
				autoFocus: true,
				onKeydownCapture: onKeydown
			}, () => labels.map((label, i) => {
				const isSelected = props.selectedIndex === i;
				const style = isSelected ? {
					fg: "black",
					bg: "whiteBright",
					bold: true
				} : {
					fg: "white",
					dim: true,
					bg: "blackBright"
				};
				const prefix = isSelected ? "▸ " : "  ";
				return h(TText, {
					key: `action-${i}`,
					x: 0,
					y: i,
					w: 44,
					value: `${prefix}${label}`,
					style
				});
			})));
		};
	}
});

//#endregion
//#region src/ui/components/PathPickerDialog.ts
const GoatChainPathPickerDialog = defineComponent({
	name: "GoatChainPathPickerDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		w: {
			type: Number,
			required: true
		},
		h: {
			type: Number,
			required: true
		},
		title: {
			type: String,
			required: true
		},
		workspace: {
			type: String,
			required: true
		},
		mode: {
			type: String,
			required: true
		},
		query: {
			type: String,
			required: true
		},
		placeholder: {
			type: String,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"update:query": (_v) => true,
		"invalid": (_reason) => true,
		"select": (_absPath) => true,
		"close": () => true
	},
	setup(props, { emit }) {
		return () => {
			if (!props.modelValue) return null;
			const innerW = Math.max(0, props.w - 2);
			const innerH = Math.max(0, props.h - 2);
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"w": props.w,
				"h": props.h,
				"title": props.title,
				"placement": "center",
				"padding": 1,
				"style": {
					fg: "blueBright",
					bg: "black"
				},
				"onClose": () => {
					emit("update:modelValue", false);
					emit("close");
				}
			}, () => [h(TText, {
				x: 0,
				y: 0,
				w: innerW,
				value: "↑/↓ select • Tab complete • Enter confirm • Esc close",
				style: {
					fg: "white",
					dim: true
				}
			}), h(TPathPicker, {
				"x": 0,
				"y": 2,
				"w": innerW,
				"h": Math.max(0, innerH - 3),
				"workspace": props.workspace,
				"mode": props.mode,
				"modelValue": props.query,
				"onUpdate:modelValue": (v) => emit("update:query", v),
				"placeholder": props.placeholder,
				"autoFocus": true,
				"style": {
					fg: "whiteBright",
					bg: "blackBright"
				},
				"onKeydown": (e) => {
					if (e?.key !== "Escape") return;
					e?.preventDefault?.();
					emit("update:modelValue", false);
					emit("close");
				},
				"onInvalid": (info) => emit("invalid", String(info?.reason ?? "invalid")),
				"onSelect": (absPath) => emit("select", absPath)
			})]);
		};
	}
});

//#endregion
//#region src/ui/components/RedoConfirmDialog.ts
const GoatChainRedoConfirmDialog = defineComponent({
	name: "GoatChainRedoConfirmDialog",
	props: { modelValue: {
		type: Boolean,
		required: true
	} },
	emits: {
		"update:modelValue": (_v) => true,
		"confirm": () => true,
		"cancel": () => true
	},
	setup(props, { emit }) {
		function cancel() {
			emit("update:modelValue", false);
			emit("cancel");
		}
		return () => {
			if (!props.modelValue) return null;
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"onKeydownCapture": (e) => {
					if (typeof e?.key === "string" && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
						e.preventDefault?.();
						e.stopPropagation?.();
					}
				},
				"w": 52,
				"h": 8,
				"title": "Confirm Redo",
				"placement": "center",
				"padding": 1,
				"style": {
					fg: "whiteBright",
					bg: "blackBright"
				},
				"buttons": [{
					label: "Cancel",
					value: "cancel"
				}, {
					label: "Confirm",
					value: "confirm",
					kind: "primary",
					default: true
				}],
				"onConfirm": (btn) => {
					if (btn?.value === "confirm") {
						emit("confirm");
						emit("update:modelValue", false);
					} else cancel();
				},
				"onClose": cancel
			}, () => [h(TText, {
				x: 0,
				y: 1,
				w: 48,
				value: "Are you sure you want to restore the reverted messages?",
				style: { fg: "white" }
			})]);
		};
	}
});

//#endregion
//#region src/ui/components/SessionsDialog.ts
function clamp$4(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function formatWhen(ts) {
	if (!Number.isFinite(ts)) return "";
	try {
		const d = new Date(ts);
		const pad = (n) => String(n).padStart(2, "0");
		const yyyy = d.getFullYear();
		const mm = pad(d.getMonth() + 1);
		const dd = pad(d.getDate());
		const hh = pad(d.getHours());
		const min = pad(d.getMinutes());
		const now = new Date();
		const includeYear = yyyy !== now.getFullYear();
		return includeYear ? `${yyyy}-${mm}-${dd} ${hh}:${min}` : `${mm}-${dd} ${hh}:${min}`;
	} catch {
		return "";
	}
}
function ellipsisByCells(text, maxCells) {
	maxCells = Math.max(0, Math.floor(maxCells));
	const s = String(text ?? "").replace(/\s+/g, " ").trim();
	if (!s || maxCells <= 0) return "";
	if (textCellWidth(s) <= maxCells) return s;
	if (maxCells <= 1) return sliceByCells(s, maxCells);
	return `${sliceByCells(s, maxCells - 1)}…`;
}
function shortSessionId(id$1) {
	const s = String(id$1 ?? "").trim();
	if (!s) return "";
	const seg = s.split("-").filter(Boolean).at(-1) ?? s;
	return seg.length > 10 ? seg.slice(-10) : seg;
}
const GoatChainSessionsDialog = defineComponent({
	name: "GoatChainSessionsDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		loading: {
			type: Boolean,
			default: false
		},
		deleteArmed: {
			type: Boolean,
			default: false
		},
		sessions: {
			type: Array,
			required: true
		},
		selectedIndex: {
			type: Number,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"update:selectedIndex": (_v) => true,
		"open": () => true,
		"new": () => true,
		"delete": () => true,
		"refresh": () => true
	},
	setup(props, { emit }) {
		return () => {
			if (!props.modelValue) return null;
			const w = 78;
			const hgt = 20;
			const innerW = Math.max(0, w - 4);
			const innerH = Math.max(0, hgt - 4);
			const contentH = Math.max(0, innerH - 1);
			const listY = 2;
			const bottomGap = 1;
			const sessions = Array.isArray(props.sessions) ? props.sessions : [];
			const totalSessions = sessions.length;
			const listH = clamp$4(totalSessions, 1, Math.max(1, contentH - listY - bottomGap));
			const selectedIndex = clamp$4(props.selectedIndex, 0, Math.max(0, totalSessions - 1));
			const maxWhenW = Math.max(0, ...sessions.map((s) => textCellWidth(formatWhen(s.updatedAt))));
			const minDetailGap = 2;
			const labelMaxW = Math.max(0, innerW - minDetailGap - maxWhenW);
			const colGap = 2;
			const idW = Math.min(10, Math.max(6, Math.floor(labelMaxW * .18)));
			const minLastW = 10;
			const maxSummaryW = Math.max(0, labelMaxW - idW - colGap * 2 - minLastW);
			const summaryW = clamp$4(Math.floor(labelMaxW * .34), 14, Math.max(14, maxSummaryW));
			const lastW = Math.max(0, labelMaxW - idW - colGap * 2 - summaryW);
			const windowSize = Math.max(1, listH);
			const maxOffset = Math.max(0, totalSessions - windowSize);
			const offset = clamp$4(selectedIndex - Math.floor(windowSize / 2), 0, maxOffset);
			const visible = sessions.slice(offset, offset + windowSize);
			const options = visible.map((s) => {
				const id$1 = padEndByCells(ellipsisByCells(shortSessionId(s.id), idW), idW);
				const summaryText = s.summary || s.title || "New session";
				const summary = padEndByCells(ellipsisByCells(summaryText, summaryW), summaryW);
				const last = lastW > 0 ? ellipsisByCells(s.lastMessage || "", lastW) : "";
				const label = lastW > 0 ? `${id$1}${" ".repeat(colGap)}${summary}${" ".repeat(colGap)}${last}` : `${id$1}${" ".repeat(colGap)}${summary}`;
				return {
					label,
					detail: formatWhen(s.updatedAt)
				};
			});
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"onKeydownCapture": (e) => {
					if (e?.key === "Escape") {
						e.preventDefault?.();
						e.stopPropagation?.();
						emit("update:modelValue", false);
						return;
					}
					if (typeof e?.key === "string" && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
						e.preventDefault?.();
						e.stopPropagation?.();
					}
				},
				"w": w,
				"h": hgt,
				"title": `Sessions (${totalSessions})`,
				"placement": "center",
				"padding": 1,
				"style": {
					fg: "blueBright",
					bg: "black"
				},
				"closeOnConfirm": false,
				"buttons": [
					{
						label: "Open",
						value: "open",
						kind: "primary",
						default: true
					},
					{
						label: "New",
						value: "new"
					},
					{
						label: "Delete",
						value: "delete",
						kind: "danger"
					},
					{
						label: "Refresh",
						value: "refresh"
					},
					{
						label: "Close",
						value: "close"
					}
				],
				"onConfirm": (btn) => {
					const v = String(btn?.value ?? "");
					if (v === "open") emit("open");
					else if (v === "new") emit("new");
					else if (v === "delete") emit("delete");
					else if (v === "refresh") emit("refresh");
					else emit("update:modelValue", false);
				},
				"onClose": () => emit("update:modelValue", false)
			}, () => [h(TText, {
				x: 0,
				y: 0,
				w: innerW,
				value: props.loading ? "Loading…" : props.deleteArmed ? "Confirm delete: press Delete again" : totalSessions ? `${totalSessions} sessions • Arrow keys to navigate • Enter selects${totalSessions > windowSize ? ` • Showing ${offset + 1}-${Math.min(totalSessions, offset + windowSize)}` : ""}` : "No saved sessions yet",
				style: {
					fg: "white",
					dim: true,
					bg: "black"
				}
			}), options.length ? h(TSelect, {
				"x": 0,
				"y": listY,
				"w": innerW,
				"h": listH,
				"options": options,
				"modelValue": clamp$4(selectedIndex - offset, 0, Math.max(0, options.length - 1)),
				"onUpdate:modelValue": (v) => emit("update:selectedIndex", clamp$4(offset + v, 0, Math.max(0, totalSessions - 1))),
				"onChange": (v) => {
					if (!v) return;
					emit("open");
				},
				"autoFocus": true,
				"style": {
					fg: "whiteBright",
					bg: "blackBright"
				},
				"highlightStyle": {
					fg: "whiteBright",
					bg: "blueBright",
					bold: true
				},
				"zIndex": 1002
			}) : null]);
		};
	}
});

//#endregion
//#region src/ui/components/ThemeDialog.ts
const presetOptions = [
	"goatchain",
	"mono",
	"contrast"
];
const colorOptions = ["inherit", ...AnsiColorNames];
function clamp$3(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function colorIndex(v) {
	if (!v) return 0;
	const idx = AnsiColorNames.indexOf(v);
	return idx >= 0 ? idx + 1 : 0;
}
function indexToColor(idx) {
	if (idx <= 0) return void 0;
	return AnsiColorNames[idx - 1];
}
const GoatChainThemeDialog = defineComponent({
	name: "GoatChainThemeDialog",
	props: {
		modelValue: {
			type: Boolean,
			required: true
		},
		preset: {
			type: String,
			required: true
		},
		overrides: {
			type: Object,
			required: true
		}
	},
	emits: {
		"update:modelValue": (_v) => true,
		"update:preset": (_v) => true,
		"setOverride": (_type, _colors) => true,
		"resetOverrides": () => true
	},
	setup(props, { emit }) {
		const typeIndex = ref(0);
		const fgIndex = ref(0);
		const bgIndex = ref(0);
		const selectedType = computed(() => {
			return GoatChainMessageTypes[clamp$3(typeIndex.value, 0, GoatChainMessageTypes.length - 1)];
		});
		watch([
			() => props.modelValue,
			selectedType,
			() => props.overrides
		], () => {
			if (!props.modelValue) return;
			const cur = props.overrides[selectedType.value];
			fgIndex.value = colorIndex(cur?.fg);
			bgIndex.value = colorIndex(cur?.bg);
		}, { immediate: true });
		function setFg(idx) {
			fgIndex.value = idx;
			const fg = indexToColor(idx);
			const bg = indexToColor(bgIndex.value);
			emit("setOverride", selectedType.value, !fg && !bg ? null : {
				fg,
				bg
			});
		}
		function setBg(idx) {
			bgIndex.value = idx;
			const fg = indexToColor(fgIndex.value);
			const bg = indexToColor(idx);
			emit("setOverride", selectedType.value, !fg && !bg ? null : {
				fg,
				bg
			});
		}
		const preview = computed(() => {
			const theme = {
				preset: props.preset,
				overrides: props.overrides
			};
			return resolveMessageTypeColors(theme, selectedType.value);
		});
		const presetIndex = computed(() => {
			const idx = presetOptions.indexOf(props.preset);
			return idx >= 0 ? idx : 0;
		});
		return () => {
			if (!props.modelValue) return null;
			const highlightStyle = {
				fg: "black",
				bg: "blueBright",
				bold: true
			};
			const selectStyle = {
				fg: "whiteBright",
				bg: "blackBright"
			};
			const labelStyle = {
				fg: "whiteBright",
				bold: true
			};
			const hintStyle = {
				fg: "white",
				dim: true
			};
			return h(TDialog, {
				"modelValue": props.modelValue,
				"onUpdate:modelValue": (v) => emit("update:modelValue", v),
				"onKeydownCapture": (e) => {
					if (e?.key === "Escape") {
						e.preventDefault?.();
						e.stopPropagation?.();
						emit("update:modelValue", false);
						return;
					}
					if (typeof e?.key === "string" && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
						e.preventDefault?.();
						e.stopPropagation?.();
					}
				},
				"w": 64,
				"h": 19,
				"title": "Theme",
				"placement": "center",
				"padding": 1,
				"style": {
					fg: "blueBright",
					bg: "black"
				},
				"buttons": [{
					label: "Reset Overrides",
					value: "reset"
				}, {
					label: "Close",
					value: "close",
					kind: "primary",
					default: true
				}],
				"onConfirm": (btn) => {
					if (btn?.value === "reset") emit("resetOverrides");
					emit("update:modelValue", false);
				},
				"onClose": () => emit("update:modelValue", false)
			}, () => [
				h(TText, {
					x: 0,
					y: 0,
					w: 60,
					value: "Preset",
					style: labelStyle
				}),
				h(TSelect, {
					"x": 0,
					"y": 1,
					"w": 60,
					"h": 3,
					"options": [...presetOptions],
					"modelValue": presetIndex.value,
					"onUpdate:modelValue": (v) => {
						const p = presetOptions[clamp$3(v, 0, presetOptions.length - 1)] ?? "goatchain";
						emit("update:preset", p);
					},
					"autoFocus": true,
					"style": selectStyle,
					"highlightStyle": highlightStyle
				}),
				h(TText, {
					x: 0,
					y: 5,
					w: 24,
					value: "Message Type",
					style: labelStyle
				}),
				h(TSelect, {
					"x": 0,
					"y": 6,
					"w": 24,
					"h": 4,
					"options": [...GoatChainMessageTypes],
					"modelValue": typeIndex.value,
					"onUpdate:modelValue": (v) => typeIndex.value = v,
					"style": selectStyle,
					"highlightStyle": highlightStyle
				}),
				h(TText, {
					x: 28,
					y: 5,
					w: 10,
					value: "fg",
					style: labelStyle
				}),
				h(TText, {
					x: 46,
					y: 5,
					w: 10,
					value: "bg",
					style: labelStyle
				}),
				h(TSelect, {
					"x": 28,
					"y": 6,
					"w": 16,
					"h": 4,
					"options": [...colorOptions],
					"modelValue": fgIndex.value,
					"onUpdate:modelValue": (v) => setFg(v),
					"style": selectStyle,
					"highlightStyle": highlightStyle
				}),
				h(TSelect, {
					"x": 46,
					"y": 6,
					"w": 16,
					"h": 4,
					"options": [...colorOptions],
					"modelValue": bgIndex.value,
					"onUpdate:modelValue": (v) => setBg(v),
					"style": selectStyle,
					"highlightStyle": highlightStyle
				}),
				h(TText, {
					x: 0,
					y: 11,
					w: 60,
					value: "Preview",
					style: labelStyle
				}),
				h(TText, {
					x: 0,
					y: 12,
					w: 60,
					value: ` ${selectedType.value} `,
					style: {
						fg: preview.value.fg ?? "whiteBright",
						bg: preview.value.bg ?? "black"
					}
				}),
				h(TText, {
					x: 0,
					y: 14,
					w: 60,
					value: "Tip: set fg/bg to \"inherit\" to use preset.",
					style: hintStyle
				})
			]);
		};
	}
});

//#endregion
//#region src/pages/ChatPage/components/ChatOverlays.ts
const GoatChainChatOverlays = defineComponent({
	name: "GoatChainChatOverlays",
	setup() {
		const injected = inject(ChatPageContextKey);
		if (!injected) throw new Error("GoatChainChatOverlays missing ChatPageContext");
		const ctx = injected;
		const findToolCall = (toolCallId) => {
			const id$1 = String(toolCallId ?? "").trim();
			if (!id$1) return null;
			for (const m of ctx.store.state.messages) {
				if (m.role !== "assistant") continue;
				for (const p of m.parts) if (p.type === "tool_call" && p.call.id === id$1) return p.call;
			}
			return null;
		};
		return () => [
			h(GoatChainCommandPalette, {
				"modelValue": ctx.showCommands.value,
				"onUpdate:modelValue": (v) => ctx.showCommands.value = v,
				"title": "Commands",
				"options": ctx.commandOptions.value,
				"selectedIndex": ctx.commandIndex.value,
				"onUpdate:selectedIndex": (v) => ctx.commandIndex.value = v,
				"onSelect": (v) => ctx.onCommandSelect(v),
				"onClose": ctx.closeCommandPalette
			}),
			h(GoatChainPathPickerDialog, {
				"modelValue": ctx.showPathPicker.value,
				"onUpdate:modelValue": (v) => ctx.showPathPicker.value = v,
				"w": ctx.pickerW.value,
				"h": ctx.pickerH.value,
				"title": ctx.pathPickerTitle.value,
				"workspace": ctx.pickerWorkspace.value,
				"mode": ctx.pathPickerMode.value,
				"query": ctx.pathPickerQuery.value,
				"onUpdate:query": (v) => ctx.pathPickerQuery.value = v,
				"placeholder": ctx.pathPickerPlaceholder.value,
				"onInvalid": (reason) => ctx.pathPickerError.value = reason,
				"onSelect": (absPath) => {
					ctx.pathPickerError.value = null;
					ctx.showPathPicker.value = false;
					ctx.pathPickerQuery.value = "";
					if (ctx.pathPickerMode.value === "directory") ctx.setContextCwd(absPath);
					else ctx.input.value = absPath;
				},
				"onClose": () => {
					ctx.showPathPicker.value = false;
					ctx.pathPickerQuery.value = "";
					ctx.pathPickerError.value = null;
				}
			}),
			h(GoatChainSessionsDialog, {
				"modelValue": ctx.showSessions.value,
				"onUpdate:modelValue": (v) => {
					ctx.showSessions.value = v;
					if (!v) ctx.sessionsDeleteArmed.value = false;
				},
				"loading": ctx.sessionsLoading.value,
				"deleteArmed": ctx.sessionsDeleteArmed.value,
				"sessions": ctx.sessionsList.value,
				"selectedIndex": ctx.sessionsIndex.value,
				"onUpdate:selectedIndex": (v) => {
					ctx.sessionsIndex.value = v;
					ctx.sessionsDeleteArmed.value = false;
				},
				"onOpen": async () => {
					const api = ctx.sessionsApi;
					const picked = ctx.sessionsList.value[ctx.sessionsIndex.value];
					if (!api || !picked) return;
					await api.use(picked.id);
					ctx.showSessions.value = false;
					ctx.sessionsDeleteArmed.value = false;
				},
				"onNew": async () => {
					const api = ctx.sessionsApi;
					if (!api) return;
					await api.createNew();
					ctx.showSessions.value = false;
					ctx.sessionsDeleteArmed.value = false;
					await ctx.router.push("home");
				},
				"onDelete": async () => {
					const api = ctx.sessionsApi;
					const picked = ctx.sessionsList.value[ctx.sessionsIndex.value];
					if (!api || !picked) return;
					const prevIndex = ctx.sessionsIndex.value;
					if (!ctx.sessionsDeleteArmed.value) {
						ctx.sessionsDeleteArmed.value = true;
						ctx.showCopyToast("Press Delete again to confirm.");
						return;
					}
					ctx.sessionsDeleteArmed.value = false;
					await api.delete(picked.id);
					await ctx.refreshSessions({ preferIndex: prevIndex });
				},
				"onRefresh": async () => {
					ctx.sessionsDeleteArmed.value = false;
					await ctx.refreshSessions();
				}
			}),
			h(GoatChainThemeDialog, {
				"modelValue": ctx.showTheme.value,
				"onUpdate:modelValue": (v) => ctx.showTheme.value = v,
				"preset": ctx.store.state.ui.theme.preset,
				"onUpdate:preset": (v) => ctx.store.setThemePreset(v),
				"overrides": ctx.store.state.ui.theme.overrides,
				"onSetOverride": (type, colors) => ctx.store.setMessageTypeThemeOverride(type, colors),
				"onResetOverrides": () => ctx.store.resetThemeOverrides()
			}),
			h(GoatChainConfigDialog, {
				"modelValue": ctx.showConfig.value,
				"onUpdate:modelValue": (v) => ctx.showConfig.value = v,
				"w": ctx.configW.value,
				"h": ctx.configH.value,
				"modelId": ctx.modelId.value,
				"onUpdate:modelId": (v) => ctx.modelId.value = v,
				"temperature": ctx.temperature.value,
				"onUpdate:temperature": (v) => ctx.temperature.value = v,
				"baseUrl": ctx.baseUrl.value,
				"onUpdate:baseUrl": (v) => ctx.baseUrl.value = v,
				"apiKeyDraft": ctx.apiKeyDraft.value,
				"onUpdate:apiKeyDraft": (v) => ctx.apiKeyDraft.value = v,
				"apiKeyMasked": ctx.apiKeyMasked.value,
				"onApply": ctx.applyConfig,
				"onCancel": ctx.closeConfig
			}),
			ctx.showApproval.value && ctx.activeApproval.value ? h(GoatChainApprovalDialog, {
				"modelValue": ctx.showApproval.value,
				"onUpdate:modelValue": (v) => ctx.showApproval.value = v,
				"request": ctx.activeApproval.value,
				"call": findToolCall(ctx.activeApproval.value.toolCallId),
				"w": ctx.approvalW.value,
				"h": ctx.approvalH.value,
				"onApprove": () => void ctx.store.approve(),
				"onDeny": () => void ctx.store.deny()
			}) : null,
			ctx.showAskUser.value && ctx.activeAskUser.value ? h(GoatChainAskUserDialog, {
				"modelValue": ctx.showAskUser.value,
				"onUpdate:modelValue": (v) => ctx.showAskUser.value = v,
				"toolCallId": String(ctx.activeAskUser.value.toolCallId ?? ""),
				"questions": ctx.activeAskUser.value.questions ?? [],
				"w": ctx.askUserW.value,
				"h": ctx.askUserH.value,
				"onSubmit": (answers) => void ctx.store.submitAskUserAnswers(answers),
				"onCancel": () => ctx.store.cancelAskUser()
			}) : null,
			ctx.store.hasRevertedMessages.value ? (() => {
				const bannerH = 2;
				const bannerX = 2;
				const bannerY = ctx.mainY + ctx.mainH.value;
				const bannerW = Math.max(0, ctx.mainW.value - 4);
				const barText = Array.from({ length: bannerH }, () => "┃").join("\n");
				const textX = bannerX + 2;
				const textW = Math.max(0, bannerW - 3);
				return [
					h(TText, {
						key: "revert-banner-bg",
						x: bannerX,
						y: bannerY,
						w: bannerW,
						h: bannerH,
						value: "",
						style: { bg: "blackBright" },
						zIndex: 50
					}),
					h(TText, {
						key: "revert-banner-bar",
						x: bannerX,
						y: bannerY,
						w: 1,
						h: bannerH,
						value: barText,
						style: {
							fg: "blueBright",
							bg: "blackBright"
						},
						zIndex: 51
					}),
					h(TText, {
						key: "revert-banner-text",
						x: textX,
						y: bannerY,
						w: textW,
						value: `${ctx.store.revertedMessageCount.value} message${ctx.store.revertedMessageCount.value > 1 ? "s" : ""} reverted`,
						style: {
							fg: "yellowBright",
							bg: "blackBright"
						},
						zIndex: 52
					}),
					h(TText, {
						key: "revert-banner-hint",
						x: textX,
						y: bannerY + 1,
						w: textW,
						value: "click or ctrl+r or /redo to restore",
						style: {
							fg: "white",
							dim: true,
							bg: "blackBright",
							bold: true
						},
						zIndex: 52
					}),
					h(TView, {
						key: "revert-banner-hit",
						x: bannerX,
						y: bannerY,
						w: bannerW,
						h: bannerH,
						zIndex: 60,
						focusable: true,
						onClick: () => {
							ctx.confirmRestore();
							ctx.focusBrowserTextarea();
						}
					})
				];
			})() : null,
			h(GoatChainMessageActionsDialog, {
				"modelValue": ctx.showMessageActions.value,
				"onUpdate:modelValue": (v) => {
					ctx.showMessageActions.value = v;
					if (!v) {
						ctx.messageActionsTargetId.value = null;
						ctx.messageActionsIndex.value = 0;
					}
				},
				"selectedIndex": ctx.messageActionsIndex.value,
				"onUpdate:selectedIndex": (v) => ctx.messageActionsIndex.value = v,
				"onAction": (action) => {
					if (action === "revert") ctx.handleRevertMessage();
					else if (action === "copy") ctx.handleCopyMessage();
					else ctx.handleForkSession();
				}
			}),
			h(GoatChainRedoConfirmDialog, {
				"modelValue": ctx.showRedoConfirm.value,
				"onUpdate:modelValue": (v) => ctx.showRedoConfirm.value = v,
				"onConfirm": ctx.confirmRestore,
				"onCancel": ctx.cancelRestore
			})
		];
	}
});

//#endregion
//#region src/pages/ChatPage/index.ts
function clamp$2(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function isNodeLike$1() {
	if (typeof globalThis.window !== "undefined") return false;
	return typeof process?.versions?.node === "string" && typeof process?.cwd === "function";
}
function getProcessCwd$1() {
	try {
		const cwd = typeof process.cwd === "function" ? String(process.cwd()) : "";
		return cwd || "/";
	} catch {
		return "/";
	}
}
const GoatChainChatPage = defineComponent({
	name: "GoatChainChatPage",
	setup() {
		const nodeLike = isNodeLike$1();
		const router = useRouter();
		const route = useRoute();
		const layout = useLayout();
		const { events } = useTerminal();
		const bridge = inject(GoatChainBridgeKey, null);
		if (!bridge) throw new Error("GoatChainBridge is missing (did you forget to wrap with <GoatChainProvider />?)");
		const store = bridge.store;
		const sessionsApi = bridge.sessions;
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const contentW = computed(() => Math.max(0, cols.value));
		const contentH = computed(() => Math.max(0, rows.value));
		const mainW = computed(() => Math.max(0, contentW.value));
		const topH = 3;
		const contentPadX = 1;
		const minInputLines = 2;
		const maxInputLines = 4;
		function countWrappedLines(text, width) {
			if (width <= 0) return 1;
			let lineCount = 0;
			for (const line of text.split("\n")) {
				if (line.length === 0) {
					lineCount += 1;
					continue;
				}
				let cells = 0;
				for (const ch of line) {
					const w = charCellWidth(ch);
					if (cells + w > width) {
						lineCount += 1;
						cells = w;
					} else cells += w;
				}
				lineCount += 1;
			}
			return Math.max(1, lineCount);
		}
		const scrollTop = ref(0);
		const stickToBottom = ref(true);
		const input = ref("");
		const history = ref([]);
		const historyIndex = ref(0);
		const focusFiles = ref([]);
		const focusMode = ref("input");
		const uiMode = ref("chat");
		function cycleUiMode(dir = 1) {
			const order = [
				"chat",
				"plan",
				"agent"
			];
			const cur = uiMode.value;
			const idx = order.indexOf(cur);
			const nextIdx = (idx + dir + order.length) % order.length;
			uiMode.value = order[nextIdx] ?? "chat";
		}
		const inputWrapWidth = computed(() => {
			const width = Math.max(1, Math.max(0, mainW.value - 4) - 3 - contentPadX * 2);
			return width;
		});
		const wrappedLines = computed(() => countWrappedLines(input.value, inputWrapWidth.value));
		const inputLines = computed(() => clamp$2(wrappedLines.value + 1, minInputLines, maxInputLines));
		const modelRowGap = computed(() => wrappedLines.value + 1 > maxInputLines ? 1 : 0);
		const modelRowH = 1;
		const panelBorderH = 2;
		const footerH = 2;
		const panelSpacing = computed(() => store.hasRevertedMessages.value ? 2 : 0);
		const panelH = computed(() => inputLines.value + modelRowGap.value + modelRowH);
		const panelTotalH = computed(() => panelH.value + panelBorderH);
		const mainH = computed(() => Math.max(0, contentH.value - topH - panelTotalH.value - footerH - panelSpacing.value));
		const mainY = topH;
		const panelTopY = computed(() => topH + mainH.value + panelSpacing.value + 1);
		const panelW = computed(() => Math.max(0, mainW.value - 4));
		const panelX = computed(() => 2);
		const inputX = computed(() => panelX.value + 1 + contentPadX);
		const inputInnerW = computed(() => Math.max(1, panelW.value - 3 - contentPadX * 2));
		const messageSelectStart = ref(null);
		const messageSelectEnd = ref(null);
		const isSelecting = ref(false);
		const copyToastVisible = ref(false);
		const copyToastText = ref("");
		let copyToastTimer = null;
		function showCopyToast(text) {
			copyToastText.value = text;
			copyToastVisible.value = true;
			if (copyToastTimer) clearTimeout(copyToastTimer);
			copyToastTimer = setTimeout(() => {
				copyToastVisible.value = false;
				copyToastTimer = null;
			}, 1200);
		}
		const promptSuggestions = [
			{
				value: "/settings",
				detail: "Configure model + API",
				onSelect: () => {
					openConfig();
					input.value = "";
				}
			},
			{
				value: "/sessions",
				detail: "List/pick sessions",
				onSelect: () => {
					openSessionsDialog();
					input.value = "";
				}
			},
			{
				value: "/new",
				detail: "Start a new session",
				onSelect: () => {
					createNewSession().then(() => router.push("home"));
					input.value = "";
				}
			}
		];
		const showConfig = ref(false);
		const showApproval = ref(false);
		const showAskUser = ref(false);
		const showPathPicker = ref(false);
		const showSessions = ref(false);
		const sessionsLoading = ref(false);
		const sessionsDeleteArmed = ref(false);
		const sessionsList = ref([]);
		const sessionsIndex = ref(0);
		const showMessageActions = ref(false);
		const messageActionsIndex = ref(0);
		const showRedoConfirm = ref(false);
		const messageActionsTargetId = ref(null);
		const pathPickerMode = ref("directory");
		const pathPickerQuery = ref("");
		const pathPickerError = ref(null);
		const modelId = ref("");
		const temperature = ref("");
		const baseUrl = ref("");
		const apiKeyDraft = ref("");
		function maskApiKey(v) {
			const s = String(v ?? "").trim();
			if (!s) return "";
			const tail = s.slice(-4);
			return `***${tail || "****"}`;
		}
		const apiKeyMasked = computed(() => {
			const env = store.state.context?.env ?? {};
			return maskApiKey(env.OPENAI_API_KEY);
		});
		async function refreshSessions(opts = {}) {
			const api = sessionsApi;
			if (!api) {
				sessionsList.value = [];
				sessionsIndex.value = 0;
				return;
			}
			sessionsLoading.value = true;
			try {
				const list = await api.list();
				sessionsList.value = list.slice();
				const max = Math.max(0, sessionsList.value.length - 1);
				let idx = -1;
				if (opts.preferId) idx = sessionsList.value.findIndex((s) => s.id === opts.preferId);
				if (idx < 0 && typeof opts.preferIndex === "number") idx = clamp$2(opts.preferIndex, 0, max);
				if (idx < 0) {
					const curId = String(store.state.sessionId ?? "");
					idx = sessionsList.value.findIndex((s) => s.id === curId);
				}
				sessionsIndex.value = idx >= 0 ? idx : 0;
			} catch {
				sessionsList.value = [];
				sessionsIndex.value = 0;
			} finally {
				sessionsLoading.value = false;
			}
		}
		async function openSessionsDialog() {
			if (!sessionsApi) {
				showCopyToast("Sessions are only available in Node/CLI mode.");
				return;
			}
			sessionsDeleteArmed.value = false;
			showSessions.value = true;
			await refreshSessions();
		}
		async function createNewSession() {
			if (!sessionsApi) {
				showCopyToast("Sessions are only available in Node/CLI mode.");
				return;
			}
			await sessionsApi.createNew();
		}
		const activeApproval = computed(() => store.state.approval.active);
		const approvalW = computed(() => clamp$2(Math.floor(contentW.value * .38), 26, 64));
		const approvalH = computed(() => clamp$2(11, 9, Math.max(9, rows.value - 6)));
		const activeAskUser = computed(() => store.state.paused?.kind === "ask_user" ? store.state.paused : null);
		const askUserW = computed(() => clamp$2(Math.floor(contentW.value * .62), 40, 90));
		const askUserH = computed(() => clamp$2(18, 14, Math.max(14, rows.value - 4)));
		const configW = computed(() => clamp$2(Math.floor(contentW.value * .78), 56, 84));
		const configH = computed(() => clamp$2(24, 18, Math.max(18, rows.value - 4)));
		const pathPickerTitle = computed(() => pathPickerMode.value === "directory" ? "Select Workspace" : "Select File");
		const pathPickerPlaceholder = computed(() => pathPickerMode.value === "directory" ? "Type a path (../ etc). Tab to complete. Enter selects a directory." : "Type a path (../ etc). Tab to complete. Enter selects a file.");
		const pickerW = computed(() => clamp$2(Math.min(72, Math.max(32, Math.floor(cols.value * .72))), 32, Math.max(32, cols.value - 4)));
		const pickerH = computed(() => clamp$2(Math.min(18, Math.max(8, Math.floor(rows.value * .55))), 8, Math.max(8, rows.value - 6)));
		const pickerWorkspace = computed(() => {
			const cwd = String(store.state.context?.cwd ?? ".");
			if (!isNodeLike$1()) return cwd;
			return resolveUserPath$1(getProcessCwd$1(), cwd);
		});
		watch(focusFiles, (next) => {
			store.setFocusFiles(next);
		});
		watch(() => activeApproval.value?.id ?? null, (next) => {
			if (next) showApproval.value = true;
		});
		watch(() => activeAskUser.value?.toolCallId ?? null, (next) => {
			if (next) showAskUser.value = true;
		});
		const currentSessionId = computed(() => String(store.state.sessionId ?? "").trim());
		watch(currentSessionId, (next) => {
			if (!sessionsApi || !next) return;
			refreshSessions({ preferId: next });
		}, { immediate: true });
		const currentSessionMeta = computed(() => {
			const id$1 = currentSessionId.value;
			if (!id$1) return null;
			return sessionsList.value.find((s) => s.id === id$1) ?? null;
		});
		const sessionHeaderTitle = computed(() => {
			const id$1 = currentSessionId.value;
			return `# ${id$1 || "new"}`;
		});
		const sessionHeaderSummary = computed(() => {
			const title = String(currentSessionMeta.value?.title ?? "").trim();
			if (title) return title;
			const metaSummary = String(currentSessionMeta.value?.summary ?? "").trim();
			if (metaSummary) return metaSummary;
			const firstUser = store.state.messages.find((m) => m.role === "user");
			const preview = String(firstUser?.content ?? "").trim();
			return preview || "New session";
		});
		const headerStatsDisplay = computed(() => {
			const msgCount = store.state.messages.length;
			const tokens = store.contextTokens.value;
			const base = `${msgCount.toLocaleString()} msgs · ${tokens.toLocaleString()} tok`;
			return copyToastVisible.value && copyToastText.value ? `${base}  ${copyToastText.value}` : base;
		});
		function ringForPct(pct) {
			if (pct >= 88) return "●";
			if (pct >= 63) return "◕";
			if (pct >= 38) return "◑";
			if (pct >= 13) return "◔";
			return "○";
		}
		const ctxPctChip = computed(() => {
			const pct = clamp$2(Math.round((store.contextPct.value ?? 0) * 100), 0, 100);
			return `${ringForPct(pct)} ${pct}%`;
		});
		const modelInfo = computed(() => {
			const model = String(store.state.config.model ?? "model");
			return {
				build: "■",
				label: model
			};
		});
		const assistantStatusText = computed(() => {
			for (let i = store.state.messages.length - 1; i >= 0; i--) {
				const m = store.state.messages[i];
				if (!m || m.role !== "assistant") continue;
				const s = m.parts.find((p) => p.type === "status");
				const text = String(s?.text ?? "").trim();
				if (!text || text === "Done.") return "";
				return text;
			}
			return "";
		});
		const assistantStatusStyle = computed(() => {
			const c = resolveMessageTypeColors(store.state.ui.theme, "status");
			return {
				fg: c.fg ?? "white",
				bg: "blackBright",
				dim: true
			};
		});
		const isLoading = computed(() => Boolean(store.state.runningToolCallId) || Boolean(store.state.runningAgentRound));
		const loadingFrame = ref(0);
		const totalDots = 10;
		const filledDots = 3;
		let loadingTimer = null;
		const statusAnimationActive = computed(() => {
			if (isLoading.value) return true;
			return /^thinking\b/i.test(assistantStatusText.value);
		});
		watch(statusAnimationActive, (active) => {
			if (active && !loadingTimer) loadingTimer = setInterval(() => {
				loadingFrame.value = (loadingFrame.value + 1) % totalDots;
			}, 100);
			else if (!active && loadingTimer) {
				clearInterval(loadingTimer);
				loadingTimer = null;
				loadingFrame.value = 0;
			}
		}, { immediate: true });
		const assistantStatusDisplay = computed(() => {
			const raw = assistantStatusText.value;
			if (!raw) return "";
			if (!/^thinking\b/i.test(raw)) return raw;
			const base = raw.replace(/[.…]+$/g, "").trimEnd() || "Thinking";
			const startedAt = store.state.thinking.startedAt;
			const now = Date.now();
			const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
			const elapsedS = elapsedMs / 1e3;
			const elapsed = elapsedS >= 10 ? `${Math.round(elapsedS)}s` : `${elapsedS.toFixed(1)}s`;
			const dots = ".".repeat(loadingFrame.value % 3 + 1);
			return `${base} ${elapsed}${dots}`;
		});
		const loadingDots = computed(() => {
			const dots = [];
			for (let i = 0; i < totalDots; i++) {
				const pos = (i - loadingFrame.value + totalDots) % totalDots;
				if (pos >= totalDots - filledDots) dots.push("■");
				else dots.push("·");
			}
			return dots.join("");
		});
		const footerRight = computed(() => "Ctrl+K: config    Tab: mode    Ctrl+P: commands");
		const modeLabel = computed(() => uiMode.value);
		const showCommands = ref(false);
		const commandIndex = ref(0);
		const showTheme = ref(false);
		const anyDialogOpen = computed(() => showCommands.value || showTheme.value || showSessions.value || showMessageActions.value || showRedoConfirm.value || showConfig.value || showApproval.value || showPathPicker.value || showAskUser.value);
		watch(anyDialogOpen, (open) => {
			if (!open) focusMode.value = "input";
		});
		function openCommandPalette() {
			showCommands.value = true;
			commandIndex.value = 0;
		}
		function closeCommandPalette() {
			showCommands.value = false;
		}
		const commands = computed(() => [
			{
				label: "Sessions",
				detail: "Pick or create a session (/sessions)",
				run: () => void openSessionsDialog()
			},
			{
				label: "New Session",
				detail: "Start a new session (/new)",
				run: () => void createNewSession()
			},
			{
				label: "Settings",
				detail: "Model + API (/settings, Ctrl+K)",
				run: () => openConfig()
			},
			{
				label: "Theme",
				detail: "Message colors",
				run: () => showTheme.value = true
			},
			{
				label: "Home",
				detail: "Back to home",
				run: () => void router.push("home")
			}
		]);
		const commandOptions = computed(() => commands.value.map((c) => ({
			label: c.label,
			detail: c.detail
		})));
		function onCommandSelect(v) {
			closeCommandPalette();
			if (!v) return;
			const cmd = commands.value.find((c) => c.label === v);
			cmd?.run();
		}
		const buildLayoutModel = createChatLayoutModelBuilder();
		const layoutDirtyMessageId = ref(null);
		const layoutDirtySeq = ref(0);
		const layoutModel = computed(() => {
			const width = Math.max(0, mainW.value - 4);
			return buildLayoutModel({
				messages: store.state.messages,
				width,
				selectedToolCallId: store.state.selectedToolCallId,
				theme: store.state.ui.theme,
				dirtyMessageId: layoutDirtyMessageId.value,
				dirtySeq: layoutDirtySeq.value
			});
		});
		const messageRoleById = computed(() => {
			const out = new Map();
			for (const m of store.state.messages) {
				const id$1 = String(m?.id ?? "").trim();
				const role = String(m?.role ?? "").trim();
				if (!id$1) continue;
				if (role === "user" || role === "assistant" || role === "tool") out.set(id$1, role);
			}
			return out;
		});
		const toolCallIds = computed(() => {
			const entries = Array.from(layoutModel.value.toolLineById.entries());
			entries.sort((a, b) => a[1] - b[1]);
			return entries.map(([id$1]) => id$1);
		});
		const maxScroll = computed(() => Math.max(0, layoutModel.value.lines.length - mainH.value));
		watch([() => layoutModel.value.lines.length, () => mainH.value], () => {
			if (stickToBottom.value) scrollTop.value = maxScroll.value;
			else scrollTop.value = clamp$2(scrollTop.value, 0, maxScroll.value);
		}, { immediate: true });
		const visibleLines = computed(() => layoutModel.value.lines.slice(scrollTop.value, scrollTop.value + mainH.value));
		const wheelState = createWheelScrollState();
		function onWheel(e) {
			const delta = e.deltaY ?? 0;
			if (!delta) return;
			const maxScrollVal = maxScroll.value;
			const { nextTop, dir } = applyWheelScroll(wheelState, delta, scrollTop.value, maxScrollVal);
			if (!dir || nextTop === scrollTop.value) return;
			scrollTop.value = nextTop;
			stickToBottom.value = nextTop === maxScrollVal;
		}
		function onLineClick(action) {
			if (!action || action.type === "none") return;
			focusBrowserTextarea();
			if (action.type === "selectToolCall") {
				focusMode.value = "messages";
				store.selectToolCall(store.state.selectedToolCallId === action.callId ? null : action.callId);
				return;
			}
			if (action.type === "openApproval") {
				if (activeApproval.value) showApproval.value = true;
				return;
			}
			if (action.type === "toggleItem") {
				layoutDirtyMessageId.value = action.messageId;
				layoutDirtySeq.value++;
				store.toggleChecklist(action.messageId, action.part, action.itemId);
				return;
			}
			if (action.type === "toggleCollapse") {
				layoutDirtyMessageId.value = action.messageId;
				layoutDirtySeq.value++;
				store.toggleBlockCollapsed(action.messageId, action.part, action.partIndex);
				return;
			}
			if (action.type === "showMessageActions") {
				messageActionsTargetId.value = action.messageId;
				showMessageActions.value = true;
			}
		}
		function handleRevertMessage() {
			const targetId = messageActionsTargetId.value;
			if (!targetId) return;
			store.revertFromMessage(targetId);
			showMessageActions.value = false;
			messageActionsTargetId.value = null;
			stickToBottom.value = true;
		}
		function handleCopyMessage() {
			const targetId = messageActionsTargetId.value;
			if (!targetId) return;
			const msg = store.state.messages.find((m) => m.id === targetId);
			if (!msg) return;
			let text = "";
			if (msg.role === "user") text = msg.content;
			else if (msg.role === "assistant") text = msg.parts.map((p) => {
				if (p.type === "markdown") return p.markdown;
				if (p.type === "status") return p.text;
				return "";
			}).filter(Boolean).join("\n");
			else if (msg.role === "tool") text = msg.result.output;
			if (text) copyToClipboard(text);
			showMessageActions.value = false;
			messageActionsTargetId.value = null;
		}
		function confirmRestore() {
			store.restoreRevertedMessages();
			showRedoConfirm.value = false;
			stickToBottom.value = true;
		}
		function cancelRestore() {
			showRedoConfirm.value = false;
		}
		function makeNewSessionId() {
			return `gc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		}
		function sanitizeForkMessage(m) {
			if (!m || typeof m !== "object") return m;
			if (m.role !== "assistant") return m;
			const parts = Array.isArray(m.parts) ? m.parts.filter((p) => p?.type !== "status") : m.parts;
			return {
				...m,
				parts
			};
		}
		async function handleForkSession() {
			const targetId = messageActionsTargetId.value;
			if (!targetId) return;
			const idx = store.state.messages.findIndex((m) => m.id === targetId);
			if (idx < 0) return;
			const seed = store.state.messages.slice(0, idx + 1).map(sanitizeForkMessage);
			showMessageActions.value = false;
			messageActionsTargetId.value = null;
			messageActionsIndex.value = 0;
			try {
				const api = sessionsApi;
				if (api && typeof api.fork === "function") await api.fork({ messages: seed });
				else if (sessionsApi) {
					await sessionsApi.createNew();
					store.state.messages.splice(0, store.state.messages.length, ...seed);
					store.state.revertedMessages.splice(0, store.state.revertedMessages.length);
					store.state.selectedToolCallId = null;
				} else {
					store.state.sessionId = makeNewSessionId();
					store.state.messages.splice(0, store.state.messages.length, ...seed);
					store.state.revertedMessages.splice(0, store.state.revertedMessages.length);
					store.state.selectedToolCallId = null;
					store.state.usage.prompt_tokens = 0;
					store.state.usage.completion_tokens = 0;
					store.state.usage.total_tokens = 0;
				}
			} catch {
				showCopyToast("Failed to fork session.");
			}
			stickToBottom.value = true;
			input.value = "";
			focusFiles.value = [];
			store.setFocusFiles([]);
		}
		const selectedToolCallId = computed(() => store.state.selectedToolCallId);
		async function runSelected() {
			if (!selectedToolCallId.value || store.state.runningToolCallId) return;
			await store.runToolCall(selectedToolCallId.value);
		}
		function scrollToolCallIntoView(callId) {
			const idx = layoutModel.value.toolLineById.get(callId);
			if (idx == null) return;
			const topWanted = Math.max(0, idx);
			if (topWanted < scrollTop.value) {
				scrollTop.value = clamp$2(topWanted, 0, maxScroll.value);
				return;
			}
			const bottom = scrollTop.value + Math.max(1, mainH.value) - 1;
			if (idx > bottom) scrollTop.value = clamp$2(idx - Math.max(1, mainH.value) + 1, 0, maxScroll.value);
		}
		function moveToolSelection(delta) {
			const ids = toolCallIds.value;
			if (ids.length === 0) return;
			const cur = selectedToolCallId.value;
			const curIdx = cur ? ids.indexOf(cur) : -1;
			const nextIdx = (() => {
				if (curIdx < 0) return ids.length - 1;
				const raw = curIdx + delta;
				if (raw < 0) return ids.length - 1;
				if (raw >= ids.length) return 0;
				return raw;
			})();
			const nextId$1 = ids[nextIdx];
			if (!nextId$1) return;
			store.selectToolCall(nextId$1);
			scrollToolCallIntoView(nextId$1);
		}
		function refocusStableTarget(e) {
			const id$1 = e?.currentTarget?.id;
			if (typeof id$1 === "string" && id$1) events.value?.focus(id$1);
		}
		async function copyToClipboard(text) {
			if (!text) return false;
			const nav = globalThis.navigator;
			if (nav?.clipboard?.writeText) try {
				await nav.clipboard.writeText(text);
				return true;
			} catch {}
			if (isNodeLike$1()) try {
				const platform = String(process.platform || "");
				const { spawn } = await import("node:child_process");
				const run = (cmd, args) => new Promise((resolve) => {
					try {
						const child = spawn(cmd, args, {
							stdio: [
								"pipe",
								"ignore",
								"ignore"
							],
							windowsHide: true
						});
						child.on("error", () => resolve(false));
						child.on("close", (code) => resolve(code === 0));
						child.stdin?.write(text, "utf8");
						child.stdin?.end();
					} catch {
						resolve(false);
					}
				});
				if (platform === "darwin") {
					if (await run("pbcopy", [])) return true;
				} else if (platform === "win32") {
					if (await run("cmd", ["/c", "clip"])) return true;
				} else {
					if (await run("wl-copy", [])) return true;
					if (await run("xclip", ["-selection", "clipboard"])) return true;
					if (await run("xsel", ["--clipboard", "--input"])) return true;
				}
			} catch {}
			if (process.stdout?.write && process.stdout?.isTTY) try {
				const base64 = isNodeLike$1() ? (await import("node:buffer")).Buffer.from(text, "utf-8").toString("base64") : btoa(unescape(encodeURIComponent(text)));
				process.stdout.write(`\u001B]52;c;${base64}\u0007`);
				return true;
			} catch {}
			const doc = globalThis.document;
			if (!doc?.createElement || !doc?.body?.appendChild || typeof doc.execCommand !== "function") return false;
			try {
				const prevActive = doc.activeElement;
				const ta = doc.createElement("textarea");
				ta.value = text;
				ta.setAttribute("readonly", "true");
				ta.setAttribute("aria-hidden", "true");
				ta.style.position = "fixed";
				ta.style.left = "-9999px";
				ta.style.top = "-9999px";
				ta.style.opacity = "0";
				doc.body.appendChild(ta);
				ta.focus();
				ta.select();
				ta.setSelectionRange(0, ta.value.length);
				const ok = Boolean(doc.execCommand("copy"));
				ta.remove();
				try {
					prevActive?.focus?.({ preventScroll: true });
				} catch {
					prevActive?.focus?.();
				}
				return ok;
			} catch {
				return false;
			}
		}
		function getSelectedMessageText() {
			const start = messageSelectStart.value;
			const end = messageSelectEnd.value;
			if (!start || !end) return "";
			const lines = layoutModel.value.lines;
			const startRow = Math.min(start.row, end.row);
			const endRow = Math.max(start.row, end.row);
			const startCol = start.row < end.row ? start.col : start.row > end.row ? end.col : Math.min(start.col, end.col);
			const endCol = start.row < end.row ? end.col : start.row > end.row ? start.col : Math.max(start.col, end.col);
			const selectedLines = [];
			for (let r = startRow; r <= endRow && r < lines.length; r++) {
				const lineText = lines[r]?.text ?? "";
				if (startRow === endRow) selectedLines.push(lineText.slice(startCol, endCol));
				else if (r === startRow) selectedLines.push(lineText.slice(startCol));
				else if (r === endRow) selectedLines.push(lineText.slice(0, endCol));
				else selectedLines.push(lineText);
			}
			return selectedLines.join("\n").trim();
		}
		function onMessagePointerDown(e) {
			focusMode.value = "messages";
			focusBrowserTextarea();
			if (!nodeLike && !e?.altKey) return;
			const localY = (e.cellY ?? 0) - mainY;
			const localX = (e.cellX ?? 0) - 2;
			const row = scrollTop.value + localY;
			messageSelectStart.value = {
				row,
				col: Math.max(0, localX)
			};
			messageSelectEnd.value = {
				row,
				col: Math.max(0, localX)
			};
			isSelecting.value = true;
		}
		function onMessagePointerMove(e) {
			if (!isSelecting.value) return;
			const localY = (e.cellY ?? 0) - mainY;
			const localX = (e.cellX ?? 0) - 2;
			const row = scrollTop.value + localY;
			messageSelectEnd.value = {
				row,
				col: Math.max(0, localX)
			};
		}
		function onMessagePointerUp(e) {
			if (!isSelecting.value) return;
			isSelecting.value = false;
			const start = messageSelectStart.value;
			const end = messageSelectEnd.value;
			const isDrag = start && end && (start.row !== end.row || Math.abs(start.col - end.col) > 1);
			if (!nodeLike) return;
			if (isDrag) {
				const text = getSelectedMessageText();
				if (text) copyToClipboard(text).then((ok) => {
					showCopyToast(ok ? "Copied" : "Copy failed");
				});
				return;
			}
			if (!isDrag && start) {
				if (e.target && e.currentTarget && e.target !== e.currentTarget) return;
				const line = layoutModel.value.lines[start.row];
				if (line?.messageId) {
					const msg = store.state.messages.find((m) => m.id === line.messageId);
					if (msg?.role === "user") {
						messageActionsTargetId.value = line.messageId;
						showMessageActions.value = true;
					}
				}
			}
		}
		function getNativeSelectionText() {
			const sel = globalThis.getSelection?.();
			const text = typeof sel?.toString === "function" ? String(sel.toString()) : "";
			return text;
		}
		function focusBrowserTextarea() {
			if (nodeLike) return;
			try {
				const doc = globalThis.document;
				const el = doc?.querySelector?.("[data-vt-host] textarea");
				el?.focus?.();
			} catch {}
		}
		function onMessageClick(e) {
			if (nodeLike) return;
			focusBrowserTextarea();
			focusMode.value = "messages";
			if (getNativeSelectionText().trim()) return;
			if (!e?.shiftKey) return;
			if (e.target && e.currentTarget && e.target !== e.currentTarget) return;
			const localY = (e.cellY ?? 0) - mainY;
			const row = scrollTop.value + localY;
			const line = layoutModel.value.lines[row];
			if (!line?.messageId) return;
			const msg = store.state.messages.find((m) => m.id === line.messageId);
			if (msg?.role !== "user") return;
			messageActionsTargetId.value = line.messageId;
			showMessageActions.value = true;
		}
		function onMessageContextMenu(e) {
			if (getNativeSelectionText().trim()) return;
			e.preventDefault?.();
			const localY = (e.cellY ?? 0) - mainY;
			const row = scrollTop.value + localY;
			const line = layoutModel.value.lines[row];
			if (line?.messageId) {
				const msg = store.state.messages.find((m) => m.id === line.messageId);
				if (msg?.role === "user") {
					messageActionsTargetId.value = line.messageId;
					showMessageActions.value = true;
				}
			}
		}
		function onMessageKeydown(e) {
			const isClipboardShortcut = Boolean((e.metaKey || e.ctrlKey) && !e.altKey);
			const isC = e.key === "c" || e.key === "C";
			const hasMessageSelection = messageSelectStart.value && messageSelectEnd.value && (messageSelectStart.value.row !== messageSelectEnd.value.row || messageSelectStart.value.col !== messageSelectEnd.value.col);
			if (isClipboardShortcut && isC && hasMessageSelection) {
				e.preventDefault?.();
				const text = getSelectedMessageText();
				if (text) copyToClipboard(text);
			}
		}
		function onSelectionKeydown(e) {
			if (showCommands.value || showTheme.value || showConfig.value || showApproval.value || showPathPicker.value || showSessions.value || showMessageActions.value || showRedoConfirm.value) return;
			onMessageKeydown(e);
			if (e.key === "ArrowUp") {
				e.preventDefault?.();
				moveToolSelection(-1);
				refocusStableTarget(e);
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault?.();
				moveToolSelection(1);
				refocusStableTarget(e);
				return;
			}
			if (e.key === "Enter") {
				if (!selectedToolCallId.value) return;
				e.preventDefault?.();
				runSelected();
				refocusStableTarget(e);
			}
		}
		function send(v) {
			let raw = normalizeNewlines(v);
			const trimmed = raw.trimEnd();
			if (!trimmed) return;
			if (trimmed === "/approvals" || trimmed === "/approval") {
				showCopyToast(store.state.approval.skipApproval ? "Tool approvals: auto" : "Tool approvals: manual");
				input.value = "";
				return;
			}
			if (trimmed === "/approvals on" || trimmed === "/approval on") {
				store.state.approval.skipApproval = true;
				showCopyToast("Tool approvals: auto");
				input.value = "";
				return;
			}
			if (trimmed === "/approvals off" || trimmed === "/approval off") {
				store.state.approval.skipApproval = false;
				showCopyToast("Tool approvals: manual");
				input.value = "";
				return;
			}
			if (trimmed === "/approvals toggle" || trimmed === "/approval toggle") {
				store.state.approval.skipApproval = !store.state.approval.skipApproval;
				showCopyToast(store.state.approval.skipApproval ? "Tool approvals: auto" : "Tool approvals: manual");
				input.value = "";
				return;
			}
			if (trimmed === "/settings" || trimmed === "/config") {
				openConfig();
				input.value = "";
				return;
			}
			if (trimmed === "/sessions") {
				openSessionsDialog();
				input.value = "";
				return;
			}
			if (trimmed === "/new") {
				createNewSession().then(() => router.push("home"));
				input.value = "";
				return;
			}
			if (trimmed === "/redo") {
				if (store.hasRevertedMessages.value) showRedoConfirm.value = true;
				input.value = "";
				return;
			}
			stickToBottom.value = true;
			const files = focusFiles.value;
			if (files.length > 0) {
				raw = raw.replace(/^[\s\u200B]*\]+/u, "");
				store.sendUserInput({
					content: raw,
					focusFiles: files
				});
			} else store.send(raw);
			focusFiles.value = [];
			store.setFocusFiles([]);
			history.value.push(trimmed);
			historyIndex.value = history.value.length;
			input.value = "";
		}
		function openConfig() {
			showConfig.value = true;
			modelId.value = String(store.state.config.model ?? "").trim() || "deepseek-v3.1";
			temperature.value = String(store.state.config.temperature ?? "");
			const env = store.state.context?.env ?? {};
			baseUrl.value = String(env.DIMCODE_OPENAI_BASE_URL || env.OPENAI_BASE_URL || "");
			apiKeyDraft.value = "";
		}
		function closeConfig() {
			showConfig.value = false;
		}
		watch(() => route.value.params, (params) => {
			if (params?.open === "settings") {
				openConfig();
				router.replace("chat");
			}
		}, { immediate: true });
		function applyConfig() {
			if (store.state.paused?.kind === "tool_approval" || store.state.approval.active?.status === "pending") {
				showCopyToast("Resolve the pending approval before changing settings.");
				return;
			}
			const nextModel = modelId.value.trim();
			if (nextModel) store.state.config.model = nextModel;
			const t = Number.parseFloat(temperature.value);
			store.state.config.temperature = Number.isFinite(t) ? t : store.state.config.temperature;
			store.setEnvVar("DIMCODE_MODEL", store.state.config.model);
			store.setEnvVar("DIMCODE_TEMPERATURE", String(store.state.config.temperature ?? ""));
			store.setEnvVar("DIMCODE_OPENAI_BASE_URL", baseUrl.value.trim() || void 0);
			const nextKey = apiKeyDraft.value.trim();
			if (nextKey) store.setEnvVar("OPENAI_API_KEY", nextKey);
			if (isNodeLike$1()) {
				if (process.env) {
					process.env.DIMCODE_MODEL = store.state.config.model;
					process.env.DIMCODE_TEMPERATURE = String(store.state.config.temperature ?? "");
					const nextBaseUrl = baseUrl.value.trim();
					if (nextBaseUrl) process.env.DIMCODE_OPENAI_BASE_URL = nextBaseUrl;
					else delete process.env.DIMCODE_OPENAI_BASE_URL;
					if (nextKey) process.env.OPENAI_API_KEY = nextKey;
				}
			}
			apiKeyDraft.value = "";
			closeConfig();
		}
		function setContextCwd(absDir) {
			store.setCwd(absDir);
		}
		function onInputKeydown(e) {
			if (e.defaultPrevented) return;
			if (e.ctrlKey && (e.key === "p" || e.key === "P")) {
				e.preventDefault?.();
				openCommandPalette();
				return;
			}
			if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault?.();
				cycleUiMode(e.shiftKey ? -1 : 1);
				return;
			}
			if (e.ctrlKey && (e.key === "k" || e.key === "K")) {
				e.preventDefault?.();
				openConfig();
				return;
			}
			if ((focusMode.value === "messages" || Boolean(selectedToolCallId.value) || !input.value && toolCallIds.value.length > 0) && !showCommands.value && !showTheme.value && !showConfig.value && !showApproval.value && !showPathPicker.value && !showMessageActions.value && !showRedoConfirm.value) {
				if (e.key === "ArrowUp") {
					e.preventDefault?.();
					moveToolSelection(-1);
					return;
				}
				if (e.key === "ArrowDown") {
					e.preventDefault?.();
					moveToolSelection(1);
					return;
				}
				if (e.key === "Enter") {
					if (!selectedToolCallId.value) return;
					if (input.value.trim()) return;
					e.preventDefault?.();
					runSelected();
					return;
				}
			}
			if (e.defaultPrevented) return;
			const inputWidth = Math.max(1, Math.max(0, mainW.value - 4) - 3 - contentPadX * 2);
			const visualLineCount = countWrappedLines(input.value, inputWidth);
			if (e.key === "ArrowUp") {
				if (visualLineCount > 1) return;
				if (history.value.length === 0) return;
				e.preventDefault();
				historyIndex.value = clamp$2(historyIndex.value - 1, 0, history.value.length - 1);
				input.value = history.value[historyIndex.value] ?? "";
				return;
			}
			if (e.key === "ArrowDown") {
				if (visualLineCount > 1) return;
				if (history.value.length === 0) return;
				e.preventDefault();
				if (historyIndex.value >= history.value.length - 1) {
					historyIndex.value = history.value.length;
					input.value = "";
					return;
				}
				historyIndex.value = clamp$2(historyIndex.value + 1, 0, history.value.length - 1);
				input.value = history.value[historyIndex.value] ?? "";
			}
			if (e.key === "Escape" && !input.value) {
				e.preventDefault?.();
				if (isLoading.value) {
					store.interrupt();
					return;
				}
				router.back();
			}
		}
		function onGlobalKeydown(e) {
			const isClipboardShortcut = Boolean((e.metaKey || e.ctrlKey) && !e.altKey);
			const isAltCopyShortcut = Boolean(e.altKey && !e.metaKey && !e.ctrlKey);
			const isC = e.key === "c" || e.key === "C";
			const hasMessageSelection = messageSelectStart.value && messageSelectEnd.value && (messageSelectStart.value.row !== messageSelectEnd.value.row || messageSelectStart.value.col !== messageSelectEnd.value.col);
			if ((isClipboardShortcut || nodeLike && isAltCopyShortcut) && isC && hasMessageSelection) {
				const text = getSelectedMessageText();
				if (text) {
					e.stopPropagation?.();
					e.preventDefault?.();
					copyToClipboard(text);
					return;
				}
			}
			if (e.defaultPrevented) return;
			if (!showCommands.value && !showTheme.value && !showMessageActions.value && !showRedoConfirm.value && !showConfig.value && !showApproval.value && !showPathPicker.value && !showSessions.value) {
				if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "k" || e.key === "K")) {
					e.stopPropagation?.();
					e.preventDefault?.();
					openConfig();
					return;
				}
				if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "p" || e.key === "P")) {
					e.stopPropagation?.();
					e.preventDefault?.();
					openCommandPalette();
					return;
				}
				if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
					e.stopPropagation?.();
					e.preventDefault?.();
					cycleUiMode(e.shiftKey ? -1 : 1);
					return;
				}
			}
			if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "r" || e.key === "R")) {
				if (store.hasRevertedMessages.value) {
					e.stopPropagation?.();
					e.preventDefault?.();
					showRedoConfirm.value = true;
					return;
				}
			}
			if (e.key !== "Escape") return;
			e.stopPropagation?.();
			e.preventDefault?.();
			if (showRedoConfirm.value) showRedoConfirm.value = false;
			else if (showCommands.value) closeCommandPalette();
			else if (showTheme.value) showTheme.value = false;
			else if (showSessions.value) showSessions.value = false;
			else if (showMessageActions.value) showMessageActions.value = false;
			else if (showConfig.value) closeConfig();
			else if (showApproval.value) showApproval.value = false;
			else if (showAskUser.value) showAskUser.value = false;
			else if (showPathPicker.value) showPathPicker.value = false;
			else if (isLoading.value) store.interrupt();
			else if (hasMessageSelection) {
				messageSelectStart.value = null;
				messageSelectEnd.value = null;
				isSelecting.value = false;
			} else router.back();
		}
		function onGlobalKeydownCapture(e) {
			if (anyDialogOpen.value) return;
			const toolNavArmed = focusMode.value === "messages" || Boolean(selectedToolCallId.value) || !input.value && toolCallIds.value.length > 0;
			if (!toolNavArmed) return;
			if (e.key === "ArrowUp") {
				e.stopPropagation?.();
				e.preventDefault?.();
				moveToolSelection(-1);
				return;
			}
			if (e.key === "ArrowDown") {
				e.stopPropagation?.();
				e.preventDefault?.();
				moveToolSelection(1);
				return;
			}
			if (e.key === "Enter" && selectedToolCallId.value && !input.value.trim()) {
				e.stopPropagation?.();
				e.preventDefault?.();
				runSelected();
			}
		}
		provide(ChatPageContextKey, {
			nodeLike,
			router,
			store,
			sessionsApi,
			cols,
			rows,
			contentW,
			mainY,
			mainW,
			mainH,
			scrollTop,
			visibleLines,
			messageRoleById,
			messageSelectStart,
			messageSelectEnd,
			focusMode,
			onWheel,
			onSelectionKeydown,
			onMessageClick,
			onMessagePointerDown,
			onMessagePointerMove,
			onMessagePointerUp,
			onMessageContextMenu,
			onLineClick,
			focusBrowserTextarea,
			showCopyToast,
			sessionHeaderTitle,
			sessionHeaderSummary,
			headerStatsDisplay,
			panelW,
			panelX,
			panelTopY,
			panelH,
			inputX,
			inputInnerW,
			inputLines,
			modelRowGap,
			input,
			focusFiles,
			pickerWorkspace,
			promptSuggestions,
			showCommands,
			showTheme,
			showSessions,
			showMessageActions,
			showRedoConfirm,
			showConfig,
			showApproval,
			showPathPicker,
			pathPickerMode,
			pathPickerQuery,
			pathPickerError,
			send,
			onInputKeydown,
			setContextCwd,
			ctxPctChip,
			modelInfo,
			modeLabel,
			assistantStatusDisplay,
			assistantStatusStyle,
			footerH,
			footerRight,
			isLoading,
			loadingDots,
			commandOptions,
			commandIndex,
			onCommandSelect,
			closeCommandPalette,
			refreshSessions,
			sessionsLoading,
			sessionsDeleteArmed,
			sessionsList,
			sessionsIndex,
			messageActionsIndex,
			messageActionsTargetId,
			handleRevertMessage,
			handleCopyMessage,
			handleForkSession,
			confirmRestore,
			cancelRestore,
			pickerW,
			pickerH,
			pathPickerTitle,
			pathPickerPlaceholder,
			configW,
			configH,
			modelId,
			temperature,
			baseUrl,
			apiKeyDraft,
			apiKeyMasked,
			applyConfig,
			closeConfig,
			activeApproval,
			approvalW,
			approvalH,
			activeAskUser,
			showAskUser,
			askUserW,
			askUserH
		});
		return () => h(TView, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			zIndex: 0,
			focusable: false,
			onKeydownCapture: onGlobalKeydownCapture,
			onKeydown: onGlobalKeydown
		}, () => [
			h(TText, {
				key: "bg",
				x: 0,
				y: 0,
				w: cols.value,
				h: rows.value,
				value: "",
				style: CHROME_STYLE,
				zIndex: -100
			}),
			h(GoatChainChatHeader),
			h(GoatChainChatMessages),
			h(GoatChainChatBottomPanel),
			h(GoatChainChatFooter),
			h(GoatChainChatOverlays)
		]);
	}
});

//#endregion
//#region src/pages/CliParityPage.ts
const GoatChainCliParityPage = defineComponent({
	name: "GoatChainCliParityPage",
	setup() {
		const layout = useLayout();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const input = ref("");
		const status = ref("Type and press Enter (Ctrl+C to quit).");
		const showSelect = ref(false);
		const selected = ref(0);
		const options = ref([
			"Run",
			"Search",
			"Help"
		]);
		const committed = ref("");
		const popupW = computed(() => Math.min(44, Math.max(18, cols.value - 4)));
		const popupX = computed(() => Math.max(1, Math.floor((cols.value - popupW.value) / 2)));
		const popupY = 2;
		const popupInnerW = computed(() => Math.max(0, popupW.value - 2));
		const selectH = computed(() => Math.min(5, Math.max(1, options.value.length)));
		const previewText = computed(() => {
			const label = options.value[selected.value] ?? "";
			const body = committed.value || "";
			return label ? `${label}:\n${body}` : body;
		});
		const previewLines = computed(() => popupInnerW.value > 0 ? wrapByCells(previewText.value, popupInnerW.value) : [""]);
		const previewH = computed(() => {
			const max = Math.max(1, rows.value - popupY - (2 + selectH.value + 1) - 1);
			return Math.min(max, Math.max(1, previewLines.value.length));
		});
		const popupH = computed(() => 2 + selectH.value + 1 + previewH.value);
		function openSelect() {
			showSelect.value = true;
			selected.value = 0;
		}
		function closeSelect() {
			showSelect.value = false;
		}
		function onCommit(v) {
			committed.value = v;
			status.value = "Committed. Choose an action (newlines are preserved in the preview).";
			openSelect();
		}
		function onSelect(v) {
			status.value = `Selected: ${v ?? ""}`;
			closeSelect();
		}
		return () => h(TBox, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			border: true,
			title: "vue-terminal • CLI",
			padding: 0,
			style: {
				fg: "blueBright",
				bg: "black"
			}
		}, () => [
			h(TText, {
				x: 0,
				y: 0,
				w: cols.value - 2,
				value: status.value,
				style: {
					fg: "greenBright",
					bg: "blackBright"
				}
			}),
			h(TInput, {
				"x": 0,
				"y": rows.value - 3,
				"w": cols.value - 2,
				"modelValue": input.value,
				"onUpdate:modelValue": (v) => input.value = v,
				"autoFocus": true,
				"placeholder": "Type here...",
				"onChange": (v) => onCommit(v),
				"style": {
					fg: "whiteBright",
					bg: "blackBright"
				}
			}),
			showSelect.value ? h(TView, {
				x: 0,
				y: 0,
				w: cols.value,
				h: rows.value,
				zIndex: 100,
				focusable: true,
				onClick: closeSelect
			}, () => h(TBox, {
				x: popupX.value,
				y: popupY,
				w: popupW.value,
				h: popupH.value,
				border: true,
				title: "Select",
				padding: 0,
				style: {
					fg: "yellowBright",
					bg: "blackBright"
				},
				zIndex: 200
			}, () => [
				h(TSelect, {
					"x": 0,
					"y": 0,
					"w": popupW.value - 2,
					"h": selectH.value,
					"options": options.value,
					"modelValue": selected.value,
					"onUpdate:modelValue": (v) => selected.value = v,
					"autoFocus": true,
					"closeOnBlur": true,
					"onChange": (v) => onSelect(v),
					"onClose": closeSelect,
					"style": {
						fg: "whiteBright",
						bg: "blackBright"
					}
				}),
				h(TText, {
					x: 0,
					y: selectH.value,
					w: popupW.value - 2,
					value: "─".repeat(Math.max(0, popupW.value - 2)),
					style: {
						dim: true,
						bg: "blackBright"
					}
				}),
				h(TText, {
					x: 0,
					y: selectH.value + 1,
					w: popupW.value - 2,
					h: previewH.value,
					wrap: true,
					value: previewText.value,
					style: { bg: "blackBright" }
				})
			])) : null
		]);
	}
});

//#endregion
//#region src/pages/DialogPage.ts
const GoatChainDialogPage = defineComponent({
	name: "GoatChainDialogPage",
	setup() {
		const router = useRouter();
		const layout = useLayout();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const open = ref(false);
		const closeOnBlur = ref(true);
		const blurCount = ref(0);
		const closeCount = ref(0);
		const confirmCount = ref(0);
		const lastConfirm = ref("");
		function toggleCloseOnBlur() {
			closeOnBlur.value = !closeOnBlur.value;
		}
		return () => h(TBox, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			border: true,
			title: "Dialog",
			padding: 1,
			style: {
				fg: "blueBright",
				bg: "black"
			}
		}, () => [
			h(TView, {
				x: 0,
				y: 0,
				w: cols.value - 2,
				h: rows.value - 2,
				zIndex: 0,
				onKeydownCapture: (e) => {
					if (e.key === "Escape") router.back();
				}
			}),
			h(TText, {
				x: 0,
				y: 0,
				w: cols.value - 4,
				value: "Esc: back • Click to focus/blur",
				style: { fg: "whiteBright" }
			}),
			h(TView, {
				x: 0,
				y: 2,
				w: 20,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: () => open.value = true,
				onKeydown: (e) => {
					if (e.key === "Enter") open.value = true;
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: "[ Open Dialog ]",
				style: {
					fg: "greenBright",
					bold: true
				}
			})),
			h(TView, {
				x: 0,
				y: 4,
				w: 34,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: toggleCloseOnBlur,
				onKeydown: (e) => {
					if (e.key === "Enter") toggleCloseOnBlur();
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: `[ closeOnBlur: ${closeOnBlur.value ? "ON" : "OFF"} ]`,
				style: {
					fg: "yellowBright",
					bold: true
				}
			})),
			h(TView, {
				x: 0,
				y: rows.value - 5,
				w: 18,
				h: 1,
				zIndex: 10,
				focusable: true
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: "[ Outside Focus ]",
				style: {
					fg: "redBright",
					bold: true
				}
			})),
			h(TText, {
				x: 0,
				y: rows.value - 6,
				w: cols.value - 4,
				value: `open=${open.value}  blur=${blurCount.value}  close=${closeCount.value}  confirm=${confirmCount.value} ${lastConfirm.value}`,
				style: { fg: "whiteBright" }
			}),
			h(TDialog, {
				"modelValue": open.value,
				"onUpdate:modelValue": (v) => open.value = v,
				"w": 44,
				"h": 9,
				"title": "Confirm",
				"placement": "center",
				"backdrop": false,
				"closeOnBlur": closeOnBlur.value,
				"style": {
					fg: "magentaBright",
					bg: "blackBright"
				},
				"buttons": [{
					label: "Yes",
					value: "yes",
					kind: "primary",
					default: true
				}, {
					label: "No",
					value: "no"
				}],
				"onBlur": () => blurCount.value += 1,
				"onClose": () => closeCount.value += 1,
				"onConfirm": (b) => {
					confirmCount.value += 1;
					lastConfirm.value = `last=${String(b?.value ?? "")}`;
					open.value = false;
				}
			}, () => [
				h(TText, {
					x: 0,
					y: 0,
					w: 40,
					value: "Dialog should emit blur/close events.",
					style: { fg: "whiteBright" }
				}),
				h(TText, {
					x: 0,
					y: 1,
					w: 40,
					value: `closeOnBlur=${closeOnBlur.value}`,
					style: { dim: true }
				}),
				h(TText, {
					x: 0,
					y: 2,
					w: 40,
					value: "←/→ select • Enter confirm • Tip: click [ Outside Focus ] to blur.",
					style: { dim: true }
				})
			])
		]);
	}
});

//#endregion
//#region src/pages/HomePage.ts
function clamp$1(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
function isNodeLike() {
	if (typeof globalThis.window !== "undefined") return false;
	return typeof process?.versions?.node === "string" && typeof process?.cwd === "function";
}
function getProcessCwd() {
	try {
		const cwd = typeof process.cwd === "function" ? String(process.cwd()) : "";
		return cwd || "/";
	} catch {
		return "/";
	}
}
function getHomeDir() {
	try {
		const env = process.env ?? {};
		const raw = String(env.HOME ?? env.USERPROFILE ?? "").trim();
		return raw.replace(/[\\/]+$/g, "");
	} catch {
		return "";
	}
}
function tildifyPath(absPath) {
	const p = String(absPath ?? "").trim();
	if (!p) return "";
	const home = getHomeDir();
	if (!home) return p;
	if (p === home) return "~";
	if (p.startsWith(`${home}/`)) return `~${p.slice(home.length)}`;
	if (p.startsWith(`${home}\\`)) return `~${p.slice(home.length)}`;
	return p;
}
const BIG_LOGO_H = 7;
const BIG_LOGO_GLYPHS = Object.freeze({
	"a": [
		" ███ ",
		"█   █",
		"█   █",
		"█████",
		"█   █",
		"█   █",
		"█   █"
	],
	"o": [
		" ███ ",
		"█   █",
		"█   █",
		"█   █",
		"█   █",
		"█   █",
		" ███ "
	],
	"g": [
		" ███ ",
		"█   █",
		"█    ",
		"█  ██",
		"█   █",
		"█   █",
		" ████"
	],
	"h": [
		"█   █",
		"█   █",
		"█   █",
		"█████",
		"█   █",
		"█   █",
		"█   █"
	],
	"i": [
		"█████",
		"  █  ",
		"  █  ",
		"  █  ",
		"  █  ",
		"  █  ",
		"█████"
	],
	"t": [
		"█████",
		"  █  ",
		"  █  ",
		"  █  ",
		"  █  ",
		"  █  ",
		"  █  "
	],
	"p": [
		"████ ",
		"█   █",
		"█   █",
		"████ ",
		"█    ",
		"█    ",
		"█    "
	],
	"e": [
		"█████",
		"█    ",
		"█    ",
		"████ ",
		"█    ",
		"█    ",
		"█████"
	],
	"n": [
		"█   █",
		"██  █",
		"███ █",
		"█ ███",
		"█  ██",
		"█   █",
		"█   █"
	],
	"c": [
		" ████",
		"█    ",
		"█    ",
		"█    ",
		"█    ",
		"█    ",
		" ████"
	],
	"d": [
		"████ ",
		"█   █",
		"█   █",
		"█   █",
		"█   █",
		"█   █",
		"████ "
	],
	" ": [
		"  ",
		"  ",
		"  ",
		"  ",
		"  ",
		"  ",
		"  "
	]
});
function renderBigWord(word, gap = 1) {
	const rows = Array.from({ length: BIG_LOGO_H }, () => "");
	const pad = " ".repeat(Math.max(0, Math.floor(gap)));
	const letters = word.toLowerCase().split("");
	for (const ch of letters) {
		const glyph = BIG_LOGO_GLYPHS[ch] ?? BIG_LOGO_GLYPHS[" "];
		for (let i = 0; i < BIG_LOGO_H; i++) rows[i] += `${glyph[i] ?? ""}${pad}`;
	}
	return rows.map((s) => s.replace(/\s+$/g, ""));
}
const GoatChainHomePage = defineComponent({
	name: "GoatChainHomePage",
	setup() {
		const router = useRouter$1();
		const layout = useLayout$1();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const bridge = inject(GoatChainBridgeKey, null);
		if (!bridge) throw new Error("GoatChainBridge is missing (did you forget to wrap with <GoatChainProvider />?)");
		const store = bridge.store;
		const sessionsApi = bridge.sessions;
		const input = ref("");
		const showCommands = ref(false);
		const commandIndex = ref(0);
		const focusFiles = ref([]);
		const uiMode = ref("chat");
		function cycleUiMode(dir = 1) {
			const order = [
				"chat",
				"plan",
				"agent"
			];
			const cur = uiMode.value;
			const idx = order.indexOf(cur);
			const nextIdx = (idx + dir + order.length) % order.length;
			uiMode.value = order[nextIdx] ?? "chat";
		}
		const showPathPicker = ref(false);
		const pathPickerMode = ref("directory");
		const pathPickerQuery = ref("");
		const pathPickerError = ref(null);
		const showSessions = ref(false);
		const sessionsLoading = ref(false);
		const sessionsDeleteArmed = ref(false);
		const sessionsList = ref([]);
		const sessionsIndex = ref(0);
		const promptSuggestions = [
			{
				value: "/settings",
				detail: "Configure model + API",
				onSelect: () => {
					openConfig();
					input.value = "";
				}
			},
			{
				value: "/sessions",
				detail: "List/pick sessions",
				onSelect: () => {
					openSessionsDialog();
					input.value = "";
				}
			},
			{
				value: "/new",
				detail: "Start a new session",
				onSelect: () => {
					createNewSession();
					input.value = "";
				}
			}
		];
		const promptMentionPlugin = createPromptMentionPlugin(isNodeLike() ? { mentionPathProvider: createNodeMentionPathProvider() } : {});
		const pickerWorkspace = computed(() => {
			const cwd = String(store.state.context?.cwd ?? ".");
			if (!isNodeLike()) return cwd;
			return resolveUserPath(getProcessCwd(), cwd);
		});
		const pickerW = computed(() => clamp$1(Math.min(72, Math.max(32, Math.floor(cols.value * .72))), 32, Math.max(32, cols.value - 4)));
		const pickerH = computed(() => clamp$1(Math.min(18, Math.max(8, Math.floor(rows.value * .55))), 8, Math.max(8, rows.value - 6)));
		const pathPickerTitle = computed(() => pathPickerMode.value === "directory" ? "Select Workspace" : "Select File");
		const pathPickerPlaceholder = computed(() => pathPickerMode.value === "directory" ? "Type a path (../ etc). Tab to complete. Enter selects a directory." : "Type a path (../ etc). Tab to complete. Enter selects a file.");
		watch(focusFiles, (next) => {
			store.setFocusFiles(next);
		});
		const showDevRoutes = computed(() => {
			if (!isNodeLike()) return true;
			const env = store.state.context?.env ?? {};
			return String(env.DIMCODE_DEV_ROUTES ?? "").trim() === "1";
		});
		const commands = computed(() => {
			const base = [{
				label: "Chat",
				detail: "Open chat",
				run: () => go("chat")
			}];
			if (showDevRoutes.value) base.push({
				label: "CLI",
				detail: "CLI parity harness",
				run: () => go("cli")
			}, {
				label: "Isolation",
				detail: "Layout isolation + overlay correctness",
				run: () => go("isolation")
			}, {
				label: "Dialog",
				detail: "Dialog focus / blur / close behavior",
				run: () => go("dialog")
			}, {
				label: "IME",
				detail: "IME reproduction + event timeline",
				run: () => go("ime")
			}, {
				label: "Z-Index Stress",
				detail: "Overlay stacking stress test",
				run: () => go("zindex")
			});
			base.push({
				label: "Sessions",
				detail: "Pick or create a session (/sessions)",
				run: () => void openSessionsDialog()
			}, {
				label: "Settings",
				detail: "Model + API (/settings, Ctrl+K)",
				run: () => openConfig()
			});
			return base;
		});
		const commandOptions = computed(() => commands.value.map((c) => ({
			label: c.label,
			detail: c.detail
		})));
		const chromeStyle = computed(() => ({
			fg: "whiteBright",
			bg: "black"
		}));
		const mutedStyle = computed(() => ({
			fg: "white",
			dim: true,
			bg: "black"
		}));
		const panelFillStyle = computed(() => ({
			fg: "whiteBright",
			bg: "blackBright"
		}));
		const inputStyle = computed(() => ({
			fg: "whiteBright",
			bg: "blackBright"
		}));
		const accentBarStyle = computed(() => ({
			fg: "blueBright",
			bg: "blackBright"
		}));
		const bigLogo = computed(() => cols.value >= 70 && rows.value >= 26);
		const logoLetterGap = computed(() => bigLogo.value ? 1 : 0);
		const logoWordGap = computed(() => bigLogo.value ? 2 : 1);
		const openLogoLines = computed(() => bigLogo.value ? renderBigWord("goat", logoLetterGap.value) : ["goat"]);
		const logoH = computed(() => bigLogo.value ? BIG_LOGO_H : 1);
		const openLogoW = computed(() => textCellWidth$2(openLogoLines.value[0] ?? ""));
		const logoW = computed(() => openLogoW.value + logoWordGap.value);
		const logoX = computed(() => Math.max(0, Math.floor((cols.value - logoW.value) / 2)));
		const panelW = computed(() => {
			const c = Math.max(0, Math.floor(cols.value));
			if (c <= 0) return 0;
			const min = Math.min(44, c);
			const max = Math.max(min, c - 8);
			return clamp$1(Math.floor(c * .72), min, max);
		});
		const panelX = computed(() => Math.max(0, Math.floor((cols.value - panelW.value) / 2)));
		const contentPadX = 2;
		const inputX = computed(() => panelX.value + 1 + contentPadX);
		const contentW = computed(() => Math.max(0, panelW.value - 1 - contentPadX));
		const inputInnerW = computed(() => Math.max(1, contentW.value));
		const inputLineCount = computed(() => {
			if (!input.value) return 1;
			const w = inputInnerW.value;
			if (w <= 0) return 1;
			return Math.max(1, wrapByCells$1(input.value, w).length);
		});
		const inputH = computed(() => clamp$1(inputLineCount.value, 1, 7));
		const panelPadY = 1;
		const panelGapY = 1;
		const panelH = computed(() => panelPadY + inputH.value + panelGapY + 1 + panelPadY);
		const footerH = 2;
		const logoY = computed(() => {
			const maxY = Math.max(1, rows.value - footerH - logoH.value - panelH.value - 3);
			return clamp$1(Math.floor(rows.value * .32), 1, maxY);
		});
		const panelTopY = computed(() => logoY.value + logoH.value + 4);
		const panelBottomY = computed(() => panelTopY.value + panelH.value - 1);
		const panelInnerY = computed(() => panelTopY.value + panelPadY);
		const modelRowY = computed(() => panelInnerY.value + inputH.value + panelGapY);
		const accentText = computed(() => Array.from({ length: Math.max(0, panelH.value) }, () => "┃").join("\n"));
		const showConfig = ref(false);
		const modelId = ref("");
		const temperature = ref("");
		const baseUrl = ref("");
		const apiKeyDraft = ref("");
		function maskApiKey(v) {
			const s = String(v ?? "").trim();
			if (!s) return "";
			const tail = s.slice(-4);
			return `***${tail || "****"}`;
		}
		const apiKeyMasked = computed(() => {
			const env = store.state.context?.env ?? {};
			return maskApiKey(env.OPENAI_API_KEY);
		});
		async function refreshSessions(opts = {}) {
			const api = sessionsApi;
			if (!api) {
				sessionsList.value = [];
				sessionsIndex.value = 0;
				return;
			}
			sessionsLoading.value = true;
			try {
				const list = await api.list();
				sessionsList.value = list.slice();
				const max = Math.max(0, sessionsList.value.length - 1);
				let idx = -1;
				if (opts.preferId) idx = sessionsList.value.findIndex((s) => s.id === opts.preferId);
				if (idx < 0 && typeof opts.preferIndex === "number") idx = clamp$1(opts.preferIndex, 0, max);
				if (idx < 0) {
					const curId = String(store.state.sessionId ?? "");
					idx = sessionsList.value.findIndex((s) => s.id === curId);
				}
				sessionsIndex.value = idx >= 0 ? idx : 0;
			} catch {
				sessionsList.value = [];
				sessionsIndex.value = 0;
			} finally {
				sessionsLoading.value = false;
			}
		}
		async function openSessionsDialog() {
			if (!sessionsApi) {
				input.value = "";
				return;
			}
			sessionsDeleteArmed.value = false;
			showSessions.value = true;
			await refreshSessions();
		}
		async function createNewSession() {
			if (!sessionsApi) {
				input.value = "";
				return;
			}
			await sessionsApi.createNew();
		}
		function openConfig() {
			showConfig.value = true;
			modelId.value = String(store.state.config.model ?? "").trim() || "deepseek-v3.1";
			temperature.value = String(store.state.config.temperature ?? "");
			const env = store.state.context?.env ?? {};
			baseUrl.value = String(env.DIMCODE_OPENAI_BASE_URL || env.OPENAI_BASE_URL || "");
			apiKeyDraft.value = "";
		}
		function closeConfig() {
			showConfig.value = false;
		}
		function applyConfig() {
			const nextModel = modelId.value.trim();
			if (nextModel) store.state.config.model = nextModel;
			const t = Number.parseFloat(temperature.value);
			store.state.config.temperature = Number.isFinite(t) ? t : store.state.config.temperature;
			store.setEnvVar("DIMCODE_MODEL", store.state.config.model);
			store.setEnvVar("DIMCODE_TEMPERATURE", String(store.state.config.temperature ?? ""));
			store.setEnvVar("DIMCODE_OPENAI_BASE_URL", baseUrl.value.trim() || void 0);
			const nextKey = apiKeyDraft.value.trim();
			if (nextKey) store.setEnvVar("OPENAI_API_KEY", nextKey);
			if (isNodeLike()) {
				if (process.env) {
					process.env.DIMCODE_MODEL = store.state.config.model;
					process.env.DIMCODE_TEMPERATURE = String(store.state.config.temperature ?? "");
					const nextBaseUrl = baseUrl.value.trim();
					if (nextBaseUrl) process.env.DIMCODE_OPENAI_BASE_URL = nextBaseUrl;
					else delete process.env.DIMCODE_OPENAI_BASE_URL;
					if (nextKey) process.env.OPENAI_API_KEY = nextKey;
				}
			}
			apiKeyDraft.value = "";
			closeConfig();
		}
		const modelInfo = computed(() => {
			const model = String(store.state.config.model ?? "model");
			return {
				build: "■",
				label: model
			};
		});
		const modeLabel = computed(() => uiMode.value);
		const hintGap = "   ";
		const hintKey1 = computed(() => "tab");
		const hintLabel1 = computed(() => "mode");
		const hintKey2 = computed(() => "ctrl+p");
		const hintLabel2 = computed(() => "commands");
		const hintW = computed(() => {
			return textCellWidth$2(hintKey1.value) + 1 + textCellWidth$2(hintLabel1.value) + textCellWidth$2(hintGap) + textCellWidth$2(hintKey2.value) + 1 + textCellWidth$2(hintLabel2.value);
		});
		const hintX = computed(() => {
			const w = hintW.value;
			if (w <= 0) return 0;
			const prefer = panelX.value + panelW.value - w;
			const maxX = Math.max(0, cols.value - w);
			return clamp$1(prefer, 0, maxX);
		});
		const hintY = computed(() => panelBottomY.value + 2);
		const showHints = computed(() => hintY.value >= 0 && hintY.value <= rows.value - footerH - 1 && hintX.value + hintW.value <= cols.value);
		const footerLeft = computed(() => {
			const cwd = String(store.state.context?.cwd ?? ".");
			if (!isNodeLike()) return cwd;
			return tildifyPath(resolveUserPath(getProcessCwd(), cwd));
		});
		const footerRight = computed(() => {
			const env = store.state.context?.env ?? {};
			const v = env.DIMCODE_VERSION || env.VUE_TERMINAL_VERSION;
			return v ? `v${v}` : "";
		});
		function go(name) {
			router.push(name);
		}
		function setContextCwd(absDir) {
			store.setCwd(absDir);
		}
		async function submit() {
			const text = input.value.trim();
			if (!text) {
				go("chat");
				return;
			}
			if (text === "/settings" || text === "/config") {
				openConfig();
				input.value = "";
				return;
			}
			if (text === "/sessions") {
				await openSessionsDialog();
				input.value = "";
				return;
			}
			if (text === "/new") {
				await createNewSession();
				input.value = "";
				return;
			}
			input.value = "";
			go("chat");
			const files = focusFiles.value;
			if (files.length > 0) store.sendUserInput({
				content: text,
				focusFiles: files
			});
			else store.sendUser(text);
			focusFiles.value = [];
			store.setFocusFiles([]);
		}
		function openCommandPalette() {
			showCommands.value = true;
			commandIndex.value = 0;
		}
		function closeCommandPalette() {
			showCommands.value = false;
		}
		function onInputKeydown(e) {
			if (e?.ctrlKey && (e?.key === "p" || e?.key === "P")) {
				e?.preventDefault?.();
				openCommandPalette();
				return;
			}
			if (e?.ctrlKey && (e?.key === "k" || e?.key === "K")) {
				e?.preventDefault?.();
				openConfig();
				return;
			}
			if (e?.key === "Tab" && !input.value) {
				e?.preventDefault?.();
				cycleUiMode(e.shiftKey ? -1 : 1);
				return;
			}
			if (e?.key === "Escape") {
				e?.preventDefault?.();
				input.value = "";
			}
		}
		function onCommandSelect(v) {
			closeCommandPalette();
			if (!v) return;
			const cmd = commands.value.find((c) => c.label === v);
			cmd?.run();
		}
		return () => h(TView$1, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			zIndex: 0,
			focusable: false
		}, () => [
			h(TText$1, {
				key: "bg",
				x: 0,
				y: 0,
				w: cols.value,
				h: rows.value,
				value: "",
				style: chromeStyle.value,
				zIndex: -100
			}),
			h(TText$1, {
				key: "logo-shadow-open",
				x: logoX.value + 1,
				y: logoY.value + 1,
				value: openLogoLines.value.join("\n"),
				style: {
					fg: "blackBright",
					dim: true,
					bg: "black"
				},
				zIndex: -70
			}),
			h(TText$1, {
				key: "logo-open",
				x: logoX.value,
				y: logoY.value,
				value: openLogoLines.value.join("\n"),
				style: {
					fg: "white",
					dim: true,
					bold: true,
					bg: "black"
				},
				zIndex: -60
			}),
			h(TText$1, {
				key: "panel-fill",
				x: panelX.value,
				y: panelTopY.value,
				w: panelW.value,
				h: panelH.value,
				value: "",
				style: panelFillStyle.value,
				zIndex: -20
			}),
			h(TText$1, {
				key: "panel-accent",
				x: panelX.value,
				y: panelTopY.value,
				w: 1,
				h: panelH.value,
				value: accentText.value,
				style: accentBarStyle.value,
				zIndex: -19
			}),
			h(TInput$1, {
				"key": "prompt-input",
				"x": inputX.value,
				"y": panelInnerY.value,
				"w": contentW.value,
				"h": inputH.value,
				"modelValue": input.value,
				"onUpdate:modelValue": (v) => input.value = v,
				"autoFocus": !showPathPicker.value && !showSessions.value && !showCommands.value && !showConfig.value,
				"cursorShape": "bar",
				"cursorBlink": false,
				"placeholder": "Ask anything... \"Fix broken tests\"",
				"placeholderWhenFocused": true,
				"style": inputStyle.value,
				"plugins": [promptMentionPlugin],
				"promptSuggestions": promptSuggestions,
				"mentionWorkspace": isNodeLike() ? pickerWorkspace.value : "",
				"mentionMode": "any",
				"collectMentions": true,
				"mentions": focusFiles.value,
				"onUpdate:mentions": (v) => focusFiles.value = [...v],
				"onMentionClick": (absPath) => {
					if (!isNodeLike()) return;
					showPathPicker.value = true;
					pathPickerMode.value = "file";
					pathPickerQuery.value = absPath;
					pathPickerError.value = null;
				},
				"onChange": () => void submit(),
				"onKeydown": (e) => onInputKeydown(e),
				"zIndex": -10
			}),
			(() => {
				const rowY = modelRowY.value;
				const chip = modelInfo.value.build;
				const label = modelInfo.value.label;
				const chipW = textCellWidth$2(chip);
				const labelW = textCellWidth$2(label);
				const totalW = chipW + 1 + labelW;
				const rightPad = 2;
				const startX = inputX.value + Math.max(0, inputInnerW.value - totalW - rightPad);
				const statusW = Math.max(0, startX - inputX.value - 1);
				const nodes = [];
				if (statusW > 0) {
					const mode = modeLabel.value;
					const modeTag = ` ${mode.toUpperCase()} `;
					const modeBg = mode === "chat" ? "blueBright" : mode === "plan" ? "magentaBright" : "greenBright";
					const modeW = Math.min(statusW, textCellWidth$2(modeTag));
					nodes.push(h(TText$1, {
						key: "panel-mode",
						x: inputX.value,
						y: rowY,
						w: modeW,
						value: modeTag,
						style: {
							fg: "black",
							bg: modeBg,
							bold: true
						},
						zIndex: -18
					}));
				}
				nodes.push(h(TText$1, {
					key: "model-chip",
					x: startX,
					y: rowY,
					value: chip,
					style: {
						fg: "blueBright",
						bold: true,
						bg: "blackBright"
					},
					zIndex: -18
				}));
				nodes.push(h(TText$1, {
					key: "model-label",
					x: startX + chipW + 1,
					y: rowY,
					w: Math.max(0, inputX.value + inputInnerW.value - (startX + chipW + 1)),
					value: label,
					style: {
						fg: "whiteBright",
						dim: true,
						bg: "blackBright"
					},
					zIndex: -18
				}));
				return nodes;
			})(),
			showHints.value ? [
				h(TText$1, {
					key: "hints-bg",
					x: hintX.value,
					y: hintY.value,
					w: hintW.value,
					value: "",
					style: { bg: "black" },
					zIndex: 4
				}),
				h(TText$1, {
					key: "hints-key1",
					x: hintX.value,
					y: hintY.value,
					value: hintKey1.value,
					style: {
						fg: "whiteBright",
						bold: true,
						bg: "black"
					},
					clear: false,
					zIndex: 5
				}),
				h(TText$1, {
					key: "hints-label1",
					x: hintX.value + textCellWidth$2(hintKey1.value) + 1,
					y: hintY.value,
					value: hintLabel1.value,
					style: {
						fg: "white",
						dim: true,
						bg: "black"
					},
					clear: false,
					zIndex: 5
				}),
				h(TText$1, {
					key: "hints-key2",
					x: hintX.value + textCellWidth$2(hintKey1.value) + 1 + textCellWidth$2(hintLabel1.value) + textCellWidth$2(hintGap),
					y: hintY.value,
					value: hintKey2.value,
					style: {
						fg: "whiteBright",
						bold: true,
						bg: "black"
					},
					clear: false,
					zIndex: 5
				}),
				h(TText$1, {
					key: "hints-label2",
					x: hintX.value + textCellWidth$2(hintKey1.value) + 1 + textCellWidth$2(hintLabel1.value) + textCellWidth$2(hintGap) + textCellWidth$2(hintKey2.value) + 1,
					y: hintY.value,
					value: hintLabel2.value,
					style: {
						fg: "white",
						dim: true,
						bg: "black"
					},
					clear: false,
					zIndex: 5
				})
			] : null,
			rows.value > 0 ? h(TText$1, {
				key: "footer-bg",
				x: 0,
				y: rows.value - footerH,
				w: cols.value,
				value: "",
				style: chromeStyle.value,
				zIndex: 20
			}) : null,
			rows.value > 0 ? h(TText$1, {
				key: "footer-left",
				x: 2,
				y: rows.value - footerH,
				w: Math.max(0, cols.value - 4),
				value: `cwd ${footerLeft.value}`,
				style: mutedStyle.value,
				clear: false,
				zIndex: 21
			}) : null,
			rows.value > 0 && footerRight.value ? h(TText$1, {
				key: "footer-right",
				x: Math.max(2, cols.value - 2 - textCellWidth$2(footerRight.value)),
				y: rows.value - footerH,
				value: footerRight.value,
				style: mutedStyle.value,
				clear: false,
				zIndex: 21
			}) : null,
			h(GoatChainCommandPalette, {
				"modelValue": showCommands.value,
				"onUpdate:modelValue": (v) => showCommands.value = v,
				"title": "Commands",
				"options": commandOptions.value,
				"selectedIndex": commandIndex.value,
				"onUpdate:selectedIndex": (v) => commandIndex.value = v,
				"onSelect": (v) => onCommandSelect(v),
				"onClose": closeCommandPalette
			}),
			h(GoatChainPathPickerDialog, {
				"modelValue": showPathPicker.value,
				"onUpdate:modelValue": (v) => showPathPicker.value = v,
				"w": pickerW.value,
				"h": pickerH.value,
				"title": pathPickerTitle.value,
				"workspace": pickerWorkspace.value,
				"mode": pathPickerMode.value,
				"query": pathPickerQuery.value,
				"onUpdate:query": (v) => pathPickerQuery.value = v,
				"placeholder": pathPickerPlaceholder.value,
				"onInvalid": (reason) => pathPickerError.value = reason,
				"onSelect": (absPath) => {
					pathPickerError.value = null;
					showPathPicker.value = false;
					if (pathPickerMode.value === "directory") setContextCwd(absPath);
					else if (!focusFiles.value.includes(absPath)) focusFiles.value = [...focusFiles.value, absPath];
					pathPickerQuery.value = "";
				},
				"onClose": () => {
					showPathPicker.value = false;
					pathPickerQuery.value = "";
					pathPickerError.value = null;
				}
			}),
			h(GoatChainSessionsDialog, {
				"modelValue": showSessions.value,
				"onUpdate:modelValue": (v) => {
					showSessions.value = v;
					if (!v) sessionsDeleteArmed.value = false;
				},
				"loading": sessionsLoading.value,
				"deleteArmed": sessionsDeleteArmed.value,
				"sessions": sessionsList.value,
				"selectedIndex": sessionsIndex.value,
				"onUpdate:selectedIndex": (v) => {
					sessionsIndex.value = v;
					sessionsDeleteArmed.value = false;
				},
				"onOpen": async () => {
					const api = sessionsApi;
					const picked = sessionsList.value[sessionsIndex.value];
					if (!api || !picked) return;
					await api.use(picked.id);
					showSessions.value = false;
					sessionsDeleteArmed.value = false;
					go("chat");
				},
				"onNew": async () => {
					const api = sessionsApi;
					if (!api) return;
					await api.createNew();
					showSessions.value = false;
					sessionsDeleteArmed.value = false;
				},
				"onDelete": async () => {
					const api = sessionsApi;
					const picked = sessionsList.value[sessionsIndex.value];
					if (!api || !picked) return;
					const prevIndex = sessionsIndex.value;
					if (!sessionsDeleteArmed.value) {
						sessionsDeleteArmed.value = true;
						return;
					}
					sessionsDeleteArmed.value = false;
					await api.delete(picked.id);
					await refreshSessions({ preferIndex: prevIndex });
				},
				"onRefresh": async () => {
					sessionsDeleteArmed.value = false;
					await refreshSessions();
				}
			}),
			h(GoatChainConfigDialog, {
				"modelValue": showConfig.value,
				"onUpdate:modelValue": (v) => showConfig.value = v,
				"w": clamp$1(Math.floor(cols.value * .78), 56, 84),
				"h": clamp$1(24, 18, Math.max(18, rows.value - 4)),
				"modelId": modelId.value,
				"onUpdate:modelId": (v) => modelId.value = v,
				"temperature": temperature.value,
				"onUpdate:temperature": (v) => temperature.value = v,
				"baseUrl": baseUrl.value,
				"onUpdate:baseUrl": (v) => baseUrl.value = v,
				"apiKeyDraft": apiKeyDraft.value,
				"onUpdate:apiKeyDraft": (v) => apiKeyDraft.value = v,
				"apiKeyMasked": apiKeyMasked.value,
				"onApply": applyConfig,
				"onCancel": closeConfig
			})
		]);
	}
});

//#endregion
//#region src/pages/ImePage.ts
const GoatChainImePage = defineComponent({
	name: "GoatChainImePage",
	setup() {
		const router = useRouter();
		const layout = useLayout();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const value = ref("");
		const debug = ref(false);
		const w = computed(() => Math.max(0, cols.value - 4));
		const hBox = computed(() => Math.max(0, rows.value - 4));
		function back() {
			router.back();
		}
		function toggleDebug() {
			debug.value = !debug.value;
			globalThis.__VT_DEBUG_IME__ = debug.value;
		}
		return () => h(TBox, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			border: true,
			title: "IME",
			padding: 1,
			style: {
				fg: "blueBright",
				bg: "black"
			}
		}, () => [
			h(TView, {
				x: 0,
				y: 0,
				w: cols.value - 2,
				h: rows.value - 2,
				onKeydownCapture: (e) => {
					if (e.key === "Escape") back();
				}
			}),
			h(TText, {
				x: 0,
				y: 0,
				w: cols.value - 4,
				value: "Esc: back • Toggle debug to show textarea + timeline overlay",
				style: {
					fg: "whiteBright",
					bg: "blackBright"
				}
			}),
			h(TView, {
				x: 0,
				y: 2,
				w: 22,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: back,
				onKeydown: (e) => {
					if (e.key === "Enter") back();
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: "[ Back ]",
				style: {
					fg: "greenBright",
					bold: true
				}
			})),
			h(TView, {
				x: 24,
				y: 2,
				w: 30,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: toggleDebug,
				onKeydown: (e) => {
					if (e.key === "Enter") toggleDebug();
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: `[ IME debug: ${debug.value ? "ON" : "OFF"} ]`,
				style: {
					fg: "yellowBright",
					bold: true
				}
			})),
			h(TBox, {
				x: 0,
				y: 4,
				w: w.value,
				h: hBox.value,
				border: true,
				title: "Input",
				padding: 1,
				style: {
					fg: "magentaBright",
					bg: "blackBright"
				}
			}, () => [
				h(TText, {
					x: 0,
					y: 0,
					w: w.value - 4,
					value: "Type with IME (e.g. Chinese) and confirm candidates.",
					style: {
						dim: true,
						bg: "blackBright"
					}
				}),
				h(TInput, {
					"x": 0,
					"y": 2,
					"w": w.value - 4,
					"h": 3,
					"modelValue": value.value,
					"onUpdate:modelValue": (v) => value.value = v,
					"autoFocus": true,
					"placeholder": "IME here…",
					"style": {
						fg: "whiteBright",
						bg: "blackBright"
					}
				}),
				h(TText, {
					x: 0,
					y: 6,
					w: w.value - 4,
					h: Math.max(1, hBox.value - 9),
					wrap: true,
					value: `Value:\n${value.value}`,
					style: { bg: "blackBright" }
				})
			])
		]);
	}
});

//#endregion
//#region src/pages/IsolationPage.ts
const GoatChainIsolationPage = defineComponent({
	name: "GoatChainIsolationPage",
	setup() {
		const router = useRouter();
		const layout = useLayout();
		const { terminal } = useTerminal();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const contentW = computed(() => Math.max(0, cols.value - 2));
		const contentH = computed(() => Math.max(0, rows.value - 2));
		const topH = 2;
		const mainY = topH;
		const mainH = computed(() => Math.max(0, contentH.value - topH));
		const leftW = computed(() => {
			const maxLeft = Math.max(0, contentW.value - 1);
			const desired = Math.max(18, Math.floor(contentW.value * .5));
			return Math.min(desired, maxLeft);
		});
		const rightW = computed(() => Math.max(0, contentW.value - leftW.value - 1));
		const rightX = computed(() => leftW.value + 1);
		const tick = ref(0);
		const overlayOpen = ref(false);
		const resized = ref(false);
		const staticLeftLines = [
			"Left panel should stay stable.",
			"Right panel updates frequently.",
			"Overlay should not cover left.",
			"Resize should keep clip/borders."
		];
		function bumpTick() {
			tick.value += 1;
		}
		function toggleOverlay() {
			overlayOpen.value = !overlayOpen.value;
		}
		function toggleResize() {
			resized.value = !resized.value;
			if (resized.value) terminal.resize(Math.max(40, cols.value - 20), Math.max(12, rows.value - 8));
			else terminal.resize(92, 28);
		}
		function back() {
			router.back();
		}
		return () => h(TBox, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			border: true,
			title: "Isolation",
			padding: 0,
			style: {
				fg: "blueBright",
				bg: "black"
			}
		}, () => [
			h(TText, {
				x: 0,
				y: 0,
				w: contentW.value,
				value: "Esc: back • Tick+ / overlay / resize to validate isolation",
				style: {
					fg: "whiteBright",
					bg: "blackBright"
				}
			}),
			h(TView, {
				x: 0,
				y: 1,
				w: contentW.value,
				h: 1,
				zIndex: 10
			}, () => [
				h(TView, {
					x: 0,
					y: 0,
					w: 18,
					h: 1,
					zIndex: 20,
					focusable: true,
					onClick: back,
					onKeydown: (e) => {
						if (e.key === "Enter" || e.key === "Escape") back();
					}
				}, () => h(TText, {
					x: 0,
					y: 0,
					w: 18,
					value: "[ Back ]",
					style: {
						fg: "greenBright",
						bold: true
					}
				})),
				h(TView, {
					x: 20,
					y: 0,
					w: 18,
					h: 1,
					zIndex: 20,
					focusable: true,
					onClick: toggleOverlay,
					onKeydown: (e) => {
						if (e.key === "Enter") toggleOverlay();
					}
				}, () => h(TText, {
					x: 0,
					y: 0,
					w: 18,
					value: overlayOpen.value ? "[ Close Overlay ]" : "[ Open Overlay ]",
					style: {
						fg: "yellowBright",
						bold: true
					}
				})),
				h(TView, {
					x: 40,
					y: 0,
					w: 16,
					h: 1,
					zIndex: 20,
					focusable: true,
					onClick: toggleResize,
					onKeydown: (e) => {
						if (e.key === "Enter") toggleResize();
					}
				}, () => h(TText, {
					x: 0,
					y: 0,
					w: 16,
					value: resized.value ? "[ Reset Size ]" : "[ Resize ]",
					style: {
						fg: "magentaBright",
						bold: true
					}
				})),
				h(TView, {
					x: 58,
					y: 0,
					w: 10,
					h: 1,
					zIndex: 20,
					focusable: true,
					onClick: bumpTick,
					onKeydown: (e) => {
						if (e.key === "Enter") bumpTick();
					}
				}, () => h(TText, {
					x: 0,
					y: 0,
					w: 10,
					value: "[ Tick+ ]",
					style: {
						fg: "yellowBright",
						bold: true
					}
				}))
			]),
			h(TBox, {
				x: 0,
				y: mainY,
				w: leftW.value,
				h: mainH.value,
				border: true,
				title: "Left",
				padding: 1,
				style: {
					fg: "greenBright",
					bg: "blackBright"
				}
			}, () => [...staticLeftLines.map((line, i) => h(TText, {
				key: `l${i}`,
				x: 0,
				y: i,
				w: Math.max(0, leftW.value - 4),
				value: line,
				style: { fg: "whiteBright" }
			})), h(TText, {
				x: 0,
				y: staticLeftLines.length + 2,
				w: Math.max(0, leftW.value - 4),
				value: "Hash anchor: VT_LEFT",
				style: {
					fg: "blueBright",
					bold: true
				}
			})]),
			h(TBox, {
				x: rightX.value,
				y: mainY,
				w: rightW.value,
				h: mainH.value,
				border: true,
				title: "Right",
				padding: 1,
				style: {
					fg: "yellowBright",
					bg: "blackBright"
				}
			}, () => [
				h(TText, {
					x: 0,
					y: 0,
					w: Math.max(0, rightW.value - 4),
					value: `tick=${tick.value}`,
					style: { fg: "yellowBright" }
				}),
				h(TText, {
					x: 0,
					y: 1,
					w: Math.max(0, rightW.value - 4),
					value: "Right updates should not corrupt left.",
					style: { fg: "blueBright" }
				}),
				h(TText, {
					x: 0,
					y: 3,
					w: Math.max(0, rightW.value - 4),
					value: "Overlay opens/closes repeatedly.",
					style: { fg: "whiteBright" }
				})
			]),
			overlayOpen.value ? h(TView, {
				x: rightX.value,
				y: mainY,
				w: rightW.value,
				h: mainH.value,
				zIndex: 500,
				focusable: true,
				onClick: toggleOverlay
			}, () => h(TBox, {
				x: Math.min(2, Math.max(0, rightW.value - 2)),
				y: 2,
				w: Math.max(0, Math.min(rightW.value, Math.max(10, rightW.value - 6))),
				h: Math.min(8, Math.max(6, mainH.value - 4)),
				border: true,
				title: "Overlay",
				padding: 1,
				style: {
					fg: "magentaBright",
					bg: "blackBright"
				}
			}, () => [h(TText, {
				x: 0,
				y: 0,
				w: Math.max(0, Math.min(rightW.value, Math.max(10, rightW.value - 6)) - 4),
				value: "Overlay covers right only.",
				style: {
					fg: "magentaBright",
					bold: true
				}
			}), h(TText, {
				x: 0,
				y: 2,
				w: Math.max(0, Math.min(rightW.value, Math.max(10, rightW.value - 6)) - 4),
				value: "Click to close.",
				style: { fg: "whiteBright" }
			})])) : null
		]);
	}
});

//#endregion
//#region src/core/acp-events.ts
/**
* ACP-style streaming event "types" are encoded on `ACPMessage.metadata.originalEventType`.
*
* Notes:
* - This is intentionally compatible with GoatChain's streaming events.
* - `tool_call_delta` is represented as an assistant message with empty `content`,
*   plus metadata fields so clients can render an in-place preview.
*/
const ACPEventTypes = [
	"iteration_start",
	"text_delta",
	"thinking_start",
	"thinking_delta",
	"thinking_end",
	"tool_call_start",
	"tool_call_delta",
	"tool_call_end",
	"tool_result",
	"tool_approval_requested",
	"requires_action",
	"tool_skipped",
	"iteration_end",
	"done",
	"error"
];
function getOriginalEventType(msg) {
	const t = msg?.metadata?.originalEventType;
	return ACPEventTypes.includes(t) ? t : null;
}

//#endregion
//#region src/core/agents/mock.ts
function createMockGoatChainAgent(options) {
	const { id: id$1 } = options;
	function lastUserText(messages) {
		const last = [...messages].reverse().find((m) => m.role === "user");
		const raw = typeof last?.content === "string" ? last.content : "";
		return normalizeText(raw);
	}
	function parseSlashTool(text) {
		const trimmed = text.trim();
		if (!trimmed.startsWith("/")) return null;
		const [, nameRaw, ...rest] = trimmed.split(" ");
		const name = (nameRaw || "").trim();
		const body = rest.join(" ").trim();
		if (name === "bash") return {
			name: "bash",
			arguments: { command: body }
		};
		if (name === "grep") {
			const [pattern, path = "."] = body.split(" ");
			return {
				name: "grep",
				arguments: {
					pattern: pattern || "",
					path
				}
			};
		}
		if (name === "search") return {
			name: "search",
			arguments: { query: body }
		};
		return null;
	}
	async function* streamToolCall(callId, toolName, args) {
		const argsText = safeJson(args);
		const chunks = [];
		for (let i = 0; i < argsText.length; i += 12) chunks.push(argsText.slice(i, i + 12));
		for (const argsTextDelta of chunks) yield {
			role: "assistant",
			content: "",
			metadata: {
				originalEventType: "tool_call_delta",
				callId,
				toolName,
				argsTextDelta
			}
		};
	}
	return { async *receiveMessage(messages) {
		const userText = lastUserText(messages);
		const tool = parseSlashTool(userText);
		const callId = id$1("call");
		yield {
			role: "assistant",
			content: `# GoatChain (mock)\n\nYou said: **${normalizeText(userText).replace(/\n/g, " ")}**\n`,
			metadata: { originalEventType: "text_delta" }
		};
		const toolName = tool?.name ?? "search";
		const args = tool?.arguments ?? { query: userText.slice(0, 120) };
		yield* streamToolCall(callId, toolName, args);
		yield {
			role: "assistant",
			content: "",
			tool_calls: [{
				id: callId,
				type: "function",
				function: {
					name: toolName,
					arguments: args
				}
			}],
			metadata: { originalEventType: "tool_call_end" }
		};
		yield {
			role: "assistant",
			content: "",
			metadata: {
				done: true,
				stopReason: "final_response",
				originalEventType: "done"
			}
		};
	} };
}

//#endregion
//#region src/core/syntax-highlight.ts
const DEFAULT_THEME = "github-dark";
function normalizePathBasename(filePath) {
	const s = String(filePath ?? "").replace(/\\/g, "/");
	const parts = s.split("/").filter(Boolean);
	return (parts[parts.length - 1] ?? "").trim();
}
function guessLanguageFromFilePath(filePath) {
	const base = normalizePathBasename(filePath).toLowerCase();
	if (!base) return null;
	if (base === "dockerfile") return "dockerfile";
	if (base === "makefile") return "make";
	if (base.endsWith(".d.ts")) return "ts";
	const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
	switch (ext) {
		case "ts": return "ts";
		case "tsx": return "tsx";
		case "js": return "js";
		case "jsx": return "jsx";
		case "mjs": return "js";
		case "cjs": return "js";
		case "json": return "json";
		case "jsonc": return "jsonc";
		case "md": return "md";
		case "vue": return "vue";
		case "html": return "html";
		case "css": return "css";
		case "scss": return "scss";
		case "less": return "less";
		case "yml": return "yaml";
		case "yaml": return "yaml";
		case "toml": return "toml";
		case "xml": return "xml";
		case "sql": return "sql";
		case "sh": return "bash";
		case "bash": return "bash";
		case "zsh": return "bash";
		case "fish": return "fish";
		case "py": return "python";
		case "go": return "go";
		case "rs": return "rust";
		case "c": return "c";
		case "cc": return "cpp";
		case "cpp": return "cpp";
		case "h": return "cpp";
		case "hpp": return "cpp";
		case "java": return "java";
		case "kt": return "kotlin";
		case "swift": return "swift";
		case "rb": return "ruby";
		case "php": return "php";
		case "diff": return "diff";
		case "patch": return "diff";
		case "graphql": return "graphql";
		case "gql": return "graphql";
		default: return "text";
	}
}
function hexToRgb(hex) {
	const s = String(hex ?? "").trim();
	const m = s.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
	if (!m) return null;
	const v = m[1];
	const r = Number.parseInt(v.slice(0, 2), 16);
	const g = Number.parseInt(v.slice(2, 4), 16);
	const b = Number.parseInt(v.slice(4, 6), 16);
	return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? {
		r,
		g,
		b
	} : null;
}
function sgr(codes) {
	return `\u001B[${codes.join(";")}m`;
}
function fgRgb(rgb) {
	return sgr([
		38,
		2,
		rgb.r,
		rgb.g,
		rgb.b
	]);
}
function styleFromFontStyleBits(fontStyle) {
	const bits = Number(fontStyle ?? 0);
	const out = [];
	if (bits & 2) out.push(1);
	if (bits & 1) out.push(3);
	if (bits & 4) out.push(4);
	return out;
}
function truncateByLines(text, maxLines) {
	const lines = String(text ?? "").replace(/\r/g, "").split("\n");
	if (lines.length <= maxLines) return {
		text: lines.join("\n"),
		truncated: false
	};
	return {
		text: lines.slice(0, maxLines).join("\n"),
		truncated: true
	};
}
async function highlightCodePreviewToAnsi(opts) {
	const lang = String(opts.language ?? "").trim() || "text";
	const theme = String(opts.theme ?? DEFAULT_THEME).trim() || DEFAULT_THEME;
	const maxLines = Math.max(1, Math.floor(opts.maxLines ?? 24));
	const cut = truncateByLines(opts.code, maxLines);
	const code = cut.text;
	if (!code.trim()) return null;
	try {
		const shiki = await import("shiki");
		const codeToTokensBase = shiki.codeToTokensBase;
		const getSingletonHighlighter = shiki.getSingletonHighlighter;
		if (typeof codeToTokensBase !== "function" || typeof getSingletonHighlighter !== "function") return null;
		const tokenLines = await codeToTokensBase(code, {
			lang,
			theme
		});
		const highlighter = await getSingletonHighlighter();
		const themeReg = highlighter?.getTheme ? highlighter.getTheme(theme) : null;
		const defaultFg = String(themeReg?.fg ?? "#ffffff");
		const defaultRgb = hexToRgb(defaultFg) ?? {
			r: 255,
			g: 255,
			b: 255
		};
		let output = "";
		for (let i = 0; i < tokenLines.length; i++) {
			const line = tokenLines[i];
			for (const token of line) {
				const rgb = hexToRgb(token?.color) ?? defaultRgb;
				const codes = styleFromFontStyleBits(token?.fontStyle);
				output += fgRgb(rgb);
				if (codes.length) output += sgr(codes);
				output += String(token?.content ?? "");
				output += sgr([0]);
			}
			if (i < tokenLines.length - 1) output += "\n";
		}
		return output;
	} catch {
		return null;
	}
}

//#endregion
//#region src/core/store.ts
let nextId = 0;
function id(prefix) {
	return `${prefix}_${Date.now()}_${nextId++}`;
}
async function sleep(ms) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
function extractTextContent(content) {
	if (!content) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((item) => String(item?.text ?? "")).join("");
	return "";
}
function formatAgentErrorForUi(err) {
	if (!err) return "Unknown error.";
	if (err instanceof Error) return err.stack || err.message || String(err);
	if (typeof err === "string") return err.trim() ? err : "Unknown error.";
	if (typeof err === "object") {
		const msg = err?.message;
		if (typeof msg === "string" && msg.trim()) return msg.trim();
	}
	try {
		return safeJson(err);
	} catch {
		return String(err);
	}
}
function formatAgentErrorHintForUi(errText, env) {
	const hasKey = Boolean(String(env?.OPENAI_API_KEY ?? "").trim());
	const s = errText.toLowerCase();
	const maybeTokenLimit = s.includes("max_tokens") || s.includes("max tokens") || s.includes("context length") || s.includes("token") && s.includes("limit");
	if (maybeTokenLimit) return "Hint: increase `max_tokens` via `/settings` (or Ctrl+K), then retry.";
	const maybeMissingKey = !hasKey || s.includes("api key") || s.includes("openai_api_key") || s.includes("unauthorized") || s.includes("401");
	if (maybeMissingKey) return "Hint: set `OPENAI_API_KEY` via `/settings` (or Ctrl+K), then retry.";
	const maybeNetwork = s.includes("etimedout") || s.includes("timeout") || s.includes("econnreset") || s.includes("enotfound") || s.includes("fetch failed");
	if (maybeNetwork) return "Hint: check network / proxy / `DIMCODE_OPENAI_BASE_URL`, then retry.";
	return null;
}
function createGoatChainStore(opts) {
	const externalAgentProvided = Boolean(opts.agent);
	const initialEnv = opts.context?.env;
	const envStr = (k) => String(initialEnv?.[k] ?? "").trim();
	const envInt = (k) => {
		const s = envStr(k);
		if (!s) return void 0;
		const n = Number.parseInt(s, 10);
		return Number.isFinite(n) ? n : void 0;
	};
	const envFloat = (k) => {
		const s = envStr(k);
		if (!s) return void 0;
		const n = Number.parseFloat(s);
		return Number.isFinite(n) ? n : void 0;
	};
	const state = reactive({
		config: {
			model: envStr("DIMCODE_MODEL") || "deepseek-v3.1",
			temperature: envFloat("DIMCODE_TEMPERATURE") ?? .7
		},
		usage: {
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 0,
			budget: 4e3
		},
		runningAgentRound: false,
		thinking: {
			active: false,
			startedAt: null,
			endedAt: null
		},
		ui: { theme: {
			preset: "goatchain",
			overrides: {}
		} },
		context: opts.context,
		messages: [],
		revertedMessages: [],
		selectedToolCallId: null,
		runningToolCallId: null,
		sessionId: envStr("DIMCODE_SESSION_ID") || `gc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		paused: null,
		approval: {
			active: null,
			approvedToolCalls: {},
			pendingAutoRun: null,
			skipApproval: false
		}
	});
	const streamIdleTimeoutMs = envInt("DIMCODE_STREAM_IDLE_TIMEOUT_MS") ?? 30 * 6e4;
	const streamTotalTimeoutMs = envInt("DIMCODE_STREAM_TOTAL_TIMEOUT_MS") ?? 90 * 6e4;
	let activeAgentStream = null;
	let activeAgentAbort = null;
	function cancelActiveAgentStream() {
		const stream = activeAgentStream;
		activeAgentStream = null;
		if (!stream) return;
		try {
			stream.return?.();
		} catch {}
	}
	function createActiveAgentAbort() {
		let resolve = null;
		const promise = new Promise((r) => {
			resolve = r;
		});
		return {
			promise,
			resolve: () => resolve?.()
		};
	}
	function abortActiveAgentRound() {
		const abort = activeAgentAbort;
		activeAgentAbort = null;
		abort?.resolve();
	}
	const agent = opts.agent ?? createMockGoatChainAgent({ id });
	const usagePct = computed(() => {
		const budget = Math.max(1, state.usage.budget);
		return Math.min(1, state.usage.total_tokens / budget);
	});
	const tokenCounter = createCachedTokenCounter();
	const contextTokens = computed(() => {
		let tokens = tokenCounter.countTokens(state.context.system);
		const focusFiles = state.context.focusFiles;
		if (focusFiles?.length) {
			const links = focusFiles.map((f) => {
				const p = String(f ?? "");
				const name = p.split(/[/\\]/).filter(Boolean).pop() ?? p;
				return `- [${name}](${p})`;
			});
			tokens += tokenCounter.countTokens(`\n[focus_files]\n${links.join("\n")}\n`);
		}
		for (const m of state.messages) {
			if (m.role === "user") {
				if (m.focusFiles?.length) {
					const links = m.focusFiles.map((f) => {
						const p = String(f ?? "");
						const name = p.split(/[/\\]/).filter(Boolean).pop() ?? p;
						return `- [${name}](${p})`;
					});
					tokens += tokenCounter.countTokens(`\n[user_focus_files]\n${links.join("\n")}\n`);
				}
				tokens += tokenCounter.countTokens(`\n[user]\n${m.content}\n`);
				continue;
			}
			if (m.role === "tool") {
				tokens += tokenCounter.countTokens(`\n[tool]\n${m.result.output}\n`);
				continue;
			}
			let assistantText = "\n[assistant]\n";
			for (const p of m.parts) if (p.type === "status") assistantText += `${p.text}\n`;
			else if (p.type === "markdown") assistantText += `${p.markdown}\n`;
			else if (p.type === "tool_call") assistantText += `${p.call.name} ${safeJson(p.call.arguments)}\n`;
			else if (p.type === "tool_result") assistantText += `${p.result.output}\n`;
			else if (p.type === "approve") assistantText += `approve ${p.request.permission} ${p.request.tool} ${p.request.status}\n`;
			else if (p.type === "todo" || p.type === "plan") assistantText += `${p.title}\n${p.items.map((it) => `- ${it.done ? "[x]" : "[ ]"} ${it.text}`).join("\n")}\n`;
			tokens += tokenCounter.countTokens(assistantText);
		}
		return tokens;
	});
	const contextPct = computed(() => {
		const contextWindow = 128e3;
		return Math.min(1, contextTokens.value / contextWindow);
	});
	function updateUsage(promptDelta, completionDelta) {
		state.usage.prompt_tokens += promptDelta;
		state.usage.completion_tokens += completionDelta;
		state.usage.total_tokens = state.usage.prompt_tokens + state.usage.completion_tokens;
	}
	function setFocusFiles(files) {
		const ctx = state.context;
		const next = (files ?? []).map((f) => String(f ?? "")).filter(Boolean);
		state.context = {
			...ctx ?? {},
			focusFiles: next.length ? next : void 0
		};
	}
	function setCwd(cwd) {
		const ctx = state.context;
		const next = String(cwd ?? "").trim() || ".";
		state.context = {
			...ctx ?? {},
			cwd: next
		};
	}
	function setEnvVar(key, value) {
		const ctx = state.context;
		const prevEnv = { ...ctx?.env ?? {} };
		const k = String(key ?? "").trim();
		if (!k) return;
		const v = value == null ? "" : String(value);
		if (!v) delete prevEnv[k];
		else prevEnv[k] = v;
		state.context = {
			...ctx ?? {},
			env: prevEnv
		};
	}
	function setAgent(agentName) {
		setEnvVar("DIMCODE_AGENT", agentName);
	}
	function setThemePreset(preset) {
		state.ui.theme.preset = preset;
	}
	function setMessageTypeThemeOverride(type, colors) {
		const key = type;
		const prev = state.ui.theme.overrides ?? {};
		if (!colors || !colors.fg && !colors.bg) {
			const { [key]: _removed,...rest } = prev;
			state.ui.theme.overrides = rest;
			return;
		}
		state.ui.theme.overrides = {
			...prev,
			[key]: {
				fg: colors.fg,
				bg: colors.bg
			}
		};
	}
	function resetThemeOverrides() {
		state.ui.theme.overrides = {};
	}
	function pushMessage(m) {
		state.messages.push(m);
	}
	function replaceMessage(messageId, next) {
		const idx = state.messages.findIndex((m) => m.id === messageId);
		if (idx >= 0) state.messages[idx] = next;
	}
	function revertFromMessage(messageId) {
		const idx = state.messages.findIndex((m) => m.id === messageId);
		if (idx < 0) return 0;
		const removed = state.messages.splice(idx);
		state.revertedMessages = removed;
		return removed.length;
	}
	function restoreRevertedMessages() {
		if (state.revertedMessages.length === 0) return 0;
		const count = state.revertedMessages.length;
		state.messages.push(...state.revertedMessages);
		state.revertedMessages = [];
		return count;
	}
	function clearRevertedMessages() {
		state.revertedMessages = [];
	}
	const hasRevertedMessages = computed(() => state.revertedMessages.length > 0);
	const revertedMessageCount = computed(() => state.revertedMessages.length);
	function updateAssistant(messageId, fn) {
		const msg = state.messages.find((m) => m.id === messageId);
		if (!msg || msg.role !== "assistant") return;
		replaceMessage(messageId, fn(msg));
	}
	function setAssistantStatus(messageId, text) {
		updateAssistant(messageId, (m) => {
			const parts = m.parts.map((p) => p.type === "status" ? {
				type: "status",
				text
			} : p);
			return {
				...m,
				parts
			};
		});
	}
	function toolPermission(call) {
		const name = String(call.name ?? "").toLowerCase();
		if (name === "search") return {
			permission: "network",
			reason: "Search may access the network."
		};
		if (name === "bash") return {
			permission: "shell",
			reason: "Bash can execute commands."
		};
		if (name === "grep") return {
			permission: "filesystem_read",
			reason: "Grep may read local files."
		};
		return null;
	}
	function insertApprovalPart(assistantId, request) {
		updateAssistant(assistantId, (m) => {
			const has = m.parts.some((p) => p.type === "approve" && p.request.toolCallId === request.toolCallId && p.request.status === "pending");
			if (has) return m;
			const parts = m.parts.slice();
			const callIdx = parts.findIndex((p) => p.type === "tool_call" && p.call.id === request.toolCallId);
			if (callIdx >= 0) parts.splice(callIdx + 1, 0, {
				type: "approve",
				request
			});
			else parts.push({
				type: "approve",
				request
			});
			return {
				...m,
				parts
			};
		});
	}
	function ensureApproved(assistantId, call) {
		if (state.approval.skipApproval) return "ok";
		const perm = toolPermission(call);
		if (!perm) return "ok";
		if (state.approval.approvedToolCalls[call.id]) return "ok";
		const active = state.approval.active;
		if (active?.toolCallId === call.id) return "pending";
		if (active) {
			setAssistantStatus(assistantId, `Another approval is pending (${active.permission})…`);
			return "pending";
		}
		const req = {
			id: id("approve"),
			toolCallId: call.id,
			tool: call.name,
			permission: perm.permission,
			reason: perm.reason,
			status: "pending"
		};
		state.approval.active = req;
		state.approval.pendingAutoRun = {
			assistantId,
			toolCallId: call.id
		};
		insertApprovalPart(assistantId, req);
		setAssistantStatus(assistantId, `Awaiting approval (${perm.permission})…`);
		return "pending";
	}
	function findToolCall(callId) {
		for (const m of state.messages) {
			if (m.role !== "assistant") continue;
			for (const part of m.parts) if (part.type === "tool_call" && part.call.id === callId) return {
				messageId: m.id,
				call: part.call
			};
		}
		return null;
	}
	function selectToolCall(callId) {
		state.selectedToolCallId = callId;
	}
	function toggleChecklist(messageId, partType, itemId) {
		const msg = state.messages.find((m) => m.id === messageId);
		if (!msg || msg.role !== "assistant") return;
		if (partType === "todo") {
			const block = msg.parts.find((p) => p.type === "todo" && p.items.some((it) => it.id === itemId));
			if (block?.toolCallId) return;
		}
		const parts = msg.parts.map((p) => {
			if (p.type !== partType) return p;
			return {
				...p,
				items: p.items.map((it) => it.id === itemId ? {
					...it,
					done: !it.done
				} : it)
			};
		});
		replaceMessage(messageId, {
			...msg,
			parts
		});
	}
	function toggleBlockCollapsed(messageId, partType, partIndex) {
		const msg = state.messages.find((m) => m.id === messageId);
		if (!msg || msg.role !== "assistant") return;
		const parts = msg.parts.map((p, idx) => {
			if (p.type !== partType) return p;
			if (partIndex !== void 0 && idx !== partIndex) return p;
			return {
				...p,
				collapsed: !p.collapsed
			};
		});
		replaceMessage(messageId, {
			...msg,
			parts
		});
	}
	function toAcpFromToolCall(call) {
		return {
			id: call.id,
			type: "function",
			function: {
				name: call.name,
				arguments: call.arguments
			}
		};
	}
	function toAcpFromMessage(m) {
		if (m.role === "user") return {
			role: "user",
			content: m.content
		};
		if (m.role === "tool") return {
			role: "tool",
			tool_call_id: m.result.id,
			content: m.result.output,
			metadata: m.result.status === "error" ? { error: true } : void 0
		};
		const text = m.parts.filter((p) => p.type === "markdown").map((p) => p.markdown).join("");
		const toolCalls = m.parts.flatMap((p) => p.type === "tool_call" ? [p.call] : []);
		const tool_calls = toolCalls.length ? toolCalls.map(toAcpFromToolCall) : void 0;
		if (!text && (!tool_calls || tool_calls.length === 0)) return null;
		return {
			role: "assistant",
			content: text || "",
			tool_calls
		};
	}
	function buildAcpConversation(messages) {
		const out = [];
		out.push({
			role: "system",
			content: String(state.context.system ?? "")
		});
		for (const m of messages) {
			const acp = toAcpFromMessage(m);
			if (acp) out.push(acp);
		}
		return out;
	}
	function ensureErrorVisibleInTranscript(assistantId, errorMeta) {
		const msg = state.messages.find((m) => m.id === assistantId);
		if (!msg || msg.role !== "assistant") return;
		const markdown = msg.parts.flatMap((p) => p.type === "markdown" ? [String(p.markdown ?? "")] : []);
		const joined = markdown.join("\n").trim();
		const errText = formatAgentErrorForUi(errorMeta);
		const normalizedError = normalizeText(errText).trim();
		if (normalizedError && (!joined || joined.includes(normalizedError))) removeDuplicateAskUserErrorToolResult(assistantId, errText);
		if (joined.length > 0) return;
		const env = state.context?.env;
		const hint = formatAgentErrorHintForUi(errText, env);
		appendAssistantMarkdown(assistantId, [
			"# Error",
			"",
			"```text",
			errText,
			"```",
			...hint ? ["", hint] : []
		].join("\n"));
	}
	function appendAssistantMarkdown(assistantId, delta) {
		const d = String(delta ?? "");
		if (!d) return;
		updateAssistant(assistantId, (m) => {
			const parts = m.parts.slice();
			const last = parts[parts.length - 1];
			if (last?.type === "markdown") parts[parts.length - 1] = {
				type: "markdown",
				markdown: `${last.markdown}${d}`
			};
			else parts.push({
				type: "markdown",
				markdown: d
			});
			return {
				...m,
				parts
			};
		});
	}
	function upsertToolCallDelta(assistantId, callId, toolName, argsTextDelta) {
		const idRaw = String(callId ?? "").trim();
		if (!idRaw) return;
		const name = String(toolName ?? "").trim() || "tool";
		const delta = String(argsTextDelta ?? "");
		updateAssistant(assistantId, (m) => {
			const parts = m.parts.slice();
			const idx = parts.findIndex((p) => p.type === "tool_call" && p.call.id === idRaw);
			if (idx >= 0) {
				const p = parts[idx];
				const prev = p.call.argumentsText ?? "";
				const nextCall = {
					...p.call,
					name,
					argumentsText: `${prev}${delta}`
				};
				parts[idx] = {
					type: "tool_call",
					call: nextCall
				};
				return {
					...m,
					parts
				};
			}
			const call = {
				id: idRaw,
				name,
				arguments: {},
				argumentsText: delta
			};
			parts.push({
				type: "tool_call",
				call
			});
			return {
				...m,
				parts
			};
		});
	}
	function upsertToolCallEnd(assistantId, callId, toolName, args) {
		const idRaw = String(callId ?? "").trim();
		if (!idRaw) return;
		updateAssistant(assistantId, (m) => {
			const parts = m.parts.slice();
			const idx = parts.findIndex((p) => p.type === "tool_call" && p.call.id === idRaw);
			const prevArgsText = idx >= 0 && parts[idx]?.type === "tool_call" ? parts[idx].call.argumentsText : void 0;
			const call = {
				id: idRaw,
				name: toolName,
				arguments: args,
				argumentsText: prevArgsText
			};
			const nextPart = {
				type: "tool_call",
				call
			};
			if (idx >= 0) parts[idx] = nextPart;
			else parts.push(nextPart);
			return {
				...m,
				parts
			};
		});
	}
	function attachToolResultPart(assistantId, result) {
		const callId = String(result.id ?? "").trim();
		if (!callId) return;
		updateAssistant(assistantId, (m) => {
			const parts = m.parts.slice();
			const callIdx = parts.findIndex((p) => p.type === "tool_call" && p.call.id === callId);
			const withoutPrev = parts.filter((p) => !(p.type === "tool_result" && p.result.id === callId));
			const rebuilt = withoutPrev.slice();
			if (callIdx >= 0) {
				const rebuiltCallIdx = rebuilt.findIndex((p) => p.type === "tool_call" && p.call.id === callId);
				if (rebuiltCallIdx >= 0) rebuilt.splice(rebuiltCallIdx + 1, 0, {
					type: "tool_result",
					result
				});
				else rebuilt.push({
					type: "tool_result",
					result
				});
			} else rebuilt.push({
				type: "tool_result",
				result
			});
			return {
				...m,
				parts: rebuilt
			};
		});
	}
	function findToolNameForCall(assistantId, callId) {
		const msg = state.messages.find((m) => m.id === assistantId);
		if (!msg || msg.role !== "assistant") return null;
		const part = msg.parts.find((p) => p.type === "tool_call" && p.call.id === callId);
		return part?.call?.name ? String(part.call.name) : null;
	}
	function isAskUserToolName(name) {
		const compact = String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
		return compact === "askuser" || compact === "askuserquestion" || compact === "askuserquestiontool";
	}
	function removeDuplicateAskUserErrorToolResult(assistantId, errText) {
		const normalizedError = normalizeText(errText).trim();
		if (!normalizedError) return;
		updateAssistant(assistantId, (m) => {
			const parts = m.parts.filter((p) => {
				if (p.type !== "tool_result" || p.result.status !== "error") return true;
				const call = m.parts.find((candidate) => candidate.type === "tool_call" && candidate.call.id === p.result.id)?.call;
				if (!isAskUserToolName(call?.name)) return true;
				const output = normalizeText(p.result.output).trim();
				if (!output) return true;
				return !(output === normalizedError || output.includes(normalizedError) || normalizedError.includes(output));
			});
			return parts.length === m.parts.length ? m : {
				...m,
				parts
			};
		});
	}
	function findToolCallForCall(assistantId, callId) {
		const msg = state.messages.find((m) => m.id === assistantId);
		if (!msg || msg.role !== "assistant") return null;
		const part = msg.parts.find((p) => p.type === "tool_call" && p.call.id === callId);
		return part?.call ? part.call : null;
	}
	function extractFilePathFromToolCallArgs(args) {
		const a = args ?? {};
		const candidates = [
			a.file_path,
			a.filePath,
			a.path
		];
		for (const v of candidates) if (typeof v === "string" && v.trim()) return v.trim();
		return null;
	}
	function shouldHighlightToolResult(toolName, filePath) {
		if (!toolName || !filePath) return false;
		const name = toolName.toLowerCase();
		return name === "read" || name.includes("read");
	}
	function scheduleToolResultHighlight(assistantId, result) {
		const callId = String(result.id ?? "").trim();
		if (!callId) return;
		const toolName = findToolNameForCall(assistantId, callId);
		const call = findToolCallForCall(assistantId, callId);
		const filePath = extractFilePathFromToolCallArgs(call?.arguments);
		if (!shouldHighlightToolResult(toolName, filePath)) return;
		const lang = guessLanguageFromFilePath(filePath);
		if (!lang) return;
		(async () => {
			const outputAnsi = await highlightCodePreviewToAnsi({
				code: result.output,
				language: lang,
				maxLines: 24
			});
			if (!outputAnsi || !outputAnsi.trim()) return;
			updateAssistant(assistantId, (m) => {
				const parts = m.parts.slice();
				const idx = parts.findIndex((p) => p.type === "tool_result" && p.result.id === callId);
				if (idx < 0) return m;
				const prevPart = parts[idx];
				if (prevPart.result.output !== result.output) return m;
				if (prevPart.result.outputAnsi && prevPart.result.outputAnsi.trim()) return m;
				parts[idx] = {
					type: "tool_result",
					result: {
						...prevPart.result,
						outputAnsi
					}
				};
				return {
					...m,
					parts
				};
			});
		})();
	}
	function upsertChecklistPartFromGoatChain(assistantId, kind, toolCallId, structured) {
		const todos = structured?.todos;
		if (!Array.isArray(todos)) return;
		const items = todos.map((t, i) => ({
			id: `${toolCallId}:${i}`,
			text: String(t?.content ?? "").trim(),
			done: String(t?.status ?? "") === "completed"
		})).filter((it) => Boolean(it.text));
		if (items.length === 0) return;
		const title = kind === "plan" ? "Plan" : "Todo";
		updateAssistant(assistantId, (m) => {
			const parts = m.parts.slice();
			const idx = parts.findIndex((p) => p.type === kind && p?.toolCallId === toolCallId);
			if (idx >= 0) {
				const prev = parts[idx];
				parts[idx] = {
					type: kind,
					title,
					collapsed: Boolean(prev?.collapsed),
					items,
					toolCallId
				};
				return {
					...m,
					parts
				};
			}
			const nextPart = {
				type: kind,
				title,
				collapsed: false,
				items,
				toolCallId
			};
			const callIdx = parts.findIndex((p) => p?.type === "tool_call" && p?.call?.id === toolCallId);
			if (callIdx >= 0) {
				let insertAt = callIdx + 1;
				while (insertAt < parts.length && parts[insertAt]?.type === "approve" && parts[insertAt]?.request?.toolCallId === toolCallId) insertAt++;
				while (insertAt < parts.length && parts[insertAt]?.type === "tool_result" && parts[insertAt]?.result?.id === toolCallId) insertAt++;
				parts.splice(insertAt, 0, nextPart);
				return {
					...m,
					parts
				};
			}
			parts.push(nextPart);
			return {
				...m,
				parts
			};
		});
	}
	async function runAgentRound(opts$1) {
		const base = (opts$1?.baseMessages ?? state.messages).slice();
		const conversation = buildAcpConversation(base);
		const assistantId = id("m");
		state.thinking.active = false;
		state.thinking.startedAt = null;
		state.thinking.endedAt = null;
		pushMessage({
			id: assistantId,
			role: "assistant",
			parts: [{
				type: "status",
				text: ""
			}]
		});
		const metadata = {
			session_id: state.sessionId,
			cwd: state.context.cwd,
			env: state.context.env
		};
		if (opts$1?.toolContext) {
			metadata.toolContext = opts$1.toolContext;
			metadata.resume = true;
		}
		try {
			state.runningAgentRound = true;
			const stream = agent.receiveMessage(conversation, metadata);
			activeAgentStream = stream;
			const abort = createActiveAgentAbort();
			activeAgentAbort = abort;
			const startedAt = Date.now();
			let lastEventAt = startedAt;
			let _doneMarkerSeen = false;
			let doneDrainSteps = 0;
			const readAssistantStatus = () => {
				const m = state.messages.find((m$1) => m$1.id === assistantId);
				if (!m || m.role !== "assistant") return "";
				const s = m.parts.find((p) => p.type === "status");
				return String(s?.text ?? "");
			};
			const startThinking = () => {
				const now = Date.now();
				if (!state.thinking.startedAt) state.thinking.startedAt = now;
				state.thinking.active = true;
				state.thinking.endedAt = null;
				const prev = readAssistantStatus();
				if (!/^thinking\b/i.test(prev)) setAssistantStatus(assistantId, "Thinking…");
			};
			const endThinking = () => {
				if (!state.thinking.active) return;
				state.thinking.active = false;
				if (state.thinking.startedAt) state.thinking.endedAt = Date.now();
				const prev = readAssistantStatus();
				if (/^thinking\b/i.test(prev)) setAssistantStatus(assistantId, "");
			};
			const waitOrTimeout = async (p, ms) => {
				const waitMs = Math.max(0, Math.floor(ms));
				if (waitMs <= 0) return { kind: "timeout" };
				let timer = null;
				try {
					const timeoutP = new Promise((resolve) => {
						timer = setTimeout(() => resolve({ kind: "timeout" }), waitMs);
					});
					const abortP = abort.promise.then(() => ({ kind: "abort" }));
					const winner = await Promise.race([
						p.then((value) => ({
							kind: "value",
							value
						})),
						timeoutP,
						abortP
					]);
					return winner;
				} finally {
					if (timer) clearTimeout(timer);
				}
			};
			while (true) {
				const now = Date.now();
				const totalLeft = streamTotalTimeoutMs - (now - startedAt);
				const idleLeft = streamIdleTimeoutMs - (now - lastEventAt);
				const waitMs = Math.min(totalLeft, idleLeft);
				const next = await waitOrTimeout(stream.next(), waitMs);
				if (next.kind === "abort") {
					appendAssistantMarkdown(assistantId, [
						"# Interrupted",
						"",
						"```text",
						"Interrupted by user.",
						"```"
					].join("\n"));
					state.paused = null;
					state.approval.active = null;
					state.approval.pendingAutoRun = null;
					setAssistantStatus(assistantId, "Interrupted.");
					break;
				}
				if (next.kind === "timeout") {
					const env = state.context?.env;
					const errText = [
						"Agent stream timed out.",
						"",
						`idle_timeout_ms=${streamIdleTimeoutMs}`,
						`total_timeout_ms=${streamTotalTimeoutMs}`
					].join("\n");
					const hint = formatAgentErrorHintForUi(errText, env) || "Hint: retry, or increase `max_tokens` via `/settings`.";
					appendAssistantMarkdown(assistantId, [
						"# Error",
						"",
						"```text",
						errText,
						"```",
						"",
						hint
					].join("\n"));
					state.paused = null;
					state.approval.active = null;
					state.approval.pendingAutoRun = null;
					setAssistantStatus(assistantId, "Error.");
					break;
				}
				const { value, done } = next.value;
				if (done) break;
				const msg = value;
				lastEventAt = Date.now();
				const md = msg?.metadata;
				const eventType = getOriginalEventType(msg) ?? String(md?.originalEventType ?? "");
				if (eventType === "thinking_start") {
					startThinking();
					continue;
				}
				if (eventType === "thinking_end") {
					endThinking();
					continue;
				}
				if (eventType === "thinking_delta" || md?.thinking === true) {
					startThinking();
					continue;
				}
				if (state.thinking.active) endThinking();
				if (eventType === "tool_call_delta") {
					upsertToolCallDelta(assistantId, String(md?.callId ?? ""), md?.toolName, md?.argsTextDelta);
					continue;
				}
				if (msg.role === "assistant") {
					const text = extractTextContent(msg.content);
					if (text) appendAssistantMarkdown(assistantId, text);
					const toolCalls$1 = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
					for (const tc of toolCalls$1) {
						const toolName = String(tc?.function?.name ?? "tool");
						const rawArgs = tc?.function?.arguments;
						let args = {};
						if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) args = rawArgs;
						else if (typeof rawArgs === "string") try {
							const parsed = JSON.parse(rawArgs);
							args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { _raw: rawArgs };
						} catch {
							args = { _raw: rawArgs };
						}
						upsertToolCallEnd(assistantId, String(tc.id ?? ""), toolName, args);
					}
					const meta = msg?.metadata;
					if (meta?.approval_requested && meta?.tool_call_id && meta?.tool_name) {
						const toolCallId = String(meta.tool_call_id);
						const toolName = String(meta.tool_name);
						const riskLevel = meta.risk_level;
						const permission = riskLevel === "critical" ? "shell" : riskLevel === "high" ? "network" : "filesystem_read";
						const req = {
							id: id("approve"),
							toolCallId,
							tool: toolName,
							permission,
							reason: `GoatChain approval required (${String(riskLevel ?? "unknown")}).`,
							source: "goatchain",
							riskLevel,
							status: "pending"
						};
						state.approval.active = req;
						state.approval.pendingAutoRun = {
							assistantId,
							toolCallId
						};
						insertApprovalPart(assistantId, req);
						setAssistantStatus(assistantId, `Awaiting approval (${String(riskLevel ?? "risk")})…`);
					}
					if (meta?.requires_action) {
						state.paused = {
							kind: String(meta?.kind ?? "") === "ask_user" ? "ask_user" : "tool_approval",
							toolCallId: meta?.tool_call_id ?? meta?.toolCallId,
							questions: meta?.questions
						};
						setAssistantStatus(assistantId, state.paused.kind === "ask_user" ? "Awaiting answers…" : "Awaiting approval…");
						if (state.paused.kind === "ask_user") break;
					}
				} else if (msg.role === "tool") {
					const output = extractTextContent(msg.content);
					const toolCallId = String(msg.tool_call_id ?? "");
					const isError = msg?.metadata?.error === true;
					const result = {
						id: toolCallId || id("tool"),
						output,
						status: isError ? "error" : "success"
					};
					pushMessage({
						id: id("m"),
						role: "tool",
						result
					});
					attachToolResultPart(assistantId, result);
					scheduleToolResultHighlight(assistantId, result);
					updateUsage(tokenCounter.countTokens(output), 0);
					const toolName = toolCallId ? findToolNameForCall(assistantId, toolCallId) : null;
					const structured = msg?.metadata?.structuredContent;
					if (toolName === "TodoWrite") upsertChecklistPartFromGoatChain(assistantId, "todo", toolCallId, structured);
					else if (toolName === "TodoPlan") upsertChecklistPartFromGoatChain(assistantId, "plan", toolCallId, structured);
				}
				const doneMeta = msg?.metadata;
				if (doneMeta?.done) {
					_doneMarkerSeen = true;
					doneDrainSteps += 1;
					endThinking();
					if (doneMeta?.stopReason === "approval_required" || state.paused) setAssistantStatus(assistantId, state.paused?.kind === "ask_user" ? "Awaiting answers…" : "Awaiting approval…");
					else {
						if (doneMeta?.error) ensureErrorVisibleInTranscript(assistantId, doneMeta.error);
						setAssistantStatus(assistantId, doneMeta?.error ? "Error." : "Done.");
					}
					if (doneDrainSteps > 64) break;
					continue;
				}
			}
			if (!state.paused) {
				const m = state.messages.find((m$1) => m$1.id === assistantId);
				const status = m && m.role === "assistant" ? m.parts.find((p) => p.type === "status") : null;
				if (status && status.text === "Thinking…") setAssistantStatus(assistantId, "Done.");
			}
		} catch (e) {
			const errText = e instanceof Error ? e.stack || e.message : String(e);
			const env = state.context?.env;
			const hint = formatAgentErrorHintForUi(errText, env);
			appendAssistantMarkdown(assistantId, [
				"# Error",
				"",
				"```text",
				errText,
				"```",
				...hint ? ["", hint] : []
			].join("\n"));
			setAssistantStatus(assistantId, "Error.");
		} finally {
			if (activeAgentStream) cancelActiveAgentStream();
			if (activeAgentAbort) abortActiveAgentRound();
			state.thinking.active = false;
			state.runningAgentRound = false;
		}
		const toolCalls = (() => {
			const m = state.messages.find((m$1) => m$1.id === assistantId);
			if (!m || m.role !== "assistant") return [];
			return m.parts.flatMap((p) => p.type === "tool_call" ? [p.call] : []);
		})();
		return {
			assistantId,
			toolCalls
		};
	}
	let sendQueue = Promise.resolve();
	async function send(input) {
		const raw = typeof input === "string" ? input : input.content;
		const content = normalizeText(raw);
		if (!content) return;
		const focusFiles = typeof input === "string" ? void 0 : input.focusFiles;
		if (focusFiles?.length) setFocusFiles(focusFiles);
		pushMessage({
			id: id("m"),
			role: "user",
			content,
			focusFiles
		});
		updateUsage(tokenCounter.countTokens(content), 0);
		const baseMessages = state.messages.slice();
		const run = async () => {
			try {
				const { assistantId, toolCalls } = await runAgentRound({ baseMessages });
				if (state.paused) {
					if (state.approval.skipApproval && state.paused.kind === "tool_approval" && state.approval.active?.status === "pending") await resolveActiveApproval("approved");
					return;
				}
				if (externalAgentProvided) return;
				await sleep(500);
				setAssistantStatus(assistantId, toolCalls.length ? "Planning…" : "Drafting…");
				await sleep(500);
				if (toolCalls[0]) {
					const alreadyHasResult = state.messages.some((m) => m.role === "tool" && m.result.id === toolCalls[0].id);
					if (alreadyHasResult) {
						setAssistantStatus(assistantId, "Done.");
						return;
					}
					if (ensureApproved(assistantId, toolCalls[0]) === "pending") return;
					setAssistantStatus(assistantId, `Running ${toolCalls[0].name}…`);
					await sleep(500);
					const result = await runToolCall(toolCalls[0].id);
					await sleep(300);
					setAssistantStatus(assistantId, "Done.");
					if (result) {
						const summary = [
							"# Summary",
							"",
							"Here is a mocked end-to-end flow:",
							"",
							`- Ran \`${toolCalls[0].name}\` and captured a tool result`,
							`- Rendered markdown + code fences`,
							"",
							"## Tool output (excerpt)",
							"",
							"```text",
							normalizeText(result.output).split("\n").slice(0, 8).join("\n"),
							"```",
							"",
							"## Next",
							"",
							"- You can select a `tool_call` on the left and re-run it",
							"- (Coming next) approval-gated tools + context token breakdown"
						].join("\n");
						pushMessage({
							id: id("m"),
							role: "assistant",
							parts: [{
								type: "markdown",
								markdown: summary
							}]
						});
						updateUsage(0, tokenCounter.countTokens(summary));
					}
				} else setAssistantStatus(assistantId, "Done.");
			} catch (e) {
				abortActiveAgentRound();
				cancelActiveAgentStream();
				state.runningAgentRound = false;
				state.runningToolCallId = null;
				state.paused = null;
				state.approval.active = null;
				state.approval.pendingAutoRun = null;
				const env = state.context?.env;
				const errText = formatAgentErrorForUi(e);
				const hint = formatAgentErrorHintForUi(errText, env);
				const markdown = [
					"# Error",
					"",
					"```text",
					errText,
					"```",
					...hint ? ["", hint] : []
				].join("\n");
				pushMessage({
					id: id("m"),
					role: "assistant",
					parts: [{
						type: "status",
						text: "Error."
					}, {
						type: "markdown",
						markdown
					}]
				});
			}
		};
		sendQueue = sendQueue.then(run, run);
		await sendQueue;
	}
	async function resolveActiveApproval(decision) {
		const active = state.approval.active;
		if (!active) return;
		const next = {
			...active,
			status: decision
		};
		if (decision === "approved" && (active.source ?? "local") === "local") state.approval.approvedToolCalls[active.toolCallId] = true;
		const pending = state.approval.pendingAutoRun;
		state.approval.active = null;
		state.approval.pendingAutoRun = null;
		const assistantId = pending?.assistantId;
		if (assistantId) updateAssistant(assistantId, (m) => {
			const parts = m.parts.map((p) => {
				if (p.type === "approve" && p.request.id === active.id) return {
					type: "approve",
					request: next
				};
				return p;
			});
			return {
				...m,
				parts
			};
		});
		if (!assistantId) return;
		if ((active.source ?? "local") === "goatchain") {
			const approved = decision === "approved";
			setAssistantStatus(assistantId, approved ? "Approved. Waiting to resume…" : "Denied. Waiting to resume…");
			const resume = async () => {
				setAssistantStatus(assistantId, approved ? "Approved. Resuming…" : "Denied. Resuming…");
				state.paused = null;
				await runAgentRound({ toolContext: { approval: { decisions: { [active.toolCallId]: approved ? { approved: true } : {
					approved: false,
					reason: active.reason || "User denied approval"
				} } } } });
			};
			sendQueue = sendQueue.then(resume, resume);
			await sendQueue;
			return;
		}
		if (decision === "denied") {
			setAssistantStatus(assistantId, "Permission denied.");
			const denial = [
				"# Tool permission denied",
				"",
				`- tool: \`${active.tool}\``,
				`- permission: \`${active.permission}\``,
				"",
				"You can re-select the tool_call and try again."
			].join("\n");
			pushMessage({
				id: id("m"),
				role: "assistant",
				parts: [{
					type: "markdown",
					markdown: denial
				}]
			});
			updateUsage(0, tokenCounter.countTokens(denial));
			return;
		}
		setAssistantStatus(assistantId, `Running ${active.tool}…`);
		await sleep(180);
		const result = await runToolCall(active.toolCallId);
		setAssistantStatus(assistantId, "Done.");
		if (!result) return;
		const summary = [
			"# Approved + executed tool",
			"",
			`Permission \`${active.permission}\` approved for \`${active.tool}\`.`,
			"",
			"```text",
			normalizeText(result.output).split("\n").slice(0, 8).join("\n"),
			"```"
		].join("\n");
		pushMessage({
			id: id("m"),
			role: "assistant",
			parts: [{
				type: "markdown",
				markdown: summary
			}]
		});
		updateUsage(0, tokenCounter.countTokens(summary));
	}
	async function runToolCall(callId) {
		if (externalAgentProvided) {
			pushMessage({
				id: id("m"),
				role: "assistant",
				parts: [{
					type: "markdown",
					markdown: [
						"# Tool execution is agent-controlled",
						"",
						"This session is running with a GoatChain agent. Tool calls are executed by the agent stream.",
						"To re-run a tool, ask the agent in a new message."
					].join("\n")
				}]
			});
			return null;
		}
		const found = findToolCall(callId);
		if (!found) return null;
		if (!state.approval.approvedToolCalls[callId]) {
			if (ensureApproved(found.messageId, found.call) === "pending") return null;
		}
		state.runningToolCallId = callId;
		try {
			const result = await (async () => {
				try {
					return await opts.toolRunner(found.call);
				} catch (e) {
					const errText = e instanceof Error ? e.stack || e.message : String(e);
					return {
						id: callId,
						status: "error",
						output: `Tool runner error:\n${errText}`
					};
				}
			})();
			pushMessage({
				id: id("m"),
				role: "tool",
				result
			});
			attachToolResultPart(found.messageId, result);
			updateUsage(tokenCounter.countTokens(result.output), 0);
			return result;
		} finally {
			state.runningToolCallId = null;
		}
	}
	function interrupt() {
		if (state.runningAgentRound) {
			abortActiveAgentRound();
			cancelActiveAgentStream();
			state.runningAgentRound = false;
		}
		if (state.runningToolCallId) {
			const callId = state.runningToolCallId;
			state.runningToolCallId = null;
			const found = findToolCall(callId);
			if (found) setAssistantStatus(found.messageId, "Interrupted.");
		}
		if (state.approval.pendingAutoRun) {
			state.approval.active = null;
			state.approval.pendingAutoRun = null;
		}
	}
	async function submitAskUserAnswers(answers) {
		const paused = state.paused;
		if (!paused || paused.kind !== "ask_user") return;
		const toolCallId = String(paused.toolCallId ?? "").trim();
		if (!toolCallId) return;
		state.paused = null;
		const resume = async () => {
			await runAgentRound({ toolContext: { askUser: { answers: { [toolCallId]: { ...answers } } } } });
		};
		sendQueue = sendQueue.then(resume, resume);
		await sendQueue;
	}
	function cancelAskUser() {
		if (state.paused?.kind === "ask_user") state.paused = null;
	}
	return {
		state,
		usagePct,
		contextTokens,
		contextPct,
		selectToolCall,
		toggleChecklist,
		toggleBlockCollapsed,
		send,
		sendUser: send,
		sendUserInput: (input) => send(input),
		setFocusFiles,
		setCwd,
		setEnvVar,
		setAgent,
		setThemePreset,
		setMessageTypeThemeOverride,
		resetThemeOverrides,
		approve: () => resolveActiveApproval("approved"),
		deny: () => resolveActiveApproval("denied"),
		runToolCall,
		interrupt,
		submitAskUserAnswers,
		cancelAskUser,
		revertFromMessage,
		restoreRevertedMessages,
		clearRevertedMessages,
		hasRevertedMessages,
		revertedMessageCount
	};
}

//#endregion
//#region src/provider.ts
const GoatChainProvider = defineComponent({
	name: "GoatChainProvider",
	props: {
		toolRunner: {
			type: Function,
			required: true
		},
		context: {
			type: Object,
			required: true
		},
		tools: {
			type: String,
			default: "mock"
		},
		agent: {
			type: Object,
			default: void 0
		},
		onStoreCreated: {
			type: Function,
			default: void 0
		},
		sessions: {
			type: Object,
			default: void 0
		}
	},
	setup(props, { slots }) {
		const existing = inject(GoatChainBridgeKey, null);
		if (existing) return () => slots.default?.();
		const store = createGoatChainStore({
			toolRunner: props.toolRunner,
			context: props.context,
			agent: props.agent
		});
		props.onStoreCreated?.(store);
		provide(GoatChainBridgeKey, {
			store,
			tools: props.tools,
			sessions: props.sessions
		});
		return () => h("div", null, slots.default?.());
	}
});

//#endregion
//#region src/pages/ZIndexStressPage.ts
function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}
const INITIAL_DIALOGS = 20;
const DIALOG_H = 10;
const Z_BASE = 50;
const HEADER_BG = ["blueBright", "magentaBright"];
const GoatChainZIndexStressPage = defineComponent({
	name: "GoatChainZIndexStressPage",
	setup() {
		const router = useRouter();
		const layout = useLayout();
		const cols = computed(() => layout.clipRect?.w ?? 0);
		const rows = computed(() => layout.clipRect?.h ?? 0);
		const staggerInput = ref("1");
		const dialogs = ref(Array.from({ length: INITIAL_DIALOGS }, (_, i) => ({ id: i + 1 })));
		const total = computed(() => dialogs.value.length);
		const stagger = computed(() => clamp(Number.parseInt(staggerInput.value || "0", 10) || 0, 0, 4));
		const innerW = computed(() => Math.max(0, cols.value - 4));
		const innerH = computed(() => Math.max(0, rows.value - 4));
		const dialogW = computed(() => clamp(Math.min(66, innerW.value), 24, innerW.value));
		const dialogBaseX = computed(() => clamp(Math.floor((innerW.value - dialogW.value) / 2), 0, Math.max(0, innerW.value - dialogW.value)));
		const dialogBaseY = computed(() => clamp(4, 0, Math.max(0, innerH.value - DIALOG_H)));
		function reset() {
			dialogs.value = Array.from({ length: INITIAL_DIALOGS }, (_, i) => ({ id: i + 1 }));
			staggerInput.value = "1";
		}
		function closeById(id$1) {
			dialogs.value = dialogs.value.filter((d) => d.id !== id$1);
		}
		function closeTop() {
			const top = dialogs.value[dialogs.value.length - 1];
			if (!top) return;
			closeById(top.id);
		}
		function bumpStagger() {
			const cur = Number.parseInt(staggerInput.value || "0", 10) || 0;
			staggerInput.value = String((cur + 1) % 5);
		}
		return () => h(TBox, {
			x: 0,
			y: 0,
			w: cols.value,
			h: rows.value,
			border: true,
			title: "Z-Index Stress",
			padding: 1,
			style: {
				fg: "cyanBright",
				bg: "black"
			}
		}, () => [
			h(TView, {
				x: 0,
				y: 0,
				w: Math.max(0, cols.value - 2),
				h: Math.max(0, rows.value - 2),
				zIndex: 0,
				onKeydownCapture: (e) => {
					if (e?.key === "Escape") router.back();
				}
			}),
			h(TText, {
				x: 0,
				y: 0,
				w: innerW.value,
				value: "Esc: back • 20 stacked dialogs • close top → reveal next • stagger updates positions",
				style: { fg: "whiteBright" }
			}),
			h(TText, {
				x: 0,
				y: 1,
				w: innerW.value,
				value: `Total dialogs: ${total.value}/${INITIAL_DIALOGS}`,
				style: { fg: "whiteBright" }
			}),
			h(TView, {
				x: 0,
				y: 2,
				w: 13,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: reset,
				onKeydown: (e) => {
					if (e?.key === "Enter") reset();
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: "[ Reset 20 ]",
				style: {
					fg: "greenBright",
					bold: true
				}
			})),
			h(TView, {
				x: 15,
				y: 2,
				w: 14,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: closeTop,
				onKeydown: (e) => {
					if (e?.key === "Enter") closeTop();
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: "[ Close Top ]",
				style: {
					fg: "yellowBright",
					bold: true
				}
			})),
			h(TView, {
				x: 31,
				y: 2,
				w: 13,
				h: 1,
				zIndex: 10,
				focusable: true,
				onClick: bumpStagger,
				onKeydown: (e) => {
					if (e?.key === "Enter") bumpStagger();
				}
			}, () => h(TText, {
				x: 0,
				y: 0,
				value: "[ Stagger + ]",
				style: {
					fg: "magentaBright",
					bold: true
				}
			})),
			h(TText, {
				x: 0,
				y: 3,
				w: 10,
				value: "stagger:",
				style: { dim: true }
			}),
			h(TInput, {
				"x": 9,
				"y": 3,
				"w": 6,
				"h": 1,
				"modelValue": staggerInput.value,
				"onUpdate:modelValue": (v) => staggerInput.value = v,
				"placeholder": "0-4",
				"autoFocus": false,
				"cursorShape": "bar",
				"cursorBlink": false,
				"style": {
					fg: "whiteBright",
					bg: "blackBright"
				},
				"zIndex": 10
			}),
			dialogs.value.map((d, i) => {
				const isTop = i === dialogs.value.length - 1;
				const s = stagger.value;
				const dx = i % 5 * s;
				const dy = i % 4 * (s > 0 ? 1 : 0);
				const x = clamp(dialogBaseX.value + dx, 0, Math.max(0, innerW.value - dialogW.value));
				const y = clamp(dialogBaseY.value + dy, 0, Math.max(0, innerH.value - DIALOG_H));
				const z = Z_BASE + i;
				const headerBg = HEADER_BG[(i + 1) % HEADER_BG.length];
				return h(TView, {
					key: d.id,
					x,
					y,
					w: dialogW.value,
					h: DIALOG_H,
					zIndex: z,
					focusable: true
				}, () => h(TBox, {
					x: 0,
					y: 0,
					w: dialogW.value,
					h: DIALOG_H,
					border: true,
					title: `Dialog ${i + 1}/${total.value}`,
					padding: 1,
					style: {
						fg: isTop ? "whiteBright" : "white",
						dim: !isTop,
						bg: "blackBright"
					}
				}, () => [
					h(TText, {
						x: 0,
						y: 0,
						w: dialogW.value - 4,
						value: `id=${d.id}  zIndex=${z}  top=${isTop ? "yes" : "no"}`,
						style: { dim: true }
					}),
					h(TText, {
						x: 0,
						y: 1,
						w: dialogW.value - 4,
						value: `count=${total.value}  index=${i + 1}`,
						style: {
							fg: "whiteBright",
							bg: headerBg
						},
						clear: false
					}),
					h(TText, {
						x: 0,
						y: 2,
						w: dialogW.value - 4,
						value: "Click [ close N ] repeatedly; zIndex + dirty repaint should stay correct.",
						style: { dim: true }
					}),
					h(TView, {
						x: 0,
						y: 4,
						w: 12,
						h: 1,
						zIndex: 1,
						focusable: true,
						onClick: () => closeById(d.id),
						onKeydown: (e) => {
							if (e?.key === "Enter") closeById(d.id);
						}
					}, () => h(TText, {
						x: 0,
						y: 0,
						value: `[ close ${i + 1} ]`,
						style: {
							fg: "redBright",
							bold: true
						}
					}))
				]));
			}),
			total.value === 0 ? h(TText, {
				x: 0,
				y: 6,
				w: innerW.value,
				value: "All dialogs closed. Click [ Reset 20 ] to start over.",
				style: {
					fg: "greenBright",
					bold: true
				}
			}) : null
		]);
	}
});

//#endregion
//#region src/routes.ts
const goatchainRoutes = [
	{
		name: "home",
		component: GoatChainHomePage
	},
	{
		name: "chat",
		component: GoatChainChatPage
	},
	{
		name: "cli",
		component: GoatChainCliParityPage
	},
	{
		name: "isolation",
		component: GoatChainIsolationPage
	},
	{
		name: "dialog",
		component: GoatChainDialogPage
	},
	{
		name: "ime",
		component: GoatChainImePage
	},
	{
		name: "zindex",
		component: GoatChainZIndexStressPage
	}
];
const goatchainCliRoutes = [{
	name: "home",
	component: GoatChainHomePage
}, {
	name: "chat",
	component: GoatChainChatPage
}];
function routeName(to) {
	if (typeof to === "string") return to;
	if (to && typeof to === "object" && "name" in to) return String(to.name ?? "");
	return "";
}
function pickInitialRoute(routes, initialRoute) {
	const n = routeName(initialRoute) || "home";
	return routes.some((r) => r.name === n) ? n : "home";
}
function createGoatChainRouter(opts) {
	const routes = opts?.mode === "cli" ? goatchainCliRoutes : goatchainRoutes;
	return createTerminalRouter({
		routes,
		initialRoute: pickInitialRoute(routes, opts?.initialRoute ?? "home")
	});
}

//#endregion
//#region src/shell.ts
const GoatChainShell = defineComponent({
	name: "GoatChainShell",
	props: {
		toolRunner: {
			type: Function,
			required: true
		},
		context: {
			type: Object,
			required: true
		},
		tools: {
			type: String,
			default: "mock"
		},
		agent: {
			type: Object,
			default: void 0
		},
		onStoreCreated: {
			type: Function,
			default: void 0
		},
		sessions: {
			type: Object,
			default: void 0
		}
	},
	setup(props) {
		return () => h(GoatChainProvider, {
			toolRunner: props.toolRunner,
			context: props.context,
			tools: props.tools,
			agent: props.agent,
			onStoreCreated: props.onStoreCreated,
			sessions: props.sessions
		}, () => h(TRouterView, { routes: goatchainRoutes }));
	}
});

//#endregion
//#region src/tools-mock.ts
function asString(v, fallback = "") {
	return typeof v === "string" ? v : fallback;
}
function createMockToolRunner() {
	return async (call) => {
		const toolName = String(call.name ?? "").toLowerCase();
		const args = call.arguments || {};
		if (toolName === "bash") {
			const command = asString(args.command, "");
			return {
				id: call.id,
				status: "success",
				output: [
					`$ ${command || "(empty)"}`,
					"",
					"mock: bash execution disabled (provide a real ToolRunner to enable)",
					"mock: (example output)",
					"hello from mock bash"
				].join("\n")
			};
		}
		if (toolName === "grep") {
			const pattern = asString(args.pattern, "");
			const path = asString(args.path, ".");
			return {
				id: call.id,
				status: "success",
				output: [
					`mock: grep pattern=${JSON.stringify(pattern)} path=${JSON.stringify(path)}`,
					"src/cli.ts:1:import { computed } from 'vue'",
					"src/vue/components/TInput.ts:1:import { computed } from 'vue'"
				].join("\n")
			};
		}
		if (toolName === "search") {
			const query = asString(args.query, "");
			return {
				id: call.id,
				status: "success",
				output: `mock: search("${query}")\n\n- doc A\n- doc B\n- doc C`
			};
		}
		return {
			id: call.id,
			status: "error",
			output: `Unknown tool: ${call.name}`
		};
	};
}

//#endregion
export { GoatChainChatPage, GoatChainCliParityPage, GoatChainDialogPage, GoatChainHomePage, GoatChainImePage, GoatChainIsolationPage, GoatChainProvider, GoatChainShell, createGoatChainRouter, createMockToolRunner, goatchainRoutes };
