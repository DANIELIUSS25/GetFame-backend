# GetFame Backend v2 - Curated Services

Your backend now only shows **curated premium services** with clean names.

## Current Services

### Instagram
| Display Name | Type | JAP ID |
|--------------|------|--------|
| Followers - Elite | followers | 5951 |
| Followers - Premium | followers | 6074 |
| Followers - Pro | followers | 9132 |
| Followers - Standard | followers | 7446 |
| Likes - Elite | likes | 1761 |
| Likes - Premium | likes | 6073 |
| Likes - Pro | likes | 10066 |
| Likes - Standard | likes | 7445 |
| Story Views - Premium | views | 7444 |
| Comments - Custom | comments | 6075 |
| Comments - Random | comments | 6384 |
| Growth Package - Pro | package | 5882 |
| Growth Package - Elite | package | 5883 |
| Monthly Growth - Premium | package | 8753 |

## How to Add/Remove Services

Edit `lib/curated-services.js`:

```javascript
const CURATED_SERVICES = {
    // Add new service:
    12345: { 
        name: "Followers - Ultra",        // Display name
        platform: "instagram",             // Platform
        type: "followers",                 // Type (followers/likes/views/comments/package)
        description: "Best quality ever"   // Short description
    },
    
    // Remove service: just delete its line
};
```

## How to Add TikTok/YouTube/Twitter

1. Find the JAP service IDs you want (from /api/services)
2. Add them to `lib/curated-services.js`:

```javascript
// TIKTOK
54321: { name: "Followers - Elite", platform: "tiktok", type: "followers", description: "..." },
54322: { name: "Views - Premium", platform: "tiktok", type: "views", description: "..." },

// YOUTUBE  
65432: { name: "Subscribers - Elite", platform: "youtube", type: "subscribers", description: "..." },
65433: { name: "Views - Premium", platform: "youtube", type: "views", description: "..." },

// TWITTER
76543: { name: "Followers - Elite", platform: "twitter", type: "followers", description: "..." },
```

## Deploying Updates

After editing `curated-services.js`:

1. Push to GitHub
2. Render will auto-deploy

Or manually:
```bash
git add .
git commit -m "Update services"
git push
```

## Files Changed from v1

- `lib/curated-services.js` - NEW: Service whitelist and names
- `lib/services.js` - Updated: Now filters to curated list only
