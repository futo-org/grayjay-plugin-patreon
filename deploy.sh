#!/bin/sh
DOCUMENT_ROOT=/var/www/sources

# Take site offline
echo "Taking site offline..."
touch $DOCUMENT_ROOT/maintenance.file

# Swap over the content
echo "Deploying content..."
mkdir -p $DOCUMENT_ROOT/Patreon
cp patreon_logo.png $DOCUMENT_ROOT/Patreon
cp PatreonConfig.json $DOCUMENT_ROOT/Patreon
cp PatreonScript.js $DOCUMENT_ROOT/Patreon

# Notify Cloudflare to wipe the CDN cache
echo "Purging Cloudflare cache..."
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'

# Take site back online
echo "Bringing site back online..."
rm $DOCUMENT_ROOT/maintenance.file
