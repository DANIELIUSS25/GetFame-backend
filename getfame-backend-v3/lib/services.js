/**
 * Services Manager
 */

const { fetchJAPServices } = require('./jap-api');
const { CURATED_SERVICES, isCurated, getCuratedInfo } = require('./curated-services');

let servicesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000;
const PROFIT_MARGIN = 2.5;

async function getServices() {
    if (servicesCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        return servicesCache;
    }

    try {
        const japServices = await fetchJAPServices();

        if (!japServices || !Array.isArray(japServices)) {
            return getCuratedFallback();
        }

        const curatedServices = japServices
            .filter(service => isCurated(service.service))
            .map(service => {
                const info = getCuratedInfo(service.service);
                return {
                    id: service.service,
                    name: info.name,
                    platform: info.platform,
                    type: info.type,
                    description: info.description,
                    rate: (parseFloat(service.rate) * PROFIT_MARGIN).toFixed(2),
                    min: service.min,
                    max: service.max,
                    refill: service.refill || false
                };
            });

        servicesCache = curatedServices;
        cacheTimestamp = Date.now();
        return curatedServices;

    } catch (error) {
        console.error('Error fetching services:', error);
        return getCuratedFallback();
    }
}

function getCuratedFallback() {
    return Object.entries(CURATED_SERVICES).map(([id, info]) => ({
        id: parseInt(id),
        name: info.name,
        platform: info.platform,
        type: info.type,
        description: info.description,
        rate: '0.00',
        min: 100,
        max: 10000,
        refill: false
    }));
}

async function getServicesByPlatform(platform) {
    const services = await getServices();
    return services.filter(s => s.platform === platform.toLowerCase());
}

async function getServiceById(serviceId) {
    const services = await getServices();
    return services.find(s => s.id === parseInt(serviceId));
}

function clearCache() {
    servicesCache = null;
    cacheTimestamp = 0;
}

module.exports = {
    getServices,
    getServicesByPlatform,
    getServiceById,
    clearCache
};
