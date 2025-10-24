
import { SIMULATION_TYPES, TARGET_AUDIENCES } from './constants.js';
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
  currentStep: null, // { story, imagePrompt, choices }
  currentImageUrl: null,
  simulationHistory: [], // [{ story, choiceMade }]
  isLoading: false,
  isInitialLoading: false,
  isImageLoading: false,
  isApiKeySet: false,
  error: null,
};

const ELEMENTS = {
  // API Key Panel
  apiPanel: document.getElementById('api-key-panel') as HTMLFormElement,
  apiKeyInput: document.getElementById('apiKeyInput') as HTMLInputElement,
  saveApiKeyButton: document.getElementById('save-api-key-button') as HTMLButtonElement,
  changeApiKeyButton: document.getElementById('change-api-key-button') as HTMLButtonElement,

  // Config Panel
  configPanelForm: document.getElementById('config-panel') as HTMLFormElement,
  customTopicInput: document.getElementById('customTopic') as HTMLInputElement,
  learningGoalInput: document.getElementById('learningGoal') as HTMLInputElement,
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
  imageLoadingSpinner: document.getElementById('image-loading-spinner') as HTMLElement,
  simulationImageContainer: document.getElementById('simulation-image-container') as HTMLElement,
  simulationImage: document.getElementById('simulation-image') as HTMLImageElement,
  noImagePlaceholder: document.getElementById('no-image-placeholder') as HTMLElement,
  simulationStoryContainer: document.getElementById('simulation-story-container') as HTMLElement,
  simulationStoryText: document.getElementById('simulation-story-text') as HTMLElement,
  nextStepLoadingSpinner: document.getElementById('next-step-loading-spinner') as HTMLElement,
  simulationChoicesContainer: document.getElementById('simulation-choices-container') as HTMLElement,
  simulationChoices: document.getElementById('simulation-choices') as HTMLElement,
  simulationEndMessage: document.getElementById('simulation-end-message') as HTMLElement,

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
    ELEMENTS.startSimulationButton.textContent = '시뮬레이션 시작하기 ✨';
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

  // Disable choice buttons while loading next step
  const choiceButtons = ELEMENTS.simulationChoices.querySelectorAll('button');
  choiceButtons.forEach(button => button.disabled = (STATE.isLoading && !STATE.isInitialLoading));
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
  if (STATE.currentStep.choices && STATE.currentStep.choices.length > 0) {
    ELEMENTS.simulationChoicesContainer.style.display = 'block';
    ELEMENTS.simulationEndMessage.style.display = 'none';
    STATE.currentStep.choices.forEach(choiceText => {
      const button = document.createElement('button');
      button.className = "w-full text-left p-4 bg-white hover:bg-sky-50 border border-slate-300 hover:border-sky-400 rounded-lg shadow-sm transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-75 disabled:opacity-70 disabled:cursor-not-allowed group";
      
      const span = document.createElement('span');
      span.className = "text-slate-700 group-hover:text-sky-700 transition-colors";
      span.textContent = choiceText;
      button.appendChild(span);
      
      button.addEventListener('click', () => handleChoice(choiceText));
      ELEMENTS.simulationChoices.appendChild(button);
    });
  } else {
    ELEMENTS.simulationChoicesContainer.style.display = 'none';
    ELEMENTS.simulationEndMessage.style.display = 'block'; 
  }
  renderLoadingState(); 
}

function updateFullUI() {
  if (STATE.isApiKeySet) {
    ELEMENTS.apiPanel.style.display = 'none';
    ELEMENTS.changeApiKeyButton.style.display = 'inline-block';

    if (STATE.isInitialLoading) {
      ELEMENTS.configPanelForm.style.display = 'none';
      ELEMENTS.simulationDisplayArea.style.display = 'none';
    } else {
      ELEMENTS.configPanelForm.style.display = 'block';
      renderSimulationDisplay();
    }
  } else {
    ELEMENTS.apiPanel.style.display = 'block';
    ELEMENTS.configPanelForm.style.display = 'none';
    ELEMENTS.simulationDisplayArea.style.display = 'none';
    ELEMENTS.changeApiKeyButton.style.display = 'none';
    if (STATE.isInitialLoading) {
      STATE.isInitialLoading = false;
    }
  }
  
  renderLoadingState();
  renderErrorState();
}

async function handleStartSimulation(event) {
  event.preventDefault();
  
  STATE.isInitialLoading = true;
  STATE.isLoading = true;
  STATE.error = null;
  STATE.currentStep = null;
  STATE.currentImageUrl = null;
  STATE.simulationHistory = [];
  currentMessageIndex = 0;
  updateFullUI();

  try {
    const initialStepData = await geminiService.generateInitialSimulationStep(
      STATE.simulationType,
      STATE.targetAudience,
      STATE.customTopic,
      STATE.learningGoal
    );
    STATE.currentStep = initialStepData;
    STATE.simulationHistory = [{ story: initialStepData.story, choiceMade: "시뮬레이션 시작" }];

    if (initialStepData.imagePrompt) {
      STATE.isImageLoading = true;
      const imageUrl = await geminiService.generateImage(initialStepData.imagePrompt);
      STATE.currentImageUrl = imageUrl;
      STATE.isImageLoading = false;
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
  
  const newHistoryEntry = {
    story: STATE.currentStep.story,
    choiceMade: choice,
  };
  STATE.simulationHistory.push(newHistoryEntry);

  try {
    const nextStepData = await geminiService.generateNextSimulationStep(
      STATE.simulationType,
      STATE.targetAudience,
      STATE.simulationHistory,
      STATE.customTopic 
    );
    STATE.currentStep = nextStepData;
    STATE.currentImageUrl = null; 

    if (nextStepData.imagePrompt) {
      STATE.isImageLoading = true;
      const imageUrl = await geminiService.generateImage(nextStepData.imagePrompt);
      STATE.currentImageUrl = imageUrl;
      STATE.isImageLoading = false;
    }
    
    if (!nextStepData.choices || nextStepData.choices.length === 0) {
      console.log("시뮬레이션이 종료되었거나 선택지가 없습니다.");
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
  event.preventDefault();
  const apiKey = ELEMENTS.apiKeyInput.value.trim();
  if (!apiKey) {
    STATE.error = "API 키를 입력해주세요.";
    updateFullUI();
    return;
  }
  try {
    geminiService.init(apiKey);
    localStorage.setItem('gemini-api-key', apiKey);
    STATE.isApiKeySet = true;
    STATE.error = null;
    ELEMENTS.apiKeyInput.value = '';
  } catch (e) {
    STATE.error = "API 키 설정 중 오류가 발생했습니다: " + (e as Error).message;
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
      STATE.simulationHistory = [];
      STATE.error = null;
      updateFullUI();
  }
}

function initializeConfigPanel() {
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
  ELEMENTS.simulationTypeSelect.value = STATE.simulationType;
  ELEMENTS.targetAudienceSelect.value = STATE.targetAudience;

  ELEMENTS.customTopicInput.addEventListener('change', (e) => STATE.customTopic = (e.target as HTMLInputElement).value);
  ELEMENTS.learningGoalInput.addEventListener('change', (e) => STATE.learningGoal = (e.target as HTMLInputElement).value);
  ELEMENTS.simulationTypeSelect.addEventListener('change', (e) => STATE.simulationType = (e.target as HTMLSelectElement).value);
  ELEMENTS.targetAudienceSelect.addEventListener('change', (e) => STATE.targetAudience = (e.target as HTMLSelectElement).value);
  ELEMENTS.configPanelForm.addEventListener('submit', handleStartSimulation);
}

function initializeApp() {
  initializeConfigPanel();
  ELEMENTS.currentYear.textContent = new Date().getFullYear().toString();

  ELEMENTS.saveApiKeyButton.addEventListener('click', handleSaveApiKey);
  ELEMENTS.apiPanel.addEventListener('submit', handleSaveApiKey);
  ELEMENTS.changeApiKeyButton.addEventListener('click', handleChangeApiKey);
  
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
}

document.addEventListener('DOMContentLoaded', initializeApp);
