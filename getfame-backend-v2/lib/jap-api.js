/**
 * JustAnotherPanel API Wrapper
 * Handles all communication with the JAP API
 */

const JAP_API_URL = process.env.JAP_API_URL;
const JAP_API_KEY = process.env.JAP_API_KEY;

class JAPApi {
    /**
     * Make a request to JAP API
     */
    async request(action, params = {}) {
        try {
            const response = await fetch(JAP_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    key: JAP_API_KEY,
                    action,
                    ...params
                })
            });

            const data = await response.json();
            
            // JAP returns { error: "message" } on errors
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error(`JAP API Error (${action}):`, error.message);
            throw error;
        }
    }

    /**
     * Get all available services from JAP
     */
    async getServices() {
        return await this.request('services');
    }

    /**
     * Get account balance
     */
    async getBalance() {
        return await this.request('balance');
    }

    /**
     * Place a new order
     * @param {number} service - Service ID from JAP
     * @param {string} link - Target URL (profile/post)
     * @param {number} quantity - Amount to order
     */
    async createOrder(service, link, quantity) {
        return await this.request('add', {
            service,
            link,
            quantity
        });
    }

    /**
     * Check order status
     * @param {number} orderId - Order ID from JAP
     */
    async getOrderStatus(orderId) {
        return await this.request('status', {
            order: orderId
        });
    }

    /**
     * Check multiple orders status
     * @param {number[]} orderIds - Array of order IDs
     */
    async getMultipleOrderStatus(orderIds) {
        return await this.request('status', {
            orders: orderIds.join(',')
        });
    }

    /**
     * Create a refill request for an order
     * @param {number} orderId - Order ID to refill
     */
    async createRefill(orderId) {
        return await this.request('refill', {
            order: orderId
        });
    }

    /**
     * Check refill status
     * @param {number} refillId - Refill ID
     */
    async getRefillStatus(refillId) {
        return await this.request('refill_status', {
            refill: refillId
        });
    }

    /**
     * Cancel an order (if supported and still pending)
     * @param {number[]} orderIds - Order IDs to cancel
     */
    async cancelOrders(orderIds) {
        return await this.request('cancel', {
            orders: orderIds.join(',')
        });
    }
}

module.exports = new JAPApi();
