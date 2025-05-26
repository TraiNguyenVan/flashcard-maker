/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, GenerateContentResponse} from '@google/genai';

interface Flashcard {
  term: string;
  definition: string;
}

// For lessons stored locally by the user ("My Lessons")
interface UserLesson {
  id: string; // Unique local ID
  name: string;
  flashcards: Flashcard[];
  sharedToCommunityWithId?: string; // If shared, this is its ID in the community pool
  copiedFromCommunityLessonId?: string; // Optional: ID of the community lesson it was copied from
}

// For lessons in the shared Community Pool
interface CommunityLesson {
  communityId: string; // Unique ID in the community pool
  name: string;
  flashcards: Flashcard[];
  sharedBy: string;
  sharedTimestamp: number;
}


// --- DOM Elements ---
// Navigation
const navGeneratorButton = document.getElementById('navGenerator') as HTMLButtonElement;
const navQuizButton = document.getElementById('navQuiz') as HTMLButtonElement;
const navSavedLessonsButton = document.getElementById('navSavedLessons') as HTMLButtonElement;
const navButtons = [navGeneratorButton, navQuizButton, navSavedLessonsButton];

// Main Sections
const generatorSection = document.getElementById('generatorSection') as HTMLDivElement;
const quizSection = document.getElementById('quizSection') as HTMLDivElement;
const savedLessonsSection = document.getElementById('savedLessonsSection') as HTMLDivElement;
const mainSections = [generatorSection, quizSection, savedLessonsSection];

// Generator Section Elements
const generatorControls = document.getElementById('generatorControls') as HTMLDivElement;
const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const saveLessonButton = document.getElementById('saveLessonButton') as HTMLButtonElement;
const startQuizButton = document.getElementById('startQuizButton') as HTMLButtonElement;


// Save Lesson Dialog Elements
const saveLessonDialogContainer = document.getElementById('saveLessonDialogContainer') as HTMLDivElement;
const lessonNameInput = document.getElementById('lessonNameInput') as HTMLInputElement;
const confirmSaveLessonButton = document.getElementById('confirmSaveLessonButton') as HTMLButtonElement;
const cancelSaveLessonButton = document.getElementById('cancelSaveLessonButton') as HTMLButtonElement;


// Quiz Section Elements
const quizScoreDisplay = document.getElementById('quizScore') as HTMLDivElement;
const quizMessage = document.getElementById('quizMessage') as HTMLParagraphElement;
const quizQuestionContainer = document.getElementById('quizQuestionContainer') as HTMLDivElement;
const quizQuestionTypeDisplay = document.getElementById('quizQuestionType') as HTMLParagraphElement;
const quizQuestionDisplay = document.getElementById('quizQuestion') as HTMLParagraphElement;
const quizOptionsContainer = document.getElementById('quizOptionsContainer') as HTMLDivElement;
const quizFeedbackDisplay = document.getElementById('quizFeedback') as HTMLDivElement;
const nextQuestionButton = document.getElementById('nextQuestionButton') as HTMLButtonElement;
const quizEndControls = document.getElementById('quizEndControls') as HTMLDivElement;
const finalScoreMessage = document.getElementById('finalScoreMessage') as HTMLParagraphElement;
const restartQuizButton = document.getElementById('restartQuizButton') as HTMLButtonElement;
const backToGeneratorButton = document.getElementById('backToGeneratorButton') as HTMLButtonElement;

// Saved Lessons Section Elements
const myLessonsTabButton = document.getElementById('myLessonsTabButton') as HTMLButtonElement;
const communityPoolTabButton = document.getElementById('communityPoolTabButton') as HTMLButtonElement;
const savedLessonsListContainer = document.getElementById('savedLessonsListContainer') as HTMLDivElement;
const communityPoolListContainer = document.getElementById('communityPoolListContainer') as HTMLDivElement;
const savedLessonsUserMessage = document.getElementById('savedLessonsUserMessage') as HTMLDivElement;


const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const LOCAL_STORAGE_KEY = 'flashcardAppSavedLessons';
const COMMUNITY_POOL_STORAGE_KEY = 'flashcardAppCommunityPool';

let currentFlashcards: Flashcard[] = [];
let savedLessons: UserLesson[] = [];
let communityPoolLessons: CommunityLesson[] = [];
let currentSavedLessonsView: 'my' | 'community' = 'my';

let shuffledQuizCards: Flashcard[] = [];
let currentQuizQuestionIndex = 0;
let userScore = 0;
let currentQuestionShowsTerm = true;
let isQuizActive = false;


// --- Navigation ---
function showSection(sectionId: 'generator' | 'quiz' | 'savedLessons') {
  mainSections.forEach(section => section.style.display = 'none');
  navButtons.forEach(button => {
    button.classList.remove('active');
    button.removeAttribute('aria-current');
  });

  let activeNavButton: HTMLButtonElement;

  if (sectionId === 'generator') {
    generatorSection.style.display = 'block';
    activeNavButton = navGeneratorButton;
    if (saveLessonDialogContainer.style.display === 'block') {
        hideSaveLessonDialog();
        errorMessage.textContent = '';
    }
    generatorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (sectionId === 'quiz') {
    quizSection.style.display = 'block';
    activeNavButton = navQuizButton;
    updateQuizView();
    quizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else { // savedLessons
    savedLessonsSection.style.display = 'block';
    activeNavButton = navSavedLessonsButton;
    if (currentSavedLessonsView === 'my') {
        showMyLessonsTab();
    } else {
        showCommunityPoolTab();
    }
    savedLessonsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  activeNavButton.classList.add('active');
  activeNavButton.setAttribute('aria-current', 'page');
}

navGeneratorButton.addEventListener('click', () => showSection('generator'));
navQuizButton.addEventListener('click', () => showSection('quiz'));
navSavedLessonsButton.addEventListener('click', () => showSection('savedLessons'));


// --- Saved Lessons & Community Pool ---
async function saveLessonToFile(lesson: UserLesson): Promise<void> {
  try {
    const response = await fetch('/api/save-lesson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lesson),
    });
    
    if (!response.ok) {
      throw new Error('Failed to save lesson to file');
    }
  } catch (error) {
    console.error('Error saving lesson to file:', error);
    throw error;
  }
}

async function loadLessonsFromFiles(): Promise<UserLesson[]> {
  try {
    const response = await fetch('/api/load-lessons');
    if (!response.ok) {
      throw new Error('Failed to load lessons from files');
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading lessons from files:', error);
    return [];
  }
}

async function saveLessonsToStorage() {
  try {
    // Save to localStorage for backward compatibility
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedLessons));
    
    // Save each lesson to a separate file
    for (const lesson of savedLessons) {
      await saveLessonToFile(lesson);
    }
  } catch (error) {
    console.error('Error saving lessons:', error);
    displaySavedLessonsUserMessage('Error saving lessons. Please try again.', true);
  }
}

async function loadSavedLessonsFromStorage() {
  try {
    // Try to load from files first
    const fileLessons = await loadLessonsFromFiles();
    if (fileLessons.length > 0) {
      savedLessons = fileLessons;
    } else {
      // Fallback to localStorage
      const storedLessons = localStorage.getItem(LOCAL_STORAGE_KEY);
      savedLessons = storedLessons ? JSON.parse(storedLessons) : [];
    }
  } catch (error) {
    console.error('Error loading lessons:', error);
    // Fallback to localStorage
    const storedLessons = localStorage.getItem(LOCAL_STORAGE_KEY);
    savedLessons = storedLessons ? JSON.parse(storedLessons) : [];
  }
}

async function loadCommunityLessons() {
  try {
    const response = await fetch('/api/community/lessons');
    if (!response.ok) {
      throw new Error('Failed to load community lessons');
    }
    communityPoolLessons = await response.json();
  } catch (error) {
    console.error('Error loading community lessons:', error);
    communityPoolLessons = [];
  }
}

function saveCommunityLessons() {
    localStorage.setItem(COMMUNITY_POOL_STORAGE_KEY, JSON.stringify(communityPoolLessons));
}

function displaySavedLessonsUserMessage(message: string, isError: boolean = false) {
    savedLessonsUserMessage.textContent = message;
    savedLessonsUserMessage.style.color = isError ? 'var(--light-error, #d93025)' : 'var(--light-text-secondary, #5f6368)';
    if (message) {
        setTimeout(() => {
            if (savedLessonsUserMessage.textContent === message) {
                savedLessonsUserMessage.textContent = '';
            }
        }, 3000);
    }
}


function renderMyLessonsList() {
  savedLessonsListContainer.innerHTML = '';
  if (savedLessons.length === 0) {
    const noLessonsMessage = document.createElement('p');
    noLessonsMessage.textContent = 'You have no saved lessons yet. Create some in the Generator or copy from the Community Pool!';
    noLessonsMessage.classList.add('no-lessons-message');
    savedLessonsListContainer.appendChild(noLessonsMessage);
    return;
  }

  const ul = document.createElement('ul');
  ul.setAttribute('aria-label', 'List of your saved lessons');
  ul.style.listStyleType = 'none';
  ul.style.paddingLeft = '0';

  savedLessons.forEach(lesson => {
    const li = document.createElement('li');
    li.classList.add('saved-lesson-item');
    li.setAttribute('role', 'listitem');

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('saved-lesson-item-name');
    nameSpan.textContent = lesson.name;

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('actions');

    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load';
    loadButton.classList.add('button-secondary');
    loadButton.setAttribute('aria-label', `Load lesson: ${lesson.name}`);
    loadButton.addEventListener('click', () => handleLoadLesson(lesson.id));

    const shareButton = document.createElement('button');
    shareButton.classList.add('button-secondary');
    if (lesson.sharedToCommunityWithId) {
        shareButton.textContent = 'Unshare';
        shareButton.setAttribute('aria-label', `Unshare lesson: ${lesson.name} from community pool`);
        shareButton.addEventListener('click', () => handleUnshareLesson(lesson.id));
    } else {
        shareButton.textContent = 'Share';
        shareButton.setAttribute('aria-label', `Share lesson: ${lesson.name} to community pool`);
        shareButton.addEventListener('click', () => handleShareLesson(lesson.id));
    }
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.classList.add('button-secondary');
    deleteButton.setAttribute('aria-label', `Delete lesson: ${lesson.name}`);
    deleteButton.addEventListener('click', () => handleDeleteLesson(lesson.id));

    actionsDiv.appendChild(loadButton);
    actionsDiv.appendChild(shareButton);
    actionsDiv.appendChild(deleteButton);
    li.appendChild(nameSpan);
    li.appendChild(actionsDiv);
    ul.appendChild(li);
  });
  savedLessonsListContainer.appendChild(ul);
}

function renderCommunityPoolList() {
    communityPoolListContainer.innerHTML = '';
    if (communityPoolLessons.length === 0) {
        const noLessonsMessage = document.createElement('p');
        noLessonsMessage.textContent = 'The Community Pool is empty. Be the first to share a lesson!';
        noLessonsMessage.classList.add('no-lessons-message');
        communityPoolListContainer.appendChild(noLessonsMessage);
        return;
    }

    const ul = document.createElement('ul');
    ul.setAttribute('aria-label', 'List of community lessons');
    ul.style.listStyleType = 'none';
    ul.style.paddingLeft = '0';

    // Sort by most recent first
    const sortedCommunityLessons = [...communityPoolLessons].sort((a,b) => b.sharedTimestamp - a.sharedTimestamp);

    sortedCommunityLessons.forEach(lesson => {
        const li = document.createElement('li');
        li.classList.add('saved-lesson-item', 'community-lesson-item');
        li.setAttribute('role', 'listitem');

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('community-lesson-details');

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('saved-lesson-item-name');
        nameSpan.textContent = lesson.name;

        const sharedBySpan = document.createElement('span');
        sharedBySpan.classList.add('community-lesson-meta');
        sharedBySpan.textContent = `Shared by: ${lesson.sharedBy || 'Anonymous'} on ${new Date(lesson.sharedTimestamp).toLocaleDateString()}`;
        
        detailsDiv.appendChild(nameSpan);
        detailsDiv.appendChild(sharedBySpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('actions');

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy to My Lessons';
        copyButton.classList.add('button-secondary');
        copyButton.setAttribute('aria-label', `Copy lesson: ${lesson.name} to your lessons`);
        copyButton.addEventListener('click', () => handleCopyToMyLessons(lesson.communityId));
        
        actionsDiv.appendChild(copyButton);
        li.appendChild(detailsDiv);
        li.appendChild(actionsDiv);
        ul.appendChild(li);
    });
    communityPoolListContainer.appendChild(ul);
}

function showMyLessonsTab() {
    currentSavedLessonsView = 'my';
    myLessonsTabButton.classList.add('active');
    myLessonsTabButton.setAttribute('aria-selected', 'true');
    communityPoolTabButton.classList.remove('active');
    communityPoolTabButton.setAttribute('aria-selected', 'false');
    savedLessonsListContainer.style.display = 'block';
    communityPoolListContainer.style.display = 'none';
    renderMyLessonsList();
    displaySavedLessonsUserMessage(''); // Clear any previous messages
}

function showCommunityPoolTab() {
    currentSavedLessonsView = 'community';
    communityPoolTabButton.classList.add('active');
    communityPoolTabButton.setAttribute('aria-selected', 'true');
    myLessonsTabButton.classList.remove('active');
    myLessonsTabButton.setAttribute('aria-selected', 'false');
    communityPoolListContainer.style.display = 'block';
    savedLessonsListContainer.style.display = 'none';
    renderCommunityPoolList();
    displaySavedLessonsUserMessage(''); // Clear any previous messages
}

myLessonsTabButton.addEventListener('click', showMyLessonsTab);
communityPoolTabButton.addEventListener('click', showCommunityPoolTab);


async function handleShareLesson(userLessonId: string) {
    const lessonToShare = savedLessons.find(l => l.id === userLessonId);
    if (!lessonToShare) {
        displaySavedLessonsUserMessage('Error: Lesson not found.', true);
        return;
    }

    if (lessonToShare.sharedToCommunityWithId) {
        displaySavedLessonsUserMessage('This lesson is already shared. You can unshare it first.', true);
        return;
    }

    const sharedByName = prompt("Enter your name or alias to share this lesson (leave blank for 'Anonymous'):", "Anonymous")?.trim() || "Anonymous";
    
    const newCommunityId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const communityLesson: CommunityLesson = {
        communityId: newCommunityId,
        name: lessonToShare.name,
        flashcards: [...lessonToShare.flashcards], // Deep copy flashcards
        sharedBy: sharedByName,
        sharedTimestamp: Date.now()
    };

    communityPoolLessons.push(communityLesson);
    saveCommunityLessons();

    lessonToShare.sharedToCommunityWithId = newCommunityId;
    saveLessonsToStorage();

    displaySavedLessonsUserMessage(`Lesson "${lessonToShare.name}" shared to Community Pool!`);
    renderMyLessonsList(); // Re-render to update button text
    if (currentSavedLessonsView === 'community') renderCommunityPoolList(); // If community view is active, update it too
}

function handleUnshareLesson(userLessonId: string) {
    const lessonToUnshare = savedLessons.find(l => l.id === userLessonId);
    if (!lessonToUnshare || !lessonToUnshare.sharedToCommunityWithId) {
        displaySavedLessonsUserMessage('Error: Lesson not found or not shared.', true);
        return;
    }

    const communityIdToRemove = lessonToUnshare.sharedToCommunityWithId;
    communityPoolLessons = communityPoolLessons.filter(cl => cl.communityId !== communityIdToRemove);
    saveCommunityLessons();

    lessonToUnshare.sharedToCommunityWithId = undefined;
    saveLessonsToStorage();

    displaySavedLessonsUserMessage(`Lesson "${lessonToUnshare.name}" unshared from Community Pool.`);
    renderMyLessonsList();
    if (currentSavedLessonsView === 'community') renderCommunityPoolList();
}

function handleCopyToMyLessons(communityLessonId: string) {
    const lessonToCopy = communityPoolLessons.find(cl => cl.communityId === communityLessonId);
    if (!lessonToCopy) {
        displaySavedLessonsUserMessage('Error: Community lesson not found.', true);
        return;
    }

    // Check if a lesson with the same name already exists locally
    if (savedLessons.some(ul => ul.name.toLowerCase() === lessonToCopy.name.toLowerCase())) {
        if (!confirm(`A lesson named "${lessonToCopy.name}" already exists in your lessons. Do you want to copy it anyway? (It will be saved with the same name)`)) {
            return;
        }
    }


    const newUserLesson: UserLesson = {
        id: Date.now().toString(),
        name: lessonToCopy.name,
        flashcards: [...lessonToCopy.flashcards], // Deep copy
        sharedToCommunityWithId: undefined, // Not shared by default when copied
        copiedFromCommunityLessonId: lessonToCopy.communityId
    };

    savedLessons.push(newUserLesson);
    saveLessonsToStorage();

    displaySavedLessonsUserMessage(`Lesson "${lessonToCopy.name}" copied to My Lessons!`);
    if (currentSavedLessonsView === 'my') {
        renderMyLessonsList();
    }
    // Optionally, switch to My Lessons tab if not already there
    // showMyLessonsTab(); 
}


function showSaveLessonDialog(suggestedName: string) {
    lessonNameInput.value = suggestedName;
    generatorControls.style.display = 'none';
    flashcardsContainer.style.opacity = '0.3';
    flashcardsContainer.setAttribute('aria-hidden', 'true');
    saveLessonDialogContainer.style.display = 'block';
    errorMessage.textContent = 'Confirm or edit the lesson name below.';
    lessonNameInput.focus();
}

function hideSaveLessonDialog() {
    saveLessonDialogContainer.style.display = 'none';
    generatorControls.style.display = 'block';
    flashcardsContainer.style.opacity = '1';
    flashcardsContainer.removeAttribute('aria-hidden');
    saveLessonButton.disabled = false; 
    updateActionButtonsVisibility(); 
}


confirmSaveLessonButton.addEventListener('click', () => {
    const finalLessonName = lessonNameInput.value.trim();

    if (finalLessonName === "") {
        errorMessage.textContent = 'Lesson name cannot be empty. Please enter a name.';
        lessonNameInput.focus();
        setTimeout(() => {
            if (errorMessage.textContent === 'Lesson name cannot be empty. Please enter a name.') {
                errorMessage.textContent = 'Confirm or edit the lesson name below.';
            }
        }, 3000);
        return;
    }

    const newLesson: UserLesson = {
        id: Date.now().toString(),
        name: finalLessonName,
        flashcards: [...currentFlashcards]
    };

    savedLessons.push(newLesson);
    saveLessonsToStorage();
    
    hideSaveLessonDialog();
    errorMessage.textContent = `Lesson "${finalLessonName}" saved!`;
    setTimeout(() => { if (errorMessage.textContent === `Lesson "${finalLessonName}" saved!`) errorMessage.textContent = ''; }, 3000);
    if(currentSavedLessonsView === 'my') renderMyLessonsList(); // Update list if user is on that tab
});

cancelSaveLessonButton.addEventListener('click', () => {
    hideSaveLessonDialog();
    errorMessage.textContent = 'Save operation cancelled.';
    setTimeout(() => { if (errorMessage.textContent === 'Save operation cancelled.') errorMessage.textContent = ''; }, 3000);
});


async function handleSaveLesson() {
  if (currentFlashcards.length === 0) {
    errorMessage.textContent = 'No flashcards to save. Please generate some first.';
    setTimeout(() => { if (errorMessage.textContent === 'No flashcards to save. Please generate some first.') errorMessage.textContent = ''; }, 3000);
    return;
  }

  saveLessonButton.disabled = true; 
  const initialErrorMessage = errorMessage.textContent || "";
  let lessonNameFromInput = topicInput.value.trim();

  if (!lessonNameFromInput) {
    errorMessage.textContent = 'Generating a lesson name...';
    try {
      const namePrompt = `Suggest a concise and descriptive name (2-5 words) for a study lesson based on these flashcards. Return only the name itself, without any introductory phrases, quotation marks, or extra text.
Flashcards:
${currentFlashcards.slice(0, 3).map(fc => `- Term: "${fc.term}", Definition: "${fc.definition}"`).join('\n')}

Suggested Lesson Name:`;

      const result: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: namePrompt,
      });
      
      let aiSuggestedName = result.text?.trim();
      if (aiSuggestedName && /^["'](.*)["']$/.test(aiSuggestedName)) {
        aiSuggestedName = aiSuggestedName.substring(1, aiSuggestedName.length - 1);
      }

      if (aiSuggestedName) {
        showSaveLessonDialog(aiSuggestedName);
      } else {
        errorMessage.textContent = 'AI could not suggest a name. Please provide a name in the dialog.';
        saveLessonButton.disabled = false; 
        showSaveLessonDialog('Untitled Lesson ' + new Date().toLocaleDateString());
      }
    } catch (error: any) {
      console.error('Error suggesting lesson name:', error);
      errorMessage.textContent = `Error suggesting name: ${error.message || 'Unknown error'}. Please try saving again.`;
      saveLessonButton.disabled = false; 
       setTimeout(() => {
           if (errorMessage.textContent === `Error suggesting name: ${error.message || 'Unknown error'}. Please try saving again.`) {
               errorMessage.textContent = initialErrorMessage;
           }
       }, 5000);
       showSaveLessonDialog('Untitled Lesson ' + new Date().toLocaleDateString()); // Fallback dialog
    }
  } else {
    showSaveLessonDialog(lessonNameFromInput);
  }
}


function handleLoadLesson(lessonId: string) {
  const lessonToLoad = savedLessons.find(lesson => lesson.id === lessonId);
  if (lessonToLoad) {
    currentFlashcards = [...lessonToLoad.flashcards]; 
    topicInput.value = lessonToLoad.name;
    displayFlashcards(currentFlashcards);
    showSection('generator'); // Switch to generator section
    errorMessage.textContent = `Lesson "${lessonToLoad.name}" loaded.`;
    updateActionButtonsVisibility();
    setTimeout(() => { if (errorMessage.textContent === `Lesson "${lessonToLoad.name}" loaded.`) errorMessage.textContent = ''; }, 3000);
  } else {
    displaySavedLessonsUserMessage('Error: Could not load lesson.', true);
  }
}

async function handleDeleteLesson(lessonId: string) {
  const lessonToDelete = savedLessons.find(l => l.id === lessonId);
  if (!lessonToDelete) {
    displaySavedLessonsUserMessage('Error: Lesson not found.', true);
    return;
  }

  if (confirm(`Are you sure you want to delete the lesson "${lessonToDelete.name}"? This will also unshare it from the community pool if it's shared.`)) {
    try {
      // If the lesson is shared, unshare it first
      if (lessonToDelete.sharedToCommunityWithId) {
        await handleUnshareLesson(lessonId);
      }

      // Delete the lesson file
      const response = await fetch(`/api/lesson/${lessonId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete lesson');
      }

      // Update local state
      savedLessons = savedLessons.filter(lesson => lesson.id !== lessonId);
      await saveLessonsToStorage(); // Save the updated lessons list
      renderMyLessonsList();
      displaySavedLessonsUserMessage(`Lesson "${lessonToDelete.name}" deleted.`);
    } catch (error: unknown) {
      console.error('Error deleting lesson:', error);
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      displaySavedLessonsUserMessage(`Error deleting lesson: ${errorMessage}`, true);
    }
  }
}

saveLessonButton.addEventListener('click', handleSaveLesson);

// --- Flashcard Generation ---
generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    errorMessage.textContent = 'Please enter a topic or some terms and definitions.';
    flashcardsContainer.innerHTML = '';
    currentFlashcards = [];
    updateActionButtonsVisibility();
    return;
  }

  errorMessage.textContent = 'Generating flashcards...';
  flashcardsContainer.innerHTML = '';
  generateButton.disabled = true;
  startQuizButton.disabled = true; 
  saveLessonButton.disabled = true; 


  try {
    const prompt = `Generate a list of flashcards for the topic "${topic}". Each flashcard should have a term and a concise definition. Format the output as a list of "Term: Definition" pairs, with each pair on a new line. Ensure terms and definitions are distinct and clearly separated by a single colon. For example:\nTerm1: Definition1\nTerm2: Definition2\nAnother Term: Another Definition`;
    
    const result: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-04-17',
      contents: prompt,
    });
    
    const responseText = result.text ?? '';

    if (responseText) {
      const parsedFlashcards: Flashcard[] = responseText
        .split('\n')
        .map((line) => {
          const parts = line.split(':');
          if (parts.length >= 2 && parts[0].trim()) {
            const term = parts[0].trim();
            const definition = parts.slice(1).join(':').trim();
            if (definition) {
              return {term, definition};
            }
          }
          return null;
        })
        .filter((card): card is Flashcard => card !== null && card.term.toLowerCase() !== 'term' && card.definition.toLowerCase() !== 'definition');

      if (parsedFlashcards.length > 0) {
        currentFlashcards = parsedFlashcards;
        errorMessage.textContent = '';
        displayFlashcards(currentFlashcards);
      } else {
        errorMessage.textContent = 'No valid flashcards could be generated. Please check the format or try a different topic.';
        currentFlashcards = [];
      }
    } else {
      errorMessage.textContent = 'Failed to generate flashcards or received an empty response. Please try again.';
      currentFlashcards = [];
    }
  } catch (error: unknown) {
    console.error('Error generating content:', error);
    const detailedError = (error as Error)?.message || 'An unknown error occurred';
    errorMessage.textContent = `An error occurred: ${detailedError}`;
    currentFlashcards = [];
  } finally {
    generateButton.disabled = false;
    updateActionButtonsVisibility(); 
  }
});

function displayFlashcards(flashcards: Flashcard[]) {
  flashcardsContainer.innerHTML = '';
  flashcards.forEach((flashcard, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('flashcard');
    cardDiv.setAttribute('aria-label', `Flashcard ${index + 1}: ${flashcard.term}. Click to see definition.`);
    cardDiv.tabIndex = 0;

    const cardInner = document.createElement('div');
    cardInner.classList.add('flashcard-inner');

    const cardFront = document.createElement('div');
    cardFront.classList.add('flashcard-front');
    const termDiv = document.createElement('div');
    termDiv.classList.add('term');
    termDiv.textContent = flashcard.term;
    cardFront.appendChild(termDiv);

    const cardBack = document.createElement('div');
    cardBack.classList.add('flashcard-back');
    const definitionDiv = document.createElement('div');
    definitionDiv.classList.add('definition');
    definitionDiv.textContent = flashcard.definition;
    cardBack.appendChild(definitionDiv);

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardDiv.appendChild(cardInner);
    flashcardsContainer.appendChild(cardDiv);

    const flipCard = () => cardDiv.classList.toggle('flipped');
    cardDiv.addEventListener('click', flipCard);
    cardDiv.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            flipCard();
            e.preventDefault();
        }
    });
  });
  updateActionButtonsVisibility();
}

function updateActionButtonsVisibility() {
    const hasFlashcards = currentFlashcards.length > 0;
    const canStartQuiz = hasFlashcards && currentFlashcards.length >= 4;

    saveLessonButton.style.display = hasFlashcards ? 'inline-block' : 'none';
    saveLessonButton.disabled = !hasFlashcards || generateButton.disabled; 

    startQuizButton.style.display = canStartQuiz ? 'inline-block' : 'none';
    startQuizButton.disabled = !canStartQuiz || generateButton.disabled; 
    
    const quizRequirementMessage = 'At least 4 flashcards are needed to start a multiple-choice quiz. Please generate more or try a different topic.';
    
    const isOtherMessageActive = errorMessage.textContent &&
                                 !errorMessage.textContent.includes('Quiz Finished!') &&
                                 !errorMessage.textContent.includes('loaded.') &&
                                 !errorMessage.textContent.includes('deleted.') &&
                                 !errorMessage.textContent.includes('saved!') &&
                                 !errorMessage.textContent.includes('cancelled.') &&
                                 !errorMessage.textContent.includes('Generating flashcards...') &&
                                 !errorMessage.textContent.includes('Generating a lesson name...');

    if (hasFlashcards && !canStartQuiz && !isOtherMessageActive) {
        if (!errorMessage.textContent || errorMessage.textContent === '' || errorMessage.textContent === quizRequirementMessage) {
            errorMessage.textContent = quizRequirementMessage;
        }
    } else if (canStartQuiz && errorMessage.textContent === quizRequirementMessage) {
        errorMessage.textContent = ''; 
    }
}


// --- Quiz Logic ---
startQuizButton.addEventListener('click', () => {
  if (currentFlashcards.length < 4) {
    errorMessage.textContent = "At least 4 flashcards are needed to start a quiz with multiple choices.";
    return;
  }
  isQuizActive = true;
  startQuiz();
  showSection('quiz');
});

function startQuiz() {
  shuffledQuizCards = [...currentFlashcards].sort(() => Math.random() - 0.5);
  currentQuizQuestionIndex = 0;
  userScore = 0;
  updateQuizView(); 
}

function updateQuizView() {
    if (!isQuizActive) {
        quizMessage.style.display = 'block';
        quizQuestionContainer.style.display = 'none';
        quizOptionsContainer.style.display = 'none';
        quizFeedbackDisplay.textContent = '';
        nextQuestionButton.style.display = 'none';
        quizEndControls.style.display = 'none';
        quizScoreDisplay.textContent = 'Score: 0 / 0';
         if(quizMessage) quizMessage.textContent = 'Please generate or load flashcards and start a quiz from the Generator section.';
    } else if (currentQuizQuestionIndex >= shuffledQuizCards.length) {
        endQuiz();
    } else {
        quizMessage.style.display = 'none';
        quizQuestionContainer.style.display = 'flex'; 
        quizOptionsContainer.style.display = 'grid';
        quizFeedbackDisplay.textContent = '';
        quizFeedbackDisplay.className = 'quiz-feedback';
        nextQuestionButton.style.display = 'none';
        quizEndControls.style.display = 'none';
        displayQuizQuestion();
    }
}


function generateMcqOptions(correctCard: Flashcard, allCards: Flashcard[], questionShowsTerm: boolean): string[] {
    const correctAnswer = questionShowsTerm ? correctCard.definition : correctCard.term;
    let distractors: string[] = [];
    const potentialDistractorPool = allCards.filter(card => 
        (questionShowsTerm ? card.definition : card.term).toLowerCase() !== correctAnswer.toLowerCase() &&
        (questionShowsTerm ? card.definition : card.term).trim() !== ''
    );

    potentialDistractorPool.sort(() => Math.random() - 0.5);

    for (const card of potentialDistractorPool) {
        const distractorText = questionShowsTerm ? card.definition : card.term;
        if (distractors.length < 3 && !distractors.includes(distractorText) && distractorText.toLowerCase() !== correctAnswer.toLowerCase()) {
            distractors.push(distractorText);
        }
        if (distractors.length === 3) break;
    }
    
    while (distractors.length < 3) {
        const fallback = `Placeholder Option ${distractors.length + 1} (${Math.random().toString(36).substring(2, 5)})`;
        if (!distractors.includes(fallback) && correctAnswer !== fallback) {
             distractors.push(fallback);
        }
    }
    const options = [correctAnswer, ...distractors];
    return options.sort(() => Math.random() - 0.5);
}


function displayQuizQuestion() {
  const card = shuffledQuizCards[currentQuizQuestionIndex];
  currentQuestionShowsTerm = Math.random() < 0.5;

  if (currentQuestionShowsTerm) {
    quizQuestionTypeDisplay.textContent = 'What is the definition for this term?';
    quizQuestionDisplay.textContent = card.term;
  } else {
    quizQuestionTypeDisplay.textContent = 'What is the term for this definition?';
    quizQuestionDisplay.textContent = card.definition;
  }

  quizScoreDisplay.textContent = `Score: ${userScore} / ${shuffledQuizCards.length}`;
  quizOptionsContainer.innerHTML = '';

  const options = generateMcqOptions(card, currentFlashcards, currentQuestionShowsTerm);
  const correctAnswerText = currentQuestionShowsTerm ? card.definition : card.term;

  options.forEach(optionText => {
    const optionButton = document.createElement('button');
    optionButton.classList.add('quiz-option-button');
    optionButton.textContent = optionText;
    optionButton.setAttribute('role', 'radio');
    optionButton.setAttribute('aria-checked', 'false');
    optionButton.addEventListener('click', () => handleOptionClick(optionButton, optionText, correctAnswerText));
    quizOptionsContainer.appendChild(optionButton);
  });
   const firstOption = quizOptionsContainer.querySelector('.quiz-option-button') as HTMLButtonElement;
   if (firstOption) {
       firstOption.focus();
   }
}

function handleOptionClick(selectedButton: HTMLButtonElement, selectedAnswer: string, correctAnswer: string) {
  const optionButtons = quizOptionsContainer.querySelectorAll('.quiz-option-button') as NodeListOf<HTMLButtonElement>;
  optionButtons.forEach(button => {
    button.disabled = true;
    button.setAttribute('aria-checked', 'false');
    if (button.textContent === correctAnswer) {
        button.classList.add('correct-answer');
    }
  });

  selectedButton.setAttribute('aria-checked', 'true');

  if (selectedAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
    userScore++;
    quizFeedbackDisplay.textContent = 'Correct!';
    quizFeedbackDisplay.className = 'quiz-feedback correct';
  } else {
    selectedButton.classList.add('incorrect-answer');
    quizFeedbackDisplay.textContent = `Incorrect. The correct answer was: ${correctAnswer}`;
    quizFeedbackDisplay.className = 'quiz-feedback incorrect';
  }
  quizScoreDisplay.textContent = `Score: ${userScore} / ${shuffledQuizCards.length}`;
  
  if (currentQuizQuestionIndex < shuffledQuizCards.length -1) {
    nextQuestionButton.textContent = 'Next Question';
  } else {
    nextQuestionButton.textContent = 'Show Results';
  }
  nextQuestionButton.style.display = 'inline-block';
  nextQuestionButton.focus();
}


nextQuestionButton.addEventListener('click', () => {
  currentQuizQuestionIndex++;
  updateQuizView(); 
});

function endQuiz() {
  quizQuestionContainer.style.display = 'none';
  quizOptionsContainer.style.display = 'none';
  nextQuestionButton.style.display = 'none';
  quizFeedbackDisplay.textContent = '';

  finalScoreMessage.textContent = `Quiz Finished! Your final score: ${userScore} / ${shuffledQuizCards.length}`;
  quizEndControls.style.display = 'flex';
  restartQuizButton.focus();
}

restartQuizButton.addEventListener('click', () => {
  startQuiz(); 
});

backToGeneratorButton.addEventListener('click', () => {
  isQuizActive = false;
  quizMessage.style.display = 'block';
  quizQuestionContainer.style.display = 'none';
  quizOptionsContainer.style.display = 'none';
  quizFeedbackDisplay.textContent = '';
  nextQuestionButton.style.display = 'none';
  quizEndControls.style.display = 'none';
  quizScoreDisplay.textContent = 'Score: 0 / 0';
  if(quizMessage) quizMessage.textContent = 'Please generate or load flashcards and start a quiz from the Generator section.';

  showSection('generator');
  errorMessage.textContent = ''; 
  updateActionButtonsVisibility();
  topicInput.focus();
});

// --- Initialization ---
function initializeApp() {
    loadSavedLessonsFromStorage();
    loadCommunityLessons();
    showSection('generator'); 
    // Initial render of saved lessons depends on the default tab, which is 'my'
    showMyLessonsTab(); // This will also call renderMyLessonsList
    updateActionButtonsVisibility(); 
    updateQuizView(); 
}

initializeApp();