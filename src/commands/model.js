const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { updateGuildConfig, getGuildConfig } = require('../config');

// Modèles disponibles (via WRM)
const MODELS = [
  { name: '⚡ WormGPT v7', value: 'wormgpt-v7', vision: false },
  { name: '⚡ WormGPT v8 Lite', value: 'wormgpt-v8-lite', vision: false },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('model')
    .setDescription('Choisir le modèle LLM à utiliser')
    .addStringOption(option => {
      const opt = option
        .setName('model')
        .setDescription('Le modèle à utiliser')
        .setRequired(true);
      for (const model of MODELS) {
        opt.addChoices({ name: model.name, value: model.value });
      }
      return opt;
    }),

  async execute(interaction) {
    const modelValue = interaction.options.getString('model');
    const model = MODELS.find(m => m.value === modelValue);

    updateGuildConfig(interaction.guildId, { model: modelValue });

    const embed = new EmbedBuilder()
      .setTitle('🔄 Modèle changé')
      .setColor(0x7c3aed)
      .addFields(
        { name: '📡 Modèle', value: model.name, inline: true },
        { name: '🖼️ Vision', value: model.vision ? '✅ Images supportées' : '❌ Texte uniquement', inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  MODELS,
};
