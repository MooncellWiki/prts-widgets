import { initialRuntimeDecisionState, passesGate } from "./log/semantics";

import type {
  DecisionSelection,
  ParsedLine,
  RuntimeChoiceSelection,
} from "./types";

/**
 * Native port: Torappu.AVG.DecisionCommandPredicator (2791
 * NeedToExecuteCommand @ 0x184179B00). The controller reads this shared
 * state before dispatch, and DecisionPanel updates it.
 */
export class DecisionCommandPredicator {
  private state = initialRuntimeDecisionState();
  // Web adaptation of m_decisionIndexByLine: Log All reads the chronological
  // choices, including repeated visits to the same line.
  private readonly selections: RuntimeChoiceSelection[] = [];

  get decisionValue(): number {
    return this.state.selectedValue;
  }

  needToExecuteCommand(line: ParsedLine): boolean {
    return passesGate(this.state, line);
  }

  beginDecision(): void {
    this.state = initialRuntimeDecisionState();
  }

  setReferences(references: readonly number[] | null): void {
    this.state.references = references;
  }

  applySelection(
    decisionId: number,
    { optionIndex, value }: DecisionSelection,
  ): void {
    this.state.selectedValue = value;
    // AVGController.OnDecisionSelected (2791 @ 0x184169F40) receives both
    // fields. Duplicate values can open the same gate for distinct options.
    if (optionIndex >= 0)
      this.selections.push({ decisionId, optionIndex, value });
  }

  getSelections(): RuntimeChoiceSelection[] {
    return this.selections.map((selection) => ({ ...selection }));
  }
}
