import { describe, expect, it } from "vitest";
import { activityEntries, questEntries } from "../../supabase/functions/sync-game-items/events.ts";

const activity = (name: string, type: string, child: string, begin: string, end: string, rewards: string) => `<ActiveInfo>
  <Activity activityId="id-${name}" activityName="${name}" activityType="${type}" activityChildType="${child}" beginTime="${begin} 00:00:00" endTime="${end} 23:59:59" />
  <ActiveGiftBag><ActiveReward>${rewards}</ActiveReward></ActiveGiftBag>
</ActiveInfo>`;
const reward = (id: number, rewardType = 0) => `<Reward templateId="${id}" count="1" rewardType="${rewardType}" />`;

describe("registro de entrada nos eventos", () => {
  it("grava os prêmios das atividades em andamento com a data de início", () => {
    const xml = [
      activity("Recarga", "0", "6", "2026-10-26", "2026-11-01", reward(11804) + reward(-200)),
      activity("Compota - A", "2", "0", "2026-10-19", "2026-11-22", reward(11804, 0) + reward(6488, 1)),
      activity("Antiga", "1", "1", "2026-10-01", "2026-10-07", reward(1)),
      activity("Permanente", "1", "1", "2025-01-01", "2050-12-31", reward(2)),
      activity("巴西 test", "5", "1", "2026-10-26", "2026-11-01", reward(3)),
    ].join("\n");
    expect(activityEntries(xml, "2026-10-28")).toEqual([
      { item_id: 11804, entry_date: "2026-10-26", event_name: "Recarga", event_kind: "Recarga", source_key: "act:id-Recarga:2026-10-26 00:00:00" },
      // Na troca, a Compota é o item entregue: só o item recebido entra.
      { item_id: 6488, entry_date: "2026-10-19", event_name: "Compota - A", event_kind: "Troca", source_key: "act:id-Compota - A:2026-10-19 00:00:00" },
    ]);
  });

  it("grava os prêmios das missões de evento em andamento", () => {
    const xml = `
      <Item ID="10" QuestID="3" Title="Abóboras Mágicas" StartDate="2026-10-28T00:00:00" EndDate="2026-11-01T23:59:59"><Item_Good RewardItemID="11578" RewardItemCount1="4" /></Item>
      <Item ID="11" QuestID="3" Title="Halloween G" StartDate="2021-10-20T00:00:00" EndDate="2021-10-26T23:59:59"><Item_Good RewardItemID="11578" /></Item>
      <Item ID="12" QuestID="0" Title="Cartão Elite" StartDate="2011-01-01T00:00:00" EndDate="2050-01-01T23:59:59"><Item_Good RewardItemID="5" /></Item>`;
    expect(questEntries(xml, "2026-10-28")).toEqual([
      { item_id: 11578, entry_date: "2026-10-28", event_name: "Abóboras Mágicas", event_kind: "Missão", source_key: "quest:10:2026-10-28T00:00:00" },
    ]);
  });
});
