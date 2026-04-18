'use strict';

const STREAM_PROTOCOL = 'conformer-stream-v1';

function createHarnessOutputAccumulator() {
  let raw = '';
  let lineBuffer = '';
  let sawProtocol = false;
  let protocolError = null;
  const events = [];

  function consumeLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      if (sawProtocol) {
        protocolError = 'invalid JSON line in protocol stream';
      }
      return;
    }

    if (isProtocolEvent(parsed)) {
      sawProtocol = true;
      if (!protocolError) {
        events.push(parsed);
      }
      return;
    }

    if (sawProtocol) {
      protocolError = 'mixed protocol and non-protocol stdout';
    }
  }

  return {
    push(chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      raw += text;
      lineBuffer += text;

      let newlineIndex = lineBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        consumeLine(line);
        newlineIndex = lineBuffer.indexOf('\n');
      }
    },

    finish() {
      if (lineBuffer.length > 0) {
        consumeLine(lineBuffer);
        lineBuffer = '';
      }

      if (protocolError) {
        return { error: 'invalid protocol output' };
      }

      if (sawProtocol) {
        try {
          return { result: normalizeStreamEvents(events) };
        } catch {
          return { error: 'invalid protocol output' };
        }
      }

      try {
        return { result: JSON.parse(raw) };
      } catch {
        return { error: 'invalid JSON output' };
      }
    },
  };
}

function parseHarnessOutput(stdout) {
  const accumulator = createHarnessOutputAccumulator();
  accumulator.push(stdout);
  return accumulator.finish();
}

function isProtocolEvent(value) {
  return !!value
    && typeof value === 'object'
    && value.protocol === STREAM_PROTOCOL
    && typeof value.kind === 'string';
}

function normalizeStreamEvents(events) {
  if (events.length === 0) {
    throw new Error('no protocol events');
  }

  const result = {};
  let sawInitial = false;
  let sawComplete = false;

  for (const event of events) {
    if (!isProtocolEvent(event)) {
      throw new Error('invalid event');
    }

    switch (event.kind) {
      case 'initial':
        if (sawInitial || sawComplete) {
          throw new Error('invalid initial event ordering');
        }
        sawInitial = true;
        if (Object.prototype.hasOwnProperty.call(event, 'data')) {
          result.data = event.data;
        }
        mergeErrors(result, event.errors);
        mergeExtensions(result, event.extensions);
        break;

      case 'patch':
        if (!sawInitial || sawComplete) {
          throw new Error('invalid patch event ordering');
        }
        if (Object.prototype.hasOwnProperty.call(event, 'data')
          && Object.prototype.hasOwnProperty.call(event, 'items')) {
          throw new Error('patch cannot include both data and items');
        }
        if (Object.prototype.hasOwnProperty.call(event, 'data')) {
          result.data = applyDataPatch(result.data, event.path, event.data);
        }
        if (Object.prototype.hasOwnProperty.call(event, 'items')) {
          result.data = applyItemsPatch(result.data, event.path, event.items);
        }
        mergeErrors(result, event.errors);
        mergeExtensions(result, event.extensions);
        break;

      case 'complete':
        if (!sawInitial || sawComplete) {
          throw new Error('invalid complete event ordering');
        }
        sawComplete = true;
        mergeErrors(result, event.errors);
        mergeExtensions(result, event.extensions);
        break;

      default:
        throw new Error(`unsupported protocol event kind: ${event.kind}`);
    }
  }

  if (!sawInitial || !sawComplete) {
    throw new Error('stream must contain initial and complete events');
  }

  if (!result.errors || result.errors.length === 0) {
    delete result.errors;
  }
  if (!result.extensions || Object.keys(result.extensions).length === 0) {
    delete result.extensions;
  }

  return result;
}

function mergeErrors(result, errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return;
  }
  result.errors = Array.isArray(result.errors)
    ? result.errors.concat(errors)
    : errors.slice();
}

function mergeExtensions(result, extensions) {
  if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
    return;
  }
  result.extensions = {
    ...(result.extensions || {}),
    ...extensions,
  };
}

function applyDataPatch(root, path, patch) {
  const segments = normalizePath(path);
  if (segments.length === 0) {
    return mergeValue(root, patch);
  }

  if (root == null) {
    throw new Error('cannot apply non-root patch without initial data');
  }

  const { parent, key } = resolveParent(root, segments);
  parent[key] = mergeValue(parent[key], patch);
  return root;
}

function applyItemsPatch(root, path, items) {
  const segments = normalizePath(path);
  if (!Array.isArray(items)) {
    throw new Error('items patch must be an array');
  }

  const target = resolvePath(root, segments);
  if (!Array.isArray(target)) {
    throw new Error('items patch target must be an array');
  }

  target.push(...items);
  return root;
}

function mergeValue(target, patch) {
  if (isRecord(target) && isRecord(patch)) {
    Object.assign(target, patch);
    return target;
  }
  return patch;
}

function resolveParent(root, path) {
  if (path.length === 0) {
    throw new Error('cannot resolve parent for empty path');
  }

  if (path.length === 1) {
    if (!isContainer(root)) {
      throw new Error('root is not a container');
    }
    return { parent: root, key: path[0] };
  }

  return { parent: resolvePath(root, path.slice(0, -1)), key: path[path.length - 1] };
}

function resolvePath(root, path) {
  if (path.length === 0) {
    return root;
  }

  let current = root;
  for (const segment of path) {
    if (!isContainer(current) || !(segment in current)) {
      throw new Error('patch path does not exist in result');
    }
    current = current[segment];
  }
  return current;
}

function normalizePath(path) {
  if (path == null) {
    return [];
  }
  if (!Array.isArray(path)) {
    throw new Error('patch path must be an array');
  }
  return path;
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isContainer(value) {
  return isRecord(value) || Array.isArray(value);
}

module.exports = {
  STREAM_PROTOCOL,
  createHarnessOutputAccumulator,
  isProtocolEvent,
  normalizeStreamEvents,
  parseHarnessOutput,
};
