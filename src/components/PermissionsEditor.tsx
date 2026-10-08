import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { PERMISSION_GROUPS, PERMISSION_PRESETS, type Permission } from "@/lib/permissions";

interface Props {
  value: Set<Permission>;
  onChange: (next: Set<Permission>) => void;
  /** Permissões que não podem ser desmarcadas (ex.: a própria gestão de usuários). */
  locked?: Permission[];
}

/** Lista das funções do painel, por área, para marcar o que o usuário pode acessar. */
export function PermissionsEditor({ value, onChange, locked = [] }: Props) {
  const toggle = (p: Permission, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(p);
    else if (!locked.includes(p)) next.delete(p);
    onChange(next);
  };
  const applyPreset = (permissions: Permission[]) => onChange(new Set([...permissions, ...locked]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Preencher com:</span>
        {PERMISSION_PRESETS.map((preset) => (
          <Button key={preset.label} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(preset.permissions)}>
            {preset.label}
          </Button>
        ))}
      </div>
      {PERMISSION_GROUPS.map((group) => {
        const keys = group.permissions.map((p) => p.key as Permission);
        const all = keys.every((k) => value.has(k));
        return (
          <fieldset key={group.label} className="space-y-2 rounded-md border border-border p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
              {group.label}
              <button
                type="button"
                className="text-xs font-normal text-primary hover:underline"
                onClick={() => {
                  const next = new Set(value);
                  keys.forEach((k) => (all ? !locked.includes(k) && next.delete(k) : next.add(k)));
                  onChange(next);
                }}
              >
                {all ? "desmarcar todas" : "marcar todas"}
              </button>
            </legend>
            {group.permissions.map((p) => {
              const id = `perm-${p.key}`;
              const isLocked = locked.includes(p.key);
              return (
                <div key={p.key} className="flex items-start gap-2">
                  <Checkbox id={id} checked={value.has(p.key)} disabled={isLocked} onCheckedChange={(c) => toggle(p.key, c === true)} className="mt-0.5" />
                  <label htmlFor={id} className="cursor-pointer text-sm leading-tight">
                    {p.label}
                    <span className="block text-xs text-muted-foreground">
                      {p.description}
                      {isLocked && " Você não pode tirar esta permissão de si mesmo."}
                    </span>
                  </label>
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
