import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccent } from "@/hooks/useAccent";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  accentToHex,
  formatHsl,
  formatRgb,
  hexToAccent,
  type Accent,
} from "@/lib/theme/accent";

export default function AccentPicker() {
  const { accent, setAccent, reset } = useAccent();
  const [draft, setDraft] = useState(() => accentToHex(accent));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(accentToHex(accent));
    setInvalid(false);
  }, [accent]);

  const pick = (next: Accent) => {
    setAccent(next);
    setDraft(accentToHex(next));
    setInvalid(false);
  };

  const onHex = (value: string) => {
    setDraft(value);
    const parsed = hexToAccent(value);
    if (parsed) setAccent(parsed);
    setInvalid(!parsed);
  };

  const onReset = () => {
    reset();
    setDraft(accentToHex(DEFAULT_ACCENT));
    setInvalid(false);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="zf-rbtn" aria-label="Accent colour" aria-haspopup="dialog">
          <Palette aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="zf-accent-pop p-4">
        <div className="zf-accent-head">
          <p className="zf-accent-title">Accent colour</p>
          <button type="button" className="zf-link" onClick={onReset}>
            Reset
          </button>
        </div>

        <div className="zf-accent-presets" role="group" aria-label="Accent presets">
          {ACCENT_PRESETS.map(({ id, label, accent: preset }) => {
            const active = accent.h === preset.h && accent.s === preset.s && accent.l === preset.l;
            return (
              <button
                key={id}
                type="button"
                className="zf-accent-swatch"
                aria-label={label}
                aria-pressed={active}
                title={label}
                style={{ background: formatHsl(preset) }}
                onClick={() => pick(preset)}
              />
            );
          })}
        </div>

        <div className="zf-accent-custom">
          <input
            type="color"
            aria-label="Pick a colour"
            value={accentToHex(accent)}
            onChange={(e) => onHex(e.target.value)}
          />
          <input
            type="text"
            aria-label="Hex colour"
            className="zf-accent-hex"
            value={draft}
            maxLength={7}
            pattern="#?[0-9a-fA-F]{6}"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            onChange={(e) => onHex(e.target.value)}
          />
          <span className="zf-accent-preview" aria-hidden="true">
            Aa
          </span>
        </div>
        <p className="zf-accent-hint" data-invalid={invalid || undefined}>
          {invalid ? "Use #RRGGBB" : "Presets or any hex colour"}
        </p>

        <dl className="zf-accent-readout">
          <div>
            <dt>HSL</dt>
            <dd>{formatHsl(accent)}</dd>
          </div>
          <div>
            <dt>RGB</dt>
            <dd>{formatRgb(accent)}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
