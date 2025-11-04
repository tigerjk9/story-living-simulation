
import { SIMULATION_TYPES, TARGET_AUDIENCES, MAX_TURNS, MIN_TURNS_FOR_ENDING } from './constants.js';
import { GeminiService } from './services/geminiService.js';

const LOADING_MESSAGES = [
  "흥미로운 시뮬레이션을 만들고 있어요...",
  "잠시만 기다려주세요, 거의 다 됐어요!",
  "최고의 학습 경험을 준비 중입니다...",
  "Gemini AI가 열심히 생각하고 있어요...",
  "지식의 세계로 떠날 준비 중..."
];
let currentMessageIndex = 0;
let messageIntervalId = null;

const STATE = {
  simulationType: SIMULATION_TYPES[0],
  targetAudience: TARGET_AUDIENCES[0],
  customTopic: '',
  learningGoal: '',
  maxTurns: 7, // User-configurable max turns
  currentStep: null, // { story, imagePrompt, choices }
  currentImageUrl: null,
  previousImagePrompt: null, // Track previous image prompt for consistency
  simulationHistory: [], // [{ story, choiceMade, imageUrl, turn }]
  currentTurn: 0, // Track current turn number
  isLoading: false,
  isInitialLoading: false,
  isImageLoading: false,
  isApiKeySet: false,
  error: null,
  isSimulationEnded: false,
};

const ELEMENTS = {
  // API Key Form (Separate Screen)
  apiKeyForm: document.getElementById('api-key-form') as HTMLFormElement,
  apiKeyInput: document.getElementById('apiKeyInput') as HTMLInputElement,
  changeApiKeyButton: document.getElementById('change-api-key-button') as HTMLButtonElement,

  // Config Panel
  configPanelForm: document.getElementById('config-panel') as HTMLFormElement,
  customTopicInput: document.getElementById('customTopic') as HTMLInputElement,
  learningGoalInput: document.getElementById('learningGoal') as HTMLInputElement,
  maxTurnsInput: document.getElementById('maxTurns') as HTMLInputElement,
  simulationTypeSelect: document.getElementById('simulationType') as HTMLSelectElement,
  targetAudienceSelect: document.getElementById('targetAudience') as HTMLSelectElement,
  startSimulationButton: document.getElementById('start-simulation-button') as HTMLButtonElement,
  
  // Loading & Error
  initialLoadingOverlay: document.getElementById('initial-loading-overlay') as HTMLElement,
  initialLoadingMessage: document.getElementById('initial-loading-message') as HTMLElement,
  errorMessageArea: document.getElementById('error-message-area') as HTMLElement,
  errorText: document.getElementById('error-text') as HTMLElement,

  // Simulation Display
  simulationDisplayArea: document.getElementById('simulation-display-area') as HTMLElement,
  turnCounter: document.getElementById('turn-counter') as HTMLElement,
  currentTurnNumber: document.getElementById('current-turn-number') as HTMLElement,
  maxTurnNumber: document.getElementById('max-turn-number') as HTMLElement,
  imageLoadingSpinner: document.getElementById('image-loading-spinner') as HTMLElement,
  simulationImageContainer: document.getElementById('simulation-image-container') as HTMLElement,
  simulationImage: document.getElementById('simulation-image') as HTMLImageElement,
  noImagePlaceholder: document.getElementById('no-image-placeholder') as HTMLElement,
  simulationStoryContainer: document.getElementById('simulation-story-container') as HTMLElement,
  simulationStoryText: document.getElementById('simulation-story-text') as HTMLElement,
  nextStepLoadingSpinner: document.getElementById('next-step-loading-spinner') as HTMLElement,
  simulationChoicesContainer: document.getElementById('simulation-choices-container') as HTMLElement,
  simulationChoices: document.getElementById('simulation-choices') as HTMLElement,
  userCustomInput: document.getElementById('user-custom-input') as HTMLTextAreaElement,
  submitCustomInput: document.getElementById('submit-custom-input') as HTMLButtonElement,
  simulationEndMessage: document.getElementById('simulation-end-message') as HTMLElement,
  downloadStoryButton: document.getElementById('download-story-button') as HTMLButtonElement,
  restartSimulationButton: document.getElementById('restart-simulation-button') as HTMLButtonElement,

  // Footer
  currentYear: document.getElementById('current-year') as HTMLElement,
};

const geminiService = GeminiService.getInstance();

function cycleLoadingMessages() {
  currentMessageIndex = (currentMessageIndex + 1) % LOADING_MESSAGES.length;
  ELEMENTS.initialLoadingMessage.textContent = LOADING_MESSAGES[currentMessageIndex];
}

function renderLoadingState() {
  // Initial loading overlay
  if (STATE.isInitialLoading) {
    ELEMENTS.initialLoadingOverlay.style.display = 'flex';
    ELEMENTS.startSimulationButton.disabled = true;
    ELEMENTS.startSimulationButton.textContent = '시뮬레이션 생성 중...';
    if (!messageIntervalId) {
        ELEMENTS.initialLoadingMessage.textContent = LOADING_MESSAGES[0];
        messageIntervalId = setInterval(cycleLoadingMessages, 2500);
    }
  } else {
    ELEMENTS.initialLoadingOverlay.style.display = 'none';
    ELEMENTS.startSimulationButton.disabled = false;
    // Update button text based on API key state
    if (!STATE.isApiKeySet) {
      ELEMENTS.startSimulationButton.textContent = 'API 키 저장하고 시작하기 ✨';
    } else {
      ELEMENTS.startSimulationButton.textContent = '시뮬레이션 시작하기 ✨';
    }
    if (messageIntervalId) {
        clearInterval(messageIntervalId);
        messageIntervalId = null;
    }
  }

  // Image loading spinner
  ELEMENTS.imageLoadingSpinner.style.display = STATE.isImageLoading ? 'flex' : 'none';
  if (STATE.isImageLoading) {
    ELEMENTS.simulationImageContainer.style.display = 'none';
    ELEMENTS.noImagePlaceholder.style.display = 'none';
  }

  // Next step loading spinner
  const showNextStepSpinner = STATE.isLoading && !STATE.isInitialLoading && STATE.currentStep;
  ELEMENTS.nextStepLoadingSpinner.style.display = showNextStepSpinner ? 'flex' : 'none';
  ELEMENTS.simulationChoicesContainer.style.display = showNextStepSpinner ? 'none' : (STATE.currentStep && STATE.currentStep.choices && STATE.currentStep.choices.length > 0 ? 'block' : 'none');

  // Disable choice buttons and custom input while loading next step
  const choiceButtons = ELEMENTS.simulationChoices.querySelectorAll('button');
  choiceButtons.forEach(button => button.disabled = (STATE.isLoading && !STATE.isInitialLoading));
  ELEMENTS.submitCustomInput.disabled = (STATE.isLoading && !STATE.isInitialLoading);
  ELEMENTS.userCustomInput.disabled = (STATE.isLoading && !STATE.isInitialLoading);
}

function renderErrorState() {
  if (STATE.error) {
    ELEMENTS.errorMessageArea.style.display = 'block';
    ELEMENTS.errorText.textContent = STATE.error;
    if (STATE.isInitialLoading) {
        ELEMENTS.initialLoadingOverlay.style.display = 'none';
        if (messageIntervalId) {
            clearInterval(messageIntervalId);
            messageIntervalId = null;
        }
    }
  } else {
    ELEMENTS.errorMessageArea.style.display = 'none';
  }
}

function renderSimulationDisplay() {
  if (!STATE.currentStep) {
    ELEMENTS.simulationDisplayArea.style.display = 'none';
    return;
  }

  ELEMENTS.simulationDisplayArea.style.display = 'block';
  ELEMENTS.simulationDisplayArea.classList.remove('animate-fadeIn');
  void ELEMENTS.simulationDisplayArea.offsetWidth;
  ELEMENTS.simulationDisplayArea.classList.add('animate-fadeIn');

  // Show turn counter
  if (STATE.currentTurn > 0) {
    ELEMENTS.turnCounter.style.display = 'block';
    ELEMENTS.currentTurnNumber.textContent = STATE.currentTurn.toString();
    ELEMENTS.maxTurnNumber.textContent = STATE.maxTurns.toString();
  } else {
    ELEMENTS.turnCounter.style.display = 'none';
  }

  ELEMENTS.simulationStoryText.textContent = STATE.currentStep.story;

  if (STATE.currentImageUrl && !STATE.isImageLoading) {
    ELEMENTS.simulationImage.src = STATE.currentImageUrl;
    ELEMENTS.simulationImageContainer.style.display = 'block';
    ELEMENTS.simulationImage.classList.remove('animate-fadeIn');
    void ELEMENTS.simulationImage.offsetWidth;
    ELEMENTS.simulationImage.classList.add('animate-fadeIn');
    ELEMENTS.noImagePlaceholder.style.display = 'none';
  } else if (!STATE.currentStep.imagePrompt && !STATE.isImageLoading) {
    ELEMENTS.simulationImageContainer.style.display = 'none';
    ELEMENTS.noImagePlaceholder.style.display = 'flex';
  } else if (STATE.isImageLoading) {
    ELEMENTS.simulationImageContainer.style.display = 'none';
    ELEMENTS.noImagePlaceholder.style.display = 'none';
  } else {
    ELEMENTS.simulationImageContainer.style.display = 'none';
    ELEMENTS.noImagePlaceholder.style.display = 'flex';
  }

  ELEMENTS.simulationChoices.innerHTML = '';
  if (STATE.currentStep.choices && STATE.currentStep.choices.length > 0 && !STATE.isSimulationEnded) {
    ELEMENTS.simulationChoicesContainer.style.display = 'block';
    ELEMENTS.simulationEndMessage.style.display = 'none';
    STATE.currentStep.choices.forEach(choiceText => {
      const button = document.createElement('button');
      button.className = "w-full text-left p-4 bg-white hover:bg-burgundy-50 border-2 border-gold-300 hover:border-burgundy-400 rounded-lg shadow-sm hover:shadow-md transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-burgundy-500 focus:ring-opacity-75 disabled:opacity-70 disabled:cursor-not-allowed group";
      
      const span = document.createElement('span');
      span.className = "text-slate-700 group-hover:text-burgundy-700 transition-colors font-medium";
      span.textContent = choiceText;
      button.appendChild(span);
      
      button.addEventListener('click', () => handleChoice(choiceText));
      ELEMENTS.simulationChoices.appendChild(button);
    });
  } else if (STATE.isSimulationEnded || !STATE.currentStep.choices || STATE.currentStep.choices.length === 0) {
    ELEMENTS.simulationChoicesContainer.style.display = 'none';
    ELEMENTS.simulationEndMessage.style.display = 'block'; 
  } else {
    ELEMENTS.simulationChoicesContainer.style.display = 'block';
    ELEMENTS.simulationEndMessage.style.display = 'none';
  }
  renderLoadingState(); 
}

function updateFullUI() {
  if (STATE.isApiKeySet) {
    // API key is set - show config panel
    ELEMENTS.apiKeyForm.style.display = 'none';
    ELEMENTS.configPanelForm.style.display = 'block';
    ELEMENTS.changeApiKeyButton.style.display = 'inline-block';
  } else {
    // API key not set - show API key form only
    ELEMENTS.apiKeyForm.style.display = 'block';
    ELEMENTS.configPanelForm.style.display = 'none';
    ELEMENTS.changeApiKeyButton.style.display = 'none';
  }
  
  renderLoadingState();
  renderErrorState();
  renderSimulationDisplay();  // 시뮬레이션 화면 렌더링 추가
}

async function handleStartSimulation(event) {
  // Prevent duplicate simulation start
  if (STATE.isInitialLoading || STATE.isLoading) {
    console.log("Simulation already in progress, skipping...");
    return;
  }
  
  // Read and validate maxTurns from input
  const maxTurnsValue = parseInt(ELEMENTS.maxTurnsInput.value);
  if (isNaN(maxTurnsValue) || maxTurnsValue < 3 || maxTurnsValue > 10) {
    STATE.error = "턴 개수는 3~10 사이의 숫자여야 합니다.";
    updateFullUI();
    return;
  }
  STATE.maxTurns = maxTurnsValue;
  
  STATE.isInitialLoading = true;
  STATE.isLoading = true;
  STATE.error = null;
  STATE.currentStep = null;
  STATE.currentImageUrl = null;
  STATE.previousImagePrompt = null; // Reset for new simulation
  STATE.simulationHistory = [];
  STATE.currentTurn = 1;
  STATE.isSimulationEnded = false;
  currentMessageIndex = 0;
  updateFullUI();

  try {
    const initialStepData = await geminiService.generateInitialSimulationStep(
      STATE.simulationType,
      STATE.targetAudience,
      STATE.customTopic,
      STATE.learningGoal,
      STATE.currentTurn,
      STATE.maxTurns
    );
    STATE.currentStep = initialStepData;
    STATE.simulationHistory = [{ 
      story: initialStepData.story, 
      choiceMade: "시뮬레이션 시작", 
      imageUrl: null,
      turn: STATE.currentTurn 
    }];

    if (initialStepData.imagePrompt) {
      STATE.isImageLoading = true;
      renderSimulationDisplay();  // 이미지 로딩 시작 시 UI 업데이트
      try {
        const imageUrl = await geminiService.generateImage(initialStepData.imagePrompt, STATE.previousImagePrompt);
        STATE.currentImageUrl = imageUrl;
        STATE.previousImagePrompt = initialStepData.imagePrompt; // Save for next image
        // Update history with image URL
        STATE.simulationHistory[0].imageUrl = imageUrl;
      } catch (err) {
        console.warn("이미지 생성 실패, 텍스트만으로 계속 진행:", err);
        STATE.currentImageUrl = null;
      } finally {
        STATE.isImageLoading = false;
        renderSimulationDisplay();  // 이미지 로딩 완료 시 UI 업데이트
      }
    }
  } catch (err) {
    console.error("시뮬레이션 시작 오류:", err);
    const errorMessage = err instanceof Error ? err.message : "시뮬레이션 시작 중 알 수 없는 오류가 발생했습니다.";
    if (errorMessage.includes("API 키가 유효하지 않습")) {
        localStorage.removeItem('gemini-api-key');
        STATE.isApiKeySet = false;
        STATE.error = "API 키가 유효하지 않거나 만료되었습니다. 새 키를 입력해주세요.";
    } else {
        STATE.error = errorMessage;
    }
  } finally {
    STATE.isInitialLoading = false;
    STATE.isLoading = false;
    updateFullUI();
  }
}

async function handleChoice(choice) {
  if (!STATE.currentStep) return;

  STATE.isLoading = true;
  STATE.error = null;
  updateFullUI();
  
  // Save current turn to history with image URL
  const newHistoryEntry = {
    story: STATE.currentStep.story,
    choiceMade: choice,
    imageUrl: STATE.currentImageUrl,
    turn: STATE.currentTurn
  };
  STATE.simulationHistory.push(newHistoryEntry);
  
  // Increment turn counter
  STATE.currentTurn++;
  
  // Clear user input
  ELEMENTS.userCustomInput.value = '';

  try {
    const nextStepData = await geminiService.generateNextSimulationStep(
      STATE.simulationType,
      STATE.targetAudience,
      STATE.simulationHistory,
      STATE.customTopic,
      STATE.currentTurn,
      STATE.maxTurns
    );
    STATE.currentStep = nextStepData;
    STATE.currentImageUrl = null; 

    if (nextStepData.imagePrompt) {
      STATE.isImageLoading = true;
      renderSimulationDisplay();  // 이미지 로딩 시작 시 UI 업데이트
      try {
        const imageUrl = await geminiService.generateImage(nextStepData.imagePrompt, STATE.previousImagePrompt);
        STATE.currentImageUrl = imageUrl;
        STATE.previousImagePrompt = nextStepData.imagePrompt; // Save for next image
      } catch (err) {
        console.warn("이미지 생성 실패, 텍스트만으로 계속 진행:", err);
        STATE.currentImageUrl = null;
      } finally {
        STATE.isImageLoading = false;
        renderSimulationDisplay();  
      }
    }
    
    // Check if simulation ended
    if (!nextStepData.choices || nextStepData.choices.length === 0) {
      console.log("시뮬레이션이 종료되었습니다.");
      STATE.isSimulationEnded = true;
      // Add final turn to history only if it has a story and is different from last entry
      const lastEntry = STATE.simulationHistory[STATE.simulationHistory.length - 1];
      if (nextStepData.story && (!lastEntry || lastEntry.story !== nextStepData.story)) {
        STATE.simulationHistory.push({
          story: nextStepData.story,
          choiceMade: null,
          imageUrl: STATE.currentImageUrl,
          turn: STATE.currentTurn
        });
      }
    }
  } catch (err) {
    console.error("다음 단계 진행 오류:", err);
    const errorMessage = err instanceof Error ? err.message : "다음 단계를 가져오는 중 알 수 없는 오류가 발생했습니다.";
    if (errorMessage.includes("API 키가 유효하지 않습")) {
        localStorage.removeItem('gemini-api-key');
        STATE.isApiKeySet = false;
        STATE.error = "API 키가 유효하지 않거나 만료되었습니다. 새 키를 입력해주세요.";
    } else {
        STATE.error = errorMessage;
    }
  } finally {
    STATE.isLoading = false;
    updateFullUI();
  }
}

async function handleSaveApiKey(event) {
  const apiKey = ELEMENTS.apiKeyInput.value.trim();
  
  // Validate API key format
  if (!apiKey) {
    STATE.error = "API 키를 입력해주세요.";
    updateFullUI();
    return;
  }
  
  if (apiKey.length < 10) {
    STATE.error = "API 키가 너무 짧습니다. 올바른 API 키를 입력해주세요.";
    updateFullUI();
    return;
  }
  
  try {
    console.log("API 키 저장 시작...");
    geminiService.init(apiKey);
    localStorage.setItem('gemini-api-key', apiKey);
    STATE.isApiKeySet = true;
    STATE.error = null;
    // Don't clear the input field - it will be hidden anyway
    console.log("✅ API 키가 성공적으로 저장되었습니다.");
    console.log("isApiKeySet:", STATE.isApiKeySet);
    // Update button text immediately
    ELEMENTS.startSimulationButton.textContent = '시뮬레이션 시작하기 ✨';
  } catch (e) {
    console.error("❌ API 키 설정 오류:", e);
    STATE.error = "API 키 설정 중 오류가 발생했습니다: " + (e as Error).message;
    STATE.isApiKeySet = false;
  }
  updateFullUI();
}

function handleChangeApiKey(event) {
  event.preventDefault();
  const confirmChange = confirm("API 키를 변경하시겠습니까? 현재 키가 삭제되며 새로 입력해야 합니다.");
  if (confirmChange) {
      localStorage.removeItem('gemini-api-key');
      STATE.isApiKeySet = false;
      STATE.currentStep = null;
      STATE.currentImageUrl = null;
      STATE.previousImagePrompt = null;
      STATE.simulationHistory = [];
      STATE.currentTurn = 0;
      STATE.isSimulationEnded = false;
      STATE.error = null;
      updateFullUI();
  }
}

function handleCustomInput(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const customInput = ELEMENTS.userCustomInput.value.trim();
  if (!customInput) {
    // Highlight the input field instead of showing alert
    ELEMENTS.userCustomInput.focus();
    ELEMENTS.userCustomInput.style.borderColor = '#ef4444';
    setTimeout(() => {
      ELEMENTS.userCustomInput.style.borderColor = '';
    }, 2000);
    return;
  }
  
  console.log("사용자 의견 제출:", customInput);
  handleChoice(customInput);
}

let isDownloading = false;

function handleDownloadStory() {
  // Prevent duplicate downloads
  if (isDownloading) {
    console.log("Download already in progress, skipping...");
    return;
  }
  
  isDownloading = true;
  
  console.log("=== Download Story Debug ===");
  console.log("Total history entries:", STATE.simulationHistory.length);
  console.log("Current turn:", STATE.currentTurn);
  console.log("Is simulation ended:", STATE.isSimulationEnded);
  
  if (STATE.simulationHistory.length === 0) {
    alert("다운로드할 이야기가 없습니다. 시뮬레이션을 먼저 진행해주세요.");
    isDownloading = false;
    return;
  }
  
  // Allow download as long as we have at least one history entry
  // No need for additional validation since history is only populated after simulation starts
  
  STATE.simulationHistory.forEach((entry, idx) => {
    console.log(`Entry ${idx}: Turn ${entry.turn}, Story: "${entry.story.substring(0, 50)}...", Choice: "${entry.choiceMade}"`);
  });
  
  // Build complete history including current step if simulation ended
  let completeHistory = [...STATE.simulationHistory];
  
  // If simulation ended and current step exists, make sure it's in history
  if (STATE.isSimulationEnded && STATE.currentStep && STATE.currentStep.story) {
    const lastEntry = completeHistory[completeHistory.length - 1];
    // Add current step if it's not already the last entry
    if (!lastEntry || lastEntry.story !== STATE.currentStep.story) {
      completeHistory.push({
        story: STATE.currentStep.story,
        choiceMade: null,
        imageUrl: STATE.currentImageUrl,
        turn: STATE.currentTurn
      });
    }
  }
  
  // Filter out duplicate entries based on turn number AND story content
  const uniqueHistory = [];
  const seenEntries = new Set();
  
  completeHistory.forEach((entry, index) => {
    // Create unique key using turn number and first 100 chars of story
    const uniqueKey = `${entry.turn || (index + 1)}_${entry.story.substring(0, 100)}`;
    if (!seenEntries.has(uniqueKey)) {
      seenEntries.add(uniqueKey);
      uniqueHistory.push(entry);
    }
  });
  
  console.log("Complete history entries:", completeHistory.length);
  console.log("Unique history entries:", uniqueHistory.length);
  
  let htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>스토리리빙 시뮬레이션 - 이야기 여정</title>
  <style>
    @media print {
      body { background: white; padding: 5px; margin: 0; }
      .no-print { display: none; }
      .turn { page-break-inside: avoid; margin: 8px 0 !important; padding: 12px !important; }
      h1 { margin-top: 0; padding-top: 0; font-size: 18px; margin-bottom: 6px; padding-bottom: 6px; }
      .info-section { margin: 4px 0 !important; page-break-after: avoid; }
      .info-section p { margin: 2px 0 !important; font-size: 11px; }
      .print-instructions { display: none; }
      .turn-header { font-size: 12px; margin-bottom: 6px; }
      .story { margin: 8px 0 !important; font-size: 12px; line-height: 1.6; }
      .choice { margin-top: 6px !important; padding: 6px !important; font-size: 11px; }
      img { max-width: 100%; margin: 8px 0 !important; }
      .footer { margin-top: 20px; font-size: 10px; }
    }
    body { font-family: 'Gowun Dodum', 'Pretendard', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f9fafb; }
    h1 { color: #2d6e56; text-align: center; border-bottom: 3px solid #c9325a; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px; }
    .print-instructions { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 2px solid #f59e0b; }
    .print-instructions strong { color: #b45309; }
    .info-section { text-align: center; margin: 10px 0; color: #64748b; }
    .info-section p { margin: 5px 0; }
    .turn { background: white; margin: 20px 0; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .turn-header { font-weight: bold; color: #c9325a; margin-bottom: 10px; font-size: 14px; }
    .story { line-height: 1.8; color: #334155; margin: 15px 0; white-space: pre-wrap; }
    .choice { background: #fef3c7; padding: 10px; border-left: 4px solid #b38b56; margin-top: 10px; font-style: italic; }
    img { max-width: 100%; border-radius: 8px; margin: 15px 0; }
    .footer { text-align: center; margin-top: 40px; color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <h1>✨ 스토리리빙 시뮬레이션 - 이야기 여정 ✨</h1>
  
  <div class="print-instructions no-print">
    <strong>📄 PDF로 저장하기:</strong> 브라우저에서 <strong>Ctrl + P</strong> (또는 Cmd + P)를 누르고 <strong>"PDF로 저장"</strong>을 선택하세요.
  </div>
  
  <div class="info-section">
    <p><strong>시뮬레이션 유형:</strong> ${STATE.simulationType}</p>
    <p><strong>대상 학습자:</strong> ${STATE.targetAudience}</p>
    ${STATE.customTopic ? `<p><strong>주제:</strong> ${STATE.customTopic}</p>` : ''}
    ${STATE.learningGoal ? `<p><strong>학습 목표:</strong> ${STATE.learningGoal}</p>` : ''}
  </div>
`;

  uniqueHistory.forEach((entry, index) => {
    htmlContent += `
  <div class="turn">
    <div class="turn-header">🎯 턴 ${entry.turn || index + 1}</div>
    ${entry.imageUrl ? `<img src="${entry.imageUrl}" alt="턴 ${entry.turn || index + 1} 이미지">` : ''}
    <div class="story">${entry.story}</div>
    ${entry.choiceMade ? `<div class="choice">💭 선택: ${entry.choiceMade}</div>` : ''}
  </div>
`;
  });

  htmlContent += `
  <div class="footer">
    <p>스토리리빙 시뮬레이션 © ${new Date().getFullYear()} 김진관 (닷커넥터)</p>
    <p>생성 일시: ${new Date().toLocaleString('ko-KR')}</p>
  </div>
</body>
</html>
`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `스토리리빙_시뮬레이션_${new Date().getTime()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Reset flag after download
  setTimeout(() => {
    isDownloading = false;
  }, 1000);
  
  // Show instructions to user
  setTimeout(() => {
    alert('HTML 파일이 다운로드되었습니다!\n\nPDF로 변환하려면:\n1. 다운로드한 HTML 파일을 브라우저로 열기\n2. Ctrl + P (또는 Cmd + P) 누르기\n3. "PDF로 저장" 선택하기');
  }, 500);
}

function handleRestartSimulation() {
  const confirmRestart = confirm("처음부터 다시 시작하시겠습니까? 현재 진행 중인 시뮬레이션은 저장되지 않습니다.");
  if (confirmRestart) {
    STATE.currentStep = null;
    STATE.currentImageUrl = null;
    STATE.previousImagePrompt = null; // Reset for new simulation
    STATE.simulationHistory = [];
    STATE.currentTurn = 0;
    STATE.isSimulationEnded = false;
    STATE.error = null;
    updateFullUI();
  }
}

let isConfigPanelInitialized = false;

function initializeConfigPanel() {
  if (isConfigPanelInitialized) {
    console.log("Config panel already initialized, skipping...");
    return;
  }
  
  // Clear existing options to prevent duplicates
  ELEMENTS.simulationTypeSelect.innerHTML = '';
  ELEMENTS.targetAudienceSelect.innerHTML = '';
  
  SIMULATION_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    ELEMENTS.simulationTypeSelect.appendChild(option);
  });

  TARGET_AUDIENCES.forEach(audience => {
    const option = document.createElement('option');
    option.value = audience;
    option.textContent = audience;
    ELEMENTS.targetAudienceSelect.appendChild(option);
  });

  ELEMENTS.customTopicInput.value = STATE.customTopic;
  ELEMENTS.learningGoalInput.value = STATE.learningGoal;
  ELEMENTS.maxTurnsInput.value = STATE.maxTurns.toString();
  ELEMENTS.simulationTypeSelect.value = STATE.simulationType;
  ELEMENTS.targetAudienceSelect.value = STATE.targetAudience;

  ELEMENTS.customTopicInput.addEventListener('change', (e) => STATE.customTopic = (e.target as HTMLInputElement).value);
  ELEMENTS.learningGoalInput.addEventListener('change', (e) => STATE.learningGoal = (e.target as HTMLInputElement).value);
  ELEMENTS.maxTurnsInput.addEventListener('change', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    if (!isNaN(value) && value >= 3 && value <= 10) {
      STATE.maxTurns = value;
    }
  });
  ELEMENTS.simulationTypeSelect.addEventListener('change', (e) => STATE.simulationType = (e.target as HTMLSelectElement).value);
  ELEMENTS.targetAudienceSelect.addEventListener('change', (e) => STATE.targetAudience = (e.target as HTMLSelectElement).value);
  
  // Handle config panel form submission - start simulation only
  ELEMENTS.configPanelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleStartSimulation(e);
  });
  
  isConfigPanelInitialized = true;
  console.log("Config panel initialized");
}

let isAppInitialized = false;

function initializeApp() {
  if (isAppInitialized) {
    console.log("App already initialized, skipping...");
    return;
  }
  
  // Initialize API key form
  ELEMENTS.apiKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSaveApiKey(e);
  });
  
  initializeConfigPanel();
  ELEMENTS.currentYear.textContent = new Date().getFullYear().toString();

  // Remove existing listeners before adding new ones to prevent duplicates
  ELEMENTS.changeApiKeyButton.removeEventListener('click', handleChangeApiKey);
  ELEMENTS.submitCustomInput.removeEventListener('click', handleCustomInput);
  ELEMENTS.downloadStoryButton.removeEventListener('click', handleDownloadStory);
  ELEMENTS.restartSimulationButton.removeEventListener('click', handleRestartSimulation);
  
  ELEMENTS.changeApiKeyButton.addEventListener('click', handleChangeApiKey);
  ELEMENTS.submitCustomInput.addEventListener('click', handleCustomInput);
  ELEMENTS.downloadStoryButton.addEventListener('click', handleDownloadStory);
  ELEMENTS.restartSimulationButton.addEventListener('click', handleRestartSimulation);
  
  const savedApiKey = localStorage.getItem('gemini-api-key');
  if (savedApiKey) {
    try {
      geminiService.init(savedApiKey);
      STATE.isApiKeySet = true;
    } catch (e) {
      console.error("저장된 API 키로 초기화 실패:", e);
      localStorage.removeItem('gemini-api-key');
      STATE.isApiKeySet = false;
      STATE.error = "저장된 API 키를 불러오는 데 실패했습니다. 다시 입력해주세요.";
    }
  }

  updateFullUI();
  isAppInitialized = true;
  console.log("App initialized");
}

document.addEventListener('DOMContentLoaded', initializeApp);
