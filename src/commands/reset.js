const { SlashCommandBuilder } = require('discord.js');
const { resetHistory } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription("Réinitialiser l'historique de conversation du bot"),

  async execute(interaction) {
    resetHistory(interaction.guildId);

    await interaction.reply({
      content: '🗑️ **Historique de conversation réinitialisé !**',
      ephemeral: true,
    });
  },
};
