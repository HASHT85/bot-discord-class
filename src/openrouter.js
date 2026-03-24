const { getGuildConfig } = require('./config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'stepfun/step-3.5-flash:free';

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
 * Envoie un message au LLM via OpenRouter et retourne la réponse
 */
async function chat(guildId, userMessage, username) {
  const config = getGuildConfig(guildId);
  const history = getHistory(guildId);

  // Ajouter le message utilisateur à l'historique
  history.push({
    role: 'user',
    content: `[${username}]: ${userMessage}`,
  });

  // Limiter l'historique à 50 messages pour éviter de dépasser les limites
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
    model: MODEL,
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
      model: data.model || MODEL,
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
