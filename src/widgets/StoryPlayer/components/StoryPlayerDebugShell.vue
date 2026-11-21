<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";

import {
  AkButton,
  AkInput,
  AkInputNumber,
  AkMessage,
  type MessageVariant,
} from "@mooncellwiki/prts-design-vue";
import { useMediaQuery } from "@vueuse/core";
import { NSplit } from "naive-ui";

import { EXAMPLE_STORY_PATH, fetchStoryScript } from "@/pages/story";

import { resolveStoryScriptUrl } from "../context";
import {
  analyzeStoryFlow,
  planChoicesForLine,
  type StoryFlowResult,
} from "../engine/log";
import { parseStory } from "../engine/parser";
import StoryPlayer from "../index.vue";

import type {
  LineSeekUpdate,
  StoryPlayer as StoryPlayerFacade,
} from "../engine/types";

/**
 * StoryPlayer 独立页的调试外壳（仅 dev，通过 ?debug 加载，不进 build 产物）：
 * 不依赖 prts.wiki 宿主页，直接按路径从
 * torappu.prts.wiki 拉剧情 txt 播放。
 *
 * 布局：左侧播放器，右侧原始脚本（带行号，标记当前播放行，decision 行
 * 有标记，seek 中的计划选择会标注；点击文本行 = 跳转到该行）。
 *
 * 跳转：从头重建播放器 → 引擎侧 seekToLine 编排（quick 4 档 + 按计划
 * 自动选 decision，engine/log 求路径）→ 到达/播完/人工干预由引擎推送
 * 终态，无轮询。
 */

defineOptions({ name: "StoryPlayerDebugShell" });

const verticalLayout = useMediaQuery("(max-width: 720px)");
const splitTheme = {
  resizableTriggerColor: "var(--ak-border)",
  resizableTriggerColorHover: "var(--ak-accent)",
};

const PATH_PARAM = "path";
const LINE_PARAM = "line";
const EXAMPLE_PATH = EXAMPLE_STORY_PATH;
/** 等待播放器创建完成（context/字体预载是异步的）的引导轮询间隔；
 *  就绪后即挂 onDisplayedLineChange 订阅并武装跳转，停表，不再常驻轮询 */
const PLAYER_WAIT_INTERVAL_MS = 150;
/** 引导轮询的上限：context 拉取失败时播放器永远不会出现，别让表空转 */
const PLAYER_WAIT_TIMEOUT_MS = 30_000;

function readQueryParams(): { path: string; line: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    line: params.get(LINE_PARAM) ?? "",
    path: params.get("url")?.trim() || params.get(PATH_PARAM) || "",
  };
}

function syncQueryParams(path: string, line: string | null): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("url");
  url.searchParams.set(PATH_PARAM, path);
  if (line === null) url.searchParams.delete(LINE_PARAM);
  else url.searchParams.set(LINE_PARAM, line);
  window.history.replaceState(null, "", url);
}

interface SeekState {
  /** arming=等播放器就绪并武装引擎跳转；seeking=快速播放推进中；其余为终态 */
  phase: "arming" | "seeking" | "reached" | "missed" | "aborted" | "error";
  message: string;
  /** 方案里需要显式选择的 decision（decisionId → optionIndex），表外默认第 0 项 */
  choices: Map<number, number>;
  degraded: boolean;
  target: number;
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

const initialQuery = readQueryParams();
const initialLine = initialQuery.line ? Number(initialQuery.line) : null;
const pathValue = ref(initialQuery.path);
const lineValue = ref<number | null>(
  Number.isSafeInteger(initialLine) && initialLine !== null && initialLine > 0
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
/** 已规划、等播放器就绪后武装的跳转（onSeek 重建播放器期间的中间态） */
let pendingSeek: { choices: Map<number, number>; target: number } | null = null;
/** 引擎侧进行中跳转的取消句柄；null = 未武装/已终态 */
let cancelLineSeek: (() => void) | null = null;
let playerWaitTimer: ReturnType<typeof setInterval> | null = null;
let disposeLineListener: (() => void) | null = null;

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
    const text = await fetchStoryScript(url);
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
    loadError.value = error instanceof Error ? error.message : String(error);
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
      error: `第 ${target} 行不在可显示文本里（控制命令行 / multiline 中间片段查不上，请填该段最后一行的行号）`,
    };
  return {
    choices: result.plan.choices,
    degraded: result.plan.degraded,
  };
}

/** window.__storySeekPlan 上暴露的跳转方案,供外部自动化消费(native 采集
 *  侧据此用 frida 自动选分支):decisionId(= 源行号)→ optionIndex,
 *  表外 decision 默认第 0 项;保留最近一次方案,直到下次跳转覆盖 */
interface SeekPlanPayload {
  target: number;
  choices: Record<string, number>;
  degraded: boolean;
}

function exposeSeekPlan(
  target: number,
  choices: Map<number, number>,
  degraded: boolean,
): void {
  (window as unknown as { __storySeekPlan?: SeekPlanPayload }).__storySeekPlan =
    {
      choices: Object.fromEntries(choices),
      degraded,
      target,
    };
}

function onSeek(target?: number): void {
  if (target !== undefined) lineValue.value = target;
  const line = lineValue.value;
  if (line === null || !Number.isSafeInteger(line) || line < 1) {
    seek.value = {
      choices: new Map(),
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
      degraded: false,
      message: plan.error,
      phase: "error",
      target: line,
    };
    return;
  }

  // 跳转总是从头播放：方案的选择路径以脚本起点为前提。重建完成
  // （getPlayer 可用）后由 watchPlayerLine 武装引擎侧的 seekToLine
  resetSeek();
  pendingSeek = { choices: plan.choices, target: line };
  exposeSeekPlan(line, plan.choices, plan.degraded);
  scriptEpoch.value++;
  seek.value = {
    choices: plan.choices,
    degraded: plan.degraded,
    message: "等待播放器就绪…",
    phase: "arming",
    target: line,
  };
  syncQueryParams(pathValue.value.trim(), String(line));
}

/**
 * 摘掉进行中的跳转（引擎侧策略 + 未武装的 pending）。已武装的还要把播放
 * 模式切回手动：seekToLine 把播放器推到了 quick 最高档，只摘策略的话剧情
 * 会继续狂奔，和 reached 那条路径的收尾也不一致。
 */
function resetSeek(message?: string): void {
  const armed = cancelLineSeek !== null;
  cancelLineSeek?.();
  cancelLineSeek = null;
  pendingSeek = null;
  // 引擎侧已静默摘掉跳转，此时再切模式不会再冒一条 aborted 通知出来
  if (armed) playerComponent.value?.getPlayer()?.setAutoPlayMode("default");
  seek.value =
    message === undefined
      ? null
      : {
          choices: new Map(),
          degraded: false,
          message,
          phase: "aborted",
          target: -1,
        };
}

/** 武装挂起的跳转：策略注入、quick 模式、终态检测全在引擎侧编排 */
function armPendingSeek(player: StoryPlayerFacade): void {
  const pending = pendingSeek;
  if (!pending) return;
  pendingSeek = null;
  cancelLineSeek = player.seekToLine(
    pending.target,
    pending.choices,
    onLineSeekUpdate,
  );
}

/** 引擎跳转推送 → UI 状态；文案归调试页，引擎只报事实 */
function onLineSeekUpdate(update: LineSeekUpdate): void {
  const state = seek.value;
  if (!isSeekActive(state)) return; // 已被手动取消/重置，丢弃迟到通知
  if (update.phase === "seeking") {
    seek.value = {
      ...state,
      message: "快速播放中，自动选择分支…",
      phase: "seeking",
    };
    return;
  }
  cancelLineSeek = null;
  seek.value = { ...state, message: seekMessage(update), phase: update.phase };
}

function seekMessage(update: LineSeekUpdate): string {
  const target = seek.value?.target ?? update.target;
  switch (update.phase) {
    case "reached": {
      return `已到达第 ${target} 行，切回手动模式`;
    }
    case "missed": {
      return update.reason === "error"
        ? `播放出错，未经过第 ${target} 行`
        : `播放已结束，未经过第 ${target} 行`;
    }
    case "aborted": {
      return "检测到手动切换播放模式，已中止跳转";
    }
    default: {
      return "";
    }
  }
}

/**
 * scriptEpoch 变化 = 旧 player 已随 key 销毁、新的异步创建中（context/
 * 字体预载）。引导轮询到 getPlayer() 可用后挂 onDisplayedLineChange 订阅
 * （当前行高亮由此推送驱动），并武装挂起的跳转，随即停表，不再常驻轮询。
 */
function watchPlayerLine(): void {
  disposeLineListener?.();
  disposeLineListener = null;
  stopPlayerWait();
  let waited = 0;
  playerWaitTimer = setInterval(() => {
    const player = playerComponent.value?.getPlayer();
    if (!player) {
      // 创建/预载中，下一轮再试；久等不来（context 拉取失败）就停表报错，
      // 否则这块表会一直空转，挂起的跳转也永远等不到终态
      waited += PLAYER_WAIT_INTERVAL_MS;
      if (waited < PLAYER_WAIT_TIMEOUT_MS) return;
      stopPlayerWait();
      if (pendingSeek)
        resetSeek("播放器未能就绪（资源加载失败？），跳转已取消");
      return;
    }
    stopPlayerWait();
    disposeLineListener = player.onDisplayedLineChange((lineIndex) => {
      if (currentLine.value === lineIndex) return;
      currentLine.value = lineIndex;
      scrollCurrentLineIntoView();
    });
    armPendingSeek(player);
  }, PLAYER_WAIT_INTERVAL_MS);
}

function stopPlayerWait(): void {
  if (!playerWaitTimer) return;
  clearInterval(playerWaitTimer);
  playerWaitTimer = null;
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

watch(scriptEpoch, watchPlayerLine);

onMounted(() => {
  if (pathValue.value.trim()) loadScript(pathValue.value);
});

onBeforeUnmount(() => {
  cancelLineSeek?.();
  cancelLineSeek = null;
  pendingSeek = null;
  stopPlayerWait();
  disposeLineListener?.();
  disposeLineListener = null;
});

function seekSummary(): string {
  const state = seek.value;
  if (!state) return "";
  const picks = Array.from(state.choices)
    .filter(([, optionIndex]) => optionIndex !== 0)
    .sort(([a], [b]) => a - b)
    .map(
      ([decisionId, optionIndex]) => `L${decisionId}→第${optionIndex + 1}项`,
    );
  const suffix = state.degraded
    ? "（剧本分支过多，分析退化，方案可能不准）"
    : "";
  if (picks.length === 0) return `全部选择按默认第 1 项走${suffix}`;
  return `${picks.join("，")}，其余选第 1 项${suffix}`;
}

function seekMessageVariant(): MessageVariant {
  switch (seek.value?.phase) {
    case "reached": {
      return "success";
    }
    case "missed":
    case "error": {
      return "danger";
    }
    case "aborted": {
      return "warning";
    }
    default: {
      return "info";
    }
  }
}

/** 右侧脚本行渲染辅助（v-for 用）；样式全部来自本组件 style 的 spd-* */
const scriptRows = computed(() =>
  scriptLines.value.map((raw, index) => ({ lineNumber: index + 1, raw })),
);

function isSeekableLine(lineNumber: number): boolean {
  return analysis.value?.seekableLines.has(lineNumber) ?? false;
}

function isDecisionLine(lineNumber: number): boolean {
  return analysis.value?.decisionLines.has(lineNumber) ?? false;
}

/** seek 进行中时该 decision 行的计划选择；undefined = 未在方案里 */
function plannedPick(lineNumber: number): number | undefined {
  return isSeekActive(seek.value)
    ? seek.value.choices.get(lineNumber)
    : undefined;
}

function scriptLineClasses(lineNumber: number): string[] {
  const classes = ["spd-line"];
  // 当前行同时也是可点击文本行，hover 样式与普通文本行一致
  if (currentLine.value === lineNumber)
    classes.push("spd-line-current", "spd-line-text");
  else if (isSeekableLine(lineNumber)) classes.push("spd-line-text");
  else classes.push("spd-line-cmd");
  return classes;
}
</script>

<template>
  <div class="spd-root ak-not-prose">
    <div class="spd-toolbar">
      <AkInput
        v-model="pathValue"
        class="spd-path"
        label="剧情路径"
        placeholder="剧情相对路径或完整 URL"
        :disabled="loading"
        @keydown.enter="loadScript(pathValue)"
      />
      <AkButton
        variant="primary"
        icon="play"
        :loading="loading"
        :disabled="loading"
        @click="loadScript(pathValue)"
      >
        加载并播放
      </AkButton>
      <AkInputNumber
        v-model="lineValue"
        label="目标行号"
        placeholder="行号"
        :min="1"
        :disabled="loading"
        @keydown.enter="onSeek()"
      />
      <AkButton :disabled="!scriptText" @click="onSeek()">
        跳转到该行
      </AkButton>
      <AkButton
        v-if="isSeekActive(seek)"
        variant="ghost"
        @click="resetSeek('已手动取消')"
      >
        取消
      </AkButton>
    </div>
    <AkMessage v-if="loadError" variant="danger" title="剧情加载失败">
      {{ loadError }}
    </AkMessage>
    <div v-if="loadedUrl" class="spd-url">{{ loadedUrl }}</div>
    <AkMessage
      v-if="seek"
      :variant="seekMessageVariant()"
      :title="
        seek.phase === 'seeking'
          ? `快速播放中 · L${currentLine ?? '?'} → L${seek.target}`
          : seek.message
      "
    >
      <div class="spd-alert-detail">{{ seekSummary() }}</div>
    </AkMessage>
    <!-- 根容器锁死一屏高，页面本身不再滚动；两个 pane 各自内部滚动 -->
    <NSplit
      class="spd-main"
      :default-size="0.68"
      :direction="verticalLayout ? 'vertical' : 'horizontal'"
      :theme-overrides="splitTheme"
      :max="0.85"
      :min="0.25"
    >
      <template #1>
        <div class="spd-player-pane">
          <StoryPlayer
            v-if="scriptText"
            :key="scriptEpoch"
            ref="playerComponent"
            :script="scriptText"
            auto-start
          />
          <AkMessage v-else title="独立调试页">
            输入剧情路径开始播放。输入行号可自动选择分支，跳到指定行后切回手动播放。
          </AkMessage>
        </div>
      </template>
      <template #2>
        <aside class="spd-script-pane">
          <div class="spd-script-header">
            <span>原始脚本 · {{ scriptLines.length }} 行</span>
            <span class="spd-legend">
              <span class="spd-legend-item">
                <span class="spd-swatch" />
                当前行
              </span>
              <span class="spd-legend-item spd-legend-decision">
                <span>◆</span>
                decision
              </span>
              点击文本行跳转
            </span>
          </div>
          <div ref="scriptPanelRef" class="spd-script-list">
            <template v-if="scriptText">
              <div
                v-for="{ lineNumber, raw } in scriptRows"
                :key="lineNumber"
                :class="scriptLineClasses(lineNumber)"
                :data-line="lineNumber"
                @click="isSeekableLine(lineNumber) && onSeek(lineNumber)"
              >
                <span class="spd-line-no">{{ lineNumber }}</span>
                <span
                  v-if="isDecisionLine(lineNumber)"
                  :class="
                    plannedPick(lineNumber) === undefined
                      ? 'spd-mark'
                      : 'spd-mark spd-mark-planned'
                  "
                  :title="
                    plannedPick(lineNumber) === undefined
                      ? 'decision 分支点'
                      : `跳转方案：选第 ${(plannedPick(lineNumber) ?? 0) + 1} 项`
                  "
                >
                  {{
                    plannedPick(lineNumber) === undefined
                      ? "◆"
                      : `◆→${(plannedPick(lineNumber) ?? 0) + 1}`
                  }}
                </span>
                <span class="spd-line-content">{{
                  raw.length > 0 ? raw : " "
                }}</span>
              </div>
            </template>
            <div v-else class="spd-placeholder">
              加载剧情后在此显示原始脚本。
            </div>
          </div>
        </aside>
      </template>
    </NSplit>
  </div>
</template>

<style scoped>
/*
 * 调试页自有样式不走 uno，全部手写 spd- 前缀，保证确定性渲染
 * （页面级 html/body/#root 高度在 src/pages/page.css）。
 */
.spd-root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--ak-space-3);
  height: 100vh;
  padding: var(--ak-space-4);
}

.spd-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ak-space-2);
}

.spd-path {
  width: min(30rem, 100%);
}

.spd-url {
  color: var(--ak-fg-muted);
  font-size: 12px;
  word-break: break-all;
}

.spd-main {
  flex: 1;
  min-height: 0;
}

.spd-player-pane {
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.spd-script-pane {
  box-sizing: border-box;
  border: 1px solid var(--ak-border);
  background: var(--ak-bg-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-width: 0;
  padding: 8px;
}

.spd-script-header {
  color: var(--ak-fg-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 0 4px;
}

.spd-legend {
  display: flex;
  align-items: center;
  gap: 12px;
}

.spd-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.spd-swatch {
  background: var(--ak-mark-bg);
  border: 1px solid var(--ak-accent-muted);
  display: inline-block;
  height: 10px;
  width: 20px;
}

.spd-script-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.spd-line {
  display: flex;
  font-family: var(--ak-font-mono);
  font-size: 12px;
  gap: 8px;
  line-height: 20px;
  padding: 1px 4px;
}

.spd-line-no {
  color: var(--ak-fg-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
  width: 44px;
}

.spd-line-content {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.spd-line-text {
  color: var(--ak-fg);
  cursor: pointer;
}

.spd-line-text:hover {
  background-color: var(--ak-bg-hover);
}

.spd-line-cmd {
  color: var(--ak-fg-muted);
}

.spd-line-current {
  background-color: var(--ak-mark-bg);
  font-weight: 700;
}

.spd-line-current .spd-line-content {
  color: var(--ak-link);
}

.spd-line-current .spd-line-no {
  color: var(--ak-link);
}

.spd-mark {
  color: var(--ak-warning);
  flex-shrink: 0;
}

.spd-mark-planned {
  color: var(--ak-warning);
  font-weight: 700;
}

.spd-placeholder {
  color: var(--ak-fg-muted);
  font-size: 12px;
  padding: 8px;
}

.spd-alert-detail {
  font-size: 12px;
}
</style>
