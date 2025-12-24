import { PredictionServiceClient, helpers } from "@google-cloud/aiplatform";
import { projectID } from "firebase-functions/params";

// Initialize client with specific API Endpoint for the region
const clientOptions = {
    apiEndpoint: "asia-northeast1-aiplatform.googleapis.com"
};

const client = new PredictionServiceClient(clientOptions);

export async function generateEmbedding(text: string, title?: string, taskType: string = "RETRIEVAL_DOCUMENT"): Promise<number[]> {
    const project = projectID.value();
    const location = "asia-northeast1";
    // text-embedding-004
    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/text-embedding-004`;

    const instance: any = {
        content: text,
        task_type: taskType
    };

    if (title) {
        instance.title = title;
    }

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
            // Format for text-embedding-004: { embeddings: { statistics: { ... }, values: [...] } }
            if (result && result.embeddings && result.embeddings.values) {
                return result.embeddings.values;
            }
        }
    } catch (error) {
        console.error("Embedding generation failed:", error);
        throw error;
    }

    return [];
}
