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
  const model = "gemini-3.1-flash-lite-preview";
  
  let prompt = `You are an expert packaging and logistics optimization AI.
I need you to suggest the optimal box dimensions for shipping a specific part.

Part Details:
- Name: ${part.name}
- Dimensions: ${part.length} x ${part.width} x ${part.height} mm
- Weight: ${part.weight} kg
- Total Order Quantity: ${orderQuantity} pieces
${part.targetBoxCount ? `- Target Box Count: ${part.targetBoxCount} boxes` : ''}
${part.fixedPartsPerBox ? `- Fixed Parts per Box: ${part.fixedPartsPerBox} pieces` : ''}

CRITICAL REQUIREMENT FOR EVEN DISTRIBUTION:
The user wants parts to be distributed evenly across the target number of boxes or according to the fixed parts per box.
If the user has a "Target Box Count", you MUST suggest a box that is 85% full with exactly (Total Order Quantity / Target Box Count) parts.
If the user has a "Fixed Parts per Box", you MUST suggest a box that is 85% full with exactly that many parts.

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
The suggested box dimensions MUST be multiples or factors of the pallet base dimensions (${pallet.length} x ${pallet.width} mm) to maximize the utilization of the pallet base area without overhang. Ensure the suggestion considers pallet dimensions for pallet shipping so that multiple boxes fit perfectly on the pallet without wasted space. For example, if the pallet is 1200x800, good box base dimensions could be 600x400, 400x300, 300x200, 800x600, etc.
`;
  } else {
    prompt += `
CRITICAL REQUIREMENT FOR COURIER SHIPPING:
Do not consider pallet dimensions or pallet weight. Focus purely on creating a box that efficiently holds the parts while keeping the box weight manageable for a courier.
The maximum allowed weight for a single courier box is 30 kg.
You MUST calculate the total weight of the parts in the suggested box (Parts per Box * Part Weight). This total weight MUST NOT exceed 30 kg.
If a single part weighs more than 30 kg, suggest a box that fits exactly 1 part.
`;
  }

  prompt += `
CRITICAL REQUIREMENT FOR BOX FILL RATE:
The suggested box dimensions MUST result in a volume utilization (fill rate) of approximately 85%. The fill rate should be between 83% and 87%, with a target of exactly 85%. Do not pack it to 100%. Leave the remaining space for padding and easy packing.

To achieve 85%:
- Calculate the total volume of the parts you want to fit in the box.
- Divide that total volume by 0.85 to find the target box volume.
- Find dimensions (L, W, H) that result in this target volume while also being multiples of the part dimensions (plus small tolerances) to ensure efficient packing.
- If a user-imposed "Max Parts per Box" limit is provided, you MUST suggest a box that fits exactly that many parts with 85% utilization.
- For pallet shipping, ensure the box dimensions also fit efficiently on the pallet (${pallet?.length}x${pallet?.width}).

Please provide:
1. A suggested name for the box. This MUST be strictly in the format "BC {length}x{width}x{height}" (e.g., "BC 600x400x300").
2. The suggested Length, Width, and Height of the box in mm.
3. A short message "Optymalizacja wykonana" as the explanation.

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
              description: "Short success message",
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
