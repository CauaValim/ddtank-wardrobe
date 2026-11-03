import { describe, expect, it } from "vitest";
import { parseImageMappings, unsafeUrlReason } from "../../supabase/functions/_shared/safeFetch.ts";

describe("importar imagens: bloqueio de SSRF", () => {
  it("aceita endereços públicos http e https", () => {
    expect(unsafeUrlReason("https://cdn.exemplo.com/a.png")).toBeNull();
    expect(unsafeUrlReason("http://res0.ddt.br.337.com/image/a.png")).toBeNull();
    expect(unsafeUrlReason("https://8.8.8.8/a.png")).toBeNull();
  });

  it("recusa endereços internos, metadados de nuvem e esquemas estranhos", () => {
    for (const url of [
      "http://localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/a.png",
      "http://192.168.1.1/a.png",
      "http://172.16.0.1/a.png",
      "http://[::1]/a.png",
      "http://2130706433/a.png",
      "http://0x7f000001/a.png",
      "http://db.internal/a.png",
      "http://servidor/a.png",
      "file:///etc/passwd",
      "ftp://exemplo.com/a.png",
      "https://user:senha@exemplo.com/a.png",
      "https://exemplo.com:5432/a.png",
      "não é url",
    ]) expect(unsafeUrlReason(url), url).not.toBeNull();
  });

  it("valida a lista recebida do painel", () => {
    expect(parseImageMappings({ mappings: [{ id: 7, url: " https://a.com/x.png " }] })).toEqual([{ id: 7, url: "https://a.com/x.png" }]);
    expect(() => parseImageMappings({ mappings: [] })).toThrow();
    expect(() => parseImageMappings({ mappings: [{ id: "x", url: "https://a.com" }] })).toThrow();
    expect(() => parseImageMappings({ mappings: [{ id: 1, url: 5 }] })).toThrow();
    expect(() => parseImageMappings({})).toThrow();
  });
});
