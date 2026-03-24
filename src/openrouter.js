const { getGuildConfig } = require('./config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'stepfun/step-3.5-flash:free';
const VISION_FALLBACK = 'google/gemma-3-27b-it:free';

// Modèles qui supportent la vision (ordre de fallback, payant en dernier recours)
const VISION_MODELS = [
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-4b-it:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'google/gemini-2.0-flash-001',  // payant ~$0.0005/image, toujours dispo
];

// Modèles texte de fallback
const TEXT_FALLBACK_MODELS = [
  'stepfun/step-3.5-flash:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-4b-it:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'xiaomi/mimo-v2-flash',
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

    if (contentType.startsWith('image/')) {
      content.push({
        type: 'image_url',
        image_url: { url },
      });
    } else if (contentType === 'application/pdf') {
      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        content.push({
          type: 'file',
          file: {
            filename: attachment.name || 'document.pdf',
            data: `data:application/pdf;base64,${base64}`,
          },
        });
      } catch (err) {
        content.push({
          type: 'text',
          text: `[Fichier joint: ${attachment.name} - impossible de traiter]`,
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
 * Fait un appel API à OpenRouter
 */
async function callOpenRouter(model, messages, reasoning) {
  const body = { model, messages };
  if (reasoning) {
    body.reasoning = { effort: reasoning };
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/bot-discord-class',
      'X-Title': 'Bot Discord Class',
    },
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

  // Détecter si il y a des images
  const hasImages = attachments.some(a => (a.contentType || '').startsWith('image/'));

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
      const data = await callOpenRouter(tryModel, messages, reasoning);

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
      if (err.status === 429 || err.status === 404 || err.status === 503) {
        console.log(`⚠️  ${tryModel} indisponible (${err.status}), essai suivant...`);
        continue; // Essayer le modèle suivant
      }
      // Autre erreur → stop
      break;
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
