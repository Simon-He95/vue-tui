# 组件 Props / Events（自动生成）

> 此文件由 `packages/tui/scripts/generate-component-api-docs.ts` 自动生成，请勿手改。

## 目录

- [TAnchor](#tanchor)
- [TBox](#tbox)
- [TDebugOverlay](#tdebugoverlay)
- [TDialog](#tdialog)
- [TerminalProvider](#terminalprovider)
- [TFlow](#tflow)
- [TInput](#tinput)
- [TInputBox](#tinputbox)
- [TJsonEditor](#tjsoneditor)
- [TList](#tlist)
- [TLogLinksPanel](#tloglinkspanel)
- [TLogMinimap](#tlogminimap)
- [TLogScrollbar](#tlogscrollbar)
- [TLogSearchBar](#tlogsearchbar)
- [TLogSearchPager](#tlogsearchpager)
- [TLogSearchResults](#tlogsearchresults)
- [TLogView](#tlogview)
- [TLogVirtualLinksPanel](#tlogvirtuallinkspanel)
- [TLogVirtualSearchResults](#tlogvirtualsearchresults)
- [TMultilineModal](#tmultilinemodal)
- [TPathPicker](#tpathpicker)
- [TRenderLayer](#trenderlayer)
- [TRenderPlane](#trenderplane)
- [TRouterView](#trouterview)
- [TSelect](#tselect)
- [TText](#ttext)
- [TTransition](#ttransition)
- [TView](#tview)
- [TVirtualList](#tvirtuallist)

## TAnchor

源码：`src/vue/components/TAnchor.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                    | 类型                 | 默认值                 | 必填 | 说明 |
| ----------------------- | -------------------- | ---------------------- | ---- | ---- |
| <code>left</code>       | <code>number</code>  | <code>undefined</code> | 否   | —    |
| <code>top</code>        | <code>number</code>  | <code>undefined</code> | 否   | —    |
| <code>right</code>      | <code>number</code>  | <code>undefined</code> | 否   | —    |
| <code>bottom</code>     | <code>number</code>  | <code>undefined</code> | 否   | —    |
| <code>w</code>          | <code>number</code>  | <code>undefined</code> | 否   | —    |
| <code>h</code>          | <code>number</code>  | <code>undefined</code> | 否   | —    |
| <code>zIndex</code>     | <code>number</code>  | <code>0</code>         | 否   | —    |
| <code>focusable</code>  | <code>boolean</code> | <code>false</code>     | 否   | —    |
| <code>selectable</code> | <code>boolean</code> | <code>undefined</code> | 否   | —    |

### Events

| 名称                            | Payload | 说明 |
| ------------------------------- | ------- | ---- |
| <code>clickCapture</code>       | —       | —    |
| <code>click</code>              | —       | —    |
| <code>dblclickCapture</code>    | —       | —    |
| <code>dblclick</code>           | —       | —    |
| <code>pointerdownCapture</code> | —       | —    |
| <code>pointerdown</code>        | —       | —    |
| <code>pointerupCapture</code>   | —       | —    |
| <code>pointerup</code>          | —       | —    |
| <code>pointermoveCapture</code> | —       | —    |
| <code>pointermove</code>        | —       | —    |
| <code>wheelCapture</code>       | —       | —    |
| <code>wheel</code>              | —       | —    |
| <code>keydownCapture</code>     | —       | —    |
| <code>keydown</code>            | —       | —    |
| <code>keyupCapture</code>       | —       | —    |
| <code>keyup</code>              | —       | —    |
| <code>focusCapture</code>       | —       | —    |
| <code>focus</code>              | —       | —    |
| <code>blurCapture</code>        | —       | —    |
| <code>blur</code>               | —       | —    |

## TBox

源码：`src/vue/components/TBox.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                    | 类型                 | 默认值                    | 必填 | 说明 |
| ----------------------- | -------------------- | ------------------------- | ---- | ---- |
| <code>x</code>          | <code>number</code>  | —                         | 是   | —    |
| <code>y</code>          | <code>number</code>  | —                         | 是   | —    |
| <code>w</code>          | <code>number</code>  | —                         | 是   | —    |
| <code>h</code>          | <code>number</code>  | —                         | 是   | —    |
| <code>zIndex</code>     | <code>number</code>  | <code>0</code>            | 否   | —    |
| <code>border</code>     | <code>boolean</code> | <code>true</code>         | 否   | —    |
| <code>title</code>      | <code>string</code>  | <code>&quot;&quot;</code> | 否   | —    |
| <code>padding</code>    | <code>number</code>  | <code>0</code>            | 否   | —    |
| <code>scrollX</code>    | <code>number</code>  | <code>0</code>            | 否   | —    |
| <code>scrollY</code>    | <code>number</code>  | <code>0</code>            | 否   | —    |
| <code>style</code>      | <code>Style</code>   | <code>undefined</code>    | 否   | —    |
| <code>titleStyle</code> | <code>Style</code>   | <code>undefined</code>    | 否   | —    |
| <code>clear</code>      | <code>boolean</code> | <code>true</code>         | 否   | —    |

### Events

| 名称                             | Payload | 说明 |
| -------------------------------- | ------- | ---- |
| <code>pointerenterCapture</code> | —       | —    |
| <code>pointerenter</code>        | —       | —    |
| <code>pointerleaveCapture</code> | —       | —    |
| <code>pointerleave</code>        | —       | —    |

## TDebugOverlay

源码：`src/vue/components/TDebugOverlay.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                  | 类型                                                  | 默认值                         | 必填 | 说明 |
| --------------------- | ----------------------------------------------------- | ------------------------------ | ---- | ---- |
| <code>mode</code>     | <code>&quot;focus&quot; &#124; &quot;all&quot;</code> | <code>&quot;focus&quot;</code> | 否   | —    |
| <code>panel</code>    | <code>boolean</code>                                  | <code>true</code>              | 否   | —    |
| <code>maxRects</code> | <code>number</code>                                   | <code>40</code>                | 否   | —    |
| <code>zIndex</code>   | <code>number</code>                                   | <code>90</code>                | 否   | —    |

### Events

—

## TDialog

源码：`src/vue/components/TDialog.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                         | 类型                                                              | 默认值                          | 必填 | 说明 |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------- | ---- | ---- |
| <code>modelValue</code>      | <code>boolean</code>                                              | —                               | 是   | —    |
| <code>w</code>               | <code>number</code>                                               | —                               | 是   | —    |
| <code>h</code>               | <code>number</code>                                               | —                               | 是   | —    |
| <code>title</code>           | <code>string</code>                                               | <code>&quot;&quot;</code>       | 否   | —    |
| <code>padding</code>         | <code>number</code>                                               | <code>1</code>                  | 否   | —    |
| <code>zIndex</code>          | <code>number</code>                                               | <code>1000</code>               | 否   | —    |
| <code>style</code>           | <code>Style</code>                                                | <code>undefined</code>          | 否   | —    |
| <code>titleStyle</code>      | <code>Style</code>                                                | <code>undefined</code>          | 否   | —    |
| <code>contentStyle</code>    | <code>Style</code>                                                | <code>undefined</code>          | 否   | —    |
| <code>backdropStyle</code>   | <code>Style</code>                                                | <code>undefined</code>          | 否   | —    |
| <code>placement</code>       | <code>Placement</code>                                            | <code>&quot;center&quot;</code> | 否   | —    |
| <code>offsetX</code>         | <code>number</code>                                               | <code>0</code>                  | 否   | —    |
| <code>offsetY</code>         | <code>number</code>                                               | <code>0</code>                  | 否   | —    |
| <code>backdrop</code>        | <code>boolean</code>                                              | <code>true</code>               | 否   | —    |
| <code>closeOnBackdrop</code> | <code>boolean</code>                                              | <code>true</code>               | 否   | —    |
| <code>closeOnEsc</code>      | <code>boolean</code>                                              | <code>true</code>               | 否   | —    |
| <code>closeOnBlur</code>     | <code>boolean</code>                                              | <code>false</code>              | 否   | —    |
| <code>teleport</code>        | <code>boolean</code>                                              | <code>false</code>              | 否   | —    |
| <code>tabMode</code>         | <code>&quot;cycle&quot; &#124; &quot;wrapFromButtons&quot;</code> | <code>&quot;cycle&quot;</code>  | 否   | —    |
| <code>buttons</code>         | <code>DialogButton[]</code>                                       | <code>() =&gt; []</code>        | 否   | —    |
| <code>closeOnConfirm</code>  | <code>boolean</code>                                              | <code>true</code>               | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>close</code>             | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>keydown</code>           | —       | —    |
| <code>confirm</code>           | —       | —    |

## TerminalProvider

源码：`src/vue/components/TerminalProvider.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                            | 类型                                                                | 默认值                                          | 必填 | 说明 |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ---- | ---- |
| <code>cols</code>               | <code>number</code>                                                 | —                                               | 是   | —    |
| <code>rows</code>               | <code>number</code>                                                 | —                                               | 是   | —    |
| <code>defaultStyle</code>       | <code>Style</code>                                                  | <code>() =&gt; ({})</code>                      | 否   | —    |
| <code>autoResize</code>         | <code>boolean</code>                                                | <code>false</code>                              | 否   | —    |
| <code>minCols</code>            | <code>number</code>                                                 | <code>1</code>                                  | 否   | —    |
| <code>minRows</code>            | <code>number</code>                                                 | <code>1</code>                                  | 否   | —    |
| <code>recordEvents</code>       | <code>((e: TerminalEventRecord) =&gt; void) &#124; undefined</code> | <code>undefined</code>                          | 否   | —    |
| <code>inputPlugins</code>       | <code>readonly TInputPlugin[]</code>                                | <code>() =&gt; [defaultTInputHostPlugin]</code> | 否   | —    |
| <code>pathPickerProvider</code> | <code>PathPickerProvider</code>                                     | <code>undefined</code>                          | 否   | —    |
| <code>debugIme</code>           | <code>boolean</code>                                                | <code>false</code>                              | 否   | —    |
| <code>debugTrace</code>         | <code>boolean</code>                                                | <code>false</code>                              | 否   | —    |
| <code>domRendererOptions</code> | <code>DomRendererOptions</code>                                     | <code>undefined</code>                          | 否   | —    |
| <code>clipboard</code>          | <code>ClipboardApi</code>                                           | <code>undefined</code>                          | 否   | —    |
| <code>selection</code>          | <code>TerminalProviderSelectionConfig</code>                        | <code>false</code>                              | 否   | —    |

### Events

| 名称                       | Payload                                                           | 说明 |
| -------------------------- | ----------------------------------------------------------------- | ---- |
| <code>selectionCopy</code> | <code>(\_payload: TerminalSelectionCopyPayload) =&gt; true</code> | —    |

## TFlow

源码：`src/vue/components/TFlow.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                   | 类型                   | 默认值                            | 必填 | 说明 |
| ---------------------- | ---------------------- | --------------------------------- | ---- | ---- |
| <code>x</code>         | <code>number</code>    | —                                 | 是   | —    |
| <code>y</code>         | <code>number</code>    | —                                 | 是   | —    |
| <code>w</code>         | <code>number</code>    | —                                 | 是   | —    |
| <code>h</code>         | <code>number</code>    | —                                 | 是   | —    |
| <code>items</code>     | <code>unknown[]</code> | —                                 | 是   | —    |
| <code>direction</code> | <code>Direction</code> | <code>&quot;vertical&quot;</code> | 否   | —    |
| <code>gap</code>       | <code>number</code>    | <code>0</code>                    | 否   | —    |
| <code>itemSize</code>  | <code>number</code>    | <code>1</code>                    | 否   | —    |
| <code>zIndex</code>    | <code>number</code>    | <code>0</code>                    | 否   | —    |

### Events

—

## TInput

源码：`src/vue/components/TInput.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                                     | 类型                                                                                             | 默认值                         | 必填 | 说明 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ---- | ---- |
| <code>x</code>                           | <code>number</code>                                                                              | —                              | 是   | —    |
| <code>y</code>                           | <code>number</code>                                                                              | —                              | 是   | —    |
| <code>w</code>                           | <code>number</code>                                                                              | —                              | 是   | —    |
| <code>h</code>                           | <code>number</code>                                                                              | <code>1</code>                 | 否   | —    |
| <code>zIndex</code>                      | <code>number</code>                                                                              | <code>0</code>                 | 否   | —    |
| <code>modelValue</code>                  | <code>string</code>                                                                              | —                              | 是   | —    |
| <code>cursorToEndOnExternalUpdate</code> | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>cursorToEndOnFirstFocus</code>     | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>placeholder</code>                 | <code>string</code>                                                                              | <code>&quot;&quot;</code>      | 否   | —    |
| <code>placeholderWhenFocused</code>      | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>style</code>                       | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>autoFocus</code>                   | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>cursorBlink</code>                 | <code>boolean</code>                                                                             | <code>true</code>              | 否   | —    |
| <code>cursorShape</code>                 | <code>&quot;block&quot; &#124; &quot;underline&quot; &#124; &quot;bar&quot;</code>               | <code>&quot;block&quot;</code> | 否   | —    |
| <code>blinkInterval</code>               | <code>number</code>                                                                              | <code>500</code>               | 否   | —    |
| <code>promptSuggestions</code>           | <code>readonly PromptSuggestion[]</code>                                                         | <code>() =&gt; []</code>       | 否   | —    |
| <code>promptTrigger</code>               | <code>string</code>                                                                              | <code>&quot;/&quot;</code>     | 否   | —    |
| <code>promptTriggers</code>              | <code>readonly string[]</code>                                                                   | <code>undefined</code>         | 否   | —    |
| <code>promptMaxItems</code>              | <code>number</code>                                                                              | <code>6</code>                 | 否   | —    |
| <code>promptAlign</code>                 | <code>&quot;input&quot; &#124; &quot;center&quot;</code>                                         | <code>&quot;input&quot;</code> | 否   | —    |
| <code>promptSelectedStyle</code>         | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>promptPopupStyle</code>            | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>promptPopupBorderStyle</code>      | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>promptPopupMatchStyle</code>       | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>skillTrigger</code>                | <code>string</code>                                                                              | <code>&quot;&quot;</code>      | 否   | —    |
| <code>skillSuggestions</code>            | <code>readonly PromptSuggestion[]</code>                                                         | <code>undefined</code>         | 否   | —    |
| <code>skillHighlightStyle</code>         | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>mentionTrigger</code>              | <code>string</code>                                                                              | <code>&quot;@&quot;</code>     | 否   | —    |
| <code>mentionWorkspace</code>            | <code>string</code>                                                                              | <code>&quot;&quot;</code>      | 否   | —    |
| <code>mentionMode</code>                 | <code>PathPickMode</code>                                                                        | <code>&quot;file&quot;</code>  | 否   | —    |
| <code>mentionShowHidden</code>           | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>mentionSuggestions</code>          | <code>readonly PromptSuggestion[]</code>                                                         | <code>() =&gt; []</code>       | 否   | —    |
| <code>mentionMaxItems</code>             | <code>number</code>                                                                              | <code>8</code>                 | 否   | —    |
| <code>mentionChipStyle</code>            | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>multilineChipStyle</code>          | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | —    |
| <code>dedupeMentions</code>              | <code>boolean</code>                                                                             | <code>true</code>              | 否   | —    |
| <code>collectMentions</code>             | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>mentions</code>                    | <code>readonly string[]</code>                                                                   | <code>() =&gt; []</code>       | 否   | —    |
| <code>collapseMultiline</code>           | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>multilineTexts</code>              | <code>readonly string[]</code>                                                                   | <code>() =&gt; []</code>       | 否   | —    |
| <code>secret</code>                      | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>maskChar</code>                    | <code>string</code>                                                                              | <code>&quot;•&quot;</code>     | 否   | —    |
| <code>submitOnEnter</code>               | <code>boolean</code>                                                                             | <code>true</code>              | 否   | —    |
| <code>clearOnEscape</code>               | <code>boolean</code>                                                                             | <code>false</code>             | 否   | —    |
| <code>plugins</code>                     | <code>readonly TInputPlugin[]</code>                                                             | <code>() =&gt; []</code>       | 否   | —    |
| <code>pasteImageHandler</code>           | <code>() =&gt; Promise&lt;string &#124; null&gt; &#124; string &#124; null</code>                | <code>undefined</code>         | 否   | —    |
| <code>filePasteHandler</code>            | <code>(absPath: string) =&gt; Promise&lt;string &#124; null&gt; &#124; string &#124; null</code> | <code>undefined</code>         | 否   | —    |

### Events

| 名称                               | Payload | 说明 |
| ---------------------------------- | ------- | ---- |
| <code>update:modelValue</code>     | —       | —    |
| <code>input</code>                 | —       | —    |
| <code>change</code>                | —       | —    |
| <code>keydown</code>               | —       | —    |
| <code>focus</code>                 | —       | —    |
| <code>blur</code>                  | —       | —    |
| <code>pointerenter</code>          | —       | —    |
| <code>pointerleave</code>          | —       | —    |
| <code>update:mentions</code>       | —       | —    |
| <code>mentionClick</code>          | —       | —    |
| <code>update:multilineTexts</code> | —       | —    |
| <code>multilineClick</code>        | —       | —    |
| <code>validationError</code>       | —       | —    |

## TInputBox

源码：`src/vue/components/TInputBox.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                       | 类型                                                                               | 默认值                         | 必填 | 说明 |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ | ---- | ---- |
| <code>x</code>             | <code>number</code>                                                                | —                              | 是   | —    |
| <code>y</code>             | <code>number</code>                                                                | —                              | 是   | —    |
| <code>w</code>             | <code>number</code>                                                                | —                              | 是   | —    |
| <code>h</code>             | <code>number</code>                                                                | —                              | 是   | —    |
| <code>zIndex</code>        | <code>number</code>                                                                | <code>0</code>                 | 否   | —    |
| <code>title</code>         | <code>string</code>                                                                | <code>&quot;&quot;</code>      | 否   | —    |
| <code>padding</code>       | <code>number</code>                                                                | <code>0</code>                 | 否   | —    |
| <code>modelValue</code>    | <code>string</code>                                                                | —                              | 是   | —    |
| <code>placeholder</code>   | <code>string</code>                                                                | <code>&quot;&quot;</code>      | 否   | —    |
| <code>style</code>         | <code>Style</code>                                                                 | <code>undefined</code>         | 否   | —    |
| <code>autoFocus</code>     | <code>boolean</code>                                                               | <code>false</code>             | 否   | —    |
| <code>plugins</code>       | <code>readonly TInputPlugin[]</code>                                               | <code>() =&gt; []</code>       | 否   | —    |
| <code>cursorBlink</code>   | <code>boolean</code>                                                               | <code>true</code>              | 否   | —    |
| <code>cursorShape</code>   | <code>&quot;block&quot; &#124; &quot;underline&quot; &#124; &quot;bar&quot;</code> | <code>&quot;block&quot;</code> | 否   | —    |
| <code>blinkInterval</code> | <code>number</code>                                                                | <code>500</code>               | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>input</code>             | —       | —    |
| <code>change</code>            | —       | —    |
| <code>keydown</code>           | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |

## TJsonEditor

源码：`src/vue/components/TJsonEditor.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                                     | 类型                                  | 默认值                                            | 必填 | 说明 |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------- | ---- | ---- |
| <code>x</code>                           | <code>number</code>                   | —                                                 | 是   | —    |
| <code>y</code>                           | <code>number</code>                   | —                                                 | 是   | —    |
| <code>w</code>                           | <code>number</code>                   | —                                                 | 是   | —    |
| <code>h</code>                           | <code>number</code>                   | <code>8</code>                                    | 否   | —    |
| <code>zIndex</code>                      | <code>number</code>                   | <code>0</code>                                    | 否   | —    |
| <code>modelValue</code>                  | <code>string</code>                   | —                                                 | 是   | —    |
| <code>placeholder</code>                 | <code>string</code>                   | <code>&quot;&quot;</code>                         | 否   | —    |
| <code>style</code>                       | <code>Style</code>                    | <code>undefined</code>                            | 否   | —    |
| <code>showIndentGuides</code>            | <code>boolean</code>                  | <code>true</code>                                 | 否   | —    |
| <code>indentSize</code>                  | <code>number</code>                   | <code>2</code>                                    | 否   | —    |
| <code>guideColors</code>                 | <code>readonly AnsiColorName[]</code> | <code>() =&gt; [...DEFAULT\_GUIDE\_COLORS]</code> | 否   | —    |
| <code>autoFocus</code>                   | <code>boolean</code>                  | <code>false</code>                                | 否   | —    |
| <code>cursorToEndOnFirstFocus</code>     | <code>boolean</code>                  | <code>true</code>                                 | 否   | —    |
| <code>cursorToEndOnExternalUpdate</code> | <code>boolean</code>                  | <code>true</code>                                 | 否   | —    |
| <code>submitOnEnter</code>               | <code>boolean</code>                  | <code>false</code>                                | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>keydown</code>           | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>undo</code>              | —       | —    |
| <code>redo</code>              | —       | —    |
| <code>lintChange</code>        | —       | —    |
| <code>validationError</code>   | —       | —    |

## TList

源码：`src/vue/components/TList.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                     | 类型                  | 默认值                 | 必填 | 说明 |
| ------------------------ | --------------------- | ---------------------- | ---- | ---- |
| <code>x</code>           | <code>number</code>   | —                      | 是   | —    |
| <code>y</code>           | <code>number</code>   | —                      | 是   | —    |
| <code>w</code>           | <code>number</code>   | —                      | 是   | —    |
| <code>h</code>           | <code>number</code>   | —                      | 是   | —    |
| <code>zIndex</code>      | <code>number</code>   | <code>0</code>         | 否   | —    |
| <code>items</code>       | <code>string[]</code> | —                      | 是   | —    |
| <code>itemVersion</code> | <code>number</code>   | <code>0</code>         | 否   | —    |
| <code>modelValue</code>  | <code>number</code>   | <code>0</code>         | 否   | —    |
| <code>style</code>       | <code>Style</code>    | <code>undefined</code> | 否   | —    |
| <code>autoFocus</code>   | <code>boolean</code>  | <code>false</code>     | 否   | —    |
| <code>closeOnBlur</code> | <code>boolean</code>  | <code>false</code>     | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>change</code>            | —       | —    |
| <code>scroll</code>            | —       | —    |
| <code>close</code>             | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>keydown</code>           | —       | —    |

## TLogLinksPanel

源码：`src/vue/components/TLogLinksPanel.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                         | 类型                                      | 默认值                                      | 必填 | 说明 |
| ---------------------------- | ----------------------------------------- | ------------------------------------------- | ---- | ---- |
| <code>x</code>               | <code>number</code>                       | —                                           | 是   | —    |
| <code>y</code>               | <code>number</code>                       | —                                           | 是   | —    |
| <code>w</code>               | <code>number</code>                       | —                                           | 是   | —    |
| <code>h</code>               | <code>number</code>                       | —                                           | 是   | —    |
| <code>zIndex</code>          | <code>number</code>                       | <code>0</code>                              | 否   | —    |
| <code>links</code>           | <code>readonly TLogLinkPanelItem[]</code> | <code>() =&gt; []</code>                    | 否   | —    |
| <code>activeIndex</code>     | <code>number</code>                       | <code>-1</code>                             | 否   | —    |
| <code>style</code>           | <code>Style</code>                        | <code>undefined</code>                      | 否   | —    |
| <code>activeStyle</code>     | <code>Style</code>                        | <code>() =&gt; ({ inverse: true })</code>   | 否   | —    |
| <code>currentStyle</code>    | <code>Style</code>                        | <code>() =&gt; ({ bold: true })</code>      | 否   | —    |
| <code>hrefStyle</code>       | <code>Style</code>                        | <code>() =&gt; ({ underline: true })</code> | 否   | —    |
| <code>disabledStyle</code>   | <code>Style</code>                        | <code>() =&gt; ({ dim: true })</code>       | 否   | —    |
| <code>showLineNumbers</code> | <code>boolean</code>                      | <code>true</code>                           | 否   | —    |
| <code>showHref</code>        | <code>boolean</code>                      | <code>true</code>                           | 否   | —    |
| <code>focusable</code>       | <code>boolean</code>                      | <code>true</code>                           | 否   | —    |

### Events

| 名称                      | Payload | 说明 |
| ------------------------- | ------- | ---- |
| <code>select</code>       | —       | —    |
| <code>activate</code>     | —       | —    |
| <code>activeChange</code> | —       | —    |
| <code>focus</code>        | —       | —    |
| <code>blur</code>         | —       | —    |
| <code>keydown</code>      | —       | —    |

## TLogMinimap

源码：`src/vue/components/TLogMinimap.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                            | 类型                                             | 默认值                   | 必填 | 说明 |
| ------------------------------- | ------------------------------------------------ | ------------------------ | ---- | ---- |
| <code>x</code>                  | <code>number</code>                              | —                        | 是   | —    |
| <code>y</code>                  | <code>number</code>                              | —                        | 是   | —    |
| <code>w</code>                  | <code>number</code>                              | —                        | 是   | —    |
| <code>h</code>                  | <code>number</code>                              | —                        | 是   | —    |
| <code>zIndex</code>             | <code>number</code>                              | <code>0</code>           | 否   | —    |
| <code>metrics</code>            | <code>TLogMinimapMetrics &#124; null</code>      | <code>null</code>        | 否   | —    |
| <code>markers</code>            | <code>readonly TLogMinimapMarker[]</code>        | <code>() =&gt; []</code> | 否   | —    |
| <code>density</code>            | <code>readonly TLogMinimapDensityBucket[]</code> | <code>() =&gt; []</code> | 否   | —    |
| <code>style</code>              | <code>Style</code>                               | <code>undefined</code>   | 否   | —    |
| <code>densityStyle</code>       | <code>Style</code>                               | <code>undefined</code>   | 否   | —    |
| <code>markerStyle</code>        | <code>Style</code>                               | <code>undefined</code>   | 否   | —    |
| <code>currentMarkerStyle</code> | <code>Style</code>                               | <code>undefined</code>   | 否   | —    |
| <code>viewportStyle</code>      | <code>Style</code>                               | <code>undefined</code>   | 否   | —    |
| <code>estimatedStyle</code>     | <code>Style</code>                               | <code>undefined</code>   | 否   | —    |
| <code>showMarkers</code>        | <code>boolean</code>                             | <code>true</code>        | 否   | —    |
| <code>showDensity</code>        | <code>boolean</code>                             | <code>true</code>        | 否   | —    |
| <code>showViewport</code>       | <code>boolean</code>                             | <code>true</code>        | 否   | —    |

### Events

| 名称                     | Payload | 说明 |
| ------------------------ | ------- | ---- |
| <code>scrollTo</code>    | —       | —    |
| <code>markerClick</code> | —       | —    |

## TLogScrollbar

源码：`src/vue/components/TLogScrollbar.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                            | 类型                                          | 默认值                                                            | 必填 | 说明 |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ---- | ---- |
| <code>x</code>                  | <code>number</code>                           | —                                                                 | 是   | —    |
| <code>y</code>                  | <code>number</code>                           | —                                                                 | 是   | —    |
| <code>h</code>                  | <code>number</code>                           | —                                                                 | 是   | —    |
| <code>zIndex</code>             | <code>number</code>                           | <code>0</code>                                                    | 否   | —    |
| <code>metrics</code>            | <code>TLogScrollbarMetrics &#124; null</code> | <code>null</code>                                                 | 否   | —    |
| <code>style</code>              | <code>Style</code>                            | <code>undefined</code>                                            | 否   | —    |
| <code>thumbStyle</code>         | <code>Style</code>                            | <code>undefined</code>                                            | 否   | —    |
| <code>trackStyle</code>         | <code>Style</code>                            | <code>undefined</code>                                            | 否   | —    |
| <code>measuringStyle</code>     | <code>Style</code>                            | <code>undefined</code>                                            | 否   | —    |
| <code>markers</code>            | <code>readonly TLogScrollbarMarker[]</code>   | <code>() =&gt; []</code>                                          | 否   | —    |
| <code>markerStyle</code>        | <code>Style</code>                            | <code>() =&gt; ({ fg: &quot;yellowBright&quot; })</code>          | 否   | —    |
| <code>currentMarkerStyle</code> | <code>Style</code>                            | <code>() =&gt; ({ fg: &quot;redBright&quot;, bold: true })</code> | 否   | —    |
| <code>showMarkers</code>        | <code>boolean</code>                          | <code>true</code>                                                 | 否   | —    |
| <code>showArrows</code>         | <code>boolean</code>                          | <code>false</code>                                                | 否   | —    |

### Events

| 名称                     | Payload | 说明 |
| ------------------------ | ------- | ---- |
| <code>scrollTo</code>    | —       | —    |
| <code>scrollBy</code>    | —       | —    |
| <code>markerClick</code> | —       | —    |

## TLogSearchBar

源码：`src/vue/components/TLogSearchBar.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                             | 类型                            | 默认值                                                            | 必填 | 说明 |
| -------------------------------- | ------------------------------- | ----------------------------------------------------------------- | ---- | ---- |
| <code>x</code>                   | <code>number</code>             | —                                                                 | 是   | —    |
| <code>y</code>                   | <code>number</code>             | —                                                                 | 是   | —    |
| <code>w</code>                   | <code>number</code>             | —                                                                 | 是   | —    |
| <code>zIndex</code>              | <code>number</code>             | <code>0</code>                                                    | 否   | —    |
| <code>state</code>               | <code>TLogSearchBarState</code> | —                                                                 | 是   | —    |
| <code>placeholder</code>         | <code>string</code>             | <code>&quot;Search…&quot;</code>                                  | 否   | —    |
| <code>style</code>               | <code>Style</code>              | <code>undefined</code>                                            | 否   | —    |
| <code>inputStyle</code>          | <code>Style</code>              | <code>undefined</code>                                            | 否   | —    |
| <code>activeStyle</code>         | <code>Style</code>              | <code>() =&gt; ({ inverse: true })</code>                         | 否   | —    |
| <code>errorStyle</code>          | <code>Style</code>              | <code>() =&gt; ({ fg: &quot;redBright&quot;, bold: true })</code> | 否   | —    |
| <code>disabledStyle</code>       | <code>Style</code>              | <code>() =&gt; ({ dim: true })</code>                             | 否   | —    |
| <code>toggleStyle</code>         | <code>Style</code>              | <code>undefined</code>                                            | 否   | —    |
| <code>focusable</code>           | <code>boolean</code>            | <code>true</code>                                                 | 否   | —    |
| <code>showModeToggle</code>      | <code>boolean</code>            | <code>true</code>                                                 | 否   | —    |
| <code>showCaseToggle</code>      | <code>boolean</code>            | <code>true</code>                                                 | 否   | —    |
| <code>showWholeWordToggle</code> | <code>boolean</code>            | <code>true</code>                                                 | 否   | —    |
| <code>showCount</code>           | <code>boolean</code>            | <code>true</code>                                                 | 否   | —    |
| <code>showNavigation</code>      | <code>boolean</code>            | <code>true</code>                                                 | 否   | —    |

### Events

| 名称                              | Payload | 说明 |
| --------------------------------- | ------- | ---- |
| <code>update</code>               | —       | —    |
| <code>update:query</code>         | —       | —    |
| <code>update:mode</code>          | —       | —    |
| <code>update:caseSensitive</code> | —       | —    |
| <code>update:wholeWord</code>     | —       | —    |
| <code>previous</code>             | —       | —    |
| <code>next</code>                 | —       | —    |
| <code>clear</code>                | —       | —    |
| <code>focus</code>                | —       | —    |
| <code>blur</code>                 | —       | —    |
| <code>keydown</code>              | —       | —    |

## TLogSearchPager

源码：`src/vue/components/TLogSearchPager.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                       | 类型                                          | 默认值                                                            | 必填 | 说明 |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ---- | ---- |
| <code>x</code>             | <code>number</code>                           | —                                                                 | 是   | —    |
| <code>y</code>             | <code>number</code>                           | —                                                                 | 是   | —    |
| <code>w</code>             | <code>number</code>                           | —                                                                 | 是   | —    |
| <code>zIndex</code>        | <code>number</code>                           | <code>0</code>                                                    | 否   | —    |
| <code>state</code>         | <code>TLogSearchPagerState &#124; null</code> | <code>null</code>                                                 | 否   | —    |
| <code>style</code>         | <code>Style</code>                            | <code>undefined</code>                                            | 否   | —    |
| <code>activeStyle</code>   | <code>Style</code>                            | <code>undefined</code>                                            | 否   | —    |
| <code>disabledStyle</code> | <code>Style</code>                            | <code>() =&gt; ({ dim: true })</code>                             | 否   | —    |
| <code>errorStyle</code>    | <code>Style</code>                            | <code>() =&gt; ({ fg: &quot;redBright&quot;, bold: true })</code> | 否   | —    |
| <code>showCount</code>     | <code>boolean</code>                          | <code>true</code>                                                 | 否   | —    |

### Events

| 名称                      | Payload | 说明 |
| ------------------------- | ------- | ---- |
| <code>previousPage</code> | —       | —    |
| <code>nextPage</code>     | —       | —    |
| <code>pageChange</code>   | —       | —    |

## TLogSearchResults

源码：`src/vue/components/TLogSearchResults.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                         | 类型                                         | 默认值                                      | 必填 | 说明 |
| ---------------------------- | -------------------------------------------- | ------------------------------------------- | ---- | ---- |
| <code>x</code>               | <code>number</code>                          | —                                           | 是   | —    |
| <code>y</code>               | <code>number</code>                          | —                                           | 是   | —    |
| <code>w</code>               | <code>number</code>                          | —                                           | 是   | —    |
| <code>h</code>               | <code>number</code>                          | —                                           | 是   | —    |
| <code>zIndex</code>          | <code>number</code>                          | <code>0</code>                              | 否   | —    |
| <code>results</code>         | <code>readonly TLogSearchResultItem[]</code> | <code>() =&gt; []</code>                    | 否   | —    |
| <code>activeIndex</code>     | <code>number</code>                          | <code>-1</code>                             | 否   | —    |
| <code>style</code>           | <code>Style</code>                           | <code>undefined</code>                      | 否   | —    |
| <code>activeStyle</code>     | <code>Style</code>                           | <code>() =&gt; ({ inverse: true })</code>   | 否   | —    |
| <code>matchStyle</code>      | <code>Style</code>                           | <code>() =&gt; ({ underline: true })</code> | 否   | —    |
| <code>currentStyle</code>    | <code>Style</code>                           | <code>() =&gt; ({ bold: true })</code>      | 否   | —    |
| <code>showLineNumbers</code> | <code>boolean</code>                         | <code>true</code>                           | 否   | —    |
| <code>focusable</code>       | <code>boolean</code>                         | <code>true</code>                           | 否   | —    |

### Events

| 名称                      | Payload | 说明 |
| ------------------------- | ------- | ---- |
| <code>select</code>       | —       | —    |
| <code>activeChange</code> | —       | —    |
| <code>keydown</code>      | —       | —    |
| <code>focus</code>        | —       | —    |
| <code>blur</code>         | —       | —    |

## TLogView

源码：`src/vue/components/TLogView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                            | 类型                                                        | 默认值                                                | 必填 | 说明 |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ---- | ---- |
| <code>x</code>                  | <code>number</code>                                         | —                                                     | 是   | —    |
| <code>y</code>                  | <code>number</code>                                         | —                                                     | 是   | —    |
| <code>w</code>                  | <code>number</code>                                         | —                                                     | 是   | —    |
| <code>h</code>                  | <code>number</code>                                         | —                                                     | 是   | —    |
| <code>zIndex</code>             | <code>number</code>                                         | <code>0</code>                                        | 否   | —    |
| <code>source</code>             | <code>TLogDataSource</code>                                 | —                                                     | 是   | —    |
| <code>version</code>            | <code>number</code>                                         | —                                                     | 是   | —    |
| <code>scrollTop</code>          | <code>number</code>                                         | <code>undefined</code>                                | 否   | —    |
| <code>defaultScrollTop</code>   | <code>number</code>                                         | <code>undefined</code>                                | 否   | —    |
| <code>style</code>              | <code>Style</code>                                          | <code>undefined</code>                                | 否   | —    |
| <code>autoFocus</code>          | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —    |
| <code>selectable</code>         | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —    |
| <code>autoStickToBottom</code>  | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —    |
| <code>overscan</code>           | <code>number</code>                                         | <code>2</code>                                        | 否   | —    |
| <code>wrap</code>               | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —    |
| <code>visualIndexMode</code>    | <code>&quot;estimated&quot; &#124; &quot;exact&quot;</code> | <code>&quot;estimated&quot;</code>                    | 否   | —    |
| <code>visualIndexOptions</code> | <code>TLogViewVisualIndexOptions</code>                     | <code>undefined</code>                                | 否   | —    |
| <code>ansi</code>               | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —    |
| <code>links</code>              | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —    |
| <code>linkStyle</code>          | <code>Style</code>                                          | <code>() =&gt; ({ underline: true })</code>           | 否   | —    |
| <code>keyboardLinks</code>      | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —    |
| <code>linkFocusStyle</code>     | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true })</code>             | 否   | —    |
| <code>searchQuery</code>        | <code>string</code>                                         | <code>&quot;&quot;</code>                             | 否   | —    |
| <code>searchOptions</code>      | <code>TLogViewSearchOptions</code>                          | <code>undefined</code>                                | 否   | —    |
| <code>highlightMatches</code>   | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —    |
| <code>matchStyle</code>         | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true })</code>             | 否   | —    |
| <code>currentMatchStyle</code>  | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true, bold: true })</code> | 否   | —    |
| <code>rowScrollMode</code>      | <code>RowScrollMode</code>                                  | <code>&quot;off&quot;</code>                          | 否   | —    |

### Events

| 名称                            | Payload | 说明 |
| ------------------------------- | ------- | ---- |
| <code>scroll</code>             | —       | —    |
| <code>update:scrollTop</code>   | —       | —    |
| <code>update:searchQuery</code> | —       | —    |
| <code>search</code>             | —       | —    |
| <code>searchMatch</code>        | —       | —    |
| <code>searchMarkers</code>      | —       | —    |
| <code>linkClick</code>          | —       | —    |
| <code>linkFocus</code>          | —       | —    |
| <code>linkActivate</code>       | —       | —    |
| <code>visualIndex</code>        | —       | —    |
| <code>focus</code>              | —       | —    |
| <code>blur</code>               | —       | —    |
| <code>keydown</code>            | —       | —    |

## TLogVirtualLinksPanel

源码：`src/vue/components/TLogVirtualLinksPanel.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                         | 类型                                      | 默认值                       | 必填 | 说明 |
| ---------------------------- | ----------------------------------------- | ---------------------------- | ---- | ---- |
| <code>x</code>               | <code>number</code>                       | —                            | 是   | —    |
| <code>y</code>               | <code>number</code>                       | —                            | 是   | —    |
| <code>w</code>               | <code>number</code>                       | —                            | 是   | —    |
| <code>h</code>               | <code>number</code>                       | —                            | 是   | —    |
| <code>zIndex</code>          | <code>number</code>                       | <code>0</code>               | 否   | —    |
| <code>links</code>           | <code>readonly TLogLinkPanelItem[]</code> | <code>() =&gt; []</code>     | 否   | —    |
| <code>modelValue</code>      | <code>number</code>                       | <code>-1</code>              | 否   | —    |
| <code>style</code>           | <code>Style</code>                        | <code>undefined</code>       | 否   | —    |
| <code>activeStyle</code>     | <code>Style</code>                        | <code>undefined</code>       | 否   | —    |
| <code>showLineNumbers</code> | <code>boolean</code>                      | <code>true</code>            | 否   | —    |
| <code>rowScrollMode</code>   | <code>RowScrollMode</code>                | <code>&quot;off&quot;</code> | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>activeChange</code>      | —       | —    |
| <code>select</code>            | —       | —    |
| <code>activate</code>          | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>keydown</code>           | —       | —    |
| <code>scroll</code>            | —       | —    |

## TLogVirtualSearchResults

源码：`src/vue/components/TLogVirtualSearchResults.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                         | 类型                                                                | 默认值                       | 必填 | 说明 |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------- | ---- | ---- |
| <code>x</code>               | <code>number</code>                                                 | —                            | 是   | —    |
| <code>y</code>               | <code>number</code>                                                 | —                            | 是   | —    |
| <code>w</code>               | <code>number</code>                                                 | —                            | 是   | —    |
| <code>h</code>               | <code>number</code>                                                 | —                            | 是   | —    |
| <code>zIndex</code>          | <code>number</code>                                                 | <code>0</code>               | 否   | —    |
| <code>itemCount</code>       | <code>number</code>                                                 | —                            | 是   | —    |
| <code>itemVersion</code>     | <code>number</code>                                                 | —                            | 是   | —    |
| <code>getItem</code>         | <code>(index: number) =&gt; TLogSearchResultItem &#124; null</code> | —                            | 是   | —    |
| <code>modelValue</code>      | <code>number</code>                                                 | <code>-1</code>              | 否   | —    |
| <code>style</code>           | <code>Style</code>                                                  | <code>undefined</code>       | 否   | —    |
| <code>activeStyle</code>     | <code>Style</code>                                                  | <code>undefined</code>       | 否   | —    |
| <code>showLineNumbers</code> | <code>boolean</code>                                                | <code>true</code>            | 否   | —    |
| <code>rowScrollMode</code>   | <code>RowScrollMode</code>                                          | <code>&quot;off&quot;</code> | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>activeChange</code>      | —       | —    |
| <code>select</code>            | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>keydown</code>           | —       | —    |
| <code>scroll</code>            | —       | —    |

## TMultilineModal

源码：`src/vue/components/TMultilineModal.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                 | 类型                 | 默认值                                  | 必填 | 说明 |
| -------------------- | -------------------- | --------------------------------------- | ---- | ---- |
| <code>visible</code> | <code>boolean</code> | —                                       | 是   | —    |
| <code>content</code> | <code>string</code>  | —                                       | 是   | —    |
| <code>title</code>   | <code>string</code>  | <code>&quot;Multiline Text&quot;</code> | 否   | —    |
| <code>style</code>   | <code>Style</code>   | <code>undefined</code>                  | 否   | —    |
| <code>zIndex</code>  | <code>number</code>  | <code>1000</code>                       | 否   | —    |

### Events

| 名称               | Payload | 说明 |
| ------------------ | ------- | ---- |
| <code>close</code> | —       | —    |

## TPathPicker

源码：`src/vue/components/TPathPicker.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                        | 类型                            | 默认值                       | 必填 | 说明 |
| --------------------------- | ------------------------------- | ---------------------------- | ---- | ---- |
| <code>x</code>              | <code>number</code>             | —                            | 是   | —    |
| <code>y</code>              | <code>number</code>             | —                            | 是   | —    |
| <code>w</code>              | <code>number</code>             | —                            | 是   | —    |
| <code>h</code>              | <code>number</code>             | —                            | 是   | —    |
| <code>zIndex</code>         | <code>number</code>             | <code>0</code>               | 否   | —    |
| <code>workspace</code>      | <code>string</code>             | —                            | 是   | —    |
| <code>mode</code>           | <code>PathPickMode</code>       | <code>&quot;any&quot;</code> | 否   | —    |
| <code>modelValue</code>     | <code>string</code>             | —                            | 是   | —    |
| <code>placeholder</code>    | <code>string</code>             | <code>&quot;&quot;</code>    | 否   | —    |
| <code>style</code>          | <code>Style</code>              | <code>undefined</code>       | 否   | —    |
| <code>inputStyle</code>     | <code>Style</code>              | <code>undefined</code>       | 否   | —    |
| <code>activeStyle</code>    | <code>Style</code>              | <code>undefined</code>       | 否   | —    |
| <code>matchStyle</code>     | <code>Style</code>              | <code>undefined</code>       | 否   | —    |
| <code>autoFocus</code>      | <code>boolean</code>            | <code>false</code>           | 否   | —    |
| <code>showHidden</code>     | <code>boolean</code>            | <code>false</code>           | 否   | —    |
| <code>maxSuggestions</code> | <code>number</code>             | <code>50</code>              | 否   | —    |
| <code>provider</code>       | <code>PathPickerProvider</code> | <code>undefined</code>       | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>select</code>            | —       | —    |
| <code>invalid</code>           | —       | —    |
| <code>keydown</code>           | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |

## TRenderLayer

源码：`src/vue/components/TRenderLayer.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                | 类型                | 默认值         | 必填 | 说明 |
| ------------------- | ------------------- | -------------- | ---- | ---- |
| <code>zIndex</code> | <code>number</code> | <code>0</code> | 否   | —    |

### Events

—

## TRenderPlane

源码：`src/vue/components/TRenderPlane.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称               | 类型                             | 默认值                           | 必填 | 说明 |
| ------------------ | -------------------------------- | -------------------------------- | ---- | ---- |
| <code>plane</code> | <code>TerminalRenderPlane</code> | <code>&quot;default&quot;</code> | 否   | —    |

### Events

—

## TRouterView

源码：`src/vue/router/RouterView.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                      | 类型                               | 默认值            | 必填 | 说明 |
| ------------------------- | ---------------------------------- | ----------------- | ---- | ---- |
| <code>routes</code>       | <code>TerminalRouteRecord[]</code> | —                 | 是   | —    |
| <code>forceRemount</code> | <code>boolean</code>               | <code>true</code> | 否   | —    |

### Events

—

## TSelect

源码：`src/vue/components/TSelect.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                             | 类型                                 | 默认值                         | 必填 | 说明 |
| -------------------------------- | ------------------------------------ | ------------------------------ | ---- | ---- |
| <code>x</code>                   | <code>number</code>                  | —                              | 是   | —    |
| <code>y</code>                   | <code>number</code>                  | —                              | 是   | —    |
| <code>w</code>                   | <code>number</code>                  | —                              | 是   | —    |
| <code>h</code>                   | <code>number</code>                  | —                              | 是   | —    |
| <code>zIndex</code>              | <code>number</code>                  | <code>0</code>                 | 否   | —    |
| <code>options</code>             | <code>SelectOption[]</code>          | —                              | 是   | —    |
| <code>modelValue</code>          | <code>number &#124; number[]</code>  | <code>0</code>                 | 否   | —    |
| <code>multiple</code>            | <code>boolean</code>                 | <code>false</code>             | 否   | —    |
| <code>multipleEmit</code>        | <code>TSelectMultipleEmitMode</code> | <code>&quot;value&quot;</code> | 否   | —    |
| <code>style</code>               | <code>Style</code>                   | <code>undefined</code>         | 否   | —    |
| <code>highlightStyle</code>      | <code>Style</code>                   | <code>undefined</code>         | 否   | —    |
| <code>matchStyle</code>          | <code>Style</code>                   | <code>undefined</code>         | 否   | —    |
| <code>highlightMatchStyle</code> | <code>Style</code>                   | <code>undefined</code>         | 否   | —    |
| <code>autoFocus</code>           | <code>boolean</code>                 | <code>false</code>             | 否   | —    |
| <code>closeOnBlur</code>         | <code>boolean</code>                 | <code>false</code>             | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>change</code>            | —       | —    |
| <code>confirm</code>           | —       | —    |
| <code>close</code>             | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>keydown</code>           | —       | —    |

## TText

源码：`src/vue/components/TText.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                 | 类型                 | 默认值                 | 必填 | 说明                                                                                                                                                                                                                                                                       |
| -------------------- | -------------------- | ---------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>x</code>       | <code>number</code>  | —                      | 是   | —                                                                                                                                                                                                                                                                          |
| <code>y</code>       | <code>number</code>  | —                      | 是   | —                                                                                                                                                                                                                                                                          |
| <code>zIndex</code>  | <code>number</code>  | <code>0</code>         | 否   | —                                                                                                                                                                                                                                                                          |
| <code>value</code>   | <code>string</code>  | —                      | 是   | —                                                                                                                                                                                                                                                                          |
| <code>w</code>       | <code>number</code>  | <code>undefined</code> | 否   | —                                                                                                                                                                                                                                                                          |
| <code>h</code>       | <code>number</code>  | <code>undefined</code> | 否   | —                                                                                                                                                                                                                                                                          |
| <code>style</code>   | <code>Style</code>   | <code>undefined</code> | 否   | —                                                                                                                                                                                                                                                                          |
| <code>clear</code>   | <code>boolean</code> | <code>true</code>      | 否   | —                                                                                                                                                                                                                                                                          |
| <code>wrap</code>    | <code>boolean</code> | <code>false</code>     | 否   | —                                                                                                                                                                                                                                                                          |
| <code>depsKey</code> | <code>unknown</code> | <code>undefined</code> | 否   | Optional key that participates in render-node dependency tracking.<br>Useful for forcing a repaint when the rendered output might change<br>even if `value`, `style`, and geometry are unchanged (e.g. external<br>terminal writes or higher-level virtualized row reuse). |

### Events

—

## TTransition

源码：`src/vue/components/TTransition.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                     | 类型                        | 默认值                 | 必填 | 说明 |
| ------------------------ | --------------------------- | ---------------------- | ---- | ---- |
| <code>show</code>        | <code>boolean</code>        | —                      | 是   | —    |
| <code>duration</code>    | <code>number</code>         | <code>200</code>       | 否   | —    |
| <code>beforeEnter</code> | <code>TransitionHook</code> | <code>undefined</code> | 否   | —    |
| <code>enter</code>       | <code>TransitionHook</code> | <code>undefined</code> | 否   | —    |
| <code>afterEnter</code>  | <code>TransitionHook</code> | <code>undefined</code> | 否   | —    |
| <code>beforeLeave</code> | <code>TransitionHook</code> | <code>undefined</code> | 否   | —    |
| <code>leave</code>       | <code>TransitionHook</code> | <code>undefined</code> | 否   | —    |
| <code>afterLeave</code>  | <code>TransitionHook</code> | <code>undefined</code> | 否   | —    |

### Events

—

## TView

源码：`src/vue/components/TView.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                           | 类型                                                       | 默认值                 | 必填 | 说明 |
| ------------------------------ | ---------------------------------------------------------- | ---------------------- | ---- | ---- |
| <code>x</code>                 | <code>number</code>                                        | —                      | 是   | —    |
| <code>y</code>                 | <code>number</code>                                        | —                      | 是   | —    |
| <code>w</code>                 | <code>number</code>                                        | —                      | 是   | —    |
| <code>h</code>                 | <code>number</code>                                        | —                      | 是   | —    |
| <code>zIndex</code>            | <code>number</code>                                        | <code>0</code>         | 否   | —    |
| <code>scrollX</code>           | <code>number</code>                                        | <code>0</code>         | 否   | —    |
| <code>scrollY</code>           | <code>number</code>                                        | <code>0</code>         | 否   | —    |
| <code>focusable</code>         | <code>boolean</code>                                       | <code>false</code>     | 否   | —    |
| <code>selectable</code>        | <code>boolean</code>                                       | <code>undefined</code> | 否   | —    |
| <code>selectionScrollBy</code> | <code>(deltaRows: number) =&gt; boolean &#124; void</code> | <code>undefined</code> | 否   | —    |
| <code>autoFocus</code>         | <code>boolean</code>                                       | <code>false</code>     | 否   | —    |

### Events

| 名称                             | Payload | 说明 |
| -------------------------------- | ------- | ---- |
| <code>clickCapture</code>        | —       | —    |
| <code>click</code>               | —       | —    |
| <code>dblclickCapture</code>     | —       | —    |
| <code>dblclick</code>            | —       | —    |
| <code>pointerdownCapture</code>  | —       | —    |
| <code>pointerdown</code>         | —       | —    |
| <code>pointerupCapture</code>    | —       | —    |
| <code>pointerup</code>           | —       | —    |
| <code>pointermoveCapture</code>  | —       | —    |
| <code>pointermove</code>         | —       | —    |
| <code>pointerenterCapture</code> | —       | —    |
| <code>pointerenter</code>        | —       | —    |
| <code>pointerleaveCapture</code> | —       | —    |
| <code>pointerleave</code>        | —       | —    |
| <code>wheelCapture</code>        | —       | —    |
| <code>wheel</code>               | —       | —    |
| <code>keydownCapture</code>      | —       | —    |
| <code>keydown</code>             | —       | —    |
| <code>keyupCapture</code>        | —       | —    |
| <code>keyup</code>               | —       | —    |
| <code>focusCapture</code>        | —       | —    |
| <code>focus</code>               | —       | —    |
| <code>blurCapture</code>         | —       | —    |
| <code>blur</code>                | —       | —    |

## TVirtualList

源码：`src/vue/components/TVirtualList.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                       | 类型                                                      | 默认值                       | 必填 | 说明 |
| -------------------------- | --------------------------------------------------------- | ---------------------------- | ---- | ---- |
| <code>x</code>             | <code>number</code>                                       | —                            | 是   | —    |
| <code>y</code>             | <code>number</code>                                       | —                            | 是   | —    |
| <code>w</code>             | <code>number</code>                                       | —                            | 是   | —    |
| <code>h</code>             | <code>number</code>                                       | —                            | 是   | —    |
| <code>zIndex</code>        | <code>number</code>                                       | <code>0</code>               | 否   | —    |
| <code>itemCount</code>     | <code>number</code>                                       | —                            | 是   | —    |
| <code>itemVersion</code>   | <code>number</code>                                       | —                            | 是   | —    |
| <code>getItem</code>       | <code>(index: number) =&gt; unknown</code>                | —                            | 是   | —    |
| <code>renderItem</code>    | <code>(item: unknown, index: number) =&gt; unknown</code> | <code>undefined</code>       | 否   | —    |
| <code>modelValue</code>    | <code>number</code>                                       | <code>0</code>               | 否   | —    |
| <code>scrollTop</code>     | <code>number</code>                                       | <code>undefined</code>       | 否   | —    |
| <code>style</code>         | <code>Style</code>                                        | <code>undefined</code>       | 否   | —    |
| <code>activeStyle</code>   | <code>Style</code>                                        | <code>undefined</code>       | 否   | —    |
| <code>autoFocus</code>     | <code>boolean</code>                                      | <code>false</code>           | 否   | —    |
| <code>selectionText</code> | <code>(item: unknown, index: number) =&gt; string</code>  | <code>undefined</code>       | 否   | —    |
| <code>selectable</code>    | <code>boolean</code>                                      | <code>false</code>           | 否   | —    |
| <code>rowScrollMode</code> | <code>RowScrollMode</code>                                | <code>&quot;off&quot;</code> | 否   | —    |

### Events

| 名称                           | Payload | 说明 |
| ------------------------------ | ------- | ---- |
| <code>update:modelValue</code> | —       | —    |
| <code>update:scrollTop</code>  | —       | —    |
| <code>change</code>            | —       | —    |
| <code>itemClick</code>         | —       | —    |
| <code>scroll</code>            | —       | —    |
| <code>focus</code>             | —       | —    |
| <code>blur</code>              | —       | —    |
| <code>keydown</code>           | —       | —    |
