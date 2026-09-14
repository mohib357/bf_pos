import { PrismaService } from '../../prisma/prisma.service';

/**
 * Generates sequential invoice/reference numbers
 * Format: PREFIX-SEPARATOR-PADDEDNUMBER
 * Example: INV-00001, PO-00001, PAY-00001
 */
export async function generateSequenceNumber(
  prisma: PrismaService,
  module: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const sequence = await (tx as any).numberingSequence.findUnique({
      where: { module },
    });

    if (!sequence) {
      throw new Error(`Numbering sequence not found for module: ${module}`);
    }

    const nextNo = sequence.currentNo + 1;
    const paddedNo = String(nextNo).padStart(sequence.padding, '0');
    const number = `${sequence.prefix}${sequence.separator}${paddedNo}${sequence.suffix || ''}`;

    await (tx as any).numberingSequence.update({
      where: { module },
      data: { currentNo: nextNo },
    });

    return number;
  });
}
