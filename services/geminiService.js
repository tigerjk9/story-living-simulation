
import { GoogleGenAI } from "@google/genai";
import { GEMINI_TEXT_MODEL_NAME, GEMINI_IMAGE_MODEL_NAME } from '../constants.js';
// Types are now in types.js as comments, not directly usable for type checking in JS

export class GeminiService {
  static instance;
  ai = null;

  constructor() {
    // Initialization is now handled by the init() method.
  }

  init(apiKey) {
    if (!apiKey) {
      throw new Error("API 키가 제공되지 않았습니다.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  static getInstance() {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  parseJsonFromText(text) {
    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    try {
      return JSON.parse(jsonStr); // as GeminiResponseJson
    } catch (e) {
      console.error("JSON 파싱 실패:", jsonStr, e);
      throw new Error(`모델 응답이 유효한 JSON 형식이 아닙니다. 응답 내용: ${jsonStr.substring(0,1000)}`);
    }
  }
  
  async generateInitialSimulationStep(
    simulationType,
    targetAudience,
    customTopic,
    learningGoal,
    currentTurn,
    maxTurns
  ) {
    if (!this.ai) {
      throw new Error("Gemini Service가 초기화되지 않았습니다. API 키를 먼저 설정해주세요.");
    }
    const topicInstruction = customTopic 
      ? `사용자가 제공한 구체적인 주제는 "${customTopic}"입니다. 이 주제를 중심으로 시뮬레이션을 구성해주세요.`
      : `선택된 시뮬레이션 유형과 대상에 맞는 흥미로운 주제를 자유롭게 선정해주세요.`;

    const learningGoalInstruction = learningGoal
      ? `이 시뮬레이션을 통해 달성하고자 하는 주요 학습 목표는 "${learningGoal}"입니다. 이야기와 선택지가 이 목표 달성에 기여하도록 구성해주세요.`
      : `특별히 명시된 학습 목표는 없습니다. 대상 학습자에게 유익하고 흥미로운 학습 경험을 제공하는 데 중점을 둬주세요.`;

    const prompt = `
      당신은 "${targetAudience}"를 위한 "${simulationType}" 교육용 시뮬레이션 시나리오 AI 작가입니다.
      ${topicInstruction}
      ${learningGoalInstruction}
      
      중요: 이 시뮬레이션은 총 ${maxTurns}턴으로 구성됩니다. 현재는 ${currentTurn}턴입니다.
      이야기를 ${maxTurns}턴 안에 완결되도록 페이싱을 조절해주세요.

      다음 JSON 형식에 맞춰 응답을 생성해야 합니다. JSON 코드 블록 마커를 사용하지 마세요.
      {
        "story": "이야기의 시작 부분. 몰입감 있고 흥미를 유발해야 하며, 학습 목표와 관련된 상황을 제시해주세요. 스토리는 2-4문장으로 간결하게 해주세요.",
        "imagePrompt": "현재 이야기 장면에 어울리는 매우 상세하고 창의적인 이미지 생성 프롬프트입니다. 이미지의 주요 대상, 배경, 전체적인 분위기(예: 밝고 희망찬, 신비로운, 탐구적인), 그리고 대상 학습자에게 매력적일 만한 시각적 스타일(예: 아기자기한 만화 스타일, 부드러운 수채화 느낌, 현대적인 디지털 아트)을 구체적으로 명시해주세요. 프롬프트는 영어로 작성되어도 좋습니다. 예: 'A curious young student with wide eyes looking through a magnifying glass at a vibrant, glowing plant in a futuristic science lab, soft and warm lighting, detailed illustration style.' 또는 이미지가 필요하지 않다면 null 값을 주세요.",
        "choices": ["사용자가 내릴 수 있는 첫 번째 선택지 (학습 목표와 관련)", "두 번째 선택지 (다른 탐구 방향)", "세 번째 선택지 (상황에 대한 질문) (2~4개 권장)"]
      }

      주의사항:
      - 이야기는 한국어로 작성해주세요.
      - "${targetAudience}"가 쉽게 이해하고 공감할 수 있는 어투와 내용을 사용해주세요.
      - 선택지는 사용자의 능동적인 참여를 유도하고, 각 선택이 명확한 결과로 이어질 수 있도록 설계해주세요. 각 선택지는 10-15단어 내외로 간결하게 해주세요.
      - 학습에 불필요한 요소는 최대한 배제하고, 교육적 가치에 집중해주세요.
    `;

    try {
      const response = await this.ai.models.generateContent({ // GenerateContentResponse
        model: GEMINI_TEXT_MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });
      const parsedJson = this.parseJsonFromText(response.text);
      return {
        story: parsedJson.story,
        imagePrompt: parsedJson.imagePrompt || null,
        choices: parsedJson.choices || [],
      }; // as SimulationState
    } catch (error) {
      console.error("Gemini API 초기 단계 생성 오류:", error);
      let errorMessage = `초기 시뮬레이션 단계 생성에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`;
      if (error instanceof Error && error.message.includes("API key not valid")) {
        errorMessage = "API 키가 유효하지 않습니다. 설정을 확인해주세요.";
      } else if (error instanceof Error && error.message.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "API 할당량을 초과했습니다. Gemini API 사용량 및 요금제를 확인해주세요.";
      }
      throw new Error(errorMessage);
    }
  }

  async generateNextSimulationStep(
    simulationType,
    targetAudience,
    history, // SimulationStep[]
    customTopic,
    currentTurn,
    maxTurns
  ) {
    if (!this.ai) {
      throw new Error("Gemini Service가 초기화되지 않았습니다. API 키를 먼저 설정해주세요.");
    }
    const previousStep = history[history.length - 1];
    const historySummary = history.map((step, index) => `${index + 1}. 이전 상황: ${step.story.substring(0,50)}... 선택: ${step.choiceMade}`).join('\n');
    const topicInfo = customTopic ? `원래 주제는 "${customTopic}"입니다.` : `원래 주제는 정해지지 않았습니다.`;
    
    const endingInstruction = currentTurn >= maxTurns 
      ? `\n중요: 현재 ${currentTurn}턴으로 마지막 턴입니다. 이야기를 의미 있게 마무리하고, choices 배열을 빈 배열 []로 반환하여 시뮬레이션을 종료해주세요.`
      : currentTurn >= maxTurns - 2
      ? `\n중요: 현재 ${currentTurn}/${maxTurns}턴입니다. 이야기가 ${maxTurns}턴에 완결되도록 클라이맥스로 향하는 전개를 해주세요.`
      : `\n현재 ${currentTurn}/${maxTurns}턴입니다. 이야기를 적절한 속도로 전개해주세요.`;

    const prompt = `
      당신은 "${targetAudience}"를 위한 "${simulationType}" 교육용 시뮬레이션 시나리오 AI 작가입니다.
      ${topicInfo}
      현재까지의 시뮬레이션 진행 요약:
      ${historySummary}

      가장 최근 이야기: "${previousStep.story}"
      사용자가 선택한 행동: "${previousStep.choiceMade}"
      ${endingInstruction}

      이 선택에 따라 다음 이야기, 새로운 선택지, 그리고 장면에 어울리는 이미지 생성 프롬프트를 JSON 형식으로 생성해주세요. JSON 코드 블록 마커는 사용하지 마세요.
      {
        "story": "사용자의 선택을 반영한 이야기의 다음 부분. 이전 이야기와 자연스럽게 이어지며, 새로운 학습 내용을 포함하거나 기존 상황을 심화시켜주세요. 스토리는 2-4문장으로 간결하게 해주세요.",
        "imagePrompt": "새로운 이야기 장면에 어울리는 매우 상세하고 창의적인 이미지 생성 프롬프트입니다. 이미지의 주요 대상, 배경, 전체적인 분위기(예: 밝고 희망찬, 신비로운, 탐구적인), 그리고 대상 학습자에게 매력적일 만한 시각적 스타일(예: 아기자기한 만화 스타일, 부드러운 수채화 느낌, 현대적인 디지털 아트)을 구체적으로 명시해주세요. 프롬프트는 영어로 작성되어도 좋습니다. 예: 'A scientist in a vibrant jungle discovering a new species of glowing mushroom, cinematic lighting, detailed fantasy art style.' 또는 이미지가 필요하지 않다면 null 값을 주세요.",
        "choices": ["새로운 선택지 1 (10-15단어 내외)", "새로운 선택지 2 (10-15단어 내외)", "새로운 선택지 3 (10-15단어 내외) (2~4개 권장, 마지막 턴이면 빈 배열 [])"]
      }

      주의사항:
      - 이야기는 한국어로 작성해주세요.
      - "${targetAudience}"가 쉽게 이해하고 공감할 수 있는 어투와 내용을 사용해주세요.
      - 선택지는 여전히 능동적인 참여를 유도해야 합니다.
      - ${currentTurn}턴이 마지막 턴(${maxTurns}턴)이면, 이야기를 완결하고 choices를 빈 배열 []로 반환해주세요.
    `;
    
    try {
      const response = await this.ai.models.generateContent({ // GenerateContentResponse
        model: GEMINI_TEXT_MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });
      const parsedJson = this.parseJsonFromText(response.text);
      return {
        story: parsedJson.story,
        imagePrompt: parsedJson.imagePrompt || null,
        choices: parsedJson.choices || [],
      }; // as SimulationState
    } catch (error) {
      console.error("Gemini API 다음 단계 생성 오류:", error);
      let errorMessage = `다음 시뮬레이션 단계 생성에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`;
       if (error instanceof Error && error.message.includes("API key not valid")) {
        errorMessage = "API 키가 유효하지 않습니다. 설정을 확인해주세요.";
      } else if (error instanceof Error && error.message.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "API 할당량을 초과했습니다. Gemini API 사용량 및 요금제를 확인해주세요.";
      }
      throw new Error(errorMessage);
    }
  }

  async generateImage(prompt, previousImagePrompt = null) {
    if (!this.ai) {
      throw new Error("Gemini Service가 초기화되지 않았습니다. API 키를 먼저 설정해주세요.");
    }
    if (!prompt) { 
        return null; 
    }
    
    const consistencyInstruction = previousImagePrompt 
      ? `\n\nCONSISTENCY REQUIREMENTS - EXTREMELY IMPORTANT:
- Maintain the SAME art style as the previous image
- Keep the SAME characters with consistent appearance (same clothing, hair, facial features)
- Keep the SAME time period and setting (do not change historical era or location dramatically)
- Use the SAME color palette and visual aesthetic
- Ensure visual continuity - characters and environments should look like they are from the same story
- Previous scene reference: "${previousImagePrompt.substring(0, 200)}..."
- Only change what is necessary for the new scene, everything else must remain consistent`
      : `\n\nCONSISTENCY SETUP - FIRST IMAGE:
- Establish a consistent art style that will be maintained throughout
- Define character appearances that will remain consistent
- Set up a time period and setting that will be maintained
- Choose a color palette that will be used consistently`;
    
    try {
      const fullPrompt = `${prompt}. 

CRITICAL REQUIREMENTS - MUST FOLLOW:
1. NO TEXT WHATSOEVER - absolutely zero text, words, letters, characters, numbers, symbols, or any form of writing
2. NO Korean text (한글, 한자), NO English text, NO numbers, NO symbols with meaning
3. NO signs, NO labels, NO captions, NO subtitles, NO speech bubbles
4. NO written language of any kind - not even decorative text
5. This is MANDATORY - images with ANY text will be rejected

Style requirements:
- Korean cultural context and atmosphere
- Warm and soft pastel colors
- Educational illustration style
- Clear and simple composition
- Friendly and approachable
- High quality and detailed
- Pure visual storytelling only
${consistencyInstruction}

REMINDER: Do NOT include any form of text or writing in the image. Text-free images only. Maintain visual consistency with previous images.`; 
      const response = await this.ai.models.generateImages({
        model: GEMINI_IMAGE_MODEL_NAME,
        prompt: fullPrompt,
        config: { 
          numberOfImages: 1,
          aspectRatio: "1:1"
        },
      });
      
      if (response.generatedImages && response.generatedImages.length > 0) {
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
      }
      throw new Error("이미지 생성 결과가 비어있습니다.");
    } catch (error) {
      console.error("Gemini 이미지 생성 오류:", error);
      let errorMessage = `이미지 생성에 실패했습니다.`;
      const errStr = error instanceof Error ? error.message : String(error);

      if (errStr.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "이미지 생성 API 할당량을 초과했습니다. Gemini API 사용량 및 요금제를 확인해주세요.";
      } else if (errStr.includes("API key not valid")) {
        errorMessage = "API 키가 유효하지 않습니다. 이미지 생성에 실패했습니다. API 키 설정을 확인해주세요.";
      } else if (errStr.includes("SAFETY")) {
        errorMessage = "이미지 생성 요청이 안전 기준에 맞지 않아 거부되었습니다.";
      } else {
        errorMessage = `이미지 생성 중 오류가 발생했습니다: ${errStr.substring(0, 200)}${errStr.length > 200 ? '...' : ''}`;
      }
      throw new Error(errorMessage);
    }
  }
}
