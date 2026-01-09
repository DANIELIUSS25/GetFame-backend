/**
 * Curated Services Configuration
 * Only shows selected high-quality services with clean premium names
 */

// Map of JAP service IDs to custom display names
const CURATED_SERVICES = {
    // ==================
    // INSTAGRAM
    // ==================
    
    // Followers
    5951: { name: "Followers - Elite", platform: "instagram", type: "followers", description: "Premium USA followers, non-drop guarantee" },
    6074: { name: "Followers - Premium", platform: "instagram", type: "followers", description: "USA/Europe exclusive, never drops" },
    9132: { name: "Followers - Pro", platform: "instagram", type: "followers", description: "Algorithm-safe, boosts reach" },
    7446: { name: "Followers - Standard", platform: "instagram", type: "followers", description: "USA/Europe, fast delivery" },
    
    // Likes
    1761: { name: "Likes - Elite", platform: "instagram", type: "likes", description: "Top quality, 30-day refill" },
    6073: { name: "Likes - Premium", platform: "instagram", type: "likes", description: "USA/Europe exclusive, never drops" },
    10066: { name: "Likes - Pro", platform: "instagram", type: "likes", description: "Real engagement, 1-year refill" },
    7445: { name: "Likes - Standard", platform: "instagram", type: "likes", description: "USA/Europe, fast delivery" },
    
    // Views
    7444: { name: "Story Views - Premium", platform: "instagram", type: "views", description: "USA/Europe viewers" },
    
    // Comments
    6075: { name: "Comments - Custom", platform: "instagram", type: "comments", description: "USA/Europe, your own text" },
    6384: { name: "Comments - Random", platform: "instagram", type: "comments", description: "USA/Europe, engaging comments" },
    
    // Packages
    5882: { name: "Growth Package - Pro", platform: "instagram", type: "package", description: "Followers + Likes + Comments bundle" },
    5883: { name: "Growth Package - Elite", platform: "instagram", type: "package", description: "Maximum engagement bundle" },
    8753: { name: "Monthly Growth - Premium", platform: "instagram", type: "package", description: "~5K followers/month, AI-powered" },

    // ==================
    // TIKTOK (add IDs when you share them)
    // ==================
    
    // ==================
    // YOUTUBE (add IDs when you share them)
    // ==================
    
    // ==================
    // TWITTER (add IDs when you share them)
    // ==================
};

// Get list of allowed service IDs
const ALLOWED_SERVICE_IDS = Object.keys(CURATED_SERVICES).map(id => parseInt(id));

/**
 * Filter and rename services from JAP
 * @param {Array} japServices - Raw services from JAP API
 * @returns {Array} - Filtered and renamed services
 */
function filterAndRenameServices(japServices) {
    return japServices
        .filter(service => ALLOWED_SERVICE_IDS.includes(service.service || service.id))
        .map(service => {
            const serviceId = service.service || service.id;
            const config = CURATED_SERVICES[serviceId];
            
            return {
                id: serviceId,
                name: config.name,
                platform: config.platform,
                type: config.type,
                description: config.description,
                rate: parseFloat(service.rate),
                min: parseInt(service.min),
                max: parseInt(service.max),
                refill: service.refill || false,
                cancel: service.cancel || false,
            };
        })
        .sort((a, b) => {
            // Sort by platform, then by type, then by name
            if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.name.localeCompare(b.name);
        });
}

/**
 * Check if a service ID is allowed
 */
function isServiceAllowed(serviceId) {
    return ALLOWED_SERVICE_IDS.includes(parseInt(serviceId));
}

/**
 * Get custom name for a service
 */
function getServiceName(serviceId) {
    const config = CURATED_SERVICES[serviceId];
    return config ? config.name : null;
}

module.exports = {
    CURATED_SERVICES,
    ALLOWED_SERVICE_IDS,
    filterAndRenameServices,
    isServiceAllowed,
    getServiceName
};
