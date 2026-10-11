/**
 * Hash perceptual (dHash 9×8 → 64 bits) para comparar a imagem de um item no documento com a
 * imagem do item no painel, mesmo com tamanho ou compressão diferentes. Só funciona no navegador.
 */
export async function browserImageHash(source: Uint8Array | string): Promise<bigint | null> {
  const blob =
    typeof source === "string" ? await (await fetch(source)).blob() : new Blob([source as BlobPart]);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // Fundo branco: imagens com transparência comparam igual às sem.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 9, 8);
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  bitmap.close();
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gray = (x: number, y: number) => {
    const i = (y * 9 + x) * 4;
    return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  };
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) hash = (hash << 1n) | (gray(x, y) > gray(x + 1, y) ? 1n : 0n);
  }
  return hash;
}
