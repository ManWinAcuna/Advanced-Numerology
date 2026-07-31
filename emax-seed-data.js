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

// Which categories offer the year-precision "Preload by Year" control
// (emax-category.js) instead of just the plain all-time Top 50 button, and
// what "year" means for each - a real, single-fact Wikidata property, never
// a curated "top of year X" judgment call:
//   'founded' (brands, P571 inception) - 'born' (Artists, P569 birth date) -
//   'released' (Movies, P577 publication date).
// A group act (a band, not a solo artist) has no P569 birth date at all, so
// it simply never matches any year filter here - correct, not a bug, since
// a band doesn't have a birth year (it has a formation year, which is what
// P571/'founded' would mean instead - not offered for Artists since most
// entries in that list ARE solo people, where 'born' is the natural read).
const EMAX_YEAR_FILTER_KIND = {
  'Clothing Brands': 'founded',
  'Shoe Brands': 'founded',
  'Technology Brands': 'founded',
  'Hygiene Brands': 'founded',
  'Artists': 'born',
  'Movies': 'released',
};

const EMAX_SEED_LISTS = {
  'Clothing Brands': [
    'Gucci', ['Levi\'s', 'Levi Strauss & Co.'], 'Zara', 'H&M', 'Uniqlo', ['Ralph Lauren', 'Ralph Lauren Corporation'],
    'Calvin Klein', 'Tommy Hilfiger', 'Louis Vuitton', 'Chanel', 'Versace', 'Prada', 'Balenciaga', 'Burberry',
    'Champion', 'Supreme', 'Off-White', 'The North Face', 'Patagonia', 'Carhartt', 'Lacoste', 'Diesel', 'Guess',
    'Armani', 'Dolce & Gabbana', 'Hugo Boss', 'Abercrombie & Fitch', 'American Eagle Outfitters', 'Forever 21',
    'Gap', 'Old Navy', 'Banana Republic', 'J.Crew', 'Brooks Brothers', 'Ted Baker', 'Superdry', 'Stone Island',
    'Moncler', 'Canada Goose', 'Columbia Sportswear', 'Under Armour', 'Wrangler', 'Dickies', 'Tommy Bahama',
    'Vineyard Vines', 'Shein', 'Fashion Nova', 'Fruit of the Loom', 'Hanes', 'Fendi',
    // Preload by Year needs a much wider pool (only a fraction of any list
    // matches a given founding year) - expanded per the owner's request.
    'Yves Saint Laurent', 'Givenchy', 'Balmain', 'Valentino', ['Dior', 'Christian Dior'], 'Hermès',
    'Bottega Veneta', ['Celine', 'Celine (brand)'], 'Loewe', 'Marc Jacobs', 'Michael Kors', ['Coach', 'Coach (brand)'],
    'Kate Spade', 'Tory Burch', 'Vera Wang', 'Oscar de la Renta', 'Alexander McQueen', 'Stella McCartney',
    'Vivienne Westwood', 'Comme des Garçons', 'Issey Miyake', 'Yohji Yamamoto', ['Kenzo', 'Kenzo (brand)'], 'A.P.C.',
    'Acne Studios', ['COS', 'COS (clothing)'], 'Massimo Dutti', 'Bershka', 'Pull&Bear', 'Topshop', 'ASOS',
    'Boohoo.com', 'PrettyLittleThing', 'Urban Outfitters', 'Anthropologie', 'Free People', 'Express, Inc.',
    'Aéropostale', 'Hollister Co.', 'Hot Topic', 'Muji', "Lands' End", 'Eddie Bauer', 'L.L.Bean', 'Quiksilver',
    'Billabong', 'Rip Curl', 'Volcom', 'Hurley International', "O'Neill (company)", 'Speedo', 'Russell Athletic',
    'Umbro', ['Kappa', 'Kappa (company)'], 'Ellesse', 'Benetton Group', ['Replay', 'Replay (brand)'], 'G-Star RAW',
    'Pepe Jeans', 'True Religion', '7 For All Mankind', 'Lucky Brand', 'Torrid', 'Lane Bryant', 'Chico\'s FAS',
    'Talbots', 'Ann Taylor', 'Eileen Fisher', 'Everlane', 'Reformation', 'Madewell', 'Kith', ['Bape', 'A Bathing Ape'],
    'Palace Skateboards', 'Stüssy', 'Obey Clothing', 'Fear of God', 'Rick Owens', 'Thom Browne', 'Brunello Cucinelli',
    'Ermenegildo Zegna', 'Barbour', 'Belstaff', 'Filson', 'Woolrich', 'Pendleton Woolen Mills', 'Fjällräven',
    "Arc'teryx", 'Marmot (company)', 'Helly Hansen',
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
    // Preload by Year (release year, P577) needs a much wider pool - expanded
    // across many more decades so a specific year has real odds of a hit.
    'Citizen Kane', 'Singin\' in the Rain', 'Vertigo (film)', 'Psycho (1960 film)', 'Lawrence of Arabia (film)',
    'The Sound of Music (film)', 'Dr. Strangelove', '2001: A Space Odyssey (film)', 'The Graduate',
    'Bonnie and Clyde (film)', 'Butch Cassidy and the Sundance Kid', 'Easy Rider', 'The French Connection',
    'A Clockwork Orange (film)', 'Chinatown (1974 film)', 'One Flew Over the Cuckoo\'s Nest (film)',
    'Taxi Driver', 'Annie Hall', 'Apocalypse Now', 'Alien (film)', 'Raging Bull', 'The Empire Strikes Back',
    'Return of the Jedi', 'Indiana Jones and the Raiders of the Lost Ark',
    'Blade Runner', 'Ghostbusters (1984 film)', 'The Terminator', 'The Breakfast Club', 'Top Gun (1986 film)',
    'Aliens (film)', 'Die Hard', 'Beetlejuice', 'Batman (1989 film)', 'Dead Poets Society', 'Home Alone',
    'Terminator 2: Judgment Day', 'Unforgiven', 'The Fugitive (1993 film)', 'Speed (1994 film)',
    'Braveheart', 'Se7en', 'Independence Day (film)', 'Twister (1996 film)',
    'Men in Black (film)', 'Good Will Hunting', 'Armageddon (1998 film)', 'The Sixth Sense',
    'American Beauty (1999 film)', 'Gladiator (2000 film)', "Ocean's Eleven (2001 film)",
    'The Lord of the Rings: The Fellowship of the Ring', 'Spider-Man (2002 film)', 'Finding Nemo',
    'Pirates of the Caribbean: The Curse of the Black Pearl', 'Shrek 2', 'Batman Begins',
    'Pirates of the Caribbean: Dead Man\'s Chest', 'Casino Royale (2006 film)', 'Iron Man (2008 film)',
    'WALL-E', 'Slumdog Millionaire', 'Up (2009 film)', 'Toy Story 3', 'Inglourious Basterds', 'The Hangover',
    'Harry Potter and the Deathly Hallows – Part 2', 'The Avengers (2012 film)',
    'Gravity (2013 film)', '12 Years a Slave (film)', 'The Wolf of Wall Street (film)',
    'Guardians of the Galaxy (film)', 'The Revenant (2015 film)',
    'Zootopia', 'Moonlight (2016 film)', 'Wonder Woman (2017 film)', 'Coco (2017 film)', 'Black Panther (film)',
    'Avengers: Infinity War', 'Bohemian Rhapsody (film)', 'Spider-Man: Into the Spider-Verse', 'Joker (2019 film)',
    '1917 (2019 film)', 'Soul (2020 film)', 'Nomadland',
    'Encanto', 'Everything Everywhere All at Once',
  ],
  'Artists': [
    'Michael Jackson', 'The Beatles', 'Elvis Presley', 'Madonna', 'Whitney Houston', 'Prince', 'Stevie Wonder',
    'Bob Dylan', 'Beyoncé', 'Jay-Z', 'Kanye West', 'Eminem', 'Rihanna', 'Drake', 'Taylor Swift', 'Ariana Grande',
    'Ed Sheeran', 'Adele', 'Bruno Mars', 'The Weeknd', 'Kendrick Lamar', 'Travis Scott', 'Post Malone',
    'Billie Eilish', 'Dua Lipa', 'Justin Bieber', 'Nicki Minaj', 'Cardi B', 'SZA', 'Doja Cat', 'Frank Ocean',
    'Tyler, the Creator', 'J. Cole', 'Lil Wayne', 'Snoop Dogg', 'Dr. Dre', 'Tupac Shakur', 'The Notorious B.I.G.',
    'Nas', '50 Cent', 'Usher', 'Chris Brown', 'Bad Bunny', 'Karol G', 'Shakira', 'Rosalía', 'BTS', 'Blackpink',
    'Coldplay', 'Bob Marley',
    // Preload by Year (birth year, P569) needs a much wider pool of SOLO
    // artists - a group act has no birth date of its own (see the note on
    // EMAX_YEAR_FILTER_KIND above), so groups already on this list simply
    // never match a year filter, which is correct.
    'Stevie Nicks', 'Freddie Mercury', 'David Bowie', 'Elton John', 'Paul McCartney', 'John Lennon',
    'George Harrison', 'Ringo Starr', 'Mick Jagger', 'Keith Richards', 'Jimi Hendrix', 'Janis Joplin',
    'Jim Morrison', 'Aretha Franklin', 'Ray Charles', 'James Brown', 'Marvin Gaye', 'Diana Ross',
    'Smokey Robinson', 'Al Green', 'Otis Redding', 'Sam Cooke', 'Chuck Berry', 'Little Richard', 'Buddy Holly',
    'Johnny Cash', 'Dolly Parton', 'Willie Nelson', 'Kenny Rogers', 'Garth Brooks', 'Shania Twain',
    'Reba McEntire', 'Carrie Underwood', 'Miley Cyrus', 'Selena Gomez', 'Demi Lovato', 'Katy Perry', 'Lady Gaga',
    'Christina Aguilera', 'Britney Spears', 'Jennifer Lopez', 'Mariah Carey', 'Celine Dion', 'Alicia Keys',
    'John Legend', 'Sam Smith', 'Sia', 'Lorde', 'Halsey', 'Lana Del Rey', 'Camila Cabello', 'Gloria Estefan',
    'Enrique Iglesias', 'Ricky Martin', 'Luis Fonsi', 'Marc Anthony', 'Daddy Yankee', 'J Balvin', 'Maluma',
    'Nicky Jam', 'Romeo Santos', 'Celia Cruz', 'Vicente Fernández', 'Luis Miguel', 'Julio Iglesias',
    'Andrea Bocelli', 'Luciano Pavarotti', 'Michael Bublé', 'Frank Sinatra', 'Dean Martin', 'Nat King Cole',
    'Louis Armstrong', 'Ella Fitzgerald', 'Billie Holiday', 'Duke Ellington', 'Miles Davis', 'John Coltrane',
    'Charlie Parker', 'B.B. King', 'Muddy Waters', 'Etta James', 'Nina Simone', 'Curtis Mayfield', 'Isaac Hayes',
    'Barry White', 'Luther Vandross', 'Anita Baker', 'Toni Braxton', 'Ne-Yo', 'Trey Songz', 'Miguel (singer)',
    'Solange', 'Erykah Badu', 'Lauryn Hill', 'Missy Elliott', 'Queen Latifah', 'Ice Cube', 'Ice-T', 'LL Cool J',
    'RZA', 'Method Man', 'Busta Rhymes', 'DMX', 'Fat Joe', 'Nelly', 'Ludacris', 'T.I.', 'Rick Ross', 'Meek Mill',
    'Future (rapper)', 'Lil Baby', 'DaBaby', 'Quavo', '21 Savage', 'Lil Uzi Vert', 'Playboi Carti',
    'XXXTentacion', 'Juice Wrld', 'Mac Miller', 'Logic (rapper)', 'Chance the Rapper', 'Vince Staples',
    'ASAP Rocky', 'Pusha T', 'Big Sean', 'Lil Durk', 'Polo G', 'Roddy Ricch', 'Megan Thee Stallion', 'Latto',
    'Ice Spice', 'Saweetie',
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
    // Preload by Year needs a much wider pool - expanded per the owner's request.
    'Crocs', 'Havaianas', 'Hush Puppies', 'Geox', 'Superga', 'Keen Footwear', 'Danner', 'Georgia Boot', 'Ariat',
    'Justin Boots', ['Frye', 'Frye Company'], 'Sam Edelman', 'Vince Camuto', 'Kenneth Cole', 'Nine West',
    'Stuart Weitzman', 'Common Projects', 'Golden Goose', ['Veja', 'Veja (brand)'], 'Tretorn', 'PF Flyers',
    ['Bass', 'G.H. Bass & Co.'], 'Florsheim', 'Johnston & Murphy', 'Alden Shoe Company', ["Church's", "Church's (shoemaker)"],
    'Grenson', 'Loake', 'Crockett & Jones', 'Berluti', "Tod's", 'Salvatore Ferragamo', ['Bally', 'Bally (brand)'],
    'Aquazzura', 'Giuseppe Zanotti', 'Xero Shoes', 'Altra Running', 'Topo Athletic', 'Mizuno', 'Lotto (company)',
    'Joma', 'Reef (brand)', 'Rainbow Sandals', 'OluKai', 'Vasque', 'Lowa', 'Scarpa', 'La Sportiva',
    ['Five Ten', 'Five Ten Footwear'], 'Inov-8', 'Icebug', 'Cariuma', 'Koio', 'Axel Arigato', 'Filling Pieces',
    ['Karhu', 'Karhu (brand)'], 'Etonic', 'Pony (brand)', 'AND1', 'Li-Ning', 'Anta (company)', '361 Degrees',
    'Xtep',
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
    // Preload by Year needs a much wider pool - expanded per the owner's request.
    'Facebook', 'Instagram', 'WhatsApp', 'LinkedIn', 'Reddit', 'Pinterest', 'YouTube', ['Twitch', 'Twitch (service)'],
    'Discord (software)', 'Zoom Video Communications', 'Salesforce', 'SAP SE', 'VMware', 'Red Hat', 'Atlassian',
    'Shopify', ['Block, Inc.', 'Block, Inc. (company)'], 'Stripe (company)', 'Robinhood Markets', 'Coinbase',
    'Binance', 'Valve Corporation', 'Epic Games', 'Activision Blizzard', 'Electronic Arts', 'Ubisoft',
    'Rockstar Games', 'Take-Two Interactive', 'Riot Games', 'Blizzard Entertainment', 'Sega', 'Bandai Namco',
    'Square Enix', 'Capcom', 'Konami', 'HTC', 'ZTE', 'Oppo', 'Vivo (technology company)', 'Realme', 'Garmin',
    'Fitbit', 'DJI', 'Roku', 'Philips', 'Toshiba', 'Sharp Corporation', 'Hitachi', 'Sanyo', 'JVC',
    'Pioneer Corporation', 'Kenwood Corporation', 'Yamaha Corporation', 'Casio', 'Seiko', 'Texas Instruments',
    'Broadcom', 'Western Digital', 'Seagate Technology', 'SanDisk', 'Kingston Technology', 'Micron Technology',
    'ARM Holdings', 'MediaTek', 'Foxconn', 'TSMC', 'Xerox', 'BlackBerry Limited', 'Ericsson', 'Siemens', 'Bosch',
    'General Electric', 'Fujifilm', 'Kodak', 'Polaroid', 'Bang & Olufsen', 'Sonos', 'Harman Kardon', 'Sennheiser',
    'Audio-Technica', 'Skullcandy', 'Anker Innovations', 'Belkin', 'TP-Link', 'Netgear', 'D-Link', 'Linksys',
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
    // Preload by Year needs a much wider pool - expanded per the owner's request.
    'Aquafresh', ['Close-Up', 'Close-Up (toothpaste)'], ['Aim', 'Aim (toothpaste)'], 'Biotene', 'Corsodyl',
    'Parodontax', ['Scope', 'Scope (mouthwash)'], 'TheraBreath', 'Philips Sonicare', 'Braun (company)', 'Norelco',
    'Wilkinson Sword', 'BIC', "Harry's, Inc.", 'Dollar Shave Club', ['Venus', 'Venus (razor)'], 'Barbasol',
    'Nair (brand)', 'Veet', 'Irish Spring', ['Zest', 'Zest (soap)'], 'Lever 2000', ['Caress', 'Caress (brand)'],
    'Yardley London', 'Imperial Leather', 'Eucerin', 'Vanicream', 'La Roche-Posay', 'Bioderma', 'Avène',
    'Aquaphor', 'Curel', 'Jergens', 'Lubriderm', 'Gold Bond', "St. Ives (brand)", 'Simple Skincare',
    'Clean & Clear', 'Proactiv', 'Differin', 'PanOxyl', 'Noxzema', "Pond's", 'Vichy (brand)', 'Mennen',
    ['Brut', 'Brut (cologne)'], 'English Leather', 'Drakkar Noir', ['Stetson', 'Stetson (cologne)'], 'Pert Plus',
    'Selsun Blue', 'Nizoral', 'Rogaine', 'Just for Men', 'Clairol', 'Garnier Fructis', 'Schwarzkopf', 'Wella',
    'Redken', ['Matrix', 'Matrix (haircare)'], 'Paul Mitchell (company)', 'Aussie (brand)', 'John Frieda',
    'Batiste', 'Living Proof', 'Moroccanoil', 'Olaplex', 'Kérastase', 'CoverGirl', 'Revlon', 'Rimmel',
    'Wet n Wild', 'Milani Cosmetics', 'ColourPop', 'Fenty Beauty', 'Rare Beauty', 'Glossier', 'Charlotte Tilbury',
    'Urban Decay', 'Too Faced', 'Benefit Cosmetics', 'Bobbi Brown', 'Laura Mercier', 'NARS Cosmetics',
    'Tarte Cosmetics', 'IT Cosmetics', 'Anastasia Beverly Hills', 'Morphe',
  ],
};
