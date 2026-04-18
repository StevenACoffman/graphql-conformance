'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  STREAM_PROTOCOL,
  createHarnessOutputAccumulator,
  normalizeStreamEvents,
  parseHarnessOutput,
} = require('./protocol');

describe('parseHarnessOutput', () => {
  it('parses legacy single-result JSON', () => {
    assert.deepStrictEqual(
      parseHarnessOutput('{"data":{"x":1}}'),
      { result: { data: { x: 1 } } },
    );
  });

  it('normalizes deferred protocol events into a final result', () => {
    const stdout = [
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'initial',
        data: { hero: { name: 'str', friends: [] } },
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'patch',
        path: ['hero'],
        data: { friends: [{ name: 'str' }, { name: 'str' }] },
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'complete',
      }),
    ].join('\n');

    assert.deepStrictEqual(parseHarnessOutput(stdout), {
      result: {
        data: {
          hero: {
            name: 'str',
            friends: [{ name: 'str' }, { name: 'str' }],
          },
        },
      },
    });
  });

  it('normalizes root-level deferred patches', () => {
    const stdout = [
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'initial',
        data: {},
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'patch',
        path: [],
        data: { name: 'str' },
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'complete',
      }),
    ].join('\n');

    assert.deepStrictEqual(parseHarnessOutput(stdout), {
      result: { data: { name: 'str' } },
    });
  });

  it('normalizes streamed list items', () => {
    const stdout = [
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'initial',
        data: { feed: ['a'] },
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'patch',
        path: ['feed'],
        items: ['b', 'c'],
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'complete',
      }),
    ].join('\n');

    assert.deepStrictEqual(parseHarnessOutput(stdout), {
      result: { data: { feed: ['a', 'b', 'c'] } },
    });
  });

  it('rejects invalid patch paths', () => {
    const stdout = [
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'initial',
        data: {},
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'patch',
        path: ['hero', 'name'],
        data: { name: 'str' },
      }),
      JSON.stringify({
        protocol: STREAM_PROTOCOL,
        kind: 'complete',
      }),
    ].join('\n');

    assert.deepStrictEqual(parseHarnessOutput(stdout), {
      error: 'invalid protocol output',
    });
  });
});

describe('createHarnessOutputAccumulator', () => {
  it('handles protocol lines split across chunks', () => {
    const accumulator = createHarnessOutputAccumulator();
    const line1 = JSON.stringify({
      protocol: STREAM_PROTOCOL,
      kind: 'initial',
      data: { hero: {} },
    });
    const line2 = JSON.stringify({
      protocol: STREAM_PROTOCOL,
      kind: 'patch',
      path: ['hero'],
      data: { name: 'str' },
    });
    const line3 = JSON.stringify({
      protocol: STREAM_PROTOCOL,
      kind: 'complete',
    });

    accumulator.push(`${line1}\n${line2.slice(0, 12)}`);
    accumulator.push(`${line2.slice(12)}\n${line3}\n`);

    assert.deepStrictEqual(accumulator.finish(), {
      result: { data: { hero: { name: 'str' } } },
    });
  });
});

describe('normalizeStreamEvents', () => {
  it('requires an initial and complete event', () => {
    assert.throws(() => normalizeStreamEvents([
      { protocol: STREAM_PROTOCOL, kind: 'initial', data: {} },
    ]));
  });
});
