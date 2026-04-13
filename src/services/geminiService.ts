import { GoogleGenAI, Type } from "@google/genai";
import { Part, Container, Pallet, ShipmentItem, PackingResult } from "../types";

// @ts-ignore
const ai = new GoogleGenAI({ apiKey: import.meta.env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '' });

export interface AISuggestion {
  boxName: string;
  length: number;
  width: number;
  height: number;
  explanation: string;
}

export async function generateBoxDimensionsWithAI(
  part: Part,
  orderQuantity: number,
  targetFillRate: number = 0.85
): Promise<AISuggestion> {
  const model = "gemini-3.1-flash-lite-preview";
  
  let prompt = `You are an expert packaging engineer AI.
I need you to suggest the optimal box dimensions for shipping a specific part based purely on its geometry and the required quantities.

Part Details:
- Dimensions: ${part.length} x ${part.width} x ${part.height} mm
- Weight: ${part.weight} kg
- Total Order Quantity: ${orderQuantity} pieces
${part.targetBoxCount ? `- Target Box Count: ${part.targetBoxCount} boxes` : ''}
${part.fixedPartsPerBox ? `- Fixed Parts per Box: ${part.fixedPartsPerBox} pieces` : ''}

CRITICAL REQUIREMENT FOR BOX FILL RATE:
The suggested box dimensions MUST result in a volume utilization (fill rate) that is as high as possible while maintaining a MAXIMUM clearance of 10mm on each side (20mm total per dimension) relative to the stack of parts.
This target fill rate is usually around 85-95% depending on the part size.

CRITICAL REQUIREMENT FOR BOX DIMENSIONS:
1. Minimum dimension: The length, width, and height of the box MUST each be at least 50 mm.
2. Maximum dimension: The length, width, and height of the box MUST NOT exceed 600 mm.
3. Aspect Ratio: The length-to-width ratio (Length / Width) MUST be between 0.5 and 2.0 to prevent extremely thin or elongated boxes.
4. Clearance: Add a clearance of EXACTLY 5-10mm to each side (10-20mm total per dimension) compared to the exact multiple of parts. DO NOT EXCEED 10mm clearance per side.

To achieve the optimal fit:
- Calculate the dimensions of the part stack (Nx * L, Ny * W, Nz * H).
- Add between 10mm and 20mm to each of these dimensions to get the box dimensions.
- Ensure the resulting box fits the parts efficiently.
- If a user-imposed "Target Box Count" or "Fixed Parts per Box" limit is provided, you MUST suggest a box that fits exactly that many parts with the specified clearance.

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
            boxName: { type: Type.STRING },
            length: { type: Type.NUMBER },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            explanation: { type: Type.STRING },
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
The suggested box dimensions MUST result in a volume utilization (fill rate) that is as high as possible while maintaining a MAXIMUM clearance of 10mm on each side (20mm total per dimension) relative to the stack of parts.
This target fill rate is usually around 85-95% depending on the part size.

CRITICAL REQUIREMENT FOR BOX DIMENSIONS:
1. Minimum dimension: The length, width, and height of the box MUST each be at least 50 mm.
2. Maximum dimension: The length, width, and height of the box MUST NOT exceed 600 mm.
3. Aspect Ratio: The length-to-width ratio (Length / Width) MUST be between 0.5 and 2.0 to prevent extremely thin or elongated boxes.
4. Clearance: Add a clearance of EXACTLY 5-10mm to each side (10-20mm total per dimension) compared to the exact multiple of parts. DO NOT EXCEED 10mm clearance per side.

To achieve the optimal fit:
- Calculate the dimensions of the part stack (Nx * L, Ny * W, Nz * H).
- Add between 10mm and 20mm to each of these dimensions to get the box dimensions.
- Ensure the resulting box fits the parts efficiently.
- If a user-imposed "Max Parts per Box" limit is provided, you MUST suggest a box that fits exactly that many parts with the specified clearance.
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

export async function analyzePalletizationInsights(
  result: PackingResult,
  pallet: Pallet,
  items: ShipmentItem[],
  parts: Part[],
  boxes: Container[]
): Promise<string> {
  const model = "gemini-3.1-flash-lite-preview";
  
  const shipmentData = items.map(item => {
    const part = parts.find(p => p.id === item.partId);
    const box = boxes.find(b => b.id === item.boxId);
    return {
      partName: part?.name,
      partWeight: part?.weight,
      boxName: box?.name,
      boxDims: `${box?.length}x${box?.width}x${box?.height}`,
      quantity: item.quantity
    };
  });

  const prompt = `You are a senior logistics consultant. Analyze this palletization result and provide actionable insights.
  
  Pallet: ${pallet.name} (${pallet.length}x${pallet.width}x${pallet.height}mm, Max Weight: ${pallet.maxWeight}kg, Max Height: ${pallet.maxHeight}mm)
  Result:
  - Total Pallets: ${result.totalPalletsNeeded}
  - Total Boxes: ${result.totalBoxesNeeded}
  - Volume Utilization: ${(result.palletVolumeUtilization * 100).toFixed(1)}%
  - Stability: ${result.isStable ? 'Stable' : 'Unstable'}
  - Balanced Pallet Weight: ${result.balancedPalletWeight.toFixed(1)}kg
  - Last Pallet Weight: ${result.lastPalletWeight.toFixed(1)}kg
  
  Shipment Items:
  ${JSON.stringify(shipmentData, null, 2)}
  
  Provide a concise analysis in Polish focusing on:
  1. Stability (ułożenie, środek ciężkości).
  2. Space Utilization (wykorzystanie objętości).
  3. Weight Distribution (rozłożenie masy).
  4. Actionable Advice (konkretne porady).
  
  Keep it professional and structured with bullet points.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt
    });
    return response.text || "Brak analizy.";
  } catch (error) {
    console.error("Error analyzing palletization insights:", error);
    return "Nie udało się wygenerować analizy.";
  }
}

export async function optimizePalletizationWithAI(
  items: ShipmentItem[],
  parts: Part[],
  boxes: Container[],
  pallet: Pallet,
  previousInsights?: string | null
): Promise<{ explanation: string; suggestedBoxChanges?: { partId: string, newBox: Partial<Container> }[] }> {
  const model = "gemini-3.1-flash-lite-preview";
  
  const shipmentData = items.map(item => {
    const part = parts.find(p => p.id === item.partId);
    const box = boxes.find(b => b.id === item.boxId);
    return {
      partId: item.partId,
      partName: part?.name,
      partDims: `${part?.length}x${part?.width}x${part?.height}`,
      partWeight: part?.weight,
      quantity: item.quantity,
      currentBox: `${box?.length}x${box?.width}x${box?.height}`
    };
  });

  let prompt = `You are a senior logistics and packaging optimization AI.
I have a shipment consisting of multiple parts, each packed into specific boxes. I need to optimize the palletization to minimize the number of pallets, ensure stability, and maximize space utilization.

Pallet Details:
- Dimensions: ${pallet.length} x ${pallet.width} x ${pallet.height} mm
- Max Height: ${pallet.maxHeight} mm
- Max Weight: ${pallet.maxWeight} kg

Shipment Items:
${JSON.stringify(shipmentData, null, 2)}

${previousInsights ? `PREVIOUS ANALYSIS INSIGHTS (Take these into account):
${previousInsights}` : ''}

YOUR TASK:
1. Analyze if the current box choices are optimal for palletization.
2. Suggest new box dimensions for parts where it would significantly improve pallet utilization (fitting more boxes per layer or better stacking).
3. CRITICAL CONSTRAINTS FOR SUGGESTED BOXES:
   - BOX FILL RATE: Target ~85% volume utilization.
   - CLEARANCE: Add EXACTLY 10mm clearance to each side (20mm total per dimension) relative to the stack of parts.
   - MAX DIMENSION: No box dimension (L, W, or H) can exceed 600 mm.
   - MODULARITY: Box dimensions MUST be modular with the pallet base (${pallet.length}x${pallet.width}). They should be factors or multiples that fit perfectly (e.g., for 1200x800, use 600x400, 400x300, 300x200, etc.).
   - STABILITY: Prioritize base dimensions that create a stable stack.
4. Provide an explanation of your optimization strategy in Polish.

Return the response strictly as a JSON object with:
- explanation: A short summary of the optimization in Polish (e.g., "Optymalizacja ułożenia wykonana na podstawie analizy...").
- suggestedBoxChanges: An array of { partId: string, newBox: { length: number, width: number, height: number, name: string } } for the parts that need optimization.

Return strictly JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: { type: Type.STRING },
            suggestedBoxChanges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  partId: { type: Type.STRING },
                  newBox: {
                    type: Type.OBJECT,
                    properties: {
                      length: { type: Type.NUMBER },
                      width: { type: Type.NUMBER },
                      height: { type: Type.NUMBER },
                      name: { type: Type.STRING }
                    },
                    required: ["length", "width", "height", "name"]
                  }
                },
                required: ["partId", "newBox"]
              }
            }
          },
          required: ["explanation"]
        }
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error optimizing palletization with AI:", error);
    return { explanation: "Błąd optymalizacji AI" };
  }
}

