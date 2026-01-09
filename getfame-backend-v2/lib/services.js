/**
 * Services Manager
 * Fetches services from JAP, filters to curated list, and applies profit margin
 */

const japApi = require('./jap-api');
const { filterAndRenameServices, isServiceAllowed, CURATED_SERVICES } = require('./curated-services');

// Cache services for 5 minutes
let servicesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000;

class ServicesManager {
    constructor() {
        this.profitMargin = parseFloat(process.env.PROFIT_MARGIN) || 1.5;
    }

    /**
     * Get all curated services with markup applied
     */
    async getServices(forceRefresh = false) {
        // Check cache
        if (!forceRefresh && servicesCache && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
            return servicesCache;
        }

        try {
            // Fetch all services from JAP
            const japServices = await japApi.getServices();
            
            // Filter to only curated services and rename them
            const filtered = filterAndRenameServices(japServices);
            
            // Apply profit margin
            const services = filtered.map(service => ({
                ...service,
                rate: this.applyMarkup(service.rate)
            }));
            
            // Update cache
            servicesCache = services;
            cacheTimestamp = Date.now();
            
            console.log(`Loaded ${services.length} curated services`);
            return services;
        } catch (error) {
            if (servicesCache) {
                console.warn('Using stale cache due to API error');
                return servicesCache;
            }
            throw error;
        }
    }

    /**
     * Apply profit margin to JAP price
     */
    applyMarkup(japPrice) {
        const markedUpPrice = japPrice * this.profitMargin;
        return Math.round(markedUpPrice * 100) / 100;
    }

    /**
     * Get your cost for an order (for profit tracking)
     */
    getJapCost(rate, quantity) {
        const originalRate = rate / this.profitMargin;
        return (originalRate / 1000) * quantity;
    }

    /**
     * Get services filtered by platform
     */
    async getServicesByPlatform(platform) {
        const services = await this.getServices();
        return services.filter(s => s.platform === platform);
    }

    /**
     * Get a single service by ID
     */
    async getServiceById(serviceId) {
        // First check if it's in our curated list
        if (!isServiceAllowed(serviceId)) {
            return null;
        }
        
        const services = await this.getServices();
        return services.find(s => s.id === parseInt(serviceId));
    }

    /**
     * Get services grouped by platform
     */
    async getGroupedServices() {
        const services = await this.getServices();
        const grouped = {};

        for (const service of services) {
            if (!grouped[service.platform]) {
                grouped[service.platform] = {};
            }
            if (!grouped[service.platform][service.type]) {
                grouped[service.platform][service.type] = [];
            }
            grouped[service.platform][service.type].push(service);
        }

        return grouped;
    }

    /**
     * Calculate order total
     */
    calculateTotal(rate, quantity) {
        return Math.round(((rate / 1000) * quantity) * 100) / 100;
    }

    /**
     * Validate if a service can be ordered
     */
    async validateOrder(serviceId, quantity) {
        const service = await this.getServiceById(serviceId);
        
        if (!service) {
            return { valid: false, error: 'Service not available' };
        }
        
        if (quantity < service.min) {
            return { valid: false, error: `Minimum order is ${service.min}` };
        }
        
        if (quantity > service.max) {
            return { valid: false, error: `Maximum order is ${service.max}` };
        }
        
        return { valid: true, service };
    }
}

module.exports = new ServicesManager();
