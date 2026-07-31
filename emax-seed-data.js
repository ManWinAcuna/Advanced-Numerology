// Curated "Preload Top 50" starter lists for EMAX - a mix of all-time
// iconic and currently popular names per category, real entities only (no
// invented brands/titles). These are just NAMES; the actual founding/
// release/birth date for each one is looked up live from Wikidata when
// "Preload Top 50" runs (emax-category.js), same as a manual "Look up"
// click - nothing here is a pre-baked date. Keyed by category name, so this
// only offers the button on a category whose name matches exactly; a
// renamed or custom category simply won't show it.
//
// Each entry is either a plain display name (used as both the saved item
// name and the Wikidata search term), or [displayName, searchTerm] when the
// clean display name alone is too ambiguous to resolve reliably (e.g.
// "Puma" the brand vs. the animal) - the disambiguated search term is only
// used to FIND the right Wikidata item, never shown to you.

const EMAX_SEED_LISTS = {
  'Clothing Brands': [
    'Gucci', ['Levi\'s', 'Levi Strauss & Co.'], 'Zara', 'H&M', 'Uniqlo', ['Ralph Lauren', 'Ralph Lauren Corporation'],
    'Calvin Klein', 'Tommy Hilfiger', 'Louis Vuitton', 'Chanel', 'Versace', 'Prada', 'Balenciaga', 'Burberry',
    'Champion', 'Supreme', 'Off-White', 'The North Face', 'Patagonia', 'Carhartt', 'Lacoste', 'Diesel', 'Guess',
    'Armani', 'Dolce & Gabbana', 'Hugo Boss', 'Abercrombie & Fitch', 'American Eagle Outfitters', 'Forever 21',
    'Gap', 'Old Navy', 'Banana Republic', 'J.Crew', 'Brooks Brothers', 'Ted Baker', 'Superdry', 'Stone Island',
    'Moncler', 'Canada Goose', 'Columbia Sportswear', 'Under Armour', 'Wrangler', 'Dickies', 'Tommy Bahama',
    'Vineyard Vines', 'Shein', 'Fashion Nova', 'Fruit of the Loom', 'Hanes', 'Fendi',
  ],
  'Movies': [
    'The Godfather', 'The Shawshank Redemption', 'Pulp Fiction', 'The Dark Knight', 'Forrest Gump', 'Titanic',
    'Star Wars', 'The Matrix', 'Jurassic Park', 'Avatar', 'Avengers: Endgame', 'Inception', 'Interstellar',
    'The Lion King', 'Frozen', 'Spider-Man: No Way Home', 'Top Gun: Maverick', 'Barbie', 'Oppenheimer', 'Dune',
    'Dune: Part Two', 'Joker', 'Parasite', 'La La Land', 'Get Out', 'Black Panther', 'Fight Club', 'Goodfellas',
    'The Godfather Part II', "Schindler's List", 'Gladiator', 'Casablanca', 'Gone with the Wind',
    'The Wizard of Oz', 'E.T. the Extra-Terrestrial', 'Back to the Future', 'Jaws', 'Rocky',
    'The Silence of the Lambs', 'Saving Private Ryan', 'The Departed', 'No Country for Old Men',
    'There Will Be Blood', 'Whiplash', 'The Social Network', 'Django Unchained',
    'Once Upon a Time in Hollywood', 'Mad Max: Fury Road', 'Deadpool', 'Guardians of the Galaxy',
  ],
  'Artists': [
    'Michael Jackson', 'The Beatles', 'Elvis Presley', 'Madonna', 'Whitney Houston', 'Prince', 'Stevie Wonder',
    'Bob Dylan', 'Beyoncé', 'Jay-Z', 'Kanye West', 'Eminem', 'Rihanna', 'Drake', 'Taylor Swift', 'Ariana Grande',
    'Ed Sheeran', 'Adele', 'Bruno Mars', 'The Weeknd', 'Kendrick Lamar', 'Travis Scott', 'Post Malone',
    'Billie Eilish', 'Dua Lipa', 'Justin Bieber', 'Nicki Minaj', 'Cardi B', 'SZA', 'Doja Cat', 'Frank Ocean',
    'Tyler, the Creator', 'J. Cole', 'Lil Wayne', 'Snoop Dogg', 'Dr. Dre', 'Tupac Shakur', 'The Notorious B.I.G.',
    'Nas', '50 Cent', 'Usher', 'Chris Brown', 'Bad Bunny', 'Karol G', 'Shakira', 'Rosalía', 'BTS', 'Blackpink',
    'Coldplay', 'Bob Marley',
  ],
  'Shoe Brands': [
    ['Nike', 'Nike, Inc.'], 'Adidas', ['Puma', 'Puma (brand)'], 'Reebok', 'New Balance', 'Converse', 'Vans',
    'Timberland', 'Skechers', 'ASICS', ['UGG', 'UGG (brand)'], 'Dr. Martens', ['Clarks', 'Clarks (company)'],
    'Birkenstock', ['Salomon', 'Salomon Group'], 'Hoka', ['Brooks Running', 'Brooks Sports'], 'Saucony',
    ['Merrell', 'Merrell (company)'], 'Yeezy', 'Jordan Brand', 'Fila', 'K-Swiss', 'Keds', ['Toms', 'Toms Shoes'],
    'Allbirds', 'Vionic', 'ECCO', ['Aldo', 'Aldo Group'], 'Steve Madden', 'Cole Haan', 'Jimmy Choo',
    'Christian Louboutin', 'Manolo Blahnik', ['Bata', 'Bata Shoes'], 'Sperry Top-Sider',
    ['Chaco', 'Chaco (footwear)'], ['Teva', 'Teva (brand)'], 'Vibram', ['On Running', 'On (company)'],
    'Diadora', 'Le Coq Sportif', 'Onitsuka Tiger', 'Naturalizer', 'Rockport',
    ['Wolverine', 'Wolverine World Wide'], 'Red Wing Shoes', 'Dansko', 'Under Armour',
  ],
  'Technology Brands': [
    ['Apple', 'Apple Inc.'], 'Google', 'Microsoft', ['Amazon', 'Amazon (company)'], 'Samsung Electronics', 'Sony',
    'Meta Platforms', ['Tesla', 'Tesla, Inc.'], 'Intel', 'IBM', 'Dell', ['HP', 'HP Inc.'], 'Nvidia', 'AMD',
    'Qualcomm', 'Cisco', ['Oracle', 'Oracle Corporation'], ['Adobe', 'Adobe Inc.'], 'Netflix', 'Spotify', 'Uber',
    'Airbnb', 'PayPal', 'eBay', 'Twitter', 'TikTok', ['Snapchat', 'Snap Inc.'], 'LG Electronics', 'Panasonic',
    'Xiaomi', 'Huawei', 'Lenovo', 'Asus', ['Acer', 'Acer Inc.'], ['Canon', 'Canon Inc.'], 'Nikon', 'GoPro',
    ['Bose', 'Bose Corporation'], 'JBL', 'Beats Electronics', 'Logitech', ['Razer', 'Razer Inc.'],
    ['Corsair', 'Corsair Gaming'], 'Nintendo', 'Motorola', 'Nokia', 'OnePlus', 'SpaceX', 'Dropbox',
    ['Slack', 'Slack Technologies'],
  ],
  'Hygiene Brands': [
    ['Dove', 'Dove (toiletries)'], ['Colgate', 'Colgate (toothpaste)'], ['Crest', 'Crest (toothpaste)'], 'Gillette',
    'Old Spice', ['Axe', 'Axe (brand)'], 'Nivea', ['Dial', 'Dial (soap)'], 'Head & Shoulders', 'Pantene',
    'Herbal Essences', 'Neutrogena', 'Cetaphil', 'CeraVe', 'Vaseline', "Johnson's Baby", 'Listerine', 'Oral-B',
    'Sensodyne', 'Aveeno', "L'Oréal", 'Maybelline', 'Dior', ['Secret', 'Secret (deodorant)'],
    ['Degree', 'Degree (deodorant)'], 'Palmolive', ['Ivory', 'Ivory (soap)'], 'Softsoap', ['Suave', 'Suave (brand)'],
    'Tresemmé', 'Garnier', 'Olay', 'Clinique', ['Estée Lauder', 'Estée Lauder Companies'], 'MAC Cosmetics',
    'NYX Cosmetics', 'e.l.f. Cosmetics', "Burt's Bees", ['Method', 'Method Products'], ['Native', 'Native (brand)'],
    ['Schick', 'Schick (razor)'], 'Speed Stick', 'Right Guard', "Tom's of Maine", 'Arm & Hammer', 'Waterpik',
    'Chanel', 'Bath & Body Works', "Dr. Bronner's",
  ],
};
