/**
 * Orders Manager
 * Handles order creation and tracking
 */

const japApi = require('./jap-api');
const servicesManager = require('./services');

// Simple in-memory store for order mapping
// In production, use a database (MongoDB, PostgreSQL, etc.)
const orders = new Map();

class OrdersManager {
    /**
     * Create a new order
     * @param {Object} orderData - Order details
     * @returns {Object} - Order confirmation
     */
    async createOrder(orderData) {
        const { serviceId, link, quantity, email, paymentId } = orderData;

        // Get service details
        const service = await servicesManager.getServiceById(serviceId);
        if (!service) {
            throw new Error('Service not found');
        }

        // Validate quantity
        if (quantity < service.min || quantity > service.max) {
            throw new Error(`Quantity must be between ${service.min} and ${service.max}`);
        }

        // Validate link
        if (!this.validateLink(link, service.platform)) {
            throw new Error('Invalid link format for this platform');
        }

        // Calculate totals
        const total = servicesManager.calculateTotal(service.rate, quantity);
        const cost = servicesManager.getJapCost(service.rate, quantity);
        const profit = Math.round((total - cost) * 100) / 100;

        // Place order with JAP
        const japResponse = await japApi.createOrder(serviceId, link, quantity);

        // Store order mapping
        const order = {
            id: japResponse.order,
            internalId: this.generateInternalId(),
            serviceId,
            serviceName: service.name,
            platform: service.platform,
            link,
            quantity,
            total,
            cost,
            profit,
            email: email || null,
            paymentId: paymentId || null,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        orders.set(order.id.toString(), order);
        orders.set(order.internalId, order);

        return {
            orderId: order.id,
            internalId: order.internalId,
            service: service.name,
            quantity,
            total,
            status: 'pending',
            message: 'Order placed successfully!'
        };
    }

    /**
     * Get order status
     * @param {string} orderId - JAP order ID or internal ID
     */
    async getOrderStatus(orderId) {
        // Check local store first
        let order = orders.get(orderId.toString());
        
        // If found by internal ID, get the JAP order ID
        const japOrderId = order ? order.id : orderId;

        // Get status from JAP
        const japStatus = await japApi.getOrderStatus(japOrderId);

        // Update local store if we have it
        if (order) {
            order.status = japStatus.status;
            order.startCount = japStatus.start_count;
            order.remains = japStatus.remains;
            orders.set(orderId.toString(), order);
        }

        return {
            orderId: japOrderId,
            internalId: order?.internalId || null,
            service: order?.serviceName || null,
            link: order?.link || null,
            quantity: order?.quantity || japStatus.quantity || null,
            status: japStatus.status,
            startCount: japStatus.start_count,
            remains: japStatus.remains,
            currency: japStatus.currency || 'USD'
        };
    }

    /**
     * Get multiple orders status
     */
    async getMultipleOrderStatus(orderIds) {
        const statuses = await japApi.getMultipleOrderStatus(orderIds);
        return statuses;
    }

    /**
     * Request a refill
     */
    async requestRefill(orderId) {
        const refill = await japApi.createRefill(orderId);
        return {
            refillId: refill.refill,
            message: 'Refill request submitted'
        };
    }

    /**
     * Check refill status
     */
    async checkRefillStatus(refillId) {
        return await japApi.getRefillStatus(refillId);
    }

    /**
     * Validate link format based on platform
     */
    validateLink(link, platform) {
        const patterns = {
            instagram: /^https?:\/\/(www\.)?instagram\.com\/.+/i,
            tiktok: /^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\/.+/i,
            youtube: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i,
            twitter: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+/i,
            facebook: /^https?:\/\/(www\.)?facebook\.com\/.+/i,
            telegram: /^https?:\/\/(www\.)?(t\.me|telegram\.me)\/.+/i,
            spotify: /^https?:\/\/(open\.)?spotify\.com\/.+/i,
            twitch: /^https?:\/\/(www\.)?twitch\.tv\/.+/i,
            other: /.+/ // Accept any URL for other platforms
        };

        const pattern = patterns[platform] || patterns.other;
        return pattern.test(link);
    }

    /**
     * Generate internal order ID (for customer-facing use)
     */
    generateInternalId() {
        return 'GF' + Date.now().toString(36).toUpperCase() + 
               Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    /**
     * Get all orders (for admin purposes)
     */
    getAllOrders() {
        return Array.from(orders.values())
            .filter(o => o.id) // Filter out duplicate internal ID entries
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Get orders by email
     */
    getOrdersByEmail(email) {
        return Array.from(orders.values())
            .filter(o => o.email === email && o.id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
}

module.exports = new OrdersManager();
