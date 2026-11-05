require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { User, Plan, PaymentMethod, Support, Transaction } = require('./models');

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_BASE_URL = process.env.API_BASE_URL;
const API_KEY = process.env.API_KEY;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.toString() : '';

function cleanServerText(text) {
    if (!text) return '';
    return text.replace(/fearcode/gi, '').replace(/\s+/g, ' ').trim();
}

function isEnglishOnly(text) {
    return /^[A-Za-z0-9_@#$.!-]+$/.test(text);
}

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
        profileLedger: '👤 Profile & Ledger',
        changeLang: '🌐 Change Language',
        mainMenu: '🏠 Main Menu',
        back: '⬅️ Back',
        proxyInfoTitle: '🌐 Active Proxy Information',
        protocol: 'Protocol',
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
        noProxies: '📦 No active proxies found for your account.'
    },
    ar: {
        welcomeMain: 'أهلاً بك في لوحة تحكم البروكسيات 🚀',
        buyProxy: '🛒 شراء بروكسي',
        myProxies: '📦 بروكسياتي',
        addBalance: '💳 شحن الرصيد',
        plans: '💰 خطط الأسعار',
        support: '🛠️ الدعم الفني',
        profileLedger: '👤 الحساب والسجل',
        changeLang: '🌐 تغيير اللغة (Language)',
        mainMenu: '🏠 القائمة الرئيسية',
        back: '⬅️ رجوع',
        proxyInfoTitle: '🌐 معلومات البروكسي النشط',
        protocol: 'البروتوكول',
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
        noProxies: '📦 لا توجد بروكسيات نشطة مرتبطة بحسابك.'
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
            const foundTx = response.data.data.find(tx => 
                tx.transactionId === userTxId || tx.prepayId === userTxId || tx.orderId === userTxId
            );

            if (foundTx) {
                return {
                    success: true,
                    amount: parseFloat(foundTx.amount),
                    currency: foundTx.currency || 'USDT'
                };
            }
        }
        return { success: false, reason: 'transaction_not_found' };
    } catch (error) {
        console.error('❌ Binance API Error:', error.message);
        return { success: false, reason: 'api_error' };
    }
}

// دالة التحقق المحدثة للتعامل مع الـ Order ID بشكل شامل
async function verifyCCPaymentTransaction(userOrderId) {
    if (!process.env.CCPAYMENT_APP_ID || !process.env.CCPAYMENT_APP_SECRET) {
        console.log('⚠️ CCPayment API keys are not configured in .env');
        return { success: false, reason: 'api_not_configured' };
    }

    const appId = process.env.CCPAYMENT_APP_ID;
    const appSecret = process.env.CCPAYMENT_APP_SECRET;
    
    // المحاولة الأولى: الاستعلام المباشر باستخدام order_id
    let payload = { order_id: userOrderId };
    let timestamp = Math.floor(Date.now() / 1000).toString();
    let signText = appId + timestamp + JSON.stringify(payload);
    let sign = crypto.createHmac('sha256', appSecret).update(signText).digest('hex');

    try {
        let response = await axios.post('https://ccpayment.com/api/v1/bill/deposit/info', payload, {
            headers: {
                'Appid': appId,
                'Timestamp': timestamp,
                'Sign': sign,
                'User-Agent': 'CCPayment-Client/1.0',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.data && response.data.code === 200 && response.data.data) {
            const data = response.data.data;
            if (data.status === 'success' || data.status === 'completed') {
                return {
                    success: true,
                    amount: parseFloat(data.amount),
                    currency: data.coin_symbol || 'USDT',
                    orderId: data.order_id || userOrderId
                };
            }
        }
    } catch (e) {
        console.log('⚠️ First CCPayment attempt failed, trying alternative method...');
    }

    // المحاولة الثانية: الاستعلام باستخدام record_id احتياطياً لو الـ API يطلبها
    try {
        payload = { record_id: userOrderId };
        timestamp = Math.floor(Date.now() / 1000).toString();
        signText = appId + timestamp + JSON.stringify(payload);
        sign = crypto.createHmac('sha256', appSecret).update(signText).digest('hex');

        const response2 = await axios.post('https://ccpayment.com/api/v1/bill/deposit/info', payload, {
            headers: {
                'Appid': appId,
                'Timestamp': timestamp,
                'Sign': sign,
                'User-Agent': 'CCPayment-Client/1.0',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response2.data && response2.data.code === 200 && response2.data.data) {
            const data = response2.data.data;
            if (data.status === 'success' || data.status === 'completed') {
                return {
                    success: true,
                    amount: parseFloat(data.amount),
                    currency: data.coin_symbol || 'USDT',
                    orderId: userOrderId
                };
            }
        }
    } catch (e) {
        console.error('❌ CCPayment Verification Error:', e.response?.data || e.message);
    }

    return { success: false, reason: 'transaction_not_found' };
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

bot.start(async (ctx) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.step = null;
    
    const telegramId = ctx.from.id;
    const existingUser = await User.findOne({ telegramId });

    if (existingUser) {
        return sendMainMenu(ctx);
    } else {
        ctx.session.step = 'waiting_username';
        return ctx.reply(
            '👋 Welcome! No account is linked to your Telegram.\n\n' +
            'Please enter the new **Username** you want (English only):',
            { parse_mode: 'Markdown' }
        );
    }
});

bot.on('text', async (ctx, next) => {
    if (!ctx.session) ctx.session = {};
    const text = ctx.message.text.trim();
    const session = ctx.session;
    const telegramId = ctx.from.id;

    if (session.step === 'waiting_username') {
        const usernameTrimmed = text.toLowerCase();
        if (!isEnglishOnly(usernameTrimmed)) {
            return ctx.reply('❌ Username must contain English letters and numbers only. Try again:');
        }
        if (usernameTrimmed.length < 3) {
            return ctx.reply('❌ Username must be at least 3 characters long. Try again:');
        }

        const checkUser = await User.findOne({ username: usernameTrimmed });
        if (checkUser) {
            return ctx.reply('❌ This username is already taken. Choose another one:');
        }

        session.tempUsername = usernameTrimmed;
        session.step = 'waiting_password';
        return ctx.reply('🔒 Great! Now send the **Password** for your account (English only):', { parse_mode: 'Markdown' });
    }

    if (session.step === 'waiting_password') {
        const passwordTrimmed = text;
        if (!isEnglishOnly(passwordTrimmed)) {
            return ctx.reply('❌ Password must contain English characters and numbers only. Try again:');
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
            console.error('❌ Registration Error:', err);
            session.step = null;
            return ctx.reply('❌ An error occurred during registration. Try sending /start again.');
        }
    }

    if (session.step === 'waiting_proxy_username') {
        if (!isEnglishOnly(text)) {
            return ctx.reply('❌ Proxy username must be in English letters and numbers only. Try again:');
        }
        if (text.length < 3) {
            return ctx.reply('❌ Proxy username must be at least 3 characters long. Try again:');
        }

        try {
            const checkRes = await api.post('/proxies/check-username', {
                username: text,
                server_id: session.buyServerId
            });

            if (checkRes.data && checkRes.data.data && checkRes.data.data.available === false) {
                return ctx.reply('❌ This username is already in use on this server. Please choose another username:');
            }
        } catch (e) {
            console.error('❌ Check Username API Error:', e.response?.data || e.message);
        }

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
            return ctx.reply('❌ Proxy password must be in English characters and numbers only. Try again:');
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
            if (!plan) return ctx.reply('❌ Plan not found. Please start over.');

            const dbUser = await User.findOneAndUpdate(
                { telegramId, balance: { $gte: plan.myPriceUsd } },
                { $inc: { balance: -plan.myPriceUsd } },
                { new: true }
            );

            if (!dbUser) {
                return ctx.reply('❌ Insufficient balance. Please add funds to your account first.');
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

            const successMsg = `✅ **Proxy purchased successfully with your custom auth!**\n\n` +
                `- **Protocol:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : protocol.toUpperCase()}\`\n` +
                `- **Host:** \`${proxy.host}\`\n` +
                `- **Port:** \`${proxy.port}\`\n` +
                `- **Username:** \`${proxy.username}\`\n` +
                `- **Password:** \`${proxy.password}\`\n` +
                `- **Paid Amount:** $${plan.myPriceUsd.toFixed(2)}\n` +
                `- **New Balance:** $${dbUser.balance.toFixed(2)}`;

            return ctx.reply(successMsg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Main Menu', 'main_menu')]])
            });

        } catch (error) {
            console.error('❌ Proxy Purchase Error:', error.response?.data || error.message);
            try {
                const planToRefund = await Plan.findById(planId);
                if (planToRefund) {
                    await User.updateOne({ telegramId }, { $inc: { balance: planToRefund.myPriceUsd } });
                }
            } catch (rollbackErr) {
                console.error('❌ Rollback Error:', rollbackErr);
            }

            const errMessage = error.response?.data?.message || 'Error occurred during proxy creation';
            return ctx.reply(`❌ ${errMessage}`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Main Menu', 'main_menu')]]));
        }
    }

    if (session.step === 'updating_proxy_username') {
        if (!isEnglishOnly(text)) {
            return ctx.reply('❌ Username must be in English characters and numbers only. Try again:');
        }
        if (text.length < 3) {
            return ctx.reply('❌ Username must be at least 3 characters long. Try again:');
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
            return ctx.reply('❌ Password must be in English characters and numbers only. Try again:');
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

            await ctx.reply(`✅ **Proxy authentication updated successfully!**\n- **Username:** \`${newUsername}\`\n- **Password:** \`${newPassword}\``, { parse_mode: 'Markdown' });
            await refreshProxyMessage(ctx, publicId, lang);
        } catch (error) {
            console.error('❌ Update Auth Error:', error.response?.data || error.message);
            const errMsg = error.response?.data?.message || 'Error updating proxy authentication';
            return ctx.reply(`❌ ${errMsg}`);
        }

        return;
    }

    if (session.step === 'waiting_payment_receipt') {
        const receiptText = text.trim();
        const user = ctx.from;
        const selectedMethodCode = session.selectedPaymentMethodCode;
        const selectedMethodTitle = session.selectedPaymentMethod;

        session.step = null;
        session.selectedPaymentMethod = null;
        session.selectedPaymentMethodCode = null;

        try {
            const existingTx = await Transaction.findOne({ prepayId: receiptText });
            if (existingTx) {
                await ctx.reply('❌ **This Transaction ID / Order ID has already been used!**\nYou cannot reuse the same payment receipt twice.', { parse_mode: 'Markdown' });
                return sendMainMenu(ctx);
            }
        } catch (e) {}

        let verification = { success: false };
        let gatewayName = selectedMethodTitle || 'Payment Gateway';

        if (selectedMethodCode && (selectedMethodCode.toLowerCase().includes('binance') || selectedMethodCode.toLowerCase().includes('bpay'))) {
            gatewayName = 'Binance Pay';
            await ctx.reply('⏳ **Verifying transaction via Personal Binance Pay... Please wait.**', { parse_mode: 'Markdown' });
            verification = await verifyPersonalBinancePay(receiptText);
        } 
        else if (selectedMethodCode && (selectedMethodCode.toLowerCase().includes('ccpayment') || selectedMethodCode.toLowerCase().includes('cwallet'))) {
            gatewayName = 'CWallet (CCPayment)';
            await ctx.reply('⏳ **Verifying transaction via CWallet... Please wait.**', { parse_mode: 'Markdown' });
            verification = await verifyCCPaymentTransaction(receiptText);
        }

        if (verification.success) {
            try {
                await Transaction.create({
                    prepayId: receiptText,
                    telegramId: telegramId,
                    amount: verification.amount
                });
            } catch (dbErr) {
                console.error('❌ Duplicate Transaction Creation Error:', dbErr);
                await ctx.reply('❌ **Transaction already processed.** Duplicate payment rejected.', { parse_mode: 'Markdown' });
                return sendMainMenu(ctx);
            }

            const updatedUser = await User.findOneAndUpdate(
                { telegramId },
                { $inc: { balance: verification.amount } },
                { new: true }
            );

            if (updatedUser) {
                await ctx.reply(`🎉 **Payment Verified Automatically via ${gatewayName}!**\n\n- **Added Amount:** $${verification.amount.toFixed(2)} ${verification.currency}\n- **New Balance:** $${updatedUser.balance.toFixed(2)}`, { parse_mode: 'Markdown' });
                
                if (ADMIN_TELEGRAM_ID) {
                    try {
                        await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, `⚡ **AUTO PAY APPROVED (${gatewayName})**\n- User: ${user.first_name} (@${user.username || 'N/A'})\n- Amount: $${verification.amount.toFixed(2)}\n- Order ID: \`${receiptText}\``, { parse_mode: 'Markdown' });
                    } catch (e) {}
                }
                return sendMainMenu(ctx);
            }
        } else {
            try {
                await Transaction.create({
                    prepayId: receiptText,
                    telegramId: telegramId,
                    amount: 0
                });
            } catch (e) {}

            if (selectedMethodCode && (selectedMethodCode.toLowerCase().includes('binance') || selectedMethodCode.toLowerCase().includes('ccpayment') || selectedMethodCode.toLowerCase().includes('cwallet'))) {
                await ctx.reply(`❌ **Transaction ID / Order ID is incorrect or not found / not completed yet!**\nPlease check the ID and try again, or your request has been forwarded for manual review.`, { parse_mode: 'Markdown' });
            } else {
                await ctx.reply('✅ **Your payment request has been submitted successfully!**\nOur team will review your transaction and add the balance soon.', { parse_mode: 'Markdown' });
            }
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
                await bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, adminMsg, {
                    parse_mode: 'Markdown',
                    ...adminKeyboard
                });
            } catch (err) {
                console.error('❌ Failed to send message to admin:', err);
            }
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
            console.error('❌ Custom Admin Approve Error:', error);
            await ctx.reply('❌ Error processing custom approval.');
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

    await safeEditMessageText(ctx, '🌐 **Choose your language / اختر لغتك:**', {
        parse_mode: 'Markdown',
        ...langKeyboard
    });
});

const sendMainMenu = async (ctx) => {
    const telegramId = ctx.from.id;
    const dbUser = await User.findOne({ telegramId });
    const lang = dbUser && dbUser.language ? dbUser.language : 'en';
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
            Markup.button.callback(t.plans, 'menu_plans'),
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
                console.error('❌ Admin Profile API Error:', err.response?.data || err.message);
                message = `👑 **Admin Dashboard (Offline Mode):**\n\n- **Username:** \`${dbUser ? dbUser.username : 'Admin'}\`\n- **Balance:** $${dbUser ? dbUser.balance.toFixed(2) : '0.00'}\n- **Telegram ID:** \`${telegramId}\``;
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
            keyboardButtons.unshift([Markup.button.callback(lang === 'ar' ? '📜 سجل المعاملات' : '📜 View Ledger History', 'menu_ledger')]);
        }

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboardButtons)
        });
    } catch (error) {
        console.error('❌ Profile Error:', error);
        try { await ctx.answerCbQuery('❌ Error loading profile data', { show_alert: true }); } catch (e) {}
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
        } catch (apiErr) {
            console.error('❌ Ledger API Fetch Error:', apiErr.response?.data || apiErr.message);
        }

        let message = '📜 **Latest Wallet Ledger (Last Transactions):**\n\n';
        if (!Array.isArray(items) || items.length === 0) {
            message += 'No transactions found or Ledger API unavailable.';
        } else {
            items.slice(0, 5).forEach((item, index) => {
                message += `${index + 1}. **${item.reason || 'N/A'}** (${item.direction || 'N/A'})\n   - Amount: $${item.amount_usd || item.amount || 0}\n   - Balance After: $${item.balance_after_usd || 0}\n   - Date: ${item.created_at || 'N/A'}\n\n`;
            });
        }

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Profile', 'menu_profile')]])
        });
    } catch (error) {
        console.error('❌ Ledger Handler Error:', error);
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
        console.error('❌ Plans Error:', error);
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
        console.error('❌ Support Error:', error);
        try { await ctx.answerCbQuery('❌ Error loading support info', { show_alert: true }); } catch (e) {}
    }
});

bot.action('menu_add_balance', async (ctx) => {
    try {
        const methods = await PaymentMethod.find({});
        
        if (methods.length === 0) {
            return safeEditMessageText(ctx, 
                '❌ No payment methods available right now. Please contact support.',
                Markup.inlineKeyboard([[Markup.button.callback('⬅️ Main Menu', 'main_menu')]])
            );
        }

        let message = '💳 **Choose a Payment Method:**\nSelect how you want to add balance to your account:';
        
        const inlineButtons = [];
        methods.forEach(m => {
            inlineButtons.push([
                Markup.button.callback(`🌐 ${m.title}`, `pay_method_${m.code}`)
            ]);
        });
        
        inlineButtons.push([Markup.button.callback('⬅️ Main Menu', 'main_menu')]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        console.error('❌ Payment Methods Error:', error);
        try { await ctx.answerCbQuery('❌ Error loading payment methods', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^pay_method_(.+)$/, async (ctx) => {
    const methodCode = ctx.match[1];

    try {
        const method = await PaymentMethod.findOne({ code: methodCode });
        if (!method) return ctx.answerCbQuery('Payment method not found', { show_alert: true });

        if (!ctx.session) ctx.session = {};
        ctx.session.step = 'waiting_payment_receipt';
        ctx.session.selectedPaymentMethod = method.title;
        ctx.session.selectedPaymentMethodCode = method.code;

        const msg = `📌 **Payment Method:** ${method.title}\n\n` +
                    `🔹 **Account / Number / ID:** \`${method.recipientInfo}\`\n\n` +
                    `📝 **Instructions:**\n${method.instructions}\n\n` +
                    `⚠️ **Please send your Transaction ID / Order ID / Receipt text in the chat now:**`;

        const inlineKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'menu_add_balance')]
        ]);

        await safeEditMessageText(ctx, msg, {
            parse_mode: 'Markdown',
            ...inlineKeyboard
        });
    } catch (error) {
        console.error('❌ Method Select Error:', error);
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
        `✍️ **Enter the custom amount to add** for user ID (\`${targetUserId}\`):\n` +
        `Send the number directly in chat (e.g., \`3.50\` or \`4.25\`).`,
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
    } catch (error) {
        console.error('❌ Reject Error:', error);
    }
});

bot.action('menu_buy_proxy', async (ctx) => {
    try {
        const response = await api.get('/servers');
        const servers = response.data.data.filter(s => s.has_capacity);

        if (servers.length === 0) {
            return safeEditMessageText(ctx, 
                '❌ No available servers currently.',
                Markup.inlineKeyboard([[Markup.button.callback('⬅️ Main Menu', 'main_menu')]])
            );
        }

        const countries = [...new Set(servers.map(s => cleanServerText(s.country)))].filter(Boolean);

        let message = '🌍 **Choose target country for the proxy:**';

        const inlineButtons = [];
        countries.forEach(country => {
            const flag = getCountryFlag(country);
            inlineButtons.push([
                Markup.button.callback(`${flag} ${country}`, `cnt_${country}`)
            ]);
        });

        inlineButtons.push([Markup.button.callback('⬅️ Main Menu', 'main_menu')]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        console.error('❌ API Error (menu_buy_proxy):', error.response?.data || error.message);
        try { await ctx.answerCbQuery('❌ Error fetching countries', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^cnt_(.+)$/, async (ctx) => {
    const selectedCountry = ctx.match[1];

    try {
        const response = await api.get('/servers');
        const servers = response.data.data.filter(s => s.has_capacity && cleanServerText(s.country).toLowerCase() === selectedCountry.toLowerCase());

        if (servers.length === 0) {
            return ctx.answerCbQuery('❌ No servers in this country.', { show_alert: true });
        }

        const plans = await Plan.find({});
        if (plans.length === 0) {
            return ctx.answerCbQuery('❌ No pricing plans available.', { show_alert: true });
        }

        if (!ctx.session) ctx.session = {};
        ctx.session.selectedCountry = selectedCountry;

        const flag = getCountryFlag(selectedCountry);
        let message = `⏳ **Select Proxy Duration for (${flag} ${selectedCountry}):**`;

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
            Markup.button.callback('⬅️ Back to Countries', 'menu_buy_proxy'),
            Markup.button.callback('🏠 Main Menu', 'main_menu')
        ]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        console.error('❌ Country Selection Error:', error.response?.data || error.message);
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^dur_([0-9a-fA-F]{24})$/, async (ctx) => {
    const planId = ctx.match[1];
    const selectedCountry = ctx.session?.selectedCountry;

    if (!selectedCountry) {
        return ctx.answerCbQuery('❌ Session expired, please start over.', { show_alert: true });
    }

    try {
        const response = await api.get('/servers');
        const servers = response.data.data.filter(s => s.has_capacity && cleanServerText(s.country).toLowerCase() === selectedCountry.toLowerCase());

        const plan = await Plan.findById(planId);
        if (!plan) return ctx.answerCbQuery('Plan not found', { show_alert: true });

        const flag = getCountryFlag(selectedCountry);
        let message = `🖥️ **Select Server in (${flag} ${selectedCountry}) for [${plan.title}]:**`;

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
            Markup.button.callback('⬅️ Back to Countries', 'menu_buy_proxy'),
            Markup.button.callback('🏠 Main Menu', 'main_menu')
        ]);

        await safeEditMessageText(ctx, message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        console.error('❌ Server List Error:', error.response?.data || error.message);
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^srv_(\d+)_([0-9a-fA-F]{24})$/, async (ctx) => {
    const serverId = ctx.match[1];
    const planId = ctx.match[2];

    let message = '🌐 **Select Connection Protocol:**';

    const inlineKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('🔒 SOCKS5', `proto_${serverId}_${planId}_socks5`),
            Markup.button.callback('⚡ HTTP', `proto_${serverId}_${planId}_http`)
        ],
        [
            Markup.button.callback('⬅️ Back', 'menu_buy_proxy')
        ]
    ]);

    await safeEditMessageText(ctx, message, {
        parse_mode: 'Markdown',
        ...inlineKeyboard
    });
});

bot.action(/^proto_(\d+)_([0-9a-fA-F]{24})_(socks5|http)$/, async (ctx) => {
    const serverId = parseInt(ctx.match[1]);
    const planId = ctx.match[2];
    const protocol = ctx.match[3];

    if (!ctx.session) ctx.session = {};
    ctx.session.buyServerId = serverId;
    ctx.session.buyPlanId = planId;
    ctx.session.buyProtocol = protocol;
    ctx.session.step = 'waiting_proxy_username';

    const promptMsg = `✍️ **Please enter the custom Username you want for your proxy (English only):**\n` +
                      `(Send it directly as a text message in the chat)`;

    const inlineKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'menu_buy_proxy')]
    ]);

    await safeEditMessageText(ctx, promptMsg, {
        parse_mode: 'Markdown',
        ...inlineKeyboard
    });
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

                const details = `🌐 **${t.proxyInfoTitle}**\n\n` +
                            `🔌 **${t.protocol}:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : 'N/A'}\`\n` +
                            `🖥️ **${t.host}:** \`${proxy.host}\`\n` +
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
            } catch (err) {
                console.error(`❌ Error fetching proxy ${publicId}:`, err.response?.data || err.message);
            }
        }

        await User.updateOne({ telegramId }, { proxies: activeProxiesOnServer });

        if (activeProxiesOnServer.length === 0) {
            await ctx.reply(t.noProxies, 
                Markup.inlineKeyboard([[Markup.button.callback(lang === 'ar' ? '⬅️ القائمة الرئيسية' : '⬅️ Main Menu', 'main_menu')]]));
        }

    } catch (error) {
        console.error('❌ Proxies Menu Error:', error);
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

        const details = `🌐 **${t.proxyInfoTitle}**\n\n` +
                    `🔌 **${t.protocol}:** \`${proxy.protocol ? proxy.protocol.toUpperCase() : 'N/A'}\`\n` +
                    `🖥️ **${t.host}:** \`${proxy.host}\`\n` +
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
    } catch (e) {
        console.error('❌ Refresh Proxy Message Error:', e);
    }
}

bot.action(/^ext_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;
    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }
    try {
        await api.post(`/proxies/${publicId}/extend`, { duration_hours: 24 });
        const dbUser = await User.findOne({ telegramId });
        const lang = dbUser ? dbUser.language : 'en';
        
        await refreshProxyMessage(ctx, publicId, lang);
        try { await ctx.answerCbQuery('Proxy extended successfully 🚀', { show_alert: true }); } catch (e) {}
    } catch (error) {
        console.error('❌ Extend Proxy Error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.message || 'Error extending proxy';
        try { await ctx.answerCbQuery(`❌ ${errMsg}`, { show_alert: true }); } catch (e) {}
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
        console.error('❌ Switch Protocol Error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.message || 'Error switching protocol';
        try { await ctx.answerCbQuery(`❌ ${errMsg}`, { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^switchsrv_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;
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
        inlineButtons.push([Markup.button.callback('⬅️ Back', 'menu_proxies')]);

        await safeEditMessageText(ctx, '🖥️ **Select target server to switch to:**', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons)
        });
    } catch (error) {
        console.error('❌ Switch Server List Error:', error.response?.data || error.message);
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
        console.error('❌ Exec Switch Server Error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.message || 'Error switching server';
        try { await ctx.answerCbQuery(`❌ ${errMsg}`, { show_alert: true }); } catch (e) {}
    }
});

bot.action(/^upauth_(.+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const telegramId = ctx.from.id;
    if (!(await verifyProxyOwnership(telegramId, publicId))) {
        return ctx.answerCbQuery('❌ Unauthorized action!', { show_alert: true });
    }

    if (!ctx.session) ctx.session = {};
    ctx.session.step = 'updating_proxy_username';
    ctx.session.updateTargetProxyId = publicId;

    try {
        await ctx.reply(
            '🔑 **Update Proxy Authentication**\n\n' +
            'Please send the **new Username** you want (English characters and numbers only):',
            { parse_mode: 'Markdown' }
        );
        try { await ctx.answerCbQuery(); } catch (e) {}
    } catch (error) {
        console.error('❌ Upauth Prompt Error:', error);
        try { await ctx.answerCbQuery('❌ An error occurred', { show_alert: true }); } catch (e) {}
    }
});

bot.launch().then(() => {
    console.log('🤖 Telegram Bot is running successfully!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));