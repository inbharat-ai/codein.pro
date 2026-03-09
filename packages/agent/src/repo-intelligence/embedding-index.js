/**
 * Repo Intelligence - Embedding Index
 *
 * Lightweight in-process semantic retrieval without external model dependencies.
 * Uses hashed token vectors + cosine similarity.
 */
"use strict";

const crypto = require("node:crypto");

const DEFAULT_DIMENSIONS = 192;

function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
}

function tokenToIndex(token, dimensions) {
  const hash = crypto.createHash("sha1").update(token).digest();
  const idx = hash.readUInt32BE(0) % dimensions;
  const sign = (hash[4] & 1) === 0 ? 1 : -1;
  return { idx, sign };
}

function normalize(vec) {
  let mag = 0;
  for (let i = 0; i < vec.length; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= mag;
  return vec;
}

function embedText(text, dimensions = DEFAULT_DIMENSIONS) {
  const vec = new Float32Array(dimensions);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  const tf = new Map();
  for (const tok of tokens) tf.set(tok, (tf.get(tok) || 0) + 1);

  for (const [tok, count] of tf.entries()) {
    const { idx, sign } = tokenToIndex(tok, dimensions);
    const weight = 1 + Math.log(count);
    vec[idx] += sign * weight;
  }

  return normalize(vec);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

class EmbeddingIndex {
  constructor(opts = {}) {
    this.dimensions = opts.dimensions || DEFAULT_DIMENSIONS;
    this.vectors = new Map(); // id -> Float32Array
    this.metadata = new Map(); // id -> object
  }

  upsert(id, text, metadata = {}) {
    const vec = embedText(text, this.dimensions);
    this.vectors.set(id, vec);
    this.metadata.set(id, metadata);
  }

  remove(id) {
    this.vectors.delete(id);
    this.metadata.delete(id);
  }

  clear() {
    this.vectors.clear();
    this.metadata.clear();
  }

  search(query, topK = 20, minScore = 0) {
    const qvec = embedText(query, this.dimensions);
    const results = [];

    for (const [id, vec] of this.vectors.entries()) {
      const score = cosineSimilarity(qvec, vec);
      if (score >= minScore) {
        results.push({
          id,
          score,
          ...(this.metadata.get(id) || {}),
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

module.exports = {
  EmbeddingIndex,
  embedText,
  cosineSimilarity,
  tokenize,
};
