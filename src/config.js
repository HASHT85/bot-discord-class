const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config-data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'guilds.json');

// Configuration par défaut pour un serveur
const DEFAULT_CONFIG = {
  channelId: process.env.DEFAULT_CHANNEL_ID || null,
  model: 'wormgpt-v7',
  systemPrompt: process.env.SYSTEM_PROMPT || 'Tu es un assistant intelligent et utile. Réponds de manière claire et concise en français.',
};

// Stockage en mémoire
let guildConfigs = {};

/**
 * Charge la configuration depuis le fichier JSON
 */
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      guildConfigs = JSON.parse(data);
    }
  } catch (err) {
    console.error('Erreur chargement config:', err.message);
    guildConfigs = {};
  }
}

/**
 * Sauvegarde la configuration dans le fichier JSON
 */
function saveConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(guildConfigs, null, 2));
  } catch (err) {
    console.error('Erreur sauvegarde config:', err.message);
  }
}

/**
 * Récupère la config d'un serveur (crée la config par défaut si inexistante)
 */
function getGuildConfig(guildId) {
  if (!guildConfigs[guildId]) {
    guildConfigs[guildId] = { ...DEFAULT_CONFIG };
    saveConfig();
  }
  return guildConfigs[guildId];
}

/**
 * Met à jour la config d'un serveur
 */
function updateGuildConfig(guildId, updates) {
  const config = getGuildConfig(guildId);
  Object.assign(config, updates);
  guildConfigs[guildId] = config;
  saveConfig();
  return config;
}

// Charger la config au démarrage
loadConfig();

module.exports = {
  getGuildConfig,
  updateGuildConfig,
  DEFAULT_CONFIG,
};
