const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { updateGuildConfig, getGuildConfig } = require('../config');

// Modèles disponibles (gratuits sur OpenRouter)
const MODELS = [
  { name: '⚡ Step 3.5 Flash (free)', value: 'stepfun/step-3.5-flash:free', vision: false },
  { name: '💎 Gemma 3 4B (free)', value: 'google/gemma-3-4b-it:free', vision: true },
  { name: '💎 Gemma 3 12B (free)', value: 'google/gemma-3-12b-it:free', vision: true },
  { name: '💎 Gemma 3 27B (free)', value: 'google/gemma-3-27b-it:free', vision: true },
  { name: '🦙 Llama 3.2 11B Vision (free)', value: 'meta-llama/llama-3.2-11b-vision-instruct:free', vision: true },
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
