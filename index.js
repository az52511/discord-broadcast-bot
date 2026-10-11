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

// استيراد البيانات من ملف الإعدادات
const { token, allowedRoleId, guildId, image, logsChannelId } = require('./config.json');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

// إنشاء عميل البوت
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

// تعريف أمر السلاش
const broadcastCommand = new SlashCommandBuilder()
  .setName('broadcast')
  .setDescription('Open broadcast control panel');

/**
 * دالة تسجيل جميع أنشطة البث في قناة مخصصة وقاعدة البيانات
 * تتتبع: من استخدم الأمر، نوع الإرسال، الهدف، والإحصائيات
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

    // تنسيق الوقت والتاريخ بالتوقيت السعودي
    const timestamp = new Date().toLocaleString('ar-EG', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // بناء رسالة السجل
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

    // إضافة معلومات إضافية إذا كانت موجودة
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

    // إرسال الرسالة إلى قناة السجلات
    await logsChannel.send({ embeds: [logEmbed] });

    // حفظ البيانات في قاعدة البيانات للإحصائيات المستقبلية
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
 * دالة للحصول على اسم الإجراء بصيغة واضحة وسهلة الفهم
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

/**
 * حدث جاهزية البوت - يعني أن البوت اتصل بالسيرفر بنجاح
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
 * معالج التفاعلات الرئيسي - يتعامل مع الأوامر والأزرار والمودالات
 */
client.on('interactionCreate', async (interaction) => {
  try {
    // معالجة أوامر السلاش
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'broadcast') {
        const member = interaction.guild.members.cache.get(interaction.user.id);

        // التحقق من أن المستخدم عنده الرتبة المسموحة
        if (!member || !member.roles.cache.has(allowedRoleId)) {
          return interaction.reply({
            content: '❌ You do not have permission to use this command!',
            ephemeral: true
          });
        }

        // عرض لوحة التحكم الرئيسية
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

    // معالجة الأزرار - عند الضغط على أي زر تظهر نافذة إدخال
    if (interaction.isButton()) {
      let modalId = null;

      // تحديد نوع المودال حسب الزر المضغوط
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

      // إنشاء المودال (نافذة الإدخال)
      const messageModal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('✍️ Write Your Message');

      // حقل الرسالة - إجباري لجميع الحالات
      const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('Enter your message here')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      // إذا كان الإرسال لمستخدم معين - نضيف حقل معرف المستخدم
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
      // إذا كان الإرسال حسب رتبة معينة - نضيف حقل معرف الرتبة
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
      // الإرسال للجميع أو حسب الحالة (متصل/غير متصل)
      else {
        messageModal.addComponents(
          new ActionRowBuilder().addComponents(messageInput)
        );
      }

      // عرض المودال للمستخدم
      await interaction.showModal(messageModal);
      return;
    }

    // معالجة إرسال المودال - استقبال البيانات المدخلة
    if (interaction.isModalSubmit()) {
      const messageText = interaction.fields.getTextInputValue('messageInput');
      const guild = interaction.guild;

      if (!guild) return;

      // تأجيل الرد للسماح بمعالجة العملية (قد تستغرق وقت)
      await interaction.deferReply({ ephemeral: true });

      // حالة الإرسال لمستخدم معين
      if (interaction.customId === 'modal_to_user') {
        const userId = interaction.fields.getTextInputValue('userInput');

        try {
          // التحقق من أن المستخدم موجود
          const targetUser = await client.users.fetch(userId);

          // التحقق من أن المستخدم عضو في السيرفر
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
              content: '❌ User not found in this server.\n💡 Make sure the User ID is correct.'
            });
          }

          // محاولة إرسال الرسالة للمستخدم
          await targetUser.send({ content: messageText });

          // تسجيل العملية الناجحة
          await logBroadcastAction({
            userId: interaction.user.id,
            userName: interaction.user.username,
            actionType: getActionTypeName('send_to_user'),
            targetType: 'Specific User',
            targetName: targetUser.username,
            messagePreview: messageText,
            successCount: 1,
            failureCount: 0,
            additionalInfo: `User ID: \`${userId}\` | Username: \`${targetUser.username}\``,
            guildName: guild.name
          });

          return interaction.editReply({
            content: `✅ Message sent successfully to **${targetUser.username}**!`
          });

        } catch (error) {
          console.error('Error sending to user:', error);

          // تسجيل العملية الفاشلة
          await logBroadcastAction({
            userId: interaction.user.id,
            userName: interaction.user.username,
            actionType: getActionTypeName('send_to_user'),
            targetType: 'Specific User',
            targetName: userId,
            messagePreview: messageText,
            successCount: 0,
            failureCount: 1,
            additionalInfo: `User ID: \`${userId}\` | Error: ${error.message}`,
            guildName: guild.name
          });

          return interaction.editReply({
            content: '❌ Failed to send message to user.\n💡 The user might have DMs disabled.'
          });
        }
      }

      // حالة الإرسال حسب رتبة معينة
      if (interaction.customId === 'modal_by_role') {
        const roleId = interaction.fields.getTextInputValue('roleInput');
        const targetRole = guild.roles.cache.get(roleId);

        // التحقق من أن الرتبة موجودة
        if (!targetRole) {
          return interaction.editReply({
            content: '❌ Role not found or invalid Role ID.\n💡 Make sure the Role ID is correct.'
          });
        }

        await sendBroadcastByRole(guild, messageText, roleId, interaction);
        return;
      }

      // حالة الإرسال للجميع
      if (interaction.customId === 'modal_all') {
        await sendBroadcast(guild, messageText, null, interaction, 'send_all');
        return;
      }

      // حالة الإرسال للمتصلين فقط
      if (interaction.customId === 'modal_online') {
        await sendBroadcast(guild, messageText, 'online', interaction, 'send_online');
        return;
      }

      // حالة الإرسال للغير متصلين فقط
      if (interaction.customId === 'modal_offline') {
        await sendBroadcast(guild, messageText, 'offline', interaction, 'send_offline');
        return;
      }
    }

  } catch (error) {
    console.error('Error in interactionCreate:', error);
  }
});

/**
 * دالة البث للجميع أو حسب الحالة (متصل/غير متصل)
 * تقوم بإرسال الرسالة لعدة أعضاء مع تأخير لتجنب الأخطاء
 */
async function sendBroadcast(guild, messageText, status, interaction, actionType) {
  try {
    // جلب جميع الأعضاء في السيرفر
    const members = await guild.members.fetch();
    let successCount = 0;
    let failureCount = 0;

    // الحلقة على جميع الأعضاء
    for (const member of members.values()) {
      // تخطي البوتات (لا نرسل للبوتات)
      if (member.user.bot) continue;

      // إذا كان هناك فلتر حسب الحالة (متصل/غير متصل)
      if (status && member.presence?.status !== status) continue;

      try {
        // محاولة إرسال الرسالة
        await member.send({
          content: messageText,
          allowedMentions: { parse: [] }
        });
        successCount++;
      } catch (error) {
        // إذا فشل الإرسال (مثلاً المستخدم عنده DM disabled)
        failureCount++;
      }

      // تأخير 500ms بين كل رسالة لتجنب رسائل الخطأ من Discord
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // تحديد تسمية نوع البث
    const statusLabel = status
      ? (status === 'online' ? 'Online Members' : 'Offline Members')
      : 'All Members';

    // تسجيل العملية في قاعدة البيانات وقناة السجلات
    await logBroadcastAction({
      userId: interaction.user.id,
      userName: interaction.user.username,
      actionType: getActionTypeName(actionType),
      targetType: statusLabel,
      targetName: statusLabel,
      messagePreview: messageText,
      successCount: successCount,
      failureCount: failureCount,
      additionalInfo: `Total Processed: \`${successCount + failureCount}\` members`,
      guildName: guild.name
    });

    // إرسال رسالة النتيجة للمستخدم
    return interaction.editReply({
      content: `✅ Broadcast sent successfully!\n📊 **Statistics:**\n✔️ Success: **${successCount}** members\n❌ Failed: **${failureCount}** members`
    });

  } catch (error) {
    console.error('sendBroadcast error:', error);
    return interaction.editReply({
      content: '❌ An error occurred while sending the broadcast.'
    });
  }
}

/**
 * دالة البث حسب رتبة معينة
 * تقوم بإرسال الرسالة فقط للأعضاء اللي عندهم رتبة معينة
 */
async function sendBroadcastByRole(guild, messageText, roleId, interaction) {
  try {
    // جلب جميع الأعضاء في السيرفر
    const members = await guild.members.fetch();
    let successCount = 0;
    let failureCount = 0;

    // الحصول على اسم الرتبة
    const roleName = guild.roles.cache.get(roleId)?.name || 'Unknown Role';

    // الحلقة على جميع الأعضاء
    for (const member of members.values()) {
      // تخطي البوتات
      if (member.user.bot) continue;

      // التحقق من أن العضو عنده هذه الرتبة
      if (!member.roles.cache.has(roleId)) continue;

      try {
        // محاولة إرسال الرسالة
        await member.send({
          content: messageText,
          allowedMentions: { parse: [] }
        });
        successCount++;
      } catch (error) {
        // إذا فشل الإرسال
        failureCount++;
      }

      // تأخير 500ms بين كل رسالة
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // تسجيل العملية
    await logBroadcastAction({
      userId: interaction.user.id,
      userName: interaction.user.username,
      actionType: getActionTypeName('send_by_role'),
      targetType: 'Specific Role',
      targetName: roleName,
      messagePreview: messageText,
      successCount: successCount,
      failureCount: failureCount,
      additionalInfo: `Role ID: \`${roleId}\` | Total Processed: \`${successCount + failureCount}\` members`,
      guildName: guild.name
    });

    // إرسال رسالة النتيجة
    return interaction.editReply({
      content: `✅ Broadcast sent successfully to role **${roleName}**!\n📊 **Statistics:**\n✔️ Success: **${successCount}** members\n❌ Failed: **${failureCount}** members`
    });

  } catch (error) {
    console.error('sendBroadcastByRole error:', error);
    return interaction.editReply({
      content: '❌ An error occurred while sending the broadcast by role.'
    });
  }
}

// تسجيل دخول البوت باستخدام التوكن
client.login(token);
