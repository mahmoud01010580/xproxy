const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, default: 'Client' },
    balance: { type: Number, default: 0.00 },
    proxies: { type: Array, default: [] },
    language: { type: String, default: 'en' } // 'en' للإنجليزية كـ أساسي أو 'ar' للعربية
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

// جدول سجل المعاملات الناجحة لمنع تكرار الـ Prepay ID نهائياً
const transactionSchema = new mongoose.Schema({
    prepayId: { type: String, required: true, unique: true },
    telegramId: { type: Number, required: true },
    amount: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Plan = mongoose.model('Plan', planSchema);
const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);
const Support = mongoose.model('Support', supportSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = { User, Plan, PaymentMethod, Support, Transaction };