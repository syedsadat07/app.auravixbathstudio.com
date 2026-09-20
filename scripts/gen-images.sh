#!/bin/bash
cd /home/z/my-project
P="public/materials"
z-ai image -p "Minimalist premium logo mark for luxury bathroom brand AURAVIX, bold letter A formed by a water drop and bath silhouette, vibrant orange (#F2620F) on solid dark charcoal background (#26262B), flat vector style, clean, centered, no text" -o "public/brand/logo.png" -s 1024x1024
z-ai image -p "Product photography of glossy white ceramic wall tiles stacked, beveled edge square tiles, soft studio lighting, white background, catalog style, high quality" -o "$P/ceramic-tile.png" -s 1024x1024
z-ai image -p "Product photography of polished vitrified floor tiles, large format grey marble-look porcelain tiles stacked, studio lighting, white background, catalog style" -o "$P/vitrified-tile.png" -s 1024x1024
z-ai image -p "Product photography of a premium bathroom vanity unit, wooden cabinet with white counter basin and mirror, studio lighting, white background, catalog style" -o "$P/vanity.png" -s 1024x1024
z-ai image -p "Product photography of a round stainless steel rain shower head with ceiling arm, chrome finish, studio lighting, white background, catalog style" -o "$P/rain-shower.png" -s 1024x1024
z-ai image -p "Product photography of a wall hung toilet WC, white ceramic, rimless, modern design, studio lighting, white background, catalog style" -o "$P/wall-hung-wc.png" -s 1024x1024
z-ai image -p "Product photography of a round white ceramic counter top basin vessel sink on wooden counter, studio lighting, white background, catalog style" -o "$P/counter-basin.png" -s 1024x1024
z-ai image -p "Product photography of a rectangular LED backlit bathroom mirror with warm glow edge lighting, studio lighting, white background, catalog style" -o "$P/led-mirror.png" -s 1024x1024
z-ai image -p "Product photography of a glass shower enclosure cabin with chrome profile and black handle, modern bathroom, studio lighting, white background, catalog style" -o "$P/shower-enclosure.png" -s 1024x1024
z-ai image -p "Product photography of a white freestanding acrylic bath tub, elegant modern design, studio lighting, white background, catalog style" -o "$P/bath-tub.png" -s 1024x1024
z-ai image -p "Product photography of a single lever chrome basin faucet mixer tap, studio lighting, white background, catalog style" -o "$P/faucet.png" -s 1024x1024
echo "ALL_IMAGES_DONE"
