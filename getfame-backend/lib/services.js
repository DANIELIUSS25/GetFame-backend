/**
 * Services Manager
 * Fetches services from JAP and applies your profit margin
 */

const japApi = require('./jap-api');

// Cache services for 5 minutes to reduce API calls
let servicesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Service category mapping (customize based on your JAP services)
const PLATFORM_KEYWORDS = {
    instagram: ['instagram', 'ig ', 'insta'],
    tiktok: ['tiktok', 'tik tok', 'tt '],
    youtube: ['youtube', 'yt ', 'youtu'],
    twitter: ['twitter', 'tweet', 'x '],
    facebook: ['facebook', 'fb '],
    telegram: ['telegram', 'tg '],
    spotify: ['spotify'],
    twitch: ['twitch'],
    discord: ['discord'],
    linkedin: ['linkedin'],
    pinterest: ['pinterest'],
    snapchat: ['snapchat', 'snap']
};

const SERVICE_TYPE_KEYWORDS = {
    followers: ['follower', 'subscribers', 'subs'],
    likes: ['like', 'heart', 'love'],
    views: ['view', 'watch', 'impression'],
    comments: ['comment', 'reply'],
    shares: ['share', 'retweet', 'repost'],
    saves: ['save', 'bookmark'],
    story_views: ['story view', 'stories view'],
    live_views: ['live view', 'livestream', 'live stream'],
    plays: ['play', 'stream']
};

class ServicesManager {
    constructor() {
        this.profitMargin = parseFloat(process.env.PROFIT_MARGIN) || 1.5;
    }

    /**
     * Get all services with your markup applied
     */
    async getServices(forceRefresh = false) {
        // Check cache
        if (!forceRefresh && servicesCache && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
            return servicesCache;
        }

        try {
            const japServices = await japApi.getServices();
            
            // Transform and add markup
            const services = japServices.map(service => this.transformService(service));
            
            // Update cache
            servicesCache = services;
            cacheTimestamp = Date.now();
            
            return services;
        } catch (error) {
            // Return cached data if available, even if expired
            if (servicesCache) {
                console.warn('Using stale cache due to API error');
                return servicesCache;
            }
            throw error;
        }
    }

    /**
     * Transform JAP service to GetFame format with markup
     */
    transformService(japService) {
        const platform = this.detectPlatform(japService.name);
        const type = this.detectServiceType(japService.name);
        
        return {
            id: japService.service,
            name: japService.name,
            platform,
            type,
            category: japService.category,
            // Apply profit margin to rate
            rate: this.applyMarkup(parseFloat(japService.rate)),
            min: parseInt(japService.min),
            max: parseInt(japService.max),
            // Additional info if available
            description: japService.description || null,
            averageTime: japService.average_time || null,
            refill: japService.refill || false,
            cancel: japService.cancel || false,
        };
    }

    /**
     * Apply profit margin to JAP price
     * JAP prices are per 1000
     */
    applyMarkup(japPrice) {
        const markedUpPrice = japPrice * this.profitMargin;
        // Round to 2 decimal places
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
     * Detect platform from service name
     */
    detectPlatform(serviceName) {
        const lowerName = serviceName.toLowerCase();
        
        for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
            if (keywords.some(keyword => lowerName.includes(keyword))) {
                return platform;
            }
        }
        return 'other';
    }

    /**
     * Detect service type from name
     */
    detectServiceType(serviceName) {
        const lowerName = serviceName.toLowerCase();
        
        for (const [type, keywords] of Object.entries(SERVICE_TYPE_KEYWORDS)) {
            if (keywords.some(keyword => lowerName.includes(keyword))) {
                return type;
            }
        }
        return 'other';
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
        const services = await this.getServices();
        return services.find(s => s.id === parseInt(serviceId));
    }

    /**
     * Get services grouped by platform and type
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
}

module.exports = new ServicesManager();
