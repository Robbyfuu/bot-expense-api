const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Dummy init to access client? actually client is on genAI
    // Direct access not exposed easily on SDK v0.24, let's try standard fetch if SDK list is hidden or use undocumented
    // Actually per docs:
    // const genAI = new GoogleGenerativeAI(API_KEY);
    // const model = genAI.getGenerativeModel({ model: "MODEL_NAME" });

    // We can use a simple fetch to the list models endpoint to be sure
    const key = process.env.GOOGLE_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    );
    const data = await response.json();
    console.log('Available Models:');
    if (data.models) {
      data.models.forEach((m) =>
        console.log(`- ${m.name} (${m.supportedGenerationMethods})`),
      );
    } else {
      console.log(data);
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
