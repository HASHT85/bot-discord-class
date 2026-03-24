require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  Partials,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const { getGuildConfig } = require('./config');
const { chat } = require('./openrouter');

// ─── Vérification des variables d'environnement ────────────────────
const requiredEnv = ['DISCORD_TOKEN', 'OPENROUTER_API_KEY', 'GUILD_ID'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`❌ Variable d'environnement manquante : ${env}`);
    console.error(`   Copie .env.example → .env et remplis les valeurs.`);
    process.exit(1);
  }
}

// ─── Créer le client Discord ────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ─── Charger les commandes ──────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

const commandsData = [];
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  commandsData.push(command.data.toJSON());
}

// ─── Enregistrer les slash commands ─────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log(`🔄 Enregistrement de ${commandsData.length} commande(s)...`);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commandsData }
    );

    console.log(`✅ ${commandsData.length} commande(s) enregistrée(s) !`);
  } catch (err) {
    console.error('❌ Erreur enregistrement des commandes:', err);
  }
}

// ─── Gestion des interactions (slash commands) ──────────────────────
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Erreur commande /${interaction.commandName}:`, err);
    const reply = {
      content: '❌ Une erreur est survenue lors de l\'exécution de cette commande.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ─── Gestion des messages (réponse via LLM) ─────────────────────────
client.on(Events.MessageCreate, async message => {
  // Ignorer les bots et les messages sans guild
  if (message.author.bot || !message.guild) return;

  const config = getGuildConfig(message.guild.id);

  // Vérifier si le message est dans le channel configuré
  if (!config.channelId || message.channel.id !== config.channelId) return;

  // Indicateur de typing
  await message.channel.sendTyping();

  // Rafraîchir le typing toutes les 8 secondes pour les longues réponses
  const typingInterval = setInterval(() => {
    message.channel.sendTyping().catch(() => {});
  }, 8000);

  try {
    const result = await chat(
      message.guild.id,
      message.content,
      message.author.displayName || message.author.username,
      Array.from(message.attachments.values())
    );

    clearInterval(typingInterval);

    // Construire la réponse
    let response = result.content;

    // Indiquer si le modèle vision a été utilisé automatiquement
    if (result.usedVisionFallback) {
      response = `-# 🖼️ Image détectée → modèle vision utilisé automatiquement\n${response}`;
    }

    // Indiquer si un modèle de fallback a été utilisé
    if (result.usedFallbackModel) {
      response = `-# 🔄 Modèle principal occupé → fallback sur ${result.usedFallbackModel.split('/').pop()}\n${response}`;
    }

    // Afficher le reasoning si présent et activé
    if (result.reasoning && config.reasoning) {
      const reasoningText = result.reasoning.length > 1000
        ? result.reasoning.substring(0, 1000) + '...'
        : result.reasoning;
      response = `> 🧠 **Reasoning:**\n> ${reasoningText.split('\n').join('\n> ')}\n\n${response}`;
    }

    // Discord limite les messages à 2000 caractères
    if (response.length <= 2000) {
      await message.reply(response);
    } else {
      // Découper en plusieurs messages
      const chunks = splitMessage(response, 2000);
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          await message.reply(chunks[i]);
        } else {
          await message.channel.send(chunks[i]);
        }
      }
    }
  } catch (err) {
    clearInterval(typingInterval);
    console.error('❌ Erreur chat:', err);
    await message.reply(`❌ **Erreur :** ${err.message}`);
  }
});

/**
 * Découpe un message en morceaux de taille max
 */
function splitMessage(text, maxLength) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Chercher un bon point de coupure
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

// ─── Bot prêt ───────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  🤖 Bot connecté : ${client.user.tag.padEnd(25)}║`);
  console.log('║  📡 Modèle : Step 3.5 Flash (free)          ║');
  console.log('║  🔗 API : OpenRouter                        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  await registerCommands();

  const config = getGuildConfig(process.env.GUILD_ID);
  if (config.channelId) {
    console.log(`📌 Channel actif : #${config.channelId}`);
  } else {
    console.log('⚠️  Aucun channel configuré. Utilise /setchannel dans Discord.');
  }

  // ─── Patchnote automatique ──────────────────────────────────────
  await announcePatchnote(config);
});

/**
 * Annonce le patchnote dans le channel configuré si nouvelle version
 */
async function announcePatchnote(config) {
  try {
    const versionData = require('../version.json');
    const currentVersion = versionData.version;
    const lastAnnounced = config.lastAnnouncedVersion || null;

    // Si même version, ne rien faire
    if (lastAnnounced === currentVersion) return;
    if (!config.channelId) return;

    const channel = await client.channels.fetch(config.channelId).catch(() => null);
    if (!channel) return;

    // Trouver le changelog de la version actuelle
    const entry = versionData.changelog.find(c => c.version === currentVersion);
    if (!entry) return;

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle(`📋 Patchnote — v${entry.version}`)
      .setDescription(`## ${entry.title}`)
      .addFields({
        name: '📝 Changements',
        value: entry.changes.join('\n'),
      })
      .setColor(0x7c3aed)
      .setFooter({ text: `spy_H v${entry.version} • ${entry.date}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`📋 Patchnote v${currentVersion} envoyé !`);

    // Sauvegarder la version annoncée
    const { updateGuildConfig } = require('./config');
    updateGuildConfig(process.env.GUILD_ID, { lastAnnouncedVersion: currentVersion });
  } catch (err) {
    console.error('⚠️  Erreur patchnote:', err.message);
  }
}

// ─── Connexion ──────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
