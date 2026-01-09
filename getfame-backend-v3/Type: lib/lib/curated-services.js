const CURATED_SERVICES = {
    5951: { name: "Followers - Elite", platform: "instagram", type: "followers", description: "Premium USA followers" },
    6074: { name: "Followers - Premium", platform: "instagram", type: "followers", description: "USA/EU exclusive" },
    7446: { name: "Followers - Standard", platform: "instagram", type: "followers", description: "Fast delivery" },
    1761: { name: "Likes - Elite", platform: "instagram", type: "likes", description: "Top quality" },
    6073: { name: "Likes - Premium", platform: "instagram", type: "likes", description: "USA/EU exclusive" },
    7445: { name: "Likes - Standard", platform: "instagram", type: "likes", description: "Fast delivery" },
    7444: { name: "Views - Premium", platform: "instagram", type: "views", description: "Fast views" }
};

function isCurated(serviceId) {
    return CURATED_SERVICES.hasOwnProperty(serviceId);
}

function getCuratedInfo(serviceId) {
    return CURATED_SERVICES[serviceId] || null;
}

module.exports = { CURATED_SERVICES, isCurated, getCuratedInfo };
