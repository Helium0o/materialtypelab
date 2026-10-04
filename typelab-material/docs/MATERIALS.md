# Material catalog

Generated from the code (`M.presets`, `M.list()`). Pictures: [materials-3d.jpg](materials-3d.jpg) (spheres), [materials-2d-lit.jpg](materials-2d-lit.jpg) (flat, lit).

## 90 starter materials

Each one opens as a normal, editable node graph (Library → Materials, or Ctrl+K "New material: …").

### Bricks & tiles (12)

| Material | What it is |
|---|---|
| Red bricks | Classic running-bond clay bricks with sandy mortar |
| Old weathered bricks | Chipped, uneven bricks with dirt in the joints |
| White painted bricks | Brick wall under a coat of chalky white paint, worn on the edges |
| Stone block wall | Large rough-cut stone blocks |
| Ceramic floor tiles | Glossy square tiles with grey grout |
| Subway tiles | White glossy metro tiles, offset rows, dark grout |
| Hexagon tiles | Matte hex floor tiles in two tones |
| Terracotta tiles | Handmade terracotta squares with colour variation |
| Cobblestone | Rounded cobbles in dark soil |
| Paving slabs | Big concrete slabs, slightly uneven |
| Mosaic tiles | Small glass mosaic in mixed blues |
| Roof shingles | Overlapping slate shingles |

### Stone & concrete (11)

| Material | What it is |
|---|---|
| Granite | Polished speckled granite |
| White marble | Carrara-like marble with soft grey veins |
| Black marble | Nero marquina: black with white veins |
| Slate | Layered dark slate with flaky ridges |
| Sandstone | Warm layered sandstone |
| Concrete | Smooth cast concrete with pores and stains |
| Asphalt | Road tarmac: dark binder, light grit |
| Gravel | Loose angular gravel |
| River pebbles | Smooth rounded pebbles |
| Rock cliff | Rough cracked rock face |
| Terrazzo | Cement with coloured stone chips |

### Wood (8)

| Material | What it is |
|---|---|
| Oak planks | Light oak floor boards |
| Herringbone parquet | Herringbone oak parquet |
| Dark walnut | Rich dark walnut, satin finish |
| Pine wood | Pale pine with strong rings and knots |
| Weathered painted wood | Blue painted boards, paint peeling to grey wood |
| Plywood | Birch plywood sheet |
| Tree bark | Deep furrowed bark |
| Bamboo | Bamboo stalks side by side |

### Metal (13)

| Material | What it is |
|---|---|
| Brushed steel | Satin brushed stainless steel |
| Polished chrome | Mirror chrome |
| Gold | Polished gold with faint smudges |
| Copper patina | Copper with green verdigris in the low areas |
| Rusty iron | Corroded iron plate, flaking rust |
| Corrugated metal | Galvanised corrugated sheet |
| Diamond tread plate | Aluminium checker plate |
| Perforated metal | Steel sheet with round holes |
| Hammered copper | Hand-hammered copper dimples |
| Scratched aluminium | Matte aluminium with scratches |
| Riveted steel panels | Painted steel panels with rivets |
| Galvanized steel | Spangled zinc coating |
| Carbon fibre | Woven carbon fibre under clear coat |

### Fabric & leather (10)

| Material | What it is |
|---|---|
| Denim | Indigo twill denim |
| Linen | Natural linen weave with slubs |
| Burlap | Coarse jute sacking |
| Canvas | Tight cotton canvas |
| Tartan wool | Wool plaid (uses the TypeLab tartan generator) |
| Leather | Brown pebbled leather |
| Black leather | Smooth black leather with creases |
| Velvet | Crushed velvet with soft sheen |
| Knit wool | Chunky stockinette knit (TypeLab knit generator) |
| Carpet | Dense loop-pile carpet |

### Ground & nature (9)

| Material | What it is |
|---|---|
| Dry cracked mud | Sun-baked mud plates |
| Sand dunes | Wind-rippled sand |
| Forest floor | Leaves, twigs and soil |
| Grass | Short grass blades seen from above |
| Moss | Soft clumpy moss |
| Snow | Fresh snow with sparkle |
| Ice | Cracked blue ice |
| Lava | Cooling lava crust with glowing cracks |
| Water ripples | Calm water surface |

### Organic (6)

| Material | What it is |
|---|---|
| Reptile scales | Green lizard scales |
| Fish scales | Overlapping silvery scales |
| Honeycomb | Wax honeycomb cells |
| Skin pores | Close-up skin with pores |
| Coral | Brain coral ridges |
| Leopard fur | Leopard print (TypeLab leopard generator) with fur fibres |

### Sci-fi & tech (6)

| Material | What it is |
|---|---|
| Sci-fi panels | Greebled hull panels with seams |
| Circuit board | Green PCB with copper traces |
| Neon grid | Glowing synthwave grid on black |
| Hex shield | Energy shield hexagons |
| Rubber tread | Anti-slip rubber mat |
| Foam | Acoustic foam / sponge |

### Plastic, paper & misc (7)

| Material | What it is |
|---|---|
| Glossy plastic | Red ABS plastic |
| Textured plastic | Grey leather-grain injection-moulded plastic |
| Paper | Cold-press watercolour paper |
| Cardboard | Corrugated cardboard |
| Chalkboard | Smudged slate chalkboard |
| Glitter | Sparkly glitter flakes |
| Camo fabric | Woodland camo print on canvas (TypeLab woodland generator) |

### Typography (8)

| Material | What it is |
|---|---|
| Embossed metal type | Your word raised out of brushed steel |
| Carved stone type | Letters chiselled into a stone slab |
| Gold leaf lettering | Gilded letters on dark wood |
| Neon sign type | Your word as a glowing neon tube on a brick wall |
| Monogram fabric | Repeating monogram woven into a jacquard |
| Type on concrete | Stencil-painted letters on concrete, worn |
| Letterpress | Type pressed deep into thick cotton paper |
| Layer as relief | Pick any layer of your document — it becomes a bevelled relief in metal |

## 54 nodes

### Generators

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Uniform gray | `uniform` | — | Out (gray) | One flat gray value |
| Uniform color | `color` | — | Out (color) | One flat colour |
| Gradient | `gradient` | — | Out (gray) | Linear, radial, angular or diamond ramp, repeated |
| Noise (FBM) | `noise` | — | Out (gray) | Fractal noise: value, Perlin or cellular; plain, ridged or billowy |
| Flow noise | `flow` | — | Out (gray) | Domain-warped noise: marble, smoke, liquid |
| Voronoi | `voronoi` | — | Cells (gray), Borders (gray), Distance (gray), Random (gray), Random color (color) | Cells: distance, borders, random value / colour per cell |
| Bricks | `bricks` | — | Bricks (gray), Random (gray), Mortar mask (gray), Brick UV (color) | Running / stack bond bricks with mortar, bevel and per-brick random |
| Hex tiles | `hextiles` | — | Tiles (gray), Random (gray) | Hexagonal tiles with grout, bevel and random per tile |
| Herringbone | `herringbone` | — | Planks (gray), Random (gray), Direction (gray), Plank UV (color) | Parquet planks laid in herringbone (plank length : width) |
| Weave | `weave` | — | Height (gray), Weft mask (gray), Thread mask (gray) | Plain weave: warp and weft threads going over and under |
| Stripes / waves | `stripes` | — | Out (gray) | Straight or wavy stripes (sine, triangle, square, saw), optional noise warp |
| Wood rings | `wood` | — | Wood (gray), Rings (gray), Grain (gray) | Growth rings + fine grain, along the vertical axis |
| Shape | `shape` | — | Out (gray), Distance (gray) | Circle, square, polygon, star or ring — repeated in a grid |
| Grid / checker | `grid` | — | Lines (gray), Checker (gray) | Grid lines and a checkerboard |
| Scratches | `scratches` | — | Out (gray) | Random straight scratches (metal, plastic, wood wear) |
| Scatter | `scatter` | Shape (gray) | Out (gray), Random (gray), Random color (color) | Scatters a shape (input, or a dot) with random place, size, turn and value — pebbles, rivets, leaves, flakes |
| Cracks | `cracks` | — | Cracks (gray), Plates (gray), Random (gray) | Branching cracks (dry mud, old paint, ice) |
| Fibers | `fibers` | — | Out (gray) | Long thin fibres / hair / brushed streaks along one axis |
| Spots / dots | `spots` | — | Out (gray) | Random soft spots of different sizes (rust spots, dirt, lichen) |

### Adjust

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Invert | `invert` | In (color) | Out (color) |  |
| Grayscale | `grayscale` | In (color) | Out (gray) | Colour → gray (luminance) |
| Levels | `levels` | In (color) | Out (color) | Input black/white point, gamma, output range |
| Tones step | `tonesstep` | In (gray) | Out (gray) | Pushes values to black / white around a threshold (soft threshold) |
| Curve | `curve` | In (gray) | Out (gray) | Remap gray values with a smooth 5-point curve (profile) |
| Posterize | `posterize` | In (color) | Out (color) |  |
| Hue / saturation / value | `hsv` | In (color) | Out (color) |  |
| Brightness / contrast | `contrast` | In (color) | Out (color) |  |
| Colorize (gradient map) | `colorize` | In (gray) | Out (color) | Gray → colours along a 2–5 stop gradient |
| Extract channel | `channel` | In (color) | Out (gray) |  |

### Combine

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Blend | `blend` | A (bottom) (color), B (top) (color), Mask (gray) | Out (color) | Layer B over A with a blend mode, opacity and an optional mask |
| Math | `math` | A (gray), B (gray) | Out (gray) | Gray maths: A op B (unconnected inputs use the A / B values) |
| Mix by mask | `mix` | A (color), B (color), Mask (gray) | Out (color) | A where the mask is black, B where it is white |
| Combine RGBA | `combine` | Red (gray), Green (gray), Blue (gray), Alpha (gray) | Out (color) | Four gray inputs → one colour (pack maps) |

### Filters

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Blur | `blur` | In (color) | Out (color) | Gaussian blur (seamless) |
| Directional blur | `dirblur` | In (color) | Out (color) | Motion / brushed blur along an angle |
| Slope blur | `slopeblur` | In (color), Slope (height) (gray) | Out (color) | Smears the input downhill along a height map (erosion, drips, melted edges) |
| Warp | `warp` | In (color), Warp map (gray) | Out (color) | Pushes the input along the slope (or by the value) of a second map |
| Edge detect | `edge` | In (gray) | Out (gray) |  |
| Grow / shrink | `dilate` | In (gray) | Out (gray) | Max (grow) or min (shrink) over a radius |

### Height & normal

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Bevel | `bevel` | Mask (gray) | Out (gray) | Turns a mask into a height map with sloped edges (distance to the edge) |
| Normal map | `normal` | Height (gray) | Out (color) | Height → normal map (OpenGL / DirectX green) |
| Emboss / light | `emboss` | Height (gray) | Out (gray) | Lights a height map from one side (gray shading) |
| Ambient occlusion | `occlusion` | Height (gray) | Out (gray) | Darkens creases and low areas of a height map |
| Curvature | `curvature` | Height (gray) | Out (gray) | Edges and ridges of a height map (bright = convex) — great for edge wear masks |

### Transform

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Make tileable | `makeTileable` | In (color) | Out (color) | Hides the seam of a non-seamless image by blending a shifted copy |
| Transform | `transform` | In (color) | Out (color) | Move, repeat (whole numbers stay seamless), turn (multiples of 90° stay seamless) |
| Mirror | `mirror` | In (color) | Out (color) |  |
| Kaleidoscope | `kaleido` | In (color) | Out (color) |  |

### Output

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Material | `material` | Albedo (color), Metallic (gray), Roughness (gray), Emission (color), Normal (color), Ambient occlusion (gray), Height (gray), Opacity (gray) | — | The final material. Unconnected channels use the values below; with no normal input the normal map is made from the height. |

### TypeLab

| Node | id | Inputs | Outputs | What it does |
|---|---|---|---|---|
| Text | `text` | — | Mask (gray), Colour (color) | Type a word in any TypeLab font — embossed letters, carved signs, monogram patterns |
| Layer | `layer` | — | Mask (gray), Colour (color) | Any layer of the document (text, shape, paint, image…) with its effects |
| Document | `document` | — | Colour (color), Gray (gray) | The whole finished document (all visible layers + whole-image effects) |
| Pattern | `pattern` | — | Colour (color), Gray (gray), Alpha (gray) | Any Pattern-workspace generator (camo, tartan, knit, damask…) — or a copy of a pattern layer |
| Image | `image` | — | Colour (color), Gray (gray), Alpha (gray) | An imported picture (photo, scan, logo). Add "Make tileable" after it if it is not seamless. |
