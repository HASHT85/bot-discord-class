const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { updateGuildConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Définir le channel où le bot répond aux messages')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Le channel où le bot doit répondre')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    updateGuildConfig(interaction.guildId, { channelId: channel.id });

    await interaction.reply({
      content: `✅ Le bot répondra maintenant dans <#${channel.id}>`,
      ephemeral: true,
    });
  },
};
