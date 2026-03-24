const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('patchnote')
    .setDescription('Voir les patchnotes et la version actuelle du bot'),

  async execute(interaction) {
    const versionData = require('../../version.json');

    const embeds = [];

    for (const entry of versionData.changelog) {
      const isLatest = entry.version === versionData.version;

      const embed = new EmbedBuilder()
        .setTitle(`${isLatest ? '📋' : '📜'} v${entry.version} — ${entry.title}`)
        .setDescription(entry.changes.join('\n'))
        .setColor(isLatest ? 0x7c3aed : 0x4b5563)
        .setFooter({ text: entry.date })

      if (isLatest) {
        embed.setAuthor({ name: '🟢 Version actuelle' });
      }

      embeds.push(embed);
    }

    await interaction.reply({ embeds, ephemeral: true });
  },
};
