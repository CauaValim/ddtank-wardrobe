import { useState } from "react";
import { X, FileText, Sword, Store, Layers } from "lucide-react";
import { getTypeName } from "@/lib/itemTypes";
import { cn } from "@/lib/utils";
import type { GameItem } from "@/types/item";

type Tab = "info" | "atributos" | "renovacao" | "conjunto";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "info", label: "Info", icon: FileText },
  { id: "atributos", label: "Atributos", icon: Sword },
  { id: "renovacao", label: "Renovação", icon: Store },
  { id: "conjunto", label: "Conjunto", icon: Layers },
];

interface FugurasDetailModalProps {
  item: GameItem | null;
  imageUrl?: string;
  open: boolean;
  onClose: () => void;
  canViewId?: boolean;
}

export function FugurasDetailModal({
  item,
  imageUrl,
  open,
  onClose,
  canViewId = true,
}: FugurasDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("info");

  if (!open || !item) return null;

  const typeName = getTypeName(
    item.attributes.type != null ? Number(item.attributes.type) : null
  );

  const desc = item.attributes.desc?.trim() || "Descrição não disponível no jogo.";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fuguras-modal-title"
    >
      <div
        className="bg-card w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-border relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 dark:bg-white/10 dark:hover:bg-white/20 rounded-full transition cursor-pointer z-10 text-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="h-40 bg-muted flex items-center justify-center p-6 relative border-b border-border shrink-0">
          <img
            className="h-full object-contain drop-shadow-2xl hover:scale-110 transition-transform duration-500"
            src={imageUrl || "/placeholder.svg"}
            alt={item.name}
          />
        </div>

        <div className="p-6 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            {canViewId && (
              <span className="text-[10px] font-mono bg-primary/10 text-primary px-2.5 py-1 rounded font-bold border border-primary/20">
                #{item.id}
              </span>
            )}
            <span className="text-[10px] font-bold text-muted-foreground uppercase bg-muted px-2.5 py-1 rounded border border-border">
              {typeName}
            </span>
          </div>

          <h2
            id="fuguras-modal-title"
            className="text-xl font-black text-card-foreground mb-3 leading-tight truncate"
            title={item.name}
          >
            {item.name}
          </h2>

          <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1 shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="bg-muted/50 rounded-2xl p-4 border border-border overflow-y-auto custom-scrollbar flex-1 relative min-h-[150px]">
            {activeTab === "info" && (
              <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap font-medium">
                {desc}
              </p>
            )}
            {activeTab === "atributos" && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Ataque", value: item.attributes.attack },
                  { label: "Defesa", value: item.attributes.defence },
                  { label: "Agilidade", value: item.attributes.agility },
                  { label: "Sorte", value: item.attributes.luck },
                  { label: "EXP", value: item.attributes.attribute2 },
                ]
                  .filter((s) => s.value != null)
                  .map((s) => (
                    <div
                      key={s.label}
                      className="rounded-md bg-muted px-2 py-1.5"
                    >
                      <span className="text-[10px] text-muted-foreground">{s.label}</span>
                      <p className="text-xs font-medium text-card-foreground">{s.value}</p>
                    </div>
                  ))}
                {!item.attributes.attack &&
                  !item.attributes.defence &&
                  !item.attributes.agility &&
                  !item.attributes.luck &&
                  !item.attributes.attribute2 && (
                    <p className="col-span-2 text-sm text-muted-foreground">
                      Atributos não disponíveis.
                    </p>
                  )}
              </div>
            )}
            {activeTab === "renovacao" && (
              <p className="text-sm text-muted-foreground">
                Informações de renovação não disponíveis.
              </p>
            )}
            {activeTab === "conjunto" && (
              <p className="text-sm text-muted-foreground">
                Informações de conjunto não disponíveis.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
