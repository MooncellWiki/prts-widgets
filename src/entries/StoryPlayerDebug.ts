import {
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";

import { NAlert, NButton, NInput, NInputNumber } from "naive-ui";

import "virtual:uno.css";

import { resolveStoryScriptUrl } from "../widgets/StoryPlayer/context";
import {
  analyzeStoryFlow,
  planChoicesForLine,
  type StoryFlowResult,
} from "../widgets/StoryPlayer/engine/log";
import { parseStory } from "../widgets/StoryPlayer/engine/parser";
import StoryPlayer from "../widgets/StoryPlayer/index.vue";

/**
 * StoryPlayer 独立调试入口：不依赖 prts.wiki 宿主页，直接按路径从
 * torappu.prts.wiki 拉剧情 txt 播放。宿主页面由 debug/StoryPlayer.html
 * 提供（仅 dev server 使用，不在 templates/ 里，不会构建/同步到 wiki）。
 *
 * 布局：左侧播放器，右侧原始脚本（带行号，标记当前播放行，decision 行
 * 有标记，seek 中的计划选择会标注；点击文本行 = 跳转到该行）。
 *
 * 跳转：从头播放 → 快速模式 4 档 → 按计划自动选 decision（engine/log
 * 求路径）→ 到达目标行切回手动。
 */

const PATH_PARAM = "path";
const LINE_PARAM = "line";
const EXAMPLE_PATH = "obt/main/level_main_00-01_beg.txt";
/** 快速播放的最高档（quick 模式 0..3 共 4 档） */
const QUICK_SPEED_MAX_LEVEL = 3;
const SEEK_POLL_INTERVAL_MS = 120;
const LINE_POLL_INTERVAL_MS = 150;

function readQueryParams(): { path: string; line: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    line: params.get(LINE_PARAM) ?? "",
    path: params.get(PATH_PARAM) ?? "",
  };
}

function syncQueryParams(path: string, line: string | null): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PATH_PARAM, path);
  if (line === null) url.searchParams.delete(LINE_PARAM);
  else url.searchParams.set(LINE_PARAM, line);
  window.history.replaceState(null, "", url);
}

interface SeekState {
  /** arming=等 player 就绪并注入策略；seeking=快速播放推进中；其余为终态 */
  phase: "arming" | "seeking" | "reached" | "missed" | "aborted" | "error";
  message: string;
  /** 方案里需要显式选择的 decision（decisionId → optionIndex），表外默认第 0 项 */
  choices: Map<number, number>;
  degraded: boolean;
  target: number;
  current: number | null;
}

function isSeekActive(
  state: SeekState | null,
): state is SeekState & { phase: "arming" | "seeking" } {
  return state?.phase === "arming" || state?.phase === "seeking";
}

/** 一次脚本加载的静态分析缓存：行号面板和跳转规划共用 */
interface ScriptAnalysis {
  flow: StoryFlowResult;
  /** 文本 emission 的行号（可跳转目标；multiline 只有段末行） */
  seekableLines: Set<number>;
  /** decision 指令的行号 */
  decisionLines: Set<number>;
}

function analyzeScript(script: string): ScriptAnalysis {
  const flow = analyzeStoryFlow(parseStory(script).lines);
  const seekableLines = new Set<number>();
  for (const emission of flow.emissions)
    if (emission.kind === "text") seekableLines.add(emission.lineIndex);
  return {
    decisionLines: new Set(flow.decisions.keys()),
    flow,
    seekableLines,
  };
}

const StoryPlayerDebugShell = defineComponent({
  name: "StoryPlayerDebugShell",
  setup() {
    const initialQuery = readQueryParams();
    const initialLine = initialQuery.line ? Number(initialQuery.line) : null;
    const pathValue = ref(initialQuery.path);
    const lineValue = ref<number | null>(
      Number.isSafeInteger(initialLine) &&
        initialLine !== null &&
        initialLine > 0
        ? initialLine
        : null,
    );
    const loading = ref(false);
    const loadError = ref<string | null>(null);
    const scriptText = ref<string | null>(null);
    /** 原始物理行（行号与 parser 的 lineNumber 同一空间） */
    const scriptLines = ref<string[]>([]);
    const analysis = shallowRef<ScriptAnalysis | null>(null);
    const loadedUrl = ref<string | null>(null);
    // index.vue 只在创建时读一次 props.script，换脚本必须用 key 强制重建
    const scriptEpoch = ref(0);
    // 初始 URL 带 line 参数时，首次加载完成后自动触发一次跳转
    let autoSeekPending = initialQuery.line !== "";

    const playerComponent = ref<InstanceType<typeof StoryPlayer> | null>(null);
    const scriptPanelRef = ref<HTMLElement | null>(null);
    // seek 含 Map、analysis 含 ConditionStore 类实例，且都是整体替换，
    // 用 shallowRef 避免深层解包（与 index.vue 的 logAllDocument 同一约定）
    const seek = shallowRef<SeekState | null>(null);
    /** 播放器正在显示的源行号，右侧面板高亮用 */
    const currentLine = ref<number | null>(null);
    let seekTimer: ReturnType<typeof setInterval> | null = null;
    let lineTimer: ReturnType<typeof setInterval> | null = null;
    let seekEpoch = 0;

    async function loadScript(rawPath: string): Promise<void> {
      const path = rawPath.trim();
      if (!path) {
        loadError.value = `请输入剧情路径，例如 ${EXAMPLE_PATH}`;
        return;
      }

      const url = resolveStoryScriptUrl(path);
      resetSeek();
      loading.value = true;
      loadError.value = null;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}：${url}`);
        const text = await response.text();
        if (!text.trim()) throw new Error(`剧情内容为空：${url}`);
        scriptText.value = text;
        scriptLines.value = text.replace(/\r\n?/g, "\n").split("\n");
        analysis.value = analyzeScript(text);
        loadedUrl.value = url;
        currentLine.value = null;
        scriptEpoch.value++;
        syncQueryParams(
          path,
          lineValue.value === null ? null : String(lineValue.value),
        );
        if (autoSeekPending) {
          autoSeekPending = false;
          onSeek();
        }
      } catch (error) {
        scriptText.value = null;
        scriptLines.value = [];
        analysis.value = null;
        loadedUrl.value = null;
        loadError.value =
          error instanceof Error ? error.message : String(error);
      } finally {
        loading.value = false;
      }
    }

    /** 计算到达目标行的选择方案；失败时返回错误消息 */
    function planForLine(
      target: number,
    ): { choices: Map<number, number>; degraded: boolean } | { error: string } {
      const flow = analysis.value?.flow;
      if (!scriptText.value || !flow) return { error: "请先加载剧情" };

      const result = planChoicesForLine(flow, target);
      if (!result.ok)
        return {
          error: `第 ${target} 行不在可显示文本里（控制命令行 / multiline 中间片段查不到，请填该段最后一行的行号）`,
        };
      return {
        choices: result.plan.choices,
        degraded: result.plan.degraded,
      };
    }

    function onSeek(target?: number): void {
      if (target !== undefined) lineValue.value = target;
      const line = lineValue.value;
      if (line === null || !Number.isSafeInteger(line) || line < 1) {
        seek.value = {
          choices: new Map(),
          current: null,
          degraded: false,
          message: "请输入有效的行号（≥ 1）",
          phase: "error",
          target: -1,
        };
        return;
      }

      const plan = planForLine(line);
      if ("error" in plan) {
        seek.value = {
          choices: new Map(),
          current: null,
          degraded: false,
          message: plan.error,
          phase: "error",
          target: line,
        };
        return;
      }

      // 跳转总是从头播放：方案的选择路径以脚本起点为前提
      resetSeek();
      scriptEpoch.value++;
      seek.value = {
        choices: plan.choices,
        current: null,
        degraded: plan.degraded,
        message: "等待播放器就绪…",
        phase: "arming",
        target: line,
      };
      syncQueryParams(pathValue.value.trim(), String(line));
      startSeekTimer();
    }

    /** 停表并清空状态；进行中的策略一并从 runtime 摘除 */
    function resetSeek(message?: string): void {
      if (isSeekActive(seek.value))
        playerComponent.value?.getPlayer()?.setDecisionPolicy(null);
      seek.value =
        message === undefined
          ? null
          : {
              choices: new Map(),
              current: null,
              degraded: false,
              message,
              phase: "aborted",
              target: -1,
            };
      stopSeekTimer();
    }

    function startSeekTimer(): void {
      stopSeekTimer();
      const epoch = ++seekEpoch;
      seekTimer = setInterval(() => {
        if (epoch !== seekEpoch) return;
        seekTick();
      }, SEEK_POLL_INTERVAL_MS);
    }

    function stopSeekTimer(): void {
      if (!seekTimer) {
        return;
      }

      clearInterval(seekTimer);
      seekTimer = null;
    }

    function seekTick(): void {
      const state = seek.value;
      if (!isSeekActive(state)) return;

      const player = playerComponent.value?.getPlayer();
      if (!player) return; // 播放器创建/预载中，下一轮再试

      if (state.phase === "arming") {
        const choices = state.choices;
        player.setDecisionPolicy(
          (decision) => choices.get(decision.decisionId) ?? 0,
        );
        // 先切模式再设速度：setAutoPlaySpeedLevel 按当前模式写入档位，
        // default 模式下 4 档会被钳到按钮自动的 3 档上限
        player.setAutoPlayMode("quick_play");
        player.setAutoPlaySpeedLevel(QUICK_SPEED_MAX_LEVEL);
        seek.value = {
          ...state,
          message: "快速播放中，自动选择分支…",
          phase: "seeking",
        };
        return;
      }

      const playerState = player.getState();
      if (playerState === "finished" || playerState === "error") {
        player.setDecisionPolicy(null);
        seek.value = {
          ...state,
          message: `播放已结束（${playerState}），未经过第 ${state.target} 行`,
          phase: "missed",
        };
        stopSeekTimer();
        return;
      }

      // 使用者手动点了播放模式按钮：尊重人工干预，停表并摘掉策略
      if (player.getAutoPlayState().mode !== "quick_play") {
        player.setDecisionPolicy(null);
        seek.value = {
          ...state,
          message: "检测到手动切换播放模式，已中止跳转",
          phase: "aborted",
        };
        stopSeekTimer();
        return;
      }

      const displayed = player.getDisplayedLineIndex();
      if (state.current !== displayed)
        seek.value = { ...state, current: displayed };

      if (displayed === state.target) {
        player.setDecisionPolicy(null);
        player.setAutoPlayMode("default");
        seek.value = {
          ...state,
          message: `已到达第 ${state.target} 行，切回手动模式`,
          phase: "reached",
        };
        stopSeekTimer();
      }
    }

    /** 常驻轮询：无论是否在跳转，都把当前显示行同步到右侧面板 */
    function lineTick(): void {
      const player = playerComponent.value?.getPlayer();
      if (!player) return;
      const displayed = player.getDisplayedLineIndex();
      if (displayed === currentLine.value) return;
      currentLine.value = displayed;
      scrollCurrentLineIntoView();
    }

    /** 只滚右侧面板，不带动整页滚动 */
    function scrollCurrentLineIntoView(): void {
      const container = scriptPanelRef.value;
      if (!container || currentLine.value === null) return;
      const element = container.querySelector<HTMLElement>(
        `[data-line="${CSS.escape(String(currentLine.value))}"]`,
      );
      if (!element) return;
      const top = element.offsetTop;
      const bottom = top + element.offsetHeight;
      if (top < container.scrollTop)
        container.scrollTop = Math.max(0, top - container.clientHeight / 3);
      else if (bottom > container.scrollTop + container.clientHeight)
        // 目标行落在视口 2/3 处，往下多露出一些即将播放的内容
        container.scrollTop = bottom - (container.clientHeight * 2) / 3;
    }

    onMounted(() => {
      lineTimer = setInterval(lineTick, LINE_POLL_INTERVAL_MS);
      if (pathValue.value.trim()) loadScript(pathValue.value);
    });

    onBeforeUnmount(() => {
      stopSeekTimer();
      if (lineTimer) {
        clearInterval(lineTimer);
        lineTimer = null;
      }
    });

    function seekSummary(): string {
      const state = seek.value;
      if (!state) return "";
      const picks = Array.from(state.choices)
        .filter(([, optionIndex]) => optionIndex !== 0)
        .sort(([a], [b]) => a - b)
        .map(
          ([decisionId, optionIndex]) =>
            `L${decisionId}→第${optionIndex + 1}项`,
        );
      const suffix = state.degraded
        ? "（剧本分支过多，分析退化，方案可能不准）"
        : "";
      if (picks.length === 0) return `全部选择按默认第 1 项走${suffix}`;
      return `${picks.join("，")}，其余选第 1 项${suffix}`;
    }

    function seekAlertType(): "error" | "warning" | "success" | "info" {
      switch (seek.value?.phase) {
        case "reached": {
          return "success";
        }
        case "missed":
        case "error": {
          return "error";
        }
        case "aborted": {
          return "warning";
        }
        default: {
          return "info";
        }
      }
    }

    /** 右侧原始脚本的一行 */
    function renderScriptLine(raw: string, index: number) {
      const lineNumber = index + 1;
      const seekable = analysis.value?.seekableLines.has(lineNumber) ?? false;
      const isDecision = analysis.value?.decisionLines.has(lineNumber) ?? false;
      const isCurrent = currentLine.value === lineNumber;
      const planned = isSeekActive(seek.value)
        ? seek.value.choices.get(lineNumber)
        : undefined;

      const classes = [
        "flex",
        "gap-2",
        "rounded",
        "px-1",
        "py-0.5",
        "font-mono",
        "text-xs",
        "leading-5",
      ];
      if (isCurrent) classes.push("bg-sky-500/20", "text-sky-900", "font-bold");
      else if (seekable)
        classes.push("cursor-pointer", "hover:bg-gray-100", "text-gray-700");
      else classes.push("text-gray-400");

      const children = [
        h(
          "span",
          {
            class: [
              "w-12",
              "shrink-0",
              "text-right",
              "select-none",
              "tabular-nums",
              isCurrent ? "text-sky-700" : "text-gray-400",
            ].join(" "),
          },
          String(lineNumber),
        ),
      ];
      if (isDecision)
        children.push(
          h(
            "span",
            {
              class: [
                "shrink-0",
                "font-sans",
                planned === undefined
                  ? "text-amber-500/80"
                  : "font-bold text-amber-600",
              ].join(" "),
              title:
                planned === undefined
                  ? "decision 分支点"
                  : `跳转方案：选第 ${planned + 1} 项`,
            },
            planned === undefined ? "◆" : `◆→${planned + 1}`,
          ),
        );
      children.push(
        h(
          "span",
          { class: "min-w-0 flex-1 break-all whitespace-pre-wrap" },
          raw.length > 0 ? raw : " ",
        ),
      );

      return h(
        "div",
        {
          class: classes.join(" "),
          "data-line": lineNumber,
          onClick: seekable
            ? () => {
                onSeek(lineNumber);
              }
            : undefined,
        },
        children,
      );
    }

    return () =>
      h("div", { class: "flex min-h-full flex-col gap-3 p-4" }, [
        h("div", { class: "flex flex-wrap items-center gap-2" }, [
          h(NInput, {
            value: pathValue.value,
            "onUpdate:value": (value: string) => {
              pathValue.value = value;
            },
            placeholder: `剧情路径（相对 gamedata/latest/story）或完整 URL，如 ${EXAMPLE_PATH}`,
            style: "width: min(480px, 100%)",
            disabled: loading.value,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === "Enter") loadScript(pathValue.value);
            },
          }),
          h(
            NButton,
            {
              type: "primary",
              loading: loading.value,
              onClick: () => loadScript(pathValue.value),
            },
            { default: () => "加载并播放" },
          ),
          h(NInputNumber, {
            value: lineValue.value,
            "onUpdate:value": (value: number | null) => {
              lineValue.value = value;
            },
            placeholder: "行号",
            min: 1,
            precision: 0,
            style: "width: 130px",
            disabled: loading.value,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === "Enter") onSeek();
            },
          }),
          h(
            NButton,
            {
              disabled: !scriptText.value,
              onClick: () => onSeek(),
            },
            { default: () => "跳转到该行" },
          ),
          isSeekActive(seek.value)
            ? h(
                NButton,
                { quaternary: true, onClick: () => resetSeek("已手动取消") },
                { default: () => "取消" },
              )
            : null,
        ]),
        loadError.value
          ? h(
              NAlert,
              { type: "error", title: "剧情加载失败" },
              { default: () => loadError.value },
            )
          : null,
        loadedUrl.value
          ? h(
              "div",
              { class: "text-xs break-all text-gray-400" },
              loadedUrl.value,
            )
          : null,
        seek.value
          ? h(
              NAlert,
              {
                type: seekAlertType(),
                title:
                  seek.value.phase === "seeking"
                    ? `快速播放中：当前 L${seek.value.current ?? "?"} → 目标 L${seek.value.target}`
                    : seek.value.message,
              },
              { default: () => h("div", { class: "text-xs" }, seekSummary()) },
            )
          : null,
        h("div", { class: "flex min-h-0 items-start gap-3" }, [
          h(
            "div",
            { class: "min-w-0 flex-1" },
            scriptText.value
              ? h(StoryPlayer, {
                  autoStart: true,
                  key: scriptEpoch.value,
                  ref: playerComponent,
                  script: scriptText.value,
                })
              : h(
                  NAlert,
                  { type: "info", title: "独立调试页" },
                  {
                    default: () =>
                      "输入剧情路径后加载播放；行号 + 跳转 = 快速播放自动选分支直达该行后切手动。资源与文本都直接来自 torappu.prts.wiki，不需要 prts.wiki 宿主页。",
                  },
                ),
          ),
          scriptText.value
            ? h(
                "aside",
                {
                  class:
                    "sticky top-4 flex max-h-[calc(100vh-2rem)] w-[420px] shrink-0 flex-col gap-2 rounded border border-gray-200 p-2",
                },
                [
                  h(
                    "div",
                    {
                      class:
                        "flex items-center justify-between px-1 text-xs text-gray-400",
                    },
                    [
                      h("span", `原始脚本 · ${scriptLines.value.length} 行`),
                      h("span", [
                        h("span", { class: "text-sky-600" }, "■ 当前行"),
                        "　",
                        h("span", { class: "text-amber-500" }, "◆ decision"),
                        "　点击文本行跳转",
                      ]),
                    ],
                  ),
                  h(
                    "div",
                    {
                      ref: scriptPanelRef,
                      class: "min-h-0 flex-1 overflow-y-auto",
                    },
                    scriptLines.value.map((raw, index) =>
                      renderScriptLine(raw, index),
                    ),
                  ),
                ],
              )
            : null,
        ]),
      ]);
  },
});

const ele = document.querySelector<HTMLElement>("#root");
if (ele) {
  createApp(StoryPlayerDebugShell).mount(ele);
} else {
  console.error("#root not found");
}
