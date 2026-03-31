import { GoogleGenAI, Type } from "@google/genai";
import { Part, Container, Pallet } from "../types";

// @ts-ignore
const ai = new GoogleGenAI({ apiKey: import.meta.env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '' });

export interface AISuggestion {
  boxName: string;
  length: number;
  width: number;
  height: number;
  explanation: string;
}

export async function getOptimalBoxSuggestion(
  part: Part,
  orderQuantity: number,
  shippingMethod: 'pallet' | 'courier',
  pallet?: Pallet
): Promise<AISuggestion> {
  const model = "gemini-3.1-pro-preview";
  
  let prompt = `You are an expert packaging and logistics optimization AI.
I need you to suggest the optimal box dimensions for shipping a specific part.

Part Details:
- Name: ${part.name}
- Dimensions: ${part.length} x ${part.width} x ${part.height} mm
- Weight: ${part.weight} kg
- Total Order Quantity: ${orderQuantity} pieces

Shipping Method: ${shippingMethod.toUpperCase()}
`;

  if (shippingMethod === 'pallet' && pallet) {
    prompt += `
Pallet Constraints:
- Pallet Name: ${pallet.name}
- Pallet Dimensions: ${pallet.length} x ${pallet.width} x ${pallet.height} mm
- Max Pallet Weight: ${pallet.maxWeight} kg
- Max Pallet Height: ${pallet.maxHeight} mm

CRITICAL REQUIREMENT FOR PALLET SHIPPING:
The suggested box dimensions MUST be multiples or factors of the pallet base dimensions (${pallet.length} x ${pallet.width} mm) to maximize the utilization of the pallet base area without overhang. Ensure the suggestion considers pallet dimensions for pallet shipping so that multiple boxes fit perfectly on the pallet without wasted space (tak aby przy większej liczbie kartonów pasowały do palety). For example, if the pallet is 1200x800, good box base dimensions could be 600x400, 400x300, 300x200, 800x600, etc.
`;
  } else {
    prompt += `
CRITICAL REQUIREMENT FOR COURIER SHIPPING:
Do not consider pallet dimensions or pallet weight. Focus purely on creating a box that efficiently holds the parts while keeping the box weight manageable for a courier (typically under 30kg per box).
`;
  }

  prompt += `
CRITICAL REQUIREMENT FOR BOX FILL RATE:
The suggested box dimensions MUST result in a volume utilization (fill rate) of not less than 82% and no more than 90%. Prioritize an 82% fill rate. Do not pack it to 100%. Leave the remaining space for padding and easy packing.

Please provide:
1. A suggested name for the box. This MUST be strictly in the format "BC {length}x{width}x{height}" (e.g., "BC 600x400x300").
2. The suggested Length, Width, and Height of the box in mm.
3. A detailed explanation of why these dimensions are optimal, how the parts should be arranged inside, and how it meets the specific shipping method constraints and the 82%-90% fill rate requirement.

Return the response strictly as a JSON object matching the requested schema.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            boxName: {
              type: Type.STRING,
              description: "Suggested name for the box",
            },
            length: {
              type: Type.NUMBER,
              description: "Suggested box length in mm",
            },
            width: {
              type: Type.NUMBER,
              description: "Suggested box width in mm",
            },
            height: {
              type: Type.NUMBER,
              description: "Suggested box height in mm",
            },
            explanation: {
              type: Type.STRING,
              description: "Detailed explanation of the recommendation",
            },
          },
          required: ["boxName", "length", "width", "height", "explanation"],
        },
      },
    });

    const jsonStr = response.text?.trim() || "{}";
    const suggestion = JSON.parse(jsonStr) as AISuggestion;
    return suggestion;
  } catch (error) {
    console.error("Error generating AI suggestion:", error);
    throw new Error("Failed to generate AI suggestion. Please check your API key and try again.");
  }
}
