import { useEffect, useState } from "react";
import { Package, Copy, Check, PackageOpen, FileText, Swords, RefreshCw, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getTypeName } from "@/lib/itemTypes";
import type { GameItem } from "@/types/item";
import { hasParsableContents, isOpenablePackage } from "@/lib/packageDescParser";
import { accessoryExp, isSoldByQuantity, itemStats, renewalOffers } from "@/lib/itemDetail";
import { useGameData } from "@/hooks/useGameData";
import { MountStats, SuitInfo } from "@/components/ItemGameExtras";
import { useItemGameExtras } from "@/hooks/useItemGameExtras";
import type { ItemLookup } from "@/components/GameDataModal";

interface ItemDetailModalProps {
  item: GameItem | null;
  imageUrl?: string;
  open: boolean;
  onClose: () => void;
  canViewId?: boolean;
  realm?: "br" | "turco";
  onViewPackageContents?: (item: GameItem) => void;
  lookup?: ItemLookup;
}

/** Aba Renovação: preços da loja do jogo (só baixa a lista quando a aba é aberta). */
function RenewalTab({ itemId, realm }: { itemId: string; realm: "br" | "turco" }) {
  const { data, isLoading, error } = useGameData(["ShopItemList"], realm === "br");
  if (realm !== "br") return <p className="text-xs text-muted-foreground">A loja do jogo só está disponível para o servidor BR.</p>;
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando a loja do jogo...</p>;
  if (error) return <p className="text-xs text-destructive">Não foi possível ler a loja do jogo.</p>;
  const offers = renewalOffers(data?.ShopItemList, itemId);
  if (offers.length === 0 && isSoldByQuantity(data?.ShopItemList, itemId)) {
    return <p className="rounded-md bg-secondary px-2 py-4 text-center text-xs text-muted-foreground">Este item é permanente e não precisa de renovação.</p>;
  }
  if (offers.length === 0) return <p className="text-xs text-muted-foreground">Este item não está à venda na loja do jogo.</p>;
  return (
    <div className="space-y-2">
      {offers.map((o, i) => (
        <div key={i} className="space-y-1.5 rounded-md bg-secondary p-2">
          <p className="text-[10px] text-muted-foreground">
            Forma de pagamento: <span className="font-semibold text-card-foreground">{o.currency}</span>
            {o.bound && <span className="ml-1 font-semibold text-red-600 dark:text-red-400">· vinculado</span>}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {o.options.map((opt) => (
              <div key={opt.label} className="rounded border border-border bg-card px-1 py-1.5 text-center">
                <p className="text-sm font-bold text-card-foreground tabular-nums">{opt.price.toLocaleString("pt-BR")}</p>
                <p className={`text-[10px] uppercase ${opt.label === "Permanente" ? "font-semibold text-purple-600 dark:text-purple-400" : "text-muted-foreground"}`}>{opt.label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ItemDetailModal({
  item,
  imageUrl,
  open,
  onClose,
  canViewId = true,
  realm = "br",
  onViewPackageContents,
  lookup,
}: ItemDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [hasContents, setHasContents] = useState(false);
  const [tab, setTab] = useState("info");

  const itemId = item?.id;
  const extras = useItemGameExtras(item);

  useEffect(() => {
    setTab("info");
  }, [itemId]);

  useEffect(() => {
    if (!itemId || !open) {
      setHasContents(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("package_contents")
        .select("*", { count: "exact", head: true })
        .eq("realm", realm)
        .eq("package_id", Number(itemId));
      if (cancelled) return;
      setHasContents(!error && !!count && count > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, open, realm]);

  if (!item) return null;

  const copyId = async () => {
    await navigator.clipboard.writeText(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const typeName = getTypeName(item.attributes.type != null ? Number(item.attributes.type) : null);
  // Conteúdo do jogo (tabela) ou, só em baús, a lista lida da descrição.
  const showContentsButton = hasContents || (isOpenablePackage(item.attributes) && hasParsableContents(item.attributes.desc));
  const exp = accessoryExp(item);
  const stats = itemStats(item);
  if (exp) stats.push({ label: `EXP (+${exp.level})`, value: exp.exp.toLocaleString("pt-BR") });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto border-border bg-card p-4">
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-secondary">
            {imageUrl ? (
              <img src={imageUrl} alt={item.name} className="h-full w-full object-contain" />
            ) : (
              <Package className="h-8 w-8 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {canViewId && (
              <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">#{item.id}</span>
            )}
            <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{typeName}</span>
          </div>
          <h2 className="text-center text-sm font-bold text-card-foreground">{item.name}</h2>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList className="grid h-auto w-full grid-cols-4">
            <TabsTrigger value="info" className="gap-1 px-1 text-[11px]"><FileText className="h-3 w-3" /> Info</TabsTrigger>
            <TabsTrigger value="stats" className="gap-1 px-1 text-[11px]"><Swords className="h-3 w-3" /> Atributos</TabsTrigger>
            <TabsTrigger value="renewal" className="gap-1 px-1 text-[11px]"><RefreshCw className="h-3 w-3" /> Renovação</TabsTrigger>
            <TabsTrigger value="suit" className="gap-1 px-1 text-[11px]"><Layers className="h-3 w-3" /> Conjunto</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-2">
            {canViewId && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                <button
                  onClick={copyId}
                  className="flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
            {showContentsButton && onViewPackageContents && (
              <button
                onClick={() => onViewPackageContents(item)}
                className="mx-auto flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <PackageOpen className="h-3.5 w-3.5" />
                Ver Conteúdo
              </button>
            )}
            <div className="w-full rounded-md bg-secondary px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground">Descrição</span>
              <p className="text-xs text-card-foreground whitespace-pre-wrap">{item.attributes.desc?.trim() || "Descrição não disponível no jogo."}</p>
            </div>
            {exp && (
              <div className="w-full rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5">
                <span className="text-[10px] text-muted-foreground">EXP necessário para o nível +{exp.level}</span>
                <p className="text-sm font-bold text-primary tabular-nums">{exp.exp.toLocaleString("pt-BR")}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats">
            {extras.mount ? (
              <MountStats mount={extras.mount} />
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-md bg-secondary px-2 py-1">
                    <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    <p className="text-xs font-medium text-card-foreground">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="renewal">
            {tab === "renewal" && <RenewalTab itemId={item.id} realm={realm} />}
          </TabsContent>

          <TabsContent value="suit">
            {extras.loading ? (
              <p className="text-xs text-muted-foreground">Carregando conjuntos do jogo...</p>
            ) : extras.suit ? (
              <SuitInfo suit={extras.suit} lookup={lookup} />
            ) : (
              <p className="rounded-md bg-secondary px-2 py-4 text-center text-xs text-muted-foreground">Este item não pertence a nenhum conjunto.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
