/**
 * thumbキャッシュ生成の縮小処理(Phase1_Spec WU-5作業4。P0-8 G1bで実証)。
 * Blob→createImageBitmap→canvas縮小→Blob。<img>を経由しないためtaintしない。
 * 出力: 透過を持ちうる形式(png/gif/webp)はPNG、それ以外はJPEG品質0.8。
 */

const TRANSPARENT_CAPABLE = new Set(['image/png', 'image/gif', 'image/webp']);

/** 縮小thumbの出力MIME(V1 §5.2/Phase1_Spec WU-5作業4) */
export function thumbOutputType(sourceMediaType: string): 'image/png' | 'image/jpeg' {
  return TRANSPARENT_CAPABLE.has(sourceMediaType) ? 'image/png' : 'image/jpeg';
}

export interface DownscaleResult {
  readonly blob: Blob | null;
  /** 元画像のintrinsic幅(取得できた場合)。width計画の判定に使う */
  readonly sourceWidth?: number;
  readonly note?: string;
}

export async function downscaleImageBlob(
  doc: Document,
  source: Blob,
  maxWidth: number,
  outputType: 'image/png' | 'image/jpeg',
): Promise<DownscaleResult> {
  try {
    const bitmap = await createImageBitmap(source);
    const sourceWidth = bitmap.width;
    const canvas = doc.createElement('canvas');
    const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: null, sourceWidth, note: '2d contextが取得できない' };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob((b) => resolve(b), outputType, outputType === 'image/jpeg' ? 0.8 : undefined);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('toBlob failed'));
      }
    });
    return blob ? { blob, sourceWidth } : { blob: null, sourceWidth, note: 'toBlobがnullを返した' };
  } catch (error) {
    return {
      blob: null,
      note: `decode/縮小失敗: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`,
    };
  }
}

/** 互換wrapper(WU-0移設時のsignature。既存テスト用) */
export async function downscaleToJpegBlob(
  doc: Document,
  source: Blob,
  maxWidth = 320,
): Promise<{ blob: Blob | null; note?: string }> {
  const result = await downscaleImageBlob(doc, source, maxWidth, 'image/jpeg');
  return result.note !== undefined ? { blob: result.blob, note: result.note } : { blob: result.blob };
}
