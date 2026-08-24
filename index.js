const { Client, GatewayIntentBits, Collection, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const config = require('./config.json');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();

function isAdmin(userId) {
  return config.adminIds.includes(userId);
}

const PURPLE = 0xa855f7;
const GREEN = 0x22c55e;
const RED = 0xef4444;
const YELLOW = 0xeab308;

const commands = [
  new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Active une clé de license Kyro Spoofer')
    .addStringOption(opt =>
      opt.setName('key').setDescription('Ta clé de license (ex: KYRO-XXXX-XXXX-XXXX-XXXX)').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Vérifie si une clé est valide')
    .addStringOption(opt =>
      opt.setName('key').setDescription('La clé à vérifier').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('gen')
    .setDescription('Génère des clés (Admin uniquement)')
    .addIntegerOption(opt =>
      opt.setName('count').setDescription('Nombre de clés (max 25)').setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('duration').setDescription('Durée en jours (défaut: 30)').setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('note').setDescription('Note optionnelle').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('keys')
    .setDescription('Liste toutes les clés (Admin uniquement)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Révoque une clé (Admin uniquement)')
    .addStringOption(opt =>
      opt.setName('key').setDescription('La clé à révoquer').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Supprime une clé (Admin uniquement)')
    .addStringOption(opt =>
      opt.setName('key').setDescription('La clé à supprimer').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('server')
    .setDescription('Vérifie le statut du serveur de licenses'),
];

async function api(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.adminToken) headers['X-Admin-Token'] = config.adminToken;

  const opts = { method, headers, timeout: 15000 };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(config.serverUrl + endpoint, opts);
  return res.json();
}

client.once('ready', async () => {
  console.log(`\n  KYRO BOT - Connecté en tant que ${client.user.tag}`);
  console.log(`  Serveurs: ${client.guilds.cache.size}\n`);

  const rest = new REST({ version: '10' }).setToken(config.token);
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('  Commandes slash deployées!\n');
  } catch (err) {
    console.error('  Erreur deploy:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, member } = interaction;

  if (commandName === 'redeem') {
    const key = interaction.options.getString('key').trim().toUpperCase();

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/validate', 'POST', {
        key,
        discord_id: user.id,
        discord_username: user.username,
        discord_avatar: user.avatar || '',
      });

      if (result.valid) {
        const embed = new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('✅ License Activée')
          .setDescription(`Ta clé a été activée avec succès !`)
          .addFields(
            { name: 'Clé', value: `\`${key}\``, inline: true },
            { name: 'Statut', value: 'Active', inline: true },
          )
          .setFooter({ text: 'Kyro Spoofer' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(RED)
          .setTitle('❌ Clé Invalide')
          .setDescription(result.message || 'Cette clé n\'est pas valide ou a expiré.')
          .setFooter({ text: 'Kyro Spoofer' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      const embed = new EmbedBuilder()
        .setColor(RED)
        .setTitle('❌ Erreur')
        .setDescription('Impossible de contacter le serveur de licenses. Réessayez plus tard.')
        .setFooter({ text: 'Kyro Spoofer' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  }

  if (commandName === 'check') {
    const key = interaction.options.getString('key').trim().toUpperCase();
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/validate', 'POST', { key });

      const embed = new EmbedBuilder()
        .setColor(result.valid ? GREEN : RED)
        .setTitle(result.valid ? '✅ Clé Valide' : '❌ Clé Invalide')
        .setDescription(result.message || (result.valid ? 'Cette clé est valide.' : 'Clé introuvable ou expirée.'))
        .setFooter({ text: 'Kyro Spoofer' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('Erreur de connexion au serveur.')
      ] });
    }
  }

  if (commandName === 'gen') {
    if (!isAdmin(user.id)) {
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('❌ Accès refusé.')
      ], ephemeral: true });
    }

    const count = Math.min(interaction.options.getInteger('count') || 1, 25);
    const duration = interaction.options.getInteger('duration') || 30;
    const note = interaction.options.getString('note') || '';

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/key/add', 'POST', {
        count,
        duration_days: duration,
        note,
      });

      if (result.keys) {
        const keysFormatted = result.keys.map(k => `\`${k}\``).join('\n');

        const embed = new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle(`🔑 ${result.keys.length} Clé(s) Générée(s)`)
          .setDescription(keysFormatted)
          .addFields(
            { name: 'Durée', value: `${duration} jours`, inline: true },
            { name: 'Note', value: note || 'Aucune', inline: true },
          )
          .setFooter({ text: 'Kyro Spoofer' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(RED).setDescription(`Erreur: ${result.error || 'Inconnue'}`)
        ] });
      }
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('Erreur de connexion au serveur.')
      ] });
    }
  }

  if (commandName === 'keys') {
    if (!isAdmin(user.id)) {
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('❌ Accès refusé.')
      ], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/key/list');

      if (result.keys) {
        const keys = Object.entries(result.keys);
        const total = keys.length;
        const active = keys.filter(([, v]) => v.active).length;

        let list = '';
        const display = keys.slice(0, 15);
        for (const [key, info] of display) {
          const status = info.active ? '🟢' : '🔴';
          list += `${status} \`${key}\``;
          if (info.note) list += ` — ${info.note}`;
          list += '\n';
        }
        if (keys.length > 15) list += `\n*...et ${keys.length - 15} autres*`;

        const embed = new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle(`📋 Clés (${total} total, ${active} actives)`)
          .setDescription(list || 'Aucune clé')
          .setFooter({ text: 'Kyro Spoofer' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('Erreur de connexion au serveur.')
      ] });
    }
  }

  if (commandName === 'revoke') {
    if (!isAdmin(user.id)) {
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('❌ Accès refusé.')
      ], ephemeral: true });
    }

    const key = interaction.options.getString('key').trim().toUpperCase();
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/key/revoke', 'POST', { key });

      if (result.revoked) {
        await interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(YELLOW).setDescription(`🔑 Clé \`${key}\` révoquée.`)
        ] });
      } else {
        await interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(RED).setDescription(result.error || 'Clé introuvable.')
        ] });
      }
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('Erreur de connexion au serveur.')
      ] });
    }
  }

  if (commandName === 'delete') {
    if (!isAdmin(user.id)) {
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('❌ Accès refusé.')
      ], ephemeral: true });
    }

    const key = interaction.options.getString('key').trim().toUpperCase();
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/key/delete', 'POST', { key });

      if (result.deleted) {
        await interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(RED).setDescription(`🗑️ Clé \`${key}\` supprimée.`)
        ] });
      } else {
        await interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(RED).setDescription(result.error || 'Clé introuvable.')
        ] });
      }
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('Erreur de connexion au serveur.')
      ] });
    }
  }

  if (commandName === 'server') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await api('/api/health');

      if (result.status === 'ok') {
        const embed = new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('🟢 Serveur En Ligne')
          .addFields(
            { name: 'Status', value: result.status, inline: true },
            { name: 'Serveur', value: result.server || 'Unknown', inline: true },
            { name: 'Version', value: result.version || '?', inline: true },
          )
          .setFooter({ text: 'Kyro Spoofer' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(RED).setDescription('🔴 Serveur hors ligne.')
        ] });
      }
    } catch (err) {
      await interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription('🔴 Impossible de contacter le serveur.')
      ] });
    }
  }
});

client.login(config.token);
