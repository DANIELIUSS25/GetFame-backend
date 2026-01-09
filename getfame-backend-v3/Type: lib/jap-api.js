/**
 * JustAnotherPanel API Integration
 */

const JAP_API_KEY = process.env.JAP_API_KEY;
const JAP_API_URL = process.env.JAP_API_URL || 'https://justanotherpanel.com/api/v2';

async function fetchJAPServices() {
    try {
        const response = await fetch(JAP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                key: JAP_API_KEY,
                action: 'services'
            })
        });
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('JAP API Error:', error);
        return [];
    }
}

async function createJAPOrder({ serviceId, link, quantity }) {
    try {
        const response = await fetch(JAP_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                key: JAP_API_KEY,
                action: 'add',
                service: serviceId,
                link: link,
                quantity: quantity
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return { japOrderId: data.order, success: true };
    } catch (error) {
        console.error('JAP Order Error:', error);
        throw error;
    }
}

module.exports = { fetchJAPServices, createJAPOrder };
