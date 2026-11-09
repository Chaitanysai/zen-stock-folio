import * as React from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Calendar date field.
 *
 * The value is always an ISO `YYYY-MM-DD` string, or `""` for "unset" — exactly
 * what the native `<input type="date">` it replaces produced, so every existing
 * parser, validator and persistence path is untouched. Only the interface
 * changes: a themed popover calendar instead of the browser's own popup.
 *
 * Parsing is done in local time on purpose. `new Date("2026-11-01")` is treated
 * as UTC midnight, which renders as the previous day west of Greenwich; the
 * explicit year/month/day construction keeps the calendar honest.
 */

/** `YYYY-MM-DD` → local-time Date, or undefined when blank/malformed. */
export function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Reject a date the calendar rolled over (e.g. 2026-02-31 → 3 March).
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return undefined;
  }
  return date;
}

/** local-time Date → `YYYY-MM-DD`, the storage format the dialogs already use. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Human label for the trigger. Blank input renders the placeholder. */
const defaultFormat = (date: Date): string =>
  date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export interface DateFieldProps {
  /** ISO `YYYY-MM-DD`, or `""`. Same shape the native date input produced. */
  value: string;
  /** Receives an ISO `YYYY-MM-DD` string, or `""` when cleared. */
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Inclusive bounds. Days outside them are not selectable. */
  fromDate?: Date;
  toDate?: Date;
  /** Offer a shortcut to the current day. */
  showToday?: boolean;
  /** Allow clearing back to an unset value. */
  clearable?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

const DateField = React.forwardRef<HTMLButtonElement, DateFieldProps>(
  (
    {
      value,
      onChange,
      id,
      placeholder = "Pick a date",
      disabled,
      fromDate,
      toDate,
      showToday = true,
      clearable = true,
      className,
      ...aria
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const selected = parseIsoDate(value);

    // `from`/`to` close the calendar over the allowed window; `disabled` keeps
    // out-of-range days visible but inert, which reads better than hiding them.
    const disabledDays = React.useMemo(() => {
      const matchers: Array<{ before: Date } | { after: Date }> = [];
      if (fromDate) matchers.push({ before: fromDate });
      if (toDate) matchers.push({ after: toDate });
      return matchers.length ? matchers : undefined;
    }, [fromDate, toDate]);

    const defaultMonth = selected ?? toDate ?? new Date();

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            data-empty={!selected}
            className={cn(
              "h-10 w-full justify-start gap-2 bg-secondary border-border px-3 text-sm font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
            {...aria}
          >
            <CalendarIcon aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate">{selected ? defaultFormat(selected) : placeholder}</span>
            {clearable && selected && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear date"
                className="ml-auto rounded-sm p-0.5 opacity-60 transition-opacity hover:opacity-100"
                onClick={(event) => {
                  // Clear without opening the calendar or submitting the form.
                  event.preventDefault();
                  event.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange("");
                  }
                }}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={defaultMonth}
            disabled={disabledDays}
            onSelect={(date) => {
              if (!date) return;
              onChange(toIsoDate(date));
              setOpen(false);
            }}
            initialFocus
          />
          {showToday && (
            <div className="border-t border-border p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs font-medium"
                onClick={() => {
                  onChange(toIsoDate(new Date()));
                  setOpen(false);
                }}
              >
                Today
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  },
);
DateField.displayName = "DateField";

export { DateField };
