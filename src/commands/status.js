const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../config');
const { MODELS } = require('./model');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Afficher la configuration actuelle du bot'),

  async execute(interaction) {
    const config = getGuildConfig(interaction.guildId);
    const effortEmoji = { low: '🟢', medium: '🟡', high: '🔴' };
    const currentModel = MODELS.find(m => m.value === config.model);

    const embed = new EmbedBuilder()
      .setTitle('🤖 Configuration du Bot')
      .setColor(0x7c3aed)
      .addFields(
        {
          name: '📌 Channel',
          value: config.channelId ? `<#${config.channelId}>` : '❌ Non défini — utilise `/setchannel`',
          inline: true,
        },
        {
          name: '📡 Modèle',
          value: currentModel ? currentModel.name : config.model || 'Step 3.5 Flash',
          inline: true,
        },
        {
          name: '🖼️ Vision',
          value: currentModel?.vision ? '✅ Activée' : '❌ Désactivée',
          inline: true,
        },
        {
          name: '🧠 Reasoning',
          value: config.reasoning ? '✅ Activé' : '❌ Désactivé',
          inline: true,
        },
        {
          name: '⚡ Effort',
          value: `${effortEmoji[config.reasoningEffort]} ${config.reasoningEffort}`,
          inline: true,
        },
        {
          name: '💬 System Prompt',
          value: config.systemPrompt.length > 200
            ? config.systemPrompt.substring(0, 200) + '...'
            : config.systemPrompt,
        }
      )
      .setFooter({ text: 'via WRM API' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
