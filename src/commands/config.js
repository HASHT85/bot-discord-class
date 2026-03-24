const { SlashCommandBuilder } = require('discord.js');
const { updateGuildConfig, getGuildConfig } = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer le bot (reasoning, effort)')
    .addBooleanOption(option =>
      option
        .setName('reasoning')
        .setDescription('Activer ou désactiver le reasoning')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('effort')
        .setDescription("Niveau d'effort du reasoning")
        .setRequired(false)
        .addChoices(
          { name: '🟢 Low', value: 'low' },
          { name: '🟡 Medium', value: 'medium' },
          { name: '🔴 High', value: 'high' }
        )
    ),

  async execute(interaction) {
    const reasoning = interaction.options.getBoolean('reasoning');
    const effort = interaction.options.getString('effort');

    const updates = {};
    const changes = [];

    if (reasoning !== null) {
      updates.reasoning = reasoning;
      changes.push(`Reasoning: ${reasoning ? '✅ Activé' : '❌ Désactivé'}`);
    }

    if (effort !== null) {
      updates.reasoningEffort = effort;
      const effortEmoji = { low: '🟢', medium: '🟡', high: '🔴' };
      changes.push(`Effort: ${effortEmoji[effort]} ${effort}`);
    }

    if (changes.length === 0) {
      const config = getGuildConfig(interaction.guildId);
      const effortEmoji = { low: '🟢', medium: '🟡', high: '🔴' };
      await interaction.reply({
        content: [
          '⚙️ **Configuration actuelle :**',
          `> Reasoning: ${config.reasoning ? '✅ Activé' : '❌ Désactivé'}`,
          `> Effort: ${effortEmoji[config.reasoningEffort]} ${config.reasoningEffort}`,
        ].join('\n'),
        ephemeral: true,
      });
      return;
    }

    updateGuildConfig(interaction.guildId, updates);

    await interaction.reply({
      content: `⚙️ **Configuration mise à jour :**\n${changes.map(c => `> ${c}`).join('\n')}`,
      ephemeral: true,
    });
  },
};
