const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createStripeCheckout({ orderId, amount, serviceName, quantity, email, successUrl, cancelUrl }) {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: { name: `${quantity.toLocaleString()} ${serviceName}`, description: `Order #${orderId.slice(0, 8)}` },
                unit_amount: Math.round(amount * 100)
            },
            quantity: 1
        }],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: email,
        metadata: { orderId }
    });
    return { sessionId: session.id, url: session.url };
}

function verifyStripeWebhook(payload, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return JSON.parse(payload);
    return stripe.webhooks.constructEvent(payload, signature, secret);
}

module.exports = { createStripeCheckout, verifyStripeWebhook };
