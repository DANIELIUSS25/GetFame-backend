const { fetchJAPServices } = require('./jap-api');
const { CURATED_SERVICES, isCurated, getCuratedInfo } = require('./curated-services');

let servicesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000;
const PROFIT_MARGIN = parseFloat(process.env.PROFIT_MARGIN) || 2.5;

async function getServices() {
    if (servicesCache && Date.now() - cacheTimestamp < CACHE_DURATION) {
        return servicesCache;
    }
    try {
        const japServices = await fetchJAPServices();
        if (!japServices || japServices.length === 0) return getCuratedFallback();
        
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
                    max: service.max
                };
            });
        
        if (curatedServices.length === 0) return getCuratedFallback();
        servicesCache = curatedServices;
        cacheTimestamp = Date.now();
        return curatedServices;
    } catch (error) {
        return getCuratedFallback();
    }
}

function getCuratedFallback() {
    return Object.entries(CURATED_SERVICES).map(([id, info]) => ({
        id: parseInt(id), name: info.name, platform: info.platform, type: info.type,
        description: info.description, rate: '12.99', min: 100, max: 10000
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

module.exports = { getServices, getServicesByPlatform, getServiceById };
