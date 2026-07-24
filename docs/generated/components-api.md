# 组件 Props / Events（自动生成）

> 此文件由 `scripts/generate-component-api-docs.ts` 自动生成，请勿手改。

## 目录

- [T3DViewport](#t3dviewport)
- [TAgentTerminalGraphic](#tagentterminalgraphic)
- [TAgentTranscript](#tagenttranscript)
- [TAnchor](#tanchor)
- [TAutocompleteInput](#tautocompleteinput)
- [TBadge](#tbadge)
- [TBox](#tbox)
- [TBreadcrumb](#tbreadcrumb)
- [TCandlestickChart](#tcandlestickchart)
- [TCheckbox](#tcheckbox)
- [TCode](#tcode)
- [TCommandPalette](#tcommandpalette)
- [TContextMenu](#tcontextmenu)
- [TContributionGraph](#tcontributiongraph)
- [TDataTable](#tdatatable)
- [TDebugOverlay](#tdebugoverlay)
- [TDialog](#tdialog)
- [TDivider](#tdivider)
- [TerminalProvider](#terminalprovider)
- [TFlex](#tflex)
- [TFlexItem](#tflexitem)
- [TFlow](#tflow)
- [TForm](#tform)
- [TFormField](#tformfield)
- [TInput](#tinput)
- [TInputBox](#tinputbox)
- [TJsonEditor](#tjsoneditor)
- [TKeyHint](#tkeyhint)
- [TLineChart](#tlinechart)
- [TLink](#tlink)
- [TLinkifyText](#tlinkifytext)
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
- [TMarkdownText](#tmarkdowntext)
- [TMermaid](#tmermaid)
- [TMermaidText](#tmermaidtext)
- [TMultilineModal](#tmultilinemodal)
- [TPasswordInput](#tpasswordinput)
- [TPathPicker](#tpathpicker)
- [TPieChart](#tpiechart)
- [TPopover](#tpopover)
- [TProgress](#tprogress)
- [TRadioGroup](#tradiogroup)
- [TRenderLayer](#trenderlayer)
- [TRenderPlane](#trenderplane)
- [TRouterView](#trouterview)
- [TSelect](#tselect)
- [TSlider](#tslider)
- [TSpinner](#tspinner)
- [TSplitPane](#tsplitpane)
- [TStatusBar](#tstatusbar)
- [TSwitch](#tswitch)
- [TTable](#ttable)
- [TTabs](#ttabs)
- [TTag](#ttag)
- [TText](#ttext)
- [TThinkingView](#tthinkingview)
- [TToastViewport](#ttoastviewport)
- [TToolCallView](#ttoolcallview)
- [TToolLogView](#ttoollogview)
- [TTooltip](#ttooltip)
- [TTranscriptView](#ttranscriptview)
- [TTransition](#ttransition)
- [TTree](#ttree)
- [TUserMessageView](#tusermessageview)
- [TVideo](#tvideo)
- [TView](#tview)
- [TVirtualList](#tvirtuallist)
- [TVirtualMarkdown](#tvirtualmarkdown)

## T3DViewport

源码：`src/vue/components/T3DViewport.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                            | 类型                     | 默认值                                   | 必填 | 说明                                                                     |
| ------------------------------- | ------------------------ | ---------------------------------------- | ---- | ------------------------------------------------------------------------ |
| <code>x</code>                  | <code>number</code>      | —                                        | 是   | Horizontal position in terminal cells.                                   |
| <code>y</code>                  | <code>number</code>      | —                                        | 是   | Vertical position in terminal cells.                                     |
| <code>w</code>                  | <code>number</code>      | —                                        | 是   | Width in terminal cells.                                                 |
| <code>h</code>                  | <code>number</code>      | —                                        | 是   | Height in terminal cells.                                                |
| <code>zIndex</code>             | <code>number</code>      | <code>0</code>                           | 否   | Paint and pointer hit-test stacking order.                               |
| <code>renderer</code>           | <code>T3DRenderer</code> | —                                        | 是   | Pull renderer captured at mount; remount the component to replace it.    |
| <code>paused</code>             | <code>boolean</code>     | <code>false</code>                       | 否   | Stops frame pulling while true.                                          |
| <code>maxFps</code>             | <code>number</code>      | <code>DEFAULT_MAX_FPS</code>             | 否   | Maximum requested frames per second.                                     |
| <code>pixelWidth</code>         | <code>number</code>      | <code>undefined</code>                   | 否   | Requested source width in pixels; TVideo may adapt it for ASCII output.  |
| <code>pixelHeight</code>        | <code>number</code>      | <code>undefined</code>                   | 否   | Requested source height in pixels; TVideo may adapt it for ASCII output. |
| <code>fallback</code>           | <code>string</code>      | <code>&quot;[3D viewport]&quot;</code>   | 否   | Text displayed before a frame is available or after rendering fails.     |
| <code>style</code>              | <code>Style</code>       | <code>undefined</code>                   | 否   | Terminal style applied to fallback and ASCII output.                     |
| <code>clear</code>              | <code>boolean</code>     | <code>true</code>                        | 否   | Clears cells underneath each video frame.                                |
| <code>interactive</code>        | <code>boolean</code>     | <code>true</code>                        | 否   | Enables pointer orbit, wheel zoom, and hover motion tracking.            |
| <code>initialYaw</code>         | <code>number</code>      | <code>0</code>                           | 否   | Initial yaw angle in radians, also restored by resetMotion().            |
| <code>initialPitch</code>       | <code>number</code>      | <code>0</code>                           | 否   | Initial pitch angle in radians, also restored by resetMotion().          |
| <code>autoRotate</code>         | <code>boolean</code>     | <code>true</code>                        | 否   | Enables continuous yaw rotation when not dragging.                       |
| <code>autoRotateSpeed</code>    | <code>number</code>      | <code>DEFAULT_AUTO_ROTATE_SPEED</code>   | 否   | Automatic yaw rotation speed in radians per second.                      |
| <code>pointerSensitivity</code> | <code>number</code>      | <code>DEFAULT_POINTER_SENSITIVITY</code> | 否   | Drag sensitivity in radians per terminal cell.                           |
| <code>initialZoom</code>        | <code>number</code>      | <code>1</code>                           | 否   | Initial camera zoom, also restored by resetMotion().                     |
| <code>minZoom</code>            | <code>number</code>      | <code>DEFAULT_MIN_ZOOM</code>            | 否   | Minimum camera zoom accepted from wheel and trackpad gestures.           |
| <code>maxZoom</code>            | <code>number</code>      | <code>DEFAULT_MAX_ZOOM</code>            | 否   | Maximum camera zoom accepted from wheel and trackpad gestures.           |
| <code>zoomSensitivity</code>    | <code>number</code>      | <code>DEFAULT_ZOOM_SENSITIVITY</code>    | 否   | Zoom impulse per normalized wheel or trackpad unit.                      |

### Events

| 名称                      | Payload                               | 说明                                                      |
| ------------------------- | ------------------------------------- | --------------------------------------------------------- |
| <code>frame</code>        | <code>TVideoFrameEvent</code>         | A frame was committed by TVideo.                          |
| <code>error</code>        | <code>unknown</code>                  | Rendering or frame processing failed.                     |
| <code>objecthover</code>  | <code>T3DHitResult &#124; null</code> | Hovered renderer object changed, or cleared to null.      |
| <code>objectselect</code> | <code>T3DHitResult &#124; null</code> | Click-locked renderer object changed, or cleared to null. |

## TAgentTerminalGraphic

源码：`src/vue/components/TAgentTerminalGraphic.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/agent`

### Props

| 名称                                     | 类型                                                             | 默认值                                                 | 必填 | 说明 |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ | ---- | ---- |
| <code>x</code>                           | <code>number</code>                                              | —                                                      | 是   | —    |
| <code>y</code>                           | <code>number</code>                                              | —                                                      | 是   | —    |
| <code>w</code>                           | <code>number</code>                                              | —                                                      | 是   | —    |
| <code>h</code>                           | <code>number</code>                                              | <code>undefined</code>                                 | 否   | —    |
| <code>zIndex</code>                      | <code>number</code>                                              | <code>0</code>                                         | 否   | —    |
| <code>content</code>                     | <code>string</code>                                              | —                                                      | 是   | —    |
| <code>kind</code>                        | <code>TAgentTerminalGraphicKind</code>                           | <code>&quot;image&quot;</code>                         | 否   | —    |
| <code>fallback</code>                    | <code>string</code>                                              | <code>undefined</code>                                 | 否   | —    |
| <code>style</code>                       | <code>Style</code>                                               | <code>undefined</code>                                 | 否   | —    |
| <code>loadingStyle</code>                | <code>Style</code>                                               | <code>undefined</code>                                 | 否   | —    |
| <code>errorStyle</code>                  | <code>Style</code>                                               | <code>undefined</code>                                 | 否   | —    |
| <code>clear</code>                       | <code>boolean</code>                                             | <code>true</code>                                      | 否   | —    |
| <code>final</code>                       | <code>boolean</code>                                             | <code>true</code>                                      | 否   | —    |
| <code>streaming</code>                   | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>renderer</code>                    | <code>TAgentTerminalGraphicRenderer</code>                       | <code>undefined</code>                                 | 否   | —    |
| <code>loadingText</code>                 | <code>string</code>                                              | <code>&quot;Rendering terminal graphic...&quot;</code> | 否   | —    |
| <code>deferRenderUntilVisible</code>     | <code>boolean</code>                                             | <code>true</code>                                      | 否   | —    |
| <code>suspendRawWhileScrolling</code>    | <code>boolean</code>                                             | <code>true</code>                                      | 否   | —    |
| <code>suspendRenderWhileScrolling</code> | <code>boolean</code>                                             | <code>true</code>                                      | 否   | —    |
| <code>scrolling</code>                   | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>scrollVersion</code>               | <code>number</code>                                              | <code>0</code>                                         | 否   | —    |
| <code>placementMoveWithoutClear</code>   | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>preserveRawWhileRendering</code>   | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>suspended</code>                   | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>retainRawWhileCovered</code>       | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>ignoreRawCoverage</code>           | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>ignoreSamePlaneRawCoverage</code>  | <code>boolean</code>                                             | <code>false</code>                                     | 否   | —    |
| <code>cacheKey</code>                    | <code>string</code>                                              | <code>undefined</code>                                 | 否   | —    |
| <code>placementKey</code>                | <code>string</code>                                              | <code>undefined</code>                                 | 否   | —    |
| <code>trace</code>                       | <code>(event: TAgentTerminalGraphicTraceEvent) =&gt; void</code> | <code>undefined</code>                                 | 否   | —    |

### Events

—

## TAgentTranscript

源码：`src/vue/components/TTranscriptView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/agent`

### Props

| 名称                           | 类型                               | 默认值                                   | 必填 | 说明 |
| ------------------------------ | ---------------------------------- | ---------------------------------------- | ---- | ---- |
| <code>x</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>y</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>w</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>h</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>zIndex</code>            | <code>number</code>                | <code>0</code>                           | 否   | —    |
| <code>source</code>            | <code>TTranscriptDataSource</code> | —                                        | 是   | —    |
| <code>version</code>           | <code>number</code>                | —                                        | 是   | —    |
| <code>scrollTop</code>         | <code>number</code>                | <code>undefined</code>                   | 否   | —    |
| <code>defaultScrollTop</code>  | <code>number</code>                | <code>0</code>                           | 否   | —    |
| <code>autoStickToBottom</code> | <code>boolean</code>               | <code>false</code>                       | 否   | —    |
| <code>selectable</code>        | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>wrap</code>              | <code>boolean</code>               | <code>false</code>                       | 否   | —    |
| <code>style</code>             | <code>Style</code>                 | <code>undefined</code>                   | 否   | —    |
| <code>hoverStyle</code>        | <code>Style</code>                 | <code>undefined</code>                   | 否   | —    |
| <code>focusStyle</code>        | <code>Style</code>                 | <code>undefined</code>                   | 否   | —    |
| <code>autoFocus</code>         | <code>boolean</code>               | <code>false</code>                       | 否   | —    |
| <code>focusable</code>         | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>wheelScroll</code>       | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>keyboardRegions</code>   | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>rowScrollMode</code>     | <code>RowScrollMode</code>         | <code>&quot;unsafe-full-row&quot;</code> | 否   | —    |

### Events

| 名称                          | Payload | 说明 |
| ----------------------------- | ------- | ---- |
| <code>scroll</code>           | —       | —    |
| <code>update:scrollTop</code> | —       | —    |
| <code>rowClick</code>         | —       | —    |
| <code>actionClick</code>      | —       | —    |
| <code>linkClick</code>        | —       | —    |
| <code>foldToggle</code>       | —       | —    |
| <code>toolClick</code>        | —       | —    |
| <code>hoverRegion</code>      | —       | —    |

## TAnchor

源码：`src/vue/components/TAnchor.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

## TAutocompleteInput

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                               | 类型                                         | 默认值                                              | 必填 | 说明                                                           |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------------- | ---- | -------------------------------------------------------------- |
| <code>x</code>                     | <code>number</code>                          | —                                                   | 是   | Left position in terminal cells.                               |
| <code>y</code>                     | <code>number</code>                          | —                                                   | 是   | Top position in terminal cells.                                |
| <code>w</code>                     | <code>number</code>                          | —                                                   | 是   | Width in terminal cells.                                       |
| <code>h</code>                     | <code>number</code>                          | <code>5</code>                                      | 否   | Height in terminal cells.                                      |
| <code>zIndex</code>                | <code>number</code>                          | <code>0</code>                                      | 否   | Render and event ordering within the current plane.            |
| <code>modelValue</code>            | <code>string</code>                          | —                                                   | 是   | Controlled component value.                                    |
| <code>suggestions</code>           | <code>readonly TAutocompleteOption[]</code>  | <code>() =&gt; []</code>                            | 否   | Autocomplete suggestions.                                      |
| <code>suggestionProvider</code>    | <code>TAutocompleteSuggestionProvider</code> | <code>undefined</code>                              | 否   | Async suggestion provider called with the current input value. |
| <code>open</code>                  | <code>boolean</code>                         | <code>undefined</code>                              | 否   | Controlled suggestion popup visibility.                        |
| <code>highlightedIndex</code>      | <code>number</code>                          | <code>0</code>                                      | 否   | Controlled highlighted suggestion index.                       |
| <code>placeholder</code>           | <code>string</code>                          | <code>&quot;&quot;</code>                           | 否   | Placeholder text shown when the input is empty.                |
| <code>debounce</code>              | <code>number</code>                          | <code>0</code>                                      | 否   | Delay before calling an async provider, in milliseconds.       |
| <code>minChars</code>              | <code>number</code>                          | <code>0</code>                                      | 否   | Minimum input length before suggestions are shown or loaded.   |
| <code>filterLocal</code>           | <code>boolean</code>                         | <code>false</code>                                  | 否   | Filters provided suggestions against the input value.          |
| <code>closeOnSelect</code>         | <code>boolean</code>                         | <code>true</code>                                   | 否   | Closes suggestions after a suggestion is selected.             |
| <code>loadingText</code>           | <code>string</code>                          | <code>&quot;Loading...&quot;</code>                 | 否   | Text rendered while async loading is pending.                  |
| <code>emptyText</code>             | <code>string</code>                          | <code>&quot;&quot;</code>                           | 否   | Text rendered when there are no rows or items.                 |
| <code>errorText</code>             | <code>string</code>                          | <code>&quot;Unable to load suggestions&quot;</code> | 否   | Text rendered when async loading fails.                        |
| <code>style</code>                 | <code>Style</code>                           | <code>undefined</code>                              | 否   | Base terminal cell style override.                             |
| <code>suggestionStyle</code>       | <code>Style</code>                           | <code>undefined</code>                              | 否   | Style override for suggestion rows.                            |
| <code>activeSuggestionStyle</code> | <code>Style</code>                           | <code>() =&gt; ({ inverse: true })</code>           | 否   | Style override for the active suggestion row.                  |

### Events

| 名称                                 | Payload                                    | 说明                                                                                    |
| ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| <code>update:modelValue</code>       | <code>string</code>                        | Emitted when the controlled model value changes.                                        |
| <code>update:open</code>             | <code>boolean</code>                       | Emitted when popup visibility changes.                                                  |
| <code>update:highlightedIndex</code> | <code>number</code>                        | Emitted when the active autocomplete suggestion changes.                                |
| <code>input</code>                   | <code>string</code>                        | Emitted for input edits.                                                                |
| <code>change</code>                  | <code>string</code>                        | Emitted when the component commits a value change.                                      |
| <code>select</code>                  | <code>TAutocompleteSelectPayload</code>    | Emitted when the active item is selected.                                               |
| <code>loadError</code>               | <code>TAutocompleteLoadErrorPayload</code> | Emitted when the async suggestion provider rejects; aborted stale requests do not emit. |

## TBadge

源码：`src/vue/components/TFeedback.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                | 类型                              | 默认值                           | 必填 | 说明                                                |
| ------------------- | --------------------------------- | -------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>      | <code>number</code>               | —                                | 是   | Left position in terminal cells.                    |
| <code>y</code>      | <code>number</code>               | —                                | 是   | Top position in terminal cells.                     |
| <code>w</code>      | <code>number</code>               | <code>undefined</code>           | 否   | Width in terminal cells.                            |
| <code>value</code>  | <code>string &#124; number</code> | —                                | 是   | Text or scalar value rendered by the badge.         |
| <code>tone</code>   | <code>TFeedbackTone</code>        | <code>&quot;default&quot;</code> | 否   | Semantic color tone.                                |
| <code>zIndex</code> | <code>number</code>               | <code>0</code>                   | 否   | Render and event ordering within the current plane. |
| <code>style</code>  | <code>Style</code>                | <code>undefined</code>           | 否   | Base terminal cell style override.                  |

### Events

—

## TBox

源码：`src/vue/components/TBox.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                    | 类型                 | 默认值                    | 必填 | 说明                                                   |
| ----------------------- | -------------------- | ------------------------- | ---- | ------------------------------------------------------ |
| <code>x</code>          | <code>number</code>  | —                         | 是   | Left position in terminal cells.                       |
| <code>y</code>          | <code>number</code>  | —                         | 是   | Top position in terminal cells.                        |
| <code>w</code>          | <code>number</code>  | —                         | 是   | Width in terminal cells.                               |
| <code>h</code>          | <code>number</code>  | —                         | 是   | Height in terminal cells.                              |
| <code>zIndex</code>     | <code>number</code>  | <code>0</code>            | 否   | Render and event ordering within the current plane.    |
| <code>border</code>     | <code>boolean</code> | <code>true</code>         | 否   | Draws a border around the component.                   |
| <code>title</code>      | <code>string</code>  | <code>&quot;&quot;</code> | 否   | Optional title text.                                   |
| <code>padding</code>    | <code>number</code>  | <code>0</code>            | 否   | Inner padding in terminal cells.                       |
| <code>scrollX</code>    | <code>number</code>  | <code>0</code>            | 否   | Horizontal content offset in terminal cells.           |
| <code>scrollY</code>    | <code>number</code>  | <code>0</code>            | 否   | Vertical content offset in terminal cells.             |
| <code>style</code>      | <code>Style</code>   | <code>undefined</code>    | 否   | Base terminal cell style override.                     |
| <code>titleStyle</code> | <code>Style</code>   | <code>undefined</code>    | 否   | Style override for title text.                         |
| <code>clear</code>      | <code>boolean</code> | <code>true</code>         | 否   | Clears the component rectangle before drawing content. |

### Events

| 名称                             | Payload                           | 说明                                                                |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| <code>pointerenterCapture</code> | <code>TerminalPointerEvent</code> | Emitted when the pointer enters the component. Runs during capture. |
| <code>pointerenter</code>        | <code>TerminalPointerEvent</code> | Emitted when the pointer enters the component.                      |
| <code>pointerleaveCapture</code> | <code>TerminalPointerEvent</code> | Emitted when the pointer leaves the component. Runs during capture. |
| <code>pointerleave</code>        | <code>TerminalPointerEvent</code> | Emitted when the pointer leaves the component.                      |

### Slots

| 名称                 | Props | 说明                                                                                            |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| <code>default</code> | —     | Content rendered inside the box content area with origin, clipping, and scroll offsets applied. |

## TBreadcrumb

源码：`src/vue/components/TNavigation.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                       | 类型                                    | 默认值                                 | 必填 | 说明 |
| -------------------------- | --------------------------------------- | -------------------------------------- | ---- | ---- |
| <code>x</code>             | <code>number</code>                     | —                                      | 是   | —    |
| <code>y</code>             | <code>number</code>                     | —                                      | 是   | —    |
| <code>w</code>             | <code>number</code>                     | —                                      | 是   | —    |
| <code>zIndex</code>        | <code>number</code>                     | <code>0</code>                         | 否   | —    |
| <code>items</code>         | <code>readonly TBreadcrumbItem[]</code> | —                                      | 是   | —    |
| <code>separator</code>     | <code>string</code>                     | <code>&quot;/&quot;</code>             | 否   | —    |
| <code>style</code>         | <code>Style</code>                      | <code>undefined</code>                 | 否   | —    |
| <code>activeStyle</code>   | <code>Style</code>                      | <code>() =&gt; ({ bold: true })</code> | 否   | —    |
| <code>disabledStyle</code> | <code>Style</code>                      | <code>() =&gt; ({ dim: true })</code>  | 否   | —    |

### Events

| 名称                | Payload                               | 说明 |
| ------------------- | ------------------------------------- | ---- |
| <code>select</code> | <code>TBreadcrumbSelectPayload</code> | —    |

## TCandlestickChart

源码：`src/vue/components/TCharts.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                      | 类型                                      | 默认值                                                       | 必填 | 说明                                                                                         |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------------- |
| <code>x</code>            | <code>number</code>                       | —                                                            | 是   | Left position in terminal cells.                                                             |
| <code>y</code>            | <code>number</code>                       | —                                                            | 是   | Top position in terminal cells.                                                              |
| <code>w</code>            | <code>number</code>                       | —                                                            | 是   | Width in terminal cells.                                                                     |
| <code>h</code>            | <code>number</code>                       | —                                                            | 是   | Height in terminal cells.                                                                    |
| <code>zIndex</code>       | <code>number</code>                       | <code>0</code>                                               | 否   | —                                                                                            |
| <code>candles</code>      | <code>readonly TCandlestickDatum[]</code> | —                                                            | 是   | Candles rendered from left to right; the most recent candles are kept when width is smaller. |
| <code>labels</code>       | <code>readonly string[]</code>            | <code>undefined</code>                                       | 否   | Labels aligned with candles and shown in hover tooltips.                                     |
| <code>min</code>          | <code>number</code>                       | <code>undefined</code>                                       | 否   | Lower price bound. Defaults to the smallest candle low.                                      |
| <code>max</code>          | <code>number</code>                       | <code>undefined</code>                                       | 否   | Upper price bound. Defaults to the largest candle high.                                      |
| <code>style</code>        | <code>Style</code>                        | <code>undefined</code>                                       | 否   | —                                                                                            |
| <code>upStyle</code>      | <code>Style</code>                        | <code>() =&gt; ({ fg: &quot;greenBright&quot; })</code>      | 否   | Style used when close is greater than or equal to open.                                      |
| <code>downStyle</code>    | <code>Style</code>                        | <code>() =&gt; ({ fg: &quot;redBright&quot; })</code>        | 否   | Style used when close is less than open.                                                     |
| <code>wickStyle</code>    | <code>Style</code>                        | <code>undefined</code>                                       | 否   | Optional style override for wick cells.                                                      |
| <code>showAxes</code>     | <code>boolean</code>                      | <code>true</code>                                            | 否   | Whether to render axes and price labels when there is enough space.                          |
| <code>axisStyle</code>    | <code>Style</code>                        | <code>() =&gt; ({ fg: &quot;white&quot;, dim: true })</code> | 否   | Style used for axis lines.                                                                   |
| <code>labelStyle</code>   | <code>Style</code>                        | <code>() =&gt; ({ fg: &quot;whiteBright&quot; })</code>      | 否   | Style used for axis labels.                                                                  |
| <code>xLabel</code>       | <code>string</code>                       | <code>&quot;&quot;</code>                                    | 否   | Label centered under the x axis.                                                             |
| <code>yLabel</code>       | <code>string</code>                       | <code>&quot;&quot;</code>                                    | 否   | Label rendered at the top of the plot area.                                                  |
| <code>startLabel</code>   | <code>string</code>                       | <code>&quot;&quot;</code>                                    | 否   | Left endpoint label for the x axis when xLabel is empty.                                     |
| <code>endLabel</code>     | <code>string</code>                       | <code>&quot;&quot;</code>                                    | 否   | Right endpoint label for the x axis when xLabel is empty.                                    |
| <code>showTooltip</code>  | <code>boolean</code>                      | <code>true</code>                                            | 否   | Whether pointer hover shows candle values.                                                   |
| <code>hoverStyle</code>   | <code>Style</code>                        | <code>() =&gt; ({})</code>                                   | 否   | Style merged onto the currently hovered candle.                                              |
| <code>tooltipStyle</code> | <code>Style</code>                        | <code>() =&gt; ({ fg: &quot;whiteBright&quot; })</code>      | 否   | Style used for hover tooltip text.                                                           |

### Events

—

## TCheckbox

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                       | 类型                 | 默认值                                | 必填 | 说明                                                |
| -------------------------- | -------------------- | ------------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>             | <code>number</code>  | —                                     | 是   | Left position in terminal cells.                    |
| <code>y</code>             | <code>number</code>  | —                                     | 是   | Top position in terminal cells.                     |
| <code>w</code>             | <code>number</code>  | —                                     | 是   | Width in terminal cells.                            |
| <code>zIndex</code>        | <code>number</code>  | <code>0</code>                        | 否   | Render and event ordering within the current plane. |
| <code>modelValue</code>    | <code>boolean</code> | <code>false</code>                    | 否   | Controlled component value.                         |
| <code>label</code>         | <code>string</code>  | <code>&quot;&quot;</code>             | 否   | Visible label text.                                 |
| <code>disabled</code>      | <code>boolean</code> | <code>false</code>                    | 否   | Disables pointer and keyboard activation.           |
| <code>style</code>         | <code>Style</code>   | <code>undefined</code>                | 否   | Base terminal cell style override.                  |
| <code>checkedStyle</code>  | <code>Style</code>   | <code>undefined</code>                | 否   | Style used when the checkbox is checked.            |
| <code>disabledStyle</code> | <code>Style</code>   | <code>() =&gt; ({ dim: true })</code> | 否   | Style used for disabled content.                    |

### Events

| 名称                           | Payload              | 说明                                               |
| ------------------------------ | -------------------- | -------------------------------------------------- |
| <code>update:modelValue</code> | <code>boolean</code> | Emitted when the controlled model value changes.   |
| <code>change</code>            | <code>boolean</code> | Emitted when the component commits a value change. |

## TCode

源码：`src/vue/components/TFeedback.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                | 类型                | 默认值                                                   | 必填 | 说明                                                |
| ------------------- | ------------------- | -------------------------------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>      | <code>number</code> | —                                                        | 是   | Left position in terminal cells.                    |
| <code>y</code>      | <code>number</code> | —                                                        | 是   | Top position in terminal cells.                     |
| <code>w</code>      | <code>number</code> | <code>undefined</code>                                   | 否   | Width in terminal cells.                            |
| <code>value</code>  | <code>string</code> | —                                                        | 是   | Code text rendered inside the code block.           |
| <code>zIndex</code> | <code>number</code> | <code>0</code>                                           | 否   | Render and event ordering within the current plane. |
| <code>style</code>  | <code>Style</code>  | <code>() =&gt; ({ fg: &quot;yellowBright&quot; })</code> | 否   | Base terminal cell style override.                  |

### Events

—

## TCommandPalette

源码：`src/vue/components/TCommandPalette.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                             | 类型                                                        | 默认值                                           | 必填 | 说明                                                     |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ---- | -------------------------------------------------------- |
| <code>modelValue</code>          | <code>boolean</code>                                        | —                                                | 是   | Controlled component value.                              |
| <code>title</code>               | <code>string</code>                                         | <code>&quot;&quot;</code>                        | 否   | Optional title text.                                     |
| <code>query</code>               | <code>string</code>                                         | <code>undefined</code>                           | 否   | Search query used by filtering or async providers.       |
| <code>initialQuery</code>        | <code>string</code>                                         | <code>&quot;&quot;</code>                        | 否   | Query used when the command palette opens.               |
| <code>items</code>               | <code>readonly TCommandPaletteItem[]</code>                 | <code>() =&gt; []</code>                         | 否   | Command items rendered and filtered by the palette.      |
| <code>itemsProvider</code>       | <code>TCommandPaletteItemsProvider</code>                   | <code>undefined</code>                           | 否   | Async command provider called with the current query.    |
| <code>matcher</code>             | <code>TCommandPaletteMatcher</code>                         | <code>undefined</code>                           | 否   | Custom command matcher.                                  |
| <code>filterStrategy</code>      | <code>&quot;substring&quot; &#124; &quot;fuzzy&quot;</code> | <code>&quot;substring&quot;</code>               | 否   | Built-in command matching strategy.                      |
| <code>selectedIndex</code>       | <code>number</code>                                         | <code>undefined</code>                           | 否   | Controlled active item index.                            |
| <code>showRowDetails</code>      | <code>boolean</code>                                        | <code>false</code>                               | 否   | Shows command detail text next to labels.                |
| <code>placeholder</code>         | <code>string</code>                                         | <code>&quot;&quot;</code>                        | 否   | Placeholder text shown when the input is empty.          |
| <code>noMatchesText</code>       | <code>string</code>                                         | <code>&quot;No matches&quot;</code>              | 否   | Text rendered when filtering returns no commands.        |
| <code>loadingText</code>         | <code>string</code>                                         | <code>&quot;Loading...&quot;</code>              | 否   | Text rendered while async loading is pending.            |
| <code>errorText</code>           | <code>string</code>                                         | <code>&quot;Unable to load commands&quot;</code> | 否   | Text rendered when async loading fails.                  |
| <code>hint</code>                | <code>string</code>                                         | <code>&quot;&quot;</code>                        | 否   | Footer hint text.                                        |
| <code>debounce</code>            | <code>number</code>                                         | <code>0</code>                                   | 否   | Delay before calling an async provider, in milliseconds. |
| <code>minQueryLength</code>      | <code>number</code>                                         | <code>0</code>                                   | 否   | Minimum query length before async loading runs.          |
| <code>maxVisibleItems</code>     | <code>number</code>                                         | <code>undefined</code>                           | 否   | Maximum number of command rows rendered at once.         |
| <code>closeOnSelect</code>       | <code>boolean</code>                                        | <code>false</code>                               | 否   | Closes the command palette after a command is selected.  |
| <code>resetQueryOnClose</code>   | <code>boolean</code>                                        | <code>false</code>                               | 否   | Resets the query when the palette closes.                |
| <code>w</code>                   | <code>number</code>                                         | <code>72</code>                                  | 否   | Width in terminal cells.                                 |
| <code>h</code>                   | <code>number</code>                                         | <code>18</code>                                  | 否   | Height in terminal cells.                                |
| <code>chromeStyle</code>         | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for command palette chrome.               |
| <code>inputStyle</code>          | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for the embedded input.                   |
| <code>listStyle</code>           | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for list rows.                            |
| <code>bodyStyle</code>           | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for dialog body cells.                    |
| <code>highlightStyle</code>      | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style used for the highlighted row or match.             |
| <code>matchStyle</code>          | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style used for matched text.                             |
| <code>highlightMatchStyle</code> | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style used for highlighted text while the row is active. |
| <code>dividerStyle</code>        | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for dividers.                             |
| <code>hintStyle</code>           | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for hint text.                            |
| <code>detailStyle</code>         | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style override for detail text.                          |
| <code>emptyStyle</code>          | <code>Style</code>                                          | <code>undefined</code>                           | 否   | Style used when rendering an empty state.                |

### Events

| 名称                              | Payload                                      | 说明                                                                                 |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| <code>update:modelValue</code>    | <code>boolean</code>                         | Emitted when the controlled model value changes.                                     |
| <code>update:query</code>         | <code>string</code>                          | Emitted when the controlled query changes.                                           |
| <code>update:selectedIndex</code> | <code>number</code>                          | Emitted when the controlled active index changes.                                    |
| <code>select</code>               | <code>TCommandPaletteSelectPayload</code>    | Emitted when the active item is selected.                                            |
| <code>loadError</code>            | <code>TCommandPaletteLoadErrorPayload</code> | Emitted when the async command provider rejects; aborted stale requests do not emit. |
| <code>close</code>                | <code>void</code>                            | Emitted when the component requests to close.                                        |

## TContextMenu

源码：`src/vue/components/TOverlay.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                        | 类型                                     | 默认值                                    | 必填 | 说明                                                                     |
| --------------------------- | ---------------------------------------- | ----------------------------------------- | ---- | ------------------------------------------------------------------------ |
| <code>modelValue</code>     | <code>boolean</code>                     | —                                         | 是   | —                                                                        |
| <code>x</code>              | <code>number</code>                      | —                                         | 是   | Caller-owned x position; no viewport clamp or flip placement is applied. |
| <code>y</code>              | <code>number</code>                      | —                                         | 是   | Caller-owned y position; no viewport clamp or flip placement is applied. |
| <code>w</code>              | <code>number</code>                      | <code>24</code>                           | 否   | —                                                                        |
| <code>zIndex</code>         | <code>number</code>                      | <code>20</code>                           | 否   | —                                                                        |
| <code>items</code>          | <code>readonly TContextMenuItem[]</code> | —                                         | 是   | —                                                                        |
| <code>selectedIndex</code>  | <code>number</code>                      | <code>undefined</code>                    | 否   | —                                                                        |
| <code>closeOnOutside</code> | <code>boolean</code>                     | <code>true</code>                         | 否   | —                                                                        |
| <code>style</code>          | <code>Style</code>                       | <code>undefined</code>                    | 否   | —                                                                        |
| <code>activeStyle</code>    | <code>Style</code>                       | <code>() =&gt; ({ inverse: true })</code> | 否   | —                                                                        |
| <code>disabledStyle</code>  | <code>Style</code>                       | <code>() =&gt; ({ dim: true })</code>     | 否   | —                                                                        |

### Events

| 名称                              | Payload                                | 说明 |
| --------------------------------- | -------------------------------------- | ---- |
| <code>update:modelValue</code>    | <code>boolean</code>                   | —    |
| <code>update:selectedIndex</code> | <code>number</code>                    | —    |
| <code>select</code>               | <code>TContextMenuSelectPayload</code> | —    |
| <code>close</code>                | —                                      | —    |

## TContributionGraph

源码：`src/vue/components/TCharts.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                      | 类型                           | 默认值                                                             | 必填 | 说明                                                                                              |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------- |
| <code>x</code>            | <code>number</code>            | —                                                                  | 是   | Left position in terminal cells.                                                                  |
| <code>y</code>            | <code>number</code>            | —                                                                  | 是   | Top position in terminal cells.                                                                   |
| <code>w</code>            | <code>number</code>            | <code>undefined</code>                                             | 否   | Width in terminal cells. Defaults to the rendered graph width.                                    |
| <code>h</code>            | <code>number</code>            | <code>undefined</code>                                             | 否   | Height in terminal cells. Defaults to the row count plus a tooltip row when tooltips are enabled. |
| <code>zIndex</code>       | <code>number</code>            | <code>0</code>                                                     | 否   | —                                                                                                 |
| <code>values</code>       | <code>readonly number[]</code> | —                                                                  | 是   | Numeric samples rendered column-major from top to bottom.                                         |
| <code>rows</code>         | <code>number</code>            | <code>7</code>                                                     | 否   | Number of rows in each heatmap column.                                                            |
| <code>columns</code>      | <code>number</code>            | <code>undefined</code>                                             | 否   | Number of columns to render. Defaults to enough columns for the values.                           |
| <code>max</code>          | <code>number</code>            | <code>undefined</code>                                             | 否   | Maximum sample value used for level mapping. Defaults to the largest positive value.              |
| <code>labels</code>       | <code>readonly string[]</code> | <code>undefined</code>                                             | 否   | Labels aligned with values and shown in hover tooltips.                                           |
| <code>unit</code>         | <code>string</code>            | <code>&quot;&quot;</code>                                          | 否   | Unit appended to hover tooltip values.                                                            |
| <code>showTooltip</code>  | <code>boolean</code>           | <code>true</code>                                                  | 否   | Whether pointer hover shows a value tooltip.                                                      |
| <code>emptyStyle</code>   | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;blackBright&quot;, dim: true })</code> | 否   | Empty cells and surrounding clear area style.                                                     |
| <code>levelStyles</code>  | <code>readonly Style[]</code>  | <code>() =&gt; DEFAULT_HEATMAP_LEVEL_STYLES</code>                 | 否   | Positive value styles ordered from low to high intensity.                                         |
| <code>cell</code>         | <code>string</code>            | <code>&quot;■&quot;</code>                                         | 否   | Glyph used for each heatmap cell.                                                                 |
| <code>gap</code>          | <code>number</code>            | <code>1</code>                                                     | 否   | Horizontal gap between columns in terminal cells.                                                 |
| <code>hoverStyle</code>   | <code>Style</code>             | <code>() =&gt; ({})</code>                                         | 否   | Style merged onto the currently hovered heatmap cell.                                             |
| <code>tooltipStyle</code> | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;whiteBright&quot; })</code>            | 否   | Style used for hover tooltip text.                                                                |
| <code>style</code>        | <code>Style</code>             | <code>undefined</code>                                             | 否   | —                                                                                                 |

### Events

—

## TDataTable

源码：`src/vue/components/TDataTable.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                         | 类型                                                                       | 默认值                           | 必填 | 说明                                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>x</code>               | <code>number</code>                                                        | —                                | 是   | Left position in terminal cells.                                                                                                                                                        |
| <code>y</code>               | <code>number</code>                                                        | —                                | 是   | Top position in terminal cells.                                                                                                                                                         |
| <code>w</code>               | <code>number</code>                                                        | —                                | 是   | Width in terminal cells.                                                                                                                                                                |
| <code>h</code>               | <code>number</code>                                                        | —                                | 是   | Height in terminal cells.                                                                                                                                                               |
| <code>zIndex</code>          | <code>number</code>                                                        | <code>0</code>                   | 否   | Render and event ordering within the current plane.                                                                                                                                     |
| <code>columns</code>         | <code>readonly TTableColumn[]</code>                                       | —                                | 是   | Table column definitions.                                                                                                                                                               |
| <code>rows</code>            | <code>readonly TTableRow[]</code>                                          | —                                | 是   | TDataTable can accept a controlled viewport offset through scrollTop. It is<br>still non-virtual: rows are sorted/filtered in memory and only the visible<br>slice is passed to TTable. |
| <code>rowKey</code>          | <code>string &#124; ((row: TTableRow, index: number) =&gt; unknown)</code> | <code>undefined</code>           | 否   | Row key field or resolver.                                                                                                                                                              |
| <code>selectedRowKey</code>  | <code>unknown</code>                                                       | <code>undefined</code>           | 否   | Controlled selected row key.                                                                                                                                                            |
| <code>selectedRowKeys</code> | <code>readonly unknown[]</code>                                            | <code>undefined</code>           | 否   | Controlled selected row keys for multi-select tables.                                                                                                                                   |
| <code>scrollTop</code>       | <code>number</code>                                                        | <code>undefined</code>           | 否   | Controlled top row offset.                                                                                                                                                              |
| <code>sortBy</code>          | <code>string</code>                                                        | <code>&quot;&quot;</code>        | 否   | Sorts by the raw row value at this key; column format only affects display and filtering.                                                                                               |
| <code>sortDirection</code>   | <code>TDataTableSortDirection</code>                                       | <code>&quot;asc&quot;</code>     | 否   | Controlled sort direction.                                                                                                                                                              |
| <code>sortable</code>        | <code>boolean</code>                                                       | <code>false</code>               | 否   | Enables sortable column header interactions.                                                                                                                                            |
| <code>manualSort</code>      | <code>boolean</code>                                                       | <code>false</code>               | 否   | Disables built-in sorting while keeping sort events controlled by the host.                                                                                                             |
| <code>sorter</code>          | <code>TDataTableSorter</code>                                              | <code>undefined</code>           | 否   | Custom row comparison function.                                                                                                                                                         |
| <code>filter</code>          | <code>string</code>                                                        | <code>&quot;&quot;</code>        | 否   | Controlled filter query.                                                                                                                                                                |
| <code>filterable</code>      | <code>boolean</code>                                                       | <code>false</code>               | 否   | Enables built-in row filtering.                                                                                                                                                         |
| <code>manualFilter</code>    | <code>boolean</code>                                                       | <code>false</code>               | 否   | Disables built-in filtering while keeping filter state host-owned.                                                                                                                      |
| <code>filterPredicate</code> | <code>TDataTableFilterPredicate</code>                                     | <code>undefined</code>           | 否   | Custom row filter predicate.                                                                                                                                                            |
| <code>selectable</code>      | <code>boolean</code>                                                       | <code>false</code>               | 否   | Enables row selection.                                                                                                                                                                  |
| <code>selectionMode</code>   | <code>TDataTableSelectionMode</code>                                       | <code>&quot;single&quot;</code>  | 否   | Row selection mode.                                                                                                                                                                     |
| <code>border</code>          | <code>boolean</code>                                                       | <code>false</code>               | 否   | Draws a border around the component.                                                                                                                                                    |
| <code>style</code>           | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Base terminal cell style override.                                                                                                                                                      |
| <code>headerStyle</code>     | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style override for table header cells.                                                                                                                                                  |
| <code>borderStyle</code>     | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style override for border cells.                                                                                                                                                        |
| <code>selectedStyle</code>   | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style used for selected rows or nodes.                                                                                                                                                  |
| <code>activeStyle</code>     | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style used for the active item or row.                                                                                                                                                  |
| <code>emptyText</code>       | <code>string</code>                                                        | <code>&quot;No rows&quot;</code> | 否   | Text rendered when there are no rows or items.                                                                                                                                          |

### Events

| 名称                                | Payload                                  | 说明                                                                                                                                        |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>update:selectedRowKey</code>  | <code>unknown</code>                     | Emitted when the selected row key changes.                                                                                                  |
| <code>update:selectedRowKeys</code> | <code>unknown[]</code>                   | Emitted when selected row keys change.                                                                                                      |
| <code>update:scrollTop</code>       | <code>number</code>                      | Emitted when the top visible row offset should change.                                                                                      |
| <code>update:sortBy</code>          | <code>string</code>                      | Emitted when the sorted column key changes.                                                                                                 |
| <code>update:sortDirection</code>   | <code>TDataTableSortDirection</code>     | Emitted when the sort direction changes.                                                                                                    |
| <code>sortChange</code>             | <code>TDataTableSortChangePayload</code> | Emitted when table sort state changes.                                                                                                      |
| <code>rowSelect</code>              | <code>TDataTableRowSelectPayload</code>  | Emitted when a data table row is selected; index is viewport-local, dataIndex is filtered/sorted, and originalIndex is the input row index. |

## TDebugOverlay

源码：`src/vue/components/TDebugOverlay.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

| 名称                         | 类型                                                              | 默认值                          | 必填 | 说明                                                |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------- | ---- | --------------------------------------------------- |
| <code>modelValue</code>      | <code>boolean</code>                                              | —                               | 是   | Controlled component value.                         |
| <code>w</code>               | <code>number</code>                                               | —                               | 是   | Width in terminal cells.                            |
| <code>h</code>               | <code>number</code>                                               | —                               | 是   | Height in terminal cells.                           |
| <code>title</code>           | <code>string</code>                                               | <code>&quot;&quot;</code>       | 否   | Optional title text.                                |
| <code>padding</code>         | <code>number</code>                                               | <code>1</code>                  | 否   | Inner padding in terminal cells.                    |
| <code>zIndex</code>          | <code>number</code>                                               | <code>1000</code>               | 否   | Render and event ordering within the current plane. |
| <code>style</code>           | <code>Style</code>                                                | <code>undefined</code>          | 否   | Base terminal cell style override.                  |
| <code>titleStyle</code>      | <code>Style</code>                                                | <code>undefined</code>          | 否   | Style override for title text.                      |
| <code>contentStyle</code>    | <code>Style</code>                                                | <code>undefined</code>          | 否   | Style override for dialog or popover content cells. |
| <code>backdropStyle</code>   | <code>Style</code>                                                | <code>undefined</code>          | 否   | Style override for backdrop cells.                  |
| <code>placement</code>       | <code>Placement</code>                                            | <code>&quot;center&quot;</code> | 否   | Dialog placement within the current layout.         |
| <code>offsetX</code>         | <code>number</code>                                               | <code>0</code>                  | 否   | Horizontal placement offset in cells.               |
| <code>offsetY</code>         | <code>number</code>                                               | <code>0</code>                  | 否   | Vertical placement offset in cells.                 |
| <code>backdrop</code>        | <code>boolean</code>                                              | <code>true</code>               | 否   | Renders a backdrop behind the dialog.               |
| <code>closeOnBackdrop</code> | <code>boolean</code>                                              | <code>true</code>               | 否   | Closes the dialog when the backdrop is clicked.     |
| <code>closeOnEsc</code>      | <code>boolean</code>                                              | <code>true</code>               | 否   | Closes the dialog on Escape.                        |
| <code>closeOnBlur</code>     | <code>boolean</code>                                              | <code>false</code>              | 否   | Emits close when focus leaves the component.        |
| <code>teleport</code>        | <code>boolean</code>                                              | <code>false</code>              | 否   | Mounts the dialog into the overlay runtime plane.   |
| <code>tabMode</code>         | <code>&quot;cycle&quot; &#124; &quot;wrapFromButtons&quot;</code> | <code>&quot;cycle&quot;</code>  | 否   | Keyboard Tab behavior inside the dialog.            |
| <code>buttons</code>         | <code>DialogButton[]</code>                                       | <code>() =&gt; []</code>        | 否   | Dialog footer buttons.                              |
| <code>closeOnConfirm</code>  | <code>boolean</code>                                              | <code>true</code>               | 否   | Closes the dialog after a footer button confirms.   |

### Events

| 名称                           | Payload                                           | 说明                                             |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------ |
| <code>update:modelValue</code> | <code>boolean</code>                              | Emitted when the controlled model value changes. |
| <code>close</code>             | <code>void</code>                                 | Emitted when the component requests to close.    |
| <code>focus</code>             | <code>void</code>                                 | Emitted when the component receives focus.       |
| <code>blur</code>              | <code>void</code>                                 | Emitted when the component loses focus.          |
| <code>keydown</code>           | <code>TerminalKeyboardEvent</code>                | Emitted for keydown events.                      |
| <code>confirm</code>           | <code>DialogButton &amp; { index: number }</code> | Emitted when a focused action is confirmed.      |

### Slots

| 名称                 | Props | 说明                                                                                 |
| -------------------- | ----- | ------------------------------------------------------------------------------------ |
| <code>default</code> | —     | Dialog body content rendered inside the content rect before optional footer buttons. |

## TDivider

源码：`src/vue/components/TFeedback.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                | 类型                | 默认值                    | 必填 | 说明                                                |
| ------------------- | ------------------- | ------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>      | <code>number</code> | —                         | 是   | Left position in terminal cells.                    |
| <code>y</code>      | <code>number</code> | —                         | 是   | Top position in terminal cells.                     |
| <code>w</code>      | <code>number</code> | —                         | 是   | Width in terminal cells.                            |
| <code>title</code>  | <code>string</code> | <code>&quot;&quot;</code> | 否   | Optional title text.                                |
| <code>zIndex</code> | <code>number</code> | <code>0</code>            | 否   | Render and event ordering within the current plane. |
| <code>style</code>  | <code>Style</code>  | <code>undefined</code>    | 否   | Base terminal cell style override.                  |

### Events

—

## TerminalProvider

源码：`src/vue/components/TerminalProvider.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                            | 类型                                                                | 默认值                                          | 必填 | 说明                                                            |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- | ---- | --------------------------------------------------------------- |
| <code>cols</code>               | <code>number</code>                                                 | —                                               | 是   | Terminal column count.                                          |
| <code>rows</code>               | <code>number</code>                                                 | —                                               | 是   | Terminal row count.                                             |
| <code>widthProvider</code>      | <code>WidthProvider</code>                                          | <code>&quot;default&quot;</code>                | 否   | Cell width provider used by the terminal buffer.                |
| <code>defaultStyle</code>       | <code>Style</code>                                                  | <code>() =&gt; ({})</code>                      | 否   | Default terminal cell style for descendants.                    |
| <code>theme</code>              | <code>TuiThemeOverrides</code>                                      | <code>undefined</code>                          | 否   | Theme token overrides for component defaults.                   |
| <code>autoResize</code>         | <code>boolean</code>                                                | <code>false</code>                              | 否   | Resizes the terminal from the host element when enabled.        |
| <code>minCols</code>            | <code>number</code>                                                 | <code>1</code>                                  | 否   | Minimum column count used by auto resize.                       |
| <code>minRows</code>            | <code>number</code>                                                 | <code>1</code>                                  | 否   | Minimum row count used by auto resize.                          |
| <code>recordEvents</code>       | <code>((e: TerminalEventRecord) =&gt; void) &#124; undefined</code> | <code>undefined</code>                          | 否   | Optional event recorder callback.                               |
| <code>inputPlugins</code>       | <code>readonly TInputPlugin[]</code>                                | <code>() =&gt; [defaultTInputHostPlugin]</code> | 否   | Input plugins provided to descendant text inputs.               |
| <code>pathPickerProvider</code> | <code>PathPickerProvider</code>                                     | <code>undefined</code>                          | 否   | Path provider injected into descendant path pickers.            |
| <code>linkOpener</code>         | <code>TerminalLinkOpenerLike</code>                                 | <code>undefined</code>                          | 否   | Host link opener used by components with host-owned activation. |
| <code>debugIme</code>           | <code>boolean</code>                                                | <code>false</code>                              | 否   | Enables IME debugging output.                                   |
| <code>debugTrace</code>         | <code>boolean</code>                                                | <code>false</code>                              | 否   | Enables runtime trace logging.                                  |
| <code>domRendererOptions</code> | <code>DomRendererOptions</code>                                     | <code>undefined</code>                          | 否   | DOM renderer options used by TerminalProvider.                  |
| <code>clipboard</code>          | <code>ClipboardApi</code>                                           | <code>undefined</code>                          | 否   | Clipboard implementation used for terminal selection copy.      |
| <code>selection</code>          | <code>TerminalProviderSelectionConfig</code>                        | <code>false</code>                              | 否   | Terminal cell selection configuration.                          |

### Events

| 名称                       | Payload                                   | 说明                                   |
| -------------------------- | ----------------------------------------- | -------------------------------------- |
| <code>selectionCopy</code> | <code>TerminalSelectionCopyPayload</code> | Emitted after terminal selection copy. |

### Slots

| 名称                 | Props | 说明                                                                  |
| -------------------- | ----- | --------------------------------------------------------------------- |
| <code>default</code> | —     | Terminal component tree rendered inside the provider runtime context. |

## TFlex

源码：`src/vue/components/TFlex.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                        | 类型                           | 默认值                           | 必填 | 说明 |
| --------------------------- | ------------------------------ | -------------------------------- | ---- | ---- |
| <code>x</code>              | <code>number</code>            | —                                | 是   | —    |
| <code>y</code>              | <code>number</code>            | —                                | 是   | —    |
| <code>w</code>              | <code>number</code>            | —                                | 是   | —    |
| <code>h</code>              | <code>number</code>            | —                                | 是   | —    |
| <code>direction</code>      | <code>TFlexDirection</code>    | <code>&quot;row&quot;</code>     | 否   | —    |
| <code>gap</code>            | <code>number</code>            | <code>0</code>                   | 否   | —    |
| <code>rowGap</code>         | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>columnGap</code>      | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>padding</code>        | <code>number</code>            | <code>0</code>                   | 否   | —    |
| <code>paddingX</code>       | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>paddingY</code>       | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>paddingTop</code>     | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>paddingRight</code>   | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>paddingBottom</code>  | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>paddingLeft</code>    | <code>number</code>            | <code>undefined</code>           | 否   | —    |
| <code>wrap</code>           | <code>boolean</code>           | <code>false</code>               | 否   | —    |
| <code>alignItems</code>     | <code>TFlexAlign</code>        | <code>&quot;stretch&quot;</code> | 否   | —    |
| <code>justifyContent</code> | <code>TFlexJustify</code>      | <code>&quot;start&quot;</code>   | 否   | —    |
| <code>alignContent</code>   | <code>TFlexAlignContent</code> | <code>&quot;start&quot;</code>   | 否   | —    |
| <code>zIndex</code>         | <code>number</code>            | <code>0</code>                   | 否   | —    |

### Events

—

### Slots

| 名称                 | Props | 说明                                                                 |
| -------------------- | ----- | -------------------------------------------------------------------- |
| <code>default</code> | —     | Flex item subtree measured and positioned inside the flex container. |

## TFlexItem

源码：`src/vue/components/TFlex.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                      | 类型                      | 默认值                 | 必填 | 说明 |
| ------------------------- | ------------------------- | ---------------------- | ---- | ---- |
| <code>grow</code>         | <code>number</code>       | <code>0</code>         | 否   | —    |
| <code>shrink</code>       | <code>number</code>       | <code>1</code>         | 否   | —    |
| <code>basis</code>        | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>w</code>            | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>width</code>        | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>h</code>            | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>height</code>       | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>minWidth</code>     | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>minHeight</code>    | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>maxWidth</code>     | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>maxHeight</code>    | <code>TFlexSize</code>    | <code>undefined</code> | 否   | —    |
| <code>measure</code>      | <code>TFlexMeasure</code> | <code>undefined</code> | 否   | —    |
| <code>order</code>        | <code>number</code>       | <code>0</code>         | 否   | —    |
| <code>zIndex</code>       | <code>number</code>       | <code>0</code>         | 否   | —    |
| <code>margin</code>       | <code>number</code>       | <code>0</code>         | 否   | —    |
| <code>marginX</code>      | <code>number</code>       | <code>undefined</code> | 否   | —    |
| <code>marginY</code>      | <code>number</code>       | <code>undefined</code> | 否   | —    |
| <code>marginTop</code>    | <code>number</code>       | <code>undefined</code> | 否   | —    |
| <code>marginRight</code>  | <code>number</code>       | <code>undefined</code> | 否   | —    |
| <code>marginBottom</code> | <code>number</code>       | <code>undefined</code> | 否   | —    |
| <code>marginLeft</code>   | <code>number</code>       | <code>undefined</code> | 否   | —    |
| <code>alignSelf</code>    | <code>TFlexAlign</code>   | <code>undefined</code> | 否   | —    |

### Events

—

### Slots

| 名称                 | Props                       | 说明                                                  |
| -------------------- | --------------------------- | ----------------------------------------------------- |
| <code>default</code> | <code>{ rect: Rect }</code> | Item content rendered inside the computed child rect. |

## TFlow

源码：`src/vue/components/TFlow.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

## TForm

源码：`src/vue/components/TForm.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                       | 类型                                         | 默认值                     | 必填 | 说明                                                                                                         |
| -------------------------- | -------------------------------------------- | -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| <code>x</code>             | <code>number</code>                          | —                          | 是   | —                                                                                                            |
| <code>y</code>             | <code>number</code>                          | —                          | 是   | —                                                                                                            |
| <code>w</code>             | <code>number</code>                          | —                          | 是   | —                                                                                                            |
| <code>h</code>             | <code>number</code>                          | —                          | 是   | —                                                                                                            |
| <code>zIndex</code>        | <code>number</code>                          | <code>0</code>             | 否   | —                                                                                                            |
| <code>model</code>         | <code>TFormModel</code>                      | —                          | 是   | —                                                                                                            |
| <code>rules</code>         | <code>Record&lt;string, TFormRule&gt;</code> | <code>() =&gt; ({})</code> | 否   | —                                                                                                            |
| <code>disabled</code>      | <code>boolean</code>                         | <code>false</code>         | 否   | —                                                                                                            |
| <code>readOnly</code>      | <code>boolean</code>                         | <code>false</code>         | 否   | Provides a read-only hint to custom form field consumers; built-in controls do not automatically consume it. |
| <code>submitOnEnter</code> | <code>boolean</code>                         | <code>false</code>         | 否   | —                                                                                                            |

### Events

| 名称                    | Payload                                   | 说明 |
| ----------------------- | ----------------------------------------- | ---- |
| <code>submit</code>     | <code>TFormSubmitPayload</code>           | —    |
| <code>validation</code> | <code>Record&lt;string, string&gt;</code> | —    |

### Slots

| 名称                 | Props | 说明                                                                    |
| -------------------- | ----- | ----------------------------------------------------------------------- |
| <code>default</code> | —     | Form field subtree rendered with TForm context provided to descendants. |

## TFormField

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                    | 类型                 | 默认值                    | 必填 | 说明                                                |
| ----------------------- | -------------------- | ------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>          | <code>number</code>  | —                         | 是   | Left position in terminal cells.                    |
| <code>y</code>          | <code>number</code>  | —                         | 是   | Top position in terminal cells.                     |
| <code>w</code>          | <code>number</code>  | —                         | 是   | Width in terminal cells.                            |
| <code>h</code>          | <code>number</code>  | —                         | 是   | Height in terminal cells.                           |
| <code>zIndex</code>     | <code>number</code>  | <code>0</code>            | 否   | Render and event ordering within the current plane. |
| <code>name</code>       | <code>string</code>  | <code>&quot;&quot;</code> | 否   | Field name used by form context.                    |
| <code>label</code>      | <code>string</code>  | <code>&quot;&quot;</code> | 否   | Visible label text.                                 |
| <code>help</code>       | <code>string</code>  | <code>&quot;&quot;</code> | 否   | Help text rendered below the field.                 |
| <code>error</code>      | <code>string</code>  | <code>&quot;&quot;</code> | 否   | Error text rendered below the field.                |
| <code>required</code>   | <code>boolean</code> | <code>false</code>        | 否   | Marks the field label as required.                  |
| <code>disabled</code>   | <code>boolean</code> | <code>false</code>        | 否   | Disables pointer and keyboard activation.           |
| <code>style</code>      | <code>Style</code>   | <code>undefined</code>    | 否   | Base terminal cell style override.                  |
| <code>labelStyle</code> | <code>Style</code>   | <code>undefined</code>    | 否   | Style override for label text.                      |
| <code>helpStyle</code>  | <code>Style</code>   | <code>undefined</code>    | 否   | Style override for help text.                       |
| <code>errorStyle</code> | <code>Style</code>   | <code>undefined</code>    | 否   | Style override for error text.                      |

### Events

—

### Slots

| 名称                 | Props | 说明                                                                 |
| -------------------- | ----- | -------------------------------------------------------------------- |
| <code>default</code> | —     | Field control content rendered between the label and help/error row. |

## TInput

源码：`src/vue/components/TInput.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                                     | 类型                                                                                             | 默认值                         | 必填 | 说明                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ---- | --------------------------------------------------------- |
| <code>x</code>                           | <code>number</code>                                                                              | —                              | 是   | Left position in terminal cells.                          |
| <code>y</code>                           | <code>number</code>                                                                              | —                              | 是   | Top position in terminal cells.                           |
| <code>w</code>                           | <code>number</code>                                                                              | —                              | 是   | Width in terminal cells.                                  |
| <code>h</code>                           | <code>number</code>                                                                              | <code>1</code>                 | 否   | Height in terminal cells.                                 |
| <code>zIndex</code>                      | <code>number</code>                                                                              | <code>0</code>                 | 否   | Render and event ordering within the current plane.       |
| <code>modelValue</code>                  | <code>string</code>                                                                              | —                              | 是   | Controlled component value.                               |
| <code>cursorToEndOnExternalUpdate</code> | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Moves the cursor to the end after external model updates. |
| <code>cursorToEndOnFirstFocus</code>     | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Moves the cursor to the end on first focus.               |
| <code>placeholder</code>                 | <code>string</code>                                                                              | <code>&quot;&quot;</code>      | 否   | Placeholder text shown when the input is empty.           |
| <code>placeholderWhenFocused</code>      | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Placeholder text used while the input has focus.          |
| <code>style</code>                       | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Base terminal cell style override.                        |
| <code>autoFocus</code>                   | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Requests focus when the component becomes visible.        |
| <code>cursorBlink</code>                 | <code>boolean</code>                                                                             | <code>true</code>              | 否   | Enables cursor blink rendering.                           |
| <code>cursorShape</code>                 | <code>&quot;block&quot; &#124; &quot;underline&quot; &#124; &quot;bar&quot;</code>               | <code>&quot;block&quot;</code> | 否   | Cursor glyph shape.                                       |
| <code>blinkInterval</code>               | <code>number</code>                                                                              | <code>500</code>               | 否   | Cursor blink interval in milliseconds.                    |
| <code>promptSuggestions</code>           | <code>readonly PromptSuggestion[]</code>                                                         | <code>() =&gt; []</code>       | 否   | Prompt popup suggestions.                                 |
| <code>promptTrigger</code>               | <code>string</code>                                                                              | <code>&quot;/&quot;</code>     | 否   | Prompt popup trigger character.                           |
| <code>promptTriggers</code>              | <code>readonly string[]</code>                                                                   | <code>undefined</code>         | 否   | Prompt popup trigger characters.                          |
| <code>promptMaxItems</code>              | <code>number</code>                                                                              | <code>6</code>                 | 否   | Maximum prompt popup rows.                                |
| <code>promptAlign</code>                 | <code>&quot;input&quot; &#124; &quot;center&quot;</code>                                         | <code>&quot;input&quot;</code> | 否   | Prompt popup alignment.                                   |
| <code>promptSelectedStyle</code>         | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for the active prompt suggestion.          |
| <code>promptPopupStyle</code>            | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for the prompt popup body.                 |
| <code>promptPopupBorderStyle</code>      | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for the prompt popup border.               |
| <code>promptPopupMatchStyle</code>       | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for prompt match highlights.               |
| <code>skillTrigger</code>                | <code>string</code>                                                                              | <code>&quot;&quot;</code>      | 否   | Trigger used for skill suggestions.                       |
| <code>skillSuggestions</code>            | <code>readonly PromptSuggestion[]</code>                                                         | <code>undefined</code>         | 否   | Skill suggestions shown in the prompt popup.              |
| <code>skillHighlightStyle</code>         | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for highlighted skill chips.               |
| <code>mentionTrigger</code>              | <code>string</code>                                                                              | <code>&quot;@&quot;</code>     | 否   | Trigger used for path or mention suggestions.             |
| <code>mentionWorkspace</code>            | <code>string</code>                                                                              | <code>&quot;&quot;</code>      | 否   | Workspace root used by mention providers.                 |
| <code>mentionMode</code>                 | <code>PathPickMode</code>                                                                        | <code>&quot;file&quot;</code>  | 否   | Mention provider mode.                                    |
| <code>mentionShowHidden</code>           | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Includes hidden paths in mention suggestions.             |
| <code>mentionSuggestions</code>          | <code>readonly PromptSuggestion[]</code>                                                         | <code>() =&gt; []</code>       | 否   | Mention suggestions supplied by the host.                 |
| <code>mentionMaxItems</code>             | <code>number</code>                                                                              | <code>8</code>                 | 否   | Maximum mention rows.                                     |
| <code>mentionChipStyle</code>            | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for mention chips.                         |
| <code>multilineChipStyle</code>          | <code>Style</code>                                                                               | <code>undefined</code>         | 否   | Style override for multiline chips.                       |
| <code>dedupeMentions</code>              | <code>boolean</code>                                                                             | <code>true</code>              | 否   | Removes duplicate mention entries.                        |
| <code>collectMentions</code>             | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Collects mention values from committed input.             |
| <code>mentions</code>                    | <code>readonly string[]</code>                                                                   | <code>() =&gt; []</code>       | 否   | Controlled collected mention values.                      |
| <code>collapseMultiline</code>           | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Collapses multiline pasted text into chips.               |
| <code>multilineTexts</code>              | <code>readonly string[]</code>                                                                   | <code>() =&gt; []</code>       | 否   | Controlled multiline chip text values.                    |
| <code>secret</code>                      | <code>boolean</code>                                                                             | <code>false</code>             | 否   | Masks input text when enabled.                            |
| <code>maskChar</code>                    | <code>string</code>                                                                              | <code>&quot;•&quot;</code>     | 否   | Character used to mask secret input.                      |
| <code>submitOnEnter</code>               | <code>boolean</code>                                                                             | <code>true</code>              | 否   | Emits change on Enter.                                    |
| <code>plugins</code>                     | <code>readonly TInputPlugin[]</code>                                                             | <code>() =&gt; []</code>       | 否   | Input plugins attached to this input.                     |
| <code>pasteImageHandler</code>           | <code>() =&gt; Promise&lt;string &#124; null&gt; &#124; string &#124; null</code>                | <code>undefined</code>         | 否   | Host handler for pasted images.                           |
| <code>filePasteHandler</code>            | <code>(absPath: string) =&gt; Promise&lt;string &#124; null&gt; &#124; string &#124; null</code> | <code>undefined</code>         | 否   | Host handler for pasted files.                            |

### Events

| 名称                               | Payload                                                     | 说明                                                 |
| ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| <code>update:modelValue</code>     | <code>string</code>                                         | Emitted when the controlled model value changes.     |
| <code>input</code>                 | <code>string</code>                                         | Emitted for input edits.                             |
| <code>change</code>                | <code>string</code>                                         | Emitted when the component commits a value change.   |
| <code>keydown</code>               | <code>TerminalKeyboardEvent</code>                          | Emitted for keydown events.                          |
| <code>focus</code>                 | <code>void</code>                                           | Emitted when the component receives focus.           |
| <code>blur</code>                  | <code>void</code>                                           | Emitted when the component loses focus.              |
| <code>pointerenter</code>          | <code>TerminalPointerEvent</code>                           | Emitted when the pointer enters the component.       |
| <code>pointerleave</code>          | <code>TerminalPointerEvent</code>                           | Emitted when the pointer leaves the component.       |
| <code>update:mentions</code>       | <code>readonly string[]</code>                              | Emitted when collected mentions change.              |
| <code>mentionClick</code>          | <code>(absPath: string, event: TerminalPointerEvent)</code> | Emitted when a rendered mention chip is clicked.     |
| <code>update:multilineTexts</code> | <code>readonly string[]</code>                              | Emitted when multiline chip text values change.      |
| <code>multilineClick</code>        | <code>number</code>                                         | Emitted when a multiline chip is clicked.            |
| <code>validationError</code>       | <code>{ reason: string }</code>                             | Emitted when input validation rejects a host action. |

## TInputBox

源码：`src/vue/components/TInputBox.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                                     | 类型                                  | 默认值                                          | 必填 | 说明 |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------------- | ---- | ---- |
| <code>x</code>                           | <code>number</code>                   | —                                               | 是   | —    |
| <code>y</code>                           | <code>number</code>                   | —                                               | 是   | —    |
| <code>w</code>                           | <code>number</code>                   | —                                               | 是   | —    |
| <code>h</code>                           | <code>number</code>                   | <code>8</code>                                  | 否   | —    |
| <code>zIndex</code>                      | <code>number</code>                   | <code>0</code>                                  | 否   | —    |
| <code>modelValue</code>                  | <code>string</code>                   | —                                               | 是   | —    |
| <code>placeholder</code>                 | <code>string</code>                   | <code>&quot;&quot;</code>                       | 否   | —    |
| <code>style</code>                       | <code>Style</code>                    | <code>undefined</code>                          | 否   | —    |
| <code>showIndentGuides</code>            | <code>boolean</code>                  | <code>true</code>                               | 否   | —    |
| <code>indentSize</code>                  | <code>number</code>                   | <code>2</code>                                  | 否   | —    |
| <code>guideColors</code>                 | <code>readonly AnsiColorName[]</code> | <code>() =&gt; [...DEFAULT_GUIDE_COLORS]</code> | 否   | —    |
| <code>autoFocus</code>                   | <code>boolean</code>                  | <code>false</code>                              | 否   | —    |
| <code>cursorToEndOnFirstFocus</code>     | <code>boolean</code>                  | <code>true</code>                               | 否   | —    |
| <code>cursorToEndOnExternalUpdate</code> | <code>boolean</code>                  | <code>true</code>                               | 否   | —    |
| <code>submitOnEnter</code>               | <code>boolean</code>                  | <code>false</code>                              | 否   | —    |

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

## TKeyHint

源码：`src/vue/components/TNavigation.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                    | 类型                | 默认值                                    | 必填 | 说明 |
| ----------------------- | ------------------- | ----------------------------------------- | ---- | ---- |
| <code>x</code>          | <code>number</code> | —                                         | 是   | —    |
| <code>y</code>          | <code>number</code> | —                                         | 是   | —    |
| <code>w</code>          | <code>number</code> | <code>undefined</code>                    | 否   | —    |
| <code>zIndex</code>     | <code>number</code> | <code>0</code>                            | 否   | —    |
| <code>combo</code>      | <code>string</code> | —                                         | 是   | —    |
| <code>label</code>      | <code>string</code> | —                                         | 是   | —    |
| <code>style</code>      | <code>Style</code>  | <code>undefined</code>                    | 否   | —    |
| <code>comboStyle</code> | <code>Style</code>  | <code>() =&gt; ({ inverse: true })</code> | 否   | —    |

### Events

—

## TLineChart

源码：`src/vue/components/TCharts.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                      | 类型                           | 默认值                                                              | 必填 | 说明                                                                 |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| <code>x</code>            | <code>number</code>            | —                                                                   | 是   | Left position in terminal cells.                                     |
| <code>y</code>            | <code>number</code>            | —                                                                   | 是   | Top position in terminal cells.                                      |
| <code>w</code>            | <code>number</code>            | —                                                                   | 是   | Width in terminal cells.                                             |
| <code>h</code>            | <code>number</code>            | —                                                                   | 是   | Height in terminal cells.                                            |
| <code>zIndex</code>       | <code>number</code>            | <code>0</code>                                                      | 否   | —                                                                    |
| <code>values</code>       | <code>readonly number[]</code> | —                                                                   | 是   | Numeric samples rendered across the chart width.                     |
| <code>labels</code>       | <code>readonly string[]</code> | <code>undefined</code>                                              | 否   | Labels aligned with values and shown in hover tooltips.              |
| <code>unit</code>         | <code>string</code>            | <code>&quot;&quot;</code>                                           | 否   | Unit appended to hover y values.                                     |
| <code>min</code>          | <code>number</code>            | <code>undefined</code>                                              | 否   | Lower domain bound. Defaults to the smallest sample.                 |
| <code>max</code>          | <code>number</code>            | <code>undefined</code>                                              | 否   | Upper domain bound. Defaults to the largest sample.                  |
| <code>style</code>        | <code>Style</code>             | <code>undefined</code>                                              | 否   | —                                                                    |
| <code>lineStyle</code>    | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;cyanBright&quot; })</code>              | 否   | Style used for line glyphs.                                          |
| <code>showAxes</code>     | <code>boolean</code>           | <code>true</code>                                                   | 否   | Whether to render axes and domain labels when there is enough space. |
| <code>axisStyle</code>    | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;white&quot;, dim: true })</code>        | 否   | Style used for axis lines.                                           |
| <code>labelStyle</code>   | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;whiteBright&quot; })</code>             | 否   | Style used for axis labels.                                          |
| <code>xLabel</code>       | <code>string</code>            | <code>&quot;&quot;</code>                                           | 否   | Label centered under the x axis.                                     |
| <code>yLabel</code>       | <code>string</code>            | <code>&quot;&quot;</code>                                           | 否   | Label rendered at the top of the plot area.                          |
| <code>startLabel</code>   | <code>string</code>            | <code>&quot;&quot;</code>                                           | 否   | Left endpoint label for the x axis when xLabel is empty.             |
| <code>endLabel</code>     | <code>string</code>            | <code>&quot;&quot;</code>                                           | 否   | Right endpoint label for the x axis when xLabel is empty.            |
| <code>showTooltip</code>  | <code>boolean</code>           | <code>true</code>                                                   | 否   | Whether pointer hover shows point values.                            |
| <code>hoverStyle</code>   | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;whiteBright&quot;, bold: true })</code> | 否   | Style merged onto the currently hovered point.                       |
| <code>tooltipStyle</code> | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;whiteBright&quot; })</code>             | 否   | Style used for hover tooltip text.                                   |

### Events

—

## TLink

源码：`src/vue/components/TLink.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                        | 类型                            | 默认值                                        | 必填 | 说明                                                |
| --------------------------- | ------------------------------- | --------------------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>              | <code>number</code>             | —                                             | 是   | Left position in terminal cells.                    |
| <code>y</code>              | <code>number</code>             | —                                             | 是   | Top position in terminal cells.                     |
| <code>w</code>              | <code>number</code>             | <code>undefined</code>                        | 否   | Width in terminal cells.                            |
| <code>h</code>              | <code>number</code>             | <code>1</code>                                | 否   | Height in terminal cells.                           |
| <code>zIndex</code>         | <code>number</code>             | <code>0</code>                                | 否   | Render and event ordering within the current plane. |
| <code>href</code>           | <code>string</code>             | —                                             | 是   | Link target to render and activate.                 |
| <code>label</code>          | <code>string</code>             | <code>undefined</code>                        | 否   | Visible label text.                                 |
| <code>style</code>          | <code>Style</code>              | <code>undefined</code>                        | 否   | Base terminal cell style override.                  |
| <code>hoverStyle</code>     | <code>Style</code>              | <code>undefined</code>                        | 否   | Style applied while the pointer hovers the link.    |
| <code>focusStyle</code>     | <code>Style</code>              | <code>undefined</code>                        | 否   | Style applied while the link has keyboard focus.    |
| <code>activeStyle</code>    | <code>Style</code>              | <code>undefined</code>                        | 否   | Style used for the active item or row.              |
| <code>disabled</code>       | <code>boolean</code>            | <code>false</code>                            | 否   | Disables pointer and keyboard activation.           |
| <code>visited</code>        | <code>boolean</code>            | <code>false</code>                            | 否   | Marks the link as already visited for styling.      |
| <code>openMode</code>       | <code>TLinkOpenMode</code>      | <code>&quot;host&quot;</code>                 | 否   | Link activation mode.                               |
| <code>activationKeys</code> | <code>readonly string[]</code>  | <code>() =&gt; DEFAULT_ACTIVATION_KEYS</code> | 否   | Keyboard keys that activate the link.               |
| <code>modifierClick</code>  | <code>TLinkModifierClick</code> | <code>&quot;none&quot;</code>                 | 否   | Pointer modifier required for click activation.     |
| <code>autoFocus</code>      | <code>boolean</code>            | <code>false</code>                            | 否   | Requests focus when the component becomes visible.  |

### Events

| 名称                     | Payload                              | 说明                                                      |
| ------------------------ | ------------------------------------ | --------------------------------------------------------- |
| <code>activate</code>    | <code>TLinkActivatePayload</code>    | Emitted when the link is activated.                       |
| <code>open</code>        | <code>TLinkOpenPayload</code>        | Emitted when the host opener accepts a link open request. |
| <code>invalidHref</code> | <code>TLinkInvalidHrefPayload</code> | Emitted when a link href is rejected by the sanitizer.    |
| <code>click</code>       | <code>TerminalPointerEvent</code>    | Emitted for click events.                                 |
| <code>keydown</code>     | <code>TerminalKeyboardEvent</code>   | Emitted for keydown events.                               |
| <code>focus</code>       | <code>TerminalBaseEvent</code>       | Emitted when the component receives focus.                |
| <code>blur</code>        | <code>TerminalBaseEvent</code>       | Emitted when the component loses focus.                   |

## TLinkifyText

源码：`src/vue/components/TLinkifyText.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                       | 类型                                     | 默认值                 | 必填 | 说明                                                     |
| -------------------------- | ---------------------------------------- | ---------------------- | ---- | -------------------------------------------------------- |
| <code>x</code>             | <code>number</code>                      | —                      | 是   | Left position in terminal cells.                         |
| <code>y</code>             | <code>number</code>                      | —                      | 是   | Top position in terminal cells.                          |
| <code>zIndex</code>        | <code>number</code>                      | <code>0</code>         | 否   | Render and event ordering within the current plane.      |
| <code>value</code>         | <code>string</code>                      | —                      | 是   | Text scanned for links and rendered into terminal cells. |
| <code>w</code>             | <code>number</code>                      | <code>undefined</code> | 否   | Width in terminal cells.                                 |
| <code>h</code>             | <code>number</code>                      | <code>undefined</code> | 否   | Height in terminal cells.                                |
| <code>style</code>         | <code>Style</code>                       | <code>undefined</code> | 否   | Base terminal cell style override.                       |
| <code>linkStyle</code>     | <code>Style</code>                       | <code>undefined</code> | 否   | Style applied to detected link segments.                 |
| <code>clear</code>         | <code>boolean</code>                     | <code>true</code>      | 否   | Clears the component rectangle before drawing content.   |
| <code>wrap</code>          | <code>boolean</code>                     | <code>false</code>     | 否   | Wraps text to the available cell width.                  |
| <code>protocols</code>     | <code>readonly TLinkifyProtocol[]</code> | <code>undefined</code> | 否   | URL protocols accepted by linkification.                 |
| <code>allowRelative</code> | <code>boolean</code>                     | <code>false</code>     | 否   | Allows relative hrefs in detected link segments.         |
| <code>maxUrlLength</code>  | <code>number</code>                      | <code>undefined</code> | 否   | Maximum detected URL length.                             |

### Events

—

## TList

源码：`src/vue/components/TList.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                     | 类型                  | 默认值                 | 必填 | 说明                                                                   |
| ------------------------ | --------------------- | ---------------------- | ---- | ---------------------------------------------------------------------- |
| <code>x</code>           | <code>number</code>   | —                      | 是   | Left position in terminal cells.                                       |
| <code>y</code>           | <code>number</code>   | —                      | 是   | Top position in terminal cells.                                        |
| <code>w</code>           | <code>number</code>   | —                      | 是   | Width in terminal cells.                                               |
| <code>h</code>           | <code>number</code>   | —                      | 是   | Height in terminal cells.                                              |
| <code>zIndex</code>      | <code>number</code>   | <code>0</code>         | 否   | Render and event ordering within the current plane.                    |
| <code>items</code>       | <code>string[]</code> | —                      | 是   | List rows rendered by the component.                                   |
| <code>itemVersion</code> | <code>number</code>   | <code>0</code>         | 否   | External version key for item changes that keep array identity stable. |
| <code>modelValue</code>  | <code>number</code>   | <code>0</code>         | 否   | Controlled component value.                                            |
| <code>style</code>       | <code>Style</code>    | <code>undefined</code> | 否   | Base terminal cell style override.                                     |
| <code>autoFocus</code>   | <code>boolean</code>  | <code>false</code>     | 否   | Requests focus when the component becomes visible.                     |
| <code>closeOnBlur</code> | <code>boolean</code>  | <code>false</code>     | 否   | Emits close when focus leaves the component.                           |

### Events

| 名称                           | Payload                                       | 说明                                               |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------- |
| <code>update:modelValue</code> | <code>number</code>                           | Emitted when the controlled model value changes.   |
| <code>change</code>            | <code>{ index: number; value: string }</code> | Emitted when the component commits a value change. |
| <code>scroll</code>            | <code>number</code>                           | Emitted when the visible scroll offset changes.    |
| <code>close</code>             | <code>void</code>                             | Emitted when the component requests to close.      |
| <code>focus</code>             | <code>void</code>                             | Emitted when the component receives focus.         |
| <code>blur</code>              | <code>void</code>                             | Emitted when the component loses focus.            |
| <code>keydown</code>           | <code>TerminalKeyboardEvent</code>            | Emitted for keydown events.                        |

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

| 名称                            | 类型                                                        | 默认值                                                | 必填 | 说明                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| <code>x</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>y</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>w</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>h</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>zIndex</code>             | <code>number</code>                                         | <code>0</code>                                        | 否   | —                                                                                                                           |
| <code>source</code>             | <code>TLogDataSource</code>                                 | —                                                     | 是   | —                                                                                                                           |
| <code>version</code>            | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>scrollTop</code>          | <code>number</code>                                         | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>defaultScrollTop</code>   | <code>number</code>                                         | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>style</code>              | <code>Style</code>                                          | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>autoFocus</code>          | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>selectable</code>         | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —                                                                                                                           |
| <code>autoStickToBottom</code>  | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —                                                                                                                           |
| <code>overscan</code>           | <code>number</code>                                         | <code>2</code>                                        | 否   | —                                                                                                                           |
| <code>wrap</code>               | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>visualIndexMode</code>    | <code>&quot;estimated&quot; &#124; &quot;exact&quot;</code> | <code>&quot;estimated&quot;</code>                    | 否   | —                                                                                                                           |
| <code>visualIndexOptions</code> | <code>TLogViewVisualIndexOptions</code>                     | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>ansi</code>               | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>links</code>              | <code>boolean</code>                                        | <code>false</code>                                    | 否   | Parses OSC8 links only with ansi=true; OSC8 links preserve parsed ANSI style and<br>do not inherit TLink theme defaults.    |
| <code>linkify</code>            | <code>boolean &#124; TLinkifyOptions</code>                 | <code>false</code>                                    | 否   | Plain-text URL linkification for ansi=false rows; generated links inherit TLink<br>theme defaults before linkStyle.         |
| <code>linkStyle</code>          | <code>Style</code>                                          | <code>undefined</code>                                | 否   | Link style override. OSC8 defaults to underline-only over parsed ANSI style;<br>linkify also inherits TLink theme defaults. |
| <code>keyboardLinks</code>      | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>linkFocusStyle</code>     | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true })</code>             | 否   | —                                                                                                                           |
| <code>searchQuery</code>        | <code>string</code>                                         | <code>&quot;&quot;</code>                             | 否   | —                                                                                                                           |
| <code>searchOptions</code>      | <code>TLogViewSearchOptions</code>                          | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>highlightMatches</code>   | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —                                                                                                                           |
| <code>matchStyle</code>         | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true })</code>             | 否   | —                                                                                                                           |
| <code>currentMatchStyle</code>  | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true, bold: true })</code> | 否   | —                                                                                                                           |
| <code>rowScrollMode</code>      | <code>RowScrollMode</code>                                  | <code>&quot;off&quot;</code>                          | 否   | —                                                                                                                           |

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

## TMarkdownText

源码：`src/vue/components/TMarkdownText.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui/markdown`

### Props

| 名称                                  | 类型                                   | 默认值                 | 必填 | 说明                                                                                         |
| ------------------------------------- | -------------------------------------- | ---------------------- | ---- | -------------------------------------------------------------------------------------------- |
| <code>x</code>                        | <code>number</code>                    | —                      | 是   | Left position in terminal cells.                                                             |
| <code>y</code>                        | <code>number</code>                    | —                      | 是   | Top position in terminal cells.                                                              |
| <code>zIndex</code>                   | <code>number</code>                    | <code>0</code>         | 否   | Render and event ordering within the current plane.                                          |
| <code>content</code>                  | <code>string</code>                    | —                      | 是   | Markdown source rendered into terminal visual rows.                                          |
| <code>w</code>                        | <code>number</code>                    | —                      | 是   | Width in terminal cells.                                                                     |
| <code>h</code>                        | <code>number</code>                    | <code>undefined</code> | 否   | Height in terminal cells.                                                                    |
| <code>style</code>                    | <code>Style</code>                     | <code>undefined</code> | 否   | Base terminal cell style override.                                                           |
| <code>final</code>                    | <code>boolean</code>                   | <code>true</code>      | 否   | Parses the markdown as a complete document when enabled.                                     |
| <code>streaming</code>                | <code>boolean</code>                   | <code>false</code>     | 否   | Coalesces rapid content updates into frame-scheduled markdown rebuilds.                      |
| <code>clear</code>                    | <code>boolean</code>                   | <code>true</code>      | 否   | Clears the component rectangle before drawing content.                                       |
| <code>customHtmlTags</code>           | <code>readonly string[]</code>         | <code>undefined</code> | 否   | Additional HTML tag names accepted by the markdown parser.                                   |
| <code>theme</code>                    | <code>TuiMarkdownThemeOverrides</code> | <code>undefined</code> | 否   | Markdown theme token overrides for parsed blocks and inline segments.                        |
| <code>imageRenderer</code>            | <code>TuiMarkdownImageResolver</code>  | <code>undefined</code> | 否   | Optional resolver for markdown image payloads before terminal graphics rendering.            |
| <code>imageMinWidth</code>            | <code>number</code>                    | <code>undefined</code> | 否   | Minimum markdown image render width in terminal cells.                                       |
| <code>imageMaxWidth</code>            | <code>number</code>                    | <code>undefined</code> | 否   | Maximum markdown image render width in terminal cells.                                       |
| <code>imageMinHeight</code>           | <code>number</code>                    | <code>undefined</code> | 否   | Minimum markdown image render height in terminal cells.                                      |
| <code>imageMaxHeight</code>           | <code>number</code>                    | <code>undefined</code> | 否   | Maximum markdown image render height in terminal cells.                                      |
| <code>imagePreserveAspectRatio</code> | <code>boolean</code>                   | <code>true</code>      | 否   | Preserves markdown image aspect ratio while fitting width and height bounds.                 |
| <code>imageActions</code>             | <code>boolean</code>                   | <code>false</code>     | 否   | Enables pointer actions for rendered markdown images.                                        |
| <code>mathActions</code>              | <code>boolean</code>                   | <code>false</code>     | 否   | Enables pointer actions for rendered markdown math blocks.                                   |
| <code>linkActions</code>              | <code>boolean</code>                   | <code>false</code>     | 否   | Enables pointer actions for rendered markdown links.                                         |
| <code>imageOcclusionRects</code>      | <code>readonly Rect[]</code>           | <code>undefined</code> | 否   | Terminal rectangles that markdown image layout treats as unavailable for graphics placement. |

### Events

| 名称                     | Payload                                    | 说明                                                                          |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| <code>imageAction</code> | <code>TuiMarkdownImageActionPayload</code> | Emitted when imageActions is enabled and a markdown image action is selected. |
| <code>mathAction</code>  | <code>TuiMarkdownMathActionPayload</code>  | Emitted when mathActions is enabled and a markdown math action is selected.   |
| <code>linkAction</code>  | <code>TuiMarkdownLinkActionPayload</code>  | Emitted when linkActions is enabled and a markdown link action is selected.   |

## TMermaid

源码：`src/vue/components/TMermaidText.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                               | 类型                                          | 默认值                                                                                             | 必填 | 说明 |
| ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- | ---- |
| <code>x</code>                     | <code>number</code>                           | —                                                                                                  | 是   | —    |
| <code>y</code>                     | <code>number</code>                           | —                                                                                                  | 是   | —    |
| <code>w</code>                     | <code>number</code>                           | —                                                                                                  | 是   | —    |
| <code>h</code>                     | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>zIndex</code>                | <code>number</code>                           | <code>0</code>                                                                                     | 否   | —    |
| <code>content</code>               | <code>string</code>                           | <code>&quot;&quot;</code>                                                                          | 否   | —    |
| <code>code</code>                  | <code>string</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>style</code>                 | <code>Style</code>                            | <code>undefined</code>                                                                             | 否   | —    |
| <code>loadingStyle</code>          | <code>Style</code>                            | <code>undefined</code>                                                                             | 否   | —    |
| <code>errorStyle</code>            | <code>Style</code>                            | <code>undefined</code>                                                                             | 否   | —    |
| <code>clear</code>                 | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>final</code>                 | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>streaming</code>             | <code>boolean</code>                          | <code>false</code>                                                                                 | 否   | —    |
| <code>ascii</code>                 | <code>boolean</code>                          | <code>false</code>                                                                                 | 否   | —    |
| <code>paddingX</code>              | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>paddingY</code>              | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>boxBorderPadding</code>      | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>options</code>               | <code>TMermaidAsciiOptions</code>             | <code>undefined</code>                                                                             | 否   | —    |
| <code>renderer</code>              | <code>TMermaidRenderer</code>                 | <code>undefined</code>                                                                             | 否   | —    |
| <code>isTransientError</code>      | <code>TMermaidTransientErrorClassifier</code> | <code>undefined</code>                                                                             | 否   | —    |
| <code>shouldRenderSource</code>    | <code>TMermaidRenderEligibility</code>        | <code>undefined</code>                                                                             | 否   | —    |
| <code>loadingText</code>           | <code>string</code>                           | <code>&quot;Rendering Mermaid diagram...&quot;</code>                                              | 否   | —    |
| <code>incompleteText</code>        | <code>string</code>                           | <code>&quot;Waiting for complete Mermaid diagram...&quot;</code>                                   | 否   | —    |
| <code>missingDependencyText</code> | <code>string</code>                           | <code>&quot;Install the Mermaid renderer package and use TMermaidText from @simon_he/vue...</code> | 否   | —    |
| <code>errorText</code>             | <code>string</code>                           | <code>&quot;Mermaid render failed&quot;</code>                                                     | 否   | —    |
| <code>showErrorDetails</code>      | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>box</code>                   | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>title</code>                 | <code>string</code>                           | <code>&quot;mermaid&quot;</code>                                                                   | 否   | —    |
| <code>copyButton</code>            | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>copyText</code>              | <code>string</code>                           | <code>&quot;copy&quot;</code>                                                                      | 否   | —    |
| <code>copiedText</code>            | <code>string</code>                           | <code>&quot;copied&quot;</code>                                                                    | 否   | —    |
| <code>renderTimeoutMs</code>       | <code>number</code>                           | <code>DEFAULT_MERMAID_RENDER_TIMEOUT_MS</code>                                                     | 否   | —    |
| <code>maxRenderSourceChars</code>  | <code>number</code>                           | <code>DEFAULT_MERMAID_MAX_RENDER_SOURCE_CHARS</code>                                               | 否   | —    |
| <code>maxRenderSourceLines</code>  | <code>number</code>                           | <code>DEFAULT_MERMAID_MAX_RENDER_SOURCE_LINES</code>                                               | 否   | —    |
| <code>copiedDurationMs</code>      | <code>number</code>                           | <code>DEFAULT_MERMAID_COPIED_DURATION_MS</code>                                                    | 否   | —    |

### Events

| 名称              | Payload                          | 说明 |
| ----------------- | -------------------------------- | ---- |
| <code>copy</code> | <code>TMermaidCopyPayload</code> | —    |

## TMermaidText

源码：`src/vue/components/TMermaidText.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                               | 类型                                          | 默认值                                                                                             | 必填 | 说明 |
| ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- | ---- |
| <code>x</code>                     | <code>number</code>                           | —                                                                                                  | 是   | —    |
| <code>y</code>                     | <code>number</code>                           | —                                                                                                  | 是   | —    |
| <code>w</code>                     | <code>number</code>                           | —                                                                                                  | 是   | —    |
| <code>h</code>                     | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>zIndex</code>                | <code>number</code>                           | <code>0</code>                                                                                     | 否   | —    |
| <code>content</code>               | <code>string</code>                           | <code>&quot;&quot;</code>                                                                          | 否   | —    |
| <code>code</code>                  | <code>string</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>style</code>                 | <code>Style</code>                            | <code>undefined</code>                                                                             | 否   | —    |
| <code>loadingStyle</code>          | <code>Style</code>                            | <code>undefined</code>                                                                             | 否   | —    |
| <code>errorStyle</code>            | <code>Style</code>                            | <code>undefined</code>                                                                             | 否   | —    |
| <code>clear</code>                 | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>final</code>                 | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>streaming</code>             | <code>boolean</code>                          | <code>false</code>                                                                                 | 否   | —    |
| <code>ascii</code>                 | <code>boolean</code>                          | <code>false</code>                                                                                 | 否   | —    |
| <code>paddingX</code>              | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>paddingY</code>              | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>boxBorderPadding</code>      | <code>number</code>                           | <code>undefined</code>                                                                             | 否   | —    |
| <code>options</code>               | <code>TMermaidAsciiOptions</code>             | <code>undefined</code>                                                                             | 否   | —    |
| <code>renderer</code>              | <code>TMermaidRenderer</code>                 | <code>undefined</code>                                                                             | 否   | —    |
| <code>isTransientError</code>      | <code>TMermaidTransientErrorClassifier</code> | <code>undefined</code>                                                                             | 否   | —    |
| <code>shouldRenderSource</code>    | <code>TMermaidRenderEligibility</code>        | <code>undefined</code>                                                                             | 否   | —    |
| <code>loadingText</code>           | <code>string</code>                           | <code>&quot;Rendering Mermaid diagram...&quot;</code>                                              | 否   | —    |
| <code>incompleteText</code>        | <code>string</code>                           | <code>&quot;Waiting for complete Mermaid diagram...&quot;</code>                                   | 否   | —    |
| <code>missingDependencyText</code> | <code>string</code>                           | <code>&quot;Install the Mermaid renderer package and use TMermaidText from @simon_he/vue...</code> | 否   | —    |
| <code>errorText</code>             | <code>string</code>                           | <code>&quot;Mermaid render failed&quot;</code>                                                     | 否   | —    |
| <code>showErrorDetails</code>      | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>box</code>                   | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>title</code>                 | <code>string</code>                           | <code>&quot;mermaid&quot;</code>                                                                   | 否   | —    |
| <code>copyButton</code>            | <code>boolean</code>                          | <code>true</code>                                                                                  | 否   | —    |
| <code>copyText</code>              | <code>string</code>                           | <code>&quot;copy&quot;</code>                                                                      | 否   | —    |
| <code>copiedText</code>            | <code>string</code>                           | <code>&quot;copied&quot;</code>                                                                    | 否   | —    |
| <code>renderTimeoutMs</code>       | <code>number</code>                           | <code>DEFAULT_MERMAID_RENDER_TIMEOUT_MS</code>                                                     | 否   | —    |
| <code>maxRenderSourceChars</code>  | <code>number</code>                           | <code>DEFAULT_MERMAID_MAX_RENDER_SOURCE_CHARS</code>                                               | 否   | —    |
| <code>maxRenderSourceLines</code>  | <code>number</code>                           | <code>DEFAULT_MERMAID_MAX_RENDER_SOURCE_LINES</code>                                               | 否   | —    |
| <code>copiedDurationMs</code>      | <code>number</code>                           | <code>DEFAULT_MERMAID_COPIED_DURATION_MS</code>                                                    | 否   | —    |

### Events

| 名称              | Payload                          | 说明 |
| ----------------- | -------------------------------- | ---- |
| <code>copy</code> | <code>TMermaidCopyPayload</code> | —    |

## TMultilineModal

源码：`src/vue/components/TMultilineModal.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

## TPasswordInput

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                     | 类型                 | 默认值                    | 必填 | 说明                                                |
| ------------------------ | -------------------- | ------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>           | <code>number</code>  | —                         | 是   | Left position in terminal cells.                    |
| <code>y</code>           | <code>number</code>  | —                         | 是   | Top position in terminal cells.                     |
| <code>w</code>           | <code>number</code>  | —                         | 是   | Width in terminal cells.                            |
| <code>h</code>           | <code>number</code>  | <code>1</code>            | 否   | Height in terminal cells.                           |
| <code>zIndex</code>      | <code>number</code>  | <code>0</code>            | 否   | Render and event ordering within the current plane. |
| <code>modelValue</code>  | <code>string</code>  | —                         | 是   | Controlled component value.                         |
| <code>placeholder</code> | <code>string</code>  | <code>&quot;&quot;</code> | 否   | Placeholder text shown when the input is empty.     |
| <code>style</code>       | <code>Style</code>   | <code>undefined</code>    | 否   | Base terminal cell style override.                  |
| <code>autoFocus</code>   | <code>boolean</code> | <code>false</code>        | 否   | Requests focus when the component becomes visible.  |

### Events

| 名称                           | Payload             | 说明                                               |
| ------------------------------ | ------------------- | -------------------------------------------------- |
| <code>update:modelValue</code> | <code>string</code> | Emitted when the controlled model value changes.   |
| <code>input</code>             | <code>string</code> | Emitted for input edits.                           |
| <code>change</code>            | <code>string</code> | Emitted when the component commits a value change. |

## TPathPicker

源码：`src/vue/components/TPathPicker.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

## TPieChart

源码：`src/vue/components/TCharts.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                       | 类型                           | 默认值                                                  | 必填 | 说明                                                                       |
| -------------------------- | ------------------------------ | ------------------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| <code>x</code>             | <code>number</code>            | —                                                       | 是   | Left position in terminal cells.                                           |
| <code>y</code>             | <code>number</code>            | —                                                       | 是   | Top position in terminal cells.                                            |
| <code>w</code>             | <code>number</code>            | —                                                       | 是   | Width in terminal cells.                                                   |
| <code>h</code>             | <code>number</code>            | —                                                       | 是   | Height in terminal cells.                                                  |
| <code>zIndex</code>        | <code>number</code>            | <code>0</code>                                          | 否   | —                                                                          |
| <code>values</code>        | <code>readonly number[]</code> | —                                                       | 是   | Segment values rendered clockwise from the top.                            |
| <code>labels</code>        | <code>readonly string[]</code> | <code>undefined</code>                                  | 否   | Labels aligned with segment values and shown in the legend.                |
| <code>style</code>         | <code>Style</code>             | <code>undefined</code>                                  | 否   | —                                                                          |
| <code>segmentStyles</code> | <code>readonly Style[]</code>  | <code>() =&gt; DEFAULT_PIE_SEGMENT_STYLES</code>        | 否   | Segment styles cycled when there are more segments than styles.            |
| <code>cell</code>          | <code>string</code>            | <code>&quot;█&quot;</code>                              | 否   | Glyph used for filled pie cells.                                           |
| <code>showLegend</code>    | <code>boolean</code>           | <code>true</code>                                       | 否   | Whether to render a label/value/percent legend when there is enough space. |
| <code>legendStyle</code>   | <code>Style</code>             | <code>() =&gt; ({ fg: &quot;whiteBright&quot; })</code> | 否   | Style used for legend text.                                                |

### Events

—

## TPopover

源码：`src/vue/components/TOverlay.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                      | 类型                 | 默认值                    | 必填 | 说明                                                                     |
| ------------------------- | -------------------- | ------------------------- | ---- | ------------------------------------------------------------------------ |
| <code>modelValue</code>   | <code>boolean</code> | —                         | 是   | —                                                                        |
| <code>x</code>            | <code>number</code>  | —                         | 是   | Caller-owned x position; no viewport clamp or flip placement is applied. |
| <code>y</code>            | <code>number</code>  | —                         | 是   | Caller-owned y position; no viewport clamp or flip placement is applied. |
| <code>w</code>            | <code>number</code>  | —                         | 是   | —                                                                        |
| <code>h</code>            | <code>number</code>  | —                         | 是   | —                                                                        |
| <code>zIndex</code>       | <code>number</code>  | <code>15</code>           | 否   | —                                                                        |
| <code>title</code>        | <code>string</code>  | <code>&quot;&quot;</code> | 否   | —                                                                        |
| <code>content</code>      | <code>string</code>  | <code>&quot;&quot;</code> | 否   | —                                                                        |
| <code>style</code>        | <code>Style</code>   | <code>undefined</code>    | 否   | —                                                                        |
| <code>contentStyle</code> | <code>Style</code>   | <code>undefined</code>    | 否   | —                                                                        |

### Events

—

## TProgress

源码：`src/vue/components/TFeedback.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                     | 类型                 | 默认值                    | 必填 | 说明 |
| ------------------------ | -------------------- | ------------------------- | ---- | ---- |
| <code>x</code>           | <code>number</code>  | —                         | 是   | —    |
| <code>y</code>           | <code>number</code>  | —                         | 是   | —    |
| <code>w</code>           | <code>number</code>  | —                         | 是   | —    |
| <code>zIndex</code>      | <code>number</code>  | <code>0</code>            | 否   | —    |
| <code>value</code>       | <code>number</code>  | —                         | 是   | —    |
| <code>max</code>         | <code>number</code>  | <code>100</code>          | 否   | —    |
| <code>label</code>       | <code>string</code>  | <code>&quot;&quot;</code> | 否   | —    |
| <code>showPercent</code> | <code>boolean</code> | <code>true</code>         | 否   | —    |
| <code>style</code>       | <code>Style</code>   | <code>undefined</code>    | 否   | —    |
| <code>barStyle</code>    | <code>Style</code>   | <code>undefined</code>    | 否   | —    |

### Events

—

## TRadioGroup

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                       | 类型                                 | 默认值                                    | 必填 | 说明                                                |
| -------------------------- | ------------------------------------ | ----------------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>             | <code>number</code>                  | —                                         | 是   | Left position in terminal cells.                    |
| <code>y</code>             | <code>number</code>                  | —                                         | 是   | Top position in terminal cells.                     |
| <code>w</code>             | <code>number</code>                  | —                                         | 是   | Width in terminal cells.                            |
| <code>h</code>             | <code>number</code>                  | —                                         | 是   | Height in terminal cells.                           |
| <code>zIndex</code>        | <code>number</code>                  | <code>0</code>                            | 否   | Render and event ordering within the current plane. |
| <code>modelValue</code>    | <code>string</code>                  | <code>&quot;&quot;</code>                 | 否   | Controlled component value.                         |
| <code>options</code>       | <code>readonly TRadioOption[]</code> | —                                         | 是   | Options rendered by the control.                    |
| <code>style</code>         | <code>Style</code>                   | <code>undefined</code>                    | 否   | Base terminal cell style override.                  |
| <code>activeStyle</code>   | <code>Style</code>                   | <code>() =&gt; ({ inverse: true })</code> | 否   | Style used for the active item or row.              |
| <code>disabledStyle</code> | <code>Style</code>                   | <code>() =&gt; ({ dim: true })</code>     | 否   | Style used for disabled content.                    |

### Events

| 名称                           | Payload             | 说明                                               |
| ------------------------------ | ------------------- | -------------------------------------------------- |
| <code>update:modelValue</code> | <code>string</code> | Emitted when the controlled model value changes.   |
| <code>change</code>            | <code>string</code> | Emitted when the component commits a value change. |

## TRenderLayer

源码：`src/vue/components/TRenderLayer.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                | 类型                | 默认值         | 必填 | 说明 |
| ------------------- | ------------------- | -------------- | ---- | ---- |
| <code>zIndex</code> | <code>number</code> | <code>0</code> | 否   | —    |

### Events

—

## TRenderPlane

源码：`src/vue/components/TRenderPlane.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称               | 类型                             | 默认值                           | 必填 | 说明 |
| ------------------ | -------------------------------- | -------------------------------- | ---- | ---- |
| <code>plane</code> | <code>TerminalRenderPlane</code> | <code>&quot;default&quot;</code> | 否   | —    |

### Events

—

## TRouterView

源码：`src/vue/router/RouterView.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

| 名称                             | 类型                                 | 默认值                                          | 必填 | 说明                                                                                                                                                                        |
| -------------------------------- | ------------------------------------ | ----------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>x</code>                   | <code>number</code>                  | —                                               | 是   | Left position in terminal cells.                                                                                                                                            |
| <code>y</code>                   | <code>number</code>                  | —                                               | 是   | Top position in terminal cells.                                                                                                                                             |
| <code>w</code>                   | <code>number</code>                  | —                                               | 是   | Width in terminal cells.                                                                                                                                                    |
| <code>h</code>                   | <code>number</code>                  | —                                               | 是   | Height in terminal cells.                                                                                                                                                   |
| <code>zIndex</code>              | <code>number</code>                  | <code>0</code>                                  | 否   | Render and event ordering within the current plane.                                                                                                                         |
| <code>options</code>             | <code>readonly SelectOption[]</code> | <code>() =&gt; []</code>                        | 否   | Options rendered by the control.                                                                                                                                            |
| <code>optionProvider</code>      | <code>TSelectOptionProvider</code>   | <code>undefined</code>                          | 否   | Async option provider called with the current query and an AbortSignal for stale requests.                                                                                  |
| <code>query</code>               | <code>string</code>                  | <code>undefined</code>                          | 否   | Search query used by filtering or async providers.                                                                                                                          |
| <code>modelValue</code>          | <code>TSelectModelValue</code>       | <code>0</code>                                  | 否   | Controlled component value.                                                                                                                                                 |
| <code>valueMode</code>           | <code>TSelectValueMode</code>        | <code>&quot;index&quot;</code>                  | 否   | Model value shape emitted by the select v-model.                                                                                                                            |
| <code>activeIndex</code>         | <code>number</code>                  | <code>undefined</code>                          | 否   | Controlled active option index.                                                                                                                                             |
| <code>multiple</code>            | <code>boolean</code>                 | <code>false</code>                              | 否   | Enables multi-select mode.                                                                                                                                                  |
| <code>multipleEmit</code>        | <code>TSelectMultipleEmitMode</code> | <code>&quot;label&quot;</code>                  | 否   | Payload shape used by multi-select change and confirm events: "label" emits labels, "value" emits option values, "index" emits indices, and "both" emits an object payload. |
| <code>style</code>               | <code>Style</code>                   | <code>undefined</code>                          | 否   | Base terminal cell style override.                                                                                                                                          |
| <code>highlightStyle</code>      | <code>Style</code>                   | <code>undefined</code>                          | 否   | Style used for the highlighted row or match.                                                                                                                                |
| <code>matchStyle</code>          | <code>Style</code>                   | <code>undefined</code>                          | 否   | Style used for matched text.                                                                                                                                                |
| <code>highlightMatchStyle</code> | <code>Style</code>                   | <code>undefined</code>                          | 否   | Style used for highlighted text while the row is active.                                                                                                                    |
| <code>autoFocus</code>           | <code>boolean</code>                 | <code>false</code>                              | 否   | Requests focus when the component becomes visible.                                                                                                                          |
| <code>closeOnBlur</code>         | <code>boolean</code>                 | <code>false</code>                              | 否   | Emits close when focus leaves the component.                                                                                                                                |
| <code>searchable</code>          | <code>boolean</code>                 | <code>false</code>                              | 否   | Emits query updates from typed characters; local options are not filtered automatically.                                                                                    |
| <code>typeahead</code>           | <code>boolean</code>                 | <code>true</code>                               | 否   | Enables keyboard typeahead navigation.                                                                                                                                      |
| <code>debounce</code>            | <code>number</code>                  | <code>0</code>                                  | 否   | Delay before calling an async provider, in milliseconds.                                                                                                                    |
| <code>emptyText</code>           | <code>string</code>                  | <code>&quot;No options&quot;</code>             | 否   | Text rendered when there are no rows or items.                                                                                                                              |
| <code>loading</code>             | <code>boolean</code>                 | <code>false</code>                              | 否   | Shows the loading row; true also covers pending async option providers.                                                                                                     |
| <code>loadingText</code>         | <code>string</code>                  | <code>&quot;Loading...&quot;</code>             | 否   | Text rendered while async loading is pending.                                                                                                                               |
| <code>errorText</code>           | <code>string</code>                  | <code>&quot;Unable to load options&quot;</code> | 否   | Text rendered when async loading fails.                                                                                                                                     |
| <code>maxVisible</code>          | <code>number</code>                  | <code>undefined</code>                          | 否   | Maximum number of option rows rendered at once.                                                                                                                             |

### Events

| 名称                            | Payload                                                                                                                                     | 说明                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <code>update:modelValue</code>  | <code>number &#124; number[] &#124; string &#124; string[] &#124; unknown &#124; unknown[] &#124; SelectOption &#124; SelectOption[]</code> | Emitted when the controlled model value changes.                                                                                                             |
| <code>update:activeIndex</code> | <code>number</code>                                                                                                                         | Emitted when the active option index changes.                                                                                                                |
| <code>update:query</code>       | <code>string</code>                                                                                                                         | Emitted when the controlled query changes.                                                                                                                   |
| <code>change</code>             | <code>string &#124; string[] &#124; unknown[] &#124; number[] &#124; TSelectMultipleChangePayload &#124; null</code>                        | For single select, emits the selected option label or null; valueMode only affects update:modelValue. For multiple select, the payload follows multipleEmit. |
| <code>confirm</code>            | <code>string[] &#124; unknown[] &#124; number[] &#124; TSelectMultipleChangePayload</code>                                                  | Emitted when multi-select commits the current selection.                                                                                                     |
| <code>close</code>              | <code>void</code>                                                                                                                           | Emitted when the component requests to close.                                                                                                                |
| <code>focus</code>              | <code>void</code>                                                                                                                           | Emitted when the component receives focus.                                                                                                                   |
| <code>blur</code>               | <code>void</code>                                                                                                                           | Emitted when the component loses focus.                                                                                                                      |
| <code>keydown</code>            | <code>TerminalKeyboardEvent</code>                                                                                                          | Emitted for keydown events.                                                                                                                                  |
| <code>loadError</code>          | <code>{ query: string; error: unknown }</code>                                                                                              | Emitted when the async option provider rejects; aborted stale requests do not emit.                                                                          |

## TSlider

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                       | 类型                 | 默认值                                                 | 必填 | 说明                                                |
| -------------------------- | -------------------- | ------------------------------------------------------ | ---- | --------------------------------------------------- |
| <code>x</code>             | <code>number</code>  | —                                                      | 是   | Left position in terminal cells.                    |
| <code>y</code>             | <code>number</code>  | —                                                      | 是   | Top position in terminal cells.                     |
| <code>w</code>             | <code>number</code>  | —                                                      | 是   | Width in terminal cells.                            |
| <code>zIndex</code>        | <code>number</code>  | <code>0</code>                                         | 否   | Render and event ordering within the current plane. |
| <code>modelValue</code>    | <code>number</code>  | <code>0</code>                                         | 否   | Controlled component value.                         |
| <code>min</code>           | <code>number</code>  | <code>0</code>                                         | 否   | Minimum numeric value.                              |
| <code>max</code>           | <code>number</code>  | <code>100</code>                                       | 否   | Maximum numeric value.                              |
| <code>step</code>          | <code>number</code>  | <code>1</code>                                         | 否   | Keyboard increment step.                            |
| <code>disabled</code>      | <code>boolean</code> | <code>false</code>                                     | 否   | Disables pointer and keyboard activation.           |
| <code>style</code>         | <code>Style</code>   | <code>undefined</code>                                 | 否   | Base terminal cell style override.                  |
| <code>activeStyle</code>   | <code>Style</code>   | <code>() =&gt; ({ fg: &quot;cyanBright&quot; })</code> | 否   | Style used for the active item or row.              |
| <code>disabledStyle</code> | <code>Style</code>   | <code>() =&gt; ({ dim: true })</code>                  | 否   | Style used for disabled content.                    |

### Events

| 名称                           | Payload             | 说明                                               |
| ------------------------------ | ------------------- | -------------------------------------------------- |
| <code>update:modelValue</code> | <code>number</code> | Emitted when the controlled model value changes.   |
| <code>change</code>            | <code>number</code> | Emitted when the component commits a value change. |

## TSpinner

源码：`src/vue/components/TFeedback.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                    | 类型                           | 默认值                                                                                   | 必填 | 说明 |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | ---- | ---- |
| <code>x</code>          | <code>number</code>            | —                                                                                        | 是   | —    |
| <code>y</code>          | <code>number</code>            | —                                                                                        | 是   | —    |
| <code>w</code>          | <code>number</code>            | <code>undefined</code>                                                                   | 否   | —    |
| <code>zIndex</code>     | <code>number</code>            | <code>0</code>                                                                           | 否   | —    |
| <code>frames</code>     | <code>readonly string[]</code> | <code>() =&gt; [&quot;&#124;&quot;, &quot;/&quot;, &quot;-&quot;, &quot;\\&quot;]</code> | 否   | —    |
| <code>frameIndex</code> | <code>number</code>            | <code>0</code>                                                                           | 否   | —    |
| <code>label</code>      | <code>string</code>            | <code>&quot;&quot;</code>                                                                | 否   | —    |
| <code>running</code>    | <code>boolean</code>           | <code>true</code>                                                                        | 否   | —    |
| <code>style</code>      | <code>Style</code>             | <code>undefined</code>                                                                   | 否   | —    |

### Events

—

## TSplitPane

源码：`src/vue/components/TPanels.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                        | 类型                             | 默认值                                | 必填 | 说明 |
| --------------------------- | -------------------------------- | ------------------------------------- | ---- | ---- |
| <code>x</code>              | <code>number</code>              | —                                     | 是   | —    |
| <code>y</code>              | <code>number</code>              | —                                     | 是   | —    |
| <code>w</code>              | <code>number</code>              | —                                     | 是   | —    |
| <code>h</code>              | <code>number</code>              | —                                     | 是   | —    |
| <code>zIndex</code>         | <code>number</code>              | <code>0</code>                        | 否   | —    |
| <code>direction</code>      | <code>TSplitPaneDirection</code> | <code>&quot;horizontal&quot;</code>   | 否   | —    |
| <code>sizes</code>          | <code>readonly number[]</code>   | —                                     | 是   | —    |
| <code>minSizes</code>       | <code>readonly number[]</code>   | <code>() =&gt; []</code>              | 否   | —    |
| <code>separatorStyle</code> | <code>Style</code>               | <code>() =&gt; ({ dim: true })</code> | 否   | —    |

### Events

| 名称                      | Payload               | 说明 |
| ------------------------- | --------------------- | ---- |
| <code>update:sizes</code> | <code>number[]</code> | —    |
| <code>resize</code>       | <code>number[]</code> | —    |

### Slots

| 名称                 | Props                                             | 说明                                                                                     |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| <code>default</code> | <code>{ panes: readonly TSplitPaneRect[] }</code> | Pane content renderer. The host renders pane children from the resolved pane rectangles. |

## TStatusBar

源码：`src/vue/components/TNavigation.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                | 类型                | 默认值                                    | 必填 | 说明 |
| ------------------- | ------------------- | ----------------------------------------- | ---- | ---- |
| <code>x</code>      | <code>number</code> | —                                         | 是   | —    |
| <code>y</code>      | <code>number</code> | —                                         | 是   | —    |
| <code>w</code>      | <code>number</code> | —                                         | 是   | —    |
| <code>zIndex</code> | <code>number</code> | <code>0</code>                            | 否   | —    |
| <code>left</code>   | <code>string</code> | <code>&quot;&quot;</code>                 | 否   | —    |
| <code>center</code> | <code>string</code> | <code>&quot;&quot;</code>                 | 否   | —    |
| <code>right</code>  | <code>string</code> | <code>&quot;&quot;</code>                 | 否   | —    |
| <code>style</code>  | <code>Style</code>  | <code>() =&gt; ({ inverse: true })</code> | 否   | —    |

### Events

—

## TSwitch

源码：`src/vue/components/TForm.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                       | 类型                 | 默认值                                                  | 必填 | 说明                                                |
| -------------------------- | -------------------- | ------------------------------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>             | <code>number</code>  | —                                                       | 是   | Left position in terminal cells.                    |
| <code>y</code>             | <code>number</code>  | —                                                       | 是   | Top position in terminal cells.                     |
| <code>w</code>             | <code>number</code>  | —                                                       | 是   | Width in terminal cells.                            |
| <code>zIndex</code>        | <code>number</code>  | <code>0</code>                                          | 否   | Render and event ordering within the current plane. |
| <code>modelValue</code>    | <code>boolean</code> | <code>false</code>                                      | 否   | Controlled component value.                         |
| <code>label</code>         | <code>string</code>  | <code>&quot;&quot;</code>                               | 否   | Visible label text.                                 |
| <code>disabled</code>      | <code>boolean</code> | <code>false</code>                                      | 否   | Disables pointer and keyboard activation.           |
| <code>style</code>         | <code>Style</code>   | <code>undefined</code>                                  | 否   | Base terminal cell style override.                  |
| <code>activeStyle</code>   | <code>Style</code>   | <code>() =&gt; ({ fg: &quot;greenBright&quot; })</code> | 否   | Style used for the active item or row.              |
| <code>disabledStyle</code> | <code>Style</code>   | <code>() =&gt; ({ dim: true })</code>                   | 否   | Style used for disabled content.                    |

### Events

| 名称                           | Payload              | 说明                                               |
| ------------------------------ | -------------------- | -------------------------------------------------- |
| <code>update:modelValue</code> | <code>boolean</code> | Emitted when the controlled model value changes.   |
| <code>change</code>            | <code>boolean</code> | Emitted when the component commits a value change. |

## TTable

源码：`src/vue/components/TTable.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                         | 类型                                                                       | 默认值                           | 必填 | 说明                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| <code>x</code>               | <code>number</code>                                                        | —                                | 是   | Left position in terminal cells.                                                                            |
| <code>y</code>               | <code>number</code>                                                        | —                                | 是   | Top position in terminal cells.                                                                             |
| <code>w</code>               | <code>number</code>                                                        | —                                | 是   | Width in terminal cells.                                                                                    |
| <code>h</code>               | <code>number</code>                                                        | —                                | 是   | Height in terminal cells.                                                                                   |
| <code>zIndex</code>          | <code>number</code>                                                        | <code>0</code>                   | 否   | Render and event ordering within the current plane.                                                         |
| <code>columns</code>         | <code>readonly TTableColumn[]</code>                                       | —                                | 是   | Table column definitions.                                                                                   |
| <code>rows</code>            | <code>readonly TTableRow[]</code>                                          | —                                | 是   | Rows are rendered from the top of the current viewport; TTable does not own<br>scrollTop or virtualization. |
| <code>rowKey</code>          | <code>string &#124; ((row: TTableRow, index: number) =&gt; unknown)</code> | <code>undefined</code>           | 否   | Row key field or resolver.                                                                                  |
| <code>selectedRowKey</code>  | <code>unknown</code>                                                       | <code>undefined</code>           | 否   | Controlled selected row key.                                                                                |
| <code>selectedRowKeys</code> | <code>readonly unknown[]</code>                                            | <code>undefined</code>           | 否   | Controlled selected row keys for multi-select tables.                                                       |
| <code>activeRowKey</code>    | <code>unknown</code>                                                       | <code>undefined</code>           | 否   | Controlled active row key.                                                                                  |
| <code>border</code>          | <code>boolean</code>                                                       | <code>false</code>               | 否   | Draws a border around the component.                                                                        |
| <code>header</code>          | <code>boolean</code>                                                       | <code>true</code>                | 否   | Shows the table header when enabled.                                                                        |
| <code>style</code>           | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Base terminal cell style override.                                                                          |
| <code>headerStyle</code>     | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style override for table header cells.                                                                      |
| <code>borderStyle</code>     | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style override for border cells.                                                                            |
| <code>selectedStyle</code>   | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style used for selected rows or nodes.                                                                      |
| <code>activeStyle</code>     | <code>Style</code>                                                         | <code>undefined</code>           | 否   | Style used for the active item or row.                                                                      |
| <code>emptyText</code>       | <code>string</code>                                                        | <code>&quot;No rows&quot;</code> | 否   | Text rendered when there are no rows or items.                                                              |
| <code>headerFocusable</code> | <code>boolean</code>                                                       | <code>false</code>               | 否   | Makes header cells keyboard focusable.                                                                      |
| <code>rowFocusable</code>    | <code>boolean</code>                                                       | <code>false</code>               | 否   | Makes body rows keyboard focusable.                                                                         |

### Events

| 名称                     | Payload                               | 说明                                                       |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------- |
| <code>rowClick</code>    | <code>TTableRowClickPayload</code>    | Emitted when a table row is clicked or confirmed.          |
| <code>headerClick</code> | <code>TTableHeaderClickPayload</code> | Emitted when a table header is clicked or confirmed.       |
| <code>rowKeydown</code>  | <code>TTableRowKeydownPayload</code>  | Emitted when a focused table row receives a keydown event. |

## TTabs

源码：`src/vue/components/TPanels.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                       | 类型                              | 默认值                                    | 必填 | 说明 |
| -------------------------- | --------------------------------- | ----------------------------------------- | ---- | ---- |
| <code>x</code>             | <code>number</code>               | —                                         | 是   | —    |
| <code>y</code>             | <code>number</code>               | —                                         | 是   | —    |
| <code>w</code>             | <code>number</code>               | —                                         | 是   | —    |
| <code>zIndex</code>        | <code>number</code>               | <code>0</code>                            | 否   | —    |
| <code>items</code>         | <code>readonly TTabsItem[]</code> | —                                         | 是   | —    |
| <code>activeKey</code>     | <code>string</code>               | —                                         | 是   | —    |
| <code>style</code>         | <code>Style</code>                | <code>undefined</code>                    | 否   | —    |
| <code>activeStyle</code>   | <code>Style</code>                | <code>() =&gt; ({ inverse: true })</code> | 否   | —    |
| <code>disabledStyle</code> | <code>Style</code>                | <code>() =&gt; ({ dim: true })</code>     | 否   | —    |

### Events

| 名称                          | Payload                | 说明 |
| ----------------------------- | ---------------------- | ---- |
| <code>update:activeKey</code> | <code>string</code>    | —    |
| <code>change</code>           | <code>TTabsItem</code> | —    |

## TTag

源码：`src/vue/components/TFeedback.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                | 类型                       | 默认值                           | 必填 | 说明                                                |
| ------------------- | -------------------------- | -------------------------------- | ---- | --------------------------------------------------- |
| <code>x</code>      | <code>number</code>        | —                                | 是   | Left position in terminal cells.                    |
| <code>y</code>      | <code>number</code>        | —                                | 是   | Top position in terminal cells.                     |
| <code>w</code>      | <code>number</code>        | <code>undefined</code>           | 否   | Width in terminal cells.                            |
| <code>label</code>  | <code>string</code>        | —                                | 是   | Visible label text.                                 |
| <code>tone</code>   | <code>TFeedbackTone</code> | <code>&quot;default&quot;</code> | 否   | Semantic color tone.                                |
| <code>zIndex</code> | <code>number</code>        | <code>0</code>                   | 否   | Render and event ordering within the current plane. |
| <code>style</code>  | <code>Style</code>         | <code>undefined</code>           | 否   | Base terminal cell style override.                  |

### Events

—

## TText

源码：`src/vue/components/TText.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                 | 类型                 | 默认值                 | 必填 | 说明                                                                                                                                                                                                                                                                       |
| -------------------- | -------------------- | ---------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>x</code>       | <code>number</code>  | —                      | 是   | Left position in terminal cells.                                                                                                                                                                                                                                           |
| <code>y</code>       | <code>number</code>  | —                      | 是   | Top position in terminal cells.                                                                                                                                                                                                                                            |
| <code>zIndex</code>  | <code>number</code>  | <code>0</code>         | 否   | Render and event ordering within the current plane.                                                                                                                                                                                                                        |
| <code>value</code>   | <code>string</code>  | —                      | 是   | Text content rendered into terminal cells.                                                                                                                                                                                                                                 |
| <code>w</code>       | <code>number</code>  | <code>undefined</code> | 否   | Width in terminal cells.                                                                                                                                                                                                                                                   |
| <code>h</code>       | <code>number</code>  | <code>undefined</code> | 否   | Height in terminal cells.                                                                                                                                                                                                                                                  |
| <code>style</code>   | <code>Style</code>   | <code>undefined</code> | 否   | Base terminal cell style override.                                                                                                                                                                                                                                         |
| <code>clear</code>   | <code>boolean</code> | <code>true</code>      | 否   | Clears the component rectangle before drawing content.                                                                                                                                                                                                                     |
| <code>wrap</code>    | <code>boolean</code> | <code>false</code>     | 否   | Wraps text to the available cell width.                                                                                                                                                                                                                                    |
| <code>depsKey</code> | <code>unknown</code> | <code>undefined</code> | 否   | Optional key that participates in render-node dependency tracking.<br>Useful for forcing a repaint when the rendered output might change<br>even if `value`, `style`, and geometry are unchanged (e.g. external<br>terminal writes or higher-level virtualized row reuse). |

### Events

—

## TThinkingView

源码：`src/vue/components/TThinkingView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/agent`

### Props

| 名称                     | 类型                            | 默认值                                     | 必填 | 说明 |
| ------------------------ | ------------------------------- | ------------------------------------------ | ---- | ---- |
| <code>x</code>           | <code>number</code>             | —                                          | 是   | —    |
| <code>y</code>           | <code>number</code>             | —                                          | 是   | —    |
| <code>w</code>           | <code>number</code>             | —                                          | 是   | —    |
| <code>h</code>           | <code>number</code>             | <code>undefined</code>                     | 否   | —    |
| <code>zIndex</code>      | <code>number</code>             | <code>0</code>                             | 否   | —    |
| <code>title</code>       | <code>string</code>             | <code>&quot;Thinking&quot;</code>          | 否   | —    |
| <code>content</code>     | <code>string</code>             | <code>&quot;&quot;</code>                  | 否   | —    |
| <code>collapsed</code>   | <code>boolean</code>            | <code>false</code>                         | 否   | —    |
| <code>pulseFrame</code>  | <code>number &#124; null</code> | <code>null</code>                          | 否   | —    |
| <code>style</code>       | <code>Style</code>              | <code>undefined</code>                     | 否   | —    |
| <code>headerStyle</code> | <code>Style</code>              | <code>() =&gt; DEFAULT_HEADER_STYLE</code> | 否   | —    |
| <code>markerStyle</code> | <code>Style</code>              | <code>undefined</code>                     | 否   | —    |
| <code>titleStyle</code>  | <code>Style</code>              | <code>undefined</code>                     | 否   | —    |
| <code>bodyStyle</code>   | <code>Style</code>              | <code>() =&gt; DEFAULT_BODY_STYLE</code>   | 否   | —    |
| <code>focusable</code>   | <code>boolean</code>            | <code>false</code>                         | 否   | —    |
| <code>selectable</code>  | <code>boolean</code>            | <code>undefined</code>                     | 否   | —    |

### Events

| 名称                | Payload | 说明 |
| ------------------- | ------- | ---- |
| <code>click</code>  | —       | —    |
| <code>toggle</code> | —       | —    |

## TToastViewport

源码：`src/vue/components/TFeedback.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                   | 类型                                                                                                                          | 默认值                             | 必填 | 说明                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---- | -------------------------------------------------------------------- |
| <code>x</code>         | <code>number</code>                                                                                                           | <code>0</code>                     | 否   | Fallback placement viewport x when no parent clip rect is available. |
| <code>y</code>         | <code>number</code>                                                                                                           | <code>0</code>                     | 否   | Fallback placement viewport y when no parent clip rect is available. |
| <code>offsetX</code>   | <code>number</code>                                                                                                           | <code>0</code>                     | 否   | —                                                                    |
| <code>offsetY</code>   | <code>number</code>                                                                                                           | <code>0</code>                     | 否   | —                                                                    |
| <code>w</code>         | <code>number</code>                                                                                                           | —                                  | 是   | Toast item width in terminal cells.                                  |
| <code>viewportW</code> | <code>number</code>                                                                                                           | <code>undefined</code>             | 否   | Placement viewport width when no parent clip rect is available.      |
| <code>viewportH</code> | <code>number</code>                                                                                                           | <code>undefined</code>             | 否   | Placement viewport height when no parent clip rect is available.     |
| <code>zIndex</code>    | <code>number</code>                                                                                                           | <code>40</code>                    | 否   | —                                                                    |
| <code>max</code>       | <code>number</code>                                                                                                           | <code>3</code>                     | 否   | —                                                                    |
| <code>placement</code> | <code>&quot;top-right&quot; &#124; &quot;top-left&quot; &#124; &quot;bottom-right&quot; &#124; &quot;bottom-left&quot;</code> | <code>&quot;top-right&quot;</code> | 否   | —                                                                    |
| <code>items</code>     | <code>readonly TToastItem[]</code>                                                                                            | —                                  | 是   | —                                                                    |
| <code>style</code>     | <code>Style</code>                                                                                                            | <code>undefined</code>             | 否   | —                                                                    |

### Events

| 名称                 | Payload             | 说明 |
| -------------------- | ------------------- | ---- |
| <code>dismiss</code> | <code>string</code> | —    |

## TToolCallView

源码：`src/vue/components/TToolCallView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/agent`

### Props

| 名称                         | 类型                         | 默认值                           | 必填 | 说明 |
| ---------------------------- | ---------------------------- | -------------------------------- | ---- | ---- |
| <code>x</code>               | <code>number</code>          | —                                | 是   | —    |
| <code>y</code>               | <code>number</code>          | —                                | 是   | —    |
| <code>w</code>               | <code>number</code>          | —                                | 是   | —    |
| <code>h</code>               | <code>number</code>          | <code>undefined</code>           | 否   | —    |
| <code>zIndex</code>          | <code>number</code>          | <code>0</code>                   | 否   | —    |
| <code>title</code>           | <code>string</code>          | —                                | 是   | —    |
| <code>collapsed</code>       | <code>boolean</code>         | <code>false</code>               | 否   | —    |
| <code>status</code>          | <code>TToolCallStatus</code> | <code>&quot;pending&quot;</code> | 否   | —    |
| <code>suffix</code>          | <code>string</code>          | <code>&quot;&quot;</code>        | 否   | —    |
| <code>preview</code>         | <code>string</code>          | <code>&quot;&quot;</code>        | 否   | —    |
| <code>nested</code>          | <code>boolean</code>         | <code>false</code>               | 否   | —    |
| <code>selected</code>        | <code>boolean</code>         | <code>false</code>               | 否   | —    |
| <code>markerCollapsed</code> | <code>string</code>          | <code>&quot;▸&quot;</code>       | 否   | —    |
| <code>markerExpanded</code>  | <code>string</code>          | <code>&quot;▾&quot;</code>       | 否   | —    |
| <code>statusDot</code>       | <code>string</code>          | <code>&quot;●&quot;</code>       | 否   | —    |
| <code>previewPrefix</code>   | <code>string</code>          | <code>&quot; ⎿ &quot;</code>     | 否   | —    |
| <code>style</code>           | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>mutedStyle</code>      | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>headerStyle</code>     | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>collapsedStyle</code>  | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>expandedStyle</code>   | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>markerStyle</code>     | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>statusStyle</code>     | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>titleStyle</code>      | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>suffixStyle</code>     | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>previewStyle</code>    | <code>Style</code>           | <code>undefined</code>           | 否   | —    |
| <code>focusable</code>       | <code>boolean</code>         | <code>false</code>               | 否   | —    |
| <code>selectable</code>      | <code>boolean</code>         | <code>undefined</code>           | 否   | —    |

### Events

| 名称                | Payload | 说明 |
| ------------------- | ------- | ---- |
| <code>click</code>  | —       | —    |
| <code>toggle</code> | —       | —    |

## TToolLogView

源码：`src/vue/components/TLogView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/agent`

### Props

| 名称                            | 类型                                                        | 默认值                                                | 必填 | 说明                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| <code>x</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>y</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>w</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>h</code>                  | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>zIndex</code>             | <code>number</code>                                         | <code>0</code>                                        | 否   | —                                                                                                                           |
| <code>source</code>             | <code>TLogDataSource</code>                                 | —                                                     | 是   | —                                                                                                                           |
| <code>version</code>            | <code>number</code>                                         | —                                                     | 是   | —                                                                                                                           |
| <code>scrollTop</code>          | <code>number</code>                                         | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>defaultScrollTop</code>   | <code>number</code>                                         | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>style</code>              | <code>Style</code>                                          | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>autoFocus</code>          | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>selectable</code>         | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —                                                                                                                           |
| <code>autoStickToBottom</code>  | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —                                                                                                                           |
| <code>overscan</code>           | <code>number</code>                                         | <code>2</code>                                        | 否   | —                                                                                                                           |
| <code>wrap</code>               | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>visualIndexMode</code>    | <code>&quot;estimated&quot; &#124; &quot;exact&quot;</code> | <code>&quot;estimated&quot;</code>                    | 否   | —                                                                                                                           |
| <code>visualIndexOptions</code> | <code>TLogViewVisualIndexOptions</code>                     | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>ansi</code>               | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>links</code>              | <code>boolean</code>                                        | <code>false</code>                                    | 否   | Parses OSC8 links only with ansi=true; OSC8 links preserve parsed ANSI style and<br>do not inherit TLink theme defaults.    |
| <code>linkify</code>            | <code>boolean &#124; TLinkifyOptions</code>                 | <code>false</code>                                    | 否   | Plain-text URL linkification for ansi=false rows; generated links inherit TLink<br>theme defaults before linkStyle.         |
| <code>linkStyle</code>          | <code>Style</code>                                          | <code>undefined</code>                                | 否   | Link style override. OSC8 defaults to underline-only over parsed ANSI style;<br>linkify also inherits TLink theme defaults. |
| <code>keyboardLinks</code>      | <code>boolean</code>                                        | <code>false</code>                                    | 否   | —                                                                                                                           |
| <code>linkFocusStyle</code>     | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true })</code>             | 否   | —                                                                                                                           |
| <code>searchQuery</code>        | <code>string</code>                                         | <code>&quot;&quot;</code>                             | 否   | —                                                                                                                           |
| <code>searchOptions</code>      | <code>TLogViewSearchOptions</code>                          | <code>undefined</code>                                | 否   | —                                                                                                                           |
| <code>highlightMatches</code>   | <code>boolean</code>                                        | <code>true</code>                                     | 否   | —                                                                                                                           |
| <code>matchStyle</code>         | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true })</code>             | 否   | —                                                                                                                           |
| <code>currentMatchStyle</code>  | <code>Style</code>                                          | <code>() =&gt; ({ inverse: true, bold: true })</code> | 否   | —                                                                                                                           |
| <code>rowScrollMode</code>      | <code>RowScrollMode</code>                                  | <code>&quot;off&quot;</code>                          | 否   | —                                                                                                                           |

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

## TTooltip

源码：`src/vue/components/TOverlay.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

### Props

| 名称                    | 类型                 | 默认值                                    | 必填 | 说明 |
| ----------------------- | -------------------- | ----------------------------------------- | ---- | ---- |
| <code>modelValue</code> | <code>boolean</code> | <code>true</code>                         | 否   | —    |
| <code>x</code>          | <code>number</code>  | —                                         | 是   | —    |
| <code>y</code>          | <code>number</code>  | —                                         | 是   | —    |
| <code>w</code>          | <code>number</code>  | <code>undefined</code>                    | 否   | —    |
| <code>zIndex</code>     | <code>number</code>  | <code>30</code>                           | 否   | —    |
| <code>content</code>    | <code>string</code>  | —                                         | 是   | —    |
| <code>style</code>      | <code>Style</code>   | <code>() =&gt; ({ inverse: true })</code> | 否   | —    |

### Events

—

## TTranscriptView

源码：`src/vue/components/TTranscriptView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                           | 类型                               | 默认值                                   | 必填 | 说明 |
| ------------------------------ | ---------------------------------- | ---------------------------------------- | ---- | ---- |
| <code>x</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>y</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>w</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>h</code>                 | <code>number</code>                | —                                        | 是   | —    |
| <code>zIndex</code>            | <code>number</code>                | <code>0</code>                           | 否   | —    |
| <code>source</code>            | <code>TTranscriptDataSource</code> | —                                        | 是   | —    |
| <code>version</code>           | <code>number</code>                | —                                        | 是   | —    |
| <code>scrollTop</code>         | <code>number</code>                | <code>undefined</code>                   | 否   | —    |
| <code>defaultScrollTop</code>  | <code>number</code>                | <code>0</code>                           | 否   | —    |
| <code>autoStickToBottom</code> | <code>boolean</code>               | <code>false</code>                       | 否   | —    |
| <code>selectable</code>        | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>wrap</code>              | <code>boolean</code>               | <code>false</code>                       | 否   | —    |
| <code>style</code>             | <code>Style</code>                 | <code>undefined</code>                   | 否   | —    |
| <code>hoverStyle</code>        | <code>Style</code>                 | <code>undefined</code>                   | 否   | —    |
| <code>focusStyle</code>        | <code>Style</code>                 | <code>undefined</code>                   | 否   | —    |
| <code>autoFocus</code>         | <code>boolean</code>               | <code>false</code>                       | 否   | —    |
| <code>focusable</code>         | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>wheelScroll</code>       | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>keyboardRegions</code>   | <code>boolean</code>               | <code>true</code>                        | 否   | —    |
| <code>rowScrollMode</code>     | <code>RowScrollMode</code>         | <code>&quot;unsafe-full-row&quot;</code> | 否   | —    |

### Events

| 名称                          | Payload | 说明 |
| ----------------------------- | ------- | ---- |
| <code>scroll</code>           | —       | —    |
| <code>update:scrollTop</code> | —       | —    |
| <code>rowClick</code>         | —       | —    |
| <code>actionClick</code>      | —       | —    |
| <code>linkClick</code>        | —       | —    |
| <code>foldToggle</code>       | —       | —    |
| <code>toolClick</code>        | —       | —    |
| <code>hoverRegion</code>      | —       | —    |

## TTransition

源码：`src/vue/components/TTransition.ts`

API maturity: **Advanced**

Import: `@simon_he/vue-tui/vue`

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

## TTree

源码：`src/vue/components/TTree.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                           | 类型                              | 默认值                                    | 必填 | 说明                                                                 |
| ------------------------------ | --------------------------------- | ----------------------------------------- | ---- | -------------------------------------------------------------------- |
| <code>x</code>                 | <code>number</code>               | —                                         | 是   | Left position in terminal cells.                                     |
| <code>y</code>                 | <code>number</code>               | —                                         | 是   | Top position in terminal cells.                                      |
| <code>w</code>                 | <code>number</code>               | —                                         | 是   | Width in terminal cells.                                             |
| <code>h</code>                 | <code>number</code>               | —                                         | 是   | Height in terminal cells.                                            |
| <code>zIndex</code>            | <code>number</code>               | <code>0</code>                            | 否   | Render and event ordering within the current plane.                  |
| <code>nodes</code>             | <code>readonly TTreeNode[]</code> | —                                         | 是   | Tree nodes.                                                          |
| <code>expandedIds</code>       | <code>readonly string[]</code>    | <code>() =&gt; []</code>                  | 否   | Controlled expanded tree node ids.                                   |
| <code>selectedId</code>        | <code>string</code>               | <code>&quot;&quot;</code>                 | 否   | Controlled selected tree node id.                                    |
| <code>style</code>             | <code>Style</code>                | <code>undefined</code>                    | 否   | Base terminal cell style override.                                   |
| <code>selectedStyle</code>     | <code>Style</code>                | <code>() =&gt; ({ inverse: true })</code> | 否   | Style used for selected rows or nodes.                               |
| <code>disabledStyle</code>     | <code>Style</code>                | <code>() =&gt; ({ dim: true })</code>     | 否   | Style used for disabled content.                                     |
| <code>indent</code>            | <code>number</code>               | <code>2</code>                            | 否   | Indent width per tree depth.                                         |
| <code>selectableParents</code> | <code>boolean</code>              | <code>false</code>                        | 否   | Allows expandable parent tree nodes to be selected from their label. |

### Events

| 名称                            | Payload                         | 说明                                            |
| ------------------------------- | ------------------------------- | ----------------------------------------------- |
| <code>update:expandedIds</code> | <code>string[]</code>           | Emitted when expanded tree node ids change.     |
| <code>update:selectedId</code>  | <code>string</code>             | Emitted when the selected tree node id changes. |
| <code>select</code>             | <code>TTreeSelectPayload</code> | Emitted when the active item is selected.       |
| <code>toggle</code>             | <code>TTreeTogglePayload</code> | Emitted when a tree node expands or collapses.  |

## TUserMessageView

源码：`src/vue/components/TUserMessageView.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/agent`

### Props

| 名称                      | 类型                                        | 默认值                                      | 必填 | 说明 |
| ------------------------- | ------------------------------------------- | ------------------------------------------- | ---- | ---- |
| <code>x</code>            | <code>number</code>                         | —                                           | 是   | —    |
| <code>y</code>            | <code>number</code>                         | —                                           | 是   | —    |
| <code>w</code>            | <code>number</code>                         | —                                           | 是   | —    |
| <code>h</code>            | <code>number</code>                         | <code>undefined</code>                      | 否   | —    |
| <code>zIndex</code>       | <code>number</code>                         | <code>0</code>                              | 否   | —    |
| <code>label</code>        | <code>string</code>                         | <code>&quot;user&quot;</code>               | 否   | —    |
| <code>prefix</code>       | <code>string</code>                         | <code>&quot;&gt; &quot;</code>              | 否   | —    |
| <code>meta</code>         | <code>string</code>                         | <code>&quot;&quot;</code>                   | 否   | —    |
| <code>content</code>      | <code>string</code>                         | —                                           | 是   | —    |
| <code>indent</code>       | <code>number</code>                         | <code>2</code>                              | 否   | —    |
| <code>topBlank</code>     | <code>boolean</code>                        | <code>true</code>                           | 否   | —    |
| <code>bottomBlank</code>  | <code>boolean</code>                        | <code>true</code>                           | 否   | —    |
| <code>segments</code>     | <code>readonly TUserMessageSegment[]</code> | <code>() =&gt; []</code>                    | 否   | —    |
| <code>style</code>        | <code>Style</code>                          | <code>() =&gt; DEFAULT_BLOCK_STYLE</code>   | 否   | —    |
| <code>headerStyle</code>  | <code>Style</code>                          | <code>() =&gt; DEFAULT_HEADER_STYLE</code>  | 否   | —    |
| <code>prefixStyle</code>  | <code>Style</code>                          | <code>() =&gt; DEFAULT_LABEL_STYLE</code>   | 否   | —    |
| <code>labelStyle</code>   | <code>Style</code>                          | <code>() =&gt; DEFAULT_LABEL_STYLE</code>   | 否   | —    |
| <code>contentStyle</code> | <code>Style</code>                          | <code>undefined</code>                      | 否   | —    |
| <code>segmentStyle</code> | <code>Style</code>                          | <code>() =&gt; DEFAULT_SEGMENT_STYLE</code> | 否   | —    |
| <code>focusable</code>    | <code>boolean</code>                        | <code>false</code>                          | 否   | —    |
| <code>selectable</code>   | <code>boolean</code>                        | <code>undefined</code>                      | 否   | —    |

### Events

—

## TVideo

源码：`src/vue/components/TVideo.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                        | 类型                              | 默认值                           | 必填 | 说明 |
| --------------------------- | --------------------------------- | -------------------------------- | ---- | ---- |
| <code>x</code>              | <code>number</code>               | —                                | 是   | —    |
| <code>y</code>              | <code>number</code>               | —                                | 是   | —    |
| <code>w</code>              | <code>number</code>               | —                                | 是   | —    |
| <code>h</code>              | <code>number</code>               | —                                | 是   | —    |
| <code>zIndex</code>         | <code>number</code>               | <code>0</code>                   | 否   | —    |
| <code>src</code>            | <code>string</code>               | —                                | 是   | —    |
| <code>frameSource</code>    | <code>TVideoFrameSource</code>    | —                                | 是   | —    |
| <code>paused</code>         | <code>boolean</code>              | <code>undefined</code>           | 否   | —    |
| <code>playbackRate</code>   | <code>TVideoPlaybackRate</code>   | <code>undefined</code>           | 否   | —    |
| <code>controls</code>       | <code>boolean</code>              | <code>false</code>               | 否   | —    |
| <code>controlsLayout</code> | <code>TVideoControlsLayout</code> | <code>&quot;compact&quot;</code> | 否   | —    |
| <code>durationMs</code>     | <code>number</code>               | <code>undefined</code>           | 否   | —    |
| <code>loop</code>           | <code>boolean</code>              | <code>false</code>               | 否   | —    |
| <code>maxFps</code>         | <code>number</code>               | <code>DEFAULT_MAX_FPS</code>     | 否   | —    |
| <code>pixelWidth</code>     | <code>number</code>               | <code>undefined</code>           | 否   | —    |
| <code>pixelHeight</code>    | <code>number</code>               | <code>undefined</code>           | 否   | —    |
| <code>fallback</code>       | <code>string</code>               | <code>&quot;[video]&quot;</code> | 否   | —    |
| <code>style</code>          | <code>Style</code>                | <code>undefined</code>           | 否   | —    |
| <code>clear</code>          | <code>boolean</code>              | <code>true</code>                | 否   | —    |

### Events

| 名称                             | Payload                         | 说明 |
| -------------------------------- | ------------------------------- | ---- |
| <code>frame</code>               | <code>TVideoFrameEvent</code>   | —    |
| <code>ended</code>               | —                               | —    |
| <code>error</code>               | <code>unknown</code>            | —    |
| <code>seek</code>                | <code>TVideoSeekEvent</code>    | —    |
| <code>update:paused</code>       | <code>boolean</code>            | —    |
| <code>update:playbackRate</code> | <code>TVideoPlaybackRate</code> | —    |

## TView

源码：`src/vue/components/TView.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui`

### Props

| 名称                           | 类型                                                       | 默认值                 | 必填 | 说明                                                                      |
| ------------------------------ | ---------------------------------------------------------- | ---------------------- | ---- | ------------------------------------------------------------------------- |
| <code>x</code>                 | <code>number</code>                                        | —                      | 是   | Left position in terminal cells.                                          |
| <code>y</code>                 | <code>number</code>                                        | —                      | 是   | Top position in terminal cells.                                           |
| <code>w</code>                 | <code>number</code>                                        | —                      | 是   | Width in terminal cells.                                                  |
| <code>h</code>                 | <code>number</code>                                        | —                      | 是   | Height in terminal cells.                                                 |
| <code>zIndex</code>            | <code>number</code>                                        | <code>0</code>         | 否   | Render and event ordering within the current plane.                       |
| <code>scrollX</code>           | <code>number</code>                                        | <code>0</code>         | 否   | Horizontal content offset in terminal cells.                              |
| <code>scrollY</code>           | <code>number</code>                                        | <code>0</code>         | 否   | Vertical content offset in terminal cells.                                |
| <code>focusable</code>         | <code>boolean</code>                                       | <code>false</code>     | 否   | Adds the component to keyboard focus navigation.                          |
| <code>selectable</code>        | <code>boolean</code>                                       | <code>undefined</code> | 否   | Controls whether terminal text selection may start inside the view.       |
| <code>selectionScrollBy</code> | <code>(deltaRows: number) =&gt; boolean &#124; void</code> | <code>undefined</code> | 否   | Scroll callback used while a pointer selection reaches the viewport edge. |
| <code>autoFocus</code>         | <code>boolean</code>                                       | <code>false</code>     | 否   | Requests focus when the component becomes visible.                        |

### Events

| 名称                             | Payload                            | 说明                                                                |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| <code>clickCapture</code>        | <code>TerminalPointerEvent</code>  | Emitted for click events. Runs during capture.                      |
| <code>click</code>               | <code>TerminalPointerEvent</code>  | Emitted for click events.                                           |
| <code>dblclickCapture</code>     | <code>TerminalPointerEvent</code>  | Emitted for double-click events. Runs during capture.               |
| <code>dblclick</code>            | <code>TerminalPointerEvent</code>  | Emitted for double-click events.                                    |
| <code>pointerdownCapture</code>  | <code>TerminalPointerEvent</code>  | Emitted for pointer down events. Runs during capture.               |
| <code>pointerdown</code>         | <code>TerminalPointerEvent</code>  | Emitted for pointer down events.                                    |
| <code>pointerupCapture</code>    | <code>TerminalPointerEvent</code>  | Emitted for pointer up events. Runs during capture.                 |
| <code>pointerup</code>           | <code>TerminalPointerEvent</code>  | Emitted for pointer up events.                                      |
| <code>pointermoveCapture</code>  | <code>TerminalPointerEvent</code>  | Emitted for pointer move events. Runs during capture.               |
| <code>pointermove</code>         | <code>TerminalPointerEvent</code>  | Emitted for pointer move events.                                    |
| <code>pointerenterCapture</code> | <code>TerminalPointerEvent</code>  | Emitted when the pointer enters the component. Runs during capture. |
| <code>pointerenter</code>        | <code>TerminalPointerEvent</code>  | Emitted when the pointer enters the component.                      |
| <code>pointerleaveCapture</code> | <code>TerminalPointerEvent</code>  | Emitted when the pointer leaves the component. Runs during capture. |
| <code>pointerleave</code>        | <code>TerminalPointerEvent</code>  | Emitted when the pointer leaves the component.                      |
| <code>wheelCapture</code>        | <code>TerminalPointerEvent</code>  | Emitted for wheel events. Runs during capture.                      |
| <code>wheel</code>               | <code>TerminalPointerEvent</code>  | Emitted for wheel events.                                           |
| <code>keydownCapture</code>      | <code>TerminalKeyboardEvent</code> | Emitted for keydown events. Runs during capture.                    |
| <code>keydown</code>             | <code>TerminalKeyboardEvent</code> | Emitted for keydown events.                                         |
| <code>keyupCapture</code>        | <code>TerminalKeyboardEvent</code> | Emitted for keyup events. Runs during capture.                      |
| <code>keyup</code>               | <code>TerminalKeyboardEvent</code> | Emitted for keyup events.                                           |
| <code>focusCapture</code>        | <code>void</code>                  | Emitted when the component receives focus. Runs during capture.     |
| <code>focus</code>               | <code>void</code>                  | Emitted when the component receives focus.                          |
| <code>blurCapture</code>         | <code>void</code>                  | Emitted when the component loses focus. Runs during capture.        |
| <code>blur</code>                | <code>void</code>                  | Emitted when the component loses focus.                             |

### Slots

| 名称                 | Props | 说明                                                                                                  |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| <code>default</code> | —     | Children rendered with this view's layout origin, clip rect, render stack, and event z-index context. |

## TVirtualList

源码：`src/vue/components/TVirtualList.ts`

API maturity: **Experimental**

Import: `@simon_he/vue-tui/experimental`

### Props

| 名称                                     | 类型                                                      | 默认值                       | 必填 | 说明 |
| ---------------------------------------- | --------------------------------------------------------- | ---------------------------- | ---- | ---- |
| <code>x</code>                           | <code>number</code>                                       | —                            | 是   | —    |
| <code>y</code>                           | <code>number</code>                                       | —                            | 是   | —    |
| <code>w</code>                           | <code>number</code>                                       | —                            | 是   | —    |
| <code>h</code>                           | <code>number</code>                                       | —                            | 是   | —    |
| <code>zIndex</code>                      | <code>number</code>                                       | <code>0</code>               | 否   | —    |
| <code>itemCount</code>                   | <code>number</code>                                       | —                            | 是   | —    |
| <code>itemVersion</code>                 | <code>number</code>                                       | —                            | 是   | —    |
| <code>getItem</code>                     | <code>(index: number) =&gt; unknown</code>                | —                            | 是   | —    |
| <code>renderItem</code>                  | <code>(item: unknown, index: number) =&gt; unknown</code> | <code>undefined</code>       | 否   | —    |
| <code>modelValue</code>                  | <code>number</code>                                       | <code>0</code>               | 否   | —    |
| <code>scrollTop</code>                   | <code>number</code>                                       | <code>undefined</code>       | 否   | —    |
| <code>style</code>                       | <code>Style</code>                                        | <code>undefined</code>       | 否   | —    |
| <code>activeStyle</code>                 | <code>Style</code>                                        | <code>undefined</code>       | 否   | —    |
| <code>autoFocus</code>                   | <code>boolean</code>                                      | <code>false</code>           | 否   | —    |
| <code>selectionText</code>               | <code>(item: unknown, index: number) =&gt; string</code>  | <code>undefined</code>       | 否   | —    |
| <code>selectable</code>                  | <code>boolean</code>                                      | <code>false</code>           | 否   | —    |
| <code>rowScrollMode</code>               | <code>RowScrollMode</code>                                | <code>&quot;off&quot;</code> | 否   | —    |
| <code>terminalGraphicScrollIdleMs</code> | <code>number</code>                                       | <code>96</code>              | 否   | —    |

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

## TVirtualMarkdown

源码：`src/vue/components/TVirtualMarkdown.ts`

API maturity: **Public**

Import: `@simon_he/vue-tui/markdown`

### Props

| 名称                                  | 类型                                     | 默认值                    | 必填 | 说明                                                                                         |
| ------------------------------------- | ---------------------------------------- | ------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| <code>x</code>                        | <code>number</code>                      | —                         | 是   | Left position in terminal cells.                                                             |
| <code>y</code>                        | <code>number</code>                      | —                         | 是   | Top position in terminal cells.                                                              |
| <code>w</code>                        | <code>number</code>                      | —                         | 是   | Width in terminal cells.                                                                     |
| <code>h</code>                        | <code>number</code>                      | —                         | 是   | Height in terminal cells.                                                                    |
| <code>zIndex</code>                   | <code>number</code>                      | <code>0</code>            | 否   | Render and event ordering within the current plane.                                          |
| <code>content</code>                  | <code>string</code>                      | <code>&quot;&quot;</code> | 否   | Markdown source rendered when external blocks are not provided.                              |
| <code>blocks</code>                   | <code>readonly TuiMarkdownBlock[]</code> | <code>undefined</code>    | 否   | Prebuilt markdown blocks used instead of parsing content.                                    |
| <code>scrollTop</code>                | <code>number</code>                      | <code>0</code>            | 否   | Controlled top visual-row offset within the markdown viewport.                               |
| <code>style</code>                    | <code>Style</code>                       | <code>undefined</code>    | 否   | Base terminal cell style override.                                                           |
| <code>final</code>                    | <code>boolean</code>                     | <code>true</code>         | 否   | Parses the markdown as a complete document when enabled.                                     |
| <code>streaming</code>                | <code>boolean</code>                     | <code>false</code>        | 否   | Coalesces rapid content updates into frame-scheduled markdown rebuilds.                      |
| <code>autoFocus</code>                | <code>boolean</code>                     | <code>false</code>        | 否   | Requests focus when the component becomes visible.                                           |
| <code>selectable</code>               | <code>boolean</code>                     | <code>true</code>         | 否   | Controls whether native terminal text selection may start inside the markdown viewport.      |
| <code>customHtmlTags</code>           | <code>readonly string[]</code>           | <code>undefined</code>    | 否   | Additional HTML tag names accepted by the markdown parser.                                   |
| <code>theme</code>                    | <code>TuiMarkdownThemeOverrides</code>   | <code>undefined</code>    | 否   | Markdown theme token overrides for parsed blocks and inline segments.                        |
| <code>imageRenderer</code>            | <code>TuiMarkdownImageResolver</code>    | <code>undefined</code>    | 否   | Optional resolver for markdown image payloads before terminal graphics rendering.            |
| <code>imageMinWidth</code>            | <code>number</code>                      | <code>undefined</code>    | 否   | Minimum markdown image render width in terminal cells.                                       |
| <code>imageMaxWidth</code>            | <code>number</code>                      | <code>undefined</code>    | 否   | Maximum markdown image render width in terminal cells.                                       |
| <code>imageMinHeight</code>           | <code>number</code>                      | <code>undefined</code>    | 否   | Minimum markdown image render height in terminal cells.                                      |
| <code>imageMaxHeight</code>           | <code>number</code>                      | <code>undefined</code>    | 否   | Maximum markdown image render height in terminal cells.                                      |
| <code>imagePreserveAspectRatio</code> | <code>boolean</code>                     | <code>true</code>         | 否   | Preserves markdown image aspect ratio while fitting width and height bounds.                 |
| <code>imageActions</code>             | <code>boolean</code>                     | <code>false</code>        | 否   | Enables pointer actions for rendered markdown images.                                        |
| <code>mathActions</code>              | <code>boolean</code>                     | <code>false</code>        | 否   | Enables pointer actions for rendered markdown math blocks.                                   |
| <code>linkActions</code>              | <code>boolean</code>                     | <code>false</code>        | 否   | Enables pointer actions for rendered markdown links.                                         |
| <code>imageOcclusionRects</code>      | <code>readonly Rect[]</code>             | <code>undefined</code>    | 否   | Terminal rectangles that markdown image layout treats as unavailable for graphics placement. |

### Events

| 名称                          | Payload                                    | 说明                                                                          |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| <code>update:scrollTop</code> | <code>number</code>                        | Emitted when the top visible row offset should change.                        |
| <code>scroll</code>           | <code>number</code>                        | Emitted when the visible scroll offset changes.                               |
| <code>focus</code>            | <code>void</code>                          | Emitted when the component receives focus.                                    |
| <code>blur</code>             | <code>void</code>                          | Emitted when the component loses focus.                                       |
| <code>keydown</code>          | <code>TerminalKeyboardEvent</code>         | Emitted for keydown events.                                                   |
| <code>imageAction</code>      | <code>TuiMarkdownImageActionPayload</code> | Emitted when imageActions is enabled and a markdown image action is selected. |
| <code>mathAction</code>       | <code>TuiMarkdownMathActionPayload</code>  | Emitted when mathActions is enabled and a markdown math action is selected.   |
| <code>linkAction</code>       | <code>TuiMarkdownLinkActionPayload</code>  | Emitted when linkActions is enabled and a markdown link action is selected.   |
