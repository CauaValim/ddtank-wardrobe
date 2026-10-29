import { describe, expect, it } from "vitest";
import { activityEntries, mergeEntries, questEntries } from "../../supabase/functions/sync-game-items/events.ts";

const activity = (name: string, type: string, child: string, begin: string, end: string, body: string) => `<ActiveInfo>
  <Activity activityId="id-${name}" activityName="${name}" activityType="${type}" activityChildType="${child}" beginTime="${begin} 00:00:00" endTime="${end} 23:59:59" />
  <ActiveGiftBag><ActiveCondition>${body}</ActiveCondition></ActiveGiftBag>
</ActiveInfo>`;
const reward = (id: number, rewardType = 0, gift = "g1", count = 1) => `<Reward giftId="${gift}" templateId="${id}" count="${count}" rewardType="${rewardType}" remain1="Item ${id}" />`;
const cond = (gift: string, index: number, value: number) => `<Condition giftbagId="${gift}" conditionIndex="${index}" conditionValue="${value}" />`;

describe("registro de entrada nos eventos", () => {
  it("grava os prêmios das atividades em andamento com a data de início e o custo", () => {
    const xml = [
      activity("Recarga", "0", "6", "2026-10-26", "2026-11-01", cond("g1", 0, 5000) + cond("g1", 1, 7999) + reward(11804) + reward(-200)),
      activity("Compota - A", "2", "0", "2026-10-19", "2026-11-22", reward(11804, 0, "g1", 3) + reward(6488, 1)),
      activity("Venda", "19", "5", "2026-10-26", "2026-11-01", cond("g1", 2, -8) + cond("g1", 3, 120000) + reward(1122190)),
      activity("Antiga", "1", "1", "2026-10-01", "2026-10-07", reward(1)),
      activity("Permanente", "1", "1", "2025-01-01", "2050-12-31", reward(2)),
      activity("巴西 test", "5", "1", "2026-10-26", "2026-11-01", reward(3)),
    ].join("\n");
    expect(activityEntries(xml, "2026-10-28", new Map([[11804, "Compota de morango"]]))).toEqual([
      { item_id: 11804, entry_date: "2026-10-26", event_name: "Recarga", event_kind: "Recarga", source_key: "act:id-Recarga:2026-10-26 00:00:00", cost: "5.000 cupons" },
      // Na troca, a Compota é o item entregue: vira o custo, e só o item recebido entra.
      { item_id: 6488, entry_date: "2026-10-19", event_name: "Compota - A", event_kind: "Troca", source_key: "act:id-Compota - A:2026-10-19 00:00:00", cost: "3x Compota de morango" },
      { item_id: 1122190, entry_date: "2026-10-26", event_name: "Venda", event_kind: "Venda de Munição", source_key: "act:id-Venda:2026-10-26 00:00:00", cost: "120.000 L.Cupons por 1 unidade" },
    ]);
  });

  it("mostra o preço do pacote e quantas unidades vêm nele na Venda de Munição", () => {
    const xml = activity("Venda", "19", "5", "2026-10-26", "2026-11-01", cond("g1", 2, -8) + cond("g1", 3, 15000) + reward(12262, 0, "g1", 100));
    expect(activityEntries(xml, "2026-10-28")[0].cost).toBe("15.000 L.Cupons por 100 unidades");
  });

  it("junta os custos quando o item sai em mais de um andar do mesmo evento", () => {
    const xml = activity("Consumo", "1", "1", "2026-10-26", "2026-11-01", cond("a", 0, 10000) + cond("b", 0, 50000) + reward(7, 0, "a") + reward(7, 0, "b"));
    expect(mergeEntries(activityEntries(xml, "2026-10-28")).map((r) => r.cost)).toEqual(["10.000 cupons / 50.000 cupons"]);
  });

  it("grava os prêmios das missões de evento em andamento", () => {
    const xml = `
      <Item ID="10" QuestID="3" Title="Abóboras Mágicas" StartDate="2026-10-28T00:00:00" EndDate="2026-11-01T23:59:59"><Item_Good RewardItemID="11578" RewardItemCount1="4" /></Item>
      <Item ID="11" QuestID="3" Title="Halloween G" StartDate="2021-10-20T00:00:00" EndDate="2021-10-26T23:59:59"><Item_Good RewardItemID="11578" /></Item>
      <Item ID="12" QuestID="0" Title="Cartão Elite" StartDate="2011-01-01T00:00:00" EndDate="2050-01-01T23:59:59"><Item_Good RewardItemID="5" /></Item>`;
    expect(questEntries(xml, "2026-10-28")).toEqual([
      { item_id: 11578, entry_date: "2026-10-28", event_name: "Abóboras Mágicas", event_kind: "Missão", source_key: "quest:10:2026-10-28T00:00:00", cost: null },
    ]);
  });
});
