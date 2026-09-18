/** Small labeled fields the frame inspector is built from — crosscut inputs
 *  with a caption, committing on change; numbers parse as numbers, blanks clear. */
import * as React from "react";
import { Input, Label, Textarea, cn } from "crosscut";

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-[13px] text-muted-foreground">{label}</Label>
      {children}
      {hint && <span className="text-xs text-muted-foreground/80">{hint}</span>}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; mono?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className={cn("h-7 text-[12px]", mono && "font-mono")} />
    </Field>
  );
}

export function TextAreaField({ label, value, onChange, rows = 3, hint, mono }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; mono?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <Textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={cn("text-[12px]", mono && "font-mono")} />
    </Field>
  );
}

export function NumberField({ label, value, onChange, placeholder, hint }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; hint?: string;
}) {
  const [text, setText] = React.useState(value === undefined ? "" : String(value));
  React.useEffect(() => { setText(value === undefined ? "" : String(value)); }, [value]);
  return (
    <Field label={label} hint={hint}>
      <Input value={text} placeholder={placeholder} inputMode="decimal" className="h-7 text-[12px]"
        onChange={(e) => {
          setText(e.target.value);
          const t = e.target.value.trim();
          if (t === "") onChange(undefined);
          else if (Number.isFinite(Number(t))) onChange(Number(t));
        }} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded-md border border-input bg-background px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <input type="color" value={isHex ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
          className="size-7 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5" />
        <Input value={value} placeholder="none" onChange={(e) => onChange(e.target.value)} className="h-7 font-mono text-[12px]" />
      </div>
    </Field>
  );
}

export function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px]" title={hint}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="size-3.5" />
      {label}
    </label>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="border-b px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {right}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
