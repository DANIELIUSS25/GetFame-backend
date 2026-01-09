const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

async function createCryptoPayment({ amount, orderId, email, description }) {
    if (!NOWPAYMENTS_API_KEY) throw new Error('NOWPayments not configured');
    
    const response = await fetch('https://api.nowpayments.io/v1/invoice', {
        method: 'POST',
        headers: { 'x-api-key': NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' },
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
        throw new Error(error.message || 'Crypto payment failed');
    }
    
    const data = await response.json();
    return { invoiceId: data.id, invoiceUrl: data.invoice_url, orderId };
}

function verifyIPNSignature(payload, signature) {
    const crypto = require('crypto');
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!secret) return true;
    const hmac = crypto.createHmac('sha512', secret);
    hmac.update(JSON.stringify(payload, Object.keys(payload).sort()));
    return hmac.digest('hex') === signature;
}

module.exports = { createCryptoPayment, verifyIPNSignature };
