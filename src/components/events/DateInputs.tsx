import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isoToUs } from "@/lib/eventTemplate/format";

// Datas sempre em MM/DD/YYYY (padrão do modelo oficial), independente do idioma do navegador.
// Guardadas como "YYYY-MM-DD" (data) e "YYYY-MM-DDTHH:MM" (data e hora).

const pad = (n: number) => String(n).padStart(2, "0");

function usToIso(us: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us);
  if (!m) return null;
  const [mm, dd, yyyy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

/** Digits typed -> "MM/DD/YYYY" as the user types. */
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}

function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function DatePart({ iso, onChange, className }: { iso: string; onChange: (iso: string) => void; className?: string }) {
  const [text, setText] = useState(isoToUs(iso));
  const [open, setOpen] = useState(false);
  useEffect(() => setText(isoToUs(iso)), [iso]);
  const invalid = text !== "" && usToIso(text) == null;
  const selected = iso ? new Date(`${iso}T00:00:00`) : undefined;
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Input
        inputMode="numeric"
        placeholder="MM/DD/YYYY"
        title="Mês/Dia/Ano"
        className={`tabular-nums ${invalid ? "border-destructive" : ""}`}
        value={text}
        onChange={(e) => {
          const next = maskDate(e.target.value);
          setText(next);
          if (next === "") onChange("");
          const parsed = usToIso(next);
          if (parsed) onChange(parsed);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Abrir calendário">
            <CalendarDays className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return;
              onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Data (MM/DD/YYYY) com valor "YYYY-MM-DD". */
export function DateField({ value, onChange }: { value: string | null | undefined; onChange: (iso: string) => void }) {
  return <DatePart iso={value ?? ""} onChange={onChange} />;
}

/** Data (MM/DD/YYYY) e hora (HH:MM, 24 h) com valor "YYYY-MM-DDTHH:MM". */
export function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [date, timeFromValue] = (value ?? "").split("T");
  const [time, setTime] = useState((timeFromValue ?? "").slice(0, 5));
  useEffect(() => setTime((timeFromValue ?? "").slice(0, 5)), [timeFromValue]);
  const emit = (d: string, t: string) => onChange(d ? `${d}T${validTime(t) ? t : "00:00"}` : "");
  return (
    <div className="flex items-center gap-1">
      <DatePart iso={date ?? ""} className="flex-1" onChange={(d) => emit(d, time)} />
      <Input
        inputMode="numeric"
        placeholder="HH:MM"
        title="Hora (24 h)"
        className={`w-20 tabular-nums ${time && !validTime(time) ? "border-destructive" : ""}`}
        value={time}
        onChange={(e) => {
          const t = maskTime(e.target.value);
          setTime(t);
          if (date && validTime(t)) emit(date, t);
        }}
      />
    </div>
  );
}
