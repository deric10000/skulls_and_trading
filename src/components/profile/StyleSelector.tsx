import { HORIZON_OPTIONS, FOCUS_OPTIONS, STYLE_OPTIONS } from "../../data";
import { useAppState } from "../../state/AppState";
import type { TimeHorizon, TradingStyle } from "../../types";
import { ChoiceGroup } from "../ChoiceGroup";

export function StyleSelector() {
  const { captain, updateCaptain } = useAppState();

  function toggleFocus(option: string) {
    const exists = captain.focus.includes(option);
    updateCaptain({
      focus: exists
        ? captain.focus.filter((item) => item !== option)
        : [...captain.focus, option],
    });
  }

  return (
    <section className="panel selector-card" aria-labelledby="style-title">
      <div className="panel-head">
        <h2 id="style-title">Trading Style</h2>
        <span className="panel-tag">Frames your deck</span>
      </div>
      <ChoiceGroup<TradingStyle>
        label="Primary style"
        options={STYLE_OPTIONS}
        value={captain.style}
        onChange={(style) => updateCaptain({ style })}
      />
      <ChoiceGroup<TimeHorizon>
        label="Typical time horizon"
        options={HORIZON_OPTIONS}
        value={captain.horizon}
        onChange={(horizon) => updateCaptain({ horizon })}
      />
      <ChoiceGroup
        label="Focus areas"
        hint="Select all that apply"
        options={FOCUS_OPTIONS}
        value={captain.focus}
        onChange={toggleFocus}
        multiple
      />
    </section>
  );
}
