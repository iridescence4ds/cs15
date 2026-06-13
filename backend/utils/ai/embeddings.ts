import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

// Cached resolved pipeline — initialized on first call, reused for all subsequent calls
let cachedEmbedder: FeatureExtractionPipeline | null = null;
// Track whether the model has been warmed (i.e., downloaded and ready)
let isWarmed = false;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!cachedEmbedder) {
    // 'Xenova/multi-qa-mpnet-base-dot-v1' produces 768-dim normalized vectors.
    // This must match the numDimensions in your MongoDB Atlas vector index.
    cachedEmbedder = await pipeline(
      'feature-extraction',
      'Xenova/multi-qa-mpnet-base-dot-v1'
    ) as FeatureExtractionPipeline;
    isWarmed = true;
  }
  return cachedEmbedder;
}

/** Warm up the embedding pipeline so the first real request isn't slow. */
export const warmEmbedder = async (): Promise<void> => {
  await getEmbedder();
};

/**
 * Generate a semantic embedding for the given text using a local Transformer model.
 *
 * Model: Xenova/multi-qa-mpnet-base-dot-v1 (768-dim, optimized for Q&A retrieval)
 * Output is mean-pooled and normalized for reliable cosine similarity via
 * MongoDB Atlas $vectorSearch.
 *
 * IMPORTANT: If you switch the model, you MUST:
 *   1. Update this file to reference the new model slug
 *   2. Run `npm run backfill:embeddings` to regenerate all stored vectors
 *   3. Update the `numDimensions` value in your MongoDB Atlas vector index
 *
 * @param text — the text to embed (question, FAQ body, etc.)
 * @returns embedding vector array (768-dimensional)
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const embedder = await getEmbedder();

  const output = await embedder(text, {
    pooling: 'mean',
    normalize: true,
  });

  // output.data is a Float32Array — convert to plain number[] for MongoDB
  return Array.from(output.data);
};
