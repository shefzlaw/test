// Global variables
let userName = "";
let currentCourse = "";
let questionCount = 0;
let currentQuestion = 0;
let score = 0;
let selectedQuestions = [];
let answered = [];
let timer;
let timeLeft = 0;
let currentUser = null;
let isSubscribed = false;
let subscriptionEnd = null;
let sessionToken = null;

// Anti-inspection measures
function preventInspection() {
  console.log("Initializing anti-inspection measures");
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    alert("Right-click is disabled to protect quiz content.");
    console.log("Right-click attempt detected");
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J")) ||
      (e.ctrlKey && e.key === "U")
    ) {
      e.preventDefault();
      alert("Access to Developer Tools is restricted.");
      console.log(`Blocked key combination: ${e.key}`);
    }
  });
  let devToolsOpen = false;
  const threshold = 160;
  const checkDevTools = () => {
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    if (widthThreshold || heightThreshold) {
      if (!devToolsOpen) {
        devToolsOpen = true;
        alert("Developer Tools detected. Please close them to continue using the quiz.");
        console.log("DevTools detected");
      }
    } else {
      devToolsOpen = false;
    }
  };
  setInterval(checkDevTools, 1000);
}

// Initialize app
async function initApp() {
  console.log("Initializing app...");
  try {
    preventInspection();
    const storedUser = localStorage.getItem("currentUser");
    const storedToken = localStorage.getItem("sessionToken");
    if (storedUser && storedToken) {
      currentUser = JSON.parse(storedUser);
      sessionToken = storedToken;
      // Verify session with backend
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': sessionToken },
        body: JSON.stringify({ username: currentUser.username, password: '' }) // Password not needed for session check
      });
      const data = await response.json();
      if (response.ok) {
        isSubscribed = data.isSubscribed;
        sessionToken = data.sessionToken;
        localStorage.setItem("sessionToken", sessionToken);
        if (isSubscribed) {
          showStartScreen();
        } else {
          showSubscriptionScreen();
        }
      } else {
        logoutUser();
        alert("Session invalid. Please log in again.");
      }
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error("Init error:", error);
    showMessage("login-error", "Failed to initialize app. Please try again.");
  }
}

// Show login screen
function showLoginScreen() {
  console.log("Showing login screen");
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("register-screen").style.display = "none";
  document.getElementById("subscription-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("quiz-screen").style.display = "none";
  document.getElementById("result-screen").style.display = "none";
  document.getElementById("logout-btn").style.display = "none";
  clearError("login-error");
}

// Show registration screen
function showRegisterScreen() {
  console.log("Showing register screen");
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("register-screen").style.display = "block";
  document.getElementById("subscription-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("quiz-screen").style.display = "none";
  document.getElementById("result-screen").style.display = "none";
  document.getElementById("logout-btn").style.display = "none";
  clearError("register-error");
}

// Show subscription screen
function showSubscriptionScreen() {
  console.log("Showing subscription screen");
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("register-screen").style.display = "none";
  document.getElementById("subscription-screen").style.display = "block";
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("quiz-screen").style.display = "none";
  document.getElementById("result-screen").style.display = "none";
  document.getElementById("logout-btn").style.display = "block";
  clearError("subscription-error");
}

// Show start screen
function showStartScreen() {
  console.log("Showing start screen");
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("register-screen").style.display = "none";
  document.getElementById("subscription-screen").style.display = "none";
  document.getElementById("start-screen").style.display = "block";
  document.getElementById("quiz-screen").style.display = "none";
  document.getElementById("result-screen").style.display = "none";
  document.getElementById("logout-btn").style.display = "block";
  document.getElementById("user-name").value = currentUser?.username || "";
  updateQuestionCountOptions();
}

// Update question count dropdown based on subscription status
function updateQuestionCountOptions() {
  console.log("Updating question count options");
  const select = document.getElementById("question-count");
  select.innerHTML = "";
  if (isSubscribed) {
    const options = [25, 50, 100];
    options.forEach((count) => {
      const option = document.createElement("option");
      option.value = count;
      option.textContent = count;
      select.appendChild(option);
    });
  } else {
    const option = document.createElement("option");
    option.value = 15;
    option.textContent = "15 (Free User Limit)";
    select.appendChild(option);
  }
}

// Show error or success message
function showMessage(elementId, message, isSuccess = false) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.className = isSuccess ? "success" : "warning";
    errorElement.style.display = "block";
  }
}

// Clear error or success message
function clearError(elementId) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.style.display = "none";
  }
}

// Show welcome pop-in message
function showWelcomePopup(username) {
  console.log("Showing welcome popup");
  const existingPopup = document.querySelector(".welcome-popup");
  if (existingPopup) {
    existingPopup.remove();
  }
  const popup = document.createElement("div");
  popup.className = "welcome-popup";
  popup.innerHTML = `
        <h3>Welcome!</h3>
        <p>Successfully logged in as ${username}. Enjoy your quiz experience!</p>
        <button onclick="this.parentElement.remove()">Close</button>
    `;
  document.body.appendChild(popup);
  setTimeout(() => {
    if (popup.parentElement) {
      popup.remove();
    }
  }, 5000);
}

// Handle registration
async function registerUser() {
  console.log("Registering user");
  try {
    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value.trim();
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    showMessage("register-error", data.message, response.ok);
    if (response.ok) {
      document.getElementById("register-username").value = "";
      document.getElementById("register-password").value = "";
      showLoginScreen();
    }
  } catch (error) {
    console.error("Register error:", error);
    showMessage("register-error", "Registration failed. Please try again.");
  }
}

// Handle login
async function loginUser() {
  console.log("Logging in user");
  try {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value.trim();
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    showMessage("login-error", data.message, response.ok);
    if (response.ok) {
      currentUser = { username };
      sessionToken = data.sessionToken;
      isSubscribed = data.isSubscribed;
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      localStorage.setItem("sessionToken", sessionToken);
      showWelcomePopup(username);
      if (isSubscribed) {
        showStartScreen();
      } else {
        showSubscriptionScreen();
      }
    }
  } catch (error) {
    console.error("Login error:", error);
    showMessage("login-error", "Login failed. Please try again.");
  }
}

// Handle subscription code submission
async function submitAccessCode() {
  console.log("Submitting access code");
  try {
    const code = document.getElementById("access-code").value.trim();
    const subscriptionMonths = parseInt(document.querySelector('input[name="subscription-plan"]:checked')?.value);
    const response = await fetch('/verify-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': sessionToken },
      body: JSON.stringify({ username: currentUser.username, code, subscriptionMonths })
    });
    const data = await response.json();
    showMessage("subscription-error", data.message, response.ok);
    if (response.ok) {
      isSubscribed = data.isSubscribed;
      showStartScreen();
    }
  } catch (error) {
    console.error("Subscription error:", error);
    showMessage("subscription-error", "Failed to process code. Please try again.");
  }
}

// Handle free user button click
function proceedAsFreeUser() {
  console.log("Proceeding as free user");
  isSubscribed = false;
  showStartScreen();
}

// Handle logout
async function logoutUser() {
  console.log("Logging out user");
  try {
    await fetch('/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': sessionToken },
      body: JSON.stringify({ username: currentUser?.username })
    });
    currentUser = null;
    isSubscribed = false;
    sessionToken = null;
    localStorage.removeItem("currentUser");
    localStorage.removeItem("sessionToken");
    showLoginScreen();
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// Shuffle array (Fisher-Yates)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Start quiz
async function startQuiz() {
  console.log("Starting quiz");
  try {
    if (!currentUser) {
      showMessage("start-error", "Please login to start the quiz.");
      showLoginScreen();
      return;
    }
    userName = document.getElementById("user-name").value.trim();
    currentCourse = document.getElementById("course-select").value;
    questionCount = parseInt(document.getElementById("question-count").value);
    if (!userName) {
      showMessage("start-error", "Please enter your name.");
      return;
    }
    if (!currentCourse) {
      showMessage("start-error", "Please select a course.");
      return;
    }
    const response = await fetch(`/questions?username=${currentUser.username}&course=${encodeURIComponent(currentCourse)}&count=${questionCount}`, {
      headers: { 'Authorization': sessionToken }
    });
    const data = await response.json();
    if (!response.ok) {
      showMessage("start-error", data.message);
      return;
    }
    const availableQuestions = data.questions.length;
    const maxQuestions = data.maxQuestions;
    if (availableQuestions === 0) {
      showMessage("start-error", `No questions available for ${currentCourse}.`);
      return;
    }
    if (questionCount > maxQuestions) {
      showMessage("start-error", `Only ${maxQuestions} questions available for ${currentCourse}. Selecting ${maxQuestions} questions.`);
      questionCount = maxQuestions;
    }
    currentQuestion = 0;
    score = 0;
    answered = [];
    selectedQuestions = isSubscribed ? shuffleArray([...data.questions]).slice(0, questionCount) : data.questions.slice(0, maxQuestions);
    timeLeft = maxQuestions <= 15 ? 15 * 60 : maxQuestions <= 25 ? 30 * 60 : maxQuestions <= 50 ? 60 * 60 : 90 * 60;
    document.getElementById("start-screen").style.display = "none";
    document.getElementById("quiz-screen").style.display = "block";
    document.getElementById("result-screen").style.display = "none";
    document.getElementById("logout-btn").style.display = "block";
    startTimer();
    loadQuestion();
  } catch (error) {
    console.error("Start quiz error:", error);
    showMessage("start-error", "Failed to start quiz. Please try again.");
  }
}

// Start timer
function startTimer() {
  console.log("Starting timer");
  clearInterval(timer);
  timer = setInterval(() => {
    if (timeLeft <= 0) {
      clearInterval(timer);
      endQuiz();
    } else {
      timeLeft--;
      document.getElementById("time-left").textContent = formatTime(timeLeft);
    }
  }, 1000);
}

// Format time as MM:SS
function formatTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// Load current question
function loadQuestion() {
  console.log(`Loading question ${currentQuestion + 1}`);
  try {
    const question = selectedQuestions[currentQuestion];
    document.getElementById("question-number").textContent = `Question ${currentQuestion + 1} of ${selectedQuestions.length}`;
    document.getElementById("question-text").textContent = question.question;
    const optionsDiv = document.getElementById("options");
    optionsDiv.innerHTML = "";
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.classList.add("option");
      button.textContent = option;
      button.onclick = () => selectOption(button, option);
      optionsDiv.appendChild(button);
    });
    document.getElementById("back-btn").disabled = currentQuestion === 0;
    document.getElementById("next-btn").disabled = true;
    if (answered[currentQuestion]) {
      const correct = question.correct;
      const buttons = document.querySelectorAll(".option");
      buttons.forEach((button) => {
        if (button.textContent === answered[currentQuestion].selected) {
          button.classList.add(answered[currentQuestion].correct ? "correct" : "incorrect");
        }
        if (button.textContent === correct && !answered[currentQuestion].correct) {
          button.classList.add("correct");
        }
        button.disabled = true;
      });
      document.getElementById("next-btn").disabled = false;
    }
  } catch (error) {
    console.error("Load question error:", error);
  }
}

// Handle option selection
function selectOption(button, selectedOption) {
  console.log(`Selected option: ${selectedOption}`);
  try {
    const question = selectedQuestions[currentQuestion];
    const correct = question.correct;
    const isCorrect = selectedOption === correct;
    answered[currentQuestion] = { selected: selectedOption, correct: isCorrect };
    if (isCorrect) {
      score++;
      button.classList.add("correct");
    } else {
      button.classList.add("incorrect");
      document.querySelectorAll(".option").forEach((btn) => {
        if (btn.textContent === correct) {
          btn.classList.add("correct");
        }
      });
    }
    document.querySelectorAll(".option").forEach((btn) => (btn.disabled = true));
    document.getElementById("next-btn").disabled = false;
  } catch (error) {
    console.error("Select option error:", error);
  }
}

// Go to previous question
function backQuestion() {
  console.log("Going to previous question");
  if (currentQuestion > 0) {
    currentQuestion--;
    loadQuestion();
  }
}

// Go to next question or end quiz
function nextQuestion() {
  console.log("Going to next question");
  if (currentQuestion < selectedQuestions.length - 1) {
    currentQuestion++;
    loadQuestion();
  } else {
    endQuiz();
  }
}

// End quiz
function endQuiz() {
  console.log("Ending quiz");
  clearInterval(timer);
  document.getElementById("quiz-screen").style.display = "none";
  document.getElementById("result-screen").style.display = "block";
  document.getElementById("logout-btn").style.display = "block";
  const percentage = ((score / selectedQuestions.length) * 100).toFixed(2);
  document.getElementById("score").textContent = `${score} out of ${selectedQuestions.length}`;
  document.getElementById("percentage").textContent = `${percentage}%`;
}

// Cancel quiz
function cancelQuiz() {
  console.log("Cancelling quiz");
  clearInterval(timer);
  document.getElementById("quiz-screen").style.display = "none";
  showStartScreen();
}

// Restart quiz
function restartQuiz() {
  console.log("Restarting quiz");
  document.getElementById("result-screen").style.display = "none";
  showStartScreen();
  document.getElementById("user-name").value = currentUser?.username || "";
  document.getElementById("course-select").value = "";
  updateQuestionCountOptions();
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, setting up event listeners");
  try {
    initApp();
    const buttons = {
      "login-btn": loginUser,
      "register-btn": registerUser,
      "show-register": showRegisterScreen,
      "show-login": showLoginScreen,
      "submit-code-btn": submitAccessCode,
      "free-user-btn": proceedAsFreeUser,
      "logout-btn": logoutUser,
      "start-btn": startQuiz,
      "next-btn": nextQuestion,
      "back-btn": backQuestion,
      "cancel-btn": cancelQuiz,
      "restart-btn": restartQuiz,
      "home-btn": restartQuiz,
    };
    Object.keys(buttons).forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("click", (e) => {
          console.log(`Button clicked: ${id}`);
          e.preventDefault();
          buttons[id]();
        });
      } else {
        console.error(`Element with ID ${id} not found`);
      }
    });
  } catch (error) {
    console.error("Event listener setup error:", error);
  }
});
