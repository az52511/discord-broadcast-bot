const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Partials,
  SlashCommandBuilder
} = require('discord.js');

// Import configuration from config.json file
const { token, allowedRoleId, guildId, image, logsChannelId } = require('./config.json');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

// Initialize the Discord bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

// Define the slash command
const broadcastCommand = new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('Open broadcast control panel');

/**
 * Logs all broadcast activities to a dedicated channel and database
 * Tracks: who used the command, broadcast type, target, and statistics
 */
async function logBroadcastAction({
  userId,
  userName,
  actionType,
  targetType,
  targetName,
  messagePreview,
  successCount,
  failureCount,
  additionalInfo,
  guildName
}) {
  if (!logsChannelId) {
    console.log('⚠️ Logs channel ID not configured in config.json');
    return;
  }

  try {
    const logsChannel = client.channels.cache.get(logsChannelId);
    if (!logsChannel) {
      console.log('⚠️ Logs channel not found');
      return;
    }

    // Format timestamp with Saudi Arabia timezone
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Build the log message embed
    const logEmbed = new EmbedBuilder()
      .setColor('#2563eb')
      .setTitle('📊 Broadcast Activity Log')
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3143/3143615.png')
      .addFields(
        {
          name: 'User',
          value: `<@${userId}> • **${userName}**`,
          inline: false
        },
        {
          name: 'Action Type',
          value: actionType,
          inline: true
        },
        {
          name: 'Target Type',
          value: targetType,
          inline: true
        },
        {
          name: 'Target Name',
          value: targetName || 'N/A',
          inline: true
        },
        {
          name: 'Message Preview',
          value: `\`\`\`${messagePreview.slice(0, 180)}${messagePreview.length > 180 ? '...' : ''}\`\`\``,
          inline: false
        },
        {
          name: 'Statistics',
          value: `✅ Success: **${successCount}**\n❌ Failed: **${failureCount}**\n📈 Total: **${successCount + failureCount}**`,
          inline: true
        },
        {
          name: 'Server',
          value: guildName || 'N/A',
          inline: true
        },
        {
          name: 'Timestamp',
          value: timestamp,
          inline: true
        }
      );

    // Add additional info if provided
    if (additionalInfo) {
      logEmbed.addFields({
        name: 'Additional Info',
        value: additionalInfo,
        inline: false
      });
    }

    logEmbed.setFooter({
      text: 'Discord Broadcast Bot | Activity Logger'
    });

    // Send the log message to logs channel
    await logsChannel.send({ embeds: [logEmbed] });

    // Save data to database for future statistics
    await db.set(`broadcast_log_${Date.now()}`, {
      userId,
      userName,
      actionType,
      targetType,
      targetName,
      successCount,
      failureCount,
      messagePreview,
      timestamp: new Date().toISOString(),
      guildName
    });

  } catch (error) {
    console.error('❌ Error logging broadcast action:', error);
  }
}

/**
 * Get action type name in a clear and readable format
 */
function getActionTypeName(customId) {
  const actionMap = {
    send_all: 'Send to All Members',
    send_online: 'Send to Online Members',
    send_offline: 'Send to Offline Members',
    send_by_role: 'Send by Role',
    send_to_user: 'Send to Specific User'
  };

  return actionMap[customId] || customId;
}

// Always place the recipient mention on its own last line (remove duplicates if present)
function placeMentionOnLastLine(messageText, userId) {
  try {
    const mention = `<@${userId}>`;
    const mentionRegex = new RegExp(`<@!?${userId}>`, 'g');

    // If message is empty or only whitespace, return mention only
    if (!messageText || messageText.trim() === '') return mention;

    // Remove existing occurrences of the mention for this user and trim
    let cleaned = messageText.replace(mentionRegex, '').trim();

    // Remove trailing whitespace/newlines
    cleaned = cleaned.replace(/[ \t]+$/g, '').replace(/\n+$/g, '');

    // If nothing left after cleaning, return mention only
    if (cleaned === '') return mention;

    // Return cleaned text with mention on its own last line
    return `${cleaned}\n${mention}`;
  } catch (e) {
    return messageText || `<@${userId}>`;
  }
}

/**
 * Bot ready event - fires when the bot successfully connects to Discord
 */
client.once('ready', async () => {
  console.log('✅ Bot is Ready!');
  client.user.setActivity('/broadcast for control panel', { type: 'LISTENING' });

  try {
    await client.application.commands.set([broadcastCommand.toJSON()], guildId);
    console.log('✅ Slash command registered successfully');
  } catch (error) {
    console.error('❌ Error registering slash command:', error);
  }
});

/**
 * Main interaction handler - processes commands, buttons, and modals
 */
client.on('interactionCreate', async (interaction) => {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'broadcast') {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        // Verify user has the allowed role
        if (!member || !member.roles.cache.has(allowedRoleId)) {
          return interaction.reply({
            content: '❌ You do not have permission to use this command!',
            ephemeral: true
          });
        }

        // Display the main control panel
        const controlPanelEmbed = new EmbedBuilder()
          .setColor('#1e1e2e')
          .setTitle('🎙️ Broadcast Control Panel')
          .setImage(image)
          .setDescription('Select the type of broadcast for your members.')
          .setFooter({ text: 'Click a button below to proceed' });

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('send_all')
            .setLabel('Send to All')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📢'),

          new ButtonBuilder()
            .setCustomId('send_online')
            .setLabel('Send to Online')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🟢'),

          new ButtonBuilder()
            .setCustomId('send_offline')
            .setLabel('Send to Offline')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔴'),

          new ButtonBuilder()
            .setCustomId('send_by_role')
            .setLabel('Send by Role')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏷️'),

          new ButtonBuilder()
            .setCustomId('send_to_user')
            .setLabel('Send to User')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👤')
        );

        await interaction.reply({
          embeds: [controlPanelEmbed],
          components: [actionRow],
          ephemeral: true
        });
      }
    }

    // Handle button clicks - shows input modal
    if (interaction.isButton()) {
      let modalId = null;

      // Determine modal type based on button clicked
      if (interaction.customId === 'send_all') {
        modalId = 'modal_all';
      } else if (interaction.customId === 'send_online') {
        modalId = 'modal_online';
      } else if (interaction.customId === 'send_offline') {
        modalId = 'modal_offline';
      } else if (interaction.customId === 'send_by_role') {
        modalId = 'modal_by_role';
      } else if (interaction.customId === 'send_to_user') {
        modalId = 'modal_to_user';
      }

      if (!modalId) return;

      // Create the input modal
      const messageModal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('✍️ Write Your Message');

      // Message field - required for all cases
      const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('Enter your message here')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      // For sending to specific user - add User ID field
      if (modalId === 'modal_to_user') {
        const userIdInput = new TextInputBuilder()
          .setCustomId('userInput')
          .setLabel('Enter User ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(userIdInput)
        );
      }
      // For sending by role - add Role ID field
      else if (modalId === 'modal_by_role') {
        const roleIdInput = new TextInputBuilder()
          .setCustomId('roleInput')
          .setLabel('Enter Role ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(roleIdInput)
        );
      }
      // For sending to all or by status
      else {
        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput)
        );
      }

      // Show the modal to user
      await interaction.showModal(messageModal);
      return;
    }

    // Handle modal submissions - receive user input
    if (interaction.isModalSubmit()) {
      const messageText = interaction.fields.getTextInputValue('messageInput');
      const guild = interaction.guild;

      if (!guild) return;

      // Defer the reply to allow time for processing
      await interaction.deferReply({ ephemeral: true });

      // Case: Send to specific user
      if (interaction.customId === 'modal_to_user') {
        const userId = interaction.fields.getTextInputValue('userInput');

        try {
          // Verify user exists
          const targetUser = await client.users.fetch(userId);

          // Verify user is in the server
          const targetMember = await guild.members.fetch(userId).catch(() => null);

          if (!targetMember) {
            await logBroadcastAction({
              userId: interaction.user.id,
              userName: interaction.user.username,
              actionType: getActionTypeName('send_to_user'),
              targetType: 'Specific User',
              targetName: userId,
              messagePreview: messageText,
              successCount: 0,
              failureCount: 1,
              additionalInfo: `User ID: \`${userId}\` | Status: User not found in server`,
              guildName: guild.name
            });

            return interaction.editReply({
{