import { Fragment } from "react";
import { CheckCircle } from "../lib/icons";

export interface StepItem {
  label: string;
  complete: boolean;
  /** The step currently in view (mobile shows only this step's label). */
  active?: boolean;
}

/**
 * Numbered progress stepper — 26px discs, flexing connector lines, completed
 * steps swap the number for a CheckCircle (the design's stepper component,
 * originally the Forge's "Steps To Setup Your Strategy" strip; styling lives
 * in the `.forge-stepper` block in index.css). `tone` picks the index color:
 * blue (info) or gold (accent).
 *
 * Pass `onSelectStep` to make steps clickable (jump navigation) — each step
 * renders as a `.forge-step-btn` button. Mobile (< 768px) collapses to a
 * single disc row showing only the active step's label.
 *
 * Adopters: OnboardingModal (accent, clickable). Reuse this instead of
 * hand-rolling a new progress strip.
 */
export function Stepper({
  steps,
  tone = "info",
  onSelectStep,
}: {
  steps: StepItem[];
  tone?: "info" | "accent";
  onSelectStep?: (index: number) => void;
}) {
  return (
    <ol className={`forge-stepper forge-stepper--${tone}`}>
      {steps.map((step, index) => {
        const body = (
          <>
            {step.complete ? (
              <CheckCircle
                className="forge-step-check"
                aria-hidden
                weight="fill"
              />
            ) : (
              <span className="forge-step-index">{index + 1}</span>
            )}
            <span className="forge-step-label">
              {step.label}
              {step.complete ? (
                <span className="visually-hidden"> (complete)</span>
              ) : null}
            </span>
          </>
        );
        const stepClass = [
          "forge-step",
          step.complete ? "forge-step--done" : "",
          step.active ? "forge-step--active" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Fragment key={step.label}>
            <li className={stepClass}>
              {onSelectStep ? (
                <button
                  type="button"
                  className="forge-step-btn"
                  aria-current={step.active ? "step" : undefined}
                  onClick={() => onSelectStep(index)}
                >
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
            {index < steps.length - 1 ? (
              <li className="forge-step-line" aria-hidden />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
