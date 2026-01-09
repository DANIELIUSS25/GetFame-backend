/**
 * NOWPayments Integration
 * Handles cryptocurrency payments via NOWPayments API
 */

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

/**
 * Create a crypto payment invoice
 */
async function createCryptoPayment({ amount, orderId, email, description }) {
    if (!NOWPAYMENTS_API_KEY) {
        throw new Error('NOWPayments API key not configured');
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
        method: 'POST',
        headers: {
            'x-api-key': NOWPAYMENTS_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            price_amount: amount,
            price_currency: 'usd',
            order_id: orderId,
            order_description: description,
            ipn_callback_url: `${process.env.BACKEND_URL || 'https://getfame-backend.onrender.com'}/api/webhooks/nowpayments`,
            success_url: `${process.env.FRONTEND_URL || 'https://getfame.net'}/success/?order=${orderId}`,
            cancel_url: `${process.env.FRONTEND_URL || 'https://getfame.net'}/order/`
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create crypto payment');
    }

    const data = await response.json();
    return {
        invoiceId: data.id,
        invoiceUrl: data.invoice_url,
        orderId: orderId
    };
}

/**
 * Check payment status
 */
async function getPaymentStatus(paymentId) {
    if (!NOWPAYMENTS_API_KEY) {
        throw new Error('NOWPayments API key not configured');
    }

    const response = await fetch(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
        headers: {
            'x-api-key': NOWPAYMENTS_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error('Failed to get payment status');
    }

    return response.json();
}

/**
 * Verify IPN (webhook) signature
 */
function verifyIPNSignature(payload, signature) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET || '');
    hmac.update(JSON.stringify(payload, Object.keys(payload).sort()));
    const calculatedSignature = hmac.digest('hex');
    return calculatedSignature === signature;
}

module.exports = {
    createCryptoPayment,
    getPaymentStatus,
    verifyIPNSignature
};
