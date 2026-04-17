const { getGuildConfig } = require('./config');

const WRM_URL = 'https://api.cyberneurova.ai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'wormgpt-v7';
const ANALYSIS_MODEL = 'google/gemini-2.0-flash-001';

// Historique des conversations par guild
const conversationHistory = new Map();

/**
 * Récupère l'historique d'une guild
 */
function getHistory(guildId) {
  if (!conversationHistory.has(guildId)) {
    conversationHistory.set(guildId, []);
  }
  return conversationHistory.get(guildId);
}

/**
 * Réinitialise l'historique d'une guild
 */
function resetHistory(guildId) {
  conversationHistory.set(guildId, []);
}

/**
 * Analyse les médias (images, PDF) avec Gemini via OpenRouter
 */
async function analyzeMediaWithGemini(attachments) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY manquante');
    return null;
  }

  const content = [
    {
      type: 'text',
      text: "Analyse ces fichiers (PDF ou images) et extraits-en tout le contenu textuel et décris les images de manière très détaillée. Ce rapport servira de contexte à une autre IA pour répondre à l'utilisateur. Sois le plus précis possible."
    }
  ];

  for (const attachment of attachments) {
    const contentType = attachment.contentType || '';
    // Gemini supporte nativement PDF et Images
    if (contentType.startsWith('image/') || contentType === 'application/pdf') {
      try {
        const response = await fetch(attachment.url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUri = `data:${contentType};base64,${base64}`;
        
        content.push({
          type: 'image_url', // Format standard multimédia
          image_url: { url: dataUri }
        });
      } catch (err) {
        console.error(`❌ Erreur téléchargement fichier ${attachment.name}:`, err.message);
      }
    }
  }

  if (content.length === 1) return null; // Rien à analyser

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/HASHT85/bot-discord-class',
        'X-Title': 'Discord Multi-Bot',
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('❌ Erreur Analyse Gemini:', err.message);
    return null;
  }
}

/**
 * Fait un appel API au fournisseur WRM
 */
async function callAIProvider(model, messages) {
  if (!process.env.WRM_API_KEY) {
    throw new Error('WRM_API_KEY (CyberNeurova) manquante dans le fichier .env');
  }

  const response = await fetch(WRM_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WRM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    const error = new Error(`API error ${response.status}`);
    error.status = response.status;
    error.body = responseText;
    throw error;
  }

  try {
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('data: ')) {
      cleanJson = cleanJson.split('\n')[0].replace(/^data: /, '').trim();
    }
    if (cleanJson.endsWith('[DONE]')) {
      cleanJson = cleanJson.replace(/\[DONE\]$/, '').trim();
    }
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error('❌ Erreur de parsing JSON:', err.message);
    throw new Error(`Format de réponse invalide de l'API CyberNeurova`);
  }
}

/**
 * Envoie un message au LLM via WRM (avec analyse préalable via Gemini si besoin)
 */
async function chat(guildId, userMessage, username, attachments = []) {
  const config = getGuildConfig(guildId);
  const history = getHistory(guildId);

  let model = config.model || DEFAULT_MODEL;

  // 1. Analyse des médias par Gemini si nécessaire
  let analysisReport = null;
  if (attachments.length > 0) {
    console.log(`🔄 Analyse de ${attachments.length} pièce(s) jointe(s) avec Gemini Flash...`);
    analysisReport = await analyzeMediaWithGemini(attachments);
  }

  // 2. Construction du message final pour WRM
  let finalContent;
  if (analysisReport) {
    finalContent = `[Rapport d'analyse des fichiers envoyés par ${username}]:\n${analysisReport}\n\n[Message de ${username}]: ${userMessage}`;
  } else {
    finalContent = `[${username}]: ${userMessage}`;
  }

  // Ajouter le message utilisateur à l'historique
  history.push({ role: 'user', content: finalContent });

  // Limiter l'historique
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }

  // Messages pour l'API WRM
  const messages = [
    { role: 'system', content: config.systemPrompt },
    ...history,
  ];

  try {
    console.log(`🔄 Appel CyberNeurova avec ${model}...`);
    const data = await callAIProvider(model, messages);

    if (!data.choices || data.choices.length === 0) {
      throw new Error('Pas de réponse du modèle');
    }

    const assistantMessage = data.choices[0].message.content;

    // Ajouter la réponse à l'historique
    history.push({ role: 'assistant', content: assistantMessage });

    return {
      content: assistantMessage,
      model: data.model || model,
    };
  } catch (err) {
    history.pop();
    console.error(`❌ Erreur CyberNeurova:`, err.message);
    if (err.body) console.error(`Body:`, err.body);
    throw new Error(`⏳ Erreur lors de l'appel à l'IA: ${err.message}`);
  }
}

module.exports = {
  chat,
  resetHistory,
};
