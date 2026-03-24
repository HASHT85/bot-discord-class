require('dotenv').config();
const { REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function cleanup() {
  await rest.put(Routes.applicationCommands('1485924462887964844'), { body: [] });
  console.log('Commandes globales supprimees - plus de doublons');
}

cleanup().catch(console.error);
