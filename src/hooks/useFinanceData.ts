import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseSales, type Sale } from "@/lib/finance/sales";

/** Vendas da Venda de Munição (planilha do financeiro), pela edge function finance-data. */
export function useFinanceData() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const load = async (refresh: boolean) => {
    const { data, error } = await supabase.functions.invoke("finance-data", { body: { refresh } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return { sales: parseSales(String(data.csv ?? "")), fetchedAt: String(data.fetchedAt ?? "") } as { sales: Sale[]; fetchedAt: string };
  };
  const query = useQuery({
    queryKey: ["finance-data"],
    staleTime: 10 * 60 * 1000,
    queryFn: () => load(false),
  });
  /** Lê a planilha de novo agora, sem esperar os 10 minutos do cache. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      client.setQueryData(["finance-data"], await load(true));
    } finally {
      setRefreshing(false);
    }
  }, [client]);
  return { ...query, refresh, refreshing };
}
