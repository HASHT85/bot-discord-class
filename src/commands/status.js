const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Afficher la configuration actuelle du bot'),

  async execute(interaction) {
    const config = getGuildConfig(interaction.guildId);
    const effortEmoji = { low: '🟢', medium: '🟡', high: '🔴' };

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
      .setFooter({ text: 'Step 3.5 Flash (free) via OpenRouter' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
