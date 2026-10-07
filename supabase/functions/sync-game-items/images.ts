// Caminhos das imagens dos itens no servidor de recursos do jogo e correção dos PNG ofuscados.

export const RES_HOSTS = ["http://ddt-a.akamaihd.net", "http://res234.ddt.tr.elexddt.com"];

const SEXED: Record<number, string> = { 1: "head", 2: "glass", 3: "hair", 4: "eff", 5: "cloth", 6: "face", 13: "suits" };
const UNSEXED: Record<number, string> = { 8: "armlet", 9: "ring", 14: "necklace", 15: "wing", 17: "offhand" };
const PET: Record<number, string> = { 50: "arm", 51: "hat", 52: "cloth" };

export function imageCandidates(type: number, sex: number, rawPic: string): string[] {
  // Algumas pastas vêm com barra invertida na API (ex.: runas "rune1\1").
  const pic = rawPic.replace(/\\/g, "/");
  const paths: string[] = [];
  if (SEXED[type]) {
    const order = sex === 2 ? ["f", "m"] : ["m", "f"];
    order.forEach((s) => paths.push(`image/equip/${s}/${SEXED[type]}/${pic}/icon_1.png`));
  }
  if (UNSEXED[type]) paths.push(`image/equip/${UNSEXED[type]}/${pic}/icon.png`);
  if (type === 7 || type === 27) paths.push(`image/arm/${pic}/00.png`);
  if (PET[type]) paths.push(`image/petequip/${PET[type]}/${pic}/icon.png`);
  if (type === 16) paths.push(`image/specialprop/chatBall/${pic.toLowerCase()}/icon.png`);
  if (type === 74) paths.push(`image/rune/${pic}.png`); // runas
  if (type === 18 || type === 66) paths.push(`image/cardbox/${pic}/icon.png`); // baús de carta
  if (type === 12) paths.push(`image/task/${pic}/icon.png`); // materiais
  if (type === 25) paths.push(`image/gift/${pic}/icon.png`); // presentes
  if (type === 26) paths.push(`image/card/${pic}/icon.jpg`); // cartas (JPG)
  if (type === 32 || type === 87) paths.push(`image/farm/Crops/${pic}/seed.png`, `image/farm/Crops/${pic}/icon.png`); // sementes
  paths.push(`image/unfrightprop/${pic}/icon.png`, `image/prop/${pic}/icon.png`);
  return RES_HOSTS.flatMap((h) => paths.map((p) => `${h}/${p}`));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Alguns PNG do jogo vêm ofuscados: um prefixo antes da assinatura PNG e o primeiro byte
 * da largura no IHDR trocado por 0xFF. O navegador não abre esses arquivos, então
 * removemos o prefixo, desfazemos a troca e recalculamos o CRC do IHDR.
 * Qualquer outro arquivo (PNG normal, JPG) volta sem alteração.
 */
export function repairImage(input: Uint8Array): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  let start = -1;
  for (let i = 0; i <= Math.min(input.length - sig.length, 64); i++) {
    if (sig.every((b, j) => input[i + j] === b)) { start = i; break; }
  }
  if (start < 0) return input;
  const out = input.slice(start);
  const isIhdr = out[12] === 0x49 && out[13] === 0x48 && out[14] === 0x44 && out[15] === 0x52;
  if (isIhdr && out[16] === 0xff) {
    out[16] = 0;
    const crc = crc32(out.subarray(12, 29));
    out[29] = crc >>> 24; out[30] = (crc >>> 16) & 0xff; out[31] = (crc >>> 8) & 0xff; out[32] = crc & 0xff;
  }
  return out;
}

export const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
