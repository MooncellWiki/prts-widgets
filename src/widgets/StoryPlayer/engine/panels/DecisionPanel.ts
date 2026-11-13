import { ExecutorComponent, type PanelExecutors } from "../ExecutorComponent";
import { parseDecision, parsePredicateReferences } from "../log/semantics";

import type { Context } from "../../context";
import type { DecisionCommandPredicator } from "../DecisionCommandPredicator";
import type { WaitForDecision } from "../commandRegistry";
import type {
  DecisionPolicy,
  ParsedCommandLine,
  StoryRenderer,
} from "../types";

interface DecisionPlayback {
  pickOption: DecisionPolicy;
  resetAutoPlayMode: () => void;
  warnInvalidParameter: (detail: string, line?: ParsedCommandLine) => void;
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
export class DecisionPanel extends ExecutorComponent {
  private destroyed = false;

  constructor(
    private readonly predicator: DecisionCommandPredicator,
    private readonly renderer: Pick<
      StoryRenderer,
      "showDecision" | "settleDecision"
    >,
    private readonly context: Pick<Context, "audioVariables">,
    private readonly playback: DecisionPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      decision: (line) => this.executeDecision(line),
      // _ExecutePredicate (2791 @ 0x1841C7730) only replaces the references.
      predicate: (line) => {
        this.predicator.setReferences(parsePredicateReferences(line));
        return "continue";
      },
    };
  }

  destroy(): void {
    this.destroyed = true;
  }

  private executeDecision(
    line: ParsedCommandLine,
  ): "continue" | WaitForDecision {
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

    return {
      applySelection: (selection) =>
        this.predicator.applySelection(line.lineNumber, selection),
      closeDecision: () => this.renderer.settleDecision(),
      showDecision: (onSelect) =>
        this.renderer.showDecision(options, values, disabled, onSelect),
    };
  }
}
