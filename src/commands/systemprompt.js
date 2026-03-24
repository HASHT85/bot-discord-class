const { SlashCommandBuilder } = require('discord.js');
const { updateGuildConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('systemprompt')
    .setDescription('Modifier le system prompt du bot')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Le nouveau system prompt')
        .setRequired(true)
        .setMaxLength(2000)
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString('prompt');

    updateGuildConfig(interaction.guildId, { systemPrompt: prompt });

    await interaction.reply({
      content: `✅ **System prompt mis à jour :**\n> ${prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt}`,
      ephemeral: true,
    });
  },
};
