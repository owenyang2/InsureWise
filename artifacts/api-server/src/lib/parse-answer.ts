export function buildParseAnswerPrompt(
  questionId: string,
  questionText: string,
  answer: string,
): string {
  return `You are an AI assistant parsing answers for an insurance onboarding questionnaire.

Current question id: "${questionId}"
The user was asked: "${questionText}"
The user's free-form answer was: "${answer}"

RULES:
1. parsedValue must answer ONLY the current question ("${questionId}"). If the user did not provide that specific answer, set parsedValue to null.
2. Users often give compound answers (e.g. "I have a green Toyota and want car insurance" when asked for their name). In that case:
   - parsedValue: null (no name given)
   - extractedEntities: { "insuranceType": "Auto", "vehicleMake": "Toyota", ... }
3. Put ALL other insurance-relevant details in extractedEntities using EXACTLY these keys when applicable:
   insuranceType, vehicleYear, vehicleMake, vehicleModel, budgetMonthly, propertyType, age, name, location
4. Normalize insuranceType to one of: Auto, Home, Renters, Health, Life (e.g. "car insurance" → "Auto").
5. For vehicles, set vehicleMake to "Make Model" when both are known; if only make is given, use just the make (e.g. "Toyota").
6. Ignore irrelevant chit-chat (food, weather, etc.) — do not include in extractedEntities.
7. If the user clearly answers the current question, set parsedValue even when extra details are present.

Examples:
- Question id "name", answer "i have a green toyota and want car insurance"
  → { "parsedValue": null, "extractedEntities": { "insuranceType": "Auto", "vehicleMake": "Toyota" } }
- Question id "insuranceType", answer "i have a green toyota and want car insurance"
  → { "parsedValue": "Auto", "extractedEntities": { "vehicleMake": "Toyota" } }
- Question id "name", answer "Sarah"
  → { "parsedValue": "Sarah", "extractedEntities": {} }

Respond ONLY with valid JSON:
{
  "parsedValue": "string or null",
  "extractedEntities": {}
}`;
}

export type ParseAnswerResult = {
  parsedValue: string | null;
  extractedEntities: Record<string, string>;
};

export function parseAnswerFromModelContent(raw: string, fallbackAnswer: string): ParseAnswerResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as ParseAnswerResult;
    return {
      parsedValue: parsed.parsedValue ?? null,
      extractedEntities: parsed.extractedEntities ?? {},
    };
  } catch {
    return { parsedValue: fallbackAnswer, extractedEntities: {} };
  }
}
