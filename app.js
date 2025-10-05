// Supabase Configuration and Client Setup
const SUPABASE_URL = "https://your_project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key"; //

//Supabase client implementation with RLS policies
class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.currentUserId = null;
    this.accessToken = null;

    // auth methods
    this.auth = {
      signUp: async ({ email, password }) => {
        const res = await fetch(`${this.url}/auth/v1/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: this.key,
          },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          return { data, error: null };
        } else {
          return { data: null, error: data };
        }
      },

      signInWithPassword: async ({ email, password }) => {
        const res = await fetch(
          `${this.url}/auth/v1/token?grant_type=password`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: this.key,
            },
            body: JSON.stringify({ email, password }),
          }
        );
        const data = await res.json();
        if (res.ok) {
          // Store the access token for future requests
          if (data.access_token) {
            this.accessToken = data.access_token;
          }
          return { data, error: null };
        } else {
          return { data: null, error: data };
        }
      },

      signOut: async () => {
        this.currentUserId = null;
        this.accessToken = null;
        return { error: null };
      },
    };
  }

  from(table) {
    return new SupabaseTable(
      table,
      this.url,
      this.key,
      this.currentUserId,
      this.accessToken
    );
  }

  setUserId(userId) {
    this.currentUserId = userId;
  }

  // to call the set_current_user_id function
  async setUserContext(userId) {
    if (!userId) return;

    try {
      const headers = {
        "Content-Type": "application/json",
        apikey: this.key,
        Authorization: `Bearer ${this.accessToken || this.key}`,
      };

      await fetch(`${this.url}/rest/v1/rpc/set_current_user_id`, {
        method: "POST",
        headers,
        body: JSON.stringify({ user_uuid: userId }),
      });
    } catch (error) {
      console.error("Error setting user context:", error);
    }
  }
}

class SupabaseTable {
  constructor(table, url, key, userId, accessToken) {
    this.table = table;
    this.url = url;
    this.key = key;
    this.userId = userId;
    this.accessToken = accessToken;
    this.query = {};
  }

  select(columns = "*") {
    this.query.select = columns;
    return this;
  }

  insert(data) {
    this.query.insert = data;
    return this;
  }

  update(data) {
    this.query.update = data;
    return this;
  }

  eq(column, value) {
    if (!this.query.filters) this.query.filters = [];
    this.query.filters.push({ type: "eq", column, value });
    return this;
  }

  gte(column, value) {
    if (!this.query.filters) this.query.filters = [];
    this.query.filters.push({ type: "gte", column, value });
    return this;
  }

  order(column, options = {}) {
    this.query.order = { column, ...options };
    return this;
  }

  limit(count) {
    this.query.limit = count;
    return this;
  }

  single() {
    this.query.single = true;
    return this;
  }

  async execute() {
    const headers = {
      "Content-Type": "application/json",
      apikey: this.key,
      Authorization: `Bearer ${this.accessToken || this.key}`,
    };

    // Set user context for RLS
    if (this.userId) {
      await supabase.setUserContext(this.userId);
    }

    let url = `${this.url}/rest/v1/${this.table}`;
    let method = "GET";
    let body = null;

    if (this.query.insert) {
      method = "POST";
      body = JSON.stringify(this.query.insert);
      headers["Prefer"] = "return=representation";
    } else if (this.query.update) {
      method = "PATCH";
      body = JSON.stringify(this.query.update);
      headers["Prefer"] = "return=representation";
    }

    // Add filters to URL
    if (this.query.filters) {
      const params = new URLSearchParams();
      this.query.filters.forEach((filter) => {
        params.append(filter.column, `${filter.type}.${filter.value}`);
      });
      if (params.toString()) {
        url += "?" + params.toString();
      }
    }

    // Add select to URL
    if (this.query.select && this.query.select !== "*") {
      const separator = url.includes("?") ? "&" : "?";
      url += `${separator}select=${this.query.select}`;
    }

    // Add order to URL
    if (this.query.order) {
      const separator = url.includes("?") ? "&" : "?";
      url += `${separator}order=${this.query.order.column}`;
      if (this.query.order.ascending === false) {
        url += ".desc";
      }
    }

    // Add limit to URL
    if (this.query.limit) {
      const separator = url.includes("?") ? "&" : "?";
      url += `${separator}limit=${this.query.limit}`;
    }

    try {
      const response = await fetch(url, { method, headers, body });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Database error");
      }

      // .single() method
      if (this.query.single) {
        return {
          data: data && data.length > 0 ? data[0] : null,
          error:
            data && data.length === 0 ? { message: "No rows found" } : null,
        };
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  }
}

// Initializing Supabase client
const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Application state
let currentUser = null;
let currentGame = null;
let gameState = {
  currentRow: 0,
  currentCol: 0,
  guesses: [],
  targetWord: "",
  gameOver: false,
  won: false,
};

// Authentication functions
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePassword(password) {
  if (password.length < 6) return "Password must be at least 6 characters long";
  return null;
}

async function login(email, password) {
  try {
    // Validate inputs
    if (!validateEmail(email)) {
      return { success: false, error: "Please enter a valid email address" };
    }

    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, error: passwordError };

    // Auth login
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      return {
        success: false,
        error: authError.message || "Login failed",
      };
    }

    // Extract user from auth response
    const user = authData.user || authData.session?.user;
    if (!user) {
      return { success: false, error: "No user returned from login" };
    }

    // user ID set for future requests
    supabase.setUserId(user.id);

    // Set user context for RLS
    await supabase.setUserContext(user.id);

    // Try to fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .execute();

    // If no profile found, create it and fetch again
    if (profileError && profileError.message === "No rows found") {
      // Auto-creating the user's profile row
      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert([
          {
            id: user.id,
            username: (user.email || email).split("@")[0],
            role: "player",
            games_played_today: 0,
            total_games_won: 0,
            total_games_played: 0,
          },
        ])
        .execute();

      if (insertError) {
        return { success: false, error: insertError.message };
      }
      currentUser = newProfile && newProfile.length > 0 ? newProfile[0] : null;
      return { success: true, user: currentUser };
    } else if (profileError) {
      return { success: false, error: profileError.message };
    }

    currentUser = profile;
    return { success: true, user: profile };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function signup(email, password, role) {
  try {
    // Validate inputs
    if (!validateEmail(email)) {
      return { success: false, error: "Please enter a valid email address" };
    }

    const passwordError = validatePassword(password);
    if (passwordError) return { success: false, error: passwordError };

    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return {
        success: false,
        error: authError.message || "Signup failed",
      };
    }

    const user = authData.user || authData.session?.user;
    if (!user) {
      return { success: false, error: "No user returned from signup" };
    }

    // Set user ID for future requests
    supabase.setUserId(user.id);

    // Set user context for RLS
    await supabase.setUserContext(user.id);

    // Create profile in database
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert([
        {
          id: user.id,
          username: email.split("@")[0],
          role: role,
          games_played_today: 0,
          total_games_won: 0,
          total_games_played: 0,
        },
      ])
      .execute();

    if (profileError) {
      return { success: false, error: profileError.message };
    }

    return {
      success: true,
      message:
        "Account created successfully! You may need to verify your email before logging in.",
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function logout() {
  try {
    await supabase.auth.signOut();
    currentUser = null;
    supabase.setUserId(null);

    // Clear user info display
    document.getElementById("usernameDisplay").textContent = "";
    document.getElementById("roleBadge").textContent = "";

    // how auth
    document
      .querySelectorAll(".nav-links, .user-info")
      .forEach((el) => (el.style.display = "none"));
    showSection("authSection");
  } catch (error) {
    console.error("Logout error:", error);
  }
}

// Game functions
async function startNewGame() {
  const today = new Date().toISOString().split("T")[0];

  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    // Check daily game limit
    const { data: todayGames, error: gameError } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("game_date", today)
      .execute();

    if (gameError) {
      showToast("Error checking game limit: " + gameError.message);
      return;
    }

    if (todayGames && todayGames.length >= 3) {
      showToast("You've reached your daily limit of 3 games!");
      return;
    }

    // Get random word
    const { data: words, error: wordsError } = await supabase
      .from("words")
      .select("word")
      .execute();

    if (wordsError || !words || words.length === 0) {
      showToast(
        "Error loading words: " + (wordsError?.message || "No words available")
      );
      return;
    }

    const targetWord = words[Math.floor(Math.random() * words.length)].word;

    gameState = {
      currentRow: 0,
      currentCol: 0,
      guesses: [],
      targetWord: targetWord,
      gameOver: false,
      won: false,
    };

    // Create new game session
    const { data: newGame, error: newGameError } = await supabase
      .from("game_sessions")
      .insert([
        {
          user_id: currentUser.id,
          word: targetWord,
          guesses: [],
          won: false,
          game_date: today,
        },
      ])
      .execute();

    if (newGameError) {
      showToast("Error creating game: " + newGameError.message);
      return;
    }

    if (newGame && newGame.length > 0) {
      currentGame = newGame[0];
    }

    initializeGameBoard();
    initializeVirtualKeyboard();
    updateGameStats();
    document.getElementById("wordInput").value = "";
    document.getElementById("wordInput").focus();

    console.log("New game started with target word:", targetWord);
  } catch (error) {
    showToast("Error starting game: " + error.message);
  }
}

function initializeGameBoard() {
  const gameBoard = document.getElementById("gameBoard");
  gameBoard.innerHTML = "";

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const tile = document.createElement("div");
      tile.className = "letter-tile";
      tile.id = `tile-${row}-${col}`;
      gameBoard.appendChild(tile);
    }
  }
}

function initializeVirtualKeyboard() {
  const keyboard = document.getElementById("virtualKeyboard");
  const letters = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");

  keyboard.innerHTML = "";

  letters.forEach((letter) => {
    const key = document.createElement("button");
    key.className = "key";
    key.textContent = letter;
    key.id = `key-${letter}`;
    key.addEventListener("click", () => handleKeyPress(letter));
    keyboard.appendChild(key);
  });

  // Reset keyboard colors
  letters.forEach((letter) => {
    const key = document.getElementById(`key-${letter}`);
    if (key) {
      key.classList.remove("correct", "partial", "incorrect");
    }
  });
}

function handleKeyPress(letter) {
  if (gameState.gameOver || gameState.currentCol >= 5) return;

  const tile = document.getElementById(
    `tile-${gameState.currentRow}-${gameState.currentCol}`
  );
  tile.textContent = letter;
  tile.classList.add("filled");

  gameState.currentCol++;
  updateWordInput();
}

function updateWordInput() {
  const currentGuess = [];
  for (let col = 0; col < gameState.currentCol; col++) {
    const tile = document.getElementById(`tile-${gameState.currentRow}-${col}`);
    currentGuess.push(tile.textContent);
  }
  document.getElementById("wordInput").value = currentGuess.join("");
}

function submitGuess() {
  const guess = document.getElementById("wordInput").value.toUpperCase();

  if (guess.length !== 5) {
    showToast("Please enter a 5-letter word");
    return;
  }

  if (gameState.gameOver) {
    showToast("Game is already over");
    return;
  }

  if (!gameState.targetWord) {
    showToast("Please start a new game first");
    return;
  }

  processGuess(guess);
}

async function processGuess(guess) {
  const targetWord = gameState.targetWord;
  gameState.guesses.push(guess);

  console.log("Processing guess:", guess, "Target:", targetWord);

  // Fill tiles if not already filled
  for (let col = 0; col < 5; col++) {
    const tile = document.getElementById(`tile-${gameState.currentRow}-${col}`);
    if (!tile.textContent) {
      tile.textContent = guess[col];
      tile.classList.add("filled");
    }
  }

  // Animate and color tiles
  setTimeout(() => {
    animateRowReveal(gameState.currentRow, guess, targetWord);
  }, 100);

  // Check win condition
  if (guess === targetWord) {
    gameState.won = true;
    gameState.gameOver = true;
    setTimeout(() => {
      showGameResult(true, gameState.guesses.length);
    }, 2000);
  } else if (gameState.currentRow >= 4) {
    gameState.gameOver = true;
    setTimeout(() => {
      showGameResult(false, gameState.guesses.length);
    }, 2000);
  } else {
    gameState.currentRow++;
    gameState.currentCol = 0;
    document.getElementById("wordInput").value = "";
  }

  updateKeyboard(guess, targetWord);
  await saveGameToHistory();
}

function animateRowReveal(row, guess, targetWord) {
  // Creating copy of targetWord to track available letters
  let availableLetters = targetWord.split("");
  let colors = new Array(5).fill("incorrect"); // Start with all gray

  // First pass - marks all exact matches (green)
  for (let col = 0; col < 5; col++) {
    if (guess[col] === targetWord[col]) {
      colors[col] = "correct";
      availableLetters[col] = null; // Remove this letter from available pool
    }
  }

  // Second pass - marks partial matches (orange) from remaining letters
  for (let col = 0; col < 5; col++) {
    if (colors[col] === "incorrect") {
      // Only check if not already green
      const letter = guess[col];
      const availableIndex = availableLetters.indexOf(letter);

      if (availableIndex !== -1) {
        colors[col] = "partial";
        availableLetters[availableIndex] = null; // Remove this letter from available pool
      }
    }
  }

  // Applying colors with animation
  for (let col = 0; col < 5; col++) {
    const tile = document.getElementById(`tile-${row}-${col}`);

    setTimeout(() => {
      tile.classList.add("flip");

      setTimeout(() => {
        tile.classList.add(colors[col]);
      }, 300);
    }, col * 100);
  }
}

function updateKeyboard(guess, targetWord) {
  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i];
    const key = document.getElementById(`key-${letter}`);

    if (!key) continue;

    if (targetWord[i] === letter && !key.classList.contains("correct")) {
      key.classList.remove("partial", "incorrect");
      key.classList.add("correct");
    } else if (
      targetWord.includes(letter) &&
      !key.classList.contains("correct") &&
      !key.classList.contains("partial")
    ) {
      key.classList.remove("incorrect");
      key.classList.add("partial");
    } else if (
      !targetWord.includes(letter) &&
      !key.classList.contains("correct") &&
      !key.classList.contains("partial")
    ) {
      key.classList.add("incorrect");
    }
  }
}

async function saveGameToHistory() {
  if (!currentGame) return;

  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    // Update game session
    const { error: updateError } = await supabase
      .from("game_sessions")
      .update({
        guesses: gameState.guesses,
        won: gameState.won,
        completed: gameState.gameOver,
        completed_at: gameState.gameOver ? new Date().toISOString() : null,
      })
      .eq("id", currentGame.id)
      .execute();

    if (updateError) {
      console.error("Error updating game session:", updateError);
      return;
    }

    // Update user stats if game is completed
    if (gameState.gameOver) {
      const updates = {
        total_games_played: currentUser.total_games_played + 1,
        games_played_today: currentUser.games_played_today + 1,
      };

      if (gameState.won) {
        updates.total_games_won = currentUser.total_games_won + 1;
      }

      const { data: updatedUser, error: userError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentUser.id)
        .execute();

      if (userError) {
        console.error("Error updating user stats:", userError);
      } else if (updatedUser && updatedUser.length > 0) {
        currentUser = updatedUser[0];
      }
    }
  } catch (error) {
    console.error("Error saving game to history:", error);
  }
}

function showGameResult(won, guesses) {
  const modal = document.getElementById("gameResultModal");
  const title = document.getElementById("resultTitle");
  const message = document.getElementById("resultMessage");
  const word = document.getElementById("resultWord");
  const guessesUsed = document.getElementById("guessesUsed");

  title.textContent = won ? "Congratulations!" : "Better luck next time!";
  message.textContent = won ? "You guessed the word!" : "The correct word was:";
  word.textContent = gameState.targetWord;
  guessesUsed.textContent = guesses;

  modal.classList.remove("hidden");
}

// UI Functions
function showSection(sectionId) {
  const sections = [
    "authSection",
    "gameSection",
    "profileSection",
    "adminSection",
  ];
  sections.forEach((id) => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(sectionId).classList.remove("hidden");

  // Update navigation
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (sectionId === "gameSection")
    document.getElementById("gameBtn").classList.add("active");
  if (sectionId === "profileSection")
    document.getElementById("profileBtn").classList.add("active");
  if (sectionId === "adminSection")
    document.getElementById("adminBtn").classList.add("active");
}

function updateUI() {
  if (!currentUser) {
    document.getElementById("authSection").classList.remove("hidden");
    document
      .querySelectorAll(".nav-links, .user-info")
      .forEach((el) => (el.style.display = "none"));
    return;
  }

  // Show navigation
  document
    .querySelectorAll(".nav-links, .user-info")
    .forEach((el) => (el.style.display = "flex"));

  // Update user info
  document.getElementById("usernameDisplay").textContent =
    currentUser.username || "User";
  document.getElementById("roleBadge").textContent = currentUser.role
    ? currentUser.role.toUpperCase()
    : "PLAYER";

  // Show admin options for admin users
  const adminElements = document.querySelectorAll(".admin-only");
  adminElements.forEach((el) => {
    if (currentUser.role === "admin") {
      el.classList.add("show");
      el.style.display = "flex";
    } else {
      el.classList.remove("show");
      el.style.display = "none";
    }
  });

  showSection("gameSection");
  updateGameStats();
  updateProfileStats();
  if (currentUser.role === "admin") {
    updateAdminStats();
  }

  // Initialize game board and keyboard
  initializeGameBoard();
  initializeVirtualKeyboard();
}

async function updateGameStats() {
  if (!currentUser) return;

  const today = new Date().toISOString().split("T")[0];

  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    const { data: todayGames, error } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("game_date", today)
      .execute();

    if (error) {
      console.error("Error fetching game stats:", error);
      return;
    }

    const gamesPlayed = todayGames ? todayGames.length : 0;
    document.getElementById("gamesPlayed").textContent = gamesPlayed;
    document.getElementById("gamesRemaining").textContent = Math.max(
      0,
      3 - gamesPlayed
    );
  } catch (error) {
    console.error("Error updating game stats:", error);
  }
}

async function updateProfileStats() {
  if (!currentUser) return;

  document.getElementById("totalGamesPlayed").textContent =
    currentUser.total_games_played || 0;
  document.getElementById("totalGamesWon").textContent =
    currentUser.total_games_won || 0;
  document.getElementById("todayGames").textContent =
    currentUser.games_played_today || 0;

  const winRate =
    currentUser.total_games_played > 0
      ? Math.round(
          (currentUser.total_games_won / currentUser.total_games_played) * 100
        )
      : 0;
  document.getElementById("winRate").textContent = winRate + "%";

  // Update game history
  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    const { data: gameHistory, error } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .execute();

    if (error) {
      console.error("Error fetching game history:", error);
      return;
    }

    const historyList = document.getElementById("historyList");
    historyList.innerHTML = "";

    if (gameHistory && gameHistory.length > 0) {
      gameHistory.forEach((game) => {
        const item = document.createElement("div");
        item.className = "history-item";

        item.innerHTML = `
          <div class="history-word">${game.word}</div>
          <div class="history-result">
            <span class="history-status ${game.won ? "won" : "lost"}">
              ${game.won ? "WON" : "LOST"}
            </span>
            <span>${game.guesses ? game.guesses.length : 0}/5</span>
            <span>${game.game_date}</span>
          </div>
        `;

        historyList.appendChild(item);
      });
    }
  } catch (error) {
    console.error("Error updating profile stats:", error);
  }
}

async function updateAdminStats() {
  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    const { data: adminStats, error } = await supabase
      .from("admin_stats")
      .select("*")
      .limit(1)
      .execute();

    if (error) {
      console.error("Error fetching admin stats:", error);
      return;
    }

    const stats = adminStats && adminStats.length > 0 ? adminStats[0] : {};

    document.getElementById("todayUsers").textContent = stats.today_users || 0;
    document.getElementById("todayCorrectGuesses").textContent =
      stats.today_correct_guesses || 0;
    document.getElementById("totalUsers").textContent = stats.total_users || 0;
    document.getElementById("totalGames").textContent = stats.total_games || 0;

    // Populate user select
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, username")
      .execute();

    if (!usersError && users) {
      const userSelect = document.getElementById("userSelect");
      userSelect.innerHTML = '<option value="">Select User</option>';

      users.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = user.username;
        userSelect.appendChild(option);
      });
    }

    // Update word list
    const { data: words, error: wordsError } = await supabase
      .from("words")
      .select("word")
      .execute();

    if (!wordsError && words) {
      const wordList = document.getElementById("wordList");
      wordList.innerHTML = "";

      words.forEach((wordObj) => {
        const item = document.createElement("div");
        item.className = "word-item";
        item.textContent = wordObj.word;
        wordList.appendChild(item);
      });
    }
  } catch (error) {
    console.error("Error updating admin stats:", error);
  }
}

async function generateDailyReport() {
  const date =
    document.getElementById("reportDate").value ||
    new Date().toISOString().split("T")[0];

  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    const { data: dayGames, error } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("game_date", date)
      .execute();

    if (error) {
      showToast("Error generating report: " + error.message);
      return;
    }

    const uniqueUsers = new Set(dayGames.map((g) => g.user_id)).size;
    const correctGuesses = dayGames.filter((g) => g.won).length;

    const reportContent = document.getElementById("dailyReportContent");
    reportContent.innerHTML = `
      <h4>Report for ${date}</h4>
      <p><strong>Users who played:</strong> ${uniqueUsers}</p>
      <p><strong>Total games:</strong> ${dayGames.length}</p>
      <p><strong>Correct guesses:</strong> ${correctGuesses}</p>
      <p><strong>Success rate:</strong> ${
        dayGames.length > 0
          ? Math.round((correctGuesses / dayGames.length) * 100)
          : 0
      }%</p>
    `;
  } catch (error) {
    showToast("Error generating report: " + error.message);
  }
}

async function generateUserReport() {
  const userId = document.getElementById("userSelect").value;
  if (!userId) {
    showToast("Please select a user");
    return;
  }

  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    const { data: user, error: userError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .execute();

    if (userError || !user) {
      showToast(
        "Error fetching user data: " + (userError?.message || "User not found")
      );
      return;
    }

    const { data: userGames, error: gamesError } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("user_id", userId)
      .execute();

    if (gamesError) {
      showToast("Error fetching user games: " + gamesError.message);
      return;
    }

    const games = userGames || [];

    const reportContent = document.getElementById("userReportContent");
    reportContent.innerHTML = `
      <h4>Report for ${user.username}</h4>
      <p><strong>Total games played:</strong> ${games.length}</p>
      <p><strong>Games won:</strong> ${games.filter((g) => g.won).length}</p>
      <p><strong>Win rate:</strong> ${
        games.length > 0
          ? Math.round((games.filter((g) => g.won).length / games.length) * 100)
          : 0
      }%</p>
      <p><strong>Last played:</strong> ${
        games.length > 0 ? games[games.length - 1].game_date : "Never"
      }</p>
    `;
  } catch (error) {
    showToast("Error generating user report: " + error.message);
  }
}

async function addNewWord() {
  const newWord = document.getElementById("newWord").value.toUpperCase().trim();

  if (newWord.length !== 5) {
    showToast("Word must be exactly 5 letters long");
    return;
  }

  if (!/^[A-Z]+$/.test(newWord)) {
    showToast("Word must contain only letters");
    return;
  }

  try {
    // Set user context for RLS
    await supabase.setUserContext(currentUser.id);

    // Check if word already exists
    const { data: existingWord, error: checkError } = await supabase
      .from("words")
      .select("word")
      .eq("word", newWord)
      .single()
      .execute();

    if (existingWord) {
      showToast("Word already exists");
      return;
    }

    // Add new word
    const { error: insertError } = await supabase
      .from("words")
      .insert([{ word: newWord }])
      .execute();

    if (insertError) {
      showToast("Error adding word: " + insertError.message);
      return;
    }

    document.getElementById("newWord").value = "";
    updateAdminStats();
    showToast("Word added successfully!");
  } catch (error) {
    showToast("Error adding word: " + error.message);
  }
}

function showToast(message) {
  const toast = document.getElementById("errorToast");
  const toastMessage = document.getElementById("toastMessage");

  toastMessage.textContent = message;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

// Event Listeners
document.addEventListener("DOMContentLoaded", function () {
  // Auth form handlers
  document.getElementById("loginTab").addEventListener("click", function () {
    document.getElementById("loginTab").classList.add("active");
    document.getElementById("signupTab").classList.remove("active");
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("signupForm").classList.add("hidden");
  });

  document.getElementById("signupTab").addEventListener("click", function () {
    document.getElementById("signupTab").classList.add("active");
    document.getElementById("loginTab").classList.remove("active");
    document.getElementById("signupForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");
  });

  document
    .getElementById("loginForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const email = document.getElementById("loginUsername").value; // Note: using email for login
      const password = document.getElementById("loginPassword").value;

      const result = await login(email, password);

      if (result.success) {
        document.getElementById("authError").classList.add("hidden");
        updateUI();
      } else {
        document.getElementById("authError").textContent = result.error;
        document.getElementById("authError").classList.remove("hidden");
      }
    });

  document
    .getElementById("signupForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      const email = document.getElementById("signupUsername").value; // Note: using email for signup
      const password = document.getElementById("signupPassword").value;
      const role = document.getElementById("signupRole").value;

      const result = await signup(email, password, role);

      if (result.success) {
        document.getElementById("authError").classList.add("hidden");
        showToast(result.message || "Account created successfully!");
        // Don't auto-login after signup, user may need to verify email
      } else {
        document.getElementById("authError").textContent = result.error;
        document.getElementById("authError").classList.remove("hidden");
      }
    });

  // Navigation handlers
  document.getElementById("gameBtn").addEventListener("click", () => {
    showSection("gameSection");
    if (currentUser) {
      initializeGameBoard();
      initializeVirtualKeyboard();
    }
  });
  document.getElementById("profileBtn").addEventListener("click", () => {
    showSection("profileSection");
    updateProfileStats();
  });
  document.getElementById("adminBtn").addEventListener("click", () => {
    showSection("adminSection");
    updateAdminStats();
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);

  // Game handlers
  document.getElementById("submitGuess").addEventListener("click", submitGuess);
  document.getElementById("newGameBtn").addEventListener("click", startNewGame);
  document.getElementById("viewHistoryBtn").addEventListener("click", () => {
    showSection("profileSection");
    updateProfileStats();
  });

  // Keep only the Enter key handler for the word input
  document
    .getElementById("wordInput")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        submitGuess();
      }
    });

  // Modal handlers
  document
    .getElementById("playAgainBtn")
    .addEventListener("click", function () {
      document.getElementById("gameResultModal").classList.add("hidden");
      startNewGame();
    });

  document
    .getElementById("closeResultBtn")
    .addEventListener("click", function () {
      document.getElementById("gameResultModal").classList.add("hidden");
    });

  // Admin handlers
  document
    .getElementById("generateDailyReport")
    .addEventListener("click", generateDailyReport);
  document
    .getElementById("generateUserReport")
    .addEventListener("click", generateUserReport);
  document.getElementById("addWordBtn").addEventListener("click", addNewWord);

  // Set default date to today
  document.getElementById("reportDate").value = new Date()
    .toISOString()
    .split("T")[0];

  // Initialize UI
  updateUI();
});

// Keyboard event listener for physical keyboard
document.addEventListener("keydown", function (e) {
  if (!currentUser || gameState.gameOver) return;

  const key = e.key.toUpperCase();

  if (key === "BACKSPACE") {
    if (gameState.currentCol > 0) {
      gameState.currentCol--;
      const tile = document.getElementById(
        `tile-${gameState.currentRow}-${gameState.currentCol}`
      );
      if (tile) {
        tile.textContent = "";
        tile.classList.remove("filled");
        updateWordInput();
      }
    }
  } else if (key === "ENTER") {
    submitGuess();
  } else if (/^[A-Z]$/.test(key) && gameState.currentCol < 5) {
    const tile = document.getElementById(
      `tile-${gameState.currentRow}-${gameState.currentCol}`
    );
    if (tile) {
      tile.textContent = key;
      tile.classList.add("filled");
      gameState.currentCol++;
      updateWordInput();
    }
  }
});
