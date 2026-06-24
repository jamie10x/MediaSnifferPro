import { describe, it, expect } from 'vitest';
import { encodeMessage, MessageDecoder, type NativeResponse } from '../protocol';

function frame(obj: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

describe('encodeMessage', () => {
  it('prefixes a 4-byte little-endian length', () => {
    const msg: NativeResponse = { type: 'PONG', requestId: 'r', version: '1' };
    const buf = encodeMessage(msg);
    const len = buf.readUInt32LE(0);
    expect(len).toBe(buf.length - 4);
    expect(JSON.parse(buf.subarray(4).toString())).toEqual(msg);
  });
});

describe('MessageDecoder', () => {
  it('decodes a single full frame', () => {
    const d = new MessageDecoder();
    const out = d.push(frame({ type: 'PING', requestId: 'a' }));
    expect(out).toEqual([{ type: 'PING', requestId: 'a' }]);
  });

  it('assembles a frame split across chunks', () => {
    const d = new MessageDecoder();
    const full = frame({ type: 'PING', requestId: 'b' });
    expect(d.push(full.subarray(0, 3))).toEqual([]); // header incomplete
    expect(d.push(full.subarray(3, 6))).toEqual([]); // body incomplete
    expect(d.push(full.subarray(6))).toEqual([{ type: 'PING', requestId: 'b' }]);
  });

  it('decodes multiple frames in one chunk', () => {
    const d = new MessageDecoder();
    const two = Buffer.concat([frame({ type: 'PING', requestId: '1' }), frame({ type: 'PING', requestId: '2' })]);
    const out = d.push(two);
    expect(out.map((m) => 'requestId' in m && m.requestId)).toEqual(['1', '2']);
  });

  it('throws on an oversized frame', () => {
    const d = new MessageDecoder();
    const head = Buffer.alloc(4);
    head.writeUInt32LE(5_000_000, 0); // > 1MB cap
    expect(() => d.push(head)).toThrow();
  });
});
