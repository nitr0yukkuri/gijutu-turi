# River material sources

These textures are bundled locally. The application makes no runtime requests
to Poly Haven. All originals are released under
[CC0](https://polyhaven.com/license).

| Local file | Original 1K JPEG | Asset and author |
| --- | --- | --- |
| `river-bed-color.webp` | `river_small_rocks_diff_1k.jpg` | [River Small Rocks](https://polyhaven.com/a/river_small_rocks), Rob Tuytel (photography and processing), Rico Cilliers (minor adjustment) |
| `mossy-rock-color.webp` | `mossy_rock_diff_1k.jpg` | [Mossy Rock](https://polyhaven.com/a/mossy_rock), Rob Tuytel |
| `mossy-rock-normal.webp` | `mossy_rock_nor_gl_1k.jpg` | Mossy Rock, Rob Tuytel |
| `mossy-rock-roughness.webp` | `mossy_rock_rough_1k.jpg` | Mossy Rock, Rob Tuytel |

Downloaded 2026-10-29 from the official `dl.polyhaven.org` asset host. Converted
to RGB WebP with Pillow at the original 1024 × 1024 resolution. Color textures
use sRGB; the OpenGL normal and roughness textures use linear data. Mossy Rock
is mapped at approximately 3 × 3 metres with world-space triplanar projection.

Original file MD5 checksums, checked against the Poly Haven asset API:

```text
723ee7172c9d0e98d286473ef443033c  river_small_rocks_diff_1k.jpg
a57fbbf55269eb64f8d40708fe3af26c  mossy_rock_diff_1k.jpg
59370f9b3d068271c2bccfb414dc325b  mossy_rock_nor_gl_1k.jpg
7eadb38815ad2569104d827ad8ac1572  mossy_rock_rough_1k.jpg
```
