/**
 * thumbキャッシュ生成の縮小処理(Phase1_Spec WU-5作業4。P0-8 G1bで実証)。
 * Blob→createImageBitmap→canvas縮小→Blob。<img>を経由しないためtaintしない。
 * Phase 0の src/gallery/probes/original-probe.ts から移設(WU-0)。
 * 出力形式(JPEG/PNG)と幅bucket(320/640)の出し分けはWU-5で実装する。
 */

export async function downscaleToJpegBlob(
  doc: Document,
  source: Blob,
  maxWidth = 320,
): Promise<{ blob: Blob | null; note?: string }> {
  try {
    const bitmap = await createImageBitmap(source);
    const canvas = doc.createElement('canvas');
    const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: null, note: '2d contextが取得できない' };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('toBlob failed'));
      }
    });
    return blob ? { blob } : { blob: null, note: 'toBlobがnullを返した' };
  } catch (error) {
    return {
      blob: null,
      note: `decode/縮小失敗: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`,
    };
  }
}
