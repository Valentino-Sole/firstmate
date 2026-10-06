#!/bin/sh
# Laedt die benoetigten MakeHuman-Grunddaten (Assets unter CC0 1.0, siehe LICENSE.ASSETS.md im Repository)
# in einen Zwischenordner. Danach: export MH_DATA=<ordner>/makehuman/data
# Aufruf: sh fetch_makehuman.sh <zielordner>
set -e
DEST=${1:-mh}
REV=a8bc2d54ff0ac92e78ff71431b1023eda42bf482
git clone --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman.git "$DEST"
git -C "$DEST" checkout -q "$REV"
git -C "$DEST" sparse-checkout set --no-cone 'makehuman/data/3dobjs/*' 'makehuman/data/rigs/*' 'makehuman/data/targets/**/*.target' 'makehuman/data/eyes/*' 'makehuman/data/modifiers/*' 'makehuman/data/uvs/*' LICENSE.md LICENSE.ASSETS.md
echo "export MH_DATA=$DEST/makehuman/data"
