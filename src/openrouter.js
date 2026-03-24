const { getGuildConfig } = require('./config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'stepfun/step-3.5-flash:free';
const VISION_FALLBACK = 'google/gemma-3-27b-it:free';

// Modèles qui supportent la vision
const VISION_MODELS = [
  'google/gemma-3-4b-it:free',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
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
      // Image : envoyer comme URL directe (OpenRouter le supporte)
      content.push({
        type: 'image_url',
        image_url: { url },
      });
    } else if (contentType === 'application/pdf') {
      // PDF : envoyer comme fichier
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
      // Autres fichiers : mentionner le nom
      content.push({
        type: 'text',
        text: `[Fichier joint: ${attachment.name} (${contentType})]`,
      });
    }
  }

  return content;
}

/**
 * Envoie un message au LLM via OpenRouter et retourne la réponse
 */
async function chat(guildId, userMessage, username, attachments = []) {
  const config = getGuildConfig(guildId);
  const history = getHistory(guildId);

  // Détecter si il y a des images dans les pièces jointes
  const hasImages = attachments.some(a => (a.contentType || '').startsWith('image/'));

  // Auto-switch : utiliser le modèle vision si images détectées
  let model = config.model || DEFAULT_MODEL;
  let usedVisionFallback = false;
  if (hasImages && !isVisionModel(model)) {
    model = VISION_FALLBACK;
    usedVisionFallback = true;
  }

  // Construire le contenu du message (texte simple ou multimodal)
  let messageContent;
  if (attachments.length > 0) {
    messageContent = await buildMessageContent(userMessage, attachments, username);
  } else {
    messageContent = `[${username}]: ${userMessage}`;
  }

  // Ajouter le message utilisateur à l'historique
  history.push({
    role: 'user',
    content: messageContent,
  });

  // Limiter l'historique à 50 messages
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }

  // Construire les messages pour l'API
  const messages = [
    {
      role: 'system',
      content: config.systemPrompt,
    },
    ...history,
  ];

  // Construire le body de la requête
  const body = {
    model,
    messages,
  };

  // Ajouter le reasoning si activé
  if (config.reasoning) {
    body.reasoning = {
      effort: config.reasoningEffort,
    };
  }

  try {
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
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('Pas de réponse du modèle');
    }

    const choice = data.choices[0];
    const assistantMessage = choice.message.content;
    const reasoning = choice.message.reasoning || null;

    // Ajouter la réponse à l'historique
    history.push({
      role: 'assistant',
      content: assistantMessage,
    });

    return {
      content: assistantMessage,
      reasoning: reasoning,
      model: data.model || model,
      usedVisionFallback,
    };
  } catch (err) {
    // Retirer le dernier message user en cas d'erreur
    history.pop();
    throw err;
  }
}

module.exports = {
  chat,
  resetHistory,
};
