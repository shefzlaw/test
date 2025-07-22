const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://moradeyo:moradeyo@moradeyo.p5y2t3d.mongodb.net/shefzlaw12thirty4?retryWrites=true&w=majority&appName=moradeyo';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  subscription: {
    end: { type: Number, default: null },
    months: { type: Number, default: null }
  },
  sessionToken: { type: String, default: null },
  sessionTimestamp: { type: Number, default: null }
});

const User = mongoose.model('User', userSchema);

// Access codes from scripts.txt
const usernameCodes = {
  A: { threeMonths: { initial: "222978", renewal: "000000" }, sevenMonths: { initial: "111000", renewal: "300000" } },
  B: { threeMonths: { initial: "222496", renewal: "111111" }, sevenMonths: { initial: "111001", renewal: "310000" } },
  C: { threeMonths: { initial: "222110", renewal: "222222" }, sevenMonths: { initial: "111002", renewal: "320000" } },
  D: { threeMonths: { initial: "222111", renewal: "333333" }, sevenMonths: { initial: "111003", renewal: "330000" } },
  E: { threeMonths: { initial: "222112", renewal: "444444" }, sevenMonths: { initial: "111004", renewal: "340000" } },
  F: { threeMonths: { initial: "222113", renewal: "555555" }, sevenMonths: { initial: "111005", renewal: "350000" } },
  G: { threeMonths: { initial: "222114", renewal: "666666" }, sevenMonths: { initial: "111006", renewal: "360000" } },
  H: { threeMonths: { initial: "222115", renewal: "777777" }, sevenMonths: { initial: "111007", renewal: "370000" } },
  I: { threeMonths: { initial: "222116", renewal: "888888" }, sevenMonths: { initial: "111008", renewal: "380000" } },
  J: { threeMonths: { initial: "222117", renewal: "999999" }, sevenMonths: { initial: "111009", renewal: "390000" } },
  K: { threeMonths: { initial: "222118", renewal: "100000" }, sevenMonths: { initial: "111010", renewal: "400000" } },
  L: { threeMonths: { initial: "222119", renewal: "110000" }, sevenMonths: { initial: "111011", renewal: "410000" } },
  M: { threeMonths: { initial: "222120", renewal: "120000" }, sevenMonths: { initial: "111012", renewal: "420000" } },
  N: { threeMonths: { initial: "222121", renewal: "130000" }, sevenMonths: { initial: "111013", renewal: "430000" } },
  O: { threeMonths: { initial: "222122", renewal: "140000" }, sevenMonths: { initial: "111014", renewal: "440000" } },
  P: { threeMonths: { initial: "222123", renewal: "150000" }, sevenMonths: { initial: "111015", renewal: "450000" } },
  Q: { threeMonths: { initial: "222124", renewal: "160000" }, sevenMonths: { initial: "111016", renewal: "460000" } },
  R: { threeMonths: { initial: "222125", renewal: "170000" }, sevenMonths: { initial: "111017", renewal: "470000" } },
  S: { threeMonths: { initial: "222126", renewal: "180000" }, sevenMonths: { initial: "111018", renewal: "480000" } },
  T: { threeMonths: { initial: "222127", renewal: "190000" }, sevenMonths: { initial: "111019", renewal: "490000" } },
  U: { threeMonths: { initial: "222128", renewal: "200000" }, sevenMonths: { initial: "111020", renewal: "500000" } },
  V: { threeMonths: { initial: "222129", renewal: "210000" }, sevenMonths: { initial: "111021", renewal: "510000" } },
  W: { threeMonths: { initial: "222130", renewal: "220000" }, sevenMonths: { initial: "111022", renewal: "520000" } },
  X: { threeMonths: { initial: "222131", renewal: "230000" }, sevenMonths: { initial: "111023", renewal: "530000" } },
  Y: { threeMonths: { initial: "222132", renewal: "240000" }, sevenMonths: { initial: "111024", renewal: "540000" } },
  Z: { threeMonths: { initial: "222133", renewal: "250000" }, sevenMonths: { initial: "111025", renewal: "550000" } },
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(username)) {
      return res.status(400).json({ message: 'Username must start with a letter and contain only letters, numbers, or underscores.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Registration successful.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    const sessionToken = Math.random().toString(36).substr(2) + Date.now().toString(36);
    user.sessionToken = sessionToken;
    user.sessionTimestamp = Date.now();
    await user.save();
    res.json({ message: 'Login successful.', sessionToken, isSubscribed: user.subscription.end > Date.now() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

app.post('/verify-access', async (req, res) => {
  const { username, code, subscriptionMonths } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const firstLetter = username.charAt(0).toUpperCase();
    if (!usernameCodes[firstLetter]) {
      return res.status(400).json({ message: 'Invalid username: First letter must be A-Z.' });
    }
    const planKey = subscriptionMonths === 3 ? 'threeMonths' : 'sevenMonths';
    const isExpired = !user.subscription.end || user.subscription.end <= Date.now();
    const expectedCode = isExpired ? usernameCodes[firstLetter][planKey].initial : usernameCodes[firstLetter][planKey].renewal;
    if (code !== expectedCode) {
      return res.status(403).json({ message: `Invalid access code for ${subscriptionMonths}-month plan.` });
    }
    const monthsInMs = subscriptionMonths * 30 * 24 * 60 * 60 * 1000;
    user.subscription.end = Date.now() + monthsInMs;
    user.subscription.months = subscriptionMonths;
    await user.save();
    res.json({ message: `Subscription activated for ${subscriptionMonths} months!`, isSubscribed: true });
  } catch (err) {
    console.error('Verify access error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

app.get('/questions', async (req, res) => {
  const { username, course, count } = req.query;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const isSubscribed = user.subscription.end > Date.now();
    const questionCount = parseInt(count);
    const maxQuestions = isSubscribed ? [25, 50, 100].includes(questionCount) ? questionCount : 15 : 15;
    // Sample questions for Use of English (replace with full quizData from scripts.txt)
    const quizData = {
      "Use of English": [
        { question: "I cannot understand why Ali should serve in that moribund administration. Choose the option nearest in meaning to 'moribund':", options: ["Oppressive", "Prodigal", "Crumbling", "Purposeless"], correct: "Crumbling" },
        // Add more questions here (up to 100 for full access)
      ]
    };
    const questions = quizData[course]?.slice(0, maxQuestions) || [];
    if (questions.length === 0) {
      return res.status(400).json({ message: `No questions available for ${course}.` });
    }
    res.json({ questions, maxQuestions });
  } catch (err) {
    console.error('Questions error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

app.post('/logout', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user) {
      user.sessionToken = null;
      user.sessionTimestamp = null;
      await user.save();
    }
    res.json({ message: 'Logout successful.' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));