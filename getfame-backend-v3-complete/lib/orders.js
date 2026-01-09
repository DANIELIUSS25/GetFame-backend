const { v4: uuidv4 } = require('uuid');
const { createJAPOrder } = require('./jap-api');

const orders = new Map();

function createOrder({ serviceId, serviceName, link, quantity, email, pricePerK, paymentMethod }) {
    const orderId = uuidv4();
    const total = ((parseFloat(pricePerK) / 1000) * quantity).toFixed(2);
    const order = {
        id: orderId, serviceId, serviceName, link, quantity, email, pricePerK,
        total: parseFloat(total), paymentMethod, status: 'pending', japOrderId: null,
        createdAt: new Date().toISOString()
    };
    orders.set(orderId, order);
    return order;
}

function getOrder(orderId) { return orders.get(orderId); }

function updateOrderStatus(orderId, status, extra = {}) {
    const order = orders.get(orderId);
    if (order) {
        order.status = status;
        Object.assign(order, extra);
        orders.set(orderId, order);
    }
    return order;
}

async function processOrder(orderId) {
    const order = orders.get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'paid') throw new Error('Order not paid');
    const japResult = await createJAPOrder({ serviceId: order.serviceId, link: order.link, quantity: order.quantity });
    updateOrderStatus(orderId, 'processing', { japOrderId: japResult.japOrderId });
    return japResult;
}

module.exports = { createOrder, getOrder, updateOrderStatus, processOrder };
