import { describe, expect, it } from 'vitest';
import { transferableBuffer } from './pdf-protocol';
describe('worker output transfer', () => {
  it('transfers a complete owned buffer without copying', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(transferableBuffer(bytes)).toBe(bytes.buffer);
  });
  it('copies a sliced view exactly, without including adjacent bytes', () => {
    const bytes = new Uint8Array([9, 1, 2, 3, 9]);
    const result = transferableBuffer(bytes.subarray(1, 4));
    expect(result).not.toBe(bytes.buffer);
    expect([...new Uint8Array(result)]).toEqual([1, 2, 3]);
  });
});
