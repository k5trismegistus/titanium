import { SOURCE_VECTOR_DIMENSION, VECTOR_DIMENSION } from "./vectorConfig";
import { applyRandomProjection } from "./randomProjection";

// Initialize client with specific API Endpoint for the region
const clientOptions = {
  apiEndpoint: "asia-northeast1-aiplatform.googleapis.com",
};

let predictionClient: import("@google-cloud/aiplatform").PredictionServiceClient | null = null;
let aiplatformHelpers: typeof import("@google-cloud/aiplatform").helpers | null = null;

const getPredictionClient = async (): Promise<{
  client: import("@google-cloud/aiplatform").PredictionServiceClient;
  helpers: typeof import("@google-cloud/aiplatform").helpers;
}> => {
  if (!predictionClient || !aiplatformHelpers) {
    const { PredictionServiceClient, helpers } = await import("@google-cloud/aiplatform");
    predictionClient = new PredictionServiceClient(clientOptions);
    aiplatformHelpers = helpers;
  }
  return { client: predictionClient, helpers: aiplatformHelpers };
};

const resolveProjectId = (): string => {
  const envProject = process.env.GCLOUD_PROJECT
    || process.env.GCP_PROJECT
    || process.env.FIREBASE_PROJECT_ID
    || process.env.FIREBASE_PROJECT;
  if (envProject) return envProject;

  const firebaseConfig = process.env.FIREBASE_CONFIG;
  if (firebaseConfig && firebaseConfig !== "undefined") {
    try {
      const parsed = JSON.parse(firebaseConfig);
      if (typeof parsed?.projectId === "string") {
        return parsed.projectId;
      }
    } catch {
      // ignore parse errors
    }
  }

  return "";
};

export async function generateEmbeddingRaw(
  text: string,
  title?: string,
  taskType: string = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const project = resolveProjectId();
  if (!project) {
    throw new Error("Missing project ID for Vertex AI embedding (set GCLOUD_PROJECT or FIREBASE_PROJECT_ID).");
  }
  const location = "asia-northeast1";
  const model = "gemini-embedding-001";
  const endpoint = `projects/${project}/locations/${location}/publishers/google/models/${model}`;

  const instance: any = {
    content: text,
    task_type: taskType,
  };

  if (title) {
    instance.title = title;
  }

  const { client, helpers } = await getPredictionClient();
  const instanceValue = helpers.toValue(instance) as any;
  if (!instanceValue) throw new Error("Failed to convert instance to Value");

  const instances = [instanceValue];

  try {
    const [response] = await client.predict({
      endpoint,
      instances,
    });

    const predictions = response.predictions;
    if (predictions && predictions.length > 0) {
      const result: any = helpers.fromValue(predictions[0] as any);
      // Format for gemini-embedding-001: { embeddings: { statistics: { ... }, values: [...] } }
      if (result && result.embeddings && result.embeddings.values) {
        const values = result.embeddings.values;
        if (Array.isArray(values)) {
          return values;
        }
        console.error(`Unexpected embedding dimension: ${Array.isArray(values) ? values.length : "unknown"}`);
      }
    }
  } catch (error) {
    console.error("Embedding generation failed:", error);
    throw error;
  }

  return [];
}

export async function generateEmbedding(
  text: string,
  title?: string,
  taskType: string = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const values = await generateEmbeddingRaw(text, title, taskType);
  if (values.length === VECTOR_DIMENSION) {
    return values;
  }
  if (values.length === SOURCE_VECTOR_DIMENSION) {
    const reduced = applyRandomProjection(values);
    if (reduced.length === VECTOR_DIMENSION) {
      console.log(`Reduced embedding dimension from ${values.length} to ${VECTOR_DIMENSION} via random projection`);
      return reduced;
    }
  }
  if (values.length > 0) {
    console.error(`Unexpected embedding dimension: ${values.length}`);
  }
  return [];
}
