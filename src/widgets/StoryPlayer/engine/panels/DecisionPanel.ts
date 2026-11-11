import { parseDecision, parsePredicateReferences } from "../log/semantics";

import type { Context } from "../../context";
import type { DecisionCommandPredicator } from "../DecisionCommandPredicator";
import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type {
  AutoPlayMode,
  DecisionPolicy,
  ParsedCommandLine,
  StoryRenderer,
} from "../types";

interface DecisionPlayback {
  beginWait: () => AutoPlayMode;
  finishWait: (autoPlayRestore: AutoPlayMode) => void;
  pickOption: DecisionPolicy;
  resetAutoPlayMode: () => void;
  warnInvalidParameter: (detail: string, line?: ParsedCommandLine) => void;
}

interface PendingDecision {
  autoPlayRestore: AutoPlayMode;
}

// _ExecuteDecision (2791 @ 0x1841C7400) logs excess options by comparing
// against m_optionTexts.Length, which Awake takes from the prefab's
// _optionRoots. Web renders all options and warns above the corpus maximum.
const OBSERVED_MAX_DECISION_OPTIONS = 4;

/**
 * Native port: Torappu.AVG.DecisionPanel (2791 GetExecutors @ 0x1841C6FC0).
 * Runs decision/predicate against the controller's shared predicator.
 * The web view delivers the selection and the controller owns playback mode.
 */
export class DecisionPanel {
  private pendingDecision: PendingDecision | null = null;
  private destroyed = false;

  constructor(
    private readonly predicator: DecisionCommandPredicator,
    private readonly renderer: Pick<
      StoryRenderer,
      "showDecision" | "settleDecision"
    >,
    private readonly context: Pick<Context, "audioVariables">,
    private readonly playback: DecisionPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("decision", (line) => this.executeDecision(line));
    // _ExecutePredicate (2791 @ 0x1841C7730) only replaces the references.
    registry.register("predicate", (line) => {
      this.predicator.setReferences(parsePredicateReferences(line));
      return "continue";
    });
  }

  getPendingDecision(): PendingDecision | null {
    return this.pendingDecision;
  }

  /**
   * Native ForceCommandEnd (2791 @ 0x1841C6D40) leaves the panel alone, and
   * ShouldResetOnSkip returns false. Web closes the view as an unclicked
   * selection to release the command loop. The sampled view may already have
   * settled from a click during cleanup.
   */
  settleOnSkip(pending: PendingDecision | null): void {
    if (pending && this.pendingDecision === pending)
      this.renderer.settleDecision();
  }

  destroy(): void {
    this.destroyed = true;
    const pending = this.pendingDecision;
    this.pendingDecision = null;
    if (pending) this.renderer.settleDecision();
  }

  private async executeDecision(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    // _ExecuteDecision (2791 @ 0x1841C7400) resets the gate before checking
    // options. The web player warns and continues for a missing options key.
    this.predicator.beginDecision();
    const parsed = parseDecision(line, this.context.audioVariables);
    if (!parsed) {
      this.playback.resetAutoPlayMode();
      this.playback.warnInvalidParameter(
        "decision options parameter is missing",
        line,
      );
      return "continue";
    }

    const options = parsed.options.map((option) => option.label);
    const values = parsed.options.map((option) => option.value);
    const disabled = parsed.options.map((option) => option.disabled);
    if (options.length > OBSERVED_MAX_DECISION_OPTIONS)
      this.playback.warnInvalidParameter(
        `too many decision options: ${options.length} > observed maximum ${OBSERVED_MAX_DECISION_OPTIONS}`,
        line,
      );

    // Web adaptation: the injected seek/debug policy picks by option index.
    // The game setting AVG_SKIP_DECISION is treated as off.
    const optionIndex = this.playback.pickOption({
      decisionId: line.lineNumber,
      options,
      values,
    });
    if (this.destroyed) return "continue";
    if (
      optionIndex !== null &&
      Number.isSafeInteger(optionIndex) &&
      optionIndex >= 0 &&
      optionIndex < options.length
    ) {
      this.predicator.applySelection(line.lineNumber, {
        optionIndex,
        value: values[optionIndex] ?? 0,
      });
      return "continue";
    }

    const pending = { autoPlayRestore: this.playback.beginWait() };
    this.pendingDecision = pending;
    try {
      const selection = await this.renderer.showDecision(
        options,
        values,
        disabled,
      );
      if (this.pendingDecision !== pending) return "continue";
      this.pendingDecision = null;
      this.predicator.applySelection(line.lineNumber, selection);
      this.playback.finishWait(pending.autoPlayRestore);
      return "continue";
    } finally {
      if (this.pendingDecision === pending) this.pendingDecision = null;
    }
  }
}
