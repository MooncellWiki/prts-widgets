import {
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";

import { NAlert, NButton, NInput, NInputNumber } from "naive-ui";

import "virtual:uno.css";

import { resolveStoryScriptUrl } from "../widgets/StoryPlayer/context";
import {
  analyzeStoryFlow,
  planChoicesForLine,
} from "../widgets/StoryPlayer/engine/log";
import { parseStory } from "../widgets/StoryPlayer/engine/parser";
import StoryPlayer from "../widgets/StoryPlayer/index.vue";

/**
 * StoryPlayer 独立调试入口：不依赖 prts.wiki 宿主页，直接按路径从
 * torappu.prts.wiki 拉剧情 txt 播放。宿主页面由 debug/StoryPlayer.html
 * 提供（仅 dev server 使用，不在 templates/ 里，不会构建/同步到 wiki）。
 *
 * 用法：pnpm dev 后打开
 *   http://localhost:8080/debug/StoryPlayer.html?path=obt/main/level_main_00-01_beg.txt
 * path 是相对 gamedata/latest/story 的路径，也接受完整 URL；line 是可选的
 * 目标行号（文本行的 1-based 源行号，与 Log All 一致），确认后自动：
 * 快速播放 4 档 → 按计划自动选 decision（engine/log 求路径）→ 到行切手动。
 */

const PATH_PARAM = "path";
const LINE_PARAM = "line";
const EXAMPLE_PATH = "obt/main/level_main_00-01_beg.txt";
/** 快速播放的最高档（quick 模式 0..3 共 4 档） */
const QUICK_SPEED_MAX_LEVEL = 3;
const SEEK_POLL_INTERVAL_MS = 120;

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
    const loadedUrl = ref<string | null>(null);
    // index.vue 只在创建时读一次 props.script，换脚本必须用 key 强制重建
    const scriptEpoch = ref(0);
    // 初始 URL 带 line 参数时，首次加载完成后自动触发一次跳转
    let autoSeekPending = initialQuery.line !== "";

    const playerComponent = ref<InstanceType<typeof StoryPlayer> | null>(null);
    const seek = ref<SeekState | null>(null);
    let seekTimer: ReturnType<typeof setInterval> | null = null;
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
        loadedUrl.value = url;
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
      const script = scriptText.value;
      if (!script) return { error: "请先加载剧情" };

      // 变量只影响标签/文本展开，不影响路径条件；播放器可能还没建好，兜底空表
      const audioVariables =
        playerComponent.value?.getContext()?.audioVariables ?? {};
      const flow = analyzeStoryFlow(parseStory(script).lines, audioVariables);
      const result = planChoicesForLine(flow, target);
      if (!result.ok)
        return {
          error: `第 ${target} 行不在可显示文本里（控制命令行 / multiline 中间片段查不到，请填该段最后一行的行号，可先开「文本」面板对照）`,
        };
      return {
        choices: result.plan.choices,
        degraded: result.plan.degraded,
      };
    }

    function onSeek(): void {
      const target = lineValue.value;
      if (target === null || !Number.isSafeInteger(target) || target < 1) {
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

      const plan = planForLine(target);
      if ("error" in plan) {
        seek.value = {
          choices: new Map(),
          current: null,
          degraded: false,
          message: plan.error,
          phase: "error",
          target,
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
        target,
      };
      syncQueryParams(pathValue.value.trim(), String(target));
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
        player.setAutoPlaySpeedLevel(QUICK_SPEED_MAX_LEVEL);
        player.setAutoPlayMode("quick_play");
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

    onMounted(() => {
      if (pathValue.value.trim()) loadScript(pathValue.value);
    });

    onBeforeUnmount(() => {
      stopSeekTimer();
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

    return () =>
      h("div", { class: "flex min-h-full flex-col gap-3 p-4" }, [
        h("div", { class: "flex flex-wrap items-center gap-2" }, [
          h(NInput, {
            value: pathValue.value,
            "onUpdate:value": (value: string) => {
              pathValue.value = value;
            },
            placeholder: `剧情路径（相对 gamedata/latest/story）或完整 URL，如 ${EXAMPLE_PATH}`,
            style: "width: min(520px, 100%)",
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
            style: "width: 140px",
            disabled: loading.value,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === "Enter") onSeek();
            },
          }),
          h(
            NButton,
            {
              disabled: !scriptText.value,
              onClick: onSeek,
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
      ]);
  },
});

const ele = document.querySelector<HTMLElement>("#root");
if (ele) {
  createApp(StoryPlayerDebugShell).mount(ele);
} else {
  console.error("#root not found");
}
