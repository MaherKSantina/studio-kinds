/**
 * Moved to the design system: crosscut/src/decisions/decisionSpace.ts (the
 * mechanism was never about playbooks — see `DecisionPills`). This shim keeps
 * the ported doc engines' import paths stable.
 */
export {
  refOf, splitRef, meets, enablersOf, activeDecisions, valuesOn,
  pruneLocks, applyRefs, impliedLocks, decisionRows, toggleRef,
} from "crosscut";
export type { When, SpaceValue, SpaceDecision } from "crosscut";
