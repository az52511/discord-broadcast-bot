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
  SlashCommandBuilder,
  ChannelType
} = require('discord.js');

const { token, allowedRoleId, guildId, image, logsChannelId } = require('./config.json');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

const bcCommand = new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('فتح لوحة البث');

// Logging function
async function logBroadcastAction(client, {
  userId,
  userName,
  actionType,
  targetType,
  targetName,
  messagePreview,
  successCount,
  failureCount,
  targetInfo
}) {
  try {
    const logsChannel = client.channels.cache.get(logsChannelId);
    if (!logsChannel) {
      console.log('⚠️ قناة السجلات غير موجودة');
      return;
    }

    const timestamp = new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Riyadh' });
    
    const logEmbed = new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('📋 تقرير البث')
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3143/3143615.png')
      .addFields(
        { name: '👤 المستخدم', value: `<@${userId}> \`${userName}\` (\`${userId}\`)`, inline: false },
        { name: '🎯 نوع الإرسال', value: actionType, inline: true },
        { name: '📍 الهدف', value: targetType, inline: true },
        { name: '🏷️ اسم الهدف', value: targetName || 'N/A', inline: true },
        { name: '💬 نص الرسالة (معاينة)', value: `\`\`\`${messagePreview.substring(0, 200)}${messagePreview.length > 200 ? '...' : ''}\`\`\``, inline: false },
        { name: '📊 الإحصائيات', value: `✅ نجح: **${successCount}**\n❌ فشل: **${failureCount}**`, inline: true },
        { name: '⏰ الوقت', value: timestamp, inline: true }
      );

    if (targetInfo) {
      logEmbed.addFields({ name: '📌 معلومات إضافية', value: targetInfo, inline: false });
    }

    logEmbed.setFooter({ text: 'Discord Broadcast Bot' });

    await logsChannel.send({ embeds: [logEmbed] });

    // Optional: Save to database for statistics
    await db.set(`broadcast_log_${Date.now()}`, {
      userId,
      userName,
      actionType,
      targetType,
      targetName,
      successCount,
      failureCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ خطأ في تسجيل البث:', error);
  }
}

// Get action type name
function getActionTypeName(customId) {
  const types = {
    'send_all': '🎤 إرسال للجميع',
    'send_online': '🟢 إرسال للمتصلين',
    'send_offline': '🔴 إرسال للغير متصلين',
    'send_by_role': '🏷️ إرسال حسب الرتبة',
    'send_to_user': '👤 إرسال لشخص معين'
  };
  return types[customId] || customId;
}

client.once('ready', async () => {
  console.log('✅ Bot is Ready!');
  client.user.setActivity('/broadcast البث', { type: 'LISTENING' });

  try {
    await client.application.commands.set([bcCommand.toJSON()], guildId);
    console.log('✅ Slash command registered successfully');
  } catch (error) {
    console.error('❌ Error registering slash command:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'broadcast') {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        if (!member || !member.roles.cache.has(allowedRoleId)) {
          return interaction.reply({
            content: '❌ ليس لديك صلاحية لاستخدام هذا الأمر!',
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor('#000000')
          .setTitle('🎙️ لوحة تحكم البث')
          .setImage(image)
          .setDescription('الرجاء اختيار نوع الإرسال للأعضاء.');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('send_all')
            .setLabel('ارسل للجميع')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('send_online')
            .setLabel('ارسل للمتصلين')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId('send_offline')
            .setLabel('ارسل للغير المتصلين')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('send_by_role')
            .setLabel('ارسل حسب الرتبة')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('send_to_user')
            .setLabel('ارسل لشخص معين')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }
    }

    if (interaction.isButton()) {
      let modalId = null;

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

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('✍️ اكتب رسالتك');

      const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('اكتب رسالتك هنا')
        .setStyle(TextInputStyle.Paragraph);

      if (modalId === 'modal_to_user') {
        const userInput = new TextInputBuilder()
          .setCustomId('userInput')
          .setLabel('أدخل معرف المستخدم (User ID)')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(userInput)
        );
      } else if (modalId === 'modal_by_role') {
        const roleInput = new TextInputBuilder()
          .setCustomId('roleInput')
          .setLabel('أدخل معرف الرتبة (Role ID)')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(messageInput),
          new ActionRowBuilder().addComponents(roleInput)
        );
      } else {
        modal.addComponents(
          new ActionRowBuilder().addComponents(messageInput)
        );
      }

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit()) {
      const messageText = interaction.fields.getTextInputValue('messageInput');
      const guild = interaction.guild;

      if (!guild) return;

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === 'modal_to_user') {
        const userId = interaction.fields.getTextInputValue('userInput');
        
        try {
          const user = await client.users.fetch(userId);
          await user.send({ content: messageText });

          // Log the action
          await logBroadcastAction(client, {
            userId: interaction.user.id,
            userName: interaction.user.username,
            actionType: getActionTypeName('send_to_user'),
            targetType: '👤 مستخدم مفرد',
            targetName: user.username,
            messagePreview: messageText,
            successCount: 1,
            failureCount: 0,
            targetInfo: `معرف المستخدم: \`${userId}\``
          });

          return interaction.editReply({
            content: `✅ تم إرسال الرسالة إلى ${user.username} بنجاح!`
          });
        } catch (error) {
          console.error(error);
          
          // Log the failed action
          await logBroadcastAction(client, {
            userId: interaction.user.id,
            userName: interaction.user.username,
            actionType: getActionTypeName('send_to_user'),
            targetType: '👤 مستخدم مفرد (فشل)',
            targetName: userId,
            messagePreview: messageText,
            successCount: 0,
            failureCount: 1,
            targetInfo: `معرف المستخدم: \`${userId}\` - الخطأ: ${error.message}`
          });

          return interaction.editReply({
            content: '❌ حدث خطأ أثناء إرسال الرسالة إلى المستخدم.\n💡 تأكد من أن معرف المستخدم صحيح.'
          });
        }
      }

      if (interaction.customId === 'modal_by_role') {
        const roleId = interaction.fields.getTextInputValue('roleInput');
        const targetRole = guild.roles.cache.get(roleId);

        if (!targetRole) {
          return interaction.editReply({
            content: '❌ الرتبة غير موجودة أو المعرف غير صالح.'
          });
        }

        await sendBroadcastByRole(guild, messageText, roleId, interaction, client);
        return;
      }

      if (interaction.customId === 'modal_all') {
        await sendBroadcast(guild, messageText, null, interaction, 'send_all', client);
        return;
      }

      if (interaction.customId === 'modal_online') {
        await sendBroadcast(guild, messageText, 'online', interaction, 'send_online', client);
        return;
      }

      if (interaction.customId === 'modal_offline') {
        await sendBroadcast(guild, messageText, 'offline', interaction, 'send_offline', client);
        return;
      }
    }
  } catch (error) {
    console.error('Error in interactionCreate:', error);
  }
});

async function sendBroadcast(guild, messageText, status, interaction, actionType, client) {
  try {
    const members = await guild.members.fetch();
    let sentCount = 0;
    let failedCount = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;

      if (status && member.presence?.status !== status) continue;

      try {
        await member.send({
          content: `${messageText}\n<@${member.user.id}>`,
          allowedMentions: { parse: ['users'] }
        });
        sentCount++;
      } catch (error) {
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Log the action
    const statusLabel = status ? (status === 'online' ? 'المتصلين' : 'الغير متصلين') : 'الجميع';
    await logBroadcastAction(client, {
      userId: interaction.user.id,
      userName: interaction.user.username,
      actionType: getActionTypeName(actionType),
      targetType: `🎯 ${statusLabel}`,
      targetName: statusLabel,
      messagePreview: messageText,
      successCount: sentCount,
      failureCount: failedCount,
      targetInfo: `إجمالي الأعضاء المعالجين: \`${sentCount + failedCount}\``
    });

    const statusText = status ? `(${status === 'online' ? 'المتصلين' : 'الغير متصلين'})` : '(الجميع)';
    return interaction.editReply({
      content: `✅ تم إرسال الرسالة بنجاح! ${statusText}\n📊 الإحصائيات:\n✔️ تم إرسالها إلى: **${sentCount}** عضو\n❌ فشل الإرسال: **${failedCount}** عضو`
    });
  } catch (error) {
    console.error('sendBroadcast error:', error);
    return interaction.editReply({
      content: '❌ حدث خطأ أثناء محاولة البث.'
    });
  }
}

async function sendBroadcastByRole(guild, messageText, roleId, interaction, client) {
  try {
    const members = await guild.members.fetch();
    let sentCount = 0;
    let failedCount = 0;
    const roleName = guild.roles.cache.get(roleId)?.name || 'غير معروفة';

    for (const member of members.values()) {
      if (member.user.bot) continue;

      if (!member.roles.cache.has(roleId)) continue;

      try {
        await member.send({
          content: `${messageText}\n<@${member.user.id}>`,
          allowedMentions: { parse: ['users'] }
        });
        sentCount++;
      } catch (error) {
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Log the action
    await logBroadcastAction(client, {
      userId: interaction.user.id,
      userName: interaction.user.username,
      actionType: getActionTypeName('send_by_role'),
      targetType: '🏷️ رتبة معينة',
      targetName: roleName,
      messagePreview: messageText,
      successCount: sentCount,
      failureCount: failedCount,
      targetInfo: `معرف الرتبة: \`${roleId}\`\nإجمالي الأعضاء: \`${sentCount + failedCount}\``
    });

    return interaction.editReply({
      content: `✅ تم إرسال الرسالة بنجاح للرتبة: **${roleName}**\n📊 الإحصائيات:\n✔️ تم إرسالها إلى: **${sentCount}** عضو\n❌ فشل الإرسال: **${failedCount}** عضو`
    });
  } catch (error) {
    console.error('sendBroadcastByRole error:', error);
    return interaction.editReply({
      content: '❌ حدث خطأ أثناء محاولة البث حسب الرتبة.'
    });
  }
}

client.login(token);
