const { getGuildConfig } = require('./config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.wrmgpt.com/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
const VISION_FALLBACK = 'google/gemini-2.0-flash-001';

// Modèles qui supportent la vision (payant, toujours dispo)
const VISION_MODELS = [
  'google/gemini-2.0-flash-001',
];

// Modèles texte de fallback (tous payants, toujours dispo)
const TEXT_FALLBACK_MODELS = [
  'google/gemini-2.0-flash-001',
  'qwen/qwen-2.5-coder-32b-instruct',
];

function isVisionModel(model) {
  return VISION_MODELS.includes(model);
}

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
 * Télécharge une image et la convertit en base64
 */
async function imageUrlToBase64(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/png';
  return { base64, contentType };
}

/**
 * Construit le contenu du message avec les pièces jointes (multimodal)
 */
async function buildMessageContent(text, attachments, username) {
  const content = [];

  // Ajouter le texte
  if (text) {
    content.push({
      type: 'text',
      text: `[${username}]: ${text}`,
    });
  }

  // Traiter les pièces jointes
  for (const attachment of attachments) {
    const url = attachment.url;
    const contentType = attachment.contentType || '';

    if (contentType.startsWith('image/') || contentType === 'application/pdf') {
      try {
        // Télécharger et convertir en base64 (les URLs Discord ne sont pas accessibles par l'API)
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUri = `data:${contentType};base64,${base64}`;
        content.push({
          type: 'image_url',
          image_url: { url: dataUri },
        });
      } catch (err) {
        content.push({
          type: 'text',
          text: `[Fichier: ${attachment.name} - erreur de téléchargement]`,
        });
      }
    } else {
      content.push({
        type: 'text',
        text: `[Fichier joint: ${attachment.name} (${contentType})]`,
      });
    }
  }

  return content;
}

/**
 * Fait un appel API au fournisseur approprié (OpenRouter ou Groq)
 */
async function callAIProvider(model, messages, reasoning) {
  let url = OPENROUTER_URL;
  let headers = {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/bot-discord-class',
    'X-Title': 'Bot Discord Class',
  };

  let actualModel = model;

  // Si le modèle commence par 'groq:', on utilise l'API Groq directement
  if (model.startsWith('groq:')) {
    actualModel = model.replace('groq:', '');
    url = GROQ_URL;
    headers = {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    };

    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY manquante dans le fichier .env');
    }
  }

  const body = { model: actualModel, messages };

  // Le reasoning ne fonctionne pour l'instant que sur OpenRouter
  if (reasoning && url === OPENROUTER_URL) {
    body.reasoning = { effort: reasoning };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`API error ${response.status}`);
    error.status = response.status;
    error.body = errorText;
    throw error;
  }

  return response.json();
}

/**
 * Envoie un message au LLM via OpenRouter avec retry + fallback
 */
async function chat(guildId, userMessage, username, attachments = []) {
  const config = getGuildConfig(guildId);
  const history = getHistory(guildId);

  // Détecter si il y a des images ou PDFs (contenu multimodal)
  const hasImages = attachments.some(a => {
    const ct = (a.contentType || '');
    return ct.startsWith('image/') || ct === 'application/pdf';
  });

  // Choisir le modèle et la liste de fallback
  let model = config.model || DEFAULT_MODEL;
  let usedVisionFallback = false;
  let fallbackModels;

  if (hasImages) {
    if (!isVisionModel(model)) {
      model = VISION_FALLBACK;
      usedVisionFallback = true;
    }
    fallbackModels = VISION_MODELS.filter(m => m !== model);
  } else {
    fallbackModels = TEXT_FALLBACK_MODELS.filter(m => m !== model);
  }

  // Construire le contenu du message
  let messageContent;
  if (attachments.length > 0) {
    messageContent = await buildMessageContent(userMessage, attachments, username);
  } else {
    messageContent = `[${username}]: ${userMessage}`;
  }

  // Ajouter le message utilisateur à l'historique
  history.push({ role: 'user', content: messageContent });

  // Limiter l'historique à 50 messages
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }

  // Messages pour l'API
  const messages = [
    { role: 'system', content: config.systemPrompt },
    ...history,
  ];

  const reasoning = config.reasoning ? config.reasoningEffort : null;

  // Essayer le modèle principal + fallbacks
  const modelsToTry = [model, ...fallbackModels];
  let lastError = null;

  for (const tryModel of modelsToTry) {
    try {
      console.log(`🔄 Essai ${tryModel}...`);
      const data = await callAIProvider(tryModel, messages, reasoning);

      if (!data.choices || data.choices.length === 0) {
        throw new Error('Pas de réponse du modèle');
      }

      const choice = data.choices[0];
      const assistantMessage = choice.message.content;
      const reasoningResult = choice.message.reasoning || null;

      // Ajouter la réponse à l'historique
      history.push({ role: 'assistant', content: assistantMessage });

      const usedFallback = tryModel !== model;
      if (usedFallback) {
        console.log(`✅ Fallback réussi sur ${tryModel}`);
      }

      return {
        content: assistantMessage,
        reasoning: reasoningResult,
        model: data.model || tryModel,
        usedVisionFallback: usedVisionFallback || (hasImages && tryModel !== (config.model || DEFAULT_MODEL)),
        usedFallbackModel: usedFallback ? tryModel : null,
      };
    } catch (err) {
      lastError = err;
      console.log(`⚠️  ${tryModel} échoué (${err.status || err.message}), essai suivant...`);
      continue; // Toujours essayer le modèle suivant
    }
  }

  // Tous les modèles ont échoué
  history.pop(); // Retirer le message user
  throw new Error('⏳ Tous les modèles gratuits sont temporairement surchargés. Réessaie dans quelques secondes !');
}

module.exports = {
  chat,
  resetHistory,
};
