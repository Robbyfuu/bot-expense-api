import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
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

    for (const angle of rotations) {
      try {
        this.logger.debug(
          `Attempting to decode PDF417 with rotation ${angle}°...`,
        );

        // Preprocess image with sharp
        const pipeline = sharp(imageBuffer);

        if (angle !== 0) {
          pipeline.rotate(angle);
        }

        const { data, info } = await pipeline
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const luminanceSource = new RGBLuminanceSource(
          new Uint8ClampedArray(data.buffer),
          info.width,
          info.height,
        );

        const binaryBitmap = new BinaryBitmap(
          new HybridBinarizer(luminanceSource),
        );
        const reader = new MultiFormatReader();
        reader.setHints(this.hints);

        const result = reader.decode(binaryBitmap);
        const text = result.getText();

        if (text) {
          this.logger.log(`PDF417 decoded successfully at ${angle}°`);
          return this.parseTed(text);
        }
      } catch (e) {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
        const error = e as any;
        if (
          error?.name === 'NotFoundException' ||
          error?.name === 'ChecksumException' ||
          error?.name === 'FormatException'
        ) {
          this.logger.debug(`No PDF417 found at ${angle}°`);
        } else {
          this.logger.error(`Error decoding PDF417 at ${angle}°`, error);
        }
        /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      }
    }

    this.logger.debug('Failed to decode PDF417 in all attempts');
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
