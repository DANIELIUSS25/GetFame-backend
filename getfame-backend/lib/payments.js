/**
 * Stripe Payment Handler
 * Handles payment processing via Stripe
 */

const Stripe = require('stripe');
const ordersManager = require('./orders');
const servicesManager = require('./services');

let stripe = null;

// Initialize Stripe (called after env is loaded)
const initStripe = () => {
    if (!stripe && process.env.STRIPE_SECRET_KEY) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripe;
};

class PaymentHandler {
    /**
     * Create a Stripe Checkout Session
     */
    async createCheckoutSession(orderData) {
        initStripe();
        
        const { serviceId, link, quantity, email, successUrl, cancelUrl } = orderData;

        // Get service details
        const service = await servicesManager.getServiceById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        // Validate quantity
        if (quantity < service.min || quantity > service.max) {
            throw new Error(`Quantity must be between ${service.min} and ${service.max}`);
        }

        // Calculate total
        const total = servicesManager.calculateTotal(service.rate, quantity);
        const amountInCents = Math.round(total * 100);

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: service.name,
                        description: `${quantity.toLocaleString()} ${service.type} for ${service.platform}`,
                    },
                    unit_amount: amountInCents,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: successUrl || `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/order`,
            customer_email: email || undefined,
            metadata: {
                serviceId: serviceId.toString(),
                link,
                quantity: quantity.toString(),
                serviceName: service.name,
                platform: service.platform
            }
        });

        return {
            sessionId: session.id,
            url: session.url
        };
    }

    /**
     * Handle Stripe webhook events
     */
    async handleWebhook(payload, signature) {
        initStripe();
        
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                payload,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            throw new Error(`Webhook signature verification failed: ${err.message}`);
        }

        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await this.handleSuccessfulPayment(session);
                break;
            }
            
            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                console.log('Payment failed:', paymentIntent.id);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return { received: true };
    }

    /**
     * Process successful payment and create order
     */
    async handleSuccessfulPayment(session) {
        const { serviceId, link, quantity } = session.metadata;

        try {
            // Create the order with JAP
            const order = await ordersManager.createOrder({
                serviceId: parseInt(serviceId),
                link,
                quantity: parseInt(quantity),
                email: session.customer_email,
                paymentId: session.payment_intent
            });

            console.log('Order created after payment:', order);
            return order;
        } catch (error) {
            console.error('Failed to create order after payment:', error);
            // In production, you'd want to handle this more gracefully
            // Maybe queue it for retry or send an alert
            throw error;
        }
    }

    /**
     * Verify a payment session and get order details
     */
    async verifySession(sessionId) {
        initStripe();
        
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status !== 'paid') {
            throw new Error('Payment not completed');
        }

        return {
            paid: true,
            email: session.customer_email,
            amount: session.amount_total / 100,
            metadata: session.metadata
        };
    }

    /**
     * Create a simple payment intent (for custom checkout)
     */
    async createPaymentIntent(amount, metadata = {}) {
        initStripe();
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            metadata
        });

        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        };
    }
}

module.exports = new PaymentHandler();
