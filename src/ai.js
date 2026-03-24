const { getGuildConfig } = require('./config');
const pdf = require('pdf-parse');

const WRM_URL = 'https://api.wrmgpt.com/v1/chat/completions';
const DEFAULT_MODEL = 'wormgpt-v7';

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

    if (contentType === 'application/pdf') {
      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const data = await pdf(Buffer.from(buffer));
        content.push({
          type: 'text',
          text: `[Contenu du PDF "${attachment.name}"]: \n${data.text}`,
        });
      } catch (err) {
        console.error('Erreur PDF:', err.message);
        content.push({
          type: 'text',
          text: `[Fichier PDF: ${attachment.name} - erreur d'extraction de texte]`,
        });
      }
    } else if (contentType.startsWith('image/')) {
      try {
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
          text: `[Fichier Image: ${attachment.name} - erreur de téléchargement]`,
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
 * Fait un appel API au fournisseur WRM
 */
async function callAIProvider(model, messages) {
  if (!process.env.WRM_API_KEY) {
    throw new Error('WRM_API_KEY manquante dans le fichier .env');
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
      stream: false // Désactiver explicitement le streaming pour éviter le format SSE
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
    // Si la réponse commence par "data: ", c'est du format SSE (Server-Sent Events)
    // même si on a demandé stream: false, certains fournisseurs le font quand même.
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('data: ')) {
      // On prend seulement la première ligne si c'est du SSE type OpenRouter
      cleanJson = cleanJson.split('\n')[0].replace(/^data: /, '').trim();
    }

    // Si la réponse finit par [DONE], on le retire (cas rare en stream: false)
    if (cleanJson.endsWith('[DONE]')) {
      cleanJson = cleanJson.replace(/\[DONE\]$/, '').trim();
    }

    return JSON.parse(cleanJson);
  } catch (err) {
    console.error('❌ Erreur de parsing JSON:', err.message);
    console.error('Raw response:', responseText);
    throw new Error(`Format de réponse invalide de l'API WRM`);
  }
}

/**
 * Envoie un message au LLM via WRM
 */
async function chat(guildId, userMessage, username, attachments = []) {
  const config = getGuildConfig(guildId);
  const history = getHistory(guildId);

  let model = config.model || DEFAULT_MODEL;

  // Nettoyer le préfixe wrm: ou groq: si jamais il est resté dans la config
  if (model.includes(':')) {
    model = model.split(':')[1];
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

  try {
    console.log(`🔄 Appel WRM avec ${model}...`);
    const data = await callAIProvider(model, messages);

    if (!data.choices || data.choices.length === 0) {
      throw new Error('Pas de réponse du modèle');
    }

    const choice = data.choices[0];
    const assistantMessage = choice.message.content;

    // Ajouter la réponse à l'historique
    history.push({ role: 'assistant', content: assistantMessage });

    return {
      content: assistantMessage,
      model: data.model || model,
    };
  } catch (err) {
    history.pop(); // Retirer le message user en cas d'erreur
    console.error(`❌ Erreur WRM:`, err.message);
    throw new Error(`⏳ Erreur lors de l'appel à l'IA: ${err.message}`);
  }
}

module.exports = {
  chat,
  resetHistory,
};
