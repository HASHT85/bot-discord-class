# 🤖 Bot Discord — Step 3.5 Flash (OpenRouter)

Bot Discord configurable via slash commands, connecté à l'API OpenRouter pour chatter avec le modèle **Step 3.5 Flash (free)**.

## ✨ Fonctionnalités

| Commande | Description |
|---|---|
| `/setchannel #channel` | Choisir le channel de réponse |
| `/config` | Activer/désactiver le reasoning + effort |
| `/systemprompt [texte]` | Modifier la personnalité du bot |
| `/reset` | Effacer l'historique de conversation |
| `/status` | Voir la configuration actuelle |

## 📦 Installation

### 1. Prérequis
- [Node.js](https://nodejs.org) v18+
- Un bot Discord créé sur le [Developer Portal](https://discord.com/developers/applications)
- Une clé API [OpenRouter](https://openrouter.ai/keys)

### 2. Configuration

```bash
# Cloner le repo
git clone <url-du-repo>
cd bot-discord-class

# Installer les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
```

Remplis le `.env` avec tes valeurs :
```env
DISCORD_TOKEN=ton_token_discord
OPENROUTER_API_KEY=ta_cle_openrouter
GUILD_ID=id_du_serveur
```

### 3. Lancer le bot

```bash
npm start
```

Mode développement (auto-reload) :
```bash
npm run dev
```

## 🛠️ Configuration Discord Developer Portal

1. **Bot** : Active **Message Content Intent**
2. **OAuth2 → URL Generator** : Coche `bot` + `applications.commands`
3. **Bot Permissions** : Send Messages, Read Message History, Use Slash Commands, Embed Links
4. Utilise l'URL générée pour inviter le bot

## 📁 Structure

```
├── src/
│   ├── index.js          # Point d'entrée
│   ├── config.js         # Gestion de la config par serveur
│   ├── openrouter.js     # Appels API OpenRouter
│   └── commands/
│       ├── setchannel.js  # /setchannel
│       ├── config.js      # /config
│       ├── systemprompt.js # /systemprompt
│       ├── reset.js       # /reset
│       └── status.js      # /status
├── .env.example
├── package.json
└── README.md
```
