import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GameRow = Record<string, string>;
export type GameFile =
  | "ClothPropertyTemplateInfo"
  | "ClothGroupTemplateInfo"
  | "MountDrawTemplate"
  | "CardTemplateInfo"
  | "CardBuffList"
  | "NewTitleInfo"
  | "PetTemplateInfo"
  | "PetSkillInfo"
  | "RuneTemplateList"
  | "MagicStoneTemplate";
  | "TemplateAllList";

/** Loads official game data files through the game-data edge function (cached 1h client-side). */
export function useGameData(files: GameFile[], enabled = true) {
  return useQuery({
    queryKey: ["game-data", ...files],
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("game-data", { body: { files } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as Record<GameFile, GameRow[]>;
    },
  });
}

export const n = (v?: string) => (v == null || v === "" || isNaN(Number(v)) ? 0 : Number(v));
