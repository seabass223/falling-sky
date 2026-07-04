# Falling Sky

**Falling Sky** is an interactive NASA meteorite landing atlas built for Summer Into AI Week 3: **Data.Punk**. It turns the NASA/Data.gov Meteorite Landings dataset into a punk-zine NASA terminal with a 3D globe, mass-scaled meteorite signals, state-derived archive panes, and a deliberately gritty data-collage interface.

Live site:

https://kylephoto.blob.core.windows.net/summer-into-ai/falling-sky/index.html

## What it shows

- **45,716** total NASA/Data.gov meteorite records processed.
- **32,187** geocoded meteorite records rendered on the globe.
- **1,107** witnessed falls.
- **288** heavy-object records in the Heavy Visitors view.
- U.S. state archive stats derived from latitude/longitude intersection with state boundaries.
- Clickable meteorite dossier fields:
  - name
  - fall status
  - meteorite class
  - recorded year
  - nametype
  - coordinates
  - recovered mass
  - derived U.S. state when applicable

## Design direction

The project uses a custom Data.Punk poster/zine visual system:

- supplied Summer Into AI Week 3 Data.Punk banner as the hero and OG image
- aged-paper background, black tape panels, halftone/grit texture, magenta/yellow accents
- compact “Archive Signal” metric strip
- dark earth globe with subtle land/continent linework
- mass-normalized glowing meteorite bars
- invisible raycast hit targets for click/tap interaction
- tabbed data panes for state archive, dataset fields, and heavy objects
- mobile-safe canvas containment so the WebGL viewport does not overflow while scrolling

## Important data note

The source dataset includes observed archival fields such as mass, fall/found status, class, year, and coordinates. It **does not** include impact speed, entry angle, crater size, or damage. The visualization keeps observed fields primary and does not invent per-record impact energy.

## Data sources

- Data.gov dataset page: https://catalog.data.gov/dataset/meteorite-landings
- NASA CSV source: https://data.nasa.gov/api/views/gh4g-9sfh/rows.csv?accessType=DOWNLOAD
- Geographic outline/state assets are derived from public boundary data and preprocessed into static assets.

## Project structure

```txt
index.html                 Static app shell
src/styles.css             Poster/HUD responsive styling
src/app.js                 Three.js globe, filters, tabs, interactions
src/data.js                Preprocessed meteorite dataset payload
src/us-states.json         U.S. state boundaries for derived state mode
assets/falling-sky-header.png
assets/data-punk-hero.png
assets/earth-dark.png
assets/world-land-outlines.json
```

## Run locally

No build step is required. Serve the folder with any static server:

```bash
python -m http.server 4180
```

Then open:

```txt
http://127.0.0.1:4180/index.html
```

## Deployment

The live Summer Into AI deployment is served from Azure Blob Storage under:

```txt
summer-into-ai/falling-sky/
```

During rapid iteration, files were uploaded with no-cache headers and cache-busted query strings for verification.

## Verification checklist

The deployed app was verified with browser/headless checks for:

- page load and WebGL initialization
- canvas present and contained on mobile
- no horizontal overflow at iPhone-sized viewport while scrolling
- dark earth texture active
- continent/coastline outlines loaded
- meteorite bar count equals geocoded record count
- invisible hit target count equals geocoded record count
- Heavy Visitors filter hides all non-heavy bars
- Canyon Diablo raycast/click target still works
