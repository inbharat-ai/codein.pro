import { ModelProviderTags } from "../../../components/modelSelection/utils";
import { ModelPackage } from "./models";

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  hugging_face_id: string;
}

function convertOpenRouterModelToPackage(model: OpenRouterModel): ModelPackage {
  return {
    title: model.name,
    description: model.description,
    refUrl: `https://openrouter.ai/models/${model.id}`,
    params: {
      title: model.name,
      model: model.id,
      contextLength: model.context_length,
    },
    isOpenSource: !!model.hugging_face_id,
    tags: [ModelProviderTags.RequiresApiKey],
    providerOptions: ["openrouter"],
    icon: "openrouter.png",
  };
}

async function fetchOpenRouterModelsFromAPI(): Promise<OpenRouterModel[]> {
  const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/models";

  try {
    const response = await fetch(OPENROUTER_API_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data;
  } catch (error) {
    // OpenRouter API fetch failed
    return [];
  }
}

export async function getOpenRouterModelsList(): Promise<ModelPackage[]> {
  const models: { [key: string]: ModelPackage } = {};

  const apiModels = await fetchOpenRouterModelsFromAPI();

  apiModels.forEach((model: OpenRouterModel) => {
    if (!model.id || !model.name) {
      // Skipping model with missing id or name
      return;
    }

    // Create a unique key from the model id (replace slashes and dots with underscores)
    const key = model.id.replace(/[\/.]/g, "_");

    try {
      models[key] = convertOpenRouterModelToPackage(model);
    } catch (error) {
      // Model conversion failed, skipping
    }
  });

  return Object.values(models);
}
