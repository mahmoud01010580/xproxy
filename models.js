const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, default: 'Client' },
    balance: { type: Number, default: 0.00 },
    proxies: { type: Array, default: [] },
    language: { type: String, default: 'en' }, // 'en' للإنجليزية أو 'ar' للعربية
    lastCouponUsedAt: { type: Date, default: null } // ⏱️ وقت آخر كوبون (Cooldown ساعة)
});

const planSchema = new mongoose.Schema({
    planCode: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    durationHours: { type: Number, required: true },
    myPriceUsd: { type: Number, required: true }
});

const paymentMethodSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    recipientInfo: { type: String, required: true },
    instructions: { type: String, required: true }
});

const supportSchema = new mongoose.Schema({
    supportContact: { type: String, required: true },
    title: { type: String, default: 'Support' }
});

// 💻 جدول رسالة برمجة المواقع (قابلة للتعديل من الداتابيز مباشرة)
const serviceMessageSchema = new mongoose.Schema({
    serviceCode: { type: String, required: true, unique: true, default: 'web_dev' },
    messageAr: { type: String, required: true },
    messageEn: { type: String, required: true }
});

// جدول سجل المعاملات لمنع تكرار الـ Prepay ID
const transactionSchema = new mongoose.Schema({
    prepayId: { type: String, required: true, unique: true },
    telegramId: { type: Number, required: true },
    amount: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// 🎟️ جدول الكوبونات
const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true },
    isUsed: { type: Boolean, default: false },
    usedBy: { type: String, default: null },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Plan = mongoose.model('Plan', planSchema);
const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);
const Support = mongoose.model('Support', supportSchema);
const ServiceMessage = mongoose.model('ServiceMessage', serviceMessageSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = { User, Plan, PaymentMethod, Support, ServiceMessage, Transaction, Coupon };