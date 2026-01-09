import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  GlobalHistogramBinarizer,
  RGBLuminanceSource,
  PDF417Reader,
} from '@zxing/library';
import { XMLParser } from 'fast-xml-parser';

export interface DteData {
  rutEmisor: string;
  rutReceptor: string;
  fecha: string; // YYYY-MM-DD
  montoTotal: number;
  folio: string;
  tipoDTE: number; // 33: Factura, 39: Boleta, etc.
}

@Injectable()
export class DteService {
  private readonly logger = new Logger(DteService.name);
  private readonly hints = new Map();

  constructor() {
    this.hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417]);
    this.hints.set(DecodeHintType.TRY_HARDER, true);
  }

  async decode(imageBuffer: Buffer): Promise<DteData | null> {
    const rotations = [0, 90, 270];
    const binarizers = ['hybrid', 'global'] as const;

    // Get original metadata
    const metadata = await sharp(imageBuffer).metadata();
    this.logger.debug(`Original image: ${metadata.width}x${metadata.height}`);

    // Try multiple preprocessing strategies
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const preprocessingStrategies: Array<{
      name: string;
      fn: (buffer: Buffer) => Promise<Buffer>;
    }> = [
      { name: 'sharpen+normalize', fn: this.preprocessSharpen.bind(this) },
      { name: 'upscale+sharpen', fn: this.preprocessUpscale.bind(this) },
      { name: 'basic', fn: this.preprocessBasic.bind(this) },
    ];
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */

    for (const strategy of preprocessingStrategies) {
      this.logger.debug(`Trying preprocessing strategy: ${strategy.name}`);

      let preprocessedBuffer: Buffer;
      try {
        preprocessedBuffer = await strategy.fn(imageBuffer);
        const newMeta = await sharp(preprocessedBuffer).metadata();
        this.logger.debug(
          `Preprocessed (${strategy.name}): ${newMeta.width}x${newMeta.height}`,
        );
      } catch (e) {
        this.logger.error(`Error in preprocessing ${strategy.name}`, e);
        continue;
      }

      for (const angle of rotations) {
        for (const binarizerType of binarizers) {
          try {
            const result = await this.tryDecode(
              preprocessedBuffer,
              angle,
              binarizerType,
            );
            if (result) {
              this.logger.log(
                `PDF417 decoded! Strategy=${strategy.name}, Rotation=${angle}°, Binarizer=${binarizerType}`,
              );
              return result;
            }
          } catch {
            // Continue to next attempt
          }
        }
      }
    }

    this.logger.debug('Failed to decode PDF417 in all attempts');
    return null;
  }

  private async preprocessBasic(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).grayscale().normalize().toBuffer();
  }

  private async preprocessSharpen(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .sharpen({ sigma: 1.5 })
      .normalize()
      .toBuffer();
  }

  private async preprocessUpscale(buffer: Buffer): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const width = meta.width || 800;

    // If image is small, upscale it
    const targetWidth = width < 1000 ? 1500 : width;

    return sharp(buffer)
      .resize(targetWidth, null, { fit: 'inside' })
      .grayscale()
      .sharpen({ sigma: 2 })
      .normalize()
      .linear(1.2, 0) // Increase contrast
      .toBuffer();
  }

  private async tryDecode(
    buffer: Buffer,
    angle: number,
    binarizerType: 'hybrid' | 'global',
  ): Promise<DteData | null> {
    const pipeline = sharp(buffer);

    if (angle !== 0) {
      pipeline.rotate(angle);
    }

    // Convert to RGB (not RGBA, not grayscale) - zxing expects RGB
    const { data, info } = await pipeline
      .removeAlpha() // Ensure no alpha channel
      .toColourspace('srgb') // Ensure RGB colorspace
      .raw()
      .toBuffer({ resolveWithObject: true });

    // RGBLuminanceSource expects RGBA data, so we need to convert RGB to RGBA
    const rgbaData = new Uint8ClampedArray(info.width * info.height * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgbaData[j] = data[i]; // R
      rgbaData[j + 1] = data[i + 1]; // G
      rgbaData[j + 2] = data[i + 2]; // B
      rgbaData[j + 3] = 255; // A (fully opaque)
    }

    const luminanceSource = new RGBLuminanceSource(
      rgbaData,
      info.width,
      info.height,
    );

    const binarizer =
      binarizerType === 'hybrid'
        ? new HybridBinarizer(luminanceSource)
        : new GlobalHistogramBinarizer(luminanceSource);

    const binaryBitmap = new BinaryBitmap(binarizer);

    // Use PDF417Reader directly for better specialization
    const reader = new PDF417Reader();

    try {
      const result = reader.decode(binaryBitmap, this.hints);
      const text = result.getText();

      if (text) {
        return this.parseTed(text);
      }
    } catch (e) {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const error = e;
      if (
        error?.name !== 'NotFoundException' &&
        error?.name !== 'ChecksumException' &&
        error?.name !== 'FormatException'
      ) {
        this.logger.debug(`Decode attempt failed: ${error?.message || error}`);
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    }

    return null;
  }

  private parseTed(xmlText: string): DteData | null {
    try {
      // PDF417 usually contains the full XML <TED>...</TED> but sometimes with surrounding content
      // We explicitly look for <TED
      const startIndex = xmlText.indexOf('<TED');
      if (startIndex === -1) return null;

      const cleanedXml = xmlText.substring(startIndex);

      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsed = parser.parse(cleanedXml);

      // Structure usually: <TED> <DD> <RE>RUT</RE> ... </DD> ... </TED>
      const dd = parsed?.TED?.DD;
      if (!dd) return null;

      return {
        rutEmisor: dd.RE,
        rutReceptor: dd?.RR || '',
        fecha: dd.FE, // YYYY-MM-DD
        montoTotal: Number(dd.MNT),
        folio: String(dd.F),
        tipoDTE: Number(dd.TD),
      } as DteData;
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    } catch (e) {
      this.logger.error('Error parsing TED XML', e);
      return null;
    }
  }
}
