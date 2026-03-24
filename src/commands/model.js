const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { updateGuildConfig, getGuildConfig } = require('../config');

// Modèles disponibles (gratuits sur OpenRouter)
const MODELS = [
  { name: '✨ Gemini 2.0 Flash (vision)', value: 'google/gemini-2.0-flash-001', vision: true },
  { name: '💻 Qwen 2.5 Coder 32B', value: 'qwen/qwen-2.5-coder-32b-instruct', vision: false },
  { name: '⚡ Llama 3.3 70B (Groq)', value: 'groq:llama-3.3-70b-versatile', vision: false },
  { name: '🚀 Mixtral 8x7b (Groq)', value: 'groq:mixtral-8x7b-32768', vision: false },
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
