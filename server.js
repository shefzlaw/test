const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const axios = require('axios');
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

// Paystack Secret Key
const PAYSTACK_SECRET_KEY = 'sk_test_c41de128a51ce93fbe71af368ba65850841173d5';

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

app.post('/initiate-payment', async (req, res) => {
  const { username, subscriptionMonths } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const amount = subscriptionMonths === 3 ? 100000 : 200000; // Amount in kobo (NGN 1000 = 100000 kobo, NGN 2000 = 200000 kobo)
    const email = `${username}@shefzlaw1234.com`; // Generate a dummy email for Paystack
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
        metadata: { username, subscriptionMonths }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json({ authorizationUrl: response.data.data.authorization_url, reference: response.data.data.reference });
  } catch (err) {
    console.error('Initiate payment error:', err.response?.data || err);
    res.status(500).json({ message: 'Failed to initiate payment.' });
  }
});

app.post('/verify-payment', async (req, res) => {
  const { reference, username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const { status, metadata } = response.data.data;
    if (status === 'success' && metadata.username === username) {
      const subscriptionMonths = metadata.subscriptionMonths;
      const monthsInMs = subscriptionMonths * 30 * 24 * 60 * 60 * 1000;
      user.subscription.end = Date.now() + monthsInMs;
      user.subscription.months = subscriptionMonths;
      await user.save();
      res.json({ message: `Subscription activated for ${subscriptionMonths} months!`, isSubscribed: true });
    } else {
      res.status(400).json({ message: 'Payment verification failed.' });
    }
  } catch (err) {
    console.error('Verify payment error:', err.response?.data || err);
    res.status(500).json({ message: 'Failed to verify payment.' });
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
    // Sample questions for Use of English (replace with full quizData)
    const quizData = {
      "Use of English": [
    {
      question:
        "I cannot understand why Ali should serve in that moribund administration. Choose the option nearest in meaning to 'moribund':",
      options: ["Oppressive", "Prodigal", "Crumbling", "Purposeless"],
      correct: "Crumbling",
    },
    {
      question:
        "The conference Centre caters for transients only. Choose the option nearest in meaning to 'transients':",
      options: [
        "Temporary guests",
        "Professional",
        "Permanent guests",
        "Novices",
      ],
      correct: "Temporary guests",
    },
    {
      question:
        "The pharmacist’s advice was described as prudent. Choose the option nearest in meaning to 'prudent':",
      options: ["Reckless", "Cautious", "Hasty", "Irrelevant"],
      correct: "Cautious",
    },
    {
      question:
        "The patient’s response to the medication was described as erratic. Choose the option nearest in meaning to 'erratic':",
      options: ["Consistent", "Unpredictable", "Stable", "Expected"],
      correct: "Unpredictable",
    },
    {
      question:
        "Choose the option nearest in meaning to 'verify' in the context of checking a prescription:",
      options: ["Ignore", "Confirm", "Discard", "Rewrite"],
      correct: "Confirm",
    },
    {
      question:
        "The medication’s efficacy was described as remarkable. Choose the option nearest in meaning to 'efficacy':",
      options: ["Ineffectiveness", "Effectiveness", "Toxicity", "Availability"],
      correct: "Effectiveness",
    },
    {
      question:
        "The patient’s adherence to the regimen was described as commendable. Choose the option nearest in meaning to 'commendable':",
      options: ["Criticizable", "Praiseworthy", "Negligible", "Inconsistent"],
      correct: "Praiseworthy",
    },
    {
      question:
        "The medication’s storage requirements were described as stringent. Choose the option nearest in meaning to 'stringent':",
      options: ["Flexible", "Strict", "Optional", "Simple"],
      correct: "Strict",
    },
    {
      question:
        "Choose the option nearest in meaning to 'counsel' in the context of advising a patient:",
      options: ["Ignore", "Advise", "Prescribe", "Dispense"],
      correct: "Advise",
    },
    {
      question:
        "The pharmacist’s records were described as impeccable. Choose the option nearest in meaning to 'impeccable':",
      options: ["Faulty", "Flawless", "Incomplete", "Disorganized"],
      correct: "Flawless",
    },
    {
      question:
        "The technician’s error was described as inadvertent. Choose the option nearest in meaning to 'inadvertent':",
      options: ["Intentional", "Unintentional", "Deliberate", "Planned"],
      correct: "Unintentional",
    },
    {
      question:
        "Choose the option nearest in meaning to 'contraindication' in a medication context:",
      options: ["Recommendation", "Warning", "Dosage", "Benefit"],
      correct: "Warning",
    },
    {
      question:
        "The pharmacist’s explanation was described as lucid. Choose the option nearest in meaning to 'lucid':",
      options: ["Confusing", "Clear", "Lengthy", "Technical"],
      correct: "Clear",
    },
    {
      question:
        "Choose the option nearest in meaning to 'dispense' in the context of providing medication:",
      options: ["Prescribe", "Distribute", "Store", "Diagnose"],
      correct: "Distribute",
    },
    {
      question: "Choose the synonym for 'ameliorate':",
      options: ["Worsen", "Improve", "Maintain", "Ignore"],
      correct: "Improve",
    },
    {
      question: "What is the antonym of 'transparent'?",
      options: ["Clear", "Opaque", "Visible", "Bright"],
      correct: "Opaque",
    },
    {
      question: "Choose the synonym for 'benevolent':",
      options: ["Kind", "Harsh", "Indifferent", "Cautious"],
      correct: "Kind",
    },
    {
      question: "What is the antonym of 'abundant'?",
      options: ["Plentiful", "Scarce", "Rich", "Excessive"],
      correct: "Scarce",
    },
    {
      question:
        "The politician's speech was described as incoherent. What does 'incoherent' mean?",
      options: ["Clear", "Logical", "Confusing", "Persuasive"],
      correct: "Confusing",
    },
    {
      question: "Choose the correct spelling:",
      options: ["Accomodate", "Accommodate", "Acommodate", "Accommadate"],
      correct: "Accommodate",
    },
    {
      question: "What does 'ephemeral' mean?",
      options: ["Lasting", "Temporary", "Permanent", "Eternal"],
      correct: "Temporary",
    },
    {
      question:
        "The pharmacist’s instructions were described as cogent. Choose the option nearest in meaning to 'cogent':",
      options: ["Unconvincing", "Persuasive", "Vague", "Irrelevant"],
      correct: "Persuasive",
    },
    {
      question:
        "The technician’s error was described as trivial. Choose the option nearest in meaning to 'trivial':",
      options: ["Significant", "Minor", "Permanent", "Complex"],
      correct: "Minor",
    },
    {
      question:
        "The medication’s effects were described as transient. Choose the option nearest in meaning to 'transient':",
      options: ["Permanent", "Temporary", "Severe", "Expected"],
      correct: "Temporary",
    },
    {
      question: "Choose the synonym for 'prudent':",
      options: ["Careless", "Wise", "Reckless", "Hasty"],
      correct: "Wise",
    },
    {
      question: "What is the antonym of 'hostile'?",
      options: ["Friendly", "Aggressive", "Neutral", "Defensive"],
      correct: "Friendly",
    },
    {
      question: "The book was described as a tome. What does 'tome' imply?",
      options: ["Short story", "Large book", "Poetry collection", "Article"],
      correct: "Large book",
    },
    {
      question: "Choose the synonym for 'mitigate':",
      options: ["Worsen", "Alleviate", "Ignore", "Enhance"],
      correct: "Alleviate",
    },
    {
      question: "What is the antonym of 'diligent'?",
      options: ["Hardworking", "Lazy", "Efficient", "Dedicated"],
      correct: "Lazy",
    },
    {
      question:
        "The pharmacist described the patient’s query as pertinent. Choose the option nearest in meaning to 'pertinent':",
      options: ["Irrelevant", "Relevant", "Confusing", "Unclear"],
      correct: "Relevant",
    },
    {
      question:
        "The dispensing process was described as seamless. Choose the option nearest in meaning to 'seamless':",
      options: ["Complicated", "Smooth", "Delayed", "Inaccurate"],
      correct: "Smooth",
    },
    {
      question:
        "Choose the option nearest in meaning to 'exacerbate' in the context of a patient’s condition:",
      options: ["Improve", "Worsen", "Stabilize", "Monitor"],
      correct: "Worsen",
    },
    {
      question:
        "The technician’s approach was described as methodical. Choose the option nearest in meaning to 'methodical':",
      options: ["Disorganized", "Systematic", "Hasty", "Careless"],
      correct: "Systematic",
    },
    {
      question: "What does 'ubiquitous' mean?",
      options: ["Rare", "Widespread", "Hidden", "Temporary"],
      correct: "Widespread",
    },
    {
      question: "Choose the synonym for 'candid':",
      options: ["Deceptive", "Honest", "Reserved", "Cautious"],
      correct: "Honest",
    },
    {
      question: "What is the antonym of 'frugal'?",
      options: ["Thrifty", "Wasteful", "Economical", "Careful"],
      correct: "Wasteful",
    },
    {
      question:
        "The decision was described as arbitrary. What does 'arbitrary' mean?",
      options: ["Reasoned", "Random", "Planned", "Logical"],
      correct: "Random",
    },
    {
      question: "Choose the synonym for 'resilient':",
      options: ["Fragile", "Adaptable", "Rigid", "Weak"],
      correct: "Adaptable",
    },
    {
      question: "What is the antonym of 'obscure'?",
      options: ["Clear", "Hidden", "Vague", "Unknown"],
      correct: "Clear",
    },
    {
      question:
        "Choose the option nearest in meaning to 'monitor' in the context of tracking a patient’s medication use:",
      options: ["Ignore", "Observe", "Adjust", "Discontinue"],
      correct: "Observe",
    },
    {
      question:
        "The medication’s storage was described as optimal. Choose the option nearest in meaning to 'optimal':",
      options: ["Inadequate", "Ideal", "Temporary", "Hazardous"],
      correct: "Ideal",
    },
    {
      question:
        "The technician’s response was described as tactful. Choose the option nearest in meaning to 'tactful':",
      options: ["Rude", "Diplomatic", "Abrupt", "Unclear"],
      correct: "Diplomatic",
    },
    {
      question:
        "Choose the option nearest in meaning to 'generic' in the context of medications:",
      options: ["Brand-name", "Non-branded", "Expensive", "Specialized"],
      correct: "Non-branded",
    },
    {
      question:
        "The pharmacist’s guidance was described as invaluable. Choose the option nearest in meaning to 'invaluable':",
      options: ["Worthless", "Priceless", "Ordinary", "Replaceable"],
      correct: "Priceless",
    },
    {
      question:
        "Choose the option nearest in meaning to 'mitigate' in the context of reducing side effects:",
      options: ["Increase", "Alleviate", "Ignore", "Complicate"],
      correct: "Alleviate",
    },
    {
      question:
        "The pharmacist’s demeanor was described as affable. Choose the option nearest in meaning to 'affable':",
      options: ["Unfriendly", "Friendly", "Indifferent", "Stern"],
      correct: "Friendly",
    },
    {
      question:
        "The medication’s dosage was described as precise. Choose the option nearest in meaning to 'precise':",
      options: ["Vague", "Accurate", "Approximate", "Unclear"],
      correct: "Accurate",
    },
    {
      question:
        "Choose the option nearest in meaning to 'assess' in the context of evaluating a patient’s medication history:",
      options: ["Ignore", "Evaluate", "Prescribe", "Dispense"],
      correct: "Evaluate",
    },
    {
      question:
        "The patient’s compliance was described as sporadic. Choose the option nearest in meaning to 'sporadic':",
      options: ["Consistent", "Irregular", "Frequent", "Reliable"],
      correct: "Irregular",
    },
    {
      question:
        "The technician’s records were described as comprehensive. Choose the option nearest in meaning to 'comprehensive':",
      options: ["Incomplete", "Thorough", "Brief", "Inaccurate"],
      correct: "Thorough",
    },
    {
      question:
        "Choose the option nearest in meaning to 'clarify' in the context of explaining dosage instructions:",
      options: ["Confuse", "Explain", "Omit", "Complicate"],
      correct: "Explain",
    },
    {
      question: "What does 'prolific' mean in the context of a writer?",
      options: ["Unproductive", "Highly productive", "Amateur", "Cautious"],
      correct: "Highly productive",
    },
    {
      question: "Choose the synonym for 'exacerbate':",
      options: ["Improve", "Worsen", "Maintain", "Stabilize"],
      correct: "Worsen",
    },
    {
      question: "What is the antonym of 'authentic'?",
      options: ["Genuine", "Fake", "Original", "Real"],
      correct: "Fake",
    },
    {
      question: "What does 'meticulous' mean?",
      options: ["Careless", "Precise", "Hasty", "Relaxed"],
      correct: "Precise",
    },
    {
      question: "Choose the synonym for 'vibrant':",
      options: ["Dull", "Lively", "Calm", "Subdued"],
      correct: "Lively",
    },
    {
      question:
        "Read the passage: 'Pharmacy technicians must verify prescriptions to ensure patient safety. Errors in dispensing can lead to serious health risks.' What is the main idea of the passage?",
      options: [
        "Prescriptions are always accurate",
        "Verification of prescriptions is crucial for patient safety",
        "Dispensing errors are rare in pharmacies",
        "Pharmacy technicians should ignore prescriptions",
      ],
      correct: "Verification of prescriptions is crucial for patient safety",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ in labeling medications prevented errors.'",
      options: ["Carelessness", "Precision", "Haste", "Negligence"],
      correct: "Precision",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The patient were given a new prescription.",
        "The patient was given a new prescription.",
        "The patient are given a new prescription.",
        "The patient is given a new prescriptions.",
      ],
      correct: "The patient was given a new prescription.",
    },
    {
      question:
        "Which word is a synonym for 'administer' in the context of giving medication?",
      options: ["Prescribe", "Dispense", "Apply", "Store"],
      correct: "Apply",
    },
    {
      question:
        "Complete the sentence: 'Pharmacy technicians must ____ patient records to ensure accuracy.'",
      options: ["Ignore", "Update", "Discard", "Rewrite"],
      correct: "Update",
    },
    {
      question:
        "What is the antonym of 'clear' in the context of explaining dosage instructions?",
      options: ["Precise", "Vague", "Accurate", "Detailed"],
      correct: "Vague",
    },
    {
      question:
        "Which is the most appropriate way to explain medication use to a patient?",
      options: [
        "Take this medicine or you’ll regret it.",
        "Please take this medication as prescribed to manage your condition.",
        "This is your drug; use it however you want.",
        "You must take this, no questions asked.",
      ],
      correct:
        "Please take this medication as prescribed to manage your condition.",
    },
    {
      question:
        "Choose the correct verb form: 'Last week, the technician ____ the inventory.'",
      options: ["Check", "Checked", "Checking", "Checks"],
      correct: "Checked",
    },
    {
      question: "In a pharmacy, 'compliance' refers to:",
      options: [
        "The cost of medications",
        "The patient’s adherence to the prescribed regimen",
        "The storage of drugs",
        "The labeling of prescriptions",
      ],
      correct: "The patient’s adherence to the prescribed regimen",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The pharmacist reviewed the prescription carefully.",
        "All medications was stored properly.",
        "The technician labeled the bottles accurately.",
        "Patients were counseled on proper usage.",
      ],
      correct: "All medications was stored properly.",
    },
    {
      question:
        "Read the passage: 'Accurate labeling of medications is critical to avoid confusion and ensure proper use.' What does the passage emphasize?",
      options: [
        "The importance of accurate labeling",
        "The cost of medications",
        "The storage of medications",
        "The role of pharmacists",
      ],
      correct: "The importance of accurate labeling",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ helped resolve a patient’s query.'",
      options: ["Rudeness", "Patience", "Ignorance", "Haste"],
      correct: "Patience",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The medications is stored in a cool place.",
        "The medications are stored in a cool place.",
        "The medications was stored in a cool place.",
        "The medications be stored in a cool place.",
      ],
      correct: "The medications are stored in a cool place.",
    },
    {
      question:
        "Which word is a synonym for 'verify' in the context of checking prescriptions?",
      options: ["Ignore", "Confirm", "Discard", "Rewrite"],
      correct: "Confirm",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the dosage instructions to the patient.'",
      options: ["Explain", "Hide", "Complicate", "Omit"],
      correct: "Explain",
    },
    {
      question:
        "What is the antonym of 'safe' in the context of medication storage?",
      options: ["Secure", "Hazardous", "Protected", "Stable"],
      correct: "Hazardous",
    },
    {
      question:
        "Which is the most appropriate way to respond to a patient’s question about side effects?",
      options: [
        "Don’t worry about side effects.",
        "Some patients may experience side effects; please contact us if you notice any.",
        "Side effects are your problem.",
        "I don’t know anything about side effects.",
      ],
      correct:
        "Some patients may experience side effects; please contact us if you notice any.",
    },
    {
      question:
        "Choose the correct verb form: 'The pharmacist ____ the prescription yesterday.'",
      options: ["Review", "Reviewed", "Reviewing", "Reviews"],
      correct: "Reviewed",
    },
    {
      question: "In a pharmacy, 'dosage' refers to:",
      options: [
        "The cost of the medication",
        "The amount of medication to be taken",
        "The storage conditions",
        "The type of packaging",
      ],
      correct: "The amount of medication to be taken",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The technician checked the expiry dates.",
        "The patient were instructed to take one tablet daily.",
        "The pharmacist verified the prescription.",
        "Medications were stored properly.",
      ],
      correct: "The patient were instructed to take one tablet daily.",
    },
    {
      question:
        "Read the passage: 'Patient counseling improves adherence to medication regimens.' What does the passage suggest?",
      options: [
        "Counseling is unnecessary",
        "Counseling enhances medication adherence",
        "Patients ignore counseling",
        "Adherence is unrelated to counseling",
      ],
      correct: "Counseling enhances medication adherence",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ ensured accurate dispensing.'",
      options: ["Carelessness", "Attention", "Haste", "Ignorance"],
      correct: "Attention",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The tablets is to be taken with food.",
        "The tablets are to be taken with food.",
        "The tablets was to be taken with food.",
        "The tablets be to be taken with food.",
      ],
      correct: "The tablets are to be taken with food.",
    },
    {
      question:
        "Choose the option nearest in meaning to 'contraindicated' in the context of medication use:",
      options: ["Recommended", "Prohibited", "Optional", "Beneficial"],
      correct: "Prohibited",
    },
    {
      question:
        "The technician’s response was described as prompt. Choose the option nearest in meaning to 'prompt':",
      options: ["Delayed", "Timely", "Unclear", "Inaccurate"],
      correct: "Timely",
    },
    {
      question:
        "Choose the option nearest in meaning to 'administer' in the context of giving medication:",
      options: ["Prescribe", "Dispense", "Apply", "Store"],
      correct: "Apply",
      explanation:
        "To administer medication means to apply or give it to a patient.",
    },
    {
      question:
        "The pharmacist’s records were described as unerring. Choose the option nearest in meaning to 'unerring':",
      options: ["Faulty", "Accurate", "Incomplete", "Disorganized"],
      correct: "Accurate",
    },
    {
      question:
        "Which word is a synonym for 'counsel' in the context of patient education?",
      options: ["Advise", "Ignore", "Prescribe", "Dispense"],
      correct: "Advise",
    },
    {
      question:
        "Complete the sentence: 'The technician should ____ the patient about proper storage of medications.'",
      options: ["Mislead", "Inform", "Confuse", "Ignore"],
      correct: "Inform",
    },
    {
      question:
        "What is the antonym of 'accurate' in the context of prescription records?",
      options: ["Precise", "Inaccurate", "Reliable"],
      correct: "Inaccurate",
    },
    {
      question:
        "Which is the most appropriate way to address a patient’s concern about medication cost?",
      options: [
        "That’s not my problem.",
        "We can discuss affordable options or generics if needed.",
        "Just pay for it.",
        "I don’t know anything about costs.",
      ],
      correct: "We can discuss affordable options or generics if needed.",
    },
    {
      question:
        "Choose the correct verb form: 'The technician ____ the patient last month.'",
      options: ["Counsel", "Counseled", "Counseling", "Counsels"],
      correct: "Counseled",
    },
    {
      question: "In a pharmacy, 'generic' refers to:",
      options: [
        "A brand-name medication",
        "A non-branded equivalent of a medication",
        "A type of packaging",
        "A storage condition",
      ],
      correct: "A non-branded equivalent of a medication",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The pharmacist dispensed the medication accurately.",
        "The technician were responsible for labeling.",
        "The patient was given clear instructions.",
        "All drugs were stored properly.",
      ],
      correct: "The technician were responsible for labeling.",
    },
    {
      question:
        "Read the passage: 'Proper storage of medications prevents degradation and ensures efficacy.' What is the key point?",
      options: [
        "Storage is unimportant",
        "Proper storage maintains medication efficacy",
        "Medications degrade regardless of storage",
        "Efficacy is unrelated to storage",
      ],
      correct: "Proper storage maintains medication efficacy",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ ensured patient safety.'",
      options: ["Negligence", "Diligence", "Haste", "Ignorance"],
      correct: "Diligence",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The prescription were filled yesterday.",
        "The prescription was filled yesterday.",
        "The prescription are filled yesterday.",
        "The prescription is filled yesterday.",
      ],
      correct: "The prescription was filled yesterday.",
    },
    {
      question:
        "Which word is a synonym for 'dispense' in the context of medication distribution?",
      options: ["Prescribe", "Administer", "Distribute", "Store"],
      correct: "Distribute",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the medication before dispensing.'",
      options: ["Ignore", "Check", "Discard", "Rewrite"],
      correct: "Check",
    },
    {
      question:
        "What is the antonym of 'precise' in the context of dosageborg instructions?",
      options: ["Accurate", "Vague", "Clear", "Detailed"],
      correct: "Vague",
    },
    {
      question:
        "Which is the most appropriate way to clarify a prescription with a patient?",
      options: [
        "This is what you get; take it.",
        "Let me explain the dosage instructions to ensure you understand.",
        "I don’t have time to explain.",
        "Just follow the label.",
      ],
      correct:
        "Let me explain the dosage instructions to ensure you understand.",
    },
    {
      question:
        "Choose the correct verb form: 'The patient ____ about side effects last week.'",
      options: ["Ask", "Asked", "Asking", "Asks"],
      correct: "Asked",
    },
    {
      question: "In a pharmacy, 'refill' refers to:",
      options: [
        "A new prescription",
        "Additional supply of an existing prescription",
        "A type of medication",
        "A storage method",
      ],
      correct: "Additional supply of an existing prescription",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The technician verified the prescription.",
        "The medications was dispensed correctly.",
        "The patient received proper counseling.",
        "The pharmacist reviewed the records.",
      ],
      correct: "The medications was dispensed correctly.",
    },
    {
      question:
        "Read the passage: 'Clear communication with patients reduces medication errors.' What is the passage’s focus?",
      options: [
        "Medication errors are unavoidable",
        "Clear communication prevents errors",
        "Patients cause medication errors",
        "Communication is irrelevant",
      ],
      correct: "Clear communication prevents errors",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ improved patient trust.'",
      options: ["Rudeness", "Professionalism", "Carelessness", "Haste"],
      correct: "Professionalism",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The drugs is stored in a dry place.",
        "The drugs are stored in a dry place.",
        "The drugs was stored in a dry place.",
        "The drugs be stored in a dry place.",
      ],
      correct: "The drugs are stored in a dry place.",
    },
    {
      question:
        "Which word is a synonym for 'adverse' in the context of medication reactions?",
      options: ["Positive", "Negative", "Neutral", "Beneficial"],
      correct: "Negative",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the patient’s identity before dispensing.'",
      options: ["Ignore", "Verify", "Change", "Omit"],
      correct: "Verify",
    },
    {
      question:
        "What is the antonym of 'prompt' in the context of responding to patient queries?",
      options: ["Quick", "Delayed", "Immediate", "Timely"],
      correct: "Delayed",
    },
    {
      question:
        "Which is the most appropriate way to handle a patient’s confusion about dosage?",
      options: [
        "Figure it out yourself.",
        "Let me clarify the instructions for you.",
        "It’s not my job to explain.",
        "Just take it as written.",
      ],
      correct: "Let me clarify the instructions for you.",
    },
    {
      question:
        "Choose the correct verb form: 'The technician ____ the records yesterday.'",
      options: ["Update", "Updated", "Updating", "Updates"],
      correct: "Updated",
    },
    {
      question: "In a pharmacy, 'over-the-counter' refers to:",
      options: [
        "Prescription medications",
        "Medications available without a prescription",
        "Expired medications",
        "Controlled substances",
      ],
      correct: "Medications available without a prescription",
    },
    {
      question:
        "The technician’s labeling was described as meticulous. Choose the option nearest in meaning to 'meticulous':",
      options: ["Careless", "Precise", "Incomplete", "Rushed"],
      correct: "Precise",
    },
    {
      question:
        "The medication’s side effects were described as debilitating. Choose the option nearest in meaning to 'debilitating':",
      options: ["Mild", "Severe", "Temporary", "Beneficial"],
      correct: "Severe",
    },
    {
      question:
        "The patient’s adherence was described as exemplary. Choose the option nearest in meaning to 'exemplary':",
      options: ["Poor", "Model", "Inconsistent", "Average"],
      correct: "Model",
    },
    {
      question:
        "The pharmacist described the dosage as therapeutic. Choose the option nearest in meaning to 'therapeutic':",
      options: ["Harmful", "Healing", "Ineffective", "Temporary"],
      correct: "Healing",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The pharmacist counseled the patient.",
        "The technician were trained properly.",
        "The prescription was filled accurately.",
        "The medications were labeled correctly.",
      ],
      correct: "The technician were trained properly.",
    },
    {
      question:
        "Read the passage: 'Labeling errors can lead to incorrect medication use.' What does the passage highlight?",
      options: [
        "Labeling is unimportant",
        "Correct labeling prevents misuse",
        "Medication use is always correct",
        "Errors are rare in labeling",
      ],
      correct: "Correct labeling prevents misuse",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ ensured timely dispensing.'",
      options: ["Laziness", "Efficiency", "Carelessness", "Haste"],
      correct: "Efficiency",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The patient take one tablet daily.",
        "The patient takes one tablet daily.",
        "The patient taken one tablet daily.",
        "The patient taking one tablet daily.",
      ],
      correct: "The patient takes one tablet daily.",
    },
    {
      question:
        "Which word is a synonym for 'clarify' in the context of explaining instructions?",
      options: ["Confuse", "Explain", "Ignore", "Omit"],
      correct: "Explain",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the prescription for errors.'",
      options: ["Ignore", "Review", "Discard", "Rewrite"],
      correct: "Review",
    },
    {
      question:
        "Choose the option nearest in meaning to 'document' in the context of recording patient information:",
      options: ["Ignore", "Record", "Discard", "Rewrite"],
      correct: "Record",
    },
    {
      question:
        "The patient’s condition was described as ameliorated. Choose the option nearest in meaning to 'ameliorated':",
      options: ["Worsened", "Improved", "Unchanged", "Complicated"],
      correct: "Improved",
    },
    {
      question:
        "The technician’s communication was described as articulate. Choose the option nearest in meaning to 'articulate':",
      options: ["Confusing", "Eloquent", "Vague", "Silent"],
      correct: "Eloquent",
    },
    {
      question:
        "Choose the option nearest in meaning to 'overdose' in a medication context:",
      options: [
        "Insufficient dose",
        "Excessive dose",
        "Correct dose",
        "Missed dose",
      ],
      correct: "Excessive dose",
    },
    {
      question:
        "What is the antonym of 'reliable' in the context of medication information?",
      options: ["Trustworthy", "Unreliable", "Accurate", "Consistent"],
      correct: "Unreliable",
    },
    {
      question:
        "Which is the most appropriate way to respond to a patient’s question about generics?",
      options: [
        "Generics are the same as brand-name drugs in quality and effect.",
        "Generics are inferior; avoid them.",
        "I don’t know what generics are.",
        "Just take the brand-name drug.",
      ],
      correct:
        "Generics are the same as brand-name drugs in quality and effect.",
    },
    {
      question:
        "Choose the correct verb form: 'The patient ____ the medication last month.'",
      options: ["Receive", "Received", "Receiving", "Receives"],
      correct: "Received",
    },
    {
      question: "In a pharmacy, 'expiration date' refers to:",
      options: [
        "The date the medication was manufactured",
        "The last date the medication is safe to use",
        "The date the prescription was written",
        "The date the medication was dispensed",
      ],
      correct: "The last date the medication is safe to use",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The technician dispensed the medication.",
        "The patient were given two tablets.",
        "The pharmacist verified the dosage.",
        "The medications were stored correctly.",
      ],
      correct: "The patient were given two tablets.",
    },
    {
      question:
        "Read the passage: 'Pharmacy technicians must maintain accurate records to comply with regulations.' What is the passage’s focus?",
      options: [
        "Record-keeping is optional",
        "Accurate records ensure compliance",
        "Regulations are unimportant",
        "Technicians ignore records",
      ],
      correct: "Accurate records ensure compliance",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ prevented errors.'",
      options: ["Carelessness", "Vigilance", "Haste", "Ignorance"],
      correct: "Vigilance",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The medication were dispensed yesterday.",
        "The medication was dispensed yesterday.",
        "The medication are dispensed yesterday.",
        "The medication is dispensed yesterday.",
      ],
      correct: "The medication was dispensed yesterday.",
    },
    {
      question:
        "Which word is a synonym for 'monitor' in the context of tracking patient progress?",
      options: ["Ignore", "Observe", "Prescribe", "Dispense"],
      correct: "Observe",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the inventory regularly.'",
      options: ["Ignore", "Check", "Discard", "Rewrite"],
      correct: "Check",
    },
    {
      question:
        "What is the antonym of 'consistent' in the context of medication dosing?",
      options: ["Regular", "Irregular", "Stable", "Uniform"],
      correct: "Irregular",
    },
    {
      question:
        "Which is the most appropriate way to address a patient’s concern about medication interactions?",
      options: [
        "Don’t worry about interactions.",
        "Let’s review your medications to check for interactions.",
        "Interactions are not my concern.",
        "Just take the drugs.",
      ],
      correct: "Let’s review your medications to check for interactions.",
    },
    {
      question:
        "Choose the correct verb form: 'The technician ____ the patient yesterday.'",
      options: ["Assist", "Assisted", "Assisting", "Assists"],
      correct: "Assisted",
    },
    {
      question: "In a pharmacy, 'controlled substance' refers to:",
      options: [
        "A medication with no restrictions",
        "A medication with strict regulations",
        "A type of packaging",
        "A generic medication",
      ],
      correct: "A medication with strict regulations",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The pharmacist checked the prescription.",
        "The medications was labeled correctly.",
        "The technician counseled the patient.",
        "The patient received the medication.",
      ],
      correct: "The medications was labeled correctly.",
    },
    {
      question:
        "Read the passage: 'Patient education improves medication adherence.' What does the passage emphasize?",
      options: [
        "Education is unnecessary",
        "Education enhances adherence",
        "Adherence is unaffected by education",
        "Patients ignore education",
      ],
      correct: "Education enhances adherence",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ ensured accurate records.'",
      options: ["Carelessness", "Accuracy", "Haste", "Ignorance"],
      correct: "Accuracy",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The patient were taking one tablet daily.",
        "The patient was taking one tablet daily.",
        "The patient are taking one tablet daily.",
        "The patient is take one tablet daily.",
      ],
      correct: "The patient was taking one tablet daily.",
    },
    {
      question:
        "Which word is a synonym for 'assess' in the context of evaluating a prescription?",
      options: ["Ignore", "Evaluate", "Prescribe", "Dispense"],
      correct: "Evaluate",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the patient’s allergies.'",
      options: ["Ignore", "Document", "Discard", "Rewrite"],
      correct: "Document",
    },
    {
      question:
        "What is the antonym of 'safe' in the context of medication use?",
      options: ["Secure", "Dangerous", "Protected", "Stable"],
      correct: "Dangerous",
    },
    {
      question:
        "Which is the most appropriate way to explain storage instructions to a patient?",
      options: [
        "Store it however you want.",
        "Keep this medication in a cool, dry place away from children.",
        "I don’t know how to store it.",
        "Just put it anywhere.",
      ],
      correct: "Keep this medication in a cool, dry place away from children.",
    },
    {
      question:
        "Choose the correct verb form: 'The pharmacist ____ the dosage last week.'",
      options: ["Verify", "Verified", "Verifying", "Verifies"],
      correct: "Verified",
    },
    {
      question: "In a pharmacy, 'side effect' refers to:",
      options: [
        "The primary effect of a medication",
        "An unintended effect of a medication",
        "The cost of a medication",
        "The storage requirement",
      ],
      correct: "An unintended effect of a medication",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The technician reviewed the prescription.",
        "The patient were advised to take one tablet.",
        "The pharmacist dispensed the medication.",
        "The medications were stored properly.",
      ],
      correct: "The patient were advised to take one tablet.",
    },
    {
      question:
        "Read the passage: 'Accurate dispensing ensures patients receive the correct medication.' What is the passage’s focus?",
      options: [
        "Dispensing is unimportant",
        "Accurate dispensing is critical",
        "Patients always receive correct medication",
        "Dispensing errors are common",
      ],
      correct: "Accurate dispensing is critical",
    },
    {
      question:
        "Choose the word that best completes the sentence: 'The technician’s ____ ensured patient safety.'",
      options: ["Negligence", "Carefulness", "Haste", "Ignorance"],
      correct: "Carefulness",
    },
    {
      question: "Identify the correct sentence:",
      options: [
        "The medications is dispensed daily.",
        "The medications are dispensed daily.",
        "The medications was dispensed daily.",
        "The medications be dispensed daily.",
      ],
      correct: "The medications are dispensed daily.",
    },
    {
      question:
        "Which word is a synonym for 'inform' in the context of patient education?",
      options: ["Confuse", "Educate", "Ignore", "Omit"],
      correct: "Educate",
    },
    {
      question:
        "Complete the sentence: 'The technician must ____ the prescription with the pharmacist.'",
      options: ["Ignore", "Discuss", "Discard", "Rewrite"],
      correct: "Discuss",
    },
    {
      question:
        "What is the antonym of 'effective' in the context of medication outcomes?",
      options: ["Successful", "Ineffective", "Potent", "Reliable"],
      correct: "Ineffective",
    },
    {
      question:
        "Which is the most appropriate way to respond to a patient’s question about dosage timing?",
      options: [
        "Take it whenever you want.",
        "Take this medication at the same time each day for best results.",
        "I don’t know the timing.",
        "Just take it when you remember.",
      ],
      correct:
        "Take this medication at the same time each day for best results.",
    },
    {
      question:
        "Choose the correct verb form: 'The technician ____ the patient last week.'",
      options: ["Counsel", "Counseled", "Counseling", "Counsels"],
      correct: "Counseled",
    },
    {
      question: "In a pharmacy, 'interaction' refers to:",
      options: [
        "The cost of medications",
        "The effect of one medication on another",
        "The storage of medications",
        "The labeling of prescriptions",
      ],
      correct: "The effect of one medication on another",
    },
    {
      question: "Which sentence contains an error?",
      options: [
        "The pharmacist verified the prescription.",
        "The medications was stored correctly.",
        "The technician dispensed the medication.",
        "The patient was counseled properly.",
      ],
      correct: "The medications was stored correctly.",
    },
    {
      question:
        "Choose the correct verb form: 'The pharmacist ____ the prescription yesterday.'",
      options: ["Review", "Reviewed", "Reviewing", "Reviews"],
      correct: "Reviewed",
    },
    {
      question: "In a pharmacy, 'adherence' refers to:",
      options: [
        "The cost of medications",
        "The patient’s commitment to the prescribed regimen",
        "The storage of medications",
        "The labeling of prescriptions",
      ],
      correct: "The patient’s commitment to the prescribed regimen",
    },
    {
      question: "The camera must be very modern, _____?",
      options: ["can't it", "mustn't it", "isn't it", "is it"],
      correct: "isn't it",
    },
    {
      question: "It has automatic focusing, _____?",
      options: ["can't it", "don't they", "wasn't", "hasn't it"],
      correct: "hasn't it",
    },
    {
      question: "They were excellent photographs, _____?",
      options: ["weren't they", "isn't it", "aren't they", "hasn't it"],
      correct: "weren't they",
    },
    {
      question:
        "He was explaining about the accessories that go with it, _____?",
      options: ["wasn't it", "don't they", "isn't he", "wasn't he"],
      correct: "wasn't he",
    },
    {
      question: "Ali has explained how it was broken, _____?",
      options: ["isn't it", "didn't it", "hasn't it", "hasn't he"],
      correct: "hasn't he",
    },
    {
      question: "He can take excellent photographs, _____?",
      options: ["didn't he", "couldn't he", "doesn't he", "can't he"],
      correct: "can't he",
    },
    {
      question:
        "They are making six copies of each of the photographs we ask for, _____?",
      options: ["haven't they", "aren't they", "aren't we", "don't they"],
      correct: "aren't they",
    },
    {
      question: "We will need a photographer, _____?",
      options: ["won't we", "won't it", "haven't we", "don't we"],
      correct: "won't we",
    },
    {
      question:
        "When I go to the doctor, I tell the _____ my name and take a seat in the _____ room.",
      options: [
        "receptionist, waiting",
        "pharmacist, operation",
        "chemist, treatment",
        "receptionist, appointment",
      ],
      correct: "receptionist, waiting",
    },
    {
      question:
        "My doctor is very busy so I have to make an _____ before I go to see him.",
      options: ["agreement", "attempt", "speech", "appointment"],
      correct: "appointment",
    },
    {
      question:
        "He asks me what's wrong with me, I tell him the _____ of my illness.",
      options: ["treatments", "pulse", "symptoms", "prescription"],
      correct: "symptoms",
    },
    {
      question: "Then he will usually _____ me.",
      options: ["operate", "bill", "treat", "examine"],
      correct: "examine",
    },
    {
      question: "He'll listen to my heart with his _____.",
      options: ["periscope", "pulse", "symptom", "stethoscope"],
      correct: "stethoscope",
    },
    {
      question: "He’ll hold my wrist to feel my _____.",
      options: ["skin", "pulse", "symptoms", "blood"],
      correct: "pulse",
    },
    {
      question: "He’ll take my _____ with his _____.",
      options: [
        "pulse, thermometer",
        "temperature, thermometer",
        "blood, meter",
        "heart, barometer",
      ],
      correct: "temperature, thermometer",
    },
    {
      question:
        "The problem is usually something simple and he might give me a _____ for some medicine.",
      options: ["prescription", "bill", "receipt", "medicine"],
      correct: "prescription",
    },
    {
      question: "I take it to the _____.",
      options: ["receptionist", "pharmacist", "biologist", "therapist"],
      correct: "pharmacist",
    },
    {
      question: "If I needed more serious _____, I'd have to go to hospital.",
      options: ["treatment", "threat", "symptom", "reaction"],
      correct: "treatment",
    },
    {
      question: "At the hospital, I’d be put in a bed in a(an) _____.",
      options: ["operation room", "ward", "waiting room", "dormitory"],
      correct: "ward",
    },
    {
      question:
        "If there were something seriously wrong with me, I might need a(an) _____.",
      options: ["operation", "prescription", "receipt", "examining"],
      correct: "operation",
    },
    {
      question: "They didn't play, _____?",
      options: ["do", "did", "does", "didn't"],
      correct: "did",
    },
    {
      question: "Morenike, as well as Bunmi, _____ at the party.",
      options: ["was", "were", "is", "are"],
      correct: "was",
    },
    {
      question: "The _____ book fell into the pond.",
      options: ["boys'", "boy's", "boys", "boy"],
      correct: "boy's",
    },
    {
      question: "The conductor must apologize _____ the passengers.",
      options: ["to", "for", "with", "at"],
      correct: "to",
    },
    {
      question: "Linda has very _____ friends.",
      options: ["little", "a few", "few", "a little"],
      correct: "few",
    },
    {
      question: "Jummy is absent; he _____ be sick again.",
      options: ["can", "must", "will", "would"],
      correct: "must",
    },
    {
      question: "We have some _____ news for you.",
      options: ["ruin", "exciting", "reigning", "compelling"],
      correct: "exciting",
    },
    {
      question: "I _____ travel a lot, but now I prefer to stay at home.",
      options: ["must", "used to", "would", "will"],
      correct: "used to",
    },
    {
      question: "_____ you can write well, your spelling is poor.",
      options: ["If", "While", "Whereas", "Although"],
      correct: "Although",
    },
    {
      question: "Mr. Akpede _____ car was stolen is our Mathematics lecturer.",
      options: ["who", "whom", "whose", "which"],
      correct: "whose",
    },
    {
      question: "There is _____ time to waste.",
      options: ["no", "a few", "few", "a little"],
      correct: "no",
    },
    {
      question: "Bimbo is the _____ in the class.",
      options: ["more older", "older", "oldest", "old"],
      correct: "oldest",
    },
    {
      question: "The plural of 'forum' is:",
      options: ["group", "assembly", "meetings", "fora"],
      correct: "fora",
    },
    {
      question: "Nouns that can be seen or felt (physically) are called:",
      options: [
        "collective nouns",
        "common nouns",
        "proper nouns",
        "concrete nouns",
      ],
      correct: "concrete nouns",
    },
    {
      question:
        "Nouns that name concepts, ideas, beliefs, or qualities are called:",
      options: [
        "uncountable nouns",
        "abstract nouns",
        "collective nouns",
        "proper nouns",
      ],
      correct: "abstract nouns",
    },
    {
      question: "Pronouns that usually end in 'self' or 'selves' are called:",
      options: [
        "reflexive pronouns",
        "personal pronouns",
        "relative pronouns",
        "demonstrative pronouns",
      ],
      correct: "reflexive pronouns",
    },
    {
      question: "Verbs used with an object are called:",
      options: [
        "irregular verbs",
        "auxiliary verbs",
        "transitive verbs",
        "intransitive verbs",
      ],
      correct: "transitive verbs",
    },
    {
      question:
        "Verbs to which the suffix 'ed' can be added to the infinitive are called:",
      options: [
        "regular verbs",
        "irregular verbs",
        "auxiliary verbs",
        "transitive verbs",
      ],
      correct: "regular verbs",
    },
    {
      question:
        "The men were tardy in offering help. Choose the option nearest in meaning to 'tardy':",
      options: ["Brave", "Generous", "Slow", "Quick"],
      correct: "Slow",
    },
    {
      question:
        "Funmi is just being facetious about her marrying a soldier. Choose the option nearest in meaning to 'facetious':",
      options: ["Unserious", "Crazy", "Serious", "Unfaithful"],
      correct: "Unserious",
    },
    {
      question:
        "The professor discussed a number of abstruse topics. Choose the option nearest in meaning to 'abstruse':",
      options: ["Esoteric", "Relevant", "Irrelevant", "Useful"],
      correct: "Esoteric",
    },
    {
      question:
        "Bose was angry because her friend called her pilferer. Choose the option nearest in meaning to 'pilferer':",
      options: ["Hypocrite", "Thief", "Criminal", "Liar"],
      correct: "Thief",
    },
    {
      question:
        "While the hooligans exchanged blows, we looked complacently. Choose the option nearest in meaning to 'complacently':",
      options: ["Dejectedly", "Sorrowfully", "Questioningly", "Contentedly"],
      correct: "Contentedly",
    },
    {
      question:
        "Tade became timorous when asked to give valedictory speech. Choose the option nearest in meaning to 'timorous':",
      options: ["Excited", "Nervous", "Aggressive", "Happy"],
      correct: "Nervous",
    },
    {
      question:
        "The player kept on gamely to the end of the match. Choose the option nearest in meaning to 'gamely':",
      options: ["Amateurishly", "Skillfully", "Courageously", "Stubbornly"],
      correct: "Courageously",
    },
    {
      question:
        "Art lies in cherishing the initiative and creative power of each person. Choose the option nearest in meaning to 'creative power':",
      options: ["Potential", "Strength", "Gift", "Mind"],
      correct: "Potential",
    },
    {
      question:
        "The town was in such a turmoil that the dance was called off. Choose the option nearest in meaning to 'turmoil':",
      options: [
        "Mourning state",
        "Rainy state",
        "State of darkness",
        "State of confusion",
      ],
      correct: "State of confusion",
    },
    {
      question:
        "The festivals create in people a feeling of pride in their cultural heritage. Choose the option nearest in meaning to 'cultural heritage':",
      options: ["History", "Heirloom", "Legacy", "Possession"],
      correct: "Legacy",
    },
    {
      question:
        "Funnily enough, the priest prayed for the robbers who shot him. Choose the option nearest in meaning to 'funnily enough':",
      options: ["Timidly", "Unexpectedly", "Disappointingly", "Fearlessly"],
      correct: "Unexpectedly",
    },
    {
      question:
        "The presence of the captain makes the sailors ill at ease. Choose the option nearest in meaning to 'ill at ease':",
      options: ["Uncomfortable", "Sickly", "Impatient", "Easily ill"],
      correct: "Uncomfortable",
    },
    {
      question:
        "The press described the efforts of the government in pejorative terms. Choose the option nearest in meaning to 'pejorative':",
      options: ["Critical", "Contemptible", "Palpable", "Superlative"],
      correct: "Contemptible",
    },
    {
      question:
        "Okonkwo manages his household with a heavy hand. Choose the option nearest in meaning to 'with a heavy hand':",
      options: [
        "Like a powerful dictator",
        "Using the cane on every occasion",
        "Without tolerating weakness",
        "Like a heavyweight champion",
      ],
      correct: "Without tolerating weakness",
    },
    {
      question:
        "The school’s badge is the insignia of office for all the prefects in the school. Choose the option nearest in meaning to 'insignia':",
      options: ["Power", "Symbol", "Seal", "Recognition"],
      correct: "Symbol",
    },
    {
      question:
        "Ibro shows enough liberality with his meagre income. Choose the option nearest in meaning to 'liberality':",
      options: ["Generosity", "Frugality", "Prodigality", "Insensitivity"],
      correct: "Generosity",
    },
    {
      question:
        "It is a misnomer to call three thousand naira a living wage. Choose the option nearest in meaning to 'misnomer':",
      options: [
        "An incontrovertible assertion",
        "An appropriate term",
        "A wrong description",
        "A mishmash",
      ],
      correct: "A wrong description",
    },
    {
      question:
        "His plans boomeranged on him. Choose the option nearest in meaning to 'boomeranged':",
      options: ["Bounced", "Fell", "Catapulted", "Backfired"],
      correct: "Backfired",
    },
    {
      question:
        "The manager’s knowledge of the strike is of the utmost importance. Choose the option nearest in meaning to 'utmost':",
      options: ["Standard", "Genuine", "Paramount", "Basic"],
      correct: "Paramount",
    },
    {
      question:
        "There has been a downturn in the affairs of the company. Choose the option nearest in meaning to 'downturn':",
      options: [
        "A massive increase",
        "A turn-around",
        "Little progress",
        "A decline",
      ],
      correct: "A decline",
    },
    {
      question:
        "The mottled skin of a person with HIV indicates an advanced stage of its development. Choose the option nearest in meaning to 'mottled':",
      options: ["Brown", "Spotted", "Scaly", "Pimply"],
      correct: "Spotted",
    },
    {
      question:
        "Inspite of constant financial support from his father, Udenyi treats his studies with considerable levity. Choose the option nearest in meaning to 'levity':",
      options: ["Seriousness", "Enthusiasm", "Wastefulness", "Lassitude"],
      correct: "Lassitude",
    },
    {
      question:
        "The prosecutor was fully able to substantiate the charge. Choose the option nearest in meaning to 'substantiate':",
      options: ["Expatiate on", "Prove", "Dismiss", "Weaken"],
      correct: "Prove",
    },
    {
      question:
        "I do not think any sane person would have acted in such a ______ manner.",
      options: ["Rational", "Composed", "Secret", "Cruel"],
      correct: "Cruel",
    },
    {
      question: "Neither Agbo nor his parents ______ the meetings now.",
      options: ["Attended", "Attend", "Has attended", "Attends"],
      correct: "Attend",
    },
    {
      question:
        "Modern dancing has become rather scientific and requires ______.",
      options: [
        "Bizarre costuming",
        "Some choreographic skill",
        "Immense instrumentation",
        "A rapping voice",
      ],
      correct: "Some choreographic skill",
    },
    {
      question:
        "Had he considered his public image carefully, he ______ for his opponent in the election.",
      options: [
        "Might have stood aside",
        "Would have stepped aside",
        "Should have stepped aside",
        "Would have stood down",
      ],
      correct: "Would have stepped aside",
    },
    {
      question:
        "The government which ______ recruiting ______ workers suddenly stopped doing so.",
      options: ["Are/its", "Was/its", "Is/their", "Were/their"],
      correct: "Was/its",
    },
    {
      question:
        "Of course we all saw the culprit ______ and hit the man on the head.",
      options: ["Approached", "Approaching", "Approach", "Approaches"],
      correct: "Approach",
    },
    {
      question:
        "A child that shows mature characteristics at an early age may be described as ______.",
      options: ["Preconceived", "Premature", "Ingenuous", "Precocious"],
      correct: "Precocious",
    },
    {
      question:
        "When Ajike met her ______ husband at the party, she felt like reconciling with him.",
      options: ["Estranged", "Strange", "Caring", "Loving"],
      correct: "Estranged",
    },
    {
      question: "They had to ______ the generator when the electricity failed.",
      options: ["Light up", "Fall back on", "Switch on", "Resort to"],
      correct: "Switch on",
    },
    {
      question:
        "The editor was not happy that the Nigerian press was hemmed ______.",
      options: ["Up", "Over", "Across", "In"],
      correct: "In",
    },
    {
      question:
        "Three quarters of the hostel ______ been painted and three quarters of the students ______ moved in.",
      options: ["Has/has", "Has/have", "Have/has", "Have/have"],
      correct: "Has/have",
    },
    {
      question:
        "A wide range of options ______ made available to the political parties during the recently conducted elections.",
      options: ["Are", "Were", "Was", "Is"],
      correct: "Was",
    },
    {
      question: "Actually, he forgot the one to ______ the job was given.",
      options: ["Whom", "Who", "Whomever", "Whoever"],
      correct: "Whom",
    },
    {
      question: "You may not have heard the last word on the matter ______?",
      options: ["May you have", "Haven’t you", "Have you", "Mayn’t have you"],
      correct: "Have you",
    },
    {
      question:
        "All God’s prophets were given the great ______ to preach salvation to people.",
      options: ["Commision", "Commition", "Comission", "Commission"],
      correct: "Commission",
    },
    {
      question:
        "Ali goes to the stadium regularly but he ______ to church for months.",
      options: ["Hasn’t been", "Haven’t been", "Didn’t go", "Hadn’t been"],
      correct: "Hasn’t been",
    },
    {
      question: "Each of the houses ______ a new look.",
      options: ["Have got", "Have", "Has", "Were given"],
      correct: "Has",
    },
    {
      question: "Choose the synonym for 'ameliorate':",
      options: ["Worsen", "Improve", "Maintain", "Ignore"],
      correct: "Improve",
    },
    {
      question: "What is the antonym of 'transparent'?",
      options: ["Clear", "Opaque", "Visible", "Bright"],
      correct: "Opaque",
    },
    {
      question:
        "The politician’s speech was described as bombastic. Choose the nearest meaning to 'bombastic':",
      options: ["Humble", "Exaggerated", "Concise", "Sincere"],
      correct: "Exaggerated",
    },
    {
      question: "Choose the correct sentence:",
      options: [
        "They doesn’t know the answer.",
        "They don’t know the answer.",
        "They don’t knows the answer.",
        "They doesn’t knows the answer.",
      ],
      correct: "They don’t know the answer.",
    },
    {
      question: "What is the synonym for 'prudent'?",
      options: ["Careless", "Wise", "Reckless", "Bold"],
      correct: "Wise",
    },
    {
      question:
        "The book’s plot was quite convoluted. Choose the nearest meaning to 'convoluted':",
      options: ["Simple", "Complex", "Clear", "Predictable"],
      correct: "Complex",
    },
    {
      question: "What part of speech is 'happiness'?",
      options: ["Verb", "Adjective", "Noun", "Adverb"],
      correct: "Noun",
    },
    {
      question:
        "Fill in the blank: She ______ the room before the guests arrived.",
      options: ["Clean", "Cleans", "Cleaned", "Cleaning"],
      correct: "Cleaned",
    },
    {
      question: "Choose the antonym for 'generous':",
      options: ["Kind", "Selfish", "Giving", "Charitable"],
      correct: "Selfish",
    },
    {
      question:
        "The manager spoke in an authoritative tone. Choose the nearest meaning to 'authoritative':",
      options: ["Weak", "Commanding", "Gentle", "Uncertain"],
      correct: "Commanding",
    },
    {
      question: "What is the correct spelling?",
      options: ["Seperate", "Separate", "Separete", "Seperete"],
      correct: "Separate",
    },
    {
      question: "Choose the synonym for 'mitigate':",
      options: ["Aggravate", "Reduce", "Ignore", "Increase"],
      correct: "Reduce",
    },
    {
      question:
        "The lecture was tedious for the students. Choose the nearest meaning to 'tedious':",
      options: ["Exciting", "Boring", "Engaging", "Brief"],
      correct: "Boring",
    },
    {
      question: "What is the plural of 'datum'?",
      options: ["Data", "Datums", "Dates", "Dati"],
      correct: "Data",
    },
    {
      question:
        "Fill in the blank: If I ______ earlier, I would have caught the bus.",
      options: ["Leave", "Left", "Had left", "Leaving"],
      correct: "Had left",
    },
    {
      question: "Choose the antonym for 'ancient':",
      options: ["Old", "Modern", "Historic", "Aged"],
      correct: "Modern",
    },
    {
      question:
        "Her decision was irrevocable. Choose the nearest meaning to 'irrevocable':",
      options: ["Changeable", "Final", "Temporary", "Uncertain"],
      correct: "Final",
    },
    {
      question: "What is a compound word?",
      options: [
        "A single adjective",
        "Two words joined",
        "A verb tense",
        "A punctuation mark",
      ],
      correct: "Two words joined",
    },
    {
      question:
        "Choose the correct form: Neither the boys nor the girl ______ to blame.",
      options: ["Is", "Are", "Was", "Were"],
      correct: "Is",
    },
    {
      question: "The synonym for 'ephemeral' is:",
      options: ["Permanent", "Lasting", "Brief", "Enduring"],
      correct: "Brief",
    },
    {
      question:
        "What is the correct punctuation? ______ going to the party tonight?",
      options: ["Who’s", "Whose", "Whos", "Who is"],
      correct: "Who’s",
    },
    {
      question: "Choose the antonym for 'prosperity':",
      options: ["Wealth", "Poverty", "Success", "Growth"],
      correct: "Poverty",
    },
    {
      question:
        "The speaker’s tone was sardonic. Choose the nearest meaning to 'sardonic':",
      options: ["Sincere", "Mocking", "Joyful", "Neutral"],
      correct: "Mocking",
    },
    {
      question: "What is an adverb?",
      options: [
        "Describes a noun",
        "Names a person",
        "Modifies a verb",
        "Joins sentences",
      ],
      correct: "Modifies a verb",
    },
    {
      question:
        "Fill in the blank: The team ______ hard to win the championship.",
      options: ["Work", "Works", "Worked", "Working"],
      correct: "Worked",
    },
    {
      question: "Choose the synonym for 'resilient':",
      options: ["Fragile", "Adaptable", "Weak", "Rigid"],
      correct: "Adaptable",
    },
    {
      question: "What is the antonym of 'hostile'?",
      options: ["Friendly", "Angry", "Aggressive", "Cold"],
      correct: "Friendly",
    },
    {
      question:
        "The policy was deemed obsolete. Choose the nearest meaning to 'obsolete':",
      options: ["Current", "Outdated", "Popular", "Effective"],
      correct: "Outdated",
    },
    {
      question: "Choose the correct sentence:",
      options: [
        "He run fast.",
        "He runs fast.",
        "He running fast.",
        "He runned fast.",
      ],
      correct: "He runs fast.",
    },
    {
      question: "What is the synonym for 'vivid'?",
      options: ["Dull", "Bright", "Faint", "Vague"],
      correct: "Bright",
    },
    {
      question: "Fill in the blank: ______ the rain, the match continued.",
      options: ["Despite", "Because", "Since", "Unless"],
      correct: "Despite",
    },
    {
      question: "Choose the antonym for 'confident':",
      options: ["Sure", "Doubtful", "Bold", "Certain"],
      correct: "Doubtful",
    },
    {
      question:
        "The artist’s work was eclectic. Choose the nearest meaning to 'eclectic':",
      options: ["Uniform", "Varied", "Simple", "Traditional"],
      correct: "Varied",
    },
    {
      question:
        "What does the term 'adverse effect' mean in a medication label?",
      options: [
        "A beneficial outcome",
        "A side effect",
        "A dosage instruction",
        "A storage requirement",
      ],
      correct: "A side effect",
    },
    {
      question:
        "Fill in the blank: The pharmacist asked the technician to ______ the prescription before dispensing.",
      options: ["Verify", "Verifies", "Verified", "Verifying"],
      correct: "Verify",
    },
    {
      question: "Choose the antonym for 'potent' when describing a medication:",
      options: ["Strong", "Weak", "Effective", "Active"],
      correct: "Weak",
    },
    {
      question: "What is the meaning of 'q.i.d.' on a prescription?",
      options: [
        "Once daily",
        "Twice daily",
        "Three times daily",
        "Four times daily",
      ],
      correct: "Four times daily",
    },
    {
      question:
        "Choose the correct sentence: The technician ______ the medication to the patient.",
      options: ["Handed", "Hand", "Handing", "Hands"],
      correct: "Handed",
    },
    {
      question:
        "What does 'contraindication' mean in a drug information sheet?",
      options: [
        "A recommended use",
        "A reason not to use the drug",
        "A dosage guideline",
        "A storage instruction",
      ],
      correct: "A reason not to use the drug",
    },
    {
      question:
        "Fill in the blank: The patient asked if the medication ______ any side effects.",
      options: ["Has", "Have", "Had", "Having"],
      correct: "Has",
    },
    {
      question:
        "Choose the synonym for 'generic' in the context of medications:",
      options: ["Brand-name", "Non-proprietary", "Expensive", "Specific"],
      correct: "Non-proprietary",
    },
    {
      question: "What does 'PRN' stand for on a prescription?",
      options: ["As needed", "Every morning", "Before meals", "At bedtime"],
      correct: "As needed",
    },
    {
      question:
        "Choose the correct form: The pharmacist ______ the technician to double-check the dosage.",
      options: ["Instruct", "Instructs", "Instructed", "Instructing"],
      correct: "Instructed",
    },
    {
      question:
        "What is the meaning of 'expiration date' on a medication bottle?",
      options: [
        "The date of manufacture",
        "The last date the drug is safe to use",
        "The date of purchase",
        "The date of dispensing",
      ],
      correct: "The last date the drug is safe to use",
    },
    {
      question:
        "Fill in the blank: The technician ______ the medication in a locked cabinet.",
      options: ["Store", "Stores", "Stored", "Storing"],
      correct: "Stored",
    },
    {
      question:
        "Choose the antonym for 'accurate' when verifying a prescription:",
      options: ["Precise", "Incorrect", "Reliable"],
      correct: "Incorrect",
    },
    {
      question: "What does 'OTC' mean in a pharmacy setting?",
      options: [
        "Over-the-counter",
        "On-the-counter",
        "Out-of-the-counter",
        "Only-the-counter",
      ],
      correct: "Over-the-counter",
    },
    {
      question:
        "Choose the correct sentence: The patient ______ the instructions on the label.",
      options: ["Read", "Reads", "Reading", "Readed"],
      correct: "Read",
    },
    {
      question: "What is the meaning of 'dosage' in a prescription?",
      options: [
        "The type of medication",
        "The amount to be taken",
        "The storage condition",
        "The manufacturer’s name",
      ],
      correct: "The amount to be taken",
    },
    {
      question: "What is the meaning of 'controlled substance' in a pharmacy?",
      options: [
        "A drug with no side effects",
        "A drug regulated due to abuse potential",
        "A drug for over-the-counter use",
        "A drug with low potency",
      ],
      correct: "A drug regulated due to abuse potential",
    },
    {
      question:
        "Fill in the blank: The patient ______ the pharmacist if the medication was safe to use.",
      options: ["Ask", "Asks", "Asked", "Asking"],
      correct: "Asked",
    },
    {
      question: "Choose the synonym for 'label' in a pharmacy context:",
      options: ["Tag", "Prescription", "Dosage", "Container"],
      correct: "Tag",
    },
    {
      question: "What does 'PO' mean on a prescription?",
      options: [
        "By mouth",
        "By injection",
        "By inhalation",
        "By topical application",
      ],
      correct: "By mouth",
    },
    {
      question:
        "Choose the correct form: The pharmacist ______ the patient’s prescription history before dispensing.",
      options: ["Review", "Reviews", "Reviewed", "Reviewing"],
      correct: "Reviewed",
    },
    {
      question:
        "What is the meaning of 'allergic reaction' in a medication context?",
      options: [
        "A beneficial response",
        "An adverse response to a drug",
        "A dosage adjustment",
        "A storage issue",
      ],
      correct: "An adverse response to a drug",
    },
    {
      question:
        "Fill in the blank: The technician ______ the medication to the patient after verifying the prescription.",
      options: ["Hand", "Hands", "Handed", "Handing"],
      correct: "Handed",
    },
    {
      question:
        "Choose the antonym for 'expired' when referring to medications:",
      options: ["Outdated", "Valid", "Spoiled", "Used"],
      correct: "Valid",
    },
    {
      question: "What does 'IV' mean in a medical context?",
      options: [
        "Intravenous",
        "Internal volume",
        "Inhaled vapor",
        "Immediate value",
      ],
      correct: "Intravenous",
    },
    {
      question:
        "Choose the correct sentence: The patient ______ the medication as instructed.",
      options: ["Take", "Takes", "Took", "Taking"],
      correct: "Took",
    },
    {
      question: "What is the meaning of 'refill' in a prescription context?",
      options: [
        "A new prescription",
        "An additional supply of medication",
        "A dosage change",
        "A storage requirement",
      ],
      correct: "An additional supply of medication",
    },
    {
      question:
        "Fill in the blank: The pharmacist ______ the technician to store the medication in a cool, dry place.",
      options: ["Instruct", "Instructs", "Instructed", "Instructing"],
      correct: "Instructed",
    },
    {
      question: "Choose the synonym for 'verify' in a pharmacy context:",
      options: ["Check", "Prescribe", "Diagnose", "Dispense"],
      correct: "Check",
    },
    {
      question: "What does 't.i.d.' mean on a prescription?",
      options: [
        "Once daily",
        "Twice daily",
        "Three times daily",
        "Four times daily",
      ],
      correct: "Three times daily",
    },
    {
      question:
        "Choose the correct form: The technician ______ the medication stock every week.",
      options: ["Count", "Counts", "Counted", "Counting"],
      correct: "Counts",
    },
    {
      question: "What is the meaning of 'overdose' in a medication context?",
      options: [
        "Taking too little medication",
        "Taking too much medication",
        "Taking medication on time",
        "Taking medication with food",
      ],
      correct: "Taking too much medication",
    },
    {
      question:
        "Choose the correct form: The technician ______ the medication to the correct shelf.",
      options: ["Place", "Places", "Placed", "Placing"],
      correct: "Placed",
    },
    {
      question: "What is the meaning of 'interaction' in a medication context?",
      options: [
        "A drug’s effect on the body",
        "The effect of one drug on another",
        "A dosage adjustment",
        "A storage requirement",
      ],
      correct: "The effect of one drug on another",
    },
    {
      question:
        "Fill in the blank: The patient ______ the medication label before taking the drug.",
      options: ["Read", "Reads", "Reading", "Readed"],
      correct: "Read",
    },
    {
      question:
        "Choose the antonym for 'safe' when referring to medication use:",
      options: ["Dangerous", "Secure", "Reliable", "Effective"],
      correct: "Dangerous",
    },
    {
      question: "What does 'HS' mean on a prescription?",
      options: ["At bedtime", "Every morning", "With meals", "As needed"],
      correct: "At bedtime",
    },
    {
      question:
        "Choose the correct sentence: The pharmacist ______ the technician to reorder the medication.",
      options: ["Tell", "Tells", "Told", "Telling"],
      correct: "Told",
    },
    {
      question:
        "What is the meaning of 'batch number' on a medication package?",
      options: [
        "The price of the drug",
        "The identification number for a production lot",
        "The dosage instruction",
        "The patient’s name",
      ],
      correct: "The identification number for a production lot",
    },
    {
      question:
        "Fill in the blank: The technician ______ the pharmacist about the expired stock.",
      options: ["Inform", "Informs", "Informed", "Informing"],
      correct: "Informed",
    },
    {
      question: "Choose the synonym for 'dose' in a pharmacy context:",
      options: ["Amount", "Label", "Container", "Prescription"],
      correct: "Amount",
    },
    {
      question: "What does 'SC' mean in a medical context?",
      options: [
        "Subcutaneous",
        "Sublingual",
        "Systemic circulation",
        "Standard care",
      ],
      correct: "Subcutaneous",
    },
    {
      question:
        "Choose the correct form: The patient ______ the medication with water.",
      options: ["Take", "Takes", "Took", "Taking"],
      correct: "Took",
    },
    {
      question: "What is the meaning of 'compliance' in a medication context?",
      options: [
        "Following dosage instructions",
        "Ignoring dosage instructions",
        "Adjusting the dosage",
        "Storing the medication",
      ],
      correct: "Following dosage instructions",
    },
    {
      question:
        "Fill in the blank: The pharmacist ______ the technician to check the stock levels.",
      options: ["Ask", "Asks", "Asked", "Asking"],
      correct: "Asked",
    },
    {
      question:
        "Choose the antonym for 'proper' when referring to medication storage:",
      options: ["Improper", "Safe", "Adequate"],
      correct: "Improper",
    },
    {
      question: "What does 'NPO' mean on a prescription?",
      options: [
        "Nothing by mouth",
        "Not for oral use",
        "No prescription order",
        "New patient order",
      ],
      correct: "Nothing by mouth",
    },
    {
      question:
        "Choose the correct sentence: The technician ______ the medication to the patient’s record.",
      options: ["Add", "Adds", "Added", "Adding"],
      correct: "Added",
    },
    {
      question: "What is the meaning of 'therapeutic' in a medication context?",
      options: ["Harmful", "Healing", "Expired", "Generic"],
      correct: "Healing",
    },
    {
      question:
        "Fill in the blank: The patient ______ the pharmacist if the medication could be taken with food.",
      options: ["Ask", "Asks", "Asked", "Asking"],
      correct: "Asked",
    },
    {
      question: "Choose the synonym for 'patient' in a pharmacy context:",
      options: ["Client", "Doctor", "Pharmacist", "Supplier"],
      correct: "Client",
    },
    {
      question: "What does 'OD' mean on a prescription?",
      options: ["Right eye", "Left eye", "Both eyes", "Once daily"],
      correct: "Right eye",
    },
    {
      question:
        "Choose the correct form: The technician ______ the medication in the correct container.",
      options: ["Place", "Places", "Placed", "Placing"],
      correct: "Placed",
    },
    {
      question: "What is the meaning of 'protocol' in a pharmacy context?",
      options: [
        "A set of rules or procedures",
        "A type of medication",
        "A dosage instruction",
        "A storage requirement",
      ],
      correct: "A set of rules or procedures",
    },
    {
      question:
        "Fill in the blank: The pharmacist ______ the patient to return the unused medication.",
      options: ["Advise", "Advises", "Advised", "Advising"],
      correct: "Advised",
    },
    {
      question:
        "Choose the antonym for 'effective' when referring to a medication:",
      options: ["Useful", "Ineffective", "Potent", "Safe"],
      correct: "Ineffective",
    },
    {
      question: "What does 'OS' mean on a prescription?",
      options: ["Right eye", "Left eye", "Both eyes", "Once daily"],
      correct: "Left eye",
    },
    {
      question:
        "Choose the correct sentence: The technician ______ the medication stock weekly.",
      options: ["Check", "Checks", "Checking", "Checked"],
      correct: "Checks",
    },
    {
      question: "What is the meaning of 'formulation' in a medication context?",
      options: [
        "The price of the drug",
        "The composition of the drug",
        "The dosage instruction",
        "The patient’s name",
      ],
      correct: "The composition of the drug",
    },
    {
      question:
        "What is the meaning of 'pharmacokinetics' in a medication context?",
      options: [
        "The study of drug movement in the body",
        "The study of drug prices",
        "The study of drug dosages",
        "The study of drug storage",
      ],
      correct: "The study of drug movement in the body",
    },
    {
      question:
        "The conference Centre caters for transients only. Choose the option nearest in meaning to 'transients':",
      options: [
        "Temporary guests",
        "Professional",
        "Permanent guests",
        "Novices",
      ],
      correct: "Temporary guests",
    },
    {
      question: "Choose the synonym for 'ameliorate':",
      options: ["Worsen", "Improve", "Maintain", "Ignore"],
      correct: "Improve",
    },
    {
      question: "What is the antonym of 'transparent'?",
      options: ["Clear", "Opaque", "Visible", "Bright"],
      correct: "Opaque",
    },
    {
      question:
        "The technician’s handling of the prescription was deemed exemplary. Choose the option nearest in meaning to 'exemplary':",
      options: ["Poor", "Outstanding", "Average", "Careless"],
      correct: "Outstanding",
    },
    {
      question:
        "The patient’s condition was described as alleviated after treatment. Choose the option nearest in meaning to 'alleviated':",
      options: ["Worsened", "Relieved", "Unchanged", "Complicated"],
      correct: "Relieved",
    },
    {
      question:
        "The medication’s side effects were described as negligible. Choose the option nearest in meaning to 'negligible':",
      options: ["Significant", "Minor", "Permanent", "Dangerous"],
      correct: "Minor",
    },
    {
      question:
        "The pharmacist’s instructions were described as imperative. Choose the option nearest in meaning to 'imperative':",
      options: ["Optional", "Urgent", "Unclear", "Irrelevant"],
      correct: "Urgent",
    },
    {
      question:
        "Choose the option nearest in meaning to 'adverse' in the context of medication reactions:",
      options: ["Beneficial", "Harmful", "Neutral", "Expected"],
      correct: "Harmful",
    },
    {
      question:
        "The technician’s documentation was described as thorough. Choose the option nearest in meaning to 'thorough':",
      options: ["Incomplete", "Detailed", "Hasty", "Inaccurate"],
      correct: "Detailed",
    },
    {
      question:
        "Choose the option nearest in meaning to 'comply' in the context of following a prescription:",
      options: ["Disregard", "Adhere", "Adjust", "Omit"],
      correct: "Adhere",
    },
    {
      question:
        "Fill in the blank: The patient ______ the pharmacist if the medication was safe for children.",
      options: ["Ask", "Asks", "Asked", "Asking"],
      correct: "Asked",
    },
  ],
  "Basic Dispensing Theory": [
    {
      question:
        "What is the primary role of a pharmacy technician in dispensing?",
      options: [
        "Prescribing medication",
        "Preparing and labeling medication",
        "Diagnosing illnesses",
        "Performing surgeries",
      ],
      correct: "Preparing and labeling medication",
    },
    {
      question:
        "What is the primary purpose of using a spatula in compounding?",
      options: [
        "Measure liquids",
        "Mix ointments",
        "Cut tablets",
        "Weigh powders",
      ],
      correct: "Mix ointments",
    },
    {
      question: "What does SIG mean on a prescription?",
      options: [
        "Signature",
        "Instructions for use",
        "Strength of drug",
        "Side effects",
      ],
      correct: "Instructions for use",
    },
    {
      question: "What does cracking mean in dispensing theory?",
      options: [
        "Emulsion breaking",
        "Tablet splitting",
        "Capsule leakage",
        "Powder clumping",
      ],
      correct: "Emulsion breaking",
    },
    {
      question:
        "What is the main purpose of using a suspending agent in a liquid preparation?",
      options: [
        "Prevent settling",
        "Enhance flavor",
        "Increase solubility",
        "Reduce viscosity",
      ],
      correct: "Prevent settling",
    },
    {
      question: "What is the purpose of a diluent in a prescription?",
      options: [
        "Increase drug potency",
        "Reduce drug concentration",
        "Enhance flavor",
        "Stabilize emulsion",
      ],
      correct: "Reduce drug concentration",
    },
    {
      question: "What is the primary purpose of levigation in compounding?",
      options: [
        "Reduce particle size",
        "Increase solubility",
        "Enhance flavor",
        "Prevent microbial growth",
      ],
      correct: "Reduce particle size",
    },
    {
      question: "Which agent is used to improve the texture of an ointment?",
      options: [
        "Emulsifier",
        "Thickening agent",
        "Wetting agent",
        "Preservative",
      ],
      correct: "Thickening agent",
    },
    {
      question:
        "What is the main purpose of a surfactant in a liquid preparation?",
      options: [
        "Reduce surface tension",
        "Increase pH",
        "Enhance color",
        "Prevent settling",
      ],
      correct: "Reduce surface tension",
    },
    {
      question: "What does the abbreviation 'q6h' mean on a prescription?",
      options: [
        "Every 6 hours",
        "Every 6 days",
        "Six times daily",
        "As needed",
      ],
      correct: "Every 6 hours",
    },
    {
      question:
        "What is the first step in verifying a prescription’s accuracy?",
      options: [
        "Check patient’s name",
        "Dispense medication",
        "Label the container",
        "Count tablets",
      ],
      correct: "Check patient’s name",
    },
    {
      question:
        "What is the main purpose of a disintegrant in a capsule formulation?",
      options: [
        "Enhance flow",
        "Promote breakup",
        "Increase stability",
        "Mask odor",
      ],
      correct: "Promote breakup",
    },
    {
      question:
        "How many milliliters of a 10% w/v solution can be prepared from 20g of active ingredient?",
      options: ["100 mL", "200 mL", "300 mL", "400 mL"],
      correct: "200 mL",
    },
    {
      question: "Which type of base is best for an emulsion ointment?",
      options: [
        "Oleaginous base",
        "Hydrophilic base",
        "Absorption base",
        "Water-soluble base",
      ],
      correct: "Absorption base",
    },
    {
      question: "What is the primary purpose of a HEPA filter in a cleanroom?",
      options: [
        "Measure powders",
        "Remove airborne particles",
        "Mix liquids",
        "Store medications",
      ],
      correct: "Remove airborne particles",
    },
    {
      question: "What does 'ad lib' mean on a prescription?",
      options: ["As desired", "At bedtime", "With food", "By mouth"],
      correct: "As desired",
    },
    {
      question: "What is the primary purpose of a multi-dose vial?",
      options: [
        "Store single doses",
        "Allow multiple withdrawals",
        "Protect from light",
        "Reduce viscosity",
      ],
      correct: "Allow multiple withdrawals",
    },
    {
      question: "Which container is best for storing a hygroscopic medication?",
      options: [
        "Plastic bottle",
        "Glass jar",
        "Desiccated container",
        "Paper envelope",
      ],
      correct: "Desiccated container",
    },
    {
      question:
        "What is the purpose of an auxiliary label like 'For external use only'?",
      options: [
        "Ensure proper administration",
        "Enhance appearance",
        "Increase solubility",
        "Reduce cost",
      ],
      correct: "Ensure proper administration",
    },
    {
      question:
        "How many milliliters of a 20% w/v solution can be made from 40g of active ingredient?",
      options: ["200 mL", "400 mL", "600 mL", "800 mL"],
      correct: "200 mL",
    },
    {
      question: "How many 200mg capsules can be made from 8g of bulk powder?",
      options: ["20", "40", "60", "80"],
      correct: "40",
    },
    {
      question:
        "What is the percentage strength of a solution with 15g of drug in 300mL?",
      options: ["5% w/v", "10% w/v", "15% w/v", "20% w/v"],
      correct: "5% w/v",
    },
    {
      question:
        "Which equipment is used for precise weighing of powders in compounding?",
      options: [
        "Graduated cylinder",
        "Analytical balance",
        "Spatula",
        "Pipette",
      ],
      correct: "Analytical balance",
    },
    {
      question: "What is the primary purpose of a compounding slab?",
      options: [
        "Mix ointments",
        "Measure liquids",
        "Cut tablets",
        "Store powders",
      ],
      correct: "Mix ointments",
    },
    {
      question: "What is the main purpose of a dispensing error log?",
      options: [
        "Track sales",
        "Improve safety",
        "Monitor staff hours",
        "Reduce inventory",
      ],
      correct: "Improve safety",
    },
    {
      question: "What does the abbreviation 'qid' mean on a prescription?",
      options: ["Every day", "Four times daily", "Every 4 hours", "As needed"],
      correct: "Four times daily",
    },
    {
      question:
        "What is the primary risk of using an incorrect solvent in a liquid preparation?",
      options: ["Precipitation", "Color change", "Odor loss", "Label damage"],
      correct: "Precipitation",
    },
    {
      question:
        "Which equipment is best for measuring small powder quantities in compounding?",
      options: ["Graduated cylinder", "Analytical balance", "Pipette", "Sieve"],
      correct: "Analytical balance",
    },
    {
      question:
        "What is the main purpose of a medication error reporting system in a pharmacy?",
      options: [
        "Track sales",
        "Improve safety",
        "Reduce costs",
        "Enhance packaging",
      ],
      correct: "Improve safety",
    },
    {
      question:
        "How many 100mg tablets can be prepared from 5g of bulk powder?",
      options: ["25", "50", "75", "100"],
      correct: "50",
    },
    {
      question:
        "What is the primary purpose of using a buffering agent in a liquid formulation?",
      options: [
        "Maintain pH",
        "Enhance flavor",
        "Increase viscosity",
        "Improve color",
      ],
      correct: "Maintain pH",
    },
    {
      question:
        "What is the primary purpose of geometric dilution in compounding?",
      options: [
        "Ensure uniform mixing",
        "Increase solubility",
        "Reduce viscosity",
        "Enhance flavor",
      ],
      correct: "Ensure uniform mixing",
    },
    {
      question:
        "Which base is most suitable for a lipophilic drug in an ointment?",
      options: [
        "Oleaginous base",
        "Hydrophilic base",
        "Water-soluble base",
        "Emulsion base",
      ],
      correct: "Oleaginous base",
    },
    {
      question:
        "What is the main purpose of a viscosity modifier in a gel preparation?",
      options: [
        "Control thickness",
        "Prevent microbial growth",
        "Enhance color",
        "Increase pH",
      ],
      correct: "Control thickness",
    },
    {
      question: "What does the abbreviation 'q8h' mean on a prescription?",
      options: [
        "Every 8 hours",
        "Every 8 days",
        "Eight times daily",
        "As needed",
      ],
      correct: "Every 8 hours",
    },
    {
      question: "What does 'qam' mean on a prescription?",
      options: ["Every morning", "Every evening", "As needed", "With meals"],
      correct: "Every morning",
    },
    {
      question: "What is the purpose of double-checking a prescription label?",
      options: [
        "Prevent dispensing errors",
        "Increase sales",
        "Reduce inventory",
        "Enhance appearance",
      ],
      correct: "Prevent dispensing errors",
    },
    {
      question: "Which packaging is best for a pediatric liquid suspension?",
      options: [
        "Child-resistant bottle",
        "Clear glass vial",
        "Paper sachet",
        "Plastic pouch",
      ],
      correct: "Child-resistant bottle",
    },
    {
      question:
        "What is the primary purpose of a light-protective film on a container?",
      options: [
        "Prevent photodegradation",
        "Enhance appearance",
        "Reduce weight",
        "Increase solubility",
      ],
      correct: "Prevent photodegradation",
    },
    {
      question:
        "Which auxiliary label is essential for a photosensitive medication?",
      options: [
        "Protect from light",
        "Take with food",
        "Shake well",
        "For external use",
      ],
      correct: "Protect from light",
    },
    {
      question:
        "What is the percentage strength of a solution with 10g of drug in 200mL?",
      options: ["2% w/v", "5% w/v", "10% w/v", "20% w/v"],
      correct: "5% w/v",
    },
    {
      question: "What is the primary purpose of a sieve in powder compounding?",
      options: [
        "Ensure uniform particle size",
        "Measure volume",
        "Mix liquids",
        "Store powders",
      ],
      correct: "Ensure uniform particle size",
    },
    {
      question: "Which factor most affects the stability of a suspension?",
      options: [
        "Particle size",
        "Container shape",
        "Label design",
        "Odor intensity",
      ],
      correct: "Particle size",
    },
    {
      question: "What does the abbreviation 'pc' mean on a prescription?",
      options: ["Before meals", "After meals", "At bedtime", "As needed"],
      correct: "After meals",
    },
    {
      question:
        "What is the primary purpose of a child-resistant cap on a medication bottle?",
      options: [
        "Enhance appearance",
        "Prevent misuse",
        "Reduce weight",
        "Increase solubility",
      ],
      correct: "Prevent misuse",
    },
    {
      question: "What is the main advantage of a unit-of-use package?",
      options: [
        "Pre-measured doses",
        "Reduced cost",
        "Increased viscosity",
        "Enhanced flavor",
      ],
      correct: "Pre-measured doses",
    },
    {
      question:
        "How many milliliters of a 15% w/v solution can be made from 30g of active ingredient?",
      options: ["100 mL", "200 mL", "300 mL", "400 mL"],
      correct: "200 mL",
    },
    {
      question:
        "What is the ratio strength of a solution with 2g of drug in 400mL?",
      options: ["1:200", "1:400", "1:600", "1:800"],
      correct: "1:200",
    },
    {
      question:
        "How many days will 60mL of a syrup last if the dose is 5mL twice daily?",
      options: ["6 days", "8 days", "10 days", "12 days"],
      correct: "6 days",
    },
    {
      question:
        "Which tool is used to ensure uniform particle size in powder compounding?",
      options: ["Sieve", "Spatula", "Graduated cylinder", "Thermometer"],
      correct: "Sieve",
    },
    {
      question: "What is the primary purpose of a cleanroom in compounding?",
      options: [
        "Maintain sterility",
        "Store equipment",
        "Measure liquids",
        "Package tablets",
      ],
      correct: "Maintain sterility",
    },
    {
      question:
        "What is the main purpose of a medication reconciliation process in dispensing?",
      options: [
        "Prevent drug interactions",
        "Track sales",
        "Reduce costs",
        "Enhance labeling",
      ],
      correct: "Prevent drug interactions",
    },
    {
      question: "What is the primary purpose of fusion in compounding?",
      options: [
        "Melt ingredients together",
        "Reduce particle size",
        "Increase solubility",
        "Enhance flavor",
      ],
      correct: "Melt ingredients together",
    },
    {
      question: "Which agent is used to prevent caking in a suspension?",
      options: ["Anticaking agent", "Emulsifier", "Sweetener", "Colorant"],
      correct: "Anticaking agent",
    },
    {
      question:
        "What is the main purpose of a penetration enhancer in a topical preparation?",
      options: [
        "Improve drug absorption",
        "Increase viscosity",
        "Prevent microbial growth",
        "Enhance color",
      ],
      correct: "Improve drug absorption",
    },
    {
      question: "What does the abbreviation 'q12h' mean on a prescription?",
      options: ["Every 12 hours", "Every 12 days", "Twice daily", "As needed"],
      correct: "Every 12 hours",
    },
    {
      question: "What does 'qhs' mean on a prescription?",
      options: ["At bedtime", "Every morning", "With meals", "As needed"],
      correct: "At bedtime",
    },
    {
      question: "What is the purpose of verifying a prescription’s date?",
      options: [
        "Ensure validity",
        "Reduce costs",
        "Enhance labeling",
        "Track inventory",
      ],
      correct: "Ensure validity",
    },
    {
      question: "Which container is best for a volatile liquid medication?",
      options: [
        "Airtight bottle",
        "Plastic pouch",
        "Paper sachet",
        "Clear glass vial",
      ],
      correct: "Airtight bottle",
    },
    {
      question:
        "What is the primary purpose of a compliance aid like a pill organizer?",
      options: [
        "Improve adherence",
        "Reduce weight",
        "Enhance flavor",
        "Increase solubility",
      ],
      correct: "Improve adherence",
    },
    {
      question: "What is the main advantage of a prefilled syringe?",
      options: [
        "Accurate dosing",
        "Reduced cost",
        "Increased viscosity",
        "Enhanced stability",
      ],
      correct: "Accurate dosing",
    },
    {
      question:
        "How many milliliters of a 10% w/v stock solution are needed to prepare 200mL of a 2% w/v solution?",
      options: ["40 mL", "50 mL", "60 mL", "80 mL"],
      correct: "40 mL",
    },
    {
      question:
        "How many milliequivalents (mEq) of sodium are in 1g of sodium chloride (NaCl, MW=58.5)?",
      options: ["17.1 mEq", "34.2 mEq", "51.3 mEq", "68.4 mEq"],
      correct: "17.1 mEq",
    },
    {
      question:
        "How many 150mg tablets are needed for a 7-day supply at 1 tablet twice daily?",
      options: ["7 tablets", "14 tablets", "21 tablets", "28 tablets"],
      correct: "14 tablets",
    },
    {
      question:
        "Which equipment is used to grind powders to a fine consistency in compounding?",
      options: ["Ointment mill", "Pipette", "Spatula", "Graduated cylinder"],
      correct: "Ointment mill",
    },
    {
      question:
        "What is the primary purpose of a HEPA filter in a compounding area?",
      options: [
        "Remove airborne particles",
        "Measure liquids",
        "Mix powders",
        "Store medications",
      ],
      correct: "Remove airborne particles",
    },
    {
      question:
        "What is the main purpose of a quality control check in dispensing?",
      options: [
        "Ensure accuracy",
        "Reduce costs",
        "Track sales",
        "Enhance packaging",
      ],
      correct: "Ensure accuracy",
    },
    {
      question:
        "How many milliliters of a 25% w/v stock solution are needed to prepare 100mL of a 5% w/v solution for a pediatric patient?",
      options: ["20 mL", "25 mL", "30 mL", "40 mL"],
      correct: "20 mL",
    },
    {
      question:
        "A prescription requires 2.5mg/kg of amoxicillin for a 20kg child. How many 250mg capsules are needed for a single dose?",
      options: ["1 capsule", "2 capsules", "3 capsules", "4 capsules"],
      correct: "1 capsule",
    },
    {
      question:
        "How many days will 120mL of a cough syrup last if a patient takes 10mL three times daily?",
      options: ["4 days", "5 days", "6 days", "7 days"],
      correct: "4 days",
    },
    {
      question:
        "What is the primary indication for artemether-lumefantrine in Nigeria?",
      options: ["Hypertension", "Malaria", "Diabetes", "Tuberculosis"],
      correct: "Malaria",
    },
    {
      question:
        "Which side effect is commonly associated with lisinopril, used for hypertension in Nigerian patients?",
      options: ["Dry cough", "Constipation", "Fever", "Rash"],
      correct: "Dry cough",
    },
    {
      question:
        "What is a common drug interaction concern with chloroquine in Nigerian pharmacies?",
      options: [
        "Antacids reducing absorption",
        "Increased insulin efficacy",
        "Decreased diuretic effect",
        "Enhanced anticoagulant effect",
      ],
      correct: "Antacids reducing absorption",
    },
    {
      question:
        "According to PCN regulations, how often must a pharmacy technician renew their practice license in Nigeria?",
      options: [
        "Every 1 year",
        "Every 2 years",
        "Every 3 years",
        "Every 5 years",
      ],
      correct: "Every 2 years",
    },
    {
      question:
        "What is a legal requirement for dispensing a prescription in Nigeria?",
      options: [
        "Pharmacist supervision",
        "Patient signature",
        "Insurance approval",
        "Physician license number",
      ],
      correct: "Pharmacist supervision",
    },
    {
      question:
        "What should a pharmacy technician do if a prescription lacks a prescriber’s signature in Nigeria?",
      options: [
        "Contact the prescriber",
        "Dispense immediately",
        "File the prescription",
        "Return to patient",
      ],
      correct: "Contact the prescriber",
    },
    {
      question:
        "What is the first step in reporting a dispensing error in a Nigerian pharmacy?",
      options: [
        "Notify the pharmacist",
        "Inform the patient",
        "Discard the medication",
        "Update the inventory",
      ],
      correct: "Notify the pharmacist",
    },
    {
      question:
        "What is a key strategy to prevent medication errors in Nigerian hospitals?",
      options: [
        "Double-checking prescriptions",
        "Reducing stock levels",
        "Using generic names only",
        "Limiting patient counseling",
      ],
      correct: "Double-checking prescriptions",
    },
    {
      question:
        "What is the purpose of the First-Expiry-First-Out (FEFO) method in Nigerian pharmacies?",
      options: [
        "Minimize waste",
        "Increase sales",
        "Reduce storage",
        "Enhance labeling",
      ],
      correct: "Minimize waste",
    },
    {
      question:
        "How should a pharmacy technician handle expired antimalarials in Nigeria?",
      options: [
        "Return to supplier",
        "Sell at discount",
        "Store separately",
        "Dispense as samples",
      ],
      correct: "Store separately",
    },
    {
      question:
        "What should a pharmacy technician advise a patient about taking artemether-lumefantrine in Nigeria?",
      options: [
        "Take with fatty food",
        "Take on empty stomach",
        "Avoid water",
        "Take at bedtime",
      ],
      correct: "Take with fatty food",
    },
    {
      question:
        "How should a pharmacy technician counsel a patient on antihypertensive adherence in Nigeria?",
      options: [
        "Explain daily dosing importance",
        "Suggest skipping doses",
        "Recommend herbal alternatives",
        "Advise doubling doses",
      ],
      correct: "Explain daily dosing importance",
    },
    {
      question: "What does 'q.d.' mean on a prescription?",
      options: ["Twice daily", "Once daily", "Every other day", "As needed"],
      correct: "Once daily",
    },
    {
      question:
        "Which equipment is used to measure small volumes of liquid in dispensing?",
      options: ["Beaker", "Pipette", "Flask", "Spoon"],
      correct: "Pipette",
    },
    {
      question: "What is a common vehicle used in oral liquid preparations?",
      options: ["Syrup", "Alcohol", "Oil", "Glycerin"],
      correct: "Syrup",
    },
    {
      question: "What does 'p.r.n.' mean on a prescription?",
      options: ["At bedtime", "As needed", "Every morning", "With food"],
      correct: "As needed",
    },
    {
      question: "What is the purpose of an emulsifying agent?",
      options: [
        "Dissolve solids",
        "Mix immiscible liquids",
        "Increase viscosity",
        "Prevent microbial growth",
      ],
      correct: "Mix immiscible liquids",
    },
    {
      question: "What does 'b.i.d.' mean on a prescription?",
      options: ["Once daily", "Twice daily", "Three times daily", "Every hour"],
      correct: "Twice daily",
    },
    {
      question: "What is the role of a preservative in a liquid preparation?",
      options: [
        "Enhance flavor",
        "Prevent microbial growth",
        "Increase solubility",
        "Reduce viscosity",
      ],
      correct: "Prevent microbial growth",
    },
    {
      question: "What is a common method to ensure accurate tablet splitting?",
      options: [
        "Using a knife",
        "Using a tablet cutter",
        "Breaking by hand",
        "Using scissors",
      ],
      correct: "Using a tablet cutter",
    },
    {
      question: "What does 't.i.d.' mean on a prescription?",
      options: [
        "Once daily",
        "Twice daily",
        "Three times daily",
        "Four times daily",
      ],
      correct: "Three times daily",
    },
    {
      question: "What is the purpose of a disintegrant in a tablet?",
      options: [
        "Bind ingredients",
        "Promote tablet breakup",
        "Enhance color",
        "Increase hardness",
      ],
      correct: "Promote tablet breakup",
    },
    {
      question:
        "What is the primary role of a pharmacy technician in dispensing?",
      options: [
        "Prescribing medication",
        "Preparing and labeling medication",
        "Diagnosing illnesses",
        "Performing surgeries",
      ],
      correct: "Preparing and labeling medication",
    },
    {
      question:
        "What is the primary role of a pharmacy technician in dispensing?",
      options: [
        "Prescribing medication",
        "Preparing and labeling medication",
        "Diagnosing illnesses",
        "Performing surgeries",
      ],
      correct: "Preparing and labeling medication",
    },
    {
      question: "What does SIG mean on a prescription?",
      options: [
        "Signature",
        "Instructions for use",
        "Strength of drug",
        "Side effects",
      ],
      correct: "Instructions for use",
    },
    {
      question: 'What is a common abbreviation for "as needed"?',
      options: ["BID", "PRN", "QID", "STAT"],
      correct: "PRN",
    },
    {
      question: "Which form of medication is taken orally?",
      options: ["Tablet", "Suppository", "Inhaler", "Patch"],
      correct: "Tablet",
    },
    {
      question: "What must be checked before dispensing medication?",
      options: [
        "Patient’s weight",
        "Prescription accuracy",
        "Room temperature",
        "Patient’s diet",
      ],
      correct: "Prescription accuracy",
    },
    {
      question: "What is the term for the amount of drug given at one time?",
      options: ["Dose", "Frequency", "Route", "Strength"],
      correct: "Dose",
    },
    {
      question: "What does QD mean?",
      options: ["Every day", "Twice a day", "Every other day", "At bedtime"],
      correct: "Every day",
    },
    {
      question: "Which device measures liquid medication?",
      options: ["Syringe", "Spoon", "Cup", "Pipette"],
      correct: "Syringe",
    },
    {
      question: "What is a controlled substance?",
      options: [
        "Over-the-counter drug",
        "Drug with abuse potential",
        "Herbal supplement",
        "Vitamin",
      ],
      correct: "Drug with abuse potential",
    },
    {
      question: "Why is proper labeling important?",
      options: [
        "To increase sales",
        "To ensure patient safety",
        "To decorate the bottle",
        "To reduce costs",
      ],
      correct: "To ensure patient safety",
    },
    {
      question: "What does TID mean?",
      options: [
        "Once daily",
        "Twice daily",
        "Three times daily",
        "Four times daily",
      ],
      correct: "Three times daily",
    },
    {
      question: "What is a compounded medication?",
      options: [
        "Mass-produced drug",
        "Custom-made drug",
        "Expired drug",
        "Generic drug",
      ],
      correct: "Custom-made drug",
    },
    {
      question: "What is the purpose of a blister pack?",
      options: [
        "Store liquids",
        "Organize daily doses",
        "Protect injections",
        "Measure powders",
      ],
      correct: "Organize daily doses",
    },
    {
      question: "What does PO mean?",
      options: ["By mouth", "By injection", "By inhalation", "By rectum"],
      correct: "By mouth",
    },
    {
      question: "What is a generic drug?",
      options: [
        "Brand-name drug",
        "Copy of brand-name drug",
        "Herbal drug",
        "Placebo",
      ],
      correct: "Copy of brand-name drug",
    },
    {
      question:
        "Tablespoon, teaspoon, and dessertspoon are respectively expressed as:",
      options: [
        "15mL, 5mL, and 30mL",
        "5mL, 10mL, and 15mL",
        "15mL, 5mL, and 10mL",
        "15mL, 5mL, and 30mL",
        "2.5mL, 7.5mL, and 15mL",
      ],
      correct: "15mL, 5mL, and 10mL",
    },
    {
      question:
        "How many grams of dextrose are required to prepare 4000mL of a 5% solution?",
      options: ["20g", "200g", "2000g", "2000mg", "100mg"],
      correct: "200g",
    },
    {
      question: "Convert 4% w/v to mg/mL:",
      options: ["4mg/mL", "40mg/mL", "400mg/mL", "0.4mg/mL", "0.04mg/mL"],
      correct: "40mg/mL",
    },
    {
      question:
        "What does it mean for a preparation of liquid drug to be of a concentration 20% w/v?",
      options: [
        "20mg of the drug dissolved in a solvent to make a 100mL solution",
        "20g of the drug dissolved in a solvent to make a 1000mL solution",
        "20g of the drug dissolved in enough solvent to make a 100mL solution",
        "0.2g of the drug dissolved in enough solvent to make 100% of the solution",
        "200mg of the drug dissolved in enough solvent to make 100% of the solution",
      ],
      correct:
        "20g of the drug dissolved in enough solvent to make a 100mL solution",
    },
    {
      question: "Which of the following is NOT an extraction process?",
      options: [
        "Decoction",
        "Infusion",
        "Digestion",
        "Sieving",
        "None of the above",
      ],
      correct: "Sieving",
    },
    {
      question:
        "The different methods of size reduction of particles in pharmaceutical production exclude:",
      options: [
        "Slicing",
        "Cutting",
        "Grinding",
        "All of the above",
        "Sieving",
      ],
      correct: "Sieving",
    },
    {
      question:
        "The different separation techniques in pharmacy exclude one of these:",
      options: [
        "Distillation",
        "Sieving",
        "Milling",
        "Filtration",
        "None of the above",
      ],
      correct: "Milling",
    },
    {
      question:
        "In tablet production, flow rate of granules into the press die is enhanced by which of these?",
      options: [
        "Disintegrant",
        "Wetting agent",
        "Glidant",
        "Grinding",
        "None of the above",
      ],
      correct: "Glidant",
    },
    {
      question:
        "For tablets to be produced from powders, which of these processes is not involved?",
      options: [
        "Granulation",
        "Compression",
        "Mixing",
        "Extraction",
        "None of the above",
      ],
      correct: "Extraction",
    },
    {
      question: "The orderly arrangement of proper dispensing processes is:",
      options: [
        "Receive prescription → Review and process → Select and prepare → Label and package → Provide instruction → Record/document",
        "Receive prescription → Record/document → Review and process → Select and prepare → Label and package → Provide instruction",
        "Receive prescription → Record/document → Select and prepare → Label and package → Provide instruction",
        "All of the above",
        "None of the above",
      ],
      correct:
        "Receive prescription → Review and process → Select and prepare → Label and package → Provide instruction → Record/document",
    },
    {
      question:
        "Which of these tablets must be dissolved or disintegrated in water before administration?",
      options: [
        "Effervescent tablets",
        "Sugar-coated tablets",
        "Film-coated tablets",
        "Enteric-coated tablets",
        "Extended-release tablets",
      ],
      correct: "Effervescent tablets",
    },
    {
      question:
        "Labeling of drugs during compounding and dispensing must contain which of the following information?",
      options: [
        "Name of the container",
        "Directions for use",
        "Side effects of the drug",
        "All of the above",
        "Color of the drugs",
      ],
      correct: "Directions for use",
    },
    {
      question:
        "What is the duration of administration of the prescription p.o. Tab. Hyoscine Bromide 20 mg t.i.d x3/7?",
      options: ["24 hours", "7 days", "3 weeks", "3 hours", "72 hours"],
      correct: "72 hours",
    },
    {
      question: "Signs of physical instability noticed in tablets include:",
      options: [
        "Cracks",
        "Clumping",
        "Change in color",
        "Change in taste",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Signs of physical instability in solutions include:",
      options: [
        "Precipitate",
        "Cracking",
        "Breaking",
        "Change in color",
        "All of the above",
      ],
      correct: "Precipitate",
    },
    {
      question: "Signs of instability in emulsion formulations include:",
      options: [
        "Breaking",
        "Cracking",
        "All of the above",
        "None of the above",
        "Only option A is correct",
      ],
      correct: "Only option A is correct",
    },
    {
      question:
        "Which of the following is NOT a good reason for encapsulation of powders or granules?",
      options: [
        "Mask unpleasant taste",
        "Reduce gastrointestinal side effects",
        "Mask unpleasant odor",
        "Increase the rate of absorption",
        "Easy dose manipulation",
      ],
      correct: "Increase the rate of absorption",
    },
    {
      question: "Oil-in-water (O/W) emulsions are mainly used for:",
      options: [
        "Internal use",
        "External use",
        "Water serving as the larger portion",
        "Oil serving as the smaller portion",
        "None of the above",
      ],
      correct: "Internal use",
    },
    {
      question:
        "Calculate the weight of 120mL of an oil whose density is 0.9624g/mL:",
      options: ["115.5g", "11.55g", "1.155g", "115.5mg", "0.1155mg"],
      correct: "115.5g",
    },
    {
      question:
        "How many 300mg capsules of rifampicin would be produced from a 6g bulk powder?",
      options: ["20", "0.02", "0.05", "50", "30"],
      correct: "20",
    },
    {
      question:
        "A prescription mix requires Acetylsalicylic acid 450mg per 20mL. How many milligrams of acetylsalicylic acid are needed for a 40mL mixture?",
      options: ["450mg", "4500mg", "900mg", "45mg", "4.5mg"],
      correct: "900mg",
    },
    {
      question: "Which of the following equipment are used for mixing powders?",
      options: [
        "Pestle and mortar",
        "Spatula",
        "All of the above",
        "None of the above",
        "Evaporating dish",
      ],
      correct: "Pestle and mortar",
    },
    {
      question:
        "What is the primary risk of storing an emulsion at low temperatures?",
      options: [
        "Phase separation",
        "Color fading",
        "Odor loss",
        "Label damage",
      ],
      correct: "Phase separation",
    },
    {
      question:
        "Which equipment is used to mix viscous ointments in compounding?",
      options: ["Pipette", "Ointment mill", "Sieve", "Graduated cylinder"],
      correct: "Ointment mill",
    },
    {
      question:
        "What is the main purpose of a First-In-First-Out (FIFO) system in a pharmacy?",
      options: [
        "Minimize waste",
        "Increase sales",
        "Reduce storage",
        "Enhance packaging",
      ],
      correct: "Minimize waste",
    },
    {
      question:
        "How many 500mg capsules can be prepared from 20g of bulk powder?",
      options: ["20", "30", "40", "50"],
      correct: "40",
    },
    {
      question:
        "What is the primary purpose of using a stabilizer in an emulsion?",
      options: [
        "Prevent separation",
        "Enhance flavor",
        "Increase solubility",
        "Improve color",
      ],
      correct: "Prevent separation",
    },
    {
      question:
        "Which auxiliary label is essential for an effervescent tablet?",
      options: [
        "Dissolve in water",
        "Take with food",
        "Protect from light",
        "Shake well",
      ],
      correct: "Dissolve in water",
    },
    {
      question:
        "Plain amber glass or plastic medicine bottles are used to package one of these:",
      options: ["Mouthwashes", "Gargles", "Mixtures", "Liniments", "Creams"],
      correct: "Mixtures",
    },
    {
      question: "The importance of packaging pharmaceuticals does NOT include:",
      options: [
        "Protection",
        "Provision of information",
        "Ensuring accurate dosing",
        "Ensuring less stability",
        "None of the above",
      ],
      correct: "Ensuring less stability",
    },
    {
      question: "Storage temperature descriptions in a drug store include:",
      options: ["Cool", "Cold", "Freezing", "All of the above", "Atmospheric"],
      correct: "All of the above",
    },
    {
      question:
        "Why are amber-colored bottles commonly used in pharmaceutical packaging?",
      options: [
        "To enhance stability",
        "To disguise color",
        "To impact taste",
        "To regulate humidity",
        "To provide cushioning",
      ],
      correct: "To enhance stability",
    },
    {
      question:
        "What is the major reason auxiliary labels such as ‘shake before use’ are used for suspensions?",
      options: [
        "To encourage proper dosing",
        "To improve taste",
        "To increase viscosity",
        "To allow for quicker absorption",
        "All of the above",
      ],
      correct: "To encourage proper dosing",
    },
    {
      question:
        "A prescription written as “p.o. Vitamin C Syr. 2 tsp t.d.s x 3/7” would be best expressed as:",
      options: [
        "Two teaspoonfuls three times a day for three days",
        "2 teaspoonfuls three times a day for three days",
        "Two teaspoonfuls of Vitamin C syrup to be taken by mouth eight hourly for three days",
        "Two teaspoonfuls of Vitamin C to be taken by mouth three times a day",
        "Two tablespoonfuls of Vitamin C to be taken by mouth three times a day",
      ],
      correct: "2 teaspoonfuls three times a day for three days",
    },
    {
      question:
        "When measuring liquids that form a concave meniscus, reading should be taken at:",
      options: [
        "Lowest point of curvature",
        "Highest point of curve",
        "In-between",
        "None of the above",
        "Both A and B",
      ],
      correct: "Lowest point of curvature",
    },
    {
      question:
        "After opening the primary package of a drug, its expiration date usually:",
      options: [
        "Increases",
        "Decreases",
        "Remains the same",
        "All of the above",
        "A and B only",
      ],
      correct: "Decreases",
    },
    {
      question:
        "What is the percentage strength of a solution with 8g of drug in 400mL?",
      options: ["1% w/v", "2% w/v", "4% w/v", "8% w/v"],
      correct: "2% w/v",
    },
    {
      question:
        "What is the primary purpose of a pestle in powder compounding?",
      options: [
        "Measure volumes",
        "Grind particles",
        "Cut tablets",
        "Store liquids",
      ],
      correct: "Grind particles",
    },
    {
      question:
        "Which factor most affects the shelf life of a liquid preparation?",
      options: [
        "Storage temperature",
        "Container shape",
        "Label clarity",
        "Odor strength",
      ],
      correct: "Storage temperature",
    },
    {
      question: "What does the abbreviation 'hs' mean on a prescription?",
      options: ["At bedtime", "Every morning", "With meals", "As needed"],
      correct: "At bedtime",
    },
    {
      question:
        "What is the primary purpose of a compliance aid like a blister pack?",
      options: [
        "Reduce cost",
        "Organize doses",
        "Enhance appearance",
        "Increase volume",
      ],
      correct: "Organize doses",
    },
    {
      question:
        "How many days will 120mL of a syrup last if the dose is 15mL twice daily?",
      options: ["3 days", "4 days", "5 days", "6 days"],
      correct: "4 days",
    },
    {
      question:
        "What is the primary purpose of using a penetration enhancer in a topical preparation?",
      options: [
        "Improve absorption",
        "Reduce viscosity",
        "Adjust pH",
        "Enhance color",
      ],
      correct: "Improve absorption",
    },
    {
      question:
        "The correct temperature range for cool storage of pharmaceuticals is:",
      options: [
        "-25 to -10°C",
        "2-8°C",
        "8-15°C",
        "15-37°C",
        "All of the above",
      ],
      correct: "8-15°C",
    },
    {
      question: "Convert 5% w/v solution to mg/mL:",
      options: ["5 mg/mL", "50 mg/mL", "500 mg/mL", "0.5 mg/mL", "0.05 mg/mL"],
      correct: "50 mg/mL",
    },
    {
      question:
        "How many milliliters of a 3% solution can be made from 27g of ephedrine sulfate?",
      options: ["90mL", "900mL", "9000mL", "9L", "9mL"],
      correct: "900mL",
    },
    {
      question: "Which of the following is NOT a method of distillation?",
      options: [
        "Simple distillation",
        "Fractional distillation",
        "Steam distillation",
        "Mixed distillation",
        "All of the above",
      ],
      correct: "Mixed distillation",
    },
    {
      question: "Capsules can be divided into:",
      options: [
        "Hard and soft",
        "Simple and complex",
        "Hard shell and soft shell capsules",
        "Simple and complex shell capsules",
        "Red and yellow",
      ],
      correct: "Hard and soft",
    },
    {
      question:
        "Which factor does NOT encourage fraud in a pharmacy work environment?",
      options: [
        "Proper documentation",
        "Improper monitoring",
        "Regular stock checks",
        "All of the above",
        "None of the above",
      ],
      correct: "Proper documentation",
    },
    {
      question:
        "Which of the following dosage forms requires continuous shaking before use?",
      options: ["Syrups", "Suspensions", "Elixirs", "Linctuses", "Tinctures"],
      correct: "Suspensions",
    },
    {
      question:
        "Pleasantly flavored hydro-alcoholic solutions for oral use are called:",
      options: [
        "Elixirs",
        "Linctuses",
        "Syrups",
        "Tinctures",
        "None of the above",
      ],
      correct: "Elixirs",
    },
    {
      question:
        "Which of the following storage materials enhances drug stability?",
      options: [
        "Plastic bottles",
        "Metal containers",
        "Amber glass bottles",
        "Paper cartons",
        "None of the above",
      ],
      correct: "Amber glass bottles",
    },
    {
      question: "Which statement is not true regarding liquid preparations?",
      options: [
        "They are easier to swallow",
        "They usually require shaking before use",
        "They are more stable than solid formulations",
        "They offer faster absorption",
        "They are ideal for pediatric patients",
      ],
      correct: "They are more stable than solid formulations",
    },
    {
      question: "Which ingredient helps emulsions maintain even dispersion?",
      options: [
        "Emulgent",
        "Emulsifying agent",
        "Thickening agent",
        "Surface acting agent",
        "B and C only",
      ],
      correct: "Emulsifying agent",
    },
    {
      question: "The characteristics of pharmaceutical containers exclude:",
      options: [
        "Preventing leakages",
        "Inertness",
        "Light sensitivity",
        "Resistance to rough handling",
        "None of the above",
      ],
      correct: "Light sensitivity",
    },
    {
      question:
        "What is the purpose of a child-resistant cap in pharmaceutical packaging?",
      options: [
        "Reduce cost",
        "Prevent misuse",
        "Enhance appearance",
        "Increase volume",
        "Improve taste",
      ],
      correct: "Prevent misuse",
    },
    {
      question: "Which label ensures proper use of an inhaler?",
      options: [
        "Swallow whole",
        "Shake and inhale",
        "Apply to skin",
        "Take with water",
        "Store in fridge",
      ],
      correct: "Shake and inhale",
    },
    {
      question:
        "What is the primary purpose of a prescription verification step?",
      options: [
        "Speed up dispensing",
        "Ensure accuracy",
        "Reduce costs",
        "Advertise drugs",
        "Increase sales",
      ],
      correct: "Ensure accuracy",
    },
    {
      question:
        "How many milliliters of a 10% w/v solution can be made from 50g of sodium chloride?",
      options: ["50mL", "500mL", "5000mL", "5L", "5mL"],
      correct: "500mL",
    },
    {
      question: "Which equipment is used to measure precise liquid volumes?",
      options: ["Balance", "Pipette", "Spatula", "Mortar", "Sieve"],
      correct: "Pipette",
    },
    {
      question: "what does cracking mean?",
      options: [
        "emulsion breaking",
        "tablet splitting",
        "capsule leakage",
        "powder clumping",
      ],
      correct: "emulsion breaking",
    },
    {
      question:
        "What is the primary cause of creaming in an emulsion during dispensing?",
      options: [
        "Density difference",
        "High viscosity",
        "Low pH",
        "Over-dilution",
      ],
      correct: "density difference",
    },
    {
      question:
        "Which factor most affects the stability of a suspension in dispensing?",
      options: [
        "Particle size",
        "Container shape",
        "Light exposure",
        "Label clarity",
      ],
      correct: "particle size",
    },
    {
      question:
        "What is the main purpose of using a flocculating agent in a suspension?",
      options: [
        "Enhance settling",
        "Prevent caking",
        "Increase solubility",
        "Reduce viscosity",
      ],
      correct: "prevent caking",
    },
    {
      question:
        "What is the primary cause of creaming in an emulsion during dispensing?",
      options: [
        "Density difference",
        "High viscosity",
        "Low pH",
        "Over-dilution",
      ],
      correct: "Density difference",
    },
    {
      question:
        "Which factor most affects the stability of a suspension in dispensing?",
      options: [
        "Particle size",
        "Container shape",
        "Light exposure",
        "Label clarity",
      ],
      correct: "Particle size",
    },
    {
      question:
        "What is the main purpose of using a flocculating agent in a suspension?",
      options: [
        "Enhance settling",
        "Prevent caking",
        "Increase solubility",
        "Reduce viscosity",
      ],
      correct: "Prevent caking",
    },
    {
      question:
        "In extemporaneous compounding, what is the biggest risk of using an incorrect vehicle?",
      options: [
        "Drug precipitation",
        "Color change",
        "Odor development",
        "Label fading",
      ],
      correct: "Drug precipitation",
    },
    {
      question:
        "What is the primary challenge when dispensing a drug with low aqueous solubility?",
      options: [
        "Ensuring dissolution",
        "Preventing oxidation",
        "Avoiding light exposure",
        "Maintaining pH",
      ],
      correct: "Ensuring dissolution",
    },
    {
      question:
        "Which method is most effective for preventing phase separation in an emulsion?",
      options: [
        "Adding emulsifier",
        "Increasing dilution",
        "Lowering temperature",
        "Using larger particles",
      ],
      correct: "Adding emulsifier",
    },
    {
      question:
        "Which property of a powder affects its flowability during dispensing?",
      options: [
        "Particle shape",
        "Color intensity",
        "Odor strength",
        "Label accuracy",
      ],
      correct: "Particle shape",
    },
    {
      question:
        "What is the primary risk of using an expired emulsifying agent?",
      options: [
        "Reduced stability",
        "Color change",
        "Odor development",
        "Increased viscosity",
      ],
      correct: "Reduced stability",
    },
    {
      question: "In a suspension, what does sedimentation rate depend on most?",
      options: [
        "Particle size",
        "Container type",
        "Light exposure",
        "Label design",
      ],
      correct: "Particle size",
    },
    {
      question:
        "What is the main challenge when dispensing a photosensitive drug?",
      options: [
        "Light protection",
        "pH stability",
        "Odor control",
        "Viscosity adjustment",
      ],
      correct: "Light protection",
    },
    {
      question:
        "Which dispensing error can occur due to improper levigation of a powder?",
      options: ["Uneven mixing", "Color fading", "Odor loss", "Label smudging"],
      correct: "Uneven mixing",
    },
    {
      question:
        "What is the primary purpose of using a wetting agent in a suspension?",
      options: [
        "Improve dispersion",
        "Enhance flavor",
        "Increase pH",
        "Reduce viscosity",
      ],
      correct: "Improve dispersion",
    },
    {
      question:
        "What is the main risk of storing a suspension at a high temperature?",
      options: [
        "Increased sedimentation",
        "Color change",
        "Odor development",
        "Label peeling",
      ],
      correct: "Increased sedimentation",
    },
    {
      question:
        "How many days will 100mL of a liquid medication last if the dose is 10mL twice daily?",
      options: ["4 days", "5 days", "6 days", "7 days"],
      correct: "5 days",
    },
    {
      question:
        "What is the primary purpose of using a wetting agent in a powder formulation?",
      options: [
        "Improve dispersion",
        "Enhance flavor",
        "Increase pH",
        "Reduce viscosity",
      ],
      correct: "Improve dispersion",
    },
    {
      question:
        "What is the primary purpose of using a co-solvent in a liquid formulation?",
      options: [
        "Enhance solubility",
        "Reduce viscosity",
        "Adjust pH",
        "Improve color",
      ],
      correct: "Enhance solubility",
    },
    {
      question: "Which abbreviation on a prescription indicates 'immediately'?",
      options: ["STAT", "PRN", "QID", "BID"],
      correct: "STAT",
    },
    {
      question:
        "What is the main purpose of a lubricant in capsule production?",
      options: [
        "Aid filling",
        "Increase hardness",
        "Enhance dissolution",
        "Mask taste",
      ],
      correct: "Aid filling",
    },
    {
      question:
        "How many milliliters of a 5% w/v solution can be prepared from 15g of active ingredient?",
      options: ["200 mL", "300 mL", "400 mL", "500 mL"],
      correct: "300 mL",
    },
    {
      question:
        "Which type of container is best for storing a volatile liquid medication?",
      options: [
        "Plastic vial",
        "Airtight bottle",
        "Clear glass jar",
        "Paper envelope",
      ],
      correct: "Airtight bottle",
    },
    {
      question:
        "What is the primary purpose of a compounding record in a pharmacy?",
      options: [
        "Track inventory",
        "Ensure reproducibility",
        "Reduce costs",
        "Enhance labeling",
      ],
      correct: "Ensure reproducibility",
    },
    {
      question: "What does the abbreviation 'ac' mean on a prescription?",
      options: ["Before meals", "After meals", "At bedtime", "As needed"],
      correct: "Before meals",
    },
    {
      question:
        "Which factor most affects the dissolution rate of a solid in a liquid vehicle?",
      options: [
        "Surface area",
        "Container size",
        "Light exposure",
        "Label accuracy",
      ],
      correct: "Surface area",
    },
    {
      question:
        "What is the main purpose of using a co-solvent in a liquid preparation?",
      options: [
        "Enhance solubility",
        "Reduce viscosity",
        "Adjust pH",
        "Improve color",
      ],
      correct: "Enhance solubility",
    },
    {
      question:
        "What is the primary risk of improper emulsification in a cream preparation?",
      options: [
        "Phase separation",
        "Color fading",
        "Odor loss",
        "Label damage",
      ],
      correct: "Phase separation",
    },
    {
      question:
        "Which dispensing practice helps prevent microbial growth in a liquid preparation?",
      options: [
        "Adding preservative",
        "Increasing pH",
        "Reducing viscosity",
        "Using larger container",
      ],
      correct: "Adding preservative",
    },
    {
      question:
        "What is the main challenge when dispensing a drug with a high partition coefficient?",
      options: [
        "Poor solubility",
        "Color change",
        "Odor development",
        "Label inaccuracy",
      ],
      correct: "Poor solubility",
    },
    {
      question:
        "What does the term 'occlusion' refer to in ointment preparation?",
      options: [
        "Air entrapment",
        "Color change",
        "Odor release",
        "Label smudging",
      ],
      correct: "Air entrapment",
    },
    {
      question:
        "Which type of base is most suitable for a water-soluble drug in an ointment?",
      options: [
        "Hydrophilic base",
        "Oleaginous base",
        "Emulsion base",
        "Absorption base",
      ],
      correct: "Hydrophilic base",
    },
    {
      question:
        "What is the primary risk of using an incorrect pH in a liquid preparation?",
      options: [
        "Drug degradation",
        "Color fading",
        "Odor loss",
        "Label peeling",
      ],
      correct: "Drug degradation",
    },
    {
      question:
        "What is the main purpose of using a buffer in a liquid dispensing preparation?",
      options: [
        "Maintain pH",
        "Enhance flavor",
        "Increase viscosity",
        "Reduce solubility",
      ],
      correct: "Maintain pH",
    },
    {
      question: "Which factor most affects the shelf life of an emulsion?",
      options: [
        "Storage temperature",
        "Container color",
        "Label design",
        "Odor intensity",
      ],
      correct: "Storage temperature",
    },
    {
      question:
        "What is the primary concern when dispensing a drug prone to oxidation?",
      options: [
        "Air exposure",
        "Light exposure",
        "pH stability",
        "Label clarity",
      ],
      correct: "Air exposure",
    },
    {
      question: "The following are the types of semisolid dosage form but one?",
      options: ["jelly", "cream", "ointment", "suspension"],
      correct: "suspension",
    },
    {
      question:
        "What is the primary purpose of a desiccant in pharmaceutical packaging?",
      options: [
        "To enhance flavor",
        "To absorb moisture",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To absorb moisture",
    },
    {
      question:
        "Which type of container is best for storing a photosensitive medication?",
      options: [
        "Clear glass bottle",
        "Amber glass bottle",
        "Plastic vial",
        "Paper envelope",
      ],
      correct: "Amber glass bottle",
    },
    {
      question: "What does the abbreviation 'HS' mean on a prescription?",
      options: ["At bedtime", "Every morning", "With meals", "As needed"],
      correct: "At bedtime",
    },
    {
      question: "What is the purpose of a unit-dose packaging system?",
      options: [
        "To store bulk medications",
        "To provide single doses",
        "To mix compounds",
        "To measure liquids",
      ],
      correct: "To provide single doses",
    },
    {
      question: "What does 'STAT' mean on a prescription?",
      options: ["Immediately", "Once daily", "At bedtime", "As needed"],
      correct: "Immediately",
    },
    {
      question:
        "What is the primary function of a lubricant in tablet production?",
      options: [
        "To enhance dissolution",
        "To reduce sticking",
        "To increase hardness",
        "To mask taste",
      ],
      correct: "To reduce sticking",
    },
    {
      question: "What does 'AC' mean on a prescription?",
      options: ["After meals", "Before meals", "At bedtime", "As needed"],
      correct: "Before meals",
    },
    {
      question:
        "What is the main purpose of a disintegrant in a tablet formulation?",
      options: [
        "To improve flow",
        "To aid breakdown",
        "To mask odor",
        "To increase stability",
      ],
      correct: "To aid breakdown",
    },
    {
      question: "What does 'PC' mean on a prescription?",
      options: ["After meals", "Before meals", "At bedtime", "As needed"],
      correct: "After meals",
    },
    {
      question: "What is the primary goal of extemporaneous compounding?",
      options: [
        "To mass-produce drugs",
        "To prepare custom medications",
        "To store medications",
        "To label medications",
      ],
      correct: "To prepare custom medications",
    },
    {
      question: "What does 'NPO' mean on a prescription?",
      options: [
        "Nothing by mouth",
        "Not for oral use",
        "No prescription order",
        "New patient order",
      ],
      correct: "Nothing by mouth",
    },
    {
      question: "What is the main advantage of using a capsule dosage form?",
      options: [
        "Faster absorption",
        "Masking unpleasant taste",
        "Easier storage",
        "Lower cost",
      ],
      correct: "Masking unpleasant taste",
    },
    {
      question:
        "What is the primary purpose of using a gelling agent in a semisolid preparation?",
      options: [
        "Form a gel structure",
        "Enhance flavor",
        "Increase solubility",
        "Improve color",
      ],
      correct: "Form a gel structure",
    },
    {
      question:
        "Which abbreviation on a prescription indicates 'sublingual' administration?",
      options: ["SL", "PO", "IV", "TOP"],
      correct: "SL",
    },
    {
      question: "What is the main purpose of a film coating on a tablet?",
      options: [
        "Protect from moisture",
        "Enhance flavor",
        "Increase solubility",
        "Improve color",
      ],
      correct: "Protect from moisture",
    },
    {
      question:
        "How many milliliters of a 8% w/v solution can be prepared from 24g of active ingredient?",
      options: ["200 mL", "300 mL", "400 mL", "500 mL"],
      correct: "300 mL",
    },
    {
      question:
        "Which type of container is best for storing a photosensitive medication?",
      options: [
        "Clear glass bottle",
        "Amber glass bottle",
        "Plastic vial",
        "Paper sachet",
      ],
      correct: "Amber glass bottle",
    },
    {
      question:
        "What is the primary purpose of a dispensing log in a pharmacy?",
      options: [
        "Track sales",
        "Record medication errors",
        "Monitor inventory",
        "Document transactions",
      ],
      correct: "Document transactions",
    },
    {
      question: "What does the abbreviation 'bid' mean on a prescription?",
      options: ["Once daily", "Twice daily", "Three times daily", "As needed"],
      correct: "Twice daily",
    },
    {
      question: "What is the primary risk of improper mixing in a suspension?",
      options: ["Uneven dosing", "Color change", "Odor loss", "Label peeling"],
      correct: "Uneven dosing",
    },
    {
      question:
        "Which equipment is used to measure precise liquid volumes in compounding?",
      options: ["Spatula", "Pipette", "Sieve", "Mortar"],
      correct: "Pipette",
    },
    {
      question:
        "What is the main purpose of a cleanroom in pharmaceutical compounding?",
      options: [
        "Maintain sterility",
        "Store equipment",
        "Measure liquids",
        "Package tablets",
      ],
      correct: "Maintain sterility",
    },
    {
      question: "What does 'IV' mean in a medication administration context?",
      options: [
        "Intravenous",
        "Inhaled vapor",
        "Internal volume",
        "Immediate value",
      ],
      correct: "Intravenous",
    },
    {
      question: "What is the primary purpose of a binder in tablet production?",
      options: [
        "To hold particles together",
        "To improve flow",
        "To mask taste",
        "To enhance color",
      ],
      correct: "To hold particles together",
    },
    {
      question: "What does 'IM' mean in a medication administration context?",
      options: [
        "Intramuscular",
        "Inhaled mist",
        "Internal medicine",
        "Immediate medication",
      ],
      correct: "Intramuscular",
    },
    {
      question: "What is the primary purpose of a coating on a tablet?",
      options: [
        "To increase solubility",
        "To protect from moisture",
        "To reduce hardness",
        "To decrease stability",
      ],
      correct: "To protect from moisture",
    },
    {
      question: "What does 'SC' mean in a medication administration context?",
      options: [
        "Subcutaneous",
        "Sublingual",
        "Systemic circulation",
        "Standard care",
      ],
      correct: "Subcutaneous",
    },
    {
      question:
        "What is the main reason for using a child-resistant container?",
      options: [
        "To reduce cost",
        "To prevent accidental ingestion",
        "To enhance appearance",
        "To increase volume",
      ],
      correct: "To prevent accidental ingestion",
    },
    {
      question: "What does 'OD' mean on a prescription?",
      options: ["Right eye", "Left eye", "Both eyes", "Once daily"],
      correct: "Right eye",
    },
    {
      question:
        "What is the primary purpose of a stabilizer in a liquid formulation?",
      options: [
        "To enhance flavor",
        "To maintain consistency",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To maintain consistency",
    },
    {
      question: "What does 'OS' mean on a prescription?",
      options: ["Right eye", "Left eye", "Both eyes", "Once daily"],
      correct: "Left eye",
    },
    {
      question:
        "What is the main purpose of a preservative in a liquid medication?",
      options: [
        "To prevent microbial growth",
        "To enhance flavor",
        "To increase viscosity",
        "To improve color",
      ],
      correct: "To prevent microbial growth",
    },
    {
      question: "What does 'OU' mean on a prescription?",
      options: ["Right eye", "Left eye", "Both eyes", "Once daily"],
      correct: "Both eyes",
    },
    {
      question: "What is the primary purpose of a thickener in a suspension?",
      options: [
        "To enhance flavor",
        "To increase viscosity",
        "To improve color",
        "To reduce solubility",
      ],
      correct: "To increase viscosity",
    },
    {
      question: "What does 'SL' mean in a medication administration context?",
      options: [
        "Sublingual",
        "Subcutaneous",
        "Systemic level",
        "Standard liquid",
      ],
      correct: "Sublingual",
    },
    {
      question:
        "What is the main purpose of a flavoring agent in a liquid medication?",
      options: [
        "To improve taste",
        "To increase stability",
        "To enhance color",
        "To reduce viscosity",
      ],
      correct: "To improve taste",
    },
    {
      question: "What does 'TOP' mean in a medication administration context?",
      options: [
        "Topical",
        "Total oral preparation",
        "Take once per",
        "Temporary oral",
      ],
      correct: "Topical",
    },
    {
      question: "What is the primary purpose of a sweetener in a syrup?",
      options: [
        "To mask bitterness",
        "To increase viscosity",
        "To enhance color",
        "To reduce solubility",
      ],
      correct: "To mask bitterness",
    },
    {
      question: "What does 'INH' mean in a medication administration context?",
      options: [
        "Inhalation",
        "Injection",
        "Internal hydration",
        "Immediate need",
      ],
      correct: "Inhalation",
    },
    {
      question:
        "What is the main purpose of a humectant in a pharmaceutical preparation?",
      options: [
        "To retain moisture",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To retain moisture",
    },
    {
      question: "What does 'PR' mean in a medication administration context?",
      options: [
        "Per rectum",
        "Per room",
        "Primary route",
        "Prescription required",
      ],
      correct: "Per rectum",
    },
    {
      question:
        "What is the primary purpose of a pH adjuster in a liquid formulation?",
      options: [
        "To maintain stability",
        "To enhance flavor",
        "To increase viscosity",
        "To improve color",
      ],
      correct: "To maintain stability",
    },
    {
      question: "What does 'PV' mean in a medication administration context?",
      options: [
        "Per vagina",
        "Per vein",
        "Primary volume",
        "Prescription vial",
      ],
      correct: "Per vagina",
    },
    {
      question:
        "What is the main purpose of a colorant in a pharmaceutical preparation?",
      options: [
        "To enhance appearance",
        "To increase stability",
        "To improve taste",
        "To reduce viscosity",
      ],
      correct: "To enhance appearance",
    },
    {
      question: "What does 'IT' mean in a medication administration context?",
      options: [
        "Intrathecal",
        "Internal tablet",
        "Immediate therapy",
        "Injection type",
      ],
      correct: "Intrathecal",
    },
    {
      question:
        "What is the primary purpose of a diluent in a pharmaceutical preparation?",
      options: [
        "To reduce concentration",
        "To enhance flavor",
        "To increase viscosity",
        "To improve color",
      ],
      correct: "To reduce concentration",
    },
    {
      question: "What does 'ID' mean in a medication administration context?",
      options: [
        "Intradermal",
        "Internal dose",
        "Immediate delivery",
        "Injection daily",
      ],
      correct: "Intradermal",
    },
    {
      question:
        "What is the main purpose of a solubilizing agent in a liquid formulation?",
      options: [
        "To enhance solubility",
        "To increase viscosity",
        "To improve color",
        "To mask taste",
      ],
      correct: "To enhance solubility",
    },
    {
      question: "What does 'ET' mean in a medication administration context?",
      options: [
        "Endotracheal",
        "External tablet",
        "Extended therapy",
        "Extra topical",
      ],
      correct: "Endotracheal",
    },
    {
      question:
        "What is the primary purpose of a gelling agent in a semisolid preparation?",
      options: [
        "To form a gel structure",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To form a gel structure",
    },
    {
      question: "What does 'NG' mean in a medication administration context?",
      options: ["Nasogastric", "New gel", "No gel", "Neutral gel"],
      correct: "Nasogastric",
    },
    {
      question:
        "What is the main purpose of a viscosity enhancer in a liquid preparation?",
      options: [
        "To improve texture",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To improve texture",
    },
    {
      question: "What does 'OTIC' mean in a medication administration context?",
      options: ["Ear", "Eye", "Mouth", "Nose"],
      correct: "Ear",
    },
    {
      question:
        "What is the primary purpose of a buffering agent in a liquid formulation?",
      options: [
        "To maintain pH",
        "To enhance flavor",
        "To increase viscosity",
        "To improve color",
      ],
      correct: "To maintain pH",
    },
    {
      question: "What does 'OPH' mean in a medication administration context?",
      options: [
        "Ophthalmic",
        "Oral preparation",
        "Otic preparation",
        "Orthopedic",
      ],
      correct: "Ophthalmic",
    },
    {
      question: "What is the main purpose of a surfactant in an emulsion?",
      options: [
        "To stabilize the emulsion",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To stabilize the emulsion",
    },
    {
      question: "What does 'NAS' mean in a medication administration context?",
      options: [
        "Nasal",
        "Nasogastric",
        "Neutral administration",
        "New application",
      ],
      correct: "Nasal",
    },
    {
      question:
        "What is the primary purpose of a chelating agent in a liquid formulation?",
      options: [
        "To bind metal ions",
        "To enhance flavor",
        "To increase viscosity",
        "To improve color",
      ],
      correct: "To bind metal ions",
    },
    {
      question: "What does 'BUCC' mean in a medication administration context?",
      options: ["Buccal", "Bacterial", "Buffered", "Basic unit"],
      correct: "Buccal",
    },
    {
      question:
        "What is the main purpose of an antioxidant in a pharmaceutical preparation?",
      options: [
        "To prevent oxidation",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To prevent oxidation",
    },
    {
      question: "What does 'TD' mean in a medication administration context?",
      options: [
        "Transdermal",
        "Tablet dose",
        "Total delivery",
        "Therapeutic dose",
      ],
      correct: "Transdermal",
    },
    {
      question:
        "What is the primary purpose of a disintegrating agent in a tablet?",
      options: [
        "To aid breakdown in the body",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To aid breakdown in the body",
    },
    {
      question: "What does 'GTT' mean in a medication administration context?",
      options: ["Drops", "Gel tablet", "General therapy", "Gastric tube"],
      correct: "Drops",
    },
    {
      question: "What is the main purpose of a film coating on a tablet?",
      options: [
        "To protect from moisture",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To protect from moisture",
    },
    {
      question: "What does 'VAG' mean in a medication administration context?",
      options: ["Vaginal", "Vapor", "Volume adjustment", "Vial"],
      correct: "Vaginal",
    },
    {
      question:
        "What is the primary purpose of an enteric coating on a tablet?",
      options: [
        "To protect the stomach",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To protect the stomach",
    },
    {
      question: "What does 'AUR' mean in a medication administration context?",
      options: ["Ear", "Eye", "Mouth", "Nose"],
      correct: "Ear",
    },
    {
      question: "What is the main purpose of a sustained-release formulation?",
      options: [
        "To release drug slowly",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To release drug slowly",
    },
    {
      question: "What does 'OCUL' mean in a medication administration context?",
      options: ["Ocular", "Oral", "Otic", "Orthopedic"],
      correct: "Ocular",
    },
    {
      question:
        "What is the primary purpose of a moisture barrier in packaging?",
      options: [
        "To prevent degradation",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To prevent degradation",
    },
    {
      question: "What does 'RECT' mean in a medication administration context?",
      options: ["Rectal", "Regular", "Reduced", "Reconstituted"],
      correct: "Rectal",
    },
    {
      question:
        "What is the main purpose of a tamper-evident seal on a medication bottle?",
      options: [
        "To ensure safety",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To ensure safety",
    },
    {
      question: "What does 'SUBL' mean in a medication administration context?",
      options: ["Sublingual", "Subcutaneous", "Sustained", "Systemic"],
      correct: "Sublingual",
    },
    {
      question: "What is the primary purpose of a light-resistant container?",
      options: [
        "To protect from light",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To protect from light",
    },
    {
      question:
        "What does 'TRANS' mean in a medication administration context?",
      options: ["Transdermal", "Transitory", "Tablet", "Therapeutic"],
      correct: "Transdermal",
    },
    {
      question:
        "What is the main purpose of a desiccant in a medication bottle?",
      options: [
        "To absorb moisture",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To absorb moisture",
    },
    {
      question: "What does 'AER' mean in a medication administration context?",
      options: ["Aerosol", "Aerobic", "Aromatic", "Adjusted"],
      correct: "Aerosol",
    },
    {
      question: "What is the primary purpose of a stabilizer in an emulsion?",
      options: [
        "To prevent separation",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To prevent separation",
    },
    {
      question: "What does 'CAP' mean in a medication dosage form?",
      options: ["Capsule", "Caplet", "Capacity", "Capsule preparation"],
      correct: "Capsule",
    },
    {
      question:
        "What is the main purpose of a lubricant in a capsule formulation?",
      options: [
        "To aid filling",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To aid filling",
    },
    {
      question: "What does 'TAB' mean in a medication dosage form?",
      options: ["Tablet", "Tabular", "Tape", "Therapeutic agent"],
      correct: "Tablet",
    },
    {
      question:
        "What is the primary purpose of a sweetener in a liquid formulation?",
      options: [
        "To improve palatability",
        "To enhance stability",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To improve palatability",
    },
    {
      question: "What does 'SUSP' mean in a medication dosage form?",
      options: ["Suspension", "Syrup", "Solution", "Sustained"],
      correct: "Suspension",
    },
    {
      question: "What is the main purpose of a flavoring agent in a syrup?",
      options: [
        "To enhance taste",
        "To increase stability",
        "To improve color",
        "To reduce viscosity",
      ],
      correct: "To enhance taste",
    },
    {
      question: "What does 'SOL' mean in a medication dosage form?",
      options: ["Solution", "Solid", "Soluble", "Sustained oral"],
      correct: "Solution",
    },
    {
      question:
        "What is the primary purpose of a thickener in a gel formulation?",
      options: [
        "To increase viscosity",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To increase viscosity",
    },
    {
      question: "What does 'EMUL' mean in a medication dosage form?",
      options: ["Emulsion", "Emetic", "Emulsifier", "Extended"],
      correct: "Emulsion",
    },
    {
      question:
        "What is the main purpose of a wetting agent in a powder formulation?",
      options: [
        "To improve dispersion",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To improve dispersion",
    },
    {
      question: "What does 'OINT' mean in a medication dosage form?",
      options: ["Ointment", "Oral intake", "Otic", "Orthopedic"],
      correct: "Ointment",
    },
    {
      question: "What is the primary purpose of a humectant in an ointment?",
      options: [
        "To retain moisture",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To retain moisture",
    },
    {
      question: "What does 'CREAM' mean in a medication dosage form?",
      options: ["Cream", "Crystalline", "Compressed", "Coated"],
      correct: "Cream",
    },
    {
      question: "What is the main purpose of a preservative in an ointment?",
      options: [
        "To prevent microbial growth",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To prevent microbial growth",
    },
    {
      question: "What does 'GEL' mean in a medication dosage form?",
      options: ["Gel", "General", "Granule", "Gastroenteric"],
      correct: "Gel",
    },
    {
      question: "What is the primary purpose of a gelling agent in a gel?",
      options: [
        "To form a gel structure",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To form a gel structure",
    },
    {
      question: "What does 'LOT' mean in a medication dosage form?",
      options: ["Lotion", "Liquid oral", "Long-term", "Localized"],
      correct: "Lotion",
    },
    {
      question: "What is the main purpose of a stabilizer in a lotion?",
      options: [
        "To maintain consistency",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To maintain consistency",
    },
    {
      question: "What does 'SYR' mean in a medication dosage form?",
      options: ["Syrup", "Syringe", "Systemic", "Sustained"],
      correct: "Syrup",
    },
    {
      question: "What is the primary purpose of a colorant in a syrup?",
      options: [
        "To enhance appearance",
        "To increase stability",
        "To improve taste",
        "To reduce viscosity",
      ],
      correct: "To enhance appearance",
    },
    {
      question: "What does 'ELIX' mean in a medication dosage form?",
      options: ["Elixir", "Emulsion", "Extended liquid", "External"],
      correct: "Elixir",
    },
    {
      question: "What is the main purpose of an alcohol base in an elixir?",
      options: [
        "To enhance solubility",
        "To increase viscosity",
        "To improve color",
        "To reduce stability",
      ],
      correct: "To enhance solubility",
    },
    {
      question: "What does 'TINC' mean in a medication dosage form?",
      options: ["Tincture", "Tablet", "Topical", "Therapeutic"],
      correct: "Tincture",
    },
    {
      question: "What is the primary purpose of a solvent in a tincture?",
      options: [
        "To extract active ingredients",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To extract active ingredients",
    },
    {
      question: "What does 'SUPP' mean in a medication dosage form?",
      options: ["Suppository", "Suspension", "Supplement", "Sustained"],
      correct: "Suppository",
    },
    {
      question: "What is the main purpose of a base in a suppository?",
      options: [
        "To facilitate melting",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To facilitate melting",
    },
    {
      question: "What does 'INJ' mean in a medication dosage form?",
      options: ["Injection", "Inhalation", "Internal", "Immediate"],
      correct: "Injection",
    },
    {
      question: "What is the primary purpose of a diluent in an injection?",
      options: [
        "To adjust volume",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To adjust volume",
    },
    {
      question: "What does 'AERO' mean in a medication dosage form?",
      options: ["Aerosol", "Aromatic", "Adjusted", "Aerobic"],
      correct: "Aerosol",
    },
    {
      question: "What is the main purpose of a propellant in an aerosol?",
      options: [
        "To disperse the medication",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To disperse the medication",
    },
    {
      question: "What does 'PATCH' mean in a medication dosage form?",
      options: ["Patch", "Packet", "Particle", "Preparation"],
      correct: "Patch",
    },
    {
      question:
        "What is the primary purpose of an adhesive in a transdermal patch?",
      options: [
        "To ensure skin contact",
        "To enhance flavor",
        "To increase solubility",
        "To improve color",
      ],
      correct: "To ensure skin contact",
    },
    {
      question: "What does SIG mean on a prescription?",
      options: [
        "Signature",
        "Instructions for use",
        "Strength of drug",
        "Side effects",
      ],
      correct: "Instructions for use",
    },
    {
      question: "What does cracking mean in dispensing theory?",
      options: [
        "Emulsion breaking",
        "Tablet splitting",
        "Capsule leakage",
        "Powder clumping",
      ],
      correct: "Emulsion breaking",
    },
    {
      question:
        "What is the main purpose of using a suspending agent in a liquid preparation?",
      options: [
        "Prevent settling",
        "Enhance flavor",
        "Increase solubility",
        "Reduce viscosity",
      ],
      correct: "Prevent settling",
    },
    {
      question: "What does SIG mean on a prescription?",
      options: [
        "Signature",
        "Instructions for use",
        "Strength of drug",
        "Side effects",
      ],
      correct: "Instructions for use",
    },
    {
      question: "What does cracking mean in dispensing theory?",
      options: [
        "Emulsion breaking",
        "Tablet splitting",
        "Capsule leakage",
        "Powder clumping",
      ],
      correct: "Emulsion breaking",
    },
    {
      question:
        "What is the main purpose of using a suspending agent in a liquid preparation?",
      options: [
        "Prevent settling",
        "Enhance flavor",
        "Increase solubility",
        "Reduce viscosity",
      ],
      correct: "Prevent settling",
    },
    {
      question: "What does 'o.d.' mean on a prescription?",
      options: ["Right eye", "Left eye", "Both eyes", "Once daily"],
      correct: "Right eye",
    },
    {
      question: "What is a common base for ointments?",
      options: ["Water", "Petroleum jelly", "Alcohol", "Sugar syrup"],
      correct: "Petroleum jelly",
    },
    {
      question: "What is a common method to measure powder doses?",
      options: ["Spoon", "Balance scale", "Pipette", "Syringe"],
      correct: "Balance scale",
    },
    {
      question: "What does 'p.o.' mean on a prescription?",
      options: ["By mouth", "By injection", "By rectum", "By eye"],
      correct: "By mouth",
    },
    {
      question: "What is the purpose of a stabilizer in a liquid preparation?",
      options: [
        "Maintain pH or prevent degradation",
        "Enhance flavor",
        "Increase viscosity",
        "Prevent settling",
      ],
      correct: "Maintain pH or prevent degradation",
    },
  ],
  "Action and Use of Medicines": [
    {
      question: "What is the action of analgesics?",
      options: [
        "Lower blood pressure",
        "Relieve pain",
        "Reduce fever",
        "Treat infections",
      ],
      correct: "Relieve pain",
    },
    {
      question: "What is the primary action of loop diuretics like torsemide?",
      options: [
        "Reduce fever",
        "Increase urine output",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Increase urine output",
    },
    {
      question: "Which drug is used to treat severe malaria in Nigeria?",
      options: [
        "Paracetamol",
        "Artemether-lumefantrine",
        "Metformin",
        "Cetirizine",
      ],
      correct: "Artemether-lumefantrine",
    },
    {
      question:
        "What is the mechanism of action of benzodiazepines like midazolam?",
      options: [
        "Enhance GABA activity",
        "Block histamine receptors",
        "Reduce stomach acid",
        "Inhibit bacterial growth",
      ],
      correct: "Enhance GABA activity",
    },
    {
      question: "What is the primary use of antiarrhythmics like amiodarone?",
      options: [
        "Treat irregular heart rhythms",
        "Lower cholesterol",
        "Relieve asthma",
        "Prevent seizures",
      ],
      correct: "Treat irregular heart rhythms",
    },
    {
      question:
        "Which drug class is used to manage chronic obstructive pulmonary disease (COPD)?",
      options: [
        "Anticholinergics",
        "Antipyretics",
        "Anticoagulants",
        "Antibiotics",
      ],
      correct: "Anticholinergics",
    },
    {
      question:
        "What is a common side effect of opioid analgesics like tramadol?",
      options: ["Hair loss", "Constipation", "Weight loss", "Fever"],
      correct: "Constipation",
    },
    {
      question:
        "Which Nigerian agency regulates the importation of controlled substances?",
      options: ["NDLEA", "PCN", "NAFDAC", "NIPRD"],
      correct: "NAFDAC",
    },
    {
      question:
        "What is the purpose of NAFDAC’s Mobile Authentication Service (MAS) in Nigeria?",
      options: [
        "Track drug prices",
        "Verify drug authenticity",
        "Monitor pharmacy staff",
        "Reduce drug shortages",
      ],
      correct: "Verify drug authenticity",
    },
    {
      question:
        "Which schedule of drugs in Nigeria requires a prescription from a licensed physician?",
      options: ["Schedule I", "Schedule IV", "Over-the-counter", "Schedule V"],
      correct: "Schedule I",
    },
    {
      question:
        "What should a pharmacy technician do if a patient reports an adverse drug reaction?",
      options: [
        "Adjust the dose",
        "Report to the pharmacist",
        "Ignore the complaint",
        "Dispense a substitute",
      ],
      correct: "Report to the pharmacist",
    },
    {
      question:
        "What is the correct storage temperature for erythropoietin injections?",
      options: [
        "Room temperature",
        "2-8°C refrigeration",
        "Freezer at -20°C",
        "Above 25°C",
      ],
      correct: "2-8°C refrigeration",
    },
    {
      question:
        "A prescription reads 'Chloroquine 250 mg po bid × 3 days.' How many tablets are needed?",
      options: ["6", "9", "12", "15"],
      correct: "6",
    },
    {
      question: "What does the abbreviation 'bid' mean on a prescription?",
      options: ["Once daily", "Twice daily", "Four times daily", "As needed"],
      correct: "Twice daily",
    },
    {
      question:
        "What is the primary use of anthelmintics like ivermectin in Nigeria?",
      options: [
        "Treat fungal infections",
        "Treat worm infestations",
        "Lower blood pressure",
        "Relieve pain",
      ],
      correct: "Treat worm infestations",
    },
    {
      question:
        "What is the action of calcium channel blockers like nifedipine?",
      options: [
        "Dilate blood vessels",
        "Increase heart rate",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Dilate blood vessels",
    },
    {
      question: "Which drug is used to manage sickle cell anemia crises?",
      options: ["Hydroxyurea", "Fluconazole", "Ciprofloxacin", "Paracetamol"],
      correct: "Hydroxyurea",
    },
    {
      question: "What is the primary action of expectorants like guaifenesin?",
      options: [
        "Relieve pain",
        "Thin mucus secretions",
        "Reduce fever",
        "Treat infections",
      ],
      correct: "Thin mucus secretions",
    },
    {
      question: "Which drug class is used to treat rheumatoid arthritis?",
      options: ["DMARDs", "Antipyretics", "Antibiotics", "Antihistamines"],
      correct: "DMARDs",
    },
    {
      question:
        "What is a common side effect of ACE inhibitors like enalapril?",
      options: ["Dry cough", "Hair growth", "Fever", "Weight loss"],
      correct: "Dry cough",
    },
    {
      question:
        "Which Nigerian law governs the sale of poisons and dangerous drugs?",
      options: ["Pharmacy Act", "Dangerous Drugs Act", "NAFDAC Act", "PCN Act"],
      correct: "Dangerous Drugs Act",
    },
    {
      question: "What is the purpose of a pharmacovigilance system in Nigeria?",
      options: [
        "Track drug prices",
        "Monitor drug safety",
        "License pharmacists",
        "Control drug trafficking",
      ],
      correct: "Monitor drug safety",
    },
    {
      question:
        "Which drug is used to prevent nausea in chemotherapy patients?",
      options: ["Metoclopramide", "Metformin", "Atenolol", "Fluconazole"],
      correct: "Metoclopramide",
    },
    {
      question: "What is the action of mucolytics like acetylcysteine?",
      options: [
        "Break down mucus",
        "Reduce stomach acid",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Break down mucus",
    },
    {
      question: "Which drug class is used to manage Parkinson’s disease?",
      options: [
        "Dopamine agonists",
        "Antihistamines",
        "Antipyretics",
        "Antibiotics",
      ],
      correct: "Dopamine agonists",
    },
    {
      question:
        "What is a common side effect of antimalarials like mefloquine?",
      options: ["Nausea", "Hair growth", "Weight loss", "Dry eyes"],
      correct: "Nausea",
    },
    {
      question:
        "Which agency in Nigeria conducts post-market surveillance of drugs?",
      options: ["NDLEA", "NAFDAC", "PCN", "NIPRD"],
      correct: "NAFDAC",
    },
    {
      question: "What is the primary use of bisphosphonates like risedronate?",
      options: [
        "Treat osteoporosis",
        "Relieve pain",
        "Treat infections",
        "Lower blood pressure",
      ],
      correct: "Treat osteoporosis",
    },
    {
      question: "What is the action of antitussives like dextromethorphan?",
      options: [
        "Suppress cough",
        "Relieve pain",
        "Reduce fever",
        "Treat allergies",
      ],
      correct: "Suppress cough",
    },
    {
      question: "Which drug is used to treat glaucoma?",
      options: ["Latanoprost", "Ciprofloxacin", "Paracetamol", "Metformin"],
      correct: "Latanoprost",
    },
    {
      question: "What is the primary action of thrombolytics like alteplase?",
      options: [
        "Dissolve blood clots",
        "Reduce inflammation",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Dissolve blood clots",
    },
    {
      question: "Which drug class is used to manage anxiety disorders?",
      options: [
        "Benzodiazepines",
        "Antibiotics",
        "Antipyretics",
        "Antihistamines",
      ],
      correct: "Benzodiazepines",
    },
    {
      question:
        "What is a common side effect of antitubercular drugs like rifampicin?",
      options: ["Orange urine", "Hair growth", "Fever", "Weight loss"],
      correct: "Orange urine",
    },
    {
      question: "Which Nigerian agency licenses patient medicine vendors?",
      options: ["NAFDAC", "NDLEA", "PCN", "NIPRD"],
      correct: "PCN",
    },
    {
      question: "What is the primary use of antiplatelets like clopidogrel?",
      options: [
        "Prevent platelet aggregation",
        "Treat infections",
        "Reduce fever",
        "Relieve pain",
      ],
      correct: "Prevent platelet aggregation",
    },
    {
      question: "What is the action of sympathomimetics like epinephrine?",
      options: [
        "Stimulate adrenaline receptors",
        "Reduce stomach acid",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Stimulate adrenaline receptors",
    },
    {
      question: "Which drug is used to treat erectile dysfunction?",
      options: ["Sildenafil", "Ciprofloxacin", "Paracetamol", "Metformin"],
      correct: "Sildenafil",
    },
    {
      question:
        "What is the primary action of decongestants like pseudoephedrine?",
      options: [
        "Relieve nasal congestion",
        "Reduce fever",
        "Treat infections",
        "Relieve pain",
      ],
      correct: "Relieve nasal congestion",
    },
    {
      question: "Which drug class is used to manage hyperthyroidism?",
      options: [
        "Antithyroid drugs",
        "Antibiotics",
        "Antipyretics",
        "Antihistamines",
      ],
      correct: "Antithyroid drugs",
    },
    {
      question:
        "What is a common side effect of antiprotozoals like tinidazole?",
      options: ["Metallic taste", "Hair growth", "Fever", "Weight loss"],
      correct: "Metallic taste",
    },
    {
      question:
        "What is the purpose of NAFDAC’s drug registration process in Nigeria?",
      options: [
        "Track drug prices",
        "Ensure drug safety and efficacy",
        "License pharmacists",
        "Control drug trafficking",
      ],
      correct: "Ensure drug safety and efficacy",
    },
    {
      question:
        "What is the primary action of bile acid sequestrants like cholestyramine?",
      options: [
        "Lower cholesterol",
        "Relieve pain",
        "Reduce fever",
        "Treat infections",
      ],
      correct: "Lower cholesterol",
    },
    {
      question:
        "Which drug is commonly used to treat onchocerciasis in Nigeria?",
      options: ["Ivermectin", "Paracetamol", "Amoxicillin", "Cetirizine"],
      correct: "Ivermectin",
    },
    {
      question:
        "What is the mechanism of action of sulfonylureas like glimepiride?",
      options: [
        "Stimulate insulin release",
        "Block histamine receptors",
        "Inhibit bacterial growth",
        "Reduce stomach acid",
      ],
      correct: "Stimulate insulin release",
    },
    {
      question: "Which route of drug administration is not a parenteral route?",
      options: ["Rectal", "Intravenous", "Intramuscular", "All of the above"],
      correct: "Rectal",
    },
    {
      question: "What is the primary use of venlafaxine?",
      options: [
        "Treat depression",
        "Lower cholesterol",
        "Relieve asthma",
        "Treat infections",
      ],
      correct: "Treat depression",
    },
    {
      question:
        "What is the action of inhaled corticosteroids like fluticasone?",
      options: [
        "Reduce airway inflammation",
        "Increase blood pressure",
        "Relieve pain",
        "Prevent seizures",
      ],
      correct: "Reduce airway inflammation",
    },
    {
      question:
        "Which drug class is used to treat benign prostatic hyperplasia (BPH)?",
      options: [
        "Alpha-1 blockers",
        "Antibiotics",
        "Antipyretics",
        "Anticoagulants",
      ],
      correct: "Alpha-1 blockers",
    },
    {
      question:
        "What is a common side effect of tricyclic antidepressants like amitriptyline?",
      options: ["Dry mouth", "Hair growth", "Fever", "Weight loss"],
      correct: "Dry mouth",
    },
    {
      question:
        "Which law requires pharmacies to maintain patient medication profiles?",
      options: ["FDCA", "HIPAA", "OBRA-90", "CSA"],
      correct: "OBRA-90",
    },
    {
      question: "What is the purpose of DEA Form 41?",
      options: [
        "Order controlled substances",
        "Report destruction of controlled substances",
        "Register a pharmacy",
        "Track drug recalls",
      ],
      correct: "Report destruction of controlled substances",
    },
    {
      question:
        "Which schedule includes drugs with no refills allowed without a new prescription?",
      options: ["Schedule II", "Schedule III", "Schedule IV", "Schedule V"],
      correct: "Schedule II",
    },
    {
      question: "What should a pharmacy technician do during a drug shortage?",
      options: [
        "Dispense expired drugs",
        "Notify the pharmacist",
        "Reduce patient doses",
        "Ignore the shortage",
      ],
      correct: "Notify the pharmacist",
    },
    {
      question:
        "Which practice helps verify patient identity before dispensing?",
      options: [
        "Asking for date of birth",
        "Checking drug prices",
        "Tracking inventory",
        "Reducing stock",
      ],
      correct: "Asking for date of birth",
    },
    {
      question: "What is the correct storage requirement for insulin?",
      options: [
        "Room temperature",
        "2-8°C refrigeration",
        "Freezer at -20°C",
        "Above 25°C",
      ],
      correct: "2-8°C refrigeration",
    },
    {
      question:
        "A prescription reads 'Fluticasone 50 mcg nasal spray, 1 spray each nostril qd × 30 days.' How many sprays are needed?",
      options: ["30", "60", "90", "120"],
      correct: "60",
    },
    {
      question: "What does the abbreviation 'pc' mean on a prescription?",
      options: ["After meals", "Before meals", "At bedtime", "As needed"],
      correct: "After meals",
    },
    {
      question: "What is the purpose of a pharmacy workflow system?",
      options: [
        "Track sales",
        "Streamline prescription processing",
        "Monitor staff hours",
        "Adjust drug prices",
      ],
      correct: "Streamline prescription processing",
    },
    {
      question:
        "How many grams of active ingredient are in 300 mL of a 3% solution?",
      options: ["6 g", "9 g", "12 g", "15 g"],
      correct: "9 g",
    },
    {
      question: "What is the role of a pharmacy technician in REMS counseling?",
      options: [
        "Prescribe medications",
        "Provide information under pharmacist supervision",
        "Diagnose conditions",
        "Adjust dosages",
      ],
      correct: "Provide information under pharmacist supervision",
    },
    {
      question: "What is the primary use of antihypertensives?",
      options: [
        "Reduce pain",
        "Lower blood pressure",
        "Treat infections",
        "Reduce fever",
      ],
      correct: "Lower blood pressure",
    },
    {
      question: "What is the action of antihistamines?",
      options: [
        "Relieve allergic symptoms",
        "Lower blood sugar",
        "Treat infections",
        "Increase heart rate",
      ],
      correct: "Relieve allergic symptoms",
    },
    {
      question:
        "What is the primary use of thyroid hormones like levothyroxine?",
      options: [
        "Treat hypothyroidism",
        "Manage hypertension",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Treat hypothyroidism",
    },
    {
      question:
        "What is the action of selective serotonin reuptake inhibitors (SSRIs)?",
      options: [
        "Increase serotonin levels",
        "Lower blood sugar",
        "Reduce inflammation",
        "Prevent blood clots",
      ],
      correct: "Increase serotonin levels",
    },
    {
      question:
        "Which drug class is used to treat gout by reducing uric acid levels?",
      options: [
        "Allopurinol",
        "Antihistamines",
        "Beta-blockers",
        "Antipyretics",
      ],
      correct: "Allopurinol",
    },
    {
      question:
        "What is a common side effect of corticosteroids like prednisone?",
      options: ["Weight gain", "Hypotension", "Hair loss", "Dry eyes"],
      correct: "Weight gain",
    },
    {
      question:
        "Which federal law regulates the handling of controlled substances in pharmacies?",
      options: [
        "Food, Drug, and Cosmetic Act",
        "Controlled Substances Act",
        "Hatch-Waxman Act",
        "Medicare Modernization Act",
      ],
      correct: "Controlled Substances Act",
    },
    {
      question: "What is the purpose of DEA Form 222?",
      options: [
        "Report drug theft",
        "Order Schedule II drugs",
        "Register a pharmacy",
        "Track drug recalls",
      ],
      correct: "Order Schedule II drugs",
    },
    {
      question:
        "Which schedule includes drugs with moderate abuse potential and accepted medical use?",
      options: ["Schedule I", "Schedule II", "Schedule III", "Schedule V"],
      correct: "Schedule III",
    },
    {
      question:
        "What is the primary purpose of using a barcode scanning system in pharmacies?",
      options: [
        "Track employee hours",
        "Prevent medication errors",
        "Monitor drug prices",
        "Record patient preferences",
      ],
      correct: "Prevent medication errors",
    },
    {
      question:
        "Which action should a pharmacy technician take when handling chemotherapy drugs?",
      options: [
        "Use personal protective equipment",
        "Store in general stock",
        "Mix with other drugs",
        "Handle without gloves",
      ],
      correct: "Use personal protective equipment",
    },
    {
      question: "What is the correct storage condition for most vaccines?",
      options: [
        "Room temperature",
        "2-8°C refrigeration",
        "Freezer at -20°C",
        "Above 25°C",
      ],
      correct: "2-8°C refrigeration",
    },
    {
      question:
        "A prescription reads 'Levothyroxine 100 mcg po qd × 30 days.' How many tablets should be dispensed?",
      options: ["15", "30", "60", "90"],
      correct: "30",
    },
    {
      question: "What does the abbreviation 'prn' mean on a prescription?",
      options: ["As needed", "Twice daily", "Before meals", "At bedtime"],
      correct: "As needed",
    },
    {
      question:
        "Which piece of information is NOT required on a prescription label?",
      options: [
        "Patient’s name",
        "Drug name",
        "Pharmacy technician’s initials",
        "Directions for use",
      ],
      correct: "Pharmacy technician’s initials",
    },
    {
      question: "What is the purpose of a medication reconciliation process?",
      options: [
        "Adjust drug prices",
        "Verify insurance coverage",
        "Ensure accurate patient medication lists",
        "Track pharmacy inventory",
      ],
      correct: "Ensure accurate patient medication lists",
    },
    {
      question: "What is the primary use of gabapentin?",
      options: [
        "Treat seizures",
        "Lower cholesterol",
        "Relieve allergies",
        "Manage diabetes",
      ],
      correct: "Treat seizures",
    },
    {
      question:
        "What is the action of proton pump inhibitors like pantoprazole?",
      options: [
        "Reduce stomach acid production",
        "Increase urine output",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Reduce stomach acid production",
    },
    {
      question: "Which drug class is used to manage overactive bladder?",
      options: [
        "Anticholinergics",
        "Antibiotics",
        "Antipyretics",
        "Anticoagulants",
      ],
      correct: "Anticholinergics",
    },
    {
      question: "What is a common side effect of albuterol inhalers?",
      options: ["Tremors", "Weight loss", "Hair growth", "Constipation"],
      correct: "Tremors",
    },
    {
      question:
        "Which program requires pharmacies to follow specific safety protocols for high-risk drugs?",
      options: ["REMS", "HIPAA", "FDA Recall", "DEA Registration"],
      correct: "REMS",
    },
    {
      question:
        "What is the primary action of SGLT2 inhibitors like dapagliflozin?",
      options: [
        "Lower blood sugar",
        "Relieve pain",
        "Reduce fever",
        "Treat infections",
      ],
      correct: "Lower blood sugar",
    },
    {
      question: "Which drug is used to treat lymphatic filariasis in Nigeria?",
      options: [
        "Diethylcarbamazine",
        "Paracetamol",
        "Amoxicillin",
        "Cetirizine",
      ],
      correct: "Diethylcarbamazine",
    },
    {
      question: "What is the mechanism of action of triptans like sumatriptan?",
      options: [
        "Constrict blood vessels",
        "Block histamine receptors",
        "Reduce stomach acid",
        "Inhibit bacterial growth",
      ],
      correct: "Constrict blood vessels",
    },
    {
      question: "What is the primary use of antiemetics like promethazine?",
      options: [
        "Prevent nausea and vomiting",
        "Lower cholesterol",
        "Treat asthma",
        "Prevent seizures",
      ],
      correct: "Prevent nausea and vomiting",
    },
    {
      question:
        "Which drug class is used to manage irritable bowel syndrome (IBS)?",
      options: [
        "Antispasmodics",
        "Antipyretics",
        "Antibiotics",
        "Antihistamines",
      ],
      correct: "Antispasmodics",
    },
    {
      question:
        "What is a common side effect of diuretics like spironolactone?",
      options: ["Hyperkalemia", "Hair growth", "Weight loss", "Fever"],
      correct: "Hyperkalemia",
    },
    {
      question:
        "Which Nigerian agency regulates the distribution of narcotic drugs?",
      options: ["NAFDAC", "NDLEA", "PCN", "NIPRD"],
      correct: "NDLEA",
    },
    {
      question:
        "What is the purpose of NAFDAC’s Public Alert Rapid System (PARS) in Nigeria?",
      options: [
        "Track drug prices",
        "Warn about unsafe drugs",
        "Monitor pharmacy staff",
        "License pharmacists",
      ],
      correct: "Warn about unsafe drugs",
    },
    {
      question:
        "Which schedule of drugs in Nigeria includes codeine-containing cough syrups?",
      options: ["Schedule V", "Schedule III", "Schedule I", "Over-the-counter"],
      correct: "Schedule V",
    },
    {
      question:
        "What should a pharmacy technician do if a prescription lacks a patient’s name?",
      options: [
        "Dispense the drug",
        "Consult the pharmacist",
        "Adjust the dose",
        "Ignore the prescription",
      ],
      correct: "Consult the pharmacist",
    },
    {
      question:
        "What is the correct storage temperature for tetanus toxoid vaccines?",
      options: [
        "Room temperature",
        "2-8°C refrigeration",
        "Freezer at -20°C",
        "Above 25°C",
      ],
      correct: "2-8°C refrigeration",
    },
    {
      question:
        "A prescription reads 'Azithromycin 500 mg po qd × 3 days.' How many tablets are needed?",
      options: ["3", "6", "9", "12"],
      correct: "3",
    },
    {
      question: "What does the abbreviation 'qd' mean on a prescription?",
      options: ["Once daily", "Twice daily", "Four times daily", "As needed"],
      correct: "Once daily",
    },
    {
      question:
        "What is the primary use of antitrypanosomal drugs like suramin in Nigeria?",
      options: [
        "Treat sleeping sickness",
        "Relieve pain",
        "Lower cholesterol",
        "Treat fungal infections",
      ],
      correct: "Treat sleeping sickness",
    },
    {
      question: "What is the action of DPP-4 inhibitors like sitagliptin?",
      options: [
        "Increase insulin secretion",
        "Relieve pain",
        "Treat infections",
        "Reduce fever",
      ],
      correct: "Increase insulin secretion",
    },
    {
      question: "Which drug is used to manage acute asthma attacks?",
      options: ["Salbutamol", "Fluconazole", "Amoxicillin", "Paracetamol"],
      correct: "Salbutamol",
    },
    {
      question:
        "What is the primary action of stool softeners like docusate sodium?",
      options: [
        "Ease bowel movements",
        "Relieve pain",
        "Reduce fever",
        "Treat infections",
      ],
      correct: "Ease bowel movements",
    },
    {
      question: "Which drug class is used to treat chronic hepatitis C?",
      options: [
        "Direct-acting antivirals",
        "Antipyretics",
        "Antibiotics",
        "Antihistamines",
      ],
      correct: "Direct-acting antivirals",
    },
    {
      question:
        "What is a common side effect of beta-agonists like salbutamol?",
      options: ["Tachycardia", "Hair growth", "Fever", "Weight gain"],
      correct: "Tachycardia",
    },
    {
      question:
        "Which Nigerian law requires pharmacies to display their license?",
      options: ["Pharmacy Act", "Dangerous Drugs Act", "NAFDAC Act", "PCN Act"],
      correct: "PCN Act",
    },
    {
      question:
        "What is the purpose of NAFDAC’s Adverse Drug Reaction (ADR) reporting system?",
      options: [
        "Track drug prices",
        "Monitor drug safety",
        "License pharmacists",
        "Control drug trafficking",
      ],
      correct: "Monitor drug safety",
    },
    {
      question: "Which drug is used to manage alcohol withdrawal symptoms?",
      options: ["Diazepam", "Metformin", "Atenolol", "Fluconazole"],
      correct: "Diazepam",
    },
    {
      question:
        "What is the action of H1 receptor antagonists like cetirizine?",
      options: [
        "Relieve allergic symptoms",
        "Reduce stomach acid",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Relieve allergic symptoms",
    },
    {
      question: "Which drug class is used to manage Alzheimer’s disease?",
      options: [
        "Cholinesterase inhibitors",
        "Antihistamines",
        "Antipyretics",
        "Antibiotics",
      ],
      correct: "Cholinesterase inhibitors",
    },
    {
      question: "What is a common side effect of antimalarials like quinine?",
      options: ["Tinnitus", "Hair growth", "Weight loss", "Dry eyes"],
      correct: "Tinnitus",
    },
    {
      question:
        "Which agency in Nigeria approves the curriculum for pharmacy technician training?",
      options: ["NAFDAC", "NDLEA", "PCN", "NIPRD"],
      correct: "PCN",
    },
    {
      question: "What is the primary use of uricosurics like probenecid?",
      options: [
        "Reduce uric acid levels",
        "Relieve pain",
        "Treat infections",
        "Lower blood pressure",
      ],
      correct: "Reduce uric acid levels",
    },
    {
      question: "What is the action of bronchodilators like ipratropium?",
      options: [
        "Relax airway muscles",
        "Relieve pain",
        "Treat infections",
        "Reduce fever",
      ],
      correct: "Relax airway muscles",
    },
    {
      question: "Which drug is used to treat dracunculiasis in Nigeria?",
      options: ["Metronidazole", "Ciprofloxacin", "Paracetamol", "Mebendazole"],
      correct: "Metronidazole",
    },
    {
      question: "What is the primary action of inotropes like digoxin?",
      options: [
        "Increase heart contractility",
        "Reduce inflammation",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Increase heart contractility",
    },
    {
      question: "Which drug class is used to manage psoriasis?",
      options: [
        "Topical corticosteroids",
        "Antibiotics",
        "Antipyretics",
        "Antihistamines",
      ],
      correct: "Topical corticosteroids",
    },
    {
      question:
        "What is a common side effect of antiprotozoals like co-artemether?",
      options: ["Headache", "Hair growth", "Fever", "Weight loss"],
      correct: "Headache",
    },
    {
      question: "Which Nigerian agency bans the sale of unregistered drugs?",
      options: ["NAFDAC", "NDLEA", "PCN", "NIPRD"],
      correct: "NAFDAC",
    },
    {
      question: "What is the primary use of antiandrogens like finasteride?",
      options: [
        "Treat prostate enlargement",
        "Treat infections",
        "Reduce fever",
        "Relieve pain",
      ],
      correct: "Treat prostate enlargement",
    },
    {
      question: "What is the action of antimuscarinics like atropine?",
      options: [
        "Reduce secretions",
        "Relieve pain",
        "Treat infections",
        "Lower blood pressure",
      ],
      correct: "Reduce secretions",
    },
    {
      question: "Which drug is used to manage opioid-induced constipation?",
      options: [
        "Methylnaltrexone",
        "Ciprofloxacin",
        "Paracetamol",
        "Metformin",
      ],
      correct: "Methylnaltrexone",
    },
    {
      question: "What is the primary action of expectorants like ambroxol?",
      options: [
        "Increase mucus clearance",
        "Reduce fever",
        "Treat infections",
        "Relieve pain",
      ],
      correct: "Increase mucus clearance",
    },
    {
      question: "Which drug class is used to manage migraines?",
      options: ["Triptans", "Antibiotics", "Antipyretics", "Antihistamines"],
      correct: "Triptans",
    },
    {
      question: "What is a common side effect of antifungals like nystatin?",
      options: ["Mouth irritation", "Hair growth", "Fever", "Weight gain"],
      correct: "Mouth irritation",
    },
    {
      question:
        "What is the purpose of NAFDAC’s National Drug Distribution Guidelines?",
      options: [
        "Track drug prices",
        "Ensure proper supply chain",
        "License pharmacists",
        "Control drug trafficking",
      ],
      correct: "Ensure proper supply chain",
    },
    {
      question:
        "What is the maximum number of refills allowed for a Schedule V medication?",
      options: ["None", "Up to 5", "Unlimited with prescription", "Up to 3"],
      correct: "Unlimited with prescription",
    },
    {
      question:
        "Which agency oversees the approval of new medications in the United States?",
      options: ["DEA", "FDA", "CDC", "CMS"],
      correct: "FDA",
    },
    {
      question:
        "What should a pharmacy technician do if a prescription appears unclear?",
      options: [
        "Dispense as written",
        "Consult the pharmacist",
        "Contact the patient",
        "Ignore the issue",
      ],
      correct: "Consult the pharmacist",
    },
    {
      question: "Which standard ensures sterile compounding in pharmacies?",
      options: ["USP <797>", "USP <795>", "OSHA", "HIPAA"],
      correct: "USP <797>",
    },
    {
      question: "What is the purpose of a medication error reporting system?",
      options: [
        "Track sales",
        "Improve patient safety",
        "Monitor staff performance",
        "Reduce inventory",
      ],
      correct: "Improve patient safety",
    },
    {
      question:
        "A prescription reads 'Prednisone 20 mg po bid × 5 days.' How many tablets are needed?",
      options: ["10", "20", "30", "40"],
      correct: "20",
    },
    {
      question: "What does the abbreviation 'ac' mean on a prescription?",
      options: ["At bedtime", "Before meals", "After meals", "As needed"],
      correct: "Before meals",
    },
    {
      question:
        "Which system is used to process third-party insurance claims in pharmacies?",
      options: ["NDC", "BIN/PCN", "DEA Number", "FDA Code"],
      correct: "BIN/PCN",
    },
    {
      question:
        "What is the role of a pharmacy technician in patient counseling?",
      options: [
        "Prescribe medications",
        "Provide drug information under pharmacist supervision",
        "Diagnose conditions",
        "Adjust dosages",
      ],
      correct: "Provide drug information under pharmacist supervision",
    },
    {
      question: "What is the primary use of duloxetine?",
      options: [
        "Treat depression and anxiety",
        "Lower blood pressure",
        "Relieve constipation",
        "Treat infections",
      ],
      correct: "Treat depression and anxiety",
    },
    {
      question:
        "What is the action of H2 receptor antagonists like ranitidine?",
      options: [
        "Reduce stomach acid",
        "Increase heart rate",
        "Relieve pain",
        "Prevent seizures",
      ],
      correct: "Reduce stomach acid",
    },
    {
      question: "Which drug class is used to treat osteoporosis?",
      options: ["Bisphosphonates", "Antihistamines", "Diuretics", "Antivirals"],
      correct: "Bisphosphonates",
    },
    {
      question:
        "What is a common side effect of angiotensin II receptor blockers (ARBs) like losartan?",
      options: ["Dizziness", "Hair growth", "Fever", "Weight loss"],
      correct: "Dizziness",
    },
    {
      question:
        "Which federal regulation mandates patient counseling for new prescriptions?",
      options: ["OBRA-90", "HIPAA", "FDCA", "PPPA"],
      correct: "OBRA-90",
    },
    {
      question: "Which form is used to register a pharmacy with the DEA?",
      options: ["DEA Form 224", "DEA Form 41", "DEA Form 510", "DEA Form 363"],
      correct: "DEA Form 224",
    },
    {
      question:
        "Which schedule includes drugs with the lowest abuse potential?",
      options: ["Schedule I", "Schedule II", "Schedule III", "Schedule V"],
      correct: "Schedule V",
    },
    {
      question: "What is the purpose of a drug utilization review (DUR)?",
      options: [
        "Track drug prices",
        "Ensure appropriate medication use",
        "Monitor staff schedules",
        "Reduce inventory",
      ],
      correct: "Ensure appropriate medication use",
    },
    {
      question:
        "Which auxiliary label is required for tetracycline antibiotics?",
      options: [
        "Take with food",
        "Avoid sunlight",
        "May cause drowsiness",
        "Shake well",
      ],
      correct: "Avoid sunlight",
    },
    {
      question:
        "What is the correct protocol for handling a spilled hazardous drug?",
      options: [
        "Wipe with water",
        "Use a spill kit",
        "Vacuum the area",
        "Ignore it",
      ],
      correct: "Use a spill kit",
    },
    {
      question:
        "A prescription reads 'Ranitidine 150 mg po qhs × 30 days.' How many tablets are needed?",
      options: ["15", "30", "60", "90"],
      correct: "30",
    },
    {
      question: "What does the abbreviation 'qid' mean on a prescription?",
      options: ["Once daily", "Twice daily", "Four times daily", "As needed"],
      correct: "Four times daily",
    },
    {
      question:
        "What is the purpose of a Medication Therapy Management (MTM) service?",
      options: [
        "Adjust drug prices",
        "Optimize patient medication use",
        "Track inventory",
        "Verify insurance",
      ],
      correct: "Optimize patient medication use",
    },
    {
      question:
        "How many milliliters are needed for a 1% solution containing 5 grams of active ingredient?",
      options: ["100 mL", "200 mL", "500 mL", "1000 mL"],
      correct: "500 mL",
    },
    {
      question: "Which test can pharmacies perform under CLIA-waived status?",
      options: [
        "Blood glucose testing",
        "MRI scans",
        "DNA sequencing",
        "X-ray imaging",
      ],
      correct: "Blood glucose testing",
    },
    {
      question: "What is the primary use of antibiotics?",
      options: [
        "Treat viral infections",
        "Treat bacterial infections",
        "Reduce pain",
        "Lower cholesterol",
      ],
      correct: "Treat bacterial infections",
    },
    {
      question: "What is the action of antipyretics?",
      options: [
        "Reduce fever",
        "Relieve pain",
        "Treat allergies",
        "Lower blood pressure",
      ],
      correct: "Reduce fever",
    },
    {
      question: "Which route of drug administration is not a parenteral route?",
      options: ["Rectal", "Intravenous", "Intramuscular", "All of the above"],
      correct: "Rectal",
    },
    {
      question: "Which route is least likely to give systemic effects?",
      options: ["Oral", "Sublingual", "Topical", "Intravenous"],
      correct: "Topical",
    },
    {
      question: "An antagonist will...",
      options: [
        "Not bind to a receptor",
        "Prevent other drugs from binding to a receptor",
        "Accelerate a normal body process",
        "Cause extended stimulation of receptors",
      ],
      correct: "Prevent other drugs from binding to a receptor",
    },
    {
      question: "Which of the following is due to immunological response?",
      options: [
        "Side effect",
        "Depression",
        "Hypersensitivity",
        "Therapeutic effect",
      ],
      correct: "Hypersensitivity",
    },
    {
      question: "Which of the following is an antibacterial agent?",
      options: ["Acyclovir", "Amlodipine", "Ibuprofen", "Clarithromycin"],
      correct: "Clarithromycin",
    },
    {
      question: "Clarithromycin is an antibacterial drug.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "An antagonist enhances the action of other drugs.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Topical drugs are likely to give systemic effects.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question:
        "Intravenous drug administration is considered a parenteral route.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Hypersensitivity is a type of therapeutic effect.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Antacids help manage ulcers due to their:",
      options: [
        "Systemic effect",
        "Ability to prevent ulcer",
        "Local effect of acid neutralization",
        "Ability to bind to proton pump",
      ],
      correct: "Local effect of acid neutralization",
    },
    {
      question: "What group of drug is erythromycin?",
      options: ["Macrolides", "Penicillins", "Aminoglycosides", "Antifungals"],
      correct: "Macrolides",
    },
    {
      question: "All of these affect absorption except:",
      options: ["Molecular size", "pH", "Humidity", "Surface area"],
      correct: "Humidity",
    },
    {
      question: "An example of histamine antagonist is:",
      options: ["Omeprazole", "Paracetamol", "Loratadine", "Hyoscine"],
      correct: "Loratadine",
    },
    {
      question: "Which of these is NOT a malaria medication?",
      options: ["Artesunate", "Chloramphenicol", "Quinine", "Halofan"],
      correct: "Chloramphenicol",
    },
    {
      question: "Humidity affects the absorption rate of drugs.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Loratadine is a histamine antagonist.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Artesunate is an antibiotic.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Macrolides include erythromycin.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Antacids work systemically to heal ulcers.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "What is the generic name of a drug also known as?",
      options: [
        "Non proprietary name",
        "Proprietary name",
        "Synthetic name",
        "Brand name",
      ],
      correct: "Non proprietary name",
    },
    {
      question: "Amoxicillin and Ampiclox belong to which class?",
      options: [
        "Penicillins",
        "Cephalosporins",
        "Aminoglycosides",
        "Antiprotozoals",
      ],
      correct: "Penicillins",
    },
    {
      question: "What is another name for antineoplastic drugs?",
      options: ["Anticancer", "Antituberculosis", "Antiangina", "Diuretics"],
      correct: "Anticancer",
    },
    {
      question:
        "Which of the following is an advantage of oral drug administration?",
      options: [
        "Gastrointestinal upset",
        "Ease of administration",
        "Drug-food interaction",
        "Fast onset of action",
      ],
      correct: "Ease of administration",
    },
    {
      question: "Which form is prepared to mask the unpleasant taste of drugs?",
      options: ["Syrup", "Paste", "Gel", "Suspension"],
      correct: "Syrup",
    },
    {
      question: "The brand name and generic name of a drug are the same.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Amoxicillin is a cephalosporin.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Antineoplastic drugs are used to treat cancer.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Ease of administration is a key advantage of the oral route.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Suspensions are used to enhance the drug's taste.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Drugs used to treat schizophrenia and mania are called:",
      options: [
        "Antiepileptic agents",
        "Antipsychotic agents",
        "Antispasmodic agents",
        "Antihelminthic agents",
      ],
      correct: "Antipsychotic agents",
    },
    {
      question: "What is true of drug contraindication?",
      options: [
        "It is a reason a drug should not be used",
        "It is the same as a side effect",
        "It enhances drug absorption",
        "It is a synonym for tolerance",
      ],
      correct: "It is a reason a drug should not be used",
    },
    {
      question: "Which of the following is NOT an anti-infective drug?",
      options: [
        "Antibacterial",
        "Antiviral",
        "Antiinflammatory",
        "Antiprotozoal",
      ],
      correct: "Antiinflammatory",
    },
    {
      question: "Contraceptives are used for:",
      options: [
        "HIV/AIDS control",
        "Birth control",
        "Diabetes control",
        "STI prevention",
      ],
      correct: "Birth control",
    },
    {
      question: "Vitamin K is needed in the body for:",
      options: [
        "Antipyretic activity",
        "Antidiabetic effect",
        "Anticoagulant properties",
        "Platelet formation",
      ],
      correct: "Platelet formation",
    },
    {
      question: "Contraceptives are used for malaria treatment.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Vitamin K supports blood clotting processes.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Antipsychotics treat anxiety and infections.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Contraindications indicate a drug should not be used.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Antiviral drugs are anti-infective agents.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Which type of medication is used to relieve pain?",
      options: ["Antipyretics", "Analgesics", "Antihistamines", "Antifungals"],
      correct: "Analgesics",
    },
    {
      question: "Which is not a natural source of drugs?",
      options: ["Plant", "Animal", "Mineral", "Synthetic"],
      correct: "Synthetic",
    },
    {
      question: "Which of the following is not an antifungal?",
      options: [
        "Itraconazole",
        "Griseofulvin",
        "Terbinafine",
        "Nitrofurantoin",
      ],
      correct: "Nitrofurantoin",
    },
    {
      question: "Albendazole belongs to which drug group?",
      options: [
        "Antibacterial",
        "Anthelmintics",
        "Antidiarrheal",
        "Antiprotozoal",
      ],
      correct: "Anthelmintics",
    },
    {
      question: "Analgesics are used to induce vomiting.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Generic name is also called the non-proprietary name.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Nitrofurantoin is commonly used as an antifungal.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Albendazole is an anti-parasitic drug.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Minerals can serve as natural drug sources.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Proton pump inhibitors are used to:",
      options: [
        "Prevent heartburn",
        "Treat cough",
        "Treat chest pain",
        "Act as anticancer drugs",
      ],
      correct: "Prevent heartburn",
    },
    {
      question: "Which drug gives immediate relief in asthma?",
      options: [
        "Prednisolone",
        "Ibuprofen",
        "Salbutamol inhaler",
        "Bromazepam",
      ],
      correct: "Salbutamol inhaler",
    },
    {
      question: "What is the correct definition of pharmacology?",
      options: [
        "Study of drugs in non-living organisms",
        "Study of drugs and their effects on living systems",
        "Study of chemical reactions",
        "Study of plant extracts",
      ],
      correct: "Study of drugs and their effects on living systems",
    },
    {
      question: "What is metabolism in pharmacology?",
      options: [
        "Elimination by kidney",
        "Biotransformation of drugs",
        "Distribution of drugs",
        "Absorption of drugs",
      ],
      correct: "Biotransformation of drugs",
    },
    {
      question: "ACTs are used to treat:",
      options: ["HIV/AIDS", "Typhoid", "Malaria", "Tuberculosis"],
      correct: "Malaria",
    },
    {
      question: "Pharmacology only studies chemicals in plants.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Metabolism is part of pharmacokinetics.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Which of the following is NOT an NRTI?",
      options: ["Emtricitabine", "Efavirenz", "Lamivudine", "Zidovudine"],
      correct: "Efavirenz",
    },
    {
      question: "Which of the following is NOT a protease inhibitor?",
      options: ["Atazanavir", "Darunavir", "Nevirapine", "Indinavir"],
      correct: "Nevirapine",
    },
    {
      question: "Infuvirtide and Cobicistat are examples of:",
      options: [
        "Entry inhibitors",
        "Integrase inhibitors",
        "Nucleotide reverse transcriptase inhibitors",
        "None of the above",
      ],
      correct: "Entry inhibitors",
    },
    {
      question:
        "An important factor for drug treatment failure in HIV/AIDS despite free availability is:",
      options: [
        "Affordability problem",
        "Adherence problem",
        "Drug availability problem",
        "All of the above",
      ],
      correct: "Adherence problem",
    },
    {
      question: "The principal sources of pharmaceutical product waste are:",
      options: [
        "Animal and human excretion",
        "Wastewater of pharmaceutical industry",
        "Effluents from hospitals",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which is the most desirable blood pressure (taken as average of 2 consecutive measurements at one point in time)?",
      options: [
        "180/110 mmHg",
        "140/80 mmHg",
        "130/90 mmHg",
        "120/80 mmHg",
        "80/60 mmHg",
      ],
      correct: "120/80 mmHg",
    },
    {
      question: "Select the true statement from the following:",
      options: [
        "The older we get, the greater is our risk to develop high blood pressure.",
        "Hypertension shows symptoms in most people.",
        "Hypertension is inherited so the best way is to take medicines.",
        "Sea salt contains lots of mineral so it is good for hypertension.",
        "Being overweight is not related to hypertension.",
      ],
      correct:
        "The older we get, the greater is our risk to develop high blood pressure.",
    },
    {
      question: "DDA is an act that regulates the following:",
      options: [
        "Manufacture, sales and business in narcotic drugs",
        "Manufacture, sales, use and management of narcotic drugs",
        "Manufacture, sales, use and importation of narcotic drugs",
        "Manufacture, sales and use as well as prescription and supply of narcotics to the public",
      ],
      correct:
        "Manufacture, sales and use as well as prescription and supply of narcotics to the public",
    },
    {
      question:
        "The following category of people cannot fall victim of drug addiction:",
      options: ["Doctors", "Pharmacists", "Nurses", "None of the above"],
      correct: "None of the above",
    },
    {
      question: "The drugs which are today under international control are:",
      options: [
        "Cocaine",
        "Heroin",
        "Cannabis",
        "Narcotics and psychotropic agents",
      ],
      correct: "Narcotics and psychotropic agents",
    },
    {
      question:
        "One of the following is NOT among the controls placed on narcotic drugs:",
      options: [
        "Government authorization is required",
        "All participants must keep record of the trade",
        "All trades must be limited to medical and scientific purpose",
        "Medical prescription is not required for supply and dispensing of the drugs",
      ],
      correct:
        "Medical prescription is not required for supply and dispensing of the drugs",
    },
    {
      question:
        "The following category of people cannot handle narcotics EXCEPT:",
      options: [
        "Doctors",
        "Physiotherapists",
        "Pharmacy technicians",
        "Nurses",
      ],
      correct: "Doctors",
    },
    {
      question: "Poisons can be stored in the following containers EXCEPT:",
      options: [
        "A special room or cupboard",
        "Shifted bottle capped differently from other bottles",
        "Bottles referenced in the BNF",
        "Containers without labels",
      ],
      correct: "Containers without labels",
    },
    {
      question: "Narcotic drugs are dispensed and supplied by:",
      options: ["Pharmacists", "Pharmacy technicians", "Doctors", "Nurses"],
      correct: "Pharmacists",
    },
    {
      question: "An example of a narcotic drug is:",
      options: ["Cocaine", "Amphetamine", "Diazepam", "Phenobarbitone"],
      correct: "Cocaine",
    },
    {
      question:
        "The right label when dispensing narcotics includes all EXCEPT:",
      options: [
        "Name and strength of the drug",
        "Signature of the dispenser",
        "Address of the dispenser",
        "Address of the importer",
      ],
      correct: "Address of the importer",
    },
    {
      question: "One of the following is NOT true about NAFDAC:",
      options: [
        "Controls food, drugs and pharmaceuticals only",
        "Controls table water",
        "Controls importation and exportation of drugs",
        "Was enacted by law in the country",
      ],
      correct: "Controls food, drugs and pharmaceuticals only",
    },
    {
      question: "Which of the following is a protease inhibitor?",
      options: ["Efavirenz", "Zidovudine", "Indinavir", "Abacavir"],
      correct: "Indinavir",
    },
    {
      question:
        "Which antiretroviral class includes Lamivudine and Zidovudine?",
      options: ["NNRTI", "NRTI", "Integrase inhibitor", "Entry inhibitor"],
      correct: "NRTI",
    },
    {
      question: "Which is NOT a class of antiretroviral drugs?",
      options: ["NNRTI", "NRTI", "Integrase inhibitor", "Antihistamines"],
      correct: "Antihistamines",
    },
    {
      question: "Which of these is not a NNRTI?",
      options: ["Flavignz", "Abacavir", "Efavirenz", "Nevirapine"],
      correct: "Abacavir",
    },
    {
      question: "Which of these is not an NRTI?",
      options: ["Emtricitabine", "Efavirenz", "Lamivudine", "Zidovudine"],
      correct: "Efavirenz",
    },
    {
      question: "Which of these is not a protease inhibitor?",
      options: ["Atazanavir", "Darunavir", "Nevirapine", "Indinavir"],
      correct: "Nevirapine",
    },
    {
      question: "Infuvirtide and Cobicistat are examples of:",
      options: [
        "Entry inhibitor",
        "Integrase inhibitor",
        "Nucleotide reverse transcriptase inhibitor",
        "None of the above",
      ],
      correct: "Entry inhibitor",
    },
    {
      question:
        "An important factor for drug treatment failure in HIV/AIDS despite drug availability at no cost is:",
      options: [
        "Affordability problem",
        "Adherence problem",
        "Drug availability problem",
        "All of the above",
      ],
      correct: "Adherence problem",
    },
    {
      question: "The principal sources of pharmaceutical product waste are:",
      options: [
        "Animal and human excretion",
        "Wastewater of pharmaceutical industry",
        "Effluents from hospitals",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Proper disposal of pharmaceutical waste is best done by:",
      options: [
        "Burning",
        "Burying",
        "Open dumping",
        "Burning and burying only",
      ],
      correct: "Burning and burying only",
    },
    {
      question:
        "The government regulatory body that controls proper disposal of pharmaceutical waste is:",
      options: ["NAFDAC", "NESREA", "Only NAFDAC", "Both NAFDAC and NESREA"],
      correct: "Both NAFDAC and NESREA",
    },
    {
      question: "Pollution from pharmaceutical industries is in the form of:",
      options: [
        "Noise",
        "Exhaust from engines",
        "Wastewater",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "The use of incinerators is applicable to wastes that are meant to be:",
      options: [
        "Dumped into the rivers",
        "Buried underground",
        "Burnt",
        "All of the above",
      ],
      correct: "Burnt",
    },
    {
      question:
        "What is the primary use of antispasmodics like hyoscine butylbromide?",
      options: [
        "Relieve abdominal cramps",
        "Lower blood pressure",
        "Treat asthma",
        "Prevent seizures",
      ],
      correct: "Relieve abdominal cramps",
    },
    {
      question:
        "Which drug class is used to manage attention deficit hyperactivity disorder (ADHD)?",
      options: ["Stimulants", "Antipyretics", "Antibiotics", "Antihistamines"],
      correct: "Stimulants",
    },
    {
      question:
        "What is a common side effect of nonsteroidal anti-inflammatory drugs (NSAIDs) like diclofenac?",
      options: ["Stomach irritation", "Hair growth", "Weight loss", "Fever"],
      correct: "Stomach irritation",
    },
    {
      question:
        "Which Nigerian agency is responsible for seizing counterfeit medicines?",
      options: ["NDLEA", "NAFDAC", "PCN", "NIPRD"],
      correct: "NAFDAC",
    },
    {
      question: "What is the purpose of NAFDAC’s Truscan device in Nigeria?",
      options: [
        "Track drug prices",
        "Detect substandard drugs",
        "Monitor pharmacy staff",
        "License pharmacists",
      ],
      correct: "Detect substandard drugs",
    },
    {
      question:
        "Which schedule of drugs in Nigeria includes cannabis and heroin?",
      options: ["Schedule I", "Schedule III", "Schedule V", "Over-the-counter"],
      correct: "Schedule I",
    },
    {
      question:
        "What should a pharmacy technician do when handling a prescription for a narcotic drug?",
      options: [
        "Dispense without verification",
        "Verify with the pharmacist",
        "Adjust the dose",
        "Ignore the prescription",
      ],
      correct: "Verify with the pharmacist",
    },
    {
      question:
        "What is the correct storage temperature for hepatitis B vaccines?",
      options: [
        "Room temperature",
        "2-8°C refrigeration",
        "Freezer at -20°C",
        "Above 25°C",
      ],
      correct: "2-8°C refrigeration",
    },
    {
      question:
        "A prescription reads 'Sulfadoxine-pyrimethamine 500/25 mg po stat.' How many tablets are needed?",
      options: ["1", "2", "3", "4"],
      correct: "1",
    },
    {
      question: "What does the abbreviation 'stat' mean on a prescription?",
      options: ["Immediately", "Twice daily", "At bedtime", "As needed"],
      correct: "Immediately",
    },
    {
      question:
        "What is the primary use of antileprotic drugs like dapsone in Nigeria?",
      options: [
        "Treat leprosy",
        "Relieve pain",
        "Lower cholesterol",
        "Treat fungal infections",
      ],
      correct: "Treat leprosy",
    },
    {
      question: "What is the action of alpha-2 agonists like clonidine?",
      options: [
        "Lower blood pressure",
        "Relieve pain",
        "Treat infections",
        "Reduce fever",
      ],
      correct: "Lower blood pressure",
    },
    {
      question: "Which drug is used to manage severe allergic reactions?",
      options: ["Adrenaline", "Fluconazole", "Amoxicillin", "Paracetamol"],
      correct: "Adrenaline",
    },
    {
      question:
        "What is the primary action of osmotic laxatives like lactulose?",
      options: [
        "Soften stool",
        "Relieve pain",
        "Reduce fever",
        "Treat infections",
      ],
      correct: "Soften stool",
    },
    {
      question: "Which drug class is used to treat multiple sclerosis?",
      options: [
        "Immunomodulators",
        "Antipyretics",
        "Antibiotics",
        "Antihistamines",
      ],
      correct: "Immunomodulators",
    },
    {
      question: "What is a common side effect of biguanides like metformin?",
      options: ["Diarrhea", "Hair growth", "Fever", "Weight gain"],
      correct: "Diarrhea",
    },
    {
      question:
        "Which Nigerian regulation requires pharmacies to keep records of controlled substances?",
      options: ["Pharmacy Act", "Dangerous Drugs Act", "NAFDAC Act", "PCN Act"],
      correct: "Dangerous Drugs Act",
    },
    {
      question:
        "What is the purpose of NAFDAC’s Clean Report of Inspection and Analysis (CRIA)?",
      options: [
        "Track drug prices",
        "Certify imported drugs",
        "License pharmacists",
        "Monitor drug trafficking",
      ],
      correct: "Certify imported drugs",
    },
    {
      question: "Which drug is used to manage opioid overdose?",
      options: ["Naloxone", "Metformin", "Atenolol", "Fluconazole"],
      correct: "Naloxone",
    },
    {
      question:
        "What is the action of mast cell stabilizers like sodium cromoglicate?",
      options: [
        "Prevent allergic reactions",
        "Reduce stomach acid",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Prevent allergic reactions",
    },
    {
      question: "Which drug class is used to manage bipolar disorder?",
      options: [
        "Mood stabilizers",
        "Antihistamines",
        "Antipyretics",
        "Antibiotics",
      ],
      correct: "Mood stabilizers",
    },
    {
      question:
        "What is a common side effect of antiepileptics like carbamazepine?",
      options: ["Drowsiness", "Hair growth", "Weight loss", "Fever"],
      correct: "Drowsiness",
    },
    {
      question:
        "Which agency in Nigeria enforces laws against illicit drug trafficking?",
      options: ["NAFDAC", "NDLEA", "PCN", "NIPRD"],
      correct: "NDLEA",
    },
    {
      question: "What is the primary use of fibrates like fenofibrate?",
      options: [
        "Lower triglycerides",
        "Relieve pain",
        "Treat infections",
        "Reduce fever",
      ],
      correct: "Lower triglycerides",
    },
    {
      question:
        "What is the action of leukotriene inhibitors like montelukast?",
      options: [
        "Reduce airway inflammation",
        "Relieve pain",
        "Treat infections",
        "Lower blood pressure",
      ],
      correct: "Reduce airway inflammation",
    },
    {
      question: "Which drug is used to treat schistosomiasis in Nigeria?",
      options: ["Praziquantel", "Ciprofloxacin", "Paracetamol", "Metformin"],
      correct: "Praziquantel",
    },
    {
      question: "What is the primary action of vasopressors like dopamine?",
      options: [
        "Increase blood pressure",
        "Reduce inflammation",
        "Relieve pain",
        "Treat infections",
      ],
      correct: "Increase blood pressure",
    },
    {
      question:
        "Which drug class is used to manage chronic kidney disease anemia?",
      options: [
        "Erythropoiesis-stimulating agents",
        "Antibiotics",
        "Antipyretics",
        "Antihistamines",
      ],
      correct: "Erythropoiesis-stimulating agents",
    },
    {
      question:
        "What is a common side effect of antifungals like ketoconazole?",
      options: ["Liver toxicity", "Hair growth", "Fever", "Weight loss"],
      correct: "Liver toxicity",
    },
    {
      question:
        "Which Nigerian agency oversees the training of pharmacy technicians?",
      options: ["NAFDAC", "NDLEA", "PCN", "NIPRD"],
      correct: "PCN",
    },
    {
      question: "What is the primary use of antimuscarinics like tolterodine?",
      options: [
        "Manage overactive bladder",
        "Treat infections",
        "Reduce fever",
        "Relieve pain",
      ],
      correct: "Manage overactive bladder",
    },
    {
      question:
        "What is the action of carbonic anhydrase inhibitors like acetazolamide?",
      options: [
        "Reduce intraocular pressure",
        "Relieve pain",
        "Treat infections",
        "Lower blood pressure",
      ],
      correct: "Reduce intraocular pressure",
    },
    {
      question: "Which drug is used to manage menopausal symptoms?",
      options: [
        "Conjugated estrogens",
        "Ciprofloxacin",
        "Paracetamol",
        "Metformin",
      ],
      correct: "Conjugated estrogens",
    },
    {
      question:
        "What is the primary action of tocolytics like nifedipine in obstetrics?",
      options: [
        "Prevent preterm labor",
        "Reduce fever",
        "Treat infections",
        "Relieve pain",
      ],
      correct: "Prevent preterm labor",
    },
    {
      question: "Which drug class is used to manage opioid dependence?",
      options: [
        "Opioid agonists",
        "Antibiotics",
        "Antipyretics",
        "Antihistamines",
      ],
      correct: "Opioid agonists",
    },
    {
      question: "What is a common side effect of antivirals like acyclovir?",
      options: ["Nausea", "Hair growth", "Fever", "Weight gain"],
      correct: "Nausea",
    },
    {
      question:
        "What is the purpose of NAFDAC’s Good Manufacturing Practice (GMP) inspections?",
      options: [
        "Track drug prices",
        "Ensure quality production",
        "License pharmacists",
        "Control drug trafficking",
      ],
      correct: "Ensure quality production",
    },
    {
      question:
        "The best drug distribution system for hospital in-patients is:",
      options: [
        "Complete ward stock",
        "Unit dose dispensing system",
        "Individual order prescription",
        "All of the above",
      ],
      correct: "Unit dose dispensing system",
    },
    {
      question:
        "Which of the following is NOT a correct label requirement when dispensing narcotics?",
      options: [
        "Name and strength of the drug",
        "Signature of the dispenser",
        "Address of the dispenser",
        "Address of the importer",
      ],
      correct: "Address of the importer",
    },
    {
      question:
        "Which of the following is not among the controls placed on narcotic drugs?",
      options: [
        "Government authorization is required",
        "All participants must keep record of the trade",
        "Trades in narcotics must be for medical and scientific purposes only",
        "Medical prescription is not required for supply and dispensing of the drugs",
      ],
      correct:
        "Medical prescription is not required for supply and dispensing of the drugs",
    },
    {
      question: "DDA is an act that regulates:",
      options: [
        "Manufacture, sales and business in narcotic drugs",
        "Manufacture, sales, use and management of narcotic drugs",
        "Manufacture, sales, use and importation of narcotic drugs",
        "Manufacture, sales, use, prescription and supply of narcotics to the public",
      ],
      correct:
        "Manufacture, sales, use, prescription and supply of narcotics to the public",
    },
    {
      question: "Narcotic drugs are dispensed and supplied by:",
      options: ["Pharmacists", "Pharmacy technicians", "Doctors", "Nurses"],
      correct: "Pharmacists",
    },
    {
      question: "Example of a narcotic drug is:",
      options: ["Cocaine", "Amphetamine", "Diazepam", "Phenobarbitone"],
      correct: "Cocaine",
    },
    {
      question: "NAFDAC is responsible for the following EXCEPT:",
      options: [
        "Controlling food, drugs and pharmaceuticals only",
        "Controlling table water",
        "Controlling importation and exportation of drugs",
        "Enacted by law in the country",
      ],
      correct: "Controlling food, drugs and pharmaceuticals only",
    },
    {
      question:
        "The following category of people cannot fall victim of drug addiction:",
      options: ["Doctors", "Pharmacists", "Nurses", "None of the above"],
      correct: "None of the above",
    },
    {
      question:
        "Which of the following is NOT a component of a sound drug policy?",
      options: [
        "Clearly defined objectives",
        "Strategic development",
        "Maximization of profit",
        "Clearly set priorities",
      ],
      correct: "Maximization of profit",
    },
    {
      question:
        "The drugs which are today under international control include:",
      options: [
        "Cocaine",
        "Heroin",
        "Cannabis",
        "Narcotics and psychotropic agents",
      ],
      correct: "Narcotics and psychotropic agents",
    },
    {
      question:
        "Which DEA schedule contains drugs with no accepted medical use and a high potential for abuse?",
      options: ["Schedule I", "Schedule II", "Schedule III", "Schedule IV"],
      correct: "Schedule I",
    },
    {
      question: "How many refills are allowed for a Schedule III medication?",
      options: [
        "None",
        "Up to 5 within 6 months",
        "Unlimited",
        "Up to 3 within 12 months",
      ],
      correct: "Up to 5 within 6 months",
    },
    {
      question: "What is the primary function of the PTCB?",
      options: [
        "To license pharmacists",
        "To regulate drug manufacturers",
        "To certify pharmacy technicians",
        "To approve pharmacy school curricula",
      ],
      correct: "To certify pharmacy technicians",
    },
    {
      question: "What does the abbreviation 'q6h' mean on a prescription?",
      options: [
        "Take every 6 hours",
        "Take four times a day",
        "Take with food",
        "Take at bedtime",
      ],
      correct: "Take every 6 hours",
    },
    {
      question:
        "Which of the following medications requires the auxiliary label 'May cause drowsiness'?",
      options: ["Diphenhydramine", "Amoxicillin", "Metformin", "Lisinopril"],
      correct: "Diphenhydramine",
    },
    {
      question:
        "Which law required child-resistant packaging for most prescription drugs?",
      options: [
        "Kefauver-Harris Amendment",
        "Durham-Humphrey Amendment",
        "Poison Prevention Packaging Act",
        "Controlled Substances Act",
      ],
      correct: "Poison Prevention Packaging Act",
    },
    {
      question:
        "A patient brings in a prescription for 'amoxicillin 500 mg po tid × 10 days.' How many capsules should be dispensed?",
      options: ["20", "30", "40", "10"],
      correct: "30",
    },
    {
      question:
        "Which of the following is a common side effect of statins such as atorvastatin?",
      options: ["Muscle pain", "Drowsiness", "Weight gain", "Dry mouth"],
      correct: "Muscle pain",
    },
    {
      question: "The Red Book is used primarily for:",
      options: [
        "Identifying therapeutic equivalents",
        "Drug pricing and reimbursement",
        "Detecting drug interactions",
        "Compounding formulas",
      ],
      correct: "Drug pricing and reimbursement",
    },
    {
      question:
        "Which of the following routes of administration is considered parenteral?",
      options: ["Oral", "Topical", "Intravenous", "Sublingual"],
      correct: "Intravenous",
    },
    {
      question: "Suppositories are administered via which route?",
      options: ["Rectal", "Sublingual", "Subcutaneous", "Intramuscular"],
      correct: "Rectal",
    },
    {
      question: "Ophthalmic preparations are meant for:",
      options: ["Nose", "Ear", "Eye", "Mouth"],
      correct: "Eye",
    },
    {
      question: "The location where a drug produces its effect is called:",
      options: [
        "Absorption site",
        "Metabolism site",
        "Site of action",
        "Toxic window",
      ],
      correct: "Site of action",
    },
    {
      question: "Efavirenz is used in managing HIV/AIDS.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Suppositories are only used orally.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Gentamycin is a common antiretroviral.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question:
        "Modified release tablets can also be called prolonged release.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Ophthalmic drugs are applied to the eyes.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Which is an example of an antihypertensive drug?",
      options: ["Ampiclox", "Acyclovir", "Atenolol", "Ketoconazole"],
      correct: "Atenolol",
    },
    {
      question: "Which is an example of an anthelmintic?",
      options: ["Albendazole", "Ofloxacin", "Omeprazole", "Secnidazole"],
      correct: "Albendazole",
    },
    {
      question: "Which of these is an antifungal?",
      options: ["Ciprofloxacin", "Itraconazole", "Metronidazole", "Artesunate"],
      correct: "Itraconazole",
    },
    {
      question: "Which of the following is NOT used to manage diabetes?",
      options: [
        "Metformin",
        "Glibenclamide",
        "Chlorpropamide",
        "Glucose tablet",
      ],
      correct: "Glucose tablet",
    },
    {
      question: "Side effects are best defined as:",
      options: [
        "Adverse effects",
        "Therapeutic effects",
        "Pharmacologic extensions",
        "Beneficial responses",
      ],
      correct: "Pharmacologic extensions",
    },
    {
      question: "Albendazole is used to treat worm infections.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Atenolol is an antifungal medication.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Metformin is used to manage diabetes.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Side effects are intended therapeutic outcomes.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Glucose tablets help lower blood sugar.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "What are anticancer drugs also called?",
      options: [
        "Antineoplastics",
        "Antibiotics",
        "Antidiabetics",
        "Antimalarials",
      ],
      correct: "Antineoplastics",
    },
    {
      question: "What class of drug is Furosemide?",
      options: ["Diuretic", "Antibiotic", "Analgesic", "Corticosteroid"],
      correct: "Diuretic",
    },
    {
      question: "Receptor affinity refers to:",
      options: [
        "A drug's ability to bind a receptor",
        "The drug’s solubility",
        "Receptor size",
        "Drug metabolism",
      ],
      correct: "A drug's ability to bind a receptor",
    },
    {
      question: "Which of the following is NOT an organ for drug elimination?",
      options: ["Kidney", "Liver", "Lungs", "Nose"],
      correct: "Nose",
    },
    {
      question: "Which sentence is correct?",
      options: [
        "Small molecule drugs are better for oral systemic effect",
        "Large molecules absorb faster",
        "Olive oil is from animals",
        "Cod liver oil is plant-based",
      ],
      correct: "Small molecule drugs are better for oral systemic effect",
    },
    {
      question: "Antineoplastic drugs are used to manage cancer.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Furosemide is a type of diuretic.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "The nose is a common route for drug elimination.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Receptor affinity is the drug's ability to bind its receptor.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Olive oil is an animal source.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Addiction is characterized by all except:",
      options: ["Withdrawal", "Tolerance", "Compliance", "Dependence"],
      correct: "Compliance",
    },
    {
      question: "What is the proprietary name of a drug also called?",
      options: [
        "Brand name",
        "Generic name",
        "Non-brand name",
        "Chemical name",
      ],
      correct: "Brand name",
    },
    {
      question: "Pharmacokinetics involves all except:",
      options: [
        "Absorption",
        "Distribution",
        "Therapeutic effect",
        "Elimination",
      ],
      correct: "Therapeutic effect",
    },
    {
      question: "The desired action of a drug is its:",
      options: [
        "Therapeutic effect",
        "Toxic effect",
        "Side effect",
        "Withdrawal",
      ],
      correct: "Therapeutic effect",
    },
    {
      question: "How many types of laxatives exist?",
      options: ["2", "3", "4", "5"],
      correct: "5",
    },
    {
      question: "Addiction includes compliance with medication.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Generic name is the same as proprietary name.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Pharmacokinetics includes drug metabolism and excretion.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Therapeutic effect is the desired action of a drug.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "There are five types of laxatives.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "What is the primary action of antihistamines?",
      options: [
        "Reduce inflammation",
        "Block histamine receptors",
        "Lower blood sugar",
        "Increase heart rate",
      ],
      correct: "Block histamine receptors",
    },
    {
      question: "Which route of administration bypasses the digestive system?",
      options: ["Oral", "Rectal", "Transdermal", "Sublingual"],
      correct: "Sublingual",
    },
    {
      question: "Which route provides the fastest systemic absorption?",
      options: ["Intravenous", "Oral", "Topical", "Inhalation"],
      correct: "Intravenous",
    },
    {
      question: "An agonist will...",
      options: [
        "Block a receptor",
        "Stimulate a receptor",
        "Prevent drug absorption",
        "Increase drug elimination",
      ],
      correct: "Stimulate a receptor",
    },
    {
      question: "Proton pump inhibitors work by:",
      options: [
        "Neutralizing stomach acid",
        "Reducing acid production",
        "Increasing acid production",
        "Blocking histamine",
      ],
      correct: "Reducing acid production",
    },
    {
      question: "What class of drug is azithromycin?",
      options: ["Tetracyclines", "Macrolides", "Sulfonamides", "Antivirals"],
      correct: "Macrolides",
    },
    {
      question: "Which factor does NOT affect drug distribution in the body?",
      options: [
        "Blood flow",
        "Protein binding",
        "Temperature",
        "Tissue permeability",
      ],
      correct: "Temperature",
    },
    {
      question: "An example of a beta-blocker is:",
      options: ["Metoprolol", "Cetirizine", "Ranitidine", "Diazepam"],
      correct: "Metoprolol",
    },
    {
      question: "Which of these is NOT an antitubercular drug?",
      options: ["Isoniazid", "Rifampicin", "Ethambutol", "Ciprofloxacin"],
      correct: "Ciprofloxacin",
    },
    {
      question: "Temperature directly affects drug distribution in the body.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Metoprolol is a beta-blocker used for hypertension.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Isoniazid is used to treat malaria.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Azithromycin belongs to the macrolide class of antibiotics.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Proton pump inhibitors neutralize stomach acid directly.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "What is the chemical name of a drug?",
      options: [
        "Its trade name",
        "Its generic name",
        "Its molecular structure name",
        "Its brand name",
      ],
      correct: "Its molecular structure name",
    },
    {
      question: "Ceftriaxone belongs to which class of antibiotics?",
      options: ["Penicillins", "Cephalosporins", "Tetracyclines", "Macrolides"],
      correct: "Cephalosporins",
    },
    {
      question: "What is another name for antidiabetic drugs?",
      options: [
        "Hypoglycemics",
        "Antihypertensives",
        "Antipyretics",
        "Antifungals",
      ],
      correct: "Hypoglycemics",
    },
    {
      question:
        "Which of the following is a disadvantage of intravenous administration?",
      options: [
        "Rapid onset",
        "Risk of infection",
        "Ease of use",
        "Avoids first-pass metabolism",
      ],
      correct: "Risk of infection",
    },
    {
      question: "Which dosage form is designed for slow drug release?",
      options: ["Syrup", "Suspension", "Extended-release tablet", "Solution"],
      correct: "Extended-release tablet",
    },
    {
      question: "The chemical name and generic name of a drug are identical.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Ceftriaxone is a penicillin antibiotic.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Antidiabetic drugs are also known as hypoglycemics.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Intravenous administration poses a risk of infection.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Extended-release tablets provide immediate drug release.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Drugs used to treat epilepsy are called:",
      options: [
        "Antiepileptics",
        "Antidepressants",
        "Antihistamines",
        "Antipyretics",
      ],
      correct: "Antiepileptics",
    },
    {
      question: "What is true of drug tolerance?",
      options: [
        "It increases drug effectiveness",
        "It requires higher doses over time",
        "It prevents side effects",
        "It enhances absorption",
      ],
      correct: "It requires higher doses over time",
    },
    {
      question: "Which of the following is NOT an analgesic?",
      options: ["Paracetamol", "Ibuprofen", "Aspirin", "Lisinopril"],
      correct: "Lisinopril",
    },
    {
      question: "Diuretics are primarily used for:",
      options: [
        "Pain relief",
        "Blood pressure management",
        "Infection treatment",
        "Fever reduction",
      ],
      correct: "Blood pressure management",
    },
    {
      question: "Vitamin D is essential for:",
      options: [
        "Blood clotting",
        "Bone health",
        "Immune response",
        "Energy production",
      ],
      correct: "Bone health",
    },
    {
      question: "Diuretics are used to treat infections.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Vitamin D supports bone health by aiding calcium absorption.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Antiepileptics are used to manage seizures.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question:
        "Drug tolerance means a patient needs less of the drug over time.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Lisinopril is commonly used as an analgesic.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Which type of medication is used to reduce inflammation?",
      options: [
        "Antipyretics",
        "Antiinflammatories",
        "Antibiotics",
        "Antiviral",
      ],
      correct: "Antiinflammatories",
    },
    {
      question: "Which is a synthetic source of drugs?",
      options: [
        "Plant extract",
        "Animal product",
        "Laboratory synthesis",
        "Mineral deposit",
      ],
      correct: "Laboratory synthesis",
    },
    {
      question: "The drug name types include generic, brand, and:",
      options: [
        "Chemical name",
        "Biological name",
        "Synthetic name",
        "Trade name",
      ],
      correct: "Chemical name",
    },
    {
      question: "Which of the following is not an antiviral drug?",
      options: ["Acyclovir", "Zidovudine", "Fluconazole", "Ribavirin"],
      correct: "Fluconazole",
    },
    {
      question: "Mebendazole belongs to which drug group?",
      options: [
        "Anthelmintics",
        "Antibiotics",
        "Antifungals",
        "Antiprotozoals",
      ],
      correct: "Anthelmintics",
    },
    {
      question: "Antiinflammatories are used to treat bacterial infections.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Chemical name is one of the types of drug names.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Fluconazole is commonly used as an antiviral.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Mebendazole is used to treat worm infestations.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Synthetic drugs are produced in a laboratory.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "H2 receptor antagonists are used to:",
      options: [
        "Reduce stomach acid",
        "Treat asthma",
        "Lower blood pressure",
        "Relieve pain",
      ],
      correct: "Reduce stomach acid",
    },
    {
      question: "Which drug is commonly used to manage hypertension?",
      options: ["Amlodipine", "Prednisolone", "Fluconazole", "Salbutamol"],
      correct: "Amlodipine",
    },
    {
      question: "What is pharmacodynamics?",
      options: [
        "Study of drug movement",
        "Study of drug effects on the body",
        "Study of drug synthesis",
        "Study of drug elimination",
      ],
      correct: "Study of drug effects on the body",
    },
    {
      question: "What is excretion in pharmacology?",
      options: [
        "Drug absorption",
        "Drug distribution",
        "Drug elimination",
        "Drug metabolism",
      ],
      correct: "Drug elimination",
    },
    {
      question: "Which of these is NOT used to treat tuberculosis?",
      options: ["Pyrazinamide", "Streptomycin", "Levofloxacin", "Zidovudine"],
      correct: "Zidovudine",
    },
    {
      question: "Immediate-release tablets are designed to:",
      options: [
        "Release drug slowly",
        "Release drug quickly",
        "Mask taste",
        "Prevent absorption",
      ],
      correct: "Release drug quickly",
    },
    {
      question: "Inhalers are typically administered via which route?",
      options: ["Oral", "Inhalation", "Topical", "Intravenous"],
      correct: "Inhalation",
    },
    {
      question: "Otic preparations are meant for:",
      options: ["Eye", "Ear", "Nose", "Mouth"],
      correct: "Ear",
    },
    {
      question: "The process by which a drug enters the bloodstream is called:",
      options: ["Absorption", "Distribution", "Metabolism", "Excretion"],
      correct: "Absorption",
    },
    {
      question: "Zidovudine is used in the management of tuberculosis.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Inhalers are administered through the inhalation route.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Levofloxacin is a first-line drug for tuberculosis.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Immediate-release tablets release the drug rapidly.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Otic preparations are used for ear-related conditions.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Which is an example of an antiemetic drug?",
      options: ["Ondansetron", "Ciprofloxacin", "Atenolol", "Fluconazole"],
      correct: "Ondansetron",
    },
    {
      question: "Which is an example of an antiprotozoal drug?",
      options: ["Metronidazole", "Levothyroxine", "Ibuprofen", "Amlodipine"],
      correct: "Metronidazole",
    },
    {
      question: "Which of these is an antipyretic?",
      options: ["Paracetamol", "Ciprofloxacin", "Metronidazole", "Lisinopril"],
      correct: "Paracetamol",
    },
    {
      question: "Which of the following is NOT used to manage hypertension?",
      options: ["Lisinopril", "Amlodipine", "Losartan", "Salbutamol"],
      correct: "Salbutamol",
    },
    {
      question: "Adverse effects are best defined as:",
      options: [
        "Unintended harmful effects",
        "Therapeutic effects",
        "Desired effects",
        "Pharmacologic benefits",
      ],
      correct: "Unintended harmful effects",
    },
    {
      question: "Metronidazole is used to treat protozoal infections.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Ondansetron is an antihypertensive medication.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Paracetamol can reduce fever.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Adverse effects are the intended outcomes of a drug.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Salbutamol is used to manage hypertension.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "What are antiviral drugs also called?",
      options: [
        "Antiretrovirals",
        "Antibiotics",
        "Antifungals",
        "Antimalarials",
      ],
      correct: "Antiretrovirals",
    },
    {
      question: "What class of drug is Hydrochlorothiazide?",
      options: ["Diuretic", "Antibiotic", "Analgesic", "Antiviral"],
      correct: "Diuretic",
    },
    {
      question: "Drug potency refers to:",
      options: [
        "The drug's effectiveness",
        "The dose required for an effect",
        "The drug's solubility",
        "The drug's half-life",
      ],
      correct: "The dose required for an effect",
    },
    {
      question: "Which of the following is NOT a route of drug administration?",
      options: ["Oral", "Intravenous", "Sweat glands", "Topical"],
      correct: "Sweat glands",
    },
    {
      question: "Which statement is correct?",
      options: [
        "Large molecule drugs are ideal for inhalation",
        "Small molecule drugs are poor for systemic effects",
        "Castor oil is from plants",
        "Insulin is a mineral-based drug",
      ],
      correct: "Castor oil is from plants",
    },
    {
      question: "Antiviral drugs can be referred to as antiretrovirals.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Hydrochlorothiazide is a diuretic.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Sweat glands are a common route for drug administration.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Drug potency refers to the amount needed for an effect.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Castor oil is derived from a plant source.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Dependence is characterized by all except:",
      options: ["Craving", "Tolerance", "Adherence", "Withdrawal"],
      correct: "Adherence",
    },
    {
      question: "What is the trade name of a drug also called?",
      options: [
        "Generic name",
        "Brand name",
        "Chemical name",
        "Non-proprietary name",
      ],
      correct: "Brand name",
    },
    {
      question: "Pharmacodynamics involves all except:",
      options: [
        "Drug-receptor interaction",
        "Therapeutic effect",
        "Absorption",
        "Mechanism of action",
      ],
      correct: "Absorption",
    },
    {
      question: "The unintended action of a drug is its:",
      options: [
        "Therapeutic effect",
        "Adverse effect",
        "Desired effect",
        "Primary effect",
      ],
      correct: "Adverse effect",
    },
    {
      question: "How many types of diuretics exist?",
      options: ["2", "3", "4", "5"],
      correct: "5",
    },
    {
      question: "Dependence includes adherence to a prescribed regimen.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Trade name is the same as brand name.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Pharmacodynamics includes the study of drug absorption.",
      options: ["True", "False"],
      correct: "False",
    },
    {
      question: "Adverse effect is an unintended action of a drug.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "There are five main types of diuretics.",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Which route of drug administration is not a parenteral route?",
      options: ["Rectal", "Intravenous", "Intramuscular", "All of the above"],
      correct: "Rectal",
    },
    {
      question: "Which drug class is used to treat diabetes?",
      options: [
        "Antihypertensives",
        "Antidiabetics",
        "Antibiotics",
        "Analgesics",
      ],
      correct: "Antidiabetics",
    },
    {
      question: "What is the primary use of bronchodilators?",
      options: [
        "Treat asthma",
        "Lower cholesterol",
        "Reduce pain",
        "Treat infections",
      ],
      correct: "Treat asthma",
    },
    {
      question: "What is the action of diuretics?",
      options: [
        "Increase urine output",
        "Reduce heart rate",
        "Relieve pain",
        "Treat allergies",
      ],
      correct: "Increase urine output",
    },
    {
      question: "What is the primary use of anticoagulants?",
      options: [
        "Prevent blood clots",
        "Treat infections",
        "Reduce fever",
        "Lower blood pressure",
      ],
      correct: "Prevent blood clots",
    },
    {
      question: "What is the action of antiemetics?",
      options: [
        "Prevent nausea and vomiting",
        "Lower blood sugar",
        "Treat infections",
        "Reduce pain",
      ],
      correct: "Prevent nausea and vomiting",
    },
    {
      question: "Which route of administration is fastest for drug absorption?",
      options: ["Oral", "Intravenous", "Topical", "Rectal"],
      correct: "Intravenous",
    },
    {
      question: "What is the primary use of statins?",
      options: [
        "Lower cholesterol",
        "Treat infections",
        "Reduce pain",
        "Lower blood pressure",
      ],
      correct: "Lower cholesterol",
    },
    {
      question: "What is the action of laxatives?",
      options: [
        "Relieve constipation",
        "Reduce fever",
        "Treat allergies",
        "Lower blood pressure",
      ],
      correct: "Relieve constipation",
    },
    {
      question: "What is the primary use of anticonvulsants?",
      options: [
        "Prevent seizures",
        "Treat infections",
        "Reduce pain",
        "Lower blood sugar",
      ],
      correct: "Prevent seizures",
    },
    {
      question: "What is the action of beta-blockers?",
      options: [
        "Lower heart rate and blood pressure",
        "Relieve pain",
        "Treat infections",
        "Reduce fever",
      ],
      correct: "Lower heart rate and blood pressure",
    },
    {
      question: "What is the primary use of antifungals?",
      options: [
        "Treat bacterial infections",
        "Treat fungal infections",
        "Reduce pain",
        "Lower cholesterol",
      ],
      correct: "Treat fungal infections",
    },
    {
      question: "What is the action of antacids?",
      options: [
        "Neutralize stomach acid",
        "Relieve pain",
        "Treat infections",
        "Lower blood pressure",
      ],
      correct: "Neutralize stomach acid",
    },
    {
      question: "What is the primary use of antipsychotics?",
      options: [
        "Treat mental disorders",
        "Reduce fever",
        "Treat allergies",
        "Lower blood pressure",
      ],
      correct: "Treat mental disorders",
    },
    {
      question: "What is the action of muscle relaxants?",
      options: [
        "Relieve muscle spasms",
        "Lower blood sugar",
        "Treat infections",
        "Reduce pain",
      ],
      correct: "Relieve muscle spasms",
    },
    {
      question: "What is the primary use of antivirals?",
      options: [
        "Treat bacterial infections",
        "Treat viral infections",
        "Reduce pain",
        "Lower cholesterol",
      ],
      correct: "Treat viral infections",
    },
  ],
  "Primary Health Care": [
    {
      question: "Alma-Ata definition of PHC emphasises the following EXCEPT",
      options: [
        "Practical and scientifically sound",
        "Socially acceptable methods",
        "Technology made locally accessible",
        "Emergency care",
        "None of the above",
      ],
      correct: "Emergency care",
    },
    {
      question: "For PHC to be geographically accessible",
      options: [
        "The distance to a health facility must be short and treckable",
        "The client must travel for a distance of six kilometer before getting to a health facility",
        "It must be located within the village",
        "It must be located away from the poors",
        "The client must not travel for more than five kilometer before getting to a health facility",
      ],
      correct:
        "The client must not travel for more than five kilometer before getting to a health facility",
    },
    {
      question: "The following statement best describe referral system",
      options: [
        "Referral is a process of transferring cases (patients) of serious conditions from less skilled personnel",
        "Referral is a process of paying advocacy to patient relatives",
        "Referral is a process of having concern",
        "Referral system serves as the remedies for traditional medicine",
        "None of the above",
      ],
      correct:
        "Referral is a process of transferring cases (patients) of serious conditions from less skilled personnel",
    },
    {
      question:
        "One of these is NOT an impacts of domestic violence on children",
      options: [
        "Poor concentration",
        "Aggression, hyperactivity, disobedience",
        "Disturbed sleep and nightmares",
        "Sound sleep",
        "Hallucination",
      ],
      correct: "Sound sleep",
    },
    {
      question:
        "One of these is NOT a step in PHC implementation at the LG level",
      options: [
        "Baseline survey",
        "Situation analysis",
        "Zoning of the local government",
        "Appropriate use of technology",
        "None of the above",
      ],
      correct: "Appropriate use of technology",
    },
    {
      question: "The following statement best describe Health education",
      options: [
        "Is a profession of educating people about health",
        "Is a profession of educating people about socialization",
        "Is the act of conveying intended meaning to another entity through the use of mutually understood signs and semiotic rules",
        "Is the act of conveying untended meaning to another entity through the use of mutually understood signs and semiotic rules",
        "Involves educating people about only drugs",
      ],
      correct: "Is a profession of educating people about health",
    },
    {
      question:
        "Factors that contribute positively in adolescent making a decision about their health include all, EXCEPT",
      options: [
        "Caring and meaning full relationship",
        "Positive school environment",
        "Lack of information",
        "Encouragement of self expression",
        "Availability of information",
      ],
      correct: "Lack of information",
    },
    {
      question:
        "Fetal movement is first felt by a pregnant woman at the ----------------------of pregnancy",
      options: [
        "18th week",
        "20th week",
        "12th week",
        "30th week",
        "16th week",
      ],
      correct: "18th week",
    },
    {
      question: "All these factors EXCEPT one are determinants of health",
      options: [
        "Genetics inheritance",
        "Emotions",
        "Personal life style",
        "None of the above",
        "Nutrition",
      ],
      correct: "None of the above",
    },
    {
      question:
        "Which of the following is NOT a class of microorganism that causes disease in man?",
      options: [
        "Bacteria",
        "Virus",
        "Fungi",
        "Ascaris lumbricoides",
        "None of the above",
      ],
      correct: "Ascaris lumbricoides",
    },
    {
      question:
        "In PHC referral system, a puerperal psychosis woman will be referred to:",
      options: [
        "Tertiary institution",
        "General hospital",
        "Cottage hospital",
        "Model comprehensive health centre",
        "Pharmacy",
      ],
      correct: "Tertiary institution",
    },
    {
      question: "PHC focuses on:",
      options: [
        "Provision of modern health facilities",
        "Provision of medical doctors in all health facilities",
        "Building of cottage hospital in all villages",
        "Preventive, Promotive, curative and Rehabitative services",
        "Only on prevention of diseases",
      ],
      correct: "Preventive, Promotive, curative and Rehabitative services",
    },
    {
      question:
        "Alma-Ata conference that led to the emergency of PHC took place in Alma – Ata:",
      options: [
        "From 6th -12th September, 1978",
        "From 8th -14th August, 1978",
        "From 4th -10th February, 1976",
        "From 6th -12th September, 1977",
        "From January 1st - 11th August, 1978",
      ],
      correct: "From 6th -12th September, 1978",
    },
    {
      question: "Characteristics of tertiary level of care include EXCEPT",
      options: [
        "Closest to the root",
        "Referral from the secondary level",
        "Provides very specialized care",
        "Refers back to secondary level and or primary level or as the case may be.",
        "None of the above",
      ],
      correct: "Closest to the root",
    },
    {
      question:
        "In WHO definitions of health, three aspects of health identified are:",
      options: [
        "Physical, mental and social",
        "Physical, mental and economic",
        "Physical, mental and cultural",
        "Physical, mental and environmental",
        "All of the above",
      ],
      correct: "Physical, mental and social",
    },
    {
      question: "One of the following is NOT an element of good communication",
      options: ["Radio", "Sender", "Message", "Feedback", "Television"],
      correct: "Radio",
    },
    {
      question: "The main goal of health education is to:",
      options: [
        "Effect negative change",
        "Acquire skills",
        "Acquire knowledge",
        "Acquire respect",
        "Acquire positive change in health attitude and behaviour",
      ],
      correct: "Acquire positive change in health attitude and behaviour",
    },
    {
      question: "Effective communication is facilitated by:",
      options: [
        "Adequate feedback",
        "Difference in culture",
        "Wipe gap in educational level",
        "Lack of involvement",
        "None of the above",
      ],
      correct: "Adequate feedback",
    },
    {
      question: "The two –way referral system centre on:",
      options: [
        "Making supervision easy and fair",
        "Explaining to the patient how to take medicine",
        "Ensuring continuity of care",
        "Having a good health system",
        "Improving the knowledge",
      ],
      correct: "Ensuring continuity of care",
    },
    {
      question:
        "All but ONE of the objectives of National health insurance scheme (NHIS) is",
      options: [
        "Improve private sector participation in health care delivery",
        "To protect families from huge medical bills",
        "To ensure that every Nigerian has access to good health care services",
        "To make sure that drugs are free to the populace",
        "All of the above",
      ],
      correct: "To make sure that drugs are free to the populace",
    },
    {
      question:
        "Which of the following is NOT a cultural factors affecting health?",
      options: [
        "Ignorance",
        "Poverty",
        "Rainfall",
        "Tradition",
        "All of the above",
      ],
      correct: "Rainfall",
    },
    {
      question:
        "The components of culture that acts as agents of social control include all But:",
      options: ["Food fad", "Folk ways", "Mores", "Laws", "None of the above"],
      correct: "Food fad",
    },
    {
      question:
        "The first stage of labour could be prolonged by the following EXCEPT",
      options: [
        "Weak fallopian tube contraction",
        "Face presentation",
        "Weak uterine contraction",
        "Transversely",
        "All of the above",
      ],
      correct: "Weak fallopian tube contraction",
    },
    {
      question:
        "One of the following group of pregnant mothers is more prone to post partum hemorrhage:",
      options: [
        "Primigravida",
        "Diabetic mothers",
        "Hypertensive mothers",
        "Grand multiperous mothers",
        "None of the above",
      ],
      correct: "Grand multiperous mothers",
    },
    {
      question:
        "Pelvic assessment of a primigravida is usually done during the --------------------- of pregnancy:",
      options: [
        "30th week",
        "32th week",
        "28th week",
        "49th week",
        "36th week",
      ],
      correct: "36th week",
    },
    {
      question: "All are signs of false labour EXCEPT",
      options: [
        "Lightening",
        "Dilatation of the cervical OS",
        "Frequency of micturation",
        "Irregular uterine contraction",
        "None of the above",
      ],
      correct: "Dilatation of the cervical OS",
    },
    {
      question:
        "Adolescent health services can be provided at the following places, EXCEPT:",
      options: [
        "School/college based clinics",
        "Public health facilities",
        "Community based clinics",
        "Home",
        "None of the above",
      ],
      correct: "Home",
    },
    {
      question:
        "Personal factors that determining the state of health of the individual include these EXCEPT",
      options: [
        "Health awareness",
        "Personal hygiene",
        "Poor housing",
        "Literacy",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "The success of an effective referral system depends on one of the following:",
      options: [
        "Orientation of all health personnel to the two way referral system",
        "Forms designed in a sophisticated way",
        "The expertise of health personnel",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "NPI programme does NOT cover one of the following group of diseases:",
      options: [
        "Poliomyelitis , measles ,tetanus",
        "Cholera, typhoid , rubella",
        "Measles, hepatitis, pertussis",
        "Tetanus, diphtheria",
        "Whooping cough",
      ],
      correct: "Whooping cough",
    },
    {
      question: "Neurosis is classified as a:",
      options: [
        "major mental problem",
        "psychoneurosis",
        "minor mental problem",
        "mania",
      ],
      correct: "minor mental problem",
    },
    {
      question:
        "All of these are causes of mental disorder according to the Western world (orthodox) except:",
      options: ["hereditary", "occupation", "curses", "injury"],
      correct: "injury",
    },
    {
      question: "Organic psychoses is classified as a:",
      options: [
        "major mental disorder",
        "minor mental disorder",
        "depression",
        "drug addiction",
      ],
      correct: "major mental disorder",
    },
    {
      question: "Organic psychoses is caused as a result of:",
      options: ["delusion", "brain damage", "anxiety", "phobia"],
      correct: "brain damage",
    },
    {
      question: "An example of Neurosis is all of the following, EXCEPT:",
      options: ["anxiety", "obsessional", "phobia", "depression"],
      correct: "depression",
    },
    {
      question: "In psychoses, the patient’s orientation is:",
      options: ["fair", "not intact", "intact", "moderate"],
      correct: "not intact",
    },
    {
      question: "In psychoses, the appearance is usually:",
      options: ["moderate", "rough", "clean", "fair"],
      correct: "rough",
    },
    {
      question: "A patient with Neurosis has:",
      options: ["bad speech", "poor speech", "good speech", "fair speech"],
      correct: "good speech",
    },
    {
      question:
        "One of these is a cause of mental disorder according to traditional belief:",
      options: ["environment", "witchcraft", "marriage", "injury"],
      correct: "witchcraft",
    },
    {
      question: "An example of functional psychoses is:",
      options: ["depression", "phobia", "anxiety", "neurasthenia"],
      correct: "depression",
    },
    {
      question: "An example of sexual deviation is:",
      options: ["marriage", "psychometric disorder", "HIV", "homosexuality"],
      correct: "homosexuality",
    },
    {
      question: "Delusion is a characteristic of:",
      options: [
        "major mental disorder",
        "minor mental disorder",
        "insomnia",
        "ischoneurosis",
      ],
      correct: "major mental disorder",
    },
    {
      question: "A common drug of abuse currently is:",
      options: [
        "multi-vitamins",
        "tramadol",
        "family planning pills",
        "Gulder beer",
      ],
      correct: "tramadol",
    },
    {
      question: "Injections can be prepared in which forms?",
      options: [
        "hand and gas",
        "chemical and water",
        "liquid and powder",
        "none of the above",
      ],
      correct: "liquid and powder",
    },
    {
      question:
        "The route of giving an injection includes all the following EXCEPT:",
      options: ["intradermal", "soft thigh", "intrathecal", "convulsion"],
      correct: "convulsion",
    },
    {
      question: "The medical terminology for nose bleeding is:",
      options: ["haemoptysis", "haematuria", "epistaxis", "convulsion"],
      correct: "epistaxis",
    },
    {
      question:
        "One of the following is part of the senses involved in physical examination:",
      options: [
        "sense of eating",
        "sense of feeling",
        "sense of running",
        "sense of health",
      ],
      correct: "sense of feeling",
    },
    {
      question:
        "The systems involved in physical examination include all the following EXCEPT:",
      options: ["inspection", "ejaculation", "auscultation", "percussion"],
      correct: "ejaculation",
    },
    {
      question: "One of these is a common cause of cough:",
      options: ["asthma", "headache", "vomiting", "fever"],
      correct: "asthma",
    },
    {
      question: "Bleeding is the escape of blood from the:",
      options: ["capillaries", "blood vessel", "vein", "artery"],
      correct: "blood vessel",
    },
    {
      question:
        "The items needed to be assembled in an injection tray include all EXCEPT:",
      options: [
        "kidney dish for used swabs",
        "kidney dish with a pair of forceps",
        "methylated spirit",
        "thermometer",
      ],
      correct: "thermometer",
    },
    {
      question: "One of the following is not an anti-malaria tablet:",
      options: [
        "artemether-lumefantrine",
        "artemether-amodiaquine",
        "metronidazole",
        "artesunate combination therapy",
      ],
      correct: "metronidazole",
    },
    {
      question: "Pulse rate is the checking of the:",
      options: ["pulse rate", "blood pressure", "artery bone", "heartbeat"],
      correct: "pulse rate",
    },
    {
      question: "A good health team leader must possess the following EXCEPT:",
      options: ["initiatives", "relevance", "approachable", "trustworthy"],
      correct: "relevance",
    },
    {
      question: "The process of respiration takes place in the:",
      options: ["heart", "vein", "lungs", "liver"],
      correct: "lungs",
    },
    {
      question: "The main components of blood pressure are:",
      options: [
        "systolic pressure and diastolic pressure",
        "vertical pressure and horizontal pressure",
        "maximum pressure",
        "minimum pressure",
      ],
      correct: "systolic pressure and diastolic pressure",
    },
    {
      question: "One of these is a method of sterilization:",
      options: ["canning", "steaming", "smoking", "refrigerating"],
      correct: "steaming",
    },
    {
      question: "Care given to the mouth and its structure is:",
      options: ["demonstration", "oral hygiene", "tepid sponging", "brushing"],
      correct: "oral hygiene",
    },
    {
      question: "Thermometer is an instrument used to check body:",
      options: ["odour", "expression", "temperature", "pulse"],
      correct: "temperature",
    },
    {
      question: "The sites for taking pulse include the following EXCEPT:",
      options: [
        "radial artery",
        "temporal artery",
        "leg artery",
        "popliteal artery",
      ],
      correct: "leg artery",
    },
    {
      question: "One of the following is the cause of diarrhea and vomiting:",
      options: ["headache", "appendicitis", "metronidazole", "migraine"],
      correct: "appendicitis",
    },
    {
      question: "_____ is an instrument used to give injection:",
      options: ["needle", "syringe", "artery forceps", "needle and syringe"],
      correct: "needle and syringe",
    },
    {
      question: "Common methods of sterilization include:",
      options: [
        "boiling, disinfecting and steaming",
        "canning, boiling and smoking",
        "smoking, ironing and steaming",
        "disinfecting, autoclaving and invasive",
      ],
      correct: "boiling, disinfecting and steaming",
    },
    {
      question:
        "The number of times an individual breathes in and out within a minute is known as:",
      options: [
        "respiration",
        "respiratory",
        "blood pressure",
        "respiratory rate",
      ],
      correct: "respiratory rate",
    },
    {
      question:
        "The points to note during interviewing of patients include all EXCEPT:",
      options: [
        "privacy",
        "confidentiality",
        "putting words into client’s mouth",
        "lighting",
      ],
      correct: "putting words into client’s mouth",
    },
    {
      question:
        "Health team is a group of people working together to give health care services to:",
      options: [
        "the community, families, and individuals",
        "individual, families, community",
        "people, elders, towns",
        "settlement, geographical, families",
      ],
      correct: "individual, families, community",
    },
    {
      question: "Characteristics of a health team include:",
      options: [
        "cooperation",
        "communication",
        "regular meeting",
        "all of the above",
      ],
      correct: "all of the above",
    },
    {
      question:
        "Equipment involved in taking blood pressure include all EXCEPT:",
      options: [
        "sphygmomanometer",
        "wristwatch",
        "stethoscope",
        "blood pressure charts",
      ],
      correct: "wristwatch",
    },
    {
      question:
        "Questions about the patient’s health in relation to the chief complaint is known as:",
      options: [
        "obstetric history",
        "social history",
        "medical history",
        "family history",
      ],
      correct: "medical history",
    },
    {
      question: "One of the following is not a composition of the health team:",
      options: [
        "hawkers",
        "health information staff",
        "X-ray department staff",
        "pharmacist",
      ],
      correct: "hawkers",
    },
    {
      question: "_____ is one of the routes of taking temperature:",
      options: ["radial", "rectal", "femur", "forearm"],
      correct: "rectal",
    },
    {
      question: "The following are types of sphygmomanometer EXCEPT:",
      options: [
        "mercury sphygmomanometer",
        "aneroid sphygmomanometer",
        "plastic sphygmomanometer",
        "digital sphygmomanometer",
      ],
      correct: "plastic sphygmomanometer",
    },
    {
      question:
        "Headache is not a _____ but a _____ in the body that something is wrong in the body system:",
      options: [
        "clinical sign but a disease",
        "disease but healthy",
        "sickness but healthy",
        "disease but a clinical sign",
      ],
      correct: "disease but a clinical sign",
    },
    {
      question:
        "Equipment needed for temperature taking includes one of the following:",
      options: [
        "artery forceps",
        "a jar of Vaseline",
        "stethoscope",
        "auriscope",
      ],
      correct: "a jar of Vaseline",
    },
    {
      question: "Characteristics of normal pulse include the following EXCEPT:",
      options: ["rate", "tension", "rhythm", "heartbeat"],
      correct: "tension",
    },
    {
      question: "A wound which has already decayed is known as:",
      options: [
        "incised wound",
        "lacerated wound",
        "septic wound",
        "burning wound",
      ],
      correct: "septic wound",
    },
    {
      question: "Types of bleeding include all EXCEPT:",
      options: [
        "venous bleeding",
        "facial bleeding",
        "internal bleeding",
        "nose bleeding",
      ],
      correct: "facial bleeding",
    },
    {
      question: "Wound healing occurs in how many intentions?",
      options: ["4", "2", "6", "3"],
      correct: "2",
    },
    {
      question:
        "_____ includes the knowledge, attitude and skills available to enable people replace unhealthy actions:",
      options: [
        "health education",
        "health information",
        "health awareness",
        "health promotion",
      ],
      correct: "health education",
    },
    {
      question:
        "The concepts of the nature of health education are made up of the following EXCEPT:",
      options: ["behaviour", "attitude", "belief", "values"],
      correct: "belief",
    },
    {
      question:
        "_____ refers to carefully creating, persuading and facilitating awareness in the community:",
      options: [
        "motivation",
        "campaign",
        "mobilization",
        "community diagnosis",
      ],
      correct: "mobilization",
    },
    {
      question:
        '"Lasting and meaningful health practice will neither depend on effective health education nor the knowledge and behaviour of people" is:',
      options: [
        "one of the assumptions of health education",
        "a hypothesis in health education",
        "none of the above",
        "all of the above",
      ],
      correct: "one of the assumptions of health education",
    },
    {
      question:
        "_____ can result in permanent change in behaviour of the people:",
      options: ["knowledge", "skills", "actions", "learning"],
      correct: "learning",
    },
    {
      question: "The main aim of health education is to:",
      options: [
        "promote the development and proper use of available health services",
        "reduce wastage of family resources",
        "accurately inform people about their bodily and mental functions",
        "change people's behaviour to help adopt healthy living",
      ],
      correct: "change people's behaviour to help adopt healthy living",
    },
    {
      question: "Endemic disease can be described as:",
      options: [
        "disease that is always present in one environment",
        "disease which is spread to many nations",
        "disease that cannot be prevented with the use of drugs",
        "none of the above",
      ],
      correct: "disease that is always present in one environment",
    },
    {
      question:
        "The following diseases can be transferred from one person to another EXCEPT:",
      options: ["tonsillitis", "malaria", "tuberculosis", "gonorrhea"],
      correct: "malaria",
    },
    {
      question:
        "Disease that can be spread from one person to another, such as from man to man or animal to man, is known as:",
      options: [
        "communicable disease",
        "endemic disease",
        "incubation period of a disease",
        "non-communicable disease",
      ],
      correct: "communicable disease",
    },
    {
      question:
        "The following are the signs and symptoms of tuberculosis EXCEPT:",
      options: [
        "cough for 2 weeks",
        "blood-stained sputum",
        "loss of weight",
        "swelling of the scrotum",
      ],
      correct: "swelling of the scrotum",
    },
    {
      question:
        "Disease which spreads to many nations affecting many people is known as:",
      options: [
        "endemic disease",
        "communicable disease",
        "epidemic disease",
        "pandemic disease",
      ],
      correct: "pandemic disease",
    },
    {
      question: "The following diseases are non-communicable EXCEPT:",
      options: ["asthma", "HIV/AIDS", "diabetes", "hypertension"],
      correct: "HIV/AIDS",
    },
    {
      question: "The ability of the body to resist infection is known as:",
      options: ["control", "prevention", "immunity", "reservoir of infection"],
      correct: "immunity",
    },
    {
      question: "The full meaning of AIDS is:",
      options: [
        "Acquired Immune Deficiency Symptoms",
        "Acquired Immune Deficiency Signs",
        "Acquired Immune Deficiency Syndrome",
        "Acquired Immune Deficiency System",
      ],
      correct: "Acquired Immune Deficiency Syndrome",
    },
    {
      question: "Adaptive immune system can also be called:",
      options: [
        "natural immune system",
        "acquired immune system",
        "active acquired immune system",
        "active natural immune system",
      ],
      correct: "acquired immune system",
    },
    {
      question:
        "_____ refers to substances mixed with an antigen which can enhance immune response to an antigen:",
      options: ["antigen antibodies", "adjuvants", "agglutinins", "histamine"],
      correct: "adjuvants",
    },
    {
      question: "The following are factors affecting host defenses EXCEPT:",
      options: ["nutrition", "sex", "environment", "trauma"],
      correct: "sex",
    },
    {
      question: "One is not a factor influencing antigen-antibody reaction:",
      options: [
        "rate of oxyhaemoglobin",
        "temperature",
        "incubation time",
        "pH level",
      ],
      correct: "rate of oxyhaemoglobin",
    },
    {
      question:
        "Antibodies that cause dissolution of microbial cells that are specifically sensitive to the actions are called:",
      options: ["antitoxins", "opsonins", "agglutinins", "lysins"],
      correct: "lysins",
    },
    {
      question:
        "In antigen-antibody reaction, the entire molecules are not involved:",
      options: ["true", "false", "true and false", "not sure"],
      correct: "true",
    },
    {
      question: "Teaching techniques comprise of:",
      options: [
        "methods",
        "media",
        "methods and media",
        "methods, media and aids",
      ],
      correct: "methods, media and aids",
    },
    {
      question:
        "The teaching technique where only the speaker participates actively is called:",
      options: ["interactive", "didactic", "socratic", "linear"],
      correct: "didactic",
    },
    {
      question: "Examples of Socratic techniques are the following EXCEPT:",
      options: ["discussion", "interview", "brainstorming", "lecture"],
      correct: "lecture",
    },
    {
      question:
        "The carrier of knowledge to a large number of people in the community at a time in health education is the:",
      options: ["teaching aids", "methods", "resources", "community leaders"],
      correct: "teaching aids",
    },
    {
      question: "Effective communication basically has two aspects; they are:",
      options: [
        "good message and channel",
        "resources and methods",
        "good preparation and good delivery",
        "appropriate feedback and proper encoding",
      ],
      correct: "appropriate feedback and proper encoding",
    },
    {
      question: "The following are basic qualities of a good message EXCEPT:",
      options: ["conciseness", "concrete", "completeness", "credibility"],
      correct: "concrete",
    },
    {
      question: "The message source is also called:",
      options: ["communicatee", "decoder", "encoder", "all of the above"],
      correct: "encoder",
    },
    {
      question: "One of the following is a disadvantage of lecture method:",
      options: [
        "it is convenient for large target group",
        "it saves time",
        "the information given fades out relatively fast from memory",
        "it saves efforts",
      ],
      correct: "the information given fades out relatively fast from memory",
    },
    {
      question:
        "The teaching method whereby the application approximates as nearly as possible to reality is:",
      options: ["demonstration", "field trip", "exhibition", "discussion"],
      correct: "demonstration",
    },
    {
      question:
        "The following diseases are known as sexually transmitted infections EXCEPT:",
      options: ["gonorrhea", "syphilis", "chancroid", "monkeypox"],
      correct: "monkeypox",
    },
    {
      question: "The following conditions put children in grave danger EXCEPT:",
      options: [
        "Stiff neck",
        "Flaring nostrils, respiration over 160 minute",
        "Physical or mental handicaps",
        "Severe dehydration",
        "None of the above",
      ],
      correct: "None of the above",
    },
    {
      question: "One of the following is a complication of hypertension:",
      options: [
        "Occasional throbbing headache",
        "Dysphagia",
        "Forgetfulness",
        "Detachment of the retina",
        "None of the above",
      ],
      correct: "Detachment of the retina",
    },
    {
      question:
        "One of the following sentences is NOT true of diabetes mellitus:",
      options: [
        "It is a metabolic disease",
        "It is heredity",
        "It can lead to blindness",
        "It can lead to hypertension",
        "It does not occur in children",
      ],
      correct: "It does not occur in children",
    },
    {
      question:
        "Some attributes of effective inter personal communication include:",
      options: [
        "Effective speaking skill only",
        "Effective management skills",
        "Effective speaking, questioning and listening skills",
        "Effective questioning skill",
        "All of the above",
      ],
      correct: "Effective speaking, questioning and listening skills",
    },
    {
      question: "Communication is:",
      options: [
        "Expression of though and discussion between 2 or more people",
        "Ability to listen",
        "Evaluation of speech",
        "Teaching and learning",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "In PHC, health team approach is essential as it",
      options: [
        "Promotes cost recovery",
        "Provides multidisciplinary skills",
        "Ensure regular meeting of members",
        "Apportion work to lowest category of health workers",
        "None of the above",
      ],
      correct: "Provides multidisciplinary skills",
    },
    {
      question: "One of these is NOT linked to obesity",
      options: [
        "Coronary heart disease",
        "Anaemia",
        "Hypertension",
        "Diabetes mellitus",
        "Diabetes insipidous",
      ],
      correct: "Anaemia",
    },
    {
      question: "One of these is NOT important in 2-way referral system",
      options: [
        "To ensure continuity of care",
        "To ensure adequacy of care",
        "To decongest the clinic",
        "To reduce the cost of care as cases are treated at appropriate level",
        "None of the above",
      ],
      correct: "None of the above",
    },
    {
      question:
        "The first stage of labour could be prolonged by the following EXCEPT",
      options: [
        "Face presentation",
        "Weak uterine contraction",
        "Adherent placenta",
        "Weak fallopian tube contraction",
        "None of the above",
      ],
      correct: "Weak fallopian tube contraction",
    },
    {
      question: "Post partum haemorrhage is common among:",
      options: [
        "Primigravida",
        "Grand multipara",
        "Diabetic pregnant mother",
        "Obese women",
        "Hypertensive women",
      ],
      correct: "Grand multipara",
    },
    {
      question:
        "One of the following drugs can be used in the control of eclampsia;",
      options: [
        "Adrenaline injection",
        "Magnesium sulphates",
        "Ergometrine",
        "Laxis",
        "Ibuprofen",
      ],
      correct: "Magnesium sulphates",
    },
    {
      question:
        "Production of breast milk in a lactating mother can facilitated by all but one:",
      options: [
        "Drinking of plenty of water",
        "Taking well balanced diet",
        "Eating food with plenty roughages",
        "All of the above",
        "Getting plenty of sleeping and getting upset.",
      ],
      correct: "Getting plenty of sleeping and getting upset.",
    },
    {
      question: "One of these is NOT an advantage of IUCD",
      options: [
        "It is reversible",
        "It is long lasting",
        "It does not interfere",
        "All of the above",
        "It protects against STIs/HIV/AIDS",
      ],
      correct: "It protects against STIs/HIV/AIDS",
    },
    {
      question: "The following statement best describe lactational amenorrhea",
      options: [
        "Prolonged breastfeeding",
        "Natural method of contraception during breast feeding",
        "Exclusive breastfeeding only",
        "Menstruation during breastfeeding",
        "Bleeding during breastfeeding",
      ],
      correct: "Natural method of contraception during breast feeding",
    },
    {
      question: "One of the following is NOT a chemical barrier method",
      options: [
        "Spermicides",
        "Jelly creams",
        "Vaginal pessary",
        "Norplant",
        "None of the above",
      ],
      correct: "Norplant",
    },
    {
      question: "The following statement best describe communication",
      options: [
        "Is the act of conveying intended meaning to another entity through the use of mutually understood signs and semiotic rules.",
        "Is the act of conveying untended meaning to another entity through the use of mutually understood signs and semiotic rules.",
        "Is the act of conveying patient to another vicinity through the use of mutually understood signs",
        "Is the act of referring patient relatives to another hospital",
        "None of the above",
      ],
      correct:
        "Is the act of conveying intended meaning to another entity through the use of mutually understood signs and semiotic rules.",
    },
    {
      question:
        "One of the following is not a Barriers to effective human communication",
      options: [
        "Physical barriers",
        "System design",
        "Attitudinal barriers",
        "Clarity",
        "All of the above",
      ],
      correct: "Clarity",
    },
    {
      question: "One of these is NOT causes of handicapping conditions",
      options: [
        "Congenital",
        "Infection",
        "Radiation",
        "All of the above",
        "Immunization",
      ],
      correct: "Immunization",
    },
    {
      question: "One of these is NOT characteristic of good health team",
      options: [
        "Clear line of communication",
        "Co-operation among the member",
        "Regular meeting of the members",
        "Break in two communications",
        "None of the above",
      ],
      correct: "Break in two communications",
    },
    {
      question: "The following statement best describe types of family EXCEPT",
      options: [
        "Conjugal (nuclear or single) family",
        "Extended family",
        "Matrifocal family",
        "Autonomy",
        "All of the above",
      ],
      correct: "Autonomy",
    },
    {
      question:
        "The following statement best describe Signs and symptoms of HIV EXCEPT",
      options: [
        "Acute infection",
        "Clinical latency",
        "Acquired immunodeficiency syndrome",
        "Vomiting and diarrhea",
        "None of the above",
      ],
      correct: "Vomiting and diarrhea",
    },
    {
      question:
        "One of these is NOT an impact of domestic violence on young people",
      options: [
        "Depression",
        "Anxiety",
        "Withdrawal",
        "Sound education",
        "All of the above",
      ],
      correct: "Sound education",
    },
    {
      question:
        "All but one of the impacts of domestic violence on young people",
      options: [
        "Sound education",
        "Sound sleep",
        "Good concentration",
        "Withdrawal",
        "None",
      ],
      correct: "None",
    },
    {
      question:
        "The functions of pharmacist in PHC implementation include all EXCEPT",
      options: [
        "Advocate: Primary health care pharmacists use their expertise and influence to advance the health and well-being of individual patients, communities and populations.",
        "Care Provider: Primary health care pharmacists use their knowledge and skills to provide pharmaceutical care and to facilitate management of patient's medication and overall health needs.",
        "Collaborator: Primary health care pharmacists work collaboratively with patients, family physicians, and other primary health care professionals and in teams to provide effective, quality health care and to fulfill their professional obligations to the community and society at large.",
        "The pharmacist uses their expertise to influencing patient not to come for the available services.",
        "None of the above",
      ],
      correct:
        "The pharmacist uses their expertise to influencing patient not to come for the available services.",
    },
    {
      question: "Information, education and communication in PHC:",
      options: [
        "Compensates for lack of health care services",
        "Is effective in addressing all issues.",
        "Increases awareness on health issues problems and solutions.",
        "Provides appropriate technology",
        "All of the above",
      ],
      correct: "Increases awareness on health issues problems and solutions.",
    },
    {
      question:
        "The process of finding out if an objective has been achieved is known as:",
      options: [
        "Assessment",
        "Monitoring",
        "Evaluation",
        "Supervision",
        "Follow up",
      ],
      correct: "Evaluation",
    },
    {
      question: "One of this is not a signs and symptom of depression:",
      options: [
        "Easily fatigued",
        "Crawling sensation",
        "Loss of libido",
        "Good appetite",
        "Anxiety",
      ],
      correct: "Good appetite",
    },
    {
      question: "One of these is NOT a reason for engaging in drugs abuse:",
      options: [
        "To cover inadequacies",
        "For relaxation",
        "To gets married",
        "To remove boredom",
        "To feel euphoria",
      ],
      correct: "To gets married",
    },
    {
      question: "To promote an effective group discussion session:",
      options: [
        "Time and place is not relevant",
        "Greet group in English language",
        "Listen more than talk",
        "Permit participation to introduce topic",
        "Attitude is not important",
      ],
      correct: "Listen more than talk",
    },
    {
      question: "The objective of the health service includes all BUT one:",
      options: [
        "To make comprehensive health care available and accessible to the whole population at the lowest possible cost",
        "To detects, prevent, treat and control all communicable diseases.",
        "To promotes and develops, in conjunction with other sectors of government, environmental health policies and programmes which will provide a sound basis for healthy population.",
        "To promote non compliance of client from participating in PHC activities",
        "None of the above",
      ],
      correct:
        "To promote non compliance of client from participating in PHC activities",
    },
    {
      question:
        "Pre- independence ‘’ten (10 yrs) development and welfare plan’’ (1946 -1956) includes these EXCEPT",
      options: [
        "Development of medical education",
        "Establishment and expansion of hospitals and maternities",
        "Development of training school and programmes for medical and Para medical staff",
        "Community participation",
        "Lck of community participation",
      ],
      correct: "Lck of community participation",
    },
    {
      question:
        "The objectives of ‘’four year national development plan ‘’ (1970 – 1974) Second national development plan includes these EXCEPT",
      options: [
        "Implementation of measures to restore health facilities and services destroyed or damaged during the civil war.",
        "Expansion of programmes for the maintenance of environmental sanitation.",
        "Institution of measures to control communicable diseases which are prevalent in particular communities.",
        "Community participation",
        "Non community participation",
      ],
      correct: "Non community participation",
    },
    {
      question:
        "The three tiers {levels} of Nigerian health care system in includes these EXCEPT",
      options: [
        "Primary level",
        "Secondary level",
        "Tertiary level",
        "Community level",
        "Institutional level",
      ],
      correct: "Institutional level",
    },
    {
      question: "Characteristics of tertiary level of care include EXCEPT",
      options: [
        "Closest to the root",
        "Referral from the secondary level",
        "Provides very specialized care",
        "Refers back to secondary level and or primary level or as the case may be",
        "None of the above",
      ],
      correct: "Closest to the root",
    },
    {
      question:
        "In WHO definitions of health, three aspects of health identified are:",
      options: [
        "Physical, mental and social",
        "Physical, mental and economic",
        "Physical, mental and cultural",
        "Physical, mental and environmental",
        "Primary, secondary and tertiary",
      ],
      correct: "Physical, mental and social",
    },
    {
      question:
        "What is the main focus of Primary Health Care (PHC) as per the WHO?",
      options: [
        "Providing advanced surgical care",
        "Ensuring health for all through essential care",
        "Focusing on tertiary care services",
        "Exclusively treating emergencies",
        "None of the above",
      ],
      correct: "Ensuring health for all through essential care",
    },
    {
      question: "Which of the following is a key element of PHC?",
      options: [
        "Immunization against major infectious diseases",
        "Providing luxury health services",
        "Focusing only on hospital care",
        "Excluding community involvement",
        "None of the above",
      ],
      correct: "Immunization against major infectious diseases",
    },
    {
      question: "What does intersectoral collaboration in PHC involve?",
      options: [
        "Working only within the health sector",
        "Collaboration between health and other sectors like education and agriculture",
        "Excluding community participation",
        "Focusing on individual care only",
        "None of the above",
      ],
      correct:
        "Collaboration between health and other sectors like education and agriculture",
    },
    {
      question: "Which level of care is the first point of contact in PHC?",
      options: [
        "Tertiary level",
        "Secondary level",
        "Primary level",
        "Specialized level",
        "None of the above",
      ],
      correct: "Primary level",
    },
    {
      question: "What is the purpose of community participation in PHC?",
      options: [
        "To exclude community input",
        "To ensure communities are involved in planning and implementing health services",
        "To focus only on medical professionals",
        "To limit health education",
        "None of the above",
      ],
      correct:
        "To ensure communities are involved in planning and implementing health services",
    },
    {
      question:
        "Which of the following is NOT a focus of maternal and child health in PHC?",
      options: [
        "Prenatal care",
        "Child immunization",
        "Family planning",
        "Emergency surgery",
        "None of the above",
      ],
      correct: "Emergency surgery",
    },
    {
      question:
        "What does the principle of appropriate technology in PHC emphasize?",
      options: [
        "Using expensive, high-tech equipment",
        "Using affordable and locally sustainable technology",
        "Excluding technology from health care",
        "Focusing on imported technology only",
        "None of the above",
      ],
      correct: "Using affordable and locally sustainable technology",
    },
    {
      question: "What is the role of a Village Health Worker (VHW) in PHC?",
      options: [
        "Providing specialized surgical care",
        "Educating the community and providing basic health services",
        "Managing tertiary hospitals",
        "Excluding community involvement",
        "None of the above",
      ],
      correct: "Educating the community and providing basic health services",
    },
    {
      question:
        "Which of the following is a social determinant of health in PHC?",
      options: [
        "Access to clean water",
        "Genetic predisposition",
        "Medical history",
        "Personal medication use",
        "None of the above",
      ],
      correct: "Access to clean water",
    },
    {
      question: "When does the quickening typically occur during pregnancy?",
      options: [
        "12th week",
        "16th week",
        "20th week",
        "24th week",
        "28th week",
      ],
      correct: "20th week",
    },
    {
      question: "Which of the following is NOT a determinant of health in PHC?",
      options: [
        "Education level",
        "Economic status",
        "Access to health services",
        "Personal hobbies",
        "None of the above",
      ],
      correct: "Personal hobbies",
    },
    {
      question:
        "Which of the following is a protozoan that causes disease in humans?",
      options: [
        "Plasmodium",
        "Escherichia coli",
        "Staphylococcus aureus",
        "Candida albicans",
        "None of the above",
      ],
      correct: "Plasmodium",
    },
    {
      question: "In PHC, a patient with severe burns should be referred to:",
      options: [
        "Primary health center",
        "Community clinic",
        "Tertiary hospital",
        "Pharmacy",
        "None of the above",
      ],
      correct: "Tertiary hospital",
    },
    {
      question: "What is the primary goal of PHC in rural areas?",
      options: [
        "Providing specialized care",
        "Ensuring access to essential health services",
        "Focusing on cosmetic procedures",
        "Excluding preventive care",
        "None of the above",
      ],
      correct: "Ensuring access to essential health services",
    },
    {
      question:
        "The Alma-Ata Declaration was adopted by the WHO in which year?",
      options: ["1976", "1977", "1978", "1979", "1980"],
      correct: "1978",
    },
    {
      question:
        "Which of the following is a characteristic of secondary level care?",
      options: [
        "Basic health services only",
        "Referral from primary level",
        "Community-based care only",
        "No specialized services",
        "None of the above",
      ],
      correct: "Referral from primary level",
    },
    {
      question:
        "According to WHO, health includes which of the following aspects?",
      options: [
        "Physical, emotional, and financial",
        "Physical, mental, and social",
        "Physical, spiritual, and economic",
        "Physical, mental, and cultural",
        "None of the above",
      ],
      correct: "Physical, mental, and social",
    },
    {
      question:
        "Which of the following is an element of effective communication in PHC?",
      options: [
        "Sender",
        "Message",
        "Receiver",
        "Feedback",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "What is the primary objective of health education in PHC?",
      options: [
        "To increase hospital visits",
        "To promote healthy behaviors and practices",
        "To focus on emergency care",
        "To limit community involvement",
        "None of the above",
      ],
      correct: "To promote healthy behaviors and practices",
    },
    {
      question: "What facilitates effective communication in PHC?",
      options: [
        "Cultural barriers",
        "Lack of feedback",
        "Clear language and understanding",
        "Language differences",
        "None of the above",
      ],
      correct: "Clear language and understanding",
    },
    {
      question: "What is the main purpose of a referral system in PHC?",
      options: [
        "To limit patient care",
        "To ensure continuity of care across levels",
        "To avoid patient treatment",
        "To focus on emergency care only",
        "None of the above",
      ],
      correct: "To ensure continuity of care across levels",
    },
    {
      question:
        "Which of the following is an objective of the National Health Insurance Scheme (NHIS)?",
      options: [
        "Increase healthcare costs",
        "Limit access to healthcare",
        "Ensure affordable healthcare for all Nigerians",
        "Exclude rural communities",
        "None of the above",
      ],
      correct: "Ensure affordable healthcare for all Nigerians",
    },
    {
      question:
        "Which of the following is an environmental factor affecting health?",
      options: [
        "Air pollution",
        "Genetic factors",
        "Personal hygiene",
        "Education level",
        "None of the above",
      ],
      correct: "Air pollution",
    },
    {
      question:
        "Which of the following is a cultural norm that affects health?",
      options: [
        "Belief in traditional healing",
        "Access to clean water",
        "Economic status",
        "Genetic predisposition",
        "None of the above",
      ],
      correct: "Belief in traditional healing",
    },
    {
      question:
        "Which of the following is a complication of diabetes mellitus?",
      options: [
        "Kidney failure",
        "Improved vision",
        "Weight gain",
        "Better immunity",
        "None of the above",
      ],
      correct: "Kidney failure",
    },
    {
      question: "Which statement is true about hypertension?",
      options: [
        "It cannot lead to heart disease",
        "It is always symptomatic",
        "It can be managed through lifestyle changes",
        "It only affects young adults",
        "None of the above",
      ],
      correct: "It can be managed through lifestyle changes",
    },
    {
      question:
        "What is the normal composition of the umbilical cord at birth?",
      options: [
        "Two veins, one artery",
        "Two arteries, one vein",
        "One artery, one vein",
        "Three arteries",
        "None of the above",
      ],
      correct: "Two arteries, one vein",
    },
    {
      question: "Which of the following is a cause of preterm labor?",
      options: [
        "Maternal infection",
        "Normal pregnancy weight gain",
        "Adequate prenatal care",
        "Healthy maternal diet",
        "None of the above",
      ],
      correct: "Maternal infection",
    },
    {
      question: "What can cause neonatal jaundice in a newborn?",
      options: [
        "Proper breastfeeding",
        "Immature liver function",
        "Maternal hydration",
        "Normal birth weight",
        "None of the above",
      ],
      correct: "Immature liver function",
    },
    {
      question: "Which family planning method is considered most reliable?",
      options: [
        "Condoms",
        "Tubal ligation",
        "Withdrawal method",
        "Calendar method",
        "None of the above",
      ],
      correct: "Tubal ligation",
    },
    {
      question: "Which condition is a risk factor for postpartum hemorrhage?",
      options: [
        "Prolonged labor",
        "Normal delivery",
        "Healthy placenta",
        "Adequate hydration",
        "None of the above",
      ],
      correct: "Prolonged labor",
    },
    {
      question: "What is a key benefit of postnatal care in PHC?",
      options: [
        "Monitoring maternal recovery",
        "Providing cosmetic surgery",
        "Focusing on emergency care",
        "Excluding newborn care",
        "None of the above",
      ],
      correct: "Monitoring maternal recovery",
    },
    {
      question:
        "Which of the following is a lifestyle risk factor for hypertension?",
      options: [
        "Regular exercise",
        "High salt intake",
        "Adequate sleep",
        "Low stress levels",
        "None of the above",
      ],
      correct: "High salt intake",
    },
    {
      question: "Which of the following is a symptom of hypertension?",
      options: [
        "Blurred vision",
        "Weight loss",
        "Improved appetite",
        "Better sleep",
        "None of the above",
      ],
      correct: "Blurred vision",
    },
    {
      question: "Which of the following is a sign of hypoglycemia in diabetes?",
      options: [
        "Sweating",
        "Weight gain",
        "Increased thirst",
        "Dry skin",
        "None of the above",
      ],
      correct: "Sweating",
    },
    {
      question: "What does the equity principle in PHC aim to achieve?",
      options: [
        "Favoring urban areas",
        "Ensuring fair distribution of health services",
        "Limiting access to rural areas",
        "Focusing on tertiary care",
        "None of the above",
      ],
      correct: "Ensuring fair distribution of health services",
    },
    {
      question: "What influenced the development of PHC in Nigeria?",
      options: [
        "American health policies",
        "British colonial health services",
        "French medical systems",
        "German health initiatives",
        "None of the above",
      ],
      correct: "British colonial health services",
    },
    {
      question: "How many LGAs were selected as PHC models in Nigeria in 1986?",
      options: ["24", "34", "44", "54", "64"],
      correct: "34",
    },
    {
      question:
        "Which of the following is a goal of the National Population Policy?",
      options: [
        "Reducing maternal mortality",
        "Increasing population growth",
        "Limiting family planning",
        "Excluding child health",
        "None of the above",
      ],
      correct: "Reducing maternal mortality",
    },
    {
      question: "What is a benefit of integrated health services in PHC?",
      options: [
        "Increased fragmentation",
        "Reduced efficiency",
        "Improved resource utilization",
        "Limited access to care",
        "None of the above",
      ],
      correct: "Improved resource utilization",
    },
    {
      question: "Which of the following indicates a high-risk pregnancy?",
      options: [
        "Maternal age over 35",
        "Normal blood pressure",
        "Adequate weight gain",
        "No family history of disease",
        "None of the above",
      ],
      correct: "Maternal age over 35",
    },
    {
      question:
        "What is a key attribute of effective interpersonal communication?",
      options: [
        "Active listening",
        "Ignoring feedback",
        "Using complex language",
        "Avoiding eye contact",
        "None of the above",
      ],
      correct: "Active listening",
    },
    {
      question: "What is the definition of communication in PHC?",
      options: [
        "Providing medical care only",
        "Exchanging information to promote health",
        "Limiting patient interaction",
        "Focusing on documentation",
        "None of the above",
      ],
      correct: "Exchanging information to promote health",
    },
    {
      question: "Why is the health team approach important in PHC?",
      options: [
        "It limits collaboration",
        "It promotes a multidisciplinary approach",
        "It focuses on individual roles only",
        "It excludes community input",
        "None of the above",
      ],
      correct: "It promotes a multidisciplinary approach",
    },
    {
      question: "Which condition is linked to obesity in PHC?",
      options: [
        "Osteoarthritis",
        "Improved immunity",
        "Reduced blood pressure",
        "Better respiratory function",
        "None of the above",
      ],
      correct: "Osteoarthritis",
    },
    {
      question: "What is a key benefit of a two-way referral system in PHC?",
      options: [
        "Increased cost of care",
        "Improved patient follow-up",
        "Limited access to care",
        "Reduced continuity of care",
        "None of the above",
      ],
      correct: "Improved patient follow-up",
    },
    {
      question:
        "Which of the following can cause prolonged labor in the third stage?",
      options: [
        "Retained placenta",
        "Normal delivery",
        "Maternal hydration",
        "Healthy fetus",
        "None of the above",
      ],
      correct: "Retained placenta",
    },
    {
      question: "Which condition increases the risk of postpartum hemorrhage?",
      options: [
        "Uterine atony",
        "Normal labor",
        "Healthy placenta",
        "Adequate rest",
        "None of the above",
      ],
      correct: "Uterine atony",
    },
    {
      question: "Which drug is used to manage severe pre-eclampsia in PHC?",
      options: [
        "Paracetamol",
        "Magnesium sulfate",
        "Ibuprofen",
        "Aspirin",
        "None of the above",
      ],
      correct: "Magnesium sulfate",
    },
    {
      question: "What can hinder breast milk production in a lactating mother?",
      options: [
        "Stress",
        "Balanced diet",
        "Hydration",
        "Rest",
        "None of the above",
      ],
      correct: "Stress",
    },
    {
      question:
        "Which of the following is a benefit of using condoms as a family planning method?",
      options: [
        "Permanent contraception",
        "Protection against STIs",
        "Hormonal regulation",
        "Long-term contraception",
        "None of the above",
      ],
      correct: "Protection against STIs",
    },
    {
      question:
        "What does lactational amenorrhea method (LAM) rely on for contraception?",
      options: [
        "Exclusive breastfeeding",
        "Hormonal pills",
        "Surgical intervention",
        "Barrier methods",
        "None of the above",
      ],
      correct: "Exclusive breastfeeding",
    },
    {
      question:
        "Which of the following is a mechanical barrier method of contraception?",
      options: [
        "Condom",
        "Spermicide",
        "Oral contraceptive pill",
        "Implant",
        "None of the above",
      ],
      correct: "Condom",
    },
    {
      question:
        "What is a disadvantage of tubal ligation as a family planning method?",
      options: [
        "It is reversible",
        "It requires surgery",
        "It is temporary",
        "It protects against STIs",
        "None of the above",
      ],
      correct: "It requires surgery",
    },
    {
      question:
        "Which of the following is a cause of failure to thrive in children?",
      options: [
        "Chronic illness",
        "Normal growth",
        "Adequate nutrition",
        "Healthy environment",
        "None of the above",
      ],
      correct: "Chronic illness",
    },
    {
      question: "Which of the following is a congenital defect in newborns?",
      options: [
        "Cleft palate",
        "Normal weight",
        "Healthy reflexes",
        "Good Apgar score",
        "None of the above",
      ],
      correct: "Cleft palate",
    },
    {
      question: "What is the normal respiratory rate of a newborn?",
      options: [
        "20-30 breaths/min",
        "30-60 breaths/min",
        "60-80 breaths/min",
        "80-100 breaths/min",
        "None of the above",
      ],
      correct: "30-60 breaths/min",
    },
    {
      question:
        "Which of the following is a long-term complication of female genital mutilation?",
      options: [
        "Chronic pain",
        "Immediate bleeding",
        "Shock",
        "Infection",
        "None of the above",
      ],
      correct: "Chronic pain",
    },
    {
      question: "Which of the following is a core component of PHC?",
      options: [
        "Treatment of minor ailments",
        "Advanced surgical care",
        "Cosmetic procedures",
        "Excluding preventive care",
        "None of the above",
      ],
      correct: "Treatment of minor ailments",
    },
    {
      question: "What is a valid reason for referral in PHC?",
      options: [
        "Patient preference",
        "Lack of specialized equipment",
        "Need for advanced diagnosis",
        "Inadequate staff training",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Which condition does NOT indicate a high-risk child in PHC?",
      options: [
        "Lethargy",
        "Severe dehydration",
        "Normal feeding",
        "Difficulty breathing",
        "None of the above",
      ],
      correct: "Normal feeding",
    },
    {
      question:
        "Which of the following is a characteristic of an effective health team in PHC?",
      options: [
        "Lack of cooperation",
        "Clear roles and responsibilities",
        "No communication",
        "Individual focus only",
        "None of the above",
      ],
      correct: "Clear roles and responsibilities",
    },
    {
      question:
        "What is the process of sharing information to achieve a common goal in PHC?",
      options: [
        "Documentation",
        "Communication",
        "Isolation",
        "Exclusion",
        "None of the above",
      ],
      correct: "Communication",
    },
    {
      question:
        "Which of the following is a barrier to effective communication in PHC?",
      options: [
        "Language differences",
        "Clear messaging",
        "Active listening",
        "Mutual understanding",
        "None of the above",
      ],
      correct: "Language differences",
    },
    {
      question:
        "Which of the following can cause developmental disabilities in children?",
      options: [
        "Maternal malnutrition",
        "Normal pregnancy",
        "Adequate prenatal care",
        "Healthy delivery",
        "None of the above",
      ],
      correct: "Maternal malnutrition",
    },
    {
      question:
        "Which of the following is a feature of a good health team in PHC?",
      options: [
        "Lack of collaboration",
        "Shared goals",
        "No accountability",
        "Poor communication",
        "None of the above",
      ],
      correct: "Shared goals",
    },
    {
      question: "Which of the following is a type of family structure in PHC?",
      options: [
        "Nuclear family",
        "Corporate family",
        "Institutional family",
        "Organizational family",
        "None of the above",
      ],
      correct: "Nuclear family",
    },
    {
      question:
        "Which of the following is a symptom of advanced HIV infection?",
      options: [
        "Weight loss",
        "Improved immunity",
        "Better appetite",
        "Increased energy",
        "None of the above",
      ],
      correct: "Weight loss",
    },
    {
      question:
        "Which of the following is an impact of domestic violence on children?",
      options: [
        "Improved academic performance",
        "Emotional trauma",
        "Better sleep patterns",
        "Enhanced social skills",
        "None of the above",
      ],
      correct: "Emotional trauma",
    },
    {
      question:
        "What is a negative impact of domestic violence on young people?",
      options: [
        "Increased self-esteem",
        "Social withdrawal",
        "Improved concentration",
        "Better mental health",
        "None of the above",
      ],
      correct: "Social withdrawal",
    },
    {
      question: "What is the role of a pharmacist in PHC?",
      options: [
        "Dispensing medications and counseling patients",
        "Performing surgeries",
        "Excluding patient education",
        "Focusing on emergency care only",
        "None of the above",
      ],
      correct: "Dispensing medications and counseling patients",
    },
    {
      question: "What is an advantage of traditional medicine in PHC?",
      options: [
        "It is often culturally accepted",
        "It requires laboratory testing",
        "It is always standardized",
        "It has no side effects",
        "None of the above",
      ],
      correct: "It is often culturally accepted",
    },
    {
      question: "What is a key goal of the National Health Policy in Nigeria?",
      options: [
        "Limiting healthcare access",
        "Achieving health for all Nigerians",
        "Excluding rural areas",
        "Focusing on tertiary care only",
        "None of the above",
      ],
      correct: "Achieving health for all Nigerians",
    },
    {
      question:
        "Why is health status lower in developing countries compared to developed ones?",
      options: [
        "Better healthcare access",
        "Higher disease burden",
        "Improved sanitation",
        "Lower poverty rates",
        "None of the above",
      ],
      correct: "Higher disease burden",
    },
    {
      question: "What is a key component of primary health care?",
      options: [
        "Specialized surgery",
        "Health education",
        "Advanced diagnostics",
        "Tertiary care",
      ],
      correct: "Health education",
    },
    {
      question: "Which organization promotes the Alma-Ata Declaration?",
      options: ["UNICEF", "WHO", "CDC", "FDA"],
      correct: "WHO",
    },
    {
      question: "What does PHC stand for?",
      options: [
        "Primary Health Care",
        "Public Health Center",
        "Personal Health Care",
        "Primary Hospital Care",
      ],
      correct: "Primary Health Care",
    },
    {
      question: "What is the main goal of PHC?",
      options: [
        "Cure rare diseases",
        "Promote overall health",
        "Perform complex surgeries",
        "Develop new drugs",
      ],
      correct: "Promote overall health",
    },
    {
      question: "Which of the following is a PHC service?",
      options: [
        "Immunization",
        "Organ transplant",
        "Cancer treatment",
        "Cosmetic surgery",
      ],
      correct: "Immunization",
    },
    {
      question: "What does community participation in PHC involve?",
      options: [
        "Only doctors deciding",
        "Community members in planning",
        "Excluding local leaders",
        "Only government funding",
      ],
      correct: "Community members in planning",
    },
    {
      question: "Which level of care is PHC considered?",
      options: ["Primary", "Secondary", "Tertiary", "Quaternary"],
      correct: "Primary",
    },
    {
      question: "What is a focus of PHC in maternal health?",
      options: [
        "Cosmetic procedures",
        "Prenatal care",
        "Advanced surgery",
        "Genetic testing",
      ],
      correct: "Prenatal care",
    },
    {
      question: "What does PHC emphasize for disease prevention?",
      options: [
        "Vaccinations",
        "Specialized treatment",
        "Hospitalization",
        "Drug development",
      ],
      correct: "Vaccinations",
    },
    {
      question: "Which PHC principle ensures affordability?",
      options: [
        "High-cost services",
        "Cost-effective care",
        "Private funding",
        "Specialized care",
      ],
      correct: "Cost-effective care",
    },
    {
      question: "What is a role of PHC workers?",
      options: [
        "Perform heart surgery",
        "Provide health education",
        "Develop pharmaceuticals",
        "Conduct lab research",
      ],
      correct: "Provide health education",
    },
    {
      question: "Which PHC component addresses clean water?",
      options: ["Sanitation", "Surgery", "Diagnostics", "Drug dispensing"],
      correct: "Sanitation",
    },
    {
      question: "What does PHC aim to reduce?",
      options: [
        "Health inequities",
        "Hospital profits",
        "Medical research",
        "Specialized care",
      ],
      correct: "Health inequities",
    },
    {
      question: "Which group is a key focus of PHC?",
      options: [
        "Urban elites",
        "Rural populations",
        "Hospital staff",
        "Pharmaceutical companies",
      ],
      correct: "Rural populations",
    },
    {
      question: "What is a PHC strategy for child health?",
      options: [
        "Growth monitoring",
        "Complex surgery",
        "Drug trials",
        "Cosmetic care",
      ],
      correct: "Growth monitoring",
    },
    {
      question: "Which PHC service includes family planning?",
      options: [
        "Emergency care",
        "Reproductive health",
        "Tertiary care",
        "Diagnostic imaging",
      ],
      correct: "Reproductive health",
    },
    {
      question: "What does PHC require for success?",
      options: [
        "Only hospital facilities",
        "Multisectoral collaboration",
        "High-cost equipment",
        "Private clinics",
      ],
      correct: "Multisectoral collaboration",
    },
    {
      question: "Which disease is a PHC focus for control?",
      options: [
        "Rare genetic disorders",
        "Malaria",
        "Complex cancers",
        "Cosmetic issues",
      ],
      correct: "Malaria",
    },
    {
      question: "What is a PHC approach to nutrition?",
      options: [
        "Food supplements",
        "Luxury diets",
        "Cosmetic nutrition",
        "Drug-based diets",
      ],
      correct: "Food supplements",
    },
    {
      question: "Which PHC principle involves local resources?",
      options: [
        "Imported technology",
        "Community-based care",
        "High-cost drugs",
        "Specialized hospitals",
      ],
      correct: "Community-based care",
    },
    {
      question: "What is a PHC method for health promotion?",
      options: [
        "Health campaigns",
        "Complex surgeries",
        "Drug trials",
        "Private clinics",
      ],
      correct: "Health campaigns",
    },
    {
      question: "Which PHC service includes injury prevention?",
      options: [
        "Safety education",
        "Cosmetic surgery",
        "Drug development",
        "Advanced diagnostics",
      ],
      correct: "Safety education",
    },
    {
      question: "What does PHC prioritize for accessibility?",
      options: [
        "Urban hospitals",
        "Local clinics",
        "Private specialists",
        "Overseas care",
      ],
      correct: "Local clinics",
    },
  ],
  "Anatomy and Physiology": [
    {
      question: "What is the largest bone in the human body?",
      options: ["Femur", "Humerus", "Tibia", "Skull"],
      correct: "Femur",
    },
    {
      question: "Which organ pumps blood?",
      options: ["Liver", "Heart", "Lung", "Kidney"],
      correct: "Heart",
    },
    {
      question: "What is the primary function of the lungs?",
      options: [
        "Digest food",
        "Filter blood",
        "Exchange gases",
        "Store nutrients",
      ],
      correct: "Exchange gases",
    },
    {
      question: "Which system includes the brain and spinal cord?",
      options: ["Nervous", "Digestive", "Respiratory", "Skeletal"],
      correct: "Nervous",
    },
    {
      question: "What is the role of red blood cells?",
      options: ["Fight infection", "Carry oxygen", "Clot blood", "Digest food"],
      correct: "Carry oxygen",
    },
    {
      question: "Which organ produces insulin?",
      options: ["Liver", "Pancreas", "Kidney", "Stomach"],
      correct: "Pancreas",
    },
    {
      question: "What is the largest organ of the human body?",
      options: ["Skin", "Liver", "Heart", "Brain"],
      correct: "Skin",
    },
    {
      question: "Which muscle type is involuntary?",
      options: ["Skeletal", "Cardiac", "Smooth", "All of the above"],
      correct: "Smooth",
    },
    {
      question: "What is the function of the kidneys?",
      options: [
        "Filter blood",
        "Produce bile",
        "Store glucose",
        "Exchange gases",
      ],
      correct: "Filter blood",
    },
    {
      question: "Which bone protects the brain?",
      options: ["Ribs", "Skull", "Spine", "Pelvis"],
      correct: "Skull",
    },
    {
      question: "What is the role of the liver?",
      options: [
        "Pump blood",
        "Detoxify substances",
        "Produce urine",
        "Exchange gases",
      ],
      correct: "Detoxify substances",
    },
    {
      question: "Which system regulates body temperature?",
      options: ["Integumentary", "Respiratory", "Digestive", "Skeletal"],
      correct: "Integumentary",
    },
    {
      question: "What is the function of the small intestine?",
      options: ["Absorb nutrients", "Store bile", "Filter blood", "Pump blood"],
      correct: "Absorb nutrients",
    },
    {
      question: "Which gland regulates metabolism?",
      options: ["Thyroid", "Pituitary", "Adrenal", "Pancreas"],
      correct: "Thyroid",
    },
    {
      question: "What is the role of white blood cells?",
      options: ["Carry oxygen", "Fight infection", "Clot blood", "Digest food"],
      correct: "Fight infection",
    },
    {
      question: "Which organ stores bile?",
      options: ["Liver", "Gallbladder", "Pancreas", "Stomach"],
      correct: "Gallbladder",
    },
    {
      question: "What is the primary function of the stomach?",
      options: [
        "Absorb nutrients",
        "Digest food",
        "Filter blood",
        "Exchange gases",
      ],
      correct: "Digest food",
    },
    {
      question: "Which system includes bones and cartilage?",
      options: ["Skeletal", "Muscular", "Nervous", "Respiratory"],
      correct: "Skeletal",
    },
    {
      question: "What is the role of the diaphragm?",
      options: ["Aid breathing", "Pump blood", "Digest food", "Filter blood"],
      correct: "Aid breathing",
    },
    {
      question: "…………………… is the tenth cranial nerve.",
      options: ["Accessory", "Olfactory", "Optic", "Trigeminal", "Vagus"],
      correct: "Vagus",
    },
    {
      question: "Which neuron transmits impulses to effector organs?",
      options: [
        "Association",
        "Sensory",
        "Motor",
        "Somatic",
        "None of the above",
      ],
      correct: "Motor",
    },
    {
      question:
        "A joint formed by a section of cartilage is an example of which type of joint?",
      options: [
        "Freely movable",
        "Slightly movable",
        "Immovable",
        "All of the above",
        "None of the above",
      ],
      correct: "Immovable",
    },
    {
      question:
        "Incomplete breakage of bone in which a part of the periosteum may still be intact is termed…………….",
      options: [
        "Greenstick fracture",
        "Compound fracture",
        "Comminuted fracture",
        "Simple fracture",
        "None of the above",
      ],
      correct: "Greenstick fracture",
    },
    {
      question: "Meiosis is important during……………………………..",
      options: [
        "Mitosis",
        "Blood cells formation",
        "Sex cell production",
        "Repair of body tissue",
        "Fertilizers",
      ],
      correct: "Sex cell production",
    },
    {
      question:
        "The smallest functional unit of the urinary system is called…………………",
      options: [
        "Neuron",
        "Cell",
        "Adrenal medulla",
        "Nephron",
        "None of the above",
      ],
      correct: "Nephron",
    },
    {
      question:
        "Which hormone controls the follicular phase of menstrual circle and from where is it secreted?",
      options: [
        "FSH, by adenohypophysis",
        "FSH, by neurohypophysis",
        "Prolactin, by hypothalamus",
        "GH, by Ovaries",
        "Insulin, by Pancreas",
      ],
      correct: "FSH, by adenohypophysis",
    },
    {
      question: "Majority of semen is produced by which organ?",
      options: [
        "Seminal vesicle",
        "Epididymis",
        "Prostate gland",
        "Seminiferous tubule",
        "Kidney",
      ],
      correct: "Seminiferous tubule",
    },
    {
      question: "Which type of muscle cells is multinucleated?",
      options: [
        "Smooth",
        "Skeletal",
        "Cardiac",
        "Muscular",
        "All of the above",
      ],
      correct: "Cardiac",
    },
    {
      question: "Breathing in and out air is referred to as………………………….",
      options: [
        "Pulmonary ventilation",
        "Selective reabsorption",
        "Internal respiration",
        "Cellular respiration",
        "Respiration",
      ],
      correct: "Pulmonary ventilation",
    },
    {
      question:
        "Nerve bundles with same origin, course and termination is called……………….",
      options: ["Nucleus", "Tract", "Nerve fibers", "Spine", "Organ"],
      correct: "Tract",
    },
    {
      question: "There are ………………………… spinal nerves.",
      options: ["12", "31", "30", "15", "17"],
      correct: "31",
    },
    {
      question: "…………………….. gland is the master gland.",
      options: ["Pineal", "Pancreas", "Adrenal", "Pituitary", "Hypophysis"],
      correct: "Pituitary",
    },
    {
      question: "How many hormones are produced by the adenohypophysis?",
      options: ["2", "4", "7", "5", "6"],
      correct: "7",
    },
    {
      question: "The ear has ………………….. parts.",
      options: ["2", "3", "4", "5", "6"],
      correct: "3",
    },
    {
      question: "Which of the following is not a layer of the epidermis?",
      options: [
        "Stratum granulosum",
        "Stratum basale",
        "Stratum epidermal",
        "Stratum lucidum",
        "a and c",
      ],
      correct: "a and c",
    },
    {
      question: "……………….. is not a function of the stomach.",
      options: [
        "Secretion of bile",
        "Storage of food",
        "Secrete HCl acid",
        "Mixing the stored food with gastric juice",
        "None of the above",
      ],
      correct: "Secretion of bile",
    },
    {
      question: "Which of these is not a type of bone?",
      options: ["Flat", "Irregular", "Short", "All of the above", "Broad"],
      correct: "Broad",
    },
    {
      question:
        "Delivery (of a baby) is an example of……………….. feedback mechanism.",
      options: [
        "Negative",
        "Positive",
        "Neutral",
        "All of the above",
        "None of the above",
      ],
      correct: "Positive",
    },
    {
      question: "Ovulation occurs at the ………………. Day of the menstrual circle.",
      options: ["1st", "7th", "3rd", "12th", "14th"],
      correct: "14th",
    },
    {
      question:
        "Red blood cells have an iron containing protein called…………………..",
      options: [
        "Red bone marrow",
        "Hemophilia",
        "Hemoglobin",
        "Iron iii",
        "Ferous sulphate",
      ],
      correct: "Hemoglobin",
    },
    {
      question:
        "Which of these is not part of the conductive system of the heart?",
      options: [
        "SA node",
        "AV node",
        "Bundles of His",
        "Interventricular node",
        "None of the above",
      ],
      correct: "Interventricular node",
    },
    {
      question: "The humoral adaptive immunity is mediated by ……………………..",
      options: [
        "Neutrophils",
        "B lymphocytes",
        "T lymphocytes",
        "Monocyte",
        "Cd4 cell",
      ],
      correct: "B lymphocytes",
    },
    {
      question:
        "Wrinkling on the skin as on grows old is as a result of all these except…………………………………",
      options: [
        "Deterioration of elastic fibers",
        "Deterioration of cartilages",
        "Decrease in sebum production",
        "Decrease in melanin production",
        "a and c",
      ],
      correct: "Decrease in melanin production",
    },
    {
      question: "Which of these is not a layer of the heart?",
      options: [
        "Myocardium",
        "Endocardium",
        "Epicardium",
        "All of the above",
        "Atriocardium",
      ],
      correct: "Atriocardium",
    },
    {
      question: "Which type of epithelial tissue is found in the endocardium?",
      options: [
        "Simple cuboidal",
        "Simple squamous",
        "Simple columnar",
        "Stratified squamous",
        "Complex squamous",
      ],
      correct: "Simple squamous",
    },
    {
      question: "Which of these organelles is not found in an animal cell?",
      options: [
        "Nucleus",
        "Ribosomes",
        "Lysosome",
        "Golgi apparatus",
        "Cell wall",
      ],
      correct: "Cell wall",
    },
    {
      question:
        "Central nucleus, mono- nucleated, striated and involuntary. Which type of muscle is it?",
      options: ["Skeletal", "Smooth", "Endocrine", "Cardiac", "Pelvic"],
      correct: "Cardiac",
    },
    {
      question: "Which of these is not a phase in menstrual cycle?",
      options: [
        "Follicular",
        "Menstrual",
        "Luteal",
        "None of the above",
        "All of the above",
      ],
      correct: "None of the above",
    },
    {
      question:
        "Sleep-wake cycle 'circadian rhythm' is controlled by a hormone melatonin secreted by ……………………..……..",
      options: [
        "Pineal gland",
        "Pancreas",
        "Hypothalamus",
        "Pituitary gland",
        "Endocrine gland",
      ],
      correct: "Pineal gland",
    },
    {
      question:
        "Over-secretion of growth hormone before cessation of growth leads to………………………………..………………..",
      options: [
        "Acromegaly",
        "Gigantism",
        "Dwarfism",
        "Ulcer",
        "Addison’s disease",
      ],
      correct: "Gigantism",
    },
    {
      question:
        "The………………. Converts vibrations of the organ of corti to electrical signals.",
      options: ["Ear cells", "Hair cells", "Cochlear", "Ganglion", "Brain"],
      correct: "Hair cells",
    },
    {
      question: "What is the location of the pancreas?",
      options: [
        "Superio- and lateral to the stomach",
        "Antero-inferior to the stomach",
        "Anterio-superior to the stomach",
        "Postero-inferior to the stomach",
        "Postero-superior to the stomach",
      ],
      correct: "Postero-inferior to the stomach",
    },
    {
      question:
        "Only cells with a ………………. for a particular hormone respond to it.",
      options: ["Name", "Receptor", "Component", "Impulse", "Mitochondrion"],
      correct: "Receptor",
    },
    {
      question: "The hypothalamus controls the following except…………………..",
      options: ["Hunger", "Thirst", "Intelligence", "Mood", "Fight"],
      correct: "Intelligence",
    },
    {
      question: "The length of the spinal cord is approximately………………………",
      options: ["20-30 cm", "30-40 cm", "40-50 cm", "50-60 cm", "25-35 cm"],
      correct: "40-50 cm",
    },
    {
      question:
        "Which hormone causes contraction of the uterus termed 'labor pain'?",
      options: [
        "Oxytocin",
        "Progesterone",
        "Adrenalin",
        "Vasopressin",
        "Insulin",
      ],
      correct: "Oxytocin",
    },
    {
      question:
        "The smallest structural and functional unit of the nervous system is the…………………………",
      options: ["Neuron", "Tissue", "Cell", "Shell", "ganglion"],
      correct: "Neuron",
    },
    {
      question: "Optic nerve carries …………………………. Impulses.",
      options: ["Olfactory", "Nervous", "Taste", "All of the above", "Visual"],
      correct: "Visual",
    },
    {
      question:
        "A point of communication between a neuron and another or an effector organ is………….",
      options: [
        "Junction",
        "Neural junction",
        "Synapse",
        "Spree",
        "Neuromuscular junction",
      ],
      correct: "Synapse",
    },
    {
      question: "The protective layer of the eye is the………………………….",
      options: ["Retina", "Choroid", "Sclera", "Pupil", "Synovial fluid"],
      correct: "Sclera",
    },
    {
      question: "Schwann cells' function is…………………………….",
      options: [
        "Transmit information",
        "Reception of impulse",
        "Myelinate axons of nerves in PNS",
        "Myelinate axons of nerves in CNS",
        "Translocate information",
      ],
      correct: "Myelinate axons of nerves in PNS",
    },
    {
      question: "What is the number of the facial bones?",
      options: ["14", "16", "18", "20", "15"],
      correct: "14",
    },
    {
      question: "The spinal cord starts from…………... And terminates at…………………..",
      options: [
        "C1 vertebra and T12 vertebra",
        "C4 vertebra and L1/ L2 vertebra",
        "Foramen magnum and L1/L2 vertebra",
        "Foramen magnum and coccygeal vertebra",
        "C1 vertebra and T12 vertebra",
      ],
      correct: "Foramen magnum and L1/L2 vertebra",
    },
    {
      question: "How many daughter cells are produced during mitosis?",
      options: ["1", "2", "3", "4", "5"],
      correct: "2",
    },
    {
      question: "Which of the following is not a part of the airway?",
      options: [
        "Trachea",
        "Larynx",
        "Esophagus",
        "Bronchi",
        "None of the above",
      ],
      correct: "Esophagus",
    },
    {
      question:
        "What branch of nervous system controls 'flight or fight mood'?",
      options: [
        "Reflex",
        "Flight mechanism",
        "Neuroglia",
        "Synapse",
        "Sympathetic nervous system",
      ],
      correct: "Sympathetic nervous system",
    },
    {
      question: "Which of the following is not a neuroglia?",
      options: [
        "Oligodendrocytes",
        "Schwann cell",
        "Microglia",
        "Neutrophils",
        "None of the above",
      ],
      correct: "Neutrophils",
    },
    {
      question:
        "The hormone that encourages water reabsorption in the nephrons of the kidney is …………..",
      options: ["TSH", "FSH", "GnTH", "PTH", "ADH"],
      correct: "ADH",
    },
    {
      question: "Light rays pass through the ……………………………..",
      options: ["Retina", "Pupil", "Iris", "Conjunctiva", "Aquous humor"],
      correct: "Pupil",
    },
    {
      question: "The 'control center' of the cell is called the …………………",
      options: [
        "Nucleus",
        "Smooth ER",
        "Rough ER",
        "Nucleolus",
        "Nuclear acid",
      ],
      correct: "Nucleus",
    },
    {
      question:
        "All these refer to the cells that work with the neural cells except……………………",
      options: [
        "Inter-neurons",
        "Glial cells",
        "Neuroglial cells",
        "Supporting cells",
        "None of the above",
      ],
      correct: "None of the above",
    },
    {
      question:
        "Pulmonary ventilation is the exchange of gases between the atmosphere and alveoli",
      options: ["True", "False"],
      correct: "True",
    },
    {
      question: "Lung capacity increases with age",
      options: ["True", "False", "None of the above", "All of the above"],
      correct: "False",
    },
    {
      question: "Hypoxia is a tissue-level deficiency of",
      options: ["Oxygen", "Carbon dioxide", "Carbon monoxide", "Water"],
      correct: "Oxygen",
    },
    {
      question:
        "The posterior thoracic cage is composed of how many pairs of ribs",
      options: ["8", "10", "12", "14"],
      correct: "12",
    },
    {
      question: "The most common disease of the joint is",
      options: [
        "Osteoarthritis",
        "Bone breakdown faster than repair",
        "Rheumatoid arthritis",
        "Gout",
      ],
      correct: "Osteoarthritis",
    },
    {
      question:
        "The effect of frequent stimuli on a muscle fiber is to increase",
      options: [
        "Actin-myosin cross bridges",
        "Partial contraction",
        "A single twitch",
        "The force of the contraction",
      ],
      correct: "The force of the contraction",
    },
    {
      question: "Mature bone cells are called",
      options: ["Osteoid", "Osteoclasts", "Osteocytes", "Canaliculi"],
      correct: "Osteocytes",
    },
    {
      question: "The primary hormone that regulates labor contraction is",
      options: ["Estrogen", "Progesterone", "Relaxin", "Oxytocin"],
      correct: "Oxytocin",
    },
    {
      question: "The nose is to the mouth",
      options: ["Superior", "Inferior", "Medial", "Posterior"],
      correct: "Superior",
    },
    {
      question:
        "A myelinated axon transmits a signal compared to a non-myelinated axon",
      options: [
        "More slowly",
        "More quickly",
        "At the same rate",
        "More accurately",
      ],
      correct: "More quickly",
    },
    {
      question:
        "Which best describes the pathway of urine from the kidney out of the body",
      options: [
        "Renal pelvis, bladder, urethra",
        "Ureter, renal pelvis, bladder, urethra",
        "Renal pelvis, ureter, bladder, urethra",
        "Bladder, urethra, renal pelvis, urethra",
      ],
      correct: "Renal pelvis, ureter, bladder, urethra",
    },
    {
      question: "The main components of the blood are",
      options: [
        "Platelets, red blood cells, plasma, white blood cells",
        "Red blood cells, platelets",
        "Protein, plasma, neutrophils",
        "White blood cells, red blood cells, oxygen",
      ],
      correct: "Platelets, red blood cells, plasma, white blood cells",
    },
    {
      question: "Mature sperm cells have how many chromosomes",
      options: ["46", "23"],
      correct: "23",
    },
    {
      question: "All of the following are functions of the skin except",
      options: [
        "Vitamin D synthesis",
        "Protection",
        "Temperature regulation",
        "Vitamin C synthesis",
      ],
      correct: "Vitamin C synthesis",
    },
    {
      question: "Blood does all of the following except",
      options: [
        "Destroy invading pathogens",
        "Transport oxygen and carbon dioxide",
        "Transport endocrine hormones",
        "Produce stem cells",
      ],
      correct: "Produce stem cells",
    },
    {
      question: "The kidney is surrounded by how many layers",
      options: ["2", "3", "4", "5"],
      correct: "3",
    },
    {
      question: "The pharynx is divided into how many subdivisions",
      options: ["2", "3", "4", "5"],
      correct: "3",
    },
    {
      question:
        "The name of the arteries facilitating blood flow to and from the lower limbs is",
      options: ["Bronchial", "Mesenteric", "Femoral", "Carotid"],
      correct: "Femoral",
    },
    {
      question: "Blood pressure is highest when leaving which heart chamber",
      options: [
        "Right atrium",
        "Right ventricle",
        "Left atrium",
        "Left ventricle",
      ],
      correct: "Left ventricle",
    },
    {
      question: "The immune system can be classified into two main categories",
      options: [
        "Humoral and cell-mediated",
        "Specific and non-specific",
        "Specific and humoral",
        "Cell-mediated and specific",
      ],
      correct: "Specific and non-specific",
    },
    {
      question: "Which of the following is a universal donor blood type",
      options: ["O Rh-", "O Rh+", "A Rh+", "B Rh+"],
      correct: "O Rh-",
    },
    {
      question: "What is the normal range for hemoglobin in adult males",
      options: ["13-18 g/dL", "8-10 g/dL", "20-25 g/dL", "5-7 g/dL"],
      correct: "13-18 g/dL",
    },
    {
      question: "How many types of leukocytes are there in human blood",
      options: ["5", "6", "4", "2"],
      correct: "5",
    },
    {
      question: "What is the normal range for red blood cell count in adults",
      options: [
        "4.5-5.9 million/µL",
        "2-3 million/µL",
        "7-8 million/µL",
        "1-2 million/µL",
      ],
      correct: "4.5-5.9 million/µL",
    },
    {
      question: "The normal blood pH range is",
      options: ["6.8-7.0", "7.0-7.1", "7.35-7.45", "7.55-7.65"],
      correct: "7.35-7.45",
    },
    {
      question: "Which blood cells actively participate in blood clotting",
      options: ["Platelets", "RBCs", "WBCs", "All of the above"],
      correct: "Platelets",
    },
    {
      question: "Melatonin is secreted by",
      options: [
        "The- The pancreas",
        "The pineal gland",
        "The keratinocytes of the skin",
        "The ovaries",
      ],
      correct: "The pineal gland",
    },
    {
      question: "The thyroid gland is",
      options: [
        "Located inferior to the larynx",
        "Produces antidiuretic hormone",
        "Secretes small amounts of insulin",
        "Helps initiate milk production",
      ],
      correct: "Located inferior to the larynx",
    },
    {
      question: "The spermatic cord is a structure that includes the",
      options: [
        "Ductus deferens, blood vessels, nerves, and lymphatics",
        "Vas deferens, prostate glands, blood vessels, and urethra",
        "Not sure",
        "None of the above",
      ],
      correct: "Ductus deferens, blood vessels, nerves, and lymphatics",
    },
    {
      question: "Powerful rhythmic contractions of the pelvic floor result in",
      options: ["Emission", "Erection", "Ejaculation", "Sperm production"],
      correct: "Ejaculation",
    },
    {
      question:
        "The most dangerous period in prenatal or postnatal life is the",
      options: [
        "First trimester",
        "Second trimester",
        "Third trimester",
        "Expulsion stage",
      ],
      correct: "First trimester",
    },
    {
      question: "The cerebral hemisphere is divided into how many lobes",
      options: ["2", "3", "4", "5"],
      correct: "4",
    },
    {
      question: "How many cranial nerves originate in the brain",
      options: ["8", "10", "12", "14"],
      correct: "12",
    },
    {
      question: "The spinal cord is continuous with which region of the brain",
      options: ["Cerebrum", "Medulla oblongata", "Midbrain", "Pons"],
      correct: "Medulla oblongata",
    },
    {
      question:
        "Nerve impulses from visual stimuli are integrated in which lobe",
      options: ["Frontal", "Temporal", "Occipital", "Parietal"],
      correct: "Occipital",
    },
    {
      question: "Blood flows out of the ventricles when",
      options: [
        "The atrioventricular valves are open",
        "The semilunar valves are open",
        "The bicuspid valves are open",
        "The mitral valves are closed",
      ],
      correct: "The semilunar valves are open",
    },
    {
      question: "Cardiac output is the amount of blood pumped by",
      options: [
        "One ventricle in one minute",
        "One atrium in one minute",
        "Both ventricles in one minute",
        "Both atria in one minute",
      ],
      correct: "One ventricle in one minute",
    },
    {
      question: "In males, testosterone is produced by",
      options: [
        "Interstitial cells",
        "Seminiferous tubules",
        "Epididymis",
        "Vas deferens",
      ],
      correct: "Interstitial cells",
    },
    {
      question: "The male gonads are called",
      options: ["Testes", "Ovaries", "Accessory sex glands", "The sperm ducts"],
      correct: "Testes",
    },
    {
      question: "The fertilized ovum is called",
      options: [
        "A blastocyst",
        "A secondary oocyte",
        "A diploid cell",
        "A zygote",
      ],
      correct: "A zygote",
    },
    {
      question: "The female external genitalia are called",
      options: [
        "The pubic symphysis",
        "The vagina",
        "The vulva",
        "The clitoris",
      ],
      correct: "The vulva",
    },
    {
      question: "Powerful rhythmic contractions of the pelvic floor result in",
      options: ["Emission", "Erection", "Ejaculation", "Sperm production"],
      correct: "Ejaculation",
    },
    {
      question: "The blood vessel is lined by this epithelial tissue",
      options: ["Simple squamous", "Cuboidal", "Pseudostratified", "Columnar"],
      correct: "Simple squamous",
    },
    {
      question: "The skin contains the protein substance called",
      options: ["Actin", "Myosin", "Keratin", "Globulin"],
      correct: "Keratin",
    },
    {
      question: "The single cell that is located in the nose is called",
      options: ["Myocyte", "Neuron", "Erythrocyte", "Goblet"],
      correct: "Goblet",
    },
    {
      question: "Muscle is a type of connective tissue",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "False",
    },
    {
      question: "There are five types of bone",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "True",
    },
    {
      question:
        "Sensory neurons initiate the stimulus that allows a muscle to contract",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "False",
    },
    {
      question:
        "The inability of a muscle to maintain its contraction or strength is called muscle fatigue",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "True",
    },
    {
      question:
        "The inability of a muscle to maintain its contraction or strength is called muscle fatigue",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "True",
    },
    {
      question: "Skeletal muscle is under voluntary control",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "True",
    },
    {
      question: "Osteocytes are involved in bone resorption",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "False",
    },
    {
      question: "The hinge joint is an example of a synovial joint",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "True",
    },
    {
      question: "The patella is a type of flat bone",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "False",
    },
    {
      question:
        "There are three classes of joints based on anatomical characteristics",
      options: ["True", "False", "Not sure", "Not exist"],
      correct: "True",
    },
    {
      question: "In most reflex actions, sensory neurons synapse in",
      options: [
        "The dura mater",
        "The cerebrospinal fluid",
        "The spinal cord",
        "The brainstem",
      ],
      correct: "The spinal cord",
    },
    {
      question: "Insulin is produced in the pancreas by which cells",
      options: ["Alpha cells", "Beta cells", "Delta cells", "F cells"],
      correct: "Beta cells",
    },
    {
      question:
        "This hormone acts on the intestine and causes increased calcium reabsorption",
      options: [
        "Calcitonin",
        "Calcitriol",
        "Thyroxine",
        "Pancreatic polypeptide",
      ],
      correct: "Calcitriol",
    },
    {
      question: "Which hormone is secreted in response to high blood glucose",
      options: ["Insulin", "Glucagon", "Cortisol", "Oxytocin"],
      correct: "Insulin",
    },
    {
      question: "Lack of insulin hormone receptors on cells can result in",
      options: [
        "Diabetes insipidus",
        "Type 1 diabetes mellitus",
        "Type 2 diabetes mellitus",
        "Gestational diabetes",
      ],
      correct: "Type 2 diabetes mellitus",
    },
    {
      question:
        "Which of the following characteristics is the same for the nervous and endocrine systems",
      options: [
        "Target cells affected",
        "Duration of action",
        "Speed of response",
        "Mechanism of control",
      ],
      correct: "Target cells affected",
    },
    {
      question: "The hardest and strongest bone in the body is",
      options: ["Long bone", "Patella bone", "Teeth", "Skull bone"],
      correct: null,
    },
    {
      question: "A single ejaculation contains this number of spermatozoa",
      options: [
        "About 500",
        "About 200,000",
        "About 1 million",
        "About 200 million",
      ],
      correct: "About 200 million",
    },
    {
      question: "The primary muscle responsible for inhalation is the",
      options: [
        "Diaphragm",
        "Pectoralis major",
        "Latissimus dorsi",
        "Rectus abdominis",
      ],
      correct: "Diaphragm",
    },
    {
      question: "Which part of the brain regulates heart rate and breathing",
      options: ["Cerebellum", "Hypothalamus", "Medulla oblongata", "Thalamus"],
      correct: "Medulla oblongata",
    },
    {
      question: "The epiglottis prevents food from entering the",
      options: ["Esophagus", "Trachea", "Pharynx", "Larynx"],
      correct: "Trachea",
    },
    {
      question: "Which bone articulates with the humerus at the elbow joint",
      options: ["Radius", "Scapula", "Clavicle", "Tibia"],
      correct: "Radius",
    },
    {
      question: "The hormone cortisol is secreted by the",
      options: [
        "Pituitary gland",
        "Adrenal cortex",
        "Thyroid gland",
        "Pancreas",
      ],
      correct: "Adrenal cortex",
    },
    {
      question: "The smallest unit of skeletal muscle contraction is the",
      options: ["Myofibril", "Sarcomere", "Actin filament", "Myosin head"],
      correct: "Sarcomere",
    },
    {
      question:
        "Which blood vessel carries deoxygenated blood from the heart to the lungs",
      options: [
        "Aorta",
        "Pulmonary artery",
        "Pulmonary vein",
        "Coronary artery",
      ],
      correct: "Pulmonary artery",
    },
    {
      question: "The primary function of the large intestine is to",
      options: [
        "Absorb nutrients",
        "Secrete digestive enzymes",
        "Absorb water",
        "Produce bile",
      ],
      correct: "Absorb water",
    },
    {
      question: "Which type of joint is found in the skull",
      options: ["Synovial", "Cartilaginous", "Fibrous", "Hinge"],
      correct: "Fibrous",
    },
    {
      question:
        "The neurotransmitter released at the neuromuscular junction is",
      options: ["Dopamine", "Serotonin", "Acetylcholine", "GABA"],
      correct: "Acetylcholine",
    },
    {
      question: "The glomerulus is located in which part of the kidney",
      options: ["Renal pelvis", "Nephron", "Ureter", "Bladder"],
      correct: "Nephron",
    },
    {
      question: "Which vitamin is essential for collagen synthesis",
      options: ["Vitamin A", "Vitamin C", "Vitamin D", "Vitamin E"],
      correct: "Vitamin C",
    },
    {
      question: "The autonomic nervous system controls",
      options: [
        "Voluntary movements",
        "Involuntary functions",
        "Sensory perception",
        "Cognitive processes",
      ],
      correct: "Involuntary functions",
    },
    {
      question: "The parietal pleura lines the",
      options: [
        "Lung surface",
        "Thoracic cavity wall",
        "Heart surface",
        "Diaphragm",
      ],
      correct: "Thoracic cavity wall",
    },
    {
      question: "Which hormone stimulates red blood cell production",
      options: ["Insulin", "Erythropoietin", "Calcitonin", "Prolactin"],
      correct: "Erythropoietin",
    },
    {
      question: "The clavicle is classified as what type of bone",
      options: ["Flat", "Long", "Short", "Irregular"],
      correct: "Long",
    },
    {
      question: "The structure that connects the fetus to the placenta is the",
      options: ["Amnion", "Chorion", "Umbilical cord", "Yolk sac"],
      correct: "Umbilical cord",
    },
    {
      question: "Which part of the ear is responsible for balance",
      options: [
        "Cochlea",
        "Tympanic membrane",
        "Semicircular canals",
        "Auditory ossicles",
      ],
      correct: "Semicircular canals",
    },
    {
      question: "The enzyme pepsin is primarily active in the",
      options: ["Mouth", "Stomach", "Small intestine", "Pancreas"],
      correct: "Stomach",
    },
    {
      question: "The primary source of energy for cardiac muscle is",
      options: ["Glucose", "Fatty acids", "Amino acids", "Lactic acid"],
      correct: "Fatty acids",
    },
    {
      question:
        "Which structure separates the right and left ventricles of the heart",
      options: [
        "Atrial septum",
        "Ventricular septum",
        "Tricuspid valve",
        "Mitral valve",
      ],
      correct: "Ventricular septum",
    },
    {
      question: "The process of swallowing is controlled by the",
      options: ["Cerebellum", "Medulla oblongata", "Hypothalamus", "Pons"],
      correct: "Medulla oblongata",
    },
    {
      question: "The scapula is classified as what type of bone",
      options: ["Long", "Short", "Flat", "Irregular"],
      correct: "Flat",
    },
    {
      question:
        "Which hormone regulates blood calcium levels by increasing bone resorption",
      options: ["Calcitonin", "Parathyroid hormone", "Thyroxine", "Insulin"],
      correct: "Parathyroid hormone",
    },
    {
      question: "The functional unit of the nervous system is the",
      options: ["Neuron", "Glial cell", "Synapse", "Axon"],
      correct: "Neuron",
    },
    {
      question:
        "Which part of the small intestine is primarily responsible for nutrient absorption",
      options: ["Duodenum", "Jejunum", "Ileum", "Cecum"],
      correct: "Jejunum",
    },
    {
      question:
        "The ligament that connects bones at a synovial joint is made of",
      options: [
        "Elastic cartilage",
        "Dense connective tissue",
        "Hyaline cartilage",
        "Fibrocartilage",
      ],
      correct: "Dense connective tissue",
    },
    {
      question: "The sinoatrial node is located in the",
      options: ["Right atrium", "Left ventricle", "Aorta", "Pulmonary artery"],
      correct: "Right atrium",
    },
    {
      question: "Which gland is responsible for secreting growth hormone",
      options: ["Thyroid", "Adrenal medulla", "Pituitary", "Pineal"],
      correct: "Pituitary",
    },
    {
      question: "The process of breaking down glycogen into glucose is called",
      options: ["Gluconeogenesis", "Glycogenolysis", "Glycolysis", "Lipolysis"],
      correct: "Glycogenolysis",
    },
    {
      question:
        "Which cranial nerve is responsible for facial sensation and chewing",
      options: [
        "Optic (II)",
        "Trigeminal (V)",
        "Vagus (X)",
        "Hypoglossal (XII)",
      ],
      correct: "Trigeminal (V)",
    },
    {
      question: "The primary function of the gallbladder is to",
      options: ["Produce bile", "Store bile", "Digest proteins", "Absorb fats"],
      correct: "Store bile",
    },
    {
      question: "The type of muscle found in the walls of blood vessels is",
      options: ["Skeletal", "Cardiac", "Smooth", "Striated"],
      correct: "Smooth",
    },
    {
      question:
        "Which structure in the eye regulates the amount of light entering",
      options: ["Cornea", "Iris", "Lens", "Retina"],
      correct: "Iris",
    },
    {
      question: "The hormone aldosterone primarily affects",
      options: [
        "Blood sugar levels",
        "Sodium reabsorption",
        "Calcium metabolism",
        "Heart rate",
      ],
      correct: "Sodium reabsorption",
    },
    {
      question: "The talus bone is located in the",
      options: ["Wrist", "Ankle", "Spine", "Pelvis"],
      correct: "Ankle",
    },
    {
      question:
        "Which part of the brain is responsible for coordinating voluntary movements",
      options: ["Cerebellum", "Thalamus", "Hippocampus", "Amygdala"],
      correct: "Cerebellum",
    },
    {
      question:
        "The primary site of red blood cell production in adults is the",
      options: ["Liver", "Spleen", "Bone marrow", "Lymph nodes"],
      correct: "Bone marrow",
    },
    {
      question: "The structure that protects the spinal cord is the",
      options: ["Cranium", "Vertebral column", "Ribs", "Pelvic girdle"],
      correct: "Vertebral column",
    },
    {
      question:
        "The hormone responsible for milk ejection during breastfeeding is",
      options: ["Prolactin", "Oxytocin", "Estrogen", "Progesterone"],
      correct: "Oxytocin",
    },
    {
      question: "Which bone forms the cheekbone",
      options: ["Maxilla", "Mandible", "Zygomatic", "Nasal"],
      correct: "Zygomatic",
    },
    {
      question: "The primary function of surfactant in the lungs is to",
      options: [
        "Increase airway resistance",
        "Reduce surface tension",
        "Filter inhaled particles",
        "Enhance gas exchange",
      ],
      correct: "Reduce surface tension",
    },
    {
      question: "The bundle of His is part of the heart’s",
      options: [
        "Valvular system",
        "Conduction system",
        "Coronary arteries",
        "Pericardium",
      ],
      correct: "Conduction system",
    },
    {
      question: "Which joint allows for rotation, such as in the neck",
      options: ["Hinge", "Ball-and-socket", "Pivot", "Saddle"],
      correct: "Pivot",
    },
    {
      question: "The hormone that stimulates ovulation in females is",
      options: [
        "Follicle-stimulating hormone",
        "Luteinizing hormone",
        "Progesterone",
        "Estrogen",
      ],
      correct: "Luteinizing hormone",
    },
    {
      question:
        "The structure that regulates blood flow from the ventricles to the arteries is the",
      options: [
        "Atrioventricular valve",
        "Semilunar valve",
        "Sinoatrial node",
        "Chordae tendineae",
      ],
      correct: "Semilunar valve",
    },
    {
      question: "Which type of tissue lines the urinary bladder",
      options: [
        "Simple squamous epithelium",
        "Stratified squamous epithelium",
        "Transitional epithelium",
        "Pseudostratified epithelium",
      ],
      correct: "Transitional epithelium",
    },
    {
      question: "The primary role of hemoglobin in red blood cells is to",
      options: [
        "Fight infections",
        "Transport oxygen",
        "Clot blood",
        "Regulate pH",
      ],
      correct: "Transport oxygen",
    },
    {
      question: "The part of the kidney responsible for filtering blood is the",
      options: [
        "Renal pelvis",
        "Glomerulus",
        "Loop of Henle",
        "Collecting duct",
      ],
      correct: "Glomerulus",
    },
    {
      question: "Which muscle is primarily responsible for flexing the elbow",
      options: [
        "Triceps brachii",
        "Biceps brachii",
        "Deltoid",
        "Brachioradialis",
      ],
      correct: "Biceps brachii",
    },
    {
      question:
        "The structure that carries visual information from the retina to the brain is the",
      options: ["Optic nerve", "Oculomotor nerve", "Cornea", "Sclera"],
      correct: "Optic nerve",
    },
    {
      question:
        "The structure that carries urine from the bladder to the outside of the body is the",
      options: ["Ureter", "Urethra", "Renal pelvis", "Nephron"],
      correct: "Urethra",
    },
    {
      question: "Which hormone is secreted by the posterior pituitary gland",
      options: [
        "Growth hormone",
        "Thyroxine",
        "Antidiuretic hormone",
        "Cortisol",
      ],
      correct: "Antidiuretic hormone",
    },
    {
      question: "The bone that forms the forehead is the",
      options: ["Parietal", "Temporal", "Frontal", "Occipital"],
      correct: "Frontal",
    },
    {
      question: "The primary function of the lymphatic system is to",
      options: [
        "Transport oxygen",
        "Return fluid to the bloodstream",
        "Digest fats",
        "Produce red blood cells",
      ],
      correct: "Return fluid to the bloodstream",
    },
    {
      question:
        "Which part of the brain relays sensory information to the cerebral cortex",
      options: ["Hypothalamus", "Thalamus", "C cerebellum", "Pons"],
      correct: "Thalamus",
    },
    {
      question:
        "The type of muscle contraction that occurs without a change in length is",
      options: ["Isotonic", "Isometric", "Concentric", "Eccentric"],
      correct: "Isometric",
    },
    {
      question: "The primary source of bile production is the",
      options: ["Gallbladder", "Pancreas", "Liver", "Duodenum"],
      correct: "Liver",
    },
    {
      question: "Which blood vessel supplies blood to the heart muscle",
      options: ["Coronary artery", "Pulmonary vein", "Aorta", "Vena cava"],
      correct: "Coronary artery",
    },
    {
      question: "The structure that protects the brain is the",
      options: ["Vertebral column", "Cranium", "Ribs", "Pelvis"],
      correct: "Cranium",
    },
    {
      question:
        "Which hormone stimulates the development of male secondary sexual characteristics",
      options: ["Estrogen", "Progesterone", "Testosterone", "Prolactin"],
      correct: "Testosterone",
    },
    {
      question: "The part of the eye that focuses light onto the retina is the",
      options: ["Cornea", "Iris", "Lens", "Pupil"],
      correct: "Lens",
    },
    {
      question: "The primary function of the pancreas in digestion is to",
      options: [
        "Produce bile",
        "Secrete digestive enzymes",
        "Absorb nutrients",
        "Store glucose",
      ],
      correct: "Secrete digestive enzymes",
    },
    {
      question:
        "The structure that connects the two cerebral hemispheres is the",
      options: ["Corpus callosum", "Cerebellum", "Thalamus", "Pons"],
      correct: "Corpus callosum",
    },
    {
      question:
        "Which hormone is primarily responsible for regulating metabolism",
      options: ["Insulin", "Thyroxine", "Cortisol", "Adrenaline"],
      correct: "Thyroxine",
    },
    {
      question: "The primary muscle used for extending the knee is the",
      options: [
        "Hamstring",
        "Quadriceps femoris",
        "Gastrocnemius",
        "Tibialis anterior",
      ],
      correct: "Quadriceps femoris",
    },
    {
      question: "The process of filtration in the kidney occurs in the",
      options: [
        "Proximal tubule",
        "Bowman’s capsule",
        "Loop of Henle",
        "Distal tubule",
      ],
      correct: "Bowman’s capsule",
    },
    {
      question: "The muscle that closes the jaw is the",
      options: [
        "Masseter",
        "Temporalis",
        "Orbicularis oris",
        "Sternocleidomastoid",
      ],
      correct: "Masseter",
    },
    {
      question:
        "The primary source of energy for skeletal muscle during prolonged exercise is",
      options: ["Glucose", "Fatty acids", "Proteins", "Creatine phosphate"],
      correct: "Fatty acids",
    },
    {
      question: "Which cranial nerve controls tongue movement",
      options: [
        "Trigeminal (V)",
        "Facial (VII)",
        "Glossopharyngeal (IX)",
        "Hypoglossal (XII)",
      ],
      correct: "Hypoglossal (XII)",
    },
    {
      question: "The structure that protects the heart is the",
      options: ["Pericardium", "Pleura", "Diaphragm", "Mediastinum"],
      correct: "Pericardium",
    },
    {
      question: "Which of the following hormone is produced the hypothalamus?",
      options: [
        "Melanin",
        "Melatonin",
        "Vasopressin",
        "Insulin",
        "Epinephrine",
      ],
      correct: "Melatonin",
    },
    {
      question: "The photo-receptors of the eye are found in the………………………..",
      options: ["Retina", "Choroid", "Vitreous body", "Lens", "Optic nerve"],
      correct: "Retina",
    },
    {
      question:
        "The cranial nerve that carry the impulses from the cochlear to the brain is ……………………..",
      options: [
        "Optic",
        "Olfactory",
        "Ear-cochlear",
        "Spinal",
        "Vestibulo-cochlear",
      ],
      correct: "Vestibulo-cochlear",
    },
    {
      question: "In which part are sperm cells produced?",
      options: [
        "Ovaries",
        "Seminiferous tubules",
        "Kidneys",
        "Epididymis",
        "Penis",
      ],
      correct: "Seminiferous tubules",
    },
    {
      question: "The semi-circular canals are responsible for……………………………….",
      options: ["Hearing", "Balancing", "Amplification", "Audition", "Seeing"],
      correct: "Balancing",
    },
    {
      question: "Glucose homeostasis is controlled by…………………………………… hormones.",
      options: [
        "FST and LH",
        "GnTH and T3",
        "T3 and T4",
        "Pancreas and exocrine",
        "Insulin and glucagon",
      ],
      correct: "Insulin and glucagon",
    },
    {
      question:
        "The frontal lobe of the brain is responsible for the following except………………",
      options: [
        "Intelligence",
        "Creative thinking",
        "Hearing",
        "Abstract thinking",
        "None of the above",
      ],
      correct: "Hearing",
    },
    {
      question: "Bone forming cells are also called………………………….",
      options: [
        "Osteocytes",
        "Chondrocytes",
        "Monocytes",
        "Osteomalacia",
        "Osteoblasts",
      ],
      correct: "Osteoblasts",
    },
    {
      question: "Breathing at normal resting condition is called……………………….",
      options: ["Eupnoea", "Apnea", "Strial", "Stroma", "Osmosis"],
      correct: "Eupnoea",
    },
    {
      question: "Which of the following bones is part of the cranium?",
      options: ["Femur", "Tibia", "Frontal", "Humerus", "Patella"],
      correct: "Frontal",
    },
    {
      question: "The main function of the small intestine is to",
      options: [
        "Absorb nutrients",
        "Store bile",
        "Produce enzymes",
        "Filter blood",
        "Store feces",
      ],
      correct: "Absorb nutrients",
    },
    {
      question: "Which of the following muscles is responsible for chewing?",
      options: [
        "Deltoid",
        "Tibialis anterior",
        "Masseter",
        "Pectoralis major",
        "Biceps brachii",
      ],
      correct: "Masseter",
    },
    {
      question: "The largest artery in the body is the",
      options: [
        "Carotid artery",
        "Aorta",
        "Pulmonary artery",
        "Renal artery",
        "Femoral artery",
      ],
      correct: "Aorta",
    },
    {
      question: "The primary function of the liver is to",
      options: [
        "Produce bile",
        "Filter blood",
        "Produce red blood cells",
        "Store nutrients",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "The trachea is also known as the",
      options: ["Esophagus", "Bronchi", "Windpipe", "Larynx", "Diaphragm"],
      correct: "Windpipe",
    },
    {
      question: "The heart has how many chambers?",
      options: ["2", "3", "4", "5", "6"],
      correct: "4",
    },
    {
      question: "The right ventricle of the heart pumps blood to the",
      options: [
        "Pulmonary arteries",
        "Aorta",
        "Coronary arteries",
        "Pulmonary veins",
        "Superior vena cava",
      ],
      correct: "Pulmonary arteries",
    },
    {
      question: "The left ventricle of the heart pumps blood to the",
      options: [
        "Pulmonary arteries",
        "Aorta",
        "Coronary arteries",
        "Pulmonary veins",
        "Superior vena cava",
      ],
      correct: "Aorta",
    },
    {
      question:
        "The pulmonary veins carry oxygenated blood from the lungs to the",
      options: [
        "Right atrium",
        "Right ventricle",
        "Left atrium",
        "Left ventricle",
        "Superior vena cava",
      ],
      correct: "Left atrium",
    },
    {
      question:
        "The superior vena cava carries deoxygenated blood from the upper body to the",
      options: [
        "Right atrium",
        "Right ventricle",
        "Left atrium",
        "Left ventricle",
        "Pulmonary arteries",
      ],
      correct: "Right atrium",
    },
    {
      question:
        "The inferior vena cava carries deoxygenated blood from the lower body to the",
      options: [
        "Right atrium",
        "Right ventricle",
        "Left atrium",
        "Left ventricle",
        "Pulmonary arteries",
      ],
      correct: "Right atrium",
    },
    {
      question:
        "The left atrium of the heart receives oxygenated blood from the",
      options: [
        "Pulmonary arteries",
        "Aorta",
        "Coronary arteries",
        "Pulmonary veins",
        "Superior vena cava",
      ],
      correct: "Pulmonary veins",
    },
    {
      question: "The sinoatrial (SA) node is located in the",
      options: [
        "Right atrium",
        "Right ventricle",
        "Left atrium",
        "Left ventricle",
        "Superior vena cava",
      ],
      correct: "Right atrium",
    },
    {
      question: "The atrioventricular (AV) node is located in the",
      options: [
        "Right atrium",
        "Right ventricle",
        "Left atrium",
        "Left ventricle",
        "Superior vena cava",
      ],
      correct: "Right ventricle",
    },
    {
      question: "The ventricular septum separates the",
      options: [
        "Left atrium and right atrium",
        "Left ventricle and right ventricle",
        "Left atrium and left ventricle",
        "Right atrium and right ventricle",
        "All of the above",
      ],
      correct: "Left ventricle and right ventricle",
    },
    {
      question: "The tricuspid valve is located between the",
      options: [
        "Right atrium and right ventricle",
        "Left atrium and left ventricle",
        "Left ventricle and aorta",
        "Right ventricle and pulmonary arteries",
        "All of the above",
      ],
      correct: "Right atrium and right ventricle",
    },
    {
      question: "The bicuspid (mitral) valve is located between the",
      options: [
        "Right atrium and right ventricle",
        "Left atrium and left ventricle",
        "Left ventricle and aorta",
        "Right ventricle and pulmonary arteries",
        "All of the above",
      ],
      correct: "Left atrium and left ventricle",
    },
    {
      question: "The pulmonary valve is located between the",
      options: [
        "Right atrium and right ventricle",
        "Left atrium and left ventricle",
        "Left ventricle and aorta",
        "Right ventricle and pulmonary arteries",
        "All of the above",
      ],
      correct: "Right ventricle and pulmonary arteries",
    },
    {
      question: "The aortic valve is located between the",
      options: [
        "Right atrium and right ventricle",
        "Left atrium and left ventricle",
        "Left ventricle and aorta",
        "Right ventricle and pulmonary arteries",
        "All of the above",
      ],
      correct: "Left ventricle and aorta",
    },
    {
      question: "The diaphragm is a",
      options: ["Muscle", "Bone", "Cartilage", "Tendon", "Ligament"],
      correct: "Muscle",
    },
    {
      question: "The bladder stores urine until it is expelled through the",
      options: ["Ureter", "Urethra", "Prostate", "Testes", "Ovaries"],
      correct: "Urethra",
    },
    {
      question:
        "The urethra is the tube that carries urine from the bladder to the",
      options: ["Ureter", "Prostate", "Penis", "Vagina", "All of the above"],
      correct: "All of the above",
    },
    {
      question: "The male reproductive organs include the",
      options: [
        "Testes",
        "Epididymis",
        "Prostate",
        "Seminal vesicles",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "The female reproductive organs include the",
      options: [
        "Ovaries",
        "Fallopium tubes",
        "Uterus",
        "Vagina",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "The ovaries produce",
      options: [
        "Sperm",
        "Eggs",
        "Testosterone",
        "Estrogen",
        "All of the above",
      ],
      correct: "Eggs, Estrogen",
    },
    {
      question: "The testes produce",
      options: [
        "Eggs",
        "Sperm",
        "Estrogen",
        "Progesterone",
        "All of the above",
      ],
      correct: "Sperm, Testosterone",
    },
    {
      question: "The prostate gland is located",
      options: [
        "Near the bladder",
        "Near the kidneys",
        "Near the testes",
        "Near the uterus",
        "Near the vagina",
      ],
      correct: "Near the bladder",
    },
    {
      question: "The urethra in males passes through the",
      options: [
        "Bladder",
        "Prostate",
        "Seminal vesicles",
        "Testes",
        "All of the above",
      ],
      correct: "Prostate",
    },
    {
      question: "The urethra in females opens into the",
      options: [
        "Bladder",
        "Vagina",
        "Uterus",
        "Fallopian tubes",
        "All of the above",
      ],
      correct: "Vagina",
    },
    {
      question: "The largest artery in the neck is the",
      options: [
        "Carotid artery",
        "Subclavian artery",
        "Femoral artery",
        "Radial artery",
        "Ulnar artery",
      ],
      correct: "Carotid artery",
    },
    {
      question: "The largest vein in the neck is the",
      options: [
        "Internal jugular vein",
        "External jugular vein",
        "Femoral vein",
        "Subclavian vein",
        "Ulnar vein",
      ],
      correct: "Internal jugular vein",
    },
    {
      question: "The spinal cord is protected by the",
      options: ["Skull", "Pelvis", "Vertebrae", "Cranium", "Ribs"],
      correct: "Vertebrae",
    },
    {
      question: "The brain is protected by the",
      options: ["Skull", "Pelvis", "Vertebrae", "Cranium", "Ribs"],
      correct: "Cranium",
    },
    {
      question: "The spinal cord is divided into how many regions?",
      options: ["2", "3", "4", "5", "6"],
      correct: "5",
    },
    {
      question:
        "The spinal cord is divided into the cervical, thoracic, lumbar, sacral, and",
      options: ["Coccygeal", "Pelvic", "Abdominal", "Thoracic", "Cranial"],
      correct: "Coccygeal",
    },
    {
      question:
        "The sciatic nerve is the largest nerve in the body and originates from the",
      options: [
        "Cervical region",
        "Thoracic region",
        "Lumbar region",
        "Sacral region",
        "All of the above",
      ],
      correct: "Lumbar and Sacral regions",
    },
    {
      question: "The peripheral nervous system includes the",
      options: [
        "Central nervous system",
        "Autonomic nervous system",
        "Somatic nervous system",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "The autonomic nervous system is divided into the",
      options: [
        "Somatic nervous system",
        "Sympathetic nervous system",
        "Parasympathetic nervous system",
        "Both B and C",
        "All of the above",
      ],
      correct: "Both B and C",
    },
    {
      question: "The sympathetic nervous system is responsible for the",
      options: [
        "Fight or flight response",
        "Rest and digest response",
        "Both A and B",
        "None of the above",
      ],
      correct: "Fight or flight response",
    },
    {
      question: "The parasympathetic nervous system is responsible for the",
      options: [
        "Fight or flight response",
        "Rest and digest response",
        "Both A and B",
        "None of the above",
      ],
      correct: "Rest and digest response",
    },
    {
      question: "The spinal nerves exit the spinal cord through the",
      options: ["Vertebrae", "Skull", "Pelvis", "Ribs", "All of the above"],
      correct: "Vertebrae",
    },
    {
      question: "The spinal nerves are divided into the",
      options: [
        "Cervical nerves",
        "Thoracic nerves",
        "Lumbar nerves",
        "Sacral nerves",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "The brachial plexus is formed by the",
      options: [
        "Cervical nerves",
        "Thoracic nerves",
        "Lumbar nerves",
        "Sacral nerves",
        "All of the above",
      ],
      correct: "Cervical and Thoracic nerves",
    },
    {
      question: "The sciatic nerve exits the spinal cord through the",
      options: [
        "Cervical region",
        "Thoracic region",
        "Lumbar region",
        "Sacral region",
        "All of the above",
      ],
      correct: "Lumbar and Sacral regions",
    },
    {
      question: "The peripheral nervous system includes the",
      options: [
        "Central nervous system",
        "Autonomic nervous system",
        "Somatic nervous system",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "The spinal cord is protected by the",
      options: ["Skull", "Pelvis", "Vertebrae", "Cranium", "Ribs"],
      correct: "Vertebrae",
    },
    {
      question: "The brain is protected by the",
      options: ["Skull", "Pelvis", "Vertebrae", "Cranium", "Ribs"],
      correct: "Cranium",
    },
    {
      question: "The spinal cord is divided into how many regions?",
      options: ["2", "3", "4", "5", "6"],
      correct: "5",
    },
    {
      question:
        "The spinal cord is divided into the cervical, thoracic, lumbar, sacral, and",
      options: ["Coccygeal", "Pelvic", "Abdominal", "Thoracic", "Cranial"],
      correct: "Coccygeal",
    },
    {
      question:
        "The sciatic nerve is the largest nerve in the body and originates from the",
      options: [
        "Cervical region",
        "Thoracic region",
        "Lumbar region",
        "Sacral region",
        "All of the above",
      ],
      correct: "Lumbar and Sacral regions",
    },
  ],
  "Principles of Pharmacy Technician Practice": [
    {
      question: "What is a key ethical principle for pharmacy technicians?",
      options: [
        "Maximizing profits",
        "Maintaining patient confidentiality",
        "Prescribing medications",
        "Ignoring patient concerns",
      ],
      correct: "Maintaining patient confidentiality",
    },
    {
      question: "Macrogol is an example of",
      options: [
        "Natural wax",
        "Emulgent",
        "Natural emulsifier",
        "Synthetic wax",
      ],
      correct: "Synthetic wax",
    },
    {
      question: "Transaction records are used to record information about the",
      options: [
        "Movement from one person to another",
        "Movement of stocks from SDP to the customer",
        "Movement of stocks in the pipeline",
        "Movement of stock from one storage facility to another",
      ],
      correct: "Movement of stock from one storage facility to another",
    },
    {
      question:
        "____ records are used to document the quantity of each item dispensed to clients.",
      options: ["Assumption", "Consumption", "Absorption", "Quarantine"],
      correct: "Consumption",
    },
    {
      question: "The general formula for assessing stock status is",
      options: [
        "MoS = HoS/AMC",
        "MoS = SoH/AMC",
        "MoS = AMC/SoH",
        "MoS = AMC x SoH",
      ],
      correct: "MoS = SoH/AMC",
    },
    {
      question:
        "One of the aims of the Bamako Initiative was to raise the ___ of the implementing health facilities.",
      options: [
        "Financial viability",
        "Medical viability",
        "Training viability",
        "Resource viability",
      ],
      correct: "Financial viability",
    },
    {
      question:
        "Monthly DRF account report must be provided to management for proper",
      options: ["Accountability", "Procurement", "Inventory", "Availability"],
      correct: "Accountability",
    },
    {
      question:
        "What should a pharmacy technician do if they notice a potential medication error?",
      options: [
        "Ignore it to avoid trouble",
        "Report it to the pharmacist immediately",
        "Change the prescription themselves",
        "Inform the patient directly",
      ],
      correct: "Report it to the pharmacist immediately",
    },
    {
      question:
        "Which of the following best describes the role of a pharmacy technician in patient safety?",
      options: [
        "Ensuring accurate medication dispensing",
        "Diagnosing patient conditions",
        "Setting medication prices",
        "Conducting medical research",
      ],
      correct: "Ensuring accurate medication dispensing",
    },
    {
      question:
        "What is an important aspect of professional communication for a pharmacy technician?",
      options: [
        "Using medical jargon with patients",
        "Being clear and respectful with all stakeholders",
        "Avoiding communication with pharmacists",
        "Sharing patient information publicly",
      ],
      correct: "Being clear and respectful with all stakeholders",
    },
    {
      question:
        "What is the role of a pharmacy technician in inventory management?",
      options: [
        "Prescribe medications",
        "Monitor stock levels",
        "Diagnose conditions",
        "Perform surgeries",
      ],
      correct: "Monitor stock levels",
    },
    {
      question:
        "What should a pharmacy technician do with expired medications?",
      options: [
        "Sell them at a discount",
        "Return or dispose of them properly",
        "Reuse them",
        "Store them indefinitely",
      ],
      correct: "Return or dispose of them properly",
    },
    {
      question: "What is a key responsibility during prescription processing?",
      options: [
        "Verify patient insurance",
        "Prescribe medications",
        "Perform lab tests",
        "Conduct surgeries",
      ],
      correct: "Verify patient insurance",
    },
    {
      question: "What does HIPAA compliance ensure?",
      options: [
        "Drug pricing",
        "Patient privacy",
        "Medication potency",
        "Staff scheduling",
      ],
      correct: "Patient privacy",
    },
    {
      question:
        "What should a pharmacy technician do if a patient asks about a medication’s side effects?",
      options: [
        "Provide medical advice",
        "Refer them to the pharmacist",
        "Ignore the question",
        "Change the prescription",
      ],
      correct: "Refer them to the pharmacist",
    },
    {
      question: "What is a key aspect of teamwork in a pharmacy?",
      options: [
        "Working independently",
        "Collaborating with pharmacists",
        "Avoiding communication",
        "Setting prices",
      ],
      correct: "Collaborating with pharmacists",
    },
    {
      question: "What is the purpose of a medication reconciliation?",
      options: [
        "Increase sales",
        "Ensure accurate patient medication lists",
        "Diagnose conditions",
        "Reduce staff workload",
      ],
      correct: "Ensure accurate patient medication lists",
    },
    {
      question:
        "What should a pharmacy technician do if they receive a prescription with unclear handwriting?",
      options: [
        "Guess the medication",
        "Contact the prescriber for clarification",
        "Dispense a similar drug",
        "Ignore the prescription",
      ],
      correct: "Contact the prescriber for clarification",
    },
    {
      question: "What is a key principle of customer service in a pharmacy?",
      options: [
        "Prioritize speed over accuracy",
        "Be empathetic and helpful",
        "Avoid patient interaction",
        "Focus on profits",
      ],
      correct: "Be empathetic and helpful",
    },
    {
      question: "What is the role of a pharmacy technician in quality control?",
      options: [
        "Ensure accurate labeling",
        "Prescribe medications",
        "Diagnose conditions",
        "Set drug prices",
      ],
      correct: "Ensure accurate labeling",
    },
    {
      question:
        "What should a pharmacy technician do with a recalled medication?",
      options: [
        "Continue dispensing",
        "Remove it from inventory",
        "Sell it at a discount",
        "Store it separately",
      ],
      correct: "Remove it from inventory",
    },
    {
      question:
        "What is a key aspect of maintaining a sterile compounding area?",
      options: [
        "Allow food and drinks",
        "Follow strict cleaning protocols",
        "Use unsterile equipment",
        "Ignore regulations",
      ],
      correct: "Follow strict cleaning protocols",
    },
    {
      question:
        "What should a pharmacy technician do if they suspect a prescription is fraudulent?",
      options: [
        "Dispense it anyway",
        "Report it to the pharmacist",
        "Contact the patient",
        "Ignore it",
      ],
      correct: "Report it to the pharmacist",
    },
    {
      question: "What is the purpose of a formulary in a pharmacy?",
      options: [
        "List approved medications",
        "Set drug prices",
        "Diagnose conditions",
        "Schedule staff",
      ],
      correct: "List approved medications",
    },
    {
      question:
        "What is a key responsibility when handling controlled substances?",
      options: [
        "Ignore regulations",
        "Maintain accurate records",
        "Dispense without verification",
        "Store openly",
      ],
      correct: "Maintain accurate records",
    },
    {
      question:
        "What should a pharmacy technician do if a patient refuses counseling?",
      options: [
        "Force counseling",
        "Document the refusal",
        "Ignore the patient",
        "Change the prescription",
      ],
      correct: "Document the refusal",
    },
    {
      question:
        "What is a key aspect of patient education by a pharmacy technician?",
      options: [
        "Provide medical diagnoses",
        "Explain how to take medications",
        "Prescribe new drugs",
        "Avoid patient questions",
      ],
      correct: "Explain how to take medications",
    },
    {
      question: "What is the role of a pharmacy technician in billing?",
      options: [
        "Set drug prices",
        "Process insurance claims",
        "Diagnose conditions",
        "Perform surgeries",
      ],
      correct: "Process insurance claims",
    },
    {
      question:
        "What should a pharmacy technician do if they make a dispensing error?",
      options: [
        "Hide it",
        "Report it immediately",
        "Blame the patient",
        "Ignore it",
      ],
      correct: "Report it immediately",
    },
    {
      question: "What is a key principle of infection control in a pharmacy?",
      options: [
        "Use unsterile equipment",
        "Follow hand hygiene protocols",
        "Ignore regulations",
        "Allow contamination",
      ],
      correct: "Follow hand hygiene protocols",
    },
    {
      question:
        "What is the purpose of a pharmacy technician’s continuing education?",
      options: [
        "Increase profits",
        "Maintain licensure and knowledge",
        "Reduce workload",
        "Avoid regulations",
      ],
      correct: "Maintain licensure and knowledge",
    },
    {
      question:
        "Which of the following oversees the training, educating, and practice of pharmacy technician?",
      options: [
        "NAFDAC",
        "PSN",
        "PCN",
        "NDLEA",
        "Pharmacy technician Head of department",
      ],
      correct: "PCN",
    },
    {
      question: "What is the full meaning of P.C.N.?",
      options: [
        "Pharmacists Council",
        "Pharmacy council of Nigeria",
        "Pharmacist Board",
        "Pharmacists Council of Nigeria",
        "Pharmacists Community of Nigeria",
      ],
      correct: "Pharmacists Council of Nigeria",
    },
    {
      question: "Every role of the pharmacy technician must be supervised by:",
      options: [
        "A pharmacy Technician",
        "HOD Pharmacy",
        "A licensed Pharmacist",
        "Doctor",
        "None of the above",
      ],
      correct: "A licensed Pharmacist",
    },
    {
      question: "Which drug below is not a Prescription-only medication?",
      options: [
        "Multivitamin Capsules",
        "Insulin",
        "Warfarin",
        "Hydralazine",
        "Codeine",
      ],
      correct: "Multivitamin Capsules",
    },
    {
      question:
        "The Pharmacists Council of Nigeria’s administration is headed by one of these:",
      options: [
        "The Registrar",
        "The President",
        "The Chairman",
        "The Director-general",
        "Health Minister",
      ],
      correct: "The Registrar",
    },
    {
      question: "Who heads The Pharmaceutical Society of Nigeria?",
      options: [
        "The Chairman",
        "The President",
        "The Registrar",
        "Health Minister",
        "None of the above",
      ],
      correct: "The President",
    },
    {
      question:
        "Which of the following Agencies have a direct effect on pharmacy practice?",
      options: [
        "NDLEA",
        "NAFDAC",
        "Consumer’s protection Council",
        "UNICEF",
        "None of the above",
      ],
      correct: "NAFDAC",
    },
    {
      question:
        "Which of the following drugs should not be in the custody of a pharmacy technician?",
      options: [
        "OTC drugs",
        "Drugs in poison cupboards",
        "Multivitamins",
        "Paracetamol infusion",
        "None of the above",
      ],
      correct: "Drugs in poison cupboards",
    },
    {
      question: "Which of the following is permitted by the law?",
      options: [
        "Sales of expired drugs",
        "Storage of unregistered products",
        "Smuggling of substandard drugs into the country",
        "Ensuring patients get NAFDAC registered products",
        "None of the above",
      ],
      correct: "Ensuring patients get NAFDAC registered products",
    },
    {
      question:
        "Which of the following are not examples of abuse illicit drugs?",
      options: [
        "Indian Hemp",
        "Cocaine",
        "Opium leaves",
        "Heroine",
        "Sodium Bicarbonate suspension",
      ],
      correct: "Sodium Bicarbonate suspension",
    },
    {
      question:
        "Pharmacists and pharmacy technicians who are involved in illegal practices are subject to which of these?",
      options: [
        "Discipline from the council",
        "Deregistered by the council",
        "All of the above",
        "Continue their practice without council intervention",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Pharmacy Technician pay an annual fee to the council for:",
      options: [
        "Indexing",
        "National Examination",
        "Retention of name in the register",
        "Annual Licence",
        "None of the above",
      ],
      correct: "Annual Licence",
    },
    {
      question: "What is the full meaning of the acronym P.S.N?",
      options: [
        "Pharmacists Society of Nigeria",
        "Pharmacy Societal Council of Nigeria",
        "Pharmaceutical Society of Nigeria",
        "Pharmacists Council of Nigeria",
        "Pharmacy School of Nigeria",
      ],
      correct: "Pharmaceutical Society of Nigeria",
    },
    {
      question: "Which of these is a role function of the P.S.N.?",
      options: [
        "To maintain professional ethics among pharmacy practitioners",
        "To guard the interest of pharmacy",
        "To support any organization to further sciences and pharmacy",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Is a pharmacy technician allowed to dispense poisons?",
      options: [
        "Yes, he is",
        "No, he isn’t",
        "Yes, Sometimes",
        "Yes, when the pharmacist is not available",
        "None of the above",
      ],
      correct: "No, he isn’t",
    },
    {
      question:
        "Consumer’s protection Council have been established to ensure one of the following:",
      options: [
        "Protection of customers rights from injustices in the market place",
        "Consumption of goods",
        "Consumable goods and services are imported",
        "Drugs are not consumed because of side effects",
        "Protect the consumer from over use of the consumables",
      ],
      correct:
        "Protection of customers rights from injustices in the market place",
    },
    {
      question:
        "Which of these is not true about the use of computer in dispensing:",
      options: [
        "Saves time",
        "Is an old traditional practice",
        "Makes documentation easier",
        "Requires training",
        "Ensures accountability",
      ],
      correct: "Is an old traditional practice",
    },
    {
      question:
        "Pharmacists or pharmacy technicians who have been trained abroad can only practice in Nigeria once they:",
      options: [
        "Present their certificate and Passed the prescribed examination by the PCN",
        "Present their certificate and license to practice in the country they were trained",
        "Have Nigerian immigration permit",
        "All of the above",
        "None of the above",
      ],
      correct:
        "Present their certificate and Passed the prescribed examination by the PCN",
    },
    {
      question:
        "Which of the following is not currently being trained in Nigeria by the PCN?",
      options: [
        "Pharmacy Technicians",
        "Pharmacists",
        "Pharmacy technicians and pharmacists",
        "Doctor of Pharmacy graduates",
        "Pharmacy assistants",
      ],
      correct: "Pharmacy assistants",
    },
    {
      question:
        "In the current PCN training programs, what are the prospects of Pharmacy technicians?",
      options: [
        "Further education in the universities",
        "Be retrained into Pharmacy assistants",
        "Become sales boys and girls",
        "All of the above",
        "None of the above",
      ],
      correct: "Further education in the universities",
    },
    {
      question:
        "Which of the following parastatal does not collaborate with other countries to meet its objectives?",
      options: [
        "NAFDAC",
        "NDLEA",
        "FMOH",
        "All of the above",
        "None of the above",
      ],
      correct: "None of the above",
    },
    {
      question:
        "Consumer’s Protection Council (C.P.C.) is involved in the following except:",
      options: [
        "Training and education of Pharmacy staff",
        "Provide speedy redress of consumers complaint",
        "Protect consumers",
        "Cause offenders to replace products and compensate consumers",
        "Seek ways to eliminate hazardous products and services",
      ],
      correct: "Training and education of Pharmacy staff",
    },
    {
      question:
        "Pharmacists who work in community premises have the following roles except:",
      options: [
        "Health education",
        "Respond to symptoms of minor ailments of clients",
        "Compounding",
        "All of the above",
        "Treating livestock",
      ],
      correct: "Treating livestock",
    },
    {
      question:
        "To achieve proper inventory control, the pharmacy technician must be actively involved in all but one:",
      options: [
        "Documentation and checking of drugs on shelves",
        "Monitor nurses and doctors",
        "Computer records and up to date knowledge",
        "Report illegality immediately to pharmacist",
        "Filling the tally cards immediately after issuing of drugs",
      ],
      correct: "Monitor nurses and doctors",
    },
    {
      question:
        "The pharmacy technician must maintain a cordial relationship with other health worker. This he would achieve by:",
      options: [
        "Mutual Respect",
        "Respect others’ opinions",
        "Channeling grievances in a Harsh manner",
        "All of the above",
        "None of the above",
      ],
      correct: "Mutual Respect",
    },
    {
      question: "The pharmacy technician is not allowed to:",
      options: [
        "Counsel patients",
        "Treat patients",
        "Receive and dispense oral prescriptions",
        "All of the above",
        "Compound",
      ],
      correct: "Treat patients",
    },
    {
      question:
        "To be a certified pharmacy technician, which of the following is required?",
      options: [
        "Indexing",
        "National Pre-certification Exams",
        "Admission into colleges/schools of health",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following courses is not absolutely necessary in pharmacy technician training?",
      options: [
        "Technical drawing",
        "Chemistry",
        "Anatomy",
        "Dispensing",
        "Mathematics",
      ],
      correct: "Technical drawing",
    },
    {
      question:
        "The aim of teaching Principle of Pharmacy technician practice is to:",
      options: [
        "Produce well behave candidates who work within their jurisdiction",
        "To yield candidates who treat patients with drugs",
        "To give rise to professionals who spearheads specialize drug treatment",
        "None of the above",
        "None of the above",
      ],
      correct:
        "Produce well behave candidates who work within their jurisdiction",
    },
    {
      question: "Every role of the pharmacy technician must be supervised by:",
      options: [
        "A pharmacy Technician",
        "HOD Pharmacy",
        "A licensed Pharmacist",
        "None of the above",
        "Provost",
      ],
      correct: "A licensed Pharmacist",
    },
    {
      question: "Which of the following is not example of abuse illicit drug?",
      options: ["Indian Hemp", "Cocaine", "Opium leaves", "Heroine", "Antacid"],
      correct: "Antacid",
    },
    {
      question:
        "To ensure success in patient management in hospital, all health care providers must:",
      options: [
        "Collaborate",
        "Participate",
        "Be responsible for their actions",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "What area in the Country is the National office of the Pharmacists Council of Nigeria located?",
      options: ["Lagos", "Abuja", "Kaduna", "Kano", "Ikeja"],
      correct: "Abuja",
    },
    {
      question:
        "The union operated by dispensers in early history of pharmacy practice in Nigeria does not include one of the following:",
      options: ["Association of dispensers", "PCN", "NUP", "a & c only", "PSN"],
      correct: "PCN",
    },
    {
      question: "Which of the following aspects of drug does NAFDAC regulate?",
      options: [
        "Importation",
        "Exportation",
        "Advertisement",
        "All of the above",
        "a and c only",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Pharmacy practice settings are subject to supervision by which of the following in matters of unwholesome products?",
      options: [
        "NAFDAC",
        "NDLEA",
        "Federal Government of Nigeria",
        "All of the above",
        "None of the above",
      ],
      correct: "NAFDAC",
    },
    {
      question:
        "The union operated by dispensers in early history of pharmacy practice in Nigeria does not include one of the following:",
      options: [
        "Association of dispensers",
        "PCN",
        "NUP",
        "a & c only",
        "All of the above",
      ],
      correct: "PCN",
    },
    {
      question: "Which of the following aspects of drug does NAFDAC regulate?",
      options: [
        "Importation",
        "Exportation",
        "Advertisement",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Pharmacy practice settings are subject to supervision by which of the following in matters of unwholesome products?",
      options: [
        "NAFDAC",
        "NDLEA",
        "Federal Government of Nigeria",
        "None of the above",
        "b and c only",
      ],
      correct: "NAFDAC",
    },
    {
      question: "Where was the first pharmacy premises located in Nigeria?",
      options: ["Kano", "Onitsha", "Lagos", "Jos", "Gombe"],
      correct: "Lagos",
    },
    {
      question: "Which of this is not a good quality of a pharmacy technician?",
      options: [
        "Good communication skills",
        "Ability to control self in the mist of provocation",
        "Dislike people",
        "Ability to listen well",
        "c and d",
      ],
      correct: "Dislike people",
    },
    {
      question:
        "The following type of foods are not fit to be registered for use in Nigeria except?",
      options: [
        "Counterfeit",
        "Unadulterated",
        "Unwholesome",
        "Fake",
        "all of the above",
      ],
      correct: "Unadulterated",
    },
    {
      question:
        "The first informal training of pharmacy in Nigeria was at which location?",
      options: [
        "Ogun",
        "Lagos",
        "Zaria",
        "All of the above",
        "None of the above",
      ],
      correct: "Lagos",
    },
    {
      question:
        "The formal training of Pharmacy in Nigeria was at which location?",
      options: ["Ogun", "Lagos", "Zaria", "Abuja", "All of the above"],
      correct: "Zaria",
    },
    {
      question:
        "The main focus in hospitals, without whom health providers would not render services is?",
      options: [
        "Patient",
        "Consultant",
        "Medical Director",
        "Chief Medical Director",
        "Pharmacist",
      ],
      correct: "Patient",
    },
    {
      question:
        "Which of these does not require registration by the Pharmacists Council of Nigeria?",
      options: [
        "Pharmacist",
        "Pharmacy Premises",
        "Pharmacy Technician",
        "Medical Laboratory",
        "All of the above",
      ],
      correct: "Medical Laboratory",
    },
    {
      question: "Which of the following statements is correct?",
      options: [
        "All poisons are drugs but not all drugs are poisons",
        "All drugs are Poisons but not all poisons are drugs",
        "All drugs must be swallowed or injected",
        "Drugs are meant to harm patients",
        "All drugs are use for diagnosis",
      ],
      correct: "All poisons are drugs but not all drugs are poisons",
    },
    {
      question: "Ideal prescription should be written on:",
      options: [
        "Prescription Sheet",
        "Medication order",
        "Patient Medication Record",
        "All of the above",
        "None of the above",
      ],
      correct: "Prescription Sheet",
    },
    {
      question:
        "For a prescription to be valid, which of the following may not be necessarily confirmed:",
      options: [
        "Patient’s details",
        "Prescribers details",
        "Date and correctness of the prescription",
        "Correctness of dosage form",
        "Patient’s relative details",
      ],
      correct: "Patient’s relative details",
    },
    {
      question:
        "One distinguishing quality of pharmacy technicians is that they must be good in one of the following:",
      options: [
        "Calculations",
        "Exercise",
        "Theory",
        "None of the above",
        "All of the above",
      ],
      correct: "Calculations",
    },
    {
      question:
        "Which of these is the importance of documents generated and stored in hospitals?",
      options: [
        "Litigation purposes",
        "Ensure continuity of treatment",
        "Publicity",
        "Research",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Confidentiality is enhanced by any of these except:",
      options: [
        "Sharing information with fellow provider for purpose of helping patient",
        "Health provider shares patients’ health details with his/her own family",
        "Disagree to share sensitive details with others outside the pharmacy unit",
        "None of the above",
        "All of the above",
      ],
      correct:
        "Health provider shares patients’ health details with his/her own family",
    },
    {
      question:
        "For a layman to understand drugs have been supervised before importation into the country, what identity is common?",
      options: [
        "Good packaging",
        "Batch number",
        "Expiration dates",
        "all of the above",
        "NAFDAC number",
      ],
      correct: "NAFDAC number",
    },
    {
      question:
        "Which of the following are not under the control of State’s Hospital Management boards?",
      options: [
        "General Hospitals",
        "Cottage hospitals",
        "All of the above",
        "Primary Health care facility",
        "Federal Medical Centres",
      ],
      correct: "Federal Medical Centres",
    },
    {
      question: "Which of the following is not advised for any health worker?",
      options: [
        "Neatness",
        "Wearing excessive make-up and jewelries at work",
        "Punctuality",
        "Non-judgmental",
        "All of the above",
      ],
      correct: "Wearing excessive make-up and jewelries at work",
    },
    {
      question: "Pharmacy was introduced into Nigeria by a/an ___________",
      options: ["European", "German", "Nigerian", "Jew", "American"],
      correct: "European",
    },
    {
      question: "A pharmacist is a professional in one of these:",
      options: [
        "Drug manufacture",
        "Proper drug use",
        "Drugs side effects and adverse effects",
        "Surgery",
        "Pharmacotherapy",
      ],
      correct: "Proper drug use",
    },
    {
      question: "What is the full meaning of the acronym N.A.F.D.A.C?",
      options: [
        "Nigerian agency for drug and control",
        "National agency for food and drug administration and control",
        "National agency for food, drug administration and control",
        "National agency for food and drug emergency services",
        "Nigeria agency for food and drug administration and control",
      ],
      correct: "National agency for food and drug administration and control",
    },
    {
      question:
        "The state’s Hospital Management Board is responsible for one of these:",
      options: [
        "Source equipment for secondary health care facility in the state",
        "Maintain the equipment for secondary health care facility",
        "Monitor, train and discipline personnel within its jurisdiction",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following agencies supervises pharmacy premises in cases illegal sales of psychotropic substances?",
      options: ["NDLEA", "NAFDAC", "SON", "PCN", "All of the above"],
      correct: "NDLEA",
    },
    {
      question: "What is the full meaning of N.D.L.E.A?",
      options: [
        "National drug enforcement agency",
        "Nigerian Drug Law Enforcement",
        "National drug law enforcement agency",
        "National drug and other psychotropic substances enforcement agency",
        "Nigeria drugs law enforcement agency",
      ],
      correct: "National Drug Law enforcement agency",
    },
    {
      question: "Which role of a Pharmacy technician is fit for bulk stores?",
      options: [
        "Dispensing",
        "Counseling",
        "Checking, receiving and issuing supplies",
        "All of the above",
        "None of the above",
      ],
      correct: "Checking, receiving and issuing supplies",
    },
    {
      question:
        "Pharmacy laws empowers which of these to supervise pharmacy practice facilities:",
      options: [
        "PCN",
        "NAFDAC",
        "NDLEA",
        "All of the above",
        "None of the above",
      ],
      correct: "PCN",
    },
    {
      question: "NDLEA always aims at:",
      options: [
        "Eradicating illicit drug abuse",
        "Ensuring proper use of OTC drug",
        "Stop legal use of narcotics",
        "All of the above",
        "None of the above",
      ],
      correct: "Eradicating illicit drug abuse",
    },
    {
      question:
        "Which of the following best explains good pharmacy technician?",
      options: [
        "Haircut/hairdo unfamiliar to people’s culture",
        "Indecent dressing styles",
        "Smoking and gum chewing when attending to patients",
        "a and c only",
        "None of the above",
      ],
      correct: "None of the above",
    },
    {
      question: "For a pharmacy technician to perform efficiently, he must:",
      options: [
        "Be able to Communicate well",
        "Easily get twisted over simple issues",
        "Be trusted with confidential information",
        "Be tidy, orderly and neat",
        "Be care free",
      ],
      correct: "Be able to Communicate well",
    },
    {
      question:
        "A pharmacy technician is allowed to perform the following except:",
      options: [
        "Counseling",
        "Issue supplies",
        "use computers in dispensing",
        "Receive supplies",
        "Compounding",
      ],
      correct: "Counseling",
    },
    {
      question:
        "Which function of the pharmacy technician supports proper inventory control?",
      options: [
        "Stock taking",
        "Compounding",
        "Dispensing",
        "All of the above",
        "None of the above",
      ],
      correct: "Stock taking",
    },
    {
      question:
        "Which of the following is not a function of federal ministry of health?",
      options: [
        "Develop National health policy",
        "Implement national health policy",
        "Training of personnel",
        "Establish hospital management board",
        "None of the above",
      ],
      correct: "Establish hospital management board",
    },
    {
      question: "Which of the following best describes the role of the PCN?",
      options: [
        "Ensure ordinary means of transport is used for transport of illicit drug",
        "Regulate, control pharmacy education, training and practice in all aspect",
        "To undertake registration of food, drugs, cosmetics and bottled water",
        "None of the above",
        "All of the above",
      ],
      correct:
        "Regulate, control pharmacy education, training and practice in all aspect",
    },
    {
      question:
        "Which of the following are not directly under the custody of the federal ministry of health?",
      options: [
        "All teaching Hospitals",
        "All professional boards",
        "National program on Immunization",
        "State Ministry of Health",
        "State’s specialist hospitals",
      ],
      correct: "State Ministry of Health",
    },
    {
      question:
        "For a pharmacy technician to have a good working relationship with the pharmacist, he/she should not:",
      options: [
        "Be respectful",
        "Be obedient",
        "Do task assigned",
        "Resolve problems through proper channels",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Pharmacy is described as any of the following except:",
      options: [
        "Art and sciences of preparation, dispensing and utilization of drugs",
        "A place where medication are stored, dispensed and sold",
        "A professional who practices drugs",
        "A profession which links health sciences and chemical sciences",
        "All of the above",
      ],
      correct: "A professional who practices drugs",
    },
    {
      question: "Which of the following drugs are unfit for consumption?",
      options: [
        "Unwholesome",
        "Adulterated",
        "unsafe",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question: "Who oversees the Federal Ministry of Health?",
      options: [
        "Commissioner of health",
        "Minister of Health",
        "Pharmacist",
        "Medical Practitioner",
        "None of the above",
      ],
      correct: "Minister of Health",
    },
    {
      question: "Who oversees the State’s Ministry of Health?",
      options: [
        "Commissioner of health",
        "Minister of Health",
        "Pharmacist",
        "Medical Practitioner",
        "Director of Hospital services",
      ],
      correct: "Commissioner of health",
    },
    {
      question:
        "In every state, the Directorate of pharmaceutical services is headed by:",
      options: [
        "Director Hospital services",
        "Medical Director",
        "Director of Health Services",
        "Director of Hospital Services",
        "Director of Pharmaceutical services",
      ],
      correct: "Director of Pharmaceutical services",
    },
    {
      question:
        "Before disciplinary action is taken on any pharmacist or pharmacy technician, which of the following is not often exercise?",
      options: [
        "Investigation",
        "Fair hearing",
        "National examination",
        "Formal invitation by disciplinary committee",
        "All of the above",
      ],
      correct: "National examination",
    },
    {
      question:
        "Which of the following should Pharmacy technicians be involved in?",
      options: [
        "Consultation",
        "Counseling",
        "Compounding",
        "All of the above",
        "None of the above",
      ],
      correct: "Compounding",
    },
    {
      question:
        "Which of the following States have dense population of pharmacy premises?",
      options: ["Lagos", "Kano", "Gombe", "a & b only", "None of the above"],
      correct: "a & b only",
    },
    {
      question: "When was the first pharmacy established in Nigeria?",
      options: ["1997", "1897", "1887", "1889", "1777"],
      correct: "1887",
    },
    {
      question:
        "If any patient is not satisfied with the product or services rendered by a pharmacy technician, where can this be report to?",
      options: [
        "NAFDAC",
        "CPC",
        "All of the above",
        "None of the above",
        "PSN",
      ],
      correct: "CPC",
    },
    {
      question: "A pharmacy technician is expected to respect patients:",
      options: [
        "Opinion",
        "Choices",
        "Culture",
        "All of the above",
        "None of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Any substance that produces a harmful effect to the human body is termed as:",
      options: ["Poison", "Drug", "Mixture", "Liniment", "Paste"],
      correct: "Poison",
    },
    {
      question: "Which of the following is not an Over-the-Counter drug?",
      options: [
        "Paracetamol",
        "Vitamin C",
        "Strepsils",
        "Insulin",
        "Ibuprofen",
      ],
      correct: "Insulin",
    },
    {
      question:
        "Which of these drugs are dispensed only by licensed pharmacists to patients with prescription from a licensed medical practitioner?",
      options: [
        "Codeine Cough syrups",
        "Paracetamol",
        "Yeast tablets",
        "Lozenges",
        "Multivitamin syrup",
      ],
      correct: "Codeine Cough syrups",
    },
    {
      question: "What is the full meaning of the acronym S.O.N?",
      options: [
        "Society of Nigerian Technicians",
        "Standard Observatory Network",
        "Standard Organization of Nigeria",
        "All of the above",
        "None of the above",
      ],
      correct: "Standard Organization of Nigeria",
    },
    {
      question: "What is the role of S.O.N?",
      options: [
        "Develop, enforce guidelines on quality of products in commerce and industries",
        "Issue NAFDAC numbers to products of good quality",
        "Develop training manual for Pharmacy technician students",
        "All of the above",
        "None of the above",
      ],
      correct:
        "Develop, enforce guidelines on quality of products in commerce and industries",
    },
    {
      question:
        "Whenever a pharmacy technician sees people involved in drug trafficking, which of these agencies should he report to?",
      options: ["N.A.F.D.A.C.", "N.D.L.E.A.", "S.O.N.", "None of the above"],
      correct: "N.D.L.E.A.",
    },
    {
      question:
        "What is the primary role of a pharmacy technician in a hospital setting?",
      options: ["Diagnosis", "Dispensing", "Surgery", "Pharmacotherapy"],
      correct: "Dispensing",
    },
    {
      question:
        "Which of the following is a key responsibility of a pharmacy technician?",
      options: [
        "Writing prescriptions",
        "Compounding medications",
        "Diagnosing illnesses",
        "Performing surgeries",
      ],
      correct: "Compounding medications",
    },
    {
      question:
        "What is the importance of maintaining a clean and organized workspace in a pharmacy?",
      options: [
        "To improve sales",
        "To reduce the risk of contamination",
        "To increase profits",
        "To attract more patients",
      ],
      correct: "To reduce the risk of contamination",
    },
    {
      question:
        "Which of the following is an example of a controlled substance?",
      options: ["Multivitamins", "Paracetamol", "Hydrocodone", "Aspirin"],
      correct: "Hydrocodone",
    },
    {
      question:
        "What is the purpose of the National Agency for Food and Drug Administration and Control (NAFDAC)?",
      options: [
        "To train pharmacy technicians",
        "To regulate food and drug safety",
        "To provide health insurance",
        "To manage hospital operations",
      ],
      correct: "To regulate food and drug safety",
    },
    {
      question:
        "Which of the following is NOT a function of the Pharmacists Council of Nigeria (PCN)?",
      options: [
        "Regulating pharmacy education",
        "Issuing pharmacy licenses",
        "Training pharmacy technicians",
        "Overseeing pharmacy practice",
      ],
      correct: "Training pharmacy technicians",
    },
    {
      question:
        "What is the role of the Pharmaceutical Society of Nigeria (PSN)?",
      options: [
        "To provide healthcare services",
        "To regulate pharmacy education",
        "To support pharmacy professionals",
        "To manufacture drugs",
      ],
      correct: "To support pharmacy professionals",
    },
    {
      question:
        "What is the significance of adhering to professional ethics in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is an example of a non-prescription medication?",
      options: ["Codeine", "Warfarin", "Multivitamins", "Insulin"],
      correct: "Multivitamins",
    },
    {
      question:
        "What is the importance of following proper inventory control procedures in a pharmacy?",
      options: [
        "To increase storage space",
        "To prevent drug shortages",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To prevent drug shortages",
    },
    {
      question:
        "Which of the following is a key aspect of patient counseling in pharmacy practice?",
      options: [
        "Selling more products",
        "Explaining how to take medications",
        "Promoting the pharmacy",
        "Managing inventory",
      ],
      correct: "Explaining how to take medications",
    },
    {
      question:
        "What is the role of the Federal Ministry of Health (FMOH) in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To formulate national health policies",
        "To train pharmacy technicians",
      ],
      correct: "To formulate national health policies",
    },
    {
      question:
        "Which of the following is NOT a role of a pharmacy technician?",
      options: [
        "Dispensing medications",
        "Compounding prescriptions",
        "Counseling patients",
        "Diagnosing illnesses",
      ],
      correct: "Diagnosing illnesses",
    },
    {
      question:
        "What is the importance of proper documentation in pharmacy practice?",
      options: [
        "To save time",
        "To comply with regulations",
        "To increase profits",
        "To reduce costs",
      ],
      correct: "To comply with regulations",
    },
    {
      question:
        "Which of the following is a key responsibility of a pharmacy technician in a community pharmacy?",
      options: [
        "Diagnosing illnesses",
        "Compounding medications",
        "Dispensing prescriptions",
        "Performing surgeries",
      ],
      correct: "Dispensing prescriptions",
    },
    {
      question:
        "What is the role of the Consumer Protection Council (CPC) in pharmacy practice?",
      options: [
        "To train pharmacy technicians",
        "To protect consumer rights",
        "To regulate food and drug safety",
        "To manage hospital operations",
      ],
      correct: "To protect consumer rights",
    },
    {
      question:
        "Which of the following is an example of a prescription-only medication?",
      options: ["Multivitamins", "Paracetamol", "Codeine", "Aspirin"],
      correct: "Codeine",
    },
    {
      question:
        "What is the importance of confidentiality in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is a key aspect of inventory management in a pharmacy?",
      options: [
        "To increase storage space",
        "To prevent drug shortages",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To prevent drug shortages",
    },
    {
      question:
        "What is the role of the National Drug Law Enforcement Agency (NDLEA) in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To combat drug trafficking",
        "To train pharmacy technicians",
      ],
      correct: "To combat drug trafficking",
    },
    {
      question:
        "Which of the following is a key responsibility of a pharmacy technician in a hospital pharmacy?",
      options: [
        "Diagnosing illnesses",
        "Compounding medications",
        "Dispensing prescriptions",
        "Performing surgeries",
      ],
      correct: "Compounding medications",
    },
    {
      question:
        "What is the importance of following proper dispensing procedures in a pharmacy?",
      options: [
        "To save time",
        "To ensure patient safety",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To ensure patient safety",
    },
    {
      question:
        "Which of the following is NOT a role of the Pharmacy Council of Nigeria (PCN)?",
      options: [
        "Regulating pharmacy education",
        "Issuing pharmacy licenses",
        "Training pharmacy technicians",
        "Overseeing pharmacy practice",
      ],
      correct: "Training pharmacy technicians",
    },
    {
      question:
        "What is the role of the State’s Hospital Management Board in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To manage state hospitals",
        "To train pharmacy technicians",
      ],
      correct: "To manage state hospitals",
    },
    {
      question:
        "Which of the following is a key aspect of patient education in pharmacy practice?",
      options: [
        "Selling more products",
        "Explaining how to take medications",
        "Promoting the pharmacy",
        "Managing inventory",
      ],
      correct: "Explaining how to take medications",
    },
    {
      question:
        "What is the importance of adhering to regulatory guidelines in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is an example of a controlled substance?",
      options: ["Multivitamins", "Paracetamol", "Hydrocodone", "Aspirin"],
      correct: "Hydrocodone",
    },
    {
      question:
        "What is the role of the National Agency for Food and Drug Administration and Control (NAFDAC)?",
      options: [
        "To train pharmacy technicians",
        "To regulate food and drug safety",
        "To provide health insurance",
        "To manage hospital operations",
      ],
      correct: "To regulate food and drug safety",
    },
    {
      question:
        "Which of the following is NOT a function of the Pharmacists Council of Nigeria (PCN)?",
      options: [
        "Regulating pharmacy education",
        "Issuing pharmacy licenses",
        "Training pharmacy technicians",
        "Overseeing pharmacy practice",
      ],
      correct: "Training pharmacy technicians",
    },
    {
      question:
        "What is the role of the Pharmaceutical Society of Nigeria (PSN)?",
      options: [
        "To provide healthcare services",
        "To regulate pharmacy education",
        "To support pharmacy professionals",
        "To manufacture drugs",
      ],
      correct: "To support pharmacy professionals",
    },
    {
      question:
        "What is the significance of adhering to professional ethics in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is an example of a non-prescription medication?",
      options: ["Codeine", "Warfarin", "Multivitamins", "Insulin"],
      correct: "Multivitamins",
    },
    {
      question:
        "What is the importance of following proper inventory control procedures in a pharmacy?",
      options: [
        "To increase storage space",
        "To prevent drug shortages",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To prevent drug shortages",
    },
    {
      question:
        "Which of the following is a key aspect of patient counseling in pharmacy practice?",
      options: [
        "Selling more products",
        "Explaining how to take medications",
        "Promoting the pharmacy",
        "Managing inventory",
      ],
      correct: "Explaining how to take medications",
    },
    {
      question:
        "What is the role of the Federal Ministry of Health (FMOH) in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To formulate national health policies",
        "To train pharmacy technicians",
      ],
      correct: "To formulate national health policies",
    },
    {
      question:
        "Which of the following is NOT a role of a pharmacy technician?",
      options: [
        "Dispensing medications",
        "Compounding prescriptions",
        "Counseling patients",
        "Diagnosing illnesses",
      ],
      correct: "Diagnosing illnesses",
    },
    {
      question:
        "What is the importance of proper documentation in pharmacy practice?",
      options: [
        "To save time",
        "To comply with regulations",
        "To increase profits",
        "To reduce costs",
      ],
      correct: "To comply with regulations",
    },
    {
      question:
        "Which of the following is a key responsibility of a pharmacy technician in a community pharmacy?",
      options: [
        "Diagnosing illnesses",
        "Compounding medications",
        "Dispensing prescriptions",
        "Performing surgeries",
      ],
      correct: "Dispensing prescriptions",
    },
    {
      question:
        "What is the role of the Consumer Protection Council (CPC) in pharmacy practice?",
      options: [
        "To train pharmacy technicians",
        "To protect consumer rights",
        "To regulate food and drug safety",
        "To manage hospital operations",
      ],
      correct: "To protect consumer rights",
    },
    {
      question:
        "Which of the following is an example of a prescription-only medication?",
      options: ["Multivitamins", "Paracetamol", "Codeine", "Aspirin"],
      correct: "Codeine",
    },
    {
      question:
        "What is the importance of confidentiality in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is a key aspect of inventory management in a pharmacy?",
      options: [
        "To increase storage space",
        "To prevent drug shortages",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To prevent drug shortages",
    },
    {
      question:
        "What is the role of the National Drug Law Enforcement Agency (NDLEA) in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To combat drug trafficking",
        "To train pharmacy technicians",
      ],
      correct: "To combat drug trafficking",
    },
    {
      question:
        "Which of the following is a key responsibility of a pharmacy technician in a hospital pharmacy?",
      options: [
        "Diagnosing illnesses",
        "Compounding medications",
        "Dispensing prescriptions",
        "Performing surgeries",
      ],
      correct: "Compounding medications",
    },
    {
      question:
        "What is the importance of following proper dispensing procedures in a pharmacy?",
      options: [
        "To save time",
        "To ensure patient safety",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To ensure patient safety",
    },
    {
      question:
        "Which of the following is NOT a role of the Pharmacy Council of Nigeria (PCN)?",
      options: [
        "Regulating pharmacy education",
        "Issuing pharmacy licenses",
        "Training pharmacy technicians",
        "Overseeing pharmacy practice",
      ],
      correct: "Training pharmacy technicians",
    },
    {
      question:
        "What is the role of the State’s Hospital Management Board in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To manage state hospitals",
        "To train pharmacy technicians",
      ],
      correct: "To manage state hospitals",
    },
    {
      question:
        "Which of the following is a key aspect of patient education in pharmacy practice?",
      options: [
        "Selling more products",
        "Explaining how to take medications",
        "Promoting the pharmacy",
        "Managing inventory",
      ],
      correct: "Explaining how to take medications",
    },
    {
      question:
        "What is the importance of adhering to regulatory guidelines in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is an example of a controlled substance?",
      options: ["Multivitamins", "Paracetamol", "Hydrocodone", "Aspirin"],
      correct: "Hydrocodone",
    },
    {
      question:
        "What is the role of the National Agency for Food and Drug Administration and Control (NAFDAC)?",
      options: [
        "To train pharmacy technicians",
        "To regulate food and drug safety",
        "To provide health insurance",
        "To manage hospital operations",
      ],
      correct: "To regulate food and drug safety",
    },
    {
      question:
        "Which of the following is NOT a function of the Pharmacists Council of Nigeria (PCN)?",
      options: [
        "Regulating pharmacy education",
        "Issuing pharmacy licenses",
        "Training pharmacy technicians",
        "Overseeing pharmacy practice",
      ],
      correct: "Training pharmacy technicians",
    },
    {
      question:
        "What is the role of the Pharmaceutical Society of Nigeria (PSN)?",
      options: [
        "To provide healthcare services",
        "To regulate pharmacy education",
        "To support pharmacy professionals",
        "To manufacture drugs",
      ],
      correct: "To support pharmacy professionals",
    },
    {
      question:
        "What is the significance of adhering to professional ethics in pharmacy practice?",
      options: [
        "To increase sales",
        "To build trust with patients",
        "To avoid legal issues",
        "All of the above",
      ],
      correct: "All of the above",
    },
    {
      question:
        "Which of the following is an example of a non-prescription medication?",
      options: ["Codeine", "Warfarin", "Multivitamins", "Insulin"],
      correct: "Multivitamins",
    },
    {
      question:
        "What is the importance of following proper inventory control procedures in a pharmacy?",
      options: [
        "To increase storage space",
        "To prevent drug shortages",
        "To reduce costs",
        "To increase sales",
      ],
      correct: "To prevent drug shortages",
    },
    {
      question:
        "Which of the following is a key aspect of patient counseling in pharmacy practice?",
      options: [
        "Selling more products",
        "Explaining how to take medications",
        "Promoting the pharmacy",
        "Managing inventory",
      ],
      correct: "Explaining how to take medications",
    },
    {
      question:
        "What is the role of the Federal Ministry of Health (FMOH) in pharmacy practice?",
      options: [
        "To regulate pharmacy education",
        "To provide healthcare services",
        "To formulate national health policies",
        "To train pharmacy technicians",
      ],
      correct: "To formulate national health policies",
    },
    {
      question:
        "What should a pharmacy technician do if they notice a potential medication error?",
      options: [
        "Ignore it to avoid trouble",
        "Report it to the pharmacist immediately",
        "Change the prescription themselves",
        "Inform the patient directly",
      ],
      correct: "Report it to the pharmacist immediately",
    },
    {
      question:
        "Which of the following best describes the role of a pharmacy technician in patient safety?",
      options: [
        "Ensuring accurate medication dispensing",
        "Diagnosing patient conditions",
        "Setting medication prices",
        "Conducting medical research",
      ],
      correct: "Ensuring accurate medication dispensing",
    },
    {
      question:
        "What is an important aspect of professional communication for a pharmacy technician?",
      options: [
        "Using medical jargon with patients",
        "Being clear and respectful with all stakeholders",
        "Avoiding communication with pharmacists",
        "Sharing patient information publicly",
      ],
      correct: "Being clear and respectful with all stakeholders",
    },
    {
      question:
        "Which of the following best describes the role of a pharmacy technician in patient safety?",
      options: [
        "Ensuring accurate medication dispensing",
        "Diagnosing patient conditions",
        "Setting medication prices",
        "Conducting medical research",
      ],
      correct: "Ensuring accurate medication dispensing",
    },
    {
      question:
        "What is an important aspect of professional communication for a pharmacy technician?",
      options: [
        "Using medical jargon with patients",
        "Being clear and respectful with all stakeholders",
        "Avoiding communication with pharmacists",
        "Sharing patient information publicly",
      ],
      correct: "Being clear and respectful with all stakeholders",
    },
  ],
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
