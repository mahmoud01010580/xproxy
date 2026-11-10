require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { User, Plan, PaymentMethod, Support, ServiceMessage, Transaction, Coupon } = require('./models');

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_BASE_URL = process.env.API_BASE_URL;
const API_KEY = process.env.API_KEY;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.toString() : '';

// إعدادات القناة الإجبارية
const CHANNEL_USERNAME = '@XProxybotchannel';
const CHANNEL_LINK = 'https://t.me/XProxybotchannel';

function cleanServerText(text) {
    if (!text) return '';
    return text.replace(/fearcode/gi, '').replace(/\s+/g, ' ').trim();
}

function isEnglishOnly(text) {
    return /^[A-Za-z0-9_@#$.!-]+$/.test(text);
}

// دالة التحقق من اشتراك المستخدم في القناة
async function checkUserSubscription(ctx, telegramId) {
    try {
        const chatMember = await ctx.telegram.getChatMember(CHANNEL_USERNAME, telegramId);
        const status = chatMember.status;
        return ['creator', 'administrator', 'member'].includes(status);
    } catch (error) {
        console.error('❌ Check Subscription Error:', error.message);
        return true; 
    }
}

// دالة آمنة لتحديث رسائل تليجرام لمنع الـ Crash
async function safeEditMessageText(ctx, text, extra = {}) {
    try {
        return await ctx.editMessageText(text, extra);
    } catch (error) {
        if (error.description && error.description.includes('message is not modified')) {
            try { await ctx.answerCbQuery(); } catch (e) {}
            return;
        }
        console.error('❌ Safe Edit Message Error:', error.message);
    }
}

const translations = {
    en: {
        welcomeMain: 'Welcome to your Proxy Dashboard 🚀',
        buyProxy: '🛒 Buy Proxy',
        myProxies: '📦 My Proxies',
        addBalance: '💳 Add Balance',
        plans: '💰 Pricing & Plans',
        support: '🛠️ Support',
        webDev: '💻 Web Development',
        profileLedger: '👤 Profile & Ledger',
        changeLang: '🌐 Change Language',
        couponMenu: '🎁 Redeem Coupon',
        mainMenu: '🏠 Main Menu',
        back: '⬅️ Back',
        proxyInfoTitle: '🌐 Active Proxy Information',
        protocol: 'Protocol',
        server: 'Server / Location',
        host: 'Host (IP)',
        port: 'Port',
        username: 'Username',
        password: 'Password',
        status: 'Status',
        expiresAt: 'Expires At',
        remainingTime: 'Remaining Time',
        btnExtend: '🔄 Extend',
        btnSwitchProto: '🌐 Switch Protocol',
        btnSwitchSrv: '🖥️ Switch Server',
        btnUpdateAuth: '🔑 Update Auth',
        noProxies: '📦 No active proxies found for your account.',
        subRequiredMsg: '⚠️ **Channel Subscription Required!**\n\nYou must subscribe to our official channel first to use this bot and access proxies.\n\nPlease join the channel and click **"Check Subscription"** below:',
        subBtnJoin: '📢 Join Channel',
        subBtnCheck: '✅ Check Subscription',
        subSuccess: '🎉 **Thank you for subscribing!** You can now use the bot freely.'
    },
    ar: {
        welcomeMain: 'أهلاً بك في لوحة تحكم البروكسيات 🚀',
        buyProxy: '🛒 شراء بروكسي',
        myProxies: '📦 بروكسياتي',
        addBalance: '💳 شحن الرصيد',
        plans: '💰 خطط الأسعار',
        support: '🛠️ الدعم الفني',
        webDev: '💻 برمجة مواقع',
        profileLedger: '👤 الحساب والسجل',
        changeLang: '🌐 تغيير اللغة',
        couponMenu: '🎁 استرداد كوبون',
        mainMenu: '🏠 القائمة الرئيسية',
        back: '⬅️ رجوع',
        proxyInfoTitle: '🌐 معلومات البروكسي النشط',
        protocol: 'البروتوكول',
        server: 'السيرفر / الموقع',
        host: 'الآيبى (Host)',
        port: 'البورت (Port)',
        username: 'اسم المستخدم',
        password: 'كلمة المرور',
        status: 'الحالة',
        expiresAt: 'تاريخ الانتهاء',
        remainingTime: 'الوقت المتبقي',
        btnExtend: '🔄 تمديد',
        btnSwitchProto: '🌐 تبديل البروتوكول',
        btnSwitchSrv: '🖥️ تغيير السيرفر',
        btnUpdateAuth: '🔑 تحديث بيانات الدخول',
        noProxies: '📦 لا توجد بروكسيات نشطة مرتبطة بحسابك.',
        subRequiredMsg: '⚠️ **عذراً، يجب عليك الاشتراك في القناة أولاً!**\n\nيجب عليك الاشتراك في قناة البوت الرسمية لتتمكن من استخدام البوت والاستفادة من الخدمات.\n\nيرجى الانضمام للقناة ثم اضغط على زر **"تحقق من الاشتراك"** أسفله:',
        subBtnJoin: '📢 انضم إلى القناة',
        subBtnCheck: '✅ تحقق من الاشتراك',
        subSuccess: '🎉 **شكراً لاشتراكك!** يمكنك الآن استخدام البوت بكل حرية.'
    }
};

async function verifyPersonalBinancePay(userTxId) {
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
        return { success: false, reason: 'api_not_configured' };
    }

    const baseURL = 'https://api.binance.com';
    const endpoint = '/sapi/v1/pay/transactions';
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}&limit=50`;
    
    const signature = crypto
        .createHmac('sha256', process.env.BINANCE_SECRET_KEY)
        .update(queryString)
        .digest('hex');

    const url = `${baseURL}${endpoint}?${queryString}&signature=${signature}`;

    try {
        const response = await axios.get(url, {
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY },
            timeout: 10000
        });

        if (response.data && response.data.code === '000000' && Array.isArray(response.data.data)) {
            const transactions = response.data.data;
            const foundTx = transactions.find(tx => 
                tx.transactionId === userTxId || tx.prepayId === userTxId || tx.orderId === userTxId
            );

            if (foundTx) {
                return {
                    success: true,
                    amount: parseFloat(foundTx.amount),
                    currency: foundTx.currency || 'USDT'
                };
            } else {
                return { success: false, reason: 'transaction_not_found' };
            }
        }
        return { success: false, reason: 'api_failed' };
    } catch (error) {
        return { success: false, reason: 'api_error' };
    }
}

function getCountryFlag(countryInput) {
    if (!countryInput) return '🌍';
    let code = cleanServerText(countryInput).toUpperCase();

    const mapCountry = {
        'USA': 'US', 'US': 'US', 'UNITED STATES': 'US',
        'GBR': 'GB', 'GB': 'GB', 'UK': 'GB', 'UNITED KINGDOM': 'GB',
        'EGY': 'EG', 'EG': 'EG', 'EGYPT': 'EG',
        'DEU': 'DE', 'DE': 'DE', 'GERMANY': 'DE',
        'FRA': 'FR', 'FR': 'FR', 'FRANCE': 'FR',
        'CAN': 'CA', 'CA': 'CA', 'CANADA': 'CA'
    };

    if (mapCountry[code]) code = mapCountry[code];
    if (code.length !== 2) return '🌍';

    const codePoints = code.split('').map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

function formatServerDisplay(proxy) {
    if (!proxy) return 'N/A';
    const serverObj = proxy.server || proxy.server_info || {};
    const country = cleanServerText(proxy.country || serverObj.country || '');
    const city = cleanServerText(proxy.city || serverObj.city || serverObj.label || '');
    const flag = getCountryFlag(country);

    if (country && city) {
        return `${flag} ${country} (${city})`;
    } else if (country) {
        return `${flag} ${country}`;
    } else if (city) {
        return `🖥️ ${city}`;
    } else if (proxy.server_id) {
        return `Server #${proxy.server_id}`;
    }
    return 'N/A';
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('📦 Connected to MongoDB Atlas successfully!');
    
    const planCount = await Plan.countDocuments();
    if (planCount === 0) {
        await Plan.create({
            planCode: 'plan_24h',
            title: '24 Hours Proxy',
            durationHours: 24,
            myPriceUsd: 3.00
        });
    }

    const binanceMethod = await PaymentMethod.findOne({ code: 'binance' });
    if (!binanceMethod) {
        await PaymentMethod.create({
            code: 'binance',
            title: 'Binance Pay (Auto-Verify)',
            recipientInfo: 'Binance Pay ID / Email',
            instructions: 'Send payment via Binance Pay, then copy your Transaction ID and send it here to add balance automatically.'
        });
    }
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
});

bot.use(session());

const api = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json'
    },
    timeout: 10000
});

bot.telegram.setMyCommands([
    { command: 'start', description: '🚀 Start & Main Menu' }
]);

async function sendSubscriptionPrompt(ctx, lang = 'en', isEdit = false) {
    const t = translations[lang] || translations['en'];
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url(t.subBtnJoin, CHANNEL_LINK)],
        [Markup.button.callback(t.subBtnCheck, 'check_subscription')]
    ]);

    if (isEdit && ctx.callbackQuery) {
        return safeEditMessageText(ctx, t.subRequiredMsg, { parse_mode: 'Markdown', ...keyboard });
    }
    return ctx.reply(t.subRequiredMsg, { parse_mode: 'Markdown', ...keyboard });
}

bot.start(async (ctx) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.step = null;
    
    const telegramId = ctx.from.id;
    const isSubscribed = await checkUserSubscription(ctx, telegramId);
    const existingUser = await User.findOne({ telegramId });
    const lang = existingUser && existingUser.language ? existingUser.language : 'en';

    if (!isSubscribed) {
        return sendSubscriptionPrompt(ctx, lang, false);
    }

    if (existingUser) {
        return sendMainMenu(ctx);
    } else {
        ctx.session.step = 'waiting_username';
        const msg = lang === 'ar' 
            ? '👋 أهلاً بك! لا يوجد حساب مرتبط برقمك.\n\nالرجاء إدخال **اسم المستخدم** الذي تريده (حروف وأرقام إنجليزية فقط):'
            : '👋 Welcome! No account is linked to your Telegram.\n\nPlease enter the new **Username** you want (English only):';
        return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
});

bot.action('check_subscription', async (ctx) => {
    if (!ctx.session) ctx.session = {}; // 👈 تم الحل هنا

    const telegramId = ctx.from.id;
    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';
    const t = translations[lang] || translations['en'];

    const isSubscribed = await checkUserSubscription(ctx, telegramId);

    if (!isSubscribed) {
        try {
            await ctx.answerCbQuery(lang === 'ar' ? '❌ لم تقم بالاشتراك في القناة بعد!' : '❌ You have not subscribed to the channel yet!', { show_alert: true });
        } catch (e) {}
        return;
    }

    try {
        await ctx.answerCbQuery(t.subSuccess, { show_alert: true });
    } catch (e) {}

    if (dbUser) {
        return sendMainMenu(ctx);
    } else {
        ctx.session.step = 'waiting_username';
        const msg = lang === 'ar' 
            ? '✅ تم التحقق من اشتراكك بنجاح!\n\nالرجاء إدخال **اسم المستخدم** الذي تريده لحسابك (إنجليزي فقط):'
            : '✅ Subscription verified successfully!\n\nPlease enter the new **Username** you want (English only):';
        return safeEditMessageText(ctx, msg, { parse_mode: 'Markdown' });
    }
});

bot.on('text', async (ctx, next) => {
    if (!ctx.session) ctx.session = {};
    const text = ctx.message.text.trim();
    const session = ctx.session;
    const telegramId = ctx.from.id;

    const isSubscribed = await checkUserSubscription(ctx, telegramId);
    const dbUserCheck = await User.findOne({ telegramId });
    const userLang = dbUserCheck && dbUserCheck.language ? dbUserCheck.language : 'en';

    if (!isSubscribed) {
        return sendSubscriptionPrompt(ctx, userLang, false);
    }

    if (session.step === 'waiting_username') {
        const usernameTrimmed = text.toLowerCase();
        if (!isEnglishOnly(usernameTrimmed)) {
            return ctx.reply(userLang === 'ar' ? '❌ يجب أن يحتوي اسم المستخدم على حروف وأرقام إنجليزية فقط. حاول مجدداً:' : '❌ Username must contain English letters and numbers only. Try again:');
        }
        if (usernameTrimmed.length < 3) {
            return ctx.reply(userLang === 'ar' ? '❌ يجب ألا يقل اسم المستخدم عن 3 أحرف. حاول مجدداً:' : '❌ Username must be at least 3 characters long. Try again:');
        }

        const checkUser = await User.findOne({ username: usernameTrimmed });
        if (checkUser) {
            return ctx.reply(userLang === 'ar' ? '❌ اسم المستخدم هذا مستخدم مسبقاً. اختر اسماً آخر:' : '❌ This username is already taken. Choose another one:');
        }

        session.tempUsername = usernameTrimmed;
        session.step = 'waiting_password';
        return ctx.reply(userLang === 'ar' ? '🔒 رائع! الآن أدخل **كلمة المرور** لحسابك (إنجليزي فقط):' : '🔒 Great! Now send the **Password** for your account (English only):', { parse_mode: 'Markdown' });
    }

    if (session.step === 'waiting_password') {
        const passwordTrimmed = text;
        if (!isEnglishOnly(passwordTrimmed)) {
            return ctx.reply(userLang === 'ar' ? '❌ يجب أن تتكون كلمة المرور من حروف وأرقام إنجليزية فقط. حاول مجدداً:' : '❌ Password must contain English characters and numbers only. Try again:');
        }

        const username = session.tempUsername;

        try {
            const newUser = await User.create({
                telegramId,
                username,
                password: passwordTrimmed,
                name: ctx.from.first_name || 'Client',
                balance: 0.00,
                proxies: [],
                language: 'en'
            });

            session.step = null;
            session.tempUsername = null;

            const langKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('🇬🇧 English (Default)', 'set_lang_en'),
                    Markup.button.callback('🇸🇦 العربية', 'set_lang_ar')
                ]
            ]);

            return ctx.reply(
                `✅ **Account created successfully!**\n\n` +
                `- **Username:** \`${newUser.username}\`\n` +
                `- **Default Balance:** $${newUser.balance.toFixed(2)}\n\n` +
                `🌐 **Please select your preferred language / اختر لغتك المفضلة:**`,
                { parse_mode: 'Markdown', ...langKeyboard }
            );
        } catch (err) {
            session.step = null;
            return ctx.reply('❌ An error occurred during registration. Try sending /start again.');
        }
    }

    if (session.step === 'waiting_proxy_username') {
        if (!isEnglishOnly(text)) {
            return ctx.reply(userLang === 'ar' ? '❌ يجب أن يكون اسم مستخدم البروكسي بالإنجليزية والأرقام فقط. حاول مجدداً:' : '❌ Proxy username must be in English letters and numbers only. Try again:');
        }
        if (text.length < 3) {
            return ctx.reply(userLang === 'ar' ? '❌ يجب ألا يقل اسم المستخدم عن 3 أحرف. حاول مجدداً:' : '❌ Proxy username must be at least 3 characters long. Try again:');
        }

        try {
            const checkRes = await api.post('/proxies/check-username', {
                username: text,
                server_id: session.buyServerId
            });

            if (checkRes.data && checkRes.data.data && checkRes.data.data.available === false) {
                return ctx.reply(userLang === 'ar' ? '❌ اسم المستخدم هذا مستخدم بالفعل على هذا السيرفر. اختر اسماً آخر:' : '❌ This username is already in use on this server. Please choose another username:');
            }
        } catch (e) {}

        session.proxyUsername = text;
        session.step = 'waiting_proxy_password';
        return ctx.reply(
            `👤 **Username set:** \`${text}\`\n\n` +
            `🔒 Now, please enter the **Password** for your proxy (English only):`,
            { parse_mode: 'Markdown' }
        );
    }

    if (session.step === 'waiting_proxy_password') {
        const proxyPassword = text;
        if (!isEnglishOnly(proxyPassword)) {
            return ctx.reply(userLang === 'ar' ? '❌ كلمة مرور البروكسي يجب أن تكون بالإنجليزية والأرقام فقط. حاول مجدداً:' : '❌ Proxy password must be in English characters and numbers only. Try again:');
        }

        const serverId = session.buyServerId;
        const planId = session.buyPlanId;
        const protocol = session.buyProtocol;

        session.step = null;
        session.buyServerId = null;
        session.buyPlanId = null;
        session.buyProtocol = null;
        const customUsername = session.proxyUsername;
        session.proxyUsername = null;

        try {
            const plan = await Plan.findById(planId);
            if (!plan) return ctx.reply(userLang === 'ar' ? '❌ الخطأ: لم يتم العثور على الخطة. ابدأ من جديد.' : '❌ Plan not found. Please start over.');

            const dbUser = await User.findOneAndUpdate(
                { telegramId, balance: { $gte: plan.myPriceUsd } },
                { $inc: { balance: -plan.myPriceUsd } },
                { new: true }
            );

            if (!dbUser) {
                return ctx.reply(userLang === 'ar' ? '❌ عذراً، رصيدك غير كافٍ. يرجى شحن رصيدك أولاً.' : '❌ Insufficient balance. Please add funds to your account first.');
            }

            const providerResponse = await api.post('/proxies', {
                server_id: serverId,
                duration_hours: plan.durationHours,
                protocol: protocol,
                auth_type: 'userpass',
                username: customUsername,
                password: proxyPassword,
                description: `Sold to User: ${dbUser.username}`
            });

            const proxy = providerResponse.data.data;

            await User.updateOne(
                { telegramId },
                { $push: { proxies: proxy.public_id } }
            );

            const serverName = formatServerDisplay(proxy);

            const successMsg = userLang === 'ar'
                ? `✅ **تم شراء البروكسي بنجاح بالبيانات المخصصة!**\n\n` +
                  `- **البروتوكول:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : protocol.toUpperCase()}\`\n` +
                  `- **السيرفر:** \`${serverName}\`\n` +
                  `- **الآيبي (Host):** \`${proxy.host}\`\n` +
                  `- **البورت:** \`${proxy.port}\`\n` +
                  `- **اسم المستخدم:** \`${proxy.username}\`\n` +
                  `- **كلمة المرور:** \`${proxy.password}\`\n` +
                  `- **المبلغ المدفوع:** $${plan.myPriceUsd.toFixed(2)}\n` +
                  `- **رصيدك الجديد:** $${dbUser.balance.toFixed(2)}`
                : `✅ **Proxy purchased successfully with your custom auth!**\n\n` +
                  `- **Protocol:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : protocol.toUpperCase()}\`\n` +
                  `- **Server:** \`${serverName}\`\n` +
                  `- **Host:** \`${proxy.host}\`\n` +
                  `- **Port:** \`${proxy.port}\`\n` +
                  `- **Username:** \`${proxy.username}\`\n` +
                  `- **Password:** \`${proxy.password}\`\n` +
                  `- **Paid Amount:** $${plan.myPriceUsd.toFixed(2)}\n` +
                  `- **New Balance:** $${dbUser.balance.toFixed(2)}`;

            return ctx.reply(successMsg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback(userLang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
            });

        } catch (error) {
            try {
                const planToRefund = await Plan.findById(planId);
                if (planToRefund) {
                    await User.updateOne({ telegramId }, { $inc: { balance: planToRefund.myPriceUsd } });
                }
            } catch (rollbackErr) {}

            const errMessage = error.response?.data?.message || 'Error occurred during proxy creation';
            return ctx.reply(`❌ ${errMessage}`, Markup.inlineKeyboard([[Markup.button.callback(userLang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]]));
        }
    }

    if (session.step === 'updating_proxy_username') {
        if (!isEnglishOnly(text)) {
            return ctx.reply(userLang === 'ar' ? '❌ اسم المستخدم يجب أن يكون بالحروف والأرقام الإنجليزية فقط. حاول مجدداً:' : '❌ Username must be in English characters and numbers only. Try again:');
        }
        if (text.length < 3) {
            return ctx.reply(userLang === 'ar' ? '❌ اسم المستخدم يجب ألا يقل عن 3 أحرف. حاول مجدداً:' : '❌ Username must be at least 3 characters long. Try again:');
        }

        session.updateTargetUsername = text;
        session.step = 'updating_proxy_password';
        return ctx.reply(
            `👤 **New Username:** \`${text}\`\n\n` +
            `🔒 Now, please enter the **new Password** for your proxy (English only):`,
            { parse_mode: 'Markdown' }
        );
    }

    if (session.step === 'updating_proxy_password') {
        const newPassword = text;
        if (!isEnglishOnly(newPassword)) {
            return ctx.reply(userLang === 'ar' ? '❌ كلمة المرور يجب أن تكون بالإنجليزية والأرقام فقط. حاول مجدداً:' : '❌ Password must be in English characters and numbers only. Try again:');
        }

        const publicId = session.updateTargetProxyId;
        const newUsername = session.updateTargetUsername;

        session.step = null;
        session.updateTargetProxyId = null;
        session.updateTargetUsername = null;

        try {
            await api.post(`/proxies/${publicId}/update-auth`, {
                username: newUsername,
                password: newPassword
            });

            const dbUser = await User.findOne({ telegramId });
            const lang = dbUser ? dbUser.language : 'en';

            await ctx.reply(lang === 'ar' ? `✅ **تم تحديث بيانات دخول البروكسي بنجاح!**\n- **اسم المستخدم:** \`${newUsername}\`\n- **كلمة المرور:** \`${newPassword}\`` : `✅ **Proxy authentication updated successfully!**\n- **Username:** \`${newUsername}\`\n- **Password:** \`${newPassword}\``, { parse_mode: 'Markdown' });
            await refreshProxyMessage(ctx, publicId, lang);
        } catch (error) {
            const errMsg = error.response?.data?.message || 'Error updating proxy authentication';
            return ctx.reply(`❌ ${errMsg}`);
        }

        return;
    }

    if (session.step === 'waiting_payment_receipt') {
        const receiptText = text;
        const user = ctx.from;
        const selectedMethodCode = session.selectedPaymentMethodCode;
        const selectedMethodTitle = session.selectedPaymentMethod;

        session.step = null;
        session.selectedPaymentMethod = null;
        session.selectedPaymentMethodCode = null;

        try {
            const existingTx = await Transaction.findOne({ prepayId: receiptText });
            if (existingTx) {
                await ctx.reply(userLang === 'ar' ? '❌ **رقم المعاملة (Transaction ID) هذا تم استخدامه من قبل!**\nلا يمكنك استخدام نفس الإيصال مرتين.' : '❌ **This Transaction ID has already been used!**\nYou cannot reuse the same payment receipt twice.', { parse_mode: 'Markdown' });
                return sendMainMenu(ctx);
            }
        } catch (e) {}

        let verification = { success: false };

        if (selectedMethodCode && (selectedMethodCode.toLowerCase().includes('binance') || selectedMethodCode.toLowerCase().includes('bpay'))) {
            await ctx.reply(userLang === 'ar' ? '⏳ **جاري التحقق من المعاملة عبر باينانس باي... الانتظار قليلاً.**' : '⏳ **Verifying transaction via Personal Binance Pay... Please wait.**', { parse_mode: 'Markdown' });
            
            verification = await verifyPersonalBinancePay(receiptText);

            if (verification.success) {
                try {
                    await Transaction.create({
                        prepayId: receiptText,
                        telegramId: telegramId,
                        amount: verification.amount
                    });
                } catch (dbErr) {
                    await ctx.reply(userLang === 'ar' ? '❌ **تم معالجة هذه المعاملة مسبقاً.** تم رفض الدفع المكرر.' : '❌ **Transaction already processed.** Duplicate payment rejected.', { parse_mode: 'Markdown' });
                    return sendMainMenu(ctx);
                }

                const updatedUser = await User.findOneAndUpdate(
                    { telegramId },
                    { $inc: { balance: verification.amount } },
                    { new: true }
                );

                if (updatedUser) {
                    const successText = userLang === 'ar'
                        ? `🎉 **تم التحقق من الدفع تلقائياً!**\n\n- **المبلغ المضاف:** $${verification.amount.toFixed(2)} ${verification.currency}\n- **رصيدك الجديد:** $${updatedUser.balance.toFixed(2)}`
                        : `🎉 **Payment Verified Automatically!**\n\n- **Added Amount:** $${verification.amount.toFixed(2)} ${verification.currency}\n- **New Balance:** $${updatedUser.balance.toFixed(2)}`;
                    
                    await ctx.reply(successText, { parse_mode: 'Markdown' });
                    
                    if (ADMIN_TELEGRAM_ID) {
                        try {
                            await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `⚡ **AUTO PAY APPROVED (Binance Personal)**\n- User: ${user.first_name} (@${user.username || 'N/A'})\n- Amount: $${verification.amount.toFixed(2)}\n- Transaction ID: \`${receiptText}\``, { parse_mode: 'Markdown' });
                        } catch (e) {}
                    }
                    return sendMainMenu(ctx);
                }
            } else {
                if (verification.reason === 'transaction_not_found') {
                    await ctx.reply(userLang === 'ar' ? '❌ **رقم المعاملة غير صحيح أو غير موجود في حساب باينانس الخاص بي!**\nيرجى مراجعة الرقم والمحاولة مجدداً.' : '❌ **Transaction ID is incorrect or not found in my Binance account!**\nPlease check the ID and try again.', { parse_mode: 'Markdown' });
                } else {
                    await ctx.reply(userLang === 'ar' ? '⚠️ **حدث خطأ في الاتصال مع باينانس.** تم إرسال طلبك للأدمن للمراجعة اليدوية.' : '⚠️ **Error connecting to Binance API.** Your request has been forwarded to the admin for manual review.', { parse_mode: 'Markdown' });
                }
            }
        } else {
            try {
                await Transaction.create({
                    prepayId: receiptText,
                    telegramId: telegramId,
                    amount: 0
                });
            } catch (e) {}

            await ctx.reply(userLang === 'ar' ? '✅ **تم إرسال طلب الدفع بنجاح!**\nسيقوم فريقنا بمراجعة الإيصال وإضافة الرصيد قريباً.' : '✅ **Your payment request has been submitted successfully!**\nOur team will review your transaction and add the balance soon.', { parse_mode: 'Markdown' });
        }
        
        if (ADMIN_TELEGRAM_ID && (!verification || !verification.success)) {
            const adminMsg = `🔔 **New Balance Top-Up Request!**\n\n` +
                            `- **User Name:** ${user.first_name || 'N/A'}\n` +
                            `- **Username:** @${user.username || 'No username'}\n` +
                            `- **Telegram ID:** \`${user.id}\`\n` +
                            `- **Method:** ${selectedMethodTitle}\n` +
                            `- **Receipt/ID:** \`${receiptText}\``;

            const adminKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Accept & Add Balance', `admin_start_approve_${user.id}`),
                    Markup.button.callback('❌ Reject', `admin_reject_${user.id}`)
                ]
            ]);

            try {
                await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, adminMsg, { parse_mode: 'Markdown', ...adminKeyboard });
            } catch (err) {}
        }

        return sendMainMenu(ctx);
    }

    if (session.step === 'admin_waiting_amount' && ADMIN_TELEGRAM_ID && telegramId.toString() === ADMIN_TELEGRAM_ID) {
        const amountToAdd = parseFloat(text);
        const targetUserId = session.targetUserIdForTopUp;

        if (isNaN(amountToAdd) || amountToAdd <= 0) {
            return ctx.reply('❌ Please enter a valid number (e.g., 3 or 4.50):');
        }

        session.step = null;
        session.targetUserIdForTopUp = null;

        try {
            const targetUser = await User.findOneAndUpdate(
                { telegramId: targetUserId },
                { $inc: { balance: amountToAdd } },
                { new: true }
            );

            if (!targetUser) {
                return ctx.reply('❌ User not found in database!');
            }

            await ctx.reply(`✅ **Successfully added $${amountToAdd.toFixed(2)}** to user (\`${targetUserId}\`).\n- **New User Balance:** $${targetUser.balance.toFixed(2)}`, { parse_mode: 'Markdown' });

            try {
                await bot.telegram.sendMessage(targetUserId, `🎉 **Your payment has been approved!**\n$${amountToAdd.toFixed(2)} has been added to your balance.\n- **Current Balance:** $${targetUser.balance.toFixed(2)}`, { parse_mode: 'Markdown' });
            } catch (e) {}

        } catch (error) {
            await ctx.reply('❌ Error processing custom approval.');
        }

        return;
    }

    if (session.step === 'admin_waiting_coupon_count' && ADMIN_TELEGRAM_ID && telegramId.toString() === ADMIN_TELEGRAM_ID) {
        const count = parseInt(text);
        if (isNaN(count) || count <= 0) {
            return ctx.reply('❌ Please enter a valid positive number for the count (e.g., 5):');
        }

        session.couponCount = count;
        session.step = 'admin_waiting_coupon_amount';
        return ctx.reply('💰 Great! Now, what is the **amount (price)** in USD for each coupon? (e.g., `3.00` or `5.50`):', { parse_mode: 'Markdown' });
    }

    if (session.step === 'admin_waiting_coupon_amount' && ADMIN_TELEGRAM_ID && telegramId.toString() === ADMIN_TELEGRAM_ID) {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Please enter a valid double amount (e.g., 3.50):');
        }

        const count = session.couponCount || 1;
        session.step = null;
        session.couponCount = null;

        try {
            const createdCoupons = [];
            for (let i = 0; i < count; i++) {
                const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
                const couponCode = `${randomPart}`;

                const newCoupon = await Coupon.create({
                    code: couponCode,
                    amount: amount,
                    isUsed: false
                });
                createdCoupons.push(newCoupon.code);
            }

            await ctx.reply(`✅ **Successfully created ${count} coupons!**\nAmount per coupon: **$${amount.toFixed(2)}**\n\nSending them to you in separate messages now:`, { parse_mode: 'Markdown' });

            for (const code of createdCoupons) {
                await bot.telegram.sendMessage(telegramId, `🎟️ \`${code}\``, { parse_mode: 'Markdown' });
            }

            return sendMainMenu(ctx);
        } catch (error) {
            session.step = null;
            return ctx.reply('❌ An error occurred while generating coupons.');
        }
    }

    if (session.step === 'waiting_coupon_redeem') {
        const couponCodeInput = text.trim();
        session.step = null;

        try {
            const dbUser = await User.findOne({ telegramId });
            if (!dbUser) {
                return ctx.reply(userLang === 'ar' ? '❌ لم يتم العثور على حسابك. اضغط /start للبدء.' : '❌ Account not found. Please start the bot using /start first.');
            }

            if (dbUser.lastCouponUsedAt) {
                const now = new Date();
                const diffMs = now - new Date(dbUser.lastCouponUsedAt);
                const cooldownTime = 60 * 60 * 1000;

                if (diffMs < cooldownTime) {
                    const remainingMinutes = Math.ceil((cooldownTime - diffMs) / (60 * 1000));
                    const cooldownMsg = userLang === 'ar'
                        ? `⏳ **عذراً، يجب عليك الانتظار!**\n\nلقد قمت باستخدام كوبون مؤخراً. يمكنك استرداد كوبون جديد بعد **${remainingMinutes} دقيقة** تقريباً، لإعطاء فرصة عادلة للجميع 💙`
                        : `⏳ **Please wait!**\n\nYou have recently redeemed a coupon. You can redeem another one in approximately **${remainingMinutes} minutes**, to give everyone a fair chance 💙`;

                    return ctx.reply(cooldownMsg, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[Markup.button.callback(userLang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
                    });
                }
            }

            const coupon = await Coupon.findOneAndUpdate(
                { code: couponCodeInput, isUsed: false },
                { $set: { isUsed: true, usedBy: telegramId.toString(), usedAt: new Date() } },
                { new: true }
            );

            if (!coupon) {
                const invalidMsg = userLang === 'ar'
                    ? '❌ **هذا الكوبون غير صالح، منتهي الصلاحية، أو تم استخدامه مسبقاً!**'
                    : '❌ **This coupon is invalid, expired, or has already been used!**';
                return ctx.reply(invalidMsg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback(userLang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
                });
            }

            const updatedUser = await User.findOneAndUpdate(
                { telegramId },
                { 
                    $inc: { balance: coupon.amount },
                    $set: { lastCouponUsedAt: new Date() }
                },
                { new: true }
            );

            if (updatedUser) {
                const successMsg = userLang === 'ar'
                    ? `🎉 **تم استرداد الكوبون بنجاح!**\n\n- **المبلغ المضاف:** $${coupon.amount.toFixed(2)}\n- **إجمالي رصيدك الحالي:** $${updatedUser.balance.toFixed(2)}`
                    : `🎉 **Successfully Redeemed Coupon!**\n\n- **Added Balance:** $${coupon.amount.toFixed(2)}\n- **New Total Balance:** $${updatedUser.balance.toFixed(2)}`;

                await ctx.reply(successMsg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback(userLang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
                });

                if (ADMIN_TELEGRAM_ID) {
                    try {
                        const userObj = ctx.from;
                        await bot.telegram.sendMessage(
                            ADMIN_TELEGRAM_ID,
                            `🔔 **Coupon Redeemed!**\n- User: ${userObj.first_name} (@${userObj.username || 'N/A'})\n- Amount: $${coupon.amount.toFixed(2)}\n- Code: \`${coupon.code}\``,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (e) {}
                }
            }
        } catch (error) {
            return ctx.reply(userLang === 'ar' ? '❌ حدث خطأ أثناء استرداد الكوبون.' : '❌ An error occurred while redeeming the coupon.');
        }

        return;
    }

    return next();
});

bot.action(/^set_lang_(en|ar)$/, async (ctx) => {
    const selectedLang = ctx.match[1];
    const telegramId = ctx.from.id;

    await User.updateOne({ telegramId }, { language: selectedLang });
    try { 
        await ctx.answerCbQuery(selectedLang === 'ar' ? '✅ تم تغيير اللغة إلى العربية' : '✅ Language set to English', { show_alert: true }); 
    } catch (e) {}
    
    return sendMainMenu(ctx);
});

bot.action('change_language', async (ctx) => {
    const telegramId = ctx.from.id;
    const dbUser = await User.findOne({ telegramId });
    const currentLang = dbUser ? dbUser.language : 'en';

    const langKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback(currentLang === 'en' ? '✅ 🇬🇧 English' : '🇬🇧 English', 'set_lang_en'),
            Markup.button.callback(currentLang === 'ar' ? '✅ 🇸🇦 العربية' : '🇸🇦 العربية', 'set_lang_ar')
        ],
        [Markup.button.callback(currentLang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]
    ]);

    await safeEditMessageText(ctx, currentLang === 'ar' ? '🌐 **اختر لغتك المفضلة:**' : '🌐 **Choose your language:**', {
        parse_mode: 'Markdown',
        ...langKeyboard
    });
});

const sendMainMenu = async (ctx) => {
    const telegramId = ctx.from.id;

    const isSubscribed = await checkUserSubscription(ctx, telegramId);
    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';
    
    if (!isSubscribed) {
        return sendSubscriptionPrompt(ctx, lang, true);
    }

    const t = translations[lang] || translations['en'];
    const welcomeMsg = t.welcomeMain;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback(t.profileLedger, 'menu_profile'),
            Markup.button.callback(t.buyProxy, 'menu_buy_proxy')
        ],
        [
            Markup.button.callback(t.myProxies, 'menu_proxies'),
            Markup.button.callback(t.addBalance, 'menu_add_balance')
        ],
        [
            Markup.button.callback(t.couponMenu, 'menu_redeem_coupon'),
            Markup.button.callback(t.plans, 'menu_plans')
        ],
        [
            Markup.button.callback(t.webDev, 'menu_web_development'),
            Markup.button.callback(t.support, 'menu_support')
        ],
        [
            Markup.button.callback(t.changeLang, 'change_language')
        ]
    ]);

    if (ctx.callbackQuery) {
        return safeEditMessageText(ctx, welcomeMsg, keyboard);
    }
    return ctx.reply(welcomeMsg, keyboard);
};

bot.action('main_menu', (ctx) => sendMainMenu(ctx));

bot.action('menu_web_development', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const serviceDoc = await ServiceMessage.findOne({ serviceCode: 'web_dev' });

        let messageText = '';
        if (serviceDoc) {
            messageText = lang === 'ar' ? serviceDoc.messageAr : serviceDoc.messageEn;
        } else {
            messageText = lang === 'ar'
                ? '💻 **خدمات برمجة وتطوير المواقع**\n\nلطلب موقع إلكتروني أو نظام برمجي خاص، يرجى التواصل مع الدعم الفني مباشرة.'
                : '💻 **Web Development Services**\n\nTo request a custom website or software system, please contact our support team directly.';
        }

        const inlineKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]
        ]);

        await safeEditMessageText(ctx, messageText, { parse_mode: 'Markdown', ...inlineKeyboard });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action('menu_profile', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const isAdmin = ADMIN_TELEGRAM_ID && telegramId.toString() === ADMIN_TELEGRAM_ID.toString();
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        let message = '';

        if (isAdmin) {
            try {
                const apiRes = await api.get('/me');
                const apiData = apiRes.data.data;

                message = lang === 'ar' 
                    ? `👑 **لوحة تحكم المشرف:**\n\n- **الاسم:** ${apiData.name}\n- **رصيد الداتابيز:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **رصيد السيرفر API:** $${apiData.balance_usd}\n- **إجمالي البروكسيات النشطة:** ${apiData.active_proxies}\n- **بادئة مفتاح الـ API:** \`${apiData.api_key_prefix}\`\n- **Telegram ID:** \`${telegramId}\``
                    : `👑 **Admin Dashboard & Profile:**\n\n- **Name:** ${apiData.name}\n- **Database Balance:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **Server API Balance:** $${apiData.balance_usd}\n- **Active Proxies (Server Total):** ${apiData.active_proxies}\n- **API Key Prefix:** \`${apiData.api_key_prefix}\`\n- **Telegram ID:** \`${telegramId}\``;
            } catch (err) {
                message = lang === 'ar' 
                    ? `👑 **لوحة المشرف (وضع غير متصل):**\n\n- **اسم المستخدم:** \`${dbUser ? dbUser.username : 'Admin'}\`\n- **الرصيد:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **Telegram ID:** \`${telegramId}\``
                    : `👑 **Admin Dashboard (Offline Mode):**\n\n- **Username:** \`${dbUser ? dbUser.username : 'Admin'}\`\n- **Balance:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **Telegram ID:** \`${telegramId}\``;
            }
        } else {
            message = lang === 'ar'
                ? `👤 **الملف الشخصي ومعلومات الحساب:**\n\n- **اسم المستخدم:** \`${dbUser ? dbUser.username : 'N/A'}\`\n- **Telegram ID:** \`${telegramId}\`\n- **رصيدي:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **بروكسياتي النشطة:** ${dbUser && dbUser.proxies ? dbUser.proxies.length : 0}`
                : `👤 **My Profile & Account Info:**\n\n- **Username:** \`${dbUser ? dbUser.username : 'N/A'}\`\n- **Telegram ID:** \`${telegramId}\`\n- **My Balance:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **My Active Proxies:** ${dbUser && dbUser.proxies ? dbUser.proxies.length : 0}`;
        }

        const keyboardButtons = [
            [Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]
        ];

        if (isAdmin) {
            keyboardButtons.unshift([
                Markup.button.callback(lang === 'ar' ? '📜 سجل المعاملات' : '📜 View Ledger History', 'menu_ledger'),
                Markup.button.callback(lang === 'ar' ? '🎟️ إنشاء كوبونات' : '🎟️ Create Coupons', 'admin_start_coupons')
            ]);
        }

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboardButtons)
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error loading profile data', { show_alert: true }); } catch (e) {}
    }
});

bot.action('admin_start_coupons', async (ctx) => {
    const telegramId = ctx.from.id;
    if (!ADMIN_TELEGRAM_ID || telegramId.toString() !== ADMIN_TELEGRAM_ID.toString()) {
        return ctx.answerCbQuery('❌ Unauthorized!', { show_alert: true });
    }

    if (!ctx.session) ctx.session = {};
    ctx.session.step = 'admin_waiting_coupon_count';

    await safeEditMessageText(ctx, 
        '🎟️ **Coupon Creation Wizard**\n\nHow many coupons do you want to create?\n*(Send the number directly in the chat, e.g., `5`)*',
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'menu_profile')]]) }
    );
});

bot.action('menu_redeem_coupon', async (ctx) => {
    try {
        const dbUser = await User.findOne({ telegramId: ctx.from.id });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        if (!ctx.session) ctx.session = {};
        ctx.session.step = 'waiting_coupon_redeem';

        const msg = lang === 'ar'
            ? '🎁 **استرداد رمز الكوبون**\n\nالرجاء إرسال رمز الكوبون الخاص بك في رسالة نصية بالدردشة الآن:'
            : '🎁 **Redeem a Coupon Code**\n\nPlease send your coupon code as a text message in the chat now:';

        const inlineKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'ar' ? '❌ إلغاء' : '❌ Cancel', 'main_menu')]
        ]);

        await safeEditMessageText(ctx, msg, { parse_mode: 'Markdown', ...inlineKeyboard });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action('menu_ledger', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        if (!ADMIN_TELEGRAM_ID || telegramId.toString() !== ADMIN_TELEGRAM_ID.toString()) {
            return ctx.answerCbQuery('❌ Unauthorized!', { show_alert: true });
        }

        let items = [];
        try {
            const response = await api.get('/ledger');
            items = response.data?.data || response.data || [];
        } catch (apiErr) {}

        let message = '📜 **Latest Wallet Ledger (Last Transactions):**\n\n';
        if (!Array.isArray(items) || items.length === 0) {
            message += 'No transactions found or Ledger API unavailable.';
        } else {
            items.slice(0, 5).forEach((item, index) => {
                message += `${index + 1}. **${item.reason || 'N/A'}** (${item.direction || 'N/A'})\n  - Amount: $${item.amount_usd || item.amount || 0}\n  - Balance After: $${item.balance_after_usd || 0}\n  - Date: ${item.created_at || 'N/A'}\n\n`;
            });
        }

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Profile', 'menu_profile')]])
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error loading ledger', { show_alert: true }); } catch (e) {}
    }
});

bot.action('menu_plans', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const plans = await Plan.find({});
        let message = lang === 'ar' ? '💰 **خطط الأسعار المتاحة:**\n\n' : '💰 **Our Pricing Plans:**\n\n';

        if (plans.length === 0) {
            message += lang === 'ar' ? 'لا توجد خطط مضافة حالياً.' : 'No pricing plans available right now.';
        } else {
            plans.forEach(plan => {
                message += `📌 **${plan.title}**\n - ${lang === 'ar' ? 'المدة' : 'Duration'}: ${plan.durationHours} ${lang === 'ar' ? 'ساعة' : 'hours'}\n - ${lang === 'ar' ? 'السعر' : 'Price'}: **$${plan.myPriceUsd.toFixed(2)}**\n\n`;
            });
        }

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error loading plans', { show_alert: true }); } catch (e) {}
    }
});

bot.action('menu_support', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';
        const supports = await Support.find({});

        let message = lang === 'ar' ? '🛠️ **الدعم الفني:**\n\nلأي مساعدة تواصل معنا عبر القنوات التالية:\n\n' : '🛠️ **Customer Support:**\n\nIf you need any help, you can contact our team via the contacts below:\n\n';

        if (supports.length === 0) {
            message += lang === 'ar' ? '❌ لا توجد وسائل دعم متاحة حالياً.' : '❌ No support contacts available right now.';
        } else {
            supports.forEach((s, index) => {
                message += `🔹 **${s.title || 'Support ' + (index + 1)}:** ${s.supportContact}\n`;
            });
        }

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error loading support info', { show_alert: true }); } catch (e) {}
    }
});

bot.action('menu_add_balance', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';
        const methods = await PaymentMethod.find({});
        
        if (methods.length === 0) {
            return safeEditMessageText(ctx, 
                lang === 'ar' ? '❌ لا توجد طرق دفع متاحة حالياً.' : '❌ No payment methods available right now.',
                Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
            );
        }

        let message = lang === 'ar' ? '💳 **اختر طريقة الدفع المناسبة:**\nحدد كيف تريد شحن رصيدك:' : '💳 **Choose a Payment Method:**\nSelect how you want to add balance to your account:';
        
        const inlineButtons = [];
        methods.forEach(m => {
            inlineButtons.push([
                Markup.button.callback(`🌐 ${m.title}`, `pay_method_${m.code}`)
            ]);
        });
        
        inlineButtons.push([Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error loading payment methods', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^pay_method_(.+)$/, async (ctx) => {
    const methodCode = ctx.match[1];
    const telegramId = ctx.from.id;

    try {
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const method = await PaymentMethod.findOne({ code: methodCode });
        if (!method) return ctx.answerCbQuery('Payment method not found', { show_alert: true });

        if (!ctx.session) ctx.session = {};
        ctx.session.step = 'waiting_payment_receipt';
        ctx.session.selectedPaymentMethod = method.title;
        ctx.session.selectedPaymentMethodCode = method.code;

        const msg = lang === 'ar'
            ? `📌 **طريقة الدفع:** ${method.title}\n\n` +
              `🔹 **الحساب / المعرّف:** \`${method.recipientInfo}\`\n\n` +
              `📝 **التعليمات:**\n${method.instructions}\n\n` +
              `⚠️ **يرجى إرسال رقم المعاملة (Transaction ID) أو إيصال الدفع في الدردشة الآن:**`
            : `📌 **Payment Method:** ${method.title}\n\n` +
              `🔹 **Account / Number / ID:** \`${method.recipientInfo}\`\n\n` +
              `📝 **Instructions:**\n${method.instructions}\n\n` +
              `⚠️ **Please send your Transaction ID / Prepay ID / Receipt text in the chat now:**`;

        const inlineKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback(lang === 'ar' ? '❌ إلغاء' : '❌ Cancel', 'menu_add_balance')]
        ]);

        await safeEditMessageText(ctx, msg, { parse_mode: 'Markdown', ...inlineKeyboard });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^admin_start_approve_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    if (!ADMIN_TELEGRAM_ID || telegramId.toString() !== ADMIN_TELEGRAM_ID.toString()) {
        return ctx.answerCbQuery('❌ Unauthorized!', { show_alert: true });
    }

    const targetUserId = ctx.match[1];
    if (!ctx.session) ctx.session = {};
    ctx.session.step = 'admin_waiting_amount';
    ctx.session.targetUserIdForTopUp = targetUserId;

    await safeEditMessageText(ctx, 
        `✍️ **Enter the custom amount to add** for user ID (\`${targetUserId}\`):\nSend the number directly in chat (e.g., \`3.50\` or \`4.25\`).`,
        { parse_mode: 'Markdown' }
    );
});

bot.action(/^admin_reject_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    if (!ADMIN_TELEGRAM_ID || telegramId.toString() !== ADMIN_TELEGRAM_ID.toString()) {
        return ctx.answerCbQuery('❌ Unauthorized!', { show_alert: true });
    }

    const targetUserId = ctx.match[1];
    try {
        await safeEditMessageText(ctx, `❌ **Payment request for user (${targetUserId}) was rejected.**`);
        try {
            await bot.telegram.sendMessage(targetUserId, `❌ **Your payment request was rejected.** Please contact support if you think this is a mistake.`);
        } catch (e) {}
    } catch (error) {}
});

bot.action('menu_buy_proxy', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const response = await api.get('/servers');
        const servers = response.data.data.filter(s => s.has_capacity);

        if (servers.length === 0) {
            return safeEditMessageText(ctx, 
                lang === 'ar' ? '❌ لا توجد سيرفرات متاحة حالياً.' : '❌ No available servers currently.',
                Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]])
            );
        }

        const countries = [...new Set(servers.map(s => cleanServerText(s.country)))].filter(Boolean);
        let message = lang === 'ar' ? '🌍 **اختر الدولة المطلوبة للبروكسي:**' : '🌍 **Choose target country for the proxy:**';

        const inlineButtons = [];
        countries.forEach(country => {
            const flag = getCountryFlag(country);
            inlineButtons.push([
                Markup.button.callback(`${flag} ${country}`, `cnt_${country}`)
            ]);
        });

        inlineButtons.push([Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error fetching countries', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^cnt_(.+)$/, async (ctx) => {
    const selectedCountry = ctx.match[1];
    const telegramId = ctx.from.id;

    try {
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const response = await api.get('/servers');
        const servers = response.data.data.filter(s => s.has_capacity && cleanServerText(s.country).toLowerCase() === selectedCountry.toLowerCase());

        if (servers.length === 0) {
            return ctx.answerCbQuery(lang === 'ar' ? '❌ لا توجد سيرفرات في هذه الدولة.' : '❌ No servers in this country.', { show_alert: true });
        }

        const plans = await Plan.find({});
        if (plans.length === 0) {
            return ctx.answerCbQuery(lang === 'ar' ? '❌ لا توجد خطط أسعار متاحة.' : '❌ No pricing plans available.', { show_alert: true });
        }

        if (!ctx.session) ctx.session = {};
        ctx.session.selectedCountry = selectedCountry;

        const flag = getCountryFlag(selectedCountry);
        let message = lang === 'ar' ? `⏳ **اختر مدة البروكسي (${flag} ${selectedCountry}):**` : `⏳ **Select Proxy Duration for (${flag} ${selectedCountry}):**`;

        const inlineButtons = [];
        plans.forEach(plan => {
            inlineButtons.push([
                Markup.button.callback(
                    `🕒 ${plan.title} ($${plan.myPriceUsd.toFixed(2)})`,
                    `dur_${plan._id}`
                )
            ]);
        });

        inlineButtons.push([
            Markup.button.callback(lang === 'ar' ? '⬅️ رجوع للدول' : '⬅️ Back to Countries', 'menu_buy_proxy'),
            Markup.button.callback(lang === 'ar' ? '🏠 القائمة الرئيسية' : '🏠 Main Menu', 'main_menu')
        ]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^dur_([0-9a-fA-F]{24})$/, async (ctx) => {
    const planId = ctx.match[1];
    const selectedCountry = ctx.session?.selectedCountry;
    const telegramId = ctx.from.id;

    if (!selectedCountry) {
        return ctx.answerCbQuery('❌ Session expired, please start over.', { show_alert: true });
    }

    try {
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const response = await api.get('/servers');
        const servers = response.data.data.filter(s => s.has_capacity && cleanServerText(s.country).toLowerCase() === selectedCountry.toLowerCase());

        const plan = await Plan.findById(planId);
        if (!plan) return ctx.answerCbQuery('Plan not found', { show_alert: true });

        const flag = getCountryFlag(selectedCountry);
        let message = lang === 'ar' ? `🖥️ **اختر السيرفر في (${flag} ${selectedCountry}) لـ [${plan.title}]:**` : `🖥️ **Select Server in (${flag} ${selectedCountry}) for [${plan.title}]:**`;

        const inlineButtons = [];
        servers.forEach(srv => {
            const rawCity = srv.city || srv.label || selectedCountry;
            const cityName = cleanServerText(rawCity);
            const buttonText = `${flag} ${cityName} (30)`;
            
            inlineButtons.push([
                Markup.button.callback(
                    buttonText,
                    `srv_${srv.id}_${plan._id}`
                )
            ]);
        });

        inlineButtons.push([
            Markup.button.callback(lang === 'ar' ? '⬅️ رجوع للدول' : '⬅️ Back to Countries', 'menu_buy_proxy'),
            Markup.button.callback(lang === 'ar' ? '🏠 القائمة الرئيسية' : '🏠 Main Menu', 'main_menu')
        ]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^srv_(\d+)_([0-9a-fA-F]{24})$/, async (ctx) => {
    const serverId = ctx.match[1];
    const planId = ctx.match[2];
    const telegramId = ctx.from.id;

    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';

    let message = lang === 'ar' ? '🌐 **اختر بروتوكول الاتصال:**' : '🌐 **Select Connection Protocol:**';

    const inlineKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔒 SOCKS5', `proto_${serverId}_${planId}_socks5`),
            Markup.button.callback('⚡ HTTP', `proto_${serverId}_${planId}_http`)
        ],
        [
            Markup.button.callback(lang === 'ar' ? '⬅️ رجوع' : '⬅️ Back', 'menu_buy_proxy')
        ]
    ]);

    await safeEditMessageText(ctx, message, { parse_mode: 'Markdown', ...inlineKeyboard });
});

bot.action(/^proto_(\d+)_([0-9a-fA-F]{24})_(socks5|http)$/, async (ctx) => {
    const serverId = parseInt(ctx.match[1]);
    const planId = ctx.match[2];
    const protocol = ctx.match[3];
    const telegramId = ctx.from.id;

    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';

    if (!ctx.session) ctx.session = {};
    ctx.session.buyServerId = serverId;
    ctx.session.buyPlanId = planId;
    ctx.session.buyProtocol = protocol;
    ctx.session.step = 'waiting_proxy_username';

    const promptMsg = lang === 'ar'
        ? '✍️ **الرجاء إدخال اسم المستخدم المخصص الذي تريده للبروكسي (إنجليزي وأرقام فقط):**\n(أرسله مباشرة كرسالة نصية في الدردشة)'
        : '✍️ **Please enter the custom Username you want for your proxy (English only):**\n(Send it directly as a text message in the chat)';

    const inlineKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback(lang === 'ar' ? '❌ إلغاء' : '❌ Cancel', 'menu_buy_proxy')]
    ]);

    await safeEditMessageText(ctx, promptMsg, { parse_mode: 'Markdown', ...inlineKeyboard });
});

bot.action('menu_proxies', async (ctx) => {
    try {
        const telegramId = ctx.from.id;
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';
        const t = translations[lang] || translations['en'];

        if (!dbUser || !dbUser.proxies || dbUser.proxies.length === 0) {
            return safeEditMessageText(ctx, t.noProxies, 
                Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]]));
        }
        
        try { await ctx.deleteMessage(); } catch (e) {}

        const activeProxiesOnServer = [];

        for (const publicId of dbUser.proxies) {
            try {
                const res = await api.get(`/proxies/${publicId}`);
                const proxy = res.data.data;

                activeProxiesOnServer.push(publicId);

                const serverName = formatServerDisplay(proxy);

                const details = `🌐 **${t.proxyInfoTitle}**\n\n` +
                            `🖥️ **${t.server}:** \`${serverName}\`\n` +
                            `🔌 **${t.protocol}:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : 'N/A'}\`\n` +
                            `🌐 **${t.host}:** \`${proxy.host}\`\n` +
                            `🚪 **${t.port}:** \`${proxy.port}\`\n` +
                            `👤 **${t.username}:** \`${proxy.username}\`\n` +
                            `🔑 **${t.password}:** \`${proxy.password}\`\n` +
                            `📊 **${t.status}:** \`${proxy.status}\`\n` +
                            `⏳ **${t.expiresAt}:** \`${proxy.expires_at || 'N/A'}\`\n` +
                            `⏱️ **${t.remainingTime}:** \`${proxy.remaining_human || 'N/A'}\``;

                const inlineKeyboard = Markup.inlineKeyboard([
                    [
                        Markup.button.callback(t.btnExtend, `ext_${proxy.public_id}`),
                        Markup.button.callback(t.btnSwitchProto, `switchproto_${proxy.public_id}`)
                    ],
                    [
                        Markup.button.callback(t.btnSwitchSrv, `switchsrv_${proxy.public_id}`),
                        Markup.button.callback(t.btnUpdateAuth, `upauth_${proxy.public_id}`)
                    ],
                    [
                        Markup.button.callback(lang === 'ar' ? '🏠 القائمة الرئيسية' : '🏠 Main Menu', 'main_menu')
                    ]
                ]);

                await ctx.reply(details, { parse_mode: 'Markdown', ...inlineKeyboard });
            } catch (err) {}
        }

        await User.updateOne({ telegramId }, { proxies: activeProxiesOnServer });

        if (activeProxiesOnServer.length === 0) {
            await ctx.reply(t.noProxies, 
                Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]]));
        }

    } catch (error) {
        try { await ctx.answerCbQuery('Error loading proxies', { show_alert: true }); } catch (e) {}
    }
});

async function verifyProxyOwnership(telegramId, publicId) {
    const user = await User.findOne({ telegramId, proxies: publicId });
    return !!user;
}

async function refreshProxyMessage(ctx, publicId, lang) {
    try {
        const res = await api.get(`/proxies/${publicId}`);
        const proxy = res.data.data;
        const t = translations[lang] || translations['en'];

        const serverName = formatServerDisplay(proxy);

        const details = `🌐 **${t.proxyInfoTitle}**\n\n` +
                    `🖥️ **${t.server}:** \`${serverName}\`\n` +
                    `🔌 **${t.protocol}:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : 'N/A'}\`\n` +
                    `🌐 **${t.host}:** \`${proxy.host}\`\n` +
                    `🚪 **${t.port}:** \`${proxy.port}\`\n` +
                    `👤 **${t.username}:** \`${proxy.username}\`\n` +
                    `🔑 **${t.password}:** \`${proxy.password}\`\n` +
                    `📊 **${t.status}:** \`${proxy.status}\`\n` +
                    `⏳ **${t.expiresAt}:** \`${proxy.expires_at || 'N/A'}\`\n` +
                    `⏱️ **${t.remainingTime}:** \`${proxy.remaining_human || 'N/A'}\``;

        const inlineKeyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(t.btnExtend, `ext_${proxy.public_id}`),
                Markup.button.callback(t.btnSwitchProto, `switchproto_${proxy.public_id}`)
            ],
            [
                Markup.button.callback(t.btnSwitchSrv, `switchsrv_${proxy.public_id}`),
                Markup.button.callback(t.btnUpdateAuth, `upauth_${proxy.public_id}`)
            ],
            [
                Markup.button.callback(lang === 'ar' ? '🏠 القائمة الرئيسية' : '🏠 Main Menu', 'main_menu')
            ]
        ]);

        await safeEditMessageText(ctx, details, { parse_mode: 'Markdown', ...inlineKeyboard });
    } catch (e) {}
}

bot.action(/^ext_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;

    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }

    try {
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser && dbUser.language ? dbUser.language : 'en';

        const plan = await Plan.findOne({ durationHours: 24 }) || await Plan.findOne({});
        if (!plan) {
            return ctx.answerCbQuery(lang === 'ar' ? '❌ خطة التمديد غير متوفرة حالياً.' : '❌ Extension plan not found.', { show_alert: true });
        }

        const extensionCost = plan.myPriceUsd;

        const updatedUser = await User.findOneAndUpdate(
            { telegramId, balance: { $gte: extensionCost } },
            { $inc: { balance: -extensionCost } },
            { new: true }
        );

        if (!updatedUser) {
            const insufficientMsg = lang === 'ar'
                ? `❌ عذراً، رصيدك غير كافٍ لتمديد البروكسي!\nتكلفة التمديد: $${extensionCost.toFixed(2)}\nرصيدك الحالي: $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}`
                : `❌ Insufficient balance to extend proxy!\nExtension cost: $${extensionCost.toFixed(2)}\nCurrent balance: $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}`;
            
            return ctx.answerCbQuery(insufficientMsg, { show_alert: true });
        }

        try {
            await api.post(`/proxies/${publicId}/extend`, { duration_hours: 24 });
            
            await refreshProxyMessage(ctx, publicId, lang);

            const successMsg = lang === 'ar'
                ? `🎉 تم تمديد البروكسي بنجاح 24 ساعة!\nتم خصم: $${extensionCost.toFixed(2)}\nرصيدك المتبقي: $${updatedUser.balance.toFixed(2)}`
                : `🎉 Proxy extended by 24h!\nDeducted: $${extensionCost.toFixed(2)}\nNew Balance: $${updatedUser.balance.toFixed(2)}`;

            try { await ctx.answerCbQuery(successMsg, { show_alert: true }); } catch (e) {}

        } catch (apiError) {
            await User.updateOne({ telegramId }, { $inc: { balance: extensionCost } });
            
            const errMsg = apiError.response?.data?.message || 'Error extending proxy via API';
            try { await ctx.answerCbQuery(`❌ ${errMsg}`, { show_alert: true }); } catch (e) {}
        }

    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error processing proxy extension.', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^switchproto_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;
    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }
    try {
        const singleRes = await api.get(`/proxies/${publicId}`);
        const currentProto = singleRes.data.data.protocol;
        const newProto = currentProto === 'http' ? 'socks5' : 'http';

        await api.post(`/proxies/${publicId}/switch-protocol`, { protocol: newProto });
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser ? dbUser.language : 'en';
        
        await refreshProxyMessage(ctx, publicId, lang);
        try { await ctx.answerCbQuery(`✅ Protocol switched to ${newProto.toUpperCase()} successfully!`, { show_alert: true }); } catch (e) {}
    } catch (error) {
        const errMsg = error.response?.data?.message || 'Error switching protocol';
        try { await ctx.answerCbQuery(`❌ ${errMsg}`, { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^switchsrv_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;
    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';

    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }
    try {
        const serversRes = await api.get('/servers');
        const availableServers = serversRes.data.data.filter(s => s.has_capacity);

        if (availableServers.length === 0) {
            return ctx.answerCbQuery('❌ No available servers to switch.', { show_alert: true });
        }

        const inlineButtons = [];
        availableServers.forEach(s => {
            const cleanCountry = cleanServerText(s.country);
            const flag = getCountryFlag(cleanCountry);
            const cityName = cleanServerText(s.city || s.label || s.country);
            inlineButtons.push([
                Markup.button.callback(`${flag} ${cityName} (30)`, `exec_switch_${publicId}_${s.id}`)
            ]);
        });
        inlineButtons.push([Markup.button.callback(lang === 'ar' ? '⬅️ رجوع' : '⬅️ Back', 'menu_proxies')]);

        await safeEditMessageText(ctx, lang === 'ar' ? '🖥️ **اختر السيرفر المستهدف للتبديل إليه:**' : '🖥️ **Select target server to switch to:**', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        try { await ctx.answerCbQuery('❌ Error loading servers', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^exec_switch_(.+)_(\d+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const targetServerId = parseInt(ctx.match[2]);
    const telegramId = ctx.from.id;
    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }

    try {
        await api.post(`/proxies/${publicId}/switch-server`, { server_id: targetServerId });
        try { await ctx.answerCbQuery('✅ Proxy server switched successfully!', { show_alert: true }); } catch (e) {}
        
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser ? dbUser.language : 'en';
        await refreshProxyMessage(ctx, publicId, lang);
    } catch (error) {
        const errMsg = error.response?.data?.message || 'Error switching server';
        try { await ctx.answerCbQuery(`❌ ${errMsg}`, { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^upauth_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;
    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';

    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }

    if (!ctx.session) ctx.session = {};
    ctx.session.step = 'updating_proxy_username';
    ctx.session.updateTargetProxyId = publicId;

    try {
        const msg = lang === 'ar'
            ? '🔑 **تحديث بيانات اعتماد البروكسي**\n\nالرجاء إرسال **اسم المستخدم الجديد** الذي تريده (حروف وأرقام إنجليزية فقط):'
            : '🔑 **Update Proxy Authentication**\n\nPlease send the **new Username** you want (English characters and numbers only):';

        await ctx.reply(msg, { parse_mode: 'Markdown' });
        try { await ctx.answerCbQuery(); } catch (e) {}
    } catch (error) {
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.launch().then(() => {
    console.log('🤖 Telegram Bot is running successfully with all features and dynamic i18n!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));